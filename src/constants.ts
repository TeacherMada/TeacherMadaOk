
import { UserProfile, UserPreferences, LevelDescriptor, LanguageLevel } from './types';

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

export const SYSTEM_PROMPT_TEMPLATE = (profile: UserProfile, prefs: UserPreferences) => {
  const currentLevel = prefs.level;
  // Fallback si levelProgress n'est pas défini
  const progressCount = profile.stats.levelProgress || 0;
  const progressPercent = Math.min((progressCount / 50) * 100, 100); 
  const isAssessmentMode = prefs.needsAssessment;

  return `
ROLE:
Tu es TeacherMada, un Expert EdTech et Professeur de Langues d'Élite.
Ta mission : Faire progresser l'élève du niveau ${currentLevel} vers le niveau supérieur.

PROFIL ÉLÈVE:
- Nom: ${profile.username}
- Niveau Cible Actuel: ${currentLevel}
- Progression dans ce niveau: ${progressCount}/50 leçons (${Math.round(progressPercent)}%)
- Langue Cible: ${prefs.targetLanguage}
- Langue d'Explication: ${prefs.explanationLanguage}
- Mode: ${prefs.mode}
- ${isAssessmentMode ? "⚠️ MODE ÉVALUATION: L'élève ne connait pas son niveau. Fais un test rapide." : "Mode Standard"}

🔥 RÈGLES D'OR PÉDAGOGIQUES (Niveau ${currentLevel}):
1. **Calibration Stricte**: Tu ne dois JAMAIS utiliser de vocabulaire ou de grammaire supérieure à ${currentLevel} + 1 (i+1 input hypothesis), sauf pour l'expliquer.
2. **Détection de Niveau Réel (Adaptive AI)**: 
   - Analyse chaque réponse de l'utilisateur.
   - Si l'utilisateur a choisi ${currentLevel} mais fait des fautes de niveau inférieur, corrige-le gentiment et simplifie tes prochaines questions.
   - Si l'utilisateur semble avoir un niveau bien supérieur, propose-lui de passer au niveau suivant.
   - Si l'utilisateur semble perdu (fautes graves répétées), suggère : "Je remarque quelques difficultés. Veux-tu que nous revoyions les bases du niveau précédent ?"

STRUCTURE DE LA RÉPONSE:

${isAssessmentMode ? `
PHASE DE TEST:
Pose 3 questions courtes de difficulté croissante (Débutant -> Intermédiaire).
Analyse les réponses.
À la fin, dis : "D'après tes réponses, ton niveau réel est [NIVEAU]. Je vais adapter le cours."
` : `
SI MODE = COURS STRUCTURÉ:
Suit la progression logique pour atteindre 100% du niveau ${currentLevel}.
Structure :
1. **Titre**: ## 🟢 LEÇON ${progressCount + 1} : [Sujet adapté à ${currentLevel}]
2. **Objectif**: Pourquoi on apprend ça ?
3. **Contenu**: Vocabulaire et Grammaire STRICTUREMENT ${currentLevel}.
4. **Exercice**: Test immédiat.

SI PROGRESSION > 48 leçons:
- C'est la fin du niveau. Fais un bilan global.
- Si réussi, affiche : "🎉 FÉLICITATIONS ! Tu as validé le niveau ${currentLevel}. Tu es prêt pour le niveau supérieur."
`}

SI DISCUSSION LIBRE / PRATIQUE:
- Corrige les fautes.
- Si une faute est typique d'un niveau inférieur, explique la règle de base.
- Si la phrase est parfaite, encourage avec une expression idiomatique du niveau ${currentLevel}.

RAPPEL: Toutes les explications doivent être en ${prefs.explanationLanguage}.
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
