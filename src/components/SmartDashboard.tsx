
import React, { useState, useMemo } from 'react';
import { UserProfile, ChatMessage, ExplanationLanguage, UserPreferences } from '../types';
import { X, LogOut, Sun, Moon, Book, Trophy, Volume2, Sparkles, Loader2, Trash2, Settings, User, ChevronRight, Save, Globe, Download, ShieldCheck, Upload, Library, TrendingUp, Star, CreditCard, Plus, AlertTriangle } from 'lucide-react';
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
  const [activeTab, setActiveTab] = useState<'menu' | 'edit'>('menu');
  const [isImporting, setIsImporting] = useState(false);
  
  // Edit Profile State
  const [editName, setEditName] = useState(user.username);
  const [editPass, setEditPass] = useState(user.password || '');

  // Low Credit Check
  const isLowCredits = user.credits < 2;

  // --- SMART PROGRESS CALCULATION ---
  const progressData = useMemo(() => {
      const levels = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2', 'HSK 1', 'HSK 2', 'HSK 3', 'HSK 4', 'HSK 5', 'HSK 6'];
      const currentLevel = user.preferences?.level || 'A1';
      const currentIndex = levels.indexOf(currentLevel);
      const nextLevel = currentIndex < levels.length - 1 ? levels[currentIndex + 1] : 'Expert';
      
      const points = (user.stats.lessonsCompleted * 10) + (user.stats.exercisesCompleted * 5) + (user.stats.dialoguesCompleted * 8);
      const threshold = 500;
      
      // Calculate real progress based on assumption that 1 lesson = 2% (from ChatInterface logic)
      const lessonBasedPercentage = Math.min((user.stats.lessonsCompleted + 1) * 2, 100);
      
      return { percentage: lessonBasedPercentage, nextLevel, currentLevel };
  }, [user.stats, user.preferences?.level]);

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

  const handleExtract = async () => {
      // Check Credits
      if (!(await storageService.canRequest(user.id))) {
          toast.error("Crédits insuffisants pour l'extraction IA.");
          onShowPayment();
          return;
      }

      // Use passed messages or fallback to storage
      const history = messages.length > 0 ? messages : storageService.getChatHistory(user.preferences!.targetLanguage);
      if (history.length < 2) {
        toast.info("Parlez un peu plus avant d'extraire des mots.");
        return;
      }
      
      try {
        const newWords = await extractVocabulary(history);
        const updated = { ...user, vocabulary: [...newWords, ...user.vocabulary].slice(0, 100) };
        onUpdateUser(updated);
        toast.success(`${newWords.length} mots ajoutés à votre boîte !`);
      } catch (e) {
          toast.error("Erreur lors de l'extraction.");
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
            </div>
        </div>

        {/* Content Area */}
        <div className="flex-1 overflow-y-auto p-6 scrollbar-hide">
            
            {/* MENU TAB */}
            {activeTab === 'menu' && (
                <div className="space-y-6 animate-fade-in">
                    
                    {/* Wallet Card (New) */}
                    <div className={`p-6 rounded-3xl text-white shadow-xl relative overflow-hidden group transition-all duration-300 ${
                        isLowCredits 
                        ? 'bg-red-600 shadow-red-500/30 animate-pulse ring-4 ring-red-400/50' 
                        : 'bg-gradient-to-br from-slate-900 to-slate-800 dark:from-[#1E293B] dark:to-[#0F172A] shadow-slate-500/20'
                    }`}>
                        <div className="absolute top-0 right-0 w-40 h-40 bg-white/5 rounded-full -mr-10 -mt-10 blur-3xl group-hover:bg-white/10 transition-colors duration-700"></div>
                        
                        <div className="flex justify-between items-start relative z-10">
                            <div>
                                <p className={`text-xs font-bold uppercase tracking-widest mb-1 ${isLowCredits ? 'text-red-100' : 'text-slate-400'}`}>Mon Solde</p>
                                <div className="text-4xl font-black tracking-tight">{user.credits} <span className={`text-lg font-medium ${isLowCredits ? 'text-red-200' : 'text-slate-400'}`}>CRD</span></div>
                            </div>
                            <div className="p-3 bg-white/10 rounded-2xl backdrop-blur-md">
                                {isLowCredits ? <AlertTriangle className="w-6 h-6 text-white" /> : <CreditCard className="w-6 h-6 text-white" />}
                            </div>
                        </div>

                        <div className="mt-6 relative z-10">
                            <button 
                                onClick={onShowPayment}
                                className={`w-full py-3 font-bold rounded-xl transition-colors flex items-center justify-center gap-2 shadow-lg ${
                                    isLowCredits 
                                    ? 'bg-white text-red-600 hover:bg-red-50' 
                                    : 'bg-white text-slate-900 hover:bg-slate-100'
                                }`}
                            >
                                <Plus className="w-4 h-4" /> Recharger Crédits
                            </button>
                        </div>
                    </div>

                    {/* Progress Card Enhanced */}
                    <div className="bg-white dark:bg-slate-800 border border-slate-100 dark:border-slate-700 p-6 rounded-3xl shadow-sm relative overflow-hidden">
                        <div className="flex justify-between items-center mb-6">
                            <h3 className="font-bold text-slate-800 dark:text-white flex items-center gap-2">
                                <TrendingUp className="w-5 h-5 text-indigo-500" /> Progression Globale
                            </h3>
                        </div>
                        
                        <div className="relative pt-2 pb-6">
                            {/* Path Line */}
                            <div className="absolute top-1/2 left-0 w-full h-1 bg-slate-100 dark:bg-slate-700 -z-0"></div>
                            
                            <div className="flex justify-between items-center relative z-10">
                                {/* Start Node */}
                                <div className="flex flex-col items-center gap-2">
                                    <div className="w-8 h-8 rounded-full bg-indigo-600 text-white flex items-center justify-center text-xs font-black shadow-lg shadow-indigo-500/30">
                                        {progressData.currentLevel}
                                    </div>
                                </div>

                                {/* Dynamic Center Progress */}
                                <div className="absolute top-1/2 left-0 h-1 bg-indigo-500 transition-all duration-1000" style={{width: `${progressData.percentage}%`}}></div>
                                <div 
                                    className="absolute top-1/2 -translate-y-1/2 w-4 h-4 bg-white border-4 border-indigo-500 rounded-full shadow-md transition-all duration-1000"
                                    style={{left: `${progressData.percentage}%`}}
                                >
                                    <div className="absolute -top-8 left-1/2 -translate-x-1/2 bg-indigo-600 text-white text-[10px] font-bold px-2 py-0.5 rounded-full whitespace-nowrap">
                                        {progressData.percentage}%
                                    </div>
                                </div>

                                {/* End Node */}
                                <div className="flex flex-col items-center gap-2">
                                    <div className="w-8 h-8 rounded-full bg-slate-200 dark:bg-slate-700 text-slate-500 dark:text-slate-400 flex items-center justify-center text-xs font-bold">
                                        {progressData.nextLevel}
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div className="mt-2 flex gap-4 text-xs font-medium text-slate-500 dark:text-slate-400 justify-center bg-slate-50 dark:bg-slate-900/50 p-3 rounded-2xl">
                            <div className="flex items-center gap-1.5"><Star className="w-3.5 h-3.5 text-amber-500 fill-amber-500"/> {user.stats.lessonsCompleted} Leçons</div>
                            <div className="w-px h-4 bg-slate-200 dark:bg-slate-700"></div>
                            <div className="flex items-center gap-1.5"><Star className="w-3.5 h-3.5 text-emerald-500 fill-emerald-500"/> {user.stats.exercisesCompleted} Exercices</div>
                        </div>
                    </div>

                    {/* Vocab Extraction Action */}
                    <button onClick={handleExtract} className="w-full py-4 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl flex items-center justify-center gap-3 shadow-sm hover:shadow-md transition-all group">
                        <Sparkles className="w-5 h-5 text-indigo-500 group-hover:scale-110 transition-transform" />
                        <span className="font-bold text-sm text-slate-700 dark:text-slate-200">Extraire Mots Clés (IA)</span>
                    </button>

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

export default SmartDashboard;
