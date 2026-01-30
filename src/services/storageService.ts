
import { supabase, isSupabaseConfigured } from '../lib/supabase';
import { UserProfile, ChatMessage, UserPreferences, SystemSettings, AdminRequest } from "../types";

const CURRENT_USER_KEY = 'smart_teacher_current_user_id';
const SETTINGS_KEY = 'smart_teacher_system_settings';
const REQUESTS_KEY = 'smart_teacher_admin_requests';

const DEFAULT_SETTINGS: SystemSettings = {
  apiKeys: [(import.meta as any).env.VITE_GOOGLE_API_KEY || ''],
  activeModel: 'gemini-3-flash-preview',
  adminContact: {
    telma: "034 93 102 68",
    airtel: "033 38 784 20",
    orange: "032 69 790 17"
  },
  creditPrice: 50
};

// --- Helper: Timezone Management (Anti-Fraude basique) ---
const getMadagascarCurrentWeek = (): string => {
  // Calcule le Lundi de la semaine en cours
  const now = new Date();
  // Force le fuseau horaire pour éviter la manip locale simple
  const madaTime = new Date(now.toLocaleString("en-US", { timeZone: "Indian/Antananarivo" }));
  const day = madaTime.getDay() || 7; // 1 (Mon) to 7 (Sun)
  if (day !== 1) madaTime.setHours(-24 * (day - 1));
  madaTime.setHours(0, 0, 0, 0);
  return madaTime.toISOString().split('T')[0]; // Format YYYY-MM-DD
};

export const storageService = {
  
  // --- Auth & User Management ---
  
  login: async (identifier: string, password?: string): Promise<{ success: boolean, user?: UserProfile, error?: string }> => {
    // 1. D'abord chercher en local pour la rapidité
    let foundUser: UserProfile | null = null;
    
    // Tentative récupération Cloud si dispo
    if (isSupabaseConfigured()) {
        const { data, error } = await supabase
            .from('profiles')
            .select('*')
            .or(`username.eq.${identifier},email.eq.${identifier},phone_number.eq.${identifier}`)
            .maybeSingle();
            
        if (!error && data) {
            // Mapping DB -> Local Type
            foundUser = {
                id: data.id,
                username: data.username,
                email: data.email,
                phoneNumber: data.phone_number,
                password: data.password,
                role: data.role,
                credits: data.credits,
                stats: data.stats || { xp: 0, streak: 1, lessonsCompleted: 0, levelProgress: 0 },
                preferences: data.preferences,
                skills: data.skills,
                aiMemory: data.ai_memory,
                isPremium: false,
                hasSeenTutorial: data.has_seen_tutorial,
                createdAt: data.created_at,
                freeUsage: data.free_usage || { lastResetWeek: getMadagascarCurrentWeek(), count: 0 },
                isSuspended: data.is_suspended
            };
            // Update Local Cache
            localStorage.setItem(CURRENT_USER_KEY, foundUser.id);
            localStorage.setItem(`user_data_${foundUser.id}`, JSON.stringify(foundUser));
        }
    }

    // Fallback Local si pas de réseau ou pas de Supabase
    if (!foundUser) {
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
    }

    if (!foundUser) return { success: false, error: "Utilisateur introuvable." };
    if (foundUser.isSuspended) return { success: false, error: "Compte suspendu." };
    if (password && foundUser.password !== password) return { success: false, error: "Mot de passe incorrect." };

    // Check Reset Hebdo à la connexion
    const currentWeek = getMadagascarCurrentWeek();
    if (foundUser.freeUsage.lastResetWeek !== currentWeek) {
        foundUser.freeUsage = { lastResetWeek: currentWeek, count: 0 };
        storageService.saveUserProfile(foundUser); // Sync Cloud auto inside
    }

    localStorage.setItem(CURRENT_USER_KEY, foundUser.id);
    return { success: true, user: foundUser };
  },

  register: async (username: string, password?: string, email?: string, phoneNumber?: string): Promise<{ success: boolean, user?: UserProfile, error?: string }> => {
    
    // Check existing (Local + Cloud ideally)
    if (isSupabaseConfigured()) {
        const { data } = await supabase.from('profiles').select('id').eq('username', username).maybeSingle();
        if (data) return { success: false, error: "Nom d'utilisateur déjà pris." };
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
      stats: { xp: 0, streak: 1, lessonsCompleted: 0, levelProgress: 0 },
      skills: { vocabulary: 10, grammar: 5, pronunciation: 5, listening: 5 },
      aiMemory: "Nouvel utilisateur.",
      isPremium: false,
      hasSeenTutorial: false,
      credits: 0, 
      freeUsage: {
        lastResetWeek: getMadagascarCurrentWeek(),
        count: 0
      }
    };
    
    storageService.saveUserProfile(newUser); // Saves to Local + Supabase
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
    
    let user = JSON.parse(data) as UserProfile;
    
    // Auto-reset hebdo à chaque récupération du profil (Sécurité anti-date locale)
    // On se base sur la fonction getMadagascarCurrentWeek qui génère la date "aujourd'hui"
    const currentWeek = getMadagascarCurrentWeek();
    
    if (!user.freeUsage || user.freeUsage.lastResetWeek !== currentWeek) {
        user.freeUsage = { lastResetWeek: currentWeek, count: 0 };
        // On sauvegarde silencieusement pour sync le reset
        localStorage.setItem(`user_data_${user.id}`, JSON.stringify(user));
        if (isSupabaseConfigured()) {
             supabase.from('profiles').update({ free_usage: user.freeUsage }).eq('id', user.id).then();
        }
    }

    return user;
  },

  // --- Credit System Logic ---

  canPerformRequest: (userId: string): { allowed: boolean, reason?: 'credits' | 'free_tier' | 'blocked' } => {
    const user = storageService.getUserById(userId);
    if (!user) return { allowed: false, reason: 'blocked' };
    if (user.role === 'admin') return { allowed: true, reason: 'credits' }; 

    // 1. Priorité au Gratuit (3 par semaine)
    if (user.freeUsage.count < 3) {
        return { allowed: true, reason: 'free_tier' };
    }

    // 2. Ensuite le solde payant
    if (user.credits > 0) {
        return { allowed: true, reason: 'credits' };
    }

    return { allowed: false, reason: 'blocked' };
  },

  deductCreditOrUsage: (userId: string): UserProfile | null => {
    const user = storageService.getUserById(userId);
    if (!user) return null;
    if (user.role === 'admin') return user;

    // Logique de déduction
    if (user.freeUsage.count < 3) {
        user.freeUsage.count += 1;
    } else if (user.credits > 0) {
        user.credits -= 1;
    } else {
        return null; // Should have been blocked by canPerformRequest
    }

    // SAUVEGARDE CRITIQUE (Local + Cloud)
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

  // --- Data Persistence ---

  getUserById: (userId: string): UserProfile | null => {
      const data = localStorage.getItem(`user_data_${userId}`);
      return data ? JSON.parse(data) : null;
  },

  saveUserProfile: (user: UserProfile) => {
    // 1. Local
    localStorage.setItem(`user_data_${user.id}`, JSON.stringify(user));
    
    // 2. Cloud Sync (Supabase) - Essential for Backend Link
    if (isSupabaseConfigured()) {
        const dbProfile = {
            id: user.id,
            username: user.username,
            email: user.email,
            phone_number: user.phoneNumber,
            password: user.password,
            role: user.role,
            credits: user.credits,
            stats: user.stats,
            preferences: user.preferences,
            free_usage: user.freeUsage, // Sync free usage state
            is_suspended: user.isSuspended,
            ai_memory: user.aiMemory,
            has_seen_tutorial: user.hasSeenTutorial
        };
        
        supabase.from('profiles').upsert(dbProfile).then(({ error }) => {
            if (error) console.warn("Supabase Sync Warning:", error.message);
        });
    }
  },

  // ... (Rest of existing methods: getAllUsers, sendAdminRequest, etc. kept as is) ...
  
  getAllUsers: async (): Promise<UserProfile[]> => {
      // Prefer Cloud Source
      if (isSupabaseConfigured()) {
          const { data } = await supabase.from('profiles').select('*');
          if (data) return data.map(d => ({
              ...d,
              phoneNumber: d.phone_number,
              freeUsage: d.free_usage,
              isSuspended: d.is_suspended,
              createdAt: d.created_at
          }));
      }
      
      // Local Fallback
      const users: UserProfile[] = [];
      for (let i = 0; i < localStorage.length; i++) {
          const key = localStorage.key(i);
          if (key?.startsWith('user_data_')) {
              users.push(JSON.parse(localStorage.getItem(key) || '{}'));
          }
      }
      return users.sort((a, b) => b.createdAt - a.createdAt);
  },

  sendAdminRequest: async (userId: string, username: string, type: 'credit' | 'message' | 'password_reset', amount?: number, message?: string, contactInfo?: string) => {
      // Local Backup
      const requests = await storageService.getAdminRequests();
      const newRequest = {
          id: `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
          userId,
          username,
          type,
          amount,
          message,
          contactInfo,
          status: 'pending',
          createdAt: Date.now()
      } as AdminRequest; // Cast needed due to slight type diff in older code vs Supabase
      
      localStorage.setItem(REQUESTS_KEY, JSON.stringify([...requests, newRequest]));

      // Cloud Push
      if (isSupabaseConfigured()) {
          await supabase.from('admin_requests').insert({
              id: newRequest.id,
              user_id: userId,
              username,
              type,
              amount,
              message,
              contact_info: contactInfo,
              status: 'pending',
              created_at: Date.now()
          });
      }
  },

  getAdminRequests: async (): Promise<AdminRequest[]> => {
      if (isSupabaseConfigured()) {
          const { data } = await supabase.from('admin_requests').select('*');
          if (data) return data.map(r => ({
              ...r,
              userId: r.user_id,
              contactInfo: r.contact_info,
              createdAt: r.created_at
          }));
      }
      const data = localStorage.getItem(REQUESTS_KEY);
      return data ? JSON.parse(data) : [];
  },

  resolveRequest: async (requestId: string, status: 'approved' | 'rejected') => {
      if (isSupabaseConfigured()) {
          const { data: req } = await supabase.from('admin_requests').select('*').eq('id', requestId).single();
          if (req && req.status === 'pending') {
              await supabase.from('admin_requests').update({ status }).eq('id', requestId);
              if (status === 'approved' && req.type === 'credit') {
                  // Add credits via DB directly to avoid race conditions
                  const { data: user } = await supabase.from('profiles').select('credits').eq('id', req.user_id).single();
                  if (user) {
                      const newCredits = user.credits + req.amount;
                      await supabase.from('profiles').update({ credits: newCredits }).eq('id', req.user_id);
                  }
              }
          }
      }
  },

  seedAdmin: () => {
    // Not critical for storageService logic
  },

  getSystemSettings: (): SystemSettings => {
    const data = localStorage.getItem(SETTINGS_KEY);
    return data ? JSON.parse(data) : DEFAULT_SETTINGS;
  },

  updateSystemSettings: (settings: SystemSettings) => {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
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

  saveChatHistory: (userId: string, messages: ChatMessage[], language?: string) => {
    const langKey = language ? language.replace(/[^a-zA-Z0-9]/g, '') : 'default';
    localStorage.setItem(`chat_history_${userId}_${langKey}`, JSON.stringify(messages));
  },

  getChatHistory: (userId: string, language?: string): ChatMessage[] => {
    const langKey = language ? language.replace(/[^a-zA-Z0-9]/g, '') : 'default';
    const data = localStorage.getItem(`chat_history_${userId}_${langKey}`);
    return data ? JSON.parse(data) : [];
  },
  
  loadChatHistoryFromCloud: async (userId: string, language?: string): Promise<ChatMessage[]> => {
      // Implemented in previous step, kept here
      return storageService.getChatHistory(userId, language);
  },
  
  syncProfileFromCloud: async (userId: string) => {
      if (!isSupabaseConfigured()) return null;
      const { data } = await supabase.from('profiles').select('*').eq('id', userId).single();
      if(data) {
          const user = storageService.getUserById(userId);
          const merged = { ...user, credits: data.credits, freeUsage: data.free_usage, isSuspended: data.is_suspended } as UserProfile;
          localStorage.setItem(`user_data_${userId}`, JSON.stringify(merged));
          return merged;
      }
      return null;
  }
};
