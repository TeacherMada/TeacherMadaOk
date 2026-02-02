
import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Send, Menu, ArrowRight, Phone, Dumbbell, Brain, Sparkles, X, MicOff, Volume2, Lightbulb, Zap, BookOpen, MessageCircle, Mic, StopCircle, ArrowLeft, Sun, Moon, User } from 'lucide-react';
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

  // Sync theme
  const toggleTheme = () => {
      const newMode = !isDarkMode;
      setIsDarkMode(newMode);
      document.documentElement.classList.toggle('dark', newMode);
      localStorage.setItem('tm_theme', newMode ? 'dark' : 'light');
  };

  // --- VOICE MODE STATE ---
  const [isVoiceMode, setIsVoiceMode] = useState(false);
  const [voiceStatus, setVoiceStatus] = useState<'idle' | 'listening' | 'processing' | 'speaking'>('idle');
  const [callDuration, setCallDuration] = useState(0);
  
  // Refs for Voice APIs
  const recognitionRef = useRef<any>(null);
  const synthesisRef = useRef<SpeechSynthesis>(window.speechSynthesis);
  const isVoiceModeRef = useRef(false);

  useEffect(() => {
      isVoiceModeRef.current = isVoiceMode;
      if (!isVoiceMode) {
          stopSpeaking();
          stopListening();
      } else {
          startConversationLoop();
      }
  }, [isVoiceMode]);

  // Lesson Progress Logic
  const currentLessonNum = (user.stats.lessonsCompleted || 0) + 1;
  const progressPercent = Math.min((messages.length / 20) * 100, 100);

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

  // --- VOICE LOGIC ---

  const stopSpeaking = () => {
      if (synthesisRef.current.speaking) {
          synthesisRef.current.cancel();
      }
  };

  const stopListening = () => {
      if (recognitionRef.current) {
          try { recognitionRef.current.stop(); } catch(e) {}
      }
  };

  const speakText = (text: string) => {
      if (!isVoiceModeRef.current) return;
      
      stopSpeaking();
      // Cleaner text specifically for TTS (remove markdown headers like "## Tanjona")
      const cleanText = text
        .replace(/[#*`_]/g, '') // Remove markdown syntax
        .replace(/Lesona \d+/gi, '') // Remove lesson headers if redundant
        .replace(/Tanjona|Vocabulaire|Grammaire|Pratique/gi, ''); // Remove section headers for flow

      const utterance = new SpeechSynthesisUtterance(cleanText);
      utterance.lang = getLangCode(user.preferences?.explanationLanguage || 'Français'); 
      
      if (cleanText.length < 50) {
          utterance.lang = getLangCode(user.preferences?.targetLanguage || 'Anglais');
      }

      utterance.rate = 1.0;
      utterance.pitch = 1.0;

      utterance.onstart = () => setVoiceStatus('speaking');
      utterance.onend = () => {
          if (isVoiceModeRef.current) {
              startListening();
          }
      };

      synthesisRef.current.speak(utterance);
  };

  const startListening = () => {
      if (!isVoiceModeRef.current) return;

      const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
      if (!SpeechRecognition) {
          notify("Votre navigateur ne supporte pas la reconnaissance vocale.", "error");
          return;
      }

      const recognition = new SpeechRecognition();
      recognition.lang = getLangCode(user.preferences?.targetLanguage || 'Anglais');
      recognition.continuous = false;
      recognition.interimResults = false;

      recognition.onstart = () => setVoiceStatus('listening');
      
      recognition.onresult = async (event: any) => {
          const transcript = event.results[0][0].transcript;
          if (transcript.trim()) {
              setVoiceStatus('processing');
              await processMessage(transcript, false, true); 
          }
      };

      recognition.onerror = (event: any) => {
          if (event.error === 'no-speech') {
              if (isVoiceModeRef.current && voiceStatus !== 'processing') {
                  try { recognition.start(); } catch(e){}
              }
          } else {
              setVoiceStatus('idle');
          }
      };

      recognitionRef.current = recognition;
      try { recognition.start(); } catch (e) {}
  };

  const startConversationLoop = () => {
      setTimeout(() => {
          speakText(`Bonjour ${user.username}. Prêt pour la leçon ${currentLessonNum} ?`);
      }, 500);
  };

  // -------------------

  const processMessage = async (text: string, isAuto: boolean = false, isVoice: boolean = false) => {
    if (isStreaming && !isVoice) return;
    
    // --- CREDIT CHECK ---
    const canProceed = await storageService.checkAndConsumeCredit(user.id);
    if (!canProceed) {
        onShowPayment();
        setVoiceStatus('idle');
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
    if (!isVoice) setIsStreaming(true);

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
            if (!isVoice) scrollRef.current?.scrollIntoView({ behavior: 'smooth' });
        }
      }
      
      const finalHistory: ChatMessage[] = [...newHistory, { id: aiMsgId, role: 'model', text: fullText, timestamp: Date.now() }];
      storageService.saveSession({ ...session, messages: finalHistory, progress: progressPercent });
      
      const newXp = user.stats.xp + 10; 
      const xpUser = { ...user, stats: { ...user.stats, xp: newXp } };
      await storageService.saveUserProfile(xpUser);
      onUpdateUser(xpUser);

      if (isVoice) {
          speakText(fullText);
      }

    } catch (e) {
      notify("Connexion instable.", "error");
      if (isVoice) speakText("Désolé, j'ai eu un problème de connexion.");
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
          <div className="fixed inset-0 z-50 bg-[#0B0F19] text-white flex flex-col items-center justify-between p-8 animate-fade-in font-sans overflow-hidden">
              <div className="absolute inset-0 z-0">
                  <div className={`absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] bg-indigo-600/20 rounded-full blur-[100px] transition-all duration-1000 ${voiceStatus === 'listening' ? 'scale-125 opacity-30' : 'scale-100 opacity-20'}`}></div>
                  <div className={`absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[300px] h-[300px] bg-purple-500/20 rounded-full blur-[80px] transition-all duration-1000 ${voiceStatus === 'speaking' ? 'scale-125 opacity-40' : 'scale-100 opacity-20'}`}></div>
              </div>

              <div className="w-full flex justify-between items-start opacity-90 z-10">
                  <button onClick={() => setIsVoiceMode(false)} className="p-3 bg-white/10 rounded-full hover:bg-white/20 backdrop-blur-md transition-all hover:scale-105">
                      <X className="w-6 h-6" />
                  </button>
                  <div className="flex flex-col items-center">
                      <div className="flex items-center gap-2 mb-1">
                          <span className={`w-2 h-2 rounded-full ${voiceStatus === 'idle' ? 'bg-slate-500' : 'bg-green-500 animate-pulse'}`}></span>
                          <span className="text-xs font-bold uppercase tracking-widest text-indigo-200">Appel en cours</span>
                      </div>
                      <span className="font-mono text-xl text-white font-medium">{formatTime(callDuration)}</span>
                  </div>
                  <div className="w-12"></div>
              </div>

              <div className="flex flex-col items-center justify-center gap-10 w-full z-10 flex-1 relative">
                  <div className="h-8 flex items-center justify-center">
                      {voiceStatus === 'listening' && <p className="text-indigo-300 font-medium animate-pulse flex items-center gap-2"><Mic className="w-4 h-4"/> Je vous écoute...</p>}
                      {voiceStatus === 'processing' && <p className="text-purple-300 font-medium animate-bounce flex items-center gap-2"><Brain className="w-4 h-4"/> Je réfléchis...</p>}
                      {voiceStatus === 'speaking' && <p className="text-emerald-300 font-medium flex items-center gap-2"><Volume2 className="w-4 h-4"/> Je parle...</p>}
                      {voiceStatus === 'idle' && <p className="text-slate-400 font-medium text-sm">En attente...</p>}
                  </div>

                  <div className="relative">
                      {voiceStatus === 'speaking' && (
                          <>
                            <div className="absolute inset-0 bg-emerald-500/20 rounded-full animate-ping blur-md"></div>
                            <div className="absolute inset-0 bg-emerald-500/10 rounded-full animate-ping delay-150 blur-lg"></div>
                          </>
                      )}
                      {voiceStatus === 'listening' && (
                          <>
                            <div className="absolute inset-0 bg-indigo-500/20 rounded-full animate-pulse scale-110 blur-md"></div>
                            <div className="absolute -inset-4 border border-indigo-500/30 rounded-full animate-spin-slow border-t-transparent"></div>
                          </>
                      )}

                      <div className="relative w-48 h-48 rounded-full bg-gradient-to-b from-[#1E293B] to-[#0F172A] p-1 shadow-[0_0_60px_rgba(79,70,229,0.3)] flex items-center justify-center z-20 border border-white/10">
                          <div className="w-full h-full rounded-full overflow-hidden bg-[#0B0F19] flex items-center justify-center relative p-8">
                              <img src="https://i.ibb.co/B2XmRwmJ/logo.png" className="w-full h-full object-contain z-10 drop-shadow-2xl" alt="Teacher AI" />
                          </div>
                      </div>
                  </div>

                  <div className="text-center space-y-1">
                      <h2 className="text-3xl font-bold text-white tracking-tight">TeacherMada</h2>
                      <p className="text-indigo-200/60 font-medium text-sm">{user.preferences?.targetLanguage} • {user.preferences?.level}</p>
                  </div>
              </div>

              <div className="w-full max-w-sm grid grid-cols-3 gap-6 mb-8 z-10 items-end">
                  <button onClick={() => {
                      if(voiceStatus === 'listening') stopListening();
                      else startListening();
                  }} className="flex flex-col items-center gap-3 group">
                      <div className={`w-14 h-14 rounded-full flex items-center justify-center transition-all ${voiceStatus === 'listening' ? 'bg-white text-indigo-900 shadow-[0_0_20px_rgba(255,255,255,0.3)]' : 'bg-white/10 hover:bg-white/20 text-white'}`}>
                          {voiceStatus === 'listening' ? <Mic className="w-6 h-6" /> : <MicOff className="w-6 h-6" />}
                      </div>
                      <span className="text-xs font-medium text-slate-300 group-hover:text-white transition-colors">{voiceStatus === 'listening' ? 'Mute' : 'Parler'}</span>
                  </button>

                  <button onClick={() => setIsVoiceMode(false)} className="flex flex-col items-center gap-3 group transform hover:scale-105 transition-transform">
                      <div className="w-20 h-20 rounded-full bg-red-500 hover:bg-red-600 flex items-center justify-center shadow-lg shadow-red-500/40 border-4 border-[#0B0F19]">
                          <Phone className="w-10 h-10 text-white fill-white rotate-[135deg]" />
                      </div>
                      <span className="text-xs font-bold text-red-400 group-hover:text-red-300 transition-colors uppercase tracking-wider">Raccrocher</span>
                  </button>

                  <button className="flex flex-col items-center gap-3 group">
                      <div className="w-14 h-14 rounded-full bg-white/10 flex items-center justify-center group-hover:bg-white/20 transition-all text-white">
                          <Volume2 className="w-6 h-6" />
                      </div>
                      <span className="text-xs font-medium text-slate-300 group-hover:text-white transition-colors">Haut-parleur</span>
                  </button>
              </div>
          </div>
      );
  }

  return (
    <div className="flex flex-col h-screen bg-[#F0F2F5] dark:bg-[#0B0F19] font-sans transition-colors duration-300">
      
      {/* --- NEW HEADER STRUCTURE --- */}
      <header className="sticky top-0 z-30 bg-white/80 dark:bg-[#131825]/90 backdrop-blur-md border-b border-slate-200 dark:border-slate-800 shadow-sm safe-top transition-colors">
        <div className="max-w-5xl mx-auto px-4 h-16 flex items-center justify-between">
            
            {/* LEFT: Return + Badge Lang/Level */}
            <div className="flex items-center gap-2 md:gap-3 flex-1">
                <button onClick={onExit} className="p-2 -ml-2 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-full transition-colors">
                    <ArrowLeft className="w-6 h-6" />
                </button>
                <div className="flex items-center gap-2 bg-slate-100 dark:bg-slate-800 px-3 py-1.5 rounded-full border border-slate-200 dark:border-slate-700">
                    <span className="text-sm font-bold text-slate-700 dark:text-slate-200 truncate max-w-[80px] sm:max-w-none">{user.preferences?.targetLanguage}</span>
                    <div className="h-4 w-px bg-slate-300 dark:bg-slate-600"></div>
                    <span className="text-xs font-black text-indigo-600 dark:text-indigo-400">{user.preferences?.level}</span>
                </div>
            </div>

            {/* CENTER: Lesson + Credit */}
            <div className="flex flex-col items-center justify-center flex-1">
                <h1 className="text-xs font-black text-slate-400 uppercase tracking-widest mb-0.5">
                    LEÇON {currentLessonNum}
                </h1>
                <div className="flex items-center gap-1.5 bg-amber-50 dark:bg-amber-900/10 px-2 py-0.5 rounded-md border border-amber-100 dark:border-amber-900/30 cursor-pointer hover:bg-amber-100" onClick={onShowPayment}>
                    <Zap className="w-3 h-3 text-amber-500 fill-amber-500" />
                    <span className="text-[10px] font-bold text-amber-600 dark:text-amber-400">
                        {user.freeUsage.count < 3 ? `${3 - user.freeUsage.count}/3 GRATUIT` : `${user.credits} CRD`}
                    </span>
                </div>
            </div>

            {/* RIGHT: Theme + Profile */}
            <div className="flex items-center justify-end gap-2 md:gap-3 flex-1">
                <button 
                    onClick={toggleTheme}
                    className="p-2 text-slate-400 hover:text-indigo-500 hover:bg-indigo-50 dark:hover:bg-slate-800 rounded-full transition-colors hidden sm:block"
                >
                    {isDarkMode ? <Sun className="w-5 h-5"/> : <Moon className="w-5 h-5"/>}
                </button>
                <button 
                    onClick={onShowProfile} 
                    className="flex items-center gap-2 p-1 pl-2 pr-1 bg-slate-100 dark:bg-slate-800 hover:bg-white dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700 rounded-full transition-all group"
                >
                    <span className="text-xs font-bold text-slate-600 dark:text-slate-300 hidden sm:block max-w-[60px] truncate">{user.username}</span>
                    <div className="w-8 h-8 bg-indigo-600 text-white rounded-full flex items-center justify-center font-bold text-xs shadow-md group-hover:scale-105 transition-transform">
                        {user.username.charAt(0).toUpperCase()}
                    </div>
                </button>
            </div>
        </div>
      </header>

      {/* Chat Area */}
      <main className="flex-1 overflow-y-auto p-4 md:p-6 space-y-6 scrollbar-hide relative">
        <div className="max-w-3xl mx-auto space-y-6 pb-4">
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
                    <MarkdownRenderer content={msg.text} />
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

      {/* Footer */}
      <footer className="bg-white/90 dark:bg-[#131825]/90 backdrop-blur-lg border-t border-slate-200 dark:border-slate-800 safe-bottom z-30">
        <div className="max-w-3xl mx-auto p-4">
            
            {/* Enhanced Suggestions */}
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
                <button 
                    onClick={() => setIsVoiceMode(true)}
                    className="h-10 w-10 shrink-0 rounded-full bg-slate-200 dark:bg-slate-700 text-slate-500 dark:text-slate-400 hover:text-indigo-600 hover:bg-indigo-100 dark:hover:bg-indigo-900/30 flex items-center justify-center transition-all"
                >
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
