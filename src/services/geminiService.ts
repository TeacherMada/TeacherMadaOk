
import { GoogleGenAI, Chat, Content, Type, Modality } from "@google/genai";
import { UserProfile, UserPreferences, ChatMessage, DailyChallenge, ExerciseItem, ExplanationLanguage, VoiceCallSummary, VocabularyItem } from "../types";
import { SYSTEM_PROMPT_TEMPLATE } from "../constants";
import { storageService } from "./storageService";

let aiClient: GoogleGenAI | null = null;
let currentKeyIndex = 0;

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

// === SMART CONTEXT SANITIZER ===
const sanitizeHistory = (history: ChatMessage[]): Content[] => {
    const validHistory: Content[] = [];
    if (!history || history.length === 0) return [];

    let lastRole = '';

    for (const msg of history) {
        // 1. Validate content
        if (!msg.text || msg.text.trim() === "") continue;
        if (msg.role !== 'user' && msg.role !== 'model') continue;

        // 2. Prevent Role Duplication (Merge consecutive messages)
        if (msg.role === lastRole) {
            const lastEntry = validHistory[validHistory.length - 1];
            if (lastEntry && lastEntry.parts) {
                // @ts-ignore
                lastEntry.parts[0].text += "\n" + msg.text;
            }
        } else {
            validHistory.push({
                role: msg.role,
                parts: [{ text: msg.text }]
            });
            lastRole = msg.role;
        }
    }
    
    // 3. Rule: History passed to chat session must NOT end with User message
    // (Because sendMessage adds the new user message, creating a User->User conflict)
    if (validHistory.length > 0 && validHistory[validHistory.length - 1].role === 'user') {
        validHistory.pop();
    }

    return validHistory;
};

// === COMPRESSION ENGINE (MEMORY OPTIMIZER) ===
const compressContext = async (history: ChatMessage[], currentMemory: string, userId: string): Promise<string> => {
    // Only compress if history is long enough
    if (history.length < 6) return currentMemory;

    try {
        if (!aiClient) initializeGenAI();
        const textToCompress = history.map(m => `${m.role}: ${m.text}`).join('\n');
        
        // Fast model for summarization to save costs/time
        const modelName = 'gemini-1.5-flash-8b'; 
        
        const prompt = `
        ACT: Data Compressor.
        TASK: Merge the "Current Memory" with the "New Conversation" into a single, concise summary.
        
        CURRENT MEMORY: "${currentMemory}"
        NEW CONVERSATION: 
        ${textToCompress}
        
        OUTPUT FORMAT (Strict Text):
        - List completed lessons (Ex: "Lesson 1, 2 done").
        - List mastered vocabulary.
        - Note persistent grammar errors.
        - Keep it under 500 characters.
        `;

        const response = await aiClient!.models.generateContent({
            model: modelName,
            contents: prompt,
        });

        const newMemory = response.text || currentMemory;
        console.log("🧠 Memory Updated:", newMemory.substring(0, 50) + "...");
        return newMemory;

    } catch (e) {
        console.warn("Compression failed, keeping old memory", e);
        return currentMemory;
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
        return await operation(modelName);
    } catch (error: any) {
        const errorMsg = error.message?.toLowerCase() || '';
        console.warn(`⚠️ AI Error (Attempt ${attempt}):`, errorMsg);
        
        // --- AUTO-HEAL PROTOCOL ---
        // If history is bad (400), we throw a specific error to trigger the "Fresh Start" fallback in the caller
        if (errorMsg.includes('400') || errorMsg.includes('invalid argument') || errorMsg.includes('turn')) {
             throw new Error("HISTORY_CORRUPT"); 
        }

        const isQuotaError = errorMsg.includes('429') || errorMsg.includes('quota') || errorMsg.includes('resource_exhausted');
        const isServerBusy = errorMsg.includes('503') || errorMsg.includes('overloaded');
        const keys = getAvailableKeys();

        if ((isQuotaError || isServerBusy) && attempt < keys.length * 2) {
            initializeGenAI(true); 
            // Exponential backoff for retries
            await new Promise(resolve => setTimeout(resolve, 1000 * (attempt + 1)));
            return executeWithRetry(operation, userId, attempt + 1, fallbackIndex);
        }
        
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
): Promise<{ fullText: string, newMemory?: string }> => {
    checkCreditsBeforeAction(userId);

    const user = storageService.getUserById(userId);
    if (!user || !user.preferences) throw new Error("User data missing");

    // 1. SMART COMPRESSION CHECK
    // If history is getting too long (> 12 msgs), we compress it BEFORE sending to AI.
    // This keeps the payload small for Supabase and Gemini.
    let effectiveHistory = previousHistory;
    let updatedMemory = user.aiMemory;
    let hasCompressed = false;

    if (previousHistory.length > 12) {
        // Compress everything EXCEPT the last 2 messages (to keep immediate context flow)
        const historyToCompress = previousHistory.slice(0, -2);
        const immediateContext = previousHistory.slice(-2);
        
        // Async compression (fire and await)
        updatedMemory = await compressContext(historyToCompress, user.aiMemory, userId);
        
        // Update user memory in storage immediately
        const updatedUser = { ...user, aiMemory: updatedMemory };
        storageService.saveUserProfile(updatedUser);
        
        // The AI only sees the new Memory + Immediate Context
        effectiveHistory = immediateContext;
        hasCompressed = true;
    }

    const runStream = async (historyToUse: ChatMessage[]) => {
        return executeWithRetry(async (modelName) => {
            if (!aiClient) initializeGenAI();
            
            // Re-fetch user to get the absolute latest memory
            const currentUser = storageService.getUserById(userId) || user;
            const systemInstruction = SYSTEM_PROMPT_TEMPLATE(currentUser, currentUser.preferences!);
            
            const historyPayload = sanitizeHistory(historyToUse);

            const chat = aiClient!.chats.create({
                model: modelName,
                config: {
                    systemInstruction: systemInstruction,
                    temperature: 0.7, 
                    maxOutputTokens: 2000, 
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
        const text = await runStream(effectiveHistory);
        storageService.deductCreditOrUsage(userId);
        // Return newMemory so UI can update if compression happened
        return { fullText: text, newMemory: hasCompressed ? updatedMemory : undefined };
    } catch (e: any) {
        // FALLBACK: If error 400 (Bad History), retry with ZERO history.
        // This unblocks the user at the cost of immediate context, but keeps Long Term Memory (System Prompt).
        if (e.message === "HISTORY_CORRUPT" || e.message?.includes('turn')) {
            console.warn("🔄 History Corrupt. Auto-recovering with empty context...");
            const text = await runStream([]); // Empty array = Clean start
            storageService.deductCreditOrUsage(userId);
            return { fullText: text };
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
    
    // Voice needs speed, so we use a shorter history window naturally (last 6)
    const runVoice = async (historyToUse: ChatMessage[]) => {
        return executeWithRetry(async () => {
            if (!aiClient) initializeGenAI();
            const user = storageService.getUserById(userId);
            
            const systemInstruction = `
                ACT: Phone Tutor.
                USER: ${user?.username}.
                LANG: ${user?.preferences?.targetLanguage}.
                MEMORY: ${user?.aiMemory || 'None'}.
                RULES:
                1. Answer in 1 short sentence (Max 15 words).
                2. Be natural. No emojis.
                3. If user says hello, just greet back.
            `;

            const historyPayload = sanitizeHistory(historyToUse).slice(-6); // Aggressive slicing for voice

            const chat = aiClient!.chats.create({
                model: 'gemini-1.5-flash',
                config: {
                    systemInstruction: systemInstruction,
                    temperature: 0.6, 
                    maxOutputTokens: 60,
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
        if (e.message?.includes('turn') || e.message === "HISTORY_CORRUPT") {
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

export const generateLevelExample = async (language: string, level: string): Promise<string | null> => {
    return executeWithRetry(async (modelName) => {
        if (!aiClient) initializeGenAI();
        const prompt = `Génère une phrase d'exemple simple, courte et intéressante en ${language} pour le niveau ${level}, avec sa traduction entre parenthèses. Pas de markdown.`;
        const response = await aiClient!.models.generateContent({
            model: modelName,
            contents: prompt,
            config: { temperature: 0.7, maxOutputTokens: 60 }
        });
        return response.text?.trim() || null;
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
            contents: `Generate 5 language exercises based on recent chat. JSON Array.`,
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
        // This function is explicitly for closing sessions, so we can use it to compress heavily
        const context = history.slice(-10).map(m => m.text).join('\n');
        const response = await aiClient!.models.generateContent({
            model: modelName,
            contents: `Analyze progress & Update Memory. 
            Old Memory: ${currentMemory}
            Recent Chat: ${context}
            JSON: { "newMemory": "string (updated summary of learned concepts)", "xpEarned": number, "feedback": "string" }`,
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
        
        const historyPayload = sanitizeHistory(history);
        const context = historyPayload.map(m => `${m.role}: ${m.parts?.[0]?.text || ""}`).join('\n');

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
