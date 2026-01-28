
import React, { useMemo, useState } from 'react';
import { UserProfile, LearningMode, ChatMessage } from '../types';
import { X, Trophy, Flame, Brain, Star, Crown, LogOut, Sun, Moon, BookOpen, CheckCircle, Calendar, Target, Activity, TrendingUp, Edit2, Save } from 'lucide-react';

interface ProfileModalProps {
  user: UserProfile;
  messages: ChatMessage[];
  onClose: () => void;
  onUpgrade: () => void;
  onUpdateUser: (user: UserProfile) => void;
  onLogout: () => void;
  isDarkMode: boolean;
  toggleTheme: () => void;
}

const ProfileModal: React.FC<ProfileModalProps> = ({ 
  user, 
  messages,
  onClose, 
  onUpgrade, 
  onUpdateUser,
  onLogout, 
  isDarkMode, 
  toggleTheme 
}) => {
  const [isEditing, setIsEditing] = useState(false);
  const [editForm, setEditForm] = useState({
      username: user.username,
      email: user.email || '',
      password: user.password || ''
  });
  
  // Calculate Level Progress visually
  const levelProgress = Math.min((user.stats.lessonsCompleted % 50) * 2, 100); 

  // --- Logic: Activity Chart (Last 7 Days) ---
  const activityData = useMemo(() => {
    const days = [];
    const today = new Date();
    
    // Initialize last 7 days with 0
    for (let i = 6; i >= 0; i--) {
        const d = new Date(today);
        d.setDate(today.getDate() - i);
        days.push({
            dateStr: d.toLocaleDateString(undefined, { weekday: 'short' }),
            fullDate: d.toDateString(),
            count: 0
        });
    }

    // Count messages per day
    messages.forEach(msg => {
        const msgDate = new Date(msg.timestamp).toDateString();
        const dayObj = days.find(d => d.fullDate === msgDate);
        if (dayObj) {
            dayObj.count += 1;
        }
    });

    // Find max for scaling (min 10 to avoid huge bars for low numbers)
    const maxCount = Math.max(...days.map(d => d.count), 10);
    
    return days.map(d => ({
        ...d,
        height: Math.min((d.count / maxCount) * 100, 100)
    }));
  }, [messages]);

  // --- Logic: Completed Lessons ---
  const completedLessons = useMemo(() => {
    const lessons: {num: number, title: string, date: number}[] = [];
    // Regex to match: ## 🟢 LEÇON 1 : TITRE
    const regex = /##\s*(?:🟢|🔴|🔵)?\s*(?:LEÇON|LECON|LESSON|LESONA)\s*(\d+)\s*[:|-]?\s*(.*)/i;

    messages.forEach(msg => {
        if (msg.role === 'model') {
            const match = msg.text.match(regex);
            if (match) {
                 lessons.push({
                     num: parseInt(match[1]),
                     title: match[2].trim(),
                     date: msg.timestamp
                 });
            }
        }
    });

    const uniqueLessons = new Map();
    lessons.forEach(l => uniqueLessons.set(l.num, l));
    return Array.from(uniqueLessons.values()).sort((a, b) => b.num - a.num);
  }, [messages]);

  const handleSaveProfile = () => {
    if (!editForm.username.trim()) return;

    const updatedUser = {
        ...user,
        username: editForm.username,
        email: editForm.email,
        password: editForm.password
    };

    onUpdateUser(updatedUser);
    setIsEditing(false);
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fade-in">
      <div className="bg-white dark:bg-slate-900 rounded-[2rem] w-full max-w-md shadow-2xl overflow-hidden transform transition-all border border-white/20 relative flex flex-col max-h-[90vh]">
        
        {/* Close Button */}
        <button 
            onClick={onClose}
            className="absolute top-4 right-4 z-10 p-2 bg-black/20 hover:bg-black/30 text-white rounded-full transition-colors cursor-pointer backdrop-blur-sm"
        >
           <X className="w-5 h-5" />
        </button>

        {/* Header / Banner */}
        <div className="bg-gradient-to-br from-indigo-600 to-violet-700 dark:from-indigo-900 dark:to-slate-900 p-8 text-white relative overflow-hidden shrink-0">
          <div className="absolute top-0 right-0 w-48 h-48 bg-white/5 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2"></div>
          
          <div className="flex flex-col items-center relative z-10">
            <div className="w-24 h-24 bg-white/10 rounded-full flex items-center justify-center text-5xl border-4 border-white/20 shadow-xl mb-4 backdrop-blur-md relative group">
              <span className="drop-shadow-md">{user.username.charAt(0).toUpperCase()}</span>
              {!isEditing && (
                  <button onClick={() => setIsEditing(true)} className="absolute bottom-0 right-0 p-1.5 bg-indigo-500 rounded-full hover:bg-indigo-400 transition-colors">
                      <Edit2 className="w-4 h-4 text-white" />
                  </button>
              )}
            </div>
            
            {isEditing ? (
                <div className="w-full space-y-2 animate-fade-in">
                    <input 
                        type="text" 
                        value={editForm.username} 
                        onChange={(e) => setEditForm({...editForm, username: e.target.value})}
                        className="w-full bg-white/20 border border-white/30 rounded-lg px-3 py-2 text-white placeholder-white/60 outline-none focus:ring-2 focus:ring-white/50 text-center font-bold"
                        placeholder="Pseudo"
                    />
                    <input 
                        type="email" 
                        value={editForm.email} 
                        onChange={(e) => setEditForm({...editForm, email: e.target.value})}
                        className="w-full bg-white/20 border border-white/30 rounded-lg px-3 py-2 text-white placeholder-white/60 outline-none focus:ring-2 focus:ring-white/50 text-center text-sm"
                        placeholder="Email"
                    />
                     <input 
                        type="password" 
                        value={editForm.password} 
                        onChange={(e) => setEditForm({...editForm, password: e.target.value})}
                        className="w-full bg-white/20 border border-white/30 rounded-lg px-3 py-2 text-white placeholder-white/60 outline-none focus:ring-2 focus:ring-white/50 text-center text-sm"
                        placeholder="Mot de passe"
                    />
                    <div className="flex gap-2 justify-center mt-2">
                        <button onClick={() => setIsEditing(false)} className="px-3 py-1 bg-white/10 hover:bg-white/20 rounded-md text-sm">Annuler</button>
                        <button onClick={handleSaveProfile} className="px-3 py-1 bg-emerald-500 hover:bg-emerald-400 rounded-md text-sm font-bold flex items-center gap-1">
                            <Save className="w-3 h-3" /> Sauvegarder
                        </button>
                    </div>
                </div>
            ) : (
                <>
                    <h2 className="text-3xl font-bold tracking-tight flex items-center gap-2">
                        {user.username}
                    </h2>
                    <div className="flex flex-wrap justify-center items-center gap-2 mt-2 text-indigo-100 text-sm font-medium">
                        {/* Target Language First */}
                        <span className="bg-white/10 px-3 py-1 rounded-full border border-white/10">
                            {user.preferences?.targetLanguage.split(' ')[0] || 'Langue'}
                        </span>
                        
                        {/* Level */}
                        <span className="bg-white/10 px-3 py-1 rounded-full border border-white/10">
                            {user.preferences?.level.split(' ')[0] || 'Niveau'}
                        </span>

                        {user.isPremium && (
                            <span className="text-amber-300 flex items-center gap-1 font-bold bg-white/10 px-3 py-1 rounded-full border border-amber-500/30">
                                <Crown className="w-3 h-3 fill-current" /> PREMIUM
                            </span>
                        )}
                    </div>
                </>
            )}
          </div>
        </div>

        {/* Scrollable Content */}
        <div className="overflow-y-auto flex-1 p-6 space-y-6 scrollbar-hide">
            
            {/* Level Progress */}
            <div className="space-y-2">
                <div className="flex justify-between text-sm font-bold text-slate-600 dark:text-slate-400">
                    <span>Niveau en cours</span>
                    <span>{levelProgress}%</span>
                </div>
                <div className="h-3 w-full bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                    <div 
                        className="h-full bg-gradient-to-r from-emerald-400 to-emerald-600 rounded-full"
                        style={{ width: `${levelProgress}%` }}
                    ></div>
                </div>
            </div>

            {/* Stats Grid */}
            <div className="grid grid-cols-2 gap-3">
                <div className="bg-indigo-50 dark:bg-slate-800/50 p-4 rounded-2xl flex flex-col items-center justify-center border border-indigo-100 dark:border-slate-800">
                    <Trophy className="w-6 h-6 text-amber-500 mb-2" />
                    <div className="font-black text-2xl text-slate-800 dark:text-white">{user.stats.xp}</div>
                    <div className="text-xs font-bold text-slate-400 uppercase tracking-wide">XP Totale</div>
                </div>
                <div className="bg-orange-50 dark:bg-slate-800/50 p-4 rounded-2xl flex flex-col items-center justify-center border border-orange-100 dark:border-slate-800">
                    <Flame className="w-6 h-6 text-orange-500 mb-2" />
                    <div className="font-black text-2xl text-slate-800 dark:text-white">{user.stats.streak}</div>
                    <div className="text-xs font-bold text-slate-400 uppercase tracking-wide">Série Jour</div>
                </div>
            </div>

            {/* MON PARCOURS (Activity Chart) */}
            <div className="space-y-3">
                <h3 className="flex items-center gap-2 font-bold text-slate-800 dark:text-white">
                    <Activity className="w-5 h-5 text-indigo-500" />
                    Mon Parcours (7 Jours)
                </h3>
                <div className="bg-slate-50 dark:bg-slate-800/50 p-5 rounded-2xl border border-slate-100 dark:border-slate-700 h-40 flex items-end justify-between gap-2">
                    {activityData.map((day, idx) => (
                        <div key={idx} className="flex flex-col items-center gap-1 w-full h-full justify-end">
                            <div 
                                className="w-full bg-indigo-500/80 hover:bg-indigo-500 rounded-t-md transition-all duration-500 min-h-[4px]"
                                style={{ height: `${day.height}%` }}
                                title={`${day.count} messages`}
                            ></div>
                            <span className="text-[10px] font-bold text-slate-400 uppercase">{day.dateStr}</span>
                        </div>
                    ))}
                </div>
            </div>

            {/* DÉFIS QUOTIDIENS (Moved here) */}
             <div className="space-y-3">
                <h3 className="flex items-center gap-2 font-bold text-slate-800 dark:text-white">
                    <Target className="w-5 h-5 text-red-500" />
                    Défis Quotidiens
                </h3>
                <div className="space-y-2">
                    {user.dailyChallenges?.map((challenge) => (
                      <div key={challenge.id} className={`p-3 rounded-xl border transition-all ${challenge.isCompleted ? 'bg-emerald-50 dark:bg-emerald-900/20 border-emerald-100 dark:border-emerald-900/50' : 'bg-slate-50 dark:bg-slate-800/50 border-slate-100 dark:border-slate-700'}`}>
                          <div className="flex justify-between items-start mb-1">
                              <span className={`text-sm font-medium ${challenge.isCompleted ? 'text-emerald-800 dark:text-emerald-300' : 'text-slate-700 dark:text-slate-200'}`}>{challenge.description}</span>
                              {challenge.isCompleted && <CheckCircle className="w-4 h-4 text-emerald-500" />}
                          </div>
                          <div className="flex items-center gap-2 mt-2">
                              <div className="flex-1 h-1.5 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
                                  <div className={`h-full rounded-full ${challenge.isCompleted ? 'bg-emerald-500' : 'bg-indigo-500'}`} style={{ width: `${Math.min((challenge.currentCount / challenge.targetCount) * 100, 100)}%` }}></div>
                              </div>
                              <span className="text-[10px] font-bold text-slate-500">{challenge.currentCount}/{challenge.targetCount}</span>
                          </div>
                      </div>
                  ))}
                </div>
             </div>

            {/* My Lessons Section */}
            <div className="space-y-3">
                <h3 className="flex items-center gap-2 font-bold text-slate-800 dark:text-white">
                    <BookOpen className="w-5 h-5 text-emerald-500" />
                    Leçons Complétées
                </h3>
                {completedLessons.length > 0 ? (
                    <div className="bg-slate-50 dark:bg-slate-800/50 rounded-2xl border border-slate-100 dark:border-slate-700 overflow-hidden">
                        {completedLessons.map((lesson, idx) => (
                            <div 
                                key={lesson.num} 
                                className={`p-4 flex items-center justify-between group hover:bg-white dark:hover:bg-slate-800 transition-colors ${idx !== completedLessons.length - 1 ? 'border-b border-slate-100 dark:border-slate-700' : ''}`}
                            >
                                <div>
                                    <div className="flex items-center gap-2 mb-1">
                                        <div className="bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400 text-[10px] font-black px-1.5 py-0.5 rounded">
                                            LEÇON {lesson.num}
                                        </div>
                                        <div className="text-xs text-slate-400 flex items-center gap-1">
                                            <Calendar className="w-3 h-3" />
                                            {new Date(lesson.date).toLocaleDateString()}
                                        </div>
                                    </div>
                                    <h4 className="font-semibold text-slate-700 dark:text-slate-200 text-sm">{lesson.title}</h4>
                                </div>
                                <div className="text-slate-300 dark:text-slate-600">
                                    <CheckCircle className="w-5 h-5 text-emerald-500" />
                                </div>
                            </div>
                        ))}
                    </div>
                ) : (
                    <div className="text-center p-6 bg-slate-50 dark:bg-slate-800/50 rounded-2xl border border-dashed border-slate-200 dark:border-slate-700">
                        <BookOpen className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                        <p className="text-slate-500 dark:text-slate-400 text-sm">Aucune leçon complétée pour le moment.</p>
                    </div>
                )}
            </div>

            {/* Settings & Actions */}
             <div className="space-y-3 pt-2">
                <button 
                    onClick={toggleTheme}
                    className="w-full py-3 px-4 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-xl flex items-center justify-between transition-colors"
                >
                    <span className="flex items-center gap-3 font-medium text-slate-700 dark:text-slate-200">
                        {isDarkMode ? <Moon className="w-5 h-5" /> : <Sun className="w-5 h-5" />}
                        Apparence
                    </span>
                    <span className="text-sm text-slate-400">{isDarkMode ? 'Sombre' : 'Clair'}</span>
                </button>
             </div>
        </div>
        
        {/* Footer Logout */}
        <div className="p-4 border-t border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/50">
            <button 
                onClick={onLogout}
                className="w-full py-3 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-xl font-bold transition-colors flex items-center justify-center gap-2"
            >
                <LogOut className="w-5 h-5" />
                Déconnexion
            </button>
        </div>

      </div>
    </div>
  );
};

export default ProfileModal;
