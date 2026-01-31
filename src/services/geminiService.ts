
import { GoogleGenAI, Chat, Content, Type, Modality } from "@google/genai";
import { UserProfile, UserPreferences, ChatMessage, DailyChallenge, ExerciseItem, ExplanationLanguage, VoiceCallSummary, VocabularyItem } from "../types";
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
    
    // @ts-ignore
    const envKey = import.meta.env.VITE_GOOGLE_API_KEY;
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

// --- STREAMING IMPLEMENTATION ---
export const sendMessageToGeminiStream = async (
    message: string, 
    userId: string,
    onChunk: (text: string) => void
): Promise<string> => {
    checkCreditsBeforeAction(userId);

    return executeWithRetry(async (modelName) => {
        if (!aiClient) initializeGenAI();
        if (!aiClient) throw new Error("AI not init");

        const history = await storageService.getChatHistory(userId);
        const user = await storageService.getUserById(userId);
        const prefs = user?.preferences;
        
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
  // Fallback to non-streaming if needed, essentially wraps the stream
  let fullText = '';
  await sendMessageToGeminiStream(message, userId, (chunk) => fullText += chunk);
  return fullText;
};

export const generateVocabularyFromHistory = async (userId: string, history: ChatMessage[]): Promise<VocabularyItem[]> => {
    checkCreditsBeforeAction(userId);

    return executeWithRetry(async (modelName) => {
        if (!aiClient) initializeGenAI();
        if (!aiClient) throw new Error("AI not init");

        const user = await storageService.getUserById(userId);
        if (!user || !user.preferences) return [];

        const context = history.slice(-6).map(m => m.text).join('\n');
        
        const prompt = `
            Based on this conversation history, extract 3-5 important vocabulary words or expressions the user should learn.
            Target Language: ${user.preferences.targetLanguage}.
            Explanation Language: ${user.preferences.explanationLanguage}.
            
            Conversation:
            ${context}

            Output ONLY a JSON array:
            [
                { "word": "word in target lang", "translation": "translation in explanation lang", "context": "short example sentence" }
            ]
        `;

        const response = await aiClient.models.generateContent({
            model: modelName,
            contents: prompt,
            config: { responseMimeType: "application/json" }
        });

        storageService.deductCreditOrUsage(userId);
        
        const json = JSON.parse(response.text || "[]");
        return json.map((item: any, idx: number) => ({
            id: `voc_${Date.now()}_${idx}`,
            word: item.word,
            translation: item.translation,
            context: item.context,
            mastered: false,
            addedAt: Date.now()
        }));
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
            model: 'gemini-2.0-flash', 
            config: {
                systemInstruction: systemInstruction,
                temperature: 0.7,
                maxOutputTokens: 100, 
            },
            history: historyParts as Content[],
        });

        const result = await chat.sendMessage({ message });
        
        // Deduct Credit specifically for voice response here if needed, or handled by caller
        // We'll let the caller (time-based) handle deduction usually, but to be safe:
        // storageService.deductCreditOrUsage(userId);
        
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

export const generateRoleplayResponse = async (
    history: ChatMessage[],
    scenario: string,
    userProfile: UserProfile,
    isClosing: boolean = false,
    startNew: boolean = false
): Promise<any> => {
    // This is used for DialogueSession
    const status = storageService.canPerformRequest(userProfile.id);
    if (!status.allowed) throw new Error("INSUFFICIENT_CREDITS");

    return executeWithRetry(async (modelName) => {
        if (!aiClient) initializeGenAI();
        if (!aiClient) throw new Error("AI Client not initialized");

        const context = history.map(m => `${m.role === 'user' ? 'Student' : 'You'}: ${m.text}`).join('\n');
        const lang = userProfile.preferences?.targetLanguage;
        const level = userProfile.preferences?.level;
        const explainLang = userProfile.preferences?.explanationLanguage;

        let personaDescription = "A helpful native speaker.";
        if (scenario.includes("market")) personaDescription = "A shrewd but friendly market vendor.";
        
        let prompt = ``;
        if (startNew) {
             prompt = `TASK: Start a roleplay conversation. ROLE: ${personaDescription} SCENARIO: ${scenario} TARGET LANGUAGE: ${lang}. STUDENT LEVEL: ${level}. INSTRUCTION: Start the conversation with a greeting and a question relevant to the scenario. RESPONSE FORMAT (JSON): { "aiReply": "string" }`;
        } else if (isClosing) {
             prompt = `ROLE: Examiner. TASK: End roleplay: ${scenario}. Analyze: ${context}. SCORING RULES: If native lang used > ${lang}, score < 6. RESPONSE FORMAT (JSON): { "aiReply": "Goodbye msg", "score": number (0-20), "feedback": "string in ${explainLang}" }`;
        } else {
             prompt = `TASK: Continue roleplay. ROLE: ${personaDescription} SCENARIO: ${scenario} TARGET: ${lang}. EXPLAIN: ${explainLang}. LEVEL: ${level}. INPUT: ${context}. CORRECTION LOGIC: If mistake, set 'correction' and 'explanation'. RESPONSE FORMAT (JSON): { "aiReply": "string", "correction": "string|null", "explanation": "string|null" }`;
        }

        const response = await aiClient.models.generateContent({
            model: modelName,
            contents: prompt,
            config: { 
                responseMimeType: "application/json",
                temperature: 0.7 
            }
        });

        return JSON.parse(response.text || "{}");
    }, userProfile.id);
};

export const generateLanguageFlag = async (languageName: string): Promise<{code: string, flag: string}> => {
    // Only used by Admin to generate metadata
    return executeWithRetry(async (modelName) => {
        if (!aiClient) initializeGenAI();
        const prompt = `Generate a standard display name (Ex: 'Italien 🇮🇹') and just the flag emoji (Ex: '🇮🇹') for the language: '${languageName}'. JSON: { "code": "Name + Flag", "flag": "FlagOnly" }`;
        const response = await aiClient!.models.generateContent({
            model: modelName,
            contents: prompt,
            config: { responseMimeType: "application/json" }
        });
        return JSON.parse(response.text || '{"code": "Inconnu", "flag": "❓"}');
    }, 'system');
};
