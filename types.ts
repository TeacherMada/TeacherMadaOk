
export enum TargetLanguage {
  English = 'Anglais 🇬🇧',
  French = 'Français 🇫🇷',
  Chinese = 'Chinois (Mandarin) 🇨🇳',
  Spanish = 'Espagnol 🇪🇸',
  German = 'Allemand 🇩🇪'
}

export enum ProficiencyLevel {
  Beginner = 'Débutant (A1-A2)',
  Intermediate = 'Intermédiaire (B1-B2)',
  Advanced = 'Avancé (C1-C3)'
}

export enum ExplanationLanguage {
  French = 'Français 🇫🇷',
  Malagasy = 'Malagasy 🇲🇬'
}

export enum LearningMode {
  Course = '📘 Cours structuré',
  Chat = '💬 Discussion libre',
  Practice = '🧪 Pratique & exercices',
  Pronunciation = '🎧 Prononciation / Audio'
}

export interface UserPreferences {
  targetLanguage: TargetLanguage;
  level: ProficiencyLevel;
  explanationLanguage: ExplanationLanguage;
  mode: LearningMode;
  fontSize?: 'small' | 'normal' | 'large' | 'xl'; // New Font Size preference
}

export interface DailyChallenge {
  id: string;
  description: string;
  targetCount: number; // e.g., 5 messages
  currentCount: number;
  xpReward: number;
  isCompleted: boolean;
  type: 'message_count' | 'lesson_complete' | 'vocabulary' | 'exercise_score';
}

export interface UserProfile {
  id: string;
  username: string;
  email?: string;
  password?: string;
  createdAt: number;
  preferences: UserPreferences | null;
  stats: {
    xp: number;
    streak: number;
    lessonsCompleted: number;
  };
  // New Skills Breakdown for Smart Dashboard
  skills?: {
    vocabulary: number; // 0-100
    grammar: number; // 0-100
    pronunciation: number; // 0-100
    listening: number; // 0-100
  };
  dailyChallenges?: DailyChallenge[];
  lastChallengeDate?: string; // YYYY-MM-DD
  aiMemory: string; 
  isPremium: boolean;
  hasSeenTutorial?: boolean;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'model';
  text: string;
  timestamp: number;
}

export interface AppState {
  user: UserProfile | null;
  isLoading: boolean;
}

// --- New Exercise Types ---

export type ExerciseType = 'multiple_choice' | 'true_false' | 'fill_blank';

export interface ExerciseItem {
  id: string;
  type: ExerciseType;
  question: string;
  options?: string[]; // For multiple choice
  correctAnswer: string;
  explanation: string;
}
