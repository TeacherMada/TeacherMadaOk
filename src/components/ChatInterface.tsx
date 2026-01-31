
import React, { useState, useRef, useEffect, useMemo } from 'react';
import { Send, User, Mic, Volume2, ArrowLeft, Loader2, Copy, Check, ArrowRight, Phone, Globe, ChevronDown, MicOff, BookOpen, Search, AlertTriangle, X, Sun, Moon, Languages, Coins, Lock, BrainCircuit, Menu, FileText, Type, RotateCcw, MessageCircle, Image as ImageIcon, Library, PhoneOff, VolumeX, Trophy, Info, ChevronUp, Keyboard } from 'lucide-react';
import { UserProfile, ChatMessage, ExerciseItem, ExplanationLanguage, TargetLanguage, VoiceCallSummary } from '../types';
import { sendMessageToGeminiStream, generateSpeech, generatePracticalExercises, getLessonSummary, translateText, generateConceptImage, generateVoiceChatResponse, analyzeVoiceCallPerformance } from '../services/geminiService';
import { storageService } from '../services/storageService';
import { TOTAL_LESSONS_PER_LEVEL } from '../constants';
import MarkdownRenderer from './MarkdownRenderer';
import ExerciseSession from './ExerciseSession';
import DialogueSession from './DialogueSession';
import TutorialOverlay from './TutorialOverlay';
import PaymentModal from './PaymentModal';
import Tooltip from './Tooltip';
import { jsPDF } from 'jspdf';

interface ChatInterfaceProps {
  user: UserProfile;
  messages: ChatMessage[];
  setMessages: React.Dispatch<React.SetStateAction<ChatMessage[]>>;
  onChangeMode: () => void;
  onChangeLanguage: () => void;
  onLogout: () => void;
  onUpdateUser: (user: UserProfile) => void;
  onShowProfile: () => void;
  isDarkMode: boolean;
  toggleTheme: () => void;
  isAnalyzing: boolean;
  onMessageSent: () => void;
  fontSize: 'small' | 'normal' | 'large' | 'xl';
  notify: (message: string, type: 'success' | 'error' | 'info') => void;
}

const ChatInterface: React.FC<ChatInterfaceProps> = ({ 
  user,
  messages, 
  setMessages, 
  onChangeMode,
  onChangeLanguage,
  onShowProfile,
  onUpdateUser,
  isDarkMode,
  toggleTheme,
  isAnalyzing,
  onMessageSent,
  fontSize,
  notify
}) => {
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isPlayingAudio, setIsPlayingAudio] = useState(false);
  const [showMenu, setShowMenu] = useState(false);
  const [showSmartOptions, setShowSmartOptions] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  
  const [isTranslating, setIsTranslating] = useState(false);
  const [isListening, setIsListening] = useState(false);
  
  // Voice Call State
  const [isCallActive, setIsCallActive] = useState(false);
  const [isCallConnecting, setIsCallConnecting] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [callSeconds, setCallSeconds] = useState(0);
  const [loadingText, setLoadingText] = useState("Réflexion...");
  const [callSummary, setCallSummary] = useState<VoiceCallSummary | null>(null);
  const [isAnalyzingCall, setIsAnalyzingCall] = useState(false);
  
  // Voice Call Input State
  const [showVoiceInput, setShowVoiceInput] = useState(false);
  const [voiceTextInput, setVoiceTextInput] = useState('');
  
  const ringbackOscillatorRef = useRef<OscillatorNode | null>(null);

  // Image Gen State
  const [generatedImage, setGeneratedImage] = useState<string | null>(null);
  const [isGeneratingImage, setIsGeneratingImage] = useState(false);

  // Search State
  const [searchQuery, setSearchQuery] = useState('');
  const [currentMatchIndex, setCurrentMatchIndex] = useState(0);

  // Training Mode State
  const [isTrainingMode, setIsTrainingMode] = useState(false);
  const [exercises, setExercises] = useState<ExerciseItem[]>([]);
  const [isLoadingExercises, setIsLoadingExercises] = useState(false);
  const [exerciseError, setExerciseError] = useState(false);

  // Dialogue Mode State
  const [isDialogueActive, setIsDialogueActive] = useState(false);
  
  const [showSummaryResultModal, setShowSummaryResultModal] = useState(false);
  const [summaryContent, setSummaryContent] = useState('');
  const [isGeneratingSummary, setIsGeneratingSummary] = useState(false);

  const [summaryInputVal, setSummaryInputVal] = useState('');
  const [jumpInputVal, setJumpInputVal] = useState('');
  const [showTutorial, setShowTutorial] = useState(false);
  
  // Payment Modal State
  const [showPaymentModal, setShowPaymentModal] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const lastSpokenMessageId = useRef<string | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const activeSourceRef = useRef<AudioBufferSourceNode | null>(null);
  const recognitionRef = useRef<any>(null);
  const preferences = user.preferences!;

  // --- SMART PROGRESS CALCULATION ---
  const progressData = useMemo(() => {
      const currentLang = preferences.targetLanguage;
      const currentLevel = preferences.level;
      const courseKey = `${currentLang}-${currentLevel}`;
      const lessonsDone = user.stats.progressByLevel?.[courseKey] || 0;
      const percentage = Math.min((lessonsDone / TOTAL_LESSONS_PER_LEVEL) * 100, 100);
      return { lessonsDone, total: TOTAL_LESSONS_PER_LEVEL, percentage };
  }, [user.stats.progressByLevel, preferences.targetLanguage, preferences.level]);

  const nextLessonNumber = progressData.lessonsDone + 1;

  // Dynamic Loading Text Logic for Voice Call
  useEffect(() => {
      let timer1: any, timer2: any;
      if (isLoading && isCallActive) {
          setLoadingText("...");
          timer1 = setTimeout(() => { setLoadingText("Traitement..."); }, 2500);
          timer2 = setTimeout(() => { setLoadingText("Génération..."); }, 5000);
      } else {
          setLoadingText("Réflexion...");
      }
      return () => { clearTimeout(timer1); clearTimeout(timer2); };
  }, [isLoading, isCallActive]);

  // Search Logic
  const matchingMessages = useMemo(() => {
    if (!searchQuery.trim()) return [];
    return messages
      .map((m, i) => ({ id: m.id, index: i, match: m.text.toLowerCase().includes(searchQuery.toLowerCase()) }))
      .filter(m => m.match);
  }, [messages, searchQuery]);

  useEffect(() => { setCurrentMatchIndex(0); }, [searchQuery]);

  useEffect(() => {
    if (matchingMessages.length > 0) {
      const match = matchingMessages[currentMatchIndex];
      const el = document.getElementById(`msg-${match.id}`);
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [currentMatchIndex, matchingMessages]);

  const handleNextMatch = () => { if (matchingMessages.length > 0) setCurrentMatchIndex(prev => (prev + 1) % matchingMessages.length); };
  const handlePrevMatch = () => { if (matchingMessages.length > 0) setCurrentMatchIndex(prev => (prev - 1 + matchingMessages.length) % matchingMessages.length); };

  const displayedLessonNumber = useMemo(() => {
    for (let i = messages.length - 1; i >= 0; i--) {
        const match = messages[i].text.match(/##\s*(?:🟢|🔴|🔵)?\s*(?:LEÇON|LECON|LESSON|LESONA)\s*(\d+)/i);
        if (match) return match[1];
    }
    return '-';
  }, [messages]);

  const getTextSizeClass = () => {
      switch (fontSize) {
          case 'small': return 'text-sm';
          case 'large': return 'text-lg';
          case 'xl': return 'text-xl leading-relaxed';
          default: return 'text-base';
      }
  };
  const textSizeClass = getTextSizeClass();

  // --- Speech Recognition Logic ---
  const stopListening = () => {
    if (recognitionRef.current) {
        try { recognitionRef.current.stop(); } catch(e){}
        recognitionRef.current = null;
    }
    setIsListening(false);
  };

  const startListening = () => {
    if (showVoiceInput) return;
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      notify("Reconnaissance vocale non supportée", 'error');
      return;
    }
    const recognition = new SpeechRecognition();
    recognition.continuous = false;
    recognition.interimResults = false;
    
    let lang = 'fr-FR';
    if (preferences.targetLanguage.includes("Anglais")) lang = 'en-US';
    else if (preferences.targetLanguage.includes("Espagnol")) lang = 'es-ES';
    else if (preferences.targetLanguage.includes("Allemand")) lang = 'de-DE';
    else if (preferences.targetLanguage.includes("Chinois")) lang = 'zh-CN';
    
    recognition.lang = lang;
    
    recognition.onstart = () => setIsListening(true);
    recognition.onend = () => setIsListening(false);
    recognition.onerror = (e: any) => { console.error(e); setIsListening(false); };
    recognition.onresult = (e: any) => {
      const text = e.results[0][0].transcript;
      if (isCallActive) {
          handleSend(text);
      } else {
          setInput(prev => prev + (prev ? ' ' : '') + text);
      }
    };
    
    recognitionRef.current = recognition;
    recognition.start();
  };

  const toggleListening = () => { isListening ? stopListening() : startListening(); };

  const scrollToBottom = () => { messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }); };
  useEffect(() => { if (!isTrainingMode && !isDialogueActive && !searchQuery) scrollToBottom(); }, [messages, isTrainingMode, isDialogueActive]);

  useEffect(() => {
    if (textareaRef.current) {
        textareaRef.current.style.height = 'auto';
        textareaRef.current.style.height = Math.min(textareaRef.current.scrollHeight, 150) + 'px';
    }
  }, [input]);

  useEffect(() => {
    textareaRef.current?.focus();
    return () => { stopAudio(); stopListening(); stopRingback(); };
  }, []);

  const isFreeTier = user.role !== 'admin' && user.credits <= 0;
  const freeUsageLeft = isFreeTier ? Math.max(0, 2 - user.freeUsage.count) : 0;
  const canSend = storageService.canPerformRequest(user.id).allowed;
  
  const refreshUserData = () => {
     const updated = storageService.getUserById(user.id);
     if (updated) onUpdateUser(updated);
  };

  const handleErrorAction = (err: any) => {
     console.error("Error:", err);
     setIsLoading(false);
     if (err.message.includes('INSUFFICIENT_CREDITS')) {
         setShowPaymentModal(true);
         notify("Crédits insuffisants. Rechargez.", 'error');
         if (isCallActive) handleEndCall();
     } else {
         notify(err.message || "Erreur de connexion.", 'error');
     }
  };

  // --- Call Handlers ---
  useEffect(() => {
      let interval: any;
      if (isCallActive && !isCallConnecting && !callSummary) {
          interval = setInterval(() => {
              setCallSeconds(prev => {
                  const newVal = prev + 1;
                  if (newVal > 0 && newVal % 60 === 0) {
                      const updatedUser = storageService.deductCreditOrUsage(user.id);
                      if (updatedUser) {
                          onUpdateUser(updatedUser);
                          notify("1 min écoulée : -1 Crédit", 'info');
                      } else {
                          clearInterval(interval);
                          notify("Crédit épuisé. Fin de l'appel.", 'error');
                          handleEndCall();
                      }
                  }
                  return newVal;
              });
          }, 1000);
      }
      return () => clearInterval(interval);
  }, [isCallActive, isCallConnecting, callSummary, user.id, user.credits]);

  const playRingbackTone = () => {
      const ctx = getAudioContext();
      if (ctx.state === 'suspended') ctx.resume();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.frequency.value = 425; 
      gain.gain.setValueAtTime(0.5, ctx.currentTime);
      gain.gain.setValueAtTime(0, ctx.currentTime + 0.4);
      gain.gain.setValueAtTime(0.5, ctx.currentTime + 0.8);
      gain.gain.setValueAtTime(0, ctx.currentTime + 1.2);
      osc.start();
      const pulse = setInterval(() => {
          if (ctx.state === 'closed') return;
          const t = ctx.currentTime;
          gain.gain.setValueAtTime(0.5, t);
          gain.gain.setValueAtTime(0, t + 0.4);
          gain.gain.setValueAtTime(0.5, t + 0.8);
          gain.gain.setValueAtTime(0, t + 1.2);
      }, 3000);
      ringbackOscillatorRef.current = osc;
      // @ts-ignore
      osc.pulseInterval = pulse;
  };

  const stopRingback = () => {
      if (ringbackOscillatorRef.current) {
          try {
              ringbackOscillatorRef.current.stop();
              ringbackOscillatorRef.current.disconnect();
              // @ts-ignore
              clearInterval(ringbackOscillatorRef.current.pulseInterval);
          } catch(e) {}
          ringbackOscillatorRef.current = null;
      }
  };

  const handleStartCall = () => {
      if (!storageService.canPerformRequest(user.id).allowed) {
          setShowPaymentModal(true);
          return;
      }
      setShowSmartOptions(false);
      setIsCallActive(true);
      setIsCallConnecting(true);
      setCallSeconds(0);
      setCallSummary(null);
      setIsAnalyzingCall(false);
      playRingbackTone();
      setTimeout(() => {
          stopRingback();
          setIsCallConnecting(false);
          const isMg = preferences.explanationLanguage === ExplanationLanguage.Malagasy;
          const greeting = isMg 
            ? `Allô ${user.username} ! 😊 Hianatra ${preferences.targetLanguage} miaraka isika...`
            : `Allô ${user.username} ! 😊 Nous allons pratiquer ensemble le ${preferences.targetLanguage}...`;
          handleSpeak(greeting);
      }, 5000);
  };

  const handleEndCall = async () => {
      stopListening();
      stopAudio();
      stopRingback();
      if (callSeconds > 10) {
          setIsAnalyzingCall(true);
          try {
              const summary = await analyzeVoiceCallPerformance(messages, user.id);
              setCallSummary(summary);
          } catch (e) {
              setCallSummary({ score: 5, feedback: "Erreur analyse.", tip: "Réessayez plus tard." });
          } finally {
              setIsAnalyzingCall(false);
          }
      } else {
          closeCallOverlay();
      }
  };
  
  const closeCallOverlay = () => {
      setIsCallActive(false);
      setIsCallConnecting(false);
      setCallSummary(null);
      setIsMuted(false);
      setCallSeconds(0);
      setShowVoiceInput(false);
  };

  const toggleMute = () => setIsMuted(!isMuted);

  // --- CORE HANDLER ---
  const handleSend = async (textOverride?: string) => {
    stopAudio();
    const textToSend = typeof textOverride === 'string' ? textOverride : input;
    
    if (!textToSend.trim() || isLoading || isAnalyzing) return;

    if (!storageService.canPerformRequest(user.id).allowed) {
        notify("Crédit insuffisant.", 'error');
        setShowPaymentModal(true);
        if (isCallActive) handleEndCall();
        return;
    }
    
    // 1. Prepare UI Update
    const userMsg: ChatMessage = { id: Date.now().toString(), role: 'user', text: textToSend, timestamp: Date.now() };
    
    // IMPORTANT: Grab current history BEFORE adding the new user message
    // This is crucial for the sanitizer to work (it expects History + New Message separate)
    const historyForAI = [...messages]; 

    // Update UI immediately (Optimistic)
    const updatedMessages = [...messages, userMsg];
    setMessages(updatedMessages);
    storageService.saveChatHistory(user.id, updatedMessages, preferences.targetLanguage);
    
    setInput('');
    setVoiceTextInput('');
    setGeneratedImage(null);
    setIsLoading(true);
    onMessageSent();

    try {
      let responseText = "";
      
      if (isCallActive) {
          // Voice Mode (Not Streamed for latency)
          // We pass 'historyForAI' (clean history) to the service
          // The service will append 'textToSend' internally or handle it via chat.sendMessage
          responseText = await generateVoiceChatResponse(textToSend, user.id, historyForAI);
          
          const aiMsg: ChatMessage = { id: (Date.now() + 1).toString(), role: 'model', text: responseText, timestamp: Date.now() };
          const finalHistory = [...updatedMessages, aiMsg];
          setMessages(finalHistory);
          storageService.saveChatHistory(user.id, finalHistory, preferences.targetLanguage);
          handleSpeak(responseText);
      } else {
          // Chat Mode (Streamed)
          const aiMsgId = (Date.now() + 1).toString();
          const placeholderMsg: ChatMessage = { id: aiMsgId, role: 'model', text: '', timestamp: Date.now() };
          setMessages(prev => [...prev, placeholderMsg]);

          // We pass 'historyForAI' here too
          await sendMessageToGeminiStream(textToSend, user.id, historyForAI, (chunkText) => {
              setMessages(current => {
                  const newMessages = [...current];
                  const lastMsg = newMessages[newMessages.length - 1];
                  if (lastMsg && lastMsg.id === aiMsgId) {
                      lastMsg.text += chunkText; 
                  }
                  return newMessages;
              });
          });
      }
      refreshUserData();
    } catch (error) {
      handleErrorAction(error);
      setMessages(current => current.filter(m => m.text.trim() !== '')); // Rollback empty placeholders if err
    } finally { 
      setIsLoading(false); 
    }
  };

  // ... (Rest of the component remains similar: render logic, buttons, etc.)
  
  // (Assuming standard imports and helper functions are present)
  // ...

  const handleTranslateInput = async () => { /* ... existing ... */ };
  const handleGenerateImage = async () => { /* ... existing ... */ };
  const handleValidateSummary = async () => { /* ... existing ... */ };
  const handleSpeak = async (text: string, msgId?: string) => { /* ... existing ... */ };
  const handleStartTraining = async () => { /* ... existing ... */ };
  const handleQuitTraining = () => { setIsTrainingMode(false); setExercises([]); };
  const handleToggleExplanationLang = () => { /* ... existing ... */ };
  const handleFontSizeChange = (size: any) => { /* ... existing ... */ };
  const handleTutorialComplete = () => { setShowTutorial(false); };
  const handleExerciseComplete = (score: number, total: number) => { /* ... existing ... */ };
  const stopAudio = () => { if (activeSourceRef.current) try { activeSourceRef.current.stop(); } catch(e){} activeSourceRef.current = null; setIsPlayingAudio(false); };
  const handleCopy = async (text: string, id: string) => { /* ... existing ... */ };
  const handleExportPDF = (text: string) => { /* ... existing ... */ };
  const handleExportImage = (msgId: string) => { /* ... existing ... */ };
  const getAudioContext = () => { const AC = window.AudioContext || (window as any).webkitAudioContext; if (!audioContextRef.current || audioContextRef.current.state === 'closed') audioContextRef.current = new AC(); return audioContextRef.current; };
  const handleValidateJump = () => { /* ... existing ... */ };
  const getLanguageDisplay = () => { const lang = preferences.targetLanguage; if (lang.includes("Chinois")) return "Chinois 🇨🇳"; const parts = lang.split(' '); return `${parts[0]} ${parts[parts.length - 1]}`; };
  const isMg = preferences.explanationLanguage === ExplanationLanguage.Malagasy;

  return (
    <div className="flex flex-col h-screen bg-slate-50 dark:bg-slate-950 transition-colors duration-300">
      {/* ... Modals ... */}
      {showPaymentModal && <PaymentModal user={user} onClose={() => setShowPaymentModal(false)} />}
      {showTutorial && <TutorialOverlay onComplete={handleTutorialComplete} />}
      {isDialogueActive && <DialogueSession user={user} onClose={() => setIsDialogueActive(false)} onUpdateUser={onUpdateUser} notify={notify} />}

      {/* Voice Call Overlay */}
      {isCallActive && (
        <div className="fixed inset-0 z-[160] bg-slate-900/95 backdrop-blur-2xl flex flex-col items-center justify-between py-12 px-6 transition-all animate-fade-in overflow-hidden">
            {isAnalyzingCall || callSummary ? (
                /* Analysis UI (Kept same) */
                <div className="w-full max-w-sm bg-white dark:bg-slate-800 rounded-3xl p-6 shadow-2xl animate-fade-in-up mt-20 relative border border-slate-100 dark:border-white/10">
                    <button onClick={closeCallOverlay} className="w-full py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-bold">Fermer</button>
                </div>
            ) : (
                <>
                    <div className="text-center space-y-4 mt-12 z-20">
                        <div className="flex flex-col items-center">
                            <h2 className="text-3xl font-bold text-white tracking-tight drop-shadow-md">TeacherMada</h2>
                            <p className="text-slate-300 text-lg">{preferences.targetLanguage}</p>
                        </div>
                        
                        <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-slate-800/80 border border-slate-700 backdrop-blur-sm text-indigo-200 text-sm font-medium">
                            <div className={`w-2 h-2 rounded-full ${isCallConnecting ? 'bg-amber-500 animate-pulse' : isLoading ? 'bg-indigo-400 animate-pulse' : 'bg-emerald-500'}`}></div>
                            {isCallConnecting ? "Connexion..." : (isLoading ? loadingText : (isListening ? "Je vous écoute..." : "En attente"))}
                        </div>
                        
                        {!isCallConnecting && (
                            <p className="text-4xl font-mono text-white/50 tracking-widest">{Math.floor(callSeconds / 60)}:{(callSeconds % 60).toString().padStart(2, '0')}</p>
                        )}
                    </div>
                    
                    <div className="relative flex items-center justify-center w-full max-w-sm aspect-square z-10">
                        {!isCallConnecting && (isPlayingAudio || isLoading) && (
                            <>
                                <div className="absolute w-56 h-56 rounded-full border border-indigo-500/30 animate-ripple-1"></div>
                                <div className="absolute w-56 h-56 rounded-full border border-indigo-500/20 animate-ripple-2"></div>
                            </>
                        )}
                        <div className={`relative w-40 h-40 ${isPlayingAudio ? 'scale-110' : 'scale-100'} transition-transform duration-500`}>
                            <div className="absolute bottom-0 left-0 right-0 top-4 bg-gradient-to-br from-indigo-600 to-violet-700 rounded-full shadow-[0_10px_40px_-10px_rgba(79,70,229,0.5)]"></div>
                            <div className="absolute inset-0 flex items-end justify-center overflow-visible">
                                 {isCallConnecting ? (
                                     <div className="w-full h-full rounded-full flex items-center justify-center bg-slate-900/50 backdrop-blur-sm">
                                        <Phone className="w-12 h-12 text-white animate-bounce" />
                                     </div>
                                 ) : (
                                     <img src="https://i.ibb.co/B2XmRwmJ/logo.png" alt="TM" className="w-full h-[120%] object-contain -translate-y-2 drop-shadow-xl" onError={(e) => { e.currentTarget.onerror = null; e.currentTarget.src = '/logo.svg'; }} />
                                 )}
                            </div>
                        </div>
                    </div>
                    
                    {/* Voice Controls */}
                    <div className="w-full max-w-xs grid grid-cols-3 gap-6 mb-12 relative z-20">
                        <button onClick={() => setShowVoiceInput(prev => !prev)} className={`flex flex-col items-center gap-2 group`}>
                            <div className={`p-4 rounded-full transition-all ${showVoiceInput ? 'bg-white text-slate-900' : 'bg-slate-800/50 text-white border border-slate-700 hover:bg-slate-700'}`}>
                                <Keyboard className="w-6 h-6" />
                            </div>
                            <span className="text-xs text-slate-400 font-medium">Clavier</span>
                        </button>

                        <button onClick={handleEndCall} className="flex flex-col items-center gap-2 transform hover:scale-105 transition-transform">
                            <div className="p-6 bg-red-500 hover:bg-red-600 text-white rounded-full shadow-[0_0_30px_rgba(239,68,68,0.4)] border-4 border-slate-900/50">
                                <PhoneOff className="w-8 h-8 fill-current" />
                            </div>
                            <span className="text-xs text-slate-400 font-medium">Raccrocher</span>
                        </button>

                        <div className="relative flex flex-col items-center gap-2">
                            <button onClick={toggleListening} className={`p-4 rounded-full transition-all ${isListening ? 'bg-white text-slate-900 ring-4 ring-emerald-500/50' : 'bg-slate-800/50 text-white border border-slate-700 hover:bg-slate-700'}`} disabled={showVoiceInput}>
                                {isListening ? <Mic className="w-6 h-6" /> : <MicOff className="w-6 h-6" />}
                            </button>
                            <span className="text-xs text-slate-400 font-medium">{isListening ? 'Écoute...' : 'Micro'}</span>
                        </div>
                    </div>

                    {showVoiceInput && (
                        <div className="absolute bottom-0 left-0 w-full bg-slate-900/95 backdrop-blur-xl border-t border-slate-700 rounded-t-3xl p-4 animate-slide-up z-50 pb-8">
                            <div className="flex justify-between items-center mb-3 px-1">
                                <span className="text-xs font-bold text-slate-400 uppercase tracking-widest">Message Texte</span>
                                <button onClick={() => setShowVoiceInput(false)} className="p-1 bg-slate-800 rounded-full text-slate-400"><ChevronDown className="w-4 h-4"/></button>
                            </div>
                            <div className="flex gap-2">
                                <input type="text" value={voiceTextInput} onChange={(e) => setVoiceTextInput(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && handleSend(voiceTextInput)} placeholder="Écrivez votre réponse..." className="flex-1 bg-slate-800 text-white rounded-xl px-4 py-3 text-base focus:outline-none focus:ring-2 focus:ring-indigo-500 border border-slate-700 placeholder:text-slate-500" autoFocus />
                                <button onClick={() => handleSend(voiceTextInput)} disabled={!voiceTextInput.trim() || isLoading} className="p-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl disabled:opacity-50 transition-colors shadow-lg">
                                    <Send className="w-5 h-5" />
                                </button>
                            </div>
                        </div>
                    )}
                </>
            )}
        </div>
      )}

      {/* ... Rest of Main UI (Headers, Chat Feed, Input) ... */}
      {/* Kept as standard Chat UI */}
      {/* HEADER */}
      <header className="fixed top-0 left-0 right-0 z-40 bg-white/90 dark:bg-slate-900/95 backdrop-blur-md shadow-sm h-14 md:h-16 px-4 flex items-center justify-between border-b border-slate-100 dark:border-slate-800">
          {/* Controls... */}
          <div className="flex-1 flex items-center gap-2">
             <button onClick={() => { stopAudio(); onChangeMode(); }} className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-full"><ArrowLeft className="w-5 h-5 text-slate-500 dark:text-slate-400"/></button>
             {/* ... */}
          </div>
          {/* ... */}
      </header>

      <div id="chat-feed" className="flex-1 overflow-y-auto p-3 md:p-4 space-y-4 md:space-y-6 pt-20 pb-4 scrollbar-hide">
          {messages.map((msg, idx) => (
              <div key={msg.id} id={`msg-${msg.id}`} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'} animate-fade-in`}>
                  <div className={`flex max-w-[90%] md:max-w-[80%] ${msg.role === 'user' ? 'flex-row-reverse' : 'flex-row'}`}>
                      <div className={`px-4 py-3 rounded-2xl shadow-sm ${textSizeClass} ${msg.role === 'user' ? 'bg-indigo-600 text-white rounded-tr-none' : 'bg-white dark:bg-slate-800 dark:text-slate-200 border border-slate-100 dark:border-slate-700 rounded-tl-none'}`}>
                          {msg.role === 'user' ? msg.text : <MarkdownRenderer content={msg.text} onPlayAudio={(t) => handleSpeak(t)} highlight={searchQuery} />}
                      </div>
                  </div>
              </div>
          ))}
          {(isLoading || isAnalyzing) && (
             <div className="flex justify-start animate-fade-in">
                 <div className="bg-white dark:bg-slate-800 px-4 py-3 rounded-2xl rounded-tl-none border shadow-sm flex items-center gap-2">
                    <Loader2 className="w-4 h-4 animate-spin text-indigo-500"/> <span className="text-sm text-slate-500">TeacherMada écrit...</span>
                 </div>
             </div>
          )}
          <div ref={messagesEndRef} />
      </div>

      <div id="input-area" className="bg-white/80 dark:bg-slate-900/80 backdrop-blur-md border-t border-slate-100 dark:border-slate-800 p-3 md:p-4 sticky bottom-0">
          {/* Toolbar & Input ... */}
          <div className="max-w-4xl mx-auto relative flex items-end gap-2 bg-slate-50 dark:bg-slate-800 rounded-[26px] border border-slate-200 dark:border-slate-700 p-2 shadow-sm focus-within:ring-2 focus-within:ring-indigo-500/50">
            <textarea
                ref={textareaRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder={!canSend ? "Recharge nécessaire..." : "Message.. | Parler..."}
                disabled={isLoading || isAnalyzing}
                rows={1}
                className="w-full bg-transparent text-slate-800 dark:text-white rounded-xl pl-4 py-3 text-base focus:outline-none resize-none max-h-32 scrollbar-hide self-center disabled:opacity-50"
            />
            <div className="flex items-center gap-1 pb-1 pr-1">
                 <button onClick={toggleListening} className={`p-2 rounded-full ${isListening ? 'bg-red-500 text-white animate-pulse' : 'text-slate-400 hover:text-indigo-600 hover:bg-slate-200'}`}>
                    {isListening ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
                 </button>
                 <button onClick={() => handleSend()} disabled={!input.trim() || isLoading} className={`p-2.5 rounded-full text-white transition-all shadow-md transform hover:scale-105 active:scale-95 flex items-center justify-center ${canSend ? 'bg-indigo-600 hover:bg-indigo-700' : 'bg-slate-400 cursor-not-allowed'}`}>
                    {canSend ? <Send className="w-4 h-4" /> : <Lock className="w-4 h-4" />}
                </button>
            </div>
        </div>
      </div>
    </div>
  );
};

export default ChatInterface;
