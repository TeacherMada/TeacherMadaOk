
import React, { useState, useEffect } from 'react';
import LandingPage from './components/LandingPage';
import AuthScreen from './components/AuthScreen';
import Onboarding from './components/Onboarding';
import ChatInterface from './components/ChatInterface';
import SmartDashboard from './components/SmartDashboard';
import ExerciseSession from './components/ExerciseSession';
import DialogueSession from './components/DialogueSession';
import PaymentModal from './components/PaymentModal';
import AdminDashboard from './components/AdminDashboard';
import TutorialAgent from './components/TutorialAgent';
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

  // Load User & Theme & Subscribe to Updates
  useEffect(() => {
    const init = async () => {
        const curr = await storageService.getCurrentUser();
        if (curr) setUser(curr);
    };
    init();
    
    // Global Event Listener for User Updates (Credits, Stats, etc.)
    const unsubscribe = storageService.subscribeToUserUpdates((updatedUser) => {
        if (user && updatedUser.id === user.id) {
            setUser(updatedUser);
        } else if (!user) {
            setUser(updatedUser);
        }
    });
    
    document.documentElement.classList.toggle('dark', isDarkMode);
    localStorage.setItem('tm_theme', isDarkMode ? 'dark' : 'light');

    return () => {
        unsubscribe();
    };
  }, [isDarkMode, user?.id]);

  // Refresh User Data on Focus
  useEffect(() => {
      const handleFocus = async () => {
          if (user) {
              const updated = await storageService.getUserById(user.id);
              if (updated) {
                  const isRemoteInvalid = !updated.preferences || !updated.preferences.targetLanguage;
                  const isLocalValid = user.preferences && user.preferences.targetLanguage;

                  if (isRemoteInvalid && isLocalValid) {
                      const safeUpdate = { ...updated, preferences: user.preferences };
                      setUser(safeUpdate);
                  } else if (
                      updated.credits !== user.credits || 
                      updated.isSuspended !== user.isSuspended ||
                      JSON.stringify(updated.stats) !== JSON.stringify(user.stats)
                  ) {
                      setUser(updated);
                      if(updated.isSuspended) toast.info("Votre compte a été mis à jour.");
                  }
              }
          }
      };
      window.addEventListener('focus', handleFocus);
      return () => window.removeEventListener('focus', handleFocus);
  }, [user]);

  const notify = (msg: string, type: string = 'info') => {
    if (type === 'error') toast.error(msg);
    else if (type === 'success') toast.success(msg);
    else toast.info(msg);
  };

  const handleAuthSuccess = (u: UserProfile) => {
    setUser(u);
    setShowAuth(false);
    if (u.preferences && u.preferences.targetLanguage) {
        const session = storageService.getOrCreateSession(u.id, u.preferences);
        setCurrentSession(session);
    }
  };

  const handleChangeCourse = async () => {
      if (!user) return;
      
      const currentLang = user.preferences?.targetLanguage;
      const currentHistory = user.preferences?.history || {};
      
      if (currentLang) {
          currentHistory[currentLang] = user.stats;
      }

      const emptyStats: UserStats = { lessonsCompleted: 0, exercisesCompleted: 0, dialoguesCompleted: 0 };

      const updatedUser: UserProfile = {
          ...user,
          stats: emptyStats,
          preferences: {
              ...user.preferences!,
              targetLanguage: '', 
              level: '',
              history: currentHistory
          }
      };

      setUser(updatedUser);
      await storageService.saveUserProfile(updatedUser);
      setCurrentSession(null);
  };

  const handleOnboardingComplete = async (prefs: any) => {
    if (!user) return;

    const selectedLang = prefs.targetLanguage;
    const history = user.preferences?.history || {};
    
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
            history: history
        } 
    };

    setUser(updated);
    await storageService.saveUserProfile(updated);
    
    const session = storageService.getOrCreateSession(user.id, updated.preferences!);
    setCurrentSession(session);
  };

  const handleLogout = async () => {
    await storageService.logout();
    setUser(null);
    setCurrentSession(null);
    setShowDashboard(false);
    setShowAdmin(false);
    setActiveMode('chat');
  };

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
          setUser(updatedUser);
          toast.success(`Exercice terminé ! Score : ${score}/${total}`);
      }
      setActiveMode('chat');
  };

  const needsOnboarding = !user?.preferences || !user?.preferences?.targetLanguage;

  // Determine Context for Tutorial Agent
  const getAgentContext = () => {
      if (!user) return "Page d'Accueil / Connexion";
      if (needsOnboarding) return "Configuration du Profil (Langue/Niveau)";
      if (showAdmin) return "Panneau Administrateur";
      if (showPayment) return "Rechargement de Crédits";
      if (showDashboard) return "Profil Utilisateur & Statistiques";
      if (activeMode === 'exercise') return "Session d'Exercices (Quiz)";
      if (activeMode === 'practice') return "Session de Dialogue (Roleplay)";
      return `Chat Principal - Apprentissage du ${user.preferences?.targetLanguage || 'Language'}`;
  };

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

      {/* Tutorial Agent available everywhere */}
      {user && !showAdmin && (
          <TutorialAgent user={user} context={getAgentContext()} />
      )}

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
                onUpdateUser={(updated) => {
                    setUser(updated);
                }}
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
                  onUpdateUser={(u) => setUser(u)}
                  notify={notify}
                  onShowPayment={() => setShowPayment(true)}
              />
          )}

          {showDashboard && (
            <SmartDashboard 
              user={user} 
              onClose={() => setShowDashboard(false)} 
              onUpdateUser={setUser} 
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
