
import { supabase } from "../lib/supabase";
import { UserProfile, UserPreferences, LearningSession, AdminRequest } from "../types";

const SESSION_PREFIX = 'tm_v3_session_';

// Helper to map Supabase DB shape to UserProfile
const mapProfile = (data: any): UserProfile => ({
    id: data.id,
    username: data.username,
    email: data.email,
    phoneNumber: data.phone_number,
    role: data.role,
    credits: data.credits,
    stats: {
        xp: data.xp,
        streak: data.streak,
        lessonsCompleted: data.lessons_completed
    },
    preferences: data.preferences,
    vocabulary: data.vocabulary || [],
    freeUsage: data.free_usage || { count: 0, lastReset: new Date().toISOString() },
    aiMemory: "Étudiant motivé",
    createdAt: new Date(data.created_at).getTime(),
    isSuspended: data.is_suspended
});

export const storageService = {
  // --- AUTH (Supabase) ---
  
  login: async (id: string, pass: string): Promise<{success: boolean, user?: UserProfile, error?: string}> => {
    try {
        // 1. Try Supabase Auth
        const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
            email: id, // Assuming ID is email for Supabase Auth
            password: pass
        });

        if (authError) {
            // Fallback: If login fails, check if it's a username (not supported natively by Supabase Auth signin usually requires email)
            // For this demo, we assume the user enters EMAIL.
            return { success: false, error: authError.message };
        }

        if (authData.user) {
            const user = await storageService.getUserById(authData.user.id);
            if (user) return { success: true, user };
        }
        return { success: false, error: "Profil introuvable." };
    } catch (e: any) {
        return { success: false, error: e.message };
    }
  },

  register: async (username: string, password?: string, email?: string, phoneNumber?: string): Promise<{success: boolean, user?: UserProfile, error?: string}> => {
    if (!email || !password) return { success: false, error: "Email et mot de passe requis." };

    try {
        // 1. Create Auth User
        const { data: authData, error: authError } = await supabase.auth.signUp({
            email,
            password,
        });

        if (authError) return { success: false, error: authError.message };
        if (!authData.user) return { success: false, error: "Erreur de création." };

        // 2. Create Profile Entry
        const newProfile = {
            id: authData.user.id,
            username,
            email,
            phone_number: phoneNumber,
            role: 'user',
            credits: 5, // Welcome bonus
            xp: 0,
            vocabulary: [],
            free_usage: { count: 0, lastReset: new Date().toISOString() }
        };

        const { error: dbError } = await supabase.from('profiles').insert([newProfile]);

        if (dbError) {
            console.error("DB Error", dbError);
            return { success: false, error: "Compte créé mais erreur profil. Contactez le support." };
        }

        return { success: true, user: mapProfile({ ...newProfile, created_at: new Date().toISOString() }) };

    } catch (e: any) {
        return { success: false, error: e.message };
    }
  },

  logout: async () => {
      await supabase.auth.signOut();
      localStorage.removeItem('tm_v3_current_user_id'); // Clear legacy if any
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
      // Maps UserProfile back to DB columns
      const updates = {
          credits: user.credits,
          xp: user.stats.xp,
          streak: user.stats.streak,
          lessons_completed: user.stats.lessonsCompleted,
          vocabulary: user.vocabulary,
          preferences: user.preferences,
          free_usage: user.freeUsage
      };

      const { error } = await supabase.from('profiles').update(updates).eq('id', user.id);
      if (error) console.error("Save Error", error);
  },

  getAllUsers: async (): Promise<UserProfile[]> => {
      // Admin function
      const { data } = await supabase.from('profiles').select('*');
      return data ? data.map(mapProfile) : [];
  },

  // --- LOGIC: CREDITS & USAGE ---

  // Returns TRUE if allowed, FALSE if needs recharge
  checkAndConsumeCredit: async (userId: string): Promise<boolean> => {
      const user = await storageService.getUserById(userId);
      if (!user) return false;
      if (user.role === 'admin') return true;

      const now = new Date();
      const lastReset = new Date(user.freeUsage.lastResetWeek || 0);
      const oneWeek = 7 * 24 * 60 * 60 * 1000;

      let updatedUser = { ...user };
      let allowed = false;

      // 1. Check Weekly Reset
      if (now.getTime() - lastReset.getTime() > oneWeek) {
          updatedUser.freeUsage = { count: 0, lastResetWeek: now.toISOString() }; // Reset
      }

      // 2. Logic
      if (updatedUser.freeUsage.count < 3) {
          // Free Tier
          updatedUser.freeUsage.count++;
          allowed = true;
      } else {
          // Paid Tier
          if (updatedUser.credits > 0) {
              updatedUser.credits--;
              allowed = true;
          } else {
              allowed = false;
          }
      }

      if (allowed) {
          await storageService.saveUserProfile(updatedUser);
      }

      return allowed;
  },

  canRequest: async (userId: string): Promise<boolean> => {
      const user = await storageService.getUserById(userId);
      if (!user) return false;
      if (user.role === 'admin') return true;
      
      // Simple check without consumption
      const now = new Date();
      const lastReset = new Date(user.freeUsage.lastResetWeek || 0);
      const isResetDue = (now.getTime() - lastReset.getTime()) > (7 * 24 * 60 * 60 * 1000);
      
      if (isResetDue) return true; // Will trigger reset on consume
      if (user.freeUsage.count < 3) return true;
      return user.credits > 0;
  },

  // Required by legacy
  consumeCredit: async (userId: string) => {
      await storageService.checkAndConsumeCredit(userId);
  },

  addCredits: async (userId: string, amount: number) => {
      const user = await storageService.getUserById(userId);
      if (user) {
          const newCredits = user.credits + amount;
          await supabase.from('profiles').update({ credits: newCredits }).eq('id', userId);
      }
  },

  // --- SESSIONS (Local Only for Speed/Cost) ---
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

  // --- ADMIN REQUESTS ---
  getAdminRequests: async (): Promise<AdminRequest[]> => {
      const { data } = await supabase.from('admin_requests').select('*').order('created_at', { ascending: false });
      return data ? data.map(d => ({
          ...d,
          createdAt: new Date(d.created_at).getTime(),
          userId: d.user_id
      })) : [];
  },

  sendAdminRequest: async (userId: string, username: string, type: 'credit' | 'password_reset' | 'message', amount?: number, message?: string, contact?: string): Promise<{ status: 'pending' | 'approved' }> => {
      const newReq = {
          user_id: userId,
          username,
          type,
          amount,
          message: message + (contact ? ` | Contact: ${contact}` : ''),
          status: 'pending'
      };

      const { error } = await supabase.from('admin_requests').insert([newReq]);
      if (error) console.error(error);
      return { status: 'pending' };
  },

  resolveRequest: async (reqId: string, status: 'approved' | 'rejected') => {
      const { error } = await supabase.from('admin_requests').update({ status }).eq('id', reqId);
      
      // If approved, add credits automatically logic needs to be handled here if we want instant update
      // But typically this is handled by fetching the request first.
      if (!error && status === 'approved') {
          const { data: req } = await supabase.from('admin_requests').select('*').eq('id', reqId).single();
          if (req && req.type === 'credit' && req.amount) {
              await storageService.addCredits(req.user_id, req.amount);
          }
      }
  },

  // --- SETTINGS (Legacy Local) ---
  getSystemSettings: () => {
      return {
          apiKeys: [],
          activeModel: 'gemini-3-flash-preview',
          creditPrice: 50,
          customLanguages: [],
          validTransactionRefs: [],
          adminContact: { telma: "0349310268", airtel: "0333878420", orange: "0326979017" }
      };
  },
  updateSystemSettings: async (s: any) => { /* No-op for now */ }
};
