import { GoogleGenAI, Modality, Type } from "@google/genai";
import { UserProfile, UserPreferences, ChatMessage, DailyChallenge, ExerciseItem, VoiceCallSummary, VoiceName } from "../types";
import { SYSTEM_PROMPT_TEMPLATE } from "../constants";
import { storageService } from "./storageService";

const getApiKey = (): string => {
    const rawKey = process.env.API_KEY || "";
    const keys = rawKey.split(',').map((k: string) => k.trim()).filter((k: string) => k.length > 5);
    if (keys.length === 0) throw new Error("API_KEY_MISSING");
    return keys[Math.floor(Math.random() * keys.length)];
};

const getAiClient = () => new GoogleGenAI({ apiKey: getApiKey() });

async function executeWithFallback<T>(operation: (modelName: string) => Promise<T>, pool: string[] = ['gemini-3-flash-preview', 'gemini-1.5-flash']): Promise<T> {
    let lastError: any;
    for (const modelName of pool) {
        try {
            return await operation(modelName);
        } catch (error: any) {
            lastError = error;
            if (error.message?.includes('429') || error.message?.includes('quota')) continue;
            throw error;
        }
    }
    throw lastError;
}

export const sendMessageToGemini = async (message: string, userId: string, history: ChatMessage[]): Promise<string> => {
    const user = storageService.getUserById(userId);
    if (!user) throw new Error("USER_NOT_FOUND");
    return executeWithFallback(async (model) => {
        const ai = getAiClient();
        const response = await ai.models.generateContent({
            model,
            contents: [...history.slice(-10).map(m => ({ role: m.role, parts: [{ text: m.text }] })), { role: 'user', parts: [{ text: message }] }],
            config: { systemInstruction: SYSTEM_PROMPT_TEMPLATE(user, user.preferences!), temperature: 0.7 }
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
            contents: [...history.slice(-6).map(m => ({ role: m.role, parts: [{ text: m.text }] })), { role: 'user', parts: [{ text: message }] }],
            config: {
                systemInstruction: `Tu es TeacherMada en APPEL VOCAL. Réponds de façon très concise (1-2 phrases max). PAS DE MARKDOWN. Ne fais pas de listes. Sois naturel comme au téléphone. Langue cible: ${user.preferences?.targetLanguage}.`,
                maxOutputTokens: 150,
                temperature: 0.6
            }
        });
        return response.text || "D'accord, je vous écoute.";
    }, ['gemini-flash-lite-latest', 'gemini-1.5-flash']);
};

export const generateSpeech = async (text: string, userId: string, voice?: VoiceName): Promise<Uint8Array | null> => {
    try {
        const ai = getAiClient();
        const user = storageService.getUserById(userId);
        const voiceToUse = voice || user?.preferences?.voiceName || 'Kore';
        
        // Suppression des caractères spéciaux qui font bugger la lecture
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

// Fix: Ading missing translateText function to match ChatInterface.tsx imports
export const translateText = async (text: string, targetLang: string, userId: string): Promise<string> => {
    return executeWithFallback(async (modelName) => {
        const ai = getAiClient();
        const prompt = `Translate to ${targetLang}. Return ONLY the translation. Text: "${text}"`;
        const response = await ai.models.generateContent({
            model: modelName,
            contents: prompt,
        });
        storageService.deductCreditOrUsage(userId);
        return response.text?.trim() || text;
    });
};

export interface RoleplayResponse {
    aiReply: string;
    correction?: string;
    explanation?: string;
    score?: number;
    feedback?: string;
}

export const generateRoleplayResponse = async (history: ChatMessage[], scenario: string, userProfile: UserProfile, isClosing: boolean = false, isInitiating: boolean = false): Promise<RoleplayResponse> => {
    return executeWithFallback(async (modelName) => {
        const ai = getAiClient();
        let prompt = isClosing ? `Termine le scénario: ${scenario}. Score /20. Feedback en ${userProfile.preferences?.explanationLanguage}.` : isInitiating ? `Commence le dialogue: ${scenario}.` : `Continue le dialogue: ${scenario}.`;
        const response = await ai.models.generateContent({
            model: modelName,
            contents: prompt,
            config: { responseMimeType: "application/json" }
        });
        return JSON.parse(response.text || "{}");
    });
};

export const generatePracticalExercises = async (user: UserProfile, history: ChatMessage[]): Promise<ExerciseItem[]> => {
    return executeWithFallback(async (model) => {
        const ai = getAiClient();
        const res = await ai.models.generateContent({ model, contents: `Génère 5 exos pour ${user.preferences?.targetLanguage}`, config: { responseMimeType: "application/json" } });
        return JSON.parse(res.text || "[]");
    });
};

export const analyzeUserProgress = async (history: ChatMessage[], memory: string, userId: string) => {
    return executeWithFallback(async (model) => {
        const ai = getAiClient();
        const res = await ai.models.generateContent({ model, contents: `Analyse progrès. JSON: {newMemory, xpEarned, feedback}`, config: { responseMimeType: "application/json" } });
        return JSON.parse(res.text || `{"newMemory":"${memory}","xpEarned":10,"feedback":"Ok"}`);
    });
};

export const generateDailyChallenges = async (prefs: UserPreferences): Promise<DailyChallenge[]> => {
    return executeWithFallback(async (model) => {
        const ai = getAiClient();
        const res = await ai.models.generateContent({ model, contents: `3 défis quotidiens ${prefs.targetLanguage}`, config: { responseMimeType: "application/json" } });
        return JSON.parse(res.text || "[]");
    });
};

export const generateConceptImage = async (prompt: string, userId: string): Promise<string | null> => {
    try {
        const ai = getAiClient();
        const res = await ai.models.generateContent({ model: 'gemini-2.5-flash-image', contents: prompt });
        const data = res.candidates?.[0]?.content?.parts?.find(p => p.inlineData)?.inlineData?.data;
        return data ? `data:image/png;base64,${data}` : null;
    } catch { return null; }
};

export const analyzeVoiceCallPerformance = async (history: ChatMessage[], userId: string): Promise<VoiceCallSummary> => {
    const ai = getAiClient();
    const res = await ai.models.generateContent({ model: 'gemini-3-flash-preview', contents: `Analyse appel. JSON: {score, feedback, tip}`, config: { responseMimeType: "application/json" } });
    return JSON.parse(res.text || `{"score":7,"feedback":"Bien","tip":"Continue"}`);
};

export const getLessonSummary = async (num: number, context: string, userId: string): Promise<string> => {
    const ai = getAiClient();
    const res = await ai.models.generateContent({ model: 'gemini-3-flash-preview', contents: `Résumé leçon ${num}` });
    return res.text || "Résumé indisponible.";
};

export const startChatSession = async (p: any, pr: any, h: any) => null;