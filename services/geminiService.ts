
import { GoogleGenAI, Chat, Content, Type, Modality } from "@google/genai";
import { UserProfile, UserPreferences, ChatMessage, DailyChallenge, ExerciseItem } from "../types";
import { SYSTEM_PROMPT_TEMPLATE } from "../constants";

let aiClient: GoogleGenAI | null = null;
let chatSession: Chat | null = null;
let currentModel: string = 'gemini-3-flash-preview';

export const initializeGenAI = () => {
  if (!aiClient) {
    const apiKey = process.env.API_KEY;
    if (!apiKey) {
      console.error("API Key is missing in environment variables");
      return;
    }
    aiClient = new GoogleGenAI({ apiKey });
  }
};

export const startChatSession = async (
  profile: UserProfile, 
  prefs: UserPreferences,
  history: ChatMessage[] = []
) => {
  initializeGenAI();
  if (!aiClient) throw new Error("AI Client not initialized");

  const systemInstruction = SYSTEM_PROMPT_TEMPLATE(profile, prefs);

  // Convert internal ChatMessage format to Google GenAI History format
  const recentHistory = history.slice(-20).map(msg => ({
    role: msg.role,
    parts: [{ text: msg.text }]
  }));

  chatSession = aiClient.chats.create({
    model: currentModel,
    config: {
      systemInstruction: systemInstruction,
      temperature: 0.7,
    },
    history: recentHistory as Content[],
  });

  return chatSession;
};

export const sendMessageToGemini = async (message: string): Promise<string> => {
  if (!chatSession) {
    throw new Error("Chat session not initialized");
  }

  try {
    const result = await chatSession.sendMessage({ message });
    return result.text || "Désolé, je n'ai pas pu générer de réponse.";
  } catch (error) {
    console.error("Error sending message to Gemini:", error);
    return "Une erreur est survenue lors de la communication avec le professeur. Veuillez vérifier votre connexion.";
  }
};

// --- New Feature: Translate Text ---
export const translateText = async (text: string, targetLang: string): Promise<string> => {
    initializeGenAI();
    if (!aiClient) throw new Error("AI Client not initialized");
    
    const prompt = `Translate the following text to ${targetLang}. Only return the translated text, no explanations. Text: "${text}"`;
    
    try {
        const response = await aiClient.models.generateContent({
            model: 'gemini-3-flash-preview',
            contents: prompt,
        });
        return response.text?.trim() || text;
    } catch (e) {
        console.error("Translation failed", e);
        return text;
    }
};

// --- New Feature: Lesson Summary (One-shot) ---

export const getLessonSummary = async (lessonNumber: number, context: string): Promise<string> => {
    initializeGenAI();
    if (!aiClient) throw new Error("AI Client not initialized");

    const prompt = `
    Génère un résumé structuré et concis pour la LEÇON ${lessonNumber}.
    
    CONTEXTE DE L'ÉLÈVE:
    ${context}

    FORMAT ATTENDU (Markdown):
    ## 📝 Résumé : Leçon ${lessonNumber}
    ### 🔑 Points Clés
    (Liste des concepts grammaticaux ou thématiques)
    ### 📖 Vocabulaire Essentiel
    (5-10 mots importants avec traduction)
    ### 💡 Astuce à retenir
    (Une phrase pour aider à mémoriser)
    `;

    try {
        const response = await aiClient.models.generateContent({
            model: 'gemini-3-flash-preview',
            contents: prompt,
        });
        return response.text || "Impossible de générer le résumé.";
    } catch (e) {
        console.error("Summary generation failed", e);
        return "Erreur lors de la génération du résumé.";
    }
};

// --- New Feature: Gemini TTS ---

// Changed default voice to 'Kore' (Female) which is generally smoother for multilingual content
export const generateSpeech = async (text: string, voiceName: string = 'Kore'): Promise<ArrayBuffer | null> => {
    initializeGenAI();
    if (!aiClient) throw new Error("AI Client not initialized");

    if (!text || !text.trim()) return null;

    // Safety truncate to avoid context limits
    const safeText = text.substring(0, 4000);

    try {
        const response = await aiClient.models.generateContent({
            model: "gemini-2.5-flash-preview-tts",
            // Wrap text in a directive to ensure the model reads it instead of replying to it
            // This prevents "model returned non-audio response" errors
            contents: [{ parts: [{ text: `Read this text aloud: ${safeText}` }] }],
            config: {
                responseModalities: [Modality.AUDIO],
                speechConfig: {
                    voiceConfig: {
                        prebuiltVoiceConfig: { voiceName }
                    },
                },
            },
        });

        const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
        if (!base64Audio) return null;

        // Decode Base64 to ArrayBuffer
        const binaryString = atob(base64Audio);
        const len = binaryString.length;
        const bytes = new Uint8Array(len);
        for (let i = 0; i < len; i++) {
            bytes[i] = binaryString.charCodeAt(i);
        }
        return bytes.buffer;

    } catch (error) {
        console.error("Gemini TTS Error:", error);
        return null;
    }
};

// --- New Feature: Daily Challenges ---

export const generateDailyChallenges = async (prefs: UserPreferences): Promise<DailyChallenge[]> => {
    initializeGenAI();
    if (!aiClient) throw new Error("AI Client not initialized");

    // We generate challenges deterministically based on mode to save tokens, 
    // or we could ask Gemini. Let's ask Gemini for variety.
    
    const prompt = `
    Génère 3 défis quotidiens pour un étudiant en langues (${prefs.targetLanguage}, niveau ${prefs.level}).
    Retourne un JSON.
    Format attendu:
    [
      { "description": "Court texte du défi", "type": "message_count" | "vocabulary", "targetCount": nombre, "xpReward": number },
      ...
    ]
    Exemples: "Envoyer 10 messages", "Apprendre 5 mots", "Compléter une leçon".
    `;

    try {
        const response = await aiClient.models.generateContent({
            model: 'gemini-3-flash-preview',
            contents: prompt,
            config: {
                responseMimeType: "application/json",
                responseSchema: {
                    type: Type.ARRAY,
                    items: {
                        type: Type.OBJECT,
                        properties: {
                            description: { type: Type.STRING },
                            type: { type: Type.STRING, enum: ["message_count", "vocabulary", "lesson_complete"] },
                            targetCount: { type: Type.INTEGER },
                            xpReward: { type: Type.INTEGER }
                        },
                        required: ["description", "type", "targetCount", "xpReward"]
                    }
                }
            }
        });

        const json = JSON.parse(response.text || "[]");
        return json.map((item: any, index: number) => ({
            id: `daily_${Date.now()}_${index}`,
            description: item.description,
            type: item.type,
            targetCount: item.targetCount,
            currentCount: 0,
            xpReward: item.xpReward,
            isCompleted: false
        }));

    } catch (e) {
        // Fallback challenges if API fails
        return [
            { id: 'd1', description: 'Envoyer 5 messages', type: 'message_count', targetCount: 5, currentCount: 0, xpReward: 20, isCompleted: false },
            { id: 'd2', description: 'Compléter 1 leçon', type: 'lesson_complete', targetCount: 1, currentCount: 0, xpReward: 50, isCompleted: false },
        ];
    }
};

export const analyzeUserProgress = async (
    history: ChatMessage[], 
    currentMemory: string
): Promise<{ newMemory: string; xpEarned: number; feedback: string }> => {
    initializeGenAI();
    if (!aiClient) throw new Error("AI Client not initialized");

    const conversationText = history.slice(-10).map(m => `${m.role.toUpperCase()}: ${m.text}`).join('\n');

    const prompt = `
    Tu es un expert pédagogique. Analyse cette session d'apprentissage.
    MÉMOIRE PRÉCÉDENTE: "${currentMemory}"
    CONVERSATION: ${conversationText}
    `;

    try {
        const response = await aiClient.models.generateContent({
            model: 'gemini-3-flash-preview',
            contents: prompt,
            config: {
                responseMimeType: "application/json",
                responseSchema: {
                    type: Type.OBJECT,
                    properties: {
                        newMemory: { type: Type.STRING },
                        xpEarned: { type: Type.INTEGER },
                        feedback: { type: Type.STRING }
                    },
                    required: ["newMemory", "xpEarned", "feedback"]
                }
            }
        });

        const json = JSON.parse(response.text || "{}");
        return {
            newMemory: json.newMemory || currentMemory,
            xpEarned: json.xpEarned || 15,
            feedback: json.feedback || "Continue comme ça !"
        };
    } catch (e) {
        return { newMemory: currentMemory, xpEarned: 10, feedback: "Bonne session !" };
    }
};

// --- New Feature: Smart Exercises ---

export const generatePracticalExercises = async (
  profile: UserProfile,
  history: ChatMessage[]
): Promise<ExerciseItem[]> => {
  initializeGenAI();
  if (!aiClient) throw new Error("AI Client not initialized");

  const conversationContext = history.slice(-30).map(m => `${m.role}: ${m.text}`).join('\n');

  const prompt = `
  Génère 5 exercices pratiques pour cet étudiant.
  Langue cible: ${profile.preferences?.targetLanguage}
  Niveau: ${profile.preferences?.level}
  Langue explications: ${profile.preferences?.explanationLanguage}
  
  CONTEXTE RÉCENT (Sujets abordés):
  ${conversationContext}

  Instructions:
  1. Crée des questions variées (QCM, Vrai/Faux, Compléter à trou).
  2. Les questions doivent porter sur le vocabulaire et la grammaire vus récemment.
  3. Fournis une explication claire pour la réponse.
  
  Format JSON Requis:
  [
    {
      "type": "multiple_choice" | "true_false" | "fill_blank",
      "question": "Question text in target language",
      "options": ["Opt1", "Opt2", "Opt3", "Opt4"], // Required for multiple_choice (4 items)
      "correctAnswer": "Exact string of correct answer",
      "explanation": "Why this is correct (in explanation language)"
    }
  ]
  `;

  try {
    const response = await aiClient.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
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

    const json = JSON.parse(response.text || "[]");
    return json.map((item: any, idx: number) => ({
      ...item,
      id: `ex_${Date.now()}_${idx}`
    }));
  } catch (error) {
    console.error("Error generating exercises:", error);
    // Fallback exercises
    return [
      {
        id: 'fallback_1',
        type: 'true_false',
        question: 'Start simple. Is this working?',
        correctAnswer: 'True',
        explanation: 'System fallback.'
      }
    ];
  }
};
