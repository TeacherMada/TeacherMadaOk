
import React, { useState, useEffect } from 'react';
import LandingPage from './components/LandingPage';
import AuthScreen from './components/AuthScreen';
import Onboarding from './components/Onboarding';
import ChatInterface from './components/ChatInterface';
import SmartDashboard from './components/SmartDashboard';
import { UserPreferences, ChatMessage, ExplanationLanguage, UserProfile, DailyChallenge } from './types';
import { startChatSession, analyzeUserProgress, generateDailyChallenges } from './services/geminiService';
import { storageService } from './services/storageService';
import { INITIAL_GREETING_FR, INITIAL_GREETING_MG } from './constants';

const App: React.FC = () => {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isSessionStarted, setIsSessionStarted] = useState(false);
  const [showProfile, setShowProfile] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  
  // Navigation State
  const [showAuth, setShowAuth] = useState(false);

  // Global Theme State
  const [isDarkMode, setIsDarkMode] = useState(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('theme') === 'dark';
    }
    return false;
  });

  // Sync Theme
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

  // Check for existing user session on mount
  useEffect(() => {
    const currentUser = storageService.getCurrentUser();
    if (currentUser) {
      setUser(currentUser);
      if (currentUser.preferences) {
        initializeSession(currentUser, currentUser.preferences);
      }
    }
  }, []);

  // Automatic Persistence: Save User Profile whenever it changes
  useEffect(() => {
    if (user) {
      storageService.saveUserProfile(user);
    }
  }, [user]);

  // Check and Refresh Daily Challenges
  useEffect(() => {
    const checkDailyChallenges = async () => {
        if (!user || !user.preferences) return;

        const today = new Date().toISOString().split('T')[0];
        
        // If no challenges or date mismatch, generate new ones
        if (!user.lastChallengeDate || user.lastChallengeDate !== today || !user.dailyChallenges) {
            try {
                const newChallenges = await generateDailyChallenges(user.preferences);
                const updatedUser = { 
                    ...user, 
                    dailyChallenges: newChallenges, 
                    lastChallengeDate: today 
                };
                setUser(updatedUser);
                // storageService.saveUserProfile is handled by the useEffect above
            } catch (e) {
                console.error("Failed to generate challenges", e);
            }
        }
    };

    checkDailyChallenges();
  }, [user?.id, user?.preferences]); // Run when user or prefs change

  const initializeSession = async (userProfile: UserProfile, prefs: UserPreferences) => {
    const history = storageService.getChatHistory(userProfile.id);
    setMessages(history);

    try {
      await startChatSession(userProfile, prefs, history);
      
      if (history.length === 0) {
        const greeting = prefs.explanationLanguage === ExplanationLanguage.French 
            ? INITIAL_GREETING_FR 
            : INITIAL_GREETING_MG;
            
        const initialMsg: ChatMessage = {
          id: 'init',
          role: 'model',
          text: greeting + ` (${prefs.targetLanguage} - ${prefs.level})`,
          timestamp: Date.now()
        };
        
        const newHistory = [initialMsg];
        setMessages(newHistory);
        storageService.saveChatHistory(userProfile.id, newHistory);
      }

      setIsSessionStarted(true);
    } catch (error) {
      console.error("Failed to start session", error);
      alert("Erreur de connexion à l'IA.");
    }
  };

  const handleAuthSuccess = (loggedInUser: UserProfile) => {
    setUser(loggedInUser);
    setShowAuth(false);
    if (loggedInUser.preferences) {
      initializeSession(loggedInUser, loggedInUser.preferences);
    }
  };

  const handleOnboardingComplete = async (prefs: UserPreferences) => {
    if (!user) return;
    const updatedUser = { ...user, preferences: prefs };
    setUser(updatedUser);
    // Persistence handled by useEffect
    await initializeSession(updatedUser, prefs);
  };

  // General user update handler (Profile edits, tutorial flag, etc.)
  const handleUpdateUser = (updatedUser: UserProfile) => {
    setUser(updatedUser);
  };

  // Allow resetting just the preferences to trigger onboarding again (for language switch)
  const handleChangeLanguage = () => {
      if (!user) return;
      const updatedUser = { ...user, preferences: null };
      setUser(updatedUser);
      setMessages([]); // Clear current chat context
      setIsSessionStarted(false);
  };

  const handleUpdateChallengeProgress = (type: 'message_count' | 'lesson_complete' | 'vocabulary') => {
      if (!user || !user.dailyChallenges) return;

      let xpGained = 0;
      let challengesUpdated = false;

      const updatedChallenges = user.dailyChallenges.map(challenge => {
          if (challenge.type === type && !challenge.isCompleted) {
              const newCount = challenge.currentCount + 1;
              const isNowCompleted = newCount >= challenge.targetCount;
              
              if (isNowCompleted) {
                  xpGained += challenge.xpReward;
                  challengesUpdated = true;
              }

              return { ...challenge, currentCount: newCount, isCompleted: isNowCompleted };
          }
          return challenge;
      });

      // Only update state if something changed (to avoid render loops)
      const hasCountChanged = JSON.stringify(updatedChallenges) !== JSON.stringify(user.dailyChallenges);

      if (hasCountChanged) {
          const updatedUser = {
              ...user,
              dailyChallenges: updatedChallenges,
              stats: {
                  ...user.stats,
                  xp: user.stats.xp + xpGained
              }
          };
          setUser(updatedUser);
      }
  };

  const handleEndSession = async () => {
    if (!user) return;

    if (messages.length > 2) {
        setIsAnalyzing(true);
        try {
            const { newMemory, xpEarned, feedback } = await analyzeUserProgress(messages, user.aiMemory);
            
            // Check for lesson completion based on messages content
            const isLessonMode = user.preferences?.mode === 'Course';
            if (isLessonMode) handleUpdateChallengeProgress('lesson_complete');

            const updatedUser: UserProfile = {
                ...user,
                aiMemory: newMemory,
                stats: {
                    ...user.stats,
                    xp: user.stats.xp + xpEarned,
                    lessonsCompleted: user.stats.lessonsCompleted + (isLessonMode ? 1 : 0)
                },
                preferences: null
            };

            setUser(updatedUser);
            alert(`🎓 Session terminée !\n\n+${xpEarned} XP\n"${feedback}"`);

        } catch (e) {
            console.error("Error analyzing session", e);
            setUser({ ...user, preferences: null });
        } finally {
            setIsAnalyzing(false);
            setIsSessionStarted(false);
            setMessages([]);
        }
    } else {
        const resetUser = { ...user, preferences: null };
        setUser(resetUser);
        setIsSessionStarted(false);
        setMessages([]);
    }
  };

  const handleLogout = () => {
      storageService.logout();
      setUser(null);
      setIsSessionStarted(false);
      setMessages([]);
      setShowAuth(false);
      setShowProfile(false);
  };

  const handleUpgrade = () => {
    if (user) {
        const upgradedUser = { ...user, isPremium: !user.isPremium };
        setUser(upgradedUser);
        alert(upgradedUser.isPremium ? "Vous êtes maintenant Premium ! 🌟" : "Mode Premium désactivé.");
    }
  };
  
  // Font Size Handler
  const handleFontSizeChange = (size: 'small' | 'normal' | 'large' | 'xl') => {
      if (!user) return;
      // We update the preferences
      const newPrefs = { ...(user.preferences || {}), fontSize: size } as UserPreferences;
      const updatedUser = { ...user, preferences: newPrefs };
      setUser(updatedUser);
  };
  
  const currentFontSize = user?.preferences?.fontSize || 'normal';

  // --- Views ---

  // 1. Landing Page
  if (!user && !showAuth) {
    return (
      <LandingPage 
        onStart={() => setShowAuth(true)}
        isDarkMode={isDarkMode}
        toggleTheme={toggleTheme}
      />
    );
  }

  // 2. Auth Screen
  if (!user && showAuth) {
    return (
      <AuthScreen 
        onAuthSuccess={handleAuthSuccess}
        onBack={() => setShowAuth(false)}
        isDarkMode={isDarkMode}
        toggleTheme={toggleTheme}
      />
    );
  }

  // Common Profile Modal (Now Sidebar)
  const profileSidebar = user && showProfile && (
    <SmartDashboard 
        user={user} 
        messages={messages}
        onClose={() => setShowProfile(false)} 
        onUpgrade={handleUpgrade}
        onUpdateUser={handleUpdateUser}
        onLogout={handleLogout}
        isDarkMode={isDarkMode}
        toggleTheme={toggleTheme}
        fontSize={currentFontSize}
        onFontSizeChange={handleFontSizeChange}
    />
  );

  // 3. Onboarding (Logged in but no preferences set)
  if (user && (!user.preferences || !isSessionStarted)) {
    return (
      <>
        {profileSidebar}
        <Onboarding 
            onComplete={handleOnboardingComplete} 
            isDarkMode={isDarkMode}
            toggleTheme={toggleTheme}
        />
      </>
    );
  }

  // 4. Main Chat Interface
  if (user && user.preferences) {
    return (
        <>
            {profileSidebar}
            <ChatInterface 
                user={user}
                messages={messages} 
                setMessages={setMessages}
                onChangeMode={handleEndSession}
                onChangeLanguage={handleChangeLanguage}
                onLogout={handleLogout}
                onUpdateUser={handleUpdateUser}
                onShowProfile={() => setShowProfile(true)}
                isDarkMode={isDarkMode}
                toggleTheme={toggleTheme}
                isAnalyzing={isAnalyzing}
                onMessageSent={() => handleUpdateChallengeProgress('message_count')}
                fontSize={currentFontSize}
            />
        </>
      );
  }

  return null;
};

export default App;
