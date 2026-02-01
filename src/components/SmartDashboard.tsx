import React, { useMemo, useState } from 'react';
import { UserProfile, ChatMessage, VoiceName, VocabularyItem } from '../types';
import { X, Trophy, Flame, LogOut, Sun, Moon, BookOpen, CheckCircle, Calendar, Target, Edit2, Save, Type, Coins, CreditCard, ChevronRight, Check, Shield, Download, Upload, Loader2, Sparkles, Plus, Trash2, Sliders, Volume2, Search, BrainCircuit } from 'lucide-react';
import { storageService } from '../services/storageService';
import { generateVocabularyFromHistory, generateSpeech } from '../services/geminiService';

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
  user, messages, onClose, onUpdateUser, onLogout, isDarkMode, toggleTheme, fontSize, onFontSizeChange, notify
}) => {
  const [activeTab, setActiveTab] = useState<'hub' | 'vocab' | 'lessons'>('hub');
  const [isExtracting, setIsExtracting] = useState(false);
  const [isPlaying, setIsPlaying] = useState<string | null>(null);

  const handleExtractVocab = async () => {
    if (!storageService.canPerformRequest(user.id).allowed) { notify("Crédits insuffisants", "error"); return; }
    setIsExtracting(true);
    try {
        const newWords = await generateVocabularyFromHistory(messages, user.preferences?.targetLanguage || "English");
        const updatedVocab = [...(user.vocabulary || []), ...newWords];
        onUpdateUser({ ...user, vocabulary: updatedVocab });
        storageService.saveUserProfile({ ...user, vocabulary: updatedVocab });
        notify(`${newWords.length} mots ajoutés !`, "success");
    } catch (e) { notify("Échec de l'extraction", "error"); }
    finally { setIsExtracting(false); }
  };

  const handlePlayWord = async (text: string, id: string) => {
      setIsPlaying(id);
      const raw = await generateSpeech(text, user.id, user.preferences?.voiceName);
      if (raw) {
          const ctx = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
          const dataInt16 = new Int16Array(raw.buffer, raw.byteOffset, raw.byteLength / 2);
          const audioBuffer = ctx.createBuffer(1, dataInt16.length, 24000);
          const channelData = audioBuffer.getChannelData(0);
          for (let i = 0; i < dataInt16.length; i++) channelData[i] = dataInt16[i] / 32768.0;
          const source = ctx.createBufferSource();
          source.buffer = audioBuffer;
          source.connect(ctx.destination);
          source.onended = () => setIsPlaying(null);
          source.start(0);
      } else setIsPlaying(null);
  };

  const toggleMastered = (id: string) => {
      const updated = (user.vocabulary || []).map(v => v.id === id ? { ...v, mastered: !v.mastered } : v);
      onUpdateUser({ ...user, vocabulary: updated });
      storageService.saveUserProfile({ ...user, vocabulary: updated });
  };

  const deleteWord = (id: string) => {
      const updated = (user.vocabulary || []).filter(v => v.id !== id);
      onUpdateUser({ ...user, vocabulary: updated });
      storageService.saveUserProfile({ ...user, vocabulary: updated });
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
                <button onClick={() => setActiveTab('hub')} className={`flex-1 py-2 text-[10px] font-black uppercase rounded-lg transition-all ${activeTab === 'hub' ? 'bg-white dark:bg-slate-700 text-indigo-600 dark:text-white shadow-sm' : 'text-slate-500'}`}>Profil</button>
                <button onClick={() => setActiveTab('vocab')} className={`flex-1 py-2 text-[10px] font-black uppercase rounded-lg transition-all ${activeTab === 'vocab' ? 'bg-white dark:bg-slate-700 text-indigo-600 dark:text-white shadow-sm' : 'text-slate-500'}`}>Boîte à Mots</button>
                <button onClick={() => setActiveTab('lessons')} className={`flex-1 py-2 text-[10px] font-black uppercase rounded-lg transition-all ${activeTab === 'lessons' ? 'bg-white dark:bg-slate-700 text-indigo-600 dark:text-white shadow-sm' : 'text-slate-500'}`}>Historique</button>
            </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto scrollbar-hide p-6">
            {activeTab === 'hub' && (
                <div className="space-y-6">
                    <div className="bg-slate-50 dark:bg-[#1A2030] rounded-3xl p-6 border border-slate-100 dark:border-white/5 shadow-sm">
                        <div className="flex items-center gap-3 mb-6">
                             <div className="p-2 bg-indigo-100 dark:bg-indigo-900/30 rounded-xl text-indigo-600"><Sliders className="w-5 h-5"/></div>
                             <h3 className="font-black text-slate-800 dark:text-white">Voix du Professeur</h3>
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                            {VOICE_OPTIONS.map(v => (
                                <button key={v.id} onClick={() => { const up = {...user.preferences!, voiceName: v.id}; onUpdateUser({...user, preferences: up}); storageService.updatePreferences(user.id, up); notify(`Voix ${v.label} activée`, 'info'); }} className={`p-4 rounded-2xl border-2 transition-all flex flex-col items-center gap-1 ${user.preferences?.voiceName === v.id ? 'border-indigo-500 bg-indigo-500/5 text-indigo-600 dark:text-indigo-400' : 'bg-white dark:bg-slate-800 border-slate-100 dark:border-slate-700 hover:border-indigo-200'}`}>
                                    <div className="text-sm font-black">{v.label}</div>
                                    <div className="text-[10px] opacity-60 font-bold uppercase">{v.desc}</div>
                                </button>
                            ))}
                        </div>
                    </div>
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
                </div>
            )}

            {activeTab === 'vocab' && (
                <div className="space-y-6 animate-fade-in">
                    <button onClick={handleExtractVocab} disabled={isExtracting} className="w-full py-4 bg-gradient-to-r from-indigo-600 to-violet-600 text-white font-black rounded-2xl shadow-lg flex items-center justify-center gap-3 transition-transform active:scale-95 disabled:opacity-50">
                        {isExtracting ? <Loader2 className="animate-spin w-5 h-5"/> : <BrainCircuit className="w-5 h-5"/>}
                        EXTRAIRE LES MOTS DU COURS
                    </button>
                    <div className="space-y-3">
                        {(user.vocabulary || []).length === 0 ? (
                            <div className="text-center py-20 text-slate-400 border-2 border-dashed border-slate-200 dark:border-slate-800 rounded-3xl">
                                <Sparkles className="w-10 h-10 mx-auto mb-3 opacity-20"/>
                                <p className="text-sm font-bold">Votre boîte à mots est vide.</p>
                            </div>
                        ) : (
                            user.vocabulary.slice().reverse().map(word => (
                                <div key={word.id} className={`p-4 rounded-2xl border transition-all flex items-center justify-between ${word.mastered ? 'bg-emerald-50 dark:bg-emerald-900/10 border-emerald-100' : 'bg-white dark:bg-[#1A2030] border-slate-100 dark:border-white/5'}`}>
                                    <div className="flex-1">
                                        <div className="flex items-center gap-2">
                                            <span className="font-black text-slate-900 dark:text-white">{word.word}</span>
                                            <button onClick={() => handlePlayWord(word.word, word.id)} className={`p-1.5 rounded-full ${isPlaying === word.id ? 'text-indigo-600 animate-pulse' : 'text-slate-400'}`}><Volume2 className="w-4 h-4"/></button>
                                        </div>
                                        <p className="text-xs text-slate-500 font-medium">{word.translation}</p>
                                    </div>
                                    <div className="flex items-center gap-1">
                                        <button onClick={() => toggleMastered(word.id)} className={`p-2 rounded-xl ${word.mastered ? 'text-emerald-500 bg-emerald-100 dark:bg-emerald-900/30' : 'text-slate-300 hover:text-emerald-500'}`}><CheckCircle className="w-5 h-5"/></button>
                                        <button onClick={() => deleteWord(word.id)} className="p-2 rounded-xl text-slate-300 hover:text-red-500"><Trash2 className="w-5 h-5"/></button>
                                    </div>
                                </div>
                            ))
                        )}
                    </div>
                </div>
            )}

            {activeTab === 'lessons' && (
                <div className="space-y-4 animate-fade-in">
                    {user.stats.lessonsCompleted === 0 ? (
                        <div className="text-center py-20 text-slate-400">Aucun cours terminé.</div>
                    ) : (
                        <div className="p-6 bg-indigo-50 dark:bg-indigo-900/10 rounded-3xl text-center border border-indigo-100 dark:border-white/5">
                            <BookOpen className="w-10 h-10 text-indigo-500 mx-auto mb-3" />
                            <h4 className="text-3xl font-black text-indigo-700 dark:text-indigo-400">{user.stats.lessonsCompleted}</h4>
                            <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">Leçons maîtrisées</p>
                        </div>
                    )}
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