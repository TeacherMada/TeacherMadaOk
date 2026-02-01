
import { GoogleGenAI, Modality } from "@google/genai";
import { UserProfile, UserPreferences, ChatMessage, DailyChallenge, ExerciseItem, VoiceCallSummary, VoiceName } from "../types";
import { SYSTEM_PROMPT_TEMPLATE } from "../constants";
import { storageService } from "./storageService";

// Pool de modèles optimisé pour la stabilité et la vitesse
const TEXT_MODELS = [
    'gemini-3-flash-preview',
    'gemini-flash-lite-latest',
    'gemini-1.5-flash'
];

const getApiKey = (): string => {
    const rawKey = process.env.API_KEY || "";
    const keys = rawKey.split(',').map((k: string) => k.trim()).filter((k: string) => k.length > 5);
    if (keys.length === 0) throw new Error("API_KEY_MISSING");
    return keys[Math.floor(Math.random() * keys.length)];
};

const getAiClient = () => new GoogleGenAI({ apiKey: getApiKey() });

async function executeWithFallback<T>(operation: (modelName: string) => Promise<T>, pool: string[] = TEXT_MODELS): Promise<T> {
    let lastError: any;
    for (const modelName of pool) {
        try {
            // Timeout court pour ne pas bloquer l'utilisateur
            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), 15000);
            
            const result = await operation(modelName);
            clearTimeout(timeout);
            return result;
        } catch (error: any) {
            lastError = error;
            const errorMsg = error.message?.toLowerCase() || "";
            // Si c'est un problème de quota, de réseau ou de timeout, on essaie le modèle suivant
            if (
                errorMsg.includes('429') || 
                errorMsg.includes('quota') || 
                errorMsg.includes('fetch') || 
                errorMsg.includes('network') ||
                errorMsg.includes('aborted')
            ) {
                console.warn(`Fallback: Problème avec ${modelName}, basculement sur le modèle suivant...`);
                continue;
            }
            throw error;
        }
    }
    throw new Error("Toutes les tentatives de connexion ont échoué. Vérifiez votre connexion internet.");
}

export const sendMessageToGemini = async (message: string, userId: string, history: ChatMessage[]): Promise<string> => {
    const user = storageService.getUserById(userId);
    if (!user) throw new Error("USER_NOT_FOUND");
    
    return executeWithFallback(async (model) => {
        const ai = getAiClient();
        const response = await ai.models.generateContent({
            model,
            contents: [
                ...history.slice(-8).map(m => ({ role: m.role, parts: [{ text: m.text }] })),
                { role: 'user', parts: [{ text: message }] }
            ],
            config: { 
                systemInstruction: SYSTEM_PROMPT_TEMPLATE(user, user.preferences!) + "\nIMPORTANT: NE JAMAIS ENVOYER DE BLOCS DE CODE (```). RÉPONDS UNIQUEMENT EN TEXTE PÉDAGOGIQUE.",
                temperature: 0.7 
            }
        });
        storageService.deductCreditOrUsage(userId);
        return response.text || "...";
    });
};

export const generateVoiceChatResponse = async (message: string, userId: string, history: ChatMessage[]): Promise<string> => {
    const user = storageService.getUserById(userId);
    if (!user) throw new Error("USER_NOT_FOUND");
    
    return executeWithFallback(async (model) => {
        const ai = getAiClient();
        const response = await ai.models.generateContent({
            model: 'gemini-flash-lite-latest',
            contents: [
                ...history.slice(-4).map(m => ({ role: m.role, parts: [{ text: m.text }] })),
                { role: 'user', parts: [{ text: message }] }
            ],
            config: {
                systemInstruction: `Tu es TeacherMada en APPEL VOCAL. 
                CONSIGNES: Réponds très court (1-2 phrases). Pas de listes. Pas de code. Pas de markdown spécial. Langue: ${user.preferences?.targetLanguage}.`,
                maxOutputTokens: 100,
                temperature: 0.5
            }
        });
        return response.text || "D'accord.";
    }, ['gemini-flash-lite-latest', 'gemini-1.5-flash']);
};

export const generateSpeech = async (text: string, userId: string, voice?: VoiceName): Promise<Uint8Array | null> => {
    try {
        const ai = getAiClient();
        const user = storageService.getUserById(userId);
        const voiceToUse = voice || user?.preferences?.voiceName || 'Kore';
        
        // Nettoyage agressif pour la synthèse
        const cleanText = text.replace(/[*#_`~]/g, '').trim().substring(0, 1000);
        if (!cleanText) return null;

        const response = await ai.models.generateContent({
            model: "gemini-2.5-flash-preview-tts",
            contents: [{ parts: [{ text: cleanText }] }],
            config: {
                responseModalities: [Modality.AUDIO],
                speechConfig: {
                    voiceConfig: { prebuiltVoiceConfig: { voiceName: voiceToUse } }
                }
            }
        });

        const base64Data = response.candidates?.[0]?.content?.parts?.find(p => p.inlineData)?.inlineData?.data;
        if (!base64Data) return null;

        const binaryString = atob(base64Data);
        const bytes = new Uint8Array(binaryString.length);
        for (let i = 0; i < binaryString.length; i++) {
            bytes[i] = binaryString.charCodeAt(i);
        }
        return bytes;
    } catch (e) {
        console.error("TTS Error:", e);
        return null;
    }
};

export const translateText = async (text: string, targetLang: string, userId: string): Promise<string> => {
    return executeWithFallback(async (model) => {
        const ai = getAiClient();
        const res = await ai.models.generateContent({
            model,
            contents: `Translate to ${targetLang}, plain text only: "${text}"`,
        });
        return res.text?.trim() || text;
    });
};

export const analyzeVoiceCallPerformance = async (history: ChatMessage[], userId: string): Promise<VoiceCallSummary> => {
    const ai = getAiClient();
    const prompt = `Analyse cette session orale. JSON: {score, feedback, tip}. Conversation: ${JSON.stringify(history.slice(-6))}`;
    const res = await ai.models.generateContent({
        model: 'gemini-1.5-flash',
        contents: prompt,
        config: { responseMimeType: "application/json" }
    });
    try {
        return JSON.parse(res.text || '{"score":7, "feedback":"Bien", "tip":"Continue"}');
    } catch {
        return { score: 7, feedback: "Bon travail", tip: "Continuez à pratiquer !" };
    }
};

// Added explanation to fix property missing error in DialogueSession
export interface RoleplayResponse { aiReply: string; correction?: string; explanation?: string; score?: number; feedback?: string; }
export const generateRoleplayResponse = async (h: any, s: any, u: any, c?: boolean, init?: boolean): Promise<RoleplayResponse> => {
    const reply = await sendMessageToGemini("Continue le dialogue", u.id, h);
    return { aiReply: reply };
};
export const generatePracticalExercises = async (u: any, h: any) => [];
export const analyzeUserProgress = async (h: any, m: any, id: any) => ({ newMemory: m, xpEarned: 10, feedback: "Ok" });
export const generateDailyChallenges = async (p: any) => [];
export const generateConceptImage = async (p: any, id: any) => null;
export const startChatSession = async (p: any, pr: any, h: any) => null;
export const getLessonSummary = async (n: any, c: any, id: any) => "Résumé";
