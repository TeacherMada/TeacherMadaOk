
import { UserProfile, ChatMessage, UserPreferences, SystemSettings, AdminRequest, LearningSession } from "../types";

const LOCAL_STORAGE_KEY = 'teachermada_user_data';
const CHAT_HISTORY_PREFIX = 'tm_chat_';
const REQUESTS_KEY = 'tm_requests_data';
const SETTINGS_KEY = 'tm_system_settings';
const SESSION_PREFIX = 'tm_session_';

export const storageService = {
  // --- AUTH & USER ---
  getLocalUser: (): UserProfile | null => {
    const data = localStorage.getItem(LOCAL_STORAGE_KEY);
    return data ? JSON.parse(data) : null;
  },

  getCurrentUser: (): UserProfile | null => {
    return storageService.getLocalUser();
  },

  getUserById: (id: string): UserProfile | null => {
    const user = storageService.getLocalUser();
    return user && user.id === id ? user : null;
  },

  saveLocalUser: (user: UserProfile) => {
    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(user));
  },

  // Added login method required by AuthScreen.tsx
  login: (username: string, pass: string): { success: boolean; user?: UserProfile; error?: string } => {
    const user = storageService.getLocalUser();
    if (user && user.username === username && user.password === pass) {
      if (user.isSuspended) return { success: false, error: "Compte suspendu." };
      return { success: true, user };
    }
    return { success: false, error: "Identifiants incorrects." };
  },

  // Added register method required by AuthScreen.tsx
  register: (username: string, pass: string, email?: string): { success: boolean; user?: UserProfile; error?: string } => {
    const newUser: UserProfile = {
      id: crypto.randomUUID(),
      username,
      password: pass,
      email,
      role: 'user',
      credits: 10,
      xp: 0,
      preferences: null,
      vocabulary: [],
      createdAt: Date.now()
    };
    storageService.saveLocalUser(newUser);
    return { success: true, user: newUser };
  },

  logout: () => {
    localStorage.removeItem(LOCAL_STORAGE_KEY);
    // Supprimer les historiques de chat
    Object.keys(localStorage)
      .filter(k => k.startsWith(CHAT_HISTORY_PREFIX) || k.startsWith(SESSION_PREFIX))
      .forEach(k => localStorage.removeItem(k));
  },

  // Added getAllUsers method required by AdminDashboard.tsx
  getAllUsers: (): UserProfile[] => {
    const user = storageService.getLocalUser();
    return user ? [user] : [];
  },

  // Added saveUserProfile method required by AdminDashboard.tsx
  saveUserProfile: (user: UserProfile) => {
    storageService.saveLocalUser(user);
  },

  // --- SESSIONS ---
  getSessionKey: (userId: string, prefs: UserPreferences) => {
    const cleanMode = prefs.mode.replace(/\s/g, '_');
    const cleanLang = prefs.targetLanguage.split(' ')[0];
    return `${SESSION_PREFIX}${userId}_${cleanLang}_${prefs.level}_${cleanMode}`;
  },

  getOrCreateSession: (userId: string, prefs: UserPreferences): LearningSession => {
    const key = storageService.getSessionKey(userId, prefs);
    const data = localStorage.getItem(key);
    if (data) return JSON.parse(data);

    const newSession: LearningSession = {
      id: key,
      messages: [],
      progress: 0,
      score: 0
    };
    storageService.saveSession(newSession);
    return newSession;
  },

  saveSession: (session: LearningSession) => {
    localStorage.setItem(session.id, JSON.stringify(session));
  },

  // --- CHAT HISTORY (Local Only for speed) ---
  getChatHistory: (lang: string): ChatMessage[] => {
    const key = `${CHAT_HISTORY_PREFIX}${lang.replace(/\s/g, '')}`;
    const data = localStorage.getItem(key);
    return data ? JSON.parse(data) : [];
  },

  saveChatHistory: (lang: string, messages: ChatMessage[]) => {
    const key = `${CHAT_HISTORY_PREFIX}${lang.replace(/\s/g, '')}`;
    localStorage.setItem(key, JSON.stringify(messages.slice(-50))); // Garder les 50 derniers
  },

  // --- SETTINGS (Sync from Admin) ---
  getSystemSettings: (): SystemSettings => {
    const data = localStorage.getItem(SETTINGS_KEY);
    return data ? JSON.parse(data) : {
      apiKeys: [],
      activeModel: 'gemini-3-flash-preview',
      customLanguages: [],
      adminContact: { telma: "0349310268", airtel: "0333878420", orange: "0326979017" }
    };
  },

  // Added updateSystemSettings method required by AdminDashboard.tsx
  updateSystemSettings: (settings: SystemSettings) => {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  },

  // --- ADMIN REQUESTS ---
  // Added getAdminRequests method required by AdminDashboard.tsx
  getAdminRequests: (): AdminRequest[] => {
    const data = localStorage.getItem(REQUESTS_KEY);
    return data ? JSON.parse(data) : [];
  },

  // Added sendAdminRequest method required by PaymentModal.tsx
  sendAdminRequest: (userId: string, username: string, type: any, amount?: number, message: string = '') => {
    const requests = storageService.getAdminRequests();
    const newReq: AdminRequest = {
      id: crypto.randomUUID(),
      userId,
      username,
      type,
      amount,
      message,
      status: 'pending',
      createdAt: Date.now()
    };
    requests.push(newReq);
    localStorage.setItem(REQUESTS_KEY, JSON.stringify(requests));
  },

  // Added resolveRequest method required by AdminDashboard.tsx
  resolveRequest: (reqId: string, status: 'approved' | 'rejected') => {
    const requests = storageService.getAdminRequests();
    const req = requests.find(r => r.id === reqId);
    if (req) {
      req.status = status;
      if (status === 'approved' && req.type === 'credit' && req.amount) {
        storageService.addCredits(req.userId, req.amount);
      }
      localStorage.setItem(REQUESTS_KEY, JSON.stringify(requests));
    }
  },

  // Added addCredits method required by AdminDashboard.tsx
  addCredits: (userId: string, amount: number) => {
    const user = storageService.getLocalUser();
    if (user && user.id === userId) {
      user.credits += amount;
      storageService.saveLocalUser(user);
    }
  },

  consumeCredit: (userId: string) => {
    const user = storageService.getLocalUser();
    if (user && user.id === userId) {
        if (user.role === 'admin') return;
        if (user.credits > 0) {
            user.credits--;
            storageService.saveLocalUser(user);
        }
    }
  },

  canRequest: (userId: string): boolean => {
    const user = storageService.getLocalUser();
    if (!user) return false;
    if (user.role === 'admin') return true;
    return user.credits > 0;
  },

  // Added deductCreditOrUsage method required by DialogueSession.tsx
  deductCreditOrUsage: (userId: string): UserProfile | null => {
    const user = storageService.getLocalUser();
    if (user && user.id === userId) {
      if (user.role === 'admin') return user;
      if (user.credits > 0) {
        user.credits--;
        storageService.saveLocalUser(user);
        return user;
      }
    }
    return null;
  },

  // Added canPerformRequest method required by DialogueSession.tsx
  canPerformRequest: (userId: string): { allowed: boolean; reason?: string } => {
    const user = storageService.getLocalUser();
    if (user && user.id === userId) {
      if (user.role === 'admin' || user.credits > 0) return { allowed: true };
    }
    return { allowed: false, reason: 'insufficient' };
  },

  // --- EXPORT/IMPORT (PWA Power) ---
  exportData: () => {
    const user = storageService.getLocalUser();
    if (!user) return;
    const blob = new Blob([JSON.stringify(user)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `teachermada_backup_${new Date().toISOString().split('T')[0]}.json`;
    a.click();
  },

  importData: (file: File): Promise<boolean> => {
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const data = JSON.parse(e.target?.result as string);
          if (data.id && data.username) {
            storageService.saveLocalUser(data);
            resolve(true);
          } else resolve(false);
        } catch { resolve(false); }
      };
      reader.readAsText(file);
    });
  }
};
