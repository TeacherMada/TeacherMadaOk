import { GoogleGenAI, Modality } from "@google/genai";
import { UserProfile, UserPreferences, ChatMessage, VoiceName, VoiceCallSummary, ExerciseItem } from "../types";
import { SYSTEM_PROMPT_TEMPLATE } from "../constants";
import { storageService } from "./storageService";

const MODEL_POOL = [
    'gemini-3-flash-preview',
    'gemini-flash-lite-latest',
    'gemini-flash-latest'
];

/**
 * Extrait et rotation des clés API depuis process.env.API_KEY
 * Supporte le format "KEY1, KEY2, KEY3"
 */
const getApiKey = (): string => {
    const rawKeys = process.env.API_KEY || "";
    const keys = rawKeys.split(',')
        .map((k: string) => k.trim())
        .filter((k: string) => k.length > 5);
    
    if (keys.length === 0) {
        throw new Error("API_KEY_MISSING: Aucune clé configurée.");
    }
    // Rotation aléatoire pour maximiser le quota
    return keys[Math.floor(Math.random() * keys.length)];
};

/**
 * Exécute une opération avec fallback automatique sur les modèles et rotation de clés
 */
async function executeWithFallback<T>(operation: (ai: GoogleGenAI, modelName: string) => Promise<T>): Promise<T> {
    let lastError: any;
    const keys = (process.env.API_KEY || "").split(',').filter(k => k.trim().length > 5);
    
    // On tente sur les modèles du pool
    for (const model of MODEL_POOL) {
        // Pour chaque modèle, on peut tenter plusieurs clés si erreur de quota
        for (let attempt = 0; attempt < Math.min(keys.length, 3); attempt++) {
            try {
                const ai = new GoogleGenAI({ apiKey: getApiKey() });
                return await operation(ai, model);
            } catch (error: any) {
                lastError = error;
                const msg = error.message?.toLowerCase() || "";
                // Si quota épuisé ou erreur serveur, on change de clé/modèle
                if (msg.includes('429') || msg.includes('quota') || msg.includes('fetch') || msg.includes('network')) {
                    continue; 
                }
                throw error; // Erreur fatale (ex: auth)
            }
        }
    }
    throw lastError || new Error("Service IA indisponible après plusieurs tentatives.");
}

export const sendMessageToGeminiStream = async (
    message: string, 
    userId: string, 
    history: ChatMessage[],
    onChunk: (text: string) => void
): Promise<string> => {
    const user = storageService.getUserById(userId);
    if (!user) throw new Error("USER_NOT_FOUND");
    
    return executeWithFallback(async (ai, model) => {
        const responseStream = await ai.models.generateContentStream({
            model,
            contents: [
                ...history.slice(-10).map(m => ({ role: m.role, parts: [{ text: m.text }] })),
                { role: 'user', parts: [{ text: message }] }
            ],
            config: { 
                systemInstruction: SYSTEM_PROMPT_TEMPLATE(user, user.preferences!) + "\n\n🚨 INTERDICTION : Ne génère jamais de code. Texte pédagogique uniquement.",
                temperature: 0.7 
            }
        });

        let fullText = "";
        for await (const chunk of responseStream) {
            const text = chunk.text;
            if (text) {
                fullText += text;
                onChunk(fullText);
            }
        }
        storageService.deductCreditOrUsage(userId);
        return fullText;
    });
};

export const generateSpeech = async (text: string, userId: string, voice?: VoiceName): Promise<Uint8Array | null> => {
    try {
        const ai = new GoogleGenAI({ apiKey: getApiKey() });
        const user = storageService.getUserById(userId);
        const voiceToUse = voice || user?.preferences?.voiceName || 'Kore';
        
        // Nettoyage Markdown pour éviter que l'IA ne lise les symboles
        const cleanText = text.replace(/[*#_`~]/g, '').trim().substring(0, 1000);
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

export const generatePracticalExercises = async (user: UserProfile, history: ChatMessage[]): Promise<ExerciseItem[]> => {
    return executeWithFallback(async (ai, model) => {
        const prompt = `Génère 5 exercices (${user.preferences?.targetLanguage}, ${user.preferences?.level}) basés sur l'historique récent. JSON array uniquement: [{type: "multiple_choice"|"fill_blank", question, options, correctAnswer, explanation}]`;
        const res = await ai.models.generateContent({
            model,
            contents: prompt,
            config: { responseMimeType: "application/json" }
        });
        const data = JSON.parse(res.text || "[]");
        return data.map((ex: any, i: number) => ({ ...ex, id: `ex_${Date.now()}_${i}` }));
    });
};

export const generateVoiceChatResponse = async (message: string, userId: string, history: ChatMessage[]): Promise<string> => {
    const user = storageService.getUserById(userId);
    if (!user) throw new Error("USER_NOT_FOUND");
    
    return executeWithFallback(async (ai, model) => {
        const res = await ai.models.generateContent({
            model: 'gemini-flash-lite-latest',
            contents: [
                ...history.slice(-4).map(m => ({ role: m.role, parts: [{ text: m.text }] })),
                { role: 'user', parts: [{ text: message }] }
            ],
            config: {
                systemInstruction: `Tu es TeacherMada en APPEL VOCAL. Réponses ultra-courtes (max 12 mots). Pas de markdown.`,
                maxOutputTokens: 100,
                temperature: 0.5
            }
        });
        return res.text || "D'accord.";
    });
};

export const translateText = async (text: string, targetLang: string): Promise<string> => {
    return executeWithFallback(async (ai, model) => {
        const res = await ai.models.generateContent({
            model,
            contents: `Traduis en ${targetLang}, texte seul: "${text}"`,
        });
        return res.text?.trim() || text;
    });
};

export const analyzeVoiceCallPerformance = async (history: ChatMessage[]): Promise<VoiceCallSummary> => {
    return executeWithFallback(async (ai, model) => {
        const res = await ai.models.generateContent({
            model,
            contents: `Analyse JSON: {score, feedback, tip}. Conversation: ${JSON.stringify(history.slice(-6))}`,
            config: { responseMimeType: "application/json" }
        });
        return JSON.parse(res.text || '{"score":7, "feedback":"Bien", "tip":"Continuez"}');
    });
};

// Fonctions de compatibilité (vides ou simples)
export const startChatSession = async (p: any, pr: any, h: any) => null;
export const analyzeUserProgress = async (h: any, m: any, id: any) => ({ newMemory: m, xpEarned: 20 });
export const generateDailyChallenges = async (p: any) => [];
export const generateConceptImage = async (p: any, id: any) => null;
export const getLessonSummary = async (n: any, c: any, id: any) => "Résumé de la leçon.";
export interface RoleplayResponse { aiReply: string; correction?: string; explanation?: string; score?: number; feedback?: string; }
export const generateRoleplayResponse = async (h: any, s: any, u: any, c?: boolean, init?: boolean): Promise<RoleplayResponse> => {
    const ai = new GoogleGenAI({ apiKey: getApiKey() });
    const res = await ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: `Jeu de rôle. Scénario: ${s}. Réponds de façon concise.`,
    });
    return { aiReply: res.text || "À vous." };
};
