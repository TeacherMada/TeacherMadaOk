
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
    
    // Correction CRITIQUE : Remplacement de process.env par import.meta.env
    const envKey = (import.meta as any).env.VITE_GOOGLE_API_KEY as string;
    if (envKey && !keys.includes(envKey)) {
        keys.push(envKey);
    }
    
    return Array.from(new Set(keys)).filter((k: string) => k && k.trim().length > 0);
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
  // Mode sécurisé : On passe par le backend via storageService
  return storageService.generateAIResponse(message, await storageService.getChatHistory(userId));
};

export const generateVoiceChatResponse = async (
    message: string, 
    userId: string, 
    history: ChatMessage[]
): Promise<string> => {
    // Mode sécurisé : On passe par le backend
    return storageService.generateAIResponse(message, history, 'gemini-1.5-flash');
};

export const analyzeVoiceCallPerformance = async (
    history: ChatMessage[],
    userId: string
): Promise<VoiceCallSummary> => {
    return {
        score: 8,
        feedback: "Bien parlé ! (Analyse simulée pour l'instant)",
        tip: "Attention à la prononciation."
    };
};

export const translateText = async (text: string, targetLang: string, userId: string): Promise<string> => {
    checkCreditsBeforeAction(userId);
    return storageService.generateAIResponse(`Traduis ceci en ${targetLang}: ${text}`, []);
};

export const getLessonSummary = async (lessonNumber: number, context: string, userId: string): Promise<string> => {
    checkCreditsBeforeAction(userId);
    return storageService.generateAIResponse(`Résumé leçon ${lessonNumber}: ${context}`, []);
};

export const generateSpeech = async (text: string, userId: string, voiceName: string = 'Kore'): Promise<ArrayBuffer | null> => {
    console.warn("TTS déplacé vers le backend pour sécurité.");
    return null;
};

export const generateConceptImage = async (prompt: string, userId: string): Promise<string | null> => {
    console.warn("Generation image déplacée vers le backend.");
    return null;
};

export const generateDailyChallenges = async (prefs: UserPreferences): Promise<DailyChallenge[]> => {
    return [
        {
            id: '1',
            description: `Écrire 5 phrases en ${prefs.targetLanguage}`,
            type: 'message_count',
            targetCount: 5,
            currentCount: 0,
            xpReward: 50,
            isCompleted: false
        }
    ];
};

export const analyzeUserProgress = async (
    history: ChatMessage[], 
    currentMemory: string,
    userId: string
): Promise<{ newMemory: string; xpEarned: number; feedback: string }> => {
    return {
        newMemory: currentMemory,
        xpEarned: 15,
        feedback: "Session enregistrée."
    };
};

export const generatePracticalExercises = async (
  profile: UserProfile,
  history: ChatMessage[]
): Promise<ExerciseItem[]> => {
  // Simulé pour éviter erreur
  return [];
};

export const generateRoleplayResponse = async (
    history: ChatMessage[],
    scenario: string,
    userProfile: UserProfile,
    isClosing: boolean = false
): Promise<{aiReply: string, correction?: string, score?: number, feedback?: string}> => {
    const prompt = isClosing 
        ? `End roleplay: ${scenario}. Give feedback.` 
        : `Roleplay: ${scenario}. Context: ${JSON.stringify(history)}`;
        
    const text = await storageService.generateAIResponse(prompt, history);
    return { aiReply: text, correction: null };
};
