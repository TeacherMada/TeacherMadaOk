
import { GoogleGenAI, Modality, Type } from "@google/genai";
import { UserProfile, ChatMessage, UserPreferences, VoiceName, VocabularyItem } from "../types";
import { SYSTEM_PROMPT_TEMPLATE } from "../constants";
import { storageService } from "./storageService";

const PRIMARY_MODEL = 'gemini-3-flash-preview';
const FALLBACK_MODEL = 'gemini-flash-lite-latest';

const getClient = () => {
  const apiKey = process.env.API_KEY || "";
  return new GoogleGenAI({ apiKey });
};

export const streamTeacherResponse = async (
  message: string,
  user: UserProfile,
  history: ChatMessage[],
  onChunk: (text: string) => void
): Promise<string> => {
  if (!user.preferences) throw new Error("Preferences missing");
  
  const ai = getClient();
  const contents = [
    ...history.slice(-8).map(m => ({ role: m.role, parts: [{ text: m.text }] })),
    { role: 'user', parts: [{ text: message }] }
  ];

  try {
    const result = await ai.models.generateContentStream({
      model: PRIMARY_MODEL,
      contents,
      config: { 
        systemInstruction: SYSTEM_PROMPT_TEMPLATE(user, user.preferences),
        temperature: 0.8
      }
    });

    let fullText = "";
    for await (const chunk of result) {
      const chunkText = chunk.text || "";
      fullText += chunkText;
      onChunk(fullText);
    }
    
    storageService.consumeCredit(user.id);
    return fullText;
  } catch (error) {
    console.error("Gemini Error:", error);
    // Fallback simple sans stream en cas d'erreur de quota
    const fallback = await ai.models.generateContent({
      model: FALLBACK_MODEL,
      contents: [{ role: 'user', parts: [{ text: "Réponds brièvement à ceci : " + message }] }],
      config: { systemInstruction: "Tu es un professeur de secours. Réponds en 2 phrases." }
    });
    const txt = fallback.text || "Désolé, je rencontre une petite fatigue technique. Réessayez dans un instant.";
    onChunk(txt);
    return txt;
  }
};

export const speak = async (text: string, voice: VoiceName = 'Kore'): Promise<Uint8Array | null> => {
  const ai = getClient();
  try {
    const cleanText = text.replace(/[*#_`~]/g, '').substring(0, 800);
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
        model: PRIMARY_MODEL,
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

// Add missing generateVocabularyFromHistory for SmartDashboard
export const generateVocabularyFromHistory = async (history: ChatMessage[]): Promise<VocabularyItem[]> => {
    const ai = getClient();
    const res = await ai.models.generateContent({
        model: PRIMARY_MODEL,
        contents: `Extrais 5 mots importants de cette conversation pour les ajouter à un dictionnaire personnel. JSON: [{word, translation}]`,
        config: {
            responseMimeType: "application/json",
            responseSchema: {
                type: Type.ARRAY,
                items: {
                    type: Type.OBJECT,
                    properties: {
                        word: { type: Type.STRING },
                        translation: { type: Type.STRING }
                    },
                    required: ["word", "translation"]
                }
            }
        }
    });

    try {
        const raw = JSON.parse(res.text || "[]");
        return raw.map((item: any) => ({
            id: Math.random().toString(36).substr(2, 9),
            word: item.word,
            translation: item.translation,
            mastered: false,
            addedAt: Date.now()
        }));
    } catch {
        return [];
    }
};
