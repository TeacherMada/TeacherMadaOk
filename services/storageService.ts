
import { UserProfile, ChatMessage, UserPreferences, SystemSettings, Transaction, AdminRequest } from "../types";

const CURRENT_USER_KEY = 'smart_teacher_current_user_id';
const SETTINGS_KEY = 'smart_teacher_system_settings';
const REQUESTS_KEY = 'smart_teacher_admin_requests';

const DEFAULT_SETTINGS: SystemSettings = {
  apiKeys: [process.env.API_KEY || ''],
  activeModel: 'gemini-3-flash-preview',
  adminContact: {
    telma: "034 93 102 68",
    airtel: "033 38 784 20",
    orange: "032 69 790 17"
  },
  creditPrice: 50
};

// --- Helper: Timezone Management ---
const getMadagascarCurrentWeek = (): string => {
  // Returns the Monday of the current week in Madagascar Time
  const now = new Date();
  const madaTime = new Date(now.toLocaleString("en-US", { timeZone: "Indian/Antananarivo" }));
  const day = madaTime.getDay() || 7; // Get current day number, converting Sun(0) to 7
  if (day !== 1) madaTime.setHours(-24 * (day - 1));
  madaTime.setHours(0, 0, 0, 0);
  return madaTime.toISOString().split('T')[0];
};

export const storageService = {
  
  // --- Auth & User Management ---
  
  login: (identifier: string, password?: string): { success: boolean, user?: UserProfile, error?: string } => {
    // Seed Admin if not exists
    storageService.seedAdmin();

    let foundUser: UserProfile | null = null;
    
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key?.startsWith('user_data_')) {
        const userData = JSON.parse(localStorage.getItem(key) || '{}') as UserProfile;
        if (
            userData.username.toLowerCase() === identifier.toLowerCase() || 
            (userData.email && userData.email.toLowerCase() === identifier.toLowerCase())
        ) {
          foundUser = userData;
          break;
        }
      }
    }

    if (!foundUser) return { success: false, error: "Utilisateur introuvable." };
    if (foundUser.isSuspended) return { success: false, error: "Compte suspendu. Contactez l'admin." };
    if (password && foundUser.password !== password) return { success: false, error: "Mot de passe incorrect." };

    localStorage.setItem(CURRENT_USER_KEY, foundUser.id);
    return { success: true, user: foundUser };
  },

  register: (username: string, password?: string, email?: string): { success: boolean, user?: UserProfile, error?: string } => {
    for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key?.startsWith('user_data_')) {
          const userData = JSON.parse(localStorage.getItem(key) || '{}') as UserProfile;
          if (userData.username.toLowerCase() === username.toLowerCase()) {
            return { success: false, error: "Ce nom d'utilisateur est déjà pris." };
          }
        }
    }

    const newUser: UserProfile = {
      id: crypto.randomUUID(),
      username,
      email,
      password, 
      role: 'user',
      createdAt: Date.now(),
      preferences: null,
      stats: { xp: 0, streak: 1, lessonsCompleted: 0 },
      skills: { vocabulary: 10, grammar: 5, pronunciation: 5, listening: 5 },
      aiMemory: "Nouvel utilisateur.",
      isPremium: false,
      hasSeenTutorial: false,
      credits: 0, // Starts with 0 paid credits
      freeUsage: {
        lastResetWeek: getMadagascarCurrentWeek(),
        count: 0
      }
    };
    
    storageService.saveUserProfile(newUser);
    localStorage.setItem(CURRENT_USER_KEY, newUser.id);
    return { success: true, user: newUser };
  },

  logout: () => {
    localStorage.removeItem(CURRENT_USER_KEY);
  },

  getCurrentUser: (): UserProfile | null => {
    const id = localStorage.getItem(CURRENT_USER_KEY);
    if (!id) return null;
    const data = localStorage.getItem(`user_data_${id}`);
    if (!data) return null;
    
    // Auto-update free tier on get
    let user = JSON.parse(data) as UserProfile;
    const currentWeek = getMadagascarCurrentWeek();
    
    // Initialize freeUsage if missing (migration)
    if (!user.freeUsage) {
        user.freeUsage = { lastResetWeek: currentWeek, count: 0 };
    }

    if (user.freeUsage.lastResetWeek !== currentWeek) {
        user.freeUsage = { lastResetWeek: currentWeek, count: 0 };
        storageService.saveUserProfile(user);
    }

    return user;
  },

  getAllUsers: (): UserProfile[] => {
    const users: UserProfile[] = [];
    for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key?.startsWith('user_data_')) {
            users.push(JSON.parse(localStorage.getItem(key) || '{}'));
        }
    }
    return users.sort((a, b) => b.createdAt - a.createdAt);
  },

  // --- Credit System Logic ---

  canPerformRequest: (userId: string): { allowed: boolean, reason?: 'credits' | 'free_tier' | 'blocked' } => {
    const user = storageService.getUserById(userId);
    if (!user) return { allowed: false, reason: 'blocked' };
    if (user.role === 'admin') return { allowed: true, reason: 'credits' }; // Admin is unlimited

    // Check Free Tier (2 requests per week)
    if (user.freeUsage.count < 2) {
        return { allowed: true, reason: 'free_tier' };
    }

    // Check Credits
    if (user.credits > 0) {
        return { allowed: true, reason: 'credits' };
    }

    return { allowed: false, reason: 'blocked' };
  },

  deductCreditOrUsage: (userId: string): UserProfile | null => {
    const user = storageService.getUserById(userId);
    if (!user) return null;
    if (user.role === 'admin') return user;

    if (user.freeUsage.count < 2) {
        user.freeUsage.count += 1;
    } else if (user.credits > 0) {
        user.credits -= 1;
    } else {
        return null; // Should have been caught by canPerformRequest
    }

    storageService.saveUserProfile(user);
    return user;
  },

  addCredits: (userId: string, amount: number) => {
    const user = storageService.getUserById(userId);
    if (user) {
        user.credits += amount;
        storageService.saveUserProfile(user);
    }
  },

  // --- Admin Request System ---

  sendAdminRequest: (userId: string, username: string, type: 'credit' | 'message', amount?: number, message?: string) => {
      const requests = storageService.getAdminRequests();
      const newRequest: AdminRequest = {
          id: `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
          userId,
          username,
          type,
          amount,
          message,
          status: 'pending',
          createdAt: Date.now()
      };
      requests.push(newRequest);
      localStorage.setItem(REQUESTS_KEY, JSON.stringify(requests));
  },

  getAdminRequests: (): AdminRequest[] => {
      const data = localStorage.getItem(REQUESTS_KEY);
      return data ? JSON.parse(data) : [];
  },

  resolveRequest: (requestId: string, status: 'approved' | 'rejected') => {
      const requests = storageService.getAdminRequests();
      const index = requests.findIndex(r => r.id === requestId);
      if (index !== -1) {
          const req = requests[index];
          
          // Safeguard: Only process pending requests
          if (req.status !== 'pending') return;

          req.status = status;
          
          // Auto add credits if approved
          if (status === 'approved' && req.type === 'credit' && req.amount) {
              storageService.addCredits(req.userId, req.amount);
          }

          localStorage.setItem(REQUESTS_KEY, JSON.stringify(requests));
      }
  },

  // --- Admin Functions ---

  seedAdmin: () => {
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
            stats: { xp: 9999, streak: 999, lessonsCompleted: 999 },
            aiMemory: "ADMINISTRATEUR SYSTÈME",
            isPremium: true,
            credits: 999999,
            freeUsage: { lastResetWeek: getMadagascarCurrentWeek(), count: 0 }
        };
        storageService.saveUserProfile(adminUser);
    }
  },

  getSystemSettings: (): SystemSettings => {
    const data = localStorage.getItem(SETTINGS_KEY);
    return data ? JSON.parse(data) : DEFAULT_SETTINGS;
  },

  updateSystemSettings: (settings: SystemSettings) => {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  },

  // --- Generic Data ---

  getUserById: (userId: string): UserProfile | null => {
      const data = localStorage.getItem(`user_data_${userId}`);
      return data ? JSON.parse(data) : null;
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

  saveChatHistory: (userId: string, messages: ChatMessage[]) => {
    localStorage.setItem(`chat_history_${userId}`, JSON.stringify(messages));
  },

  getChatHistory: (userId: string): ChatMessage[] => {
    const data = localStorage.getItem(`chat_history_${userId}`);
    return data ? JSON.parse(data) : [];
  },
  
  clearChatHistory: (userId: string) => {
      localStorage.removeItem(`chat_history_${userId}`);
  }
};
