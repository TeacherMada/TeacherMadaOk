
import { UserProfile, UserPreferences, LevelDescriptor, LanguageLevel } from './types';

export const SYSTEM_PROMPT_TEMPLATE = (profile: UserProfile, prefs: UserPreferences) => `
Tu es TeacherMada, un professeur de langues expert, humain, chaleureux et professionnel.
Ton but : Faire progresser ${profile.username} en ${prefs.targetLanguage} (Niveau actuel: ${prefs.level}).

REGLES DE COMPORTEMENT:
- Ne mentionne JAMAIS que tu es une IA.
- Ton : Encourageant, bienveillant mais exigeant sur la précision.
- Langue d'explication : ${prefs.explanationLanguage}.

STRUCTURE DE CHAQUE RÉPONSE (SI MODE = COURS STRUCTURÉ):
1. **## [TITRE DE LA MINI-LEÇON]** (Utilise ##)
2. **### 🎯 Objectif** : Pourquoi c'est utile.
3. **### 📖 Théorie** : Explication claire avec astuces culturelles.
4. **### 🧾 Vocabulaire** : 5 mots clés avec traduction.
5. **### 📐 Grammaire** : La règle simplifiée.
6. **### ✍️ Exercice** : Pose UNE question directe ou un petit défi de traduction.

SI MODE = DISCUSSION : Sois un partenaire de conversation naturel. Corrige les fautes entre parenthèses.

IMPORTANT : Interdiction de générer du code. Sois concis.
Mémoire élève : ${profile.aiMemory}.
`;

export const ADMIN_CONTACTS = {
  telma: "034 93 102 68",
  airtel: "033 38 784 20",
  orange: "032 69 790 17"
};

// Add missing CREDIT_PRICE_ARIARY
export const CREDIT_PRICE_ARIARY = 50;

// Add missing LEVEL_DEFINITIONS for onboarding
export const LEVEL_DEFINITIONS: Record<string, LevelDescriptor> = {
  'A1': {
    code: 'A1' as LanguageLevel,
    title: 'Débutant / Introductif',
    description: "Peut comprendre et utiliser des expressions familières et quotidiennes.",
    skills: ["Se présenter", "Poser des questions simples", "Comprendre des phrases basiques"],
    example: "Bonjour, je m'appelle Jean."
  },
  'A2': {
    code: 'A2' as LanguageLevel,
    title: 'Élémentaire / Intermédiaire',
    description: "Peut comprendre des phrases isolées et des expressions fréquemment utilisées.",
    skills: ["Décrire son environnement", "Faire des achats", "Parler de son travail"],
    example: "J'aime aller au cinéma le week-end."
  },
  'B1': {
    code: 'B1' as LanguageLevel,
    title: 'Indépendant / Seuil',
    description: "Peut comprendre les points essentiels quand un langage clair et standard est utilisé.",
    skills: ["Raconter un événement", "Donner son opinion", "Gérer la plupart des situations de voyage"],
    example: "Je pense que nous devrions protéger l'environnement."
  },
  'B2': {
    code: 'B2' as LanguageLevel,
    title: 'Indépendant / Avancé',
    description: "Peut comprendre le contenu essentiel de sujets concrets ou abstraits.",
    skills: ["Argumenter de façon détaillée", "S'exprimer avec aisance", "Comprendre des textes complexes"],
    example: "Bien que ce projet soit difficile, il présente de réelles opportunités."
  },
  'C1': {
    code: 'C1' as LanguageLevel,
    title: 'Autonome / Expert',
    description: "Peut comprendre une large gamme de textes longs et exigeants.",
    skills: ["S'exprimer spontanément", "Utiliser la langue de façon flexible", "Produire des textes structurés"],
    example: "L'analyse des données démontre une corrélation significative entre ces deux variables."
  },
  'C2': {
    code: 'C2' as LanguageLevel,
    title: 'Maîtrise / Bilingue',
    description: "Peut comprendre sans effort pratiquement tout ce qu'il/elle lit ou entend.",
    skills: ["Restituer faits et arguments", "S'exprimer très couramment", "Saisir des nuances fines"],
    example: "C'est dans l'adversité que se révèle la véritable force d'une nation."
  },
  'HSK 1': {
    code: 'HSK 1' as LanguageLevel,
    title: 'Chinois Débutant',
    description: "Compréhension de 150 mots courants.",
    skills: ["Salutations", "Chiffres basiques", "Pronoms"],
    example: "你好 (Nǐ hǎo)"
  },
  'HSK 2': {
    code: 'HSK 2' as LanguageLevel,
    title: 'Chinois Élémentaire',
    description: "Compréhension de 300 mots.",
    skills: ["Vie quotidienne", "Directions", "Météo"],
    example: "今天天气很好 (Jīntiān tiānqì hěn hǎo)"
  }
};
