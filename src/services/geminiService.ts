import { GoogleGenAI, Modality } from "@google/genai";
import { UserProfile, UserPreferences, ChatMessage, DailyChallenge, ExerciseItem, VoiceCallSummary } from "../types";
import { SYSTEM_PROMPT_TEMPLATE } from "../constants";
import { storageService } from "./storageService";

/**
 * Retrieves a valid API Key from environment variables.
 * Prioritizes process.env.API_KEY as per strict requirements.
 * Also checks VITE_GOOGLE_API_KEY as a fallback since the user mentioned it.
 * Supports comma-separated rotation.
 */
const getApiKey = (): string => {
    // Attempt to get keys from standard process.env or Vite's import.meta.env
    const rawKey = process.env.API_KEY || (import.meta as any).env?.VITE_GOOGLE_API_KEY || "";
    const keys = rawKey.split(',').map((k: string) => k.trim()).filter((k: string) => k.length > 5);

    if (keys.length === 0) {
        // If we throw an error with "API_KEY", the UI will show "Erreur Configuration API"
        throw new Error("REQUIRED_CONFIGURATION_MISSING: API_KEY environment variable is empty or invalid.");
    }

    // Dynamic rotation: pick a random key from the list
    return keys[Math.floor(Math.random() * keys.length)];
};

/**
 * Creates a fresh GenAI instance using the required initialization pattern.
 */
const getAiClient = () => {
    const apiKey = getApiKey();
    return new GoogleGenAI({ apiKey });
};

// Recommended model names
const TEXT_MODEL = 'gemini-3-flash-preview';
const TTS_MODEL = 'gemini-2.5-flash-preview-tts';
const IMAGE_MODEL = 'gemini-2.5-flash-image';

const sanitizeHistory = (history: ChatMessage[]) => {
    return history.slice(-12).map(m => ({
        role: m.role,
        parts: [{ text: m.text }]
    }));
};

export const sendMessageToGemini = async (
    message: string, 
    userId: string,
    history: ChatMessage[]
): Promise<string> => {
    const ai = getAiClient();
    const user = storageService.getUserById(userId);
    if (!user || !user.preferences) throw new Error("USER_DATA_MISSING");

    const systemInstruction = SYSTEM_PROMPT_TEMPLATE(user, user.preferences);

    const response = await ai.models.generateContent({
        model: TEXT_MODEL,
        contents: [...sanitizeHistory(history), { role: 'user', parts: [{ text: message }] }],
        config: {
            systemInstruction,
            temperature: 0.7,
            maxOutputTokens: 2048
        }
    });

    storageService.deductCreditOrUsage(userId);
    return response.text || "Désolé, je n'ai pas pu générer de réponse.";
};

export const generateVoiceChatResponse = async (
    message: string, 
    userId: string, 
    history: ChatMessage[]
): Promise<string> => {
    const ai = getAiClient();
    const user = storageService.getUserById(userId);
    if (!user || !user.preferences) throw new Error("USER_DATA_MISSING");

    const systemInstruction = `
        ACT: Friendly language tutor on a phone call. 
        USER: ${user.username}. TARGET: ${user.preferences.targetLanguage}. LEVEL: ${user.preferences.level}.
        RULES: Short response (max 2 sentences). Natural flow. No markdown. Correct errors softly.
    `;

    const response = await ai.models.generateContent({
        model: TEXT_MODEL,
        contents: [...sanitizeHistory(history), { role: 'user', parts: [{ text: message }] }],
        config: {
            systemInstruction,
            temperature: 0.6,
            maxOutputTokens: 150
        }
    });

    return response.text || "Je vous écoute.";
};

export const generateSpeech = async (text: string, userId: string): Promise<ArrayBuffer | null> => {
    const ai = getAiClient();
    const cleanText = text.replace(/[*#_`~]/g, '').trim();
    if (!cleanText) return null;

    const response = await ai.models.generateContent({
        model: TTS_MODEL,
        contents: [{ parts: [{ text: cleanText }] }],
        config: {
            responseModalities: [Modality.AUDIO],
            speechConfig: {
                voiceConfig: {
                    prebuiltVoiceConfig: { voiceName: 'Kore' }
                }
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
    return bytes.buffer;
};

// Keep existing signature for App.tsx
export const startChatSession = async (profile: UserProfile, prefs: UserPreferences, history: ChatMessage[]) => null;

export const translateText = async (text: string, targetLang: string, userId: string): Promise<string> => {
    const ai = getAiClient();
    const response = await ai.models.generateContent({
        model: TEXT_MODEL,
        contents: `Translate to ${targetLang}: "${text}"`,
    });
    storageService.deductCreditOrUsage(userId);
    return response.text?.trim() || text;
};

export const generatePracticalExercises = async (user: UserProfile, history: ChatMessage[]): Promise<ExerciseItem[]> => {
    const ai = getAiClient();
    const prompt = `Generate 5 exercises for ${user.preferences?.targetLanguage} level ${user.preferences?.level}. Return JSON array.`;
    const response = await ai.models.generateContent({
        model: TEXT_MODEL,
        contents: prompt,
        config: { responseMimeType: "application/json" }
    });
    storageService.deductCreditOrUsage(user.id);
    try {
        const json = JSON.parse(response.text || "[]");
        return json.map((ex: any, i: number) => ({ ...ex, id: `ex_${Date.now()}_${i}` }));
    } catch { return []; }
};

export const getLessonSummary = async (num: number, context: string, userId: string): Promise<string> => {
    const ai = getAiClient();
    const response = await ai.models.generateContent({
        model: TEXT_MODEL,
        contents: `Summarize lesson ${num} based on: ${context}`,
    });
    storageService.deductCreditOrUsage(userId);
    return response.text || "Résumé indisponible.";
};

export const generateConceptImage = async (prompt: string, userId: string): Promise<string | null> => {
    const ai = getAiClient();
    const response = await ai.models.generateContent({
        model: IMAGE_MODEL,
        contents: { parts: [{ text: prompt }] },
        config: { imageConfig: { aspectRatio: "16:9" } } as any
    });
    storageService.deductCreditOrUsage(userId);
    
    const parts = response.candidates?.[0]?.content?.parts;
    if (!parts) return null;
    
    const part = parts.find(p => p.inlineData);
    if (part && part.inlineData) {
        return `data:${part.inlineData.mimeType || 'image/png'};base64,${part.inlineData.data}`;
    }
    
    return null;
};

export const analyzeUserProgress = async (history: ChatMessage[], memory: string, userId: string): Promise<{ newMemory: string; xpEarned: number; feedback: string }> => {
    const ai = getAiClient();
    const prompt = `Analyze progress. Update memory. Current memory: ${memory}. JSON: {newMemory, xpEarned, feedback}`;
    const response = await ai.models.generateContent({
        model: TEXT_MODEL,
        contents: prompt,
        config: { responseMimeType: "application/json" }
    });
    try {
        const json = JSON.parse(response.text || "{}");
        return {
            newMemory: json.newMemory || memory,
            xpEarned: Number(json.xpEarned) || 10,
            feedback: json.feedback || "Bien joué !"
        };
    } catch {
        return { newMemory: memory, xpEarned: 10, feedback: "Session analysée." };
    }
};

export const analyzeVoiceCallPerformance = async (history: ChatMessage[], userId: string): Promise<VoiceCallSummary> => {
    const ai = getAiClient();
    const prompt = `Analyze call performance. JSON: {score, feedback, tip}`;
    const response = await ai.models.generateContent({
        model: TEXT_MODEL,
        contents: prompt,
        config: { responseMimeType: "application/json" }
    });
    try {
        const json = JSON.parse(response.text || "{}");
        return {
            score: Number(json.score) || 7,
            feedback: json.feedback || "Bien joué !",
            tip: json.tip || "Continuez !"
        };
    } catch {
        return { score: 7, feedback: "Bonne pratique !", tip: "Pratiquez plus souvent." };
    }
};

export const generateRoleplayResponse = async (history: ChatMessage[], scenario: string, user: UserProfile, closing: boolean = false, init: boolean = false) => {
    const ai = getAiClient();
    const prompt = closing ? `Analyze session. JSON: {aiReply, score, feedback}` : `Continue roleplay ${scenario}. JSON: {aiReply, correction, explanation}`;
    const response = await ai.models.generateContent({
        model: TEXT_MODEL,
        contents: [...sanitizeHistory(history), { role: 'user', parts: [{ text: prompt }] }],
        config: { responseMimeType: "application/json" }
    });
    try {
        return JSON.parse(response.text || "{}");
    } catch {
        return { aiReply: "..." };
    }
};

export const generateDailyChallenges = async (prefs: UserPreferences): Promise<DailyChallenge[]> => {
    const ai = getAiClient();
    const response = await ai.models.generateContent({
        model: TEXT_MODEL,
        contents: `Generate 3 daily challenges for language learning. JSON array.`,
        config: { responseMimeType: "application/json" }
    });
    try {
        const json = JSON.parse(response.text || "[]");
        return json.map((c: any, i: number) => ({ ...c, id: `c_${Date.now()}_${i}`, currentCount: 0, isCompleted: false }));
    } catch { return []; }
};