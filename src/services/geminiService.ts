import { GoogleGenAI, Type } from "@google/genai";
import { UserProfile, ChatMessage, VocabularyItem, ExerciseItem } from "../types";
import { SYSTEM_PROMPT_TEMPLATE } from "../constants";
import { storageService } from "./storageService";

const getClient = () => {
  // Uses environment variable provided by the build environment
  const apiKey = process.env.API_KEY || "";
  return new GoogleGenAI({ apiKey });
};

const MODEL_ID = 'gemini-3-flash-preview';

// --- STREAMING MESSAGE ---
export async function* sendMessageStream(
  message: string,
  user: UserProfile,
  history: ChatMessage[]
) {
  if (!user.preferences) throw new Error("Profil incomplet");
  
  if (!storageService.canRequest(user.id)) {
    yield "⚠️ Crédits insuffisants. Veuillez recharger votre compte.";
    return;
  }

  const ai = getClient();

  // Format history for Gemini
  const contents = history.map(msg => ({
    role: msg.role,
    parts: [{ text: msg.text }]
  }));
  
  // Add current user message
  contents.push({ role: 'user', parts: [{ text: message }] });

  try {
    const responseStream = await ai.models.generateContentStream({
      model: MODEL_ID,
      contents: contents,
      config: {
        systemInstruction: SYSTEM_PROMPT_TEMPLATE(user, user.preferences),
        temperature: 0.7,
        maxOutputTokens: 1000,
      }
    });

    for await (const chunk of responseStream) {
       yield chunk.text;
    }

    // Deduct credit only after successful stream start
    storageService.consumeCredit(user.id);

  } catch (error) {
    console.error("Gemini Stream Error:", error);
    yield "Désolé, une erreur de connexion est survenue. Vérifiez votre clé API ou votre connexion internet.";
  }
}

// --- VOCABULARY EXTRACTION ---
export const extractVocabulary = async (history: ChatMessage[]): Promise<VocabularyItem[]> => {
    const ai = getClient();
    
    // Take last 6 messages for context
    const context = history.slice(-6).map(m => `${m.role}: ${m.text}`).join('\n');
    
    const prompt = `Based on the following conversation, extract 3 to 5 key vocabulary words that are useful for the learner.
    Return a JSON array of objects with keys: word, translation (in the learner's explanation language), and example (a short sentence).
    
    Conversation:
    ${context}`;

    try {
        const response = await ai.models.generateContent({
            model: MODEL_ID,
            contents: prompt,
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
                        }
                    }
                }
            }
        });

        const rawData = JSON.parse(response.text || "[]");
        
        return rawData.map((item: any) => ({
            id: crypto.randomUUID(),
            word: item.word,
            translation: item.translation,
            example: item.example,
            mastered: false,
            addedAt: Date.now()
        }));

    } catch (e) {
        console.error("Vocabulary extraction error", e);
        return [];
    }
};

// --- EXERCISE GENERATION ---
export const generateExerciseFromHistory = async (history: ChatMessage[], user: UserProfile): Promise<ExerciseItem[]> => {
    if (!storageService.canRequest(user.id)) return [];

    const ai = getClient();
    const context = history.slice(-10).map(m => m.text).join("\n");
    
    const prompt = `Génère 3 exercices rapides (QCM ou Vrai/Faux) basés sur la conversation récente pour tester la compréhension de l'élève (${user.preferences?.level}).
    Conversation: ${context}
    
    Format JSON Array.`;

    try {
        const response = await ai.models.generateContent({
            model: MODEL_ID,
            contents: prompt,
            config: {
                responseMimeType: "application/json",
                responseSchema: {
                    type: Type.ARRAY,
                    items: {
                        type: Type.OBJECT,
                        properties: {
                            id: { type: Type.STRING },
                            type: { type: Type.STRING, enum: ["multiple_choice", "true_false", "fill_blank"] },
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
        
        // Deduct credit
        storageService.consumeCredit(user.id);
        
        return JSON.parse(response.text || "[]");
    } catch (e) {
        console.error("Exercise Gen Error", e);
        return [];
    }
};

// --- ROLEPLAY GENERATION ---
export const generateRoleplayResponse = async (
    history: ChatMessage[],
    scenarioPrompt: string,
    user: UserProfile,
    isClosing: boolean = false,
    isInitial: boolean = false
): Promise<{ aiReply: string; correction?: string; explanation?: string; score?: number; feedback?: string }> => {
    
    if (!storageService.canRequest(user.id)) {
        return { aiReply: "⚠️ Crédits insuffisants." };
    }

    const ai = getClient();
    const sysInstruct = `
    Tu es un partenaire de jeu de rôle linguistique.
    SCENARIO: ${scenarioPrompt}
    LANGUE CIBLE: ${user.preferences?.targetLanguage}
    NIVEAU: ${user.preferences?.level}
    
    ${isInitial ? "Initie la conversation. Sois bref." : ""}
    ${isClosing ? "Analyse la conversation, donne une note sur 20 et un feedback." : "Réponds au rôle. Si erreur grave, fournis correction."}
    `;

    const contents = history.map(m => ({ role: m.role, parts: [{ text: m.text }] }));
    if (isClosing) contents.push({ role: 'user', parts: [{ text: "Evaluation finale" }] });

    try {
        const response = await ai.models.generateContent({
            model: MODEL_ID,
            contents: contents.length ? contents : [{role:'user', parts:[{text:'Start'}]}],
            config: {
                systemInstruction: sysInstruct,
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
        console.error("Roleplay Error:", e);
        return { aiReply: "Désolé, je rencontre un problème technique." };
    }
};

export const generateNextLessonPrompt = (user: UserProfile): string => {
  return `Continue le cours pour le niveau ${user.preferences?.level}. Sujet suivant. Sois bref et interactif.`;
};