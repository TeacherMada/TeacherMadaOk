import { GoogleGenAI, Type, Modality } from "@google/genai";
import { UserProfile, ChatMessage, VocabularyItem, ExerciseItem } from "../types";
import { SYSTEM_PROMPT_TEMPLATE, SUPPORT_AGENT_PROMPT } from "../constants";
import { storageService } from "./storageService";

// --- CONFIGURATION DE LA ROTATION ---

// Ordre de priorité des modèles (Textes & Raisonnement)
export const TEXT_MODELS = [
    'gemini-3-flash-preview',
    'gemini-3.1-pro-preview',
    'gemini-flash-latest',
    'gemini-flash-lite-latest'
];

// Ordre de priorité des modèles (Support / Tâches simples)
const SUPPORT_MODELS = [
    'gemini-flash-lite-latest',
    'gemini-flash-latest'
];

// Ordre de priorité des modèles (Audio / TTS)
const AUDIO_MODELS = [
    'gemini-2.5-flash-preview-tts'
    // Fallback models could be added here if Google releases new TTS endpoints
];

// Récupération des clés API
const getApiKeys = () => {
  const rawKey = process.env.API_KEY || "";
  return rawKey.split(',').map(k => k.trim()).filter(k => k.length > 10);
};

// --- MOTEUR DE ROTATION INTELLIGENT ---

/**
 * Exécute une requête standard (non-streaming) avec rotation complète :
 * 1. Itère sur chaque CLÉ API.
 * 2. Pour chaque clé, itère sur chaque MODÈLE de la liste.
 * 3. Ne change de clé que si tous les modèles ont échoué.
 */
export const executeWithRotation = async (
    modelList: string[], 
    requestFn: (ai: GoogleGenAI, model: string) => Promise<any>
): Promise<any> => {
    const keys = getApiKeys();
    if (keys.length === 0) throw new Error("Aucune clé API configurée.");

    let lastError;

    // ROTATION NIVEAU 1 : CLÉS API
    for (const apiKey of keys) {
        const ai = new GoogleGenAI({ apiKey });

        // ROTATION NIVEAU 2 : MODÈLES
        for (const model of modelList) {
            try {
                // Tentative d'exécution
                const result = await requestFn(ai, model);
                return result; // Succès immédiat
            } catch (e: any) {
                // Analyse de l'erreur pour les logs (sans exposer à l'UI)
                const isQuota = e.status === 429 || e.status === 403;
                const isServer = e.status >= 500;
                
                console.warn(
                    `⚠️ Echec [Key: ...${apiKey.slice(-4)}] [Model: ${model}] - ${isQuota ? 'QUOTA/RATE' : isServer ? 'SERVER ERROR' : e.message}`
                );
                
                lastError = e;
                // On continue vers le modèle suivant pour cette clé
                continue; 
            }
        }
        // Si on arrive ici, cette clé a échoué sur TOUS les modèles. On passe à la clé suivante.
    }

    // Si on arrive ici, tout a échoué.
    console.error("🔥 CRITICAL: All keys and models exhausted.");
    throw lastError || new Error("Service temporairement indisponible (Rotation épuisée).");
};

/**
 * Exécute une requête de streaming avec la même logique de rotation.
 */
async function* streamWithRotation(
    modelList: string[],
    requestFn: (ai: GoogleGenAI, model: string) => Promise<any>
) {
    const keys = getApiKeys();
    if (keys.length === 0) {
        yield "⚠️ Erreur technique : Clé API manquante.";
        return;
    }

    for (const apiKey of keys) {
        const ai = new GoogleGenAI({ apiKey });

        for (const model of modelList) {
            try {
                const stream = await requestFn(ai, model);
                // Si on arrive ici, la connexion est établie.
                // On pipe le stream vers l'appelant.
                for await (const chunk of stream) {
                    yield chunk;
                }
                return; // Succès total
            } catch (e: any) {
                console.warn(`⚠️ Stream Fail [Key: ...${apiKey.slice(-4)}] [Model: ${model}]`);
                continue; // Modèle suivant
            }
        }
    }

    // Fallback ultime si tout échoue
    yield "⚠️ Désolé, le service est saturé. Veuillez réessayer dans un instant.";
}

// --- SERVICES EXPORTÉS ---

// 1. TUTORIAL AGENT (SUPPORT)
export const generateSupportResponse = async (
    userQuery: string,
    context: string,
    user: UserProfile,
    history: {role: string, text: string}[]
): Promise<string> => {
    
    if (!storageService.canUseSupportAgent()) {
        return "⛔ Quota journalier d'aide atteint (100/100). Revenez demain.";
    }

    const systemInstruction = SUPPORT_AGENT_PROMPT(context, user);
    
    const contents = history.slice(-6).map(msg => ({
        role: msg.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: msg.text }]
    }));
    contents.push({ role: 'user', parts: [{ text: userQuery }] });

    try {
        const response = await executeWithRotation(SUPPORT_MODELS, async (ai, model) => {
            return await ai.models.generateContent({
                model,
                contents,
                config: {
                    systemInstruction,
                    maxOutputTokens: 2000, 
                    temperature: 0.5
                }
            });
        });
        
        storageService.incrementSupportUsage();
        return response.text || "Je n'ai pas de réponse pour le moment.";
    } catch (e) {
        return "Désolé, je rencontre un problème technique momentané. Veuillez réessayer.";
    }
};

// 2. MAIN CHAT (STREAMING)
export async function* sendMessageStream(
  message: string,
  user: UserProfile,
  history: ChatMessage[]
) {
  if (!user.preferences) throw new Error("Profil incomplet");
  
  if (!(await storageService.canRequest(user.id))) {
    yield "⛔ **Crédits épuisés.**\n\n1 Requête = 1 Crédit.\nVeuillez recharger votre compte pour continuer.";
    return;
  }

  const contents = history
    .slice(-8) // COMPRESSION: Keep only the last 8 messages to save tokens
    .filter(msg => msg.text && msg.text.trim().length > 0)
    .map(msg => ({
      role: msg.role === 'user' ? 'user' : 'model',
      parts: [{ text: msg.text }]
    }));
  
  contents.push({ role: 'user', parts: [{ text: message }] });

  const streamGenerator = streamWithRotation(TEXT_MODELS, async (ai, model) => {
      return await ai.models.generateContentStream({
          model,
          contents,
          config: {
            systemInstruction: SYSTEM_PROMPT_TEMPLATE(user, user.preferences!, user.aiMemory),
            temperature: 0.7,
            maxOutputTokens: 8192, // Increased from 2000 to prevent cut-off responses
          }
      });
  });

  let hasYielded = false;
  for await (const chunk of streamGenerator) {
      if (typeof chunk === 'string') {
          yield chunk;
          // Si c'est un message d'erreur du générateur, on ne compte pas comme succès
          if (!chunk.startsWith('⚠️')) hasYielded = true;
      } else {
          const text = chunk.text;
          if (text) {
              yield text;
              hasYielded = true;
          }
      }
  }

  if (hasYielded) {
      await storageService.consumeCredit(user.id);
  }
}

// Cache in-memory pour le TTS (limité à 50 entrées pour ne pas saturer la RAM)
const ttsCache = new Map<string, ArrayBuffer>();

// 3. TEXT-TO-SPEECH (TTS) - AVEC FALLBACK SILENCIEUX
export const generateSpeech = async (text: string, voiceName: string = 'Kore'): Promise<ArrayBuffer | null> => {
    const cacheKey = `${voiceName}:${text}`;
    if (ttsCache.has(cacheKey)) {
        return ttsCache.get(cacheKey)!;
    }

    const user = await storageService.getCurrentUser();
    if (!user || !(await storageService.canRequest(user.id))) return null;

    try {
        const response = await executeWithRotation(AUDIO_MODELS, async (ai, model) => {
            return await ai.models.generateContent({
                model,
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
        });

        const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
        if (!base64Audio) return null;

        await storageService.consumeCredit(user.id);

        const binaryString = atob(base64Audio);
        const len = binaryString.length;
        const bytes = new Uint8Array(len);
        for (let i = 0; i < len; i++) {
            bytes[i] = binaryString.charCodeAt(i);
        }
        
        const buffer = bytes.buffer as ArrayBuffer;
        
        // Gestion du cache (FIFO si > 50)
        if (ttsCache.size >= 50) {
            const firstKey = ttsCache.keys().next().value;
            if (firstKey) ttsCache.delete(firstKey);
        }
        ttsCache.set(cacheKey, buffer);

        return buffer;

    } catch (e) {
        console.error("TTS Rotation Failed:", e);
        // Fallback silencieux : retourne null pour que l'UI sache que l'audio a échoué sans crasher
        return null;
    }
};

// 4. EXTRACTION VOCABULAIRE
export const extractVocabulary = async (history: ChatMessage[]): Promise<VocabularyItem[]> => {
    const user = await storageService.getCurrentUser();
    if (!user || !(await storageService.canRequest(user.id))) return [];

    const context = history.slice(-6).map(m => `${m.role}: ${m.text}`).join('\n');
    const prompt = `Based on the following conversation, extract 3 to 5 key vocabulary words. Return JSON array [{word, translation, example}].\n${context}`;

    try {
        const response = await executeWithRotation(TEXT_MODELS, async (ai, model) => {
            return await ai.models.generateContent({
                model,
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

// 5. EXERCICES
export const generateExerciseFromHistory = async (history: ChatMessage[], user: UserProfile): Promise<ExerciseItem[]> => {
    if (!(await storageService.canRequest(user.id))) return [];

    const prompt = `Génère 3 exercices (QCM/Vrai-Faux) pour niveau ${user.preferences?.level} (${user.preferences?.targetLanguage}). Format JSON Array.`;

    try {
        const response = await executeWithRotation(TEXT_MODELS, async (ai, model) => {
            return await ai.models.generateContent({
                model,
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
        });
        
        await storageService.consumeCredit(user.id);
        return JSON.parse(response.text || "[]");
    } catch (e) {
        return [];
    }
};

// 6. ROLEPLAY
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

    const sysInstruct = `Partenaire de jeu de rôle (${user.preferences?.targetLanguage}, ${user.preferences?.level}). Scénario: ${scenarioPrompt}.`;
    const contents = history
        .slice(-8) // COMPRESSION: Keep only the last 8 messages
        .filter(msg => msg.text && msg.text.trim().length > 0)
        .map(m => ({ role: m.role, parts: [{ text: m.text }] }));
    
    if (isClosing) contents.push({ role: 'user', parts: [{ text: "Evaluation finale" }] });

    try {
        const response = await executeWithRotation(TEXT_MODELS, async (ai, model) => {
            return await ai.models.generateContent({
                model,
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
        });

        await storageService.consumeCredit(user.id);
        return JSON.parse(response.text || "{}");
    } catch (e) {
        return { aiReply: "Problème technique (Rotation épuisée)." };
    }
};

export const generateNextLessonPrompt = (user: UserProfile): string => {
  const nextLessonNum = (user.stats.lessonsCompleted || 0) + 1;
  return `IMPÉRATIF: Génère IMMÉDIATEMENT le contenu de la Leçon ${nextLessonNum}.`;
};