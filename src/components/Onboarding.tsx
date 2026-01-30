
import React, { useState, useMemo } from 'react';
import { TargetLanguage, ExplanationLanguage, LearningMode, UserPreferences, LanguageLevel, LevelDescriptor } from '../types';
import { LEVEL_DEFINITIONS } from '../constants';
import { BookOpen, Languages, GraduationCap, Sun, Moon, ArrowLeft, CheckCircle2, Info, HelpCircle } from 'lucide-react';

interface OnboardingProps {
  onComplete: (prefs: UserPreferences) => void;
  isDarkMode: boolean;
  toggleTheme: () => void;
}

const Onboarding: React.FC<OnboardingProps> = ({ onComplete, isDarkMode, toggleTheme }) => {
  const [step, setStep] = useState(1);
  const [prefs, setPrefs] = useState<Partial<UserPreferences>>({});
  const [selectedLevelDesc, setSelectedLevelDesc] = useState<LevelDescriptor | null>(null);

  // Determine levels based on language choice
  const availableLevels = useMemo(() => {
    if (prefs.targetLanguage === TargetLanguage.Chinese) {
        return ['HSK 1', 'HSK 2', 'HSK 3', 'HSK 4', 'HSK 5', 'HSK 6'];
    }
    return ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'];
  }, [prefs.targetLanguage]);

  const handleLanguageSelect = (lang: TargetLanguage) => {
    setPrefs(prev => ({ ...prev, targetLanguage: lang }));
    setStep(2);
  };

  const handleLevelSelect = (levelCode: string) => {
      const desc = LEVEL_DEFINITIONS[levelCode];
      setSelectedLevelDesc(desc);
  };

  const confirmLevel = () => {
      if (selectedLevelDesc) {
          setPrefs(prev => ({ ...prev, level: selectedLevelDesc.code as LanguageLevel, needsAssessment: false }));
          setStep(3);
      }
  };

  const handleUnknownLevel = () => {
      const defaultLevel = prefs.targetLanguage === TargetLanguage.Chinese ? 'HSK 1' : 'A1';
      setPrefs(prev => ({ ...prev, level: defaultLevel, needsAssessment: true }));
      setStep(3);
  };

  const handleExplanationSelect = (lang: ExplanationLanguage) => {
      const finalPrefs = { ...prefs, explanationLanguage: lang, mode: LearningMode.Course } as UserPreferences;
      onComplete(finalPrefs);
  };

  const handleBack = () => {
    if (step === 2 && selectedLevelDesc) {
        setSelectedLevelDesc(null);
        return;
    }
    if (step > 1) {
        setStep(prev => prev - 1);
        setSelectedLevelDesc(null);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex flex-col items-center justify-center p-4 transition-colors duration-300 relative font-sans">
      
      <button onClick={toggleTheme} className="absolute top-5 right-5 p-3 rounded-full bg-white dark:bg-slate-900 shadow-md hover:shadow-lg text-slate-500 dark:text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 transition-all cursor-pointer z-50">
        {isDarkMode ? <Sun className="w-6 h-6" /> : <Moon className="w-6 h-6" />}
      </button>

      {step > 1 && (
        <button onClick={handleBack} className="absolute top-5 left-5 p-3 rounded-full bg-white dark:bg-slate-900 shadow-md hover:shadow-lg text-slate-500 dark:text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 transition-all cursor-pointer z-50">
            <ArrowLeft className="w-6 h-6" />
        </button>
      )}

      <div className="max-w-2xl w-full bg-white dark:bg-slate-900 rounded-[2rem] shadow-2xl p-8 transform transition-all duration-500 relative border border-slate-100 dark:border-slate-800">
        
        <div className="mb-8 flex items-center gap-2">
            <div className={`h-2 flex-1 rounded-full transition-all duration-500 ${step >= 1 ? 'bg-indigo-600' : 'bg-slate-200 dark:bg-slate-800'}`}></div>
            <div className={`h-2 flex-1 rounded-full transition-all duration-500 ${step >= 2 ? 'bg-indigo-600' : 'bg-slate-200 dark:bg-slate-800'}`}></div>
            <div className={`h-2 flex-1 rounded-full transition-all duration-500 ${step >= 3 ? 'bg-indigo-600' : 'bg-slate-200 dark:bg-slate-800'}`}></div>
        </div>

        {step === 1 && (
          <div className="animate-fade-in text-center">
            <div className="w-20 h-20 bg-indigo-50 dark:bg-indigo-900/20 rounded-2xl flex items-center justify-center mx-auto mb-6">
                <Languages className="w-10 h-10 text-indigo-600 dark:text-indigo-400" />
            </div>
            <h2 className="text-2xl md:text-3xl font-black mb-2 text-slate-900 dark:text-white">Quelle langue apprendre ?</h2>
            <p className="text-slate-500 dark:text-slate-400 mb-8">Choisissez la langue que vous souhaitez maîtriser.</p>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {Object.values(TargetLanguage).map((lang) => (
                <button
                  key={lang}
                  onClick={() => handleLanguageSelect(lang)}
                  className="p-4 rounded-xl border border-slate-200 dark:border-slate-700 hover:border-indigo-500 dark:hover:border-indigo-400 hover:bg-indigo-50 dark:hover:bg-slate-800 transition-all flex items-center group text-left shadow-sm hover:shadow-md"
                >
                  <span className="text-3xl mr-4">{lang.split(' ').pop()}</span>
                  <div>
                      <span className="font-bold text-lg text-slate-800 dark:text-white block">{lang.replace(/ .*/, '')}</span>
                      <span className="text-xs text-slate-400 group-hover:text-indigo-500 dark:group-hover:text-indigo-300">Sélectionner</span>
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}

        {step === 2 && !selectedLevelDesc && (
          <div className="animate-fade-in">
            <div className="text-center mb-8">
                <h2 className="text-2xl md:text-3xl font-black text-slate-900 dark:text-white mb-2">Votre niveau actuel ?</h2>
                <p className="text-slate-500 dark:text-slate-400 text-sm">Sélectionnez un niveau pour voir les détails. Soyez honnête pour une meilleure progression.</p>
            </div>
            
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-8">
              {availableLevels.map((levelCode) => {
                  const def = LEVEL_DEFINITIONS[levelCode];
                  return (
                    <button
                      key={levelCode}
                      onClick={() => handleLevelSelect(levelCode)}
                      className="p-4 rounded-xl border border-slate-200 dark:border-slate-700 hover:border-indigo-500 hover:scale-105 transition-all text-center flex flex-col items-center justify-center bg-slate-50 dark:bg-slate-800/50"
                    >
                      <div className="text-2xl font-black text-indigo-600 dark:text-indigo-400 mb-1">{def.code}</div>
                      <div className="text-xs font-bold text-slate-600 dark:text-slate-300 uppercase tracking-tight">{def.title.split(' /')[0]}</div>
                    </button>
                  );
              })}
            </div>

            <div className="text-center">
                <button 
                    onClick={handleUnknownLevel}
                    className="inline-flex items-center gap-2 text-sm font-bold text-slate-500 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors px-4 py-2 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800"
                >
                    <HelpCircle className="w-4 h-4" /> Je ne connais pas mon niveau (Test)
                </button>
            </div>
          </div>
        )}

        {step === 2 && selectedLevelDesc && (
            <div className="animate-slide-up">
                <div className="text-center mb-6">
                    <div className="inline-block px-4 py-1 rounded-full bg-indigo-100 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300 font-black text-xl mb-4">
                        {selectedLevelDesc.code}
                    </div>
                    <h3 className="text-2xl font-bold text-slate-900 dark:text-white mb-2">{selectedLevelDesc.title}</h3>
                    <p className="text-slate-600 dark:text-slate-300 italic">"{selectedLevelDesc.description}"</p>
                </div>

                <div className="bg-slate-50 dark:bg-slate-800/50 rounded-2xl p-6 border border-slate-200 dark:border-slate-700 mb-6">
                    <h4 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-3">Compétences attendues</h4>
                    <ul className="space-y-2 mb-6">
                        {selectedLevelDesc.skills.map((skill, i) => (
                            <li key={i} className="flex items-start gap-2 text-sm text-slate-700 dark:text-slate-200">
                                <CheckCircle2 className="w-4 h-4 text-emerald-500 mt-0.5 shrink-0" />
                                {skill}
                            </li>
                        ))}
                    </ul>
                    
                    <div className="bg-white dark:bg-slate-900 p-4 rounded-xl border-l-4 border-indigo-500 shadow-sm">
                        <span className="text-xs font-bold text-indigo-500 block mb-1">EXEMPLE CONCRET</span>
                        <p className="text-slate-800 dark:text-slate-100 font-medium">"{selectedLevelDesc.example}"</p>
                    </div>
                </div>

                <div className="flex flex-col gap-3">
                    <button 
                        onClick={confirmLevel}
                        className="w-full py-4 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl shadow-lg transition-transform active:scale-[0.98] flex items-center justify-center gap-2"
                    >
                        C'est mon niveau, commencer <ArrowLeft className="w-4 h-4 rotate-180" />
                    </button>
                    <button 
                        onClick={() => setSelectedLevelDesc(null)}
                        className="w-full py-3 text-slate-500 font-bold hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-colors"
                    >
                        Choisir un autre niveau
                    </button>
                </div>
            </div>
        )}

        {step === 3 && (
          <div className="animate-fade-in text-center">
            <h2 className="text-2xl font-bold mb-6 text-slate-900 dark:text-white">Langue d'explication ?</h2>
            <p className="text-slate-500 dark:text-slate-400 mb-8">Le professeur vous expliquera les règles dans cette langue.</p>
            
            <div className="grid grid-cols-2 gap-4">
              {Object.values(ExplanationLanguage).map((lang) => (
                <button
                  key={lang}
                  onClick={() => handleExplanationSelect(lang)}
                  className="p-6 border dark:border-slate-700 rounded-2xl hover:border-indigo-500 dark:hover:border-indigo-400 hover:bg-indigo-50 dark:hover:bg-slate-800 transition-all flex flex-col items-center justify-center text-center group"
                >
                  <span className="text-4xl mb-4 group-hover:scale-110 transition-transform">{lang.split(' ').pop()}</span>
                  <span className="font-bold text-slate-700 dark:text-slate-200">{lang.split(' ')[0]}</span>
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
