import { GoogleGenAI, Modality, Type } from "@google/genai";
import { UserProfile, UserPreferences, ChatMessage, DailyChallenge, ExerciseItem, VoiceCallSummary, VoiceName } from "../types";
import { SYSTEM_PROMPT_TEMPLATE } from "../constants";
import { storageService } from "./storageService";

// Modèles par ordre de priorité pour la stabilité
const TEXT_MODELS = [
    'gemini-3-flash-preview',
    'gemini-flash-lite-latest',
    'gemini-1.5-flash'
];

// Comment: Utility to get a random API key from process.env.API_KEY string (comma-separated support)
const getApiKey = (): string => {
    const rawKey = process.env.API_KEY || "";
    const keys = rawKey.split(',').map((k: string) => k.trim()).filter((k: string) => k.length > 5);
    if (keys.length === 0) throw new Error("API_KEY_MISSING");
    return keys[Math.floor(Math.random() * keys.length)];
};

// Comment: Initialization of GoogleGenAI client with API key from environment
const getAiClient = () => new GoogleGenAI({ apiKey: getApiKey() });

// Comment: Retry logic with fallback to slower/cheaper models on quota limits
async function executeWithFallback<T>(operation: (modelName: string) => Promise<T>, pool: string[] = TEXT_MODELS): Promise<T> {
    let lastError: any;
    for (const modelName of pool) {
        try {
            return await operation(modelName);
        } catch (error: any) {
            lastError = error;
            if (error.message?.includes('429') || error.message?.includes('quota')) {
                console.warn(`Quota atteint pour ${modelName}, basculement...`);
                continue;
            }
            throw error;
        }
    }
    throw lastError;
}

// Comment: Main chat logic for structured lessons and free talk
export const sendMessageToGemini = async (message: string, userId: string, history: ChatMessage[]): Promise<string> => {
    const user = storageService.getUserById(userId);
    if (!user) throw new Error("USER_NOT_FOUND");
    return executeWithFallback(async (model) => {
        const ai = getAiClient();
        const response = await ai.models.generateContent({
            model,
            contents: [
                ...history.slice(-10).map(m => ({ role: m.role, parts: [{ text: m.text }] })),
                { role: 'user', parts: [{ text: message }] }
            ],
            config: { 
                systemInstruction: SYSTEM_PROMPT_TEMPLATE(user, user.preferences!), 
                temperature: 0.7 
            }
        });
        storageService.deductCreditOrUsage(userId);
        return response.text || "...";
    });
};

// Comment: Optimized response for voice calls (short and natural)
export const generateVoiceChatResponse = async (message: string, userId: string, history: ChatMessage[]): Promise<string> => {
    const user = storageService.getUserById(userId);
    if (!user) throw new Error("USER_NOT_FOUND");
    
    return executeWithFallback(async (model) => {
        const ai = getAiClient();
        const response = await ai.models.generateContent({
            model: 'gemini-flash-lite-latest',
            contents: [
                ...history.slice(-6).map(m => ({ role: m.role, parts: [{ text: m.text }] })),
                { role: 'user', parts: [{ text: message }] }
            ],
            config: {
                systemInstruction: `Tu es TeacherMada en APPEL VOCAL. 
                RÈGLES : 
                1. Réponds très court (1-2 phrases max). 
                2. Pas de listes, pas de markdown. 
                3. Sois très naturel, comme un humain au téléphone. 
                4. Corrige les fautes de l'élève oralement.
                Langue cible: ${user.preferences?.targetLanguage}. Niveau: ${user.preferences?.level}.`,
                maxOutputTokens: 150,
                temperature: 0.6
            }
        });
        return response.text || "D'accord, je vous écoute.";
    }, ['gemini-flash-lite-latest', 'gemini-1.5-flash']);
};

// Comment: Generate speech bytes using the dedicated TTS model
export const generateSpeech = async (text: string, userId: string, voice?: VoiceName): Promise<Uint8Array | null> => {
    try {
        const ai = getAiClient();
        const user = storageService.getUserById(userId);
        const voiceToUse = voice || user?.preferences?.voiceName || 'Kore';
        
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
        console.error("TTS Error:", e);
        return null;
    }
};

// Comment: Basic text translation service
export const translateText = async (text: string, targetLang: string, userId: string): Promise<string> => {
    const ai = getAiClient();
    const res = await ai.models.generateContent({
        model: 'gemini-1.5-flash',
        contents: `Translate to ${targetLang}: "${text}"`,
    });
    return res.text?.trim() || text;
};

// Comment: Analyze user oral performance and provide a score
export const analyzeVoiceCallPerformance = async (history: ChatMessage[], userId: string): Promise<VoiceCallSummary> => {
    const ai = getAiClient();
    const prompt = `Analyse cette conversation orale. Donne une note sur 10 et un conseil. 
    Format JSON: { "score": number, "feedback": "string", "tip": "string" }.
    Conversation: ${JSON.stringify(history.slice(-10))}`;
    const res = await ai.models.generateContent({
        model: 'gemini-1.5-flash',
        contents: prompt,
        config: { responseMimeType: "application/json" }
    });
    try {
        return JSON.parse(res.text || '{"score":7, "feedback":"Bon travail", "tip":"Continuez !"}');
    } catch {
        return { score: 7, feedback: "Bonne conversation.", tip: "Pratiquez encore !" };
    }
};

// Comment: Interface definition for structured roleplay responses
export interface RoleplayResponse {
    aiReply: string;
    correction?: string;
    score?: number;
    feedback?: string;
    explanation?: string;
}

// Comment: Implementation of roleplay logic using structured JSON output to fix errors in DialogueSession.tsx
export const generateRoleplayResponse = async (
    history: ChatMessage[],
    scenario: string,
    user: UserProfile,
    closing: boolean = false,
    init: boolean = false
): Promise<RoleplayResponse> => {
    return executeWithFallback(async (model) => {
        const ai = getAiClient();
        
        let prompt = "";
        if (init) {
            prompt = `Tu es un partenaire de langue. Scénario: ${scenario}. Commence la conversation de manière naturelle dans la langue cible (${user.preferences?.targetLanguage}). Niveau: ${user.preferences?.level}.`;
        } else if (closing) {
            prompt = `Analyse cette conversation de jeu de rôle : ${JSON.stringify(history.slice(-10))}. Donne un score sur 20 et un feedback constructif en ${user.preferences?.explanationLanguage}.`;
        } else {
            prompt = `Tu es un partenaire de langue dans ce scénario: ${scenario}. Réponds à l'utilisateur de manière naturelle. 
            Langue cible: ${user.preferences?.targetLanguage}. Niveau: ${user.preferences?.level}. 
            Si l'utilisateur fait une erreur notable, fournis une correction et une brève explication dans sa langue d'explication (${user.preferences?.explanationLanguage}).
            Historique récent: ${JSON.stringify(history.slice(-6))}`;
        }

        const response = await ai.models.generateContent({
            model,
            contents: prompt,
            config: {
                responseMimeType: "application/json",
                responseSchema: {
                    type: Type.OBJECT,
                    properties: {
                        aiReply: { type: Type.STRING },
                        correction: { type: Type.STRING },
                        explanation: { type: Type.STRING },
                        score: { type: Type.NUMBER },
                        feedback: { type: Type.STRING },
                    },
                    required: ["aiReply"],
                }
            }
        });

        try {
            return JSON.parse(response.text || "{}") as RoleplayResponse;
        } catch (e) {
            return { aiReply: response.text || "..." };
        }
    });
};

// Comment: Generate context-aware practical exercises for the user
export const generatePracticalExercises = async (user: UserProfile, history: ChatMessage[]): Promise<ExerciseItem[]> => {
    return executeWithFallback(async (model) => {
        const ai = getAiClient();
        const prompt = `Génère 5 exercices pratiques (${user.preferences?.targetLanguage}, Niveau ${user.preferences?.level}). JSON array format.`;
        const res = await ai.models.generateContent({
            model,
            contents: prompt,
            config: {
                responseMimeType: "application/json",
                responseSchema: {
                    type: Type.ARRAY,
                    items: {
                        type: Type.OBJECT,
                        properties: {
                            type: { type: Type.STRING, description: "multiple_choice, true_false, fill_blank" },
                            question: { type: Type.STRING },
                            options: { type: Type.ARRAY, items: { type: Type.STRING } },
                            correctAnswer: { type: Type.STRING },
                            explanation: { type: Type.STRING },
                        },
                        required: ["type", "question", "correctAnswer", "explanation"]
                    }
                }
            }
        });
        const exercises = JSON.parse(res.text || "[]");
        return exercises.map((ex: any, i: number) => ({ ...ex, id: `ex-${Date.now()}-${i}` }));
    });
};

// Comment: Analyze session history to update AI memory and grant XP
export const analyzeUserProgress = async (history: ChatMessage[], memory: string, userId: string) => {
    return executeWithFallback(async (model) => {
        const ai = getAiClient();
        const prompt = `Analyse les progrès. Chat: ${JSON.stringify(history)}. Mémoire actuelle: ${memory}. Retourne JSON {newMemory, xpEarned, feedback}.`;
        const res = await ai.models.generateContent({
            model,
            contents: prompt,
            config: { responseMimeType: "application/json" }
        });
        const data = JSON.parse(res.text || "{}");
        return {
            newMemory: data.newMemory || memory,
            xpEarned: data.xpEarned || 10,
            feedback: data.feedback || "Continue ainsi !"
        };
    });
};

// Comment: Create dynamic daily challenges based on user preferences
export const generateDailyChallenges = async (prefs: UserPreferences): Promise<DailyChallenge[]> => {
    return executeWithFallback(async (model) => {
        const ai = getAiClient();
        const prompt = `Génère 3 défis quotidiens pour apprendre ${prefs.targetLanguage}. JSON array format.`;
        const res = await ai.models.generateContent({
            model,
            contents: prompt,
            config: { responseMimeType: "application/json" }
        });
        const data = JSON.parse(res.text || "[]");
        return data.map((d: any, i: number) => ({
            id: `d-${Date.now()}-${i}`,
            description: d.description,
            targetCount: d.targetCount || 3,
            currentCount: 0,
            xpReward: d.xpReward || 50,
            isCompleted: false,
            type: d.type || 'message_count'
        }));
    });
};

// Comment: Use Gemini Flash Image model to generate educational concept illustrations
export const generateConceptImage = async (prompt: string, userId: string): Promise<string | null> => {
    return executeWithFallback(async (model) => {
        const ai = getAiClient();
        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash-image',
            contents: prompt,
        });
        for (const part of response.candidates?.[0]?.content?.parts || []) {
            if (part.inlineData) {
                return `data:${part.inlineData.mimeType};base64,${part.inlineData.data}`;
            }
        }
        return null;
    }, ['gemini-2.5-flash-image']);
};

// Comment: Empty placeholder for session start synchronization
export const startChatSession = async (p: any, pr: any, h: any) => null;

// Comment: Generate a markdown summary of the current lesson
export const getLessonSummary = async (lessonNum: number, context: string, userId: string): Promise<string> => {
    return executeWithFallback(async (model) => {
        const ai = getAiClient();
        const prompt = `Fais un résumé structuré de la leçon ${lessonNum}. Contexte: ${context}`;
        const res = await ai.models.generateContent({ model, contents: prompt });
        return res.text || "Résumé indisponible.";
    });
};
