
import React, { useState, useMemo } from 'react';
import { UserProfile, ChatMessage, ExplanationLanguage, UserPreferences } from '../types';
import { X, LogOut, Sun, Moon, Book, Trophy, Volume2, Sparkles, Loader2, Trash2, Settings, User, ChevronRight, Save, Globe, Download, ShieldCheck, Upload, Library, TrendingUp, Star, CreditCard, Plus } from 'lucide-react';
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
  onShowPayment: () => void; // New Prop
}

const SmartDashboard: React.FC<Props> = ({ user, onClose, onLogout, isDarkMode, toggleTheme, onUpdateUser, messages, onOpenAdmin, onShowPayment }) => {
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
      
      const points = (user.stats.lessonsCompleted * 10) + (user.stats.exercisesCompleted * 5) + (user.stats.dialoguesCompleted * 8);
      const threshold = 500;
      
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
      // Consumption handled in extractVocabulary service
      const newWords = await extractVocabulary(messages);
      
      // Fetch fresh user data after credit consumption
      const freshUser = await storageService.getUserById(user.id);
      
      const updatedUser = { 
          ...(freshUser || user), 
          vocabulary: [...newWords, ...user.vocabulary].slice(0, 50)
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
      <div className="relative w-full max-w-sm h-full bg-white dark:bg-[#0F1422] shadow-2xl flex flex-col animate-slide-in-right border-l border-slate-200 dark:border-slate-800">
        
        {/* Profile Header (Pro Look) */}
        <div className="px-6 pt-8 pb-6 border-b border-slate-100 dark:border-slate-800 bg-white dark:bg-[#0F1422]">
            <div className="flex justify-between items-start mb-6">
                <button onClick={onClose} className="p-2 -ml-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-full transition-colors text-slate-500">
                    <X className="w-6 h-6" />
                </button>
                {user.role === 'admin' && (
                    <button 
                        onClick={onOpenAdmin}
                        className="bg-red-500 hover:bg-red-600 text-white text-[10px] font-bold px-3 py-1.5 rounded-full border border-red-600 flex items-center gap-1.5 shadow-sm transition-all"
                    >
                        <ShieldCheck className="w-3.5 h-3.5" /> MASTER
                    </button>
                )}
            </div>
            
            <div className="flex items-center gap-5">
                <div className="relative">
                    <div className="w-20 h-20 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden shadow-lg border-4 border-white dark:border-slate-700">
                        <img src={`https://api.dicebear.com/9.x/micah/svg?seed=${user.username}`} className="w-full h-full object-cover" />
                    </div>
                    <div className="absolute bottom-0 right-0 w-6 h-6 bg-emerald-500 border-2 border-white dark:border-slate-800 rounded-full flex items-center justify-center">
                        <Star className="w-3 h-3 text-white fill-white" />
                    </div>
                </div>
                <div className="flex-1 min-w-0">
                    <h2 className="font-black text-2xl text-slate-900 dark:text-white truncate">{user.username}</h2>
                    <p className="text-sm font-medium text-slate-500 dark:text-slate-400">Étudiant {user.preferences?.targetLanguage}</p>
                    <div className="flex items-center gap-2 mt-1">
                        <span className="px-2 py-0.5 bg-indigo-100 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300 text-[10px] font-bold rounded uppercase tracking-wider">{user.preferences?.level}</span>
                    </div>
                </div>
            </div>
        </div>

        {/* Custom Tab Switcher */}
        <div className="px-6 mt-4">
            <div className="flex border-b-2 border-slate-100 dark:border-slate-800">
                <button 
                    onClick={() => setActiveTab('menu')} 
                    className={`flex-1 pb-3 text-sm font-bold transition-all relative ${activeTab === 'menu' ? 'text-indigo-600 dark:text-white' : 'text-slate-400 hover:text-slate-600 dark:hover:text-slate-300'}`}
                >
                    Dashboard
                    {activeTab === 'menu' && <div className="absolute bottom-[-2px] left-0 w-full h-[2px] bg-indigo-600 dark:bg-white rounded-t-full"></div>}
                </button>
                <button 
                    onClick={() => setActiveTab('vocab')} 
                    className={`flex-1 pb-3 text-sm font-bold transition-all relative ${activeTab === 'vocab' ? 'text-indigo-600 dark:text-white' : 'text-slate-400 hover:text-slate-600 dark:hover:text-slate-300'}`}
                >
                    Vocabulaire
                    {activeTab === 'vocab' && <div className="absolute bottom-[-2px] left-0 w-full h-[2px] bg-indigo-600 dark:bg-white rounded-t-full"></div>}
                </button>
            </div>
        </div>

        {/* Content Area */}
        <div className="flex-1 overflow-y-auto p-6 scrollbar-hide">
            
            {/* MENU TAB */}
            {activeTab === 'menu' && (
                <div className="space-y-6 animate-fade-in">
                    
                    {/* Wallet Card (New) */}
                    <div className="bg-gradient-to-br from-slate-900 to-slate-800 dark:from-[#1E293B] dark:to-[#0F172A] p-6 rounded-3xl text-white shadow-xl shadow-slate-500/20 relative overflow-hidden group">
                        <div className="absolute top-0 right-0 w-40 h-40 bg-white/5 rounded-full -mr-10 -mt-10 blur-3xl group-hover:bg-white/10 transition-colors duration-700"></div>
                        
                        <div className="flex justify-between items-start relative z-10">
                            <div>
                                <p className="text-slate-400 text-xs font-bold uppercase tracking-widest mb-1">Mon Solde</p>
                                <div className="text-4xl font-black tracking-tight">{user.credits} <span className="text-lg font-medium text-slate-400">CRD</span></div>
                            </div>
                            <div className="p-3 bg-white/10 rounded-2xl backdrop-blur-md">
                                <CreditCard className="w-6 h-6 text-white" />
                            </div>
                        </div>

                        <div className="mt-6 relative z-10">
                            <button 
                                onClick={onShowPayment}
                                className="w-full py-3 bg-white text-slate-900 font-bold rounded-xl hover:bg-slate-100 transition-colors flex items-center justify-center gap-2 shadow-lg"
                            >
                                <Plus className="w-4 h-4" /> Recharger Crédits
                            </button>
                        </div>
                    </div>

                    {/* Progress Card */}
                    <div className="bg-white dark:bg-slate-800 border border-slate-100 dark:border-slate-700 p-5 rounded-3xl shadow-sm relative overflow-hidden">
                        <div className="flex justify-between items-center mb-4">
                            <h3 className="font-bold text-slate-800 dark:text-white flex items-center gap-2">
                                <TrendingUp className="w-5 h-5 text-emerald-500" /> Progression
                            </h3>
                            <span className="text-xs font-bold text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-900/20 px-2 py-1 rounded-lg">Level {progressData.currentLevel}</span>
                        </div>
                        
                        <div className="flex justify-between items-end mb-2">
                            <span className="text-sm text-slate-500 dark:text-slate-400">Vers {progressData.nextLevel}</span>
                            <span className="text-xl font-black text-slate-800 dark:text-white">{progressData.percentage}%</span>
                        </div>
                        <div className="h-3 w-full bg-slate-100 dark:bg-slate-700 rounded-full overflow-hidden">
                            <div 
                                className="h-full bg-gradient-to-r from-emerald-400 to-teal-500 transition-all duration-1000 ease-out"
                                style={{ width: `${progressData.percentage}%` }}
                            ></div>
                        </div>
                        <div className="mt-4 flex gap-4 text-xs font-medium text-slate-500 dark:text-slate-400">
                            <div className="flex items-center gap-1"><CheckCircle className="w-3 h-3 text-emerald-500"/> {user.stats.lessonsCompleted} Leçons</div>
                            <div className="flex items-center gap-1"><CheckCircle className="w-3 h-3 text-emerald-500"/> {user.stats.exercisesCompleted} Exos</div>
                        </div>
                    </div>

                    {/* Settings List */}
                    <div className="space-y-1">
                        <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest mb-3 ml-1">Préférences</h3>
                        
                        <SettingsItem 
                            icon={<Globe className="w-5 h-5 text-blue-500" />} 
                            title="Langue d'explication" 
                            value={user.preferences?.explanationLanguage} 
                            onClick={toggleExplanationLang} 
                        />
                        <SettingsItem 
                            icon={isDarkMode ? <Moon className="w-5 h-5 text-indigo-400" /> : <Sun className="w-5 h-5 text-amber-500" />} 
                            title="Mode Apparence" 
                            value={isDarkMode ? 'Sombre' : 'Clair'} 
                            onClick={toggleTheme} 
                        />
                        <SettingsItem 
                            icon={<User className="w-5 h-5 text-slate-500" />} 
                            title="Modifier Profil" 
                            value="Nom & MDP" 
                            onClick={() => setActiveTab('edit')} 
                        />
                    </div>

                    {/* Actions Grid */}
                    <div className="grid grid-cols-2 gap-3 mt-2">
                        <button onClick={handleExport} className="flex flex-col items-center justify-center p-4 bg-slate-50 dark:bg-slate-800/50 rounded-2xl border border-slate-100 dark:border-slate-800 hover:bg-white dark:hover:bg-slate-800 transition-all group">
                            <Download className="w-6 h-6 text-slate-400 group-hover:text-indigo-500 mb-2 transition-colors" />
                            <span className="font-bold text-xs text-slate-600 dark:text-slate-300">Sauvegarde</span>
                        </button>
                        
                        <label className="flex flex-col items-center justify-center p-4 bg-slate-50 dark:bg-slate-800/50 rounded-2xl border border-slate-100 dark:border-slate-800 hover:bg-white dark:hover:bg-slate-800 transition-all cursor-pointer relative group">
                            {isImporting ? <Loader2 className="w-6 h-6 animate-spin text-indigo-500 mb-2"/> : <Upload className="w-6 h-6 text-slate-400 group-hover:text-indigo-500 mb-2 transition-colors" />}
                            <span className="font-bold text-xs text-slate-600 dark:text-slate-300">Restaurer</span>
                            <input type="file" accept=".json" onChange={handleImport} className="hidden" disabled={isImporting} />
                        </label>
                    </div>
                </div>
            )}

            {/* VOCAB TAB */}
            {activeTab === 'vocab' && (
                <div className="space-y-4 animate-fade-in pb-10">
                    <button 
                        onClick={handleExtract} 
                        disabled={isExtracting}
                        className="w-full py-4 bg-gradient-to-r from-indigo-600 to-violet-600 text-white font-bold rounded-2xl shadow-lg shadow-indigo-500/20 flex items-center justify-center gap-2 disabled:opacity-50 hover:scale-[1.01] transition-all"
                    >
                        {isExtracting ? <Loader2 className="animate-spin w-5 h-5"/> : <Sparkles className="w-5 h-5"/>}
                        Smart Extract (-1 Crédit)
                    </button>

                    <div className="space-y-3">
                        {user.vocabulary.length === 0 ? (
                            <div className="flex flex-col items-center justify-center py-20 opacity-40 text-center">
                                <div className="w-20 h-20 bg-slate-100 dark:bg-slate-800 rounded-full flex items-center justify-center mb-4">
                                    <Book className="w-10 h-10 text-slate-400"/>
                                </div>
                                <p className="text-base font-bold text-slate-600 dark:text-slate-400">Boîte vide</p>
                                <p className="text-sm text-slate-400 max-w-[200px]">Discutez avec l'IA puis cliquez sur "Smart Extract" pour remplir votre carnet.</p>
                            </div>
                        ) : (
                            user.vocabulary.map(v => (
                                <div key={v.id} className="bg-white dark:bg-slate-800 p-4 rounded-2xl border border-slate-100 dark:border-slate-700 relative group hover:border-indigo-200 dark:hover:border-indigo-900 transition-colors shadow-sm">
                                    <div className="flex justify-between items-start mb-1">
                                        <div className="font-black text-lg text-slate-800 dark:text-white">{v.word}</div>
                                        <button onClick={() => playAudio(v.word)} className="p-2 bg-slate-50 dark:bg-slate-700/50 rounded-xl text-slate-400 hover:text-indigo-500 transition-colors">
                                            <Volume2 className="w-4 h-4"/>
                                        </button>
                                    </div>
                                    <div className="text-sm font-bold text-indigo-500 mb-2">{v.translation}</div>
                                    {v.example && (
                                        <div className="text-xs text-slate-500 dark:text-slate-400 italic bg-slate-50 dark:bg-slate-700/30 p-2 rounded-lg border-l-2 border-slate-200 dark:border-slate-600">
                                            "{v.example}"
                                        </div>
                                    )}
                                    <button onClick={() => deleteWord(v.id)} className="absolute top-4 right-12 text-slate-300 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity p-2">
                                        <Trash2 className="w-4 h-4"/>
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
                    <button onClick={() => setActiveTab('menu')} className="text-xs font-bold text-slate-400 hover:text-indigo-500 flex items-center gap-1 mb-6">
                        <ChevronRight className="w-3 h-3 rotate-180"/> Retour Dashboard
                    </button>
                    
                    <div className="space-y-5">
                        <div className="space-y-2">
                            <label className="text-xs font-bold text-slate-500 uppercase ml-2">Nom d'utilisateur</label>
                            <input 
                                type="text" 
                                value={editName} 
                                onChange={e => setEditName(e.target.value)} 
                                className="w-full p-4 bg-slate-50 dark:bg-slate-800 rounded-2xl outline-none focus:ring-2 focus:ring-indigo-500 font-bold border-transparent border focus:bg-white dark:focus:bg-slate-900 transition-all"
                            />
                        </div>
                        <div className="space-y-2">
                            <label className="text-xs font-bold text-slate-500 uppercase ml-2">Nouveau Mot de passe</label>
                            <input 
                                type="text" 
                                value={editPass} 
                                onChange={e => setEditPass(e.target.value)} 
                                placeholder="Laisser vide pour ne pas changer"
                                className="w-full p-4 bg-slate-50 dark:bg-slate-800 rounded-2xl outline-none focus:ring-2 focus:ring-indigo-500 font-bold border-transparent border focus:bg-white dark:focus:bg-slate-900 transition-all"
                            />
                        </div>
                        <button onClick={handleSaveProfile} className="w-full py-4 bg-slate-900 dark:bg-white text-white dark:text-slate-900 font-bold rounded-2xl flex items-center justify-center gap-2 shadow-lg hover:scale-[1.02] transition-transform">
                            <Save className="w-5 h-5"/> Enregistrer les modifications
                        </button>
                    </div>
                </div>
            )}
        </div>

        {/* Footer Actions */}
        <div className="p-6 border-t border-slate-100 dark:border-slate-800 bg-white dark:bg-[#0F1422] safe-bottom">
            <button 
                onClick={onLogout}
                className="w-full py-3 bg-red-50 dark:bg-red-900/10 text-red-500 font-bold rounded-xl flex items-center justify-center gap-2 hover:bg-red-100 dark:hover:bg-red-900/20 transition-colors text-sm"
            >
                <LogOut className="w-4 h-4" /> Se déconnecter
            </button>
        </div>
      </div>
    </div>
  );
};

// Helper Component for Menu Items
const SettingsItem = ({ icon, title, value, onClick }: any) => (
    <button onClick={onClick} className="w-full flex items-center justify-between p-4 bg-transparent hover:bg-slate-50 dark:hover:bg-slate-800/50 rounded-2xl transition-colors group">
        <div className="flex items-center gap-4">
            <div className="w-10 h-10 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center group-hover:scale-110 transition-transform">
                {icon}
            </div>
            <div className="text-left">
                <div className="font-bold text-sm text-slate-800 dark:text-white">{title}</div>
                <div className="text-[10px] text-slate-400">{value}</div>
            </div>
        </div>
        <ChevronRight className="w-4 h-4 text-slate-300 group-hover:text-indigo-500 transition-colors" />
    </button>
);

// Helper for Icons
const CheckCircle = ({className}: {className?: string}) => (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className={className}><polyline points="20 6 9 17 4 12" /></svg>
);

export default SmartDashboard;
