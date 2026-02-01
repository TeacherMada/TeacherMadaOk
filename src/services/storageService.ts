import { UserProfile, ChatMessage, UserPreferences, SystemSettings, AdminRequest } from "../types";

const CURRENT_USER_KEY = 'smart_teacher_current_user_id';
const SETTINGS_KEY = 'smart_teacher_system_settings';
const REQUESTS_KEY = 'smart_teacher_admin_requests';

const getMadagascarCurrentWeek = (): string => {
  const now = new Date();
  const madaTime = new Date(now.toLocaleString("en-US", { timeZone: "Indian/Antananarivo" }));
  const day = madaTime.getDay() || 7; 
  if (day !== 1) madaTime.setHours(-24 * (day - 1));
  madaTime.setHours(0, 0, 0, 0);
  return madaTime.toISOString().split('T')[0];
};

export const storageService = {
  login: async (id: string, pass?: string): Promise<{success: boolean, user?: UserProfile, error?: string}> => {
    storageService.seedAdmin();
    const users = await storageService.getAllUsers();
    const found = users.find(u => u.username === id || u.email === id);
    if (!found) return { success: false, error: "Utilisateur introuvable." };
    if (pass && found.password !== pass) return { success: false, error: "Mot de passe incorrect." };
    localStorage.setItem(CURRENT_USER_KEY, found.id);
    return { success: true, user: storageService.getUserById(found.id)! };
  },

  register: async (username: string, password?: string, email?: string, phoneNumber?: string): Promise<{success: boolean, user?: UserProfile, error?: string}> => {
    const users = await storageService.getAllUsers();
    if (users.find(u => u.username === username)) return { success: false, error: "Pseudo déjà pris." };
    
    const newUser: UserProfile = {
      id: crypto.randomUUID(),
      username, password, email, phoneNumber,
      role: 'user',
      createdAt: Date.now(),
      preferences: null,
      stats: { xp: 0, streak: 1, lessonsCompleted: 0, progressByLevel: {} },
      vocabulary: [],
      aiMemory: "Nouveau.",
      credits: 5,
      freeUsage: { lastResetWeek: getMadagascarCurrentWeek(), count: 0 }
    };
    storageService.saveUserProfile(newUser);
    localStorage.setItem(CURRENT_USER_KEY, newUser.id);
    return { success: true, user: newUser };
  },

  getCurrentUser: () => {
    const id = localStorage.getItem(CURRENT_USER_KEY);
    return id ? storageService.getUserById(id) : null;
  },

  getUserById: (id: string): UserProfile | null => {
    const data = localStorage.getItem(`user_data_${id}`);
    if (!data) return null;
    try {
        const user = JSON.parse(data);
        if (!user.vocabulary) user.vocabulary = [];
        if (!user.stats.progressByLevel) user.stats.progressByLevel = {};
        return user;
    } catch(e) { return null; }
  },

  getAllUsers: async (): Promise<UserProfile[]> => {
    const users: UserProfile[] = [];
    for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key?.startsWith('user_data_')) users.push(JSON.parse(localStorage.getItem(key)!));
    }
    return users;
  },

  saveUserProfile: (user: UserProfile) => {
    localStorage.setItem(`user_data_${user.id}`, JSON.stringify(user));
  },

  logout: () => localStorage.removeItem(CURRENT_USER_KEY),

  canPerformRequest: (userId: string) => {
    const user = storageService.getUserById(userId);
    if (!user) return { allowed: false };
    if (user.role === 'admin' || user.credits > 0 || user.freeUsage.count < 3) return { allowed: true };
    return { allowed: false };
  },

  deductCreditOrUsage: (userId: string) => {
    const user = storageService.getUserById(userId);
    if (!user || user.role === 'admin') return user;
    if (user.freeUsage.count < 3) user.freeUsage.count++;
    else if (user.credits > 0) user.credits--;
    else return null;
    storageService.saveUserProfile(user);
    return user;
  },

  addCredits: async (userId: string, amt: number) => {
      const u = storageService.getUserById(userId);
      if (u) { u.credits += amt; storageService.saveUserProfile(u); }
  },

  sendAdminRequest: async (userId: string, username: string, type: any, amount?: number, message?: string, contactInfo?: string) => {
      const requests = JSON.parse(localStorage.getItem(REQUESTS_KEY) || '[]');
      const newReq = { id: `req_${Date.now()}`, userId, username, type, amount, message, contactInfo, status: 'pending', createdAt: Date.now() };
      localStorage.setItem(REQUESTS_KEY, JSON.stringify([newReq, ...requests]));
      return { status: 'pending' };
  },

  getAdminRequests: async () => JSON.parse(localStorage.getItem(REQUESTS_KEY) || '[]'),

  resolveRequest: async (id: string, status: 'approved' | 'rejected') => {
      const requests = await storageService.getAdminRequests();
      const req = requests.find((r: any) => r.id === id);
      if (req && req.status === 'pending') {
          req.status = status;
          if (status === 'approved' && req.type === 'credit' && req.amount) await storageService.addCredits(req.userId, req.amount);
          localStorage.setItem(REQUESTS_KEY, JSON.stringify(requests));
      }
  },

  getSystemSettings: (): SystemSettings => {
    return JSON.parse(localStorage.getItem(SETTINGS_KEY) || JSON.stringify({
        apiKeys: [], activeModel: 'gemini-3-flash-preview',
        adminContact: { telma: "0349310268", airtel: "0333878420", orange: "0326979017" },
        creditPrice: 50
    }));
  },

  updateSystemSettings: async (s: SystemSettings) => localStorage.setItem(SETTINGS_KEY, JSON.stringify(s)),

  updatePreferences: (id: string, p: UserPreferences) => {
    const u = storageService.getUserById(id);
    if (u) { u.preferences = p; storageService.saveUserProfile(u); }
  },

  saveChatHistory: (id: string, msgs: ChatMessage[], lang: string) => {
    localStorage.setItem(`chat_${id}_${lang.replace(/\s+/g, '')}`, JSON.stringify(msgs));
  },

  getChatHistory: (id: string, lang: string): ChatMessage[] => {
    return JSON.parse(localStorage.getItem(`chat_${id}_${lang.replace(/\s+/g, '')}`) || '[]');
  },

  seedAdmin: () => {
    if (!localStorage.getItem('user_data_admin_0349310268')) {
        storageService.saveUserProfile({
            id: 'admin_0349310268', username: '0349310268', password: '777v', role: 'admin', createdAt: Date.now(),
            preferences: null, stats: { xp: 9999, streak: 999, lessonsCompleted: 999, progressByLevel: {} },
            vocabulary: [], aiMemory: "ADMIN", credits: 999999, freeUsage: { lastResetWeek: getMadagascarCurrentWeek(), count: 0 }
        });
    }
  },
  
  fetchSystemSettings: async () => {},
  syncProfileFromCloud: async (id: string) => null,
  loadChatHistoryFromCloud: async (id: string, l: string) => [],
  markTutorialSeen: (id: string) => {
      const u = storageService.getUserById(id);
      if (u) { u.hasSeenTutorial = true; storageService.saveUserProfile(u); }
  }
};