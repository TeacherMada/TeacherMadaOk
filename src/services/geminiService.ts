import { GoogleGenAI, Modality } from "@google/genai";
import { UserProfile, UserPreferences, ChatMessage, DailyChallenge, ExerciseItem, VoiceCallSummary, VoiceName } from "../types";
import { SYSTEM_PROMPT_TEMPLATE } from "../constants";
import { storageService } from "./storageService";

// --- CONFIGURATION DES MODÈLES ---
// On définit une liste de modèles par ordre de priorité pour la résilience
const TEXT_MODELS = [
    'gemini-3-flash-preview',      // Ultra performant (Défaut)
    'gemini-flash-lite-latest',    // Ultra rapide
    'gemini-1.5-flash',            // Grande limite de quota (Gratuit)
    'gemini-2.0-flash-exp'         // Backup
];

const AUDIO_MODELS = [
    'gemini-2.5-flash-preview-tts', // TTS Natif
    'gemini-1.5-pro'                // Backup pour analyse audio complexe
];

// Gestion de l'index du modèle actuel pour la rotation
let currentModelIndex = 0;

const getApiKey = (): string => {
    const rawKey = process.env.API_KEY || (import.meta as any).env?.VITE_GOOGLE_API_KEY || "";
    const keys = rawKey.split(',').map((k: string) => k.trim()).filter((k: string) => k.length > 5);
    if (keys.length === 0) throw new Error("REQUIRED_CONFIGURATION_MISSING");
    return keys[Math.floor(Math.random() * keys.length)];
};

// Fonction utilitaire pour obtenir le client avec rotation automatique si erreur
const getAiClient = () => new GoogleGenAI({ apiKey: getApiKey() });

/**
 * Exécute une opération avec tentative de repli sur un autre modèle en cas d'erreur de quota (429)
 */
async function executeWithFallback<T>(operation: (modelName: string) => Promise<T>, pool: string[] = TEXT_MODELS): Promise<T> {
    let lastError: any;
    
    // On essaye les modèles du pool un par un en cas d'échec de quota
    for (let i = 0; i < pool.length; i++) {
        const modelName = pool[(currentModelIndex + i) % pool.length];
        try {
            return await operation(modelName);
        } catch (error: any) {
            lastError = error;
            const isQuotaError = error.message?.includes('429') || error.message?.includes('quota');
            
            if (isQuotaError) {
                console.warn(`Quota atteint pour ${modelName}, bascule sur le modèle suivant...`);
                continue; // Essayer le modèle suivant dans la boucle
            }
            throw error; // Si c'est une autre erreur, on l'affiche directement
        }
    }
    throw lastError;
}

const sanitizeHistory = (history: ChatMessage[], limit = 10) => {
    return history.slice(-limit).map(m => ({
        role: m.role,
        parts: [{ text: m.text }]
    }));
};

export const sendMessageToGemini = async (
    message: string, 
    userId: string,
    history: ChatMessage[]
): Promise<string> => {
    const user = storageService.getUserById(userId);
    if (!user || !user.preferences) throw new Error("USER_DATA_MISSING");

    return executeWithFallback(async (modelName) => {
        const ai = getAiClient();
        const systemInstruction = SYSTEM_PROMPT_TEMPLATE(user, user.preferences!);

        const response = await ai.models.generateContent({
            model: modelName,
            contents: [...sanitizeHistory(history), { role: 'user', parts: [{ text: message }] }],
            config: {
                systemInstruction,
                temperature: 0.7,
                maxOutputTokens: 2048
            }
        });

        storageService.deductCreditOrUsage(userId);
        return response.text || "...";
    });
};

export const generateVoiceChatResponse = async (
    message: string, 
    userId: string, 
    history: ChatMessage[]
): Promise<string> => {
    const user = storageService.getUserById(userId);
    if (!user || !user.preferences) throw new Error("USER_DATA_MISSING");

    // Pour le vocal, on privilégie le modèle le plus rapide (Flash Lite)
    const voicePool = ['gemini-flash-lite-latest', 'gemini-1.5-flash', 'gemini-3-flash-preview'];

    return executeWithFallback(async (modelName) => {
        const ai = getAiClient();
        const systemInstruction = `
            ACT: A very fast and natural language tutor on a phone call. 
            USER: ${user.username}. TARGET: ${user.preferences!.targetLanguage}. LEVEL: ${user.preferences!.level}.
            GOAL: Short, conversational response (1-2 sentences). 
            RULES: No markdown. No complex structures. Correct big mistakes naturally. 
            TONE: Friendly, helpful, native-like.
        `;

        const response = await ai.models.generateContent({
            model: modelName,
            contents: [...sanitizeHistory(history, 6), { role: 'user', parts: [{ text: message }] }],
            config: {
                systemInstruction,
                temperature: 0.6,
                maxOutputTokens: 150
            }
        });

        return response.text || "Je vous écoute.";
    }, voicePool);
};

export const generateSpeech = async (text: string, userId: string, voice?: VoiceName): Promise<Uint8Array | null> => {
    const user = storageService.getUserById(userId);
    const voiceToUse = voice || user?.preferences?.voiceName || 'Kore';
    
    const cleanText = text.replace(/[*#_`~]/g, '').trim();
    if (!cleanText) return null;

    try {
        const ai = getAiClient();
        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash-preview-tts',
            contents: [{ parts: [{ text: cleanText }] }],
            config: {
                responseModalities: [Modality.AUDIO],
                speechConfig: {
                    voiceConfig: {
                        prebuiltVoiceConfig: { voiceName: voiceToUse }
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
        return bytes;
    } catch (e) {
        console.error("TTS failed, check quota or API key", e);
        return null;
    }
};

export const startChatSession = async (profile: UserProfile, prefs: UserPreferences, history: ChatMessage[]) => null;

export const translateText = async (text: string, targetLang: string, userId: string): Promise<string> => {
    return executeWithFallback(async (modelName) => {
        const ai = getAiClient();
        const response = await ai.models.generateContent({
            model: modelName,
            contents: `Translate to ${targetLang}: "${text}"`,
        });
        storageService.deductCreditOrUsage(userId);
        return response.text?.trim() || text;
    });
};

export const generatePracticalExercises = async (user: UserProfile, history: ChatMessage[]): Promise<ExerciseItem[]> => {
    return executeWithFallback(async (modelName) => {
        const ai = getAiClient();
        const prompt = `Generate 5 structured exercises for ${user.preferences?.targetLanguage} level ${user.preferences?.level}. Return JSON array.`;
        const response = await ai.models.generateContent({
            model: modelName,
            contents: prompt,
            config: { responseMimeType: "application/json" }
        });
        storageService.deductCreditOrUsage(user.id);
        try {
            const json = JSON.parse(response.text || "[]");
            return json.map((ex: any, i: number) => ({ ...ex, id: `ex_${Date.now()}_${i}` }));
        } catch { return []; }
    });
};

export const generateConceptImage = async (prompt: string, userId: string): Promise<string | null> => {
    const ai = getAiClient();
    const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash-image',
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
    return executeWithFallback(async (modelName) => {
        const ai = getAiClient();
        const prompt = `Analyze language learning progress. Update student memory. Current memory: ${memory}. JSON: {newMemory, xpEarned, feedback}`;
        const response = await ai.models.generateContent({
            model: modelName,
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
    });
};

export const analyzeVoiceCallPerformance = async (history: ChatMessage[], userId: string): Promise<VoiceCallSummary> => {
    return executeWithFallback(async (modelName) => {
        const ai = getAiClient();
        const prompt = `Analyze this language practice call. JSON: {score, feedback, tip}`;
        const response = await ai.models.generateContent({
            model: modelName,
            contents: prompt,
            config: { responseMimeType: "application/json" }
        });
        try {
            const json = JSON.parse(response.text || "{}");
            return {
                score: Number(json.score) || 7,
                feedback: json.feedback || "Bonne conversation.",
                tip: json.tip || "Continuez à pratiquer !"
            };
        } catch {
            return { score: 7, feedback: "Bien joué !", tip: "Pratiquez régulièrement." };
        }
    });
};

export const generateRoleplayResponse = async (history: ChatMessage[], scenario: string, user: UserProfile, closing: boolean = false, init: boolean = false) => {
    return executeWithFallback(async (modelName) => {
        const ai = getAiClient();
        const prompt = closing ? `End of roleplay analysis. JSON: {aiReply, score, feedback}` : `Continue roleplay ${scenario}. JSON: {aiReply, correction, explanation}`;
        const response = await ai.models.generateContent({
            model: modelName,
            contents: [...sanitizeHistory(history), { role: 'user', parts: [{ text: prompt }] }],
            config: { responseMimeType: "application/json" }
        });
        try {
            return JSON.parse(response.text || "{}");
        } catch {
            return { aiReply: "..." };
        }
    });
};

export const generateDailyChallenges = async (prefs: UserPreferences): Promise<DailyChallenge[]> => {
    return executeWithFallback(async (modelName) => {
        const ai = getAiClient();
        const response = await ai.models.generateContent({
            model: modelName,
            contents: `Generate 3 short daily challenges for learning ${prefs.targetLanguage}. JSON array.`,
            config: { responseMimeType: "application/json" }
        });
        try {
            const json = JSON.parse(response.text || "[]");
            return json.map((c: any, i: number) => ({ ...c, id: `c_${Date.now()}_${i}`, currentCount: 0, isCompleted: false }));
        } catch { return []; }
    });
};
