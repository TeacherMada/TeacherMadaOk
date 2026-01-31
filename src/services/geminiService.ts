
import { GoogleGenAI, Chat, Content, Type, Modality } from "@google/genai";
import { UserProfile, UserPreferences, ChatMessage, DailyChallenge, ExerciseItem, ExplanationLanguage, VoiceCallSummary, VocabularyItem } from "../types";
import { SYSTEM_PROMPT_TEMPLATE } from "../constants";
import { storageService } from "./storageService";

let aiClient: GoogleGenAI | null = null;
let currentKeyIndex = 0;

// === MODEL CONFIGURATION ===
// Flash est prioritaire pour la vitesse perçue
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
        
        // Si erreur de tour de parole, c'est fatal, ne pas réessayer pour éviter une boucle
        if (errorMsg.includes('turn') || errorMsg.includes('conversation')) {
             console.error("❌ Fatal History Logic Error:", error);
             throw new Error("Erreur de synchronisation conversation. Veuillez rafraîchir.");
        }

        const isQuotaError = errorMsg.includes('429') || errorMsg.includes('quota');
        const isServerBusy = errorMsg.includes('503') || errorMsg.includes('overloaded');
        const keys = getAvailableKeys();

        if (isQuotaError || isServerBusy) {
            console.warn(`⚠️ Retry strategy active. Attempt: ${attempt}`);
            if (attempt < keys.length - 1) {
                initializeGenAI(true); 
                return executeWithRetry(operation, userId, attempt + 1, fallbackIndex);
            } 
            if (fallbackIndex < FALLBACK_CHAIN.length - 1) {
                initializeGenAI(true); 
                return executeWithRetry(operation, userId, 0, fallbackIndex + 1);
            }
        }
        throw new Error("Service momentanément indisponible (Surcharge).");
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
    previousHistory: ChatMessage[], // HISTORY PASSED EXPLICITLY
    onChunk: (text: string) => void
): Promise<string> => {
    checkCreditsBeforeAction(userId);

    return executeWithRetry(async (modelName) => {
        if (!aiClient) initializeGenAI();
        if (!aiClient) throw new Error("AI not init");

        const user = storageService.getUserById(userId);
        if (!user || !user.preferences) throw new Error("User data missing");
        
        // === HISTORY SANITIZATION ===
        // 1. Filter valid roles only
        // 2. Ensure NO user message is at the end (because we are sending a new one)
        const validHistory = previousHistory
            .filter(msg => msg.role === 'user' || msg.role === 'model')
            .map(msg => ({ role: msg.role, parts: [{ text: msg.text }] }));

        // Remove trailing user messages to strictly enforce Model -> User sequence
        // This fixes the "User turn must follow Model turn" error
        while (validHistory.length > 0 && validHistory[validHistory.length - 1].role === 'user') {
            validHistory.pop();
        }

        const systemInstruction = SYSTEM_PROMPT_TEMPLATE(user, user.preferences);
        
        // Keep last 12 turns for context window efficiency
        const historyPayload = validHistory.slice(-12);

        const chat = aiClient.chats.create({
            model: modelName,
            config: {
                systemInstruction: systemInstruction,
                temperature: 0.7, 
                maxOutputTokens: 1000,
            },
            history: historyPayload as Content[],
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

        storageService.deductCreditOrUsage(userId);
        return fullText;

    }, userId);
};

export const sendMessageToGemini = async (message: string, userId: string): Promise<string> => {
  // Legacy wrapper, preferably use Stream
  let fullText = '';
  // @ts-ignore
  await sendMessageToGeminiStream(message, userId, [], (chunk) => fullText += chunk);
  return fullText;
};

// === OPTIMIZED VOICE CHAT ===
export const generateVoiceChatResponse = async (message: string, userId: string, previousHistory: ChatMessage[]) => {
    checkCreditsBeforeAction(userId);
    
    // FORCE FLASH MODEL FOR SPEED
    const VOICE_MODEL = 'gemini-1.5-flash';

    return executeWithRetry(async () => {
        if (!aiClient) initializeGenAI();
        if (!aiClient) throw new Error("AI not init");

        const user = storageService.getUserById(userId);
        
        // HISTORY CLEANUP
        const validHistory = previousHistory
            .filter(msg => msg.role === 'user' || msg.role === 'model')
            .map(msg => ({ role: msg.role, parts: [{ text: msg.text }] }));

        while (validHistory.length > 0 && validHistory[validHistory.length - 1].role === 'user') {
            validHistory.pop();
        }

        // ULTRA-CONCISE PROMPT FOR SPEED
        const systemInstruction = `
            ACT: Phone Tutor.
            USER: ${user?.username}.
            TARGET: ${user?.preferences?.targetLanguage}.
            RULES:
            1. Respond in 1-2 short sentences.
            2. Be conversational and fast.
            3. No formatting, no emojis (audio only).
        `;

        const historyParts = validHistory.slice(-6); // Only last 6 messages for speed

        const chat = aiClient.chats.create({
            model: VOICE_MODEL,
            config: {
                systemInstruction: systemInstruction,
                temperature: 0.6, 
                maxOutputTokens: 60, // Limit tokens drastically for instant response
            },
            history: historyParts as Content[],
        });

        const result = await chat.sendMessage({ message });
        return result.text || "Je vous écoute.";
    }, userId);
};

export const generateSpeech = async (text: string, userId: string, voiceName: string = 'Kore'): Promise<ArrayBuffer | null> => {
    // Basic check without throwing if possible, to avoid breaking flow
    const status = storageService.canPerformRequest(userId);
    if (!status.allowed) return null; 
    
    return executeWithRetry(async (modelName) => {
        if (!aiClient) initializeGenAI(); 
        if (!aiClient) return null;

        if (!text || !text.trim()) return null;
        // Clean text for TTS
        const safeText = text.replace(/[*#_`~]/g, '').substring(0, 1000);

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

// ... (Other functions kept essentially same but ensuring they call initializeGenAI)

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

export const generateRoleplayResponse = async (history: ChatMessage[], scenario: string, userProfile: UserProfile, isClosing: boolean = false, isInitializing: boolean = false) => {
    checkCreditsBeforeAction(userProfile.id);
    return executeWithRetry(async (modelName) => {
        if (!aiClient) initializeGenAI();
        
        // CLEAN HISTORY HERE TOO
        const validHistory = history.filter(msg => msg.role === 'user' || msg.role === 'model');
        while (validHistory.length > 0 && validHistory[validHistory.length - 1].role === 'user') {
            validHistory.pop();
        }
        const context = validHistory.map(m => `${m.role}: ${m.text}`).join('\n');

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
