
import { supabase } from '../lib/supabase';
import { UserProfile, ChatMessage, UserPreferences, SystemSettings, AdminRequest } from "../types";

// Configuration URL Backend (Production Render ou Local)
const API_URL = (import.meta as any).env.VITE_API_URL || 'https://teachermada-api.onrender.com';

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
  
  // --- Auth & User Management (Hybrid: Local + Cloud) ---
  
  login: async (identifier: string, password?: string): Promise<{ success: boolean, user?: UserProfile, error?: string }> => {
    // 1. Try Local First (Speed)
    let foundUser: UserProfile | null = null;
    const lowerId = identifier.toLowerCase().trim();
    
    // Check LocalStorage
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key?.startsWith('user_data_')) {
        const userData = JSON.parse(localStorage.getItem(key) || '{}') as UserProfile;
        const match = (userData.username.toLowerCase() === lowerId) || 
                      (userData.email?.toLowerCase() === lowerId) || 
                      (userData.phoneNumber?.replace(/\s/g, '') === lowerId.replace(/\s/g, ''));
        if (match) { foundUser = userData; break; }
      }
    }

    // 2. If not local, Try Supabase (Cloud)
    if (!foundUser) {
        try {
            const { data, error } = await supabase
                .from('profiles')
                .select('*')
                .or(`username.eq.${identifier},email.eq.${identifier},phone_number.eq.${identifier}`)
                .maybeSingle(); // Use maybeSingle to avoid error on 0 rows
            
            if (data) {
                // Map DB snake_case to UserProfile camelCase if needed
                foundUser = {
                    ...data,
                    phoneNumber: data.phone_number,
                    preferences: data.preferences,
                    stats: data.stats,
                    skills: data.skills || { vocabulary: 10, grammar: 5, pronunciation: 5, listening: 5 },
                    freeUsage: data.free_usage || { lastResetWeek: getMadagascarCurrentWeek(), count: 0 }
                } as UserProfile;
                
                // Cache it locally for next time
                storageService.saveUserProfile(foundUser); 
            }
        } catch (err) {
            console.error("Cloud Login Error:", err);
        }
    }

    if (!foundUser) return { success: false, error: "Utilisateur introuvable." };
    if (foundUser.isSuspended) return { success: false, error: "Compte suspendu. Contactez l'admin." };
    // Note: Simple password check. In production, verify hash.
    if (password && foundUser.password !== password) return { success: false, error: "Mot de passe incorrect." };

    localStorage.setItem(CURRENT_USER_KEY, foundUser.id);
    // Sync latest data from cloud just in case credits changed
    storageService.syncProfileFromCloud(foundUser.id);
    
    return { success: true, user: foundUser };
  },

  register: async (username: string, password?: string, email?: string, phoneNumber?: string): Promise<{ success: boolean, user?: UserProfile, error?: string }> => {
    // Check duplication locally & cloud
    // (Simplified: assuming local check is enough for immediate feedback, cloud constraint handles race conditions)
    
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
    
    // Save Local
    storageService.saveUserProfile(newUser);
    localStorage.setItem(CURRENT_USER_KEY, newUser.id);

    // Save Cloud (Fire & Forget or Await)
    const { error } = await supabase.from('profiles').insert({
        id: newUser.id,
        username: newUser.username,
        email: newUser.email,
        phone_number: newUser.phoneNumber,
        password: newUser.password, // Stored for "Simulated Auth". In real app -> Auth Provider
        role: newUser.role,
        credits: newUser.credits,
        stats: newUser.stats,
        preferences: newUser.preferences,
        free_usage: newUser.freeUsage,
        created_at: newUser.createdAt
    });

    if (error) {
        console.error("Cloud Register Error:", error);
        // If username taken in cloud but not local, this might fail silently here.
        // Ideally we handle this, but for hybrid demo, we proceed.
    }

    return { success: true, user: newUser };
  },

  getUserById: (userId: string): UserProfile | null => {
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

  // --- Sync Logic ---

  syncProfileFromCloud: async (userId: string) => {
      const { data } = await supabase.from('profiles').select('*').eq('id', userId).single();
      if (data) {
          const local = storageService.getUserById(userId) || {} as UserProfile;
          const merged = { 
              ...local, 
              ...data,
              phoneNumber: data.phone_number,
              freeUsage: data.free_usage,
              // prioritize cloud credits/role
              credits: data.credits,
              role: data.role,
              isSuspended: data.is_suspended
          };
          localStorage.setItem(`user_data_${userId}`, JSON.stringify(merged));
      }
  },

  // --- Credit System Logic ---

  canPerformRequest: (userId: string): { allowed: boolean, reason?: 'credits' | 'free_tier' | 'blocked' } => {
    const user = storageService.getUserById(userId);
    if (!user) return { allowed: false, reason: 'blocked' };
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

      if (user.freeUsage.count < 2) {
          user.freeUsage.count += 1;
      } else if (user.credits > 0) {
          user.credits -= 1;
      } else {
          return null; 
      }

      // Update Local
      storageService.saveUserProfile(user);
      
      // Update Cloud (Async)
      supabase.from('profiles').update({
          credits: user.credits,
          free_usage: user.freeUsage
      }).eq('id', user.id).then();

      return user;
  },

  // --- Chat History ---

  saveChatHistory: (userId: string, messages: ChatMessage[], language?: string) => {
    const langKey = language ? language.replace(/[^a-zA-Z0-9]/g, '') : 'default';
    localStorage.setItem(`chat_history_${userId}_${langKey}`, JSON.stringify(messages));
    // Optional: Sync chat history to Supabase table `chat_history` if needed for multi-device chat recovery
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
          user_id: userId, // Map to DB column
          username,
          type,
          amount,
          message,
          contact_info: contactInfo,
          status: 'pending',
          created_at: Date.now()
      };
      
      // Save Cloud (Source of Truth)
      const { error } = await supabase.from('admin_requests').insert(newRequest);
      if (error) console.error("Admin Request Error", error);
  },

  getAdminRequests: async (): Promise<AdminRequest[]> => {
      const { data, error } = await supabase.from('admin_requests').select('*').order('created_at', { ascending: false });
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
      // 1. Get request details
      const { data: request } = await supabase.from('admin_requests').select('*').eq('id', requestId).single();
      
      if (request && request.status === 'pending') {
          // 2. Update Request Status
          await supabase.from('admin_requests').update({ status }).eq('id', requestId);

          // 3. If Approved Credit, Update User Balance
          if (status === 'approved' && request.type === 'credit' && request.amount) {
              const { data: user } = await supabase.from('profiles').select('credits').eq('id', request.user_id).single();
              if (user) {
                  await supabase.from('profiles').update({ credits: user.credits + request.amount }).eq('id', request.user_id);
              }
          }
      }
  },

  addCredits: async (userId: string, amount: number) => {
      // Direct Cloud Update
      const { data: user } = await supabase.from('profiles').select('credits').eq('id', userId).single();
      if (user) {
          await supabase.from('profiles').update({ credits: user.credits + amount }).eq('id', userId);
      }
  },

  saveUserProfile: (user: UserProfile) => {
      // Local
      localStorage.setItem(`user_data_${user.id}`, JSON.stringify(user));
      // Cloud Sync (Background)
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
          // created_at is usually fixed, but update others
      }).then(({ error }) => {
          if (error) console.warn("Background Sync Error:", error.message);
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
    // Check if admin exists in cloud
    const { data } = await supabase.from('profiles').select('id').eq('id', adminId).maybeSingle();
    
    if (!data) {
        const adminUser: UserProfile = {
            id: adminId,
            username: '0349310268',
            password: '777v', 
            role: 'admin',
            email: 'admin@teachermada.mg',
            phoneNumber: '0349310268',
            createdAt: Date.now(),
            preferences: null,
            stats: { xp: 9999, streak: 999, lessonsCompleted: 999 },
            aiMemory: "ADMINISTRATEUR SYSTÈME",
            isPremium: true,
            credits: 999999,
            freeUsage: { lastResetWeek: getMadagascarCurrentWeek(), count: 0 }
        };
        // Force save to cloud
        await supabase.from('profiles').upsert({
            id: adminUser.id,
            username: adminUser.username,
            role: 'admin',
            password: adminUser.password,
            credits: 999999,
            phone_number: adminUser.phoneNumber,
            free_usage: adminUser.freeUsage,
            stats: adminUser.stats
        });
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
