import { GoogleGenAI, Modality, Type } from "@google/genai";
import { UserProfile, ChatMessage, VoiceName, VoiceCallSummary, ExerciseItem, VocabularyItem } from "../types";
import { SYSTEM_PROMPT_TEMPLATE } from "../constants";
import { storageService } from "./storageService";

/**
 * Pool de modèles pour le fallback automatique
 */
const MODEL_POOL = [
    'gemini-3-flash-preview',
    'gemini-flash-latest',
    'gemini-flash-lite-latest'
];

/**
 * Extrait proprement les clés API multiples
 */
const getApiKeys = (): string[] => {
    const raw = process.env.API_KEY || "";
    return raw.split(/[,\n\s]+/).map(k => k.trim()).filter(k => k.length > 10);
};

/**
 * Exécuteur universel avec rotation de clés et de modèles en cas d'erreur
 */
async function executeWithFallback<T>(operation: (ai: GoogleGenAI, modelName: string) => Promise<T>): Promise<T> {
    const keys = getApiKeys();
    if (keys.length === 0) throw new Error("API_KEY_MISSING");

    let lastError: any;
    
    // On essaie chaque modèle du pool
    for (const model of MODEL_POOL) {
        // Pour chaque modèle, on teste chaque clé disponible
        for (const key of keys) {
            try {
                const ai = new GoogleGenAI({ apiKey: key });
                return await operation(ai, model);
            } catch (error: any) {
                lastError = error;
                const msg = error.message?.toLowerCase() || "";
                // Si quota épuisé, erreur réseau ou timeout, on passe à la suite
                if (msg.includes('429') || msg.includes('quota') || msg.includes('fetch') || msg.includes('network') || msg.includes('deadline')) {
                    console.warn(`Basculement API : Clé suivante pour le modèle ${model}...`);
                    continue;
                }
                throw error; // Erreur fatale de logique (ex: prompt bloqué)
            }
        }
    }
    throw lastError || new Error("Service IA indisponible.");
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
                ...history.slice(-12).map(m => ({ role: m.role, parts: [{ text: m.text }] })),
                { role: 'user', parts: [{ text: message }] }
            ],
            config: { 
                systemInstruction: SYSTEM_PROMPT_TEMPLATE(user, user.preferences!) + "\n\nNE GÉNÈRE JAMAIS DE CODE. TEXTE UNIQUEMENT.",
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
        const keys = getApiKeys();
        const ai = new GoogleGenAI({ apiKey: keys[Math.floor(Math.random() * keys.length)] });
        const user = storageService.getUserById(userId);
        const voiceToUse = voice || user?.preferences?.voiceName || 'Kore';
        
        // Nettoyage Markdown
        const cleanText = text.replace(/[*#_`~]/g, '').trim().substring(0, 1200);
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
        for (let i = 0; i < binaryString.length; i++) bytes[i] = binaryString.charCodeAt(i);
        return bytes;
    } catch (e) {
        console.error("Audio Engine Error:", e);
        return null;
    }
};

export const generateVocabularyFromHistory = async (history: ChatMessage[], lang: string): Promise<VocabularyItem[]> => {
    return executeWithFallback(async (ai, model) => {
        const prompt = `Extrais 3 mots clés de cette leçon en ${lang}. JSON array: [{word, translation, context, mastered: false}]`;
        const res = await ai.models.generateContent({
            model,
            contents: prompt,
            config: { responseMimeType: "application/json" }
        });
        const data = JSON.parse(res.text || "[]");
        return data.map((v: any) => ({ ...v, id: crypto.randomUUID(), addedAt: Date.now() }));
    });
};

export const generatePracticalExercises = async (user: UserProfile, history: ChatMessage[]): Promise<ExerciseItem[]> => {
    return executeWithFallback(async (ai, model) => {
        const prompt = `Génère 5 exercices (${user.preferences?.targetLanguage}, ${user.preferences?.level}). JSON array: [{type: "multiple_choice"|"fill_blank", question, options, correctAnswer, explanation}]`;
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
                systemInstruction: `Tu es TeacherMada en APPEL VOCAL. Réponds très court. Pas de markdown.`,
                maxOutputTokens: 100
            }
        });
        return res.text || "D'accord.";
    });
};

export const translateText = async (text: string, targetLang: string): Promise<string> => {
    return executeWithFallback(async (ai, model) => {
        const res = await ai.models.generateContent({
            model,
            contents: `Traduis en ${targetLang}: "${text}"`,
        });
        return res.text?.trim() || text;
    });
};

export const analyzeVoiceCallPerformance = async (history: ChatMessage[]): Promise<VoiceCallSummary> => {
    return executeWithFallback(async (ai, model) => {
        const res = await ai.models.generateContent({
            model,
            contents: `Analyse conversation JSON: {score, feedback, tip}`,
            config: { responseMimeType: "application/json" }
        });
        return JSON.parse(res.text || '{"score":7, "feedback":"Bien", "tip":"Continuez"}');
    });
};

// Fonctions de compatibilité
export const startChatSession = async (p: any, pr: any, h: any) => null;
export const analyzeUserProgress = async (h: any, m: any, id: any) => ({ newMemory: m, xpEarned: 20 });
export const generateDailyChallenges = async (p: any) => [];
export const generateConceptImage = async (p: any, id: any) => null;
export interface RoleplayResponse { aiReply: string; correction?: string; explanation?: string; score?: number; feedback?: string; }
export const generateRoleplayResponse = async (h: any, s: any, u: any, c?: boolean, init?: boolean): Promise<RoleplayResponse> => {
    const ai = new GoogleGenAI({ apiKey: getApiKeys()[0] });
    const res = await ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: `Jeu de rôle. Contexte: ${s}. Réponds court.`,
    });
    return { aiReply: res.text || "À vous." };
};
