
import { GoogleGenAI, Modality, Type } from "@google/genai";
import { UserProfile, ChatMessage, VoiceName, ExerciseItem } from "../types";
import { SYSTEM_PROMPT_TEMPLATE } from "../constants";
import { storageService } from "./storageService";

const getClient = () => {
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
  if (!user || !user.preferences) throw new Error("Profil incomplet");

  const ai = getClient();
  const contents = [
    ...history.slice(-10).map(m => ({ role: m.role, parts: [{ text: m.text }] })),
    { role: 'user', parts: [{ text: msg }] }
  ];

  const stream = await ai.models.generateContentStream({
    model: 'gemini-3-flash-preview',
    contents,
    config: { 
      systemInstruction: SYSTEM_PROMPT_TEMPLATE(user, user.preferences),
      temperature: 0.7 
    }
  });

  let full = "";
  for await (const chunk of stream) {
    full += chunk.text;
    onChunk(full);
  }
  storageService.deductUsage(userId);
  return full;
};

export const generateSpeech = async (text: string, voice: VoiceName = 'Kore'): Promise<Uint8Array | null> => {
  const ai = getClient();
  try {
    const clean = text.replace(/[*#_`~]/g, '').substring(0, 1000);
    const res = await ai.models.generateContent({
      model: "gemini-2.5-flash-preview-tts",
      contents: [{ parts: [{ text: clean }] }],
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
  const ai = getClient();
  const res = await ai.models.generateContent({
    model: 'gemini-3-flash-preview',
    contents: `Génère 5 exercices de ${user.preferences?.targetLanguage} niveau ${user.preferences?.level}. JSON: [{type, question, options, correctAnswer, explanation}]`,
    config: { 
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: {
            type: { type: Type.STRING },
            question: { type: Type.STRING },
            options: { type: Type.ARRAY, items: { type: Type.STRING } },
            correctAnswer: { type: Type.STRING },
            explanation: { type: Type.STRING }
          },
          required: ["type", "question", "correctAnswer", "explanation"]
        }
      }
    }
  });
  return JSON.parse(res.text || "[]");
};

export interface RoleplayResponse {
    aiReply: string;
    correction?: string;
    explanation?: string;
    score?: number;
    feedback?: string;
}

// Add missing generateRoleplayResponse for DialogueSession
export const generateRoleplayResponse = async (
    history: ChatMessage[],
    scenarioPrompt: string,
    user: UserProfile,
    isClosing: boolean = false,
    isInitial: boolean = false
): Promise<RoleplayResponse> => {
    const ai = getClient();
    const systemInstruction = `Tu es TeacherMada, un partenaire de conversation expert. 
    Scénario actuel : ${scenarioPrompt}. 
    Langue cible : ${user.preferences?.targetLanguage}. 
    Niveau de l'élève : ${user.preferences?.level}.
    ${isClosing ? "Analyse la conversation passée et donne une note sur 20 avec un feedback constructif en " + user.preferences?.explanationLanguage : "Continue le dialogue naturellement."}`;

    const contents = history.slice(-10).map(m => ({ role: m.role, parts: [{ text: m.text }] }));
    
    if (isInitial) {
        contents.push({ role: 'user', parts: [{ text: "Bonjour, commençons le scénario." }] });
    }

    const response = await ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents,
        config: {
            systemInstruction,
            responseMimeType: "application/json",
            responseSchema: {
                type: Type.OBJECT,
                properties: {
                    aiReply: { type: Type.STRING },
                    correction: { type: Type.STRING },
                    explanation: { type: Type.STRING },
                    score: { type: Type.NUMBER },
                    feedback: { type: Type.STRING }
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
