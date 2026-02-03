
import { supabase } from "../lib/supabase";
import { UserProfile, UserPreferences, LearningSession, AdminRequest, SystemSettings } from "../types";

const LOCAL_STORAGE_KEY = 'teachermada_user_data';
const CHAT_HISTORY_PREFIX = 'tm_chat_';
const SETTINGS_KEY = 'tm_system_settings';
const SESSION_PREFIX = 'tm_session_';

// Helper to map Supabase DB Profile to Frontend UserProfile
const mapProfile = (p: any): UserProfile => ({
    id: p.id,
    username: p.username,
    email: p.email,
    phoneNumber: p.phone_number,
    role: p.role || 'user',
    credits: p.credits || 0,
    xp: p.xp || 0,
    preferences: p.preferences,
    vocabulary: p.vocabulary || [],
    createdAt: new Date(p.created_at).getTime(),
    isSuspended: p.is_suspended,
    freeUsage: p.free_usage || { count: 0, lastResetWeek: new Date().toISOString() },
    stats: {
        lessonsCompleted: p.lessons_completed || 0,
        exercisesCompleted: p.exercises_completed || 0,
        dialoguesCompleted: p.dialogues_completed || 0
    },
    aiMemory: "Étudiant motivé"
});

export const storageService = {
  // --- AUTH & USER (Hybrid: Local for Session, Sync with DB) ---
  getLocalUser: (): UserProfile | null => {
    const data = localStorage.getItem(LOCAL_STORAGE_KEY);
    return data ? JSON.parse(data) : null;
  },

  getCurrentUser: async (): Promise<UserProfile | null> => {
      // Try to get fresh from Supabase if auth session exists
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
          return storageService.getUserById(user.id);
      }
      return storageService.getLocalUser();
  },

  getUserById: async (id: string): Promise<UserProfile | null> => {
      const { data, error } = await supabase.from('profiles').select('*').eq('id', id).single();
      if (data) {
          const profile = mapProfile(data);
          storageService.saveLocalUser(profile); // Cache locally
          return profile;
      }
      return null;
  },

  saveLocalUser: (user: UserProfile) => {
    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(user));
  },

  login: async (username: string, pass: string): Promise<{ success: boolean; user?: UserProfile; error?: string }> => {
      // This usually should use supabase.auth.signInWithPassword, but keeping custom logic wrapper if needed
      // Assuming email login for Supabase
      try {
          const { data, error } = await supabase.auth.signInWithPassword({
              email: `${username.replace(/[^a-zA-Z0-9]/g, '')}@teachermada.com`, // Fake email strategy if using username
              password: pass
          });
          
          if (error) return { success: false, error: "Identifiants incorrects." };
          
          if (data.user) {
              const profile = await storageService.getUserById(data.user.id);
              if (profile) return { success: true, user: profile };
          }
          return { success: false, error: "Profil introuvable." };
      } catch (e) {
          return { success: false, error: "Erreur de connexion." };
      }
  },

  register: async (username: string, pass: string, email?: string, phone?: string): Promise<{ success: boolean; user?: UserProfile; error?: string }> => {
      try {
          // Fake email generation for username-based login
          const loginEmail = email || `${username.replace(/[^a-zA-Z0-9]/g, '')}@teachermada.com`;
          
          const { data, error } = await supabase.auth.signUp({
              email: loginEmail,
              password: pass,
              options: {
                  data: { username, phone_number: phone }
              }
          });

          if (error) return { success: false, error: error.message };
          
          if (data.user) {
              // Wait a moment for trigger or manually create profile if trigger fails/not set
              await new Promise(r => setTimeout(r, 1000));
              const profile = await storageService.getUserById(data.user.id);
              return { success: true, user: profile || undefined };
          }
          return { success: false, error: "Erreur de création." };
      } catch (e) {
          return { success: false, error: "Erreur système." };
      }
  },

  logout: async () => {
    await supabase.auth.signOut();
    localStorage.removeItem(LOCAL_STORAGE_KEY);
  },

  // --- ADMIN DATA (Now Async & Supabase) ---
  getAllUsers: async (): Promise<UserProfile[]> => {
      const { data, error } = await supabase.from('profiles').select('*').order('created_at', { ascending: false });
      if (error) return [];
      return data.map(mapProfile);
  },

  saveUserProfile: async (user: UserProfile) => {
      storageService.saveLocalUser(user);
      // Sync to DB
      await supabase.from('profiles').update({
          credits: user.credits,
          preferences: user.preferences,
          vocabulary: user.vocabulary,
          stats: {
              lessonsCompleted: user.stats.lessonsCompleted,
              exercisesCompleted: user.stats.exercisesCompleted,
              dialoguesCompleted: user.stats.dialoguesCompleted
          },
          free_usage: user.freeUsage,
          is_suspended: user.isSuspended
      }).eq('id', user.id);
  },

  // --- ADMIN REQUESTS (SUPABASE) ---
  getAdminRequests: async (): Promise<AdminRequest[]> => {
      const { data, error } = await supabase
          .from('admin_requests')
          .select('*')
          .order('created_at', { ascending: false });
      
      if (error) {
          console.error("Fetch requests failed:", error);
          return [];
      }

      return data.map((d: any) => ({
          id: d.id,
          userId: d.user_id,
          username: d.username,
          type: d.type,
          amount: d.amount,
          message: d.message,
          status: d.status,
          createdAt: new Date(d.created_at).getTime()
      }));
  },

  sendAdminRequest: async (userId: string, username: string, type: any, amount?: number, message: string = '', contact?: string) => {
      const payload = {
          user_id: userId,
          username,
          type,
          amount,
          message: contact ? `${message} [Contact: ${contact}]` : message,
          status: 'pending'
      };
      const { error } = await supabase.from('admin_requests').insert([payload]);
      if (error) console.error("Send Request Error", error);
  },

  resolveRequest: async (reqId: string, status: 'approved' | 'rejected') => {
      if (status === 'approved') {
          // Transactional-like logic: Get req -> Add credits -> Update status
          const { data: req } = await supabase.from('admin_requests').select('*').eq('id', reqId).single();
          if (req && req.type === 'credit' && req.amount) {
              await storageService.addCredits(req.user_id, req.amount);
          }
      }
      await supabase.from('admin_requests').update({ status }).eq('id', reqId);
  },

  // --- CREDITS & USAGE ---
  addCredits: async (userId: string, amount: number) => {
      // Fetch current credits first to ensure atomicity/accuracy
      const { data: user } = await supabase.from('profiles').select('credits').eq('id', userId).single();
      if (user) {
          const newCredits = (user.credits || 0) + amount;
          await supabase.from('profiles').update({ credits: newCredits }).eq('id', userId);
      }
  },

  checkAndConsumeCredit: async (userId: string): Promise<boolean> => {
      const user = await storageService.getUserById(userId);
      if (!user) return false;
      if (user.role === 'admin') return true;
      if (user.isSuspended) return false;

      // Logic: Free tier 3/week or consume credit
      const now = new Date();
      const lastReset = new Date(user.freeUsage.lastResetWeek || 0);
      const oneWeek = 7 * 24 * 60 * 60 * 1000;
      
      if (now.getTime() - lastReset.getTime() > oneWeek) {
          user.freeUsage = { count: 0, lastResetWeek: now.toISOString() };
      }

      if (user.freeUsage.count < 3) {
          user.freeUsage.count++;
          await storageService.saveUserProfile(user); // Syncs to DB
          return true;
      } else {
          if (user.credits > 0) {
              user.credits--;
              await storageService.saveUserProfile(user); // Syncs to DB
              return true;
          }
      }
      return false;
  },

  consumeCredit: async (userId: string) => {
      await storageService.checkAndConsumeCredit(userId);
  },

  canRequest: async (userId: string): Promise<boolean> => {
      const user = await storageService.getUserById(userId);
      if (!user) return false;
      if (user.role === 'admin') return true;
      return user.credits > 0 || user.freeUsage.count < 3;
  },

  deductCreditOrUsage: async (userId: string): Promise<UserProfile | null> => {
      await storageService.checkAndConsumeCredit(userId);
      return storageService.getUserById(userId);
  },

  canPerformRequest: async (userId: string): Promise<{ allowed: boolean }> => {
      const allowed = await storageService.canRequest(userId);
      return { allowed };
  },

  // --- SESSIONS & SETTINGS ---
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

  getSystemSettings: (): SystemSettings => {
    const data = localStorage.getItem(SETTINGS_KEY);
    return data ? JSON.parse(data) : {
      apiKeys: [],
      activeModel: 'gemini-3-flash-preview',
      customLanguages: [],
      adminContact: { telma: "0349310268", airtel: "0333878420", orange: "0326979017" }
    };
  },

  loadSystemSettings: async (): Promise<SystemSettings> => {
      const { data } = await supabase.from('system_settings').select('*').single();
      if (data) {
          const settings = {
              apiKeys: data.api_keys || [],
              activeModel: data.active_model || 'gemini-3-flash-preview',
              creditPrice: data.credit_price || 50,
              customLanguages: data.custom_languages || [],
              validTransactionRefs: data.valid_transaction_refs || [],
              adminContact: data.admin_contact || { telma: "", airtel: "", orange: "" }
          };
          localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
          return settings;
      }
      return storageService.getSystemSettings();
  },

  updateSystemSettings: async (settings: SystemSettings) => {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
      await supabase.from('system_settings').upsert({
          id: 1, // Singleton
          api_keys: settings.apiKeys,
          active_model: settings.activeModel,
          custom_languages: settings.customLanguages,
          valid_transaction_refs: settings.validTransactionRefs,
          admin_contact: settings.adminContact
      });
  },

  redeemCode: async (userId: string, code: string): Promise<{success: boolean; amount?: number; message?: string}> => {
      // Fetch latest settings from DB to get valid codes
      const settings = await storageService.loadSystemSettings();
      const validRefs = settings.validTransactionRefs || [];
      const couponIndex = validRefs.findIndex(c => c.code.toUpperCase() === code.toUpperCase());

      if (couponIndex !== -1) {
          const coupon = validRefs[couponIndex];
          await storageService.addCredits(userId, coupon.amount);
          
          // Remove used coupon
          const newRefs = [...validRefs];
          newRefs.splice(couponIndex, 1);
          await storageService.updateSystemSettings({ ...settings, validTransactionRefs: newRefs });
          
          return { success: true, amount: coupon.amount };
      }
      return { success: false, message: "Code invalide." };
  },

  // --- DATA EXPORT ---
  exportData: (user: UserProfile) => {
    const blob = new Blob([JSON.stringify(user)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `teachermada_backup_${user.username}.json`;
    a.click();
  },

  importData: async (file: File, currentUserId: string): Promise<boolean> => {
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = async (e) => {
        try {
          const data = JSON.parse(e.target?.result as string);
          if (data.username && Array.isArray(data.vocabulary)) {
            // Merge vocabulary
            const currentUser = await storageService.getUserById(currentUserId);
            if (currentUser) {
                const updated = { ...currentUser, vocabulary: [...data.vocabulary, ...currentUser.vocabulary] };
                await storageService.saveUserProfile(updated);
                resolve(true);
            }
          } else resolve(false);
        } catch { resolve(false); }
      };
      reader.readAsText(file);
    });
  }
};
