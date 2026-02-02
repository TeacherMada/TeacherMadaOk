
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

// Helper to handle Login strategy (Email, Phone or Username)
const formatLoginEmail = (input: string) => {
    const trimmed = input.trim();
    // If it looks like an email, return it
    if (trimmed.includes('@')) return trimmed;
    
    // Normalize username/phone to a synthetic email
    // We remove spaces and special chars to create a valid email format
    // Ex: "Jean Paul" -> "JeanPaul@teachermada.com"
    // Ex: "034 123" -> "034123@teachermada.com"
    const cleanId = trimmed.replace(/[^a-zA-Z0-9.\-_+]/g, '');
    
    return `${cleanId}@teachermada.com`;
};

export const storageService = {
  // --- AUTH (Supabase) ---
  
  login: async (id: string, pass: string): Promise<{success: boolean, user?: UserProfile, error?: string}> => {
    try {
        const email = formatLoginEmail(id);
        
        const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
            email: email, 
            password: pass
        });

        if (authError) {
            console.error("Login Auth Error:", authError);
            return { success: false, error: "Identifiants incorrects." };
        }

        if (authData.user) {
            const user = await storageService.getUserById(authData.user.id);
            if (user) return { success: true, user };
            
            // Edge case: User exists in Auth but not in Profiles table (Trigger failed?)
            return { success: false, error: "Compte créé mais profil introuvable. Contactez le support." };
        }
        return { success: false, error: "Erreur inconnue." };
    } catch (e: any) {
        return { success: false, error: e.message };
    }
  },

  register: async (username: string, password?: string, email?: string, phoneNumber?: string): Promise<{success: boolean, user?: UserProfile, error?: string}> => {
    if (!password) return { success: false, error: "Mot de passe requis." };
    if (!username) return { success: false, error: "Nom d'utilisateur requis." };

    // Strategy: If email provided, use it. If not, generate synthetic email from username.
    let finalEmail = email?.trim() || "";
    
    if (!finalEmail) {
        finalEmail = formatLoginEmail(username);
    }

    try {
        // 1. Create Auth User
        // Metadata 'username' is used by the Trigger to create the profile row
        const { data: authData, error: authError } = await supabase.auth.signUp({
            email: finalEmail,
            password: password,
            options: {
                data: {
                    username: username.trim(),
                    phone: phoneNumber?.trim() || ""
                }
            }
        });

        if (authError) {
            console.error("Signup Auth Error:", authError);
            // Handle common Supabase errors
            if (authError.message.includes("already registered")) {
                return { success: false, error: "Ce nom ou cet email est déjà pris." };
            }
            return { success: false, error: authError.message };
        }
        
        if (!authData.user) return { success: false, error: "Erreur de création." };

        // Wait a moment for trigger to create profile
        await new Promise(r => setTimeout(r, 2000));

        const user = await storageService.getUserById(authData.user.id);
        if (user) {
            return { success: true, user };
        } else {
            // Profile trigger failed or slow
            return { success: false, error: "Compte créé. Veuillez vous connecter." };
        }

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
      // Security: Users can only update their own non-sensitive data via RLS
      const updates = {
          xp: user.stats.xp,
          streak: user.stats.streak,
          lessons_completed: user.stats.lessonsCompleted,
          vocabulary: user.vocabulary,
          preferences: user.preferences,
          free_usage: user.freeUsage
          // Note: credits are NOT updated here to prevent client-side manipulation
      };

      const { error } = await supabase.from('profiles').update(updates).eq('id', user.id);
      if (error) console.error("Save Error", error);
  },

  getAllUsers: async (): Promise<UserProfile[]> => {
      const { data } = await supabase.from('profiles').select('*');
      return data ? data.map(mapProfile) : [];
  },

  // --- LOGIC: CREDITS & USAGE (SECURE BACKEND) ---

  checkAndConsumeCredit: async (userId: string): Promise<boolean> => {
      const user = await storageService.getUserById(userId);
      if (!user) return false;
      if (user.role === 'admin') return true;

      const now = new Date();
      const lastReset = new Date(user.freeUsage.lastResetWeek || 0);
      const oneWeek = 7 * 24 * 60 * 60 * 1000;

      let allowed = false;
      let newFreeUsage = { ...user.freeUsage };

      // 1. Check Weekly Reset
      if (now.getTime() - lastReset.getTime() > oneWeek) {
          newFreeUsage = { count: 0, lastResetWeek: now.toISOString() };
      }

      // 2. Logic
      if (newFreeUsage.count < 3) {
          // Free Tier (Client logic verified by RLS on update)
          newFreeUsage.count++;
          allowed = true;
          await supabase.from('profiles').update({ free_usage: newFreeUsage }).eq('id', userId);
      } else {
          // Paid Tier: Call Secure RPC
          const { data, error } = await supabase.rpc('consume_credit', { user_id: userId });
          
          if (!error && data === true) {
              allowed = true;
          } else {
              allowed = false;
          }
      }

      return allowed;
  },

  canRequest: async (userId: string): Promise<boolean> => {
      const user = await storageService.getUserById(userId);
      if (!user) return false;
      if (user.role === 'admin') return true;
      
      const now = new Date();
      const lastReset = new Date(user.freeUsage.lastResetWeek || 0);
      const isResetDue = (now.getTime() - lastReset.getTime()) > (7 * 24 * 60 * 60 * 1000);
      
      if (isResetDue) return true;
      if (user.freeUsage.count < 3) return true;
      return user.credits > 0;
  },

  // Legacy wrapper
  consumeCredit: async (userId: string) => {
      await storageService.checkAndConsumeCredit(userId);
  },

  // ADMIN ONLY FUNCTION (Secure RPC)
  addCredits: async (userId: string, amount: number) => {
      const { error } = await supabase.rpc('add_credits', { target_user_id: userId, amount: amount });
      if (error) console.error("Add Credits Error:", error.message);
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
      // Update status
      const { error } = await supabase.from('admin_requests').update({ status }).eq('id', reqId);
      
      // If approved, add credits via RPC
      if (!error && status === 'approved') {
          const { data: req } = await supabase.from('admin_requests').select('*').eq('id', reqId).single();
          if (req && req.type === 'credit' && req.amount) {
              await storageService.addCredits(req.user_id, req.amount);
          }
      }
  },

  // --- SETTINGS ---
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
  updateSystemSettings: async (s: any) => { /* No-op for now */ },
  
  // Helpers needed for some components
  deductCreditOrUsage: async (userId: string) => {
      await storageService.checkAndConsumeCredit(userId);
      return storageService.getUserById(userId);
  },
  canPerformRequest: async (userId: string) => {
      const allowed = await storageService.canRequest(userId);
      return { allowed };
  },
  exportData: () => {}, // PWA local export deprecated in cloud version
  importData: async () => false
};
