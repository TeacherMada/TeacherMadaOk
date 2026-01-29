
import { UserProfile, UserPreferences, ChatMessage } from "../types";
import { storageService } from "./storageService";

// Nous n'utilisons plus @google/genai directement ici côté client pour la sécurité.
// Tout passe par storageService.generateAIResponse

export const startChatSession = async (
  profile: UserProfile, 
  prefs: UserPreferences,
  history: ChatMessage[] = []
) => {
  // Initialization logic if needed
  return null; 
};

export const sendMessageToGemini = async (message: string, userId: string): Promise<string> => {
  // Récupérer l'historique actuel pour le contexte
  const history = await storageService.getChatHistory(userId);
  
  // Appel au backend sécurisé
  return await storageService.generateAIResponse(message, history);
};

export const generateVoiceChatResponse = async (
    message: string, 
    userId: string, 
    history: ChatMessage[]
): Promise<string> => {
    // Utilise un modèle plus rapide si spécifié dans le backend
    return await storageService.generateAIResponse(message, history, 'gemini-1.5-flash');
};

export const analyzeUserProgress = async (
    history: ChatMessage[], 
    currentMemory: string,
    userId: string
): Promise<{ newMemory: string; xpEarned: number; feedback: string }> => {
    // Cette logique peut rester ici si elle ne consomme pas de données sensibles
    // ou être déplacée dans le backend. Pour l'instant, on simule une réponse locale
    // ou on fait un appel spécial au backend si on veut utiliser l'IA.
    
    // Pour économiser les crédits utilisateurs sur l'analyse :
    return {
        newMemory: currentMemory,
        xpEarned: 15,
        feedback: "Session enregistrée."
    };
};

// Les autres fonctions (generateSpeech, generateImage) devraient suivre le même pattern :
// Créer une route backend dédiée et l'appeler via storageService.
export const generateSpeech = async (text: string, userId: string): Promise<ArrayBuffer | null> => {
    console.warn("TTS déplacé vers Backend (à implémenter)");
    return null; 
};

export const generateConceptImage = async (prompt: string, userId: string): Promise<string | null> => {
    console.warn("Image Gen déplacé vers Backend (à implémenter)");
    return null;
};

export const generateDailyChallenges = async (prefs: UserPreferences): Promise<any[]> => {
    // Logique client simple pour éviter l'appel IA coûteux
    return [
        {
            id: '1', description: `Écrire 5 phrases en ${prefs.targetLanguage}`, 
            type: 'message_count', targetCount: 5, xpReward: 50, isCompleted: false
        }
    ];
};

export const translateText = async (text: string, targetLang: string, userId: string) => {
    // Appel backend standard avec prompt de traduction
    const prompt = `Translate this to ${targetLang}: ${text}`;
    return await storageService.generateAIResponse(prompt, []);
};

export const getLessonSummary = async (num: number, ctx: string, uid: string) => {
    return await storageService.generateAIResponse(`Résumé leçon ${num}: ${ctx}`, []);
};

export const analyzeVoiceCallPerformance = async (history: any[], uid: string) => {
    return { score: 8, feedback: "Bien parlé !", tip: "Attention aux accents." };
};

export const generatePracticalExercises = async (profile: UserProfile, history: ChatMessage[]) => {
    // Simuler des exercices pour l'instant ou créer un endpoint backend
    return [];
};

export const generateRoleplayResponse = async (history: ChatMessage[], scenario: string, user: UserProfile, closing: boolean) => {
    const prompt = closing ? `End roleplay ${scenario}. Give feedback.` : `Roleplay ${scenario}. Context: ${JSON.stringify(history)}`;
    const text = await storageService.generateAIResponse(prompt, history);
    return { aiReply: text, correction: null };
};
