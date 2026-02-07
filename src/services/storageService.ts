
import { supabase } from "../lib/supabase";
import { UserProfile, UserPreferences, LearningSession, AdminRequest, SystemSettings, CouponCode } from "../types";

const SESSION_PREFIX = 'tm_v3_session_';
const SETTINGS_KEY = 'tm_system_settings';

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

        // Wait briefly for trigger to create profile if using one, otherwise basic profile check
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
          // Notify app of update
          notifyListeners(user);
      }
  },

  getAllUsers: async (): Promise<UserProfile[]> => {
      const { data } = await supabase.from('profiles').select('*').order('created_at', { ascending: false });
      return data ? data.map(mapProfile) : [];
  },

  // --- LOGIC: CREDITS & USAGE ---

  checkAndConsumeCredit: async (userId: string): Promise<boolean> => {
      const user = await storageService.getUserById(userId);
      if (!user) return false;
      if (user.role === 'admin') return true;
      if (user.isSuspended) return false;

      const now = new Date();
      const lastReset = new Date(user.freeUsage.lastResetWeek || 0);
      const oneWeek = 7 * 24 * 60 * 60 * 1000;

      let allowed = false;
      let newFreeUsage = { ...user.freeUsage };
      let newCredits = user.credits;

      if (now.getTime() - lastReset.getTime() > oneWeek) {
          newFreeUsage = { count: 0, lastResetWeek: now.toISOString() };
      }

      if (newFreeUsage.count < 3) {
          newFreeUsage.count++;
          allowed = true;
          // Update free usage
          await supabase.from('profiles').update({ free_usage: newFreeUsage }).eq('id', userId);
          // Notify with updated free usage
          notifyListeners({ ...user, freeUsage: newFreeUsage });
      } else {
          if (user.credits > 0) {
              newCredits = user.credits - 1;
              const { error } = await supabase.from('profiles').update({ credits: newCredits }).eq('id', userId);
              allowed = !error;
              if (allowed) {
                  // Notify with updated credits
                  notifyListeners({ ...user, credits: newCredits });
              }
          }
      }

      return allowed;
  },

  canRequest: async (userId: string): Promise<boolean> => {
      const user = await storageService.getUserById(userId);
      if (!user) return false;
      if (user.role === 'admin') return true;
      if (user.isSuspended) return false;
      
      // Check free tier
      const now = new Date();
      const lastReset = new Date(user.freeUsage.lastResetWeek || 0);
      const isResetDue = (now.getTime() - lastReset.getTime()) > (7 * 24 * 60 * 60 * 1000);
      
      if (isResetDue) return true;
      if (user.freeUsage.count < 3) return true;
      
      return user.credits > 0;
  },

  consumeCredit: async (userId: string) => {
      await storageService.checkAndConsumeCredit(userId);
  },

  addCredits: async (userId: string, amount: number): Promise<boolean> => {
      // Direct Database Update
      const { data: user, error: fetchError } = await supabase
          .from('profiles')
          .select('credits')
          .eq('id', userId)
          .single();

      if (fetchError || !user) {
          console.error("AddCredits Fetch Error:", fetchError);
          return false;
      }

      const newCredits = (user.credits || 0) + amount;
      const { error: updateError } = await supabase.from('profiles').update({ credits: newCredits }).eq('id', userId);
      
      if (updateError) {
          console.error("AddCredits Update Error:", updateError);
          return false;
      }

      // Fetch full profile to notify listeners
      const updatedUser = await storageService.getUserById(userId);
      if (updatedUser) notifyListeners(updatedUser);

      return true;
  },

  // --- SECURE CREDIT REDEMPTION ---
  redeemCode: async (userId: string, inputCode: string): Promise<{ success: boolean; amount?: number; message?: string }> => {
      try {
          const code = inputCode.trim().toUpperCase();
          // Load latest settings from DB to check for code
          const settings = await storageService.loadSystemSettings();
          const validRefs = settings.validTransactionRefs || [];
          
          console.log("Validating coupon:", code);

          // Find the coupon object (Case Insensitive)
          const couponIndex = validRefs.findIndex(c => c.code.toUpperCase() === code);

          if (couponIndex !== -1) {
              const coupon = validRefs[couponIndex];
              const amountToAdd = Number(coupon.amount) || 0;

              // 1. Add Credits
              const creditAdded = await storageService.addCredits(userId, amountToAdd);
              if (!creditAdded) return { success: false, message: "Erreur technique lors de l'ajout." };
              
              // 2. Remove Coupon from Settings (Prevent reuse)
              const newRefs = [...validRefs];
              newRefs.splice(couponIndex, 1);
              
              const saveSuccess = await storageService.updateSystemSettings({ ...settings, validTransactionRefs: newRefs });
              
              if (saveSuccess) {
                  return { success: true, amount: amountToAdd };
              } else {
                  return { success: false, message: "Code utilisé mais erreur de validation finale." };
              }
          }

          return { success: false, message: "Code invalide ou déjà utilisé." };

      } catch (e: any) {
          console.error("Redeem Error:", e);
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

  // --- CHAT HISTORY (Local Only for speed) ---
  getChatHistory: (lang: string): any[] => {
    return []; // Implementation simplified for this file
  },

  // --- ADMIN REQUESTS (SUPABASE CONNECTED) ---
  getAdminRequests: async (): Promise<AdminRequest[]> => {
      try {
          // Fetch directly from Supabase
          const { data, error } = await supabase
              .from('admin_requests')
              .select('*')
              .order('created_at', { ascending: false });
          
          if (error) {
              console.error("GetRequests Error:", error);
              // Return empty array if table doesn't exist or RLS issue
              return [];
          }

          // Map snake_case from DB to CamelCase types
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
          console.error("Admin Requests Fetch Exception:", e);
          return [];
      }
  },

  // Clean up requests older than 7 days
  cleanupOldRequests: async () => {
      try {
          const oneWeekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
          await supabase
              .from('admin_requests')
              .delete()
              .lt('created_at', oneWeekAgo);
      } catch (e) {
          // Ignore table missing error
      }
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

      const { error } = await supabase.from('admin_requests').insert([newReq]);
      
      if (error) {
          console.error("Send Request Error:", error);
          throw new Error("Echec de l'envoi de la demande. Veuillez réessayer plus tard.");
      }
      return { status: 'pending' };
  },

  resolveRequest: async (reqId: string, status: 'approved' | 'rejected') => {
      // 1. If approved, verify it's a credit request and add credits FIRST
      if (status === 'approved') {
          const { data: req } = await supabase.from('admin_requests').select('*').eq('id', reqId).single();
          if (req && req.type === 'credit' && req.amount) {
              const creditSuccess = await storageService.addCredits(req.user_id, req.amount);
              if (!creditSuccess) {
                  console.error("Failed to add credits during request approval");
                  return; // Stop execution if credit add failed
              }
          }
      }

      // 2. Update status in DB
      const { error } = await supabase.from('admin_requests').update({ status }).eq('id', reqId);
      if (error) console.error("Resolve Request Error", error);
  },

  // --- SETTINGS (Supabase Sync) ---
  
  loadSystemSettings: async (): Promise<SystemSettings> => {
      try {
          const { data, error } = await supabase.from('system_settings').select('*').single();
          
          if (!error && data) {
              // Normalize validTransactionRefs to prevent malformed data
              let normalizedCoupons: CouponCode[] = [];
              
              if (Array.isArray(data.valid_transaction_refs)) {
                  normalizedCoupons = data.valid_transaction_refs.map((r: any) => {
                      if (typeof r === 'string') {
                          try {
                              const parsed = JSON.parse(r);
                              if (typeof parsed === 'object') return parsed;
                              return { code: r, amount: 0, createdAt: new Date().toISOString() };
                          } catch (e) {
                              return { code: r, amount: 0, createdAt: new Date().toISOString() };
                          }
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
              // Cache locally
              localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
              return settings;
          }
          if (error) console.warn("Load Settings Error (DB):", error.message);
      } catch (e) {
          console.warn("Using local settings fallback", e);
      }
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
      // 1. Optimistic Local Update
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
      
      // 2. Push to Supabase
      const payload = {
          id: 1, // Singleton row
          api_keys: settings.apiKeys,
          active_model: settings.activeModel,
          credit_price: settings.creditPrice,
          custom_languages: settings.customLanguages,
          valid_transaction_refs: settings.validTransactionRefs,
          admin_contact: settings.adminContact
      };

      const { error } = await supabase.from('system_settings').upsert(payload);
      if (error) {
          console.error("Failed to sync settings to DB:", error);
          return false;
      }
      return true;
  },
  
  deductCreditOrUsage: async (userId: string) => {
      const success = await storageService.checkAndConsumeCredit(userId);
      if (success) {
          return storageService.getUserById(userId);
      }
      return null;
  },
  
  canPerformRequest: async (userId: string) => {
      const allowed = await storageService.canRequest(userId);
      return { allowed };
  },

  exportData: async (user: UserProfile) => {
      // Export logic
  },

  importData: async (file: File, currentUserId: string): Promise<boolean> => {
      return true;
  }
};
