
import React, { useState, useEffect, useCallback } from 'react';
import LandingPage from './components/LandingPage';
import AuthScreen from './components/AuthScreen';
import Onboarding from './components/Onboarding';
import ChatInterface from './components/ChatInterface';
import SmartDashboard from './components/SmartDashboard';
import ExerciseSession from './components/ExerciseSession';
import DialogueSession from './components/DialogueSession';
import PaymentModal from './components/PaymentModal';
import AdminDashboard from './components/AdminDashboard';
import { UserProfile, LearningSession, ExerciseItem, UserStats } from './types';
import { storageService } from './services/storageService';
import { generateExerciseFromHistory } from './services/geminiService';
import { Toaster, toast } from './components/Toaster';
import { Loader2 } from 'lucide-react';

const App: React.FC = () => {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [currentSession, setCurrentSession] = useState<LearningSession | null>(null);
  const [showAuth, setShowAuth] = useState(false);
  const [showDashboard, setShowDashboard] = useState(false);
  const [showPayment, setShowPayment] = useState(false);
  const [showAdmin, setShowAdmin] = useState(false);
  
  // Modes
  const [activeMode, setActiveMode] = useState<'chat' | 'exercise' | 'practice'>('chat');
  const [currentExercises, setCurrentExercises] = useState<ExerciseItem[]>([]);
  const [isGeneratingExercise, setIsGeneratingExercise] = useState(false);

  const [isDarkMode, setIsDarkMode] = useState(() => localStorage.getItem('tm_theme') === 'dark');

  // Robust User Update Handler: Prevents overwriting valid preferences with incomplete data
  // This fixes the bug where updates (like credits) cause a redirect to onboarding
  const safeSetUser = useCallback((updated: UserProfile | ((prev: UserProfile | null) => UserProfile | null)) => {
      setUser(current => {
          const nextUser = typeof updated === 'function' ? updated(current) : updated;
          
          if (!nextUser) return null;
          if (!current) return nextUser;

          // If IDs match, check for data integrity
          if (current.id === nextUser.id) {
              const isRemoteInvalid = !nextUser.preferences || !nextUser.preferences.targetLanguage;
              const isLocalValid = current.preferences && current.preferences.targetLanguage;

              if (isRemoteInvalid && isLocalValid) {
                  // Merge: Keep the new data (credits, stats) but preserve valid preferences
                  return { ...nextUser, preferences: current.preferences };
              }
          }
          return nextUser;
      });
  }, []);

  // Load User & Theme & Subscribe to Updates
  useEffect(() => {
    const init = async () => {
        const curr = await storageService.getCurrentUser();
        if (curr) safeSetUser(curr);
    };
    init();
    
    // Global Event Listener for User Updates (Credits, Stats, etc.)
    const unsubscribe = storageService.subscribeToUserUpdates((updatedUser) => {
        safeSetUser(updatedUser);
    });
    
    document.documentElement.classList.toggle('dark', isDarkMode);
    localStorage.setItem('tm_theme', isDarkMode ? 'dark' : 'light');

    return () => {
        unsubscribe();
    };
  }, [isDarkMode, safeSetUser]);

  // Refresh User Data on Focus
  useEffect(() => {
      const handleFocus = async () => {
          if (user) {
              const updated = await storageService.getUserById(user.id);
              if (updated) {
                  safeSetUser(updated);
                  if (updated.credits !== user.credits || updated.isSuspended !== user.isSuspended) {
                      // Optional: toast.info("Données synchronisées.");
                  }
              }
          }
      };
      window.addEventListener('focus', handleFocus);
      return () => window.removeEventListener('focus', handleFocus);
  }, [user, safeSetUser]);

  const notify = (msg: string, type: string = 'info') => {
    if (type === 'error') toast.error(msg);
    else if (type === 'success') toast.success(msg);
    else toast.info(msg);
  };

  const handleAuthSuccess = (u: UserProfile) => {
    safeSetUser(u);
    setShowAuth(false);
    // Ensure we start a session if user is already setup
    if (u.preferences && u.preferences.targetLanguage) {
        const session = storageService.getOrCreateSession(u.id, u.preferences);
        setCurrentSession(session);
    }
  };

  // Logic to handle Course Change: Save current stats to history, reset target
  const handleChangeCourse = async () => {
      if (!user) return;
      
      const currentLang = user.preferences?.targetLanguage;
      const currentHistory = user.preferences?.history || {};
      
      // Save progress for current language
      if (currentLang) {
          currentHistory[currentLang] = user.stats;
      }

      // Reset active stats to 0 (or undefined) for safety until next selection
      const emptyStats: UserStats = { lessonsCompleted: 0, exercisesCompleted: 0, dialoguesCompleted: 0 };

      // Update user: keep history, unset targetLanguage
      const updatedUser: UserProfile = {
          ...user,
          stats: emptyStats,
          preferences: {
              ...user.preferences!,
              targetLanguage: '', // Clears target
              level: '',
              history: currentHistory
          }
      };

      safeSetUser(updatedUser);
      await storageService.saveUserProfile(updatedUser);
      setCurrentSession(null);
  };

  const handleOnboardingComplete = async (prefs: any) => {
    if (!user) return;

    const selectedLang = prefs.targetLanguage;
    const history = user.preferences?.history || {};
    
    // Restore stats if they exist for this language
    const restoredStats = history[selectedLang] || { 
        lessonsCompleted: 0, 
        exercisesCompleted: 0, 
        dialoguesCompleted: 0 
    };

    const updated = { 
        ...user, 
        stats: restoredStats,
        preferences: { 
            ...prefs, 
            history: history // Preserve history object
        } 
    };

    safeSetUser(updated);
    await storageService.saveUserProfile(updated);
    
    // Start session
    const session = storageService.getOrCreateSession(user.id, updated.preferences!);
    setCurrentSession(session);
  };

  const handleLogout = async () => {
    await storageService.logout();
    safeSetUser(null);
    setCurrentSession(null);
    setShowDashboard(false);
    setShowAdmin(false);
    setActiveMode('chat');
  };

  // --- FEATURE HANDLERS ---

  const startExercise = async () => {
      if (!user || !currentSession) return;
      setIsGeneratingExercise(true);
      try {
          const exercises = await generateExerciseFromHistory(currentSession.messages, user);
          if (exercises.length > 0) {
              setCurrentExercises(exercises);
              setActiveMode('exercise');
          } else {
              toast.error("Impossible de générer des exercices (Contexte insuffisant ou erreur).");
          }
      } catch (e) {
          toast.error("Erreur lors de la génération.");
      } finally {
          setIsGeneratingExercise(false);
      }
  };

  const finishExercise = async (score: number, total: number) => {
      if (user) {
          const newStats = {
              ...user.stats,
              exercisesCompleted: (user.stats.exercisesCompleted || 0) + 1
          };
          
          // Update History for current language as well
          const currentLang = user.preferences?.targetLanguage;
          const currentHistory = user.preferences?.history || {};
          if (currentLang) {
              currentHistory[currentLang] = newStats;
          }

          const updatedUser = { 
              ...user, 
              stats: newStats,
              preferences: {
                  ...user.preferences!,
                  history: currentHistory
              }
          };

          await storageService.saveUserProfile(updatedUser);
          safeSetUser(updatedUser);
          toast.success(`Exercice terminé ! Score : ${score}/${total}`);
      }
      setActiveMode('chat');
  };

  // Helper to check if onboarding is needed
  // STRICT check: Must have preferences AND targetLanguage
  const needsOnboarding = !user?.preferences || !user?.preferences?.targetLanguage;

  if (showAdmin && user?.role === 'admin') {
      return (
          <div className="min-h-screen bg-slate-50 dark:bg-slate-950 font-sans transition-colors duration-300">
              <Toaster />
              <AdminDashboard 
                  currentUser={user}
                  onBack={() => setShowAdmin(false)}
                  onLogout={handleLogout}
                  isDarkMode={isDarkMode}
                  notify={notify}
              />
          </div>
      );
  }

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-50 font-sans transition-colors duration-300">
      <Toaster />

      {isGeneratingExercise && (
          <div className="fixed inset-0 z-[200] bg-slate-900/80 backdrop-blur-sm flex flex-col items-center justify-center text-white">
              <Loader2 className="w-12 h-12 animate-spin mb-4 text-indigo-500" />
              <p className="font-bold text-lg">Un prof prépare vos exercices...</p>
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

      {user && needsOnboarding && (
        <Onboarding 
          onComplete={handleOnboardingComplete} 
          isDarkMode={isDarkMode} 
          toggleTheme={() => setIsDarkMode(!isDarkMode)} 
        />
      )}

      {user && !needsOnboarding && currentSession && (
        <>
          {activeMode === 'chat' && (
              <ChatInterface 
                user={user} 
                session={currentSession} 
                onShowProfile={() => setShowDashboard(true)}
                onExit={() => setCurrentSession(null)}
                onUpdateUser={safeSetUser}
                onStartPractice={() => setActiveMode('practice')}
                onStartExercise={startExercise}
                notify={notify}
                onShowPayment={() => setShowPayment(true)}
                onChangeCourse={handleChangeCourse}
              />
          )}

          {activeMode === 'exercise' && (
              <ExerciseSession 
                  exercises={currentExercises}
                  onClose={() => setActiveMode('chat')}
                  onComplete={finishExercise}
              />
          )}

          {activeMode === 'practice' && (
              <DialogueSession 
                  user={user}
                  onClose={() => setActiveMode('chat')}
                  onUpdateUser={safeSetUser}
                  notify={notify}
                  onShowPayment={() => setShowPayment(true)}
              />
          )}

          {showDashboard && (
            <SmartDashboard 
              user={user} 
              onClose={() => setShowDashboard(false)} 
              onUpdateUser={safeSetUser} 
              onLogout={handleLogout}
              isDarkMode={isDarkMode} 
              toggleTheme={() => setIsDarkMode(!isDarkMode)}
              messages={currentSession.messages}
              onOpenAdmin={() => { setShowDashboard(false); setShowAdmin(true); }}
              onShowPayment={() => { setShowDashboard(false); setShowPayment(true); }}
            />
          )}

          {showPayment && (
              <PaymentModal 
                  user={user}
                  onClose={() => setShowPayment(false)}
              />
          )}
        </>
      )}

      {/* Session Resume Screen */}
      {user && !needsOnboarding && !currentSession && !showAdmin && (
        <div className="h-screen flex flex-col items-center justify-center p-6 bg-white dark:bg-slate-900 animate-fade-in">
           <div className="w-20 h-20 bg-indigo-600 rounded-[2rem] flex items-center justify-center text-white mb-8 shadow-2xl shadow-indigo-500/40">
             <img src="https://i.ibb.co/B2XmRwmJ/logo.png" className="w-12 h-12" />
           </div>
           <h1 className="text-2xl font-black mb-2">Bon retour, {user.username} !</h1>
           <p className="text-slate-500 mb-10 text-center">Prêt à continuer votre apprentissage du {user.preferences?.targetLanguage} ?</p>
           
           <div className="space-y-4 w-full max-w-sm">
             <button 
                onClick={() => setCurrentSession(storageService.getOrCreateSession(user.id, user.preferences!))}
                className="w-full py-5 bg-indigo-600 text-white font-black rounded-2xl shadow-xl shadow-indigo-500/20 hover:scale-[1.02] transition-all"
             >
               Reprendre mon cours
             </button>
             <button 
                onClick={handleChangeCourse}
                className="w-full py-4 text-slate-500 font-bold hover:text-indigo-600 transition-colors"
             >
               Changer de langue ou niveau
             </button>
             <button onClick={handleLogout} className="w-full py-2 text-red-500 text-sm font-bold">Déconnexion</button>
           </div>
        </div>
      )}
    </div>
  );
};

export default App;
