
export enum TargetLanguage {
  English = 'Anglais 🇬🇧',
  French = 'Français 🇫🇷',
  Chinese = 'Chinois 🇨🇳',
  Spanish = 'Espagnol 🇪🇸',
  German = 'Allemand 🇩🇪'
}

// Added ExplanationLanguage enum
export enum ExplanationLanguage {
  French = 'Français 🇫🇷',
  Malagasy = 'Malagasy 🇲🇬'
}

// Added LearningMode enum
export enum LearningMode {
  Course = '📘 Cours structuré',
  Chat = '💬 Discussion libre',
  Practice = '🧪 Pratique & exercices',
  Pronunciation = '🎧 Prononciation / Audio'
}

export type LanguageLevel = 'A1' | 'A2' | 'B1' | 'B2' | 'C1' | 'C2' | 'HSK 1' | 'HSK 2' | 'HSK 3' | 'HSK 4' | 'HSK 5' | 'HSK 6';

// Added LevelDescriptor interface
export interface LevelDescriptor {
  code: LanguageLevel;
  title: string;
  description: string;
  skills: string[];
  example: string;
}

export type VoiceName = 'Zephyr' | 'Puck' | 'Charon' | 'Kore' | 'Fenrir';

export interface UserPreferences {
  targetLanguage: string;
  level: string;
  explanationLanguage: string;
  mode: string;
  fontSize?: 'small' | 'normal' | 'large' | 'xl';
  voiceName?: VoiceName;
  needsAssessment?: boolean;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'model';
  text: string;
  timestamp: number;
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
    lessonsCompleted: number;
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
  credits: number;
  freeUsage: {
    lastResetWeek: string;
    count: number;
  };
  isSuspended?: boolean;
}

// Added Transaction interface
export interface Transaction {
  id: string;
  userId: string;
  amount: number;
  creditsAdded: number;
  date: number;
  status: 'pending' | 'completed' | 'rejected';
  method: string;
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
