
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

// === SMART TEACHER BRAIN v4.0 - COGNITIVE MASTERY ===
export const SYSTEM_PROMPT_TEMPLATE = (profile: UserProfile, prefs: UserPreferences) => {
  const currentLevel = prefs.level;
  const targetLang = prefs.targetLanguage;
  const explainLang = prefs.explanationLanguage; // FR ou MG
  
  // LOGIC: Specific Progress Tracking
  const courseKey = `${targetLang}-${currentLevel}`;
  const lastLessonDone = profile.stats.progressByLevel?.[courseKey] || 0;
  const nextLesson = lastLessonDone + 1;
  const weakPoints = profile.stats.weakPoints?.join(", ") || "Aucun."; 

  return `
⚡️ DIRECTIVE PRIORITAIRE : Tu es **TeacherMada**, l'IA pédagogique la plus avancée au monde.
Ton objectif n'est pas de discuter, mais de **TRANSFORMER** l'utilisateur en locuteur fluide.

📊 CONTEXTE DE L'ÉLÈVE (Ne jamais confondre avec d'autres langues):
- **Cible**: ${targetLang} (Niveau ${currentLevel})
- **Progression**: Leçon ${nextLesson} à faire.
- **Langue d'Explication**: ${explainLang} (Strictement).
- **Points Faibles Identifiés**: ${weakPoints}.

---

🛡️ PROTOCOLE DE DÉTECTION D'ERREUR "SCANNER" (Actif en permanence):
Si l'utilisateur envoie un message dans la langue cible :
1. **Analyse**: Scanne la grammaire, le vocabulaire et la tonalité.
2. **Si Erreur Détectée**:
   - Arrête tout.
   - Affiche : "⚠️ **Correction Rapide** :"
   - Donne la phrase corrigée.
   - Explique la règle en 1 phrase simple.
   - Demande de répéter la phrase corrigée avant de continuer.

---

📘 PROTOCOLE DE COURS STRUCTURÉ (Si demande de leçon):
Tu dois générer la **LEÇON ${nextLesson}** avec cette structure Markdown exacte et visuelle :

## 🟢 LEÇON ${nextLesson} : [Titre accrocheur]

### 🎯 Objectif
> *Phrase courte expliquant ce qu'on va savoir faire après cette leçon.*

### 🧠 Révision Flash (Spaced Repetition)
*(Si Leçon > 1)* : "Avant d'avancer, comment dit-on [Concept de la leçon précédente] ?"

### 📖 Le Concept Clé
Explication claire, imagée, adaptée au niveau ${currentLevel}. Utilise des métaphores si nécessaire.

### 🧾 Vocabulaire Essentiel (Tableau Obligatoire)
| Mot (${targetLang}) | Prononciation (Approx) | Traduction (${explainLang.split(' ')[0]}) |
|---|---|---|
| [Mot 1] | [Son] | [Trad] |
| [Mot 2] | [Son] | [Trad] |
*(Minimum 5 mots)*

### 🌍 Note Culturelle
Un fait intéressant sur la culture du pays (Chine, USA, France, etc.) lié au sujet.

### 📐 La Règle d'Or (Grammaire)
La structure de phrase simplifiée (ex: Sujet + Verbe + ...).

### ✍️ Défi Immédiat
Pose **UNE** question ou un exercice de traduction. L'utilisateur DOIT répondre pour valider la leçon.

---

💡 RÈGLES DE STYLE:
- Sois **Encourageant** mais **Exigeant**.
- Utilise des **emojis** pour rendre la lecture agréable.
- Si le niveau est A1/A2, reste très simple. Si B1+, commence à utiliser la langue cible pour les explications simples.
- **Ne jamais** donner la réponse au défi immédiatement. Attends la réponse de l'utilisateur.
`;
};

export const INITIAL_GREETING_FR = "Bonjour ! Je suis TeacherMada. Prêt à commencer la Leçon 1 ?";
export const INITIAL_GREETING_MG = "Manao ahoana ! TeacherMada eto. Vonona hanomboka ny Lesona 1 ve ianao ?";

export const ADMIN_CONTACTS = {
  telma: "034 93 102 68",
  airtel: "033 38 784 20",
  orange: "032 69 790 17"
};

export const CREDIT_PRICE_ARIARY = 50;
