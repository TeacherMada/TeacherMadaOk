
import React, { useState, useEffect } from 'react';
import LandingPage from './components/LandingPage';
import AuthScreen from './components/AuthScreen';
import Onboarding from './components/Onboarding';
import ChatInterface from './components/ChatInterface';
import SmartDashboard from './components/SmartDashboard';
import AdminDashboard from './components/AdminDashboard';
import PaymentModal from './components/PaymentModal';
import { UserPreferences, ChatMessage, ExplanationLanguage, UserProfile, LearningMode } from './types';
import { startChatSession, analyzeUserProgress, generateDailyChallenges } from './services/geminiService';
import { storageService } from './services/storageService';
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
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [showAuth, setShowAuth] = useState(false);
  const [isAdminMode, setIsAdminMode] = useState(false);
  
  // Global Notification State
  const [toast, setToast] = useState<{message: string, type: 'success' | 'error' | 'info'} | null>(null);

  const notify = (message: string, type: 'success' | 'error' | 'info' = 'info') => {
    setToast({ message, type });
  };

  // Theme Management
  const [isDarkMode, setIsDarkMode] = useState(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('theme');
      if (!saved) return window.matchMedia('(prefers-color-scheme: dark)').matches;
      return saved === 'dark';
    }
    return false;
  });

  useEffect(() => {
    const root = document.documentElement;
    if (isDarkMode) {
        root.classList.add('dark');
        localStorage.setItem('theme', 'dark');
    } else {
        root.classList.remove('dark');
        localStorage.setItem('theme', 'light');
    }
  }, [isDarkMode]);

  const toggleTheme = () => setIsDarkMode(prev => !prev);

  useEffect(() => {
    const init = async () => {
        try {
            await storageService.fetchSystemSettings();
            storageService.seedAdmin();
            const currentUser = storageService.getCurrentUser();
            
            if (currentUser) {
              // Try cloud sync but fallback to local
              const syncedUser = await storageService.syncProfileFromCloud(currentUser.id).catch(() => null);
              const finalUser = syncedUser || currentUser;
              
              setUser(finalUser);
              
              if (finalUser.role === 'admin') setIsAdminMode(true);
              if (finalUser.preferences && finalUser.role !== 'admin') {
                initializeSession(finalUser, finalUser.preferences);
              }
            }
        } catch (error) {
            console.error("CRITICAL INIT ERROR:", error);
            // If critical data corruption, logout to reset state and fix white screen
            storageService.logout();
            setUser(null);
        }
    };
    init();
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
    let history = await storageService.loadChatHistoryFromCloud(userProfile.id, prefs.targetLanguage);
    
    if (history.length === 0) {
        history = storageService.getChatHistory(userProfile.id, prefs.targetLanguage);
    }
    
    setMessages(history);
    
    try {
      await startChatSession(userProfile, prefs, history);
      
      if (history.length === 0) {
        const greeting = prefs.explanationLanguage === ExplanationLanguage.French 
            ? `Bonjour ${userProfile.username} ! Prêt à commencer la Leçon 1 en ${prefs.targetLanguage} (${prefs.level}) ?`
            : `Salama i ${userProfile.username} ! Vonona hanomboka Lesona 1 amin'ny ${prefs.targetLanguage} ve ianao ?`;
            
        const initialMsg: ChatMessage = { 
            id: 'init', 
            role: 'model', 
            text: greeting, 
            timestamp: Date.now() 
        };
        const newHistory = [initialMsg];
        setMessages(newHistory);
        storageService.saveChatHistory(userProfile.id, newHistory, prefs.targetLanguage);
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
    
    // Only analyze and increment progress if there was substantial chat
    if (messages.length > 2 && user.role !== 'admin') {
        setIsAnalyzing(true);
        try {
            const { newMemory, xpEarned } = await analyzeUserProgress(messages, user.aiMemory, user.id);
            
            // Logic: Update the SPECIFIC progress key for this Course + Level
            let newProgressByLevel = { ...(user.stats.progressByLevel || {}) };
            let globalLessonIncrement = 0;

            if (user.preferences?.mode === LearningMode.Course && user.preferences.targetLanguage) {
                handleUpdateChallengeProgress('lesson_complete');
                globalLessonIncrement = 1; // Used for stats
                
                // Construct the unique key: "Language-Level"
                const courseKey = `${user.preferences.targetLanguage}-${user.preferences.level}`;
                
                // Increment specific lesson counter
                const currentLesson = newProgressByLevel[courseKey] || 0;
                newProgressByLevel[courseKey] = currentLesson + 1;
                
                console.log(`[Smart Progress] Upgrading ${courseKey} to Lesson ${currentLesson + 1}`);
            }
            
            const updatedUser: UserProfile = {
                ...user,
                aiMemory: newMemory,
                stats: { 
                    ...user.stats, 
                    xp: user.stats.xp + xpEarned, 
                    lessonsCompleted: user.stats.lessonsCompleted + globalLessonIncrement,
                    progressByLevel: newProgressByLevel // Save the granular progress
                },
                preferences: null // Reset preferences to allow mode/lang switch on next entry
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
        
        {/* GLOBAL PAYMENT MODAL */}
        {showPaymentModal && user && (
            <PaymentModal user={user} onClose={() => setShowPaymentModal(false)} />
        )}
        
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
                    <SmartDashboard 
                        user={user} 
                        messages={messages} 
                        onClose={() => setShowProfile(false)} 
                        onUpgrade={() => setShowPaymentModal(true)} 
                        onUpdateUser={handleUpdateUser} 
                        onLogout={handleLogout} 
                        isDarkMode={isDarkMode} 
                        toggleTheme={toggleTheme} 
                        fontSize={currentFontSize} 
                        onFontSizeChange={handleFontSizeChange} 
                        notify={notify} 
                    />
                )}
                <Onboarding onComplete={handleOnboardingComplete} isDarkMode={isDarkMode} toggleTheme={toggleTheme} />
            </>
        ) : user && user.preferences ? (
            <>
                {user && showProfile && (
                    <SmartDashboard 
                        user={user} 
                        messages={messages} 
                        onClose={() => setShowProfile(false)} 
                        onUpgrade={() => setShowPaymentModal(true)} 
                        onUpdateUser={handleUpdateUser} 
                        onLogout={handleLogout} 
                        isDarkMode={isDarkMode} 
                        toggleTheme={toggleTheme} 
                        fontSize={currentFontSize} 
                        onFontSizeChange={handleFontSizeChange} 
                        notify={notify} 
                    />
                )}
                <ChatInterface user={user} messages={messages} setMessages={setMessages} onChangeMode={handleEndSession} onChangeLanguage={handleChangeLanguage} onLogout={handleLogout} onUpdateUser={handleUpdateUser} onShowProfile={() => setShowProfile(true)} isDarkMode={isDarkMode} toggleTheme={toggleTheme} isAnalyzing={isAnalyzing} onMessageSent={() => handleUpdateChallengeProgress('message_count')} fontSize={currentFontSize} notify={notify} />
            </>
        ) : null}
    </>
  );
};

export default App;
