
import React, { useState, useMemo } from 'react';
import { UserProfile, ChatMessage, ExplanationLanguage, UserPreferences } from '../types';
import { X, LogOut, Sun, Moon, Book, Trophy, Volume2, Sparkles, Loader2, Trash2, Settings, User, ChevronRight, Save, Globe, Download, ShieldCheck, Upload, Library, TrendingUp, Star } from 'lucide-react';
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
  onOpenAdmin: () => void;
}

const SmartDashboard: React.FC<Props> = ({ user, onClose, onLogout, isDarkMode, toggleTheme, onUpdateUser, messages, onOpenAdmin }) => {
  const [activeTab, setActiveTab] = useState<'menu' | 'vocab' | 'edit'>('menu');
  const [isExtracting, setIsExtracting] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  
  // Edit Profile State
  const [editName, setEditName] = useState(user.username);
  const [editPass, setEditPass] = useState(user.password || '');

  // --- SMART PROGRESS CALCULATION ---
  const progressData = useMemo(() => {
      const levels = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2', 'HSK 1', 'HSK 2', 'HSK 3', 'HSK 4', 'HSK 5', 'HSK 6'];
      const currentLevel = user.preferences?.level || 'A1';
      const currentIndex = levels.indexOf(currentLevel);
      const nextLevel = currentIndex < levels.length - 1 ? levels[currentIndex + 1] : 'Expert';
      
      // Weight: Lesson=10, Exercise=5, Dialogue=8
      // Arbitrary threshold to level up: 500 points per level
      const points = (user.stats.lessonsCompleted * 10) + (user.stats.exercisesCompleted * 5) + (user.stats.dialoguesCompleted * 8);
      const threshold = 500;
      
      // Calculate progress within current level (looping every 500 points)
      const currentPoints = points % threshold;
      const percentage = Math.min(Math.round((currentPoints / threshold) * 100), 100);
      
      return { percentage, nextLevel, currentLevel };
  }, [user.stats, user.preferences?.level]);

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
      
      await storageService.saveUserProfile(updatedUser);
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

  const deleteWord = async (id: string) => {
      const updated = { ...user, vocabulary: user.vocabulary.filter(w => w.id !== id) };
      await storageService.saveUserProfile(updated);
      onUpdateUser(updated);
  };

  const handleSaveProfile = async () => {
      if (!editName.trim()) return;
      const updated = { ...user, username: editName, password: editPass };
      await storageService.saveUserProfile(updated);
      onUpdateUser(updated);
      toast.success("Profil mis à jour !");
      setActiveTab('menu');
  };

  const toggleExplanationLang = async () => {
      const current = user.preferences?.explanationLanguage;
      const next = current === ExplanationLanguage.French ? ExplanationLanguage.Malagasy : ExplanationLanguage.French;
      const updatedPrefs = { ...user.preferences, explanationLanguage: next } as UserPreferences;
      const updatedUser = { ...user, preferences: updatedPrefs };
      await storageService.saveUserProfile(updatedUser);
      onUpdateUser(updatedUser);
      toast.success(`Langue d'explication : ${next}`);
  };

  const handleExport = () => {
      storageService.exportData(user);
      toast.success("Données exportées.");
  };

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      
      setIsImporting(true);
      const success = await storageService.importData(file, user.id);
      setIsImporting(false);
      
      if (success) {
          toast.success("Données importées ! Rechargement...");
          setTimeout(() => window.location.reload(), 1500);
      } else {
          toast.error("Fichier invalide ou corrompu.");
      }
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
                {user.role === 'admin' && (
                    <button 
                        onClick={onOpenAdmin}
                        className="bg-red-500 hover:bg-red-600 text-white text-[10px] font-bold px-3 py-1.5 rounded-full border border-red-600 flex items-center gap-1.5 shadow-sm transition-all"
                    >
                        <ShieldCheck className="w-3.5 h-3.5" /> ADMIN
                    </button>
                )}
            </div>
            
            <div className="flex items-center gap-4">
                <div className="w-14 h-14 bg-white dark:bg-slate-800 rounded-full overflow-hidden shadow-lg border-2 border-white dark:border-slate-700">
                    <img src={`https://api.dicebear.com/9.x/micah/svg?seed=${user.username}`} className="w-full h-full object-cover" />
                </div>
                <div>
                    <h2 className="font-bold text-lg text-slate-900 dark:text-white truncate max-w-[150px]">{user.username}</h2>
                    <p className="text-xs font-medium text-slate-500 dark:text-slate-400">Étudiant {user.preferences?.level}</p>
                </div>
            </div>
        </div>

        {/* Tab Switcher */}
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
                    Vocab ({user.vocabulary.length})
                </button>
            </div>
        </div>

        {/* Content Area */}
        <div className="flex-1 overflow-y-auto p-6 scrollbar-hide">
            
            {/* MENU TAB */}
            {activeTab === 'menu' && (
                <div className="space-y-6 animate-fade-in">
                    
                    {/* SMART PROGRESS BAR */}
                    <div className="bg-indigo-600 dark:bg-indigo-900/40 p-5 rounded-2xl text-white shadow-lg shadow-indigo-500/20 relative overflow-hidden">
                        {/* Background Deco */}
                        <div className="absolute top-0 right-0 w-32 h-32 bg-white/10 rounded-full -mr-10 -mt-10 blur-2xl"></div>
                        
                        <div className="flex justify-between items-center mb-3 relative z-10">
                            <div className="flex flex-col">
                                <span className="text-[10px] font-bold opacity-80 uppercase tracking-widest">Niveau Actuel</span>
                                <span className="text-2xl font-black">{progressData.currentLevel}</span>
                            </div>
                            <div className="flex flex-col items-end">
                                <span className="text-[10px] font-bold opacity-80 uppercase tracking-widest">Prochain</span>
                                <span className="text-lg font-bold opacity-90">{progressData.nextLevel}</span>
                            </div>
                        </div>
                        
                        <div className="relative h-3 bg-black/20 rounded-full overflow-hidden mb-2">
                            <div 
                                className="absolute top-0 left-0 h-full bg-gradient-to-r from-emerald-400 to-teal-300 transition-all duration-1000 ease-out"
                                style={{ width: `${progressData.percentage}%` }}
                            ></div>
                        </div>
                        
                        <div className="flex justify-between items-center text-xs font-bold relative z-10">
                            <span>{progressData.percentage}% Complété</span>
                            <Star className="w-3.5 h-3.5 fill-yellow-400 text-yellow-400" />
                        </div>
                    </div>

                    {/* Stats Grid - Updated Metrics */}
                    <div className="grid grid-cols-2 gap-3">
                        <div className="bg-slate-50 dark:bg-slate-800/50 p-4 rounded-2xl border border-slate-100 dark:border-slate-800 flex flex-col items-center justify-center gap-1">
                            <Library className="w-5 h-5 text-indigo-500" />
                            <div className="text-lg font-black text-slate-800 dark:text-white">{user.vocabulary.length}</div>
                            <div className="text-[10px] font-bold text-slate-400 uppercase">Mots Appris</div>
                        </div>
                        <div className="bg-slate-50 dark:bg-slate-800/50 p-4 rounded-2xl border border-slate-100 dark:border-slate-800 flex flex-col items-center justify-center gap-1">
                            <Book className="w-5 h-5 text-emerald-500" />
                            <div className="text-lg font-black text-slate-800 dark:text-white">{user.stats.lessonsCompleted}</div>
                            <div className="text-[10px] font-bold text-slate-400 uppercase">Leçons Finies</div>
                        </div>
                    </div>

                    {/* Settings List */}
                    <div className="space-y-2">
                        <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest mb-2 ml-1">Préférences</h3>
                        
                        <button onClick={toggleExplanationLang} className="w-full flex items-center justify-between p-4 bg-white dark:bg-slate-800/50 rounded-2xl border border-slate-100 dark:border-slate-800 hover:border-indigo-200 dark:hover:border-indigo-900 transition-colors group">
                            <div className="flex items-center gap-3">
                                <Globe className="w-5 h-5 text-emerald-500" />
                                <div className="text-left">
                                    <div className="font-bold text-sm text-slate-700 dark:text-slate-200">Langue d'explication</div>
                                    <div className="text-[10px] text-slate-400">Actuel : {user.preferences?.explanationLanguage}</div>
                                </div>
                            </div>
                            <ChevronRight className="w-4 h-4 text-slate-300 group-hover:text-indigo-500 transition-colors" />
                        </button>

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

                        <button onClick={() => setActiveTab('edit')} className="w-full flex items-center justify-between p-4 bg-white dark:bg-slate-800/50 rounded-2xl border border-slate-100 dark:border-slate-800 hover:border-indigo-200 dark:hover:border-indigo-900 transition-colors group">
                            <div className="flex items-center gap-3">
                                <User className="w-5 h-5 text-indigo-500" />
                                <div className="text-left">
                                    <div className="font-bold text-sm text-slate-700 dark:text-slate-200">Modifier Profil</div>
                                    <div className="text-[10px] text-slate-400">Nom et Mot de passe</div>
                                </div>
                            </div>
                            <ChevronRight className="w-4 h-4 text-slate-300 group-hover:text-indigo-500 transition-colors" />
                        </button>

                        {/* Export / Import */}
                        <div className="grid grid-cols-2 gap-3 mt-2">
                            <button onClick={handleExport} className="w-full flex flex-col items-center justify-center p-4 bg-white dark:bg-slate-800/50 rounded-2xl border border-slate-100 dark:border-slate-800 hover:border-indigo-200 dark:hover:border-indigo-900 transition-colors">
                                <Download className="w-6 h-6 text-slate-400 mb-2" />
                                <span className="font-bold text-xs text-slate-600 dark:text-slate-300">Exporter</span>
                            </button>
                            
                            <label className="w-full flex flex-col items-center justify-center p-4 bg-white dark:bg-slate-800/50 rounded-2xl border border-slate-100 dark:border-slate-800 hover:border-indigo-200 dark:hover:border-indigo-900 transition-colors cursor-pointer relative">
                                {isImporting ? <Loader2 className="w-6 h-6 animate-spin text-indigo-500 mb-2"/> : <Upload className="w-6 h-6 text-slate-400 mb-2" />}
                                <span className="font-bold text-xs text-slate-600 dark:text-slate-300">Importer</span>
                                <input type="file" accept=".json" onChange={handleImport} className="hidden" disabled={isImporting} />
                            </label>
                        </div>
                    </div>
                </div>
            )}

            {/* VOCAB TAB */}
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

            {/* EDIT PROFILE TAB */}
            {activeTab === 'edit' && (
                <div className="space-y-6 animate-fade-in">
                    <button onClick={() => setActiveTab('menu')} className="text-xs font-bold text-slate-400 hover:text-indigo-500 flex items-center gap-1 mb-4">
                        <ChevronRight className="w-3 h-3 rotate-180"/> Retour
                    </button>
                    
                    <div className="space-y-4">
                        <div>
                            <label className="text-xs font-bold text-slate-500 uppercase ml-2 mb-1 block">Nom d'utilisateur</label>
                            <input 
                                type="text" 
                                value={editName} 
                                onChange={e => setEditName(e.target.value)} 
                                className="w-full p-4 bg-slate-50 dark:bg-slate-800 rounded-2xl outline-none focus:ring-2 focus:ring-indigo-500 font-bold"
                            />
                        </div>
                        <div>
                            <label className="text-xs font-bold text-slate-500 uppercase ml-2 mb-1 block">Mot de passe</label>
                            <input 
                                type="text" 
                                value={editPass} 
                                onChange={e => setEditPass(e.target.value)} 
                                placeholder="Nouveau mot de passe"
                                className="w-full p-4 bg-slate-50 dark:bg-slate-800 rounded-2xl outline-none focus:ring-2 focus:ring-indigo-500 font-bold"
                            />
                        </div>
                        <button onClick={handleSaveProfile} className="w-full py-4 bg-indigo-600 text-white font-bold rounded-2xl flex items-center justify-center gap-2 shadow-lg">
                            <Save className="w-5 h-5"/> Enregistrer
                        </button>
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
