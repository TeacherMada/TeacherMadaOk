
import { GoogleGenAI, Modality, Type, GenerateContentResponse } from "@google/genai";
import { UserProfile, ChatMessage, VoiceName, VocabularyItem } from "../types";
import { SYSTEM_PROMPT_TEMPLATE } from "../constants";

const getClient = () => {
  const apiKey = process.env.API_KEY || "";
  return new GoogleGenAI({ apiKey });
};

export const sendMessageStream = async (
  prompt: string,
  user: UserProfile,
  history: ChatMessage[],
  onChunk: (text: string) => void
): Promise<string> => {
  const ai = getClient();
  const contents = [
    ...history.slice(-10).map(m => ({ role: m.role, parts: [{ text: m.text }] })),
    { role: 'user', parts: [{ text: prompt }] }
  ];

  const stream = await ai.models.generateContentStream({
    model: 'gemini-3-flash-preview',
    contents,
    config: {
      systemInstruction: SYSTEM_PROMPT_TEMPLATE(user, user.preferences!),
      temperature: 0.7
    }
  });

  let fullText = "";
  for await (const chunk of stream) {
    const chunkText = chunk.text || "";
    fullText += chunkText;
    onChunk(fullText);
  }
  return fullText;
};

export const extractVocabulary = async (history: ChatMessage[]): Promise<VocabularyItem[]> => {
  const ai = getClient();
  const lastContext = history.slice(-6).map(m => m.text).join("\n");
  
  const response: GenerateContentResponse = await ai.models.generateContent({
    model: 'gemini-3-flash-preview',
    contents: `Extrais 3 à 5 mots ou expressions clés de cette conversation pour un dictionnaire d'apprentissage. 
               JSON: [{word, translation, example}]
               Contexte: ${lastContext}`,
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: {
            word: { type: Type.STRING },
            translation: { type: Type.STRING },
            example: { type: Type.STRING }
          },
          required: ["word", "translation"]
        }
      }
    }
  });

  try {
    const raw = JSON.parse(response.text || "[]");
    return raw.map((item: any) => ({
      ...item,
      id: crypto.randomUUID(),
      mastered: false,
      addedAt: Date.now()
    }));
  } catch { return []; }
};

export const textToSpeech = async (text: string, voice: VoiceName = 'Kore'): Promise<Uint8Array | null> => {
  const ai = getClient();
  try {
    const res = await ai.models.generateContent({
      model: "gemini-2.5-flash-preview-tts",
      contents: [{ parts: [{ text: text.substring(0, 1000) }] }],
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

// Added generateRoleplayResponse method as required by components/DialogueSession.tsx
export const generateRoleplayResponse = async (
    history: ChatMessage[],
    scenarioPrompt: string,
    user: UserProfile,
    isClosing: boolean = false,
    isInitial: boolean = false
): Promise<{ aiReply: string; correction?: string; score?: number; feedback?: string }> => {
    const ai = getClient();
    const systemInstruction = `Tu es TeacherMada, un partenaire de conversation expert. 
    Scénario actuel : ${scenarioPrompt}. 
    Langue cible : ${user.preferences?.targetLanguage}. 
    Niveau de l'élève : ${user.preferences?.level}.
    ${isClosing ? "Analyse la conversation passée et donne une note sur 20 avec un feedback constructif." : "Continue le dialogue naturellement."}`;

    const contents = history.slice(-10).map(m => ({ role: m.role, parts: [{ text: m.text }] }));
    
    if (isInitial && contents.length === 0) {
        contents.push({ role: 'user', parts: [{ text: "Bonjour, commençons le scénario." }] });
    }

    const response: GenerateContentResponse = await ai.models.generateContent({
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
                    score: { type: Type.NUMBER },
                    feedback: { type: Type.STRING }
                },
                required: ["aiReply"]
            }
        }
    });

    try {
        const text = response.text || "{}";
        return JSON.parse(text);
    } catch {
        return { aiReply: response.text || "Erreur lors du dialogue." };
    }
};
