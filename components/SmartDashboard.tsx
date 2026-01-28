
import React, { useMemo, useState } from 'react';
import { UserProfile, ChatMessage } from '../types';
import { X, Trophy, Flame, Crown, LogOut, Sun, Moon, BookOpen, CheckCircle, Calendar, Target, Activity, Edit2, Save, Brain, Zap, BarChart3, TrendingUp, Lightbulb, Type, Send, Coins, MessageSquare, ArrowLeftRight, CreditCard, ChevronRight, User, Copy, Check, Smartphone } from 'lucide-react';
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
  const [activeTab, setActiveTab] = useState<'profile' | 'stats' | 'lessons'>('profile');
  const [editForm, setEditForm] = useState({
      username: user.username,
      email: user.email || '',
      password: user.password || ''
  });

  // Request State
  const [requestAmount, setRequestAmount] = useState<string>('');
  const [requestMessage, setRequestMessage] = useState<string>('');
  const [requestSent, setRequestSent] = useState(false);
  const [creditPreview, setCreditPreview] = useState<number>(0);
  const [copied, setCopied] = useState(false);

  // Generate Reference Hint: Crd_{username} (Max 20 chars)
  // 1. Remove non-alphanumeric chars from username
  const cleanUsername = user.username.replace(/[^a-zA-Z0-9]/g, '');
  // 2. Prefix is 4 chars ("Crd_"). We have 16 chars left for username.
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

  const levelProgress = Math.min((user.stats.lessonsCompleted % 50) * 2, 100); 

  const completedLessons = useMemo(() => {
    const lessons: {num: number, title: string, date: number}[] = [];
    // Matches "## 🟢 LEÇON 1 : Titre" or variations
    const regex = /##\s*(?:🟢|🔴|🔵)?\s*(?:LEÇON|LECON|LESSON|LESONA)\s*(\d+)\s*[:|-]?\s*(.*)/i;
    
    messages.forEach(msg => {
        if (msg.role === 'model') {
            const match = msg.text.match(regex);
            if (match) {
                 // Clean up markdown bold/italic markers from title if present
                 const rawTitle = match[2].trim().replace(/[*_]/g, '');
                 lessons.push({ num: parseInt(match[1]), title: rawTitle, date: msg.timestamp });
            }
        }
    });
    
    // Deduplicate based on lesson number, keeping the latest one
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

  const handleAmountChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      const val = e.target.value;
      setRequestAmount(val);
      const num = parseInt(val);
      if (!isNaN(num) && num > 0) {
          setCreditPreview(Math.floor(num / CREDIT_PRICE_ARIARY));
      } else {
          setCreditPreview(0);
      }
  };

  const handleSendRequest = () => {
      const amt = parseInt(requestAmount);
      if (isNaN(amt) && !requestMessage.trim()) return;

      storageService.sendAdminRequest(
          user.id,
          user.username,
          !isNaN(amt) && amt > 0 ? 'credit' : 'message',
          !isNaN(amt) && amt > 0 ? creditPreview : undefined,
          requestMessage
      );
      setRequestSent(true);
      setRequestAmount('');
      setCreditPreview(0);
      setRequestMessage('');
      notify('Demande envoyée à l\'administrateur', 'success');
      setTimeout(() => setRequestSent(false), 3000);
  };

  return (
    <div className="fixed inset-0 z-[100] flex justify-end">
      {/* Overlay Backdrop */}
      <div 
        className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm transition-opacity" 
        onClick={onClose}
      ></div>

      {/* Sidebar Panel */}
      <div className="relative w-full md:w-[500px] h-full bg-slate-50 dark:bg-[#0F1422] shadow-2xl flex flex-col border-l border-white/10 overflow-hidden animate-slide-in-right transform transition-transform duration-300">
        
        {/* Header - Compact User Info */}
        <div className="flex items-center justify-between p-5 bg-white dark:bg-[#131825] border-b border-slate-200 dark:border-white/5">
             <div className="flex items-center gap-4">
                 <div className="w-12 h-12 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-full flex items-center justify-center text-lg font-bold text-white shadow-lg border-2 border-white dark:border-slate-800">
                    {user.username.charAt(0).toUpperCase()}
                 </div>
                 <div>
                     <h2 className="font-bold text-slate-800 dark:text-white leading-tight">{user.username}</h2>
                     <div className="text-xs text-slate-500 dark:text-slate-400 flex items-center gap-1">
                        <span className="bg-slate-100 dark:bg-slate-800 px-1.5 rounded">{user.preferences?.targetLanguage.split(' ')[0]}</span>
                        <span>•</span>
                        <span>{user.preferences?.level.split(' ')[0]}</span>
                     </div>
                 </div>
             </div>
             <button onClick={onClose} className="p-2 hover:bg-slate-100 dark:hover:bg-white/10 rounded-full transition-colors text-slate-500">
                <X className="w-5 h-5" />
             </button>
        </div>

        {/* Navigation Tabs */}
        <div className="flex border-b border-slate-200 dark:border-white/5 bg-white dark:bg-[#131825]">
            <button onClick={() => setActiveTab('profile')} className={`flex-1 py-3 text-sm font-bold border-b-2 transition-colors ${activeTab === 'profile' ? 'border-indigo-500 text-indigo-600 dark:text-white' : 'border-transparent text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'}`}>Mon Espace</button>
            <button onClick={() => setActiveTab('stats')} className={`flex-1 py-3 text-sm font-bold border-b-2 transition-colors ${activeTab === 'stats' ? 'border-indigo-500 text-indigo-600 dark:text-white' : 'border-transparent text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'}`}>Statistiques</button>
            <button onClick={() => setActiveTab('lessons')} className={`flex-1 py-3 text-sm font-bold border-b-2 transition-colors ${activeTab === 'lessons' ? 'border-indigo-500 text-indigo-600 dark:text-white' : 'border-transparent text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'}`}>Historique</button>
        </div>

        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto scrollbar-hide bg-slate-50 dark:bg-[#0F1422] p-5">
            
            {/* --- TAB: MON ESPACE --- */}
            {activeTab === 'profile' && (
                <div className="space-y-6 animate-fade-in">
                    
                    {/* Wallet Card */}
                    <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-slate-900 via-slate-800 to-indigo-900 text-white shadow-xl p-6">
                        <div className="absolute top-0 right-0 w-32 h-32 bg-white/5 rounded-full -mr-10 -mt-10 blur-2xl"></div>
                        <div className="absolute bottom-0 left-0 w-24 h-24 bg-indigo-500/20 rounded-full -ml-10 -mb-10 blur-xl"></div>
                        
                        <div className="relative z-10 flex justify-between items-start mb-8">
                            <div>
                                <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">Solde Disponible</p>
                                <div className="flex items-baseline gap-1">
                                    <span className="text-4xl font-black tracking-tight">{user.credits}</span>
                                    <span className="text-sm font-bold text-indigo-300">CR</span>
                                </div>
                            </div>
                            <div className="p-2 bg-white/10 rounded-lg backdrop-blur-sm">
                                <CreditCard className="w-6 h-6 text-white" />
                            </div>
                        </div>
                        
                        <div className="relative z-10">
                            <button 
                                onClick={onUpgrade} 
                                className="w-full py-2.5 bg-white text-indigo-900 font-bold rounded-xl text-sm flex items-center justify-center gap-2 hover:bg-indigo-50 transition-colors shadow-sm"
                            >
                                <Coins className="w-4 h-4" /> Recharger
                            </button>
                        </div>
                    </div>

                    {/* Quick Request */}
                    <div className="bg-white dark:bg-[#1A2030] rounded-2xl p-5 border border-slate-100 dark:border-white/5 shadow-sm">
                        <h3 className="font-bold text-slate-800 dark:text-white mb-3 text-sm flex items-center gap-2">
                            <MessageSquare className="w-4 h-4 text-indigo-500" /> Message Direct Admin
                        </h3>

                        {/* Payment Instructions */}
                        <div className="mb-4 bg-slate-50 dark:bg-black/20 rounded-lg p-3 border border-slate-200 dark:border-slate-700/50">
                             {/* Animated Recipient Name */}
                             <div className="mb-3 flex items-center justify-between bg-white dark:bg-slate-800 p-2 rounded-lg border border-slate-200 dark:border-slate-700">
                                <span className="text-[10px] uppercase font-bold text-slate-500">Envoyer à :</span>
                                <span className="text-sm font-black bg-clip-text text-transparent bg-gradient-to-r from-indigo-600 via-purple-600 to-indigo-600 animate-pulse">
                                    Tsanta Fiderana
                                </span>
                             </div>

                             <p className="text-[10px] uppercase font-bold text-slate-500 mb-2">1. Numéros Mobile Money :</p>
                             <div className="grid grid-cols-1 gap-1 text-xs font-mono mb-3">
                                <div className="flex justify-between"><span className="text-yellow-600">Telma:</span> <span className="font-bold dark:text-slate-300">{ADMIN_CONTACTS.telma}</span></div>
                                <div className="flex justify-between"><span className="text-red-600">Airtel:</span> <span className="font-bold dark:text-slate-300">{ADMIN_CONTACTS.airtel}</span></div>
                                <div className="flex justify-between"><span className="text-orange-600">Orange:</span> <span className="font-bold dark:text-slate-300">{ADMIN_CONTACTS.orange}</span></div>
                             </div>
                             
                             <p className="text-[10px] uppercase font-bold text-slate-500 mb-1">2. Motif (Description) :</p>
                             <div className="flex items-center gap-2 bg-white dark:bg-slate-800 p-1.5 rounded border border-slate-200 dark:border-slate-700">
                                <code className="flex-1 font-mono font-bold text-indigo-600 dark:text-indigo-400 text-xs text-center">{motifCode}</code>
                                <button onClick={handleCopyMotif} className="p-1 hover:bg-slate-100 dark:hover:bg-slate-700 rounded transition-colors">
                                    {copied ? <Check className="w-3 h-3 text-emerald-500"/> : <Copy className="w-3 h-3 text-slate-400"/>}
                                </button>
                             </div>
                        </div>

                        <div className="space-y-2">
                            <div className="flex gap-2">
                                <div className="w-1/3 relative">
                                    <input 
                                        type="number" 
                                        placeholder="Ar" 
                                        value={requestAmount}
                                        onChange={handleAmountChange}
                                        className="w-full bg-slate-50 dark:bg-black/20 border border-slate-200 dark:border-slate-700 rounded-lg pl-2 pr-1 py-2 text-sm text-slate-800 dark:text-white focus:ring-1 focus:ring-indigo-500 outline-none"
                                    />
                                    <span className="absolute right-2 top-2 text-[10px] text-slate-400 font-bold">{creditPreview > 0 ? `${creditPreview} CR` : ''}</span>
                                </div>
                                <input 
                                    type="text" 
                                    placeholder="Réf Transaction / Message..." 
                                    value={requestMessage}
                                    onChange={(e) => setRequestMessage(e.target.value)}
                                    className="flex-1 bg-slate-50 dark:bg-black/20 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-800 dark:text-white focus:ring-1 focus:ring-indigo-500 outline-none"
                                />
                            </div>
                            <button 
                                onClick={handleSendRequest}
                                disabled={requestSent || (!requestAmount && !requestMessage)}
                                className={`w-full py-2 rounded-lg text-xs font-bold transition-all ${requestSent ? 'bg-emerald-500 text-white' : 'bg-slate-800 dark:bg-slate-700 text-white hover:bg-slate-700 dark:hover:bg-slate-600'}`}
                            >
                                {requestSent ? 'Envoyé !' : 'Envoyer la demande'}
                            </button>
                        </div>
                    </div>

                    {/* Settings Group */}
                    <div className="bg-white dark:bg-[#1A2030] rounded-2xl p-5 border border-slate-100 dark:border-white/5 shadow-sm space-y-4">
                        <h3 className="font-bold text-slate-800 dark:text-white text-sm mb-2">Paramètres</h3>
                        
                        {/* Theme */}
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                                <div className="p-1.5 bg-indigo-50 dark:bg-indigo-900/30 rounded text-indigo-600 dark:text-indigo-400"><Sun className="w-4 h-4"/></div>
                                <span className="text-sm font-medium text-slate-600 dark:text-slate-300">Mode Sombre</span>
                            </div>
                            <button onClick={toggleTheme} className={`w-10 h-6 rounded-full p-1 transition-colors ${isDarkMode ? 'bg-indigo-600' : 'bg-slate-200'}`}>
                                <div className={`w-4 h-4 bg-white rounded-full shadow-sm transform transition-transform ${isDarkMode ? 'translate-x-4' : 'translate-x-0'}`}></div>
                            </button>
                        </div>

                        {/* Font Size */}
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                                <div className="p-1.5 bg-purple-50 dark:bg-purple-900/30 rounded text-purple-600 dark:text-purple-400"><Type className="w-4 h-4"/></div>
                                <span className="text-sm font-medium text-slate-600 dark:text-slate-300">Taille Texte</span>
                            </div>
                            <div className="flex bg-slate-100 dark:bg-slate-800 rounded-lg p-1">
                                {(['small', 'normal', 'large'] as const).map((size) => (
                                    <button 
                                        key={size} 
                                        onClick={() => onFontSizeChange(size)}
                                        className={`px-2 py-0.5 rounded text-xs font-bold ${fontSize === size ? 'bg-white dark:bg-slate-600 shadow-sm text-indigo-600 dark:text-white' : 'text-slate-400'}`}
                                    >
                                        A
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* Edit Profile Toggle */}
                        <div className="pt-2 border-t border-slate-100 dark:border-slate-800">
                            <button onClick={() => setIsEditing(!isEditing)} className="w-full flex items-center justify-between py-2 text-sm text-slate-600 dark:text-slate-300 hover:text-indigo-600 dark:hover:text-white transition-colors">
                                <span className="flex items-center gap-2">
                                    <Edit2 className="w-4 h-4" /> Modifier Infos
                                </span>
                                <ChevronRight className={`w-4 h-4 transition-transform ${isEditing ? 'rotate-90' : ''}`} />
                            </button>
                            
                            {isEditing && (
                                <div className="mt-3 space-y-3 animate-fade-in">
                                    <input type="text" value={editForm.username} onChange={(e) => setEditForm({...editForm, username: e.target.value})} className="w-full p-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-sm outline-none" placeholder="Username" />
                                    <input type="email" value={editForm.email} onChange={(e) => setEditForm({...editForm, email: e.target.value})} className="w-full p-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-sm outline-none" placeholder="Email" />
                                    <input type="password" value={editForm.password} onChange={(e) => setEditForm({...editForm, password: e.target.value})} className="w-full p-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-sm outline-none" placeholder="Nouveau Mot de passe" />
                                    <button onClick={handleSaveProfile} className="w-full py-2 bg-indigo-600 text-white rounded-lg text-sm font-bold">Enregistrer</button>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {/* --- TAB: STATS --- */}
            {activeTab === 'stats' && (
                <div className="space-y-6 animate-fade-in">
                    {/* Level Progress */}
                    <div className="bg-white dark:bg-[#1A2030] p-5 rounded-2xl border border-slate-100 dark:border-white/5 shadow-sm">
                        <div className="flex justify-between items-end mb-2">
                            <div>
                                <div className="text-xs font-bold text-slate-400 uppercase">Niveau</div>
                                <h3 className="text-lg font-bold text-slate-800 dark:text-white">{user.preferences?.level.split(' ')[0]}</h3>
                            </div>
                            <span className="text-2xl font-black text-indigo-600">{Math.round(levelProgress)}%</span>
                        </div>
                        <div className="h-3 w-full bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                            <div className="h-full bg-gradient-to-r from-indigo-500 to-purple-500" style={{ width: `${levelProgress}%` }}></div>
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                        <div className="bg-white dark:bg-[#1A2030] p-4 rounded-2xl text-center border border-slate-100 dark:border-white/5">
                            <Trophy className="w-6 h-6 text-amber-500 mx-auto mb-2" />
                            <div className="font-black text-xl text-slate-800 dark:text-white">{user.stats.xp}</div>
                            <div className="text-xs font-bold text-slate-400">XP Totale</div>
                        </div>
                        <div className="bg-white dark:bg-[#1A2030] p-4 rounded-2xl text-center border border-slate-100 dark:border-white/5">
                            <Flame className="w-6 h-6 text-orange-500 mx-auto mb-2" />
                            <div className="font-black text-xl text-slate-800 dark:text-white">{user.stats.streak}</div>
                            <div className="text-xs font-bold text-slate-400">Jours</div>
                        </div>
                    </div>

                    {/* Skills */}
                    <div className="bg-white dark:bg-[#1A2030] p-5 rounded-2xl border border-slate-100 dark:border-white/5 shadow-sm">
                        <h3 className="font-bold text-slate-800 dark:text-white mb-4 text-sm flex items-center gap-2">
                            <Brain className="w-4 h-4 text-indigo-500" /> Compétences
                        </h3>
                        <div className="space-y-4">
                            <SkillBar label="Vocabulaire" value={skills.vocabulary} color="bg-emerald-500" />
                            <SkillBar label="Grammaire" value={skills.grammar} color="bg-blue-500" />
                            <SkillBar label="Prononciation" value={skills.pronunciation} color="bg-purple-500" />
                        </div>
                    </div>
                </div>
            )}

            {/* --- TAB: LESSONS (History) --- */}
            {activeTab === 'lessons' && (
                <div className="space-y-4 animate-fade-in">
                     <h3 className="font-bold text-slate-800 dark:text-white mb-2 flex items-center gap-2">
                         <BookOpen className="w-4 h-4 text-indigo-500" /> Historique des leçons
                     </h3>
                     {completedLessons.length > 0 ? (
                        <div className="space-y-3">
                            {completedLessons.map((lesson) => (
                                <div key={lesson.num} className="bg-white dark:bg-[#1A2030] p-4 rounded-xl flex items-center justify-between border border-slate-100 dark:border-white/5 hover:border-indigo-100 dark:hover:border-slate-700 transition-colors">
                                    <div className="flex items-center gap-3 overflow-hidden">
                                        <div className="shrink-0 w-10 h-10 rounded-lg bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400 flex items-center justify-center font-bold">
                                            {lesson.num}
                                        </div>
                                        <div className="min-w-0">
                                            <h4 className="font-bold text-slate-800 dark:text-white text-sm truncate">{lesson.title}</h4>
                                            <div className="text-xs text-slate-500 dark:text-slate-400 flex items-center gap-1">
                                                <Calendar className="w-3 h-3" />
                                                {new Date(lesson.date).toLocaleDateString()}
                                            </div>
                                        </div>
                                    </div>
                                    <CheckCircle className="w-5 h-5 text-emerald-500 shrink-0" />
                                </div>
                            ))}
                        </div>
                    ) : (
                        <div className="text-center py-12 text-slate-500 border-2 border-dashed border-slate-200 dark:border-slate-800 rounded-2xl">
                            <BookOpen className="w-10 h-10 mx-auto mb-2 opacity-30" />
                            <p className="text-sm">Aucune leçon complétée.</p>
                            <p className="text-xs opacity-70 mt-1">Les leçons apparaîtront ici une fois terminées.</p>
                        </div>
                    )}
                </div>
            )}
        </div>

        {/* Footer */}
        <div className="p-5 border-t border-slate-200 dark:border-white/5 bg-white dark:bg-[#131825]">
            <button onClick={onLogout} className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl text-red-500 bg-red-50 dark:bg-red-900/10 hover:bg-red-100 dark:hover:bg-red-900/20 transition-colors text-sm font-bold">
                <LogOut className="w-4 h-4" /> Déconnexion
            </button>
        </div>
      </div>
    </div>
  );
};

const SkillBar = ({ label, value, color }: { label: string, value: number, color: string }) => (
    <div>
        <div className="flex justify-between mb-1">
            <span className="text-xs font-semibold text-slate-700 dark:text-slate-300">{label}</span>
            <span className="text-xs font-bold text-slate-800 dark:text-white">{Math.round(value)}%</span>
        </div>
        <div className="h-1.5 w-full bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
            <div className={`h-full ${color} rounded-full transition-all duration-1000 ease-out`} style={{ width: `${value}%` }}></div>
        </div>
    </div>
);

export default SmartDashboard;
