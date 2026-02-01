import { GoogleGenAI, Modality } from "@google/genai";
import { UserProfile, ChatMessage, VoiceName, VoiceCallSummary, ExerciseItem, VocabularyItem } from "../types";
import { SYSTEM_PROMPT_TEMPLATE } from "../constants";
import { storageService } from "./storageService";

const MODELS = ['gemini-3-flash-preview', 'gemini-flash-lite-latest', 'gemini-flash-latest'];

const getKeys = (): string[] => {
    const raw = process.env.API_KEY || "";
    return raw.split(/[,\n\s]+/).map(k => k.trim()).filter(k => k.length > 5);
};

async function executeAI<T>(op: (ai: GoogleGenAI, model: string) => Promise<T>): Promise<T> {
    const keys = getKeys();
    if (keys.length === 0) throw new Error("API_KEY_MISSING");
    let lastErr: any;
    for (const model of MODELS) {
        for (const key of keys) {
            try {
                const ai = new GoogleGenAI({ apiKey: key });
                return await op(ai, model);
            } catch (e: any) {
                lastErr = e;
                if (e.message?.includes('429') || e.message?.includes('quota') || e.message?.includes('network')) continue;
                throw e;
            }
        }
    }
    throw lastErr || new Error("IA non disponible");
}

export const sendMessageToGeminiStream = async (msg: string, userId: string, history: ChatMessage[], onChunk: (t: string) => void): Promise<string> => {
    const user = storageService.getUserById(userId);
    if (!user) throw new Error("USER_NOT_FOUND");
    return executeAI(async (ai, model) => {
        const stream = await ai.models.generateContentStream({
            model,
            contents: [
                ...history.slice(-10).map(m => ({ role: m.role, parts: [{ text: m.text }] })),
                { role: 'user', parts: [{ text: msg }] }
            ],
            config: { systemInstruction: SYSTEM_PROMPT_TEMPLATE(user, user.preferences!), temperature: 0.7 }
        });
        let full = "";
        for await (const chunk of stream) {
            full += chunk.text;
            onChunk(full);
        }
        storageService.deductCreditOrUsage(userId);
        return full;
    });
};

export const generateSpeech = async (text: string, userId: string, voice?: VoiceName): Promise<Uint8Array | null> => {
    try {
        const keys = getKeys();
        const ai = new GoogleGenAI({ apiKey: keys[Math.floor(Math.random() * keys.length)] });
        const user = storageService.getUserById(userId);
        const voiceToUse = voice || user?.preferences?.voiceName || 'Kore';
        const clean = text.replace(/[*#_`~]/g, '').trim().substring(0, 1000);
        if (!clean) return null;
        const res = await ai.models.generateContent({
            model: "gemini-2.5-flash-preview-tts",
            contents: [{ parts: [{ text: clean }] }],
            config: { responseModalities: [Modality.AUDIO], speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: voiceToUse } } } }
        });
        const b64 = res.candidates?.[0]?.content?.parts?.find(p => p.inlineData)?.inlineData?.data;
        if (!b64) return null;
        const bin = atob(b64);
        const bytes = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
        return bytes;
    } catch (e) { return null; }
};

export const generateVocabularyFromHistory = async (history: ChatMessage[], lang: string): Promise<VocabularyItem[]> => {
    return executeAI(async (ai, model) => {
        const res = await ai.models.generateContent({
            model,
            contents: `Extrais 3 mots clés de cette leçon en ${lang}. JSON array: [{word, translation, context, mastered: false}]`,
            config: { responseMimeType: "application/json" }
        });
        const data = JSON.parse(res.text || "[]");
        return data.map((v: any) => ({ ...v, id: crypto.randomUUID(), addedAt: Date.now() }));
    });
};

export const generatePracticalExercises = async (user: UserProfile, history: ChatMessage[]): Promise<ExerciseItem[]> => {
    return executeAI(async (ai, model) => {
        const res = await ai.models.generateContent({
            model,
            contents: `Génère 5 exercices (${user.preferences?.targetLanguage}). JSON: [{type, question, options, correctAnswer, explanation}]`,
            config: { responseMimeType: "application/json" }
        });
        return JSON.parse(res.text || "[]");
    });
};

export const generateVoiceChatResponse = async (msg: string, userId: string, history: ChatMessage[]): Promise<string> => {
    return executeAI(async (ai, model) => {
        const res = await ai.models.generateContent({
            model: 'gemini-flash-lite-latest',
            contents: [{ role: 'user', parts: [{ text: msg }] }],
            config: { systemInstruction: "Réponds court (10 mots max). Jamais de markdown.", maxOutputTokens: 60 }
        });
        return res.text || "...";
    });
};

export const translateText = async (text: string, target: string): Promise<string> => {
    return executeAI(async (ai, model) => {
        const res = await ai.models.generateContent({ model, contents: `Traduis en ${target}: "${text}"` });
        return res.text?.trim() || text;
    });
};

export const analyzeVoiceCallPerformance = async (history: ChatMessage[]): Promise<VoiceCallSummary> => {
    return executeAI(async (ai, model) => {
        const res = await ai.models.generateContent({
            model, contents: "Analyse JSON: {score, feedback, tip}",
            config: { responseMimeType: "application/json" }
        });
        return JSON.parse(res.text || '{"score":7, "feedback":"Bien", "tip":"Continue"}');
    });
};

export const startChatSession = async (p: any, pr: any, h: any) => null;
export const analyzeUserProgress = async (h: any, m: any, id: any) => ({ newMemory: m, xpEarned: 20 });
export const generateDailyChallenges = async (p: any) => [];
export const generateConceptImage = async (p: any, id: any) => null;

/**
 * Fix for DialogueSession.tsx: Added missing explanation field.
 */
export interface RoleplayResponse { 
    aiReply: string; 
    correction?: string; 
    score?: number; 
    feedback?: string; 
    explanation?: string; 
}

export const generateRoleplayResponse = async (h: any, s: any, u: any, c?: boolean, init?: boolean): Promise<RoleplayResponse> => {
    const keys = getKeys();
    const ai = new GoogleGenAI({ apiKey: keys[0] });
    const res = await ai.models.generateContent({ model: 'gemini-3-flash-preview', contents: `Dialogue: ${s}` });
    return { aiReply: res.text || "..." };
};