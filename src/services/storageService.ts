
import { UserProfile, ChatMessage, LearningSession, UserPreferences, SystemSettings, AdminRequest } from "../types";

const CURRENT_USER_KEY = 'tm_v3_current_user_id';
const USER_DATA_PREFIX = 'tm_v3_user_';
const SESSION_PREFIX = 'tm_v3_session_';
const SETTINGS_KEY = 'tm_v3_settings';
const REQUESTS_KEY = 'tm_v3_requests';

export const storageService = {
  // --- AUTH ---
  login: async (id: string, pass?: string): Promise<{success: boolean, user?: UserProfile, error?: string}> => {
    const users = await storageService.getAllUsers();
    const found = users.find(u => u.username.toLowerCase() === id.toLowerCase() || u.email?.toLowerCase() === id.toLowerCase());
    
    if (!found) return { success: false, error: "Identifiant inconnu." };
    if (found.isSuspended) return { success: false, error: "Compte suspendu." };
    if (pass && found.password !== pass) return { success: false, error: "Mot de passe incorrect." };
    
    localStorage.setItem(CURRENT_USER_KEY, found.id);
    return { success: true, user: storageService.getUserById(found.id)! };
  },

  // Fixed signature to accept phoneNumber as 4th argument
  register: async (username: string, password?: string, email?: string, phoneNumber?: string): Promise<{success: boolean, user?: UserProfile, error?: string}> => {
    const users = await storageService.getAllUsers();
    if (users.find(u => u.username.toLowerCase() === username.toLowerCase())) return { success: false, error: "Ce nom est déjà utilisé." };
    
    const newUser: UserProfile = {
      id: crypto.randomUUID(),
      username, password, email, phoneNumber,
      role: 'user',
      createdAt: Date.now(),
      preferences: null,
      stats: { xp: 0, streak: 1, lessonsCompleted: 0 },
      vocabulary: [],
      credits: 5,
      freeUsage: { lastResetWeek: new Date().toISOString(), count: 0 },
      aiMemory: "Nouvel étudiant motivé."
    };
    storageService.saveUserProfile(newUser);
    localStorage.setItem(CURRENT_USER_KEY, newUser.id);
    return { success: true, user: newUser };
  },

  // --- DATA ---
  getUserById: (id: string): UserProfile | null => {
    const data = localStorage.getItem(USER_DATA_PREFIX + id);
    if (!data) return null;
    try {
      const user = JSON.parse(data);
      if (!user.vocabulary) user.vocabulary = [];
      if (!user.stats) user.stats = { xp: 0, streak: 1, lessonsCompleted: 0 };
      return user;
    } catch { return null; }
  },

  saveUserProfile: (user: UserProfile) => {
    localStorage.setItem(USER_DATA_PREFIX + user.id, JSON.stringify(user));
  },

  getAllUsers: async (): Promise<UserProfile[]> => {
    const users: UserProfile[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key?.startsWith(USER_DATA_PREFIX)) {
        users.push(JSON.parse(localStorage.getItem(key)!));
      }
    }
    return users;
  },

  getCurrentUser: () => {
    const id = localStorage.getItem(CURRENT_USER_KEY);
    return id ? storageService.getUserById(id) : null;
  },

  logout: () => localStorage.removeItem(CURRENT_USER_KEY),

  // --- SESSION MANAGEMENT ---
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

  deleteSession: (sessionId: string) => {
    localStorage.removeItem(sessionId);
  },

  // --- CREDITS & USAGE ---
  canRequest: (userId: string): boolean => {
    const user = storageService.getUserById(userId);
    if (!user) return false;
    if (user.role === 'admin') return true;
    return user.credits > 0 || user.freeUsage.count < 3;
  },

  // Required by DialogueSession and SmartDashboard
  canPerformRequest: (userId: string): { allowed: boolean; reason?: string } => {
    const allowed = storageService.canRequest(userId);
    return { allowed, reason: allowed ? undefined : 'insufficient' };
  },

  consumeCredit: (userId: string) => {
    const user = storageService.getUserById(userId);
    if (!user || user.role === 'admin') return;
    if (user.freeUsage.count < 3) user.freeUsage.count++;
    else if (user.credits > 0) user.credits--;
    storageService.saveUserProfile(user);
  },

  // Required by DialogueSession
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

  // Required by AdminDashboard
  addCredits: async (userId: string, amount: number) => {
    const user = storageService.getUserById(userId);
    if (user) {
      user.credits += amount;
      storageService.saveUserProfile(user);
    }
  },

  // --- SYSTEM SETTINGS ---
  fetchSystemSettings: async (): Promise<SystemSettings> => {
    return storageService.getSystemSettings();
  },

  getSystemSettings: (): SystemSettings => {
    const data = localStorage.getItem(SETTINGS_KEY);
    return data ? JSON.parse(data) : {
      apiKeys: [],
      activeModel: 'gemini-3-flash-preview',
      creditPrice: 50,
      customLanguages: [],
      validTransactionRefs: [],
      adminContact: { telma: "0349310268", airtel: "0333878420", orange: "0326979017" }
    };
  },

  updateSystemSettings: async (settings: SystemSettings) => {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  },

  // --- ADMIN REQUESTS ---
  getAdminRequests: async (): Promise<AdminRequest[]> => {
    const data = localStorage.getItem(REQUESTS_KEY);
    return data ? JSON.parse(data) : [];
  },

  sendAdminRequest: async (userId: string, username: string, type: 'credit' | 'password_reset' | 'message', amount?: number, message?: string, contact?: string): Promise<{ status: 'pending' | 'approved' }> => {
    const requests = await storageService.getAdminRequests();
    
    // Auto-approve logic if ref matches
    const settings = storageService.getSystemSettings();
    const isRefValid = message && settings.validTransactionRefs?.some(ref => message.includes(ref));
    
    const status = isRefValid ? 'approved' : 'pending';
    
    const newReq: AdminRequest = {
      id: crypto.randomUUID(),
      userId,
      username,
      type,
      amount,
      message: message + (contact ? ` | Contact: ${contact}` : ''),
      status,
      createdAt: Date.now()
    };
    
    requests.push(newReq);
    localStorage.setItem(REQUESTS_KEY, JSON.stringify(requests));
    
    if (isRefValid && type === 'credit' && amount) {
        await storageService.addCredits(userId, amount);
    }
    
    return { status };
  },

  resolveRequest: async (reqId: string, status: 'approved' | 'rejected') => {
    const requests = await storageService.getAdminRequests();
    const found = requests.find(r => r.id === reqId);
    if (found && found.status === 'pending') {
      found.status = status;
      if (status === 'approved' && found.type === 'credit' && found.amount) {
        await storageService.addCredits(found.userId, found.amount);
      }
      localStorage.setItem(REQUESTS_KEY, JSON.stringify(requests));
    }
  }
};
