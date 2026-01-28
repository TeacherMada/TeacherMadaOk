
import React, { useMemo, useState } from 'react';
import { UserProfile, ChatMessage } from '../types';
import { X, Trophy, Flame, Crown, LogOut, Sun, Moon, BookOpen, CheckCircle, Calendar, Target, Activity, Edit2, Save, Brain, Zap, BarChart3, TrendingUp, Lightbulb, Type } from 'lucide-react';

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
  onFontSizeChange
}) => {
  const [isEditing, setIsEditing] = useState(false);
  const [activeTab, setActiveTab] = useState<'overview' | 'lessons' | 'profile'>('overview');
  const [editForm, setEditForm] = useState({
      username: user.username,
      email: user.email || '',
      password: user.password || ''
  });
  
  // --- Derived Stats & Logic ---

  // Dynamic Skill Calculation (Simulated based on stats if not present)
  // In a real app, this would come from the backend analysis
  const skills = useMemo(() => {
    const baseVocab = user.skills?.vocabulary || 10;
    const baseGrammar = user.skills?.grammar || 5;
    const bonus = Math.min(user.stats.xp / 100, 50); // XP Contribution
    
    return {
        vocabulary: Math.min(baseVocab + bonus, 100),
        grammar: Math.min(baseGrammar + (bonus * 0.8), 100),
        pronunciation: Math.min((user.skills?.pronunciation || 5) + (bonus * 0.5), 100),
        listening: Math.min((user.skills?.listening || 5) + (bonus * 0.6), 100),
    };
  }, [user]);

  // Level Progress
  const levelProgress = Math.min((user.stats.lessonsCompleted % 50) * 2, 100); 

  // Activity Chart Data (Last 7 Days)
  const activityData = useMemo(() => {
    const days = [];
    const today = new Date();
    for (let i = 6; i >= 0; i--) {
        const d = new Date(today);
        d.setDate(today.getDate() - i);
        days.push({
            dateStr: d.toLocaleDateString(undefined, { weekday: 'short' }),
            fullDate: d.toDateString(),
            count: 0
        });
    }
    messages.forEach(msg => {
        const msgDate = new Date(msg.timestamp).toDateString();
        const dayObj = days.find(d => d.fullDate === msgDate);
        if (dayObj) dayObj.count += 1;
    });
    const maxCount = Math.max(...days.map(d => d.count), 10);
    return days.map(d => ({ ...d, height: Math.min((d.count / maxCount) * 100, 100) }));
  }, [messages]);

  // Completed Lessons List
  const completedLessons = useMemo(() => {
    const lessons: {num: number, title: string, date: number}[] = [];
    const regex = /##\s*(?:🟢|🔴|🔵)?\s*(?:LEÇON|LECON|LESSON|LESONA)\s*(\d+)\s*[:|-]?\s*(.*)/i;
    messages.forEach(msg => {
        if (msg.role === 'model') {
            const match = msg.text.match(regex);
            if (match) {
                 lessons.push({ num: parseInt(match[1]), title: match[2].trim(), date: msg.timestamp });
            }
        }
    });
    const uniqueLessons = new Map();
    lessons.forEach(l => uniqueLessons.set(l.num, l));
    return Array.from(uniqueLessons.values()).sort((a, b) => b.num - a.num);
  }, [messages]);

  // AI Recommendation Logic
  const recommendation = useMemo(() => {
      if (user.stats.streak === 0) return { title: "Rallumez la flamme", desc: "Commencez une session de 5 minutes pour relancer votre série !", icon: Flame, color: "text-orange-500" };
      if (skills.vocabulary < 30) return { title: "Enrichissez votre lexique", desc: "Faites une session 'Vocabulaire' pour booster vos mots.", icon: BookOpen, color: "text-blue-500" };
      if (skills.grammar < skills.vocabulary) return { title: "Structurez vos phrases", desc: "Une petite révision de grammaire serait bénéfique aujourd'hui.", icon: Brain, color: "text-purple-500" };
      return { title: "Continuez sur votre lancée", desc: "Vous êtes en forme ! Pourquoi ne pas tenter un défi oral ?", icon: Zap, color: "text-yellow-500" };
  }, [user.stats.streak, skills]);

  const handleSaveProfile = () => {
    if (!editForm.username.trim()) return;
    const updatedUser = { ...user, username: editForm.username, email: editForm.email, password: editForm.password };
    onUpdateUser(updatedUser);
    setIsEditing(false);
  };

  return (
    <div className="fixed inset-0 z-[100] flex justify-end">
      {/* Overlay Backdrop */}
      <div 
        className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm transition-opacity" 
        onClick={onClose}
      ></div>

      {/* Sidebar Panel */}
      <div className="relative w-full md:w-[600px] h-full bg-slate-50 dark:bg-[#0F1422] shadow-2xl flex flex-col border-l border-white/10 overflow-hidden animate-slide-in-right transform transition-transform duration-300">
        
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-slate-200 dark:border-white/5 bg-white dark:bg-[#131825]">
             <h2 className="text-xl font-bold text-slate-800 dark:text-white">Profil & Paramètres</h2>
             <button onClick={onClose} className="p-2 hover:bg-slate-100 dark:hover:bg-white/10 rounded-full transition-colors">
                <X className="w-5 h-5 text-slate-500 dark:text-slate-400" />
             </button>
        </div>

        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto scrollbar-hide">
            
            {/* User Profile Card */}
             <div className="flex flex-col items-center py-8 bg-white dark:bg-[#131825] border-b border-slate-200 dark:border-white/5">
                <div className="w-24 h-24 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-full flex items-center justify-center text-4xl border-4 border-white dark:border-[#1A2030] shadow-xl mb-4 text-white relative group">
                    {user.username.charAt(0).toUpperCase()}
                    <button onClick={() => { setActiveTab('profile'); setIsEditing(true); }} className="absolute bottom-0 right-0 p-1.5 bg-slate-800 dark:bg-white rounded-full border-2 border-white dark:border-slate-900 hover:scale-110 transition-transform">
                        <Edit2 className="w-3 h-3 text-white dark:text-slate-900" />
                    </button>
                </div>
                <h2 className="text-xl font-bold text-slate-800 dark:text-white mb-1">{user.username}</h2>
                <div className="flex items-center gap-2 text-xs font-semibold text-slate-500 dark:text-slate-400">
                    <span className="bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 px-2 py-0.5 rounded-full">{user.preferences?.targetLanguage.split(' ')[0]}</span>
                    <span>•</span>
                    <span>{user.preferences?.level.split(' ')[0]}</span>
                </div>
                {user.isPremium && (
                    <div className="mt-2 flex items-center gap-1 text-xs font-bold text-amber-500 bg-amber-50 dark:bg-amber-900/20 px-2 py-1 rounded-full border border-amber-200 dark:border-amber-900/50">
                        <Crown className="w-3 h-3 fill-current" /> PREMIUM
                    </div>
                )}
             </div>

             {/* Navigation Tabs (Compact) */}
             <div className="flex p-2 bg-slate-100 dark:bg-white/5 mx-6 mt-6 rounded-xl">
                <button onClick={() => setActiveTab('overview')} className={`flex-1 py-2 text-sm font-bold rounded-lg transition-all ${activeTab === 'overview' ? 'bg-white dark:bg-slate-700 text-indigo-600 dark:text-white shadow-sm' : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'}`}>
                    Vue d'ensemble
                </button>
                <button onClick={() => setActiveTab('lessons')} className={`flex-1 py-2 text-sm font-bold rounded-lg transition-all ${activeTab === 'lessons' ? 'bg-white dark:bg-slate-700 text-indigo-600 dark:text-white shadow-sm' : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'}`}>
                    Leçons
                </button>
                <button onClick={() => setActiveTab('profile')} className={`flex-1 py-2 text-sm font-bold rounded-lg transition-all ${activeTab === 'profile' ? 'bg-white dark:bg-slate-700 text-indigo-600 dark:text-white shadow-sm' : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'}`}>
                    Profil
                </button>
             </div>

             <div className="p-6">
                {/* --- TAB: OVERVIEW --- */}
                {activeTab === 'overview' && (
                    <div className="space-y-6 animate-fade-in">
                        
                        {/* Level Progress Bar (New) */}
                        <div className="bg-white dark:bg-[#1A2030] p-5 rounded-2xl shadow-sm border border-slate-100 dark:border-white/5">
                            <div className="flex justify-between items-end mb-2">
                                <div>
                                    <div className="text-xs font-bold text-slate-400 uppercase tracking-wide mb-1">Niveau Actuel</div>
                                    <h3 className="text-lg font-bold text-slate-800 dark:text-white">{user.preferences?.level.split(' ')[0]}</h3>
                                </div>
                                <span className="text-2xl font-black text-indigo-600 dark:text-indigo-400">{Math.round(levelProgress)}%</span>
                            </div>
                            <div className="h-4 w-full bg-slate-100 dark:bg-black/20 rounded-full overflow-hidden">
                                <div className="h-full bg-gradient-to-r from-indigo-500 to-purple-500 rounded-full transition-all duration-1000 ease-out relative" style={{ width: `${levelProgress}%` }}>
                                    <div className="absolute inset-0 bg-white/20 animate-pulse"></div>
                                </div>
                            </div>
                            <p className="text-xs text-slate-500 mt-2 text-right">Prochain niveau: Avancé</p>
                        </div>

                        {/* Quick Stats */}
                        <div className="grid grid-cols-2 gap-4">
                            <div className="bg-white dark:bg-[#1A2030] p-4 rounded-2xl flex flex-col items-center justify-center border border-slate-100 dark:border-white/5">
                                <Trophy className="w-6 h-6 text-amber-500 mb-2" />
                                <div className="font-black text-2xl text-slate-800 dark:text-white">{user.stats.xp}</div>
                                <div className="text-xs font-bold text-slate-400 uppercase tracking-wide">XP Totale</div>
                            </div>
                            <div className="bg-white dark:bg-[#1A2030] p-4 rounded-2xl flex flex-col items-center justify-center border border-slate-100 dark:border-white/5">
                                <Flame className="w-6 h-6 text-orange-500 mb-2" />
                                <div className="font-black text-2xl text-slate-800 dark:text-white">{user.stats.streak}</div>
                                <div className="text-xs font-bold text-slate-400 uppercase tracking-wide">Jours consécutifs</div>
                            </div>
                        </div>

                        {/* Recommendation */}
                        <div className="bg-gradient-to-r from-indigo-600 to-violet-600 rounded-2xl p-5 text-white shadow-lg relative overflow-hidden">
                             <div className="flex items-start gap-3 relative z-10">
                                <div className="p-2 bg-white/20 rounded-lg shrink-0">
                                    <recommendation.icon className="w-5 h-5 text-white" />
                                </div>
                                <div>
                                    <h3 className="font-bold text-lg leading-tight mb-1">{recommendation.title}</h3>
                                    <p className="text-sm text-indigo-100 opacity-90">{recommendation.desc}</p>
                                </div>
                             </div>
                        </div>

                        {/* Skills Radar */}
                        <div className="bg-white dark:bg-[#1A2030] p-5 rounded-2xl shadow-sm border border-slate-100 dark:border-white/5">
                            <h3 className="font-bold text-slate-800 dark:text-white mb-4 flex items-center gap-2">
                                <Brain className="w-4 h-4 text-indigo-500" /> Analyse des Compétences
                            </h3>
                            <div className="space-y-4">
                                <SkillBar label="Vocabulaire" value={skills.vocabulary} color="bg-emerald-500" />
                                <SkillBar label="Grammaire" value={skills.grammar} color="bg-blue-500" />
                                <SkillBar label="Prononciation" value={skills.pronunciation} color="bg-purple-500" />
                                <SkillBar label="Compréhension" value={skills.listening} color="bg-orange-500" />
                            </div>
                        </div>

                        {/* Activity Chart */}
                        <div className="bg-white dark:bg-[#1A2030] p-5 rounded-2xl shadow-sm border border-slate-100 dark:border-white/5">
                            <h3 className="font-bold text-slate-800 dark:text-white mb-4 flex items-center gap-2">
                                <BarChart3 className="w-4 h-4 text-indigo-500" /> Activité (7 Jours)
                            </h3>
                            <div className="flex items-end justify-between gap-2 h-32">
                                {activityData.map((day, idx) => (
                                    <div key={idx} className="flex flex-col items-center gap-1 w-full h-full justify-end">
                                        <div 
                                            className="w-full bg-indigo-500 rounded-t-sm"
                                            style={{ height: `${Math.max(day.height, 5)}%` }}
                                        ></div>
                                        <span className="text-[9px] font-bold text-slate-400 uppercase">{day.dateStr}</span>
                                    </div>
                                ))}
                            </div>
                        </div>

                         {/* Daily Challenges */}
                        <div className="bg-white dark:bg-[#1A2030] p-5 rounded-2xl shadow-sm border border-slate-100 dark:border-white/5">
                            <h3 className="font-bold text-slate-800 dark:text-white mb-4 flex items-center gap-2">
                                <Target className="w-4 h-4 text-red-500" /> Défis Quotidiens
                            </h3>
                            <div className="space-y-3">
                                {user.dailyChallenges?.map((challenge) => (
                                    <div key={challenge.id} className="flex items-center justify-between text-sm">
                                        <div className="flex items-center gap-2">
                                             <div className={`w-4 h-4 rounded-full border flex items-center justify-center ${challenge.isCompleted ? 'bg-emerald-500 border-emerald-500' : 'border-slate-300 dark:border-slate-600'}`}>
                                                 {challenge.isCompleted && <CheckCircle className="w-3 h-3 text-white" />}
                                             </div>
                                             <span className={challenge.isCompleted ? 'text-slate-400 line-through' : 'text-slate-700 dark:text-slate-200'}>{challenge.description}</span>
                                        </div>
                                        <span className="text-xs font-bold text-amber-500">+{challenge.xpReward} XP</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                )}

                {/* --- TAB: LESSONS --- */}
                {activeTab === 'lessons' && (
                    <div className="space-y-4 animate-fade-in">
                         {completedLessons.length > 0 ? (
                            <div className="space-y-3">
                                {completedLessons.map((lesson) => (
                                    <div key={lesson.num} className="bg-white dark:bg-[#1A2030] p-4 rounded-xl flex items-center justify-between border border-slate-100 dark:border-white/5">
                                        <div className="flex items-center gap-3">
                                            <div className="w-10 h-10 rounded-lg bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400 flex items-center justify-center font-bold">
                                                {lesson.num}
                                            </div>
                                            <div>
                                                <h4 className="font-bold text-slate-800 dark:text-white text-sm">{lesson.title}</h4>
                                                <div className="text-xs text-slate-500 dark:text-slate-400">{new Date(lesson.date).toLocaleDateString()}</div>
                                            </div>
                                        </div>
                                        <CheckCircle className="w-5 h-5 text-emerald-500" />
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <div className="text-center py-12 text-slate-500">
                                <BookOpen className="w-10 h-10 mx-auto mb-2 opacity-30" />
                                <p>Aucune leçon complétée.</p>
                            </div>
                        )}
                    </div>
                )}

                {/* --- TAB: PROFILE --- */}
                {activeTab === 'profile' && (
                     <div className="space-y-6 animate-fade-in">
                        
                        {/* APPEARANCE SECTION (With Font Size) */}
                        <div className="bg-white dark:bg-[#1A2030] p-5 rounded-2xl shadow-sm border border-slate-100 dark:border-white/5 space-y-4">
                            <h3 className="font-bold text-slate-800 dark:text-white flex items-center gap-2">
                                <Sun className="w-4 h-4" /> Apparence
                            </h3>
                            
                            {/* Theme Toggle */}
                            <button onClick={toggleTheme} className="w-full flex items-center justify-between p-3 rounded-xl bg-slate-50 dark:bg-white/5 hover:bg-slate-100 transition-colors">
                                <span className="text-sm font-medium text-slate-700 dark:text-slate-300">Mode Sombre</span>
                                <div className={`w-10 h-6 rounded-full p-1 transition-colors ${isDarkMode ? 'bg-indigo-600' : 'bg-slate-300'}`}>
                                    <div className={`w-4 h-4 bg-white rounded-full shadow-sm transform transition-transform ${isDarkMode ? 'translate-x-4' : 'translate-x-0'}`}></div>
                                </div>
                            </button>

                            {/* Font Size Control (Refined) */}
                            <div className="flex flex-col gap-2 p-3 rounded-xl bg-slate-50 dark:bg-white/5">
                                <div className="flex items-center gap-2 mb-1">
                                    <Type className="w-4 h-4 text-slate-500" />
                                    <span className="text-sm font-medium text-slate-700 dark:text-slate-300">Taille du texte</span>
                                </div>
                                <div className="flex items-center justify-between bg-white dark:bg-slate-800 rounded-lg p-1.5 border border-slate-200 dark:border-slate-700">
                                    <div className="flex-1 flex justify-between gap-1">
                                        {(['small', 'normal', 'large', 'xl'] as const).map((size, idx) => (
                                            <button
                                                key={size}
                                                onClick={() => onFontSizeChange(size)}
                                                className={`flex-1 py-1.5 rounded-md text-center transition-all ${
                                                    fontSize === size 
                                                    ? 'bg-indigo-600 text-white shadow-sm font-bold' 
                                                    : 'text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-700'
                                                }`}
                                            >
                                                <span style={{ fontSize: idx === 0 ? '0.75rem' : idx === 1 ? '0.875rem' : idx === 2 ? '1rem' : '1.125rem' }}>A</span>
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Edit Form */}
                        <div className="bg-white dark:bg-[#1A2030] p-5 rounded-2xl shadow-sm border border-slate-100 dark:border-white/5 space-y-4">
                            <h3 className="font-bold text-slate-800 dark:text-white flex items-center gap-2">
                                <Edit2 className="w-4 h-4" /> Modifier les informations
                            </h3>
                            <div>
                                <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Nom d'utilisateur</label>
                                <input 
                                    type="text" 
                                    value={editForm.username}
                                    onChange={(e) => setEditForm({...editForm, username: e.target.value})}
                                    className="w-full bg-slate-50 dark:bg-black/20 border border-slate-200 dark:border-white/10 rounded-lg px-3 py-2 text-sm text-slate-800 dark:text-white focus:ring-2 focus:ring-indigo-500 outline-none"
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Email</label>
                                <input 
                                    type="email" 
                                    value={editForm.email}
                                    onChange={(e) => setEditForm({...editForm, email: e.target.value})}
                                    className="w-full bg-slate-50 dark:bg-black/20 border border-slate-200 dark:border-white/10 rounded-lg px-3 py-2 text-sm text-slate-800 dark:text-white focus:ring-2 focus:ring-indigo-500 outline-none"
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Mot de passe</label>
                                <input 
                                    type="password" 
                                    value={editForm.password}
                                    onChange={(e) => setEditForm({...editForm, password: e.target.value})}
                                    placeholder="••••••"
                                    className="w-full bg-slate-50 dark:bg-black/20 border border-slate-200 dark:border-white/10 rounded-lg px-3 py-2 text-sm text-slate-800 dark:text-white focus:ring-2 focus:ring-indigo-500 outline-none"
                                />
                            </div>

                            <button onClick={handleSaveProfile} className="w-full py-3 bg-indigo-600 text-white font-bold rounded-xl hover:bg-indigo-700 transition-colors flex items-center justify-center gap-2">
                                <Save className="w-4 h-4" /> Enregistrer les modifications
                            </button>
                        </div>
                     </div>
                )}
             </div>

             {/* Footer Actions */}
             <div className="p-6 border-t border-slate-200 dark:border-white/5 bg-slate-50 dark:bg-[#0F1422]">
                <button onClick={onLogout} className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl text-red-500 bg-red-50 dark:bg-red-900/10 hover:bg-red-100 dark:hover:bg-red-900/20 transition-colors text-sm font-bold">
                    <LogOut className="w-4 h-4" /> Déconnexion
                </button>
             </div>

        </div>
      </div>
      
      {/* Styles for animation */}
      <style>{`
        @keyframes slideInRight {
          from { transform: translateX(100%); }
          to { transform: translateX(0); }
        }
        .animate-slide-in-right {
          animation: slideInRight 0.3s ease-out forwards;
        }
      `}</style>
    </div>
  );
};

// Helper Sub-Component for Skill Bars
const SkillBar = ({ label, value, color }: { label: string, value: number, color: string }) => (
    <div>
        <div className="flex justify-between mb-1">
            <span className="text-xs font-semibold text-slate-700 dark:text-slate-300">{label}</span>
            <span className="text-xs font-bold text-slate-800 dark:text-white">{Math.round(value)}%</span>
        </div>
        <div className="h-1.5 w-full bg-slate-100 dark:bg-black/20 rounded-full overflow-hidden">
            <div className={`h-full ${color} rounded-full transition-all duration-1000 ease-out`} style={{ width: `${value}%` }}></div>
        </div>
    </div>
);

export default SmartDashboard;
