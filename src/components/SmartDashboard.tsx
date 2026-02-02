import React, { useState } from 'react';
import { UserProfile, ChatMessage } from '../types';
import { X, LogOut, Sun, Moon, Book, Trophy, Volume2, Sparkles, Loader2, Trash2, Settings, User } from 'lucide-react';
import { storageService } from '../services/storageService';
import { extractVocabulary } from '../services/geminiService';
import { toast } from './Toaster';

interface Props {
  user: UserProfile;
  onClose: () => void;
  onUpdateUser: (u: UserProfile) => void;
  onLogout: () => void;
  isDarkMode: boolean;
  toggleTheme: () => void;
  messages: ChatMessage[];
}

const SmartDashboard: React.FC<Props> = ({ user, onClose, onLogout, isDarkMode, toggleTheme, onUpdateUser, messages }) => {
  const [activeTab, setActiveTab] = useState<'menu' | 'vocab'>('menu');
  const [isExtracting, setIsExtracting] = useState(false);

  const handleExtract = async () => {
    if (messages.length < 2) {
      toast.info("Parlez un peu plus avant d'extraire des mots.");
      return;
    }
    
    setIsExtracting(true);
    try {
      const newWords = await extractVocabulary(messages);
      const updatedUser = { 
          ...user, 
          vocabulary: [...newWords, ...user.vocabulary].slice(0, 50),
          credits: user.credits > 0 ? user.credits - 1 : 0 
      };
      
      storageService.saveUserProfile(updatedUser);
      onUpdateUser(updatedUser);
      toast.success(`${newWords.length} mots ajoutés !`);
    } catch (e) {
      toast.error("Erreur lors de l'extraction.");
    } finally { 
      setIsExtracting(false); 
    }
  };

  const playAudio = (text: string) => {
      const utterance = new SpeechSynthesisUtterance(text);
      // Try to match target language
      const langMap: Record<string, string> = { 'Anglais': 'en-US', 'Français': 'fr-FR', 'Chinois': 'zh-CN', 'Espagnol': 'es-ES', 'Allemand': 'de-DE' };
      const target = user.preferences?.targetLanguage.split(' ')[0] || 'English';
      utterance.lang = langMap[target] || 'en-US';
      window.speechSynthesis.speak(utterance);
  };

  const deleteWord = (id: string) => {
      const updated = { ...user, vocabulary: user.vocabulary.filter(w => w.id !== id) };
      storageService.saveUserProfile(updated);
      onUpdateUser(updated);
  };

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm animate-fade-in" onClick={onClose} />
      
      <div className="relative w-full max-w-sm h-full bg-white dark:bg-slate-950 shadow-2xl flex flex-col animate-slide-in-right border-l border-slate-200 dark:border-slate-800">
        
        {/* Header */}
        <div className="p-6 border-b border-slate-100 dark:border-slate-800 flex justify-between items-center bg-slate-50 dark:bg-slate-900 safe-top">
            <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-indigo-600 text-white rounded-xl flex items-center justify-center font-bold text-lg shadow-lg">
                    {user.username.charAt(0).toUpperCase()}
                </div>
                <div>
                    <h2 className="font-bold text-slate-800 dark:text-white truncate max-w-[150px]">{user.username}</h2>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                        {user.credits} Crédits
                    </p>
                </div>
            </div>
            <button onClick={onClose} className="p-2 hover:bg-slate-200 dark:hover:bg-slate-800 rounded-full transition-colors">
                <X className="w-5 h-5 text-slate-500" />
            </button>
        </div>

        {/* Tab Switcher */}
        <div className="flex p-2 m-4 bg-slate-100 dark:bg-slate-900 rounded-xl">
            <button onClick={() => setActiveTab('menu')} className={`flex-1 py-2 text-xs font-bold uppercase rounded-lg transition-all ${activeTab === 'menu' ? 'bg-white dark:bg-slate-800 text-indigo-600 shadow-sm' : 'text-slate-500'}`}>Menu</button>
            <button onClick={() => setActiveTab('vocab')} className={`flex-1 py-2 text-xs font-bold uppercase rounded-lg transition-all ${activeTab === 'vocab' ? 'bg-white dark:bg-slate-800 text-indigo-600 shadow-sm' : 'text-slate-500'}`}>Vocabulaire</button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-6 py-2">
            
            {activeTab === 'menu' && (
                <div className="space-y-4 animate-fade-in">
                    <div className="grid grid-cols-2 gap-4 mb-6">
                        <div className="bg-amber-50 dark:bg-amber-900/10 p-4 rounded-2xl border border-amber-100 dark:border-amber-900/30 text-center">
                            <Trophy className="w-6 h-6 text-amber-500 mx-auto mb-2" />
                            <div className="text-xl font-black text-slate-800 dark:text-white">{user.stats.xp}</div>
                            <div className="text-[10px] font-bold text-amber-600 uppercase tracking-wide">XP</div>
                        </div>
                        <div className="bg-indigo-50 dark:bg-indigo-900/10 p-4 rounded-2xl border border-indigo-100 dark:border-indigo-900/30 text-center">
                            <Book className="w-6 h-6 text-indigo-500 mx-auto mb-2" />
                            <div className="text-xl font-black text-slate-800 dark:text-white">{user.stats.lessonsCompleted}</div>
                            <div className="text-[10px] font-bold text-indigo-600 uppercase tracking-wide">Leçons</div>
                        </div>
                    </div>

                    <button onClick={toggleTheme} className="w-full flex items-center justify-between p-4 bg-slate-50 dark:bg-slate-900 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors border border-slate-100 dark:border-slate-800">
                        <div className="flex items-center gap-3">
                            {isDarkMode ? <Moon className="w-5 h-5 text-indigo-400" /> : <Sun className="w-5 h-5 text-amber-500" />}
                            <span className="font-bold text-sm text-slate-700 dark:text-slate-300">Thème {isDarkMode ? 'Sombre' : 'Clair'}</span>
                        </div>
                    </button>
                </div>
            )}

            {activeTab === 'vocab' && (
                <div className="space-y-4 animate-fade-in pb-20">
                    <button 
                        onClick={handleExtract} 
                        disabled={isExtracting}
                        className="w-full py-3 bg-gradient-to-r from-indigo-600 to-violet-600 text-white font-bold rounded-xl shadow-lg flex items-center justify-center gap-2 disabled:opacity-50"
                    >
                        {isExtracting ? <Loader2 className="animate-spin w-5 h-5"/> : <Sparkles className="w-5 h-5"/>}
                        Extraire (1 Crédit)
                    </button>

                    <div className="space-y-3">
                        {user.vocabulary.length === 0 ? (
                            <div className="text-center py-10 opacity-50">
                                <Book className="w-12 h-12 mx-auto mb-2 text-slate-300"/>
                                <p className="text-sm">Aucun mot enregistré.</p>
                            </div>
                        ) : (
                            user.vocabulary.map(v => (
                                <div key={v.id} className="bg-slate-50 dark:bg-slate-900 p-3 rounded-xl border border-slate-100 dark:border-slate-800 relative group">
                                    <div className="flex justify-between items-start">
                                        <div>
                                            <div className="font-black text-slate-800 dark:text-white text-lg">{v.word}</div>
                                            <div className="text-xs font-medium text-slate-500">{v.translation}</div>
                                        </div>
                                        <button onClick={() => playAudio(v.word)} className="p-2 bg-indigo-100 dark:bg-indigo-900/30 rounded-full text-indigo-600 dark:text-indigo-400">
                                            <Volume2 className="w-4 h-4"/>
                                        </button>
                                    </div>
                                    {v.example && <p className="text-xs text-slate-400 italic mt-2 border-l-2 border-slate-200 pl-2">{v.example}</p>}
                                    <button onClick={() => deleteWord(v.id)} className="absolute bottom-2 right-2 text-red-400 opacity-0 group-hover:opacity-100 transition-opacity">
                                        <Trash2 className="w-4 h-4"/>
                                    </button>
                                </div>
                            ))
                        )}
                    </div>
                </div>
            )}
        </div>

        {/* Footer */}
        <div className="p-6 border-t border-slate-100 dark:border-slate-800 safe-bottom">
            <button 
                onClick={onLogout}
                className="w-full py-4 bg-red-50 dark:bg-red-900/10 text-red-600 dark:text-red-400 font-bold rounded-2xl flex items-center justify-center gap-2 hover:bg-red-100 dark:hover:bg-red-900/20 transition-colors"
            >
                <LogOut className="w-5 h-5" /> Déconnexion
            </button>
        </div>
      </div>
    </div>
  );
};

export default SmartDashboard;