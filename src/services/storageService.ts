import { UserProfile, ChatMessage, UserPreferences, SystemSettings, Transaction, AdminRequest } from "../types";

const CURRENT_USER_KEY = 'smart_teacher_current_user_id';
const SETTINGS_KEY = 'smart_teacher_system_settings';
const REQUESTS_KEY = 'smart_teacher_admin_requests';

const DEFAULT_SETTINGS: SystemSettings = {
  apiKeys: [], 
  activeModel: 'gemini-3-flash-preview',
  adminContact: {
    telma: "034 93 102 68",
    airtel: "033 38 784 20",
    orange: "032 69 790 17"
  },
  creditPrice: 50,
  customLanguages: [],
  validTransactionRefs: []
};

const getMadagascarCurrentWeek = (): string => {
  const now = new Date();
  const madaTime = new Date(now.toLocaleString("en-US", { timeZone: "Indian/Antananarivo" }));
  const day = madaTime.getDay() || 7; 
  if (day !== 1) madaTime.setHours(-24 * (day - 1));
  madaTime.setHours(0, 0, 0, 0);
  return madaTime.toISOString().split('T')[0];
};

export const storageService = {
  
  login: async (identifier: string, password?: string): Promise<{ success: boolean, user?: UserProfile, error?: string }> => {
    storageService.seedAdmin();
    let foundUser: UserProfile | null = null;
    try {
        for (let i = 0; i < localStorage.length; i++) {
          const key = localStorage.key(i);
          if (key?.startsWith('user_data_')) {
            const rawData = localStorage.getItem(key);
            if (!rawData) continue;
            const userData = JSON.parse(rawData) as UserProfile;
            if (
                userData.username.toLowerCase() === identifier.toLowerCase() || 
                (userData.email && userData.email.toLowerCase() === identifier.toLowerCase())
            ) {
              foundUser = userData;
              break;
            }
          }
        }
    } catch (e) { return { success: false, error: "Données corrompues." }; }

    if (!foundUser) return { success: false, error: "Utilisateur introuvable." };
    if (foundUser.isSuspended) return { success: false, error: "Compte suspendu." };
    if (password && foundUser.password !== password) return { success: false, error: "Mot de passe incorrect." };

    localStorage.setItem(CURRENT_USER_KEY, foundUser.id);
    return { success: true, user: foundUser };
  },

  register: async (username: string, password?: string, email?: string, phoneNumber?: string): Promise<{ success: boolean, user?: UserProfile, error?: string }> => {
    const users = await storageService.getAllUsers();
    if (users.find(u => u.username.toLowerCase() === username.toLowerCase())) {
        return { success: false, error: "Nom déjà pris." };
    }

    const newUser: UserProfile = {
      id: crypto.randomUUID(),
      username,
      email,
      phoneNumber,
      password, 
      role: 'user',
      createdAt: Date.now(),
      preferences: null,
      stats: { xp: 0, streak: 1, lessonsCompleted: 0, progressByLevel: {} },
      skills: { vocabulary: 10, grammar: 5, pronunciation: 5, listening: 5 },
      aiMemory: "Nouvel utilisateur.",
      isPremium: false,
      hasSeenTutorial: false,
      credits: 5, // Crédits de bienvenue
      freeUsage: { lastResetWeek: getMadagascarCurrentWeek(), count: 0 },
      vocabulary: [] // Initialisation cruciale
    };
    
    storageService.saveUserProfile(newUser);
    localStorage.setItem(CURRENT_USER_KEY, newUser.id);
    return { success: true, user: newUser };
  },

  logout: () => { localStorage.removeItem(CURRENT_USER_KEY); },

  getCurrentUser: (): UserProfile | null => {
    const id = localStorage.getItem(CURRENT_USER_KEY);
    return id ? storageService.getUserById(id) : null;
  },

  getUserById: (userId: string): UserProfile | null => {
      const data = localStorage.getItem(`user_data_${userId}`);
      if (!data) return null;
      try {
          let user = JSON.parse(data) as UserProfile;
          const currentWeek = getMadagascarCurrentWeek();
          let needsSave = false;
          if (!user.vocabulary) { user.vocabulary = []; needsSave = true; } // Correction TS18048
          if (!user.credits && user.credits !== 0) { user.credits = 0; needsSave = true; }
          if (user.freeUsage.lastResetWeek !== currentWeek) {
              user.freeUsage = { lastResetWeek: currentWeek, count: 0 };
              needsSave = true;
          }
          if (needsSave) storageService.saveUserProfile(user);
          return user;
      } catch (e) { return null; }
  },

  getAllUsers: async (): Promise<UserProfile[]> => {
    const users: UserProfile[] = [];
    for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key?.startsWith('user_data_')) {
            try { users.push(JSON.parse(localStorage.getItem(key) || '{}')); } catch(e) {}
        }
    }
    return users.sort((a, b) => b.createdAt - a.createdAt);
  },

  canPerformRequest: (userId: string): { allowed: boolean, reason?: 'credits' | 'free_tier' | 'blocked' } => {
    const user = storageService.getUserById(userId);
    if (!user) return { allowed: false, reason: 'blocked' };
    if (user.role === 'admin') return { allowed: true, reason: 'credits' };
    if (user.freeUsage.count < 3) return { allowed: true, reason: 'free_tier' };
    if (user.credits > 0) return { allowed: true, reason: 'credits' };
    return { allowed: false, reason: 'blocked' };
  },

  deductCreditOrUsage: (userId: string): UserProfile | null => {
    const user = storageService.getUserById(userId);
    if (!user) return null;
    if (user.role === 'admin') return user;
    if (user.freeUsage.count < 3) {
        user.freeUsage.count += 1;
    } else if (user.credits > 0) {
        user.credits -= 1;
    } else { return null; }
    storageService.saveUserProfile(user);
    return user;
  },

  addCredits: async (userId: string, amount: number) => {
    const user = storageService.getUserById(userId);
    if (user) {
        user.credits = (user.credits || 0) + amount;
        storageService.saveUserProfile(user);
    }
  },

  sendAdminRequest: async (userId: string, username: string, type: string, amount?: number, message?: string, contactInfo?: string) => {
      const currentRequests = JSON.parse(localStorage.getItem(REQUESTS_KEY) || '[]');
      const newRequest: AdminRequest = {
          id: `req_${Date.now()}`,
          userId,
          username,
          type: type as any,
          amount,
          message,
          contactInfo,
          status: 'pending',
          createdAt: Date.now()
      };
      localStorage.setItem(REQUESTS_KEY, JSON.stringify([newRequest, ...currentRequests]));
      return { status: 'pending' };
  },

  getAdminRequests: async (): Promise<AdminRequest[]> => {
      return JSON.parse(localStorage.getItem(REQUESTS_KEY) || '[]');
  },

  resolveRequest: async (requestId: string, status: 'approved' | 'rejected') => {
      const requests = await storageService.getAdminRequests();
      const req = requests.find(r => r.id === requestId);
      if (req && req.status === 'pending') {
          req.status = status;
          if (status === 'approved' && req.type === 'credit' && req.amount) {
              await storageService.addCredits(req.userId, req.amount);
          }
          localStorage.setItem(REQUESTS_KEY, JSON.stringify(requests));
      }
  },

  seedAdmin: async () => {
    const adminId = 'admin_0349310268';
    if (!localStorage.getItem(`user_data_${adminId}`)) {
        const adminUser: UserProfile = {
            id: adminId,
            username: '0349310268',
            password: '777v',
            role: 'admin',
            email: 'admin@teachermada.mg',
            createdAt: Date.now(),
            preferences: null,
            stats: { xp: 9999, streak: 999, lessonsCompleted: 999, progressByLevel: {} },
            aiMemory: "ADMIN",
            isPremium: true,
            credits: 999999,
            freeUsage: { lastResetWeek: getMadagascarCurrentWeek(), count: 0 },
            vocabulary: []
        };
        storageService.saveUserProfile(adminUser);
    }
  },

  getSystemSettings: (): SystemSettings => {
    const data = localStorage.getItem(SETTINGS_KEY);
    return data ? JSON.parse(data) : DEFAULT_SETTINGS;
  },

  updateSystemSettings: async (settings: SystemSettings) => {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  },

  saveUserProfile: (user: UserProfile) => {
    localStorage.setItem(`user_data_${user.id}`, JSON.stringify(user));
  },

  updatePreferences: (userId: string, prefs: UserPreferences) => {
    const user = storageService.getUserById(userId);
    if (user) {
      user.preferences = prefs;
      storageService.saveUserProfile(user);
    }
  },

  markTutorialSeen: (userId: string) => {
    const user = storageService.getUserById(userId);
    if (user) {
        user.hasSeenTutorial = true;
        storageService.saveUserProfile(user);
    }
  },

  saveChatHistory: async (userId: string, messages: ChatMessage[], language?: string) => {
    const langKey = language ? language.replace(/[^a-zA-Z0-9]/g, '') : 'default';
    localStorage.setItem(`chat_history_${userId}_${langKey}`, JSON.stringify(messages));
  },

  getChatHistory: (userId: string, language?: string): ChatMessage[] => {
    const langKey = language ? language.replace(/[^a-zA-Z0-9]/g, '') : 'default';
    const data = localStorage.getItem(`chat_history_${userId}_${langKey}`);
    return data ? JSON.parse(data) : [];
  },

  fetchSystemSettings: async () => {},
  syncProfileFromCloud: async (id: string) => null,
  loadChatHistoryFromCloud: async (id: string, l: string) => []
};