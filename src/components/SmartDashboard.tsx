import React, { useState } from 'react';
import { UserProfile, ChatMessage } from '../types';
import { X, LogOut, Sun, Moon, Book, Trophy, Volume2, Sparkles, Loader2, Trash2, Settings, User, ChevronRight } from 'lucide-react';
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
    <div className="fixed inset-0 z-[60] flex justify-end">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm animate-fade-in" onClick={onClose} />
      
      {/* Drawer */}
      <div className="relative w-full max-w-xs h-full bg-white dark:bg-[#0F1422] shadow-2xl flex flex-col animate-slide-in-right border-l border-slate-200 dark:border-slate-800">
        
        {/* Profile Header */}
        <div className="p-6 pb-4 border-b border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-[#131825]">
            <div className="flex justify-between items-start mb-4">
                <button onClick={onClose} className="p-2 -ml-2 hover:bg-slate-200 dark:hover:bg-slate-800 rounded-full transition-colors text-slate-500">
                    <X className="w-5 h-5" />
                </button>
                <div className="bg-indigo-100 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300 text-[10px] font-bold px-2 py-1 rounded border border-indigo-200 dark:border-indigo-800">
                    BETA v2.1
                </div>
            </div>
            
            <div className="flex items-center gap-4">
                <div className="w-14 h-14 bg-gradient-to-br from-indigo-500 to-purple-600 text-white rounded-2xl flex items-center justify-center font-black text-2xl shadow-lg shadow-indigo-500/20">
                    {user.username.charAt(0).toUpperCase()}
                </div>
                <div>
                    <h2 className="font-bold text-lg text-slate-900 dark:text-white">{user.username}</h2>
                    <p className="text-xs font-medium text-slate-500 dark:text-slate-400">Étudiant {user.preferences?.level}</p>
                </div>
            </div>
        </div>

        {/* Tab Switcher (Segmented Control) */}
        <div className="px-6 pt-6">
            <div className="flex bg-slate-100 dark:bg-slate-800 p-1 rounded-xl">
                <button 
                    onClick={() => setActiveTab('menu')} 
                    className={`flex-1 py-2 text-xs font-bold uppercase tracking-wide rounded-lg transition-all ${activeTab === 'menu' ? 'bg-white dark:bg-[#0F1422] text-indigo-600 shadow-sm' : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'}`}
                >
                    Menu
                </button>
                <button 
                    onClick={() => setActiveTab('vocab')} 
                    className={`flex-1 py-2 text-xs font-bold uppercase tracking-wide rounded-lg transition-all ${activeTab === 'vocab' ? 'bg-white dark:bg-[#0F1422] text-indigo-600 shadow-sm' : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'}`}
                >
                    Vocabulaire
                </button>
            </div>
        </div>

        {/* Content Area */}
        <div className="flex-1 overflow-y-auto p-6 scrollbar-hide">
            
            {activeTab === 'menu' && (
                <div className="space-y-6 animate-fade-in">
                    
                    {/* Stats Grid */}
                    <div className="grid grid-cols-2 gap-3">
                        <div className="bg-amber-50 dark:bg-amber-900/10 p-4 rounded-2xl border border-amber-100 dark:border-amber-900/30 flex flex-col items-center justify-center gap-1">
                            <Trophy className="w-5 h-5 text-amber-500" />
                            <div className="text-lg font-black text-slate-800 dark:text-white">{user.stats.xp}</div>
                            <div className="text-[10px] font-bold text-amber-600/70 uppercase">XP Total</div>
                        </div>
                        <div className="bg-indigo-50 dark:bg-indigo-900/10 p-4 rounded-2xl border border-indigo-100 dark:border-indigo-900/30 flex flex-col items-center justify-center gap-1">
                            <Book className="w-5 h-5 text-indigo-500" />
                            <div className="text-lg font-black text-slate-800 dark:text-white">{user.stats.lessonsCompleted}</div>
                            <div className="text-[10px] font-bold text-indigo-600/70 uppercase">Leçons</div>
                        </div>
                    </div>

                    {/* Settings List */}
                    <div className="space-y-2">
                        <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest mb-2 ml-1">Préférences</h3>
                        
                        <button onClick={toggleTheme} className="w-full flex items-center justify-between p-4 bg-white dark:bg-slate-800/50 rounded-2xl border border-slate-100 dark:border-slate-800 hover:border-indigo-200 dark:hover:border-indigo-900 transition-colors group">
                            <div className="flex items-center gap-3">
                                {isDarkMode ? <Moon className="w-5 h-5 text-indigo-400" /> : <Sun className="w-5 h-5 text-amber-500" />}
                                <div className="text-left">
                                    <div className="font-bold text-sm text-slate-700 dark:text-slate-200">Apparence</div>
                                    <div className="text-[10px] text-slate-400">{isDarkMode ? 'Mode Sombre' : 'Mode Clair'}</div>
                                </div>
                            </div>
                            <ChevronRight className="w-4 h-4 text-slate-300 group-hover:text-indigo-500 transition-colors" />
                        </button>

                        <button className="w-full flex items-center justify-between p-4 bg-white dark:bg-slate-800/50 rounded-2xl border border-slate-100 dark:border-slate-800 hover:border-indigo-200 dark:hover:border-indigo-900 transition-colors group opacity-60 cursor-not-allowed">
                            <div className="flex items-center gap-3">
                                <Settings className="w-5 h-5 text-slate-400" />
                                <div className="text-left">
                                    <div className="font-bold text-sm text-slate-700 dark:text-slate-200">Paramètres</div>
                                    <div className="text-[10px] text-slate-400">Langue, Notifications...</div>
                                </div>
                            </div>
                            <ChevronRight className="w-4 h-4 text-slate-300" />
                        </button>
                    </div>
                </div>
            )}

            {activeTab === 'vocab' && (
                <div className="space-y-4 animate-fade-in pb-10">
                    <button 
                        onClick={handleExtract} 
                        disabled={isExtracting}
                        className="w-full py-3 bg-gradient-to-r from-indigo-600 to-violet-600 text-white font-bold rounded-xl shadow-lg shadow-indigo-500/20 flex items-center justify-center gap-2 disabled:opacity-50 hover:scale-[1.02] transition-transform"
                    >
                        {isExtracting ? <Loader2 className="animate-spin w-4 h-4"/> : <Sparkles className="w-4 h-4"/>}
                        Smart Extract (-1 Crédit)
                    </button>

                    <div className="space-y-3">
                        {user.vocabulary.length === 0 ? (
                            <div className="flex flex-col items-center justify-center py-10 opacity-40 text-center">
                                <div className="w-16 h-16 bg-slate-100 dark:bg-slate-800 rounded-full flex items-center justify-center mb-3">
                                    <Book className="w-8 h-8 text-slate-400"/>
                                </div>
                                <p className="text-sm font-bold text-slate-600 dark:text-slate-400">Boîte vide</p>
                                <p className="text-xs text-slate-400 max-w-[150px]">Discutez avec l'IA puis cliquez sur "Smart Extract".</p>
                            </div>
                        ) : (
                            user.vocabulary.map(v => (
                                <div key={v.id} className="bg-white dark:bg-slate-800 p-3 rounded-xl border border-slate-100 dark:border-slate-700 relative group hover:border-indigo-200 dark:hover:border-indigo-900 transition-colors shadow-sm">
                                    <div className="flex justify-between items-start">
                                        <div>
                                            <div className="font-black text-slate-800 dark:text-white">{v.word}</div>
                                            <div className="text-xs font-bold text-indigo-500">{v.translation}</div>
                                        </div>
                                        <button onClick={() => playAudio(v.word)} className="p-2 bg-slate-100 dark:bg-slate-700 rounded-lg text-slate-500 hover:text-indigo-500 transition-colors">
                                            <Volume2 className="w-3.5 h-3.5"/>
                                        </button>
                                    </div>
                                    {v.example && <p className="text-[10px] text-slate-400 italic mt-2 border-l-2 border-slate-200 dark:border-slate-600 pl-2 leading-relaxed">{v.example}</p>}
                                    <button onClick={() => deleteWord(v.id)} className="absolute bottom-2 right-2 text-slate-300 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity p-1">
                                        <Trash2 className="w-3.5 h-3.5"/>
                                    </button>
                                </div>
                            ))
                        )}
                    </div>
                </div>
            )}
        </div>

        {/* Footer Actions */}
        <div className="p-6 border-t border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-[#131825] safe-bottom">
            <button 
                onClick={onLogout}
                className="w-full py-3 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-red-500 font-bold rounded-xl flex items-center justify-center gap-2 hover:bg-red-50 dark:hover:bg-red-900/10 transition-colors text-sm"
            >
                <LogOut className="w-4 h-4" /> Se déconnecter
            </button>
        </div>
      </div>
    </div>
  );
};

export default SmartDashboard;