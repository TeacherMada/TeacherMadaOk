
import { GoogleGenAI, Type } from "@google/genai";
import { UserProfile, ChatMessage, UserPreferences } from "../types";
import { SYSTEM_PROMPT_TEMPLATE } from "../constants";
import { storageService } from "./storageService";

const getClient = () => {
  const apiKey = process.env.API_KEY || "";
  return new GoogleGenAI({ apiKey });
};

export const sendMessage = async (
  message: string,
  user: UserProfile,
  history: ChatMessage[]
): Promise<string> => {
  if (!user.preferences) throw new Error("Preferences missing");
  
  const ai = getClient();
  
  // Format history for Gemini
  const contents = [
    ...history.slice(-10).map(m => ({ 
        role: m.role, 
        parts: [{ text: m.text }] 
    })),
    { role: 'user', parts: [{ text: message }] }
  ];

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-2.0-flash',
      contents,
      config: { 
        systemInstruction: SYSTEM_PROMPT_TEMPLATE(user, user.preferences),
        temperature: 0.7
      }
    });

    const text = response.text || "Désolé, je n'ai pas pu générer de réponse.";
    
    // Deduct credit usage locally
    storageService.consumeCredit(user.id);
    
    return text;
  } catch (error) {
    console.error("Gemini Error:", error);
    return "Je rencontre des difficultés techniques pour le moment. Veuillez réessayer.";
  }
};

// Simplified TTS
export const speak = async (text: string, voice: string = 'Kore'): Promise<Uint8Array | null> => {
    // Returning null for now to simplify, or re-implement if needed without complex streaming
    return null; 
};

export const extractVocabulary = async (history: ChatMessage[]) => {
    return []; // Disabled for stability
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

    try {
        const response = await ai.models.generateContent({
            model: 'gemini-2.0-flash',
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
        return JSON.parse(response.text || "{}");
    } catch (e) {
        console.error("Roleplay Error", e);
        return { aiReply: "Erreur technique, je ne peux pas répondre pour le moment." };
    }
};
