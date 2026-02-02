
export type UserRole = 'user' | 'admin';
export type VoiceName = 'Zephyr' | 'Puck' | 'Charon' | 'Kore' | 'Fenrir';

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
  Dialogue = '🎭 Jeux de Rôle'
}

// Add LanguageLevel and LevelDescriptor for Onboarding
export type LanguageLevel = 'A1' | 'A2' | 'B1' | 'B2' | 'C1' | 'C2' | 'HSK 1' | 'HSK 2' | 'HSK 3' | 'HSK 4' | 'HSK 5' | 'HSK 6';

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
  needsAssessment?: boolean;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'model';
  text: string;
  timestamp: number;
}

export interface LearningSession {
  id: string; // key: userId_lang_level_mode
  messages: ChatMessage[];
  progress: number; // 0 to 100
  score: number;
}

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
  };
  vocabulary: VocabularyItem[];
  credits: number;
  freeUsage: {
    lastResetWeek: string;
    count: number;
  };
  aiMemory: string;
  isSuspended?: boolean;
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

// Add missing ExerciseItem type
export interface ExerciseItem {
  id: string;
  type: 'multiple_choice' | 'true_false' | 'fill_blank';
  question: string;
  options?: string[];
  correctAnswer: string;
  explanation: string;
}

export interface SystemSettings {
  apiKeys: string[];
  activeModel: string;
  creditPrice?: number;
  customLanguages?: Array<{code: string, baseName: string, flag: string}>;
  validTransactionRefs?: string[];
  adminContact: {
    telma: string;
    airtel: string;
    orange: string;
  };
}
