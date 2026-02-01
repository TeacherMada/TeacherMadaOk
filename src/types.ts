export enum TargetLanguage {
  English = 'Anglais 🇬🇧',
  French = 'Français 🇫🇷',
  Chinese = 'Chinois 🇨🇳',
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

export type VoiceName = 'Zephyr' | 'Puck' | 'Charon' | 'Kore' | 'Fenrir';

/**
 * Fix for Onboarding.tsx: Added missing LanguageLevel type.
 */
export type LanguageLevel = string;

/**
 * Fix for constants.ts and Onboarding.tsx: Added missing LevelDescriptor interface.
 */
export interface LevelDescriptor {
  code: string;
  title: string;
  description: string;
  skills: string[];
  example: string;
}

export interface UserPreferences {
  targetLanguage: string;
  level: string;
  explanationLanguage: string;
  mode: string;
  fontSize?: 'small' | 'normal' | 'large' | 'xl';
  voiceName?: VoiceName;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'model';
  text: string;
  timestamp: number;
}

export interface VocabularyItem {
  id: string;
  word: string;
  translation: string;
  context?: string;
  mastered: boolean;
  addedAt: number;
}

export interface UserProfile {
  id: string;
  username: string;
  email?: string;
  phoneNumber?: string; 
  password?: string;
  role: 'user' | 'admin';
  createdAt: number;
  preferences: UserPreferences | null;
  stats: {
    xp: number;
    streak: number;
    lessonsCompleted: number;
    progressByLevel: Record<string, number>; 
  };
  vocabulary: VocabularyItem[];
  aiMemory: string; 
  credits: number;
  freeUsage: {
    lastResetWeek: string;
    count: number;
  };
  isSuspended?: boolean;
  /**
   * Fix for storageService.ts: Added missing hasSeenTutorial property.
   */
  hasSeenTutorial?: boolean;
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
  /**
   * Added to support transaction reference storage used in AdminDashboard.
   */
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

export interface VoiceCallSummary {
  score: number;
  feedback: string;
  tip: string;
}