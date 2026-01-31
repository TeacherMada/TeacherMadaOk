import React, { useMemo, useState } from 'react';
import { UserProfile, ChatMessage, VocabularyItem } from '../types';
import { X, Trophy, Flame, LogOut, Sun, Moon, BookOpen, CheckCircle, Calendar, Target, Edit2, Save, Brain, Type, Coins, MessageSquare, CreditCard, ChevronRight, Copy, Check, PieChart, TrendingUp, Star, Crown, Trash2, Shield, AlertTriangle, Plus, Sparkles, Loader2, Volume2, Globe, GraduationCap, Map as MapIcon, Lock, Zap, Award, ArrowLeft } from 'lucide-react';
import { storageService } from '../services/storageService';
import { generateVocabularyFromHistory, generateSpeech } from '../services/geminiService';
import { CREDIT_PRICE_ARIARY, ADMIN_CONTACTS, TOTAL_LESSONS_PER_LEVEL } from '../constants';

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
  user, 
  messages,
  onClose, 
  onUpgrade, 
  onUpdateUser,
  onLogout, 
  isDarkMode, 
  toggleTheme,
  fontSize,
  onFontSizeChange,
  notify
}) => {
  const [isEditing, setIsEditing] = useState(false);
  const [activeTab, setActiveTab] = useState<'hub' | 'parcours' | 'lessons' | 'vocab'>('hub');
  const [selectedCourseId, setSelectedCourseId] = useState<string | null>(null);
  
  const [editForm, setEditForm] = useState({
      username: user.username,
      email: user.email || '',
      password: user.password || ''
  });
  
  // Vocab State
  const [isGeneratingVocab, setIsGeneratingVocab] = useState(false);
  const [newWordForm, setNewWordForm] = useState({ word: '', translation: '', context: '' });
  const [isAddingWord, setIsAddingWord] = useState(false);

  const [showClearConfirm, setShowClearConfirm] = useState(false);

  const [copied, setCopied] = useState(false);
  const cleanUsername = user.username.replace(/[^a-zA-Z0-9]/g, '');
  const motifCode = `Crd_${cleanUsername}`.substring(0, 20);

  const handleCopyMotif = () => {
      navigator.clipboard.writeText(motifCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
  };
  
  // --- Derived Stats & Logic ---

  const activeCourses = useMemo(() => {
      if (!user.stats.progressByLevel) return [];
      return Object.entries(user.stats.progressByLevel).map(([key, count]) => {
          // Key format: "Language Name-Level" (e.g., "Anglais 🇬🇧-A1")
          const separatorIndex = key.lastIndexOf('-');
          const language = key.substring(0, separatorIndex);
          const level = key.substring(separatorIndex + 1);
          const lessonCount = Number(count);
          
          return {
              id: key,
              language,
              level,
              lessonCount,
              progress: Math.min((lessonCount / TOTAL_LESSONS_PER_LEVEL) * 100, 100)
          };
      }).sort((a, b) => b.progress - a.progress);
  }, [user.stats.progressByLevel]);

  // Selected Course Data for Roadmap
  const currentCourse = useMemo(() => {
      if (!selectedCourseId) return null;
      return activeCourses.find(c => c.id === selectedCourseId) || null;
  }, [selectedCourseId, activeCourses]);

  const skills = useMemo(() => {
    const baseVocab = user.skills?.vocabulary || 10;
    const baseGrammar = user.skills?.grammar || 5;
    
    // Skill bonus relative to selected course progress
    let bonus = 0;
    if (currentCourse) {
        bonus = (currentCourse.progress / 100) * 40; // Max 40 bonus from course
    } else {
        bonus = Math.min(user.stats.xp / 200, 20); // General bonus
    }
    
    return {
        vocabulary: Math.min(baseVocab + bonus + 10, 100),
        grammar: Math.min(baseGrammar + (bonus * 0.8) + 5, 100),
        pronunciation: Math.min((user.skills?.pronunciation || 5) + (bonus * 0.6), 100),
        listening: Math.min((user.skills?.listening || 5) + (bonus * 0.7), 100),
    };
  }, [user, currentCourse]);

  const completedLessons = useMemo(() => {
    const lessons: {num: number, title: string, date: number}[] = [];
    const regex = /##\s*(?:🟢|🔴|🔵)?\s*(?:LEÇON|LECON|LESSON|LESONA)\s*(\d+)\s*[:|-]?\s*(.*)/i;
    
    messages.forEach(msg => {
        if (msg.role === 'model') {
            const match = msg.text.match(regex);
            if (match) {
                 const rawTitle = match[2].trim().replace(/[*_]/g, '');
                 lessons.push({ num: parseInt(match[1]), title: rawTitle, date: msg.timestamp });
            }
        }
    });
    
    // Use the native Map constructor here
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
      notify("Historique effacé. Redémarrez l'app si nécessaire.", 'success');
      setShowClearConfirm(false);
      onClose(); 
      window.location.reload(); 
  };

  const handleAdminAccess = () => {
      window.location.reload(); 
  };

  // VOCAB HANDLERS
  const handleGenerateVocab = async () => {
      setIsGeneratingVocab(true);
      try {
          const newWords = await generateVocabularyFromHistory(user.id, messages);
          if (newWords.length > 0) {
              const currentVocab = user.vocabulary || [];
              const updatedUser = { ...user, vocabulary: [...newWords, ...currentVocab] };
              onUpdateUser(updatedUser);
              notify(`${newWords.length} mots ajoutés à votre boîte !`, 'success');
          } else {
              notify("Pas assez de contenu récent pour extraire des mots.", 'info');
          }
      } catch (e: any) {
          if(e.message === 'INSUFFICIENT_CREDITS') notify("Crédits insuffisants.", 'error');
          else notify("Erreur lors de la génération.", 'error');
      } finally {
          setIsGeneratingVocab(false);
      }
  };

  const handleAddManualWord = () => {
      if (!newWordForm.word || !newWordForm.translation) return;
      const newWord: VocabularyItem = {
          id: `manual_${Date.now()}`,
          word: newWordForm.word,
          translation: newWordForm.translation,
          context: newWordForm.context,
          mastered: false,
          addedAt: Date.now()
      };
      const updatedUser = { ...user, vocabulary: [newWord, ...(user.vocabulary || [])] };
      onUpdateUser(updatedUser);
      setNewWordForm({ word: '', translation: '', context: '' });
      setIsAddingWord(false);
      notify("Mot ajouté !", 'success');
  };

  const toggleWordMastery = (wordId: string) => {
      const updatedVocab = (user.vocabulary || []).map(w => 
          w.id === wordId ? { ...w, mastered: !w.mastered } : w
      );
      onUpdateUser({ ...user, vocabulary: updatedVocab });
  };

  const deleteWord = (wordId: string) => {
      const updatedVocab = (user.vocabulary || []).filter(w => w.id !== wordId);
      onUpdateUser({ ...user, vocabulary: updatedVocab });
  };

  const playWordAudio = async (text: string) => {
      try {
          const audioBuffer = await generateSpeech(text, user.id);
          if (audioBuffer) {
              const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
              const decoded = await ctx.decodeAudioData(audioBuffer);
              const source = ctx.createBufferSource();
              source.buffer = decoded;
              source.connect(ctx.destination);
              source.start(0);
          }
      } catch(e) { console.error(e); }
  };

  return (
    <div className="fixed inset-0 z-[100] flex justify-end">
      {/* Overlay Backdrop */}
      <div 
        className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm transition-opacity" 
        onClick={onClose}
      ></div>

      {/* Sidebar Panel - Modern Glassmorphism */}
      <div className="relative w-full md:w-[480px] h-full bg-white/95 dark:bg-[#0F1422]/95 backdrop-blur-xl shadow-2xl flex flex-col border-l border-white/20 dark:border-white/5 overflow-hidden animate-slide-in-right">
        
        {/* Header - Profile Summary */}
        <div className="relative bg-white dark:bg-[#131825] p-6 border-b border-slate-100 dark:border-white/5">
             <button onClick={onClose} className="absolute top-4 right-4 p-2 hover:bg-slate-100 dark:hover:bg-white/10 rounded-full transition-colors text-slate-400">
                <X className="w-5 h-5" />
             </button>

             <div className="flex items-center gap-5">
                 <div className="relative">
                     <div className="w-16 h-16 bg-gradient-to-tr from-indigo-500 to-violet-500 rounded-2xl rotate-3 shadow-lg flex items-center justify-center text-2xl font-black text-white border-2 border-white dark:border-slate-800">
                        {user.username.charAt(0).toUpperCase()}
                     </div>
                     <div className="absolute -bottom-2 -right-2 bg-emerald-500 border-4 border-white dark:border-[#131825] w-6 h-6 rounded-full flex items-center justify-center">
                        <Check className="w-3 h-3 text-white" />
                     </div>
                 </div>
                 <div>
                     <h2 className="text-xl font-bold text-slate-900 dark:text-white">{user.username}</h2>
                     <div className="flex items-center gap-2 mt-1">
                        <span className="text-xs font-bold px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 uppercase tracking-wide">
                            {user.preferences?.targetLanguage.split(' ')[0] || "Apprenant"}
                        </span>
                        {user.role === 'admin' && (
                            <span className="text-xs font-black text-red-500 px-2 py-0.5 rounded-md bg-red-50 dark:bg-red-900/20 border border-red-100 dark:border-red-900">
                                ADMIN
                            </span>
                        )}
                     </div>
                 </div>
             </div>
        </div>

        {/* Tabs - Pills Design */}
        <div className="px-6 py-4 bg-white dark:bg-[#131825]">
            <div className="flex p-1 bg-slate-100 dark:bg-slate-800 rounded-xl overflow-x-auto scrollbar-hide">
                <TabButton active={activeTab === 'hub'} onClick={() => setActiveTab('hub')} icon={<Target className="w-4 h-4"/>} label="Hub" />
                <TabButton active={activeTab === 'parcours'} onClick={() => setActiveTab('parcours')} icon={<MapIcon className="w-4 h-4"/>} label="Parcours" />
                <TabButton active={activeTab === 'vocab'} onClick={() => setActiveTab('vocab')} icon={<BookOpen className="w-4 h-4"/>} label="Mots" />
                <TabButton active={activeTab === 'lessons'} onClick={() => setActiveTab('lessons')} icon={<Calendar className="w-4 h-4"/>} label="Historique" />
            </div>
        </div>

        {/* Content Area */}
        <div className="flex-1 overflow-y-auto scrollbar-hide p-6 bg-slate-50 dark:bg-[#0B0F19]">
            
            {/* === TAB: HUB === */}
            {activeTab === 'hub' && (
                <div className="space-y-6 animate-fade-in">
                    
                    {/* Admin Access Button */}
                    {user.role === 'admin' && (
                        <button 
                            onClick={handleAdminAccess}
                            className="w-full py-3 bg-indigo-600 text-white font-bold rounded-xl flex items-center justify-center gap-2 shadow-lg mb-2"
                        >
                            <Shield className="w-5 h-5"/> Accéder au Panel Admin
                        </button>
                    )}

                    {/* Modern Wallet Card */}
                    <div className="group relative overflow-hidden rounded-[2rem] bg-gradient-to-br from-slate-900 via-[#1e293b] to-indigo-900 p-6 shadow-2xl shadow-indigo-900/20 border border-white/10 transition-transform hover:scale-[1.01]">
                        <div className="absolute top-0 right-0 w-48 h-48 bg-white/5 rounded-full -mr-16 -mt-16 blur-3xl"></div>
                        <div className="absolute bottom-0 left-0 w-32 h-32 bg-indigo-500/20 rounded-full -ml-10 -mb-10 blur-2xl"></div>
                        
                        <div className="relative z-10 flex justify-between items-start mb-10">
                            <div>
                                <div className="flex items-center gap-2 mb-1">
                                    <div className="p-1.5 bg-white/10 rounded-lg backdrop-blur-md">
                                        <CreditCard className="w-4 h-4 text-indigo-300" />
                                    </div>
                                    <span className="text-xs font-bold text-indigo-200 uppercase tracking-widest">Portefeuille</span>
                                </div>
                                <div className="flex items-baseline gap-1.5 mt-2">
                                    <span className="text-5xl font-black text-white tracking-tighter">{user.credits}</span>
                                    <span className="text-lg font-bold text-indigo-400">CRD</span>
                                </div>
                            </div>
                            {user.isPremium && (
                                <div className="px-3 py-1 bg-gradient-to-r from-amber-400 to-orange-500 rounded-full text-[10px] font-black text-white shadow-lg uppercase tracking-wide flex items-center gap-1">
                                    <Crown className="w-3 h-3"/> Premium
                                </div>
                            )}
                        </div>
                        
                        <button 
                            onClick={onUpgrade} 
                            className="relative z-10 w-full py-3.5 bg-white text-slate-900 font-bold rounded-xl text-sm flex items-center justify-center gap-2 hover:bg-indigo-50 transition-all shadow-lg active:scale-95"
                        >
                            <Coins className="w-4 h-4 text-indigo-600" /> Recharger mon compte
                        </button>
                    </div>

                    {/* Quick Stats Grid */}
                    <div className="grid grid-cols-2 gap-4">
                        <div className="bg-white dark:bg-[#1A2030] p-4 rounded-2xl border border-slate-100 dark:border-white/5 shadow-sm flex flex-col items-center justify-center gap-2">
                            <Trophy className="w-8 h-8 text-amber-500 drop-shadow-sm" />
                            <div className="text-center">
                                <span className="block text-2xl font-black text-slate-800 dark:text-white">{user.stats.xp}</span>
                                <span className="text-[10px] font-bold text-slate-400 uppercase">XP Totale</span>
                            </div>
                        </div>
                        <div className="bg-white dark:bg-[#1A2030] p-4 rounded-2xl border border-slate-100 dark:border-white/5 shadow-sm flex flex-col items-center justify-center gap-2">
                            <Flame className="w-8 h-8 text-orange-500 drop-shadow-sm" />
                            <div className="text-center">
                                <span className="block text-2xl font-black text-slate-800 dark:text-white">{user.stats.streak}</span>
                                <span className="text-[10px] font-bold text-slate-400 uppercase">Jours Série</span>
                            </div>
                        </div>
                    </div>

                    {/* Settings Group */}
                    <div className="bg-white dark:bg-[#1A2030] rounded-[1.5rem] p-1 border border-slate-100 dark:border-white/5 shadow-sm">
                        <SettingItem 
                            icon={<Sun className="w-4 h-4"/>} 
                            label="Thème" 
                            action={
                                <button onClick={toggleTheme} className={`w-10 h-6 rounded-full p-1 transition-colors ${isDarkMode ? 'bg-indigo-600' : 'bg-slate-200'}`}>
                                    <div className={`w-4 h-4 bg-white rounded-full shadow-sm transform transition-transform ${isDarkMode ? 'translate-x-4' : 'translate-x-0'}`}></div>
                                </button>
                            } 
                        />
                        <div className="h-px bg-slate-50 dark:bg-white/5 mx-4"></div>
                        <SettingItem 
                            icon={<Type className="w-4 h-4"/>} 
                            label="Taille Texte" 
                            action={
                                <div className="flex bg-slate-100 dark:bg-slate-800 rounded-lg p-1">
                                    {(['small', 'normal', 'large'] as const).map((size) => (
                                        <button key={size} onClick={() => onFontSizeChange(size)} className={`px-2 py-0.5 rounded text-xs font-bold ${fontSize === size ? 'bg-white dark:bg-slate-600 shadow-sm text-indigo-600 dark:text-white' : 'text-slate-400'}`}>A</button>
                                    ))}
                                </div>
                            } 
                        />
                        <div className="h-px bg-slate-50 dark:bg-white/5 mx-4"></div>
                        <div className="p-3">
                            <button onClick={() => setIsEditing(!isEditing)} className="w-full flex items-center justify-between text-sm font-bold text-slate-600 dark:text-slate-300 hover:text-indigo-600 dark:hover:text-white transition-colors">
                                <span className="flex items-center gap-3"><Edit2 className="w-4 h-4"/> Modifier Profil</span>
                                <ChevronRight className={`w-4 h-4 transition-transform ${isEditing ? 'rotate-90' : ''}`} />
                            </button>
                            {isEditing && (
                                <div className="mt-3 space-y-3 animate-fade-in bg-slate-50 dark:bg-black/20 p-3 rounded-xl">
                                    <input type="text" value={editForm.username} onChange={(e) => setEditForm({...editForm, username: e.target.value})} className="w-full p-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-sm outline-none" placeholder="Username" />
                                    <input type="email" value={editForm.email} onChange={(e) => setEditForm({...editForm, email: e.target.value})} className="w-full p-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-sm outline-none" placeholder="Email" />
                                    <input type="password" value={editForm.password} onChange={(e) => setEditForm({...editForm, password: e.target.value})} className="w-full p-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-sm outline-none" placeholder="Nouveau Mot de passe" />
                                    <button onClick={handleSaveProfile} className="w-full py-2 bg-indigo-600 text-white rounded-lg text-sm font-bold shadow-md">Enregistrer</button>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Danger Zone: Clear History */}
                    <div className="bg-red-50 dark:bg-red-900/10 rounded-2xl p-4 border border-red-100 dark:border-red-900/30">
                        {!showClearConfirm ? (
                            <button onClick={() => setShowClearConfirm(true)} className="w-full flex items-center justify-between text-red-600 dark:text-red-400 font-bold text-sm">
                                <span className="flex items-center gap-2"><Trash2 className="w-4 h-4"/> Effacer mon historique</span>
                                <ChevronRight className="w-4 h-4"/>
                            </button>
                        ) : (
                            <div className="animate-fade-in text-center">
                                <p className="text-xs text-red-600 dark:text-red-400 mb-3 font-bold flex items-center justify-center gap-1">
                                    <AlertTriangle className="w-3 h-3"/> Attention: Action irréversible.
                                </p>
                                <div className="flex gap-2">
                                    <button onClick={() => setShowClearConfirm(false)} className="flex-1 py-2 bg-white dark:bg-slate-800 text-slate-500 rounded-lg text-xs font-bold border border-slate-200 dark:border-slate-700">Annuler</button>
                                    <button onClick={handleClearHistory} className="flex-1 py-2 bg-red-500 text-white rounded-lg text-xs font-bold hover:bg-red-600 transition-colors">Confirmer</button>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* === TAB: VOCABULAIRE === */}
            {activeTab === 'vocab' && (
                <div className="space-y-4 animate-fade-in">
                    
                    <div className="flex gap-2 mb-4">
                        <button 
                            onClick={handleGenerateVocab} 
                            disabled={isGeneratingVocab}
                            className="flex-1 py-3 bg-gradient-to-r from-indigo-500 to-purple-500 hover:from-indigo-600 hover:to-purple-600 text-white rounded-xl font-bold text-sm flex items-center justify-center gap-2 shadow-lg transition-all"
                        >
                            {isGeneratingVocab ? <Loader2 className="w-4 h-4 animate-spin"/> : <Sparkles className="w-4 h-4"/>} 
                            Générer via IA
                        </button>
                        <button 
                            onClick={() => setIsAddingWord(!isAddingWord)} 
                            className="px-4 py-3 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 rounded-xl font-bold hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
                        >
                            <Plus className="w-5 h-5"/>
                        </button>
                    </div>

                    {isAddingWord && (
                        <div className="bg-white dark:bg-[#1A2030] p-4 rounded-2xl border border-slate-100 dark:border-white/5 animate-slide-up">
                            <h4 className="text-sm font-bold text-slate-800 dark:text-white mb-3">Ajouter un mot</h4>
                            <div className="space-y-2">
                                <input type="text" placeholder="Mot (Langue cible)" value={newWordForm.word} onChange={e => setNewWordForm({...newWordForm, word: e.target.value})} className="w-full p-2 bg-slate-50 dark:bg-slate-800 rounded-lg text-sm border border-slate-200 dark:border-slate-700 outline-none" />
                                <input type="text" placeholder="Traduction" value={newWordForm.translation} onChange={e => setNewWordForm({...newWordForm, translation: e.target.value})} className="w-full p-2 bg-slate-50 dark:bg-slate-800 rounded-lg text-sm border border-slate-200 dark:border-slate-700 outline-none" />
                                <input type="text" placeholder="Contexte (Exemple)" value={newWordForm.context} onChange={e => setNewWordForm({...newWordForm, context: e.target.value})} className="w-full p-2 bg-slate-50 dark:bg-slate-800 rounded-lg text-sm border border-slate-200 dark:border-slate-700 outline-none" />
                                <button onClick={handleAddManualWord} className="w-full py-2 bg-indigo-600 text-white rounded-lg text-xs font-bold mt-2">Confirmer</button>
                            </div>
                        </div>
                    )}

                    {!user.vocabulary || user.vocabulary.length === 0 ? (
                        <div className="text-center py-10 text-slate-400">
                            <BookOpen className="w-12 h-12 mx-auto mb-2 opacity-30"/>
                            <p className="text-sm">Votre boîte à mots est vide.</p>
                            <p className="text-xs">Utilisez l'IA pour extraire les mots importants de vos conversations.</p>
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 gap-3">
                            {user.vocabulary.map((item) => (
                                <div key={item.id} className={`p-4 rounded-xl border transition-all hover:shadow-md ${item.mastered ? 'bg-emerald-50 dark:bg-emerald-900/10 border-emerald-200 dark:border-emerald-900' : 'bg-white dark:bg-[#1A2030] border-slate-100 dark:border-white/5'}`}>
                                    <div className="flex justify-between items-start mb-1">
                                        <h4 className="font-bold text-slate-800 dark:text-white text-lg flex items-center gap-2">
                                            {item.word}
                                            <button onClick={() => playWordAudio(item.word)} className="p-1 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-full text-slate-400 hover:text-indigo-500">
                                                <Volume2 className="w-4 h-4"/>
                                            </button>
                                        </h4>
                                        <button onClick={() => deleteWord(item.id)} className="text-slate-300 hover:text-red-500"><X className="w-4 h-4"/></button>
                                    </div>
                                    <p className="text-sm text-indigo-600 dark:text-indigo-400 font-medium mb-2">{item.translation}</p>
                                    {item.context && <p className="text-xs text-slate-500 dark:text-slate-400 italic mb-3">"{item.context}"</p>}
                                    
                                    <button 
                                        onClick={() => toggleWordMastery(item.id)} 
                                        className={`w-full py-1.5 rounded-lg text-xs font-bold flex items-center justify-center gap-1 transition-colors ${item.mastered ? 'bg-emerald-500 text-white' : 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 hover:bg-emerald-100 dark:hover:bg-emerald-900/30 hover:text-emerald-600'}`}
                                    >
                                        {item.mastered ? <><Check className="w-3 h-3"/> Maîtrisé</> : "Marquer comme maîtrisé"}
                                    </button>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            )}

            {/* === TAB: PARCOURS (Interactive Roadmap) === */}
            {activeTab === 'parcours' && (
                <div className="animate-fade-in h-full flex flex-col">
                    
                    {!selectedCourseId ? (
                        /* VIEW 1: COURSE LIST */
                        <div className="space-y-6">
                            <h3 className="font-bold text-slate-800 dark:text-white mb-2 flex items-center gap-2">
                                <GraduationCap className="w-5 h-5 text-indigo-500" /> Mes Parcours Actifs
                            </h3>

                            {activeCourses.length === 0 ? (
                                <div className="bg-slate-100 dark:bg-slate-800/50 p-8 rounded-2xl text-center text-slate-500 border-2 border-dashed border-slate-200 dark:border-slate-700">
                                    <MapIcon className="w-12 h-12 mx-auto mb-3 opacity-30"/>
                                    <p className="text-sm font-bold">Aucun voyage commencé.</p>
                                    <p className="text-xs mt-1 opacity-70">Lancez une leçon pour activer votre carte.</p>
                                </div>
                            ) : (
                                <div className="space-y-4">
                                    {activeCourses.map((course) => (
                                        <div 
                                            key={course.id} 
                                            onClick={() => setSelectedCourseId(course.id)}
                                            className="cursor-pointer bg-gradient-to-br from-white to-slate-50 dark:from-[#1A2030] dark:to-[#151a27] p-5 rounded-2xl border border-slate-100 dark:border-white/5 shadow-sm relative overflow-hidden group hover:shadow-lg transition-all hover:-translate-y-1"
                                        >
                                            <div className="flex justify-between items-start mb-3 relative z-10">
                                                <div>
                                                    <div className="flex items-center gap-2 mb-1">
                                                        <Globe className="w-4 h-4 text-slate-400" />
                                                        <h4 className="font-black text-slate-800 dark:text-white text-lg">{course.language}</h4>
                                                    </div>
                                                    <span className="text-xs font-bold text-indigo-500 bg-indigo-50 dark:bg-indigo-900/30 px-2 py-0.5 rounded-md border border-indigo-100 dark:border-indigo-800">
                                                        Niveau {course.level}
                                                    </span>
                                                </div>
                                                <div className="text-right">
                                                    <span className="block text-2xl font-black text-slate-900 dark:text-white">{course.lessonCount}</span>
                                                    <span className="text-[10px] font-bold text-slate-400 uppercase">Leçons</span>
                                                </div>
                                            </div>
                                            
                                            <div className="relative z-10">
                                                <div className="flex justify-between text-xs font-bold text-slate-400 mb-1">
                                                    <span>Progression</span>
                                                    <span>{Math.round(course.progress)}%</span>
                                                </div>
                                                <div className="h-2.5 w-full bg-slate-200 dark:bg-slate-800 rounded-full overflow-hidden shadow-inner">
                                                    <div className="h-full bg-gradient-to-r from-indigo-500 to-purple-500 shadow-[0_0_10px_rgba(99,102,241,0.5)] transition-all duration-1000 ease-out group-hover:bg-gradient-to-r group-hover:from-indigo-400 group-hover:to-purple-400" style={{ width: `${course.progress}%` }}></div>
                                                </div>
                                            </div>

                                            {/* Decorative Background */}
                                            <div className="absolute top-0 right-0 p-4 opacity-5 group-hover:opacity-10 transition-opacity">
                                                <TrendingUp className="w-20 h-20 text-indigo-500" />
                                            </div>
                                            <div className="absolute bottom-4 right-4 opacity-0 group-hover:opacity-100 transition-opacity">
                                                <ChevronRight className="w-5 h-5 text-indigo-500" />
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}

                            {/* Global Skills Radar (Only visible on main list) */}
                            <div className="bg-white dark:bg-[#1A2030] p-6 rounded-[2rem] border border-slate-100 dark:border-white/5 shadow-sm mt-6">
                                <h3 className="font-bold text-slate-800 dark:text-white mb-6 flex items-center gap-2">
                                    <Brain className="w-5 h-5 text-indigo-500" /> Compétences Globales
                                </h3>
                                <div className="space-y-5">
                                    <SkillBar label="Vocabulaire" value={skills.vocabulary} color="bg-emerald-500" icon="📖" />
                                    <SkillBar label="Grammaire" value={skills.grammar} color="bg-blue-500" icon="📐" />
                                    <SkillBar label="Prononciation" value={skills.pronunciation} color="bg-purple-500" icon="🎤" />
                                    <SkillBar label="Compréhension" value={skills.listening} color="bg-orange-500" icon="👂" />
                                </div>
                            </div>
                        </div>
                    ) : (
                        /* VIEW 2: DETAILED ROADMAP */
                        <div className="flex flex-col h-full">
                            <button 
                                onClick={() => setSelectedCourseId(null)}
                                className="flex items-center gap-2 text-sm font-bold text-slate-500 hover:text-indigo-600 mb-4 transition-colors"
                            >
                                <ArrowLeft className="w-4 h-4"/> Retour aux cours
                            </button>

                            {currentCourse && (
                                <>
                                    <div className="text-center mb-6">
                                        <h2 className="text-2xl font-black text-slate-800 dark:text-white tracking-tight">{currentCourse.language}</h2>
                                        <div className="inline-block px-3 py-1 bg-indigo-100 dark:bg-indigo-900/30 rounded-full text-indigo-700 dark:text-indigo-300 text-xs font-bold mt-1 border border-indigo-200 dark:border-indigo-800">
                                            Niveau {currentCourse.level}
                                        </div>
                                        <p className="text-xs text-slate-400 mt-2 font-medium">
                                            {TOTAL_LESSONS_PER_LEVEL - currentCourse.lessonCount} leçons avant le niveau suivant.
                                        </p>
                                    </div>

                                    <div className="flex-1 overflow-y-auto px-4 pb-20 scrollbar-hide relative">
                                        {/* Vertical Timeline Line */}
                                        <div className="absolute left-1/2 top-4 bottom-4 w-1 bg-slate-200 dark:bg-slate-800 -translate-x-1/2 rounded-full"></div>

                                        {Array.from({ length: TOTAL_LESSONS_PER_LEVEL }).map((_, idx) => {
                                            const lessonNum = idx + 1;
                                            const isCompleted = lessonNum <= currentCourse.lessonCount;
                                            const isCurrent = lessonNum === currentCourse.lessonCount + 1;
                                            const isMilestone = lessonNum % 10 === 0;
                                            
                                            // Determine Position (Zig Zag)
                                            const isLeft = idx % 2 === 0;

                                            return (
                                                <div key={idx} className={`relative flex items-center justify-between mb-8 ${isLeft ? 'flex-row' : 'flex-row-reverse'}`}>
                                                    
                                                    {/* The Node */}
                                                    <div className={`
                                                        relative z-10 w-16 h-16 rounded-full flex items-center justify-center border-4 transition-all duration-500
                                                        ${isCompleted 
                                                            ? 'bg-emerald-500 border-emerald-200 dark:border-emerald-900 text-white shadow-lg shadow-emerald-500/30' 
                                                            : isCurrent 
                                                                ? 'bg-white dark:bg-slate-900 border-indigo-500 text-indigo-600 scale-110 shadow-xl shadow-indigo-500/40 animate-pulse-slow' 
                                                                : 'bg-slate-100 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-400 grayscale'}
                                                    `}>
                                                        {isMilestone ? (
                                                            <Trophy className={`w-8 h-8 ${isCompleted ? 'text-white' : isCurrent ? 'text-indigo-500' : 'text-slate-400'}`} />
                                                        ) : isCompleted ? (
                                                            <Check className="w-8 h-8" />
                                                        ) : isCurrent ? (
                                                            <Zap className="w-8 h-8 fill-current" />
                                                        ) : (
                                                            <Lock className="w-6 h-6" />
                                                        )}
                                                        
                                                        {/* Lesson Number Badge */}
                                                        <div className={`absolute -bottom-2 bg-slate-900 text-white text-[10px] font-bold px-2 py-0.5 rounded-full border border-white dark:border-slate-700`}>
                                                            L{lessonNum}
                                                        </div>
                                                    </div>

                                                    {/* The Content Label (Opposite Side) */}
                                                    <div className={`w-[40%] ${isLeft ? 'text-right pr-4' : 'text-left pl-4'}`}>
                                                        {isCurrent && (
                                                            <div className="inline-block bg-indigo-600 text-white text-[10px] font-bold px-3 py-1 rounded-lg shadow-md animate-bounce">
                                                                En cours
                                                            </div>
                                                        )}
                                                        {isMilestone && (
                                                            <div className={`font-bold text-xs uppercase tracking-widest mt-1 ${isCompleted ? 'text-emerald-500' : 'text-slate-400'}`}>
                                                                Jalon {lessonNum}
                                                            </div>
                                                        )}
                                                    </div>
                                                    
                                                    {/* Spacer for the other side */}
                                                    <div className="w-[40%]"></div>
                                                </div>
                                            );
                                        })}
                                        
                                        {/* Final Trophy */}
                                        <div className="flex justify-center mt-8 mb-12 relative z-10">
                                            <div className="w-32 h-32 bg-gradient-to-br from-amber-300 to-orange-500 rounded-full flex flex-col items-center justify-center shadow-2xl border-4 border-white dark:border-slate-800 text-white p-4 text-center transform hover:scale-110 transition-transform cursor-default">
                                                <Award className="w-12 h-12 mb-1" />
                                                <span className="text-xs font-black uppercase leading-tight">Certificat {currentCourse.level}</span>
                                            </div>
                                        </div>
                                    </div>
                                </>
                            )}
                        </div>
                    )}
                </div>
            )}

            {/* === TAB: LESSONS (History) === */}
            {activeTab === 'lessons' && (
                <div className="space-y-4 animate-fade-in">
                     <div className="flex items-center justify-between mb-2">
                        <h3 className="font-bold text-slate-800 dark:text-white flex items-center gap-2">
                            <BookOpen className="w-4 h-4 text-indigo-500" /> Historique ({user.preferences?.targetLanguage})
                        </h3>
                        <span className="text-xs font-bold text-slate-400 bg-slate-100 dark:bg-slate-800 px-2 py-1 rounded-full">{completedLessons.length} leçons</span>
                     </div>
                     
                     {completedLessons.length > 0 ? (
                        <div className="space-y-3">
                            {completedLessons.map((lesson) => (
                                <div key={lesson.num} className="group bg-white dark:bg-[#1A2030] p-4 rounded-2xl flex items-center justify-between border border-slate-100 dark:border-white/5 hover:border-indigo-200 dark:hover:border-indigo-900 transition-all hover:shadow-md cursor-default">
                                    <div className="flex items-center gap-4 overflow-hidden">
                                        <div className="shrink-0 w-12 h-12 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 flex flex-col items-center justify-center group-hover:bg-indigo-50 dark:group-hover:bg-indigo-900/20 group-hover:text-indigo-600 transition-colors">
                                            <span className="text-[10px] font-bold uppercase">Leçon</span>
                                            <span className="text-lg font-black leading-none">{lesson.num}</span>
                                        </div>
                                        <div className="min-w-0">
                                            <h4 className="font-bold text-slate-800 dark:text-white text-sm truncate group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors">{lesson.title}</h4>
                                            <div className="text-xs text-slate-500 dark:text-slate-400 flex items-center gap-1 mt-1">
                                                <Calendar className="w-3 h-3" />
                                                {new Date(lesson.date).toLocaleDateString()}
                                            </div>
                                        </div>
                                    </div>
                                    <div className="w-8 h-8 rounded-full bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center">
                                        <Check className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                                    </div>
                                </div>
                            ))}
                        </div>
                    ) : (
                        <div className="flex flex-col items-center justify-center py-16 text-center">
                            <div className="w-20 h-20 bg-slate-100 dark:bg-slate-800 rounded-full flex items-center justify-center mb-4">
                                <BookOpen className="w-8 h-8 text-slate-300" />
                            </div>
                            <p className="text-sm font-bold text-slate-600 dark:text-slate-300">Aucune leçon terminée.</p>
                            <p className="text-xs text-slate-400 mt-1 max-w-[200px]">Commencez une discussion pour débloquer votre historique pour ce cours.</p>
                        </div>
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
    <button 
        onClick={onClick}
        className={`flex-1 min-w-[80px] flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-bold transition-all ${active ? 'bg-white dark:bg-[#0F1422] text-indigo-600 dark:text-white shadow-sm' : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'}`}
    >
        {icon} {label}
    </button>
);

const SettingItem = ({ icon, label, action }: any) => (
    <div className="flex items-center justify-between p-3 hover:bg-slate-50 dark:hover:bg-white/5 rounded-xl transition-colors">
        <div className="flex items-center gap-3">
            <div className="text-slate-400">{icon}</div>
            <span className="text-sm font-bold text-slate-700 dark:text-slate-200">{label}</span>
        </div>
        {action}
    </div>
);

const SkillBar = ({ label, value, color, icon }: { label: string, value: number, color: string, icon: string }) => (
    <div>
        <div className="flex justify-between mb-2">
            <span className="text-xs font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                <span className="text-base">{icon}</span> {label}
            </span>
            <span className="text-xs font-bold text-slate-500 dark:text-slate-400">{Math.round(value)}/100</span>
        </div>
        <div className="h-2 w-full bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
            <div className={`h-full ${color} rounded-full transition-all duration-1000 ease-out relative`} style={{ width: `${value}%` }}>
                <div className="absolute top-0 right-0 h-full w-full bg-gradient-to-b from-white/20 to-transparent"></div>
            </div>
        </div>
    </div>
);

export default SmartDashboard;