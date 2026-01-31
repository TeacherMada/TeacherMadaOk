
import { GoogleGenAI, Chat, Content, Type, Modality } from "@google/genai";
import { UserProfile, UserPreferences, ChatMessage, DailyChallenge, ExerciseItem, ExplanationLanguage, VoiceCallSummary, VocabularyItem } from "../types";
import { SYSTEM_PROMPT_TEMPLATE } from "../constants";
import { storageService } from "./storageService";

let aiClient: GoogleGenAI | null = null;
let currentKeyIndex = 0;

// === MODEL CONFIGURATION (Smart Chain) ===
const PRIMARY_MODEL = 'gemini-1.5-pro'; 

// Fallback Chain
const FALLBACK_CHAIN = [
    'gemini-1.5-flash',              
    'gemini-2.0-flash-lite-preview', 
    'gemini-1.5-flash-8b'               
];

// Helper to get all available keys from "Backend" (Storage)
const getAvailableKeys = (): string[] => {
    const settings = storageService.getSystemSettings();
    let keys = settings.apiKeys && settings.apiKeys.length > 0 ? settings.apiKeys : [];
    
    // Add env key if not present (Development fallback)
    // @ts-ignore
    const envKey = import.meta.env.VITE_GOOGLE_API_KEY;
    if (envKey && typeof envKey === 'string' && !keys.includes(envKey)) {
        keys.push(envKey);
    }
    
    // Deduplicate and filter empty
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
        // Random start to distribute load on reload
        currentKeyIndex = Math.floor(Math.random() * keys.length);
    }

    const apiKey = keys[currentKeyIndex];
    aiClient = new GoogleGenAI({ apiKey });
    
    return getActiveModelName(); 
};

// Determines the starting model. Defaults to PRIMARY_MODEL unless overridden by Admin settings.
const getActiveModelName = () => {
    const settings = storageService.getSystemSettings();
    // Use admin setting if valid, otherwise default to PRIMARY
    return settings.activeModel && settings.activeModel.length > 0 ? settings.activeModel : PRIMARY_MODEL;
};

// === CORE ROBUST EXECUTION LOGIC ===
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
        const isQuotaError = errorMsg.includes('429') || errorMsg.includes('quota') || errorMsg.includes('resource_exhausted');
        const isModelError = errorMsg.includes('404') || errorMsg.includes('not found');
        const isServerBusy = errorMsg.includes('503') || errorMsg.includes('overloaded');
        const isTurnError = errorMsg.includes('turn') || errorMsg.includes('conversation'); // Catch conversation history errors
        
        // If it's a turn error, it's a logic bug, not a capacity issue. Don't retry, just fail or log.
        if (isTurnError) {
             console.error("❌ History Logic Error:", error);
             throw error;
        }

        const keys = getAvailableKeys();

        if (isQuotaError || isModelError || isServerBusy) {
            console.warn(`⚠️ Error on ${fallbackIndex === -1 ? 'Primary' : 'Fallback ' + fallbackIndex} (Key: ${currentKeyIndex}). Reason: ${errorMsg}`);

            // Strategy A: Rotate Key (Try next key with SAME model first)
            if (attempt < keys.length - 1) {
                initializeGenAI(true); 
                return executeWithRetry(operation, userId, attempt + 1, fallbackIndex);
            } 
            
            // Strategy B: Switch Model (If Key rotation exhausted)
            if (fallbackIndex < FALLBACK_CHAIN.length - 1) {
                const nextFallbackIndex = fallbackIndex + 1;
                console.warn(`🔄 Switching to FALLBACK model: ${FALLBACK_CHAIN[nextFallbackIndex]}`);
                initializeGenAI(true); 
                return executeWithRetry(operation, userId, 0, nextFallbackIndex);
            }
        }
        
        console.error("❌ All models and keys exhausted. Service unavailable.", error);
        throw new Error("SERVICE_OVERLOAD_ALL_MODELS");
    }
};

const checkCreditsBeforeAction = (userId: string) => {
    const status = storageService.canPerformRequest(userId);
    if (!status.allowed) {
        throw new Error("INSUFFICIENT_CREDITS");
    }
    return true;
};

// --- EXPORTED FUNCTIONS ---

export const startChatSession = async (
  profile: UserProfile, 
  prefs: UserPreferences,
  history: ChatMessage[] = []
) => {
  initializeGenAI(); 
  if (!aiClient) throw new Error("AI Client not initialized");
  return null; 
};

export const sendMessageToGeminiStream = async (
    message: string, 
    userId: string,
    onChunk: (text: string) => void
): Promise<string> => {
    checkCreditsBeforeAction(userId);

    return executeWithRetry(async (modelName) => {
        if (!aiClient) initializeGenAI();
        if (!aiClient) throw new Error("AI not init");

        // Force refresh user data to get the exact latest lesson progress
        const user = storageService.getUserById(userId);
        if (!user || !user.preferences) throw new Error("User data missing");
        
        // Load history specific to this language
        const rawHistory = await storageService.getChatHistory(userId, user.preferences.targetLanguage);

        // === CRITICAL FIX FOR HISTORY ===
        // We must remove the LAST message if it matches the 'message' we are about to send, 
        // OR if the history ends with a 'user' role.
        // Google Gemini API expects [User, Model, User, Model]. 
        // We are sending a NEW 'User' message via sendMessageStream.
        // Therefore, the history passed to 'chats.create' MUST end with 'Model' (or be empty).
        
        const validHistory = rawHistory.filter(msg => msg.role === 'user' || msg.role === 'model'); // Filter out system messages if any
        
        // Remove trailing user messages to ensure we don't send User -> User
        while (validHistory.length > 0 && validHistory[validHistory.length - 1].role === 'user') {
            validHistory.pop();
        }

        // Generate context-aware system prompt
        const systemInstruction = SYSTEM_PROMPT_TEMPLATE(user, user.preferences);
        
        // Limit history to last 12 turns to keep context window focused and cheap
        const historyParts = validHistory.slice(-12).map(msg => ({
            role: msg.role,
            parts: [{ text: msg.text }]
        }));

        const chat = aiClient.chats.create({
            model: modelName,
            config: {
                systemInstruction: systemInstruction,
                temperature: 0.7, 
                maxOutputTokens: 2000,
            },
            history: historyParts as Content[],
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
  let fullText = '';
  await sendMessageToGeminiStream(message, userId, (chunk) => fullText += chunk);
  return fullText;
};

export const generateVocabularyFromHistory = async (userId: string, history: ChatMessage[]): Promise<VocabularyItem[]> => {
    checkCreditsBeforeAction(userId);
    return executeWithRetry(async (modelName) => {
        if (!aiClient) initializeGenAI();
        if (!aiClient) throw new Error("AI not init");

        const conversation = history.slice(-10).map(m => m.text).join('\n');
        const prompt = `Extract 5 key vocabulary words from this conversation. Return valid JSON array: [{ "word": "string", "translation": "string", "context": "string (short sentence example)" }]`;
        
        const response = await aiClient.models.generateContent({ 
            model: modelName, 
            contents: prompt, 
            config: { responseMimeType: "application/json" } 
        });
        
        storageService.deductCreditOrUsage(userId);
        const json = JSON.parse(response.text || "[]");
        return json.map((item: any, idx: number) => ({
            ...item,
            id: `vocab_${Date.now()}_${idx}`,
            mastered: false,
            addedAt: Date.now()
        }));
    }, userId);
};

export const translateText = async (text: string, targetLang: string, userId: string): Promise<string> => {
    checkCreditsBeforeAction(userId);
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

export const generateLanguageFlag = async (languageName: string): Promise<{code: string, flag: string}> => {
    return executeWithRetry(async (modelName) => {
        if (!aiClient) initializeGenAI();
        const prompt = `Generate standard name and flag emoji for language '${languageName}'. JSON: { "code": "Name + Flag", "flag": "FlagOnly" }`;
        const response = await aiClient!.models.generateContent({
            model: modelName,
            contents: prompt,
            config: { responseMimeType: "application/json" }
        });
        return JSON.parse(response.text || '{"code": "Inconnu", "flag": "❓"}');
    }, 'system');
};

export const generateVoiceChatResponse = async (message: string, userId: string, history: ChatMessage[]) => {
    checkCreditsBeforeAction(userId);
    return executeWithRetry(async (modelName) => {
        if (!aiClient) initializeGenAI();
        if (!aiClient) throw new Error("AI not init");

        const user = storageService.getUserById(userId);
        if (!user || !user.preferences) throw new Error("User data missing");

        // === CRITICAL FIX FOR HISTORY (VOICE) ===
        // Same logic as sendMessageStream. 
        // Remove trailing user messages to ensure we don't send User -> User in history + prompt.
        const validHistory = history.filter(msg => msg.role === 'user' || msg.role === 'model');
        while (validHistory.length > 0 && validHistory[validHistory.length - 1].role === 'user') {
            validHistory.pop();
        }

        const systemInstruction = `
            ACT: Friendly language tutor on a phone call.
            USER: ${user.username}. LEVEL: ${user.preferences.level}. TARGET: ${user.preferences.targetLanguage}.
            RULES: Short, natural, encouraging. Max 2 sentences. No lists.
        `;

        const historyParts = validHistory.slice(-6).map(msg => ({
            role: msg.role,
            parts: [{ text: msg.text }]
        }));

        const chat = aiClient.chats.create({
            model: modelName,
            config: {
                systemInstruction: systemInstruction,
                temperature: 0.6, 
                maxOutputTokens: 150, 
            },
            history: historyParts as Content[],
        });

        const result = await chat.sendMessage({ message });
        return result.text || "Je vous écoute.";
    }, userId);
};

export const generateSpeech = async (text: string, userId: string, voiceName: string = 'Kore'): Promise<ArrayBuffer | null> => {
    const status = storageService.canPerformRequest(userId);
    if (!status.allowed) throw new Error("INSUFFICIENT_CREDITS");
    
    return executeWithRetry(async (modelName) => {
        if (!aiClient) initializeGenAI(); 
        if (!aiClient) throw new Error("AI Client not initialized");

        if (!text || !text.trim()) return null;
        const safeText = text.substring(0, 4000);

        const ttsModel = "gemini-2.5-flash-preview-tts";

        const response = await aiClient.models.generateContent({
            model: ttsModel,
            contents: [{ parts: [{ text: `Read: ${safeText}` }] }],
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

export const getLessonSummary = async (lessonNumber: number, context: string, userId: string): Promise<string> => {
    checkCreditsBeforeAction(userId);
    return executeWithRetry(async (modelName) => {
        if (!aiClient) initializeGenAI();
        const prompt = `Génère un résumé concis pour la LEÇON ${lessonNumber}. Contexte: ${context}. Format Markdown strict.`;
        const response = await aiClient!.models.generateContent({
            model: modelName,
            contents: prompt,
        });
        storageService.deductCreditOrUsage(userId);
        return response.text || "Impossible de générer le résumé.";
    }, userId);
};

export const generateConceptImage = async (prompt: string, userId: string): Promise<string | null> => {
    checkCreditsBeforeAction(userId);
    return executeWithRetry(async () => {
        if (!aiClient) initializeGenAI();
        const imageModel = 'gemini-2.5-flash-image';
        
        const response = await aiClient!.models.generateContent({
            model: imageModel,
            contents: { parts: [{ text: prompt }] },
            config: { 
                // @ts-ignore - The imageConfig property is experimental and missing in strict TS types
                imageConfig: { 
                    aspectRatio: "16:9" 
                } 
            } as any
        });

        storageService.deductCreditOrUsage(userId);

        if (response.candidates?.[0]?.content?.parts) {
            for (const part of response.candidates[0].content.parts) {
                if (part.inlineData && part.inlineData.data) {
                    return `data:${part.inlineData.mimeType || 'image/png'};base64,${part.inlineData.data}`;
                }
            }
        }
        return null;
    }, userId);
};

export const analyzeVoiceCallPerformance = async (history: ChatMessage[], userId: string): Promise<VoiceCallSummary> => {
    return executeWithRetry(async (modelName) => {
        if (!aiClient) initializeGenAI();
        const user = storageService.getUserById(userId);
        const conversation = history.slice(-10).map(m => `${m.role}: ${m.text}`).join('\n');
        
        const prompt = `Analyze this conversation. Return JSON: { "score": number(1-10), "feedback": "string", "tip": "string" }`;
        const response = await aiClient!.models.generateContent({
            model: modelName,
            contents: prompt,
            config: { responseMimeType: "application/json" }
        });
        const json = JSON.parse(response.text || "{}");
        return {
            score: json.score || 7,
            feedback: json.feedback || "Bonne pratique !",
            tip: json.tip || "Continuez à pratiquer."
        };
    }, userId);
};

export const generatePracticalExercises = async (profile: UserProfile, history: ChatMessage[]): Promise<ExerciseItem[]> => {
    checkCreditsBeforeAction(profile.id);
    return executeWithRetry(async (modelName) => {
        if (!aiClient) initializeGenAI();
        const prompt = `Generate 5 varied language exercises (multiple_choice, true_false, fill_blank). JSON Array format.`;
        const response = await aiClient!.models.generateContent({
            model: modelName,
            contents: prompt,
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
        if (!aiClient) return [];
        const prompt = `Generate 3 short language challenges. JSON Array.`;
        const response = await aiClient.models.generateContent({
            model: modelName,
            contents: prompt,
            config: { responseMimeType: "application/json" }
        });
        const json = JSON.parse(response.text || "[]");
        return json.map((item: any, index: number) => ({
            id: `daily_${Date.now()}_${index}`,
            description: item.description,
            type: item.type,
            targetCount: item.targetCount,
            currentCount: 0,
            xpReward: item.xpReward,
            isCompleted: false
        }));
    }, 'system');
};

export const analyzeUserProgress = async (history: ChatMessage[], currentMemory: string, userId: string): Promise<{ newMemory: string; xpEarned: number; feedback: string }> => {
    return executeWithRetry(async (modelName) => {
        if (!aiClient) initializeGenAI();
        const prompt = `Analyze session progress. JSON: { "newMemory": "string", "xpEarned": number, "feedback": "string" }`;
        const response = await aiClient!.models.generateContent({
            model: modelName,
            contents: prompt,
            config: { responseMimeType: "application/json" }
        });
        storageService.deductCreditOrUsage(userId);
        const json = JSON.parse(response.text || "{}");
        return {
            newMemory: json.newMemory || currentMemory,
            xpEarned: json.xpEarned || 10,
            feedback: json.feedback || "Bien joué !"
        };
    }, userId);
};

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
        if (!aiClient) throw new Error("AI Client not initialized");

        const context = history.map(m => `${m.role === 'user' ? 'Student' : 'Partner'}: ${m.text}`).join('\n');
        
        let systemPrompt = `
            ACT: Roleplay Partner & Language Tutor.
            SCENARIO: ${scenario}
            TARGET LANGUAGE: ${userProfile.preferences?.targetLanguage} (Strict).
            STUDENT LEVEL: ${userProfile.preferences?.level}.
            EXPLANATION LANGUAGE: ${userProfile.preferences?.explanationLanguage}.
        `;

        if (isInitializing) {
            systemPrompt += `
                TASK: Start the conversation as the roleplay character.
                - Be engaging but keep it simple for level ${userProfile.preferences?.level}.
                - Do NOT act as an AI assistant. Be the character.
                - Max 2 sentences.
                - Output JSON: { "aiReply": "..." }
            `;
        } else if (isClosing) {
            systemPrompt += `
                TASK: End the session and evaluate the student.
                CONTEXT:
                ${context}
                
                OUTPUT JSON:
                {
                    "aiReply": "Closing remark in target language.",
                    "score": number (0-20),
                    "feedback": "Constructive feedback in ${userProfile.preferences?.explanationLanguage}."
                }
            `;
        } else {
            systemPrompt += `
                TASK: Reply to the student and correct if necessary.
                CONTEXT:
                ${context}
                
                RULES:
                1. Reply naturally as the character (aiReply).
                2. If the student made a grammar/vocab mistake in the LAST message, provide a correction and short explanation.
                3. If no mistake, correction and explanation should be null.
                
                OUTPUT JSON:
                {
                    "aiReply": "...",
                    "correction": "Corrected sentence or null",
                    "explanation": "Why it was wrong (in ${userProfile.preferences?.explanationLanguage}) or null"
                }
            `;
        }

        const response = await aiClient.models.generateContent({
            model: modelName,
            contents: systemPrompt,
            config: { 
                responseMimeType: "application/json",
                temperature: 0.7
            }
        });

        storageService.deductCreditOrUsage(userProfile.id);
        
        try {
            return JSON.parse(response.text || "{}") as RoleplayResponse;
        } catch (e) {
            console.error("JSON Parse error", e);
            return { aiReply: "..." };
        }
    }, userProfile.id);
};
