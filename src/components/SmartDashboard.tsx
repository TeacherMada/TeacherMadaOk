
import React, { useState, useMemo, useEffect } from 'react';
import { UserProfile, ChatMessage, ExplanationLanguage, UserPreferences, SmartNotification } from '../types';
import { X, LogOut, Sun, Moon, Book, Trophy, Loader2, Save, Globe, Download, ShieldCheck, Upload, CreditCard, Plus, AlertTriangle, MessageCircle, Phone, Brain, ArrowRight, Award, ChevronRight, User, Bell, Check, Trash2, Info } from 'lucide-react';
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
  onStartPractice: () => void;
  onStartExercise: () => void;
  onStartVoice: () => void;
  onStartExam: () => void;
}

const SmartDashboard: React.FC<Props> = ({ 
    user, onClose, onLogout, isDarkMode, toggleTheme, onUpdateUser, messages, 
    onOpenAdmin, onShowPayment, onStartPractice, onStartExercise, onStartVoice, onStartExam 
}) => {
  if (!user) return null;

  const [activeTab, setActiveTab] = useState<'menu' | 'edit' | 'certs' | 'notifs'>('menu');
  const [isImporting, setIsImporting] = useState(false);
  const [certificates, setCertificates] = useState<any[]>([]);
  const [notifications, setNotifications] = useState<SmartNotification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);

  // Load Data
  useEffect(() => {
    const loadData = async () => {
        const certs = await storageService.getCertificates(user.id);
        setCertificates(certs);
        
        const notifs = await storageService.getNotifications(user.id);
        setNotifications(notifs);
        setUnreadCount(notifs.filter(n => !n.read).length);
    };
    loadData();
  }, [user.id, activeTab]); // Reload when tab changes to refresh
  
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

  const handleMarkRead = async (id: string) => {
      await storageService.markNotificationRead(user.id, id);
      setNotifications(prev => prev.map(n => n.id === id ? { ...n, read: true } : n));
      setUnreadCount(prev => Math.max(0, prev - 1));
  };

  const handleMarkAllRead = async () => {
      await storageService.markAllNotificationsRead(user.id);
      setNotifications(prev => prev.map(n => ({ ...n, read: true })));
      setUnreadCount(0);
      toast.success("Tout marqué comme lu");
  };

  const handleDeleteNotif = async (id: string) => {
      await storageService.deleteNotification(user.id, id);
      setNotifications(prev => prev.filter(n => n.id !== id));
  };

  const handleDeleteConversation = async () => {
      if (confirm("Voulez-vous vraiment supprimer tout l'historique de cette conversation ? Cette action est irréversible.")) {
          await storageService.clearSession(user.id);
          toast.success("Conversation supprimée.");
          onClose();
          window.location.reload(); // Simple way to reset state
      }
  };

  return (
    <div className="fixed inset-0 z-[60] flex justify-end">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm animate-fade-in" onClick={onClose} />
      
      {/* Drawer */}
      <div className="relative w-full max-w-sm h-full bg-white dark:bg-[#0F1422] shadow-2xl flex flex-col animate-slide-in-right border-l border-slate-200 dark:border-slate-800">
        
        {/* Profile Header (Row Layout) */}
        <div className="px-5 pt-6 pb-4 bg-white dark:bg-[#0F1422] border-b border-slate-50 dark:border-slate-800/50">
            <div className="flex items-center justify-between gap-3">
                
                {/* Left: Avatar */}
                <div 
                    className={`relative shrink-0 ${user.role === 'admin' ? 'cursor-pointer hover:scale-105 transition-transform' : ''}`}
                    onClick={() => user.role === 'admin' && onOpenAdmin()}
                    title={user.role === 'admin' ? "Accéder au panneau Admin" : ""}
                >
                    <div className={`w-14 h-14 rounded-full p-0.5 shadow-md ${user.role === 'admin' ? 'bg-gradient-to-tr from-red-500 to-orange-500' : 'bg-gradient-to-tr from-indigo-500 to-purple-500'}`}>
                        <div className="w-full h-full rounded-full bg-white dark:bg-slate-900 overflow-hidden border-2 border-white dark:border-slate-900">
                             <img src={`https://api.dicebear.com/9.x/micah/svg?seed=${user.username}`} className="w-full h-full object-cover" />
                        </div>
                    </div>
                    <div className="absolute -bottom-1 -right-1 w-5 h-5 bg-emerald-500 border-2 border-white dark:border-slate-900 rounded-full flex items-center justify-center text-white shadow-sm">
                        <span className="text-[8px] font-black">{user.preferences?.level?.split(' ')[0] || 'A1'}</span>
                    </div>
                </div>

                {/* Center: Info */}
                <div className="flex-1 flex flex-col items-center text-center min-w-0 px-2">
                    <h2 className="text-lg font-black text-slate-900 dark:text-white leading-tight truncate w-full">{user.username}</h2>
                    <div className="flex items-center gap-1.5 mt-1 text-[9px] font-bold text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded-full border border-slate-200 dark:border-slate-700">
                        <Globe className="w-3 h-3" />
                        <span className="uppercase truncate max-w-[120px]">{user.preferences?.targetLanguage}</span>
                    </div>
                </div>

                {/* Right: Actions & Master Badge */}
                <div className="flex flex-col items-end gap-2 shrink-0">
                    <button onClick={onClose} className="p-2 bg-slate-100 dark:bg-slate-800 rounded-full text-slate-500 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors">
                        <X className="w-4 h-4" />
                    </button>
                    {user.role === 'admin' && (
                        <div className="bg-red-500 text-white text-[8px] font-black px-1.5 py-0.5 rounded-md shadow-sm flex items-center gap-1">
                            <ShieldCheck className="w-3 h-3" /> MASTER
                        </div>
                    )}
                </div>

            </div>
        </div>

        {/* Custom Tab Switcher (Pill Style) */}
        <div className="px-6 mt-2 mb-4">
            <div className="flex p-1 bg-slate-100 dark:bg-slate-800 rounded-xl">
                <button 
                    onClick={() => setActiveTab('menu')} 
                    className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all flex items-center justify-center gap-2 ${activeTab === 'menu' ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-sm' : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'}`}
                >
                    <User className="w-3.5 h-3.5" /> Espace Perso
                </button>
                <button 
                    onClick={() => setActiveTab('certs')} 
                    className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all flex items-center justify-center gap-2 ${activeTab === 'certs' ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-sm' : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'}`}
                >
                    <Trophy className="w-3.5 h-3.5" /> Certificats
                </button>
                <button 
                    onClick={() => setActiveTab('notifs')} 
                    className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all flex items-center justify-center gap-2 relative ${activeTab === 'notifs' ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-sm' : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'}`}
                >
                    <Bell className="w-3.5 h-3.5" />
                    {unreadCount > 0 && (
                        <span className="absolute top-1 right-2 w-2 h-2 bg-red-500 rounded-full animate-pulse"></span>
                    )}
                </button>
            </div>
        </div>

        {/* Content Area */}
        <div className="flex-1 overflow-y-auto px-6 pb-6 scrollbar-hide">
            
            {/* MENU TAB */}
            {activeTab === 'menu' && (
                <div className="space-y-8 animate-fade-in">
                    
                    {/* Wallet Card */}
                    <div className={`p-5 rounded-3xl text-white shadow-xl relative overflow-hidden group transition-all duration-300 ${
                        isLowCredits 
                        ? 'bg-red-600 shadow-red-500/30 animate-pulse ring-4 ring-red-400/50' 
                        : 'bg-gradient-to-br from-slate-900 to-slate-800 dark:from-[#1E293B] dark:to-[#0F172A] shadow-slate-500/20'
                    }`}>
                        <div className="absolute top-0 right-0 w-32 h-32 bg-white/5 rounded-full -mr-8 -mt-8 blur-3xl group-hover:bg-white/10 transition-colors duration-700"></div>
                        
                        <div className="flex justify-between items-start relative z-10">
                            <div>
                                <p className={`text-[10px] font-bold uppercase tracking-widest mb-1 ${isLowCredits ? 'text-red-100' : 'text-slate-400'}`}>Mon Solde</p>
                                <div className="text-3xl font-black tracking-tight">{user.credits} <span className={`text-sm font-medium ${isLowCredits ? 'text-red-200' : 'text-slate-400'}`}>CRD</span></div>
                            </div>
                            <div className="p-2.5 bg-white/10 rounded-xl backdrop-blur-md">
                                {isLowCredits ? <AlertTriangle className="w-5 h-5 text-white" /> : <CreditCard className="w-5 h-5 text-white" />}
                            </div>
                        </div>

                        <div className="mt-5 relative z-10">
                            <button 
                                onClick={onShowPayment}
                                className={`w-full py-2.5 font-bold rounded-xl transition-colors flex items-center justify-center gap-2 shadow-lg text-sm ${
                                    isLowCredits 
                                    ? 'bg-white text-red-600 hover:bg-red-50' 
                                    : 'bg-white text-slate-900 hover:bg-slate-100'
                                }`}
                            >
                                <Plus className="w-4 h-4" /> Recharger
                            </button>
                        </div>
                    </div>

                    {/* Stats Row */}
                    <div className="grid grid-cols-2 gap-3">
                        <div className="p-4 bg-white dark:bg-slate-800 rounded-2xl border border-slate-100 dark:border-slate-700 shadow-sm flex flex-col items-center justify-center text-center">
                            <div className="text-2xl font-black text-indigo-600 dark:text-indigo-400">{user.vocabulary?.length || 0}</div>
                            <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wide">Mots Appris</div>
                        </div>
                        <div className="p-4 bg-white dark:bg-slate-800 rounded-2xl border border-slate-100 dark:border-slate-700 shadow-sm flex flex-col items-center justify-center text-center">
                            <div className="text-2xl font-black text-emerald-600 dark:text-emerald-400">{user.stats.lessonsCompleted || 0}</div>
                            <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wide">Leçons Terminées</div>
                        </div>
                    </div>

                    {/* NEW ACTION BUTTONS (Replacing Progress) */}
                    <div className="space-y-4">
                        <div className="flex items-center gap-2 pb-2 border-b border-slate-100 dark:border-slate-800">
                            <Book className="w-4 h-4 text-indigo-500" />
                            <h3 className="text-xs font-black text-slate-900 dark:text-white uppercase tracking-widest">Apprentissage</h3>
                        </div>
                        
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

                            <button onClick={onStartExam} className="flex items-center justify-between p-4 bg-white dark:bg-slate-800 rounded-2xl border border-slate-100 dark:border-slate-700 hover:border-rose-200 dark:hover:border-rose-800 shadow-sm hover:shadow-md transition-all group relative overflow-hidden">
                                <div className="absolute top-0 right-0 bg-rose-500 text-white text-[10px] font-bold px-2 py-0.5 rounded-bl-lg">PREMIUM</div>
                                <div className="flex items-center gap-4">
                                    <div className="w-12 h-12 rounded-full bg-rose-100 dark:bg-rose-900/30 flex items-center justify-center text-rose-600 dark:text-rose-400">
                                        <Trophy className="w-6 h-6" />
                                    </div>
                                    <div className="text-left">
                                        <div className="font-bold text-slate-900 dark:text-white group-hover:text-rose-600 dark:group-hover:text-rose-400 transition-colors">Examen & Certificat</div>
                                        <div className="text-xs text-slate-500">Validez votre niveau</div>
                                    </div>
                                </div>
                                <ArrowRight className="w-5 h-5 text-slate-300 group-hover:text-rose-500 transition-colors" />
                            </button>

                        </div>
                    </div>

                    {/* Certificates Teaser */}
                    {certificates.length > 0 && (
                        <div className="pt-2">
                             <button onClick={() => setActiveTab('certs')} className="w-full p-4 bg-gradient-to-r from-slate-900 to-slate-800 dark:from-indigo-900 dark:to-slate-900 rounded-2xl text-white flex items-center justify-between shadow-lg group">
                                <div className="flex items-center gap-3">
                                    <Award className="w-8 h-8 text-yellow-400" />
                                    <div className="text-left">
                                        <div className="font-bold text-sm">Mes Certificats</div>
                                        <div className="text-[10px] text-slate-400">{certificates.length} obtenus</div>
                                    </div>
                                </div>
                                <ChevronRight className="w-5 h-5 text-slate-400 group-hover:text-white transition-colors" />
                             </button>
                        </div>
                    )}

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

                    <button onClick={handleDeleteConversation} className="w-full py-3 mt-2 bg-red-50 dark:bg-red-900/10 text-red-500 font-bold rounded-xl flex items-center justify-center gap-2 hover:bg-red-100 dark:hover:bg-red-900/20 transition-colors text-xs">
                        <Trash2 className="w-4 h-4" /> Supprimer la conversation
                    </button>
                </div>
            )}

            {/* NOTIFICATIONS TAB */}
            {activeTab === 'notifs' && (
                <div className="space-y-6 animate-fade-in">
                    <div className="flex items-center justify-between mb-4">
                        <button onClick={() => setActiveTab('menu')} className="text-xs font-bold text-slate-400 hover:text-indigo-500 flex items-center gap-1">
                            <ChevronRight className="w-3 h-3 rotate-180"/> Retour
                        </button>
                        {notifications.length > 0 && (
                            <button onClick={handleMarkAllRead} className="text-xs font-bold text-indigo-500 hover:text-indigo-600 flex items-center gap-1">
                                <Check className="w-3 h-3"/> Tout lire
                            </button>
                        )}
                    </div>

                    <h3 className="text-xl font-black text-slate-900 dark:text-white mb-4 flex items-center gap-2">
                        Notifications
                        {unreadCount > 0 && <span className="bg-red-500 text-white text-[10px] px-2 py-0.5 rounded-full">{unreadCount}</span>}
                    </h3>

                    <div className="space-y-3">
                        {notifications.map((notif) => (
                            <div key={notif.id} className={`p-4 rounded-2xl border transition-all relative group ${notif.read ? 'bg-white dark:bg-slate-800 border-slate-100 dark:border-slate-700 opacity-70' : 'bg-indigo-50 dark:bg-indigo-900/20 border-indigo-100 dark:border-indigo-900/50 shadow-sm'}`}>
                                <div className="flex gap-3">
                                    <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${
                                        notif.type === 'credit' ? 'bg-emerald-100 text-emerald-600' :
                                        notif.type === 'admin' ? 'bg-blue-100 text-blue-600' :
                                        notif.type === 'achievement' ? 'bg-yellow-100 text-yellow-600' :
                                        notif.type === 'warning' ? 'bg-red-100 text-red-600' :
                                        'bg-slate-100 text-slate-600'
                                    }`}>
                                        {notif.type === 'credit' && <CreditCard className="w-5 h-5" />}
                                        {notif.type === 'admin' && <ShieldCheck className="w-5 h-5" />}
                                        {notif.type === 'achievement' && <Trophy className="w-5 h-5" />}
                                        {notif.type === 'warning' && <AlertTriangle className="w-5 h-5" />}
                                        {(notif.type === 'system' || notif.type === 'info') && <Info className="w-5 h-5" />}
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <div className="flex justify-between items-start">
                                            <h4 className={`font-bold text-sm truncate pr-4 ${notif.read ? 'text-slate-600 dark:text-slate-400' : 'text-slate-900 dark:text-white'}`}>{notif.title}</h4>
                                            <span className="text-[9px] text-slate-400 whitespace-nowrap">{new Date(notif.createdAt).toLocaleDateString()}</span>
                                        </div>
                                        <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 leading-relaxed line-clamp-2">{notif.message}</p>
                                    </div>
                                </div>
                                
                                <div className="absolute top-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity bg-white/80 dark:bg-slate-800/80 backdrop-blur-sm rounded-lg p-1">
                                    {!notif.read && (
                                        <button onClick={() => handleMarkRead(notif.id)} className="p-1.5 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-md text-indigo-500" title="Marquer comme lu">
                                            <Check className="w-3.5 h-3.5" />
                                        </button>
                                    )}
                                    <button onClick={() => handleDeleteNotif(notif.id)} className="p-1.5 hover:bg-red-50 dark:hover:bg-red-900/30 rounded-md text-red-500" title="Supprimer">
                                        <Trash2 className="w-3.5 h-3.5" />
                                    </button>
                                </div>
                            </div>
                        ))}

                        {notifications.length === 0 && (
                            <div className="text-center py-10 text-slate-400">
                                <Bell className="w-12 h-12 mx-auto mb-3 opacity-20" />
                                <p>Aucune notification.</p>
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* CERTIFICATES TAB */}
            {activeTab === 'certs' && (
                <div className="space-y-6 animate-fade-in">
                    <button onClick={() => setActiveTab('menu')} className="text-xs font-bold text-slate-400 hover:text-indigo-500 flex items-center gap-1 mb-6">
                        <ChevronRight className="w-3 h-3 rotate-180"/> Retour Dashboard
                    </button>
                    
                    <h3 className="text-xl font-black text-slate-900 dark:text-white mb-4">Mes Réussites</h3>
                    
                    <div className="space-y-4">
                        {certificates.map((cert) => (
                            <div key={cert.id} className="p-4 bg-white dark:bg-slate-800 rounded-2xl border border-slate-100 dark:border-slate-700 shadow-sm relative overflow-hidden">
                                <div className="absolute top-0 right-0 w-20 h-20 bg-yellow-400/10 rounded-full -mr-10 -mt-10 blur-xl"></div>
                                <div className="flex items-start gap-4 relative z-10">
                                    <div className="w-12 h-12 bg-yellow-100 dark:bg-yellow-900/20 rounded-full flex items-center justify-center text-yellow-600 dark:text-yellow-500">
                                        <Award className="w-6 h-6" />
                                    </div>
                                    <div>
                                        <h4 className="font-bold text-slate-900 dark:text-white">Certificat {cert.level}</h4>
                                        <p className="text-xs text-slate-500">{cert.language}</p>
                                        <p className="text-[10px] text-slate-400 mt-1">Obtenu le {new Date(cert.issueDate).toLocaleDateString()}</p>
                                    </div>
                                </div>
                            </div>
                        ))}
                        {certificates.length === 0 && (
                            <div className="text-center py-10 text-slate-400">
                                <Trophy className="w-12 h-12 mx-auto mb-3 opacity-20" />
                                <p>Aucun certificat pour le moment.</p>
                                <button onClick={onStartExam} className="mt-4 text-indigo-500 font-bold text-sm hover:underline">Passer un examen</button>
                            </div>
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

export default SmartDashboard;
