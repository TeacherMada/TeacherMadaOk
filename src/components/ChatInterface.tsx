
import React, { useState, useRef, useEffect, useMemo } from 'react';
import { Send, Phone, ArrowRight, X, Mic, Volume2, ArrowLeft, Sun, Moon, Zap, ChevronDown, ChevronUp, Repeat, MessageCircle, Brain, Target, Star, Loader2, StopCircle, AlertTriangle, Check, Play, BookOpen } from 'lucide-react';
import { UserProfile, ChatMessage, LearningSession, ExplanationLanguage } from '../types';
import { sendMessageStream, generateSpeech } from '../services/geminiService';
import { storageService } from '../services/storageService';
import { getFlagUrl } from '../constants';
import MarkdownRenderer from './MarkdownRenderer';

interface Props {
  user: UserProfile;
  session: LearningSession;
  onShowProfile: () => void;
  onExit: () => void;
  onUpdateUser: (u: UserProfile) => void;
  onStartPractice: () => void;
  onStartExercise: () => void;
  onStartVoiceCall: () => void; 
  notify: (m: string, t?: string) => void;
  onShowPayment: () => void;
  onChangeCourse: () => void;
}

const LOADING_PHRASES = [
  "TeacherMada réfléchit...",
  "Analyse de votre message...",
  "TeacherMada rédige la leçon...",
  "TeacherMada écrit...",
  "TeacherMada réfléchit encore...",
  "Vérification...",
  "Écrit..."
];

// Helper to convert Raw PCM to AudioBuffer
function pcmToAudioBuffer(data: Uint8Array, ctx: AudioContext, sampleRate: number = 30000) {
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
  user, session, onShowProfile, onExit, onUpdateUser, 
  onStartPractice, onStartExercise, onStartVoiceCall, 
  notify, onShowPayment, onChangeCourse
}) => {
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<ChatMessage[]>(session.messages);
  const [isStreaming, setIsStreaming] = useState(false);
  const [loadingText, setLoadingText] = useState(LOADING_PHRASES[0]);
  const scrollRef = useRef<HTMLDivElement>(null);
  
  const [speakingMessageId, setSpeakingMessageId] = useState<string | null>(null);
  const [audioContext, setAudioContext] = useState<AudioContext | null>(null);
  const [currentSource, setCurrentSource] = useState<AudioBufferSourceNode | null>(null);
  const [isLoadingAudio, setIsLoadingAudio] = useState(false);

  const [showNextInput, setShowNextInput] = useState(false);
  const [nextLessonInput, setNextLessonInput] = useState('');
  const [showStartButton, setShowStartButton] = useState(false);
  const [showTutorial, setShowTutorial] = useState(false);
  const [showTopMenu, setShowTopMenu] = useState(false);
  const [isDarkMode, setIsDarkMode] = useState(() => localStorage.getItem('tm_theme') === 'dark');

  const TEACHER_AVATAR = "https://i.ibb.co/B2XmRwmJ/logo.png";

  const currentLessonTitle = useMemo(() => {
      const lastAiMessage = [...messages].reverse().find(m => m.role === 'model');
      if (lastAiMessage) {
          const match = lastAiMessage.text.match(/(?:Leçon|Lesson)\s+(\d+)/i);
          if (match) return `Leçon ${match[1]}`;
      }
      return `Leçon ${(user.stats.lessonsCompleted || 0) + 1}`;
  }, [messages, user.stats.lessonsCompleted]);

  useEffect(() => {
      if (messages.length === 0) {
          const isMalagasy = user.preferences?.explanationLanguage === ExplanationLanguage.Malagasy;
          const targetLang = user.preferences?.targetLanguage;
          const level = user.preferences?.level;

          const welcomeText = isMalagasy
              ? `🎓 **Tonga soa eto amin'ny TeacherMada !**\n\nHianatra **${targetLang}** (Niveau ${level}) isika anio.\n\n**Ny fomba fiasako :**\n1. 📚 **Lesona Mazava** : Hanome lesona mifanaraka amin'ny Niveau anao aho.\n2. 🗣️ **Fanitsiana** : Hanitsy ny diso rehetra aho mba hivoaranao.\n3. 🚀 **Fampiharana** : Hanao fanazaran-tena isika.\n\nVonona ve ianao ?`
              : `🎓 **Bienvenue dans votre Espace d'Excellence.**\n\nVous êtes sur le point de maîtriser le **${targetLang}** (Niveau ${level}).\nJe suis **TeacherMada**, votre professeur personnel.\n\n**Ma méthode :**\n1. 📚 **Cours Structurés** : Des leçons claires et progressives.\n2. 🗣️ **Correction Active** : Je corrige chaque phrase pour vous perfectionner.\n3. 🚀 **Immersion** : Nous pratiquerons ensemble des cas réels.\n\nAppuyez sur **Commencer** pour lancer votre première leçon.`;

          const initialMsg: ChatMessage = {
              id: 'welcome_msg',
              role: 'model',
              text: welcomeText,
              timestamp: Date.now()
          };
          setMessages([initialMsg]);
          setShowStartButton(true);
      }
  }, []);

  useEffect(() => {
      const unsub = storageService.subscribeToUserUpdates((updated) => {
          if (updated.id === user.id) onUpdateUser(updated);
      });
      return () => unsub();
  }, [user.id, onUpdateUser]);

  const toggleTheme = () => {
      const newMode = !isDarkMode;
      setIsDarkMode(newMode);
      document.documentElement.classList.toggle('dark', newMode);
      localStorage.setItem('tm_theme', newMode ? 'dark' : 'light');
  };

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

  // Loading Text Cycle
  useEffect(() => {
    let interval: any;
    if (isStreaming) {
      setLoadingText(LOADING_PHRASES[0]);
      let index = 0;
      interval = setInterval(() => {
        index = (index + 1) % LOADING_PHRASES.length;
        setLoadingText(LOADING_PHRASES[index]);
      }, 2500);
    }
    return () => clearInterval(interval);
  }, [isStreaming]);

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
          notify("Crédit insuffisant.", "error");
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
          source.onended = () => { setSpeakingMessageId(null); setCurrentSource(null); };
          source.start(0);
          setCurrentSource(source);
      } catch (e) {
          notify("Erreur lecture ou Crédits épuisés", "error");
          setSpeakingMessageId(null);
      } finally {
          setIsLoadingAudio(false);
      }
  };

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
          notify("Il faut 5 crédits minimum pour l'appel vocal.", "error");
          onShowPayment();
          return;
      }
      onStartVoiceCall();
  };

  const progressData = useMemo(() => {
      const levels = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2', 'HSK 1', 'HSK 2', 'HSK 3', 'HSK 4', 'HSK 5', 'HSK 6'];
      const currentLevel = user.preferences?.level || 'A1';
      const currentIndex = levels.indexOf(currentLevel);
      const nextLevel = currentIndex < levels.length - 1 ? levels[currentIndex + 1] : 'Expert';
      const lessonNum = (user.stats.lessonsCompleted || 0) + 1;
      const percentage = Math.min((lessonNum / 50) * 100, 100);
      return { percentage: Math.round(percentage), nextLevel, currentLevel };
  }, [user.preferences?.level, user.stats.lessonsCompleted]);

  const userFlagUrl = useMemo(() => {
      const lang = user.preferences?.targetLanguage || '';
      return getFlagUrl(lang.split(' ')[0]);
  }, [user.preferences?.targetLanguage]);

  const isLowCredits = user.credits <= 0;

  const processMessage = async (text: string, isAuto: boolean = false) => {
    if (isStreaming) return;
    setShowStartButton(false);

    const canRequest = await storageService.canRequest(user.id);
    if (!canRequest) {
        notify("Crédits insuffisants, Achetez des crédits.", "error");
        onShowPayment();
        return;
    }

    const userMsg: ChatMessage = { id: Date.now().toString(), role: 'user', text, timestamp: Date.now() };
    const newHistory = [...messages, userMsg];
    setMessages(newHistory);
    setInput('');
    setIsStreaming(true);

    try {
      const stream = sendMessageStream(text, user, messages);
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
  const handleStartCourse = () => {
      const isMalagasy = user.preferences?.explanationLanguage === ExplanationLanguage.Malagasy;
      processMessage(isMalagasy ? "HANOMBOKA LESONA" : "COMMENCER");
  };

  const handleNextClick = async () => {
      const allowed = await storageService.canRequest(user.id);
      if(!allowed) { notify("Crédit insuffisant.", "error"); onShowPayment(); return; }
      setNextLessonInput(((user.stats.lessonsCompleted || 0) + 1).toString());
      setShowNextInput(true);
  };

  const confirmNextLesson = () => {
      if (nextLessonInput.trim()) {
          processMessage(`Commence la Leçon ${nextLessonInput}`, true); 
          setShowNextInput(false);
      }
  };

  useEffect(() => { scrollRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages, isStreaming, showStartButton, showTutorial]);

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
                        className="flex items-center gap-2 bg-slate-100 dark:bg-slate-800 px-3 py-1.5 rounded-full border border-slate-200 dark:border-slate-700 shadow-sm hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
                    >
                        <img src={userFlagUrl} alt="Flag" className="w-5 h-auto rounded-sm shadow-sm" />
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
                <div onClick={onShowPayment} className={`flex items-center gap-1 cursor-pointer transition-all duration-500 ${isLowCredits ? 'animate-pulse text-red-600 bg-red-100 dark:bg-red-900/30 px-2 rounded-full ring-2 ring-red-500 scale-105' : 'hover:scale-105'}`}>
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
                <div className={`max-w-[90%] md:max-w-[80%] p-5 rounded-2xl text-sm leading-relaxed shadow-sm transition-all duration-200 ${msg.role === 'user' ? 'bg-indigo-600 text-white rounded-tr-sm shadow-indigo-500/20' : 'bg-white dark:bg-[#131825] text-slate-800 dark:text-slate-200 border border-slate-200 dark:border-slate-800 rounded-tl-sm'}`}>
                    <MarkdownRenderer content={msg.text.replace(/\[Leçon \d+\]/g, '')} onPlayAudio={(text) => playMessageAudio(text, msg.id + text)} />
                    {msg.role === 'model' && (
                        <div className="mt-3 pt-3 border-t border-slate-100 dark:border-slate-800 flex justify-end">
                            <button onClick={() => speakingMessageId === msg.id ? stopSpeaking() : playMessageAudio(msg.text, msg.id)} className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-bold transition-all ${speakingMessageId === msg.id ? 'bg-indigo-100 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400' : 'bg-slate-100 dark:bg-slate-800 text-slate-500 hover:text-indigo-600 dark:hover:text-indigo-400'}`} disabled={isLoadingAudio && speakingMessageId !== msg.id}>
                                {isLoadingAudio && speakingMessageId === msg.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : speakingMessageId === msg.id ? <StopCircle className="w-3.5 h-3.5" /> : <Volume2 className="w-3.5 h-3.5" />}
                                {speakingMessageId === msg.id ? 'Arrêter' : 'Écouter'}
                            </button>
                        </div>
                    )}
                </div>
            </div>
            ))}
            
            {showStartButton && !isStreaming && (
                <div className="flex flex-col items-center gap-4 animate-fade-in-up w-full max-w-sm mx-auto">
                    <button onClick={handleStartCourse} className="w-full px-8 py-4 bg-gradient-to-r from-emerald-500 to-teal-600 text-white font-black rounded-2xl shadow-xl hover:scale-105 transition-transform flex items-center justify-center gap-3 active:scale-95 text-lg">
                        <Play className="w-6 h-6 fill-current" />
                        {user.preferences?.explanationLanguage === ExplanationLanguage.Malagasy ? "HATOMBOKA NY LESONA" : "COMMENCER LE COURS"}
                    </button>

                    <div className="w-full">
                        <button 
                            onClick={() => setShowTutorial(!showTutorial)}
                            className="w-full py-3 bg-white dark:bg-slate-800 text-slate-500 dark:text-slate-400 font-bold rounded-2xl shadow-sm border border-slate-200 dark:border-slate-700 flex items-center justify-center gap-2 hover:bg-slate-50 dark:hover:bg-slate-750 transition-all text-sm"
                        >
                            <BookOpen className="w-4 h-4" />
                            <span>{user.preferences?.explanationLanguage === ExplanationLanguage.Malagasy ? "Torolalana (Guide)" : "Comment ça marche ?"}</span>
                            {showTutorial ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                        </button>

                        {showTutorial && (
                            <div className="mt-3 p-5 bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 text-sm text-slate-600 dark:text-slate-300 shadow-xl animate-slide-up text-left space-y-4">
                                <div className="flex gap-4">
                                    <div className="p-2.5 bg-indigo-100 dark:bg-indigo-900/30 rounded-xl h-fit shrink-0"><Play className="w-5 h-5 text-indigo-600 dark:text-indigo-400 fill-current"/></div>
                                    <div>
                                        <strong className="block text-slate-900 dark:text-white mb-1 text-base">1. Démarrer</strong>
                                        Cliquez sur le bouton <span className="font-bold text-emerald-600">Commencer</span> pour votre première leçon personnalisée par le prof.
                                    </div>
                                </div>
                                <div className="flex gap-4">
                                    <div className="p-2.5 bg-purple-100 dark:bg-purple-900/30 rounded-xl h-fit shrink-0"><Mic className="w-5 h-5 text-purple-600 dark:text-purple-400"/></div>
                                    <div>
                                        <strong className="block text-slate-900 dark:text-white mb-1 text-base">2. Pratiquer</strong>
                                        Utilisez le <span className="font-bold text-indigo-600">Clavier</span> pour répondre aux exercices/questions/messages.<br></br>
                                        Utilisez le bouton <span className="font-bold text-indigo-600">Appel Vocal</span> pour pratiquer orale en temps réel.<br></br>
                                        Utilisez le bouton <span className="font-bold text-indigo-600">Dialogue</span> pour la conversation en temps réel.
                                    </div>
                                </div>
                                <div className="flex gap-4">
                                    <div className="p-2.5 bg-amber-100 dark:bg-amber-900/30 rounded-xl h-fit shrink-0"><Volume2 className="w-5 h-5 text-amber-600 dark:text-amber-400"/></div>
                                    <div>
                                        <strong className="block text-slate-900 dark:text-white mb-1 text-base">3. Prononciation</strong>
                                        Cliquez sur les <span className="inline-block bg-indigo-50 dark:bg-indigo-900/50 px-1.5 rounded border border-indigo-200 dark:border-indigo-800 text-indigo-700 dark:text-indigo-300 font-bold text-xs">Mots en gras</span> pour écouter l'accent natif.
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            )}

            {isStreaming && (
                <div className="flex justify-start animate-fade-in-up">
                    <div className="w-10 h-10 mr-3"></div>
                    <div className="bg-white dark:bg-slate-800 px-4 py-3 rounded-2xl rounded-tl-sm border border-slate-200 dark:border-slate-700 shadow-sm flex items-center gap-3">
                        <div className="flex gap-1 shrink-0">
                            <div className="w-1.5 h-1.5 bg-indigo-500 rounded-full animate-bounce"></div>
                            <div className="w-1.5 h-1.5 bg-indigo-500 rounded-full animate-bounce delay-75"></div>
                            <div className="w-1.5 h-1.5 bg-indigo-500 rounded-full animate-bounce delay-150"></div>
                        </div>
                        <span className="text-xs font-bold text-slate-500 dark:text-slate-400 animate-pulse min-w-[120px]">
                            {loadingText}
                        </span>
                    </div>
                </div>
            )}
            <div ref={scrollRef} className="h-4" />
        </div>
      </main>

      {/* --- FOOTER --- */}
      <footer className="fixed bottom-0 left-0 w-full bg-white/95 dark:bg-[#131825]/95 backdrop-blur-lg border-t border-slate-200 dark:border-slate-800 safe-bottom z-30 shadow-2xl">
        <div className="max-w-3xl mx-auto p-4 flex flex-col gap-3">
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
                <button onClick={handleVoiceCallClick} className="h-10 w-10 shrink-0 rounded-full flex items-center justify-center bg-gradient-to-br from-indigo-500 to-purple-600 text-white shadow-[0_0_20px_rgba(99,102,241,0.5)] animate-pulse hover:scale-110 transition-transform active:scale-95 border-2 border-white/20" title="Démarrer Appel Vocal">
                    <Phone className="w-5 h-5 fill-current" />
                </button>

                <textarea
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); }}}
                    placeholder={isLowCredits ? "Rechargez crédits pour continuer..." : "Message..."}
                    className="flex-1 bg-transparent border-none outline-none text-slate-800 dark:text-white text-sm px-2 resize-none max-h-32 placeholder:text-slate-400 py-2.5 disabled:opacity-50 disabled:cursor-not-allowed"
                    rows={1}
                    style={{ minHeight: '40px' }}
                    disabled={isLowCredits}
                />
                
                {input.trim().length === 0 ? (
                    showNextInput ? (
                        <div className="h-10 flex items-center gap-1 bg-white dark:bg-slate-900 rounded-full px-1 border border-indigo-500/30 animate-fade-in shadow-sm">
                            <span className="text-[10px] font-bold text-slate-400 uppercase pl-2">Leçon</span>
                            <input type="number" value={nextLessonInput} onChange={(e) => setNextLessonInput(e.target.value)} className="w-10 bg-transparent font-black text-indigo-600 dark:text-indigo-400 outline-none text-center text-sm" autoFocus onKeyDown={(e) => { if(e.key === 'Enter') confirmNextLesson(); }} />
                            <button onClick={confirmNextLesson} className="p-1.5 bg-indigo-600 rounded-full text-white hover:bg-indigo-700 transition-colors"><Check size={14}/></button>
                            <button onClick={() => setShowNextInput(false)} className="p-1.5 text-slate-400 hover:text-red-500 transition-colors"><X size={14}/></button>
                        </div>
                    ) : (
                        <button onClick={handleNextClick} disabled={isStreaming} className="h-10 px-4 bg-emerald-500 hover:bg-emerald-600 text-white rounded-full font-bold text-xs shadow-md transition-all active:scale-95 flex items-center gap-1.5 shrink-0 disabled:opacity-50 disabled:cursor-not-allowed">
                            Suivant <ArrowRight className="w-3.5 h-3.5" />
                        </button>
                    )
                ) : (
                    <button onClick={handleSend} disabled={isStreaming} className="h-10 w-10 bg-indigo-600 hover:bg-indigo-700 text-white rounded-full shadow-md transition-all active:scale-95 flex items-center justify-center shrink-0 disabled:opacity-50 disabled:cursor-not-allowed">
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
