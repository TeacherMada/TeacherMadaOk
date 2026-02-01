
import { GoogleGenAI, Chat, Content, Type, Modality } from "@google/genai";
import { UserProfile, UserPreferences, ChatMessage, DailyChallenge, ExerciseItem, ExplanationLanguage, VoiceCallSummary, VocabularyItem } from "../types";
import { SYSTEM_PROMPT_TEMPLATE } from "../constants";
import { storageService } from "./storageService";

let aiClient: GoogleGenAI | null = null;
let currentKeyIndex = 0;

// === MODEL CONFIGURATION ===
// Primary Model: "Pro" tier quality (Subject to stricter rate limits)
const PRIMARY_MODEL = 'gemini-2.0-flash'; 

// Fallback Chain: Used when Primary Model quotas are exhausted across ALL keys.
// 'gemini-2.0-flash' is a high-speed, generous free-tier model.
const FALLBACK_CHAIN = [
    'gemini-2.0-flash-lite-preview', 
    'gemini-1.5-flash'               
];

// Helper to get all available keys from "Backend" (Storage)
const getAvailableKeys = (): string[] => {
    const settings = storageService.getSystemSettings();
    let keys = settings.apiKeys && settings.apiKeys.length > 0 ? settings.apiKeys : [];
    
    // Add env key if not present
    // @ts-ignore
    const envKey = import.meta.env.VITE_GOOGLE_API_KEY;
    if (envKey && !keys.includes(envKey)) {
        keys.push(envKey);
    }
    
    // Deduplicate and filter empty
    return Array.from(new Set(keys)).filter(k => k && k.trim().length > 0);
};

const initializeGenAI = (forceNextKey: boolean = false) => {
    const keys = getAvailableKeys();
    
    if (keys.length === 0) {
      console.error("No API Keys available");
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
    
    return getActiveModelName(); // Returns currently active model based on settings/fallback
};

// Determines the starting model. Defaults to PRIMARY_MODEL unless overridden by Admin settings.
const getActiveModelName = () => {
    const settings = storageService.getSystemSettings();
    return settings.activeModel || PRIMARY_MODEL;
};

// === CORE FALLBACK LOGIC ===
// 1. Try Current Model with Current Key.
// 2. If Quota Error (429): Rotate through ALL available keys for Current Model.
// 3. If ALL keys fail for Current Model: Switch to Next Model in Fallback Chain.
// 4. Repeat until success or total exhaustion.
const executeWithRetry = async <T>(
    operation: (modelName: string) => Promise<T>, 
    userId: string,
    attempt: number = 0,
    fallbackIndex: number = -1 // -1 means trying Primary Model
): Promise<T> => {
    try {
        // Determine which model to use
        let modelName = getActiveModelName();
        if (fallbackIndex >= 0 && fallbackIndex < FALLBACK_CHAIN.length) {
            modelName = FALLBACK_CHAIN[fallbackIndex];
        }

        return await operation(modelName);
    } catch (error: any) {
        const isQuotaError = error.message?.includes('429') || error.message?.includes('quota') || error.message?.includes('resource_exhausted');
        const isModelNotFoundError = error.message?.includes('404') || error.message?.includes('not found') || error.message?.includes('models/');
        
        const keys = getAvailableKeys();

        if (isQuotaError || isModelNotFoundError) {
            const errorType = isQuotaError ? 'Quota' : 'ModelNot Found';
            console.warn(`${errorType} error on ${fallbackIndex === -1 ? 'Primary' : 'Fallback ' + fallbackIndex}. KeyIdx: ${currentKeyIndex}. Retrying...`);

            // Strategy A: Rotate Key (Prioritize this for Quota errors)
            // We retry as many times as we have keys.
            if (isQuotaError && attempt < keys.length) {
                initializeGenAI(true); // Rotate to next key
                return executeWithRetry(operation, userId, attempt + 1, fallbackIndex);
            } 
            
            // Strategy B: Switch Model (If Key rotation exhausted OR Model Not Found)
            // If we are at the end of the chain, we fail.
            if (fallbackIndex < FALLBACK_CHAIN.length - 1) {
                const nextFallbackIndex = fallbackIndex + 1;
                console.warn(`>> Switching to fallback model: ${FALLBACK_CHAIN[nextFallbackIndex]}`);
                
                // Reset key strategy slightly (optional, but good to start fresh)
                initializeGenAI(true); 
                
                // Reset attempt counter for the new model
                return executeWithRetry(operation, userId, 0, nextFallbackIndex);
            }
        }
        
        // If we ran out of models and keys, throw the error
        console.error("All models and keys exhausted.");
        throw error;
    }
};

// Check credits wrapper
const checkCreditsBeforeAction = (userId: string) => {
    const status = storageService.canPerformRequest(userId);
    if (!status.allowed) {
        throw new Error("INSUFFICIENT_CREDITS");
    }
    return true;
};

export const startChatSession = async (
  profile: UserProfile, 
  prefs: UserPreferences,
  history: ChatMessage[] = []
) => {
  // Initialize standard client first
  initializeGenAI(); 
  if (!aiClient) throw new Error("AI Client not initialized");
  return null; 
};

// === HELPER: Sanitize History for Gemini ===
// Removes initial messages until a 'user' message is found.
// This fixes "History must start with a user turn" error when history starts with a Model greeting.
const sanitizeHistory = (history: ChatMessage[]) => {
    const cleanHistory = [...history];
    while (cleanHistory.length > 0 && cleanHistory[0].role !== 'user') {
        cleanHistory.shift();
    }
    return cleanHistory.map(m => ({ role: m.role, parts: [{ text: m.text }] }));
};

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
        
        // FIX APPLIED HERE: Filter history
        const historyPayload = sanitizeHistory(previousHistory);

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
        storageService.deductCreditOrUsage(userId);
        return { fullText };
    }, userId);
};

export const sendMessageToGemini = async (message: string, userId: string): Promise<string> => {
  let fullText = '';
  // @ts-ignore
  await sendMessageToGeminiStream(message, userId, [], (chunk) => fullText += chunk);
  return fullText;
};

export const generateVoiceChatResponse = async (
    message: string, 
    userId: string, 
    history: ChatMessage[]
): Promise<string> => {
    // Note: Voice credits are time-based, checked in the component.
    // However, we still check generic access here.
    const status = storageService.canPerformRequest(userId);
    if (!status.allowed) throw new Error("INSUFFICIENT_CREDITS");

    // For voice, latency is critical. We might prefer starting with a faster model directly if configured,
    // but sticking to the standard chain ensures quality first, speed fallback second.
    
    return executeWithRetry(async (modelName) => {
        if (!aiClient) initializeGenAI();
        if (!aiClient) throw new Error("AI not init");

        const user = storageService.getUserById(userId);
        if (!user || !user.preferences) throw new Error("User data missing");

        // Specialized Prompt for Voice Calls - Optimized for speed and natural flow
        const systemInstruction = `
            ACT: Friendly language tutor on a phone call.
            USER: ${user.username}. LEVEL: ${user.preferences.level}. TARGET: ${user.preferences.targetLanguage}.
            
            RULES:
            1. KEEP IT SHORT. Max 2 sentences. No lists. No markdown.
            2. Be encouraging but correct big mistakes softly ("You mean...?").
            3. Ask ONE simple follow-up question to keep conversation going.
            4. Speak naturally.
        `;

        // FIX APPLIED HERE: Filter history
        let recentHistory = history.slice(-6);
        const historyParts = sanitizeHistory(recentHistory);

        const chat = aiClient!.chats.create({
            model: modelName,
            config: {
                systemInstruction: systemInstruction,
                temperature: 0.6, // Lower temp for faster, more focused results
                maxOutputTokens: 150, // Limit output size for speed
            },
            history: historyParts as Content[],
        });

        const result = await chat.sendMessage({ message });
        return result.text || "Je vous écoute.";
    }, userId);
};

export const analyzeVoiceCallPerformance = async (
    history: ChatMessage[],
    userId: string
): Promise<VoiceCallSummary> => {
    return executeWithRetry(async (modelName) => {
        if (!aiClient) initializeGenAI();
        if (!aiClient) throw new Error("AI not init");

        const user = storageService.getUserById(userId);
        if (!user || !user.preferences) throw new Error("User data missing");

        // Get only the user audio parts from recent history
        const conversation = history.slice(-10).map(m => `${m.role}: ${m.text}`).join('\n');

        const prompt = `
            Analyze this short language practice conversation.
            Target Language: ${user.preferences.targetLanguage}.
            Explanation Language: ${user.preferences.explanationLanguage}.
            
            Conversation:
            ${conversation}

            Output valid JSON only:
            {
                "score": number (1-10),
                "feedback": "string (Brief summary of strengths/weaknesses in ${user.preferences.explanationLanguage}, max 3 sentences)",
                "tip": "string (One actionable tip in ${user.preferences.explanationLanguage})"
            }
        `;

        const response = await aiClient.models.generateContent({
            model: modelName,
            contents: prompt,
            config: { responseMimeType: "application/json" }
        });

        const json = JSON.parse(response.text || "{}");
        return {
            score: json.score || 7,
            feedback: json.feedback || "Bonne pratique !",
            tip: json.tip || "Continuez à pratiquer régulièrement."
        };
    }, userId);
};

export const translateText = async (text: string, targetLang: string, userId: string): Promise<string> => {
    checkCreditsBeforeAction(userId);
    
    return executeWithRetry(async (modelName) => {
        if (!aiClient) initializeGenAI();
        if (!aiClient) throw new Error("AI Client not initialized");
        
        const prompt = `Translate to ${targetLang}. Return ONLY translation. Text: "${text}"`;
        const response = await aiClient.models.generateContent({
            model: modelName,
            contents: prompt,
        });
        storageService.deductCreditOrUsage(userId);
        return response.text?.trim() || text;
    }, userId);
};

export const getLessonSummary = async (lessonNumber: number, context: string, userId: string): Promise<string> => {
    checkCreditsBeforeAction(userId);

    return executeWithRetry(async (modelName) => {
        if (!aiClient) initializeGenAI();
        if (!aiClient) throw new Error("AI Client not initialized");

        const prompt = `Génère un résumé concis pour la LEÇON ${lessonNumber}. Contexte: ${context}. Format Markdown strict.`;
        const response = await aiClient.models.generateContent({
            model: modelName,
            contents: prompt,
        });
        storageService.deductCreditOrUsage(userId);
        return response.text || "Impossible de générer le résumé.";
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

        // Prioritize TTS model
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

export const generateConceptImage = async (prompt: string, userId: string): Promise<string | null> => {
    checkCreditsBeforeAction(userId);

    return executeWithRetry(async () => {
        if (!aiClient) initializeGenAI();
        if (!aiClient) throw new Error("AI Client not initialized");

        // Use a model optimized for low-latency image generation
        const imageModel = 'gemini-2.5-flash-image';
        
        // CORRECTION: Utilisation d'un objet 'any' pour contourner la vérification de type stricte de TS
        // car 'imageConfig' n'est pas encore présent dans les types du SDK pour GenerateContentConfig
        const modelConfig: any = {
            imageConfig: {
                aspectRatio: "16:9",
            }
        };

        const response = await aiClient.models.generateContent({
            model: imageModel,
            contents: {
                parts: [{ text: prompt }]
            },
            config: modelConfig
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

export const generateDailyChallenges = async (prefs: UserPreferences): Promise<DailyChallenge[]> => {
    return executeWithRetry(async (modelName) => {
        if (!aiClient) initializeGenAI();
        if (!aiClient) return [];
        
        const prompt = `Génère 3 défis courts (${prefs.targetLanguage}, ${prefs.level}). JSON array: [{description, type (message_count|vocabulary), targetCount, xpReward}].`;

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

export const analyzeUserProgress = async (
    history: ChatMessage[], 
    currentMemory: string,
    userId: string
): Promise<{ newMemory: string; xpEarned: number; feedback: string }> => {
    const status = storageService.canPerformRequest(userId);
    if (!status.allowed) return { newMemory: currentMemory, xpEarned: 10, feedback: "Bonne session (Crédits épuisés)." };

    return executeWithRetry(async (modelName) => {
        if (!aiClient) initializeGenAI();
        if (!aiClient) throw new Error("AI not init");

        const conversationText = history.slice(-6).map(m => `${m.role}: ${m.text}`).join('\n');
        const prompt = `Analyse session. Mémoire: "${currentMemory}". Chat: ${conversationText}. Retourne JSON {newMemory, xpEarned (int), feedback (court)}.`;

        const response = await aiClient.models.generateContent({
            model: modelName,
            contents: prompt,
            config: { responseMimeType: "application/json" }
        });

        storageService.deductCreditOrUsage(userId);
        const json = JSON.parse(response.text || "{}");
        return {
            newMemory: json.newMemory || currentMemory,
            xpEarned: json.xpEarned || 15,
            feedback: json.feedback || "Bien joué !"
        };
    }, userId);
};

export const generatePracticalExercises = async (
  profile: UserProfile,
  history: ChatMessage[]
): Promise<ExerciseItem[]> => {
  checkCreditsBeforeAction(profile.id);
  
  return executeWithRetry(async (modelName) => {
      if (!aiClient) initializeGenAI();
      if (!aiClient) throw new Error("AI Client not initialized");

      const recentTopics = history.slice(-5).map(m => m.text).join(" ");
      
      const prompt = `
        Génère 5 exercices pratiques pour apprendre : ${profile.preferences?.targetLanguage}.
        Niveau: ${profile.preferences?.level}.
        Contexte récent (si pertinent): ${recentTopics.substring(0, 500)}.
        Types variés: multiple_choice, true_false, fill_blank.
        
        Retourne un tableau JSON pur (pas de markdown) suivant ce schéma exact:
        [{
            "type": "multiple_choice" | "true_false" | "fill_blank",
            "question": "string",
            "options": ["string", "string", "string", "string"] (requis pour QCM, optionnel sinon),
            "correctAnswer": "string",
            "explanation": "string (explication courte)"
        }]
      `;

      const response = await aiClient.models.generateContent({
        model: modelName,
        contents: prompt,
        config: { 
            responseMimeType: "application/json",
            temperature: 0.7 
        }
      });

      storageService.deductCreditOrUsage(profile.id);
      
      let jsonStr = response.text || "[]";
      jsonStr = jsonStr.replace(/```json/g, '').replace(/```/g, '').trim();
      
      const json = JSON.parse(jsonStr);
      return json.map((item: any, idx: number) => ({ ...item, id: `ex_${Date.now()}_${idx}` }));
  }, profile.id);
};

// --- Roleplay Logic ---

export interface RoleplayResponse {
    aiReply: string;
    correction?: string;
    score?: number;
    feedback?: string;
    explanation?: string;
}

export const generateRoleplayResponse = async (
    history: ChatMessage[],
    scenario: string,
    userProfile: UserProfile,
    isClosing: boolean = false,
    isInit: boolean = false
): Promise<RoleplayResponse> => {
    if (!isInit) {
        const status = storageService.canPerformRequest(userProfile.id);
        if (!status.allowed) throw new Error("INSUFFICIENT_CREDITS");
    }

    return executeWithRetry(async (modelName) => {
        if (!aiClient) initializeGenAI();
        if (!aiClient) throw new Error("AI Client not initialized");

        const context = history.map(m => `${m.role === 'user' ? 'Student' : 'Partner'}: ${m.text}`).join('\n');
        
        let prompt = `
            SETUP:
            - You are playing a ROLE in a dialogue. 
            - SCENARIO: ${scenario}
            - TARGET LANGUAGE: ${userProfile.preferences?.targetLanguage} (Strictly).
            - STUDENT LEVEL: ${userProfile.preferences?.level}.

            YOUR OBJECTIVES:
            1. Drive the conversation forward naturally.
            2. Be immersive. Don't act like an AI.
            3. Keep replies relatively short (1-3 sentences) unless explaining.

            CORRECTION RULES:
            - If the student makes a mistake, provide the corrected version in 'correction' field.
            - If no mistake, 'correction' is null.

            INPUT CONVERSATION:
            ${context}

            RESPONSE FORMAT (JSON):
            {
                "aiReply": "string (Your character's response in target language)",
                "correction": "string | null",
                "explanation": "string | null (Brief explanation of correction in ${userProfile.preferences?.explanationLanguage})"
            }
        `;

        if (isInit) {
             prompt = `
                START ROLEPLAY: ${scenario}.
                You start the conversation.
                Target Lang: ${userProfile.preferences?.targetLanguage}.
                Level: ${userProfile.preferences?.level}.
                
                RESPONSE FORMAT (JSON):
                { "aiReply": "string" }
             `;
        } else if (isClosing) {
            prompt = `
                ROLE: Language Examiner.
                TASK: End the roleplay scenario: ${scenario}.
                Analyze the conversation below. Give a score /20 based on grammar, vocabulary, and flow suited for level ${userProfile.preferences?.level}.
                
                CONVERSATION:
                ${context}
                
                RESPONSE FORMAT (JSON):
                {
                    "aiReply": "End of session message.",
                    "score": number, 
                    "feedback": "string (Short constructive feedback in ${userProfile.preferences?.explanationLanguage} explaining the score)"
                }
            `;
        }

        const response = await aiClient.models.generateContent({
            model: modelName,
            contents: prompt,
            config: { 
                responseMimeType: "application/json",
                temperature: 0.8 
            }
        });

        return JSON.parse(response.text || "{}") as RoleplayResponse;
    }, userProfile.id);
};

export const generateLanguageFlag = async (name: string) => { 
    return executeWithRetry(async (modelName) => {
        if (!aiClient) initializeGenAI();
        const response = await aiClient!.models.generateContent({ 
            model: modelName, 
            contents: `Return flag emoji and ISO code for language "${name}". JSON: { "code": "string", "flag": "string" }`,
            config: { responseMimeType: "application/json" }
        });
        return JSON.parse(response.text || `{"code": "${name}", "flag": "🏳️"}`);
    }, 'system');
};

export const generateLevelExample = async (targetLang: string, level: string): Promise<string> => {
    return executeWithRetry(async (modelName) => {
        if (!aiClient) initializeGenAI();
        const prompt = `Generate a short, typical sentence or phrase in ${targetLang} that corresponds exactly to level ${level} (CEFR or HSK). 
        Only return the sentence/phrase in ${targetLang}, nothing else. No markdown.`;
        
        const response = await aiClient!.models.generateContent({
            model: modelName,
            contents: prompt,
        });
        return response.text?.trim() || "";
    }, 'system');
};

export const generateVocabularyFromHistory = async (userId: string, history: ChatMessage[]): Promise<VocabularyItem[]> => {
    const status = storageService.canPerformRequest(userId);
    if (!status.allowed) throw new Error("INSUFFICIENT_CREDITS");

    return executeWithRetry(async (modelName) => {
        if (!aiClient) initializeGenAI();
        if (!aiClient) throw new Error("AI not init");

        const user = storageService.getUserById(userId);
        const targetLang = user?.preferences?.targetLanguage || "Target Language";
        const explanationLang = user?.preferences?.explanationLanguage || "Français";

        // Filter last 20 messages to keep context relevant
        const recentHistory = history.slice(-20).map(m => m.text).join("\n");

        const prompt = `
            Analyze the following conversation history in ${targetLang}.
            Extract 5 key vocabulary words or expressions that were used or learned.
            For each word, provide the translation in ${explanationLang} and a short context sentence from the conversation if possible.
            
            Conversation:
            ${recentHistory}

            Output ONLY a JSON array with this structure:
            [
                { "word": "string", "translation": "string", "context": "string" }
            ]
        `;

        const response = await aiClient.models.generateContent({
            model: modelName,
            contents: prompt,
            config: { responseMimeType: "application/json" }
        });

        storageService.deductCreditOrUsage(userId);

        const json = JSON.parse(response.text || "[]");
        return json.map((item: any, index: number) => ({
            id: `auto_${Date.now()}_${index}`,
            word: item.word,
            translation: item.translation,
            context: item.context,
            mastered: false,
            addedAt: Date.now()
        }));
    }, userId);
};
