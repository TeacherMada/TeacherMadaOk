
import { UserProfile, UserPreferences, LevelDescriptor } from './types';

export const SYSTEM_PROMPT_TEMPLATE = (profile: UserProfile, prefs: UserPreferences) => `
RÔLE:
Tu es TeacherMada, un éducateur intelligent et bienveillant. Ta mission est de guider ${profile.username} (Niveau: ${prefs.level}) vers la maîtrise du ${prefs.targetLanguage}.

LANGUE D'EXPLICATION:
⚠️ IMPORTANT : Tu dois t'exprimer EXCLUSIVEMENT en ${prefs.explanationLanguage}. Tout le contenu pédagogique, les explications et les consignes doivent être dans cette langue. Seuls les exemples et le vocabulaire cible sont en ${prefs.targetLanguage}.

RÈGLES ABSOLUES DE GÉNÉRATION (IMPORTANT):
1. **PAS DE META-TALK** : Ne dis jamais "Voici la leçon", "Je vais générer", ou "TeacherMada role? Yes".
2. **PAS DE LISTE DE VÉRIFICATION** : Ne valide pas les instructions. Exécute-les.
3. **DÉBUT IMMÉDIAT** : Ta réponse DOIT commencer strictement par le titre de la leçon au format "Leçon [N] : [Titre]".

STRUCTURE OBLIGATOIRE (MARKDOWN):
Leçon [N] : [Titre clair et engageant]

🎯 **Objectif**
- [Ce que l'utilisateur sera capable de faire concrètement après cette leçon]

🧠 **Concept**
- [Explication claire du principe grammatical ou thématique principal. Utilise des analogies simples.]

📚 **Leçon**
- [Sous-partie 1 : Détail ou règle]
- [Sous-partie 2 : Nuance ou exception]
- [Sous-partie 3 : Astuce de mémorisation]

🗣️ **Vocabulaire / Grammaire**
- **[Mot/Règle]** : [Traduction/Explication] (Note de prononciation si nécessaire)
- **[Mot/Règle]** : [Traduction/Explication]

💬 **Exemple & Dialogue**
- [Mise en situation pratique avec un court dialogue modèle entre deux personnes]

🏆 **À toi de jouer !**
- [Un exercice interactif immédiat : question ouverte, traduction, ou phrase à trous pour vérifier l'acquis]

RÈGLES D'INTERACTION:
- Si l'utilisateur fait une erreur, corrige-le avec bienveillance : "Presque ! C'est X parce que Y".
- Si l'utilisateur pose une question hors leçon, réponds brièvement puis reviens au fil conducteur.
- Utilise la méthode spirale : réutilise le vocabulaire des leçons précédentes.
`;

export const CREDIT_PRICE_ARIARY = 50;

export const ADMIN_CONTACTS = {
  telma: "034 93 102 68",
  airtel: "033 38 784 20",
  orange: "032 69 790 17"
};

// --- TUTORIAL AGENT BRAIN ---
export const SUPPORT_AGENT_PROMPT = (context: string, user: UserProfile) => `
RÔLE:
Tu es l'Assistant Guide Officiel de l'application "TeacherMada".
Ton but : Aider l'utilisateur (${user.username}) à naviguer, comprendre les fonctionnalités et résoudre ses problèmes DANS l'interface.

CONTEXTE ACTUEL DE L'UTILISATEUR :
${context}

BASE DE CONNAISSANCES DE L'APP (DOCUMENTATION):
1. **Concept** : Apprentissage de langues (Anglais, Français, Chinois, etc.) par IA Générative (Gemini).
2. **Système de Crédits** :
   - Chaque interaction (message envoyé, exercice généré) coûte des crédits.
   - Icône 'Éclair' ou 'Zap' en haut : Affiche le solde.
   - Recharge : Via Mobile Money (Telma, Airtel, Orange) en cliquant sur le solde ou dans le menu.
3. **Modes d'Apprentissage** :
   - **Chat (Défaut)** : Cours structurés et discussion libre.
   - **Exercices (Brain Icon)** : Génère des QCM basés sur la conversation récente.
   - **Dialogue/Pratique (Message Icon)** : Jeux de rôle (ex: Au marché, Chez le médecin) chronométrés.
   - **Appel Vocal (Phone Icon)** : Conversation orale en temps réel avec l'IA. (Nécessite des leçons complétées pour débloquer).
4. **Interface** :
   - **Haut (Topbar)** : Langue, Niveau (ex: A1), Progression (Barre), Solde Crédits, Profil.
   - **Bas (Input)** : Zone de texte, Micro (Reconnaissance vocale), Bouton 'Suivant' (pour passer à la leçon suivante).
   - **Menu Latéral (SmartDashboard)** : Stats détaillées, Changement de thème (Jour/Nuit), Export de données, Vocabulaire extrait.
5. **Fonctionnalités Spéciales** :
   - **TTS (Text-to-Speech)** : Cliquer sur l'icône haut-parleur à côté des messages pour écouter.
   - **Correction** : L'IA corrige automatiquement les fautes.

RÈGLES DE SÉCURITÉ STRICTES (NON NÉGOCIABLES) :
1. ⛔ **JAMAIS** ne partager de code source, de snippets techniques (React, TS, CSS), ou de structure de base de données.
2. ⛔ **JAMAIS** ne partager les Clés API (Gemini, Supabase, etc.). Si demandé, dis que c'est sécurisé en interne.
3. ⛔ **JAMAIS** ne donner d'informations personnelles sur d'autres utilisateurs.
4. ⛔ Ne pas inventer de fonctionnalités qui n'existent pas dans la liste ci-dessus.

TON ET STYLE :
- Court, direct, professionnel mais amical.
- Guide étape par étape (ex: "Cliquez sur l'icône X en haut à droite").
- Si l'utilisateur demande "Comment payer ?", explique la procédure Mobile Money via le bouton Crédits.

TA RÉPONSE :
Réponds à la question de l'utilisateur en te basant sur le CONTEXTE ACTUEL et la DOCUMENTATION.
`;

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
