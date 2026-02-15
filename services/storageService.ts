import { supabase } from "../lib/supabase";
import { UserProfile, UserPreferences, LearningSession, AdminRequest, SystemSettings, CouponCode } from "../types";

const LOCAL_STORAGE_KEY = 'teachermada_user_data';
const SESSION_PREFIX = 'tm_v3_session_';
const SETTINGS_KEY = 'tm_system_settings';
const REQUESTS_KEY = 'tm_requests_data';

// --- HELPER: MAP DB TO FRONTEND TYPE ---
const mapProfile = (data: any): UserProfile => ({
    id: data.id,
    username: data.username || "Utilisateur",
    email: data.email,
    phoneNumber: data.phone_number,
    role: data.role || 'user',
    credits: data.credits ?? 0,
    xp: data.xp ?? 0,
    stats: {
        lessonsCompleted: data.lessons_completed || 0,
        exercisesCompleted: data.exercises_completed || 0,
        dialoguesCompleted: data.dialogues_completed || 0
    },
    preferences: data.preferences,
    vocabulary: data.vocabulary || [],
    freeUsage: data.free_usage || { count: 0, lastResetWeek: new Date().toISOString() },
    aiMemory: "Étudiant motivé",
    createdAt: new Date(data.created_at).getTime(),
    isSuspended: data.is_suspended
});

// --- HELPER: FORMAT LOGIN ---
const formatLoginEmail = (input: string) => {
    const trimmed = input.trim();
    if (trimmed.includes('@')) return trimmed;
    const cleanId = trimmed.replace(/[^a-zA-Z0-9.\-_+]/g, '');
    return `${cleanId}@teachermada.com`;
};

// --- EVENT BUS ---
type UserUpdateListener = (user: UserProfile) => void;
let userListeners: UserUpdateListener[] = [];
const notifyListeners = (user: UserProfile) => {
    userListeners.forEach(listener => listener(user));
};

export const storageService = {
  // --- SYNC & CACHE ---
  subscribeToUserUpdates: (callback: UserUpdateListener) => {
      userListeners.push(callback);
      return () => { userListeners = userListeners.filter(cb => cb !== callback); };
  },

  getLocalUser: (): UserProfile | null => {
    const data = localStorage.getItem(LOCAL_STORAGE_KEY);
    return data ? JSON.parse(data) : null;
  },

  getCurrentUser: (): UserProfile | null => {
    return storageService.getLocalUser();
  },

  getUserById: async (id: string): Promise<UserProfile | null> => {
      const { data, error } = await supabase.from('profiles').select('*').eq('id', id).single();
      if (data) return mapProfile(data);
      return null;
  },

  saveLocalUser: (user: UserProfile) => {
    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(user));
    notifyListeners(user);
  },

  // --- AUTH (SUPABASE + SYNC) ---
  
  login: async (id: string, pass: string): Promise<{success: boolean, user?: UserProfile, error?: string}> => {
    try {
        const email = formatLoginEmail(id);
        const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
            email: email, 
            password: pass
        });

        if (authError) return { success: false, error: "Identifiants incorrects." };

        if (authData.user) {
            // FIX: Force fetch profile from DB immediately after auth
            let user = await storageService.getUserById(authData.user.id);
            
            // RETRY LOGIC (Race Condition Handler)
            if (!user) {
                console.warn("Profil introuvable, nouvelle tentative...");
                await new Promise(r => setTimeout(r, 1000));
                user = await storageService.getUserById(authData.user.id);
            }

            // AUTO-HEALING (Create if missing)
            if (!user) {
                console.warn("Auto-creation du profil manquant...");
                const newProfile = {
                    id: authData.user.id,
                    username: id.includes('@') ? id.split('@')[0] : id,
                    email: email,
                    role: 'user',
                    credits: 10,
                    stats: { lessons_completed: 0, exercises_completed: 0, dialogues_completed: 0 }
                };
                const { error: insErr } = await supabase.from('profiles').insert([newProfile]);
                if (!insErr) user = mapProfile(newProfile);
                else return { success: false, error: "Impossible de récupérer ou créer le profil." };
            }

            if (user?.isSuspended) return { success: false, error: "Compte suspendu." };
            
            // IMPORTANT: Cache locally for the app to use
            storageService.saveLocalUser(user);
            return { success: true, user };
        }
        return { success: false, error: "Erreur inconnue." };
    } catch (e: any) {
        return { success: false, error: e.message };
    }
  },

  register: async (username: string, pass: string, email?: string, phone?: string): Promise<{success: boolean, user?: UserProfile, error?: string}> => {
    const finalEmail = email || formatLoginEmail(username);
    
    try {
        const { data: authData, error: authError } = await supabase.auth.signUp({
            email: finalEmail,
            password: pass,
            options: { data: { username, phone_number: phone } }
        });

        if (authError) return { success: false, error: authError.message };
        if (!authData.user) return { success: false, error: "Erreur création compte." };

        // Explicit Profile Creation
        const profilePayload = {
            id: authData.user.id,
            username,
            email: finalEmail,
            phone_number: phone || "",
            role: 'user',
            credits: 10,
            stats: { lessons_completed: 0, exercises_completed: 0, dialogues_completed: 0 }
        };

        const { error: dbError } = await supabase.from('profiles').insert([profilePayload]);
        
        // Handle race condition if trigger already created it
        if (dbError) {
            const existing = await storageService.getUserById(authData.user.id);
            if (existing) {
                storageService.saveLocalUser(existing);
                return { success: true, user: existing };
            }
            return { success: false, error: "Erreur DB: " + dbError.message };
        }

        const user = mapProfile(profilePayload);
        storageService.saveLocalUser(user);
        return { success: true, user };

    } catch (e: any) {
        return { success: false, error: e.message };
    }
  },

  logout: async () => {
      await supabase.auth.signOut();
      localStorage.removeItem(LOCAL_STORAGE_KEY);
      localStorage.removeItem('tm_v3_current_user_id'); 
  },

  // --- DATA MANAGEMENT ---

  saveUserProfile: async (user: UserProfile) => {
      // Optimistic update
      storageService.saveLocalUser(user);
      
      // Async DB update
      const updates = {
          username: user.username,
          credits: user.credits,
          xp: user.xp,
          lessons_completed: user.stats.lessonsCompleted,
          exercises_completed: user.stats.exercisesCompleted,
          dialogues_completed: user.stats.dialoguesCompleted,
          vocabulary: user.vocabulary,
          preferences: user.preferences,
          free_usage: user.freeUsage,
          is_suspended: user.isSuspended
      };
      await supabase.from('profiles').update(updates).eq('id', user.id);
  },

  getAllUsers: async (): Promise<UserProfile[]> => {
      const { data } = await supabase.from('profiles').select('*').order('created_at', { ascending: false });
      return data ? data.map(mapProfile) : [];
  },

  // --- CREDITS & FEATURES ---

  canUseSupportAgent: (): boolean => {
      const today = new Date().toDateString();
      const raw = localStorage.getItem('tm_support_quota');
      let data = raw ? JSON.parse(raw) : { date: today, count: 0 };
      if (data.date !== today) data = { date: today, count: 0 };
      return data.count < 100;
  },

  incrementSupportUsage: () => {
      const today = new Date().toDateString();
      const raw = localStorage.getItem('tm_support_quota');
      let data = raw ? JSON.parse(raw) : { date: today, count: 0 };
      if (data.date !== today) data = { date: today, count: 0 };
      data.count++;
      localStorage.setItem('tm_support_quota', JSON.stringify(data));
  },

  canRequest: async (userId: string, minCredits: number = 1): Promise<boolean> => {
      // Check local cache first for speed, or sync
      const user = storageService.getLocalUser(); 
      if (!user) return false;
      if (user.role === 'admin') return true;
      return user.credits >= minCredits;
  },

  consumeCredit: async (userId: string) => {
      return storageService.deductCredits(userId, 1);
  },

  deductCredits: async (userId: string, amount: number): Promise<boolean> => {
      const user = storageService.getLocalUser();
      if (!user || user.credits < amount) return false;
      if (user.role === 'admin') return true;

      user.credits -= amount;
      storageService.saveLocalUser(user); // Optimistic Update UI
      
      await supabase.from('profiles').update({ credits: user.credits }).eq('id', userId);
      return true;
  },

  addCredits: async (userId: string, amount: number): Promise<boolean> => {
      const { data: user } = await supabase.from('profiles').select('credits').eq('id', userId).single();
      if (!user) return false;
      
      const newCredits = (user.credits || 0) + amount;
      await supabase.from('profiles').update({ credits: newCredits }).eq('id', userId);
      return true;
  },

  // --- OTHER ---
  getOrCreateSession: (userId: string, prefs: UserPreferences): LearningSession => {
    const key = `${SESSION_PREFIX}${userId}_${prefs.targetLanguage.split(' ')[0]}_${prefs.level}`;
    const data = localStorage.getItem(key);
    if (data) return JSON.parse(data);
    const newSession: LearningSession = { id: key, messages: [], progress: 0, score: 0 };
    localStorage.setItem(key, JSON.stringify(newSession));
    return newSession;
  },

  saveSession: (session: LearningSession) => {
    localStorage.setItem(session.id, JSON.stringify(session));
  },

  getChatHistory: (lang: string): any[] => [],

  // --- ADMIN ---
  getAdminRequests: async (): Promise<AdminRequest[]> => {
      const { data } = await supabase.from('admin_requests').select('*').order('created_at', { ascending: false });
      return data ? data.map(d => ({
          id: d.id,
          userId: d.user_id,
          username: d.username,
          type: d.type,
          amount: d.amount,
          message: d.message,
          status: d.status,
          createdAt: d.created_at ? new Date(d.created_at).getTime() : Date.now()
      })) : [];
  },

  sendAdminRequest: async (userId: string, username: string, type: string, amount?: number, message?: string, contact?: string) => {
      const fullMessage = contact ? `${message} [Contact: ${contact}]` : message;
      await supabase.from('admin_requests').insert([{
          user_id: userId, username, type, amount, message: fullMessage, status: 'pending'
      }]);
  },

  resolveRequest: async (reqId: string, status: string) => {
      if (status === 'approved') {
          const { data: req } = await supabase.from('admin_requests').select('*').eq('id', reqId).single();
          if (req && req.type === 'credit' && req.amount) {
              await storageService.addCredits(req.user_id, req.amount);
          }
      }
      await supabase.from('admin_requests').update({ status }).eq('id', reqId);
  },

  cleanupOldRequests: async () => {},

  // --- SETTINGS ---
  loadSystemSettings: async (): Promise<SystemSettings> => {
      const { data } = await supabase.from('system_settings').select('*').single();
      return data ? {
          apiKeys: data.api_keys || [],
          activeModel: 'gemini-3-flash-preview',
          creditPrice: data.credit_price || 50,
          customLanguages: data.custom_languages || [],
          validTransactionRefs: data.valid_transaction_refs || [],
          adminContact: data.admin_contact || { telma: "", airtel: "", orange: "" }
      } : storageService.getSystemSettings();
  },

  getSystemSettings: (): SystemSettings => {
      const local = localStorage.getItem(SETTINGS_KEY);
      return local ? JSON.parse(local) : { apiKeys: [], activeModel: '', customLanguages: [], validTransactionRefs: [], adminContact: { telma: "", airtel: "", orange: "" } };
  },

  updateSystemSettings: async (settings: SystemSettings) => {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
      await supabase.from('system_settings').upsert({ id: 1, api_keys: settings.apiKeys, valid_transaction_refs: settings.validTransactionRefs });
      return true;
  },

  // Helpers needed for UI
  canPerformRequest: async (userId: string) => ({ allowed: await storageService.canRequest(userId) }),
  
  deductCreditOrUsage: async (userId: string) => {
      const success = await storageService.deductCredits(userId, 1);
      return success ? storageService.getLocalUser() : null;
  },

  exportData: (user: UserProfile) => {},
  importData: async (file: File, id: string) => false,
  
  redeemCode: async (userId: string, code: string): Promise<{ success: true; amount: number } | { success: false; message: string }> => {
      try {
          const { data: settingsData, error } = await supabase.from('system_settings').select('id, valid_transaction_refs').single();
          
          if (error || !settingsData) return { success: false, message: "Système indisponible." };

          const validRefs = (settingsData.valid_transaction_refs || []) as CouponCode[];
          const normalizedCode = code.trim().toUpperCase();
          const couponIndex = validRefs.findIndex(c => c.code === normalizedCode);

          if (couponIndex === -1) {
              return { success: false, message: "Code invalide." };
          }

          const coupon = validRefs[couponIndex];

          // Add credits
          const creditAdded = await storageService.addCredits(userId, coupon.amount);
          if (!creditAdded) return { success: false, message: "Erreur compte utilisateur." };

          // Remove used coupon (or mark as used if we wanted history, but for now simple removal)
          const newRefs = validRefs.filter((_, i) => i !== couponIndex);
          await supabase.from('system_settings').update({ valid_transaction_refs: newRefs }).eq('id', settingsData.id);

          return { success: true, amount: coupon.amount };
      } catch (e) {
          console.error(e);
          return { success: false, message: "Erreur technique." };
      }
  }
};
