
export type UserRole = 'user' | 'admin';
export type VoiceName = 'Zephyr' | 'Puck' | 'Charon' | 'Kore' | 'Fenrir';

// Enums for language learning
export enum TargetLanguage {
  English = 'Anglais 🇬🇧',
  French = 'Français 🇫🇷',
  Chinese = 'Chinois (Mandarin) 🇨🇳',
  Spanish = 'Espagnol 🇪🇸',
  German = 'Allemand 🇩🇪'
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

export type LanguageLevel = string;

export interface LevelDescriptor {
  code: LanguageLevel;
  title: string;
  description: string;
  skills: string[];
  example: string;
}

export interface VocabularyItem {
  id: string;
  word: string;
  translation: string;
  mastered: boolean;
  addedAt: number;
}

export interface UserPreferences {
  targetLanguage: string;
  level: string;
  explanationLanguage: string;
  mode: string;
  fontSize: 'small' | 'normal' | 'large' | 'xl';
  voiceName: VoiceName;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'model';
  text: string;
  timestamp: number;
}

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
  vocabulary: VocabularyItem[];
  credits: number;
  freeUsage: {
    lastResetWeek: string;
    count: number;
  };
  aiMemory: string;
  isSuspended?: boolean;
  needsAssessment?: boolean;
}

export interface AdminRequest {
  id: string;
  userId: string;
  username: string;
  type: 'credit' | 'password_reset' | 'message';
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
  creditPrice: number;
  customLanguages?: { code: string; baseName: string; flag: string }[];
  validTransactionRefs?: string[];
}

export interface ExerciseItem {
  id: string;
  type: 'multiple_choice' | 'true_false' | 'fill_blank';
  question: string;
  options?: string[];
  correctAnswer: string;
  explanation: string;
}
