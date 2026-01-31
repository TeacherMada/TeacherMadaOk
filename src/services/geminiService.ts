
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
      console.error("CRITICAL: No API Keys available in System Settings or Environment.");
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
        const keys = getAvailableKeys();

        if (attempt < keys.length * 2) {
            initializeGenAI(true); 
            let nextFallback = fallbackIndex;
            if (attempt > 0 && attempt % keys.length === 0) {
                nextFallback = fallbackIndex + 1;
            }
            await new Promise(resolve => setTimeout(resolve, 1000 * (attempt + 1)));
            return executeWithRetry(operation, userId, attempt + 1, nextFallback);
        }
        throw new Error("Service IA momentanément indisponible. Réessayez.");
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
): Promise<{ fullText: string }> => {
    checkCreditsBeforeAction(userId);
    return executeWithRetry(async (modelName) => {
        if (!aiClient) initializeGenAI();
        const user = storageService.getUserById(userId);
        if (!user || !user.preferences) throw new Error("User data missing");
        
        const systemInstruction = SYSTEM_PROMPT_TEMPLATE(user, user.preferences);
        const historyPayload = previousHistory.map(m => ({ role: m.role, parts: [{ text: m.text }] }));

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

export const generateVoiceChatResponse = async (message: string, userId: string, previousHistory: ChatMessage[]) => {
    checkCreditsBeforeAction(userId);
    return executeWithRetry(async () => {
        if (!aiClient) initializeGenAI();
        const user = storageService.getUserById(userId);
        const chat = aiClient!.chats.create({
            model: 'gemini-1.5-flash',
            config: {
                systemInstruction: `ACT: Tutor. USER: ${user?.username}. LANG: ${user?.preferences?.targetLanguage}. KEEP SHORT (15 words max).`,
                temperature: 0.6, 
                maxOutputTokens: 50,
            },
            history: previousHistory.slice(-6).map(m => ({ role: m.role, parts: [{ text: m.text }] })),
        });
        const result = await chat.sendMessage({ message });
        return result.text || "Je vous écoute.";
    }, userId);
};

export const generateSpeech = async (text: string, userId: string): Promise<ArrayBuffer | null> => {
    const status = storageService.canPerformRequest(userId);
    if (!status.allowed) return null; 
    return executeWithRetry(async () => {
        if (!aiClient) initializeGenAI(); 
        const response = await aiClient!.models.generateContent({
            model: "gemini-2.5-flash-preview-tts",
            contents: [{ parts: [{ text: text.substring(0, 500) }] }],
            config: { responseModalities: [Modality.AUDIO], speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Kore' } } } },
        });
        const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
        if (!base64Audio) return null;
        const binaryString = atob(base64Audio);
        const bytes = new Uint8Array(binaryString.length);
        for (let i = 0; i < binaryString.length; i++) bytes[i] = binaryString.charCodeAt(i);
        return bytes.buffer;
    }, userId);
};

export const generateLevelExample = async (language: string, level: string): Promise<string | null> => {
    return executeWithRetry(async (modelName) => {
        if (!aiClient) initializeGenAI();
        const prompt = `Génère une phrase d'exemple amusante, utile ou culturellement intéressante en ${language} pour le niveau ${level}. 
        Format: La phrase en langue cible (Traduction française).
        Exemple: "I love coding" (J'adore coder).
        Pas de markdown, pas de listes. Juste la phrase et sa traduction.`;
        
        const response = await aiClient!.models.generateContent({
            model: modelName,
            contents: prompt,
            config: { temperature: 0.8, maxOutputTokens: 60 }
        });
        return response.text?.trim() || null;
    }, 'system');
};

export const generateVocabularyFromHistory = async (userId: string, history: ChatMessage[]): Promise<VocabularyItem[]> => {
    return executeWithRetry(async (modelName) => {
        if (!aiClient) initializeGenAI();
        const conversation = history.slice(-10).map(m => m.text).join('\n');
        const prompt = `Extract 5 key vocabulary words from conversation. JSON: [{ "word": "string", "translation": "string", "context": "string" }]`;
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
        const response = await aiClient!.models.generateContent({ model: modelName, contents: `Translate to ${targetLang}: ${text}` });
        storageService.deductCreditOrUsage(userId);
        return response.text?.trim() || text;
    }, userId);
};

export const getLessonSummary = async (num: number, ctx: string, userId: string) => { 
    return executeWithRetry(async (modelName) => {
        if (!aiClient) initializeGenAI();
        const response = await aiClient!.models.generateContent({ model: modelName, contents: `Summarize lesson ${num} from context: ${ctx}` });
        return response.text || "Résumé indisponible.";
    }, userId);
};

export const generateConceptImage = async (prompt: string, userId: string) => { 
    return executeWithRetry(async () => {
        if (!aiClient) initializeGenAI();
        
        // Define config as 'any' to bypass TS check for imageConfig which is present in API but missing in SDK types
        const modelConfig: any = {
            imageConfig: { aspectRatio: "16:9" }
        };

        const response = await aiClient!.models.generateContent({
            model: 'gemini-2.5-flash-image',
            contents: { parts: [{ text: prompt }] },
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
        const prompt = `Generate 3 short language challenges for ${prefs.targetLanguage} ${prefs.level}. JSON: [{ "description": "string", "type": "message_count"|"vocabulary"|"lesson_complete", "targetCount": number, "xpReward": number }]`;
        const response = await aiClient!.models.generateContent({ 
            model: modelName, 
            contents: prompt,
            config: { responseMimeType: "application/json" }
        });
        const json = JSON.parse(response.text || "[]");
        return json.map((item: any, idx: number) => ({ ...item, id: `daily_${Date.now()}_${idx}`, currentCount: 0, isCompleted: false }));
    }, 'system');
};

export const analyzeUserProgress = async (history: ChatMessage[], mem: string, userId: string) => { 
    return executeWithRetry(async (modelName) => {
        if (!aiClient) initializeGenAI();
        const prompt = `Analyze progress. Old Memory: ${mem}. Chat: ${history.slice(-5).map(m=>m.text).join('\n')}. JSON: { "newMemory": "string", "xpEarned": number, "feedback": "string" }`;
        const response = await aiClient!.models.generateContent({ 
            model: modelName, 
            contents: prompt,
            config: { responseMimeType: "application/json" }
        });
        storageService.deductCreditOrUsage(userId);
        return JSON.parse(response.text || `{"newMemory": "${mem}", "xpEarned": 10, "feedback": "Good job"}`);
    }, userId);
};

export const generatePracticalExercises = async (profile: UserProfile, history: ChatMessage[]): Promise<ExerciseItem[]> => { 
    return executeWithRetry(async (modelName) => {
        if (!aiClient) initializeGenAI();
        const prompt = `Generate 5 exercises for ${profile.preferences?.targetLanguage} ${profile.preferences?.level}. JSON: [{ "type": "multiple_choice"|"true_false"|"fill_blank", "question": "string", "options": ["string"]?, "correctAnswer": "string", "explanation": "string" }]`;
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

export interface RoleplayResponse {
    aiReply: string;
    correction?: string;
    explanation?: string;
    score?: number;
    feedback?: string;
}

export const generateRoleplayResponse = async (
    hist: ChatMessage[], 
    scen: string, 
    user: UserProfile, 
    closing: boolean = false, 
    init: boolean = false
): Promise<RoleplayResponse> => {
    return executeWithRetry(async (modelName) => {
        if (!aiClient) initializeGenAI();
        
        const context = hist.map(m => `${m.role === 'user' ? 'Student' : 'Partner'}: ${m.text}`).join('\n');
        let prompt = "";
        
        if (init) {
             prompt = `START ROLEPLAY: ${scen}. You start. Target Lang: ${user.preferences?.targetLanguage}. Level: ${user.preferences?.level}. JSON: { "aiReply": "string" }`;
        } else if (closing) {
             prompt = `END ROLEPLAY: ${scen}. Evaluate Student. JSON: { "aiReply": "Bye", "score": number (0-20), "feedback": "string" }`;
        } else {
             prompt = `CONTINUE ROLEPLAY: ${scen}. User said last. Reply. If error, correct. JSON: { "aiReply": "...", "correction": "string" | null, "explanation": "string" | null }`;
        }

        const response = await aiClient!.models.generateContent({
            model: modelName,
            contents: prompt + "\n\nCONTEXT:\n" + context,
            config: { responseMimeType: "application/json" }
        });
        
        const json = JSON.parse(response.text || "{}");
        return {
            aiReply: json.aiReply || "...",
            correction: json.correction,
            explanation: json.explanation,
            score: json.score,
            feedback: json.feedback
        };
    }, user.id);
};

export const analyzeVoiceCallPerformance = async (history: ChatMessage[], userId: string): Promise<VoiceCallSummary> => { 
    return executeWithRetry(async (modelName) => {
        if (!aiClient) initializeGenAI();
        const prompt = `Analyze voice call. JSON: { "score": number (1-10), "feedback": "string", "tip": "string" }`;
        const response = await aiClient!.models.generateContent({ 
            model: modelName, 
            contents: prompt + "\n" + history.map(m=>m.text).join('\n'),
            config: { responseMimeType: "application/json" }
        });
        return JSON.parse(response.text || `{"score": 7, "feedback": "Bien", "tip": "Continuez"}`);
    }, userId);
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
