import { GoogleGenAI, Type } from "@google/genai";
import { UserProfile, ChatMessage, VocabularyItem, ExerciseItem } from "../types";
import { SYSTEM_PROMPT_TEMPLATE } from "../constants";
import { storageService } from "./storageService";

const getClient = () => {
  // Uses environment variable provided by Vite/Render
  const apiKey = process.env.API_KEY || "";
  return new GoogleGenAI({ apiKey });
};

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
  const modelId = 'gemini-2.0-flash'; 

  // Format history for Gemini
  const contents = history.map(msg => ({
    role: msg.role,
    parts: [{ text: msg.text }]
  }));
  
  // Add current user message
  contents.push({ role: 'user', parts: [{ text: message }] });

  try {
    const responseStream = await ai.models.generateContentStream({
      model: modelId,
      contents: contents,
      config: {
        systemInstruction: SYSTEM_PROMPT_TEMPLATE(user, user.preferences),
        temperature: 0.7,
        maxOutputTokens: 800,
      }
    });

    for await (const chunk of responseStream) {
       yield chunk.text;
    }

    // Deduct credit only after successful stream start (simplified logic)
    storageService.consumeCredit(user.id);

  } catch (error) {
    console.error("Gemini Stream Error:", error);
    yield "Désolé, une erreur de connexion est survenue.";
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
            model: 'gemini-2.0-flash',
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
            model: 'gemini-2.0-flash',
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
            model: 'gemini-2.0-flash',
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
        return { aiReply: "Erreur technique." };
    }
};

export const generateNextLessonPrompt = (user: UserProfile): string => {
  return `Continue le cours pour le niveau ${user.preferences?.level}. Sujet suivant. Sois bref et interactif.`;
};