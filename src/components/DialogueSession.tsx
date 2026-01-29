
import React, { useState, useEffect, useRef } from 'react';
import { UserProfile, ChatMessage } from '../types';
import { generateRoleplayResponse } from '../services/geminiService';
import { storageService } from '../services/storageService';
import { X, Send, Mic, MessageCircle, Clock, GraduationCap, ShoppingBag, Plane, Stethoscope, Utensils, School, StopCircle, Trophy, AlertTriangle, Loader2 } from 'lucide-react';

interface DialogueSessionProps {
  user: UserProfile;
  onClose: () => void;
  onUpdateUser: (user: UserProfile) => void;
  notify: (message: string, type: 'success' | 'error' | 'info') => void;
}

const SCENARIOS = [
    { id: 'greeting', title: 'Salutations & Rencontre', icon: <MessageCircle className="w-6 h-6"/>, prompt: "Meeting a new friend for the first time." },
    { id: 'market', title: 'Au Marché', icon: <ShoppingBag className="w-6 h-6"/>, prompt: "Buying vegetables and bargaining at a local market." },
    { id: 'restaurant', title: 'Restaurant', icon: <Utensils className="w-6 h-6"/>, prompt: "Ordering food and asking for the bill." },
    { id: 'travel', title: 'Voyage & Orientation', icon: <Plane className="w-6 h-6"/>, prompt: "Asking for directions at an airport or train station." },
    { id: 'doctor', title: 'Chez le Docteur', icon: <Stethoscope className="w-6 h-6"/>, prompt: "Explaining symptoms to a doctor." },
    { id: 'school', title: 'À l\'École', icon: <School className="w-6 h-6"/>, prompt: "Talking to a teacher about homework." },
];

const DialogueSession: React.FC<DialogueSessionProps> = ({ user, onClose, onUpdateUser, notify }) => {
  const [scenario, setScenario] = useState<typeof SCENARIOS[0] | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [secondsActive, setSecondsActive] = useState(0);
  const [correction, setCorrection] = useState<string | null>(null);
  const [finalScore, setFinalScore] = useState<{score: number, feedback: string} | null>(null);
  
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Timer Logic: 1 min = 1 Credit
  useEffect(() => {
    let interval: any;
    if (scenario && !finalScore) {
        interval = setInterval(() => {
            setSecondsActive(prev => {
                const newVal = prev + 1;
                // Every 60 seconds, deduct 1 credit
                if (newVal > 0 && newVal % 60 === 0) {
                   storageService.deductCreditOrUsage(user.id).then((updatedUser) => {
                       if (updatedUser) {
                           onUpdateUser(updatedUser);
                           notify("1 min écoulée : -1 Crédit", 'info');
                       } else {
                           // No credits left
                           clearInterval(interval);
                           notify("Crédits épuisés. Fin de la session.", 'error');
                           handleFinish(); 
                       }
                   });
                }
                return newVal;
            });
        }, 1000);
    }
    return () => clearInterval(interval);
  }, [scenario, finalScore, user.id]);

  // Auto-scroll
  useEffect(() => {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleStart = async (selected: typeof SCENARIOS[0]) => {
      if (storageService.canPerformRequest(user.id).allowed) {
          setScenario(selected);
          // Deduct initial credit for starting
          const u = await storageService.deductCreditOrUsage(user.id);
          if (u) onUpdateUser(u);
          
          setMessages([{
              id: 'sys_init',
              role: 'model',
              text: `(Scénario: ${selected.title}) Bonjour ! Commençons.`,
              timestamp: Date.now()
          }]);
      } else {
          notify("Crédits insuffisants pour démarrer.", 'error');
      }
  };

  const handleSend = async () => {
      if (!input.trim() || !scenario) return;
      
      const userMsg: ChatMessage = { id: Date.now().toString(), role: 'user', text: input, timestamp: Date.now() };
      const newHistory = [...messages, userMsg];
      setMessages(newHistory);
      setInput('');
      setIsLoading(true);
      setCorrection(null);

      try {
          const result = await generateRoleplayResponse(newHistory, scenario.prompt, user);
          
          if (result.correction) {
              setCorrection(result.correction);
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
          // Send closing request
          const result = await generateRoleplayResponse(messages, scenario.prompt, user, true);
          setFinalScore({
              score: result.score || 0,
              feedback: result.feedback || "Bravo pour ta participation !"
          });
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

  // --- RENDERING ---

  if (!scenario) {
      return (
        <div className="fixed inset-0 z-[120] bg-slate-50 dark:bg-slate-950 flex flex-col p-4 animate-fade-in">
            <div className="flex justify-between items-center mb-6">
                <button onClick={onClose} className="p-2 bg-slate-200 dark:bg-slate-800 rounded-full"><X/></button>
                <h2 className="text-xl font-bold text-slate-800 dark:text-white">Jeux de Rôle</h2>
                <div className="w-10"></div>
            </div>
            
            <div className="text-center mb-8">
                <p className="text-slate-600 dark:text-slate-400 mb-2">Choisis une situation pour t'entraîner.</p>
                <div className="inline-block bg-indigo-100 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300 px-3 py-1 rounded-full text-xs font-bold">
                    <Clock className="w-3 h-3 inline mr-1"/> 1 min = 1 Crédit
                </div>
            </div>

            <div className="grid grid-cols-2 gap-4 overflow-y-auto pb-10">
                {SCENARIOS.map(s => (
                    <button 
                        key={s.id} 
                        onClick={() => handleStart(s)}
                        className="p-5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-sm hover:shadow-md hover:border-indigo-500 transition-all flex flex-col items-center gap-3 text-center"
                    >
                        <div className="p-3 bg-indigo-50 dark:bg-indigo-900/20 text-indigo-600 dark:text-indigo-400 rounded-full">
                            {s.icon}
                        </div>
                        <span className="font-bold text-slate-700 dark:text-slate-200">{s.title}</span>
                    </button>
                ))}
            </div>
        </div>
      );
  }

  return (
    <div className="fixed inset-0 z-[120] bg-slate-50 dark:bg-slate-950 flex flex-col">
        {/* Header */}
        <div className="bg-white dark:bg-slate-900 p-4 shadow-sm flex items-center justify-between border-b border-slate-100 dark:border-slate-800">
            <div className="flex items-center gap-3">
                <div className="p-2 bg-indigo-100 dark:bg-indigo-900/30 rounded-lg text-indigo-600">
                    {scenario.icon}
                </div>
                <div>
                    <h3 className="font-bold text-slate-800 dark:text-white text-sm">{scenario.title}</h3>
                    <div className="flex items-center gap-2 text-xs text-slate-500">
                        <span className="flex items-center gap-1 text-red-500 font-mono"><Clock className="w-3 h-3"/> {formatTime(secondsActive)}</span>
                    </div>
                </div>
            </div>
            {!finalScore && (
                <button onClick={handleFinish} className="px-4 py-2 bg-red-50 text-red-600 rounded-lg text-xs font-bold hover:bg-red-100 transition-colors flex items-center gap-1">
                    <StopCircle className="w-4 h-4"/> Terminer
                </button>
            )}
        </div>

        {/* Chat Area */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-slate-50 dark:bg-slate-950">
            {messages.map(msg => (
                <div key={msg.id} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                    <div className={`max-w-[85%] p-3 rounded-2xl text-sm ${
                        msg.role === 'user' 
                        ? 'bg-indigo-600 text-white rounded-tr-none' 
                        : 'bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200 border border-slate-200 dark:border-slate-700 rounded-tl-none'
                    }`}>
                        {msg.text}
                    </div>
                </div>
            ))}
            
            {correction && !finalScore && (
                <div className="mx-auto max-w-sm bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-700 p-3 rounded-xl animate-fade-in my-2">
                    <div className="flex items-center gap-2 text-xs font-bold text-yellow-700 dark:text-yellow-400 mb-1">
                        <AlertTriangle className="w-3 h-3"/> Correction
                    </div>
                    <p className="text-xs text-slate-600 dark:text-slate-300 italic">{correction}</p>
                </div>
            )}

            {isLoading && (
                <div className="flex justify-start">
                    <div className="bg-white dark:bg-slate-800 p-3 rounded-2xl rounded-tl-none border">
                        <Loader2 className="w-4 h-4 animate-spin text-indigo-500"/>
                    </div>
                </div>
            )}
            
            {/* Final Score Card */}
            {finalScore && (
                 <div className="mx-auto max-w-sm bg-white dark:bg-slate-900 border-2 border-indigo-100 dark:border-indigo-900 p-6 rounded-3xl shadow-xl text-center animate-slide-up mt-4">
                     <div className="w-16 h-16 bg-yellow-100 rounded-full flex items-center justify-center mx-auto mb-4">
                         <Trophy className="w-8 h-8 text-yellow-500" />
                     </div>
                     <h2 className="text-2xl font-black text-slate-800 dark:text-white mb-1">Note : {finalScore.score}/20</h2>
                     <p className="text-slate-500 dark:text-slate-400 text-sm mb-4">Bilan de la session</p>
                     <p className="text-slate-700 dark:text-slate-300 italic mb-6">"{finalScore.feedback}"</p>
                     <button onClick={onClose} className="w-full py-3 bg-indigo-600 text-white font-bold rounded-xl hover:bg-indigo-700">
                         Quitter
                     </button>
                 </div>
            )}

            <div ref={messagesEndRef} />
        </div>

        {/* Input Area */}
        {!finalScore && (
            <div className="p-3 bg-white dark:bg-slate-900 border-t border-slate-100 dark:border-slate-800">
                <div className="flex gap-2">
                    <input 
                        type="text" 
                        value={input}
                        onChange={e => setInput(e.target.value)}
                        onKeyDown={e => e.key === 'Enter' && handleSend()}
                        placeholder="Réponds à ton partenaire..."
                        className="flex-1 bg-slate-100 dark:bg-slate-800 rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-indigo-500 dark:text-white"
                        disabled={isLoading}
                    />
                    <button 
                        onClick={handleSend}
                        disabled={!input.trim() || isLoading}
                        className="p-3 bg-indigo-600 text-white rounded-xl disabled:opacity-50"
                    >
                        <Send className="w-5 h-5" />
                    </button>
                </div>
            </div>
        )}
    </div>
  );
};

export default DialogueSession;
