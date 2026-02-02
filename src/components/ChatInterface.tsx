import React, { useState, useRef, useEffect } from 'react';
import { Send, Menu, ArrowRight, BookOpen, Star, Mic, Phone, Dumbbell, Brain, Sparkles, MoreVertical, StopCircle } from 'lucide-react';
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
  const [isVoiceActive, setIsVoiceActive] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Calculate dynamic progress based on message count (approx. 20 turns per lesson)
  const currentLessonNum = (user.stats.lessonsCompleted || 0) + 1;
  const progressPercent = Math.min((messages.length / 20) * 100, 100);

  const processMessage = async (text: string, isAuto: boolean = false) => {
    if (isStreaming) return;
    
    // Voice simulation check
    if (isVoiceActive) {
      setIsVoiceActive(false); // Stop "listening" UI
    }

    const userMsg: ChatMessage = { 
        id: Date.now().toString(), 
        role: 'user', 
        text: isAuto ? "➡️ Continuer le cours" : text, 
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
            // Auto scroll only if close to bottom
            scrollRef.current?.scrollIntoView({ behavior: 'smooth' });
        }
      }
      
      const finalHistory = [...newHistory, { ...initialAiMsg, text: fullText }];
      
      // Update Session & User Stats
      const updatedSession = { ...session, messages: finalHistory, progress: progressPercent };
      storageService.saveSession(updatedSession);
      
      const newXp = user.stats.xp + 2; // +2 XP per message
      const updatedUser = { ...user, stats: { ...user.stats, xp: newXp } };
      storageService.saveUserProfile(updatedUser);
      onUpdateUser(updatedUser);

    } catch (e) {
      notify("Erreur de connexion.", "error");
    } finally {
      setIsStreaming(false);
    }
  };

  const handleSend = () => {
    if (!input.trim()) return;
    processMessage(input);
  };

  const handleVoiceToggle = () => {
    if (isVoiceActive) {
      setIsVoiceActive(false);
    } else {
      setIsVoiceActive(true);
      notify("Micro activé (Simulation)", "info");
      // Simulate voice input after 2 seconds
      setTimeout(() => {
        if (Math.random() > 0.5) {
           setInput("Comment dire 'Bonjour' ?");
        } else {
           setInput("Je ne comprends pas la grammaire.");
        }
        setIsVoiceActive(false);
      }, 3000);
    }
  };

  useEffect(() => {
    scrollRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  return (
    <div className="flex flex-col h-screen bg-slate-50 dark:bg-slate-950 font-sans transition-colors duration-300">
      
      {/* --- RICH TOP BAR --- */}
      <header className="bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 h-16 flex items-center justify-between px-4 shrink-0 z-30 shadow-sm safe-top relative">
        
        {/* Left: Menu & Language Info */}
        <div className="flex items-center gap-3">
            <button onClick={onShowProfile} className="p-2 -ml-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-full transition-colors text-slate-600 dark:text-slate-300">
                <Menu className="w-6 h-6" />
            </button>
            
            <div className="flex flex-col">
                <div className="flex items-center gap-2">
                    <span className="text-sm font-black text-slate-800 dark:text-white">
                        {user.preferences?.targetLanguage}
                    </span>
                    <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-indigo-100 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800">
                        {user.preferences?.level}
                    </span>
                </div>
                
                {/* Lesson Progress Bar */}
                <div className="flex items-center gap-2">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Leçon {currentLessonNum}</span>
                    <div className="w-20 h-1.5 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                        <div 
                            className="h-full bg-gradient-to-r from-indigo-500 to-purple-500 transition-all duration-500" 
                            style={{ width: `${progressPercent}%` }} 
                        />
                    </div>
                </div>
            </div>
        </div>

        {/* Right: XP & Actions */}
        <div className="flex items-center gap-3">
            <div className="hidden sm:flex items-center gap-1 bg-amber-50 dark:bg-amber-900/20 px-3 py-1.5 rounded-full border border-amber-100 dark:border-amber-900/50">
                <Star className="w-4 h-4 text-amber-500 fill-amber-500" />
                <span className="text-xs font-bold text-amber-700 dark:text-amber-400">{user.stats.xp}</span>
            </div>
            
            {/* Quick Voice Call Button (Header) */}
            <button 
                onClick={handleVoiceToggle}
                className={`p-2.5 rounded-full transition-all ${isVoiceActive ? 'bg-red-500 text-white animate-pulse' : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300'}`}
            >
                {isVoiceActive ? <Phone className="w-5 h-5 fill-current"/> : <Phone className="w-5 h-5"/>}
            </button>
        </div>
      </header>

      {/* --- CHAT AREA --- */}
      <main className="flex-1 overflow-y-auto p-4 space-y-6 scrollbar-hide relative bg-slate-50 dark:bg-slate-950">
        {messages.length === 0 && (
            <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none opacity-40">
                <div className="w-24 h-24 bg-indigo-100 dark:bg-indigo-900/20 rounded-full flex items-center justify-center mb-6">
                    <Sparkles className="w-10 h-10 text-indigo-500" />
                </div>
                <p className="text-slate-500 font-bold text-lg">Votre cours commence ici.</p>
                <p className="text-slate-400 text-sm mt-1">Posez une question ou dites "Bonjour".</p>
            </div>
        )}
        
        {messages.map((msg, idx) => (
          <div key={msg.id || idx} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'} animate-fade-in-up`}>
            <div className={`max-w-[90%] md:max-w-[75%] p-4 rounded-2xl text-sm leading-relaxed shadow-sm ${
                msg.role === 'user' 
                ? 'bg-indigo-600 text-white rounded-tr-none' 
                : 'bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 border border-slate-200 dark:border-slate-700 rounded-tl-none'
            }`}>
              <MarkdownRenderer content={msg.text} />
            </div>
          </div>
        ))}
        
        {isStreaming && messages[messages.length - 1]?.role === 'user' && (
            <div className="flex justify-start animate-fade-in">
                <div className="bg-white dark:bg-slate-800 p-4 rounded-2xl rounded-tl-none shadow-sm border border-slate-200 dark:border-slate-700 flex items-center gap-2">
                    <div className="w-2 h-2 bg-indigo-400 rounded-full animate-bounce"></div>
                    <div className="w-2 h-2 bg-indigo-400 rounded-full animate-bounce delay-100"></div>
                    <div className="w-2 h-2 bg-indigo-400 rounded-full animate-bounce delay-200"></div>
                </div>
            </div>
        )}
        
        {/* Voice Listening UI Overlay */}
        {isVoiceActive && (
            <div className="fixed inset-0 z-40 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center">
                <div className="bg-white dark:bg-slate-900 p-8 rounded-[2rem] flex flex-col items-center animate-slide-up shadow-2xl">
                    <div className="w-20 h-20 bg-red-100 dark:bg-red-900/30 rounded-full flex items-center justify-center mb-4 relative">
                        <div className="absolute inset-0 bg-red-500 rounded-full opacity-20 animate-ping"></div>
                        <Mic className="w-8 h-8 text-red-500" />
                    </div>
                    <h3 className="font-bold text-slate-800 dark:text-white text-lg">Je vous écoute...</h3>
                    <button onClick={handleVoiceToggle} className="mt-6 px-6 py-2 bg-slate-200 dark:bg-slate-800 rounded-full text-sm font-bold text-slate-600 dark:text-slate-300">
                        Annuler
                    </button>
                </div>
            </div>
        )}

        <div ref={scrollRef} className="h-4" />
      </main>

      {/* --- RICH FOOTER --- */}
      <footer className="bg-white dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800 p-4 safe-bottom z-30">
        <div className="max-w-3xl mx-auto">
            
            {/* Quick Actions Bar */}
            <div className="flex gap-2 mb-3 overflow-x-auto scrollbar-hide pb-1">
                <button onClick={onStartPractice} className="flex items-center gap-2 px-4 py-2 bg-indigo-50 dark:bg-indigo-900/20 text-indigo-600 dark:text-indigo-300 rounded-xl text-xs font-bold whitespace-nowrap hover:bg-indigo-100 transition-colors border border-indigo-100 dark:border-indigo-800">
                    <Dumbbell className="w-3.5 h-3.5" /> Pratique (Roleplay)
                </button>
                <button onClick={onStartExercise} className="flex items-center gap-2 px-4 py-2 bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 dark:text-emerald-300 rounded-xl text-xs font-bold whitespace-nowrap hover:bg-emerald-100 transition-colors border border-emerald-100 dark:border-emerald-800">
                    <Brain className="w-3.5 h-3.5" /> Quiz & Exercices
                </button>
            </div>

            {/* Input Field */}
            <div className="flex gap-3 items-end">
                <button 
                    onClick={handleVoiceToggle}
                    className="h-[52px] w-[52px] shrink-0 rounded-2xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 text-slate-500 dark:text-slate-400 flex items-center justify-center transition-colors"
                >
                    <Mic className="w-5 h-5" />
                </button>

                <div className="flex-1 bg-slate-100 dark:bg-slate-800 rounded-2xl p-2 focus-within:ring-2 ring-indigo-500/50 transition-all">
                    <textarea
                        value={input}
                        onChange={(e) => setInput(e.target.value)}
                        onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); }}}
                        placeholder="Posez une question..."
                        className="w-full bg-transparent border-none outline-none text-slate-800 dark:text-white text-sm px-2 resize-none max-h-32 placeholder:text-slate-400"
                        rows={1}
                        style={{ minHeight: '44px', lineHeight: '1.5', padding: '10px' }}
                    />
                </div>
                
                {input.trim().length === 0 ? (
                    <button 
                        onClick={() => processMessage("", true)}
                        disabled={isStreaming}
                        className="h-[52px] px-5 bg-emerald-500 hover:bg-emerald-600 text-white rounded-2xl font-bold text-xs shadow-lg shadow-emerald-500/20 transition-all active:scale-95 flex items-center gap-1.5 shrink-0"
                    >
                        Suivant <ArrowRight className="w-4 h-4" />
                    </button>
                ) : (
                    <button 
                        onClick={handleSend}
                        disabled={isStreaming}
                        className="h-[52px] w-[52px] bg-indigo-600 hover:bg-indigo-700 text-white rounded-2xl shadow-lg shadow-indigo-500/20 transition-all active:scale-95 flex items-center justify-center shrink-0"
                    >
                        <Send className="w-5 h-5" />
                    </button>
                )}
            </div>
        </div>
      </footer>
    </div>
  );
};

export default ChatInterface;