
import { UserProfile, UserPreferences, LevelDescriptor } from './types';

export const SYSTEM_PROMPT_TEMPLATE = (profile: UserProfile, prefs: UserPreferences) => `
ROLE: Tu es TeacherMada, un tuteur de langue personnel expert, drôle et bienveillant.
TON ÉLÈVE: ${profile.username} (Niveau: ${prefs.level}).
LANGUE CIBLE: ${prefs.targetLanguage}.
LANGUE D'EXPLICATION: ${prefs.explanationLanguage}.

🎯 PHILOSOPHIE PÉDAGOGIQUE (MICRO-LEARNING):
Enseigne étape par étape. Pas de gros blocs de texte.
1. Un seul concept à la fois.
2. Des exemples concrets.
3. Une interaction immédiate.

📝 STRUCTURE DE RÉPONSE OBLIGATOIRE:
Commence TOUJOURS par le tag **[Leçon N]** (où N est le numéro de la leçon actuelle) pour que l'interface se synchronise.

Format Markdown :

[Leçon N]
## 📌 Titre Accrocheur

### 💡 Concept Clé
Explication simple et brève.

### 🧠 Vocabulaire / Grammaire
**MotClé** : Traduction (si nécessaire)
*(Petite note de prononciation ou astuce)*

### 🗣️ Exemple / Dialogue
Une phrase ou un mini-dialogue utilisant le concept.

### 🚀 À toi de jouer !
Pose une question, demande une traduction ou fais un exercice à trous.

CORRECTIONS:
Si l'élève fait une erreur, corrige-le gentiment avec : ❌ [Erreur] 👉 ✅ [Correction] (Explication courte).

TON:
Encourageant, dynamique, utilise des emojis.
Si l'élève clique sur "Suivant", passe logiquement à la suite (Exemple -> Exercice -> Nouveau Concept).
`;

export const CREDIT_PRICE_ARIARY = 50;

export const ADMIN_CONTACTS = {
  telma: "034 93 102 68",
  airtel: "033 38 784 20",
  orange: "032 69 790 17"
};

export const LEVEL_DEFINITIONS: Record<string, LevelDescriptor> = {
  'A1': {
    code: 'A1',
    title: 'Débutant / Découverte',
    description: "Vous comprenez des expressions familières et quotidiennes.",
    skills: ["Se présenter simplement", "Poser des questions basiques", "Comprendre des phrases très simples"],
    example: "Je m'appelle Paul. J'habite à Paris."
  },
  'A2': {
    code: 'A2',
    title: 'Intermédiaire / Survie',
    description: "Vous pouvez communiquer lors de tâches simples et habituelles.",
    skills: ["Décrire votre environnement", "Parler de votre famille", "Echanges brefs sur des sujets connus"],
    example: "J'aime aller au cinéma le week-end avec mes amis."
  },
  'B1': {
    code: 'B1',
    title: 'Seuil / Indépendant',
    description: "Vous êtes autonome dans la plupart des situations de voyage.",
    skills: ["Raconter un événement", "Donner votre opinion", "Vous débrouiller en voyage"],
    example: "Je pense que ce film est intéressant car il parle de l'histoire."
  },
  'B2': {
    code: 'B2',
    title: 'Avancé / Indépendant',
    description: "Vous comprenez le contenu essentiel de sujets concrets ou abstraits.",
    skills: ["Argumenter avec aisance", "Comprendre des conférences", "Parler avec spontanéité"],
    example: "Bien que le sujet soit complexe, il est crucial d'en débattre."
  },
  'C1': {
    code: 'C1',
    title: 'Autonome / Expérimenté',
    description: "Vous vous exprimez spontanément et couramment sans trop chercher vos mots.",
    skills: ["Utiliser la langue de façon souple", "Produire des discours clairs et structurés", "Comprendre des textes longs"],
    example: "L'impact socio-économique de cette mesure est indéniable."
  },
  'C2': {
    code: 'C2',
    title: 'Maîtrise / Expert',
    description: "Vous comprenez sans effort pratiquement tout ce que vous lisez ou entendez.",
    skills: ["Nuancer finement le sens", "Reconstruire des arguments complexes", "S'exprimer comme un natif"],
    example: "Il va sans dire que les ramifications de cette hypothèse sont vastes."
  },
  'HSK 1': {
    code: 'HSK 1',
    title: 'Débutant (Chinois)',
    description: "Vous comprenez et utilisez des mots et phrases très simples.",
    skills: ["150 mots de vocabulaire", "Salutations basiques", "Présentation simple"],
    example: "你好 (Nǐ hǎo) - Bonjour"
  },
  'HSK 2': {
    code: 'HSK 2',
    title: 'Élémentaire (Chinois)',
    description: "Vous communiquez sur des sujets familiers de manière simple.",
    skills: ["300 mots de vocabulaire", "Faire des achats", "Parler de la vie quotidienne"],
    example: "我要买这个 (Wǒ yào mǎi zhège) - Je veux acheter ça"
  },
  'HSK 3': {
    code: 'HSK 3',
    title: 'Intermédiaire (Chinois)',
    description: "Vous pouvez communiquer de manière basique dans la vie courante, les études, le travail.",
    skills: ["600 mots de vocabulaire", "Voyager en Chine", "Discussions simples"],
    example: "这个周末我想去北京 (Zhège zhōumò wǒ xiǎng qù Běijīng)"
  },
  'HSK 4': {
    code: 'HSK 4',
    title: 'Avancé (Chinois)',
    description: "Vous discutez sur une gamme de sujets et communiquez couramment avec des locuteurs natifs.",
    skills: ["1200 mots de vocabulaire", "Débats simples", "Lire des articles simples"],
    example: "我认为这是一个好主意 (Wǒ rènwéi zhè shì yīgè hǎo zhǔyì)"
  },
  'HSK 5': {
    code: 'HSK 5',
    title: 'Courant (Chinois)',
    description: "Vous lisez des journaux, regardez des films et faites des discours complets.",
    skills: ["2500+ mots de vocabulaire", "Discours structurés", "Compréhension approfondie"],
    example: "随着经济的发展... (Suízhe jīngjì de fāzhǎn...)"
  },
  'HSK 6': {
    code: 'HSK 6',
    title: 'Maîtrise (Chinois)',
    description: "Vous comprenez facilement les informations entendues ou lues et vous vous exprimez couramment.",
    skills: ["5000+ mots de vocabulaire", "Compréhension totale", "Expression native"],
    example: "毋庸置疑... (Wúyōngzhìyí...)"
  }
};
