
import React, { useMemo, useState } from 'react';
import { UserProfile, ChatMessage } from '../types';
import { X, Trophy, Flame, LogOut, Sun, Moon, BookOpen, CheckCircle, Calendar, Target, Edit2, Save, Type, Coins, CreditCard, ChevronRight, Check, Shield, Download, Upload, Loader2, Sparkles, Plus, Trash2 } from 'lucide-react';
import { storageService } from '../services/storageService';
import { CREDIT_PRICE_ARIARY, ADMIN_CONTACTS } from '../constants';

interface SmartDashboardProps {
  user: UserProfile;
  messages: ChatMessage[];
  onClose: () => void;
  onUpgrade: () => void;
  onUpdateUser: (user: UserProfile) => void;
  onLogout: () => void;
  isDarkMode: boolean;
  toggleTheme: () => void;
  fontSize: 'small' | 'normal' | 'large' | 'xl';
  onFontSizeChange: (size: 'small' | 'normal' | 'large' | 'xl') => void;
  notify: (message: string, type: 'success' | 'error' | 'info') => void;
}

const SmartDashboard: React.FC<SmartDashboardProps> = ({ 
  user, messages, onClose, onUpgrade, onUpdateUser, onLogout, isDarkMode, toggleTheme, fontSize, onFontSizeChange, notify
}) => {
  const [isEditing, setIsEditing] = useState(false);
  const [activeTab, setActiveTab] = useState<'hub' | 'lessons'>('hub');
  const [editForm, setEditForm] = useState({ username: user.username, email: user.email || '', password: user.password || '' });
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  
  const completedLessons = useMemo(() => {
    const lessons: {num: number, title: string, date: number}[] = [];
    const regex = /##\s*(?:🟢|🔴|🔵|✅)?\s*(?:LEÇON|LECON|LESSON|LESONA)\s*(\d+)\s*[:|-]?\s*(.*)/i;
    
    messages.forEach(msg => {
        if (msg.role === 'model') {
            const lines = msg.text.split('\n');
            for(const line of lines) {
                const match = line.match(regex);
                if (match) {
                     const rawTitle = match[2].trim().replace(/[*_]/g, '');
                     lessons.push({ num: parseInt(match[1]), title: rawTitle || `Leçon ${match[1]}`, date: msg.timestamp });
                     break; 
                }
            }
        }
    });
    const uniqueLessons = new Map<number, {num: number, title: string, date: number}>();
    lessons.forEach(l => uniqueLessons.set(l.num, l));
    return Array.from(uniqueLessons.values()).sort((a, b) => b.num - a.num);
  }, [messages]);

  const handleSaveProfile = () => {
    if (!editForm.username.trim()) return;
    const updatedUser = { ...user, username: editForm.username, email: editForm.email, password: editForm.password };
    onUpdateUser(updatedUser);
    setIsEditing(false);
    notify('Profil mis à jour !', 'success');
  };

  const handleClearHistory = async () => {
      await storageService.clearChatHistory(user.id, user.preferences?.targetLanguage);
      notify("Historique effacé. Redémarrez l'app.", 'success');
      setShowClearConfirm(false);
      onClose(); 
      window.location.reload(); 
  };

  const handleExportData = () => {
      const dataStr = storageService.exportUserData();
      const blob = new Blob([dataStr], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `teachermada_backup_${new Date().toISOString().split('T')[0]}.json`;
      link.click();
      notify("Sauvegarde téléchargée.", 'success');
  };

  const handleImportData = () => {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = 'application/json';
      input.onchange = (e: any) => {
          const file = e.target.files[0];
          if (!file) return;
          const reader = new FileReader();
          reader.onload = (e) => {
              const content = e.target?.result as string;
              if (storageService.importUserData(content)) {
                  notify("Données restaurées. Redémarrage...", 'success');
                  setTimeout(() => window.location.reload(), 1500);
              } else {
                  notify("Fichier invalide.", 'error');
              }
          };
          reader.readAsText(file);
      };
      input.click();
  };

  const handleAdminAccess = () => { window.location.reload(); };

  return (
    <div className="fixed inset-0 z-[100] flex justify-end">
      <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm transition-opacity" onClick={onClose}></div>
      <div className="relative w-full md:w-[480px] h-full bg-white/95 dark:bg-[#0F1422]/95 backdrop-blur-xl shadow-2xl flex flex-col border-l border-white/20 dark:border-white/5 overflow-hidden animate-slide-in-right">
        {/* Header */}
        <div className="relative bg-white dark:bg-[#131825] p-6 border-b border-slate-100 dark:border-white/5">
             <button onClick={onClose} className="absolute top-4 right-4 p-2 hover:bg-slate-100 dark:hover:bg-white/10 rounded-full transition-colors text-slate-400"><X className="w-5 h-5" /></button>
             <div className="flex items-center gap-5">
                 <div className="relative">
                     <div className="w-16 h-16 bg-gradient-to-tr from-indigo-500 to-violet-500 rounded-2xl rotate-3 shadow-lg flex items-center justify-center text-2xl font-black text-white border-2 border-white dark:border-slate-800">{user.username.charAt(0).toUpperCase()}</div>
                     <div className="absolute -bottom-2 -right-2 bg-emerald-500 border-4 border-white dark:border-[#131825] w-6 h-6 rounded-full flex items-center justify-center"><Check className="w-3 h-3 text-white" /></div>
                 </div>
                 <div>
                     <h2 className="text-xl font-bold text-slate-900 dark:text-white">{user.username}</h2>
                     <div className="flex items-center gap-2 mt-1">
                        <span className="text-xs font-bold px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 uppercase tracking-wide">{user.preferences?.targetLanguage.split(' ')[0] || "Apprenant"}</span>
                        {user.role === 'admin' && <span className="text-xs font-black text-red-500 px-2 py-0.5 rounded-md bg-red-50 dark:bg-red-900/20 border border-red-100 dark:border-red-900">ADMIN</span>}
                     </div>
                 </div>
             </div>
        </div>

        {/* Tabs */}
        <div className="px-6 py-4 bg-white dark:bg-[#131825]">
            <div className="flex p-1 bg-slate-100 dark:bg-slate-800 rounded-xl overflow-x-auto scrollbar-hide">
                <TabButton active={activeTab === 'hub'} onClick={() => setActiveTab('hub')} icon={<Target className="w-4 h-4"/>} label="Profil & Compte" />
                <TabButton active={activeTab === 'lessons'} onClick={() => setActiveTab('lessons')} icon={<Calendar className="w-4 h-4"/>} label="Historique" />
            </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto scrollbar-hide p-6 bg-slate-50 dark:bg-[#0B0F19]">
            {activeTab === 'hub' && (
                <div className="space-y-6 animate-fade-in">
                    {user.role === 'admin' && <button onClick={handleAdminAccess} className="w-full py-3 bg-indigo-600 text-white font-bold rounded-xl flex items-center justify-center gap-2 shadow-lg mb-2"><Shield className="w-5 h-5"/> Accéder au Panel Admin</button>}
                    <div className="group relative overflow-hidden rounded-[2rem] bg-gradient-to-br from-slate-900 via-[#1e293b] to-indigo-900 p-6 shadow-2xl shadow-indigo-900/20 border border-white/10 transition-transform hover:scale-[1.01]">
                        <div className="absolute top-0 right-0 w-48 h-48 bg-white/5 rounded-full -mr-16 -mt-16 blur-3xl"></div>
                        <div className="relative z-10 flex justify-between items-start mb-10">
                            <div>
                                <div className="flex items-center gap-2 mb-1"><div className="p-1.5 bg-white/10 rounded-lg backdrop-blur-md"><CreditCard className="w-4 h-4 text-indigo-300" /></div><span className="text-xs font-bold text-indigo-200 uppercase tracking-widest">Portefeuille</span></div>
                                <div className="flex items-baseline gap-1.5 mt-2"><span className="text-5xl font-black text-white tracking-tighter">{user.credits}</span><span className="text-lg font-bold text-indigo-400">CRD</span></div>
                            </div>
                        </div>
                        <button onClick={onUpgrade} className="relative z-10 w-full py-3.5 bg-white text-slate-900 font-bold rounded-xl text-sm flex items-center justify-center gap-2 hover:bg-indigo-50 transition-all shadow-lg active:scale-95"><Coins className="w-4 h-4 text-indigo-600" /> Recharger mon compte</button>
                    </div>
                    
                    {/* Settings */}
                    <div className="bg-white dark:bg-[#1A2030] rounded-[1.5rem] p-1 border border-slate-100 dark:border-white/5 shadow-sm">
                        <SettingItem icon={<Sun className="w-4 h-4"/>} label="Thème" action={<button onClick={toggleTheme} className={`w-10 h-6 rounded-full p-1 transition-colors ${isDarkMode ? 'bg-indigo-600' : 'bg-slate-200'}`}><div className={`w-4 h-4 bg-white rounded-full shadow-sm transform transition-transform ${isDarkMode ? 'translate-x-4' : 'translate-x-0'}`}></div></button>} />
                        <div className="h-px bg-slate-50 dark:bg-white/5 mx-4"></div>
                        <SettingItem icon={<Type className="w-4 h-4"/>} label="Taille Texte" action={<div className="flex bg-slate-100 dark:bg-slate-800 rounded-lg p-1">{(['small', 'normal', 'large'] as const).map((size) => (<button key={size} onClick={() => onFontSizeChange(size)} className={`px-2 py-0.5 rounded text-xs font-bold ${fontSize === size ? 'bg-white dark:bg-slate-600 shadow-sm text-indigo-600 dark:text-white' : 'text-slate-400'}`}>A</button>))}</div>} />
                        <div className="h-px bg-slate-50 dark:bg-white/5 mx-4"></div>
                        <div className="p-3">
                            <button onClick={() => setIsEditing(!isEditing)} className="w-full flex items-center justify-between text-sm font-bold text-slate-600 dark:text-slate-300 hover:text-indigo-600 dark:hover:text-white transition-colors"><span className="flex items-center gap-3"><Edit2 className="w-4 h-4"/> Modifier Profil</span><ChevronRight className={`w-4 h-4 transition-transform ${isEditing ? 'rotate-90' : ''}`} /></button>
                            {isEditing && (
                                <div className="mt-3 space-y-3 animate-fade-in bg-slate-50 dark:bg-black/20 p-3 rounded-xl">
                                    <input type="text" value={editForm.username} onChange={(e) => setEditForm({...editForm, username: e.target.value})} className="w-full p-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-sm outline-none" placeholder="Username" />
                                    <input type="password" value={editForm.password} onChange={(e) => setEditForm({...editForm, password: e.target.value})} className="w-full p-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-sm outline-none" placeholder="Nouveau Mot de passe" />
                                    <button onClick={handleSaveProfile} className="w-full py-2 bg-indigo-600 text-white rounded-lg text-sm font-bold shadow-md">Enregistrer</button>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Data Management */}
                    <div className="bg-slate-100 dark:bg-slate-800/50 rounded-2xl p-4 border border-slate-200 dark:border-slate-700">
                        <h4 className="text-xs font-bold text-slate-500 uppercase mb-3">Données & Sauvegarde</h4>
                        <div className="flex gap-2 mb-3">
                            <button onClick={handleExportData} className="flex-1 py-2 bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-lg text-xs font-bold flex items-center justify-center gap-1 hover:bg-slate-50 dark:hover:bg-slate-600 transition-colors">
                                <Download className="w-3 h-3"/> Exporter
                            </button>
                            <button onClick={handleImportData} className="flex-1 py-2 bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-lg text-xs font-bold flex items-center justify-center gap-1 hover:bg-slate-50 dark:hover:bg-slate-600 transition-colors">
                                <Upload className="w-3 h-3"/> Importer
                            </button>
                        </div>
                        {!showClearConfirm ? (
                            <button onClick={() => setShowClearConfirm(true)} className="w-full flex items-center justify-center gap-2 text-red-500 hover:text-red-600 font-bold text-xs"><Trash2 className="w-3 h-3"/> Effacer tout</button>
                        ) : (
                            <div className="animate-fade-in text-center bg-red-50 dark:bg-red-900/10 p-2 rounded-lg">
                                <p className="text-[10px] text-red-600 dark:text-red-400 mb-2 font-bold">Action irréversible.</p>
                                <div className="flex gap-2"><button onClick={() => setShowClearConfirm(false)} className="flex-1 py-1.5 bg-white dark:bg-slate-800 text-slate-500 rounded text-[10px] font-bold">Annuler</button><button onClick={handleClearHistory} className="flex-1 py-1.5 bg-red-500 text-white rounded text-[10px] font-bold">Confirmer</button></div>
                            </div>
                        )}
                    </div>
                </div>
            )}

            {activeTab === 'lessons' && (
                <div className="space-y-4 animate-fade-in">
                     <div className="flex items-center justify-between mb-2">
                        <h3 className="font-bold text-slate-800 dark:text-white flex items-center gap-2"><BookOpen className="w-4 h-4 text-indigo-500" /> Historique</h3>
                        <span className="text-xs font-bold text-slate-400 bg-slate-100 dark:bg-slate-800 px-2 py-1 rounded-full">{completedLessons.length} leçons</span>
                     </div>
                     {completedLessons.length > 0 ? (
                        <div className="space-y-3">
                            {completedLessons.map((lesson) => (
                                <div key={lesson.num} className="group bg-white dark:bg-[#1A2030] p-4 rounded-2xl flex items-center justify-between border border-slate-100 dark:border-white/5 hover:border-indigo-200 dark:hover:border-indigo-900 transition-all hover:shadow-md cursor-default">
                                    <div className="flex items-center gap-4 overflow-hidden">
                                        <div className="shrink-0 w-12 h-12 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 flex flex-col items-center justify-center">
                                            <span className="text-[10px] font-bold uppercase">Leçon</span><span className="text-lg font-black leading-none">{lesson.num}</span>
                                        </div>
                                        <div className="min-w-0">
                                            <h4 className="font-bold text-slate-800 dark:text-white text-sm truncate">{lesson.title}</h4>
                                            <div className="text-xs text-slate-500 dark:text-slate-400 flex items-center gap-1 mt-1"><Calendar className="w-3 h-3" /> {new Date(lesson.date).toLocaleDateString()}</div>
                                        </div>
                                    </div>
                                    <CheckCircle className="w-5 h-5 text-emerald-500 shrink-0" />
                                </div>
                            ))}
                        </div>
                    ) : (
                        <div className="text-center py-16 text-slate-500"><p className="text-sm font-bold">Aucune leçon terminée.</p></div>
                    )}
                </div>
            )}
        </div>

        {/* Footer */}
        <div className="p-6 border-t border-slate-100 dark:border-white/5 bg-white dark:bg-[#131825]">
            <button onClick={onLogout} className="w-full flex items-center justify-center gap-2 px-4 py-3.5 rounded-xl text-red-500 bg-red-50 dark:bg-red-900/10 hover:bg-red-100 dark:hover:bg-red-900/20 transition-colors text-sm font-bold group">
                <LogOut className="w-4 h-4 group-hover:-translate-x-1 transition-transform" /> Déconnexion
            </button>
        </div>
      </div>
    </div>
  );
};

const TabButton = ({ active, onClick, icon, label }: any) => (
    <button onClick={onClick} className={`flex-1 min-w-[80px] flex items-center justify-center gap-2 py-2.5 rounded-lg text-xs font-bold transition-all ${active ? 'bg-white dark:bg-[#0F1422] text-indigo-600 dark:text-white shadow-sm' : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'}`}>
        {icon} {label}
    </button>
);

const SettingItem = ({ icon, label, action }: any) => (
    <div className="flex items-center justify-between p-3 hover:bg-slate-50 dark:hover:bg-white/5 rounded-xl transition-colors">
        <div className="flex items-center gap-3"><div className="text-slate-400">{icon}</div><span className="text-sm font-bold text-slate-700 dark:text-slate-200">{label}</span></div>
        {action}
    </div>
);

export default SmartDashboard;
