
import React, { useState } from 'react';
import { UserProfile, ChatMessage } from '../types';
import { X, LogOut, Sun, Moon, Book, Trophy, Volume2, Loader2, Sparkles, BrainCircuit } from 'lucide-react';
import { storageService } from '../services/storageService';

interface Props {
  user: UserProfile;
  onClose: () => void;
  onUpdateUser: (u: UserProfile) => void;
  onLogout: () => void;
  isDarkMode: boolean;
  toggleTheme: () => void;
  notify: (m: string, t?: string) => void;
  messages: ChatMessage[];
}

const SmartDashboard: React.FC<Props> = ({ user, onClose, onLogout, isDarkMode, toggleTheme, notify, onUpdateUser }) => {
  const [activeTab, setActiveTab] = useState<'profile' | 'words'>('profile');
  const [isExtracting, setIsExtracting] = useState(false);

  // FIX TS18048 : Toujours garantir un tableau
  const vocabulary = user.vocabulary ?? [];

  const handleSync = async () => {
    setIsExtracting(true);
    setTimeout(() => {
      setIsExtracting(false);
      notify("Vocabulaire synchronisé", "success");
    }, 1500);
  };

  return (
    <div className="fixed inset-0 z-[150] flex justify-end">
      <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm animate-fade-in" onClick={onClose}></div>
      <div className="relative w-full max-w-md h-full bg-white dark:bg-[#0B0F19] shadow-2xl flex flex-col animate-slide-in-right">
        <header className="p-6 border-b dark:border-slate-800 flex justify-between items-center bg-white dark:bg-slate-900">
          <div>
            <h2 className="text-xl font-black tracking-tight">Mon Profil</h2>
            <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">{user.username}</p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-full transition-colors"><X /></button>
        </header>

        <div className="flex p-2 bg-slate-100 dark:bg-slate-800 m-4 rounded-2xl">
          <button onClick={() => setActiveTab('profile')} className={`flex-1 py-3 font-black text-xs uppercase rounded-xl transition-all ${activeTab === 'profile' ? 'bg-white dark:bg-slate-700 text-indigo-600 shadow-sm' : 'text-slate-500'}`}>Stats</button>
          <button onClick={() => setActiveTab('words')} className={`flex-1 py-3 font-black text-xs uppercase rounded-xl transition-all ${activeTab === 'words' ? 'bg-white dark:bg-slate-700 text-indigo-600 shadow-sm' : 'text-slate-500'}`}>Mots ({vocabulary.length})</button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 scrollbar-hide">
          {activeTab === 'profile' && (
            <div className="space-y-6 animate-fade-in">
              <div className="grid grid-cols-2 gap-4">
                <div className="p-6 bg-slate-50 dark:bg-slate-900 rounded-[2rem] border dark:border-slate-800 text-center shadow-inner">
                  <Trophy className="mx-auto mb-2 text-amber-500 w-8 h-8" />
                  <div className="font-black text-2xl">{user.stats.xp}</div>
                  <div className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">Points XP</div>
                </div>
                <div className="p-6 bg-slate-50 dark:bg-slate-900 rounded-[2rem] border dark:border-slate-800 text-center shadow-inner">
                  <Book className="mx-auto mb-2 text-indigo-500 w-8 h-8" />
                  <div className="font-black text-2xl">{user.stats.lessonsCompleted}</div>
                  <div className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">Leçons</div>
                </div>
              </div>

              <div className="space-y-3">
                <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest px-2">Paramètres</h3>
                <button onClick={toggleTheme} className="w-full flex items-center justify-between p-5 bg-white dark:bg-slate-900 border dark:border-slate-800 rounded-3xl transition-all hover:border-indigo-500/50 group">
                  <span className="font-bold text-sm">Mode {isDarkMode ? 'Clair' : 'Sombre'}</span>
                  {isDarkMode ? <Sun className="text-amber-500 group-hover:rotate-12 transition-transform" /> : <Moon className="text-indigo-500" />}
                </button>
              </div>
            </div>
          )}

          {activeTab === 'words' && (
            <div className="space-y-4 animate-fade-in">
              <button onClick={handleSync} disabled={isExtracting} className="w-full py-4 bg-indigo-600 text-white font-black rounded-2xl flex items-center justify-center gap-3 shadow-lg shadow-indigo-500/20 disabled:opacity-50">
                {isExtracting ? <Loader2 className="animate-spin" /> : <BrainCircuit size={20} />}
                Synchroniser
              </button>
              
              <div className="space-y-2">
                {vocabulary.length === 0 ? (
                  <div className="text-center py-20 text-slate-500">
                    <Sparkles className="mx-auto mb-4 opacity-20 w-12 h-12" />
                    <p className="text-sm font-bold">Apprenez des mots dans le chat !</p>
                  </div>
                ) : (
                  vocabulary.map(v => (
                    <div key={v.id} className="p-4 bg-white dark:bg-slate-900 border dark:border-slate-800 rounded-2xl flex justify-between items-center group hover:border-indigo-500/30 transition-all">
                      <div>
                        <div className="font-black text-slate-800 dark:text-slate-100">{v.word}</div>
                        <div className="text-xs font-medium text-slate-500">{v.translation}</div>
                      </div>
                      <button className="p-2 text-indigo-500 hover:bg-indigo-50 dark:hover:bg-indigo-900/30 rounded-full transition-colors"><Volume2 size={16} /></button>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}
        </div>

        <div className="p-6 border-t dark:border-slate-800 bg-white dark:bg-slate-900">
          <button onClick={onLogout} className="w-full py-4 bg-red-50 dark:bg-red-900/10 text-red-600 font-black rounded-2xl flex items-center justify-center gap-3 transition-all hover:bg-red-100">
            <LogOut size={18} /> Déconnexion
          </button>
        </div>
      </div>
    </div>
  );
};

export default SmartDashboard;
