
import { UserProfile, UserPreferences, LevelDescriptor } from './types';

// Add LEVEL_DEFINITIONS to fix import error in src/components/Onboarding.tsx
export const LEVEL_DEFINITIONS: Record<string, LevelDescriptor> = {
  'A1': {
    code: 'A1',
    title: 'Débutant / Introductif',
    description: 'Peut comprendre et utiliser des expressions familières et quotidiennes.',
    skills: [
      'Se présenter ou présenter quelqu\'un',
      'Poser des questions simples sur l\'habitat, les relations, etc.',
      'Communiquer de façon simple si l\'interlocuteur parle lentement'
    ],
    example: 'Ex: "Bonjour, je m\'appelle Jean."'
  },
  'A2': {
    code: 'A2',
    title: 'Élémentaire / Intermédiaire',
    description: 'Peut comprendre des phrases isolées et des expressions fréquemment utilisées.',
    skills: [
      'Échanger des informations simples sur des sujets familiers',
      'Décrire avec des moyens simples sa formation, son environnement'
    ],
    example: 'Ex: "Je voudrais un café s\'il vous plaît."'
  },
  'B1': {
    code: 'B1',
    title: 'Indépendant / Seuil',
    description: 'Peut comprendre les points essentiels quand un langage clair et standard est utilisé.',
    skills: [
      'Se débrouiller dans la plupart des situations rencontrées en voyage',
      'Raconter un événement, une expérience ou un rêve'
    ],
    example: 'Ex: "Je pense que ce film était très intéressant parce que..." '
  },
  'B2': {
    code: 'B2',
    title: 'Indépendant / Avancé',
    description: 'Peut comprendre le contenu essentiel de sujets concrets ou abstraits.',
    skills: [
      'Communiquer avec un degré de spontanéité et d\'aisance',
      'S\'exprimer de façon claire et détaillée sur une grande gamme de sujets'
    ],
    example: 'Ex: "Bien que je comprenne votre point de vue, je ne suis pas d\'accord..." '
  },
  'C1': {
    code: 'C1',
    title: 'Autonome',
    description: 'Peut comprendre une grande gamme de textes longs et exigeants.',
    skills: [
      'S\'exprimer spontanément et couramment sans trop apparemment chercher ses mots',
      'Utiliser la langue de façon efficace et souple dans sa vie sociale ou pro'
    ],
    example: 'Ex: "Il est impératif de souligner l\'importance de..." '
  },
  'C2': {
    code: 'C2',
    title: 'Maîtrise',
    description: 'Peut comprendre sans effort pratiquement tout ce qu\'il/elle lit ou entend.',
    skills: [
      'Restituer faits et arguments de diverses sources écrites et orales en les résumant',
      'S\'exprimer très couramment et de façon précise'
    ],
    example: 'Ex: "Nonobstant les aléas de la conjoncture actuelle..." '
  },
  'HSK 1': {
    code: 'HSK 1',
    title: 'HSK 1 / Débutant',
    description: 'Peut comprendre et utiliser des mots et phrases très simples en chinois.',
    skills: [
      'Connaître environ 150 mots courants',
      'Répondre à des questions basiques sur soi-même'
    ],
    example: 'Ex: "你好 (Nǐ hǎo)"'
  },
  'HSK 2': {
    code: 'HSK 2',
    title: 'HSK 2 / Élémentaire',
    description: 'Peut communiquer sur des sujets familiers et simples en chinois.',
    skills: [
      'Connaître environ 300 mots',
      'Utiliser la langue pour des besoins quotidiens basiques'
    ],
    example: 'Ex: "这个多少钱? (Zhège duōshǎo qián?)"'
  },
  'HSK 3': {
    code: 'HSK 3',
    title: 'HSK 3 / Intermédiaire',
    description: 'Peut communiquer sur des sujets de la vie courante, des études et du travail.',
    skills: [
      'Connaître environ 600 mots',
      'Voyager en Chine et faire face à la plupart des situations de communication'
    ],
    example: 'Ex: "虽然中文很难，但是我喜欢学习。"'
  },
  'HSK 4': {
    code: 'HSK 4',
    title: 'HSK 4 / Avancé',
    description: 'Peut discuter de sujets variés et s\'exprimer couramment en chinois.',
    skills: [
      'Connaître environ 1200 mots',
      'Converser avec des locuteurs natifs sur divers sujets'
    ],
    example: 'Ex: "为了提高口语水平，我每天练习听力。"'
  },
  'HSK 5': {
    code: 'HSK 5',
    title: 'HSK 5 / Supérieur',
    description: 'Peut lire des journaux et magazines chinois et comprendre des films.',
    skills: [
      'Connaître environ 2500 mots',
      'Donner un discours complet en chinois'
    ],
    example: 'Ex: "我认为环境保护是当今社会面临的重要挑战之一。"'
  },
  'HSK 6': {
    code: 'HSK 6',
    title: 'HSK 6 / Expert',
    description: 'Peut comprendre facilement toute information entendue ou lue en chinois.',
    skills: [
      'Connaître plus de 5000 mots',
      'S\'exprimer couramment et de manière appropriée'
    ],
    example: 'Ex: "鉴于目前的发展趋势，我们需要采取更加果断的措施。"'
  }
};

export const SYSTEM_PROMPT_TEMPLATE = (profile: UserProfile, prefs: UserPreferences) => `
ROLE:
Tu es TeacherMada, un professeur de langues d'excellence. 
Ton but est de faire progresser l'élève avec une pédagogie structurée.

STRICTE INTERDICTION:
NE JAMAIS GÉNÉRER DE CODE INFORMATIQUE (HTML, CSS, JS, Python, etc.) ou de blocs de code (triple backticks). 
Tu es un professeur de LANGUES HUMAINES, pas un assistant de programmation.

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

SOIS ENCOURAGEANT ET CLAIR.
`;

export const INITIAL_GREETING_FR = "Bonjour. Je suis TeacherMada. Prêt à commencer votre leçon aujourd'hui ?";
export const INITIAL_GREETING_MG = "Manao ahoana. TeacherMada eto. Vonona hianatra ve ianao ?";

export const ADMIN_CONTACTS = {
  telma: "034 93 102 68",
  airtel: "033 38 784 20",
  orange: "032 69 790 17"
};

export const CREDIT_PRICE_ARIARY = 50;
