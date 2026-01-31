
import { UserProfile, UserPreferences, LevelDescriptor, LanguageLevel } from './types';

export const TOTAL_LESSONS_PER_LEVEL = 50;

export const LEVEL_DEFINITIONS: Record<string, LevelDescriptor> = {
  'A1': { 
      code: 'A1', 
      title: 'Débutant / Bases', 
      description: "Vous comprenez et utilisez des expressions familières et quotidiennes.", 
      skills: ["Se présenter", "Poser des questions simples", "Comprendre des mots familiers"], 
      example: "Hello, my name is Rindra. I live in Antananarivo." 
  },
  'A2': { 
      code: 'A2', 
      title: 'Élémentaire / Survie', 
      description: "Vous pouvez communiquer lors de tâches simples et habituelles.", 
      skills: ["Décrire votre environnement", "Parler de votre famille", "Faire des achats simples"], 
      example: "I would like to buy two tickets for the concert, please." 
  },
  'B1': { 
      code: 'B1', 
      title: 'Intermédiaire / Indépendant', 
      description: "Vous êtes autonome dans la plupart des situations de voyage.", 
      skills: ["Raconter un événement", "Exprimer une opinion", "Comprendre les points essentiels"], 
      example: "I think this movie is interesting because it shows the reality of life." 
  },
  'B2': { 
      code: 'B2', 
      title: 'Avancé / Fluide', 
      description: "Vous communiquez avec spontanéité et aisance.", 
      skills: ["Argumenter avec logique", "Comprendre des sujets complexes", "Parler sans trop chercher ses mots"], 
      example: "Whatever the outcome, we must ensure the sustainability of this project." 
  },
  'C1': { 
      code: 'C1', 
      title: 'Expert / Autonome', 
      description: "Vous vous exprimez couramment et de façon structurée.", 
      skills: ["Utiliser la langue de façon souple", "Comprendre des textes longs", "Maîtriser les nuances"], 
      example: "Ideally, we should scrutinize the underlying implications of this policy." 
  },
  'C2': { 
      code: 'C2', 
      title: 'Maîtrise / Bilingue', 
      description: "Vous comprenez sans effort pratiquement tout ce que vous lisez ou entendez.", 
      skills: ["Nuances très fines de sens", "Reconstruire des faits et arguments", "Style précis et adapté"], 
      example: "The subtle irony in his speech was lost on the audience." 
  },
  'HSK 1': { 
      code: 'HSK 1', 
      title: 'HSK 1 (Chinois)', 
      description: "Maîtrise de 150 mots de base. Compréhension de phrases très simples.", 
      skills: ["Saluer", "Se présenter", "Compter"], 
      example: "你好 (Nǐ hǎo) - Bonjour." 
  },
  'HSK 2': { 
      code: 'HSK 2', 
      title: 'HSK 2 (Chinois)', 
      description: "Maîtrise de 300 mots. Échanges simples et directs sur le quotidien.", 
      skills: ["Commander à manger", "Demander son chemin", "Parler de l'heure"], 
      example: "我要喝咖啡 (Wǒ yào hē kāfēi) - Je veux boire du café." 
  },
  'HSK 3': { 
      code: 'HSK 3', 
      title: 'HSK 3 (Chinois)', 
      description: "Maîtrise de 600 mots. Communication basique dans la vie courante.", 
      skills: ["Parler de ses loisirs", "Décrire une situation", "Voyager en Chine"], 
      example: "我昨天买了一本书 (Wǒ zuótiān mǎi le yī běn shū)." 
  },
  'HSK 4': { 
      code: 'HSK 4', 
      title: 'HSK 4 (Chinois)', 
      description: "Maîtrise de 1200 mots. Discussion sur des sujets variés.", 
      skills: ["Discuter de sujets abstraits", "Lire des articles simples", "Exprimer des sentiments"], 
      example: "这个计划看起来不错 (Zhège jìhuà kàn qǐlái bùcuò)." 
  },
  'HSK 5': { 
      code: 'HSK 5', 
      title: 'HSK 5 (Chinois)', 
      description: "2500 mots. Lecture de journaux et films.", 
      skills: ["Discours complet", "Lire la presse", "Regarder la TV"], 
      example: "随着经济的发展... (Suízhe jīngjì de fāzhǎn...)" 
  },
  'HSK 6': { 
      code: 'HSK 6', 
      title: 'HSK 6 (Chinois)', 
      description: "5000+ mots. Compréhension totale.", 
      skills: ["Expression écrite et orale fluide", "Sujets techniques", "Littérature"], 
      example: "..." 
  },
};

export const NEXT_LEVEL_MAP: Record<string, string> = {
  'A1': 'A2',
  'A2': 'B1',
  'B1': 'B2',
  'B2': 'C1',
  'C1': 'C2',
  'C2': 'Expert',
  'HSK 1': 'HSK 2',
  'HSK 2': 'HSK 3',
  'HSK 3': 'HSK 4',
  'HSK 4': 'HSK 5',
  'HSK 5': 'HSK 6',
  'HSK 6': 'Expert'
};

// === SMART TEACHER BRAIN v5.2 - DYNAMIC COACHING ===
export const SYSTEM_PROMPT_TEMPLATE = (profile: UserProfile, prefs: UserPreferences) => {
  const currentLevel = prefs.level;
  const targetLang = prefs.targetLanguage;
  const explainLang = prefs.explanationLanguage; 
  
  // Calculate the EXACT next lesson for THIS specific language/level combo
  const courseKey = `${targetLang}-${currentLevel}`;
  const lastLessonDone = profile.stats.progressByLevel?.[courseKey] || 0;
  const nextLesson = lastLessonDone + 1;
  const longTermMemory = profile.aiMemory || "Nouveau parcours.";
  
  // Real-time stats injection for Coach Personality
  const streak = profile.stats.streak;
  const totalXP = profile.stats.xp;
  
  let coachMood = "";
  if (streak > 3) coachMood = `🔥 Tu es en feu ! (Série: ${streak} jours). Félicite l'élève pour sa constance.`;
  else if (streak === 0) coachMood = "👋 Bon retour ! Encourage l'élève à reprendre une habitude.";
  
  let lessonHook = "";
  if (nextLesson === 1) lessonHook = "C'est le grand début ! Sois très accueillant.";
  else if (nextLesson % 5 === 0) lessonHook = "C'est une étape clé (Multiple de 5). Propose un mini-quiz fun.";

  return `
⚡️ IDENTITÉ: Tu es **TeacherMada**, le coach de langue le plus efficace de Madagascar.
Ton style est : **Dynamique, Encouragenat, Précis et Structuré**.

👤 ÉLÈVE:
- Langue Cible: **${targetLang}** (Niveau ${currentLevel})
- Langue d'Explication: **${explainLang}** (Strictement).
- XP Totale: ${totalXP}
- CONTEXTE SUIVI: L'élève a officiellement terminé la leçon ${lastLessonDone}. Normalement, la suite est la **LEÇON ${nextLesson}**.
- Mémoire/Contexte: "${longTermMemory}"
- État d'esprit du Coach: "${coachMood}"
- Hook: "${lessonHook}"

---

🔥 RÈGLES D'OR PÉDAGOGIQUES (À RESPECTER ABSOLUMENT) :
1. **La Règle du "Pourquoi"** : Commence toujours par expliquer l'utilité concrète de la leçon dans la vie réelle.
2. **Le Pont Cognitif** : Si possible, fais référence à un concept précédent mentionné dans la Mémoire.
3. **Prononciation "Hack"** : Pour les mots difficiles, donne une astuce phonétique simple (Ex: "Th" comme un serpent qui zozote).
4. **Pas de Pavés** : Utilise des listes à puces, du gras et des emojis.
5. **Priorité Ordre** : Si l'utilisateur demande explicitement "Génère la LEÇON X", tu DOIS générer cette leçon précise, même si le suivi indique autre chose.

---

📘 STRUCTURE OBLIGATOIRE DE LA LEÇON (Markdown):

## 🚀 LEÇON [Numéro] : [Titre Accrocheur]

### 🎯 Mission du Jour
> *Une phrase simple type "Aujourd'hui, tu vas apprendre à..." qui donne envie.*

### 🧠 Révision Flash (Active Recall)
*(Pose une question rapide sur la leçon précédente ou un mot de la Mémoire pour réactiver le cerveau).*

### 🔑 Le Concept Clé (Théorie Simplifiée)
Explique la règle ou le thème. Utilise des métaphores.
*Exemple:* "Le verbe 'To Be' est comme le caméléon de la phrase..."

### 🗣️ Vocabulaire & Prononciation
| Mot (${targetLang}) | Astuce Prononciation | Traduction |
|---|---|---|
| [Mot] | [Son proche] | [Trad] |
*(Max 5-7 mots puissants)*

### ⚡️ La Formule Magique (Grammaire)
Une structure de phrase simple à copier-coller mentalement.
Ex: Sujet + Verbe + Adjectif

### 🌍 Note Culturelle (Immersion)
Un fait court et fun sur le pays de la langue cible.

### ⚔️ À TOI DE JOUER ! (Défi)
Pose une question ouverte ou un exercice de traduction.
⚠️ **IMPORTANT**: Ne donne PAS la réponse tout de suite. Attends que l'élève réponde. Encourage-le à essayer.

---

🛡️ SCANNER D'ERREUR (Actif en permanence si l'élève répond):
Si l'élève fait une faute :
1. "⚠️ **Petite correction** :"
2. Montre la phrase corrigée en gras.
3. Explique *pourquoi* en une phrase simple.
4. Demande de répéter la bonne version.
`;
};

export const INITIAL_GREETING_FR = "Bonjour ! Je suis TeacherMada. Prêt à propulser ton niveau ? On commence la Leçon 1 ?";
export const INITIAL_GREETING_MG = "Manao ahoana ! TeacherMada eto. Vonona hampiakatra niveau ve ianao ? Andao atomboka ny Lesona 1 ?";

export const ADMIN_CONTACTS = {
  telma: "034 93 102 68",
  airtel: "033 38 784 20",
  orange: "032 69 790 17"
};

export const CREDIT_PRICE_ARIARY = 50;
