
import { GoogleGenAI, Type, Modality } from "@google/genai";
import { UserProfile, ChatMessage, VocabularyItem, ExerciseItem } from "../types";
import { SYSTEM_PROMPT_TEMPLATE, SUPPORT_AGENT_PROMPT } from "../constants";
import { storageService } from "./storageService";

// --- API KEY MANAGEMENT ---
const getApiKeys = () => {
  const rawKey = process.env.API_KEY || "";
  return rawKey.split(',').map(k => k.trim()).filter(k => k.length > 0);
};

// Internal helper for API calls with retry logic
const generateWithRetry = async (model: string, params: any) => {
    const keys = getApiKeys();
    if (keys.length === 0) throw new Error("Clé API manquante.");

    const shuffledKeys = [...keys].sort(() => 0.5 - Math.random());
    const maxAttempts = Math.min(3, keys.length);
    let lastError;

    for (let i = 0; i < maxAttempts; i++) {
        try {
            const ai = new GoogleGenAI({ apiKey: shuffledKeys[i] });
            return await ai.models.generateContent({ model, ...params });
        } catch (e: any) {
            console.warn(`API attempt ${i+1} failed:`, e.message);
            lastError = e;
        }
    }
    throw lastError;
};

const streamWithRetry = async function* (model: string, params: any) {
    const keys = getApiKeys();
    if (keys.length === 0) {
        yield "⚠️ Erreur: Clé API manquante.";
        return;
    }

    const shuffledKeys = [...keys].sort(() => 0.5 - Math.random());
    const maxAttempts = Math.min(3, keys.length);

    for (let i = 0; i < maxAttempts; i++) {
        try {
            const ai = new GoogleGenAI({ apiKey: shuffledKeys[i] });
            const responseStream = await ai.models.generateContentStream({ model, ...params });
            
            for await (const chunk of responseStream) {
                yield chunk;
            }
            return; // Success
        } catch (e: any) {
            console.warn(`Stream attempt ${i+1} failed:`, e.message);
            if (i === maxAttempts - 1) {
                yield `⚠️ Erreur de connexion (${e.status || 'Reseau'}). Veuillez réessayer.`;
            }
        }
    }
};

// --- MODELS CONFIGURATION ---
const TEXT_MODEL = 'gemini-3-flash-preview'; 
const SUPPORT_MODEL = 'gemini-3-flash-preview'; // Switched to 3-flash for maximum stability
const AUDIO_MODEL = 'gemini-2.5-flash-preview-tts'; 

// --- TUTORIAL AGENT (SUPPORT) ---
export const generateSupportResponse = async (
    userQuery: string,
    context: string,
    user: UserProfile,
    history: {role: string, text: string}[]
): Promise<string> => {
    
    // Check Daily Quota for Support (100/day free)
    if (!storageService.canUseSupportAgent()) {
        return "⛔ Quota journalier d'aide atteint (100/100). Revenez demain pour plus d'assistance gratuite.";
    }

    const systemInstruction = SUPPORT_AGENT_PROMPT(context, user);
    
    // Format history
    const contents = history.map(msg => ({
        role: msg.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: msg.text }]
    }));
    
    contents.push({ role: 'user', parts: [{ text: userQuery }] });

    try {
        const response = await generateWithRetry(SUPPORT_MODEL, {
            contents: contents,
            config: {
                systemInstruction: systemInstruction,
                maxOutputTokens: 1000, 
                temperature: 0.5
            }
        });
        
        // Count usage if successful
        storageService.incrementSupportUsage();
        
        return response.text || "Je n'ai pas de réponse pour le moment.";
    } catch (e) {
        console.error("Support Agent Error", e);
        return "Désolé, je rencontre un problème technique momentané. Veuillez réessayer dans quelques secondes.";
    }
};

// --- STREAMING MESSAGE (MAIN CHAT) ---
export async function* sendMessageStream(
  message: string,
  user: UserProfile,
  history: ChatMessage[]
) {
  if (!user.preferences) throw new Error("Profil incomplet");
  
  // 1. STRICT CHECK BEFORE CALLING AI
  if (!(await storageService.canRequest(user.id))) {
    yield "⛔ **Crédits épuisés.**\n\n1 Requête = 1 Crédit.\nVeuillez recharger votre compte pour continuer.";
    return;
  }

  // Sanitize history
  const contents = history
    .filter(msg => msg.text && msg.text.trim().length > 0)
    .map(msg => ({
      role: msg.role === 'user' ? 'user' : 'model',
      parts: [{ text: msg.text }]
    }));
  
  contents.push({ role: 'user', parts: [{ text: message }] });

  // 2. CALL AI
  const stream = streamWithRetry(TEXT_MODEL, {
      contents: contents,
      config: {
        systemInstruction: SYSTEM_PROMPT_TEMPLATE(user, user.preferences),
        temperature: 0.7,
        maxOutputTokens: 2000,
      }
  });

  let hasYielded = false;
  for await (const chunk of stream) {
      if (typeof chunk === 'string') {
          yield chunk;
          hasYielded = true; 
      } else {
          const text = chunk.text;
          if (text) {
              yield text;
              hasYielded = true;
          }
      }
  }

  // 3. CONSUME CREDIT ONLY IF SUCCESSFUL
  if (hasYielded) {
      await storageService.consumeCredit(user.id);
  }
}

// --- GEMINI TTS (Text-to-Speech) ---
export const generateSpeech = async (text: string, voiceName: string = 'Kore'): Promise<ArrayBuffer | null> => {
    const user = await storageService.getCurrentUser();
    if (!user) return null;
    
    // Strict Credit Check for TTS
    if (!(await storageService.canRequest(user.id))) {
        return null; // UI will handle this failure
    }

    try {
        const response = await generateWithRetry(AUDIO_MODEL, {
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

        // Consume Credit on Success
        await storageService.consumeCredit(user.id);

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

    const context = history.slice(-6).map(m => `${m.role}: ${m.text}`).join('\n');
    
    const prompt = `Based on the following conversation, extract 3 to 5 key vocabulary words that are useful for the learner.
    Return a JSON array of objects with keys: word, translation (in the learner's explanation language), and example (a short sentence).
    Conversation:
    ${context}`;

    try {
        const response = await generateWithRetry(TEXT_MODEL, {
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

        const rawData = JSON.parse(response.text || "[]");
        
        // Consume Credit
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

    const context = history.slice(-10).map(m => m.text).join("\n");
    const lessonInfo = `Leçon ${(user.stats.lessonsCompleted || 0) + 1}`;
    
    const prompt = `Génère 3 exercices (QCM ou Vrai/Faux) pour un élève de niveau ${user.preferences?.level} apprenant le ${user.preferences?.targetLanguage}.
    CONTEXTE : L'élève est à la ${lessonInfo}.
    Format JSON Array attendu.`;

    try {
        const response = await generateWithRetry(TEXT_MODEL, {
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
    
    // Strict Credit Check
    if (!(await storageService.canRequest(user.id))) {
        return { aiReply: "⚠️ Crédits insuffisants." };
    }

    const sysInstruct = `Tu es un partenaire de jeu de rôle linguistique. SCENARIO: ${scenarioPrompt}. LANGUE: ${user.preferences?.targetLanguage}. NIVEAU: ${user.preferences?.level}.`;

    const contents = history
        .filter(msg => msg.text && msg.text.trim().length > 0)
        .map(m => ({ role: m.role, parts: [{ text: m.text }] }));
    
    if (isClosing) contents.push({ role: 'user', parts: [{ text: "Evaluation finale" }] });

    try {
        const response = await generateWithRetry(TEXT_MODEL, {
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

        // Credit consumed only if successful
        await storageService.consumeCredit(user.id);
        
        return JSON.parse(response.text || "{}");
    } catch (e) {
        return { aiReply: "Problème technique." };
    }
};

export const generateNextLessonPrompt = (user: UserProfile): string => {
  const nextLessonNum = (user.stats.lessonsCompleted || 0) + 1;
  return `IMPÉRATIF: Génère IMMÉDIATEMENT le contenu de la Leçon ${nextLessonNum}.`;
};
