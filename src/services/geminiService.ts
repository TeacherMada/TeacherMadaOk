import { GoogleGenAI, Modality } from "@google/genai";
import { UserProfile, UserPreferences, ChatMessage, DailyChallenge, ExerciseItem, VoiceCallSummary, VoiceName } from "../types";
import { SYSTEM_PROMPT_TEMPLATE } from "../constants";
import { storageService } from "./storageService";

// Pool de modèles pour assurer la continuité en cas de quota atteint
const MODEL_POOL = [
    'gemini-3-flash-preview',
    'gemini-flash-lite-latest',
    'gemini-1.5-flash'
];

const getApiKey = (): string => {
    // Dans Vite, on utilise import.meta.env.VITE_... 
    // On vérifie plusieurs sources pour être compatible avec Render et le build local
    // @ts-ignore
    const viteKey = import.meta.env?.VITE_API_KEY;
    // @ts-ignore
    const processKey = typeof process !== 'undefined' ? process.env?.API_KEY : undefined;
    
    const rawKeys = viteKey || processKey || "";
    const keys = rawKeys.split(',').map(k => k.trim()).filter(k => k.length > 5);
    
    if (keys.length === 0) {
        console.error("ERREUR CRITIQUE: API_KEY_MISSING. Vérifiez vos variables d'environnement sur Render (VITE_API_KEY).");
        throw new Error("API_KEY_MISSING: Aucune clé API trouvée. Contactez l'administrateur.");
    }
    
    // Rotation aléatoire pour équilibrer la charge entre les clés
    return keys[Math.floor(Math.random() * keys.length)];
};

async function executeWithFallback<T>(operation: (ai: GoogleGenAI, modelName: string) => Promise<T>): Promise<T> {
    let lastError: any;
    
    for (const model of MODEL_POOL) {
        try {
            // On crée une nouvelle instance avec une clé (éventuellement différente) à chaque tentative
            const ai = new GoogleGenAI({ apiKey: getApiKey() });
            return await operation(ai, model);
        } catch (error: any) {
            lastError = error;
            const msg = error.message?.toLowerCase() || "";
            
            // Si erreur de quota (429) ou réseau (fetch failed), on bascule sur la clé/modèle suivant
            if (msg.includes('429') || msg.includes('quota') || msg.includes('fetch') || msg.includes('network')) {
                console.warn(`Instabilité sur ${model}, basculement...`);
                await new Promise(r => setTimeout(r, 500)); // Petit délai de respiration réseau
                continue;
            }
            throw error;
        }
    }
    throw new Error("Connexion impossible après plusieurs tentatives. Vérifiez votre réseau.");
}

export const sendMessageToGemini = async (message: string, userId: string, history: ChatMessage[]): Promise<string> => {
    const user = storageService.getUserById(userId);
    if (!user) throw new Error("USER_NOT_FOUND");
    
    return executeWithFallback(async (ai, model) => {
        const response = await ai.models.generateContent({
            model,
            contents: [
                ...history.slice(-8).map(m => ({ role: m.role, parts: [{ text: m.text }] })),
                { role: 'user', parts: [{ text: message }] }
            ],
            config: { 
                systemInstruction: SYSTEM_PROMPT_TEMPLATE(user, user.preferences!) + 
                "\n\n🚨 RÈGLE ABSOLUE : NE JAMAIS ENVOYER DE BLOCS DE CODE (```). Tu es un professeur de langue, pas un programmeur.",
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
    
    return executeWithFallback(async (ai, model) => {
        const response = await ai.models.generateContent({
            model: 'gemini-flash-lite-latest', // Plus rapide pour l'audio
            contents: [
                ...history.slice(-4).map(m => ({ role: m.role, parts: [{ text: m.text }] })),
                { role: 'user', parts: [{ text: message }] }
            ],
            config: {
                systemInstruction: `Tu es TeacherMada en APPEL VOCAL. Réponds très court (1-2 phrases). Pas de listes. Pas de code. Langue: ${user.preferences?.targetLanguage}.`,
                maxOutputTokens: 100,
                temperature: 0.5
            }
        });
        return response.text || "Je vous écoute.";
    });
};

export const generateSpeech = async (text: string, userId: string, voice?: VoiceName): Promise<Uint8Array | null> => {
    try {
        const ai = new GoogleGenAI({ apiKey: getApiKey() });
        const user = storageService.getUserById(userId);
        const voiceToUse = voice || user?.preferences?.voiceName || 'Kore';
        
        // Nettoyage pour la synthèse
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
    return executeWithFallback(async (ai, model) => {
        const res = await ai.models.generateContent({
            model,
            contents: `Translate to ${targetLang}, text only: "${text}"`,
        });
        return res.text?.trim() || text;
    });
};

export const analyzeVoiceCallPerformance = async (history: ChatMessage[], userId: string): Promise<VoiceCallSummary> => {
    const ai = new GoogleGenAI({ apiKey: getApiKey() });
    const prompt = `Analyse cette conversation orale JSON: {score, feedback, tip}. Conversation: ${JSON.stringify(history.slice(-5))}`;
    const res = await ai.models.generateContent({
        model: 'gemini-1.5-flash',
        contents: prompt,
        config: { responseMimeType: "application/json" }
    });
    try {
        return JSON.parse(res.text || '{"score":7, "feedback":"Bien", "tip":"Continuez"}');
    } catch {
        return { score: 7, feedback: "Bon travail", tip: "Continuez à pratiquer !" };
    }
};

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
