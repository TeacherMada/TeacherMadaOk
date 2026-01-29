
import React, { useState, useEffect } from 'react';
import LandingPage from './components/LandingPage';
import AuthScreen from './components/AuthScreen';
import Onboarding from './components/Onboarding';
import ChatInterface from './components/ChatInterface';
import SmartDashboard from './components/SmartDashboard';
import AdminDashboard from './components/AdminDashboard';
import { UserPreferences, ChatMessage, ExplanationLanguage, UserProfile, LearningMode } from './types';
import { startChatSession, generateDailyChallenges, analyzeUserProgress } from './services/geminiService';
import { storageService } from './services/storageService';
import { INITIAL_GREETING_FR, INITIAL_GREETING_MG } from './constants';
import { CheckCircle, AlertTriangle, Info, X } from 'lucide-react';

const Toast: React.FC<{message: string, type: 'success' | 'error' | 'info', onClose: () => void}> = ({ message, type, onClose }) => {
  useEffect(() => { const timer = setTimeout(onClose, 4000); return () => clearTimeout(timer); }, [onClose]);
  const bg = type === 'success' ? 'bg-emerald-500' : type === 'error' ? 'bg-red-500' : 'bg-indigo-500';
  return (
    <div className={`fixed top-6 right-6 z-[150] flex items-center gap-3 px-4 py-3 rounded-xl shadow-2xl text-white ${bg} animate-fade-in-down transition-all`}>
      <span className="font-medium text-sm">{message}</span>
      <button onClick={onClose}><X className="w-4 h-4" /></button>
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
  const [toast, setToast] = useState<{message: string, type: 'success' | 'error' | 'info'} | null>(null);

  const notify = (message: string, type: 'success' | 'error' | 'info' = 'info') => setToast({ message, type });

  const [isDarkMode, setIsDarkMode] = useState(() => localStorage.getItem('theme') === 'dark');
  useEffect(() => {
    document.documentElement.classList.toggle('dark', isDarkMode);
    localStorage.setItem('theme', isDarkMode ? 'dark' : 'light');
  }, [isDarkMode]);
  const toggleTheme = () => setIsDarkMode(prev => !prev);

  // Initial Auth Check with Supabase
  useEffect(() => {
    const initAuth = async () => {
        const currentUser = await storageService.getCurrentUser();
        if (currentUser) {
            setUser(currentUser);
            if (currentUser.role === 'admin') setIsAdminMode(true);
            if (currentUser.preferences && currentUser.role !== 'admin') {
                initializeSession(currentUser, currentUser.preferences);
            }
        }
    };
    initAuth();
  }, []);

  const initializeSession = async (userProfile: UserProfile, prefs: UserPreferences) => {
    // Fetch real history from Supabase
    const history = await storageService.getChatHistory(userProfile.id);
    setMessages(history);
    setIsSessionStarted(true);
  };

  const handleAuthSuccess = (loggedInUser: UserProfile) => {
    setUser(loggedInUser);
    setShowAuth(false);
    notify(`Bienvenue, ${loggedInUser.username} !`, 'success');
    if (loggedInUser.role === 'admin') setIsAdminMode(true);
    else if (loggedInUser.preferences) initializeSession(loggedInUser, loggedInUser.preferences);
  };

  const handleOnboardingComplete = async (prefs: UserPreferences) => {
    if (!user) return;
    const updatedUser = { ...user, preferences: prefs };
    await storageService.saveUserProfile(updatedUser); // Save to Supabase
    setUser(updatedUser);
    notify("Profil configuré !", 'success');
    await initializeSession(updatedUser, prefs);
  };

  const handleLogout = async () => {
      await storageService.logout();
      setUser(null); setIsSessionStarted(false); setMessages([]); setShowAuth(false); setShowProfile(false); setIsAdminMode(false);
      notify("Déconnexion réussie.", 'info');
  };

  const handleUpdateUser = (u: UserProfile) => setUser(u);
  const handleEndSession = async () => {
      if (!user) return;
      if (messages.length > 2 && user.role !== 'admin') {
        setIsAnalyzing(true);
        try {
            const { newMemory, xpEarned, feedback } = await analyzeUserProgress(messages, user.aiMemory, user.id);
            if (user.preferences?.mode === LearningMode.Course) {
                 // Challenge progress logic here if needed
            }
            const updatedUser: UserProfile = {
                ...user,
                aiMemory: newMemory,
                stats: { ...user.stats, xp: user.stats.xp + xpEarned, lessonsCompleted: user.stats.lessonsCompleted + (user.preferences?.mode === LearningMode.Course ? 1 : 0) },
                preferences: null
            };
            setUser(updatedUser);
            await storageService.saveUserProfile(updatedUser);
            notify(`Session terminée ! +${xpEarned} XP`, 'success');
        } catch (e) { setUser({ ...user, preferences: null }); } finally { setIsAnalyzing(false); setIsSessionStarted(false); setMessages([]); }
    } else {
        setUser({ ...user, preferences: null }); setIsSessionStarted(false); setMessages([]);
    }
  };
  const handleChangeLanguage = () => { if(user) setUser({...user, preferences: null}); setIsSessionStarted(false); };
  const handleFontSizeChange = (s: any) => { if(user && user.preferences) { const u = {...user, preferences: {...user.preferences, fontSize: s}}; setUser(u); storageService.saveUserProfile(u); }};

  return (
    <>
        {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
        
        {user && isAdminMode ? (
            <AdminDashboard currentUser={user} onLogout={handleLogout} onBack={() => setIsAdminMode(false)} isDarkMode={isDarkMode} notify={notify} />
        ) : !user && !showAuth ? (
            <LandingPage onStart={() => setShowAuth(true)} isDarkMode={isDarkMode} toggleTheme={toggleTheme} />
        ) : !user && showAuth ? (
            <AuthScreen onAuthSuccess={handleAuthSuccess} onBack={() => setShowAuth(false)} isDarkMode={isDarkMode} toggleTheme={toggleTheme} notify={notify} />
        ) : user && (!user.preferences || !isSessionStarted) ? (
            <>
                {user && showProfile && <SmartDashboard user={user} messages={messages} onClose={() => setShowProfile(false)} onUpgrade={() => {}} onUpdateUser={handleUpdateUser} onLogout={handleLogout} isDarkMode={isDarkMode} toggleTheme={toggleTheme} fontSize="normal" onFontSizeChange={handleFontSizeChange} notify={notify} />}
                <Onboarding onComplete={handleOnboardingComplete} isDarkMode={isDarkMode} toggleTheme={toggleTheme} />
            </>
        ) : user && user.preferences ? (
            <>
                {user && showProfile && <SmartDashboard user={user} messages={messages} onClose={() => setShowProfile(false)} onUpgrade={() => {}} onUpdateUser={handleUpdateUser} onLogout={handleLogout} isDarkMode={isDarkMode} toggleTheme={toggleTheme} fontSize={user.preferences.fontSize || 'normal'} onFontSizeChange={handleFontSizeChange} notify={notify} />}
                <ChatInterface user={user} messages={messages} setMessages={setMessages} onChangeMode={handleEndSession} onChangeLanguage={handleChangeLanguage} onLogout={handleLogout} onUpdateUser={handleUpdateUser} onShowProfile={() => setShowProfile(true)} isDarkMode={isDarkMode} toggleTheme={toggleTheme} isAnalyzing={isAnalyzing} onMessageSent={() => {}} fontSize={user.preferences.fontSize || 'normal'} notify={notify} />
            </>
        ) : null}
    </>
  );
};

export default App;
