
import { UserProfile, ChatMessage, UserPreferences } from "../types";

// Mock Backend Service using LocalStorage
const CURRENT_USER_KEY = 'smart_teacher_current_user_id';

export const storageService = {
  // --- Auth Simulation ---
  
  login: (identifier: string, password?: string): { success: boolean, user?: UserProfile, error?: string } => {
    let foundUser: UserProfile | null = null;
    
    // Search for user by username or email
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key?.startsWith('user_data_')) {
        const userData = JSON.parse(localStorage.getItem(key) || '{}') as UserProfile;
        if (
            userData.username.toLowerCase() === identifier.toLowerCase() || 
            (userData.email && userData.email.toLowerCase() === identifier.toLowerCase())
        ) {
          foundUser = userData;
          break;
        }
      }
    }

    if (!foundUser) {
        return { success: false, error: "Utilisateur introuvable." };
    }

    // Verify password (Mock check)
    if (password && foundUser.password !== password) {
        return { success: false, error: "Mot de passe incorrect." };
    }

    localStorage.setItem(CURRENT_USER_KEY, foundUser.id);
    return { success: true, user: foundUser };
  },

  register: (username: string, password?: string, email?: string): { success: boolean, user?: UserProfile, error?: string } => {
    // Check if user exists
    for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key?.startsWith('user_data_')) {
          const userData = JSON.parse(localStorage.getItem(key) || '{}') as UserProfile;
          if (userData.username.toLowerCase() === username.toLowerCase()) {
            return { success: false, error: "Ce nom d'utilisateur est déjà pris." };
          }
        }
    }

    const newUser: UserProfile = {
      id: crypto.randomUUID(),
      username,
      email,
      password, // In a real app, this MUST be hashed
      createdAt: Date.now(),
      preferences: null,
      stats: {
        xp: 0,
        streak: 1,
        lessonsCompleted: 0
      },
      skills: {
        vocabulary: 10,
        grammar: 5,
        pronunciation: 5,
        listening: 5
      },
      aiMemory: "L'utilisateur commence son apprentissage.",
      isPremium: false,
      hasSeenTutorial: false
    };
    
    storageService.saveUserProfile(newUser);
    localStorage.setItem(CURRENT_USER_KEY, newUser.id);
    return { success: true, user: newUser };
  },

  logout: () => {
    localStorage.removeItem(CURRENT_USER_KEY);
  },

  getCurrentUser: (): UserProfile | null => {
    const id = localStorage.getItem(CURRENT_USER_KEY);
    if (!id) return null;
    
    const data = localStorage.getItem(`user_data_${id}`);
    return data ? JSON.parse(data) : null;
  },

  // --- Data Persistence ---

  saveUserProfile: (user: UserProfile) => {
    localStorage.setItem(`user_data_${user.id}`, JSON.stringify(user));
  },

  updateUserProfile: (user: UserProfile) => {
    // Determine if we need to update the key (unlikely in this structure unless ID changes, which it shouldn't)
    // Just overwrite the data
    localStorage.setItem(`user_data_${user.id}`, JSON.stringify(user));
  },

  updatePreferences: (userId: string, prefs: UserPreferences) => {
    const data = localStorage.getItem(`user_data_${userId}`);
    if (data) {
      const user = JSON.parse(data) as UserProfile;
      user.preferences = prefs;
      localStorage.setItem(`user_data_${userId}`, JSON.stringify(user));
    }
  },

  markTutorialSeen: (userId: string) => {
    const data = localStorage.getItem(`user_data_${userId}`);
    if (data) {
        const user = JSON.parse(data) as UserProfile;
        user.hasSeenTutorial = true;
        localStorage.setItem(`user_data_${userId}`, JSON.stringify(user));
    }
  },

  // --- History Management ---

  saveChatHistory: (userId: string, messages: ChatMessage[]) => {
    localStorage.setItem(`chat_history_${userId}`, JSON.stringify(messages));
  },

  getChatHistory: (userId: string): ChatMessage[] => {
    const data = localStorage.getItem(`chat_history_${userId}`);
    return data ? JSON.parse(data) : [];
  },

  clearChatHistory: (userId: string) => {
    localStorage.removeItem(`chat_history_${userId}`);
  }
};
