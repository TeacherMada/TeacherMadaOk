import { UserProfile, UserPreferences, LevelDescriptor } from './types';

export const LEVEL_DEFINITIONS: Record<string, LevelDescriptor> = {
  'A1': {
    code: 'A1',
    title: 'Débutant / Introductif',
    description: 'Peut comprendre et utiliser des expressions familières et quotidiennes.',
    skills: ['Se présenter', 'Poser des questions simples', 'Communiquer basiquement'],
    example: 'Ex: "Bonjour, je m\'appelle Jean."'
  },
  'A2': {
    code: 'A2',
    title: 'Élémentaire',
    description: 'Peut comprendre des phrases isolées et des expressions fréquentes.',
    skills: ['Échanger des infos simples', 'Décrire son environnement'],
    example: 'Ex: "Je voudrais un café s\'il vous plaît."'
  },
  'B1': {
    code: 'B1',
    title: 'Indépendant',
    description: 'Peut se débrouiller dans la plupart des situations en voyage.',
    skills: ['Raconter un événement', 'Donner son opinion'],
    example: 'Ex: "Je pense que ce film était très intéressant."'
  },
  'B2': {
    code: 'B2',
    title: 'Avancé',
    description: 'Peut comprendre le contenu essentiel de sujets complexes.',
    skills: ['Communiquer avec aisance', 'S\'exprimer de façon claire'],
    example: 'Ex: "Bien que je comprenne votre point de vue..." '
  },
  'C1': {
    code: 'C1',
    title: 'Autonome',
    description: 'Peut comprendre une large gamme de textes longs.',
    skills: ['S\'exprimer couramment', 'Usage efficace de la langue'],
    example: 'Ex: "Il est impératif de souligner l\'importance de..." '
  },
  'C2': {
    code: 'C2',
    title: 'Maîtrise',
    description: 'Peut comprendre sans effort pratiquement tout.',
    skills: ['S\'exprimer très précisément', 'Résumer des faits'],
    example: 'Ex: "Nonobstant les aléas de la conjoncture..." '
  },
  'HSK 1': {
    code: 'HSK 1',
    title: 'Débutant Chinois',
    description: 'Bases du Mandarin.',
    skills: ['150 mots courants', 'Questions basiques'],
    example: 'Ex: "你好 (Nǐ hǎo)"'
  }
};

export const SYSTEM_PROMPT_TEMPLATE = (profile: UserProfile, prefs: UserPreferences) => `
ROLE:
Tu es TeacherMada, un professeur de langues d'excellence. 
Ton but est de faire progresser l'élève avec une pédagogie structurée.

INTERDICTION STRICTE :
NE JAMAIS GÉNÉRER DE CODE INFORMATIQUE (HTML, CSS, JS, Python, etc.) ou de blocs de code (triple backticks). 
Tu es un professeur de LANGUES HUMAINES. Réponds toujours en texte pédagogique normal.

CONTEXTE:
- Élève: ${profile.username}
- Langue Cible: ${prefs.targetLanguage}
- Niveau: ${prefs.level}
- Langue Explication: ${prefs.explanationLanguage}
- Mode: ${prefs.mode}

STRUCTURE DE COURS (Si mode = Cours):
1. ## 🟢 LEÇON [Numéro] : [Titre]
2. ### 🎯 OBJECTIF
3. ### 📖 THÉORIE (Explications en ${prefs.explanationLanguage})
4. ### 🧾 VOCABULAIRE
5. ### 📐 GRAMMAIRE
6. ### 💬 EXEMPLE
7. ### ✍️ EXERCICE

SOIS ENCOURAGEANT.
`;

export const INITIAL_GREETING_FR = "Bonjour. Je suis TeacherMada. Prêt à commencer ?";
export const INITIAL_GREETING_MG = "Manao ahoana. TeacherMada eto. Vonona hianatra ve ianao ?";

export const ADMIN_CONTACTS = {
  telma: "034 93 102 68",
  airtel: "033 38 784 20",
  orange: "032 69 790 17"
};

export const CREDIT_PRICE_ARIARY = 50;
