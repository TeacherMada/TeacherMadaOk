
import { GoogleGenAI, Chat, Content, Type, Modality } from "@google/genai";
import { UserProfile, UserPreferences, ChatMessage, DailyChallenge, ExerciseItem, ExplanationLanguage, VoiceCallSummary } from "../types";
import { SYSTEM_PROMPT_TEMPLATE } from "../constants";
import { storageService } from "./storageService";

let aiClient: GoogleGenAI | null = null;
let currentKeyIndex = 0;

// === MODEL CONFIGURATION ===
const PRIMARY_MODEL = 'gemini-3-flash-preview'; 

const FALLBACK_CHAIN = [
    'gemini-2.0-flash',              
    'gemini-2.0-flash-lite-preview', 
    'gemini-1.5-flash'               
];

const getAvailableKeys = (): string[] => {
    const settings = storageService.getSystemSettings();
    let keys: string[] = settings.apiKeys && settings.apiKeys.length > 0 ? settings.apiKeys : [];
    
    const envKey = (import.meta as any).env.VITE_GOOGLE_API_KEY;
    if (envKey && typeof envKey === 'string' && !keys.includes(envKey)) {
        keys.push(envKey);
    }
    
    return Array.from(new Set<string>(keys)).filter((k: string) => k && k.trim().length > 0);
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
        currentKeyIndex = Math.floor(Math.random() * keys.length);
    }

    const apiKey = keys[currentKeyIndex];
    aiClient = new GoogleGenAI({ apiKey });
    
    return getActiveModelName(); 
};

const getActiveModelName = () => {
    const settings = storageService.getSystemSettings();
    return settings.activeModel || PRIMARY_MODEL;
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
        const isQuotaError = error.message?.includes('429') || error.message?.includes('quota') || error.message?.includes('resource_exhausted');
        const isModelNotFoundError = error.message?.includes('404') || error.message?.includes('not found') || error.message?.includes('models/');
        
        const keys = getAvailableKeys();

        if (isQuotaError || isModelNotFoundError) {
            if (isQuotaError && attempt < keys.length) {
                initializeGenAI(true); 
                return executeWithRetry(operation, userId, attempt + 1, fallbackIndex);
            } 
            
            if (fallbackIndex < FALLBACK_CHAIN.length - 1) {
                const nextFallbackIndex = fallbackIndex + 1;
                initializeGenAI(true); 
                return executeWithRetry(operation, userId, 0, nextFallbackIndex);
            }
        }
        
        throw error;
    }
};

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
  initializeGenAI(); 
  if (!aiClient) throw new Error("AI Client not initialized");
  return null; 
};

export const sendMessageToGemini = async (message: string, userId: string): Promise<string> => {
  checkCreditsBeforeAction(userId);

  return executeWithRetry(async (modelName) => {
      if (!aiClient) initializeGenAI();
      if (!aiClient) throw new Error("AI not init");

      const history = await storageService.getChatHistory(userId);
      const user = await storageService.getUserById(userId);
      const prefs = user?.preferences;
      
      if (!user || !prefs) throw new Error("User data missing");

      // Use specific system prompt with Level details
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
    const status = storageService.canPerformRequest(userId);
    if (!status.allowed) throw new Error("INSUFFICIENT_CREDITS");

    return executeWithRetry(async (modelName) => {
        if (!aiClient) initializeGenAI();
        if (!aiClient) throw new Error("AI not init");

        const user = await storageService.getUserById(userId);
        if (!user || !user.preferences) throw new Error("User data missing");

        // PROMPT OPTIMISÉ POUR VITESSE & HUMANITÉ
        const systemInstruction = `
            ROLE: You are TeacherMada, a professional, human language tutor.
            STRICT RULES:
            1. NEVER say you are an AI, robot, or assistant. You are a real teacher on a phone call.
            2. KEEP RESPONSES ULTRA SHORT. 1-2 sentences maximum. Speed is critical.
            3. Act natural. Use fillers like "Hmm", "Exactement", "D'accord".
            4. If the student makes a mistake, correct it gently and quickly, then ask a follow-up question.
            5. ADAPT to level: ${user.preferences.level}. Target Language: ${user.preferences.targetLanguage}.
            6. If user sends text input instead of voice, treat it as if they spoke it.
        `;

        const historyParts = history.slice(-6).map(msg => ({
            role: msg.role,
            parts: [{ text: msg.text }]
        }));

        const chat = aiClient.chats.create({
            model: 'gemini-2.0-flash', // Use Flash for maximum speed on Voice
            config: {
                systemInstruction: systemInstruction,
                temperature: 0.7,
                maxOutputTokens: 100, // Hard limit to ensure speed
            },
            history: historyParts as Content[],
        });

        const result = await chat.sendMessage({ message });
        
        // Deduct Credit specifically for voice response here
        storageService.deductCreditOrUsage(userId);
        
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

        const user = await storageService.getUserById(userId);
        if (!user || !user.preferences) throw new Error("User data missing");

        const conversation = history.slice(-10).map(m => `${m.role}: ${m.text}`).join('\n');

        const prompt = `
            Act as a Lead Teacher analyzing a student's oral session.
            Student Level: ${user.preferences.level}.
            Context: ${conversation}

            Output valid JSON only:
            {
                "score": number (1-10),
                "feedback": "string (A polite, constructive feedback in ${user.preferences.explanationLanguage}. Max 2 sentences.)",
                "tip": "string (One specific tip to improve.)"
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
            feedback: json.feedback || "Bonne pratique ! Continuez comme ça.",
            tip: json.tip || "Essayez de parler un peu plus fort."
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
    startNew: boolean = false
): Promise<RoleplayResponse> => {
    const status = storageService.canPerformRequest(userProfile.id);
    if (!status.allowed) throw new Error("INSUFFICIENT_CREDITS");

    return executeWithRetry(async (modelName) => {
        if (!aiClient) initializeGenAI();
        if (!aiClient) throw new Error("AI Client not initialized");

        const context = history.map(m => `${m.role === 'user' ? 'Student' : 'You'}: ${m.text}`).join('\n');
        const lang = userProfile.preferences?.targetLanguage;
        const level = userProfile.preferences?.level;
        const explainLang = userProfile.preferences?.explanationLanguage;

        // Base Scenario Descriptions
        let personaDescription = "A helpful native speaker.";
        if (scenario.includes("market")) personaDescription = "A shrewd but friendly market vendor. You want to sell, but engage in bargaining.";
        if (scenario.includes("Meeting")) personaDescription = "A friendly local meeting a new foreigner. You are curious.";
        if (scenario.includes("Restaurant")) personaDescription = "A waiter. Polite, efficient, asking about preferences.";
        if (scenario.includes("Travel")) personaDescription = "A busy station agent or helpful local. Clear instructions.";
        if (scenario.includes("Doctor") || scenario.includes("Docteur")) personaDescription = "A caring doctor. Asking symptoms, giving advice.";
        if (scenario.includes("School") || scenario.includes("École")) personaDescription = "A teacher discussing progress.";
        if (scenario.includes("Job") || scenario.includes("Entretien")) personaDescription = "An interviewer. Professional, asking about skills.";

        let prompt = ``;

        if (startNew) {
            prompt = `
                TASK: Start a roleplay conversation.
                ROLE: ${personaDescription}
                SCENARIO: ${scenario}
                TARGET LANGUAGE: ${lang}.
                STUDENT LEVEL: ${level}.
                
                INSTRUCTION: 
                1. Start the conversation with a greeting and a question relevant to the scenario.
                2. Use language appropriate for level ${level}.
                3. Be engaging.
                
                RESPONSE FORMAT (JSON):
                {
                    "aiReply": "string (Your opening line in ${lang})"
                }
            `;
        } else if (isClosing) {
            prompt = `
                ROLE: Language Examiner.
                TASK: End the roleplay scenario: ${scenario}.
                Analyze the student's performance below.
                
                CONVERSATION:
                ${context}
                
                CRITERIA:
                - Grammar & Vocabulary suitable for ${level}.
                - Fluency & Relevance.
                - Effort to speak ${lang}.
                
                SCORING RULES:
                - If the student spoke mostly their native language instead of ${lang}, score MUST be < 6.
                - If the student made many basic errors for level ${level}, score < 10.
                - If communication was clear despite errors, score > 10.
                
                RESPONSE FORMAT (JSON):
                {
                    "aiReply": "Brief goodbye message in ${lang}.",
                    "score": number (0-20), 
                    "feedback": "string (Constructive feedback in ${explainLang}, mentioning specific mistakes or good points)"
                }
            `;
        } else {
            prompt = `
                TASK: Continue the roleplay.
                ROLE: ${personaDescription}
                SCENARIO: ${scenario}
                TARGET LANGUAGE: ${lang} (Strictly).
                EXPLANATION LANGUAGE: ${explainLang}.
                STUDENT LEVEL: ${level}.

                YOUR BEHAVIOR:
                1. Drive the conversation. Ask follow-up questions.
                2. React realistically.
                3. IMPORTANT: Check if the student made a mistake in their last message.
                
                CORRECTION LOGIC:
                - If the student used the wrong language (not ${lang}), correct them firmly but politely.
                - If the student made a grammar/vocab error, provide the corrected version in 'correction' field and a SHORT explanation in 'explanation' field.
                - If correct, set 'correction' to null.

                INPUT CONVERSATION:
                ${context}

                RESPONSE FORMAT (JSON):
                {
                    "aiReply": "string (Your response in ${lang})",
                    "correction": "string | null (The corrected sentence if needed)",
                    "explanation": "string | null (Brief grammar/vocab rule in ${explainLang} if corrected)"
                }
            `;
        }

        const response = await aiClient.models.generateContent({
            model: modelName,
            contents: prompt,
            config: { 
                responseMimeType: "application/json",
                temperature: 0.7 
            }
        });

        return JSON.parse(response.text || "{}") as RoleplayResponse;
    }, userProfile.id);
};
