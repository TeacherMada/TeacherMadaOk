
import React, { useState, useRef, useEffect, useMemo } from 'react';
import { Send, User, Mic, Volume2, ArrowLeft, Loader2, Copy, Check, ArrowRight, Phone, Globe, ChevronDown, MicOff, BookOpen, Search, AlertTriangle, X, Sun, Moon, Languages, Coins, Lock, BrainCircuit, Menu, FileText, Type, RotateCcw, MessageCircle, Image as ImageIcon, Library, PhoneOff, VolumeX, Trophy, Info, ChevronUp, Keyboard, Star } from 'lucide-react';
import { UserProfile, ChatMessage, ExerciseItem, ExplanationLanguage, TargetLanguage, VoiceCallSummary } from '../types';
import { sendMessageToGeminiStream, generateSpeech, generatePracticalExercises, getLessonSummary, translateText, generateConceptImage, generateVoiceChatResponse, analyzeVoiceCallPerformance } from '../services/geminiService';
import { storageService } from '../services/storageService';
import { TOTAL_LESSONS_PER_LEVEL, NEXT_LEVEL_MAP } from '../constants';
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

const TypingIndicator = () => (
  <div className="flex items-center space-x-1 h-6 p-1">
    <div className="w-2 h-2 bg-indigo-400 rounded-full animate-bounce [animation-delay:-0.3s]"></div>
    <div className="w-2 h-2 bg-indigo-400 rounded-full animate-bounce [animation-delay:-0.15s]"></div>
    <div className="w-2 h-2 bg-indigo-400 rounded-full animate-bounce"></div>
  </div>
);

const ChatInterface: React.FC<ChatInterfaceProps> = ({ 
  user, messages, setMessages, onChangeMode, onShowProfile, onUpdateUser, isDarkMode, toggleTheme, isAnalyzing, onMessageSent, fontSize, notify
}) => {
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isPlayingAudio, setIsPlayingAudio] = useState(false);
  const [showMenu, setShowMenu] = useState(false);
  const [showSmartOptions, setShowSmartOptions] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [isTranslating, setIsTranslating] = useState(false);
  const [isListening, setIsListening] = useState(false);
  
  const [isCallActive, setIsCallActive] = useState(false);
  const [isCallConnecting, setIsCallConnecting] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [callSeconds, setCallSeconds] = useState(0);
  const [loadingText, setLoadingText] = useState("TeacherMada écoute...");
  const [callSummary, setCallSummary] = useState<VoiceCallSummary | null>(null);
  const [isAnalyzingCall, setIsAnalyzingCall] = useState(false);
  const [showVoiceInput, setShowVoiceInput] = useState(false);
  
  const [generatedImage, setGeneratedImage] = useState<string | null>(null);
  const [isGeneratingImage, setIsGeneratingImage] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [currentMatchIndex, setCurrentMatchIndex] = useState(0);
  const [isTrainingMode, setIsTrainingMode] = useState(false);
  const [exercises, setExercises] = useState<ExerciseItem[]>([]);
  const [isLoadingExercises, setIsLoadingExercises] = useState(false);
  const [exerciseError, setExerciseError] = useState(false);
  const [isDialogueActive, setIsDialogueActive] = useState(false);
  const [showSummaryResultModal, setShowSummaryResultModal] = useState(false);
  const [summaryContent, setSummaryContent] = useState('');
  const [isGeneratingSummary, setIsGeneratingSummary] = useState(false);
  const [summaryInputVal, setSummaryInputVal] = useState('');
  const [jumpInputVal, setJumpInputVal] = useState('');
  const [showTutorial, setShowTutorial] = useState(false);
  const [showPaymentModal, setShowPaymentModal] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const chatContainerRef = useRef<HTMLDivElement>(null); 
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  
  const audioContextRef = useRef<AudioContext | null>(null);
  const activeSourceRef = useRef<AudioBufferSourceNode | null>(null);
  const recognitionRef = useRef<any>(null);
  const lastSpokenMessageId = useRef<string | null>(null);

  const preferences = user.preferences!;

  const progressData = useMemo(() => {
      const currentLang = preferences.targetLanguage;
      const currentLevel = preferences.level;
      const courseKey = `${currentLang}-${currentLevel}`;
      const lessonsDone = user.stats.progressByLevel?.[courseKey] || 0;
      const percentage = Math.min((lessonsDone / 50) * 100, 100);
      return { lessonsDone, percentage };
  }, [user.stats.progressByLevel, preferences.targetLanguage, preferences.level]);

  const lastLessonInChat = useMemo(() => {
    for (let i = messages.length - 1; i >= 0; i--) {
        if (messages[i].role === 'model') {
            const match = messages[i].text.match(/##\s*(?:🟢|🔴|🔵)?\s*(?:LEÇON|LECON|LESSON|LESONA)\s*(\d+)/i);
            if (match) return parseInt(match[1], 10);
        }
    }
    return 0;
  }, [messages]);

  const displayedLessonNumber = useMemo(() => {
    if (lastLessonInChat > 0) return lastLessonInChat.toString();
    return (progressData.lessonsDone + 1).toString();
  }, [lastLessonInChat, progressData.lessonsDone]);

  // Search Logic
  const matchingMessages = useMemo(() => {
    if (!searchQuery.trim()) return [];
    return messages
      .map((m, i) => ({ id: m.id, index: i, match: m.text.toLowerCase().includes(searchQuery.toLowerCase()) }))
      .filter(m => m.match);
  }, [messages, searchQuery]);

  useEffect(() => {
    setCurrentMatchIndex(0);
  }, [searchQuery]);

  useEffect(() => {
    if (matchingMessages.length > 0) {
      const match = matchingMessages[currentMatchIndex];
      const el = document.getElementById(`msg-${match.id}`);
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }
  }, [currentMatchIndex, matchingMessages]);

  const handleNextMatch = () => {
    if (matchingMessages.length === 0) return;
    setCurrentMatchIndex(prev => (prev + 1) % matchingMessages.length);
  };

  const handlePrevMatch = () => {
    if (matchingMessages.length === 0) return;
    setCurrentMatchIndex(prev => (prev - 1 + matchingMessages.length) % matchingMessages.length);
  };

  // SMART AUTO-SCROLL
  const scrollToBottom = (force = false) => { 
      if (chatContainerRef.current) {
          const { scrollTop, scrollHeight, clientHeight } = chatContainerRef.current;
          // Only scroll if user is already near bottom (150px tolerance) OR if forced
          const isNearBottom = scrollHeight - scrollTop - clientHeight < 150;
          if (force || isNearBottom) {
              messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }); 
          }
      }
  };

  useEffect(() => { 
      if (!isTrainingMode && !isDialogueActive && !searchQuery) scrollToBottom(false); 
  }, [messages.length, isTrainingMode, isDialogueActive, isLoading]);

  useEffect(() => {
    if (textareaRef.current) {
        textareaRef.current.style.height = 'auto';
        textareaRef.current.style.height = Math.min(textareaRef.current.scrollHeight, 150) + 'px';
    }
  }, [input]);

  const getTextSizeClass = () => {
      switch (fontSize) {
          case 'small': return 'text-sm';
          case 'large': return 'text-lg';
          case 'xl': return 'text-xl leading-relaxed';
          default: return 'text-base';
      }
  };
  const textSizeClass = getTextSizeClass();

  // ROBUST AUDIO CONTEXT SINGLETON
  const getAudioContext = async () => {
      if (!audioContextRef.current) {
          audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
      }
      if (audioContextRef.current.state === 'suspended') {
          await audioContextRef.current.resume();
      }
      return audioContextRef.current;
  };

  const stopListening = () => {
    if (recognitionRef.current) {
        try { recognitionRef.current.stop(); } catch(e){}
        recognitionRef.current = null;
    }
    setIsListening(false);
  };

  const startListening = () => {
    if (isMuted && isCallActive) {
        notify("Micro désactivé.", 'info');
        return;
    }

    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      notify("Reconnaissance vocale non supportée", 'error');
      return;
    }
    const recognition = new SpeechRecognition();
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.lang = 'fr-FR'; 
    
    recognition.onstart = () => setIsListening(true);
    recognition.onend = () => setIsListening(false);
    recognition.onerror = (e: any) => { console.error(e); setIsListening(false); };
    recognition.onresult = (e: any) => {
      const text = e.results[0][0].transcript;
      if (isCallActive) { handleSend(text); } else { setInput(prev => prev + (prev ? ' ' : '') + text); }
    };
    recognitionRef.current = recognition;
    recognition.start();
  };

  const toggleListening = () => { if (isListening) stopListening(); else startListening(); };

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
      
      // Warm up audio context on user click
      getAudioContext().then(() => {
          setTimeout(() => {
              setIsCallConnecting(false);
              const isMg = preferences.explanationLanguage === ExplanationLanguage.Malagasy;
              const greeting = isMg 
                ? `Allô ${user.username} ! 😊 Hianatra ${preferences.targetLanguage} miaraka isika...`
                : `Allô ${user.username} ! 😊 Nous allons pratiquer le ${preferences.targetLanguage}...`;
              handleSpeak(greeting);
          }, 1500);
      });
  };

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
    
    const userMsg: ChatMessage = { id: Date.now().toString(), role: 'user', text: textToSend, timestamp: Date.now() };
    const tempAiId = (Date.now() + 1).toString();
    const historyForAI = [...messages, userMsg];

    setMessages(prev => [...prev, userMsg, { id: tempAiId, role: 'model', text: '', timestamp: Date.now() }]);
    storageService.saveChatHistory(user.id, historyForAI, preferences.targetLanguage);
    
    setInput('');
    setGeneratedImage(null);
    setIsLoading(true);
    onMessageSent();
    
    setTimeout(() => scrollToBottom(true), 100);

    try {
      let finalResponseText = "";
      
      if (isCallActive) {
          finalResponseText = await generateVoiceChatResponse(textToSend, user.id, historyForAI);
          setMessages(prev => prev.map(m => m.id === tempAiId ? { ...m, text: finalResponseText } : m));
      } else {
          // STREAMING
          const res = await sendMessageToGeminiStream(textToSend, user.id, historyForAI, (chunk) => {
              setMessages(currentMsgs => {
                  const msgs = [...currentMsgs];
                  const lastMsgIndex = msgs.findIndex(m => m.id === tempAiId);
                  if (lastMsgIndex !== -1) {
                      msgs[lastMsgIndex] = { ...msgs[lastMsgIndex], text: msgs[lastMsgIndex].text + chunk };
                  }
                  return msgs;
              });
              // Smart Scroll Trigger during stream
              scrollToBottom(false); 
          });
          finalResponseText = res.fullText;
      }
      
      const finalHistory = [...messages, userMsg, { id: tempAiId, role: 'model', text: finalResponseText, timestamp: Date.now() }];
      storageService.saveChatHistory(user.id, finalHistory as ChatMessage[], preferences.targetLanguage);
      
      if (isCallActive) handleSpeak(finalResponseText);
      const updated = storageService.getUserById(user.id);
      if(updated) onUpdateUser(updated);

    } catch (error: any) {
      setMessages(prev => prev.filter(m => m.id !== tempAiId));
      if (error.message.includes('INSUFFICIENT_CREDITS')) {
         setShowPaymentModal(true);
         notify("Crédits insuffisants.", 'error');
      } else {
         notify("Erreur de connexion.", 'error');
      }
    } finally { 
      setIsLoading(false); 
    }
  };

  const handleTranslateInput = async () => {
    if (!input.trim()) return;
    setIsTranslating(true);
    try {
        const translation = await translateText(input, preferences.targetLanguage, user.id);
        setInput(translation);
    } catch (e: any) { if(e.message === 'INSUFFICIENT_CREDITS') setShowPaymentModal(true); } 
    finally { setIsTranslating(false); }
  };
  
  const handleGenerateImage = async () => {
    setIsGeneratingImage(true); setShowSmartOptions(false);
    try {
        const prompt = `Digital illustration of ${preferences.targetLanguage} culture: ${input}`;
        const base64 = await generateConceptImage(prompt, user.id);
        if (base64) setGeneratedImage(base64);
    } catch (e: any) { if(e.message === 'INSUFFICIENT_CREDITS') setShowPaymentModal(true); } 
    finally { setIsGeneratingImage(false); }
  };

  const handleSpeak = async (text: string, msgId?: string) => {
    stopAudio();
    stopListening();
    if (msgId) lastSpokenMessageId.current = msgId;
    setIsPlayingAudio(true);
    const cleanText = text.replace(/[*#_`~]/g, '');
    try {
        const rawAudioBuffer = await generateSpeech(cleanText, user.id);
        if (rawAudioBuffer) {
            const ctx = await getAudioContext();
            const decoded = await ctx.decodeAudioData(rawAudioBuffer);
            const source = ctx.createBufferSource();
            source.buffer = decoded;
            source.connect(ctx.destination);
            activeSourceRef.current = source;
            source.onended = () => { setIsPlayingAudio(false); if (isCallActive) startListening(); };
            source.start(0);
        } else { setIsPlayingAudio(false); if (isCallActive) startListening(); }
    } catch (error: any) { setIsPlayingAudio(false); if (isCallActive) startListening(); if(error.message === 'INSUFFICIENT_CREDITS') setShowPaymentModal(true); }
  };

  // --- Training Mode Handlers ---
  const handleStartTraining = async () => {
      setShowSmartOptions(false);
      setIsTrainingMode(true);
      setExercises([]);
      setExerciseError(false);
      try {
          if (!storageService.canPerformRequest(user.id).allowed) {
             throw new Error('INSUFFICIENT_CREDITS');
          }
          setIsLoadingExercises(true);
          const gen = await generatePracticalExercises(user, messages);
          if (gen.length === 0) throw new Error("No exercises generated");
          setExercises(gen);
          
          const updated = storageService.getUserById(user.id);
          if(updated) onUpdateUser(updated);
      } catch(e: any) {
          console.error(e);
          setExerciseError(true);
          if(e.message === 'INSUFFICIENT_CREDITS') {
              setShowPaymentModal(true);
              setIsTrainingMode(false);
          } else {
              notify("Erreur de génération. Réessayez.", 'error');
          }
      } finally {
          setIsLoadingExercises(false);
      }
  };

  const handleQuitTraining = () => {
      setIsTrainingMode(false);
      setExercises([]);
  };

  const handleExerciseComplete = (score: number, total: number) => { 
      setIsTrainingMode(false); 
      const resultMsg: ChatMessage = { id: Date.now().toString(), role: 'model', text: `🎯 **Session d'entraînement terminée !**\n\nScore : **${score}/${total}**\n\nContinuez comme ça !`, timestamp: Date.now() }; 
      setMessages([...messages, resultMsg]); 
      storageService.saveChatHistory(user.id, [...messages, resultMsg], preferences.targetLanguage); 
      onMessageSent(); 
  };

  const handleTutorialComplete = () => { 
      setShowTutorial(false); 
      storageService.markTutorialSeen(user.id); 
      onUpdateUser({ ...user, hasSeenTutorial: true }); 
  };

  const stopAudio = () => { 
      if (activeSourceRef.current) { 
          try { activeSourceRef.current.stop(); } catch(e){} 
          activeSourceRef.current = null; 
      } 
      setIsPlayingAudio(false); 
  };
  
  const handleCopy = async (text: string, id: string) => { try { await navigator.clipboard.writeText(text); setCopiedId(id); setTimeout(() => setCopiedId(null), 2000); } catch (err) {} };
  
  const handleExportPDF = (text: string) => {
     const doc = new jsPDF();
     doc.setFontSize(10);
     doc.text(text.replace(/[*#]/g, ''), 10, 10);
     doc.save(`lecon_${Date.now()}.pdf`);
  };
  
  const handleExportImage = (msgId: string) => { 
      const element = document.getElementById(`msg-content-${msgId}`);
      if (!element) return;
      try {
          // @ts-ignore
          window.html2canvas(element).then((canvas: any) => {
              const link = document.createElement('a');
              link.download = `teacher_mada_${msgId}.png`;
              link.href = canvas.toDataURL();
              link.click();
          });
      } catch(e) { notify("Erreur export", 'error'); }
  };
  
  const getLanguageDisplay = () => { const lang = preferences.targetLanguage; if (lang.includes("Chinois")) return "Chinois 🇨🇳"; const parts = lang.split(' '); return `${parts[0]} ${parts[parts.length - 1]}`; };
  
  const handleEndCall = async () => { stopListening(); stopAudio(); closeCallOverlay(); };
  const closeCallOverlay = () => { setIsCallActive(false); setIsCallConnecting(false); setCallSummary(null); setIsMuted(false); setCallSeconds(0); setShowVoiceInput(false); };
  const toggleMute = () => setIsMuted(!isMuted);

  return (
    <div className="flex flex-col h-screen bg-slate-50 dark:bg-slate-950 transition-colors duration-300">
      {showPaymentModal && <PaymentModal user={user} onClose={() => setShowPaymentModal(false)} />}
      {showTutorial && <TutorialOverlay onComplete={handleTutorialComplete} />}
      {isDialogueActive && <DialogueSession user={user} onClose={() => setIsDialogueActive(false)} onUpdateUser={onUpdateUser} notify={notify} />}

      {/* Training Overlay */}
      {isTrainingMode && (
          <div className="fixed inset-0 z-50 bg-white dark:bg-slate-950 flex flex-col">
              {isLoadingExercises ? (
                  <div className="flex-1 flex flex-col items-center justify-center space-y-4">
                      <div className="relative">
                          <div className="w-16 h-16 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin"></div>
                          <BrainCircuit className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-8 h-8 text-indigo-600" />
                      </div>
                      <h3 className="text-xl font-bold text-slate-800 dark:text-white">Génération des exercices...</h3>
                      <p className="text-slate-500">TeacherMada analyse vos progrès.</p>
                  </div>
              ) : exerciseError ? (
                  <div className="flex-1 flex flex-col items-center justify-center p-6 text-center">
                      <AlertTriangle className="w-12 h-12 text-red-500 mb-4" />
                      <h3 className="text-xl font-bold mb-2">Erreur de génération</h3>
                      <button onClick={handleStartTraining} className="px-6 py-2 bg-indigo-600 text-white rounded-lg">Réessayer</button>
                      <button onClick={handleQuitTraining} className="mt-4 text-slate-500">Annuler</button>
                  </div>
              ) : (
                  <ExerciseSession exercises={exercises} onClose={handleQuitTraining} onComplete={handleExerciseComplete} />
              )}
          </div>
      )}

      {/* Header */}
      <header className="fixed top-0 left-0 right-0 z-40 bg-white/90 dark:bg-slate-900/95 backdrop-blur-md shadow-sm h-14 md:h-16 px-4 flex items-center justify-between border-b border-slate-100 dark:border-slate-800">
        <div className="flex-1 flex items-center gap-2 relative">
          <button onClick={() => { stopAudio(); onChangeMode(); }} disabled={isAnalyzing} className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-full transition-all group disabled:opacity-50 shrink-0">
             {isAnalyzing ? <Loader2 className="w-5 h-5 animate-spin text-indigo-600" /> : <ArrowLeft className="w-5 h-5 text-slate-500 dark:text-slate-400 group-hover:text-indigo-600" />}
          </button>
          <button onClick={() => setShowSmartOptions(!showSmartOptions)} className="flex items-center gap-2 px-3 py-1.5 bg-indigo-50 dark:bg-indigo-900/20 text-indigo-800 dark:text-indigo-300 rounded-full border border-indigo-100 dark:border-indigo-900/50 hover:bg-indigo-100 dark:hover:bg-indigo-900/40 transition-colors max-w-full overflow-hidden">
             <Globe className="w-4 h-4 shrink-0" />
             <span className="text-xs font-bold whitespace-nowrap truncate">{getLanguageDisplay()}</span>
             <ChevronDown className={`w-3 h-3 transition-transform shrink-0 ${showSmartOptions ? 'rotate-180' : ''}`} />
          </button>
          {showSmartOptions && (
              <div className="absolute top-12 left-0 md:left-10 w-64 bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-100 dark:border-slate-700 p-2 animate-fade-in z-50">
                  <div className="space-y-1">
                      <button onClick={handleStartTraining} className="w-full text-left p-2.5 hover:bg-slate-50 dark:hover:bg-slate-800 rounded-lg flex items-center gap-3 text-sm font-medium transition-colors"><BrainCircuit className="w-4 h-4 text-orange-500"/><span className="text-slate-700 dark:text-slate-300">Exercice Pratique</span></button>
                      <button onClick={handleStartCall} className="w-full text-left p-2.5 hover:bg-slate-50 dark:hover:bg-slate-800 rounded-lg flex items-center gap-3 text-sm font-medium transition-colors"><Phone className="w-4 h-4 text-purple-500"/><span className="text-slate-700 dark:text-slate-300">Appel Vocal</span></button>
                       <button onClick={() => { setShowSmartOptions(false); onChangeMode(); }} className="w-full text-left p-2.5 hover:bg-slate-50 dark:hover:bg-slate-800 rounded-lg flex items-center gap-3 text-sm font-medium transition-colors group"><Library className="w-4 h-4 text-indigo-500"/><span className="text-slate-700 dark:text-slate-300">Autres Cours</span></button>
                  </div>
              </div>
          )}
        </div>
        <div className="flex flex-col items-center w-auto shrink-0 px-2">
             <h2 className="text-base md:text-lg font-black text-slate-800 dark:text-white flex items-center gap-2 whitespace-nowrap">Leçon {displayedLessonNumber}</h2>
        </div>
        <div className="flex-1 flex items-center justify-end gap-2">
             <button onClick={() => setShowPaymentModal(true)} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full border transition-colors group bg-indigo-50 dark:bg-indigo-900/20 border-indigo-100 dark:border-indigo-800/50`}>
                  <Coins className={`w-3.5 h-3.5 text-amber-500 group-hover:rotate-12 transition-transform`} />
                  <span className={`text-xs font-bold text-indigo-900 dark:text-indigo-100 hidden sm:inline`}>{user.role === 'admin' ? '∞' : user.credits}</span>
             </button>
             <div className="relative">
                 <button onClick={() => setShowMenu(!showMenu)} className={`p-2 rounded-full transition-colors ${showMenu ? 'bg-indigo-100 dark:bg-indigo-900/50 text-indigo-600' : 'text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'}`}><Menu className="w-5 h-5" /></button>
                 
                 {showMenu && (
                     <div className="absolute top-12 right-0 w-80 bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-100 dark:border-slate-700 p-3 animate-fade-in z-50">
                         {/* Enhanced Search */}
                         <div className="p-2 border-b border-slate-100 dark:border-slate-800 mb-2">
                             <div className="relative flex items-center">
                                 <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400"/>
                                 <input 
                                    type="text" 
                                    placeholder="Rechercher..." 
                                    value={searchQuery}
                                    onChange={(e) => setSearchQuery(e.target.value)}
                                    className="w-full bg-slate-50 dark:bg-black/20 text-sm py-2 pl-9 pr-16 rounded-lg border-none outline-none focus:ring-1 focus:ring-indigo-500"
                                 />
                                 {searchQuery && matchingMessages.length > 0 && (
                                     <div className="absolute right-1 flex items-center gap-1">
                                         <span className="text-[10px] text-slate-400 font-bold mr-1">{currentMatchIndex + 1}/{matchingMessages.length}</span>
                                         <button onClick={handlePrevMatch} className="p-1 hover:bg-slate-200 dark:hover:bg-slate-700 rounded"><ChevronUp className="w-3 h-3 text-slate-500"/></button>
                                         <button onClick={handleNextMatch} className="p-1 hover:bg-slate-200 dark:hover:bg-slate-700 rounded"><ChevronDown className="w-3 h-3 text-slate-500"/></button>
                                     </div>
                                 )}
                             </div>
                         </div>
                        
                         <div className="grid grid-cols-2 gap-2 mb-2 border-t border-slate-100 dark:border-slate-800 pt-2">
                             <button onClick={toggleTheme} className="p-3 hover:bg-slate-50 dark:hover:bg-slate-800 rounded-lg flex items-center justify-center gap-2 transition-colors">
                                 {isDarkMode ? <Sun className="w-4 h-4 text-amber-500"/> : <Moon className="w-4 h-4 text-indigo-500"/>}
                                 <span className="text-xs font-bold text-slate-600 dark:text-slate-300">Thème</span>
                             </button>
                         </div>
                     </div>
                 )}
             </div>
             
             <button onClick={onShowProfile} className="relative w-9 h-9 ml-1 group shrink-0">
                <div className="relative w-full h-full rounded-full bg-slate-900 text-white font-bold flex items-center justify-center border-2 border-white dark:border-slate-800 z-10 overflow-hidden">
                    <span className="z-10">{user.username.substring(0, 2).toUpperCase()}</span>
                </div>
             </button>
        </div>
      </header>
      
      {/* Chat Area */}
      <div id="chat-feed" ref={chatContainerRef} className={`flex-1 overflow-y-auto p-3 md:p-4 space-y-4 md:space-y-6 pt-20 pb-4 scrollbar-hide`}>
        {messages.filter(msg => !searchQuery || msg.text.toLowerCase().includes(searchQuery.toLowerCase())).map((msg, index) => {
            const isCurrentMatch = matchingMessages[currentMatchIndex]?.id === msg.id;
            return (
                <div key={msg.id} id={`msg-${msg.id}`} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'} animate-fade-in`}>
                    <div className={`flex max-w-[90%] md:max-w-[80%] ${msg.role === 'user' ? 'flex-row-reverse' : 'flex-row'}`}>
                        {msg.role === 'user' ? (
                            <div className="flex-shrink-0 w-8 h-8 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-white font-bold text-xs shadow-sm mt-1 mx-2 border border-white dark:border-slate-800">{user.username.charAt(0).toUpperCase()}</div>
                        ) : (
                            <div className="flex-shrink-0 w-8 h-8 rounded-full bg-white border flex items-center justify-center mt-1 mx-2 p-1 overflow-hidden">
                                <img src="https://i.ibb.co/B2XmRwmJ/logo.png" className="w-full h-full object-contain" alt="Teacher" onError={(e) => { e.currentTarget.style.display = 'none'; }} />
                            </div>
                        )}
                        <div id={`msg-content-${msg.id}`} className={`px-4 py-3 rounded-2xl shadow-sm ${textSizeClass} transition-all duration-300 ${msg.role === 'user' ? 'bg-indigo-600 text-white rounded-tr-none' : 'bg-white dark:bg-slate-800 dark:text-slate-200 text-slate-800 rounded-tl-none border border-slate-100 dark:border-slate-700'} ${isCurrentMatch ? 'ring-4 ring-yellow-400/50' : ''}`}>
                             {msg.role === 'user' ? <p className="whitespace-pre-wrap">{msg.text}</p> : (
                                <>
                                    <MarkdownRenderer content={msg.text} onPlayAudio={(t) => handleSpeak(t)} highlight={searchQuery} />
                                    {/* Action Buttons */}
                                    <div className="flex items-center gap-2 mt-2 pt-2 border-t border-slate-100 dark:border-slate-700/50" data-html2canvas-ignore>
                                        <button onClick={() => handleSpeak(msg.text, msg.id)} className="p-1 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-full transition-colors"><Volume2 className="w-4 h-4 text-slate-400 hover:text-indigo-500"/></button>
                                        <button onClick={() => handleCopy(msg.text, msg.id)} className="p-1 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-full transition-colors">{copiedId === msg.id ? <Check className="w-4 h-4 text-emerald-500"/> : <Copy className="w-4 h-4 text-slate-400"/>}</button>
                                        <button onClick={() => handleExportImage(msg.id)} className="p-1 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-full transition-colors"><ImageIcon className="w-4 h-4 text-slate-400 hover:text-purple-500"/></button>
                                    </div>
                                </>
                             )}
                        </div>
                    </div>
                </div>
            );
        })}
        {(isLoading || isAnalyzing) && (
             <div className="flex justify-start animate-fade-in">
                 <div className="flex-shrink-0 w-8 h-8 rounded-full bg-white border flex items-center justify-center mt-1 mx-2 p-1"><img src="https://i.ibb.co/B2XmRwmJ/logo.png" className="w-full h-full object-contain" alt="Teacher" /></div>
                 <div className="bg-white dark:bg-slate-800 px-4 py-3 rounded-2xl rounded-tl-none border shadow-sm flex items-center gap-2 min-w-[120px]"><TypingIndicator /></div>
             </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input Area */}
      <div id="input-area" className="bg-white/80 dark:bg-slate-900/80 backdrop-blur-md border-t border-slate-100 dark:border-slate-800 p-3 md:p-4 sticky bottom-0">
        <div className="max-w-4xl mx-auto relative flex items-end gap-2 bg-slate-50 dark:bg-slate-800 rounded-[26px] border border-slate-200 dark:border-slate-700 p-2 shadow-sm focus-within:ring-2 focus-within:ring-indigo-500/50">
            <textarea
                ref={textareaRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder={"Message..."}
                disabled={isLoading || isAnalyzing}
                rows={1}
                className="w-full bg-transparent text-slate-800 dark:text-white rounded-xl pl-4 py-3 text-base focus:outline-none resize-none max-h-32 scrollbar-hide self-center disabled:opacity-50"
            />
            <div className="flex items-center gap-1 pb-1 pr-1">
                 <button onClick={handleTranslateInput} disabled={!input.trim() || isTranslating} className="p-2 rounded-full text-slate-400 hover:text-indigo-600 hover:bg-slate-200 dark:hover:bg-slate-700 disabled:opacity-50"><Languages className={`w-5 h-5 ${isTranslating ? 'animate-spin text-indigo-600' : ''}`} /></button>
                 <button onClick={toggleListening} className={`p-2 rounded-full ${isListening ? 'bg-red-500 text-white animate-pulse' : 'text-slate-400 hover:text-indigo-600 hover:bg-slate-200'}`}><Mic className="w-5 h-5" /></button>
                 <button onClick={() => handleSend()} disabled={!input.trim() || isLoading || isAnalyzing} className={`p-2.5 rounded-full text-white transition-all shadow-md transform hover:scale-105 active:scale-95 flex items-center justify-center bg-indigo-600 hover:bg-indigo-700`}><Send className="w-4 h-4" /></button>
            </div>
        </div>
      </div>
    </div>
  );
};

export default ChatInterface;
