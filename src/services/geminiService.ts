
import { GoogleGenAI, Chat, Content, Type, Modality } from "@google/genai";
import { UserProfile, UserPreferences, ChatMessage, DailyChallenge, ExerciseItem, ExplanationLanguage, VoiceCallSummary, VocabularyItem } from "../types";
import { SYSTEM_PROMPT_TEMPLATE } from "../constants";
import { storageService } from "./storageService";

let aiClient: GoogleGenAI | null = null;
let currentKeyIndex = 0;

// === MODEL CONFIGURATION ===
const PRIMARY_MODEL = 'gemini-1.5-flash'; 

const FALLBACK_CHAIN = [
    'gemini-1.5-pro',              
    'gemini-2.0-flash-lite-preview', 
    'gemini-1.5-flash-8b'               
];

const getAvailableKeys = (): string[] => {
    const settings = storageService.getSystemSettings();
    let keys = settings.apiKeys && settings.apiKeys.length > 0 ? settings.apiKeys : [];
    // @ts-ignore
    const envKey = import.meta.env.VITE_GOOGLE_API_KEY;
    if (envKey && typeof envKey === 'string' && !keys.includes(envKey)) {
        keys.push(envKey);
    }
    return Array.from(new Set(keys)).filter(k => k && k.trim().length > 0);
};

const initializeGenAI = (forceNextKey: boolean = false) => {
    const keys = getAvailableKeys();
    if (keys.length === 0) {
      console.error("CRITICAL: No API Keys available");
      return null;
    }
    if (forceNextKey) {
        currentKeyIndex = (currentKeyIndex + 1) % keys.length;
    } else {
        currentKeyIndex = Math.floor(Math.random() * keys.length);
    }
    const apiKey = keys[currentKeyIndex];
    aiClient = new GoogleGenAI({ apiKey });
    return getActiveModelName(); 
};

const getActiveModelName = () => {
    const settings = storageService.getSystemSettings();
    return settings.activeModel && settings.activeModel.length > 0 ? settings.activeModel : PRIMARY_MODEL;
};

// === ROBUST HISTORY SANITIZER ===
// Ensures strict User -> Model -> User alternation.
const sanitizeHistory = (history: ChatMessage[]): Content[] => {
    const validHistory: Content[] = [];
    if (!history || history.length === 0) return [];

    let lastRole = '';

    for (const msg of history) {
        if (msg.role !== 'user' && msg.role !== 'model') continue;

        if (msg.role === lastRole) {
            // MERGE strategy
            const lastEntry = validHistory[validHistory.length - 1];
            if (lastEntry && lastEntry.parts) {
                // @ts-ignore
                lastEntry.parts[0].text += "\n" + msg.text;
            }
        } else {
            // New turn
            validHistory.push({
                role: msg.role,
                parts: [{ text: msg.text }]
            });
            lastRole = msg.role;
        }
    }
    
    // Gemini API requires the history to end with 'model' if we are about to send a 'user' message.
    if (validHistory.length > 0 && validHistory[validHistory.length - 1].role === 'user') {
        validHistory.pop();
    }

    return validHistory;
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
        return await operation(modelName);
    } catch (error: any) {
        const errorMsg = error.message?.toLowerCase() || '';
        
        if (errorMsg.includes('turn') || errorMsg.includes('conversation') || errorMsg.includes('400')) {
             console.warn("⚠️ History Sync Error. Retrying operation without history context.");
        }

        const isQuotaError = errorMsg.includes('429') || errorMsg.includes('quota') || errorMsg.includes('resource_exhausted');
        const isServerBusy = errorMsg.includes('503') || errorMsg.includes('overloaded');
        const keys = getAvailableKeys();

        if (isQuotaError || isServerBusy) {
            if (attempt < keys.length - 1) {
                initializeGenAI(true); 
                return executeWithRetry(operation, userId, attempt + 1, fallbackIndex);
            } 
            if (fallbackIndex < FALLBACK_CHAIN.length - 1) {
                initializeGenAI(true); 
                return executeWithRetry(operation, userId, 0, fallbackIndex + 1);
            }
        }
        
        console.error("❌ AI Service Failure:", error);
        throw new Error("Service IA momentanément indisponible.");
    }
};

const checkCreditsBeforeAction = (userId: string) => {
    const status = storageService.canPerformRequest(userId);
    if (!status.allowed) throw new Error("INSUFFICIENT_CREDITS");
    return true;
};

// --- EXPORTED FUNCTIONS ---

export const startChatSession = async (profile: UserProfile, prefs: UserPreferences, history: ChatMessage[] = []) => {
  initializeGenAI(); 
  return null; 
};

export const sendMessageToGeminiStream = async (
    message: string, 
    userId: string,
    previousHistory: ChatMessage[], 
    onChunk: (text: string) => void
): Promise<string> => {
    checkCreditsBeforeAction(userId);

    const runStream = async (historyToUse: ChatMessage[]) => {
        return executeWithRetry(async (modelName) => {
            if (!aiClient) initializeGenAI();
            if (!aiClient) throw new Error("AI not init");

            const user = storageService.getUserById(userId);
            if (!user || !user.preferences) throw new Error("User data missing");
            
            const systemInstruction = SYSTEM_PROMPT_TEMPLATE(user, user.preferences);
            const historyPayload = sanitizeHistory(historyToUse).slice(-12); // Context window

            const chat = aiClient.chats.create({
                model: modelName,
                config: {
                    systemInstruction: systemInstruction,
                    temperature: 0.7, 
                    maxOutputTokens: 1500,
                },
                history: historyPayload,
            });

            const result = await chat.sendMessageStream({ message });
            
            let fullText = '';
            for await (const chunk of result) {
                const text = chunk.text;
                if (text) {
                    fullText += text;
                    onChunk(text);
                }
            }
            return fullText;
        }, userId);
    };

    try {
        const text = await runStream(previousHistory);
        storageService.deductCreditOrUsage(userId);
        return text;
    } catch (e: any) {
        if (e.message?.includes('turn') || e.message?.includes('conversation')) {
            console.log("🔄 Auto-recovering chat with empty context...");
            const text = await runStream([]);
            storageService.deductCreditOrUsage(userId);
            return text;
        }
        throw e;
    }
};

export const sendMessageToGemini = async (message: string, userId: string): Promise<string> => {
  let fullText = '';
  // @ts-ignore
  await sendMessageToGeminiStream(message, userId, [], (chunk) => fullText += chunk);
  return fullText;
};

// === OPTIMIZED VOICE CHAT ===
export const generateVoiceChatResponse = async (message: string, userId: string, previousHistory: ChatMessage[]) => {
    checkCreditsBeforeAction(userId);
    
    const VOICE_MODEL = 'gemini-1.5-flash';

    const runVoice = async (historyToUse: ChatMessage[]) => {
        return executeWithRetry(async () => {
            if (!aiClient) initializeGenAI();
            if (!aiClient) throw new Error("AI not init");

            const user = storageService.getUserById(userId);
            
            // Ultra-concise system prompt for speed
            const systemInstruction = `
                ACT: Phone Tutor.
                USER: ${user?.username}.
                LANG: ${user?.preferences?.targetLanguage}.
                RULES:
                1. Answer in 1 short sentence (Max 15 words).
                2. Be natural. No emojis.
                3. If user says hello, just greet back.
            `;

            const historyPayload = sanitizeHistory(historyToUse).slice(-6);

            const chat = aiClient.chats.create({
                model: VOICE_MODEL,
                config: {
                    systemInstruction: systemInstruction,
                    temperature: 0.6, 
                    maxOutputTokens: 50, 
                },
                history: historyPayload,
            });

            const result = await chat.sendMessage({ message });
            return result.text || "Je vous écoute.";
        }, userId);
    };

    try {
        return await runVoice(previousHistory);
    } catch (e: any) {
        if (e.message?.includes('turn')) {
            return await runVoice([]);
        }
        return "Désolé, je n'ai pas compris.";
    }
};

export const generateSpeech = async (text: string, userId: string, voiceName: string = 'Kore'): Promise<ArrayBuffer | null> => {
    const status = storageService.canPerformRequest(userId);
    if (!status.allowed) return null; 
    
    return executeWithRetry(async (modelName) => {
        if (!aiClient) initializeGenAI(); 
        if (!aiClient) return null;

        if (!text || !text.trim()) return null;
        const safeText = text.replace(/[*#_`~]/g, '').substring(0, 500);

        const response = await aiClient.models.generateContent({
            model: "gemini-2.5-flash-preview-tts",
            contents: [{ parts: [{ text: safeText }] }],
            config: {
                responseModalities: [Modality.AUDIO],
                speechConfig: {
                    voiceConfig: { prebuiltVoiceConfig: { voiceName } },
                },
            },
        });

        const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
        if (!base64Audio) return null;

        const binaryString = atob(base64Audio);
        const len = binaryString.length;
        const bytes = new Uint8Array(len);
        for (let i = 0; i < len; i++) {
            bytes[i] = binaryString.charCodeAt(i);
        }
        return bytes.buffer;
    }, userId);
};

export const generateVocabularyFromHistory = async (userId: string, history: ChatMessage[]) => {
    return executeWithRetry(async (modelName) => {
        if (!aiClient) initializeGenAI();
        const conversation = history.slice(-10).map(m => m.text).join('\n');
        const prompt = `Extract 5 key vocabulary words. Return JSON: [{ "word": "string", "translation": "string", "context": "string" }]`;
        const response = await aiClient!.models.generateContent({ 
            model: modelName, 
            contents: prompt, 
            config: { responseMimeType: "application/json" } 
        });
        storageService.deductCreditOrUsage(userId);
        const json = JSON.parse(response.text || "[]");
        return json.map((item: any, idx: number) => ({ ...item, id: `vocab_${Date.now()}_${idx}`, mastered: false, addedAt: Date.now() }));
    }, userId);
};

export const translateText = async (text: string, targetLang: string, userId: string) => {
    return executeWithRetry(async (modelName) => {
        if (!aiClient) initializeGenAI();
        const response = await aiClient!.models.generateContent({
            model: modelName,
            contents: `Translate to ${targetLang}: ${text}`,
        });
        storageService.deductCreditOrUsage(userId);
        return response.text?.trim() || text;
    }, userId);
};

export const generateLanguageFlag = async (languageName: string) => {
    return executeWithRetry(async (modelName) => {
        if (!aiClient) initializeGenAI();
        const response = await aiClient!.models.generateContent({
            model: modelName,
            contents: `Generate standard name and flag emoji for '${languageName}'. JSON: { "code": "Name + Flag", "flag": "FlagOnly" }`,
            config: { responseMimeType: "application/json" }
        });
        return JSON.parse(response.text || '{"code": "Inconnu", "flag": "❓"}');
    }, 'system');
};

export const getLessonSummary = async (lessonNumber: number, context: string, userId: string) => {
    return executeWithRetry(async (modelName) => {
        if (!aiClient) initializeGenAI();
        const response = await aiClient!.models.generateContent({
            model: modelName,
            contents: `Résumé LEÇON ${lessonNumber}. Contexte: ${context}. Markdown.`,
        });
        storageService.deductCreditOrUsage(userId);
        return response.text || "Erreur.";
    }, userId);
};

export const generateConceptImage = async (prompt: string, userId: string) => {
    checkCreditsBeforeAction(userId);
    return executeWithRetry(async () => {
        if (!aiClient) initializeGenAI();
        const response = await aiClient!.models.generateContent({
            model: 'gemini-2.5-flash-image',
            contents: { parts: [{ text: prompt }] },
            config: { imageConfig: { aspectRatio: "16:9" } } as any
        });
        storageService.deductCreditOrUsage(userId);
        if (response.candidates?.[0]?.content?.parts) {
            for (const part of response.candidates[0].content.parts) {
                if (part.inlineData?.data) return `data:${part.inlineData.mimeType || 'image/png'};base64,${part.inlineData.data}`;
            }
        }
        return null;
    }, userId);
};

export const analyzeVoiceCallPerformance = async (history: ChatMessage[], userId: string): Promise<VoiceCallSummary> => {
    return executeWithRetry(async (modelName) => {
        if (!aiClient) initializeGenAI();
        const prompt = `Analyze conversation. Return JSON: { "score": number(1-10), "feedback": "string", "tip": "string" }`;
        const response = await aiClient!.models.generateContent({
            model: modelName,
            contents: prompt,
            config: { responseMimeType: "application/json" }
        });
        return JSON.parse(response.text || '{"score": 5, "feedback": "Erreur", "tip": "..."}');
    }, userId);
};

export const generatePracticalExercises = async (profile: UserProfile, history: ChatMessage[]): Promise<ExerciseItem[]> => {
    checkCreditsBeforeAction(profile.id);
    return executeWithRetry(async (modelName) => {
        if (!aiClient) initializeGenAI();
        const response = await aiClient!.models.generateContent({
            model: modelName,
            contents: `Generate 5 language exercises. JSON Array.`,
            config: { responseMimeType: "application/json" }
        });
        storageService.deductCreditOrUsage(profile.id);
        const json = JSON.parse(response.text || "[]");
        return json.map((item: any, idx: number) => ({ ...item, id: `ex_${Date.now()}_${idx}` }));
    }, profile.id);
};

export const generateDailyChallenges = async (prefs: UserPreferences): Promise<DailyChallenge[]> => {
    return executeWithRetry(async (modelName) => {
        if (!aiClient) initializeGenAI();
        const response = await aiClient!.models.generateContent({
            model: modelName,
            contents: `Generate 3 daily challenges. JSON Array.`,
            config: { responseMimeType: "application/json" }
        });
        const json = JSON.parse(response.text || "[]");
        return json.map((item: any, index: number) => ({ ...item, id: `daily_${Date.now()}_${index}`, currentCount: 0, isCompleted: false }));
    }, 'system');
};

export const analyzeUserProgress = async (history: ChatMessage[], currentMemory: string, userId: string) => {
    return executeWithRetry(async (modelName) => {
        if (!aiClient) initializeGenAI();
        const response = await aiClient!.models.generateContent({
            model: modelName,
            contents: `Analyze progress. JSON: { "newMemory": "string", "xpEarned": number, "feedback": "string" }`,
            config: { responseMimeType: "application/json" }
        });
        storageService.deductCreditOrUsage(userId);
        return JSON.parse(response.text || "{}");
    }, userId);
};

// --- Roleplay Logic with TS Fix ---
export interface RoleplayResponse {
    aiReply: string;
    correction?: string;
    explanation?: string;
    score?: number;
    feedback?: string;
}

export const generateRoleplayResponse = async (
    history: ChatMessage[], 
    scenario: string, 
    userProfile: UserProfile, 
    isClosing: boolean = false, 
    isInitializing: boolean = false
): Promise<RoleplayResponse> => {
    checkCreditsBeforeAction(userProfile.id);
    return executeWithRetry(async (modelName) => {
        if (!aiClient) initializeGenAI();
        
        // Use sanitizer
        const historyPayload = sanitizeHistory(history);
        
        // Correctly handle the potentially undefined parts with optional chaining
        const context = historyPayload.map(m => {
            const text = m.parts?.[0]?.text || "";
            return `${m.role}: ${text}`;
        }).join('\n');

        let systemPrompt = `ACT: Roleplay Partner. Scenario: ${scenario}. Language: ${userProfile.preferences?.targetLanguage}. Level: ${userProfile.preferences?.level}.`;
        
        if (isInitializing) {
            systemPrompt += ` Start conversation. JSON: { "aiReply": "..." }`;
        } else if (isClosing) {
            systemPrompt += ` End session & evaluate. Context: ${context}. JSON: { "aiReply": "...", "score": 0-20, "feedback": "..." }`;
        } else {
            systemPrompt += ` Reply. Context: ${context}. JSON: { "aiReply": "...", "correction": "string|null", "explanation": "string|null" }`;
        }

        const response = await aiClient!.models.generateContent({
            model: modelName,
            contents: systemPrompt,
            config: { responseMimeType: "application/json", temperature: 0.7 }
        });
        storageService.deductCreditOrUsage(userProfile.id);
        return JSON.parse(response.text || "{}");
    }, userProfile.id);
};
