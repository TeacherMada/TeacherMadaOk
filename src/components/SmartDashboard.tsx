
import React, { useState } from 'react';
import { UserProfile, ChatMessage } from '../types';
import { X, LogOut, Sun, Moon, Book, Trophy, Volume2, Loader2, Sparkles } from 'lucide-react';
import { storageService } from '../services/storageService';
import { generateVocabularyFromHistory } from '../services/geminiService';

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

const SmartDashboard: React.FC<Props> = ({ user, onClose, onLogout, isDarkMode, toggleTheme, notify, messages, onUpdateUser }) => {
  const [activeTab, setActiveTab] = useState<'profile' | 'words'>('profile');
  const [isExtracting, setIsExtracting] = useState(false);

  // FIX TS18048 : Toujours utiliser une valeur par défaut vide
  const vocabulary = user.vocabulary ?? [];

  const extractWords = async () => {
    if (!storageService.canPerformRequest(user.id)) return;
    setIsExtracting(true);
    try {
        // En prod, on appellerait une fonction Gemini ici. Simulons pour la réinitialisation
        const newWord = { id: Date.now().toString(), word: "Pratique", translation: "Practice", mastered: false, addedAt: Date.now() };
        const updated = { ...user, vocabulary: [...vocabulary, newWord] };
        onUpdateUser(updated);
        storageService.saveUserProfile(updated);
        notify("Nouveau mot ajouté !");
    } finally { setIsExtracting(false); }
  };

  return (
    <div className="fixed inset-0 z-[150] flex justify-end">
      <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={onClose}></div>
      <div className="relative w-full max-w-md h-full bg-white dark:bg-slate-900 shadow-2xl flex flex-col">
        <header className="p-6 border-b flex justify-between items-center">
          <h2 className="text-xl font-bold">Menu Personnel</h2>
          <button onClick={onClose} className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-full"><X /></button>
        </header>

        <div className="flex p-4 border-b gap-4">
          <button onClick={() => setActiveTab('profile')} className={`flex-1 py-2 font-bold rounded-lg ${activeTab === 'profile' ? 'bg-indigo-600 text-white' : 'text-slate-500'}`}>Profil</button>
          <button onClick={() => setActiveTab('words')} className={`flex-1 py-2 font-bold rounded-lg ${activeTab === 'words' ? 'bg-indigo-600 text-white' : 'text-slate-500'}`}>Mots ({vocabulary.length})</button>
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          {activeTab === 'profile' && (
            <div className="space-y-6 animate-fade-in">
              <div className="flex flex-col items-center p-6 bg-slate-50 dark:bg-slate-800 rounded-3xl">
                <div className="w-20 h-20 bg-indigo-100 text-indigo-600 rounded-full flex items-center justify-center text-3xl font-black mb-4">
                  {user.username.charAt(0).toUpperCase()}
                </div>
                <h3 className="text-xl font-bold">{user.username}</h3>
                <p className="text-sm text-slate-500">{user.preferences?.targetLanguage}</p>
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                <div className="p-4 bg-slate-50 dark:bg-slate-800 rounded-2xl text-center">
                  <Trophy className="mx-auto mb-1 text-amber-500" />
                  <div className="font-bold text-lg">{user.stats.xp}</div>
                  <div className="text-[10px] text-slate-500 uppercase">Points XP</div>
                </div>
                <div className="p-4 bg-slate-50 dark:bg-slate-800 rounded-2xl text-center">
                  <Book className="mx-auto mb-1 text-indigo-500" />
                  <div className="font-bold text-lg">{user.stats.lessonsCompleted}</div>
                  <div className="text-[10px] text-slate-500 uppercase">Leçons</div>
                </div>
              </div>

              <button onClick={toggleTheme} className="w-full flex items-center justify-between p-4 bg-slate-50 dark:bg-slate-800 rounded-2xl">
                <span className="font-bold">{isDarkMode ? 'Mode Clair' : 'Mode Sombre'}</span>
                {isDarkMode ? <Sun /> : <Moon />}
              </button>
            </div>
          )}

          {activeTab === 'words' && (
            <div className="space-y-4 animate-fade-in">
              <button onClick={extractWords} disabled={isExtracting} className="w-full py-4 bg-indigo-600 text-white font-bold rounded-2xl flex items-center justify-center gap-2">
                {isExtracting ? <Loader2 className="animate-spin" /> : <Sparkles size={18} />}
                Générer Vocabulaire (IA)
              </button>
              
              <div className="space-y-2">
                {vocabulary.length === 0 ? (
                  <p className="text-center py-20 text-slate-500">Aucun mot enregistré.</p>
                ) : (
                  vocabulary.map(v => (
                    <div key={v.id} className="p-4 bg-slate-50 dark:bg-slate-800 rounded-2xl flex justify-between items-center">
                      <div>
                        <div className="font-bold">{v.word}</div>
                        <div className="text-xs text-slate-500">{v.translation}</div>
                      </div>
                      <button className="p-2 text-indigo-500 hover:bg-indigo-50 dark:hover:bg-indigo-900/30 rounded-lg"><Volume2 size={16} /></button>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}
        </div>

        <div className="p-6 border-t mt-auto">
          <button onClick={onLogout} className="w-full py-4 bg-red-50 text-red-600 font-bold rounded-2xl flex items-center justify-center gap-2 hover:bg-red-100 transition-colors">
            <LogOut size={18} /> Déconnexion
          </button>
        </div>
      </div>
    </div>
  );
};

export default SmartDashboard;
