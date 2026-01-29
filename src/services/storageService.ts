
import { supabase } from '../lib/supabase';
import { UserProfile, ChatMessage, UserPreferences, SystemSettings, AdminRequest } from "../types";

// Configuration URL Backend (Production Render ou Local)
const API_URL = (import.meta as any).env.VITE_API_URL || 'https://teachermada-api.onrender.com';

const CURRENT_USER_KEY = 'smart_teacher_current_user_id';
const SETTINGS_KEY = 'smart_teacher_system_settings';
const REQUESTS_KEY = 'smart_teacher_admin_requests';

const DEFAULT_SETTINGS: SystemSettings = {
  // Correction: Remplacement de process.env par import.meta.env pour éviter le crash "process is not defined"
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
  
  // --- Auth & User Management ---
  
  getUserById: async (userId: string): Promise<UserProfile | null> => {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .single();
      
      if (error) return null;
      
      return {
          ...data,
          createdAt: new Date(data.created_at).getTime(),
          stats: {
              xp: data.xp,
              streak: data.streak,
              lessonsCompleted: data.lessons_completed
          },
          freeUsage: { count: 0, lastResetWeek: '' },
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
      return { allowed: true }; 
  },

  // --- Chat History ---

  saveChatHistory: async (userId: string, messages: ChatMessage[], language?: string) => {
      // Géré par le backend
  },

  getChatHistory: async (userId: string, language?: string): Promise<ChatMessage[]> => {
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

  generateAIResponse: async (message: string, history: ChatMessage[], model?: string): Promise<string> => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("Non connecté");

      const response = await fetch(`${API_URL}/api/chat`, {
          method: 'POST',
          headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${session.access_token}`
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
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  },
  
  getSystemSettings: (): SystemSettings => {
      const data = localStorage.getItem(SETTINGS_KEY);
      return data ? JSON.parse(data) : DEFAULT_SETTINGS;
  },
  
  // Helpers legacy
  deductCreditOrUsage: async (userId: string): Promise<UserProfile | null> => {
      const { data, error } = await supabase.from('profiles').select('*').eq('id', userId).single();
      if (error || !data) return null;
      
      const user: UserProfile = {
          ...data,
          createdAt: new Date(data.created_at).getTime(),
          stats: { xp: data.xp, streak: data.streak, lessonsCompleted: data.lessons_completed },
          freeUsage: { count: 0, lastResetWeek: '' },
          credits: data.credits,
          isSuspended: data.is_suspended
      };

      if (user.role === 'admin') return user;

      if (user.credits > 0) {
          const { error: updateError } = await supabase.from('profiles').update({ credits: user.credits - 1 }).eq('id', userId);
          if (!updateError) return { ...user, credits: user.credits - 1 };
      }
      return null;
  }, 

  getAllUsers: async () => {
      const { data } = await supabase.from('profiles').select('*');
      return data || [];
  },

  saveUserProfile: async (user: UserProfile) => {
      await supabase.from('profiles').update({
          preferences: user.preferences,
          xp: user.stats.xp,
          lessons_completed: user.stats.lessonsCompleted
      }).eq('id', user.id);
  },

  updatePreferences: async (uid: string, prefs: UserPreferences) => {
      await supabase.from('profiles').update({ preferences: prefs }).eq('id', uid);
  },
  addCredits: async (uid: string, amt: number) => {}, 
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
  },
  login: (i:string, p:string) => ({success:false}), 
  register: (u:string, p:string) => ({success:false}), 
  markTutorialSeen: (uid:string) => {}
};
