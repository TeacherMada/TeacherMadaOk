
import { supabase } from '../lib/supabase';
import { UserProfile, ChatMessage, UserPreferences, SystemSettings, AdminRequest } from "../types";

const CURRENT_USER_KEY = 'smart_teacher_current_user_id';
const SETTINGS_KEY = 'smart_teacher_system_settings';

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

// --- Helper: Timezone Management ---
const getMadagascarCurrentWeek = (): string => {
  const now = new Date();
  const madaTime = new Date(now.toLocaleString("en-US", { timeZone: "Indian/Antananarivo" }));
  const day = madaTime.getDay() || 7; 
  if (day !== 1) madaTime.setHours(-24 * (day - 1));
  madaTime.setHours(0, 0, 0, 0);
  return madaTime.toISOString().split('T')[0];
};

export const storageService = {
  
  // --- Auth & User Management (CLOUD FIRST) ---
  
  login: async (identifier: string, password?: string): Promise<{ success: boolean, user?: UserProfile, error?: string }> => {
    try {
        // Validation Basique
        if (!identifier) return { success: false, error: "Identifiant requis." };

        // 1. Check Cloud (Supabase 'profiles' table)
        const { data, error } = await supabase
            .from('profiles')
            .select('*')
            .or(`username.eq.${identifier},email.eq.${identifier},phone_number.eq.${identifier}`)
            .maybeSingle();

        if (error) {
            console.error("Supabase Login Error:", error);
            if (error.code === '42P01') return { success: false, error: "Erreur système: Tables manquantes (SQL non exécuté)." };
            if (error.message?.includes('FetchError')) return { success: false, error: "Impossible de joindre le serveur. Vérifiez votre connexion." };
            return { success: false, error: "Erreur de connexion serveur." };
        }

        if (!data) {
            return { success: false, error: "Utilisateur introuvable." };
        }

        // 2. Verify Password (Simple check for Hybrid mode)
        if (password && data.password !== password) {
            return { success: false, error: "Mot de passe incorrect." };
        }

        if (data.is_suspended) {
            return { success: false, error: "Compte suspendu. Contactez l'admin." };
        }

        // 3. Map DB snake_case to UserProfile camelCase
        const user: UserProfile = {
            id: data.id,
            username: data.username,
            email: data.email,
            phoneNumber: data.phone_number,
            password: data.password,
            role: data.role,
            credits: data.credits,
            stats: data.stats || { xp: 0, streak: 1, lessonsCompleted: 0 },
            preferences: data.preferences,
            skills: data.skills || { vocabulary: 10, grammar: 5, pronunciation: 5, listening: 5 },
            aiMemory: data.ai_memory || "Nouvel utilisateur.",
            isPremium: false,
            hasSeenTutorial: data.has_seen_tutorial || false,
            createdAt: data.created_at,
            freeUsage: data.free_usage || { lastResetWeek: getMadagascarCurrentWeek(), count: 0 }
        };

        // 4. Cache Locally for Performance
        localStorage.setItem(CURRENT_USER_KEY, user.id);
        localStorage.setItem(`user_data_${user.id}`, JSON.stringify(user));

        return { success: true, user };

    } catch (err) {
        console.error("Login Exception:", err);
        return { success: false, error: "Erreur réseau inconnue." };
    }
  },

  register: async (username: string, password?: string, email?: string, phoneNumber?: string): Promise<{ success: boolean, user?: UserProfile, error?: string }> => {
    try {
        // 1. Check if user exists in Cloud
        const { data: existing, error: checkError } = await supabase
            .from('profiles')
            .select('id')
            .eq('username', username)
            .maybeSingle();

        if (checkError) {
             console.error("Registration Check Error:", checkError);
             if (checkError.code === '42P01') return { success: false, error: "Erreur Config: Table 'profiles' inexistante." };
             return { success: false, error: "Erreur de vérification serveur." };
        }

        if (existing) {
            return { success: false, error: "Ce nom d'utilisateur est déjà pris." };
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
            stats: { xp: 0, streak: 1, lessonsCompleted: 0 },
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

        // 2. Insert into Cloud
        const { error } = await supabase.from('profiles').insert({
            id: newUser.id,
            username: newUser.username,
            email: newUser.email,
            phone_number: newUser.phoneNumber,
            password: newUser.password,
            role: newUser.role,
            credits: newUser.credits,
            stats: newUser.stats,
            preferences: newUser.preferences,
            free_usage: newUser.freeUsage,
            created_at: newUser.createdAt
        });

        if (error) {
            console.error("Register Insert Error:", error);
            return { success: false, error: "Impossible de créer le compte. Réessayez." };
        }

        // 3. Cache Locally
        localStorage.setItem(CURRENT_USER_KEY, newUser.id);
        localStorage.setItem(`user_data_${newUser.id}`, JSON.stringify(newUser));

        return { success: true, user: newUser };

    } catch (err) {
        console.error("Register Exception:", err);
        return { success: false, error: "Erreur réseau." };
    }
  },

  getUserById: (userId: string): UserProfile | null => {
      // Fast path: Local Storage
      const data = localStorage.getItem(`user_data_${userId}`);
      return data ? JSON.parse(data) : null;
  },

  logout: () => {
    localStorage.removeItem(CURRENT_USER_KEY);
  },

  getCurrentUser: (): UserProfile | null => {
    const id = localStorage.getItem(CURRENT_USER_KEY);
    if (!id) return null;
    return storageService.getUserById(id);
  },

  // --- Sync Logic (Background) ---

  syncProfileFromCloud: async (userId: string) => {
      // Updates local cache with latest Cloud data (credits, role)
      const { data } = await supabase.from('profiles').select('*').eq('id', userId).single();
      if (data) {
          const local = storageService.getUserById(userId) || {} as UserProfile;
          const merged: UserProfile = { 
              ...local, 
              // Overwrite critical fields from Cloud
              credits: data.credits,
              role: data.role,
              isSuspended: data.is_suspended,
              freeUsage: data.free_usage,
              // Keep other fields synced
              username: data.username,
              email: data.email,
              phoneNumber: data.phone_number,
              stats: data.stats
          };
          localStorage.setItem(`user_data_${userId}`, JSON.stringify(merged));
          return merged;
      }
      return null;
  },

  // --- Credit System Logic ---

  canPerformRequest: (userId: string): { allowed: boolean, reason?: 'credits' | 'free_tier' | 'blocked' } => {
    const user = storageService.getUserById(userId);
    if (!user) return { allowed: false, reason: 'blocked' };
    
    // Always trust local cache for UI speed, but sync happens in background
    if (user.role === 'admin') return { allowed: true, reason: 'credits' }; 

    if (user.freeUsage.count < 2) {
        return { allowed: true, reason: 'free_tier' };
    }

    if (user.credits > 0) {
        return { allowed: true, reason: 'credits' };
    }

    return { allowed: false, reason: 'blocked' };
  },

  deductCreditOrUsage: (userId: string): UserProfile | null => {
      const user = storageService.getUserById(userId);
      if (!user) return null;
      if (user.role === 'admin') return user;

      // Logic Update
      if (user.freeUsage.count < 2) {
          user.freeUsage.count += 1;
      } else if (user.credits > 0) {
          user.credits -= 1;
      } else {
          return null; 
      }

      // 1. Update Local (Optimistic UI)
      storageService.saveUserProfile(user);
      
      // 2. Push to Cloud (Async - Fire & Forget)
      supabase.from('profiles').update({
          credits: user.credits,
          free_usage: user.freeUsage,
          stats: user.stats // Sync stats too (XP etc)
      }).eq('id', user.id).then(({ error }) => {
          if (error) console.error("Credit Deduct Sync Failed", error);
      });

      return user;
  },

  // --- Chat History ---

  saveChatHistory: (userId: string, messages: ChatMessage[], language?: string) => {
    const langKey = language ? language.replace(/[^a-zA-Z0-9]/g, '') : 'default';
    localStorage.setItem(`chat_history_${userId}_${langKey}`, JSON.stringify(messages));
    
    // Optional: Sync to Cloud periodically or on important events could be added here
  },

  getChatHistory: (userId: string, language?: string): ChatMessage[] => {
    const langKey = language ? language.replace(/[^a-zA-Z0-9]/g, '') : 'default';
    const data = localStorage.getItem(`chat_history_${userId}_${langKey}`);
    if (!data && !language) {
       return JSON.parse(localStorage.getItem(`chat_history_${userId}`) || '[]');
    }
    return data ? JSON.parse(data) : [];
  },

  // --- Admin Functions (CLOUD CRITICAL) ---

  sendAdminRequest: async (userId: string, username: string, type: 'credit' | 'message' | 'password_reset', amount?: number, message?: string, contactInfo?: string) => {
      const newRequest = {
          id: `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
          user_id: userId,
          username,
          type,
          amount,
          message,
          contact_info: contactInfo,
          status: 'pending',
          created_at: Date.now()
      };
      
      // Save directly to Cloud
      await supabase.from('admin_requests').insert(newRequest);
  },

  getAdminRequests: async (): Promise<AdminRequest[]> => {
      const { data } = await supabase.from('admin_requests').select('*').order('created_at', { ascending: false });
      if (data) {
          return data.map(r => ({
              ...r,
              userId: r.user_id,
              contactInfo: r.contact_info,
              createdAt: r.created_at
          }));
      }
      return [];
  },

  getAllUsers: async (): Promise<UserProfile[]> => {
      const { data } = await supabase.from('profiles').select('*').order('created_at', { ascending: false });
      if (data) {
          return data.map(u => ({
              ...u,
              phoneNumber: u.phone_number,
              freeUsage: u.free_usage,
              isSuspended: u.is_suspended,
              createdAt: u.created_at
          }));
      }
      return [];
  },

  resolveRequest: async (requestId: string, status: 'approved' | 'rejected') => {
      const { data: request } = await supabase.from('admin_requests').select('*').eq('id', requestId).single();
      
      if (request && request.status === 'pending') {
          // 1. Update Request
          await supabase.from('admin_requests').update({ status }).eq('id', requestId);

          // 2. If Credit Approved, Add Credits to Profile
          if (status === 'approved' && request.type === 'credit' && request.amount) {
              const { data: user } = await supabase.from('profiles').select('credits').eq('id', request.user_id).single();
              if (user) {
                  await supabase.from('profiles').update({ credits: user.credits + request.amount }).eq('id', request.user_id);
              }
          }
      }
  },

  addCredits: async (userId: string, amount: number) => {
      const { data: user } = await supabase.from('profiles').select('credits').eq('id', userId).single();
      if (user) {
          await supabase.from('profiles').update({ credits: user.credits + amount }).eq('id', userId);
      }
  },

  saveUserProfile: (user: UserProfile) => {
      // Local
      localStorage.setItem(`user_data_${user.id}`, JSON.stringify(user));
      
      // Cloud Sync (Debounce recommended in production, here simple async)
      supabase.from('profiles').upsert({
          id: user.id,
          username: user.username,
          email: user.email,
          phone_number: user.phoneNumber,
          password: user.password,
          role: user.role,
          credits: user.credits,
          stats: user.stats,
          preferences: user.preferences,
          free_usage: user.freeUsage,
          is_suspended: user.isSuspended,
          ai_memory: user.aiMemory,
          has_seen_tutorial: user.hasSeenTutorial
      }).then(({ error }) => {
          if (error) console.warn("Sync Profile Error:", error.message);
      });
  },

  updatePreferences: (uid: string, prefs: UserPreferences) => {
      const user = storageService.getUserById(uid);
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

  seedAdmin: async () => {
    const adminId = 'admin_0349310268';
    const { data } = await supabase.from('profiles').select('id').eq('id', adminId).maybeSingle();
    
    if (!data) {
        const adminUser = {
            id: adminId,
            username: '0349310268',
            password: '777v', 
            role: 'admin',
            email: 'admin@teachermada.mg',
            phone_number: '0349310268',
            created_at: Date.now(),
            stats: { xp: 9999, streak: 999, lessonsCompleted: 999 },
            credits: 999999,
            free_usage: { lastResetWeek: getMadagascarCurrentWeek(), count: 0 }
        };
        await supabase.from('profiles').upsert(adminUser);
    }
  },
  
  updateSystemSettings: (settings: SystemSettings) => {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  },
  
  getSystemSettings: (): SystemSettings => {
      const data = localStorage.getItem(SETTINGS_KEY);
      return data ? JSON.parse(data) : DEFAULT_SETTINGS;
  },
};
