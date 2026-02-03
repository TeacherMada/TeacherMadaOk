
import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Send, Menu, ArrowRight, Phone, Dumbbell, Brain, Sparkles, X, MicOff, Volume2, Lightbulb, Zap, BookOpen, MessageCircle, Mic, StopCircle, ArrowLeft, Sun, Moon, User, Play, Loader2 } from 'lucide-react';
import { UserProfile, ChatMessage, LearningSession } from '../types';
import { sendMessageStream, generateNextLessonPrompt, generateSpeech } from '../services/geminiService';
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
  onShowPayment: () => void;
}

// Helper for language codes
const getLangCode = (langName: string) => {
    if (langName.includes('Anglais')) return 'en-US';
    if (langName.includes('Français')) return 'fr-FR';
    if (langName.includes('Chinois')) return 'zh-CN';
    if (langName.includes('Espagnol')) return 'es-ES';
    if (langName.includes('Allemand')) return 'de-DE';
    return 'fr-FR'; // Default
};

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
  
  const [isDarkMode, setIsDarkMode] = useState(() => localStorage.getItem('tm_theme') === 'dark');
  
  // Audio State
  const [speakingMessageId, setSpeakingMessageId] = useState<string | null>(null);
  const [audioContext, setAudioContext] = useState<AudioContext | null>(null);
  const [currentSource, setCurrentSource] = useState<AudioBufferSourceNode | null>(null);
  const [isLoadingAudio, setIsLoadingAudio] = useState(false);

  // Sync theme
  const toggleTheme = () => {
      const newMode = !isDarkMode;
      setIsDarkMode(newMode);
      document.documentElement.classList.toggle('dark', newMode);
      localStorage.setItem('tm_theme', newMode ? 'dark' : 'light');
  };

  // Initialize Audio Context on first user interaction (browser policy)
  useEffect(() => {
      const initAudio = () => {
          if (!audioContext) {
              const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
              setAudioContext(ctx);
          }
      };
      window.addEventListener('click', initAudio, { once: true });
      return () => window.removeEventListener('click', initAudio);
  }, [audioContext]);

  // Lesson Progress Logic
  const currentLessonNum = (user.stats.lessonsCompleted || 0) + 1;
  const progressPercent = Math.min((messages.length / 20) * 100, 100);

  // --- GEMINI HIGH QUALITY TTS ---
  const stopSpeaking = () => {
      if (currentSource) {
          try { currentSource.stop(); } catch (e) {}
          setCurrentSource(null);
      }
      setSpeakingMessageId(null);
      setIsLoadingAudio(false);
  };

  const playMessageAudio = async (text: string, id: string) => {
      // If already playing this message, stop it
      if (speakingMessageId === id) {
          stopSpeaking();
          return;
      }

      // Stop any other audio
      stopSpeaking();
      setIsLoadingAudio(true);
      setSpeakingMessageId(id);

      try {
          // Clean text for TTS
          const cleanText = text
            .replace(/[#*`_]/g, '') 
            .replace(/Lesona \d+/gi, '')
            .replace(/Tanjona|Vocabulaire|Grammaire|Pratique/gi, '');

          // Call Gemini TTS Service
          const audioBuffer = await generateSpeech(cleanText);
          
          if (!audioBuffer || !audioContext) {
              throw new Error("Impossible de générer l'audio");
          }

          // Decode and Play
          const decodedBuffer = await audioContext.decodeAudioData(audioBuffer);
          const source = audioContext.createBufferSource();
          source.buffer = decodedBuffer;
          source.connect(audioContext.destination);
          
          source.onended = () => {
              setSpeakingMessageId(null);
              setCurrentSource(null);
          };

          source.start(0);
          setCurrentSource(source);

      } catch (e) {
          console.error("Audio Error", e);
          notify("Erreur lecture audio", "error");
          setSpeakingMessageId(null);
      } finally {
          setIsLoadingAudio(false);
      }
  };

  // -------------------

  const processMessage = async (text: string, isAuto: boolean = false) => {
    if (isStreaming) return;
    
    // --- CREDIT CHECK ---
    const canProceed = await storageService.checkAndConsumeCredit(user.id);
    if (!canProceed) {
        onShowPayment();
        return;
    }
    
    const updatedUser = await storageService.getUserById(user.id);
    if (updatedUser) onUpdateUser(updatedUser);
    // --------------------

    const userMsg: ChatMessage = { 
        id: Date.now().toString(), 
        role: 'user', 
        text: isAuto ? `➡️ Leçon ${currentLessonNum} : La suite SVP.` : text, 
        timestamp: Date.now() 
    };
    
    const newHistory = [...messages, userMsg];
    setMessages(newHistory);
    setInput('');
    setIsStreaming(true);

    try {
      const promptToSend = isAuto ? generateNextLessonPrompt(user) : text;
      
      const stream = sendMessageStream(promptToSend, user, messages);
      let fullText = "";
      
      const aiMsgId = (Date.now() + 1).toString();
      const initialAiMsg: ChatMessage = { id: aiMsgId, role: 'model', text: "", timestamp: Date.now() };
      setMessages(prev => [...prev, initialAiMsg]);

      for await (const chunk of stream) {
        if (chunk) {
            fullText += chunk;
            setMessages(prev => prev.map(m => m.id === aiMsgId ? { ...m, text: fullText } : m));
            // Scroll only if near bottom to prevent jumping while reading? 
            // For now, always scroll
            scrollRef.current?.scrollIntoView({ behavior: 'smooth' });
        }
      }
      
      const finalHistory: ChatMessage[] = [...newHistory, { id: aiMsgId, role: 'model', text: fullText, timestamp: Date.now() }];
      storageService.saveSession({ ...session, messages: finalHistory, progress: progressPercent });
      
      const newXp = user.stats.xp + 10; 
      const xpUser = { ...user, stats: { ...user.stats, xp: newXp } };
      await storageService.saveUserProfile(xpUser);
      onUpdateUser(xpUser);

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

  // Extract flag from targetLanguage string
  const getFlag = (langStr: string) => {
      const match = langStr.match(/[\uD800-\uDBFF][\uDC00-\uDFFF]/);
      return match ? match[0] : '🌐';
  };

  return (
    <div className="flex flex-col h-[100dvh] bg-[#F0F2F5] dark:bg-[#0B0F19] font-sans transition-colors duration-300 overflow-hidden">
      
      {/* --- MOBILE-FIRST HEADER --- */}
      <header className="sticky top-0 z-30 bg-white/80 dark:bg-[#131825]/90 backdrop-blur-md border-b border-slate-200 dark:border-slate-800 shadow-sm safe-top transition-colors shrink-0">
        <div className="max-w-5xl mx-auto px-4 h-16 flex items-center justify-between">
            
            {/* LEFT: Flag + Level */}
            <div className="flex items-center gap-3 flex-1">
                <button onClick={onExit} className="p-2 -ml-2 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-full transition-colors shrink-0">
                    <ArrowLeft className="w-6 h-6" />
                </button>
                
                <div className="flex items-center gap-1.5 bg-slate-100 dark:bg-slate-800 px-3 py-1.5 rounded-full border border-slate-200 dark:border-slate-700 shadow-sm">
                    <span className="text-xl leading-none">{getFlag(user.preferences?.targetLanguage || '')}</span>
                    <div className="h-4 w-px bg-slate-300 dark:bg-slate-600 mx-1"></div>
                    <span className="text-xs font-black text-indigo-600 dark:text-indigo-400 uppercase">{user.preferences?.level}</span>
                </div>
            </div>

            {/* CENTER: Lesson + Credits */}
            <div className="flex flex-col items-center justify-center shrink-0">
                <h1 className="text-[10px] font-black text-slate-400 uppercase tracking-widest leading-tight">
                    Leçon {currentLessonNum}
                </h1>
                <button 
                    onClick={onShowPayment} 
                    className="flex items-center gap-1 mt-0.5 hover:scale-105 transition-transform"
                >
                    <Zap className="w-3.5 h-3.5 text-amber-500 fill-amber-500" />
                    <span className="text-sm font-black text-amber-500">
                        {user.freeUsage.count < 3 ? `${3 - user.freeUsage.count} Free` : user.credits}
                    </span>
                </button>
            </div>

            {/* RIGHT: Theme + Avatar */}
            <div className="flex items-center justify-end gap-2 flex-1">
                <button
                  onClick={toggleTheme}
                  className="p-2 text-slate-400 hover:text-indigo-600 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                >
                  {isDarkMode ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
                </button>

                <button 
                    onClick={onShowProfile} 
                    className="relative group"
                >
                    <div className="w-9 h-9 bg-indigo-600 text-white rounded-full flex items-center justify-center font-bold text-sm shadow-md group-hover:scale-105 transition-transform ring-2 ring-white dark:ring-slate-900">
                        {user.username.charAt(0).toUpperCase()}
                    </div>
                </button>
            </div>
        </div>
      </header>

      {/* Chat Area - Added pb-32 to prevent content hiding behind fixed footer */}
      <main className="flex-1 overflow-y-auto p-4 md:p-6 space-y-6 scrollbar-hide relative pb-32">
        <div className="max-w-3xl mx-auto space-y-6">
            {messages.length === 0 && (
                <div className="flex flex-col items-center justify-center py-20 opacity-60">
                    <div className="w-24 h-24 bg-white dark:bg-slate-800 rounded-[2rem] flex items-center justify-center mb-6 shadow-xl border border-slate-100 dark:border-slate-700">
                        <img src="https://i.ibb.co/B2XmRwmJ/logo.png" className="w-14 h-14 object-contain" />
                    </div>
                    <h3 className="text-xl font-bold text-slate-800 dark:text-white mb-2">Bonjour, {user.username} !</h3>
                    <p className="text-slate-500 dark:text-slate-400 text-sm text-center max-w-xs">Prêt pour la leçon {currentLessonNum} en {user.preferences?.targetLanguage} ?</p>
                    <div className="flex flex-wrap justify-center gap-2 mt-6">
                        <button onClick={() => processMessage("Commence la leçon")} className="px-4 py-2 bg-indigo-600 text-white rounded-full text-xs font-bold shadow-md hover:bg-indigo-700 transition-colors">🚀 Démarrer la leçon {currentLessonNum}</button>
                    </div>
                </div>
            )}
            
            {messages.map((msg, idx) => (
            <div key={msg.id || idx} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'} animate-slide-up group`}>
                {msg.role === 'model' && (
                    <div className="w-8 h-8 rounded-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 flex items-center justify-center mr-3 mt-1 shrink-0 overflow-hidden shadow-sm">
                        <img src="https://i.ibb.co/B2XmRwmJ/logo.png" className="w-5 h-5 object-contain" />
                    </div>
                )}
                
                <div className={`max-w-[90%] md:max-w-[80%] p-5 rounded-2xl text-sm leading-relaxed shadow-sm transition-all duration-200 ${
                    msg.role === 'user' 
                    ? 'bg-indigo-600 text-white rounded-tr-sm shadow-indigo-500/20' 
                    : 'bg-white dark:bg-[#131825] text-slate-800 dark:text-slate-200 border border-slate-200 dark:border-slate-800 rounded-tl-sm'
                }`}>
                    <MarkdownRenderer 
                        content={msg.text} 
                        onPlayAudio={(text) => playMessageAudio(text, msg.id + text)} 
                    />
                    
                    {/* Audio Playback Control for AI Messages */}
                    {msg.role === 'model' && (
                        <div className="mt-3 pt-3 border-t border-slate-100 dark:border-slate-800 flex justify-end">
                            <button 
                                onClick={() => speakingMessageId === msg.id ? stopSpeaking() : playMessageAudio(msg.text, msg.id)}
                                className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-bold transition-all ${speakingMessageId === msg.id ? 'bg-indigo-100 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400' : 'bg-slate-100 dark:bg-slate-800 text-slate-500 hover:text-indigo-600 dark:hover:text-indigo-400'}`}
                                disabled={isLoadingAudio && speakingMessageId !== msg.id}
                            >
                                {isLoadingAudio && speakingMessageId === msg.id ? (
                                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                ) : (
                                    speakingMessageId === msg.id ? <StopCircle className="w-3.5 h-3.5" /> : <Volume2 className="w-3.5 h-3.5" />
                                )}
                                {speakingMessageId === msg.id ? 'Arrêter' : 'Écouter'}
                            </button>
                        </div>
                    )}
                </div>
            </div>
            ))}
            
            {isStreaming && (
                <div className="flex justify-start">
                    <div className="w-8 h-8 mr-3"></div>
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
            
            {/* Enhanced Suggestions (Scrollable) */}
            {!input && messages.length > 0 && !isStreaming && (
                <div className="flex gap-2 mb-3 overflow-x-auto scrollbar-hide pb-1">
                    <button onClick={onStartPractice} className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-50 dark:bg-indigo-900/20 text-indigo-600 dark:text-indigo-400 rounded-lg text-xs font-bold border border-indigo-100 dark:border-indigo-800 hover:bg-indigo-100 dark:hover:bg-indigo-900/40 transition-all whitespace-nowrap">
                        <MessageCircle className="w-3.5 h-3.5" /> Dialogue
                    </button>
                    <button onClick={onStartExercise} className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 dark:text-emerald-400 rounded-lg text-xs font-bold border border-emerald-100 dark:border-emerald-800 hover:bg-emerald-100 dark:hover:bg-emerald-900/40 transition-all whitespace-nowrap">
                        <Brain className="w-3.5 h-3.5" /> Quiz
                    </button>
                    <button onClick={() => processMessage("Explique la grammaire ici")} className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 rounded-lg text-xs font-bold border border-transparent hover:border-slate-300 dark:hover:border-slate-600 transition-all whitespace-nowrap">
                        <BookOpen className="w-3.5 h-3.5" /> Grammaire
                    </button>
                </div>
            )}

            <div className="flex items-end gap-2 bg-slate-100 dark:bg-slate-800 p-2 rounded-[1.5rem] border border-transparent focus-within:border-indigo-500/30 focus-within:bg-white dark:focus-within:bg-slate-900 transition-all shadow-inner">
                <button className="h-10 w-10 shrink-0 rounded-full bg-slate-200 dark:bg-slate-700 text-slate-500 dark:text-slate-400 hover:text-indigo-600 hover:bg-indigo-100 dark:hover:bg-indigo-900/30 flex items-center justify-center transition-all opacity-50 cursor-not-allowed">
                    <Phone className="w-5 h-5" />
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
