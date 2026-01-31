
import { UserProfile, UserPreferences, LevelDescriptor, LanguageLevel } from './types';

export const TOTAL_LESSONS_PER_LEVEL = 50;

export const LEVEL_DEFINITIONS: Record<string, LevelDescriptor> = {
  'A1': { code: 'A1', title: 'Débutant', description: "Bases absolues", skills: [], example: "" },
  'A2': { code: 'A2', title: 'Élémentaire', description: "Survie", skills: [], example: "" },
  'B1': { code: 'B1', title: 'Intermédiaire', description: "Indépendant", skills: [], example: "" },
  'B2': { code: 'B2', title: 'Avancé', description: "Fluide", skills: [], example: "" },
  'C1': { code: 'C1', title: 'Expert', description: "Autonome", skills: [], example: "" },
  'C2': { code: 'C2', title: 'Maîtrise', description: "Bilingue", skills: [], example: "" },
  'HSK 1': { code: 'HSK 1', title: 'HSK 1', description: "150 mots", skills: [], example: "" },
  'HSK 2': { code: 'HSK 2', title: 'HSK 2', description: "300 mots", skills: [], example: "" },
  'HSK 3': { code: 'HSK 3', title: 'HSK 3', description: "600 mots", skills: [], example: "" },
  'HSK 4': { code: 'HSK 4', title: 'HSK 4', description: "1200 mots", skills: [], example: "" },
  'HSK 5': { code: 'HSK 5', title: 'HSK 5', description: "2500 mots", skills: [], example: "" },
  'HSK 6': { code: 'HSK 6', title: 'HSK 6', description: "5000+ mots", skills: [], example: "" },
};

// === LE CERVEAU PÉDAGOGIQUE (VERSION 3.0) ===
// Analyse profonde des données utilisateur avant de générer le contenu.
export const SYSTEM_PROMPT_TEMPLATE = (profile: UserProfile, prefs: UserPreferences) => {
  const currentLevel = prefs.level;
  const targetLang = prefs.targetLanguage;
  const explainLang = prefs.explanationLanguage;
  
  // 1. Analyse Progression
  const courseKey = `${targetLang}-${currentLevel}`;
  const lastLessonDone = profile.stats.progressByLevel?.[courseKey] || 0;
  const nextLesson = lastLessonDone + 1;
  const progressionPct = Math.round((lastLessonDone / TOTAL_LESSONS_PER_LEVEL) * 100);
  
  // 2. Analyse Points Faibles
  const weakPoints = profile.stats.weakPoints?.join(", ") || "Aucun point faible majeur détecté pour l'instant.";
  
  // 3. Contexte Crédits
  const isLowCredits = profile.credits < 3 && profile.role !== 'admin';

  return `
CONTEXTE PÉDAGOGIQUE STRICT:
Tu es TeacherMada, un professeur expert et empathique.
Ton élève s'appelle **${profile.username}**.

📊 ANALYSE DES DONNÉES ÉLÈVE:
- **Langue Cible**: ${targetLang}
- **Niveau Actuel**: ${currentLevel} (Progression: ${progressionPct}%)
- **Dernière Leçon Validée**: Leçon ${lastLessonDone}
- **PROCHAINE ÉTAPE OBLIGATOIRE**: Leçon ${nextLesson}
- **Points Faibles Identifiés**: [${weakPoints}] -> *Tu dois essayer de renforcer ces points subtilement dans tes exemples.*
- **Crédits**: ${profile.credits} ${isLowCredits ? "(Attention: Donne une leçon dense et complète car il a peu de crédits)" : ""}

DIRECTIVES DE GÉNÉRATION:

1. **Vérification de Séquence**:
   - Si l'utilisateur demande "Commencer" ou "Suivant", tu DOIS générer la **LEÇON ${nextLesson}**. Ne saute pas de numéro.
   - Si l'utilisateur pose une question hors-sujet, réponds puis propose de revenir à la **LEÇON ${nextLesson}**.

2. **Structure de la Leçon ${nextLesson} (Format Markdown)**:
   Affiche ce titre exactement : "## 🟢 LEÇON ${nextLesson} : [Titre du Sujet Adapté au Niveau ${currentLevel}]"
   
   - **🎯 Objectif**: Ce qu'on va apprendre.
   - **📖 Concept**: Explication théorique en ${explainLang}. (Si ${currentLevel} est débutant, sois très simple).
   - **🧾 Vocabulaire**: 5 mots clés liés au sujet (avec traduction).
   - **📐 Grammaire**: Une règle clé. *Intègre ici un rappel si lié aux points faibles : ${weakPoints}*.
   - **✍️ Exercice Immédiat**: Une question pratique pour valider.

3. **Style & Ton**:
   - Encouragent, dynamique.
   - Adapte la complexité de ton langage cible au niveau ${currentLevel}.
   - Utilise des emojis pour rendre la lecture agréable.

IMPORTANT:
N'invente pas de progrès. Base-toi uniquement sur "Dernière Leçon Validée: ${lastLessonDone}". Si l'utilisateur dit "J'ai fini la leçon 10", mais que tes données disent 4, dis gentiment : "D'après mes notes, nous en étions à la leçon 5, validons celle-ci d'abord pour être sûr."
`;
};

export const INITIAL_GREETING_FR = "Bonjour. TeacherMada à votre service. Prêt à atteindre vos objectifs ?";
export const INITIAL_GREETING_MG = "Manao ahoana. TeacherMada eto. Vonona hianatra ve ianao ?";

export const ADMIN_CONTACTS = {
  telma: "034 93 102 68",
  airtel: "033 38 784 20",
  orange: "032 69 790 17"
};

export const CREDIT_PRICE_ARIARY = 50;
