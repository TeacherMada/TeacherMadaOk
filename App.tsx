
import React, { useState, useEffect } from 'react';
import LandingPage from './components/LandingPage';
import AuthScreen from './components/AuthScreen';
import Onboarding from './components/Onboarding';
import ChatInterface from './components/ChatInterface';
import SmartDashboard from './components/SmartDashboard';
import AdminDashboard from './components/AdminDashboard';
import { UserPreferences, ChatMessage, ExplanationLanguage, UserProfile } from './types';
import { startChatSession, analyzeUserProgress, generateDailyChallenges } from './services/geminiService';
import { storageService } from '../services/storageService';
import { INITIAL_GREETING_FR, INITIAL_GREETING_MG } from './constants';
import { CheckCircle, AlertTriangle, Info, X } from 'lucide-react';

// Toast Component
interface ToastProps {
  message: string;
  type: 'success' | 'error' | 'info';
  onClose: () => void;
}

const Toast: React.FC<ToastProps> = ({ message, type, onClose }) => {
  useEffect(() => {
    const timer = setTimeout(onClose, 4000);
    return () => clearTimeout(timer);
  }, [onClose]);

  const bg = type === 'success' ? 'bg-emerald-500' : type === 'error' ? 'bg-red-500' : 'bg-indigo-500';
  const icon = type === 'success' ? <CheckCircle className="w-5 h-5" /> : type === 'error' ? <AlertTriangle className="w-5 h-5" /> : <Info className="w-5 h-5" />;

  return (
    <div className={`fixed top-6 right-6 z-[150] flex items-center gap-3 px-4 py-3 rounded-xl shadow-2xl text-white ${bg} animate-fade-in-down transition-all`}>
      {icon}
      <span className="font-medium text-sm">{message}</span>
      <button onClick={onClose} className="p-1 hover:bg-white/20 rounded-full"><X className="w-4 h-4" /></button>
    </div>
  );
};

const App: React.FC = () => {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isSessionStarted, setIsSessionStarted] = useState(false);
  const [showProfile, setShowProfile] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [showAuth, setShowAuth] = useState(false);
  const [isAdminMode, setIsAdminMode] = useState(false);
  
  // Global Notification State
  const [toast, setToast] = useState<{message: string, type: 'success' | 'error' | 'info'} | null>(null);

  const notify = (message: string, type: 'success' | 'error' | 'info' = 'info') => {
    setToast({ message, type });
  };

  const [isDarkMode, setIsDarkMode] = useState(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('theme') === 'dark';
    }
    return false;
  });

  useEffect(() => {
    const root = document.documentElement;
    if (isDarkMode) { root.classList.add('dark'); localStorage.setItem('theme', 'dark'); } 
    else { root.classList.remove('dark'); localStorage.setItem('theme', 'light'); }
  }, [isDarkMode]);

  const toggleTheme = () => setIsDarkMode(prev => !prev);

  useEffect(() => {
    const currentUser = storageService.getCurrentUser();
    if (currentUser) {
      setUser(currentUser);
      if (currentUser.role === 'admin') setIsAdminMode(true);
      if (currentUser.preferences && currentUser.role !== 'admin') {
        initializeSession(currentUser, currentUser.preferences);
      }
    }
  }, []);

  useEffect(() => {
    if (user) { storageService.saveUserProfile(user); }
  }, [user]);

  useEffect(() => {
    const checkDailyChallenges = async () => {
        if (!user || !user.preferences || user.role === 'admin') return;
        const today = new Date().toISOString().split('T')[0];
        if (!user.lastChallengeDate || user.lastChallengeDate !== today || !user.dailyChallenges) {
            try {
                const newChallenges = await generateDailyChallenges(user.preferences);
                setUser({ ...user, dailyChallenges: newChallenges, lastChallengeDate: today });
            } catch (e) { console.error("Failed to generate challenges", e); }
        }
    };
    checkDailyChallenges();
  }, [user?.id, user?.preferences]);

  const initializeSession = async (userProfile: UserProfile, prefs: UserPreferences) => {
    const history = storageService.getChatHistory(userProfile.id);
    setMessages(history);
    try {
      await startChatSession(userProfile, prefs, history);
      if (history.length === 0) {
        const greeting = prefs.explanationLanguage === ExplanationLanguage.French ? INITIAL_GREETING_FR : INITIAL_GREETING_MG;
        const initialMsg: ChatMessage = { id: 'init', role: 'model', text: greeting + ` (${prefs.targetLanguage} - ${prefs.level})`, timestamp: Date.now() };
        const newHistory = [initialMsg];
        setMessages(newHistory);
        storageService.saveChatHistory(userProfile.id, newHistory);
      }
      setIsSessionStarted(true);
    } catch (error) { console.error(error); }
  };

  const handleAuthSuccess = (loggedInUser: UserProfile) => {
    setUser(loggedInUser);
    setShowAuth(false);
    notify(`Bienvenue, ${loggedInUser.username} !`, 'success');
    if (loggedInUser.role === 'admin') {
        setIsAdminMode(true);
    } else if (loggedInUser.preferences) {
      initializeSession(loggedInUser, loggedInUser.preferences);
    }
  };

  const handleOnboardingComplete = async (prefs: UserPreferences) => {
    if (!user) return;
    const updatedUser = { ...user, preferences: prefs };
    setUser(updatedUser);
    notify("Profil configuré avec succès !", 'success');
    await initializeSession(updatedUser, prefs);
  };

  const handleUpdateUser = (updatedUser: UserProfile) => { setUser(updatedUser); };
  
  const handleChangeLanguage = () => {
      if (!user) return;
      const updatedUser = { ...user, preferences: null };
      setUser(updatedUser);
      setMessages([]); 
      setIsSessionStarted(false);
  };

  const handleUpdateChallengeProgress = (type: 'message_count' | 'lesson_complete' | 'vocabulary') => {
      if (!user || !user.dailyChallenges) return;
      let xpGained = 0;
      let updated = false;
      const updatedChallenges = user.dailyChallenges.map(c => {
          if (c.type === type && !c.isCompleted) {
              const newCount = c.currentCount + 1;
              if (newCount >= c.targetCount) { 
                  xpGained += c.xpReward; 
                  updated = true; 
                  notify(`Défi complété : +${c.xpReward} XP`, 'success');
                  return { ...c, currentCount: newCount, isCompleted: true }; 
              }
              return { ...c, currentCount: newCount };
          }
          return c;
      });
      if (updated) {
          setUser({ ...user, dailyChallenges: updatedChallenges, stats: { ...user.stats, xp: user.stats.xp + xpGained } });
      }
  };

  const handleEndSession = async () => {
    if (!user) return;
    if (messages.length > 2 && user.role !== 'admin') {
        setIsAnalyzing(true);
        try {
            const { newMemory, xpEarned, feedback } = await analyzeUserProgress(messages, user.aiMemory, user.id);
            if (user.preferences?.mode === 'Course') handleUpdateChallengeProgress('lesson_complete');
            const updatedUser: UserProfile = {
                ...user,
                aiMemory: newMemory,
                stats: { ...user.stats, xp: user.stats.xp + xpEarned, lessonsCompleted: user.stats.lessonsCompleted + (user.preferences?.mode === 'Course' ? 1 : 0) },
                preferences: null
            };
            setUser(updatedUser);
            notify(`Session terminée ! +${xpEarned} XP`, 'success');
        } catch (e) { setUser({ ...user, preferences: null }); } finally { setIsAnalyzing(false); setIsSessionStarted(false); setMessages([]); }
    } else {
        setUser({ ...user, preferences: null }); setIsSessionStarted(false); setMessages([]);
    }
  };

  const handleLogout = () => {
      storageService.logout();
      setUser(null); setIsSessionStarted(false); setMessages([]); setShowAuth(false); setShowProfile(false); setIsAdminMode(false);
      notify("Déconnexion réussie.", 'info');
  };

  const handleFontSizeChange = (size: 'small' | 'normal' | 'large' | 'xl') => {
      if (!user) return;
      setUser({ ...user, preferences: { ...(user.preferences || {}), fontSize: size } as UserPreferences });
  };
  
  const currentFontSize = user?.preferences?.fontSize || 'normal';

  return (
    <>
        {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
        
        {user && isAdminMode ? (
            <AdminDashboard 
                currentUser={user} 
                onLogout={handleLogout} 
                onBack={() => setIsAdminMode(false)}
                isDarkMode={isDarkMode}
                notify={notify}
            />
        ) : !user && !showAuth ? (
            <LandingPage onStart={() => setShowAuth(true)} isDarkMode={isDarkMode} toggleTheme={toggleTheme} />
        ) : !user && showAuth ? (
            <AuthScreen onAuthSuccess={handleAuthSuccess} onBack={() => setShowAuth(false)} isDarkMode={isDarkMode} toggleTheme={toggleTheme} notify={notify} />
        ) : user && (!user.preferences || !isSessionStarted) ? (
            <>
                {user && showProfile && (
                    <SmartDashboard user={user} messages={messages} onClose={() => setShowProfile(false)} onUpgrade={() => {}} onUpdateUser={handleUpdateUser} onLogout={handleLogout} isDarkMode={isDarkMode} toggleTheme={toggleTheme} fontSize={currentFontSize} onFontSizeChange={handleFontSizeChange} notify={notify} />
                )}
                <Onboarding onComplete={handleOnboardingComplete} isDarkMode={isDarkMode} toggleTheme={toggleTheme} />
            </>
        ) : user && user.preferences ? (
            <>
                {user && showProfile && (
                    <SmartDashboard user={user} messages={messages} onClose={() => setShowProfile(false)} onUpgrade={() => {}} onUpdateUser={handleUpdateUser} onLogout={handleLogout} isDarkMode={isDarkMode} toggleTheme={toggleTheme} fontSize={currentFontSize} onFontSizeChange={handleFontSizeChange} notify={notify} />
                )}
                <ChatInterface user={user} messages={messages} setMessages={setMessages} onChangeMode={handleEndSession} onChangeLanguage={handleChangeLanguage} onLogout={handleLogout} onUpdateUser={handleUpdateUser} onShowProfile={() => setShowProfile(true)} isDarkMode={isDarkMode} toggleTheme={toggleTheme} isAnalyzing={isAnalyzing} onMessageSent={() => handleUpdateChallengeProgress('message_count')} fontSize={currentFontSize} notify={notify} />
            </>
        ) : null}
    </>
  );
};

export default App;
