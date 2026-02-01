import { GoogleGenAI, Modality } from "@google/genai";
import { UserProfile, UserPreferences, ChatMessage, DailyChallenge, ExerciseItem, VoiceCallSummary, VoiceName } from "../types";
import { SYSTEM_PROMPT_TEMPLATE } from "../constants";
import { storageService } from "./storageService";

// Pool de modèles pour assurer la continuité du service
const MODEL_POOL = [
    'gemini-3-flash-preview',
    'gemini-flash-lite-latest',
    'gemini-1.5-flash'
];

const getApiKey = (): string => {
    // La clé API est récupérée exclusivement depuis process.env.API_KEY.
    // Note : Pour Vite, assurez-vous que votre variable est bien injectée dans process.env.API_KEY
    // @ts-ignore
    const envKey = (typeof process !== 'undefined' && process.env) ? process.env.API_KEY : undefined;
    const rawKeys: string = envKey || "";
    
    // Nettoyage et filtrage des clés (format : "KEY1,KEY2,KEY3")
    const keys = rawKeys.split(',')
        .map((k: string) => k.trim())
        .filter((k: string) => k.length > 5);
    
    if (keys.length === 0) {
        console.error("CRITICAL: API_KEY_MISSING. La variable process.env.API_KEY est vide.");
        throw new Error("API_KEY_MISSING: Aucune clé valide trouvée dans l'environnement.");
    }
    
    // Rotation aléatoire pour distribuer la charge
    return keys[Math.floor(Math.random() * keys.length)];
};

async function executeWithFallback<T>(operation: (ai: GoogleGenAI, modelName: string) => Promise<T>): Promise<T> {
    let lastError: any;
    
    for (const model of MODEL_POOL) {
        try {
            // On crée une nouvelle instance avec une clé aléatoire du pool à chaque essai
            const ai = new GoogleGenAI({ apiKey: getApiKey() });
            return await operation(ai, model);
        } catch (error: any) {
            lastError = error;
            const msg = error.message?.toLowerCase() || "";
            
            // Si quota dépassé ou erreur réseau, on passe au modèle/clé suivant
            if (msg.includes('429') || msg.includes('quota') || msg.includes('fetch') || msg.includes('network') || msg.includes('aborted')) {
                console.warn(`Tentative de repli (fallback) car le modèle ${model} a échoué.`);
                continue;
            }
            throw error;
        }
    }
    throw lastError || new Error("Service indisponible. Vérifiez votre connexion.");
}

export const sendMessageToGemini = async (message: string, userId: string, history: ChatMessage[]): Promise<string> => {
    const user = storageService.getUserById(userId);
    if (!user) throw new Error("USER_NOT_FOUND");
    
    return executeWithFallback(async (ai, model) => {
        const response = await ai.models.generateContent({
            model,
            contents: [
                ...history.slice(-8).map(m => ({ role: m.role, parts: [{ text: m.text }] })),
                { role: 'user', parts: [{ text: message }] }
            ],
            config: { 
                systemInstruction: SYSTEM_PROMPT_TEMPLATE(user, user.preferences!) + 
                "\n\n🚨 RÈGLE : Ne jamais envoyer de code informatique ou de blocs ```. Réponds uniquement en texte pédagogique.",
                temperature: 0.7 
            }
        });
        storageService.deductCreditOrUsage(userId);
        return response.text || "...";
    });
};

export const generateVoiceChatResponse = async (message: string, userId: string, history: ChatMessage[]): Promise<string> => {
    const user = storageService.getUserById(userId);
    if (!user) throw new Error("USER_NOT_FOUND");
    
    return executeWithFallback(async (ai, model) => {
        const response = await ai.models.generateContent({
            model: 'gemini-flash-lite-latest',
            contents: [
                ...history.slice(-4).map(m => ({ role: m.role, parts: [{ text: m.text }] })),
                { role: 'user', parts: [{ text: message }] }
            ],
            config: {
                systemInstruction: `Tu es TeacherMada en APPEL VOCAL. Réponds en 1 phrase courte. Pas de markdown. Langue: ${user.preferences?.targetLanguage}.`,
                maxOutputTokens: 100,
                temperature: 0.5
            }
        });
        return response.text || "D'accord.";
    });
};

export const generateSpeech = async (text: string, userId: string, voice?: VoiceName): Promise<Uint8Array | null> => {
    try {
        const ai = new GoogleGenAI({ apiKey: getApiKey() });
        const user = storageService.getUserById(userId);
        const voiceToUse = voice || user?.preferences?.voiceName || 'Kore';
        
        const cleanText = text.replace(/[*#_`~]/g, '').trim().substring(0, 800);
        if (!cleanText) return null;

        const response = await ai.models.generateContent({
            model: "gemini-2.5-flash-preview-tts",
            contents: [{ parts: [{ text: cleanText }] }],
            config: {
                responseModalities: [Modality.AUDIO],
                speechConfig: {
                    voiceConfig: { prebuiltVoiceConfig: { voiceName: voiceToUse } }
                }
            }
        });

        const base64Data = response.candidates?.[0]?.content?.parts?.find(p => p.inlineData)?.inlineData?.data;
        if (!base64Data) return null;

        const binaryString = atob(base64Data);
        const bytes = new Uint8Array(binaryString.length);
        for (let i = 0; i < binaryString.length; i++) {
            bytes[i] = binaryString.charCodeAt(i);
        }
        return bytes;
    } catch (e) {
        console.error("Erreur TTS:", e);
        return null;
    }
};

export const translateText = async (text: string, targetLang: string, userId: string): Promise<string> => {
    return executeWithFallback(async (ai, model) => {
        const res = await ai.models.generateContent({
            model,
            contents: `Translate to ${targetLang}, text only: "${text}"`,
        });
        return res.text?.trim() || text;
    });
};

export const analyzeVoiceCallPerformance = async (history: ChatMessage[], userId: string): Promise<VoiceCallSummary> => {
    const ai = new GoogleGenAI({ apiKey: getApiKey() });
    const prompt = `Analyse JSON: {score, feedback, tip}. Conversation: ${JSON.stringify(history.slice(-4))}`;
    const res = await ai.models.generateContent({
        model: 'gemini-1.5-flash',
        contents: prompt,
        config: { responseMimeType: "application/json" }
    });
    try {
        return JSON.parse(res.text || '{"score":7, "feedback":"Bien", "tip":"Continuez"}');
    } catch {
        return { score: 7, feedback: "Bon travail", tip: "Continuez !" };
    }
};

export interface RoleplayResponse { aiReply: string; correction?: string; explanation?: string; score?: number; feedback?: string; }
export const generateRoleplayResponse = async (h: any, s: any, u: any, c?: boolean, init?: boolean): Promise<RoleplayResponse> => {
    const reply = await sendMessageToGemini("Continue le dialogue", u.id, h);
    return { aiReply: reply };
};
export const generatePracticalExercises = async (u: any, h: any) => [];
export const analyzeUserProgress = async (h: any, m: any, id: any) => ({ newMemory: m, xpEarned: 10, feedback: "Ok" });
export const generateDailyChallenges = async (p: any) => [];
export const generateConceptImage = async (p: any, id: any) => null;
export const startChatSession = async (p: any, pr: any, h: any) => null;
export const getLessonSummary = async (n: any, c: any, id: any) => "Résumé";
