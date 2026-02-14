
import React, { useState, useMemo } from 'react';
import { UserProfile, ChatMessage, ExplanationLanguage, UserPreferences } from '../types';
import { X, LogOut, Sun, Moon, Book, Trophy, Volume2, Sparkles, Loader2, Trash2, Settings, User, ChevronRight, Save, Globe, Download, ShieldCheck, Upload, Library, TrendingUp, Star, CreditCard, Plus, AlertTriangle, MessageCircle, Phone, Brain, ArrowRight } from 'lucide-react';
import { storageService } from '../services/storageService';
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
  onShowPayment: () => void;
  onStartPractice: () => void; // Added
  onStartExercise: () => void; // Added
  onStartVoice: () => void;    // Added
}

const SmartDashboard: React.FC<Props> = ({ 
    user, onClose, onLogout, isDarkMode, toggleTheme, onUpdateUser, messages, 
    onOpenAdmin, onShowPayment, onStartPractice, onStartExercise, onStartVoice 
}) => {
  const [activeTab, setActiveTab] = useState<'menu' | 'edit'>('menu');
  const [isImporting, setIsImporting] = useState(false);
  
  // Edit Profile State
  const [editName, setEditName] = useState(user.username);
  const [editPass, setEditPass] = useState(user.password || '');

  // Low Credit Check
  const isLowCredits = user.credits < 2;

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
                    Espace Personnel
                    {activeTab === 'menu' && <div className="absolute bottom-[-2px] left-0 w-full h-[2px] bg-indigo-600 dark:bg-white rounded-t-full"></div>}
                </button>
            </div>
        </div>

        {/* Content Area */}
        <div className="flex-1 overflow-y-auto p-6 scrollbar-hide">
            
            {/* MENU TAB */}
            {activeTab === 'menu' && (
                <div className="space-y-6 animate-fade-in">
                    
                    {/* Wallet Card */}
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

                    {/* NEW ACTION BUTTONS (Replacing Progress) */}
                    <div className="space-y-3">
                        <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest ml-1">Apprentissage</h3>
                        <div className="grid grid-cols-1 gap-3">
                            
                            <button onClick={onStartPractice} className="flex items-center justify-between p-4 bg-white dark:bg-slate-800 rounded-2xl border border-slate-100 dark:border-slate-700 hover:border-indigo-200 dark:hover:border-indigo-800 shadow-sm hover:shadow-md transition-all group">
                                <div className="flex items-center gap-4">
                                    <div className="w-12 h-12 rounded-full bg-violet-100 dark:bg-violet-900/30 flex items-center justify-center text-violet-600 dark:text-violet-400">
                                        <MessageCircle className="w-6 h-6" />
                                    </div>
                                    <div className="text-left">
                                        <div className="font-bold text-slate-900 dark:text-white group-hover:text-violet-600 dark:group-hover:text-violet-400 transition-colors">Jeux de Rôle</div>
                                        <div className="text-xs text-slate-500">Situations réelles</div>
                                    </div>
                                </div>
                                <ArrowRight className="w-5 h-5 text-slate-300 group-hover:text-violet-500 transition-colors" />
                            </button>

                            <button onClick={onStartVoice} className="flex items-center justify-between p-4 bg-white dark:bg-slate-800 rounded-2xl border border-slate-100 dark:border-slate-700 hover:border-emerald-200 dark:hover:border-emerald-800 shadow-sm hover:shadow-md transition-all group relative overflow-hidden">
                                <div className="absolute inset-0 bg-emerald-500/5 opacity-0 group-hover:opacity-100 transition-opacity"></div>
                                <div className="flex items-center gap-4 relative z-10">
                                    <div className="w-12 h-12 rounded-full bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center text-emerald-600 dark:text-emerald-400 animate-pulse">
                                        <Phone className="w-6 h-6" />
                                    </div>
                                    <div className="text-left">
                                        <div className="font-bold text-slate-900 dark:text-white group-hover:text-emerald-600 dark:group-hover:text-emerald-400 transition-colors">Appel Vocal</div>
                                        <div className="text-xs text-slate-500">TeacherMada Live</div>
                                    </div>
                                </div>
                                <ArrowRight className="w-5 h-5 text-slate-300 group-hover:text-emerald-500 transition-colors relative z-10" />
                            </button>

                            <button onClick={onStartExercise} className="flex items-center justify-between p-4 bg-white dark:bg-slate-800 rounded-2xl border border-slate-100 dark:border-slate-700 hover:border-amber-200 dark:hover:border-amber-800 shadow-sm hover:shadow-md transition-all group">
                                <div className="flex items-center gap-4">
                                    <div className="w-12 h-12 rounded-full bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center text-amber-600 dark:text-amber-400">
                                        <Brain className="w-6 h-6" />
                                    </div>
                                    <div className="text-left">
                                        <div className="font-bold text-slate-900 dark:text-white group-hover:text-amber-600 dark:group-hover:text-amber-400 transition-colors">Exercices</div>
                                        <div className="text-xs text-slate-500">Quiz & Pratique</div>
                                    </div>
                                </div>
                                <ArrowRight className="w-5 h-5 text-slate-300 group-hover:text-amber-500 transition-colors" />
                            </button>

                        </div>
                    </div>

                    {/* Settings List */}
                    <div className="space-y-1 pt-4">
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
