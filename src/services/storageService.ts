
import { supabase } from '../lib/supabase';
import { UserProfile, ChatMessage, UserPreferences, SystemSettings, AdminRequest } from "../types";

// L'URL de votre backend déployé sur Render (ex: https://teachermada-api.onrender.com)
// Pour le dév local : http://localhost:3000
const API_URL = 'https://teachermada-api.onrender.com'; 

export const storageService = {
  
  // --- Auth & User Management ---
  
  // L'inscription et le login sont gérés directement dans AuthScreen via supabase.auth
  // Cette fonction sert à récupérer le profil enrichi (crédits, xp) après l'auth
  getUserById: async (userId: string): Promise<UserProfile | null> => {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .single();
      
      if (error) return null;
      
      // Mapper les champs DB vers l'interface UserProfile
      return {
          ...data,
          createdAt: new Date(data.created_at).getTime(),
          stats: {
              xp: data.xp,
              streak: data.streak,
              lessonsCompleted: data.lessons_completed
          },
          freeUsage: { count: 0, lastResetWeek: '' }, // Géré par backend maintenant
          credits: data.credits,
          isSuspended: data.is_suspended
      };
  },

  logout: async () => {
    await supabase.auth.signOut();
  },

  getCurrentUser: async (): Promise<UserProfile | null> => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return null;
    return await storageService.getUserById(user.id);
  },

  // --- Credit System Logic ---

  canPerformRequest: (userId: string): { allowed: boolean } => {
      // Cette vérification est purement visuelle côté front.
      // La vraie vérification se fait côté Backend Node.js
      return { allowed: true }; 
  },

  // --- Chat History ---

  saveChatHistory: async (userId: string, messages: ChatMessage[], language?: string) => {
      // Le backend sauvegarde déjà chaque message.
      // Cette fonction peut être utilisée pour forcer une synchro si besoin, 
      // mais avec le backend, c'est automatique.
  },

  getChatHistory: async (userId: string): Promise<ChatMessage[]> => {
      const { data, error } = await supabase
        .from('chat_history')
        .select('*')
        .eq('user_id', userId)
        .order('timestamp', { ascending: true });
        
      if (error) return [];
      return data.map((msg: any) => ({
          id: msg.id,
          role: msg.role,
          text: msg.text,
          timestamp: parseInt(msg.timestamp)
      }));
  },

  // --- API Calls to Node.js Backend ---

  // Appelle le backend Node.js pour générer la réponse IA
  generateAIResponse: async (message: string, history: ChatMessage[], model?: string): Promise<string> => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("Non connecté");

      const response = await fetch(`${API_URL}/api/chat`, {
          method: 'POST',
          headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${session.access_token}` // Envoi du token Supabase
          },
          body: JSON.stringify({ message, history, model })
      });

      if (!response.ok) {
          const err = await response.json();
          if (err.error === 'INSUFFICIENT_CREDITS') throw new Error('INSUFFICIENT_CREDITS');
          throw new Error(err.error || "Erreur serveur");
      }

      const data = await response.json();
      return data.text;
  },

  // --- Admin Functions ---

  sendAdminRequest: async (userId: string, username: string, type: 'credit' | 'message', amount?: number, message?: string) => {
      await supabase.from('admin_requests').insert([{
          user_id: userId,
          username,
          type,
          amount,
          message
      }]);
  },

  getAdminRequests: async (): Promise<AdminRequest[]> => {
      const { data } = await supabase.from('admin_requests').select('*').order('created_at', { ascending: false });
      return data || [];
  },

  updateSystemSettings: (settings: SystemSettings) => {
      // À implémenter avec une table 'settings' dans Supabase
  },
  
  getSystemSettings: (): SystemSettings => {
      // Retourne valeurs par défaut pour l'instant
      return {
          apiKeys: [],
          activeModel: 'gemini-2.0-flash',
          adminContact: { telma: "...", airtel: "...", orange: "..." },
          creditPrice: 50
      };
  },
  
  // Helpers fictifs pour compatibilité interface
  deductCreditOrUsage: (uid: string) => null, 
  getAllUsers: async () => {
      const { data } = await supabase.from('profiles').select('*');
      return data || [];
  },
  saveUserProfile: async (user: UserProfile) => {
      // Met à jour les prefs
      await supabase.from('profiles').update({
          preferences: user.preferences,
          xp: user.stats.xp,
          lessons_completed: user.stats.lessonsCompleted
      }).eq('id', user.id);
  },
  updatePreferences: async (uid: string, prefs: UserPreferences) => {
      await supabase.from('profiles').update({ preferences: prefs }).eq('id', uid);
  },
  addCredits: async (uid: string, amt: number) => {}, // Géré par API Admin
  resolveRequest: async (id: string, status: string) => {
      const { data: { session } } = await supabase.auth.getSession();
      await fetch(`${API_URL}/api/admin/approve`, {
          method: 'POST',
          headers: { 
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${session?.access_token}`
          },
          body: JSON.stringify({ requestId: id, status })
      });
  }
};
