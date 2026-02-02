
import React, { useState, useEffect } from 'react';
import LandingPage from './components/LandingPage';
import AuthScreen from './components/AuthScreen';
import Onboarding from './components/Onboarding';
import ChatInterface from './components/ChatInterface';
import SmartDashboard from './components/SmartDashboard';
import { UserProfile, ChatMessage } from './types';
import { storageService } from './services/storageService';
import { X, Info, AlertTriangle, CheckCircle } from 'lucide-react';

const App: React.FC = () => {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]); // FIX: Typage explicite
  const [showAuth, setShowAuth] = useState(false);
  const [showProfile, setShowProfile] = useState(false);
  const [toast, setToast] = useState<{ m: string; t: string } | null>(null);
  const [isDarkMode, setIsDarkMode] = useState(() => localStorage.getItem('theme') === 'dark');

  useEffect(() => {
    const curr = storageService.getCurrentUser();
    if (curr) {
      setUser(curr);
      if (curr.preferences) {
        setMessages(storageService.getChatHistory(curr.id, curr.preferences.targetLanguage));
      }
    }
    document.documentElement.classList.toggle('dark', isDarkMode);
    localStorage.setItem('theme', isDarkMode ? 'dark' : 'light');
  }, [isDarkMode]);

  const notify = (m: string, t: string = 'info') => {
    setToast({ m, t });
    setTimeout(() => setToast(null), 4000);
  };

  const handleAuth = (u: UserProfile) => {
    setUser(u);
    setShowAuth(false);
    if (u.preferences) {
      setMessages(storageService.getChatHistory(u.id, u.preferences.targetLanguage));
    }
  };

  const handleLogout = () => {
    storageService.logout();
    setUser(null);
    setMessages([]);
    setShowProfile(false);
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-50 transition-all duration-300">
      {toast && (
        <div className={`fixed top-6 right-6 z-[200] flex items-center gap-3 px-4 py-3 rounded-2xl shadow-2xl text-white animate-fade-in ${toast.t === 'error' ? 'bg-red-500' : toast.t === 'success' ? 'bg-emerald-500' : 'bg-indigo-600'}`}>
          <span className="font-bold text-sm">{toast.m}</span>
          <button onClick={() => setToast(null)}><X className="w-4 h-4"/></button>
        </div>
      )}

      {!user && !showAuth && <LandingPage onStart={() => setShowAuth(true)} isDarkMode={isDarkMode} toggleTheme={() => setIsDarkMode(!isDarkMode)} />}
      {!user && showAuth && <AuthScreen onAuthSuccess={handleAuth} onBack={() => setShowAuth(false)} isDarkMode={isDarkMode} toggleTheme={() => setIsDarkMode(!isDarkMode)} notify={notify} />}
      
      {user && !user.preferences && (
        <Onboarding onComplete={(p) => {
          const updated = { ...user, preferences: p };
          setUser(updated);
          storageService.saveUserProfile(updated);
          const init: ChatMessage = { id: 'init', role: 'model', text: "Bonjour ! Prêt à apprendre ?", timestamp: Date.now() };
          setMessages([init]);
          storageService.saveChatHistory(user.id, [init], p.targetLanguage);
        }} isDarkMode={isDarkMode} toggleTheme={() => setIsDarkMode(!isDarkMode)} />
      )}

      {user && user.preferences && (
        <>
          <ChatInterface 
            user={user} messages={messages} setMessages={setMessages} 
            onShowProfile={() => setShowProfile(true)} 
            isDarkMode={isDarkMode} toggleTheme={() => setIsDarkMode(!isDarkMode)} 
            notify={notify} onUpdateUser={setUser}
          />
          {showProfile && (
            <SmartDashboard 
              user={user} onClose={() => setShowProfile(false)} 
              onUpdateUser={setUser} onLogout={handleLogout}
              isDarkMode={isDarkMode} toggleTheme={() => setIsDarkMode(!isDarkMode)}
              notify={notify} messages={messages}
            />
          )}
        </>
      )}
    </div>
  );
};

export default App;
