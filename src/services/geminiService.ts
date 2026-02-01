import { GoogleGenAI, Modality } from "@google/genai";
import { UserProfile, UserPreferences, ChatMessage, DailyChallenge, ExerciseItem, VoiceCallSummary, VoiceName } from "../types";
import { SYSTEM_PROMPT_TEMPLATE } from "../constants";
import { storageService } from "./storageService";

// Pool de modèles pour la résilience
const MODEL_POOL = [
    'gemini-3-flash-preview',
    'gemini-flash-lite-latest',
    'gemini-1.5-flash'
];

/**
 * Récupère la ou les clés API depuis l'environnement.
 * Gère le format multi-clés (rotation) et les variables préfixées par VITE_.
 */
const getApiKey = (): string => {
    // @ts-ignore - Accès aux variables d'environnement Vite
    const viteKey = import.meta.env?.VITE_GOOGLE_API_KEY;
    // @ts-ignore
    const viteAltKey = import.meta.env?.VITE_API_KEY;
    // @ts-ignore - Fallback process.env pour certains environnements de build
    const processKey = (typeof process !== 'undefined' && process.env) ? (process.env.API_KEY || process.env.VITE_GOOGLE_API_KEY) : undefined;
    
    const rawKeys: string = viteKey || viteAltKey || processKey || "";
    
    // Nettoyage et typage explicite pour éviter TS7006
    const keys = rawKeys.split(',')
        .map((k: string) => k.trim())
        .filter((k: string) => k.length > 5);
    
    if (keys.length === 0) {
        console.error("CRITICAL: API_KEY_MISSING. Vérifiez VITE_GOOGLE_API_KEY dans vos variables d'environnement.");
        throw new Error("API_KEY_MISSING: Aucune clé valide trouvée dans l'environnement.");
    }
    
    // Rotation aléatoire pour distribuer le quota
    return keys[Math.floor(Math.random() * keys.length)];
};

async function executeWithFallback<T>(operation: (ai: GoogleGenAI, modelName: string) => Promise<T>): Promise<T> {
    let lastError: any;
    
    for (const model of MODEL_POOL) {
        try {
            // Création d'une nouvelle instance avec une clé rotative à chaque essai
            const ai = new GoogleGenAI({ apiKey: getApiKey() });
            return await operation(ai, model);
        } catch (error: any) {
            lastError = error;
            const msg = error.message?.toLowerCase() || "";
            
            // Retry sur erreurs de quota (429) ou instabilité réseau
            if (msg.includes('429') || msg.includes('quota') || msg.includes('fetch') || msg.includes('network')) {
                console.warn(`Instabilité sur ${model}, rotation de clé et basculement...`);
                continue;
            }
            throw error;
        }
    }
    throw lastError || new Error("Service IA temporairement indisponible.");
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
                "\n\n🚨 RÈGLE CRITIQUE : Interdiction formelle d'envoyer du code informatique ou des blocs ```. Réponds exclusivement en texte pédagogique fluide.",
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
                systemInstruction: `Tu es TeacherMada. APPEL VOCAL. Réponse courte (1 phrase). Pas de markdown. Langue: ${user.preferences?.targetLanguage}.`,
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
        
        // Nettoyage Markdown pour le TTS
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
        console.error("TTS Error:", e);
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
