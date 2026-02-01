
import { GoogleGenAI, Content, Modality } from "@google/genai";
import { UserProfile, UserPreferences, ChatMessage, DailyChallenge, ExerciseItem, VoiceCallSummary, VocabularyItem } from "../types";
import { SYSTEM_PROMPT_TEMPLATE } from "../constants";
import { storageService } from "./storageService";

let aiClient: GoogleGenAI | null = null;
let currentKeyIndex = 0;

// === MODEL CONFIGURATION ===
// Gemini 2.0 Flash is the most optimized for speed/quality/cost ratio currently
const PRIMARY_MODEL = 'gemini-2.0-flash'; 

const FALLBACK_CHAIN = [
    'gemini-2.0-flash-lite-preview-02-05', 
    'gemini-1.5-flash'
];

export interface RoleplayResponse {
    aiReply: string;
    correction?: string;
    score?: number;
    feedback?: string;
    explanation?: string;
}

const getAvailableKeys = (): string[] => {
    const settings = storageService.getSystemSettings();
    let keys = settings.apiKeys && settings.apiKeys.length > 0 ? settings.apiKeys : [];
    
    // @ts-ignore
    const envKey = import.meta.env.VITE_GOOGLE_API_KEY;
    if (envKey && !keys.includes(envKey)) {
        keys.push(envKey);
    }
    return Array.from(new Set(keys)).filter(k => k && k.trim().length > 0);
};

const initializeGenAI = (forceNextKey: boolean = false) => {
    const keys = getAvailableKeys();
    if (keys.length === 0) {
      console.error("CRITICAL: No API Keys available.");
      return null;
    }
    if (forceNextKey) {
        currentKeyIndex = (currentKeyIndex + 1) % keys.length;
    } else {
        currentKeyIndex = Math.floor(Math.random() * keys.length);
    }
    const apiKey = keys[currentKeyIndex];
    if (!apiKey) return null;
    aiClient = new GoogleGenAI({ apiKey });
    return getActiveModelName(); 
};

const getActiveModelName = () => {
    const settings = storageService.getSystemSettings();
    // Safety override: unstable preview models cause 404s/503s
    if (settings.activeModel === 'gemini-3-flash-preview') return PRIMARY_MODEL;
    return settings.activeModel || PRIMARY_MODEL;
};

// === ROBUST JSON PARSER ===
const safeJsonParse = (text: string | undefined, fallback: any) => {
    if (!text) return fallback;
    try {
        return JSON.parse(text);
    } catch (e) {
        try {
            let clean = text.replace(/```json/g, '').replace(/```/g, '');
            const firstOpen = clean.indexOf('{');
            const firstArray = clean.indexOf('[');
            const start = (firstOpen !== -1 && (firstArray === -1 || firstOpen < firstArray)) ? firstOpen : firstArray;
            const lastClose = clean.lastIndexOf('}');
            const lastArray = clean.lastIndexOf(']');
            const end = (lastClose !== -1 && (lastArray === -1 || lastClose > lastArray)) ? lastClose : lastArray;

            if (start !== -1 && end !== -1) {
                clean = clean.substring(start, end + 1);
                return JSON.parse(clean);
            }
            return fallback;
        } catch (e2) {
            console.error("JSON Parse Error", e2);
            return fallback;
        }
    }
};

const executeWithRetry = async <T>(
    operation: (modelName: string) => Promise<T>, 
    userId: string,
    attempt: number = 0,
    fallbackIndex: number = -1 
): Promise<T> => {
    try {
        let modelName = getActiveModelName();
        if (fallbackIndex >= 0 && fallbackIndex < FALLBACK_CHAIN.length) {
            modelName = FALLBACK_CHAIN[fallbackIndex];
        }
        
        if (!aiClient) initializeGenAI();
        if (!aiClient) throw new Error("API_KEY_MISSING");

        return await operation(modelName);
    } catch (error: any) {
        const msg = error.message || JSON.stringify(error);
        
        if (msg.includes("API_KEY_MISSING")) throw new Error("Configuration API manquante. Contactez l'admin.");

        const isQuotaError = msg.includes('429') || msg.includes('quota') || msg.includes('resource_exhausted');
        const isModelError = msg.includes('404') || msg.includes('not found') || msg.includes('models/');
        const keys = getAvailableKeys();

        if (isQuotaError || isModelError) {
            console.warn(`API Error (${isQuotaError ? 'Quota' : 'Model'}). Retrying...`);
            if (isQuotaError && attempt < keys.length) {
                initializeGenAI(true); 
                return executeWithRetry(operation, userId, attempt + 1, fallbackIndex);
            } 
            if (fallbackIndex < FALLBACK_CHAIN.length - 1) {
                initializeGenAI(true); 
                return executeWithRetry(operation, userId, 0, fallbackIndex + 1);
            }
        }
        throw error;
    }
};

const checkCreditsBeforeAction = (userId: string) => {
    const status = storageService.canPerformRequest(userId);
    if (!status.allowed) throw new Error("INSUFFICIENT_CREDITS");
    return true;
};

// === CONTEXT OPTIMIZATION ===
// We don't send the full history. We send the last 15 turns to save data and tokens.
const sanitizeHistory = (history: ChatMessage[]) => {
    const recentHistory = history.slice(-15); // Keep context relevant
    const cleanHistory = [...recentHistory];
    
    // Gemini 2.0 strict rule: Must alternate User/Model and start with User
    while (cleanHistory.length > 0 && cleanHistory[0].role !== 'user') {
        cleanHistory.shift();
    }
    return cleanHistory.map(m => ({ role: m.role, parts: [{ text: m.text }] }));
};

export const startChatSession = async (
    profile?: UserProfile,
    prefs?: UserPreferences,
    history?: ChatMessage[]
) => {
  initializeGenAI(); 
  return null; 
};

// === STREAMING IMPLEMENTATION ===
export const sendMessageToGeminiStream = async (
    message: string, 
    userId: string,
    previousHistory: ChatMessage[], 
    onChunk: (text: string) => void
): Promise<{ fullText: string }> => {
    checkCreditsBeforeAction(userId);
    
    return executeWithRetry(async (modelName) => {
        if (!aiClient) initializeGenAI();
        const user = storageService.getUserById(userId);
        if (!user || !user.preferences) throw new Error("User data missing");
        
        const systemInstruction = SYSTEM_PROMPT_TEMPLATE(user, user.preferences);
        const historyPayload = sanitizeHistory(previousHistory);

        const chat = aiClient!.chats.create({
            model: modelName,
            config: {
                systemInstruction: systemInstruction,
                temperature: 0.7, 
                maxOutputTokens: 1000, // Limit output for speed
            },
            history: historyPayload,
        });

        try {
            const result = await chat.sendMessageStream({ message });
            let fullText = '';
            for await (const chunk of result) {
                const text = chunk.text;
                if (text) {
                    fullText += text;
                    onChunk(text);
                }
            }
            storageService.deductCreditOrUsage(userId);
            return { fullText };
        } catch (streamError) {
            console.warn("Stream failed, falling back to standard request", streamError);
            // Fallback to non-streaming if stream dies (Network blip)
            const result = await chat.sendMessage({ message });
            const text = result.text || "Désolé, erreur de connexion.";
            onChunk(text); // Send full text as one chunk
            storageService.deductCreditOrUsage(userId);
            return { fullText: text };
        }
    }, userId);
};

export const generateVoiceChatResponse = async (
    message: string, 
    userId: string, 
    history: ChatMessage[]
): Promise<string> => {
    const status = storageService.canPerformRequest(userId);
    if (!status.allowed) throw new Error("INSUFFICIENT_CREDITS");

    return executeWithRetry(async (modelName) => {
        const user = storageService.getUserById(userId);
        if (!user || !user.preferences) throw new Error("User data missing");

        const systemInstruction = `
            ACT: Friendly language tutor.
            USER: ${user.username}. TARGET: ${user.preferences.targetLanguage}.
            RULES: Short spoken response. Natural. Max 2 sentences.
        `;
        const historyParts = sanitizeHistory(history);
        const chat = aiClient!.chats.create({
            model: modelName,
            config: { systemInstruction, temperature: 0.6, maxOutputTokens: 150 },
            history: historyParts as Content[],
        });
        const result = await chat.sendMessage({ message });
        return result.text || "Je vous écoute.";
    }, userId);
};

export const analyzeVoiceCallPerformance = async (history: ChatMessage[], userId: string): Promise<VoiceCallSummary> => {
    return executeWithRetry(async (modelName) => {
        const prompt = `Analyze conversation. Return JSON: { "score": number(1-10), "feedback": "string", "tip": "string" }`;
        const response = await aiClient!.models.generateContent({
            model: modelName,
            contents: prompt,
            config: { responseMimeType: "application/json" }
        });
        return safeJsonParse(response.text, { score: 7, feedback: "Bonne pratique.", tip: "Continuez !" });
    }, userId);
};

export const translateText = async (text: string, targetLang: string, userId: string): Promise<string> => {
    checkCreditsBeforeAction(userId);
    return executeWithRetry(async (modelName) => {
        const prompt = `Translate to ${targetLang}: "${text}"`;
        const response = await aiClient!.models.generateContent({ model: modelName, contents: prompt });
        storageService.deductCreditOrUsage(userId);
        return response.text?.trim() || text;
    }, userId);
};

export const getLessonSummary = async (lessonNumber: number, context: string, userId: string): Promise<string> => {
    checkCreditsBeforeAction(userId);
    return executeWithRetry(async (modelName) => {
        const prompt = `Summarize Lesson ${lessonNumber}. Context: ${context}. Markdown format.`;
        const response = await aiClient!.models.generateContent({ model: modelName, contents: prompt });
        storageService.deductCreditOrUsage(userId);
        return response.text || "Erreur résumé.";
    }, userId);
};

export const generateSpeech = async (text: string, userId: string, voiceName: string = 'Kore'): Promise<ArrayBuffer | null> => {
    // Only check credits, don't deduct for simple TTS to improve UX, or handle deduct internally
    // const status = storageService.canPerformRequest(userId);
    // if (!status.allowed) throw new Error("INSUFFICIENT_CREDITS");
    
    return executeWithRetry(async (modelName) => {
        if (!text || !text.trim()) return null;
        // Use specialized TTS model
        const response = await aiClient!.models.generateContent({
            model: "gemini-2.5-flash-preview-tts",
            contents: [{ parts: [{ text: `Read: ${text.substring(0, 4000)}` }] }],
            config: { responseModalities: [Modality.AUDIO], speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName } } } },
        });
        const base64 = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
        if (!base64) return null;
        const binaryString = atob(base64);
        const len = binaryString.length;
        const bytes = new Uint8Array(len);
        for (let i = 0; i < len; i++) bytes[i] = binaryString.charCodeAt(i);
        return bytes.buffer;
    }, userId);
};

export const generateConceptImage = async (prompt: string, userId: string): Promise<string | null> => {
    checkCreditsBeforeAction(userId);
    return executeWithRetry(async () => {
        const response = await aiClient!.models.generateContent({
            model: 'gemini-2.5-flash-image',
            contents: { parts: [{ text: prompt }] },
            config: { imageConfig: { aspectRatio: "16:9" } } as any
        });
        storageService.deductCreditOrUsage(userId);
        
        const part = response.candidates?.[0]?.content?.parts?.find(p => p.inlineData);
        if (part?.inlineData?.data) {
             return `data:${part.inlineData.mimeType || 'image/png'};base64,${part.inlineData.data}`;
        }
        return null;
    }, userId);
};

export const generateDailyChallenges = async (prefs: UserPreferences): Promise<DailyChallenge[]> => {
    return executeWithRetry(async (modelName) => {
        const prompt = `Generate 3 daily challenges for ${prefs.targetLanguage} level ${prefs.level}. JSON Array.`;
        const response = await aiClient!.models.generateContent({ model: modelName, contents: prompt, config: { responseMimeType: "application/json" } });
        const json = safeJsonParse(response.text, []);
        return json.map((item: any, i: number) => ({
            id: `daily_${Date.now()}_${i}`,
            description: item.description || "Pratiquer 5 min",
            type: item.type || "message_count",
            targetCount: item.targetCount || 5,
            currentCount: 0,
            xpReward: item.xpReward || 50,
            isCompleted: false
        }));
    }, 'system'); 
};

export const analyzeUserProgress = async (history: ChatMessage[], currentMemory: string, userId: string): Promise<{ newMemory: string; xpEarned: number; feedback: string }> => {
    const status = storageService.canPerformRequest(userId);
    if (!status.allowed) return { newMemory: currentMemory, xpEarned: 10, feedback: "Bonne session (Crédits épuisés)." };
    return executeWithRetry(async (modelName) => {
        const prompt = `Analyze session. Update memory. JSON: {newMemory, xpEarned, feedback}`;
        const response = await aiClient!.models.generateContent({ model: modelName, contents: prompt, config: { responseMimeType: "application/json" } });
        storageService.deductCreditOrUsage(userId);
        const json = safeJsonParse(response.text, {});
        return { newMemory: json.newMemory || currentMemory, xpEarned: json.xpEarned || 15, feedback: json.feedback || "Bien joué !" };
    }, userId);
};

export const generatePracticalExercises = async (profile: UserProfile, history: ChatMessage[]): Promise<ExerciseItem[]> => {
  checkCreditsBeforeAction(profile.id);
  return executeWithRetry(async (modelName) => {
      const prompt = `Generate 5 exercises for ${profile.preferences?.targetLanguage}. JSON array.`;
      const response = await aiClient!.models.generateContent({ model: modelName, contents: prompt, config: { responseMimeType: "application/json" } });
      storageService.deductCreditOrUsage(profile.id);
      const json = safeJsonParse(response.text, []);
      return json.map((item: any, idx: number) => ({ ...item, id: `ex_${Date.now()}_${idx}` }));
  }, profile.id);
};

export const generateRoleplayResponse = async (history: ChatMessage[], scenario: string, userProfile: UserProfile, isClosing: boolean = false, isInit: boolean = false): Promise<RoleplayResponse> => {
    if (!isInit) {
        const status = storageService.canPerformRequest(userProfile.id);
        if (!status.allowed) throw new Error("INSUFFICIENT_CREDITS");
    }
    return executeWithRetry(async (modelName) => {
        const context = history.map(m => `${m.role}: ${m.text}`).join('\n');
        const prompt = isInit ? `Start roleplay ${scenario}. JSON: {aiReply}` : `Roleplay ${scenario}. History: ${context}. JSON: {aiReply, correction}`;
        const response = await aiClient!.models.generateContent({ model: modelName, contents: prompt, config: { responseMimeType: "application/json" } });
        return safeJsonParse(response.text, { aiReply: "..." });
    }, userProfile.id);
};

export const generateLanguageFlag = async (name: string) => { 
    return executeWithRetry(async (modelName) => {
        const response = await aiClient!.models.generateContent({ model: modelName, contents: `Flag emoji for ${name}. JSON {flag, code}`, config: { responseMimeType: "application/json" } });
        return safeJsonParse(response.text, { code: name, flag: "🏳️" });
    }, 'system');
};

export const generateLevelExample = async (targetLang: string, level: string): Promise<string> => {
    return executeWithRetry(async (modelName) => {
        const response = await aiClient!.models.generateContent({ model: modelName, contents: `Sentence in ${targetLang} level ${level}.` });
        return response.text?.trim() || "";
    }, 'system');
};

export const generateVocabularyFromHistory = async (userId: string, history: ChatMessage[]): Promise<VocabularyItem[]> => {
    const status = storageService.canPerformRequest(userId);
    if (!status.allowed) throw new Error("INSUFFICIENT_CREDITS");

    return executeWithRetry(async (modelName) => {
        const user = storageService.getUserById(userId);
        const explanationLang = user?.preferences?.explanationLanguage || "Français";

        const prompt = `
            Analyze conversation. Extract 5 key vocabulary words used.
            Output ONLY valid JSON array:
            [
                { "word": "word in target lang", "translation": "translation in ${explanationLang}", "context": "short context" }
            ]
        `;

        const response = await aiClient!.models.generateContent({
            model: modelName,
            contents: prompt,
            config: { responseMimeType: "application/json" }
        });

        storageService.deductCreditOrUsage(userId);

        const json = safeJsonParse(response.text, []);
        return json.map((item: any, index: number) => ({
            id: `auto_${Date.now()}_${index}`,
            word: item.word || "Mot",
            translation: item.translation || "?",
            context: item.context || "",
            mastered: false,
            addedAt: Date.now()
        }));
    }, userId);
};
