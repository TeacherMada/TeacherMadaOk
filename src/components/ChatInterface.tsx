import React, { useState, useRef, useEffect, useMemo } from 'react';
import { Send, Phone, ArrowRight, X, Mic, Volume2, ArrowLeft, Sun, Moon, Zap, ChevronDown, Repeat, MessageCircle, Brain, Target, Star, Loader2, StopCircle, MicOff, Wifi, WifiOff, Lock, Keyboard } from 'lucide-react';
import { UserProfile, ChatMessage, LearningSession } from '../types';
import { sendMessageStream, generateNextLessonPrompt, generateSpeech } from '../services/geminiService';
import { storageService } from '../services/storageService';
import MarkdownRenderer from './MarkdownRenderer';
import VoiceCall from './VoiceCall';

interface Props {
  user: UserProfile;
  session: LearningSession;
  onShowProfile: () => void;
  onExit: () => void;
  onUpdateUser: (u: UserProfile) => void;
  onStartPractice: () => void;
  onStartExercise: () => void;
  notify: (m: string, t?: string) => void;
  onShowPayment: () => void;
}

// Helper to convert Raw PCM to AudioBuffer
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
  notify, 
  onShowPayment
}) => {
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<ChatMessage[]>(session.messages);
  const [isStreaming, setIsStreaming] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  
  const [showVoiceCall, setShowVoiceCall] = useState(false);
  
  // Initialize Lesson Title from User Stats or Default
  const [currentLessonTitle, setCurrentLessonTitle] = useState(() => {
      const lastAiMessage = [...session.messages].reverse().find(m => m.role === 'model');
      if (lastAiMessage) {
          const match = lastAiMessage.text.match(/(?:Leçon|Lesson)\s+(\d+)/i);
          if (match) return `Leçon ${match[1]}`;
      }
      const lessonNum = (user.stats.lessonsCompleted || 0) + 1;
      return `Leçon ${lessonNum}`;
  });
  
  const [showTopMenu, setShowTopMenu] = useState(false);
  
  const [isDarkMode, setIsDarkMode] = useState(() => localStorage.getItem('tm_theme') === 'dark');
  
  // Audio Playback State (TTS)
  const [speakingMessageId, setSpeakingMessageId] = useState<string | null>(null);
  const [audioContext, setAudioContext] = useState<AudioContext | null>(null);
  const [currentSource, setCurrentSource] = useState<AudioBufferSourceNode | null>(null);
  const [isLoadingAudio, setIsLoadingAudio] = useState(false);

  const TEACHER_AVATAR = "https://i.ibb.co/B2XmRwmJ/logo.png";
  const MIN_LESSONS_FOR_CALL = 0;

  const toggleTheme = () => {
      const newMode = !isDarkMode;
      setIsDarkMode(newMode);
      document.documentElement.classList.toggle('dark', newMode);
      localStorage.setItem('tm_theme', newMode ? 'dark' : 'light');
  };

  // Initialize Playback Audio Context
  useEffect(() => {
      const initAudio = () => {
          if (!audioContext) {
              const ctx = new (window.AudioContext || (window as any).webkitAudioContext)({sampleRate: 24000});
              setAudioContext(ctx);
          }
      };
      window.addEventListener('click', initAudio, { once: true });
      return () => window.removeEventListener('click', initAudio);
  }, [audioContext]);

  // Lesson Title Update
  useEffect(() => {
      const lastAiMessage = [...messages].reverse().find(m => m.role === 'model');
      if (lastAiMessage) {
          const match = lastAiMessage.text.match(/(?:Leçon|Lesson)\s+(\d+)/i);
          if (match) {
              const newTitle = `Leçon ${match[1]}`;
              if (newTitle !== currentLessonTitle) setCurrentLessonTitle(newTitle);
          }
      }
  }, [messages, currentLessonTitle]);

  // --- TTS PLAYBACK ---
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
      if (!(await storageService.canRequest(user.id))) {
          notify("Crédits insuffisants pour le TTS.", "error");
          return;
      }
      stopSpeaking();
      setIsLoadingAudio(true);
      setSpeakingMessageId(id);

      try {
          const cleanText = text.replace(/[#*`_]/g, '').replace(/\[Leçon \d+\]/gi, '');
          const pcmBuffer = await generateSpeech(cleanText);
          const updatedUser = await storageService.getUserById(user.id);
          if (updatedUser) onUpdateUser(updatedUser);

          if (!pcmBuffer || !audioContext) throw new Error("Audio init failed");

          const audioBuffer = pcmToAudioBuffer(new Uint8Array(pcmBuffer), audioContext, 24000);
          const source = audioContext.createBufferSource();
          source.buffer = audioBuffer;
          source.connect(audioContext.destination);
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

  const handleVoiceCallClick = async () => {
      if ((user.stats.lessonsCompleted || 0) < MIN_LESSONS_FOR_CALL) {
          notify(`Complétez ${MIN_LESSONS_FOR_CALL - (user.stats.lessonsCompleted || 0)} leçon(s) de plus pour débloquer l'appel !`, "error");
          return;
      }
      if (!(await storageService.canRequest(user.id))) {
          notify("Crédits insuffisants pour l'appel.", "error");
          onShowPayment();
          return;
      }
      setShowVoiceCall(true);
  };

  // --- PROGRESS ---
  const progressData = useMemo(() => {
      const levels = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2', 'HSK 1', 'HSK 2', 'HSK 3', 'HSK 4', 'HSK 5', 'HSK 6'];
      const currentLevel = user.preferences?.level || 'A1';
      const currentIndex = levels.indexOf(currentLevel);
      const nextLevel = currentIndex < levels.length - 1 ? levels[currentIndex + 1] : 'Expert';
      let lessonNum = 1;
      const match = currentLessonTitle.match(/(\d+)/);
      if (match) lessonNum = parseInt(match[1], 10);
      else lessonNum = (user.stats.lessonsCompleted || 0) + 1;
      const percentage = Math.min(lessonNum * 2, 100);
      return { percentage, nextLevel, currentLevel };
  }, [currentLessonTitle, user.preferences?.level, user.stats.lessonsCompleted]);

  // --- TEXT CHAT ---
  const processMessage = async (text: string, isAuto: boolean = false) => {
    if (isStreaming) return;
    const canProceed = await storageService.canRequest(user.id);
    if (!canProceed) {
        onShowPayment();
        return;
    }
    const userDisplayMsg = isAuto ? "Suivant" : text;
    const promptToSend = isAuto ? generateNextLessonPrompt(user) : text;
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
      
      const updatedUser = await storageService.getUserById(user.id);
      if (updatedUser) onUpdateUser(updatedUser);
      storageService.saveSession({ ...session, messages: [...newHistory, { id: aiMsgId, role: 'model', text: fullText, timestamp: Date.now() }], progress: (messages.length / 20) * 100 });
      if (isAuto) {
          const newStats = { ...user.stats, lessonsCompleted: (user.stats.lessonsCompleted || 0) + 1 };
          const updated = { ...(updatedUser || user), stats: newStats };
          await storageService.saveUserProfile(updated);
          onUpdateUser(updated);
      }
    } catch (e) {
      notify("Connexion instable.", "error");
    } finally {
      setIsStreaming(false);
    }
  };

  const handleSend = () => { if (input.trim()) processMessage(input); };
  useEffect(() => { scrollRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages, isStreaming]);

  return (
    <div className="flex flex-col h-[100dvh] bg-[#F0F2F5] dark:bg-[#0B0F19] font-sans transition-colors duration-300 overflow-hidden" onClick={() => setShowTopMenu(false)}>
      
      {/* Voice Call Overlay */}
      {showVoiceCall && (
          <VoiceCall 
              user={user} 
              onClose={() => setShowVoiceCall(false)} 
              onUpdateUser={onUpdateUser} 
              notify={notify}
              onShowPayment={onShowPayment}
          />
      )}

      {/* --- FIXED HEADER --- */}
      <header className="fixed top-0 left-0 w-full z-30 bg-white/80 dark:bg-[#131825]/90 backdrop-blur-md border-b border-slate-200 dark:border-slate-800 shadow-sm safe-top transition-colors">
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
                        <span className="text-xl leading-none">{user.preferences?.targetLanguage?.split(' ')[1] || '🇨🇵'}</span>
                        <div className="h-4 w-px bg-slate-300 dark:bg-slate-600 mx-1"></div>
                        <span className="text-xs font-black text-indigo-600 dark:text-indigo-400 uppercase">{user.preferences?.level}</span>
                        <ChevronDown className={`w-3 h-3 text-slate-400 transition-transform ${showTopMenu ? 'rotate-180' : ''}`} />
                    </button>
                    {showTopMenu && (
                        <div className="absolute top-full left-0 mt-2 w-48 bg-white dark:bg-slate-800 rounded-xl shadow-xl border border-slate-100 dark:border-slate-700 overflow-hidden z-50 animate-fade-in-up">
                            <button onClick={onStartPractice} className="w-full text-left px-4 py-3 hover:bg-slate-50 dark:hover:bg-slate-700/50 flex items-center gap-2 text-sm font-bold text-slate-700 dark:text-slate-200"><MessageCircle className="w-4 h-4 text-indigo-500" /> Dialogue</button>
                            <button onClick={onStartExercise} className="w-full text-left px-4 py-3 hover:bg-slate-50 dark:hover:bg-slate-700/50 flex items-center gap-2 text-sm font-bold text-slate-700 dark:text-slate-200"><Brain className="w-4 h-4 text-emerald-500" /> Exercices</button>
                            
                            {/* LOCKED VOICE CALL BUTTON */}
                            <button 
                                onClick={handleVoiceCallClick} 
                                className={`w-full text-left px-4 py-3 flex items-center gap-2 text-sm font-bold transition-colors ${
                                    (user.stats.lessonsCompleted || 0) >= MIN_LESSONS_FOR_CALL 
                                    ? 'hover:bg-slate-50 dark:hover:bg-slate-700/50 text-slate-700 dark:text-slate-200' 
                                    : 'opacity-50 cursor-not-allowed bg-slate-50 dark:bg-slate-800/50 text-slate-400'
                                }`}
                            >
                                <Phone className="w-4 h-4 text-purple-500" /> 
                                Appel Vocal
                                {(user.stats.lessonsCompleted || 0) < MIN_LESSONS_FOR_CALL && <Lock className="w-3 h-3 ml-auto text-slate-400"/>}
                            </button>

                            <div className="h-px bg-slate-100 dark:bg-slate-700 mx-2 my-1"></div>
                            <button onClick={onExit} className="w-full text-left px-4 py-3 hover:bg-red-50 dark:hover:bg-red-900/10 flex items-center gap-2 text-xs font-bold text-red-500"><Repeat className="w-3.5 h-3.5" /> Changer Cours</button>
                        </div>
                    )}
                </div>
            </div>
            <div className="flex flex-col items-center justify-center shrink-0">
                <h1 className="text-[10px] font-black text-slate-400 uppercase tracking-widest leading-tight">{currentLessonTitle}</h1>
                <button onClick={onShowPayment} className="flex items-center gap-1 mt-0.5 hover:scale-105 transition-transform">
                    <Zap className="w-3.5 h-3.5 text-amber-500 fill-amber-500" />
                    <span className="text-sm font-black text-amber-500">{user.freeUsage.count < 3 ? `${3 - user.freeUsage.count} Free` : user.credits}</span>
                </button>
            </div>
            <div className="flex items-center justify-end gap-2 flex-1">
                <button onClick={toggleTheme} className="p-2 text-slate-400 hover:text-indigo-600 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors">{isDarkMode ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}</button>
                <button onClick={onShowProfile} className="relative group flex items-center gap-2">
                    <div className="hidden sm:flex flex-col items-end"><span className="text-xs font-bold text-slate-700 dark:text-slate-200">{user.vocabulary.length} Mots</span></div>
                    <img src={`https://api.dicebear.com/9.x/micah/svg?seed=${user.username}`} alt="User" className="w-9 h-9 rounded-full bg-slate-200 dark:bg-slate-800 shadow-md group-hover:scale-105 transition-transform border border-white dark:border-slate-600"/>
                </button>
            </div>
        </div>
      </header>

      {/* Chat Area */}
      <main className="flex-1 overflow-y-auto pt-16 pb-32 px-4 md:px-6 space-y-6 scrollbar-hide relative">
        <div className="max-w-3xl mx-auto space-y-6">
            {messages.length === 0 && (
                <div className="flex flex-col items-center justify-center py-20 opacity-60">
                    <div className="w-24 h-24 bg-white dark:bg-slate-800 rounded-[2rem] flex items-center justify-center mb-6 shadow-xl border border-slate-100 dark:border-slate-700">
                        <img src="https://i.ibb.co/B2XmRwmJ/logo.png" className="w-14 h-14 object-contain" />
                    </div>
                    <h3 className="text-xl font-bold text-slate-800 dark:text-white mb-2">Bonjour, {user.username} !</h3>
                    <p className="text-slate-500 dark:text-slate-400 text-sm text-center max-w-xs">Prêt pour {currentLessonTitle} en {user.preferences?.targetLanguage} ?</p>
                    <div className="flex flex-wrap justify-center gap-2 mt-6">
                        <button onClick={() => processMessage("Commence la leçon")} className="px-4 py-2 bg-indigo-600 text-white rounded-full text-xs font-bold shadow-md hover:bg-indigo-700 transition-colors">🚀 Démarrer {currentLessonTitle}</button>
                    </div>
                </div>
            )}
            
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
                
                {msg.role === 'user' && (
                    <div className="w-8 h-8 rounded-full bg-slate-200 dark:bg-slate-700 ml-3 mt-1 shrink-0 overflow-hidden shadow-sm border border-white dark:border-slate-600">
                        <img src={`https://api.dicebear.com/9.x/micah/svg?seed=${user.username}`} className="w-full h-full object-cover" />
                    </div>
                )}
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

      {/* Footer - FIXED POSITION */}
      <footer className="fixed bottom-0 left-0 w-full bg-white/95 dark:bg-[#131825]/95 backdrop-blur-lg border-t border-slate-200 dark:border-slate-800 safe-bottom z-30 shadow-2xl">
        <div className="max-w-3xl mx-auto p-4">
            
            {/* SMART PROGRESS STATS - Mobile First Layout */}
            {!input && messages.length > 0 && !isStreaming && (
                <div className="mb-3 px-1 animate-fade-in">
                    <div className="flex justify-between items-center mb-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                        <span className="flex-1 text-left">{progressData.currentLevel}</span>
                        <div className="flex items-center gap-1">
                            <Star className="w-3 h-3 text-yellow-400 fill-yellow-400" />
                            <span className="text-indigo-600 dark:text-indigo-400">{progressData.percentage}%</span>
                        </div>
                        <span className="flex-1 text-right">{progressData.nextLevel}</span>
                    </div>
                    <div className="h-1.5 w-full bg-slate-100 dark:bg-slate-700 rounded-full overflow-hidden">
                        <div 
                            className="h-full bg-gradient-to-r from-indigo-500 via-purple-500 to-indigo-500 bg-[length:200%_100%] animate-gradient"
                            style={{ width: `${progressData.percentage}%` }}
                        ></div>
                    </div>
                </div>
            )}

            <div className="flex items-end gap-2 bg-slate-100 dark:bg-slate-800 p-2 rounded-[1.5rem] border border-transparent focus-within:border-indigo-500/30 focus-within:bg-white dark:focus-within:bg-slate-900 transition-all shadow-inner">
                {/* LOCKED PHONE BUTTON */}
                <button 
                    onClick={handleVoiceCallClick}
                    className={`h-10 w-10 shrink-0 rounded-full flex items-center justify-center transition-all ${
                        (user.stats.lessonsCompleted || 0) >= MIN_LESSONS_FOR_CALL 
                        ? 'bg-slate-200 dark:bg-slate-700 text-slate-500 dark:text-slate-400 hover:text-indigo-600 hover:bg-indigo-100 dark:hover:bg-indigo-900/30' 
                        : 'bg-slate-100 dark:bg-slate-800 text-slate-300 dark:text-slate-600 cursor-not-allowed'
                    }`}
                >
                    {(user.stats.lessonsCompleted || 0) >= MIN_LESSONS_FOR_CALL ? <Phone className="w-5 h-5" /> : <Lock className="w-4 h-4"/>}
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
                    <button onClick={() => processMessage("", true)} disabled={isStreaming} className="h-10 px-4 bg-emerald-500 hover:bg-emerald-600 text-white rounded-full font-bold text-xs shadow-md transition-all active:scale-95 flex items-center gap-1.5 shrink-0">Suivant <ArrowRight className="w-3.5 h-3.5" /></button>
                ) : (
                    <button onClick={handleSend} disabled={isStreaming} className="h-10 w-10 bg-indigo-600 hover:bg-indigo-700 text-white rounded-full shadow-md transition-all active:scale-95 flex items-center justify-center shrink-0"><Send className="w-4 h-4 ml-0.5" /></button>
                )}
            </div>
        </div>
      </footer>
    </div>
  );
};

export default ChatInterface;