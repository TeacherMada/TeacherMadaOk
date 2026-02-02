import React, { useState, useRef, useEffect } from 'react';
import { Send, Menu, ArrowRight, BookOpen, Star, Mic, Phone, Dumbbell, Brain, Sparkles, X, MicOff, Volume2, StopCircle, MoreHorizontal, Lightbulb, Play, RotateCcw } from 'lucide-react';
import { UserProfile, ChatMessage, LearningSession } from '../types';
import { sendMessageStream, generateNextLessonPrompt } from '../services/geminiService';
import { storageService } from '../services/storageService';
import MarkdownRenderer from './MarkdownRenderer';

interface Props {
  user: UserProfile;
  session: LearningSession;
  onShowProfile: () => void;
  onExit: () => void;
  onUpdateUser: (u: UserProfile) => void;
  onStartPractice: () => void;
  onStartExercise: () => void;
  notify: (m: string, t?: string) => void;
}

const ChatInterface: React.FC<Props> = ({ 
  user, 
  session, 
  onShowProfile, 
  onExit, 
  onUpdateUser, 
  onStartPractice, 
  onStartExercise,
  notify 
}) => {
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<ChatMessage[]>(session.messages);
  const [isStreaming, setIsStreaming] = useState(false);
  const [isVoiceMode, setIsVoiceMode] = useState(false);
  const [callDuration, setCallDuration] = useState(0);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Lesson Progress Logic
  const currentLessonNum = (user.stats.lessonsCompleted || 0) + 1;
  // Calculate progress based on turns, capping at 100%
  const progressPercent = Math.min((messages.length / 15) * 100, 100);

  // Voice Call Timer
  useEffect(() => {
    let interval: any;
    if (isVoiceMode) {
      interval = setInterval(() => setCallDuration(p => p + 1), 1000);
    } else {
      setCallDuration(0);
    }
    return () => clearInterval(interval);
  }, [isVoiceMode]);

  const formatTime = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  };

  const processMessage = async (text: string, isAuto: boolean = false) => {
    if (isStreaming) return;
    
    // If in voice mode, we simulate the AI listening then responding
    if (isVoiceMode) {
        // In a real app, this would use WebRTC/Speech-to-Text
        // Here we simulate a "I heard you" interaction
        setTimeout(() => {
             // Random simulated responses for the demo effect
             const voicePrompts = ["Peux-tu répéter ?", "C'est très bien !", "Continuons l'exercice."];
             const randomResp = voicePrompts[Math.floor(Math.random() * voicePrompts.length)];
             // We don't actually add text to chat in voice mode to keep it clean, 
             // or we could transcribe it. Let's keep voice mode separate visually.
        }, 2000);
        return;
    }

    const userMsg: ChatMessage = { 
        id: Date.now().toString(), 
        role: 'user', 
        text: isAuto ? "➡️ Suite du cours" : text, 
        timestamp: Date.now() 
    };
    
    const newHistory = [...messages, userMsg];
    setMessages(newHistory);
    setInput('');
    setIsStreaming(true);

    try {
      const promptToSend = isAuto ? generateNextLessonPrompt(user) : text;
      
      const aiMsgId = (Date.now() + 1).toString();
      const initialAiMsg: ChatMessage = { 
          id: aiMsgId, 
          role: 'model', 
          text: "", 
          timestamp: Date.now() 
      };
      
      setMessages(prev => [...prev, initialAiMsg]);

      const stream = sendMessageStream(promptToSend, user, messages);
      let fullText = "";

      for await (const chunk of stream) {
        if (chunk) {
            fullText += chunk;
            setMessages(prev => prev.map(m => m.id === aiMsgId ? { ...m, text: fullText } : m));
            scrollRef.current?.scrollIntoView({ behavior: 'smooth' });
        }
      }
      
      const finalHistory = [...newHistory, { ...initialAiMsg, text: fullText }];
      
      // Update Session & User Stats
      const updatedSession = { ...session, messages: finalHistory, progress: progressPercent };
      storageService.saveSession(updatedSession);
      
      const newXp = user.stats.xp + 5; 
      const updatedUser = { ...user, stats: { ...user.stats, xp: newXp } };
      storageService.saveUserProfile(updatedUser);
      onUpdateUser(updatedUser);

    } catch (e) {
      notify("Connexion instable.", "error");
    } finally {
      setIsStreaming(false);
    }
  };

  const handleSend = () => {
    if (!input.trim()) return;
    processMessage(input);
  };

  useEffect(() => {
    scrollRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isStreaming]);

  // --- VOICE CALL OVERLAY ---
  if (isVoiceMode) {
      return (
          <div className="fixed inset-0 z-50 bg-[#0B0F19] text-white flex flex-col items-center justify-between p-8 animate-fade-in font-sans">
              {/* Header */}
              <div className="w-full flex justify-between items-start opacity-80">
                  <button onClick={() => setIsVoiceMode(false)} className="p-3 bg-white/10 rounded-full hover:bg-white/20">
                      <X className="w-6 h-6" />
                  </button>
                  <div className="flex flex-col items-center">
                      <span className="text-xs font-bold uppercase tracking-widest text-indigo-400">Appel en cours</span>
                      <span className="font-mono text-lg">{formatTime(callDuration)}</span>
                  </div>
                  <div className="w-12"></div> {/* Spacer */}
              </div>

              {/* Central Visual */}
              <div className="flex flex-col items-center justify-center gap-8 w-full">
                  <div className="relative">
                      {/* Pulsing Rings */}
                      <div className="absolute inset-0 bg-indigo-500/20 rounded-full animate-ping blur-xl"></div>
                      <div className="absolute inset-0 bg-indigo-500/10 rounded-full animate-ping delay-300 blur-2xl"></div>
                      
                      <div className="relative w-40 h-40 rounded-full bg-gradient-to-b from-indigo-600 to-violet-800 p-1 shadow-[0_0_60px_rgba(79,70,229,0.4)] flex items-center justify-center">
                          <div className="w-full h-full rounded-full overflow-hidden bg-[#0B0F19] flex items-center justify-center relative">
                              <img src="/logo.png" className="w-24 h-24 object-contain z-10" alt="Teacher AI" />
                              {/* Audio Waveform Simulation */}
                              <div className="absolute bottom-0 left-0 w-full h-full bg-gradient-to-t from-indigo-900/50 to-transparent z-0 animate-pulse"></div>
                          </div>
                      </div>
                  </div>
                  
                  <div className="text-center space-y-2">
                      <h2 className="text-2xl font-bold">TeacherMada</h2>
                      <p className="text-indigo-300 font-medium">Listening...</p>
                  </div>
              </div>

              {/* Controls */}
              <div className="w-full max-w-sm grid grid-cols-3 gap-6 mb-8">
                  <button className="flex flex-col items-center gap-2 group">
                      <div className="w-14 h-14 rounded-full bg-white/10 flex items-center justify-center group-hover:bg-white/20 transition-all">
                          <MicOff className="w-6 h-6" />
                      </div>
                      <span className="text-xs font-medium">Mute</span>
                  </button>
                  
                  <button onClick={() => setIsVoiceMode(false)} className="flex flex-col items-center gap-2 group transform hover:scale-110 transition-transform">
                      <div className="w-16 h-16 rounded-full bg-red-500 flex items-center justify-center shadow-lg shadow-red-500/40">
                          <Phone className="w-8 h-8 rotate-[135deg]" />
                      </div>
                      <span className="text-xs font-medium text-red-400">Raccrocher</span>
                  </button>

                  <button className="flex flex-col items-center gap-2 group">
                      <div className="w-14 h-14 rounded-full bg-white/10 flex items-center justify-center group-hover:bg-white/20 transition-all">
                          <Volume2 className="w-6 h-6" />
                      </div>
                      <span className="text-xs font-medium">Haut-parleur</span>
                  </button>
              </div>
          </div>
      );
  }

  return (
    <div className="flex flex-col h-screen bg-[#F0F2F5] dark:bg-[#0B0F19] font-sans transition-colors duration-300">
      
      {/* --- MAXIMIZED HEADER BAR --- */}
      <header className="sticky top-0 z-30 bg-white/80 dark:bg-[#131825]/90 backdrop-blur-md border-b border-slate-200 dark:border-slate-800 shadow-sm safe-top">
        <div className="max-w-5xl mx-auto px-4 h-16 flex items-center justify-between">
            
            {/* Left: Menu & Context */}
            <div className="flex items-center gap-4">
                <button onClick={onShowProfile} className="p-2 -ml-2 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-colors">
                    <Menu className="w-6 h-6" />
                </button>
                
                <div className="flex flex-col">
                    <div className="flex items-center gap-2">
                        <span className="text-sm font-black text-slate-800 dark:text-white">
                            {user.preferences?.targetLanguage}
                        </span>
                        <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-indigo-100 dark:bg-indigo-500/20 text-indigo-600 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-500/30">
                            {user.preferences?.level}
                        </span>
                    </div>
                    {/* Compact Progress Bar */}
                    <div className="flex items-center gap-2 mt-0.5">
                        <div className="w-24 h-1 bg-slate-200 dark:bg-slate-800 rounded-full overflow-hidden">
                            <div 
                                className="h-full bg-indigo-500 rounded-full transition-all duration-500" 
                                style={{ width: `${progressPercent}%` }} 
                            />
                        </div>
                        <span className="text-[10px] font-bold text-slate-400">Leçon {currentLessonNum}</span>
                    </div>
                </div>
            </div>

            {/* Right: Quick Actions */}
            <div className="flex items-center gap-2">
                <button 
                    onClick={() => setIsVoiceMode(true)}
                    className="flex items-center justify-center w-10 h-10 bg-indigo-600 text-white rounded-full shadow-lg shadow-indigo-500/30 hover:bg-indigo-700 transition-transform active:scale-95"
                    title="Appel Vocal"
                >
                    <Phone className="w-5 h-5" />
                </button>
                <div className="hidden sm:flex flex-col items-end px-3 py-1 bg-amber-50 dark:bg-amber-900/10 border border-amber-100 dark:border-amber-900/30 rounded-lg">
                    <span className="text-xs font-black text-amber-600 dark:text-amber-400">{user.stats.xp} XP</span>
                    <span className="text-[10px] text-amber-500 font-bold uppercase">Série: {user.stats.streak} 🔥</span>
                </div>
            </div>
        </div>
      </header>

      {/* --- CHAT AREA --- */}
      <main className="flex-1 overflow-y-auto p-4 md:p-6 space-y-6 scrollbar-hide relative">
        <div className="max-w-3xl mx-auto space-y-6 pb-4">
            
            {messages.length === 0 && (
                <div className="flex flex-col items-center justify-center py-20 opacity-60">
                    <div className="w-24 h-24 bg-white dark:bg-slate-800 rounded-[2rem] flex items-center justify-center mb-6 shadow-xl border border-slate-100 dark:border-slate-700">
                        <img src="/logo.png" className="w-14 h-14 object-contain" />
                    </div>
                    <h3 className="text-xl font-bold text-slate-800 dark:text-white mb-2">Bonjour, {user.username} !</h3>
                    <p className="text-slate-500 dark:text-slate-400 text-sm text-center max-w-xs">
                        Prêt à continuer votre apprentissage du {user.preferences?.targetLanguage} ?
                    </p>
                    <div className="flex gap-2 mt-6">
                        <button onClick={() => processMessage("Commence la leçon")} className="px-4 py-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-full text-xs font-bold shadow-sm hover:border-indigo-500 transition-colors">
                            🚀 Démarrer la leçon
                        </button>
                        <button onClick={() => processMessage("Apprends-moi du vocabulaire")} className="px-4 py-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-full text-xs font-bold shadow-sm hover:border-indigo-500 transition-colors">
                            📚 Vocabulaire
                        </button>
                    </div>
                </div>
            )}
            
            {messages.map((msg, idx) => (
            <div key={msg.id || idx} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'} animate-slide-up group`}>
                {msg.role === 'model' && (
                    <div className="w-8 h-8 rounded-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 flex items-center justify-center mr-3 mt-1 shrink-0 overflow-hidden">
                        <img src="/logo.png" className="w-5 h-5 object-contain" />
                    </div>
                )}
                
                <div className={`max-w-[85%] md:max-w-[75%] p-5 rounded-2xl text-sm leading-relaxed shadow-sm transition-all duration-200 ${
                    msg.role === 'user' 
                    ? 'bg-indigo-600 text-white rounded-tr-sm' 
                    : 'bg-white dark:bg-[#131825] text-slate-800 dark:text-slate-200 border border-slate-200 dark:border-slate-800 rounded-tl-sm'
                }`}>
                    {/* Label for context */}
                    <div className="mb-2 flex items-center justify-between opacity-50 text-[10px] font-bold uppercase tracking-wider">
                        <span>{msg.role === 'user' ? 'Vous' : 'TeacherMada'}</span>
                        {/* Copy/Speak buttons could go here */}
                    </div>
                    
                    <MarkdownRenderer content={msg.text} />
                </div>
            </div>
            ))}
            
            {isStreaming && (
                <div className="flex justify-start">
                    <div className="w-8 h-8 mr-3"></div> {/* Spacer for avatar alignment */}
                    <div className="bg-white dark:bg-slate-800 px-4 py-3 rounded-2xl rounded-tl-sm border border-slate-200 dark:border-slate-700 shadow-sm flex items-center gap-2">
                        <div className="w-2 h-2 bg-indigo-500 rounded-full animate-bounce"></div>
                        <div className="w-2 h-2 bg-indigo-500 rounded-full animate-bounce delay-100"></div>
                        <div className="w-2 h-2 bg-indigo-500 rounded-full animate-bounce delay-200"></div>
                    </div>
                </div>
            )}

            <div ref={scrollRef} className="h-4" />
        </div>
      </main>

      {/* --- FOOTER INPUT --- */}
      <footer className="bg-white/90 dark:bg-[#131825]/90 backdrop-blur-lg border-t border-slate-200 dark:border-slate-800 safe-bottom z-30">
        <div className="max-w-3xl mx-auto p-4">
            
            {/* Quick Suggestions (Dynamic) */}
            {!input && messages.length > 0 && !isStreaming && (
                <div className="flex gap-2 mb-3 overflow-x-auto scrollbar-hide pb-1">
                    <button onClick={onStartPractice} className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 dark:bg-slate-800/50 text-indigo-600 dark:text-indigo-400 rounded-lg text-xs font-bold border border-transparent hover:border-indigo-200 dark:hover:border-indigo-900 transition-all">
                        <Dumbbell className="w-3.5 h-3.5" /> Pratique
                    </button>
                    <button onClick={onStartExercise} className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 dark:bg-slate-800/50 text-emerald-600 dark:text-emerald-400 rounded-lg text-xs font-bold border border-transparent hover:border-emerald-200 dark:hover:border-emerald-900 transition-all">
                        <Brain className="w-3.5 h-3.5" /> Quiz
                    </button>
                    <button onClick={() => processMessage("Donne-moi un exemple")} className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 dark:bg-slate-800/50 text-slate-600 dark:text-slate-400 rounded-lg text-xs font-bold border border-transparent hover:border-slate-300 dark:hover:border-slate-700 transition-all">
                        <Lightbulb className="w-3.5 h-3.5" /> Exemple
                    </button>
                </div>
            )}

            <div className="flex items-end gap-2 bg-slate-100 dark:bg-slate-800 p-2 rounded-[1.5rem] border border-transparent focus-within:border-indigo-500/30 focus-within:bg-white dark:focus-within:bg-slate-900 transition-all shadow-inner">
                <button 
                    onClick={() => setIsVoiceMode(true)}
                    className="h-10 w-10 shrink-0 rounded-full bg-slate-200 dark:bg-slate-700 text-slate-500 dark:text-slate-400 hover:text-indigo-600 hover:bg-indigo-100 dark:hover:bg-indigo-900/30 flex items-center justify-center transition-all"
                >
                    <Mic className="w-5 h-5" />
                </button>

                <textarea
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); }}}
                    placeholder="Posez une question..."
                    className="flex-1 bg-transparent border-none outline-none text-slate-800 dark:text-white text-sm px-2 resize-none max-h-32 placeholder:text-slate-400 py-2.5"
                    rows={1}
                    style={{ minHeight: '40px' }}
                />
                
                {input.trim().length === 0 ? (
                    <button 
                        onClick={() => processMessage("", true)}
                        disabled={isStreaming}
                        className="h-10 px-4 bg-emerald-500 hover:bg-emerald-600 text-white rounded-full font-bold text-xs shadow-md transition-all active:scale-95 flex items-center gap-1.5 shrink-0"
                    >
                        Suivant <ArrowRight className="w-3.5 h-3.5" />
                    </button>
                ) : (
                    <button 
                        onClick={handleSend}
                        disabled={isStreaming}
                        className="h-10 w-10 bg-indigo-600 hover:bg-indigo-700 text-white rounded-full shadow-md transition-all active:scale-95 flex items-center justify-center shrink-0"
                    >
                        <Send className="w-4 h-4 ml-0.5" />
                    </button>
                )}
            </div>
        </div>
      </footer>
    </div>
  );
};

export default ChatInterface;