
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
  Practice = '🧪 Pratique & exercices'
}

// Added ProficiencyLevel enum as required by components/Onboarding.tsx
export enum ProficiencyLevel {
  Beginner = 'Débutant (A1)',
  Elementary = 'Élémentaire (A2)',
  Intermediate = 'Intermédiaire (B1)',
  Advanced = 'Avancé (B2)',
  Expert = 'Expert (C1)',
  Mastery = 'Maîtrise (C2)'
}

export interface VocabularyItem {
  id: string;
  word: string;
  translation: string;
  example?: string;
  mastered: boolean;
  addedAt: number;
}

export interface UserPreferences {
  targetLanguage: string;
  level: string;
  explanationLanguage: string;
  mode: LearningMode;
  voiceName: VoiceName;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'model';
  text: string;
  timestamp: number;
}

export interface LearningSession {
  id: string;
  messages: ChatMessage[];
  progress: number;
  score: number;
}

export interface UserProfile {
  id: string;
  username: string;
  email?: string;
  password?: string;
  role: UserRole;
  credits: number;
  xp: number;
  preferences: UserPreferences | null;
  vocabulary: VocabularyItem[];
  createdAt: number;
  lastSync?: number;
  // Added isSuspended as required by components/AdminDashboard.tsx
  isSuspended?: boolean;
}

export interface SystemSettings {
  apiKeys: string[];
  activeModel: string;
  customLanguages: Array<{name: string, flag: string}>;
  adminContact: {
    telma: string;
    airtel: string;
    orange: string;
  };
}

export interface AdminRequest {
  id: string;
  userId: string;
  username: string;
  type: 'credit' | 'reset' | 'message';
  amount?: number;
  message: string;
  status: 'pending' | 'approved' | 'rejected';
  createdAt: number;
}

// Added ExerciseItem interface as required by components/ExerciseSession.tsx
export interface ExerciseItem {
  id: string;
  type: 'multiple_choice' | 'true_false' | 'fill_blank';
  question: string;
  options?: string[];
  correctAnswer: string;
  explanation: string;
}
