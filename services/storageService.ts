
import { UserProfile, ChatMessage, UserPreferences, SystemSettings, AdminRequest } from "../types";

const USER_KEY_PREFIX = 'tm_user_';
const CURRENT_USER_ID = 'tm_current_id';
const SETTINGS_KEY = 'tm_settings';
const REQUESTS_KEY = 'tm_admin_reqs';

const getMadagascarWeek = (): string => {
  const now = new Date();
  const d = new Date(now.toLocaleString("en-US", { timeZone: "Indian/Antananarivo" }));
  const day = d.getDay() || 7;
  if (day !== 1) d.setHours(-24 * (day - 1));
  d.setHours(0, 0, 0, 0);
  return d.toISOString().split('T')[0];
};

export const storageService = {
  login: (id: string, pass?: string): { success: boolean; user?: UserProfile; error?: string } => {
    storageService.seedAdmin();
    const users = storageService.getAllUsers();
    const found = users.find(u => u.username.toLowerCase() === id.toLowerCase() || u.email?.toLowerCase() === id.toLowerCase());
    
    if (!found) return { success: false, error: "Utilisateur introuvable." };
    if (found.isSuspended) return { success: false, error: "Compte suspendu." };
    if (pass && found.password !== pass) return { success: false, error: "Mot de passe incorrect." };
    
    localStorage.setItem(CURRENT_USER_ID, found.id);
    return { success: true, user: storageService.getUserById(found.id)! };
  },

  register: (username: string, password?: string, email?: string): { success: boolean; user?: UserProfile; error?: string } => {
    const users = storageService.getAllUsers();
    if (users.find(u => u.username.toLowerCase() === username.toLowerCase())) {
      return { success: false, error: "Ce nom est déjà pris." };
    }

    const newUser: UserProfile = {
      id: crypto.randomUUID(),
      username, password, email,
      role: 'user',
      createdAt: Date.now(),
      preferences: null,
      stats: { xp: number; streak: number; lessonsCompleted: number; } | any,
      vocabulary: [],
      credits: 5,
      freeUsage: { lastResetWeek: getMadagascarWeek(), count: 0 },
      aiMemory: "Nouveau."
    };
    storageService.saveUserProfile(newUser);
    localStorage.setItem(CURRENT_USER_ID, newUser.id);
    return { success: true, user: newUser };
  },

  getUserById: (id: string): UserProfile | null => {
    const data = localStorage.getItem(USER_KEY_PREFIX + id);
    if (!data) return null;
    try {
      const u = JSON.parse(data);
      if (!u.vocabulary) u.vocabulary = [];
      if (!u.stats) u.stats = { xp: 0, streak: 1, lessonsCompleted: 0 };
      return u;
    } catch { return null; }
  },

  getAllUsers: (): UserProfile[] => {
    const users: UserProfile[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key?.startsWith(USER_KEY_PREFIX)) {
        users.push(JSON.parse(localStorage.getItem(key)!));
      }
    }
    return users;
  },

  saveUserProfile: (user: UserProfile) => {
    localStorage.setItem(USER_KEY_PREFIX + user.id, JSON.stringify(user));
  },

  getCurrentUser: () => {
    const id = localStorage.getItem(CURRENT_USER_ID);
    return id ? storageService.getUserById(id) : null;
  },

  logout: () => localStorage.removeItem(CURRENT_USER_ID),

  // Updated to return object as expected by components
  canPerformRequest: (userId: string): { allowed: boolean; reason?: string } => {
    const user = storageService.getUserById(userId);
    if (!user) return { allowed: false, reason: 'not_found' };
    if (user.role === 'admin') return { allowed: true };
    if (user.freeUsage.count < 3 || user.credits > 0) return { allowed: true };
    return { allowed: false, reason: 'insufficient' };
  },

  deductUsage: (userId: string) => {
    const user = storageService.getUserById(userId);
    if (!user || user.role === 'admin') return;
    if (user.freeUsage.count < 3) user.freeUsage.count++;
    else if (user.credits > 0) user.credits--;
    storageService.saveUserProfile(user);
  },

  // Add missing deductCreditOrUsage method
  deductCreditOrUsage: (userId: string): UserProfile | null => {
    const user = storageService.getUserById(userId);
    if (!user) return null;
    if (user.role === 'admin') return user;
    if (user.freeUsage.count < 3) user.freeUsage.count++;
    else if (user.credits > 0) user.credits--;
    else return null;
    storageService.saveUserProfile(user);
    return user;
  },

  // Add missing addCredits method
  addCredits: (userId: string, amount: number) => {
    const user = storageService.getUserById(userId);
    if (user) {
      user.credits += amount;
      storageService.saveUserProfile(user);
    }
  },

  saveChatHistory: (uid: string, msgs: ChatMessage[], lang: string) => {
    localStorage.setItem(`chat_${uid}_${lang.replace(/\s/g, '')}`, JSON.stringify(msgs));
  },

  getChatHistory: (uid: string, lang: string): ChatMessage[] => {
    const data = localStorage.getItem(`chat_${uid}_${lang.replace(/\s/g, '')}`);
    return data ? JSON.parse(data) : [];
  },

  getSystemSettings: (): SystemSettings => {
    const data = localStorage.getItem(SETTINGS_KEY);
    return data ? JSON.parse(data) : {
      apiKeys: [],
      activeModel: 'gemini-3-flash-preview',
      adminContact: { telma: "0349310268", airtel: "0333878420", orange: "0326979017" }
    };
  },

  // Add missing getAdminRequests method
  getAdminRequests: (): AdminRequest[] => {
    const data = localStorage.getItem(REQUESTS_KEY);
    return data ? JSON.parse(data) : [];
  },

  // Add missing sendAdminRequest method
  sendAdminRequest: (userId: string, username: string, type: 'credit' | 'message' | 'password_reset', amount?: number, message?: string) => {
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

  // Add missing resolveRequest method
  resolveRequest: (reqId: string, status: 'approved' | 'rejected') => {
    const requests = storageService.getAdminRequests();
    const found = requests.find(r => r.id === reqId);
    if (found && found.status === 'pending') {
      found.status = status;
      if (status === 'approved' && found.type === 'credit' && found.amount) {
        storageService.addCredits(found.userId, found.amount);
      }
      localStorage.setItem(REQUESTS_KEY, JSON.stringify(requests));
    }
  },

  // Add missing updateSystemSettings method
  updateSystemSettings: (settings: SystemSettings) => {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  },

  seedAdmin: () => {
    const adminId = 'admin_777';
    if (!localStorage.getItem(USER_KEY_PREFIX + adminId)) {
      storageService.saveUserProfile({
        id: adminId, username: '0349310268', password: '777v', role: 'admin',
        createdAt: Date.now(), preferences: null, stats: { xp: 999, streak: 99, lessonsCompleted: 99 },
        vocabulary: [], credits: 9999, freeUsage: { lastResetWeek: getMadagascarWeek(), count: 0 },
        aiMemory: "ADMIN"
      });
    }
  }
};
