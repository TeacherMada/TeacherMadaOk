
import React, { useState, useEffect } from 'react';
import LandingPage from './components/LandingPage';
import AuthScreen from './components/AuthScreen';
import Onboarding from './components/Onboarding';
import ChatInterface from './components/ChatInterface';
import SmartDashboard from './components/SmartDashboard';
import ExerciseSession from './components/ExerciseSession';
import DialogueSession from './components/DialogueSession';
import PaymentModal from './components/PaymentModal';
import AdminDashboard from './components/AdminDashboard'; // Import AdminDashboard
import { UserProfile, LearningSession, ExerciseItem } from './types';
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
  const [showAdmin, setShowAdmin] = useState(false); // New Admin State
  
  // Modes
  const [activeMode, setActiveMode] = useState<'chat' | 'exercise' | 'practice'>('chat');
  const [currentExercises, setCurrentExercises] = useState<ExerciseItem[]>([]);
  const [isGeneratingExercise, setIsGeneratingExercise] = useState(false);

  const [isDarkMode, setIsDarkMode] = useState(() => localStorage.getItem('tm_theme') === 'dark');

  useEffect(() => {
    // Sync Supabase user on load
    const init = async () => {
        const curr = await storageService.getCurrentUser();
        if (curr) setUser(curr);
    };
    init();
    
    document.documentElement.classList.toggle('dark', isDarkMode);
    localStorage.setItem('tm_theme', isDarkMode ? 'dark' : 'light');
  }, [isDarkMode]);

  // Legacy notify bridge
  const notify = (msg: string, type: string = 'info') => {
    if (type === 'error') toast.error(msg);
    else if (type === 'success') toast.success(msg);
    else toast.info(msg);
  };

  const handleAuthSuccess = (u: UserProfile) => {
    setUser(u);
    setShowAuth(false);
    if (u.preferences) {
        const session = storageService.getOrCreateSession(u.id, u.preferences);
        setCurrentSession(session);
    }
  };

  const handleOnboardingComplete = async (prefs: any) => {
    if (!user) return;
    const updated = { ...user, preferences: prefs };
    setUser(updated);
    await storageService.saveUserProfile(updated);
    const session = storageService.getOrCreateSession(user.id, prefs);
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
          const updatedUser = { ...user, stats: newStats };
          await storageService.saveUserProfile(updatedUser);
          setUser(updatedUser);
          toast.success(`Exercice terminé ! Score : ${score}/${total}`);
      }
      setActiveMode('chat');
  };

  // If Admin Mode is active, render only Admin Dashboard
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

      {/* GLOBAL LOADER OVERLAY */}
      {isGeneratingExercise && (
          <div className="fixed inset-0 z-[200] bg-slate-900/80 backdrop-blur-sm flex flex-col items-center justify-center text-white">
              <Loader2 className="w-12 h-12 animate-spin mb-4 text-indigo-500" />
              <p className="font-bold text-lg">L'IA prépare vos exercices...</p>
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
          {activeMode === 'chat' && (
              <ChatInterface 
                user={user} 
                session={currentSession} 
                onShowProfile={() => setShowDashboard(true)}
                onExit={() => setCurrentSession(null)}
                onUpdateUser={setUser}
                onStartPractice={() => setActiveMode('practice')}
                onStartExercise={startExercise}
                notify={notify}
                onShowPayment={() => setShowPayment(true)}
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
                  onUpdateUser={setUser}
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
              onShowPayment={() => { setShowDashboard(false); setShowPayment(true); }} // Inject payment handler
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
      {user && user.preferences && !currentSession && !showAdmin && (
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
                onClick={async () => {
                  const updated = {...user, preferences: null};
                  setUser(updated);
                  await storageService.saveUserProfile(updated);
                }}
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
