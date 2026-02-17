
import { GoogleGenAI, Type, Modality } from "@google/genai";
import { UserProfile, ChatMessage, VocabularyItem, ExerciseItem } from "../types";
import { SYSTEM_PROMPT_TEMPLATE, SUPPORT_AGENT_PROMPT } from "../constants";
import { storageService } from "./storageService";

// --- CONFIGURATION ---

const getClient = () => {
  // Gestion de plusieurs clés séparées par des virgules pour la rotation simple
  const rawKey = process.env.API_KEY || "";
  const keys = rawKey.split(',').map(k => k.trim()).filter(k => k.length > 10);
  // Retourne une instance avec une clé aléatoire si plusieurs sont dispos
  const apiKey = keys.length > 0 ? keys[Math.floor(Math.random() * keys.length)] : "";
  return new GoogleGenAI({ apiKey });
};

// Modèles
const TEXT_MODEL = 'gemini-3-flash-preview';
const AUDIO_MODEL = 'gemini-2.5-flash-preview-tts';
const SUPPORT_MODEL = 'gemini-2.0-flash';

// --- SERVICES EXPORTÉS ---

/**
 * Génère une réponse en streaming pour le chat principal.
 */
export async function* sendMessageStream(
  message: string,
  user: UserProfile,
  history: ChatMessage[]
) {
  if (!user.preferences) throw new Error("Profil incomplet");
  
  const ai = getClient();

  // Construction de l'historique pour l'API
  const contents = history
    .filter(msg => msg.text && msg.text.trim().length > 0)
    .map(msg => ({
      role: msg.role === 'user' ? 'user' : 'model',
      parts: [{ text: msg.text }]
    }));
  
  // Ajout du message actuel
  contents.push({ role: 'user', parts: [{ text: message }] });

  try {
    const stream = await ai.models.generateContentStream({
      model: TEXT_MODEL,
      contents,
      config: {
        systemInstruction: SYSTEM_PROMPT_TEMPLATE(user, user.preferences),
        temperature: 0.7,
        maxOutputTokens: 2000,
      }
    });

    for await (const chunk of stream) {
      if (chunk.text) {
        yield chunk.text;
      }
    }

    // Déduction du crédit une fois la réponse générée avec succès
    await storageService.consumeCredit(user.id);

  } catch (error) {
    console.error("Erreur Gemini Stream:", error);
    yield "⚠️ Désolé, je rencontre des difficultés techniques pour le moment.";
  }
}

/**
 * Génère de l'audio (TTS) à partir d'un texte.
 */
export const generateSpeech = async (text: string, voiceName: string = 'Kore'): Promise<ArrayBuffer | null> => {
    const user = await storageService.getCurrentUser();
    if (!user || !(await storageService.canRequest(user.id))) return null;

    const ai = getClient();

    try {
        const response = await ai.models.generateContent({
            model: AUDIO_MODEL,
            contents: [{ parts: [{ text: text }] }],
            config: {
                responseModalities: [Modality.AUDIO],
                speechConfig: {
                    voiceConfig: {
                        prebuiltVoiceConfig: { voiceName: voiceName }
                    }
                }
            }
        });

        const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
        if (!base64Audio) return null;

        // Déduction crédit
        await storageService.consumeCredit(user.id);

        // Décodage Base64 vers ArrayBuffer
        const binaryString = atob(base64Audio);
        const len = binaryString.length;
        const bytes = new Uint8Array(len);
        for (let i = 0; i < len; i++) {
            bytes[i] = binaryString.charCodeAt(i);
        }
        return bytes.buffer;

    } catch (e) {
        console.error("TTS Error:", e);
        return null;
    }
};

/**
 * Génère des exercices basés sur l'historique de conversation.
 */
export const generateExerciseFromHistory = async (history: ChatMessage[], user: UserProfile): Promise<ExerciseItem[]> => {
    if (!(await storageService.canRequest(user.id))) return [];

    const ai = getClient();
    const context = history.slice(-10).map(m => m.text).join('\n');
    const prompt = `Based on this conversation context: "${context}", generate 3 language exercises (Multiple Choice or True/False) for a ${user.preferences?.targetLanguage} learner at level ${user.preferences?.level}. Return strictly a JSON Array.`;

    try {
        const response = await ai.models.generateContent({
            model: TEXT_MODEL,
            contents: [{ role: 'user', parts: [{ text: prompt }] }],
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
        
        await storageService.consumeCredit(user.id);
        const json = JSON.parse(response.text || "[]");
        // Ajout d'IDs uniques si manquants
        return json.map((ex: any) => ({ ...ex, id: ex.id || crypto.randomUUID() }));
    } catch (e) {
        console.error("Exercise Gen Error:", e);
        return [];
    }
};

/**
 * Extrait du vocabulaire clé de la conversation.
 */
export const extractVocabulary = async (history: ChatMessage[]): Promise<VocabularyItem[]> => {
    const user = await storageService.getCurrentUser();
    if (!user || !(await storageService.canRequest(user.id))) return [];

    const ai = getClient();
    const context = history.slice(-6).map(m => `${m.role}: ${m.text}`).join('\n');
    const prompt = `Extract 3-5 useful vocabulary words/phrases from this text for a learner. Return JSON array. Context: ${context}`;

    try {
        const response = await ai.models.generateContent({
            model: TEXT_MODEL,
            contents: [{ role: 'user', parts: [{ text: prompt }] }],
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

        await storageService.consumeCredit(user.id);
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
        return [];
    }
};

/**
 * Gère les réponses pour le mode Jeu de Rôle (Dialogue).
 */
export const generateRoleplayResponse = async (
    history: ChatMessage[],
    scenarioPrompt: string,
    user: UserProfile,
    isClosing: boolean = false,
    isInitial: boolean = false
): Promise<{ aiReply: string; correction?: string; explanation?: string; score?: number; feedback?: string }> => {
    
    if (!(await storageService.canRequest(user.id))) {
        return { aiReply: "⚠️ Crédits insuffisants." };
    }

    const ai = getClient();
    const sysInstruct = `Tu es un partenaire de jeu de rôle pour apprendre le ${user.preferences?.targetLanguage} (Niveau ${user.preferences?.level}). 
    SCÉNARIO: ${scenarioPrompt}.
    RÈGLES: 
    1. Reste dans ton personnage.
    2. Réponds brièvement (max 2 phrases) pour laisser parler l'élève.
    3. Si l'élève fait une faute grave, fournis une correction dans le champ JSON approprié.
    ${isClosing ? "C'est la fin. Donne une note sur 20 et un feedback final." : ""}
    ${isInitial ? "Commence la conversation en te présentant selon le scénario." : ""}`;

    const contents = history
        .filter(msg => msg.text && msg.text.trim().length > 0)
        .map(m => ({ role: m.role === 'user' ? 'user' : 'model', parts: [{ text: m.text }] }));
    
    // Si c'est le début, on peut envoyer un prompt vide ou d'amorce si l'historique est vide
    if (isInitial && contents.length === 0) {
        contents.push({ role: 'user', parts: [{ text: "Start scenario" }] });
    }
    
    if (isClosing) contents.push({ role: 'user', parts: [{ text: "Fin de la session. Évaluation stp." }] });

    try {
        const response = await ai.models.generateContent({
            model: TEXT_MODEL,
            contents,
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

        await storageService.consumeCredit(user.id);
        const result = JSON.parse(response.text || "{}");
        
        // Sécurité pour éviter les retours vides
        if (!result.aiReply) result.aiReply = "...";
        
        return result;
    } catch (e) {
        console.error("Roleplay Error:", e);
        return { aiReply: "Problème technique, essayons encore." };
    }
};

/**
 * Assistant Guide pour le tutoriel (TutorialAgent).
 */
export const generateSupportResponse = async (
    userQuery: string,
    context: string,
    user: UserProfile,
    history: {role: string, text: string}[]
): Promise<string> => {
    
    // Vérification quota support local (gratuit mais limité)
    if (!storageService.canUseSupportAgent()) {
        return "⛔ Quota journalier d'aide atteint (100/100). Revenez demain.";
    }

    const ai = getClient();
    const systemInstruction = SUPPORT_AGENT_PROMPT(context, user);
    
    const contents = history.map(msg => ({
        role: msg.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: msg.text }]
    }));
    contents.push({ role: 'user', parts: [{ text: userQuery }] });

    try {
        const response = await ai.models.generateContent({
            model: SUPPORT_MODEL,
            contents,
            config: {
                systemInstruction,
                maxOutputTokens: 1000, 
                temperature: 0.5
            }
        });
        
        storageService.incrementSupportUsage();
        return response.text || "Je n'ai pas de réponse pour le moment.";
    } catch (e) {
        return "Désolé, je rencontre un problème technique momentané.";
    }
};
