
import { GoogleGenAI, Chat, Content, Type, Modality } from "@google/genai";
import { UserProfile, UserPreferences, ChatMessage, DailyChallenge, ExerciseItem, ExplanationLanguage, VoiceCallSummary } from "../types";
import { SYSTEM_PROMPT_TEMPLATE } from "../constants";
import { storageService } from "./storageService";

let aiClient: GoogleGenAI | null = null;
let currentKeyIndex = 0;

// === MODEL CONFIGURATION ===
// Primary Model: "Pro" tier quality (Subject to stricter rate limits)
const PRIMARY_MODEL = 'gemini-3-flash-preview'; 

// Fallback Chain: Used when Primary Model quotas are exhausted across ALL keys.
// 'gemini-2.0-flash' is a high-speed, generous free-tier model.
const FALLBACK_CHAIN = [
    'gemini-2.0-flash',              
    'gemini-2.0-flash-lite-preview', 
    'gemini-1.5-flash'               
];

// Helper to get all available keys from "Backend" (Storage)
const getAvailableKeys = (): string[] => {
    const settings = storageService.getSystemSettings();
    let keys = settings.apiKeys && settings.apiKeys.length > 0 ? settings.apiKeys : [];
    
    // Add env key if not present
    const envKey = process.env.API_KEY;
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

export const sendMessageToGemini = async (message: string, userId: string): Promise<string> => {
  checkCreditsBeforeAction(userId);

  return executeWithRetry(async (modelName) => {
      if (!aiClient) initializeGenAI();
      if (!aiClient) throw new Error("AI not init");

      const history = storageService.getChatHistory(userId);
      const prefs = storageService.getUserById(userId)?.preferences;
      const user = storageService.getUserById(userId);
      
      if (!user || !prefs) throw new Error("User data missing");

      const systemInstruction = SYSTEM_PROMPT_TEMPLATE(user, prefs);
      
      const historyParts = history.slice(-10).map(msg => ({
          role: msg.role,
          parts: [{ text: msg.text }]
      }));

      const chat = aiClient.chats.create({
        model: modelName,
        config: {
          systemInstruction: systemInstruction,
          temperature: 0.7,
        },
        history: historyParts as Content[],
      });

      const result = await chat.sendMessage({ message });
      storageService.deductCreditOrUsage(userId);
      return result.text || "Désolé, je n'ai pas pu générer de réponse.";

  }, userId);
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

        const historyParts = history.slice(-6).map(msg => ({
            role: msg.role,
            parts: [{ text: msg.text }]
        }));

        const chat = aiClient.chats.create({
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

        const imageModel = 'gemini-2.5-flash-image';
        
        const response = await aiClient.models.generateContent({
            model: imageModel,
            contents: {
                parts: [{ text: prompt }]
            },
            config: {
                imageConfig: {
                    aspectRatio: "16:9",
                }
            }
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
}

export const generateRoleplayResponse = async (
    history: ChatMessage[],
    scenario: string,
    userProfile: UserProfile,
    isClosing: boolean = false
): Promise<RoleplayResponse> => {
    const status = storageService.canPerformRequest(userProfile.id);
    if (!status.allowed) throw new Error("INSUFFICIENT_CREDITS");

    return executeWithRetry(async (modelName) => {
        if (!aiClient) initializeGenAI();
        if (!aiClient) throw new Error("AI Client not initialized");

        const context = history.map(m => `${m.role === 'user' ? 'Student' : 'Partner'}: ${m.text}`).join('\n');
        
        let personaDescription = "A helpful native speaker.";
        if (scenario.includes("market")) personaDescription = "A friendly but shrewd market vendor selling fresh produce. You want to sell more, but you are open to bargaining.";
        if (scenario.includes("Meeting")) personaDescription = "A friendly local meeting the student at a cafe. You are curious about where they are from.";
        if (scenario.includes("Restaurant")) personaDescription = "A busy waiter at a popular restaurant. You are polite but efficient.";
        if (scenario.includes("directions") || scenario.includes("Travel")) personaDescription = "A helpful pedestrian on the street giving directions to a lost tourist.";
        if (scenario.includes("doctor") || scenario.includes("symptoms")) personaDescription = "A caring and professional doctor asking about symptoms.";
        if (scenario.includes("teacher") || scenario.includes("homework")) personaDescription = "A supportive teacher discussing homework with a student.";

        let prompt = `
            SETUP:
            - You are playing a ROLE in a dialogue. You are NOT an AI assistant, you are the character.
            - CHARACTER: ${personaDescription}
            - LANGUAGE: ${userProfile.preferences?.targetLanguage} (Strictly).
            - STUDENT LEVEL: ${userProfile.preferences?.level}.

            SCENARIO CONTEXT: ${scenario}

            YOUR OBJECTIVES:
            1. Drive the conversation forward. Don't just answer "yes" or "no".
            2. Influence the student to talk about the situation. Ask relevant follow-up questions.
            3. React realistically to what the student says (e.g., if they offer a low price in the market, react surprised).
            4. Keep your language complexity appropriate for their level (${userProfile.preferences?.level}), but natural.

            CORRECTION RULES:
            - If the student makes a mistake, provide a SHORT correction in the 'correction' field.
            - Only correct significant errors that affect meaning or flow. Ignore minor typos.
            - If correct, set 'correction' to null.

            INPUT CONVERSATION:
            ${context}

            RESPONSE FORMAT (JSON):
            {
                "aiReply": "string (Your character's response in target language)",
                "correction": "string | null (e.g. 'Better way to say it: ...')"
            }
        `;

        if (isClosing) {
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
