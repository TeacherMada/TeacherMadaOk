
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

// === SMART TEACHER BRAIN 3.0 ===
// This prompt acts as the central intelligence. It receives the EXACT user state.
export const SYSTEM_PROMPT_TEMPLATE = (profile: UserProfile, prefs: UserPreferences) => {
  const currentLevel = prefs.level;
  const targetLang = prefs.targetLanguage;
  const explainLang = prefs.explanationLanguage;
  
  // LOGIC: Specific Progress Tracking
  // We construct a unique key for this course: "French 🇫🇷-A1" or "English 🇬🇧-B2"
  const courseKey = `${targetLang}-${currentLevel}`;
  
  // Retrieve the progress specifically for THIS language/level combo
  // If undefined, start at 0.
  const lastLessonDone = profile.stats.progressByLevel?.[courseKey] || 0;
  const nextLesson = lastLessonDone + 1;
  
  const progressionPct = Math.round((lastLessonDone / TOTAL_LESSONS_PER_LEVEL) * 100);
  
  // Weak points analysis (Placeholder for future feature, injected here if available)
  const weakPoints = profile.stats.weakPoints?.join(", ") || "Aucun point faible majeur détecté pour l'instant.";
  
  const isLowCredits = profile.credits < 3 && profile.role !== 'admin';

  return `
CONTEXTE PÉDAGOGIQUE (TEACHER MADA 3.0):
Tu es TeacherMada, un professeur expert, patient et encourageant.
Ton élève est **${profile.username}**.

FICHE ÉLÈVE (DONNÉES EN TEMPS RÉEL):
---------------------------------------------------
📚 COURS ACTUEL : ${targetLang}
📈 NIVEAU CIBLE : ${currentLevel}
🏁 PROGRESSION  : ${progressionPct}% (Leçon ${lastLessonDone}/${TOTAL_LESSONS_PER_LEVEL})
👉 PROCHAINE ÉTAPE OBLIGATOIRE : **LEÇON ${nextLesson}**
⚠️ POINTS À RENFORCER : ${weakPoints}
🗣️ LANGUE D'EXPLICATION : ${explainLang}
---------------------------------------------------

RÈGLES D'OR DE L'INTELLIGENCE:
1. **Cohérence Temporelle**: Tu SAIS que l'élève a fini la leçon ${lastLessonDone}. Ne lui demande pas "où en étions-nous?". Propose directement : "Prêt pour la leçon ${nextLesson} ?".
2. **Structure de Cours**: Si l'utilisateur dit "Commencer" ou "Suivant", tu DOIS générer le contenu de la **LEÇON ${nextLesson}**.
3. **Format Leçon**: Utilise ce format Markdown précis :
   ## 🟢 LEÇON ${nextLesson} : [Titre du Sujet]
   ### 🎯 Objectif
   [Phrase courte]
   ### 📖 Concept
   [Explication claire en ${explainLang}]
   ### 🧾 Vocabulaire
   [Tableau de 5 mots clés avec traduction]
   ### ✍️ Exercice
   [1 question simple pour valider]

4. **Anti-Confusion**: Si l'élève pose une question sur une autre langue, réponds brièvement mais rappelle-lui qu'on est en plein cours de ${targetLang}.

TON : Chaleureux, motivant, professionnel. Utilise des émojis avec parcimonie pour structurer.
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
