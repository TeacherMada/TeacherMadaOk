
import { UserProfile, UserPreferences, LevelDescriptor, LanguageLevel } from './types';

// Nombre de leçons pour valider un niveau (ex: A1 a 50 leçons)
export const TOTAL_LESSONS_PER_LEVEL = 50;

// === DEFINITIONS DES NIVEAUX (BASE DE CONNAISSANCE) ===
export const LEVEL_DEFINITIONS: Record<string, LevelDescriptor> = {
  // CECRL
  'A1': {
    code: 'A1', title: 'Débutant / Introductif',
    description: "Vous découvrez la langue. Vous comprenez des expressions très simples.",
    skills: ["Se présenter", "Poser des questions simples", "Comprendre des mots familiers"],
    example: "Je m'appelle Alex. J'aime le café."
  },
  'A2': {
    code: 'A2', title: 'Intermédiaire / Survie',
    description: "Vous pouvez communiquer lors de tâches simples et habituelles.",
    skills: ["Décrire son environnement", "Parler de son passé", "Échanges courts au magasin"],
    example: "Hier, je suis allé au marché acheter des fruits."
  },
  'B1': {
    code: 'B1', title: 'Seuil / Indépendant',
    description: "Vous vous débrouillez dans la plupart des situations de voyage.",
    skills: ["Raconter un événement", "Donner son opinion", "Comprendre l'essentiel d'une émission"],
    example: "Je pense que ce film est intéressant car il montre la réalité."
  },
  'B2': {
    code: 'B2', title: 'Avancé / Indépendant',
    description: "Vous communiquez avec aisance et spontanéité.",
    skills: ["Comprendre des textes complexes", "Argumenter sans chercher ses mots", "Nuancer ses propos"],
    example: "Bien que ce soit difficile, il est crucial de persévérer pour réussir."
  },
  'C1': {
    code: 'C1', title: 'Autonome / Expert',
    description: "Vous vous exprimez couramment et de façon structurée.",
    skills: ["Utiliser la langue pour le travail", "Saisir l'implicite et l'humour", "Vocabulaire riche"],
    example: "L'impact socio-économique de cette mesure est indéniablement significatif."
  },
  'C2': {
    code: 'C2', title: 'Maîtrise / Bilingue',
    description: "Vous comprenez sans effort pratiquement tout ce que vous lisez ou entendez.",
    skills: ["Restituer des faits et arguments de sources diverses", "S'exprimer avec une grande précision"],
    example: "C'est une distinction subtile, mais néanmoins primordiale dans ce contexte littéraire."
  },
  // HSK (Chinois)
  'HSK 1': {
    code: 'HSK 1', title: 'Grand Débutant',
    description: "Vous connaissez 150 mots de base. Introduction au Pinyin.",
    skills: ["Salutations", "Chiffres et Dates", "Phrases très courtes"],
    example: "你好 (Nǐ hǎo) - Bonjour."
  },
  'HSK 2': {
    code: 'HSK 2', title: 'Débutant',
    description: "Vous connaissez 300 mots. Vous pouvez avoir des échanges simples.",
    skills: ["Commander à manger", "Demander son chemin", "Parler de la famille"],
    example: "我要喝水 (Wǒ yào hē shuǐ) - Je veux boire de l'eau."
  },
  'HSK 3': {
    code: 'HSK 3', title: 'Intermédiaire',
    description: "600 mots. Vous pouvez communiquer sur la vie quotidienne, études, travail.",
    skills: ["Lire des textes simples sans Pinyin", "Exprimer la durée", "Comparaisons"],
    example: "虽然...但是... (Suīrán... dànshì...) - Bien que... mais..."
  },
  'HSK 4': {
    code: 'HSK 4', title: 'Intermédiaire Supérieur',
    description: "1200 mots. Vous discutez de sujets variés assez couramment.",
    skills: ["Discussions fluides", "Grammaire complexe", "Lire des articles simples"],
    example: "Expressions idiomatiques simples."
  },
  'HSK 5': {
    code: 'HSK 5', title: 'Avancé',
    description: "2500 mots. Vous pouvez lire des journaux et regarder des films.",
    skills: ["Discours complet", "Termes abstraits", "Rédaction structurée"],
    example: "Analyse de situation."
  },
  'HSK 6': {
    code: 'HSK 6', title: 'Expert',
    description: "5000+ mots. Compréhension totale.",
    skills: ["Littérature", "Débats techniques", "Maîtrise totale"],
    example: "Langage soutenu et technique."
  }
};

// --- LE CERVEAU PÉDAGOGIQUE ---
export const SYSTEM_PROMPT_TEMPLATE = (profile: UserProfile, prefs: UserPreferences) => {
  const currentLevel = prefs.level;
  const targetLang = prefs.targetLanguage;
  const explainLang = prefs.explanationLanguage;
  
  // Clé unique pour suivre la progression de CE cours spécifique
  const courseKey = `${targetLang}-${currentLevel}`;
  const lastLessonDone = profile.stats.progressByLevel?.[courseKey] || 0;
  const nextLesson = lastLessonDone + 1;
  
  const isAssessmentMode = prefs.needsAssessment;
  const isStructuredCourse = prefs.mode.includes('Cours');

  return `
CONTEXTE SYSTÈME:
Tu es TeacherMada, une IA pédagogique avancée spécialisée dans l'enseignement structuré des langues.
Ton objectif est de guider l'élève (${profile.username}) pas à pas, leçon après leçon, jusqu'à la maîtrise du niveau ${currentLevel}.

ÉTAT DE L'ÉLÈVE (Synchronisation Données):
- Langue Cible: ${targetLang}
- Niveau Actuel: ${currentLevel}
- Langue d'Explication: ${explainLang}
- Dernier Progrès Enregistré: Leçon ${lastLessonDone} terminée sur ${TOTAL_LESSONS_PER_LEVEL}.
- **TA MISSION IMMÉDIATE**: Générer et enseigner la **LEÇON ${nextLesson}**.

${isAssessmentMode ? `
⚠️ MODE ÉVALUATION ACTIVÉ:
L'utilisateur ne connait pas son niveau. Ignore la leçon ${nextLesson}.
Pose 3 questions de difficulté croissante. Analyse les réponses et estime le niveau (A1-C2).
` : `
DIRECTIVE STRICTE DE STRUCTURE (MODE COURS):
Tu dois impérativement structurer ta réponse pour la **LEÇON ${nextLesson}** comme suit (utilise Markdown) :

## 🟢 LEÇON ${nextLesson} : [Titre du Sujet de Grammaire/Vocabulaire adapté au niveau ${currentLevel}]

### 🎯 Objectif
[En 1 phrase simple : ce que l'élève saura faire après cette leçon]

### 📖 Le Concept (Théorie)
[Explication claire, concise et pédagogique en ${explainLang}. Utilise des analogies si besoin. Max 100 mots.]

### 🧾 Vocabulaire Clé
[Tableau ou liste de 5 à 7 mots/phrases essentiels pour ce sujet, avec traduction]

### 📐 La Règle (Grammaire)
[Si applicable, la structure de phrase ou la règle de conjugaison. Ex: Sujet + Verbe + ...]

### ✍️ À toi de jouer ! (Exercice)
[Pose **UNE** question ou un petit exercice de traduction immédiat pour vérifier la compréhension. Ne donne pas la réponse tout de suite.]

RÈGLES D'ADAPTATION:
1. Ne saute jamais d'étapes. Si l'élève pose une question hors-sujet, réponds brièvement puis reviens à la leçon ${nextLesson}.
2. Si l'élève échoue à l'exercice, réexplique différemment avant de passer à la suite.
3. Si l'élève réussit, félicite-le et propose de passer à la Leçon ${nextLesson + 1}.
`}

AUTRES MODES:
Si le mode est "Discussion libre", ignore la structure de leçon. Contente-toi de converser en ${targetLang} en corrigeant les fautes au fur et à mesure.

TON TON:
Encourageant, professionnel, clair. Tu es un tuteur patient.
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
