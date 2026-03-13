import { create } from 'zustand';
import { UserProfile, LearningSession, ExerciseItem } from '../types';
import { storageService } from '../services/storageService';

interface AppState {
  // User & Session
  user: UserProfile | null;
  currentSession: LearningSession | null;
  
  // UI States
  showAuth: boolean;
  showDashboard: boolean;
  showPayment: boolean;
  showAdmin: boolean;
  showVoiceCall: boolean;
  showResetPassword: boolean;
  isDarkMode: boolean;

  // Modes
  activeMode: 'chat' | 'exercise' | 'practice' | 'exam';
  currentExercises: ExerciseItem[];
  isGeneratingExercise: boolean;

  // Actions
  setUser: (user: UserProfile | null) => void;
  setCurrentSession: (session: LearningSession | null) => void;
  setShowAuth: (show: boolean) => void;
  setShowDashboard: (show: boolean) => void;
  setShowPayment: (show: boolean) => void;
  setShowAdmin: (show: boolean) => void;
  setShowVoiceCall: (show: boolean) => void;
  setShowResetPassword: (show: boolean) => void;
  toggleDarkMode: () => void;
  setActiveMode: (mode: 'chat' | 'exercise' | 'practice' | 'exam') => void;
  setCurrentExercises: (exercises: ExerciseItem[]) => void;
  setIsGeneratingExercise: (isGenerating: boolean) => void;
  
  // Complex Actions
  updateUser: (updates: Partial<UserProfile>) => Promise<void>;
  logout: () => void;
}

export const useAppStore = create<AppState>((set, get) => ({
  user: null,
  currentSession: null,
  
  showAuth: false,
  showDashboard: false,
  showPayment: false,
  showAdmin: false,
  showVoiceCall: false,
  showResetPassword: false,
  isDarkMode: localStorage.getItem('tm_theme') === 'dark',

  activeMode: 'chat',
  currentExercises: [],
  isGeneratingExercise: false,

  setUser: (user) => set({ user }),
  setCurrentSession: (session) => set({ currentSession: session }),
  setShowAuth: (show) => set({ showAuth: show }),
  setShowDashboard: (show) => set({ showDashboard: show }),
  setShowPayment: (show) => set({ showPayment: show }),
  setShowAdmin: (show) => set({ showAdmin: show }),
  setShowVoiceCall: (show) => set({ showVoiceCall: show }),
  setShowResetPassword: (show) => set({ showResetPassword: show }),
  
  toggleDarkMode: () => {
    const newMode = !get().isDarkMode;
    localStorage.setItem('tm_theme', newMode ? 'dark' : 'light');
    document.documentElement.classList.toggle('dark', newMode);
    set({ isDarkMode: newMode });
  },

  setActiveMode: (mode) => set({ activeMode: mode }),
  setCurrentExercises: (exercises) => set({ currentExercises: exercises }),
  setIsGeneratingExercise: (isGenerating) => set({ isGeneratingExercise: isGenerating }),

  updateUser: async (updates) => {
    const currentUser = get().user;
    if (!currentUser) return;
    
    const updatedUser = { ...currentUser, ...updates };
    
    // Protection: don't lose preferences
    if (currentUser.preferences && (!updates.preferences || !updates.preferences.targetLanguage)) {
        updatedUser.preferences = currentUser.preferences;
    }

    set({ user: updatedUser });
    await storageService.saveUserProfile(updatedUser);
  },

  logout: () => {
    storageService.logout();
    set({
      user: null,
      currentSession: null,
      showDashboard: false,
      showAdmin: false,
      activeMode: 'chat'
    });
  }
}));
