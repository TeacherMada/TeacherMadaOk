
export enum TargetLanguage {
  English = 'Anglais 🇬🇧',
  French = 'Français 🇫🇷',
  Chinese = 'Chinois 🇨🇳',
  Spanish = 'Espagnol 🇪🇸',
  German = 'Allemand 🇩🇪'
}

export type LanguageLevel = 'A1' | 'A2' | 'B1' | 'B2' | 'C1' | 'C2' | 'HSK 1' | 'HSK 2' | 'HSK 3' | 'HSK 4' | 'HSK 5' | 'HSK 6';

export interface LevelDescriptor {
  code: LanguageLevel;
  title: string;
  description: string;
  skills: string[];
  example: string;
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
  targetLanguage: string; // Changed from enum to string to allow dynamic languages
  level: string; // Changed to string for flexibility (A1, HSK 1, etc.)
  explanationLanguage: ExplanationLanguage;
  mode: LearningMode;
  fontSize?: 'small' | 'normal' | 'large' | 'xl';
  needsAssessment?: boolean;
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

export interface VocabularyItem {
  id: string;
  word: string;
  translation: string;
  context?: string;
  mastered: boolean;
  addedAt: number;
}

export type UserRole = 'user' | 'admin';

export interface UserProfile {
  id: string;
  username: string;
  email?: string;
  phoneNumber?: string; 
  password?: string;
  role: UserRole;
  createdAt: number;
  preferences: UserPreferences | null;
  stats: {
    xp: number;
    streak: number;
    lessonsCompleted: number; // Total global
    // Clé: "TargetLang-Level" (ex: "Anglais 🇬🇧-A1"), Valeur: Numéro de la dernière leçon finie
    progressByLevel: Record<string, number>; 
    weakPoints?: string[]; 
    interests?: string[]; 
  };
  skills?: {
    vocabulary: number;
    grammar: number;
    pronunciation: number;
    listening: number;
  };
  vocabulary?: VocabularyItem[];
  dailyChallenges?: DailyChallenge[];
  lastChallengeDate?: string;
  aiMemory: string; 
  isPremium: boolean;
  hasSeenTutorial?: boolean;
  
  // Credit System
  credits: number;
  freeUsage: {
    lastResetWeek: string;
    count: number;
  };
  isSuspended?: boolean;
}

export interface Transaction {
  id: string;
  userId: string;
  amount: number;
  creditsAdded: number;
  date: number;
  status: 'pending' | 'completed' | 'rejected';
  method: 'Mobile Money' | 'Admin Grant';
}

export interface AdminRequest {
  id: string;
  userId: string;
  username: string;
  type: 'credit' | 'message' | 'password_reset';
  amount?: number;
  message?: string;
  contactInfo?: string;
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
  creditPrice: number;
  customLanguages?: { code: string; baseName: string; flag: string; }[];
  validTransactionRefs?: string[];
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

export interface VoiceCallSummary {
  score: number;
  feedback: string;
  tip: string;
}
