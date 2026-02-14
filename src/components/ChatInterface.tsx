
import React, { useState, useRef, useEffect, useMemo } from 'react';
import { Send, Phone, ArrowRight, X, Mic, Volume2, ArrowLeft, Sun, Moon, Zap, ChevronDown, Repeat, MessageCircle, Brain, Target, Star, Loader2, StopCircle, AlertTriangle, Check } from 'lucide-react';
import { UserProfile, ChatMessage, LearningSession } from '../types';
import { sendMessageStream, generateSpeech } from '../services/geminiService';
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
  onStartVoiceCall: () => void; // Added prop
  notify: (m: string, t?: string) => void;
  onShowPayment: () => void;
  onChangeCourse: () => void;
}

// Helper to convert Raw PCM to AudioBuffer (For TTS usage inside Chat)
function pcmToAudioBuffer(data: Uint8Array, ctx: AudioContext, sampleRate: number = 24000) {
    const pcm16 = new Int16Array(data.buffer);
    const float32 = new Float32Array(pcm16.length);
    for (let i = 0; i < pcm16.length; i++) {
        float32[i] = pcm16[i] / 32768.0; 
    }
    const buffer = ctx.createBuffer(1, float32.length, sampleRate);
    buffer.copyToChannel(float32, 0);
    return buffer;
}

const ChatInterface: React.FC<Props> = ({ 
  user, 
  session, 
  onShowProfile, 
  onExit, 
  onUpdateUser, 
  onStartPractice, 
  onStartExercise,
  onStartVoiceCall, 
  notify, 
  onShowPayment,
  onChangeCourse
}) => {
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<ChatMessage[]>(session.messages);
  const [isStreaming, setIsStreaming] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  
  // Audio Playback State (TTS)
  const [speakingMessageId, setSpeakingMessageId] = useState<string | null>(null);
  const [audioContext, setAudioContext] = useState<AudioContext | null>(null);
  const [currentSource, setCurrentSource] = useState<AudioBufferSourceNode | null>(null);
  const [isLoadingAudio, setIsLoadingAudio] = useState(false);

  // Lesson Selection State
  const [showNextInput, setShowNextInput] = useState(false);
  const [nextLessonInput, setNextLessonInput] = useState('');
  
  const [showTopMenu, setShowTopMenu] = useState(false);
  const [isDarkMode, setIsDarkMode] = useState(() => localStorage.getItem('tm_theme') === 'dark');

  const TEACHER_AVATAR = "https://i.ibb.co/B2XmRwmJ/logo.png";

  // Derive title
  const currentLessonTitle = useMemo(() => {
      const lastAiMessage = [...messages].reverse().find(m => m.role === 'model');
      if (lastAiMessage) {
          const match = lastAiMessage.text.match(/(?:Leçon|Lesson)\s+(\d+)/i);
          if (match) return `Leçon ${match[1]}`;
      }
      return `Leçon ${(user.stats.lessonsCompleted || 0) + 1}`;
  }, [messages, user.stats.lessonsCompleted]);

  // Sync user updates (credits)
  useEffect(() => {
      const unsub = storageService.subscribeToUserUpdates((updated) => {
          if (updated.id === user.id) {
              onUpdateUser(updated);
          }
      });
      return () => unsub();
  }, [user.id, onUpdateUser]);

  const toggleTheme = () => {
      const newMode = !isDarkMode;
      setIsDarkMode(newMode);
      document.documentElement.classList.toggle('dark', newMode);
      localStorage.setItem('tm_theme', newMode ? 'dark' : 'light');
  };

  // Audio Context Init
  useEffect(() => {
      const initAudio = () => {
          if (!audioContext) {
              const ctx = new (window.AudioContext || (window as any).webkitAudioContext)({sampleRate: 24000});
              setAudioContext(ctx);
          } else if (audioContext.state === 'suspended') {
              audioContext.resume();
          }
      };
      window.addEventListener('click', initAudio, { once: true });
      window.addEventListener('touchstart', initAudio, { once: true });
      return () => {
          window.removeEventListener('click', initAudio);
          window.removeEventListener('touchstart', initAudio);
      };
  }, [audioContext]);

  // TTS Logic
  const stopSpeaking = () => {
      if (currentSource) {
          try { currentSource.stop(); } catch (e) {}
          setCurrentSource(null);
      }
      setSpeakingMessageId(null);
      setIsLoadingAudio(false);
  };

  const playMessageAudio = async (text: string, id: string) => {
      if (speakingMessageId === id) {
          stopSpeaking();
          return;
      }
      
      const canPlay = await storageService.canRequest(user.id);
      if (!canPlay) {
          notify("Crédit insuffisant (1 audio = 1 Crédit).", "error");
          onShowPayment();
          return;
      }

      stopSpeaking();
      setIsLoadingAudio(true);
      setSpeakingMessageId(id);

      try {
          const cleanText = text.replace(/[#*`_]/g, '').replace(/\[Leçon \d+\]/gi, '');
          const pcmBuffer = await generateSpeech(cleanText);
          
          if (!pcmBuffer) throw new Error("Audio init failed (Credits or Network)");
          
          let ctx = audioContext;
          if (!ctx) {
              ctx = new (window.AudioContext || (window as any).webkitAudioContext)({sampleRate: 24000});
              setAudioContext(ctx);
          }
          if (ctx.state === 'suspended') await ctx.resume();

          const audioBuffer = pcmToAudioBuffer(new Uint8Array(pcmBuffer), ctx, 24000);
          const source = ctx.createBufferSource();
          source.buffer = audioBuffer;
          source.connect(ctx.destination);
          source.onended = () => {
              setSpeakingMessageId(null);
              setCurrentSource(null);
          };
          source.start(0);
          setCurrentSource(source);
      } catch (e) {
          notify("Erreur lecture ou Crédits épuisés", "error");
          setSpeakingMessageId(null);
      } finally {
          setIsLoadingAudio(false);
      }
  };

  // --- FEATURE CHECK HANDLERS ---
  
  const handleMenuAction = async (action: () => void) => {
      const allowed = await storageService.canRequest(user.id);
      if (!allowed) {
          notify("Crédit insuffisant.", "error");
          onShowPayment();
          return;
      }
      action();
  };

  const handleVoiceCallClick = async () => {
      const allowed = await storageService.canRequest(user.id, 5); 
      if (!allowed) {
          notify("Il faut 5 crédits minimum pour l'appel Live.", "error");
          onShowPayment();
          return;
      }
      onStartVoiceCall();
  };

  // Progress Data
  const progressData = useMemo(() => {
      const levels = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2', 'HSK 1', 'HSK 2', 'HSK 3', 'HSK 4', 'HSK 5', 'HSK 6'];
      const currentLevel = user.preferences?.level || 'A1';
      const currentIndex = levels.indexOf(currentLevel);
      const nextLevel = currentIndex < levels.length - 1 ? levels[currentIndex + 1] : 'Expert';
      
      const lessonNum = (user.stats.lessonsCompleted || 0) + 1;
      const percentage = Math.min((lessonNum / 50) * 100, 100);
      
      return { percentage: Math.round(percentage), nextLevel, currentLevel };
  }, [user.preferences?.level, user.stats.lessonsCompleted]);

  const userFlag = useMemo(() => {
      const lang = user.preferences?.targetLanguage || '';
      return lang.includes(' ') ? lang.split(' ').pop() : '🏳️';
  }, [user.preferences?.targetLanguage]);

  const isLowCredits = user.credits <= 0;

  // --- TEXT CHAT ---
  const processMessage = async (text: string, isAuto: boolean = false) => {
    if (isStreaming) return;
    
    const canRequest = await storageService.canRequest(user.id);
    if (!canRequest) {
        notify("Crédits insuffisants (1 requête = 1 crédit).", "error");
        onShowPayment();
        return;
    }

    const userDisplayMsg = isAuto ? "Suivant" : text;
    const promptToSend = text;

    const userMsg: ChatMessage = { id: Date.now().toString(), role: 'user', text: userDisplayMsg, timestamp: Date.now() };
    const newHistory = [...messages, userMsg];
    setMessages(newHistory);
    setInput('');
    setIsStreaming(true);

    try {
      const stream = sendMessageStream(promptToSend, user, messages);
      let fullText = "";
      const aiMsgId = (Date.now() + 1).toString();
      setMessages(prev => [...prev, { id: aiMsgId, role: 'model', text: "", timestamp: Date.now() }]);

      for await (const chunk of stream) {
        if (chunk) {
            fullText += chunk;
            setMessages(prev => prev.map(m => m.id === aiMsgId ? { ...m, text: fullText } : m));
            scrollRef.current?.scrollIntoView({ behavior: 'smooth' });
        }
      }
      
      const newMessages = [...newHistory, { id: aiMsgId, role: 'model' as const, text: fullText, timestamp: Date.now() }];
      storageService.saveSession({ ...session, messages: newMessages, progress: (messages.length / 20) * 100 });

      if (isAuto) {
          const newStats = { ...user.stats, lessonsCompleted: (user.stats.lessonsCompleted || 0) + 1 };
          const updated = { ...user, stats: newStats };
          await storageService.saveUserProfile(updated);
      }

    } catch (e) {
      notify("Erreur de connexion.", "error");
    } finally {
      setIsStreaming(false);
    }
  };

  const handleSend = () => { if (input.trim()) processMessage(input); };
  
  const handleNextClick = async () => {
      const allowed = await storageService.canRequest(user.id);
      if(!allowed) {
          notify("Crédit insuffisant.", "error");
          onShowPayment();
          return;
      }
      setNextLessonInput(((user.stats.lessonsCompleted || 0) + 1).toString());
      setShowNextInput(true);
  };

  const confirmNextLesson = () => {
      if (nextLessonInput.trim()) {
          processMessage(`Commence la Leçon ${nextLessonInput}`, true); 
          setShowNextInput(false);
      }
  };

  useEffect(() => { scrollRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages, isStreaming]);

  return (
    <div className="flex flex-col h-[100dvh] bg-[#F0F2F5] dark:bg-[#0B0F19] font-sans transition-colors duration-300 overflow-hidden" onClick={() => setShowTopMenu(false)}>
      
      {/* --- HEADER --- */}
      <header className="fixed top-0 left-0 w-full z-30 bg-white/80 dark:bg-[#131825]/90 backdrop-blur-md border-b border-slate-200 dark:border-slate-800 shadow-sm safe-top">
        <div className="max-w-5xl mx-auto px-4 h-16 flex items-center justify-between">
            <div className="flex items-center gap-3 flex-1">
                <button onClick={onExit} className="p-2 -ml-2 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-full transition-colors shrink-0">
                    <ArrowLeft className="w-6 h-6" />
                </button>
                <div className="relative">
                    <button 
                        onClick={(e) => { e.stopPropagation(); setShowTopMenu(!showTopMenu); }}
                        className="flex items-center gap-1.5 bg-slate-100 dark:bg-slate-800 px-3 py-1.5 rounded-full border border-slate-200 dark:border-slate-700 shadow-sm hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
                    >
                        <span className="text-xl leading-none">{userFlag}</span>
                        <span className="text-xs font-black text-indigo-600 dark:text-indigo-400 uppercase">{progressData.currentLevel}</span>
                        <ChevronDown className={`w-3 h-3 text-slate-400 transition-transform ${showTopMenu ? 'rotate-180' : ''}`} />
                    </button>
                    {showTopMenu && (
                        <div className="absolute top-full left-0 mt-2 w-48 bg-white dark:bg-slate-800 rounded-xl shadow-xl border border-slate-100 dark:border-slate-700 overflow-hidden z-50 animate-fade-in-up">
                            <button onClick={() => handleMenuAction(onStartPractice)} className="w-full text-left px-4 py-3 hover:bg-slate-50 dark:hover:bg-slate-700/50 flex items-center gap-2 text-sm font-bold text-slate-700 dark:text-slate-200"><MessageCircle className="w-4 h-4 text-indigo-500" /> Dialogue</button>
                            <button onClick={() => handleMenuAction(onStartExercise)} className="w-full text-left px-4 py-3 hover:bg-slate-50 dark:hover:bg-slate-700/50 flex items-center gap-2 text-sm font-bold text-slate-700 dark:text-slate-200"><Brain className="w-4 h-4 text-emerald-500" /> Exercices</button>
                            <button onClick={handleVoiceCallClick} className="w-full text-left px-4 py-3 flex items-center gap-2 text-sm font-bold hover:bg-slate-50 dark:hover:bg-slate-700/50 text-slate-700 dark:text-slate-200"><Phone className="w-4 h-4 text-purple-500" /> Live Teacher</button>
                            <div className="h-px bg-slate-100 dark:bg-slate-700 mx-2 my-1"></div>
                            <button onClick={onChangeCourse} className="w-full text-left px-4 py-3 hover:bg-red-50 dark:hover:bg-red-900/10 flex items-center gap-2 text-xs font-bold text-red-500"><Repeat className="w-3.5 h-3.5" /> Changer Cours</button>
                        </div>
                    )}
                </div>
            </div>

            <div className="flex flex-col items-center justify-center shrink-0">
                <h1 className="text-xs font-black text-slate-800 dark:text-white uppercase tracking-widest leading-tight mb-0.5">
                    {currentLessonTitle}
                </h1>
                <div 
                    onClick={onShowPayment} 
                    className={`flex items-center gap-1 cursor-pointer transition-all duration-500 ${
                        isLowCredits 
                        ? 'animate-pulse text-red-600 bg-red-100 dark:bg-red-900/30 px-2 rounded-full ring-2 ring-red-500 shadow-[0_0_15px_rgba(239,68,68,0.5)] scale-105' 
                        : 'hover:scale-105'
                    }`}
                >
                    {isLowCredits ? <AlertTriangle className="w-3 h-3" /> : <Zap className="w-3 h-3 text-amber-500 fill-amber-500" />}
                    <span className={`text-[10px] font-bold ${isLowCredits ? 'text-red-600 dark:text-red-400' : 'text-amber-600 dark:text-amber-400'}`}>
                        {user.credits} Crédits
                    </span>
                </div>
            </div>

            <div className="flex items-center justify-end gap-3 flex-1">
                <button onClick={toggleTheme} className="p-2 text-slate-400 hover:text-indigo-600 rounded-full transition-colors">
                    {isDarkMode ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
                </button>
                <button onClick={onShowProfile} className="relative group flex items-center gap-2">
                    <img src={`https://api.dicebear.com/9.x/micah/svg?seed=${user.username}`} alt="User" className="w-9 h-9 rounded-full bg-slate-200 dark:bg-slate-800 shadow-md border border-white dark:border-slate-600"/>
                </button>
            </div>
        </div>
      </header>

      {/* --- CHAT AREA --- */}
      <main className="flex-1 overflow-y-auto pt-16 pb-40 px-4 md:px-6 space-y-6 scrollbar-hide relative">
        <div className="max-w-3xl mx-auto space-y-6">
            {messages.map((msg, idx) => (
            <div key={msg.id || idx} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'} animate-slide-up group`}>
                {msg.role === 'model' && (
                    <div className="w-10 h-10 rounded-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 flex items-center justify-center mr-3 mt-1 shrink-0 overflow-hidden shadow-sm">
                        <img src={TEACHER_AVATAR} className="w-full h-full object-cover p-1" />
                    </div>
                )}
                
                <div className={`max-w-[90%] md:max-w-[80%] p-5 rounded-2xl text-sm leading-relaxed shadow-sm transition-all duration-200 ${
                    msg.role === 'user' 
                    ? 'bg-indigo-600 text-white rounded-tr-sm shadow-indigo-500/20' 
                    : 'bg-white dark:bg-[#131825] text-slate-800 dark:text-slate-200 border border-slate-200 dark:border-slate-800 rounded-tl-sm'
                }`}>
                    <MarkdownRenderer 
                        content={msg.text.replace(/\[Leçon \d+\]/g, '')} 
                        onPlayAudio={(text) => playMessageAudio(text, msg.id + text)} 
                    />
                    
                    {msg.role === 'model' && (
                        <div className="mt-3 pt-3 border-t border-slate-100 dark:border-slate-800 flex justify-end">
                            <button 
                                onClick={() => speakingMessageId === msg.id ? stopSpeaking() : playMessageAudio(msg.text, msg.id)}
                                className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-bold transition-all ${speakingMessageId === msg.id ? 'bg-indigo-100 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400' : 'bg-slate-100 dark:bg-slate-800 text-slate-500 hover:text-indigo-600 dark:hover:text-indigo-400'}`}
                                disabled={isLoadingAudio && speakingMessageId !== msg.id}
                            >
                                {isLoadingAudio && speakingMessageId === msg.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : speakingMessageId === msg.id ? <StopCircle className="w-3.5 h-3.5" /> : <Volume2 className="w-3.5 h-3.5" />}
                                {speakingMessageId === msg.id ? 'Arrêter' : 'Écouter'}
                            </button>
                        </div>
                    )}
                </div>
            </div>
            ))}
            
            {isStreaming && (
                <div className="flex justify-start">
                    <div className="w-10 h-10 mr-3"></div>
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

      {/* --- FOOTER --- */}
      <footer className="fixed bottom-0 left-0 w-full bg-white/95 dark:bg-[#131825]/95 backdrop-blur-lg border-t border-slate-200 dark:border-slate-800 safe-bottom z-30 shadow-2xl">
        <div className="max-w-3xl mx-auto p-4 flex flex-col gap-3">
            
            {/* PROGRESS */}
            <div className="flex items-center justify-between gap-3 px-2">
                <span className="text-[10px] font-black text-indigo-500 dark:text-indigo-400 uppercase min-w-[30px]">{progressData.currentLevel}</span>
                <div className="flex-1 h-3 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden relative border border-slate-200 dark:border-slate-700">
                    <div className="h-full bg-gradient-to-r from-indigo-500 to-purple-600 transition-all duration-1000 ease-out" style={{ width: `${progressData.percentage}%` }} />
                    <div className="absolute inset-0 flex items-center justify-center">
                        <span className="text-[8px] font-bold text-slate-500 dark:text-slate-400 bg-white/50 dark:bg-black/50 px-1.5 rounded-full backdrop-blur-sm">{progressData.percentage}%</span>
                    </div>
                </div>
                <span className="text-[10px] font-black text-slate-400 uppercase min-w-[30px] text-right">{progressData.nextLevel}</span>
            </div>

            <div className={`flex items-end gap-2 bg-slate-100 dark:bg-slate-800 p-2 rounded-[1.5rem] border transition-all shadow-inner ${isLowCredits ? 'border-red-500/50' : 'border-transparent focus-within:border-indigo-500/30'}`}>
                
                {/* MAGNIFICENT GLOWING PHONE BUTTON */}
                <button 
                    onClick={handleVoiceCallClick}
                    className="h-10 w-10 shrink-0 rounded-full flex items-center justify-center bg-gradient-to-br from-indigo-500 to-purple-600 text-white shadow-[0_0_20px_rgba(99,102,241,0.5)] animate-pulse hover:scale-110 transition-transform active:scale-95 border-2 border-white/20"
                    title="Démarrer Appel Vocal"
                >
                    <Phone className="w-5 h-5 fill-current" />
                </button>

                <textarea
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); }}}
                    placeholder={isLowCredits ? "Rechargez pour parler..." : "Message..."}
                    className="flex-1 bg-transparent border-none outline-none text-slate-800 dark:text-white text-sm px-2 resize-none max-h-32 placeholder:text-slate-400 py-2.5 disabled:opacity-50 disabled:cursor-not-allowed"
                    rows={1}
                    style={{ minHeight: '40px' }}
                    disabled={isLowCredits}
                />
                
                {input.trim().length === 0 ? (
                    showNextInput ? (
                        <div className="h-10 flex items-center gap-1 bg-white dark:bg-slate-900 rounded-full px-1 border border-indigo-500/30 animate-fade-in shadow-sm">
                            <span className="text-[10px] font-bold text-slate-400 uppercase pl-2">Leçon</span>
                            <input
                                type="number"
                                value={nextLessonInput}
                                onChange={(e) => setNextLessonInput(e.target.value)}
                                className="w-10 bg-transparent font-black text-indigo-600 dark:text-indigo-400 outline-none text-center text-sm"
                                autoFocus
                                onKeyDown={(e) => { if(e.key === 'Enter') confirmNextLesson(); }}
                            />
                            <button onClick={confirmNextLesson} className="p-1.5 bg-indigo-600 rounded-full text-white hover:bg-indigo-700 transition-colors"><Check size={14}/></button>
                            <button onClick={() => setShowNextInput(false)} className="p-1.5 text-slate-400 hover:text-red-500 transition-colors"><X size={14}/></button>
                        </div>
                    ) : (
                        <button 
                            onClick={handleNextClick} 
                            disabled={isStreaming} 
                            className="h-10 px-4 bg-emerald-500 hover:bg-emerald-600 text-white rounded-full font-bold text-xs shadow-md transition-all active:scale-95 flex items-center gap-1.5 shrink-0 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            Suivant <ArrowRight className="w-3.5 h-3.5" />
                        </button>
                    )
                ) : (
                    <button 
                        onClick={handleSend} 
                        disabled={isStreaming} 
                        className="h-10 w-10 bg-indigo-600 hover:bg-indigo-700 text-white rounded-full shadow-md transition-all active:scale-95 flex items-center justify-center shrink-0 disabled:opacity-50 disabled:cursor-not-allowed"
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
