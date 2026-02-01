import { GoogleGenAI, Modality } from "@google/genai";
import { UserProfile, UserPreferences, ChatMessage, DailyChallenge, ExerciseItem, VoiceCallSummary, VoiceName } from "../types";
import { SYSTEM_PROMPT_TEMPLATE } from "../constants";
import { storageService } from "./storageService";

// Pool de modèles pour la redondance
const TEXT_MODELS = [
    'gemini-3-flash-preview',
    'gemini-flash-lite-latest',
    'gemini-1.5-flash'
];

const getApiKey = (): string => {
    // Récupération depuis l'environnement Render (format: KEY1,KEY2,...)
    const rawKey = process.env.API_KEY || "";
    const keys = rawKey.split(',').map((k: string) => k.trim()).filter((k: string) => k.length > 5);
    
    if (keys.length === 0) {
        console.error("CRITICAL: API_KEY_MISSING. Check Render Environment Variables.");
        throw new Error("API_KEY_MISSING");
    }
    
    // Rotation simple pour répartir la charge
    return keys[Math.floor(Math.random() * keys.length)];
};

const getAiClient = () => new GoogleGenAI({ apiKey: getApiKey() });

async function executeWithFallback<T>(operation: (modelName: string) => Promise<T>, pool: string[] = TEXT_MODELS): Promise<T> {
    let lastError: any;
    for (const modelName of pool) {
        try {
            // Tentative d'exécution
            return await operation(modelName);
        } catch (error: any) {
            lastError = error;
            const msg = error.message?.toLowerCase() || "";
            
            // Si c'est une erreur de quota ou de réseau, on bascule
            if (msg.includes('429') || msg.includes('quota') || msg.includes('fetch') || msg.includes('network')) {
                console.warn(`Réseau/Quota instable sur ${modelName}, tentative de basculement...`);
                // Petit délai pour laisser le réseau respirer
                await new Promise(r => setTimeout(r, 500));
                continue;
            }
            throw error;
        }
    }
    throw new Error("Connexion impossible. Vérifiez votre réseau ou contactez l'admin.");
}

export const sendMessageToGemini = async (message: string, userId: string, history: ChatMessage[]): Promise<string> => {
    const user = storageService.getUserById(userId);
    if (!user) throw new Error("USER_NOT_FOUND");
    
    return executeWithFallback(async (model) => {
        const ai = getAiClient();
        const response = await ai.models.generateContent({
            model,
            contents: [
                ...history.slice(-8).map(m => ({ role: m.role, parts: [{ text: m.text }] })),
                { role: 'user', parts: [{ text: message }] }
            ],
            config: { 
                systemInstruction: SYSTEM_PROMPT_TEMPLATE(user, user.preferences!) + 
                "\n\nSTRICTE INTERDICTION: Ne jamais envoyer de blocs de code informatique ( triple backticks ). Réponds exclusivement en texte clair et pédagogique.",
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
    
    return executeWithFallback(async (model) => {
        const ai = getAiClient();
        const response = await ai.models.generateContent({
            model: 'gemini-flash-lite-latest',
            contents: [
                ...history.slice(-4).map(m => ({ role: m.role, parts: [{ text: m.text }] })),
                { role: 'user', parts: [{ text: message }] }
            ],
            config: {
                systemInstruction: `Tu es TeacherMada en APPEL VOCAL. CONSIGNES: Réponses très courtes (1-2 phrases). Pas de listes. JAMAIS DE CODE. Pas de markdown. Langue: ${user.preferences?.targetLanguage}.`,
                maxOutputTokens: 100,
                temperature: 0.5
            }
        });
        return response.text || "D'accord.";
    }, ['gemini-flash-lite-latest', 'gemini-1.5-flash']);
};

export const generateSpeech = async (text: string, userId: string, voice?: VoiceName): Promise<Uint8Array | null> => {
    try {
        const ai = getAiClient();
        const user = storageService.getUserById(userId);
        const voiceToUse = voice || user?.preferences?.voiceName || 'Kore';
        
        // Nettoyage pour éviter que le TTS ne lise des symboles bizarres
        const cleanText = text.replace(/[*#_`~]/g, '').trim();
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
        console.error("TTS API Error:", e);
        return null;
    }
};

export const translateText = async (text: string, targetLang: string, userId: string): Promise<string> => {
    return executeWithFallback(async (model) => {
        const ai = getAiClient();
        const res = await ai.models.generateContent({
            model,
            contents: `Translate to ${targetLang}, text only: "${text}"`,
        });
        return res.text?.trim() || text;
    });
};

export const analyzeVoiceCallPerformance = async (history: ChatMessage[], userId: string): Promise<VoiceCallSummary> => {
    const ai = getAiClient();
    const prompt = `Analyse session orale JSON: {score, feedback, tip}. Conversation: ${JSON.stringify(history.slice(-6))}`;
    const res = await ai.models.generateContent({
        model: 'gemini-1.5-flash',
        contents: prompt,
        config: { responseMimeType: "application/json" }
    });
    try {
        return JSON.parse(res.text || '{"score":7, "feedback":"Bien", "tip":"Continue"}');
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
