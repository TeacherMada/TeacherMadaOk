
import { UserProfile, ChatMessage, UserPreferences, SystemSettings, AdminRequest } from "../types";

const CURRENT_USER_KEY = 'tm_current_user_id';
const SETTINGS_KEY = 'tm_system_settings';
const REQUESTS_KEY = 'tm_admin_requests';

const getMonday = (): string => {
  const d = new Date();
  const day = d.getDay(), diff = d.getDate() - day + (day === 0 ? -6 : 1);
  return new Date(d.setDate(diff)).toISOString().split('T')[0];
};

const DEFAULT_SETTINGS: SystemSettings = {
  apiKeys: [], activeModel: 'gemini-3-flash-preview',
  adminContact: { telma: "034 93 102 68", airtel: "033 38 784 20", orange: "032 69 790 17" },
  creditPrice: 50,
  customLanguages: [],
  validTransactionRefs: []
};

export const storageService = {
  login: async (id: string, pass?: string): Promise<{success: boolean, user?: UserProfile, error?: string}> => {
    const users = await storageService.getAllUsers();
    const found = users.find(u => u.username.toLowerCase() === id.toLowerCase() || u.email?.toLowerCase() === id.toLowerCase());
    
    if (!found) return { success: false, error: "Utilisateur introuvable." };
    if (found.isSuspended) return { success: false, error: "Compte suspendu." };
    if (pass && found.password !== pass) return { success: false, error: "Mot de passe incorrect." };
    
    localStorage.setItem(CURRENT_USER_KEY, found.id);
    return { success: true, user: storageService.getUserById(found.id)! };
  },

  // Fix: Add support for 4 arguments as used in AuthScreen.tsx
  register: async (username: string, password?: string, email?: string, phoneNumber?: string): Promise<{success: boolean, user?: UserProfile, error?: string}> => {
    const users = await storageService.getAllUsers();
    if (users.find(u => u.username.toLowerCase() === username.toLowerCase())) return { success: false, error: "Nom déjà pris." };
    
    const newUser: UserProfile = {
      id: crypto.randomUUID(),
      username, password, email,
      role: 'user',
      createdAt: Date.now(),
      preferences: null,
      stats: { xp: 0, streak: 1, lessonsCompleted: 0 },
      vocabulary: [],
      credits: 5,
      freeUsage: { lastResetWeek: getMonday(), count: 0 },
      aiMemory: "Nouveau."
    };
    storageService.saveUserProfile(newUser);
    localStorage.setItem(CURRENT_USER_KEY, newUser.id);
    return { success: true, user: newUser };
  },

  getUserById: (id: string): UserProfile | null => {
    const data = localStorage.getItem(`user_data_${id}`);
    if (!data) return null;
    try {
      const user = JSON.parse(data);
      // Correction TS18048 : Garantie des tableaux
      if (!user.vocabulary) user.vocabulary = [];
      if (!user.stats) user.stats = { xp: 0, streak: 1, lessonsCompleted: 0 };
      return user;
    } catch { return null; }
  },

  getAllUsers: async (): Promise<UserProfile[]> => {
    const users: UserProfile[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key?.startsWith('user_data_')) {
        users.push(JSON.parse(localStorage.getItem(key)!));
      }
    }
    return users;
  },

  saveUserProfile: (user: UserProfile) => {
    localStorage.setItem(`user_data_${user.id}`, JSON.stringify(user));
  },

  logout: () => localStorage.removeItem(CURRENT_USER_KEY),
  getCurrentUser: () => {
    const id = localStorage.getItem(CURRENT_USER_KEY);
    return id ? storageService.getUserById(id) : null;
  },

  // Fix: canPerformRequest now returns an object with 'allowed' property as expected by UI
  canPerformRequest: (userId: string): { allowed: boolean; reason?: string } => {
    const user = storageService.getUserById(userId);
    if (!user) return { allowed: false, reason: 'blocked' };
    if (user.role === 'admin') return { allowed: true };
    if (user.freeUsage.count < 3) return { allowed: true, reason: 'free_tier' };
    if (user.credits > 0) return { allowed: true, reason: 'credits' };
    return { allowed: false, reason: 'insufficient' };
  },

  deductCredit: (userId: string) => {
    const user = storageService.getUserById(userId);
    if (!user || user.role === 'admin') return;
    if (user.freeUsage.count < 3) user.freeUsage.count++;
    else if (user.credits > 0) user.credits--;
    storageService.saveUserProfile(user);
  },

  // Fix: Add missing deductCreditOrUsage used by DialogueSession
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

  // Fix: Add missing addCredits for AdminDashboard
  addCredits: async (userId: string, amount: number) => {
    const user = storageService.getUserById(userId);
    if (user) {
        user.credits += amount;
        storageService.saveUserProfile(user);
    }
  },

  saveChatHistory: (userId: string, messages: ChatMessage[], lang: string) => {
    localStorage.setItem(`chat_${userId}_${lang.replace(/\s/g, '')}`, JSON.stringify(messages));
  },

  getChatHistory: (userId: string, lang: string): ChatMessage[] => {
    const data = localStorage.getItem(`chat_${userId}_${lang.replace(/\s/g, '')}`);
    return data ? JSON.parse(data) : [];
  },

  getSystemSettings: (): SystemSettings => {
    const data = localStorage.getItem(SETTINGS_KEY);
    return data ? JSON.parse(data) : DEFAULT_SETTINGS;
  },

  // Fix: Add missing fetchSystemSettings
  fetchSystemSettings: async () => {
    return storageService.getSystemSettings();
  },

  // Fix: Add missing updateSystemSettings
  updateSystemSettings: async (settings: SystemSettings) => {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  },

  // Fix: Add missing sendAdminRequest
  sendAdminRequest: async (userId: string, username: string, type: 'credit' | 'password_reset' | 'message', amount?: number, message?: string, contact?: string): Promise<{status: 'pending' | 'approved'}> => {
      const requests = await storageService.getAdminRequests();
      const settings = storageService.getSystemSettings();
      const isAutoApproved = settings.validTransactionRefs?.some(ref => message?.includes(ref));
      
      const newRequest: AdminRequest = {
          id: `req_${Date.now()}`,
          userId,
          username,
          type,
          amount,
          message: message + (contact ? ` (Contact: ${contact})` : ''),
          status: isAutoApproved ? 'approved' : 'pending',
          createdAt: Date.now()
      };
      
      if (isAutoApproved && type === 'credit' && amount) {
          await storageService.addCredits(userId, amount);
      }

      requests.push(newRequest);
      localStorage.setItem(REQUESTS_KEY, JSON.stringify(requests));
      return { status: newRequest.status as 'pending' | 'approved' };
  },

  // Fix: Add missing getAdminRequests
  getAdminRequests: async (): Promise<AdminRequest[]> => {
      const data = localStorage.getItem(REQUESTS_KEY);
      return data ? JSON.parse(data) : [];
  },

  // Fix: Add missing resolveRequest
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
  }
};
