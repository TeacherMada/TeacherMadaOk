
import { GoogleGenAI, Type, Modality } from "@google/genai";
import { UserProfile, ChatMessage, VocabularyItem, ExerciseItem } from "../types";
import { SYSTEM_PROMPT_TEMPLATE } from "../constants";
import { storageService } from "./storageService";

// --- API KEY ROTATION & CLIENT MANAGEMENT ---
const getClient = () => {
  // Get keys from env, supporting comma-separated list
  const rawKey = process.env.API_KEY || "";
  const keys = rawKey.split(',').map(k => k.trim()).filter(k => k.length > 0);

  if (keys.length === 0) {
    console.warn("API Key is missing.");
    return new GoogleGenAI({ apiKey: "" });
  }

  // Random rotation to distribute load (Simple Round-Robin/Random)
  const selectedKey = keys[Math.floor(Math.random() * keys.length)];
  
  return new GoogleGenAI({ apiKey: selectedKey });
};

// Models Configuration
const TEXT_MODEL = 'gemini-3-flash-preview'; // Fast & Smart
const AUDIO_MODEL = 'gemini-2.5-flash-preview-tts'; // Specialized TTS

// --- STREAMING MESSAGE ---
export async function* sendMessageStream(
  message: string,
  user: UserProfile,
  history: ChatMessage[]
) {
  if (!user.preferences) throw new Error("Profil incomplet");
  
  // Note: canRequest is async
  if (!(await storageService.canRequest(user.id))) {
    yield "⚠️ Crédits insuffisants. Veuillez recharger votre compte.";
    return;
  }

  const ai = getClient();

  // Sanitize history: remove empty messages and ensure structure
  const contents = history
    .filter(msg => msg.text && msg.text.trim().length > 0) // Filter empty messages
    .map(msg => ({
      role: msg.role === 'user' ? 'user' : 'model', // Explicitly map role
      parts: [{ text: msg.text }]
    }));
  
  // Add current user message
  contents.push({ role: 'user', parts: [{ text: message }] });

  try {
    const responseStream = await ai.models.generateContentStream({
      model: TEXT_MODEL,
      contents: contents,
      config: {
        systemInstruction: SYSTEM_PROMPT_TEMPLATE(user, user.preferences),
        temperature: 0.7,
        maxOutputTokens: 1000,
      }
    });

    let hasYielded = false;
    for await (const chunk of responseStream) {
       const text = chunk.text;
       if (text) {
           yield text;
           hasYielded = true;
       }
    }

    if (hasYielded) {
        await storageService.consumeCredit(user.id);
    }

  } catch (error: any) {
    console.error("Gemini Stream Error:", error);
    if (error.message && error.message.includes("API key")) {
        yield "Erreur de configuration API Key. Contactez l'admin.";
    } else {
        yield `Désolé, une erreur de connexion est survenue (${error.status || 'Reseau'}).`;
    }
  }
}

// --- GEMINI TTS (Text-to-Speech) ---
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

        // Extract base64 audio
        const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
        if (!base64Audio) return null;

        await storageService.consumeCredit(user.id);

        // Convert Base64 to ArrayBuffer
        const binaryString = atob(base64Audio);
        const len = binaryString.length;
        const bytes = new Uint8Array(len);
        for (let i = 0; i < len; i++) {
            bytes[i] = binaryString.charCodeAt(i);
        }
        return bytes.buffer;

    } catch (e) {
        console.error("Gemini TTS Error:", e);
        return null;
    }
};

// --- VOCABULARY EXTRACTION ---
export const extractVocabulary = async (history: ChatMessage[]): Promise<VocabularyItem[]> => {
    const user = await storageService.getCurrentUser();
    if (!user || !(await storageService.canRequest(user.id))) return [];

    const ai = getClient();
    const context = history.slice(-6).map(m => `${m.role}: ${m.text}`).join('\n');
    
    const prompt = `Based on the following conversation, extract 3 to 5 key vocabulary words that are useful for the learner.
    Return a JSON array of objects with keys: word, translation (in the learner's explanation language), and example (a short sentence).
    Conversation:
    ${context}`;

    try {
        const response = await ai.models.generateContent({
            model: TEXT_MODEL,
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
        
        await storageService.consumeCredit(user.id);

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

// --- EXERCISE GENERATION ---
export const generateExerciseFromHistory = async (history: ChatMessage[], user: UserProfile): Promise<ExerciseItem[]> => {
    if (!(await storageService.canRequest(user.id))) return [];

    const ai = getClient();
    const context = history.slice(-10).map(m => m.text).join("\n");
    const lessonInfo = `Leçon ${(user.stats.lessonsCompleted || 0) + 1}`;
    
    const prompt = `Génère 3 exercices (QCM ou Vrai/Faux) pour un élève de niveau ${user.preferences?.level} apprenant le ${user.preferences?.targetLanguage}.
    CONTEXTE : L'élève est à la ${lessonInfo}.
    INSTRUCTION : Les exercices doivent porter sur les concepts vus dans la conversation récente ou être adaptés au niveau actuel si le contexte est court. Sois bienveillant et instructif dans l'explication.
    
    Conversation récente :
    ${context}
    
    Format JSON Array attendu.`;

    try {
        const response = await ai.models.generateContent({
            model: TEXT_MODEL,
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
        
        await storageService.consumeCredit(user.id);
        return JSON.parse(response.text || "[]");
    } catch (e) {
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
    
    if (!(await storageService.canRequest(user.id))) return { aiReply: "⚠️ Crédits insuffisants." };

    const ai = getClient();
    const sysInstruct = `Tu es un partenaire de jeu de rôle linguistique. SCENARIO: ${scenarioPrompt}. LANGUE: ${user.preferences?.targetLanguage}. NIVEAU: ${user.preferences?.level}.`;

    const contents = history
        .filter(msg => msg.text && msg.text.trim().length > 0)
        .map(m => ({ role: m.role, parts: [{ text: m.text }] }));
    
    if (isClosing) contents.push({ role: 'user', parts: [{ text: "Evaluation finale" }] });

    try {
        const response = await ai.models.generateContent({
            model: TEXT_MODEL,
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

        await storageService.consumeCredit(user.id);
        return JSON.parse(response.text || "{}");
    } catch (e) {
        return { aiReply: "Problème technique." };
    }
};

export const generateNextLessonPrompt = (user: UserProfile): string => {
  const nextLessonNum = (user.stats.lessonsCompleted || 0) + 1;
  return `Continue le cours. Génère le contenu complet pour la Leçon ${nextLessonNum} en respectant strictement le format "Leçon [N] : [Titre]" et la structure Markdown définie.`;
};
