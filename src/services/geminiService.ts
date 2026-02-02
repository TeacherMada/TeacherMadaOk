import { GoogleGenAI, Type } from "@google/genai";
import { UserProfile, ChatMessage } from "../types";
import { SYSTEM_PROMPT_TEMPLATE } from "../constants";
import { storageService } from "./storageService";

// Initialize API Client
// Note: process.env.API_KEY must be populated by the build system (Vite/Render)
const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

export const sendMessage = async (
  message: string,
  user: UserProfile,
  history: ChatMessage[]
): Promise<string> => {
  if (!user.preferences) throw new Error("Profil incomplet");

  try {
    // Check credits
    if (!storageService.canRequest(user.id)) {
      return "⚠️ Crédits insuffisants. Veuillez recharger votre compte.";
    }

    const modelId = 'gemini-2.0-flash'; // Cost-effective and fast
    const systemInstruction = SYSTEM_PROMPT_TEMPLATE(user, user.preferences);

    // Prepare history
    const contents = history.map(msg => ({
      role: msg.role,
      parts: [{ text: msg.text }]
    }));

    // Add current message
    contents.push({ role: 'user', parts: [{ text: message }] });

    const response = await ai.models.generateContent({
      model: modelId,
      contents: contents,
      config: {
        systemInstruction: systemInstruction,
        temperature: 0.7,
        maxOutputTokens: 1000,
      }
    });

    const text = response.text || "Désolé, je n'ai pas compris.";

    // Consume credit
    storageService.consumeCredit(user.id);

    return text;
  } catch (error) {
    console.error("Gemini API Error:", error);
    return "Une erreur de connexion est survenue. Veuillez réessayer.";
  }
};

export const generateNextLessonPrompt = (user: UserProfile): string => {
  return `Continue le cours pour le niveau ${user.preferences?.level}. Passe au sujet suivant logiquement. Sois bref et interactif.`;
};

// Generate Roleplay Response using Gemini with JSON schema for structured data
export const generateRoleplayResponse = async (
    history: ChatMessage[],
    scenarioPrompt: string,
    user: UserProfile,
    isClosing: boolean = false,
    isInitial: boolean = false
): Promise<{ aiReply: string; correction?: string; explanation?: string; score?: number; feedback?: string }> => {
    
    // Check credits via storage service first
    if (!storageService.canRequest(user.id)) {
        return { aiReply: "⚠️ Crédits insuffisants." };
    }

    const sysInstruct = `
    Tu es un partenaire de jeu de rôle linguistique.
    SCENARIO: ${scenarioPrompt}
    LANGUE CIBLE: ${user.preferences?.targetLanguage}
    NIVEAU: ${user.preferences?.level}
    LANGUE D'EXPLICATION: ${user.preferences?.explanationLanguage} (pour le feedback/correction)

    ${isInitial ? "Initie la conversation en incarnant ton rôle. Sois bref et engageant." : ""}
    ${isClosing ? "Analyse toute la conversation. Donne une note sur 20 et un feedback constructif." : "Réponds au message de l'utilisateur en restant dans le personnage. Si l'utilisateur fait une erreur grammaticale importante, fournis la correction et l'explication dans les champs dédiés, mais garde 'aiReply' naturel dans le rôle."}
    `;

    // Map history to Gemini content format
    const contents = history.map(m => ({ role: m.role, parts: [{ text: m.text }] }));
    
    // If closing, we prompt for evaluation
    if (isClosing) {
        contents.push({ role: 'user', parts: [{ text: "[FIN DE SESSION] Donne moi mon évaluation." }] });
    }

    // Define JSON schema for structured output
    const responseSchema = {
        type: Type.OBJECT,
        properties: {
            aiReply: { type: Type.STRING, description: "Your response in character (or evaluation summary if closing)." },
            correction: { type: Type.STRING, description: "Correction of the user's last message if needed (nullable)." },
            explanation: { type: Type.STRING, description: "Explanation of the correction in the explanation language (nullable)." },
            score: { type: Type.NUMBER, description: "Score out of 20 (only if closing)." },
            feedback: { type: Type.STRING, description: "Detailed feedback (only if closing)." }
        },
        required: ["aiReply"]
    };

    try {
        const response = await ai.models.generateContent({
            model: 'gemini-2.0-flash',
            contents: contents.length > 0 ? contents : [{ role: 'user', parts: [{ text: 'Start roleplay' }] }],
            config: {
                systemInstruction: sysInstruct,
                responseMimeType: "application/json",
                responseSchema: responseSchema,
                temperature: 0.7
            }
        });

        const jsonText = response.text;
        if (!jsonText) return { aiReply: "..." };
        
        return JSON.parse(jsonText);
    } catch (e) {
        console.error("Roleplay API Error", e);
        return { aiReply: "Désolé, une erreur technique est survenue." };
    }
};

// Placeholder for vocabulary extraction
export const extractVocabulary = async (history: ChatMessage[]) => {
    return [];
};