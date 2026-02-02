
import React from 'react';
import { UserProfile, ChatMessage } from '../types';
import { X, LogOut, Sun, Moon, Book, Trophy, Settings, User } from 'lucide-react';
import { storageService } from '../services/storageService';

interface Props {
  user: UserProfile;
  onClose: () => void;
  onUpdateUser: (u: UserProfile) => void;
  onLogout: () => void;
  isDarkMode: boolean;
  toggleTheme: () => void;
  notify: (msg: string, type?: string) => void;
  messages: ChatMessage[];
}

const SmartDashboard: React.FC<Props> = ({ user, onClose, onLogout, isDarkMode, toggleTheme }) => {
  return (
    <div className="fixed inset-0 z-50 flex">
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm animate-fade-in" 
        onClick={onClose}
      />
      
      {/* Sidebar Content */}
      <div className="relative w-80 h-full bg-white dark:bg-slate-950 shadow-2xl flex flex-col animate-slide-in-right border-r border-slate-200 dark:border-slate-800">
        
        {/* Header */}
        <div className="p-6 border-b border-slate-100 dark:border-slate-800 flex justify-between items-center bg-slate-50 dark:bg-slate-900">
            <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-indigo-600 text-white rounded-xl flex items-center justify-center font-bold text-lg shadow-lg">
                    {user.username.charAt(0).toUpperCase()}
                </div>
                <div>
                    <h2 className="font-bold text-slate-800 dark:text-white">{user.username}</h2>
                    <p className="text-xs text-slate-500 dark:text-slate-400">Étudiant</p>
                </div>
            </div>
            <button onClick={onClose} className="p-2 hover:bg-slate-200 dark:hover:bg-slate-800 rounded-full transition-colors">
                <X className="w-5 h-5 text-slate-500" />
            </button>
        </div>

        {/* Stats Section */}
        <div className="p-6 grid grid-cols-2 gap-4">
            <div className="bg-amber-50 dark:bg-amber-900/10 p-4 rounded-2xl border border-amber-100 dark:border-amber-900/30 text-center">
                <Trophy className="w-6 h-6 text-amber-500 mx-auto mb-2" />
                <div className="text-xl font-black text-slate-800 dark:text-white">{user.stats.xp}</div>
                <div className="text-[10px] font-bold text-amber-600 uppercase tracking-wide">Points XP</div>
            </div>
            <div className="bg-indigo-50 dark:bg-indigo-900/10 p-4 rounded-2xl border border-indigo-100 dark:border-indigo-900/30 text-center">
                <Book className="w-6 h-6 text-indigo-500 mx-auto mb-2" />
                <div className="text-xl font-black text-slate-800 dark:text-white">{user.credits}</div>
                <div className="text-[10px] font-bold text-indigo-600 uppercase tracking-wide">Crédits</div>
            </div>
        </div>

        {/* Menu Items */}
        <div className="flex-1 overflow-y-auto px-6 py-2 space-y-2">
            <div className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-4 mt-2">Paramètres</div>
            
            <button 
                onClick={toggleTheme}
                className="w-full flex items-center justify-between p-4 bg-slate-50 dark:bg-slate-900 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors border border-slate-100 dark:border-slate-800"
            >
                <div className="flex items-center gap-3">
                    {isDarkMode ? <Moon className="w-5 h-5 text-indigo-400" /> : <Sun className="w-5 h-5 text-amber-500" />}
                    <span className="font-bold text-sm text-slate-700 dark:text-slate-300">Thème {isDarkMode ? 'Sombre' : 'Clair'}</span>
                </div>
            </button>

            <button className="w-full flex items-center gap-3 p-4 bg-slate-50 dark:bg-slate-900 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors border border-slate-100 dark:border-slate-800 text-slate-700 dark:text-slate-300">
                <User className="w-5 h-5" />
                <span className="font-bold text-sm">Mon Profil</span>
            </button>

            <button className="w-full flex items-center gap-3 p-4 bg-slate-50 dark:bg-slate-900 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors border border-slate-100 dark:border-slate-800 text-slate-700 dark:text-slate-300">
                <Settings className="w-5 h-5" />
                <span className="font-bold text-sm">Préférences</span>
            </button>
        </div>

        {/* Footer */}
        <div className="p-6 border-t border-slate-100 dark:border-slate-800">
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
