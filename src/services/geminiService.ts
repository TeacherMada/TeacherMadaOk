import { supabase } from "../lib/supabase";
import { UserProfile, UserPreferences, LearningSession, AdminRequest, SystemSettings, CouponCode } from "../types";

const LOCAL_STORAGE_KEY = 'teachermada_user_data';
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

const formatLoginEmail = (input: string) => {
    const trimmed = input.trim();
    if (trimmed.includes('@')) return trimmed;
    const cleanId = trimmed.replace(/[^a-zA-Z0-9.\-_+]/g, '');
    return `${cleanId}@teachermada.com`;
};

// Helper pour créer un profil DB
const createDefaultProfilePayload = (id: string, username: string, email: string, phone: string = "") => ({
    id: id,
    username: username,
    email: email,
    phone_number: phone,
    role: 'user',
    credits: 10, // Crédits de bienvenue (Serveur seulement)
    xp: 0,
    stats: { lessons_completed: 0, exercises_completed: 0, dialogues_completed: 0 },
    vocabulary: [],
    preferences: null,
    free_usage: { count: 0, lastResetWeek: new Date().toISOString() },
    is_suspended: false,
    created_at: new Date().toISOString()
});

export const storageService = {
  subscribeToUserUpdates: (callback: UserUpdateListener) => {
      userListeners.push(callback);
      return () => {
          userListeners = userListeners.filter(cb => cb !== callback);
      };
  },

  // --- AUTH ---
  
  login: async (id: string, pass: string): Promise<{success: boolean, user?: UserProfile, error?: string}> => {
    try {
        const email = formatLoginEmail(id);
        
        // 1. Auth Supabase
        const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
            email: email, 
            password: pass
        });

        if (authError) return { success: false, error: "Identifiants incorrects." };

        if (authData.user) {
            // 2. Fetch Profile (Strict : Pas de fallback local ici)
            let user = await storageService.getUserById(authData.user.id);
            
            // Retry logic si la DB est lente à répondre après création compte
            let attempts = 0;
            while (!user && attempts < 3) {
                await new Promise(resolve => setTimeout(resolve, 800));
                user = await storageService.getUserById(authData.user.id);
                attempts++;
            }
            
            // Si pas de profil, tentative de création (Self-healing)
            if (!user) {
                const username = authData.user.user_metadata?.username || id.split('@')[0];
                const phone = authData.user.user_metadata?.phone_number || "";
                const payload = createDefaultProfilePayload(authData.user.id, username, email, phone);
                
                const { error: insertError } = await supabase.from('profiles').insert([payload]);
                
                // Re-fetch après insertion
                if (!insertError) user = mapProfile(payload);
            }

            if (!user) return { success: false, error: "Impossible de charger le profil (Erreur Réseau/DB)." };
            if (user.isSuspended) return { success: false, error: "Compte suspendu par l'administrateur." };
            
            // 3. Sauvegarde locale SEULEMENT si succès DB
            storageService.saveLocalUser(user); 
            return { success: true, user };
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
            options: { data: { username: username.trim(), phone_number: phoneNumber?.trim() || "" } }
        });

        if (authError) return { success: false, error: authError.message };
        if (!authData.user) return { success: false, error: "Erreur création compte." };

        // Création explicite du profil
        const payload = createDefaultProfilePayload(authData.user.id, username.trim(), finalEmail, phoneNumber?.trim() || "");
        await supabase.from('profiles').insert([payload]);

        // Vérification
        const newUser = mapProfile(payload);
        storageService.saveLocalUser(newUser);
        return { success: true, user: newUser };

    } catch (e: any) {
        return { success: false, error: e.message };
    }
  },

  logout: async () => {
      await supabase.auth.signOut();
      localStorage.removeItem(LOCAL_STORAGE_KEY);
      localStorage.removeItem('tm_v3_current_user_id'); 
  },

  // Récupère toujours la version la plus fraîche si en ligne
  getCurrentUser: async (): Promise<UserProfile | null> => {
      // 1. Check Auth Session
      const { data: { session } } = await supabase.auth.getSession();
      
      if (session?.user) {
          // Si connecté, on force le fetch DB pour avoir les vrais crédits
          const dbUser = await storageService.getUserById(session.user.id);
          if (dbUser) {
              storageService.saveLocalUser(dbUser); // Mise à jour cache
              return dbUser;
          }
      }
      
      // Fallback local (Offline only)
      return storageService.getLocalUser();
  },

  getLocalUser: (): UserProfile | null => {
    const data = localStorage.getItem(LOCAL_STORAGE_KEY);
    return data ? JSON.parse(data) : null;
  },

  saveLocalUser: (user: UserProfile) => {
    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(user));
    notifyListeners(user);
  },

  getUserById: async (id: string): Promise<UserProfile | null> => {
      try {
          const { data, error } = await supabase
            .from('profiles')
            .select('*')
            .eq('id', id)
            .single();
          
          if (error || !data) return null;
          return mapProfile(data);
      } catch {
          return null;
      }
  },

  // --- SYNC ---
  saveUserProfile: async (user: UserProfile) => {
      // Optimistic update for UI speed
      storageService.saveLocalUser(user); 

      // Background Sync
      const updates = {
          username: user.username,
          // SECURITY FIX: Ne PAS envoyer les crédits ici pour éviter d'écraser la DB avec une vieille valeur locale
          xp: user.xp,
          lessons_completed: user.stats.lessonsCompleted,
          exercises_completed: user.stats.exercisesCompleted,
          dialogues_completed: user.stats.dialoguesCompleted,
          vocabulary: user.vocabulary,
          preferences: user.preferences,
          free_usage: user.freeUsage
      };

      await supabase.from('profiles').update(updates).eq('id', user.id);
  },

  getAllUsers: async (): Promise<UserProfile[]> => {
      const { data } = await supabase.from('profiles').select('*').order('created_at', { ascending: false });
      return data ? data.map(mapProfile) : [];
  },

  // --- CREDITS (SECURE RPC IMPLEMENTATION) ---

  canRequest: async (userId: string, minCredits: number = 1): Promise<boolean> => {
      // Always fetch fresh credits from DB to prevent PWA cache cheating
      const dbUser = await storageService.getUserById(userId);
      
      if (!dbUser) return false;
      
      // Sync local with fresh DB data to keep UI in sync
      storageService.saveLocalUser(dbUser);
      
      if (dbUser.role === 'admin') return true;
      if (dbUser.isSuspended) return false;
      
      return dbUser.credits >= minCredits;
  },

  consumeCredit: async (userId: string): Promise<boolean> => {
      return storageService.deductCredits(userId, 1);
  },

  deductCredits: async (userId: string, amount: number): Promise<boolean> => {
      // SECURITY UPDATE: Utilisation de la fonction RPC 'consume_credits'
      // Cela garantit l'atomicité et empêche les race conditions.
      
      try {
          // 1. Vérification Admin (Optionnel, peut être fait côté DB aussi)
          const { data: userRole } = await supabase.from('profiles').select('role').eq('id', userId).single();
          if (userRole?.role === 'admin') return true;

          // 2. Appel RPC Transactionnel
          const { data: success, error } = await supabase.rpc('consume_credits', {
              p_user_id: userId,
              p_amount: amount
          });

          if (error) {
              console.error("Erreur RPC Deduction:", error);
              return false;
          }

          // 3. Mise à jour de l'UI locale après succès
          if (success) {
              const local = storageService.getLocalUser();
              if (local) {
                  // On déduit localement pour l'UI, sachant que la DB a déjà validé
                  storageService.saveLocalUser({ ...local, credits: local.credits - amount });
              }
              return true;
          } else {
              // Échec (fonds insuffisants côté serveur)
              // On force une mise à jour locale pour refléter la réalité
              const freshUser = await storageService.getUserById(userId);
              if (freshUser) storageService.saveLocalUser(freshUser);
              return false;
          }
      } catch (e) {
          console.error("Exception Deduction:", e);
          return false;
      }
  },

  addCredits: async (userId: string, amount: number): Promise<boolean> => {
      // SECURITY UPDATE: Utilisation de la fonction RPC 'add_credits'
      // Empêche d'écraser des crédits si plusieurs ajouts se produisent simultanément.
      
      try {
          const { error } = await supabase.rpc('add_credits', {
              p_user_id: userId,
              p_amount: amount
          });

          if (error) {
              console.error("Erreur RPC Ajout:", error);
              return false;
          }
          
          return true;
      } catch (e) {
          console.error("Exception Ajout:", e);
          return false;
      }
  },

  // --- OTHERS ---
  canUseSupportAgent: (): boolean => {
      const today = new Date().toDateString();
      const raw = localStorage.getItem(SUPPORT_QUOTA_KEY);
      let data = raw ? JSON.parse(raw) : { date: today, count: 0 };
      if (data.date !== today) data = { date: today, count: 0 };
      return data.count < 100;
  },

  incrementSupportUsage: () => {
      const today = new Date().toDateString();
      const raw = localStorage.getItem(SUPPORT_QUOTA_KEY);
      let data = raw ? JSON.parse(raw) : { date: today, count: 0 };
      if (data.date !== today) data = { date: today, count: 0 };
      data.count++;
      localStorage.setItem(SUPPORT_QUOTA_KEY, JSON.stringify(data));
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

              // Use Secure Add
              const creditAdded = await storageService.addCredits(userId, amountToAdd);
              if (!creditAdded) return { success: false, message: "Erreur technique." };
              
              const newRefs = [...validRefs];
              newRefs.splice(couponIndex, 1);
              await storageService.updateSystemSettings({ ...settings, validTransactionRefs: newRefs });
              
              return { success: true, amount: amountToAdd };
          }
          return { success: false, message: "Code invalide ou déjà utilisé." };
      } catch {
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

    const newSession: LearningSession = { id: key, messages: [], progress: 0, score: 0 };
    storageService.saveSession(newSession);
    return newSession;
  },

  saveSession: (session: LearningSession) => {
    localStorage.setItem(session.id, JSON.stringify(session));
  },

  getChatHistory: (lang: string): any[] => [],

  // --- ADMIN ---
  getAdminRequests: async (): Promise<AdminRequest[]> => {
      try {
          const { data } = await supabase.from('admin_requests').select('*').order('created_at', { ascending: false });
          // Map DB snake_case to CamelCase
          return data ? data.map(d => ({
              id: d.id, userId: d.user_id, username: d.username, type: d.type,
              amount: d.amount, message: d.message, status: d.status,
              createdAt: d.created_at ? new Date(d.created_at).getTime() : Date.now()
          })) : [];
      } catch { return []; }
  },

  cleanupOldRequests: async () => {
      try {
          const oneWeekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
          await supabase.from('admin_requests').delete().lt('created_at', oneWeekAgo);
      } catch {}
  },

  sendAdminRequest: async (userId: string, username: string, type: 'credit' | 'password_reset' | 'message', amount?: number, message?: string, contact?: string): Promise<{ status: 'pending' | 'approved' }> => {
      const fullMessage = contact ? `${message} [Contact: ${contact}]` : message;
      const newReq = { user_id: userId, username, type, amount, message: fullMessage, status: 'pending' };
      await supabase.from('admin_requests').insert([newReq]);
      return { status: 'pending' };
  },

  resolveRequest: async (reqId: string, status: 'approved' | 'rejected') => {
      if (status === 'approved') {
          const { data: req } = await supabase.from('admin_requests').select('*').eq('id', reqId).single();
          if (req && req.type === 'credit' && req.amount) {
              // SECURITY: Utilisation de la fonction RPC pour ajouter les crédits de manière sûre
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
              // Normalize data
              let normalizedCoupons: CouponCode[] = [];
              if (Array.isArray(data.valid_transaction_refs)) {
                  normalizedCoupons = data.valid_transaction_refs.map((r: any) => {
                      if (typeof r === 'string') {
                          try { return JSON.parse(r); } catch { return { code: r, amount: 0, createdAt: new Date().toISOString() }; }
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
      } catch {}
      return storageService.getSystemSettings();
  },

  getSystemSettings: (): SystemSettings => {
      const local = localStorage.getItem(SETTINGS_KEY);
      if (local) return JSON.parse(local);
      return {
          apiKeys: [], activeModel: 'gemini-3-flash-preview', creditPrice: 50, customLanguages: [],
          validTransactionRefs: [], adminContact: { telma: "0349310268", airtel: "0333878420", orange: "0326979017" }
      };
  },

  updateSystemSettings: async (settings: SystemSettings): Promise<boolean> => {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
      const payload = {
          id: 1,
          api_keys: settings.apiKeys, active_model: settings.activeModel, credit_price: settings.creditPrice,
          custom_languages: settings.customLanguages, valid_transaction_refs: settings.validTransactionRefs,
          admin_contact: settings.adminContact
      };
      const { error } = await supabase.from('system_settings').upsert(payload);
      return !error;
  },
  
  deductCreditOrUsage: async (userId: string) => {
      const success = await storageService.consumeCredit(userId);
      if (success) return storageService.getLocalUser();
      return null;
  },
  
  canPerformRequest: async (userId: string) => {
      const allowed = await storageService.canRequest(userId);
      return { allowed };
  },

  exportData: async (user: UserProfile) => {
      const blob = new Blob([JSON.stringify(user, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = `teachermada_${user.username}_backup.json`;
      a.click();
  },
  
  importData: async (file: File, currentUserId: string): Promise<boolean> => { 
      try {
          const text = await file.text();
          const data = JSON.parse(text);
          if (data.username && data.stats) {
              const updated = {
                  username: data.username, stats: data.stats, vocabulary: data.vocabulary, preferences: data.preferences
              };
              const { error } = await supabase.from('profiles').update(updated).eq('id', currentUserId);
              return !error;
          }
      } catch {}
      return false; 
  }
};
