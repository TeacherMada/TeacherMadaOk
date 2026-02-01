import React, { useState } from 'react';
import { UserProfile, ChatMessage, VoiceName } from '../types';
import { X, Trophy, Flame, LogOut, Sun, Moon, BookOpen, CheckCircle, Sliders, Volume2, BrainCircuit, Loader2, Sparkles, Trash2 } from 'lucide-react';
import { storageService } from '../services/storageService';
import { generateVocabularyFromHistory, generateSpeech } from '../services/geminiService';

interface SmartDashboardProps {
  user: UserProfile; messages: ChatMessage[]; onClose: () => void; onUpgrade: () => void;
  onUpdateUser: (u: UserProfile) => void; onLogout: () => void; isDarkMode: boolean;
  toggleTheme: () => void; fontSize: string; onFontSizeChange: (s: any) => void; notify: (m: string, t: any) => void;
}

const VOICE_OPTIONS: { id: VoiceName; label: string; desc: string }[] = [
    { id: 'Zephyr', label: 'Zephyr', desc: 'Calme' }, { id: 'Kore', label: 'Kore', desc: 'Chaleureux' },
    { id: 'Puck', label: 'Puck', desc: 'Énergique' }, { id: 'Charon', label: 'Charon', desc: 'Profond' }
];

const SmartDashboard: React.FC<SmartDashboardProps> = ({ 
  user, messages, onClose, onUpdateUser, onLogout, isDarkMode, toggleTheme, notify
}) => {
  const [activeTab, setActiveTab] = useState<'hub' | 'vocab' | 'lessons'>('hub');
  const [isExtracting, setIsExtracting] = useState(false);
  const [playingId, setPlayingId] = useState<string | null>(null);

  // FIX TS18048: Toujours garantir un tableau itérable
  const vocabulary = user.vocabulary ?? [];

  const handleExtractVocab = async () => {
    if (!storageService.canPerformRequest(user.id).allowed) { notify("Crédits insuffisants", "error"); return; }
    setIsExtracting(true);
    try {
        const newWords = await generateVocabularyFromHistory(messages, user.preferences?.targetLanguage || "English");
        const updated = [...vocabulary, ...newWords];
        onUpdateUser({ ...user, vocabulary: updated });
        storageService.saveUserProfile({ ...user, vocabulary: updated });
        notify(`${newWords.length} mots extraits !`, "success");
    } catch (e) { notify("Échec", "error"); }
    finally { setIsExtracting(false); }
  };

  const handlePlayWord = async (text: string, id: string) => {
      setPlayingId(id);
      const raw = await generateSpeech(text, user.id, user.preferences?.voiceName);
      if (raw) {
          const ctx = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
          const audioBuffer = ctx.createBuffer(1, raw.length, 24000);
          const channelData = audioBuffer.getChannelData(0);
          const int16 = new Int16Array(raw.buffer);
          for (let i = 0; i < int16.length; i++) channelData[i] = int16[i] / 32768.0;
          const source = ctx.createBufferSource();
          source.buffer = audioBuffer;
          source.connect(ctx.destination);
          source.onended = () => setPlayingId(null);
          source.start(0);
      } else setPlayingId(null);
  };

  return (
    <div className="fixed inset-0 z-[100] flex justify-end">
      <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={onClose}></div>
      <div className="relative w-full md:w-[480px] h-full bg-white dark:bg-[#0F1422] shadow-2xl flex flex-col border-l animate-slide-in-right">
        <div className="bg-white dark:bg-[#131825] p-6 border-b flex items-center justify-between">
             <div className="flex items-center gap-4">
                 <div className="w-14 h-14 bg-gradient-to-tr from-indigo-500 to-violet-600 rounded-2xl flex items-center justify-center text-xl font-black text-white">{user.username.charAt(0).toUpperCase()}</div>
                 <div><h2 className="text-lg font-bold dark:text-white">{user.username}</h2><p className="text-xs text-slate-500 uppercase">{user.preferences?.targetLanguage}</p></div>
             </div>
             <button onClick={onClose} className="p-2 hover:bg-slate-100 dark:hover:bg-white/10 rounded-full text-slate-400"><X className="w-5 h-5" /></button>
        </div>

        <div className="px-6 py-4 flex p-1 bg-slate-100 dark:bg-slate-800 rounded-xl m-4">
            <button onClick={() => setActiveTab('hub')} className={`flex-1 py-2 text-[10px] font-black uppercase rounded-lg transition-all ${activeTab === 'hub' ? 'bg-white dark:bg-slate-700 text-indigo-600 shadow-sm' : 'text-slate-500'}`}>Profil</button>
            <button onClick={() => setActiveTab('vocab')} className={`flex-1 py-2 text-[10px] font-black uppercase rounded-lg transition-all ${activeTab === 'vocab' ? 'bg-white dark:bg-slate-700 text-indigo-600 shadow-sm' : 'text-slate-500'}`}>Mots</button>
            <button onClick={() => setActiveTab('lessons')} className={`flex-1 py-2 text-[10px] font-black uppercase rounded-lg transition-all ${activeTab === 'lessons' ? 'bg-white dark:bg-slate-700 text-indigo-600 shadow-sm' : 'text-slate-500'}`}>Historique</button>
        </div>

        <div className="flex-1 overflow-y-auto p-6">
            {activeTab === 'hub' && (
                <div className="space-y-6">
                    <div className="bg-slate-50 dark:bg-[#1A2030] rounded-3xl p-6 border shadow-sm">
                        <div className="flex items-center gap-3 mb-6"><Sliders className="w-5 h-5 text-indigo-600"/><h3 className="font-black dark:text-white">Voix du Prof</h3></div>
                        <div className="grid grid-cols-2 gap-3">
                            {VOICE_OPTIONS.map(v => (
                                <button key={v.id} onClick={() => { const up = {...user.preferences!, voiceName: v.id}; onUpdateUser({...user, preferences: up}); storageService.updatePreferences(user.id, up); notify(`Voix ${v.label}`, 'info'); }} className={`p-4 rounded-2xl border-2 transition-all flex flex-col items-center gap-1 ${user.preferences?.voiceName === v.id ? 'border-indigo-500 bg-indigo-500/5 text-indigo-600' : 'bg-white dark:bg-slate-800 border-slate-100 hover:border-indigo-200'}`}>
                                    <div className="text-sm font-black">{v.label}</div><div className="text-[10px] opacity-60 uppercase">{v.desc}</div>
                                </button>
                            ))}
                        </div>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                        <div className="bg-white dark:bg-[#1A2030] p-5 rounded-3xl text-center border shadow-sm"><Trophy className="w-7 h-7 text-amber-500 mx-auto mb-2" /><div className="text-2xl font-black dark:text-white">{user.stats.xp}</div><div className="text-[10px] font-bold text-slate-400 uppercase">XP</div></div>
                        <div className="bg-white dark:bg-[#1A2030] p-5 rounded-3xl text-center border shadow-sm"><Flame className="w-7 h-7 text-orange-500 mx-auto mb-2" /><div className="text-2xl font-black dark:text-white">{user.stats.streak}</div><div className="text-[10px] font-bold text-slate-400 uppercase">Série</div></div>
                    </div>
                </div>
            )}

            {activeTab === 'vocab' && (
                <div className="space-y-6 animate-fade-in">
                    <button onClick={handleExtractVocab} disabled={isExtracting} className="w-full py-4 bg-gradient-to-r from-indigo-600 to-violet-600 text-white font-black rounded-2xl flex items-center justify-center gap-3 disabled:opacity-50">
                        {isExtracting ? <Loader2 className="animate-spin w-5 h-5"/> : <BrainCircuit className="w-5 h-5"/>} EXTRAIRE LES MOTS
                    </button>
                    <div className="space-y-3">
                        {vocabulary.length === 0 ? (
                            <div className="text-center py-20 text-slate-400"><Sparkles className="w-10 h-10 mx-auto opacity-20"/><p className="text-sm font-bold">Vide.</p></div>
                        ) : (
                            vocabulary.slice().reverse().map(word => (
                                <div key={word.id} className={`p-4 rounded-2xl border transition-all flex items-center justify-between ${word.mastered ? 'bg-emerald-50 dark:bg-emerald-900/10' : 'bg-white dark:bg-[#1A2030]'}`}>
                                    <div className="flex-1"><div className="flex items-center gap-2"><span className="font-black dark:text-white">{word.word}</span><button onClick={() => handlePlayWord(word.word, word.id)} className={`p-1.5 rounded-full ${playingId === word.id ? 'text-indigo-600 animate-pulse' : 'text-slate-400'}`}><Volume2 className="w-4 h-4"/></button></div><p className="text-xs text-slate-500">{word.translation}</p></div>
                                    <button onClick={() => { const upd = vocabulary.filter(v => v.id !== word.id); onUpdateUser({...user, vocabulary: upd}); storageService.saveUserProfile({...user, vocabulary: upd}); }} className="p-2 text-slate-300 hover:text-red-500"><Trash2 className="w-5 h-5"/></button>
                                </div>
                            ))
                        )}
                    </div>
                </div>
            )}

            {activeTab === 'lessons' && <div className="text-center py-20 text-slate-400">Historique vide.</div>}
        </div>

        <div className="p-6 border-t">
            <button onClick={onLogout} className="w-full py-4 bg-red-50 dark:bg-red-900/10 text-red-600 font-black rounded-2xl flex items-center justify-center gap-3 transition-all hover:bg-red-100"><LogOut className="w-5 h-5" /> Déconnexion</button>
        </div>
      </div>
    </div>
  );
};

export default SmartDashboard;