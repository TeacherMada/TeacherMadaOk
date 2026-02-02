
import React, { useState } from 'react';
import { UserProfile, VocabularyItem } from '../types';
import { X, LogOut, Sun, Moon, Book, Trophy, Volume2, Loader2, Sparkles, Download, Upload, Trash2, CheckCircle } from 'lucide-react';
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
}

const SmartDashboard: React.FC<Props> = ({ user, onClose, onLogout, isDarkMode, toggleTheme, onUpdateUser }) => {
  const [activeTab, setActiveTab] = useState<'stats' | 'vocab'>('stats');
  const [isExtracting, setIsExtracting] = useState(false);

  const handleExtract = async () => {
    const history = storageService.getChatHistory(user.preferences!.targetLanguage);
    if (history.length < 2) {
      toast.info("Parlez un peu plus avant d'extraire des mots.");
      return;
    }
    
    setIsExtracting(true);
    try {
      const newWords = await extractVocabulary(history);
      const updated = { ...user, vocabulary: [...newWords, ...user.vocabulary].slice(0, 100) };
      onUpdateUser(updated);
      toast.success(`${newWords.length} mots ajoutés à votre boîte !`);
    } finally { setIsExtracting(false); }
  };

  const handleExport = () => {
    storageService.exportData();
    toast.success("Données exportées avec succès.");
  };

  return (
    <div className="fixed inset-0 z-[150] flex justify-end animate-fade-in">
      <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={onClose}></div>
      
      <div className="relative w-full max-w-md h-full bg-white dark:bg-slate-950 shadow-2xl flex flex-col transform transition-transform duration-300">
        <header className="p-6 border-b dark:border-slate-800 flex justify-between items-center bg-white dark:bg-slate-900 safe-top">
          <div>
            <h2 className="text-xl font-extrabold tracking-tight">Mon Espace</h2>
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{user.username}</p>
          </div>
          <button onClick={onClose} className="p-2.5 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-full transition-colors"><X /></button>
        </header>

        <div className="flex p-2 bg-slate-100 dark:bg-slate-900 m-4 rounded-2xl">
          <button onClick={() => setActiveTab('stats')} className={`flex-1 py-3 text-xs font-bold uppercase rounded-xl transition-all ${activeTab === 'stats' ? 'bg-white dark:bg-slate-800 text-brand-600 shadow-sm' : 'text-slate-500'}`}>Progression</button>
          <button onClick={() => setActiveTab('vocab')} className={`flex-1 py-3 text-xs font-bold uppercase rounded-xl transition-all ${activeTab === 'vocab' ? 'bg-white dark:bg-slate-800 text-brand-600 shadow-sm' : 'text-slate-500'}`}>Mots ({user.vocabulary.length})</button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 scrollbar-hide">
          {activeTab === 'stats' && (
            <div className="space-y-6 animate-slide-up">
              <div className="grid grid-cols-2 gap-4">
                <StatCard icon={<Trophy className="text-amber-500"/>} label="Points XP" value={user.xp} />
                <StatCard icon={<Book className="text-brand-500"/>} label="Crédits" value={user.credits} />
              </div>

              <div className="space-y-3">
                <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Paramètres PWA</h3>
                <button onClick={toggleTheme} className="w-full flex items-center justify-between p-4 bg-slate-50 dark:bg-slate-900 rounded-2xl border dark:border-slate-800">
                  <span className="font-bold text-sm">Mode {isDarkMode ? 'Clair' : 'Sombre'}</span>
                  {isDarkMode ? <Sun className="text-amber-500"/> : <Moon className="text-brand-500"/>}
                </button>
                <button onClick={handleExport} className="w-full flex items-center justify-between p-4 bg-slate-50 dark:bg-slate-900 rounded-2xl border dark:border-slate-800">
                  <span className="font-bold text-sm text-brand-600">Exporter Sauvegarde (.json)</span>
                  <Download className="w-5 h-5" />
                </button>
              </div>
            </div>
          )}

          {activeTab === 'vocab' && (
            <div className="space-y-4 animate-slide-up">
              <button onClick={handleExtract} disabled={isExtracting} className="w-full py-4 bg-brand-600 text-white font-black rounded-2xl flex items-center justify-center gap-3 shadow-lg shadow-brand-500/20 disabled:opacity-50">
                {isExtracting ? <Loader2 className="animate-spin"/> : <Sparkles size={18}/>}
                Extraire Mots du Chat
              </button>
              
              <div className="space-y-3">
                {user.vocabulary.length === 0 ? (
                  <div className="text-center py-20 opacity-30">
                    <Book className="w-12 h-12 mx-auto mb-2" />
                    <p className="text-sm font-bold">Votre boîte à mots est vide.</p>
                  </div>
                ) : (
                  user.vocabulary.map(v => (
                    <div key={v.id} className="p-4 bg-slate-50 dark:bg-slate-900 border dark:border-slate-800 rounded-2xl group transition-all hover:border-brand-500/30">
                      <div className="flex justify-between items-start">
                        <div>
                          <div className="font-black text-slate-800 dark:text-white">{v.word}</div>
                          <div className="text-xs text-slate-500 font-medium">{v.translation}</div>
                        </div>
                        <button className="p-2 text-brand-500 hover:bg-brand-50 dark:hover:bg-brand-900/30 rounded-xl transition-colors"><Volume2 size={16}/></button>
                      </div>
                      {v.example && <p className="mt-2 text-[10px] text-slate-400 italic leading-relaxed">"{v.example}"</p>}
                    </div>
                  ))
                )}
              </div>
            </div>
          )}
        </div>

        <footer className="p-6 border-t dark:border-slate-800 bg-white dark:bg-slate-900 safe-bottom">
          <button onClick={onLogout} className="w-full py-4 bg-red-50 dark:bg-red-900/10 text-red-600 font-black rounded-2xl flex items-center justify-center gap-3 transition-all hover:bg-red-100">
            <LogOut size={18} /> Déconnexion
          </button>
        </footer>
      </div>
    </div>
  );
};

const StatCard = ({ icon, label, value }: any) => (
  <div className="p-4 bg-slate-50 dark:bg-slate-900 rounded-3xl border dark:border-slate-800 text-center shadow-inner">
    <div className="w-10 h-10 bg-white dark:bg-slate-800 rounded-2xl flex items-center justify-center mx-auto mb-2 shadow-sm">{icon}</div>
    <div className="text-xl font-black">{value}</div>
    <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{label}</div>
  </div>
);

export default SmartDashboard;
