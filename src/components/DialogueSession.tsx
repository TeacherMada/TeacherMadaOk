
import React, { useState, useEffect, useRef } from 'react';
import { UserProfile, ChatMessage } from '../types';
import { generateRoleplayResponse } from '../services/geminiService';
import { storageService } from '../services/storageService';
import { X, Send, Mic, MessageCircle, Clock, GraduationCap, ShoppingBag, Plane, Stethoscope, Utensils, School, StopCircle, Trophy, AlertTriangle, Loader2, Play, Briefcase, Info, ArrowLeft, RefreshCcw, BookOpen } from 'lucide-react';

interface DialogueSessionProps {
  user: UserProfile;
  onClose: () => void;
  onUpdateUser: (user: UserProfile) => void;
  notify: (message: string, type: 'success' | 'error' | 'info') => void;
  onShowPayment: () => void; // Added Prop
}

const SCENARIOS = [
    { id: 'greeting', title: 'Première Rencontre', subtitle: 'Bases & Politesse', icon: <MessageCircle className="w-8 h-8"/>, color: 'bg-emerald-500', prompt: "Rencontre avec un nouvel ami étranger. Salutations et présentations." },
    { id: 'market', title: 'Au Marché', subtitle: 'Négociation & Nombres', icon: <ShoppingBag className="w-8 h-8"/>, color: 'bg-orange-500', prompt: "Acheter des fruits au marché local et négocier le prix." },
    { id: 'restaurant', title: 'Restaurant', subtitle: 'Commander & Goûts', icon: <Utensils className="w-8 h-8"/>, color: 'bg-rose-500', prompt: "Commander un repas complet et demander l'addition." },
    { id: 'travel', title: 'Gare & Aéroport', subtitle: 'Orientation & Horaires', icon: <Plane className="w-8 h-8"/>, color: 'bg-sky-500', prompt: "Demander son chemin et acheter un billet de train." },
    { id: 'job', title: 'Entretien d\'Embauche', subtitle: 'Professionnel & Formel', icon: <Briefcase className="w-8 h-8"/>, color: 'bg-slate-600', prompt: "Un entretien pour un stage ou un emploi. Parler de ses qualités." },
    { id: 'doctor', title: 'Consultation', subtitle: 'Santé & Corps', icon: <Stethoscope className="w-8 h-8"/>, color: 'bg-red-500', prompt: "Expliquer des symptômes à un médecin." },
];

const DialogueSession: React.FC<DialogueSessionProps> = ({ user, onClose, onUpdateUser, notify, onShowPayment }) => {
  const [scenario, setScenario] = useState<typeof SCENARIOS[0] | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [secondsActive, setSecondsActive] = useState(0);
  
  // Correction State
  const [lastCorrection, setLastCorrection] = useState<{original: string, corrected: string, explanation: string} | null>(null);
  
  const [finalScore, setFinalScore] = useState<{score: number, feedback: string} | null>(null);
  const [showIntro, setShowIntro] = useState(false);
  const [isInitializing, setIsInitializing] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Timer Logic: 1 min = 1 Credit
  useEffect(() => {
    let interval: any;
    if (scenario && !finalScore && !showIntro && !isInitializing) {
        interval = setInterval(async () => {
            setSecondsActive(prev => {
                const newVal = prev + 1;
                // Every 60 seconds, deduct 1 credit
                if (newVal > 0 && newVal % 60 === 0) {
                   storageService.checkAndConsumeCredit(user.id).then(allowed => {
                        if (allowed) {
                            storageService.getUserById(user.id).then(u => u && onUpdateUser(u));
                            notify("1 min écoulée : -1 Crédit", 'info');
                        } else {
                            clearInterval(interval);
                            notify("Crédits épuisés.", 'error');
                            onShowPayment();
                            handleFinish(); 
                        }
                   });
                }
                return newVal;
            });
        }, 1000);
    }
    return () => clearInterval(interval);
  }, [scenario, finalScore, user.id, showIntro, isInitializing]);

  useEffect(() => {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, lastCorrection, isLoading]);

  const selectScenario = (selected: typeof SCENARIOS[0]) => {
      setScenario(selected);
      setShowIntro(true);
  };

  const startSession = async () => {
      if (!scenario) return;
      
      const allowed = await storageService.checkAndConsumeCredit(user.id);
      
      if (allowed) {
          setShowIntro(false);
          setIsInitializing(true);
          
          const u = await storageService.getUserById(user.id);
          if (u) onUpdateUser(u);

          try {
              const result = await generateRoleplayResponse([], scenario.prompt, user, false, true);
              setMessages([{
                  id: 'sys_init',
                  role: 'model',
                  text: result.aiReply,
                  timestamp: Date.now()
              }]);
          } catch (e) {
              notify("Erreur d'initialisation. Réessayez.", 'error');
              setScenario(null);
          } finally {
              setIsInitializing(false);
          }
      } else {
          onShowPayment();
      }
  };

  const handleSend = async () => {
      if (!input.trim() || !scenario) return;
      
      const userText = input;
      const userMsg: ChatMessage = { id: Date.now().toString(), role: 'user', text: userText, timestamp: Date.now() };
      
      setMessages(prev => [...prev, userMsg]);
      setInput('');
      setIsLoading(true);
      setLastCorrection(null);

      try {
          const currentHistory = [...messages, userMsg];
          const result = await generateRoleplayResponse(currentHistory, scenario.prompt, user);
          
          if (result.correction) {
              setLastCorrection({
                  original: userText,
                  corrected: result.correction,
                  explanation: result.explanation || "Correction suggérée."
              });
          }

          const aiMsg: ChatMessage = { id: (Date.now() + 1).toString(), role: 'model', text: result.aiReply, timestamp: Date.now() };
          setMessages(prev => [...prev, aiMsg]);
      } catch (e) {
          console.error(e);
          notify("Erreur de connexion", 'error');
      } finally {
          setIsLoading(false);
      }
  };

  const handleFinish = async () => {
      if (!scenario) return;
      setIsLoading(true);
      try {
          const result = await generateRoleplayResponse(messages, scenario.prompt, user, true);
          setFinalScore({
              score: result.score || 0,
              feedback: result.feedback || "Bravo pour ta participation !"
          });
          
          // Update Stats
          const newStats = { 
              ...user.stats, 
              dialoguesCompleted: (user.stats.dialoguesCompleted || 0) + 1 
          };
          const updatedUser = { ...user, stats: newStats };
          await storageService.saveUserProfile(updatedUser);
          onUpdateUser(updatedUser);

      } catch (e) {
          setFinalScore({ score: 0, feedback: "Erreur lors de l'évaluation." });
      } finally {
          setIsLoading(false);
      }
  };

  const formatTime = (secs: number) => {
      const m = Math.floor(secs / 60);
      const s = secs % 60;
      return `${m}:${s < 10 ? '0' : ''}${s}`;
  };

  if (!scenario) {
      return (
        <div className="fixed inset-0 z-[120] bg-slate-50 dark:bg-slate-950 flex flex-col animate-fade-in">
            <div className="p-6 bg-white dark:bg-slate-900 border-b border-slate-100 dark:border-slate-800 flex justify-between items-center shadow-sm z-10">
                <div>
                    <h2 className="text-2xl font-black text-slate-900 dark:text-white tracking-tight">Espace Dialogue</h2>
                    <p className="text-slate-500 text-sm">Choisis ta mission du jour.</p>
                </div>
                <button onClick={onClose} className="p-2.5 bg-slate-100 dark:bg-slate-800 rounded-full hover:bg-slate-200 transition-colors"><X className="w-5 h-5"/></button>
            </div>
            
            <div className="flex-1 overflow-y-auto p-6 scrollbar-hide">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 max-w-4xl mx-auto">
                    {SCENARIOS.map(s => (
                        <button 
                            key={s.id} 
                            onClick={() => selectScenario(s)}
                            className="group relative overflow-hidden bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-6 text-left hover:shadow-2xl hover:border-indigo-500/30 transition-all duration-300 transform hover:-translate-y-1"
                        >
                            <div className={`absolute top-0 right-0 w-24 h-24 ${s.color} opacity-10 rounded-bl-[100px] transition-transform group-hover:scale-150`}></div>
                            <div className={`w-14 h-14 ${s.color} text-white rounded-2xl flex items-center justify-center mb-4 shadow-lg group-hover:rotate-6 transition-transform`}>{s.icon}</div>
                            <h3 className="text-xl font-bold text-slate-800 dark:text-white mb-1">{s.title}</h3>
                            <p className="text-slate-500 dark:text-slate-400 text-sm font-medium mb-4">{s.subtitle}</p>
                            <div className="flex items-center gap-2 text-indigo-600 dark:text-indigo-400 font-bold text-xs uppercase tracking-wider">Commencer <ArrowLeft className="w-4 h-4 rotate-180 transition-transform group-hover:translate-x-1" /></div>
                        </button>
                    ))}
                </div>
            </div>
        </div>
      );
  }

  if (showIntro) {
      return (
          <div className="fixed inset-0 z-[125] bg-slate-900/95 backdrop-blur-md flex items-center justify-center p-6 animate-fade-in">
              <div className="bg-white dark:bg-slate-900 w-full max-w-md rounded-[2rem] p-8 text-center shadow-2xl relative overflow-hidden border border-white/10">
                  <div className={`absolute top-0 left-0 w-full h-2 ${scenario.color}`}></div>
                  <div className={`w-20 h-20 mx-auto ${scenario.color} rounded-full flex items-center justify-center shadow-lg mb-6 animate-float`}><div className="text-white">{scenario.icon}</div></div>
                  <h2 className="text-3xl font-black text-slate-800 dark:text-white mb-2">{scenario.title}</h2>
                  <p className="text-slate-500 dark:text-slate-400 mb-8 px-4 leading-relaxed">"Tu vas être immergé dans une situation réelle. Fais de ton mieux pour parler uniquement en <strong>{user.preferences?.targetLanguage}</strong>."</p>
                  
                  <div className="flex gap-3">
                      <button onClick={() => setScenario(null)} className="flex-1 py-3.5 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 font-bold rounded-xl hover:bg-slate-200 transition-colors">Retour</button>
                      <button onClick={startSession} className="flex-[2] py-3.5 bg-gradient-to-r from-indigo-600 to-violet-600 text-white font-bold rounded-xl shadow-lg hover:shadow-indigo-500/30 hover:scale-[1.02] transition-all flex items-center justify-center gap-2"><Play className="w-5 h-5 fill-current"/> C'est parti</button>
                  </div>
              </div>
          </div>
      );
  }

  return (
    <div className="fixed inset-0 z-[120] bg-slate-50 dark:bg-slate-950 flex flex-col font-sans">
        <div className="bg-white dark:bg-slate-900 p-4 shadow-sm flex items-center justify-between border-b border-slate-100 dark:border-slate-800 z-20">
            <div className="flex items-center gap-3">
                <div className={`p-2.5 rounded-xl text-white shadow-md ${scenario.color}`}>{scenario.icon}</div>
                <div>
                    <h3 className="font-bold text-slate-800 dark:text-white text-sm">{scenario.title}</h3>
                    <div className="flex items-center gap-2 text-xs text-slate-500 font-medium">
                        <span className="flex items-center gap-1 text-indigo-500"><Clock className="w-3 h-3"/> {formatTime(secondsActive)}</span>
                    </div>
                </div>
            </div>
            {!finalScore && (
                <button onClick={handleFinish} className="px-4 py-2 bg-red-50 dark:bg-red-900/10 text-red-600 dark:text-red-400 rounded-xl text-xs font-bold hover:bg-red-100 transition-colors flex items-center gap-2"><StopCircle className="w-4 h-4"/> <span className="hidden sm:inline">Terminer</span></button>
            )}
        </div>

        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-6 bg-slate-50 dark:bg-slate-950 scrollbar-hide">
            {isInitializing && (
                <div className="flex justify-center py-10">
                    <div className="flex flex-col items-center gap-3"><Loader2 className="w-8 h-8 text-indigo-500 animate-spin"/><p className="text-xs font-bold text-indigo-400 uppercase tracking-widest animate-pulse">Création du scénario...</p></div>
                </div>
            )}

            {messages.map((msg, idx) => (
                <div key={msg.id} className="flex flex-col gap-2">
                    <div className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                        <div className={`max-w-[85%] sm:max-w-[75%] p-4 rounded-2xl text-sm leading-relaxed shadow-sm ${msg.role === 'user' ? 'bg-indigo-600 text-white rounded-tr-sm' : 'bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200 border border-slate-100 dark:border-slate-700 rounded-tl-sm'}`}>{msg.text}</div>
                    </div>
                    {msg.role === 'user' && idx === messages.length - 2 && lastCorrection && (
                        <div className="mx-auto max-w-[85%] sm:max-w-md bg-amber-50 dark:bg-amber-900/10 border-l-4 border-amber-400 p-3 rounded-r-xl shadow-sm animate-slide-up">
                            <div className="flex items-center gap-2 mb-1">
                                <div className="p-1 bg-amber-200 dark:bg-amber-800 rounded text-amber-700 dark:text-amber-200"><AlertTriangle className="w-3 h-3"/></div>
                                <span className="text-xs font-bold text-amber-700 dark:text-amber-400 uppercase">Correction</span>
                            </div>
                            <div className="pl-7">
                                <p className="text-sm text-slate-800 dark:text-slate-200 line-through opacity-60 mb-0.5">{lastCorrection.original}</p>
                                <p className="text-sm font-bold text-emerald-600 dark:text-emerald-400 mb-1">{lastCorrection.corrected}</p>
                                <p className="text-xs text-slate-500 dark:text-slate-400 italic">{lastCorrection.explanation}</p>
                            </div>
                        </div>
                    )}
                </div>
            ))}
            
            {/* Final Score View */}
            {finalScore && (
                 <div className="fixed inset-0 z-[130] bg-slate-900/90 backdrop-blur-sm flex items-center justify-center p-6 animate-fade-in">
                     <div className="bg-white dark:bg-slate-900 w-full max-w-sm rounded-[2rem] p-8 text-center shadow-2xl relative overflow-hidden border border-white/10">
                         <h2 className="text-4xl font-black text-slate-800 dark:text-white mb-2">{finalScore.score}/20</h2>
                         <div className="bg-slate-50 dark:bg-slate-800 p-4 rounded-2xl mb-6 text-left border border-slate-100 dark:border-slate-700">
                             <p className="text-xs font-bold text-slate-400 uppercase mb-2">Feedback</p>
                             <p className="text-sm text-slate-600 dark:text-slate-300 italic leading-relaxed">"{finalScore.feedback}"</p>
                         </div>
                         <button onClick={onClose} className="w-full py-4 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl shadow-lg">Continuer</button>
                     </div>
                 </div>
            )}
            <div ref={messagesEndRef} />
        </div>

        {!finalScore && !isInitializing && (
            <div className="p-4 bg-white dark:bg-slate-900 border-t border-slate-100 dark:border-slate-800 z-20">
                <div className="flex gap-3 max-w-4xl mx-auto">
                    <input type="text" value={input} onChange={e => setInput(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleSend()} placeholder={`Répondez en ${user.preferences?.targetLanguage}...`} className="flex-1 bg-slate-100 dark:bg-slate-800 rounded-2xl px-5 py-4 outline-none focus:ring-2 focus:ring-indigo-500 dark:text-white transition-all shadow-inner" disabled={isLoading} autoFocus />
                    <button onClick={handleSend} disabled={!input.trim() || isLoading} className="p-4 bg-indigo-600 hover:bg-indigo-700 text-white rounded-2xl disabled:opacity-50 shadow-lg"><Send className="w-6 h-6" /></button>
                </div>
            </div>
        )}
    </div>
  );
};

export default DialogueSession;
