
import React, { useState, useEffect } from 'react';
import { UserProfile, ChatMessage } from './types';
import { storageService } from './services/storageService';
import LandingPage from './components/LandingPage';
import AuthScreen from './components/AuthScreen';
import Onboarding from './components/Onboarding';
import ChatInterface from './components/ChatInterface';
import SmartDashboard from './components/SmartDashboard';
import { Toaster } from './components/Toaster';
import { X } from 'lucide-react';

const App: React.FC = () => {
  const [user, setUser] = useState<UserProfile | null>(storageService.getLocalUser());
  const [isDarkMode, setIsDarkMode] = useState(() => localStorage.getItem('theme') === 'dark');
  const [view, setView] = useState<'landing' | 'auth' | 'chat'>('landing');
  const [showDashboard, setShowDashboard] = useState(false);

  useEffect(() => {
    document.documentElement.classList.toggle('dark', isDarkMode);
    localStorage.setItem('theme', isDarkMode ? 'dark' : 'light');
  }, [isDarkMode]);

  const handleLogin = (u: UserProfile) => {
    setUser(u);
    storageService.saveLocalUser(u);
    setView('chat');
  };

  const handleLogout = () => {
    storageService.logout();
    setUser(null);
    setView('landing');
    setShowDashboard(false);
  };

  const renderContent = () => {
    if (!user && view === 'landing') return <LandingPage onStart={() => setView('auth')} isDarkMode={isDarkMode} toggleTheme={() => setIsDarkMode(!isDarkMode)} />;
    
    if (!user && view === 'auth') return (
      <AuthScreen 
        onBack={() => setView('landing')} 
        onAuthSuccess={handleLogin}
        isDarkMode={isDarkMode}
        toggleTheme={() => setIsDarkMode(!isDarkMode)}
        notify={(m, t) => {}} // Legacy prop from prev versions, handled by Toaster now
      />
    );
    
    if (user && !user.preferences) return (
      <Onboarding 
        onComplete={(prefs) => {
          const updated = { ...user, preferences: prefs };
          setUser(updated);
          storageService.saveLocalUser(updated);
          setView('chat');
        }} 
        isDarkMode={isDarkMode}
        toggleTheme={() => setIsDarkMode(!isDarkMode)}
      />
    );
    
    if (user && user.preferences) return (
      <>
        <ChatInterface 
          user={user} 
          onUpdateUser={(u) => { setUser(u); storageService.saveLocalUser(u); }}
          onShowDashboard={() => setShowDashboard(true)}
          isDarkMode={isDarkMode}
          toggleTheme={() => setIsDarkMode(!isDarkMode)}
        />
        {showDashboard && (
          <SmartDashboard 
            user={user} 
            onClose={() => setShowDashboard(false)} 
            onLogout={handleLogout}
            onUpdateUser={(u) => { setUser(u); storageService.saveLocalUser(u); }}
            isDarkMode={isDarkMode}
            toggleTheme={() => setIsDarkMode(!isDarkMode)}
          />
        )}
      </>
    );

    return <LandingPage onStart={() => setView('auth')} isDarkMode={isDarkMode} toggleTheme={() => setIsDarkMode(!isDarkMode)} />;
  };

  return (
    <div className="min-h-screen flex flex-col bg-white dark:bg-slate-950 transition-colors duration-300">
      <Toaster />
      {renderContent()}
    </div>
  );
};

export default App;