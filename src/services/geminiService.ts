import { GoogleGenAI, Modality, Type } from "@google/genai";
import { UserProfile, UserPreferences, ChatMessage, VoiceName, VoiceCallSummary, ExerciseItem, TargetLanguage } from "../types";
import { SYSTEM_PROMPT_TEMPLATE } from "../constants";
import { storageService } from "./storageService";

const MODEL_POOL = [
    'gemini-3-flash-preview',
    'gemini-flash-lite-latest',
    'gemini-flash-latest'
];

const getApiKey = (): string => {
    const rawKeys = process.env.API_KEY || "";
    const keys = rawKeys.split(',').map((k: string) => k.trim()).filter((k: string) => k.length > 5);
    if (keys.length === 0) throw new Error("API_KEY_MISSING");
    return keys[Math.floor(Math.random() * keys.length)];
};

async function executeWithFallback<T>(operation: (ai: GoogleGenAI, modelName: string) => Promise<T>): Promise<T> {
    let lastError: any;
    for (const model of MODEL_POOL) {
        try {
            const ai = new GoogleGenAI({ apiKey: getApiKey() });
            return await operation(ai, model);
        } catch (error: any) {
            lastError = error;
            if (error.message?.includes('429') || error.message?.includes('quota') || error.message?.includes('fetch')) continue;
            throw error;
        }
    }
    throw lastError || new Error("Service indisponible.");
}

export const sendMessageToGeminiStream = async (
    message: string, 
    userId: string, 
    history: ChatMessage[],
    onChunk: (text: string) => void
): Promise<string> => {
    const user = storageService.getUserById(userId);
    if (!user) throw new Error("USER_NOT_FOUND");
    
    const ai = new GoogleGenAI({ apiKey: getApiKey() });
    const responseStream = await ai.models.generateContentStream({
        model: 'gemini-3-flash-preview',
        contents: [
            ...history.slice(-10).map(m => ({ role: m.role, parts: [{ text: m.text }] })),
            { role: 'user', parts: [{ text: message }] }
        ],
        config: { 
            systemInstruction: SYSTEM_PROMPT_TEMPLATE(user, user.preferences!) + "\n\nNE JAMAIS GÉNÉRER DE CODE. TEXTE UNIQUEMENT.",
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
};

export const generateSpeech = async (text: string, userId: string, voice?: VoiceName): Promise<Uint8Array | null> => {
    try {
        const ai = new GoogleGenAI({ apiKey: getApiKey() });
        const user = storageService.getUserById(userId);
        const voiceToUse = voice || user?.preferences?.voiceName || 'Kore';
        
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
        console.error("TTS Error:", e);
        return null;
    }
};

export const generatePracticalExercises = async (user: UserProfile, history: ChatMessage[]): Promise<ExerciseItem[]> => {
    const ai = new GoogleGenAI({ apiKey: getApiKey() });
    const prompt = `Génère 5 exercices (${user.preferences?.targetLanguage}, ${user.preferences?.level}) basés sur : ${history.slice(-5).map(m => m.text).join(' ')}. JSON array: [{type: "multiple_choice"|"fill_blank", question, options, correctAnswer, explanation}]`;
    const res = await ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: prompt,
        config: { responseMimeType: "application/json" }
    });
    const data = JSON.parse(res.text || "[]");
    return data.map((ex: any, i: number) => ({ ...ex, id: `ex_${Date.now()}_${i}` }));
};

export const translateText = async (text: string, targetLang: string): Promise<string> => {
    const ai = new GoogleGenAI({ apiKey: getApiKey() });
    const res = await ai.models.generateContent({
        model: 'gemini-flash-lite-latest',
        contents: `Traduire en ${targetLang}, texte seul: "${text}"`,
    });
    return res.text?.trim() || text;
};

export const analyzeVoiceCallPerformance = async (history: ChatMessage[]): Promise<VoiceCallSummary> => {
    const ai = new GoogleGenAI({ apiKey: getApiKey() });
    const res = await ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: `Analyse JSON: {score, feedback, tip}. Conversation: ${JSON.stringify(history.slice(-6))}`,
        config: { responseMimeType: "application/json" }
    });
    return JSON.parse(res.text || '{"score":7, "feedback":"Bien", "tip":"Continuez"}');
};

export const generateVoiceChatResponse = async (message: string, userId: string, history: ChatMessage[]): Promise<string> => {
    const user = storageService.getUserById(userId);
    if (!user) throw new Error("USER_NOT_FOUND");
    const ai = new GoogleGenAI({ apiKey: getApiKey() });
    const res = await ai.models.generateContent({
        model: 'gemini-flash-lite-latest',
        contents: [
            ...history.slice(-4).map(m => ({ role: m.role, parts: [{ text: m.text }] })),
            { role: 'user', parts: [{ text: message }] }
        ],
        config: {
            systemInstruction: `Tu es TeacherMada en APPEL VOCAL. Réponses ultra-courtes (max 15 mots). Pas de markdown.`,
            maxOutputTokens: 80,
            temperature: 0.5
        }
    });
    return res.text || "Je vous écoute.";
};

export const startChatSession = async (p: any, pr: any, h: any) => null;
export const analyzeUserProgress = async (h: any, m: any, id: any) => ({ newMemory: m, xpEarned: 15 });
export const generateDailyChallenges = async (p: any) => [];
export const generateConceptImage = async (p: any, id: any) => null;
export const getLessonSummary = async (n: any, c: any, id: any) => "Résumé de la leçon.";
export interface RoleplayResponse { aiReply: string; correction?: string; explanation?: string; score?: number; feedback?: string; }
export const generateRoleplayResponse = async (h: any, s: any, u: any, c?: boolean, init?: boolean): Promise<RoleplayResponse> => {
    const ai = new GoogleGenAI({ apiKey: getApiKey() });
    const res = await ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: `Jeu de rôle. Contexte: ${s}. Historique: ${JSON.stringify(h)}. Réponds court.`,
    });
    return { aiReply: res.text || "À vous." };
};
