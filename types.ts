
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
  fontSize?: 'small' | 'normal' | 'large' | 'xl';
}

export interface DailyChallenge {
  id: string;
  description: string;
  targetCount: number;
  currentCount: number;
  xpReward: number;
  isCompleted: boolean;
  type: 'message_count' | 'lesson_complete' | 'vocabulary' | 'exercise_score';
}

export type UserRole = 'user' | 'admin';

export interface UserProfile {
  id: string;
  username: string;
  email?: string;
  password?: string;
  role: UserRole;
  createdAt: number;
  preferences: UserPreferences | null;
  stats: {
    xp: number;
    streak: number;
    lessonsCompleted: number;
  };
  skills?: {
    vocabulary: number;
    grammar: number;
    pronunciation: number;
    listening: number;
  };
  dailyChallenges?: DailyChallenge[];
  lastChallengeDate?: string;
  aiMemory: string; 
  isPremium: boolean;
  hasSeenTutorial?: boolean;
  
  // Credit System
  credits: number;
  freeUsage: {
    lastResetWeek: string; // ISO String of the Monday of the current week
    count: number; // Max 2 per week
  };
  isSuspended?: boolean;
}

export interface Transaction {
  id: string;
  userId: string;
  amount: number; // in Ariary
  creditsAdded: number;
  date: number;
  status: 'pending' | 'completed' | 'rejected';
  method: 'Mobile Money' | 'Admin Grant';
}

export interface AdminRequest {
  id: string;
  userId: string;
  username: string;
  type: 'credit' | 'message';
  amount?: number;
  message?: string;
  status: 'pending' | 'approved' | 'rejected';
  createdAt: number;
}

export interface SystemSettings {
  apiKeys: string[];
  activeModel: string;
  adminContact: {
    telma: string;
    airtel: string;
    orange: string;
  };
  creditPrice: number; // 50 Ariary
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

export type ExerciseType = 'multiple_choice' | 'true_false' | 'fill_blank';

export interface ExerciseItem {
  id: string;
  type: ExerciseType;
  question: string;
  options?: string[];
  correctAnswer: string;
  explanation: string;
}
