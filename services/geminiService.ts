
import { GoogleGenAI, Chat, Content, Type, Modality } from "@google/genai";
import { UserProfile, UserPreferences, ChatMessage, DailyChallenge, ExerciseItem } from "../types";
import { SYSTEM_PROMPT_TEMPLATE } from "../constants";
import { storageService } from "./storageService";

let aiClient: GoogleGenAI | null = null;
let chatSession: Chat | null = null;
let currentKeyIndex = 0;

// Model Configuration: Robust Fallback Chain
// If the primary model (gemini-3-flash-preview) fails, we try these in order.
const FALLBACK_CHAIN = [
    'gemini-2.0-flash',              // Standard Fast & Free-tier eligible
    'gemini-2.0-flash-lite-preview', // Extremely fast/cheap
    'gemini-1.5-flash'               // Legacy Stable fallback
];

// Helper to get all available keys
const getAvailableKeys = (): string[] => {
    const settings = storageService.getSystemSettings();
    let keys = settings.apiKeys && settings.apiKeys.length > 0 ? settings.apiKeys : [];
    
    // Add env key if not present
    const envKey = process.env.API_KEY;
    if (envKey && !keys.includes(envKey)) {
        keys.push(envKey);
    }
    
    return keys.filter(k => k && k.trim().length > 0);
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
    
    return getActiveModelName();
};

const getActiveModelName = () => {
    const settings = storageService.getSystemSettings();
    return settings.activeModel || 'gemini-3-flash-preview';
};

// Wrapper to handle retries on Quota Exceeded and Model Fallback
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

        // LOGIC:
        // 1. If 429 (Quota), try rotating keys on CURRENT model first.
        // 2. If 404 (Not Found) OR all keys exhausted for current model, switch to NEXT model in chain.

        if (isQuotaError || isModelNotFoundError) {
            const errorType = isQuotaError ? 'Quota' : 'ModelNot Found';
            console.warn(`${errorType} error. KeyIdx: ${currentKeyIndex}. ModelFallbackIdx: ${fallbackIndex}. Retrying...`);

            // Strategy A: Rotate Key (Only for Quota errors, not Model Not Found)
            if (isQuotaError && attempt < keys.length) {
                initializeGenAI(true); // Rotate key
                return executeWithRetry(operation, userId, attempt + 1, fallbackIndex);
            } 
            
            // Strategy B: Switch Model (If Key rotation failed OR Model Not Found)
            if (fallbackIndex < FALLBACK_CHAIN.length - 1) {
                const nextFallbackIndex = fallbackIndex + 1;
                console.warn(`Switching to fallback model: ${FALLBACK_CHAIN[nextFallbackIndex]}`);
                // Reset key attempts for the new model
                initializeGenAI(false); 
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
    checkCreditsBeforeAction(userId);
    
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

        storageService.deductCreditOrUsage(userId);

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

        // Iterate parts to find the image
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

      // Contextual exercise generation based on recent chat
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
      // Cleanup if model returns markdown block
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
    // Note: Credits for roleplay are deducted by time in the component, not per message here.
    const status = storageService.canPerformRequest(userProfile.id);
    if (!status.allowed) throw new Error("INSUFFICIENT_CREDITS");

    return executeWithRetry(async (modelName) => {
        if (!aiClient) initializeGenAI();
        if (!aiClient) throw new Error("AI Client not initialized");

        // Format history for the model
        const context = history.map(m => `${m.role === 'user' ? 'Student' : 'Partner'}: ${m.text}`).join('\n');
        
        // Intelligent Persona Definition based on Scenario context
        // This makes the AI "smarter" and not just a generic chatbot
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
                temperature: 0.8 // Slightly higher temperature for more creative roleplay
            }
        });

        return JSON.parse(response.text || "{}") as RoleplayResponse;
    }, userProfile.id);
};
