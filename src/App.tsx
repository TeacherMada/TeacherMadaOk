import React, { useState, useEffect } from 'react';
import LandingPage from './components/LandingPage';
import AuthScreen from './components/AuthScreen';
import Onboarding from './components/Onboarding';
import ChatInterface from './components/ChatInterface';
import SmartDashboard from './components/SmartDashboard';
import AdminDashboard from './components/AdminDashboard';
import { UserPreferences, ChatMessage, UserProfile, LearningMode } from './types';
import { analyzeUserProgress, generateDailyChallenges } from './services/geminiService';
import { storageService } from './services/storageService';
import { CheckCircle, AlertTriangle, Info, X } from 'lucide-react';

const Toast: React.FC<{message: string, type: string, onClose: () => void}> = ({ message, type, onClose }) => {
  useEffect(() => { const t = setTimeout(onClose, 4000); return () => clearTimeout(t); }, [onClose]);
  const bg = type === 'success' ? 'bg-emerald-500' : type === 'error' ? 'bg-red-500' : 'bg-indigo-500';
  return (
    <div className={`fixed top-6 right-6 z-[150] flex items-center gap-3 px-4 py-3 rounded-xl shadow-2xl text-white ${bg} animate-fade-in`}>
      <span className="font-medium text-sm">{message}</span>
      <button onClick={onClose} className="p-1 hover:bg-white/20 rounded-full"><X className="w-4 h-4" /></button>
    </div>
  );
};

const App: React.FC = () => {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]); // FIX: Typage explicite ici
  const [isSessionStarted, setIsSessionStarted] = useState(false);
  const [showProfile, setShowProfile] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [showAuth, setShowAuth] = useState(false);
  const [isAdminMode, setIsAdminMode] = useState(false);
  const [toast, setToast] = useState<{message: string, type: string} | null>(null);

  const notify = (message: string, type: string = 'info') => setToast({ message, type });

  const [isDarkMode, setIsDarkMode] = useState(() => localStorage.getItem('theme') === 'dark');
  useEffect(() => {
    document.documentElement.classList.toggle('dark', isDarkMode);
    localStorage.setItem('theme', isDarkMode ? 'dark' : 'light');
  }, [isDarkMode]);

  useEffect(() => {
    const curr = storageService.getCurrentUser();
    if (curr) {
      setUser(curr);
      if (curr.role === 'admin') setIsAdminMode(true);
      else if (curr.preferences) initializeSession(curr, curr.preferences);
    }
  }, []);

  const initializeSession = async (profile: UserProfile, prefs: UserPreferences) => {
    const history = storageService.getChatHistory(profile.id, prefs.targetLanguage);
    setMessages(history);
    if (history.length === 0) {
        const init: ChatMessage = { id: 'init', role: 'model', text: "Bonjour ! Prêt à apprendre ?", timestamp: Date.now() };
        setMessages([init]);
        storageService.saveChatHistory(profile.id, [init], prefs.targetLanguage);
    }
    setIsSessionStarted(true);
  };

  const handleEndSession = async () => {
    if (!user) return;
    setIsAnalyzing(true);
    try {
        const { newMemory, xpEarned } = await analyzeUserProgress(messages, user.aiMemory, user.id);
        const updated: UserProfile = { ...user, aiMemory: newMemory, stats: { ...user.stats, xp: user.stats.xp + xpEarned }, preferences: null };
        setUser(updated);
        storageService.saveUserProfile(updated);
    } catch (e) { setUser({ ...user, preferences: null }); }
    finally { setIsAnalyzing(false); setIsSessionStarted(false); setMessages([]); }
  };

  return (
    <>
        {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
        {user && isAdminMode ? (
            <AdminDashboard currentUser={user} onLogout={() => { storageService.logout(); setUser(null); }} onBack={() => setIsAdminMode(false)} isDarkMode={isDarkMode} notify={notify} />
        ) : !user && !showAuth ? (
            <LandingPage onStart={() => setShowAuth(true)} isDarkMode={isDarkMode} toggleTheme={() => setIsDarkMode(!isDarkMode)} />
        ) : !user && showAuth ? (
            <AuthScreen onAuthSuccess={(u) => { setUser(u); setShowAuth(false); if(u.role === 'admin') setIsAdminMode(true); else if(u.preferences) initializeSession(u, u.preferences); }} onBack={() => setShowAuth(false)} isDarkMode={isDarkMode} toggleTheme={() => setIsDarkMode(!isDarkMode)} notify={notify} />
        ) : user && (!user.preferences || !isSessionStarted) ? (
            <>
                {showProfile && <SmartDashboard user={user} messages={messages} onClose={() => setShowProfile(false)} onUpgrade={() => {}} onUpdateUser={setUser} onLogout={() => { storageService.logout(); setUser(null); }} isDarkMode={isDarkMode} toggleTheme={() => setIsDarkMode(!isDarkMode)} fontSize={user.preferences?.fontSize || 'normal'} onFontSizeChange={() => {}} notify={notify} />}
                <Onboarding onComplete={(p) => { const u = {...user, preferences: p}; setUser(u); storageService.updatePreferences(u.id, p); initializeSession(u, p); }} isDarkMode={isDarkMode} toggleTheme={() => setIsDarkMode(!isDarkMode)} />
            </>
        ) : user && user.preferences ? (
            <>
                {showProfile && <SmartDashboard user={user} messages={messages} onClose={() => setShowProfile(false)} onUpgrade={() => {}} onUpdateUser={setUser} onLogout={() => { storageService.logout(); setUser(null); }} isDarkMode={isDarkMode} toggleTheme={() => setIsDarkMode(!isDarkMode)} fontSize={user.preferences?.fontSize || 'normal'} onFontSizeChange={() => {}} notify={notify} />}
                <ChatInterface user={user} messages={messages} setMessages={setMessages} onChangeMode={handleEndSession} onShowProfile={() => setShowProfile(true)} onUpdateUser={setUser} isDarkMode={isDarkMode} toggleTheme={() => setIsDarkMode(!isDarkMode)} isAnalyzing={isAnalyzing} onMessageSent={() => {}} fontSize={user.preferences.fontSize || 'normal'} notify={notify} />
            </>
        ) : null}
    </>
  );
};

export default App;