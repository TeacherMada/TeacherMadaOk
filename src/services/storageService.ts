import { UserProfile, ChatMessage, UserPreferences, SystemSettings, Transaction, AdminRequest } from "../types";

const CURRENT_USER_KEY = 'smart_teacher_current_user_id';
const SETTINGS_KEY = 'smart_teacher_system_settings';
const REQUESTS_KEY = 'smart_teacher_admin_requests';

const DEFAULT_SETTINGS: SystemSettings = {
  // @ts-ignore
  apiKeys: [import.meta.env.VITE_GOOGLE_API_KEY || ''],
  activeModel: 'gemini-2.0-flash',
  adminContact: {
    telma: "034 93 102 68",
    airtel: "033 38 784 20",
    orange: "032 69 790 17"
  },
  creditPrice: 50,
  customLanguages: [],
  validTransactionRefs: []
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
  
  login: async (identifier: string, password?: string): Promise<{ success: boolean, user?: UserProfile, error?: string }> => {
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

  register: async (username: string, password?: string, email?: string, phoneNumber?: string): Promise<{ success: boolean, user?: UserProfile, error?: string }> => {
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
      credits: 3, // Starts with 3 free credits
      freeUsage: {
        lastResetWeek: getMadagascarCurrentWeek(),
        count: 0
      },
      vocabulary: []
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

    // Initialize stats if missing
    if (!user.stats) user.stats = { xp: 0, streak: 1, lessonsCompleted: 0, progressByLevel: {} };
    if (!user.stats.progressByLevel) user.stats.progressByLevel = {};

    if (user.freeUsage.lastResetWeek !== currentWeek) {
        user.freeUsage = { lastResetWeek: currentWeek, count: 0 };
        storageService.saveUserProfile(user);
    }

    return user;
  },

  getAllUsers: async (): Promise<UserProfile[]> => {
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

    // Check Free Tier (3 requests per week)
    if (user.freeUsage.count < 3) {
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

    if (user.freeUsage.count < 3) {
        user.freeUsage.count += 1;
    } else if (user.credits > 0) {
        user.credits -= 1;
    } else {
        return null; // Should have been caught by canPerformRequest
    }

    storageService.saveUserProfile(user);
    return user;
  },

  addCredits: async (userId: string, amount: number) => {
    const user = storageService.getUserById(userId);
    if (user) {
        user.credits += amount;
        storageService.saveUserProfile(user);
    }
  },

  // --- Admin Request System ---

  sendAdminRequest: async (userId: string, username: string, type: 'credit' | 'message' | 'password_reset', amount?: number, message?: string, contactInfo?: string): Promise<{status: 'pending' | 'approved' | 'rejected'}> => {
      let finalStatus: 'pending' | 'approved' | 'rejected' = 'pending';
      const settings = storageService.getSystemSettings();
      const validRefs = settings.validTransactionRefs || [];
      
      let matchedRef: string | null = null;

      // Auto-validate if reference matches
      if (type === 'credit' && amount && message) {
          matchedRef = validRefs.find(ref => message.toUpperCase().includes(ref.toUpperCase())) || null;
          if (matchedRef) {
              finalStatus = 'approved';
              // Consume the reference to prevent reuse
              const newRefs = validRefs.filter(r => r !== matchedRef);
              settings.validTransactionRefs = newRefs;
              await storageService.updateSystemSettings(settings);
              await storageService.addCredits(userId, amount);
          }
      }

      const requests = await storageService.getAdminRequests();
      const newRequest: AdminRequest = {
          id: `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
          userId,
          username,
          type,
          amount,
          message,
          contactInfo,
          status: finalStatus,
          createdAt: Date.now()
      };
      requests.push(newRequest);
      localStorage.setItem(REQUESTS_KEY, JSON.stringify(requests));
      
      return { status: finalStatus };
  },

  getAdminRequests: async (): Promise<AdminRequest[]> => {
      const data = localStorage.getItem(REQUESTS_KEY);
      return data ? JSON.parse(data) : [];
  },

  resolveRequest: async (requestId: string, status: 'approved' | 'rejected') => {
      const requests = await storageService.getAdminRequests();
      const index = requests.findIndex(r => r.id === requestId);
      if (index !== -1) {
          const req = requests[index];
          
          if (req.status !== 'pending') return;

          req.status = status;
          
          // Auto add credits if approved
          if (status === 'approved' && req.type === 'credit' && req.amount) {
              await storageService.addCredits(req.userId, req.amount);
          }

          localStorage.setItem(REQUESTS_KEY, JSON.stringify(requests));
      }
  },

  // --- Admin Functions ---

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
            aiMemory: "ADMINISTRATEUR SYSTÈME",
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

  saveChatHistory: async (userId: string, messages: ChatMessage[], language?: string) => {
    const langKey = language ? language.replace(/[^a-zA-Z0-9]/g, '') : 'default';
    localStorage.setItem(`chat_history_${userId}_${langKey}`, JSON.stringify(messages));
  },

  loadChatHistoryFromCloud: async (userId: string, language?: string): Promise<ChatMessage[]> => {
      // Local implementation: just fetch from local
      return storageService.getChatHistory(userId, language);
  },

  getChatHistory: (userId: string, language?: string): ChatMessage[] => {
    const langKey = language ? language.replace(/[^a-zA-Z0-9]/g, '') : 'default';
    const data = localStorage.getItem(`chat_history_${userId}_${langKey}`);
    
    // Fallback: If no language specific key, check generic (legacy migration)
    if (!data && !language) {
       return JSON.parse(localStorage.getItem(`chat_history_${userId}`) || '[]');
    }
    
    return data ? JSON.parse(data) : [];
  },
  
  clearChatHistory: async (userId: string, language?: string) => {
      const langKey = language ? language.replace(/[^a-zA-Z0-9]/g, '') : 'default';
      localStorage.removeItem(`chat_history_${userId}_${langKey}`);
  },

  // Dummy fetch for compatibility
  fetchSystemSettings: async () => {},
  syncProfileFromCloud: async (id: string) => null
};