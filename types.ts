
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
  Practice = '🧪 Pratique & exercices'
}

// Add missing ProficiencyLevel enum for Onboarding
export enum ProficiencyLevel {
  A1 = 'A1 (Débutant)',
  A2 = 'A2 (Élémentaire)',
  B1 = 'B1 (Intermédiaire)',
  B2 = 'B2 (Avancé)',
  C1 = 'C1 (Autonome)',
  C2 = 'C2 (Maîtrise)'
}

export type VoiceName = 'Zephyr' | 'Puck' | 'Charon' | 'Kore' | 'Fenrir';

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

export interface VocabularyItem {
  id: string;
  word: string;
  translation: string;
  mastered: boolean;
  addedAt: number;
}

export interface UserProfile {
  id: string;
  username: string;
  email?: string;
  password?: string;
  role: 'user' | 'admin';
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
  type: 'credit' | 'message' | 'password_reset';
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
}

export interface ExerciseItem {
  id: string;
  type: 'multiple_choice' | 'true_false' | 'fill_blank';
  question: string;
  options?: string[];
  correctAnswer: string;
  explanation: string;
}
