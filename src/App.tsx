
import React, { useState, useEffect } from 'react';
import LandingPage from './components/LandingPage';
import AuthScreen from './components/AuthScreen';
import Onboarding from './components/Onboarding';
import ChatInterface from './components/ChatInterface';
import SmartDashboard from './components/SmartDashboard';
import { UserProfile, ChatMessage, UserPreferences } from './types';
import { storageService } from './services/storageService';
import { X } from 'lucide-react';

const App: React.FC = () => {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]); // Typage explicite
  const [showAuth, setShowAuth] = useState(false);
  const [showProfile, setShowProfile] = useState(false);
  const [isDarkMode, setIsDarkMode] = useState(() => localStorage.getItem('theme') === 'dark');
  const [toast, setToast] = useState<{msg: string, type: string} | null>(null);

  useEffect(() => {
    const curr = storageService.getCurrentUser();
    if (curr) {
      setUser(curr);
      if (curr.preferences) {
        setMessages(storageService.getChatHistory(curr.id, curr.preferences.targetLanguage));
      }
    }
    document.documentElement.classList.toggle('dark', isDarkMode);
  }, [isDarkMode]);

  const notify = (msg: string, type: string = 'info') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  };

  const handleAuth = (u: UserProfile) => {
    setUser(u);
    setShowAuth(false);
    if (u.preferences) setMessages(storageService.getChatHistory(u.id, u.preferences.targetLanguage));
  };

  const handleLogout = () => {
    storageService.logout();
    setUser(null);
    setMessages([]);
    setShowProfile(false);
  };

  return (
    <div className="min-h-screen transition-colors duration-300 bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-50">
      {toast && (
        <div className={`fixed top-4 right-4 z-[200] p-4 rounded-xl text-white shadow-2xl animate-fade-in ${toast.type === 'error' ? 'bg-red-500' : 'bg-indigo-600'}`}>
          {toast.msg}
        </div>
      )}

      {!user && !showAuth && <LandingPage onStart={() => setShowAuth(true)} isDarkMode={isDarkMode} toggleTheme={() => setIsDarkMode(!isDarkMode)} />}
      {!user && showAuth && <AuthScreen onAuthSuccess={handleAuth} onBack={() => setShowAuth(false)} isDarkMode={isDarkMode} toggleTheme={() => setIsDarkMode(!isDarkMode)} notify={notify} />}
      
      {user && !user.preferences && (
        <Onboarding onComplete={(p) => {
          const updated = { ...user, preferences: p };
          setUser(updated);
          storageService.saveUserProfile(updated);
          setMessages([{ id: 'init', role: 'model', text: "Bonjour ! Prêt à apprendre ?", timestamp: Date.now() }]);
        }} isDarkMode={isDarkMode} toggleTheme={() => setIsDarkMode(!isDarkMode)} />
      )}

      {user && user.preferences && (
        <>
          <ChatInterface 
            user={user} 
            messages={messages} 
            setMessages={setMessages} 
            onShowProfile={() => setShowProfile(true)}
            isDarkMode={isDarkMode}
            toggleTheme={() => setIsDarkMode(!isDarkMode)}
            notify={notify}
            onUpdateUser={setUser}
          />
          {showProfile && (
            <SmartDashboard 
              user={user} 
              onClose={() => setShowProfile(false)} 
              onUpdateUser={setUser}
              onLogout={handleLogout}
              isDarkMode={isDarkMode}
              toggleTheme={() => setIsDarkMode(!isDarkMode)}
              notify={notify}
              messages={messages}
            />
          )}
        </>
      )}
    </div>
  );
};

export default App;
