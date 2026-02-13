
import { supabase } from "../lib/supabase";
import { UserProfile, UserPreferences, LearningSession, AdminRequest, SystemSettings, CouponCode } from "../types";

const SESSION_PREFIX = 'tm_v3_session_';
const SETTINGS_KEY = 'tm_system_settings';
const SUPPORT_QUOTA_KEY = 'tm_support_quota';

// --- EVENT BUS FOR REAL-TIME UPDATES ---
type UserUpdateListener = (user: UserProfile) => void;
let userListeners: UserUpdateListener[] = [];

const notifyListeners = (user: UserProfile) => {
    userListeners.forEach(listener => listener(user));
};

// Helper to map Supabase DB shape to UserProfile
const mapProfile = (data: any): UserProfile => ({
    id: data.id,
    username: data.username,
    email: data.email,
    phoneNumber: data.phone_number,
    role: data.role,
    credits: data.credits,
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

// Helper to handle Login strategy
const formatLoginEmail = (input: string) => {
    const trimmed = input.trim();
    if (trimmed.includes('@')) return trimmed;
    const cleanId = trimmed.replace(/[^a-zA-Z0-9.\-_+]/g, '');
    return `${cleanId}@teachermada.com`;
};

export const storageService = {
  // --- REAL-TIME SUBSCRIPTION ---
  subscribeToUserUpdates: (callback: UserUpdateListener) => {
      userListeners.push(callback);
      return () => {
          userListeners = userListeners.filter(cb => cb !== callback);
      };
  },

  // --- AUTH (Supabase) ---
  
  login: async (id: string, pass: string): Promise<{success: boolean, user?: UserProfile, error?: string}> => {
    try {
        const email = formatLoginEmail(id);
        const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
            email: email, 
            password: pass
        });

        if (authError) return { success: false, error: "Identifiants incorrects." };

        if (authData.user) {
            const user = await storageService.getUserById(authData.user.id);
            if (user?.isSuspended) return { success: false, error: "Compte suspendu par l'administrateur." };
            if (user) return { success: true, user };
            return { success: false, error: "Compte créé mais profil introuvable." };
        }
        return { success: false, error: "Erreur inconnue." };
    } catch (e: any) {
        return { success: false, error: e.message };
    }
  },

  register: async (username: string, password?: string, email?: string, phoneNumber?: string): Promise<{success: boolean, user?: UserProfile, error?: string}> => {
    if (!password) return { success: false, error: "Mot de passe requis." };
    if (!username) return { success: false, error: "Nom d'utilisateur requis." };

    let finalEmail = email?.trim() || "";
    if (!finalEmail) finalEmail = formatLoginEmail(username);

    try {
        const { data: authData, error: authError } = await supabase.auth.signUp({
            email: finalEmail,
            password: password,
            options: {
                data: {
                    username: username.trim(),
                    phone_number: phoneNumber?.trim() || ""
                }
            }
        });

        if (authError) {
            if (authError.message.includes("already registered")) {
                return { success: false, error: "Ce nom ou cet email est déjà pris." };
            }
            return { success: false, error: authError.message };
        }
        
        if (!authData.user) return { success: false, error: "Erreur de création." };

        await new Promise(r => setTimeout(r, 2000));

        const user = await storageService.getUserById(authData.user.id);
        if (user) return { success: true, user };
        return { success: false, error: "Compte créé. Veuillez vous connecter." };

    } catch (e: any) {
        return { success: false, error: e.message };
    }
  },

  logout: async () => {
      await supabase.auth.signOut();
      localStorage.removeItem('tm_v3_current_user_id'); 
  },

  getCurrentUser: async (): Promise<UserProfile | null> => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return null;
      return storageService.getUserById(user.id);
  },

  getUserById: async (id: string): Promise<UserProfile | null> => {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', id)
        .single();
      
      if (error || !data) return null;
      return mapProfile(data);
  },

  // --- DATA SYNC ---

  saveUserProfile: async (user: UserProfile) => {
      const updates = {
          username: user.username,
          credits: user.credits,
          lessons_completed: user.stats.lessonsCompleted,
          exercises_completed: user.stats.exercisesCompleted,
          dialogues_completed: user.stats.dialoguesCompleted,
          vocabulary: user.vocabulary,
          preferences: user.preferences,
          free_usage: user.freeUsage,
          is_suspended: user.isSuspended
      };

      const { error } = await supabase.from('profiles').update(updates).eq('id', user.id);
      if (error) {
          console.error("Save User Error:", error.message);
      } else {
          notifyListeners(user);
      }
  },

  getAllUsers: async (): Promise<UserProfile[]> => {
      const { data } = await supabase.from('profiles').select('*').order('created_at', { ascending: false });
      return data ? data.map(mapProfile) : [];
  },

  // --- LOGIC: CREDITS & USAGE ---

  // Checks support agent daily quota (100/day) - Local Storage based for simplicity and device limiting
  canUseSupportAgent: (): boolean => {
      const today = new Date().toDateString();
      const raw = localStorage.getItem(SUPPORT_QUOTA_KEY);
      let data = raw ? JSON.parse(raw) : { date: today, count: 0 };

      if (data.date !== today) {
          data = { date: today, count: 0 };
      }

      if (data.count < 100) {
          return true;
      }
      return false;
  },

  incrementSupportUsage: () => {
      const today = new Date().toDateString();
      const raw = localStorage.getItem(SUPPORT_QUOTA_KEY);
      let data = raw ? JSON.parse(raw) : { date: today, count: 0 };

      if (data.date !== today) {
          data = { date: today, count: 0 };
      }
      data.count++;
      localStorage.setItem(SUPPORT_QUOTA_KEY, JSON.stringify(data));
  },

  canRequest: async (userId: string): Promise<boolean> => {
      const user = await storageService.getUserById(userId);
      if (!user) return false;
      if (user.role === 'admin') return true;
      if (user.isSuspended) return false;
      
      // STRICT RULE: 1 Request = 1 Credit. No free main app usage if credits are 0.
      return user.credits > 0;
  },

  consumeCredit: async (userId: string): Promise<boolean> => {
      const user = await storageService.getUserById(userId);
      if (!user) return false;
      if (user.role === 'admin') return true;
      if (user.isSuspended) return false;

      // STRICT CHECK
      if (user.credits <= 0) return false;

      const newCredits = user.credits - 1;
      
      // Optimistic update
      const updatedUser = { ...user, credits: newCredits };
      notifyListeners(updatedUser);
      
      const { error } = await supabase.from('profiles').update({ credits: newCredits }).eq('id', userId);
      
      if (error) {
          // Rollback on error
          notifyListeners(user);
          return false;
      }
      return true;
  },

  addCredits: async (userId: string, amount: number): Promise<boolean> => {
      const { data: user, error: fetchError } = await supabase
          .from('profiles')
          .select('credits')
          .eq('id', userId)
          .single();

      if (fetchError || !user) return false;

      const newCredits = (user.credits || 0) + amount;
      const { error: updateError } = await supabase.from('profiles').update({ credits: newCredits }).eq('id', userId);
      
      if (updateError) return false;

      const updatedUser = await storageService.getUserById(userId);
      if (updatedUser) notifyListeners(updatedUser);

      return true;
  },

  redeemCode: async (userId: string, inputCode: string): Promise<{ success: boolean; amount?: number; message?: string }> => {
      try {
          const code = inputCode.trim().toUpperCase();
          const settings = await storageService.loadSystemSettings();
          const validRefs = settings.validTransactionRefs || [];
          
          const couponIndex = validRefs.findIndex(c => c.code.toUpperCase() === code);

          if (couponIndex !== -1) {
              const coupon = validRefs[couponIndex];
              const amountToAdd = Number(coupon.amount) || 0;

              const creditAdded = await storageService.addCredits(userId, amountToAdd);
              if (!creditAdded) return { success: false, message: "Erreur technique lors de l'ajout." };
              
              const newRefs = [...validRefs];
              newRefs.splice(couponIndex, 1);
              
              await storageService.updateSystemSettings({ ...settings, validTransactionRefs: newRefs });
              
              return { success: true, amount: amountToAdd };
          }

          return { success: false, message: "Code invalide ou déjà utilisé." };

      } catch (e: any) {
          return { success: false, message: "Erreur technique." };
      }
  },

  // --- SESSIONS ---
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

  getChatHistory: (lang: string): any[] => {
    return [];
  },

  // --- ADMIN REQUESTS ---
  getAdminRequests: async (): Promise<AdminRequest[]> => {
      try {
          const { data, error } = await supabase
              .from('admin_requests')
              .select('*')
              .order('created_at', { ascending: false });
          
          if (error) return [];

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
      } catch (e) {
          return [];
      }
  },

  cleanupOldRequests: async () => {
      try {
          const oneWeekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
          await supabase.from('admin_requests').delete().lt('created_at', oneWeekAgo);
      } catch (e) {}
  },

  sendAdminRequest: async (userId: string, username: string, type: 'credit' | 'password_reset' | 'message', amount?: number, message?: string, contact?: string): Promise<{ status: 'pending' | 'approved' }> => {
      const fullMessage = contact ? `${message} [Contact: ${contact}]` : message;
      const newReq = {
          user_id: userId,
          username,
          type,
          amount,
          message: fullMessage,
          status: 'pending'
      };
      await supabase.from('admin_requests').insert([newReq]);
      return { status: 'pending' };
  },

  resolveRequest: async (reqId: string, status: 'approved' | 'rejected') => {
      if (status === 'approved') {
          const { data: req } = await supabase.from('admin_requests').select('*').eq('id', reqId).single();
          if (req && req.type === 'credit' && req.amount) {
              await storageService.addCredits(req.user_id, req.amount);
          }
      }
      await supabase.from('admin_requests').update({ status }).eq('id', reqId);
  },

  // --- SETTINGS ---
  loadSystemSettings: async (): Promise<SystemSettings> => {
      try {
          const { data, error } = await supabase.from('system_settings').select('*').single();
          
          if (!error && data) {
              let normalizedCoupons: CouponCode[] = [];
              if (Array.isArray(data.valid_transaction_refs)) {
                  normalizedCoupons = data.valid_transaction_refs.map((r: any) => {
                      if (typeof r === 'string') {
                          try { return JSON.parse(r); } catch (e) { return { code: r, amount: 0, createdAt: new Date().toISOString() }; }
                      }
                      return r;
                  }).filter((c: any) => c && c.code);
              }

              const settings: SystemSettings = {
                  apiKeys: data.api_keys || [],
                  activeModel: data.active_model || 'gemini-3-flash-preview',
                  creditPrice: data.credit_price || 50,
                  customLanguages: data.custom_languages || [],
                  validTransactionRefs: normalizedCoupons,
                  adminContact: data.admin_contact || { telma: "0349310268", airtel: "0333878420", orange: "0326979017" }
              };
              localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
              return settings;
          }
      } catch (e) {}
      return storageService.getSystemSettings();
  },

  getSystemSettings: (): SystemSettings => {
      const local = localStorage.getItem(SETTINGS_KEY);
      if (local) return JSON.parse(local);
      return {
          apiKeys: [],
          activeModel: 'gemini-3-flash-preview',
          creditPrice: 50,
          customLanguages: [],
          validTransactionRefs: [],
          adminContact: { telma: "0349310268", airtel: "0333878420", orange: "0326979017" }
      };
  },

  updateSystemSettings: async (settings: SystemSettings): Promise<boolean> => {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
      const payload = {
          id: 1,
          api_keys: settings.apiKeys,
          active_model: settings.activeModel,
          credit_price: settings.creditPrice,
          custom_languages: settings.customLanguages,
          valid_transaction_refs: settings.validTransactionRefs,
          admin_contact: settings.adminContact
      };
      const { error } = await supabase.from('system_settings').upsert(payload);
      return !error;
  },
  
  // This helper attempts to deduct and returns the NEW user profile if successful, or null if failed
  deductCreditOrUsage: async (userId: string) => {
      const success = await storageService.consumeCredit(userId);
      if (success) {
          return storageService.getUserById(userId);
      }
      return null;
  },
  
  canPerformRequest: async (userId: string) => {
      const allowed = await storageService.canRequest(userId);
      return { allowed };
  },

  exportData: async (user: UserProfile) => {},
  importData: async (file: File, currentUserId: string): Promise<boolean> => { return true; }
};
