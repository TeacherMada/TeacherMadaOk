
import { UserProfile, UserPreferences, LevelDescriptor } from './types';

export const SYSTEM_PROMPT_TEMPLATE = (profile: UserProfile, prefs: UserPreferences) => `
Tu es TeacherMada, un professeur de langues expert.
Ton but : Faire progresser l'élève (${profile.username}) en ${prefs.targetLanguage}.

REGLES:
- Langue d'explication: ${prefs.explanationLanguage}.
- Structure de cours stricte : Titre (##), Objectif, Vocabulaire, Grammaire, Exercice.
- INTERDICTION de générer du code informatique.
- Sois bref et encourageant.
`;

export const INITIAL_GREETING_FR = "Bonjour ! Je suis TeacherMada. Prêt pour votre première leçon ?";
export const INITIAL_GREETING_MG = "Manao ahoana ! TeacherMada eto. Vonona hianatra ve ianao ?";

export const ADMIN_CONTACTS = {
  telma: "034 93 102 68",
  airtel: "033 38 784 20",
  orange: "032 69 790 17"
};

export const CREDIT_PRICE_ARIARY = 50;

export const LEVEL_DEFINITIONS: Record<string, LevelDescriptor> = {
    'A1': { code: 'A1', title: 'Débutant / A1', description: 'Peut comprendre des expressions familières.', skills: ['Se présenter', 'Poser des questions simples'], example: 'Bonjour, comment ça va ?' },
    'A2': { code: 'A2', title: 'Élémentaire / A2', description: 'Peut communiquer lors de tâches simples.', skills: ['Décrire son environnement', 'Parler de son passé'], example: 'Hier, je suis allé au marché.' },
    'B1': { code: 'B1', title: 'Intermédiaire / B1', description: 'Peut se débrouiller dans la plupart des situations.', skills: ['Raconter un événement', 'Donner son opinion'], example: 'Je pense que ce livre est intéressant.' },
    'B2': { code: 'B2', title: 'Intermédiaire Avancé / B2', description: 'Peut comprendre l\'essentiel de sujets concrets.', skills: ['Argumenter', 'Comprendre des textes complexes'], example: 'Bien que ce soit difficile, nous devons essayer.' },
    'C1': { code: 'C1', title: 'Autonome / C1', description: 'Peut comprendre une large gamme de textes longs.', skills: ['S\'exprimer spontanément', 'Nuancer son discours'], example: 'Il est impératif que nous prenions en compte ces variables.' },
    'C2': { code: 'C2', title: 'Maîtrise / C2', description: 'Peut comprendre sans effort pratiquement tout ce qu\'il lit ou entend.', skills: ['Restituer des faits', 'Saisir des nuances fines'], example: 'Le raffinement de sa prose témoigne d\'une maîtrise absolue.' },
    'HSK 1': { code: 'HSK 1', title: 'Débutant / HSK 1', description: 'Compréhension de phrases très simples.', skills: ['150 mots de base', 'Saluer'], example: 'Nǐ hǎo.' },
    'HSK 2': { code: 'HSK 2', title: 'Élémentaire / HSK 2', description: 'Utilisation simple et directe.', skills: ['300 mots', 'Situations quotidiennes'], example: 'Wǒ xǐhuān hē chá.' },
    'HSK 3': { code: 'HSK 3', title: 'Intermédiaire / HSK 3', description: 'Communication de base.', skills: ['600 mots', 'Vie courante et travail'], example: 'Wǒ huì shuō yīdiǎn Zhōngwén.' }
};
