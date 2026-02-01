
import React, { useMemo, useState } from 'react';
import { UserProfile, ChatMessage, VoiceName } from '../types';
import { X, Trophy, Flame, LogOut, Sun, Moon, BookOpen, CheckCircle, Calendar, Target, Edit2, Save, Type, Coins, CreditCard, ChevronRight, Check, Shield, Download, Upload, Loader2, Sparkles, Plus, Trash2, Sliders } from 'lucide-react';
import { storageService } from '../services/storageService';

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

const VOICE_OPTIONS: { id: VoiceName; label: string; desc: string }[] = [
    { id: 'Zephyr', label: 'Zephyr', desc: 'Calme' },
    { id: 'Kore', label: 'Kore', desc: 'Chaleureux' },
    { id: 'Puck', label: 'Puck', desc: 'Énergique' },
    { id: 'Charon', label: 'Charon', desc: 'Profond' }
];

const SmartDashboard: React.FC<SmartDashboardProps> = ({ 
  user, onClose, onUpdateUser, onLogout, isDarkMode, toggleTheme, fontSize, onFontSizeChange, notify
}) => {
  const [isEditing, setIsEditing] = useState(false);
  const [activeTab, setActiveTab] = useState<'hub' | 'lessons'>('hub');
  const [editForm, setEditForm] = useState({ username: user.username, email: user.email || '', password: user.password || '' });
  
  const handleSaveProfile = () => {
    if (!editForm.username.trim()) return;
    onUpdateUser({ ...user, username: editForm.username, email: editForm.email, password: editForm.password });
    setIsEditing(false);
    notify('Profil mis à jour !', 'success');
  };

  const handleUpdateVoice = (v: VoiceName) => {
    const updated = { ...user.preferences!, voiceName: v };
    onUpdateUser({ ...user, preferences: updated });
    storageService.updatePreferences(user.id, updated);
    notify(`Voix ${v} activée`, 'info');
  };

  return (
    <div className="fixed inset-0 z-[100] flex justify-end">
      <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm transition-opacity" onClick={onClose}></div>
      <div className="relative w-full md:w-[480px] h-full bg-white dark:bg-[#0F1422] shadow-2xl flex flex-col border-l border-white/20 animate-slide-in-right">
        {/* Header */}
        <div className="bg-white dark:bg-[#131825] p-6 border-b border-slate-100 dark:border-white/5">
             <button onClick={onClose} className="absolute top-4 right-4 p-2 hover:bg-slate-100 dark:hover:bg-white/10 rounded-full transition-colors text-slate-400"><X className="w-5 h-5" /></button>
             <div className="flex items-center gap-5">
                 <div className="w-16 h-16 bg-gradient-to-tr from-indigo-500 to-violet-500 rounded-2xl shadow-lg flex items-center justify-center text-2xl font-black text-white">{user.username.charAt(0).toUpperCase()}</div>
                 <div>
                     <h2 className="text-xl font-bold text-slate-900 dark:text-white">{user.username}</h2>
                     <p className="text-xs text-slate-500 uppercase font-bold tracking-widest">{user.preferences?.targetLanguage}</p>
                 </div>
             </div>
        </div>

        {/* Tab Switcher */}
        <div className="px-6 py-4">
            <div className="flex p-1 bg-slate-100 dark:bg-slate-800 rounded-xl">
                <button onClick={() => setActiveTab('hub')} className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all ${activeTab === 'hub' ? 'bg-white dark:bg-slate-700 text-indigo-600 dark:text-white shadow-sm' : 'text-slate-500'}`}>Mon Espace</button>
                <button onClick={() => setActiveTab('lessons')} className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all ${activeTab === 'lessons' ? 'bg-white dark:bg-slate-700 text-indigo-600 dark:text-white shadow-sm' : 'text-slate-500'}`}>Historique</button>
            </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto scrollbar-hide p-6">
            {activeTab === 'hub' && (
                <div className="space-y-6">
                    {/* Voice Selection */}
                    <div className="bg-slate-50 dark:bg-[#1A2030] rounded-3xl p-6 border border-slate-100 dark:border-white/5 shadow-sm">
                        <div className="flex items-center gap-3 mb-6">
                             <div className="p-2 bg-indigo-100 dark:bg-indigo-900/30 rounded-xl text-indigo-600"><Sliders className="w-5 h-5"/></div>
                             <h3 className="font-black text-slate-800 dark:text-white">Voix du Professeur</h3>
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                            {VOICE_OPTIONS.map(v => (
                                <button 
                                    key={v.id} 
                                    onClick={() => handleUpdateVoice(v.id)}
                                    className={`p-4 rounded-2xl border-2 transition-all flex flex-col items-center gap-1 ${user.preferences?.voiceName === v.id ? 'border-indigo-500 bg-indigo-500/5 text-indigo-600 dark:text-indigo-400' : 'bg-white dark:bg-slate-800 border-slate-100 dark:border-slate-700 hover:border-indigo-200'}`}
                                >
                                    <div className="text-sm font-black">{v.label}</div>
                                    <div className="text-[10px] opacity-60 font-bold uppercase">{v.desc}</div>
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Stats */}
                    <div className="grid grid-cols-2 gap-3">
                        <div className="bg-white dark:bg-[#1A2030] p-5 rounded-3xl text-center border border-slate-100 dark:border-white/5 shadow-sm">
                            <Trophy className="w-7 h-7 text-amber-500 mx-auto mb-2" />
                            <div className="text-2xl font-black">{user.stats.xp}</div>
                            <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">XP Totale</div>
                        </div>
                        <div className="bg-white dark:bg-[#1A2030] p-5 rounded-3xl text-center border border-slate-100 dark:border-white/5 shadow-sm">
                            <Flame className="w-7 h-7 text-orange-500 mx-auto mb-2" />
                            <div className="text-2xl font-black">{user.stats.streak}</div>
                            <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Série (Jours)</div>
                        </div>
                    </div>

                    {/* Settings UI */}
                    <div className="bg-white dark:bg-[#1A2030] rounded-3xl border border-slate-100 dark:border-white/5 shadow-sm overflow-hidden divide-y dark:divide-white/5">
                        <div className="p-5 flex items-center justify-between">
                            <span className="text-sm font-bold">Mode Sombre</span>
                            <button onClick={toggleTheme} className={`w-12 h-7 rounded-full p-1 transition-colors ${isDarkMode ? 'bg-indigo-600' : 'bg-slate-200'}`}><div className={`w-5 h-5 bg-white rounded-full shadow-sm transition-transform ${isDarkMode ? 'translate-x-5' : 'translate-x-0'}`}></div></button>
                        </div>
                        <div className="p-5 flex items-center justify-between">
                            <span className="text-sm font-bold">Taille Texte</span>
                            <div className="flex bg-slate-100 dark:bg-slate-700 rounded-lg p-1">
                                {(['small', 'normal', 'large'] as const).map(s => (
                                    <button key={s} onClick={() => onFontSizeChange(s)} className={`px-3 py-1 rounded-md text-xs font-black transition-all ${fontSize === s ? 'bg-white dark:bg-slate-600 text-indigo-600 dark:text-white shadow-sm' : 'text-slate-400'}`}>A</button>
                                ))}
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>

        {/* Footer Logout */}
        <div className="p-6 border-t border-slate-100 dark:border-white/5">
            <button onClick={onLogout} className="w-full py-4 bg-red-50 dark:bg-red-900/10 text-red-600 font-black rounded-2xl flex items-center justify-center gap-3 transition-all hover:bg-red-100">
                <LogOut className="w-5 h-5" /> Déconnexion
            </button>
        </div>
      </div>
    </div>
  );
};

export default SmartDashboard;
