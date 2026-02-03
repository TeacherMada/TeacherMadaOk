
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
        lessonsCompleted: data.lessons_completed || 0
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
    if (trimmed.includes('@')) return trimmed;
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

        if (authError) return { success: false, error: "Identifiants incorrects." };

        if (authData.user) {
            const user = await storageService.getUserById(authData.user.id);
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
                    phone: phoneNumber?.trim() || ""
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
          lessons_completed: user.stats.lessonsCompleted,
          vocabulary: user.vocabulary,
          preferences: user.preferences,
          free_usage: user.freeUsage
      };

      const { error } = await supabase.from('profiles').update(updates).eq('id', user.id);
      if (error) console.error("Save Error", error);
  },

  getAllUsers: async (): Promise<UserProfile[]> => {
      const { data } = await supabase.from('profiles').select('*');
      return data ? data.map(mapProfile) : [];
  },

  // --- LOGIC: CREDITS & USAGE ---

  checkAndConsumeCredit: async (userId: string): Promise<boolean> => {
      const user = await storageService.getUserById(userId);
      if (!user) return false;
      if (user.role === 'admin') return true;

      const now = new Date();
      const lastReset = new Date(user.freeUsage.lastResetWeek || 0);
      const oneWeek = 7 * 24 * 60 * 60 * 1000;

      let allowed = false;
      let newFreeUsage = { ...user.freeUsage };

      if (now.getTime() - lastReset.getTime() > oneWeek) {
          newFreeUsage = { count: 0, lastResetWeek: now.toISOString() };
      }

      if (newFreeUsage.count < 3) {
          newFreeUsage.count++;
          allowed = true;
          await supabase.from('profiles').update({ free_usage: newFreeUsage }).eq('id', userId);
      } else {
          const { data, error } = await supabase.rpc('consume_credit', { user_id: userId });
          allowed = !error && data === true;
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

  consumeCredit: async (userId: string) => {
      await storageService.checkAndConsumeCredit(userId);
  },

  addCredits: async (userId: string, amount: number) => {
      await supabase.rpc('add_credits', { target_user_id: userId, amount: amount });
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
      const { error } = await supabase.from('admin_requests').update({ status }).eq('id', reqId);
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
  updateSystemSettings: async (s: any) => { /* No-op */ },
  
  deductCreditOrUsage: async (userId: string) => {
      await storageService.checkAndConsumeCredit(userId);
      return storageService.getUserById(userId);
  },
  canPerformRequest: async (userId: string) => {
      const allowed = await storageService.canRequest(userId);
      return { allowed };
  },

  // --- IMPORT / EXPORT DATA ---
  exportData: async (user: UserProfile) => {
      const exportObj = {
          userProfile: user,
          sessions: Object.keys(localStorage)
              .filter(k => k.startsWith(SESSION_PREFIX + user.id))
              .map(k => JSON.parse(localStorage.getItem(k) || '{}')),
          timestamp: new Date().toISOString()
      };
      
      const blob = new Blob([JSON.stringify(exportObj, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `teachermada_backup_${user.username}_${new Date().toISOString().split('T')[0]}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
  },

  importData: async (file: File, currentUserId: string): Promise<boolean> => {
      return new Promise((resolve) => {
          const reader = new FileReader();
          reader.onload = async (e) => {
              try {
                  const data = JSON.parse(e.target?.result as string);
                  if (data.userProfile && data.sessions) {
                      // Update User Profile via Supabase
                      const profileToSync = { ...data.userProfile, id: currentUserId }; // Force ID to current user
                      await storageService.saveUserProfile(profileToSync);
                      
                      // Restore Sessions to LocalStorage
                      data.sessions.forEach((session: any) => {
                          // Remap session ID to current user if needed
                          const newId = session.id.replace(data.userProfile.id, currentUserId);
                          localStorage.setItem(newId, JSON.stringify({ ...session, id: newId }));
                      });
                      
                      resolve(true);
                  } else {
                      resolve(false);
                  }
              } catch (err) {
                  console.error("Import failed", err);
                  resolve(false);
              }
          };
          reader.readAsText(file);
      });
  }
};
