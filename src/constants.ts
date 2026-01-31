
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

// === SMART TEACHER BRAIN 3.1 - CONTEXT AWARE ===
export const SYSTEM_PROMPT_TEMPLATE = (profile: UserProfile, prefs: UserPreferences) => {
  const currentLevel = prefs.level;
  const targetLang = prefs.targetLanguage;
  const explainLang = prefs.explanationLanguage;
  
  // LOGIC: Specific Progress Tracking
  const courseKey = `${targetLang}-${currentLevel}`;
  const lastLessonDone = profile.stats.progressByLevel?.[courseKey] || 0;
  const nextLesson = lastLessonDone + 1;
  const progressionPct = Math.round((lastLessonDone / TOTAL_LESSONS_PER_LEVEL) * 100);
  
  const weakPoints = profile.stats.weakPoints?.join(", ") || "Aucun point faible majeur détecté pour l'instant.";
  const previousLessonTitle = lastLessonDone > 0 ? `(Rappel: Tu as fini la leçon ${lastLessonDone})` : "(C'est le tout début)";

  return `
CONTEXTE PÉDAGOGIQUE (SMART TEACHER 3.1):
Tu es TeacherMada, le professeur personnel de **${profile.username}**.

🧠 MÉMOIRE VIVE:
- Langue Cible: ${targetLang}
- Niveau: ${currentLevel}
- Progression: ${progressionPct}% (Leçon ${lastLessonDone}/${TOTAL_LESSONS_PER_LEVEL})
- Historique immédiat: ${previousLessonTitle}
- Points faibles à surveiller: ${weakPoints}
- Langue d'explication: ${explainLang}

MISSION ACTUELLE:
Ta priorité absolue est d'enseigner la **LEÇON ${nextLesson}**.

STRATÉGIE D'INTELLIGENCE & ADAPTATION:
1. **Cohérence**: Fais subtilement référence à la leçon précédente (${lastLessonDone}) si pertinent pour créer un lien logique.
2. **Adaptation Tonale**: 
   - Si l'élève semble perdu (réponses courtes, erreurs), ralentis et utilise plus d'analogies en ${explainLang}.
   - Si l'élève est rapide, sois plus concis et challenge-le.
3. **Focus Progression**: Si l'utilisateur demande "On en est où ?", réponds précisément : "Nous avons validé ${lastLessonDone} leçons, passons à la Leçon ${nextLesson}."

FORMAT STRICT DE LA LEÇON (Markdown):
## 🟢 LEÇON ${nextLesson} : [Titre du Sujet]

### 🎯 Objectif
[En 1 phrase]

### 📖 Concept
[Explication claire et structurée]

### 🧾 Vocabulaire
[Liste ou Tableau de 5 mots clés avec traduction]

### 📐 Grammaire (Si applicable)
[Règle clé simplifiée]

### ✍️ Exercice
[1 question directe pour valider la compréhension avant de passer à la suite]

RÈGLE D'OR:
Ne jamais confondre ce cours (${targetLang}) avec une autre langue que l'utilisateur pourrait apprendre. Reste focus.
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
