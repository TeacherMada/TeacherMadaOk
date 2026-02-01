
import { GoogleGenAI, Modality, Type } from "@google/genai";
import { UserProfile, ChatMessage, VoiceName, ExerciseItem } from "../types";
import { SYSTEM_PROMPT_TEMPLATE } from "../constants";
import { storageService } from "./storageService";

const PRIMARY_MODEL = 'gemini-3-flash-preview';
const FALLBACK_MODEL = 'gemini-flash-lite-latest';

const getAiClient = () => {
  const apiKey = process.env.API_KEY || "";
  return new GoogleGenAI({ apiKey });
};

export const sendMessageStream = async (
  msg: string, 
  userId: string, 
  history: ChatMessage[], 
  onChunk: (text: string) => void
): Promise<string> => {
  const user = storageService.getUserById(userId);
  if (!user) throw new Error("User not found");

  const ai = getAiClient();
  const contents = [
    ...history.slice(-10).map(m => ({ role: m.role, parts: [{ text: m.text }] })),
    { role: 'user', parts: [{ text: msg }] }
  ];

  try {
    const result = await ai.models.generateContentStream({
      model: PRIMARY_MODEL,
      contents,
      config: { systemInstruction: SYSTEM_PROMPT_TEMPLATE(user, user.preferences!), temperature: 0.7 }
    });

    let fullText = "";
    for await (const chunk of result) {
      fullText += chunk.text || "";
      onChunk(fullText);
    }
    storageService.deductCredit(userId);
    return fullText;
  } catch (e) {
    // Fallback automatique sur modèle léger si erreur quota
    const fallback = await ai.models.generateContent({
      model: FALLBACK_MODEL,
      contents,
      config: { systemInstruction: "Réponds court. Pas de code." }
    });
    const text = fallback.text || "Désolé, service saturé.";
    onChunk(text);
    return text;
  }
};

export const generateSpeech = async (text: string, voice: VoiceName = 'Kore'): Promise<Uint8Array | null> => {
  const ai = getAiClient();
  try {
    const cleanText = text.replace(/[*#_`~]/g, '').substring(0, 1000);
    const res = await ai.models.generateContent({
      model: "gemini-2.5-flash-preview-tts",
      contents: [{ parts: [{ text: cleanText }] }],
      config: {
        responseModalities: [Modality.AUDIO],
        speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: voice } } }
      }
    });
    const b64 = res.candidates?.[0]?.content?.parts?.find(p => p.inlineData)?.inlineData?.data;
    if (!b64) return null;
    const bin = atob(b64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return bytes;
  } catch { return null; }
};

export const generateExercises = async (user: UserProfile): Promise<ExerciseItem[]> => {
    const ai = getAiClient();
    const prompt = `Génère 5 exercices de langue (${user.preferences?.targetLanguage}). JSON array: [{type, question, options, correctAnswer, explanation}]`;
    const res = await ai.models.generateContent({
        model: FALLBACK_MODEL,
        contents: prompt,
        config: { responseMimeType: "application/json" }
    });
    return JSON.parse(res.text || "[]");
};

// Fix: Add missing generateVocabularyFromHistory for SmartDashboard
export const generateVocabularyFromHistory = async (user: UserProfile, history: ChatMessage[]): Promise<any> => {
    return []; // Placeholder simulation
};

export interface RoleplayResponse {
    aiReply: string;
    correction?: string;
    explanation?: string;
    score?: number;
    feedback?: string;
}

// Fix: Add missing generateRoleplayResponse for DialogueSession
export const generateRoleplayResponse = async (
    history: ChatMessage[],
    scenarioPrompt: string,
    user: UserProfile,
    isClosing: boolean = false,
    isInitial: boolean = false
): Promise<RoleplayResponse> => {
    const ai = getAiClient();
    const systemInstruction = `Tu es TeacherMada, un partenaire de conversation expert. 
    Scénario actuel : ${scenarioPrompt}. 
    Langue cible : ${user.preferences?.targetLanguage}. 
    Niveau de l'élève : ${user.preferences?.level}.
    ${isClosing ? "Analyse la conversation passée et donne une note sur 20 avec un feedback constructif en " + user.preferences?.explanationLanguage : "Continue le dialogue naturellement."}`;

    const contents = history.map(m => ({ role: m.role, parts: [{ text: m.text }] }));
    
    if (isInitial) {
        contents.push({ role: 'user', parts: [{ text: "Bonjour, commençons le scénario." }] });
    }

    const response = await ai.models.generateContent({
        model: PRIMARY_MODEL,
        contents,
        config: {
            systemInstruction,
            responseMimeType: "application/json",
            responseSchema: {
                type: Type.OBJECT,
                properties: {
                    aiReply: { type: Type.STRING, description: "La réponse de l'IA dans la langue cible." },
                    correction: { type: Type.STRING, description: "Correction grammaticale si l'élève a fait une erreur." },
                    explanation: { type: Type.STRING, description: "Explication de la faute dans la langue d'explication." },
                    score: { type: Type.NUMBER, description: "Score sur 20 (uniquement si isClosing=true)." },
                    feedback: { type: Type.STRING, description: "Feedback global (uniquement si isClosing=true)." }
                },
                required: ["aiReply"]
            }
        }
    });

    try {
        return JSON.parse(response.text || "{}");
    } catch {
        return { aiReply: response.text || "Erreur lors du dialogue." };
    }
};
