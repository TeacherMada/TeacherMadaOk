
import React, { useState, useEffect } from 'react';
import LandingPage from './components/LandingPage';
import AuthScreen from './components/AuthScreen';
import Onboarding from './components/Onboarding';
import ChatInterface from './components/ChatInterface';
import SmartDashboard from './components/SmartDashboard';
import { UserProfile, LearningSession, ChatMessage } from './types';
import { storageService } from './services/storageService';
import { X } from 'lucide-react';

const App: React.FC = () => {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [currentSession, setCurrentSession] = useState<LearningSession | null>(null);
  const [showAuth, setShowAuth] = useState(false);
  const [showDashboard, setShowDashboard] = useState(false);
  const [isDarkMode, setIsDarkMode] = useState(() => localStorage.getItem('tm_theme') === 'dark');
  const [toast, setToast] = useState<{msg: string, type: string} | null>(null);

  useEffect(() => {
    const curr = storageService.getCurrentUser();
    if (curr) setUser(curr);
    document.documentElement.classList.toggle('dark', isDarkMode);
    localStorage.setItem('tm_theme', isDarkMode ? 'dark' : 'light');
  }, [isDarkMode]);

  const notify = (msg: string, type: string = 'info') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3500);
  };

  const handleAuthSuccess = (u: UserProfile) => {
    setUser(u);
    setShowAuth(false);
    if (u.preferences) {
        const session = storageService.getOrCreateSession(u.id, u.preferences);
        setCurrentSession(session);
    }
  };

  const handleOnboardingComplete = (prefs: any) => {
    if (!user) return;
    const updated = { ...user, preferences: prefs };
    setUser(updated);
    storageService.saveUserProfile(updated);
    const session = storageService.getOrCreateSession(user.id, prefs);
    setCurrentSession(session);
  };

  const handleLogout = () => {
    storageService.logout();
    setUser(null);
    setCurrentSession(null);
    setShowDashboard(false);
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-50 font-sans transition-colors duration-300">
      {/* Universal Toast */}
      {toast && (
        <div className={`fixed top-6 right-6 z-[200] flex items-center gap-3 px-5 py-4 rounded-2xl shadow-2xl text-white animate-fade-in-up ${toast.type === 'error' ? 'bg-red-500' : 'bg-indigo-600'}`}>
          <span className="font-bold text-sm">{toast.msg}</span>
          <button onClick={() => setToast(null)}><X size={16} /></button>
        </div>
      )}

      {!user && !showAuth && (
        <LandingPage onStart={() => setShowAuth(true)} isDarkMode={isDarkMode} toggleTheme={() => setIsDarkMode(!isDarkMode)} />
      )}

      {!user && showAuth && (
        <AuthScreen 
          onAuthSuccess={handleAuthSuccess} 
          onBack={() => setShowAuth(false)} 
          isDarkMode={isDarkMode} 
          toggleTheme={() => setIsDarkMode(!isDarkMode)} 
          notify={notify} 
        />
      )}

      {user && !user.preferences && (
        <Onboarding 
          onComplete={handleOnboardingComplete} 
          isDarkMode={isDarkMode} 
          toggleTheme={() => setIsDarkMode(!isDarkMode)} 
        />
      )}

      {user && user.preferences && currentSession && (
        <>
          <ChatInterface 
            user={user} 
            session={currentSession} 
            onShowProfile={() => setShowDashboard(true)}
            onExit={() => setCurrentSession(null)}
            onUpdateUser={setUser}
            notify={notify}
          />
          {showDashboard && (
            <SmartDashboard 
              user={user} 
              onClose={() => setShowDashboard(false)} 
              onUpdateUser={setUser} 
              onLogout={handleLogout}
              isDarkMode={isDarkMode} 
              toggleTheme={() => setIsDarkMode(!isDarkMode)}
              messages={currentSession.messages}
            />
          )}
        </>
      )}

      {/* Case where user has prefs but closed the chat session (Session Selector) */}
      {user && user.preferences && !currentSession && (
        <div className="h-screen flex flex-col items-center justify-center p-6 bg-white dark:bg-slate-900 animate-fade-in">
           <div className="w-20 h-20 bg-indigo-600 rounded-[2rem] flex items-center justify-center text-white mb-8 shadow-2xl shadow-indigo-500/40">
             <img src="https://i.ibb.co/B2XmRwmJ/logo.png" className="w-12 h-12" />
           </div>
           <h1 className="text-2xl font-black mb-2">Bon retour, {user.username} !</h1>
           <p className="text-slate-500 mb-10 text-center">Prêt à continuer votre apprentissage du {user.preferences.targetLanguage} ?</p>
           
           <div className="space-y-4 w-full max-w-sm">
             <button 
                onClick={() => setCurrentSession(storageService.getOrCreateSession(user.id, user.preferences!))}
                className="w-full py-5 bg-indigo-600 text-white font-black rounded-2xl shadow-xl shadow-indigo-500/20 hover:scale-[1.02] transition-all"
             >
               Reprendre mon cours
             </button>
             <button 
                onClick={() => {
                  const updated = {...user, preferences: null};
                  setUser(updated);
                  storageService.saveUserProfile(updated);
                }}
                className="w-full py-4 text-slate-500 font-bold hover:text-indigo-600 transition-colors"
             >
               Changer de langue ou niveau
             </button>
           </div>
        </div>
      )}
    </div>
  );
};

export default App;
