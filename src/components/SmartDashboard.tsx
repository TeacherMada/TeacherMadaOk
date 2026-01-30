
import React, { useMemo, useState } from 'react';
import { UserProfile, ChatMessage } from '../types';
import { X, Trophy, Flame, LogOut, Sun, Moon, BookOpen, CheckCircle, Calendar, Target, Edit2, Save, Brain, Type, Coins, MessageSquare, CreditCard, ChevronRight, Copy, Check, PieChart, TrendingUp, Star, Crown } from 'lucide-react';
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
  const [activeTab, setActiveTab] = useState<'hub' | 'stats' | 'lessons'>('hub');
  const [editForm, setEditForm] = useState({
      username: user.username,
      email: user.email || '',
      password: user.password || ''
  });

  const [copied, setCopied] = useState(false);
  const cleanUsername = user.username.replace(/[^a-zA-Z0-9]/g, '');
  const motifCode = `Crd_${cleanUsername}`.substring(0, 20);

  const handleCopyMotif = () => {
      navigator.clipboard.writeText(motifCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
  };
  
  // --- Derived Stats & Logic ---

  const skills = useMemo(() => {
    const baseVocab = user.skills?.vocabulary || 10;
    const baseGrammar = user.skills?.grammar || 5;
    const bonus = Math.min(user.stats.xp / 100, 50); 
    
    return {
        vocabulary: Math.min(baseVocab + bonus, 100),
        grammar: Math.min(baseGrammar + (bonus * 0.8), 100),
        pronunciation: Math.min((user.skills?.pronunciation || 5) + (bonus * 0.5), 100),
        listening: Math.min((user.skills?.listening || 5) + (bonus * 0.6), 100),
    };
  }, [user]);

  // PROGRESSION INTELLIGENTE PAR NIVEAU
  const currentLevelCode = user.preferences?.level || 'A1';
  // Si la structure progressByLevel n'existe pas encore, on prend 0
  const specificLevelProgress = user.stats.progressByLevel?.[currentLevelCode] || 0;
  // Limiter à 100% visuellement
  const displayProgress = Math.min(specificLevelProgress, 100);

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
    
    const uniqueLessons = new Map();
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

  return (
    <div className="fixed inset-0 z-[100] flex justify-end">
      {/* Overlay Backdrop */}
      <div 
        className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm transition-opacity" 
        onClick={onClose}
      ></div>

      {/* Sidebar Panel - Modern Glassmorphism */}
      <div className="relative w-full md:w-[480px] h-full bg-white/90 dark:bg-[#0F1422]/95 backdrop-blur-xl shadow-2xl flex flex-col border-l border-white/20 dark:border-white/5 overflow-hidden animate-slide-in-right">
        
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
                     <div className="absolute -bottom-2 -right-2 bg-emerald-500 border-4 border-white dark:border-[#131825] w-6 h-6 rounded-full"></div>
                 </div>
                 <div>
                     <h2 className="text-xl font-bold text-slate-900 dark:text-white">{user.username}</h2>
                     <div className="flex items-center gap-2 mt-1">
                        <span className="text-xs font-bold px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 uppercase tracking-wide">
                            {user.preferences?.targetLanguage.split(' ')[0]}
                        </span>
                        <span className="text-xs font-black text-indigo-500 px-2 py-0.5 rounded-md bg-indigo-50 dark:bg-indigo-900/20 border border-indigo-100 dark:border-indigo-800">
                            {user.preferences?.level.split(' ')[0]}
                        </span>
                     </div>
                 </div>
             </div>
        </div>

        {/* Tabs - Pills Design */}
        <div className="px-6 py-4 bg-white dark:bg-[#131825]">
            <div className="flex p-1 bg-slate-100 dark:bg-slate-800 rounded-xl">
                <TabButton active={activeTab === 'hub'} onClick={() => setActiveTab('hub')} icon={<Target className="w-4 h-4"/>} label="Hub" />
                <TabButton active={activeTab === 'stats'} onClick={() => setActiveTab('stats')} icon={<PieChart className="w-4 h-4"/>} label="Stats" />
                <TabButton active={activeTab === 'lessons'} onClick={() => setActiveTab('lessons')} icon={<BookOpen className="w-4 h-4"/>} label="Leçons" />
            </div>
        </div>

        {/* Content Area */}
        <div className="flex-1 overflow-y-auto scrollbar-hide p-6 bg-slate-50 dark:bg-[#0B0F19]">
            
            {/* === TAB: HUB === */}
            {activeTab === 'hub' && (
                <div className="space-y-6 animate-fade-in">
                    
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
                                    <span className="text-lg font-bold text-indigo-400">CR</span>
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
                </div>
            )}

            {/* === TAB: STATS === */}
            {activeTab === 'stats' && (
                <div className="space-y-6 animate-fade-in">
                    {/* Level Progress Card */}
                    <div className="bg-gradient-to-br from-white to-slate-50 dark:from-[#1A2030] dark:to-[#151a27] p-6 rounded-[2rem] border border-slate-100 dark:border-white/5 shadow-sm relative overflow-hidden">
                        <div className="absolute top-0 right-0 p-4 opacity-10">
                            <TrendingUp className="w-24 h-24 text-indigo-500" />
                        </div>
                        <div className="relative z-10">
                            <h3 className="text-sm font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest mb-1">Niveau Actuel</h3>
                            <div className="flex items-baseline gap-2 mb-4">
                                <span className="text-4xl font-black text-slate-900 dark:text-white">{currentLevelCode}</span>
                                <span className="text-sm font-bold text-indigo-500 bg-indigo-50 dark:bg-indigo-900/30 px-2 py-1 rounded-lg">En cours</span>
                            </div>
                            
                            <div className="flex items-center justify-between text-xs font-bold text-slate-400 mb-2">
                                <span>Progression</span>
                                <span>{Math.round(displayProgress)}%</span>
                            </div>
                            <div className="h-4 w-full bg-slate-200 dark:bg-slate-800 rounded-full overflow-hidden shadow-inner">
                                <div className="h-full bg-gradient-to-r from-indigo-500 to-purple-500 shadow-[0_0_15px_rgba(99,102,241,0.5)] transition-all duration-1000 ease-out" style={{ width: `${displayProgress}%` }}></div>
                            </div>
                            <p className="text-xs text-slate-400 mt-3 text-center italic">Basé sur vos leçons et exercices pour ce niveau.</p>
                        </div>
                    </div>

                    {/* Skills Radar (Simulated with Bars) */}
                    <div className="bg-white dark:bg-[#1A2030] p-6 rounded-[2rem] border border-slate-100 dark:border-white/5 shadow-sm">
                        <h3 className="font-bold text-slate-800 dark:text-white mb-6 flex items-center gap-2">
                            <Brain className="w-5 h-5 text-indigo-500" /> Compétences
                        </h3>
                        <div className="space-y-5">
                            <SkillBar label="Vocabulaire" value={skills.vocabulary} color="bg-emerald-500" icon="📖" />
                            <SkillBar label="Grammaire" value={skills.grammar} color="bg-blue-500" icon="📐" />
                            <SkillBar label="Prononciation" value={skills.pronunciation} color="bg-purple-500" icon="🎤" />
                            <SkillBar label="Compréhension" value={skills.listening} color="bg-orange-500" icon="👂" />
                        </div>
                    </div>
                </div>
            )}

            {/* === TAB: LESSONS (History) === */}
            {activeTab === 'lessons' && (
                <div className="space-y-4 animate-fade-in">
                     <div className="flex items-center justify-between mb-2">
                        <h3 className="font-bold text-slate-800 dark:text-white flex items-center gap-2">
                            <BookOpen className="w-4 h-4 text-indigo-500" /> Historique
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
                            <p className="text-xs text-slate-400 mt-1 max-w-[200px]">Commencez une discussion pour débloquer votre historique.</p>
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
        className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-bold transition-all ${active ? 'bg-white dark:bg-[#0F1422] text-indigo-600 dark:text-white shadow-sm' : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'}`}
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
