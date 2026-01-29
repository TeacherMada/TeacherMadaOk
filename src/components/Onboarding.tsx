
import React, { useState } from 'react';
import { TargetLanguage, ProficiencyLevel, ExplanationLanguage, LearningMode, UserPreferences } from '../types';
import { BookOpen, Languages, GraduationCap, MessageCircle, Mic, PlayCircle, Sun, Moon, ArrowLeft } from 'lucide-react';

interface OnboardingProps {
  onComplete: (prefs: UserPreferences) => void;
  isDarkMode: boolean;
  toggleTheme: () => void;
}

const Onboarding: React.FC<OnboardingProps> = ({ onComplete, isDarkMode, toggleTheme }) => {
  const [step, setStep] = useState(1);
  const [prefs, setPrefs] = useState<Partial<UserPreferences>>({});

  const handleNext = (key: keyof UserPreferences, value: any) => {
    setPrefs(prev => ({ ...prev, [key]: value }));
    if (step < 3) {
      setStep(prev => prev + 1);
    } else {
      // Automatically set default mode to 'Course' (Cours structuré)
      onComplete({ ...prefs, [key]: value, mode: LearningMode.Course } as UserPreferences);
    }
  };

  const handleBack = () => {
    if (step > 1) {
        setStep(prev => prev - 1);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex flex-col items-center justify-center p-4 transition-colors duration-300 relative">
      
      {/* Theme Toggle Button */}
      <button
        onClick={toggleTheme}
        className="absolute top-5 right-5 p-3 rounded-full bg-white dark:bg-slate-900 shadow-md hover:shadow-lg text-slate-500 dark:text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 transition-all cursor-pointer z-50"
        aria-label={isDarkMode ? "Passer en mode clair" : "Passer en mode sombre"}
      >
        {isDarkMode ? <Sun className="w-6 h-6" /> : <Moon className="w-6 h-6" />}
      </button>

      {/* Back Button */}
      {step > 1 && (
        <button
            onClick={handleBack}
            className="absolute top-5 left-5 p-3 rounded-full bg-white dark:bg-slate-900 shadow-md hover:shadow-lg text-slate-500 dark:text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 transition-all cursor-pointer z-50"
            title="Retour"
        >
            <ArrowLeft className="w-6 h-6" />
        </button>
      )}

      <div className="max-w-md w-full bg-white dark:bg-slate-900 rounded-2xl shadow-xl p-8 transform transition-all duration-500">
        <div className="flex items-center justify-center mb-8">
          <div className="w-16 h-16 bg-indigo-50 dark:bg-indigo-900/20 p-2 rounded-xl shadow-lg">
            <img 
                src="https://i.ibb.co/B2XmRwmJ/logo.png" 
                onError={(e) => { e.currentTarget.onerror = null; e.currentTarget.src = '/logo.svg'; }}
                alt="Logo" 
                className="w-full h-full object-contain" 
            />
          </div>
          <h1 className="text-2xl font-bold ml-3 text-slate-800 dark:text-white">TeacherMada</h1>
        </div>

        <div className="mb-6">
          <div className="h-2 w-full bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
            <div 
              className="h-full bg-indigo-500 transition-all duration-300 ease-out"
              style={{ width: `${(step / 3) * 100}%` }}
            />
          </div>
        </div>

        {step === 1 && (
          <div className="animate-fade-in">
            <h2 className="text-xl font-semibold mb-6 text-center dark:text-white">Quelle langue veux-tu apprendre ?</h2>
            <div className="space-y-3">
              {Object.values(TargetLanguage).map((lang) => (
                <button
                  key={lang}
                  onClick={() => handleNext('targetLanguage', lang)}
                  className="w-full p-4 text-left border dark:border-slate-700 rounded-xl hover:border-indigo-500 dark:hover:border-indigo-400 hover:bg-indigo-50 dark:hover:bg-slate-800 transition-all flex items-center group"
                >
                  <span className="text-2xl mr-3">{lang.split(' ').pop()}</span>
                  <span className="font-medium text-slate-700 dark:text-slate-200 group-hover:text-indigo-700 dark:group-hover:text-indigo-400 flex-1">{lang.replace(/ .*/, '')}</span>
                  <Languages className="w-5 h-5 text-slate-400 group-hover:text-indigo-500 dark:group-hover:text-indigo-400" />
                </button>
              ))}
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="animate-fade-in">
            <h2 className="text-xl font-semibold mb-6 text-center dark:text-white">Ton niveau actuel ?</h2>
            <div className="space-y-3">
              {Object.values(ProficiencyLevel).map((level) => (
                <button
                  key={level}
                  onClick={() => handleNext('level', level)}
                  className="w-full p-4 text-left border dark:border-slate-700 rounded-xl hover:border-indigo-500 dark:hover:border-indigo-400 hover:bg-indigo-50 dark:hover:bg-slate-800 transition-all"
                >
                  <div className="font-bold text-indigo-900 dark:text-indigo-300">{level.split(' ')[0]}</div>
                  <div className="text-sm text-slate-500 dark:text-slate-400">{level.split('(')[1].replace(')', '')}</div>
                </button>
              ))}
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="animate-fade-in">
            <h2 className="text-xl font-semibold mb-6 text-center dark:text-white">Langue d'explication ?</h2>
            <div className="grid grid-cols-2 gap-4">
              {Object.values(ExplanationLanguage).map((lang) => (
                <button
                  key={lang}
                  onClick={() => handleNext('explanationLanguage', lang)}
                  className="p-6 border dark:border-slate-700 rounded-xl hover:border-indigo-500 dark:hover:border-indigo-400 hover:bg-indigo-50 dark:hover:bg-slate-800 transition-all flex flex-col items-center justify-center text-center"
                >
                  <span className="text-4xl mb-3">{lang.split(' ').pop()}</span>
                  <span className="font-medium text-slate-700 dark:text-slate-200">{lang.split(' ')[0]}</span>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default Onboarding;
