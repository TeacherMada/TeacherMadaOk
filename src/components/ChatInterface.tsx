
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

// --- TYPING INDICATOR COMPONENT ---
const TypingIndicator = () => (
  <div className="flex items-center space-x-1 h-6 p-1">
    <div className="w-2 h-2 bg-indigo-400 rounded-full animate-bounce [animation-delay:-0.3s]"></div>
    <div className="w-2 h-2 bg-indigo-400 rounded-full animate-bounce [animation-delay:-0.15s]"></div>
    <div className="w-2 h-2 bg-indigo-400 rounded-full animate-bounce"></div>
  </div>
);

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
  const [isSending, setIsSending] = useState(false); 
  const [isPlayingAudio, setIsPlayingAudio] = useState(false);
  const [showMenu, setShowMenu] = useState(false);
  const [showSmartOptions, setShowSmartOptions] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  
  const [isTranslating, setIsTranslating] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [imgErrors, setImgErrors] = useState<Record<string, boolean>>({});
  
  // Voice Call State
  const [isCallActive, setIsCallActive] = useState(false);
  const [isCallConnecting, setIsCallConnecting] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [callSeconds, setCallSeconds] = useState(0);
  const [loadingText, setLoadingText] = useState("TeacherMada écoute...");
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
  const chatContainerRef = useRef<HTMLDivElement>(null); 
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const lastSpokenMessageId = useRef<string | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const activeSourceRef = useRef<AudioBufferSourceNode | null>(null);
  const recognitionRef = useRef<any>(null);
  const preferences = user.preferences!;

  // --- SMART PROGRESS CALCULATION (Per Language) ---
  const progressData = useMemo(() => {
      const currentLang = preferences.targetLanguage;
      const currentLevel = preferences.level;
      const courseKey = `${currentLang}-${currentLevel}`;
      
      const lessonsDone = user.stats.progressByLevel?.[courseKey] || 0;
      
      // La barre est pleine à 50 leçons
      const percentage = Math.min((lessonsDone / 50) * 100, 100);
      const isLevelComplete = lessonsDone >= 50;
      
      // Determine target level label
      const nextLevelLabel = NEXT_LEVEL_MAP[currentLevel] || 'Expert';

      return { 
          lessonsDone, 
          total: 50, 
          percentage, 
          courseKey,
          nextLevelLabel,
          isLevelComplete
      };
  }, [user.stats.progressByLevel, preferences.targetLanguage, preferences.level]);

  // --- LESSON NUMBER LOGIC ---
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

  // Dynamic Loading Text Logic for Voice Call
  useEffect(() => {
      let timer1: any, timer2: any;
      if (isLoading && isCallActive) {
          setLoadingText("...");
          timer1 = setTimeout(() => { setLoadingText("TeacherMada réfléchit..."); }, 2000);
          timer2 = setTimeout(() => { setLoadingText("Je formule ma réponse..."); }, 5000);
      } else {
          setLoadingText("Je vous écoute...");
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
    recognition.continuous = false; // False is more stable on mobile
    recognition.interimResults = false;
    
    let lang = 'fr-FR';
    if (preferences.targetLanguage.includes("Anglais")) lang = 'en-US';
    else if (preferences.targetLanguage.includes("Espagnol")) lang = 'es-ES';
    else if (preferences.targetLanguage.includes("Allemand")) lang = 'de-DE';
    else if (preferences.targetLanguage.includes("Chinois")) lang = 'zh-CN';
    
    recognition.lang = lang;
    
    recognition.onstart = () => setIsListening(true);
    recognition.onend = () => {
        setIsListening(false);
        // Auto-restart if in call and not processing (Stability Fix)
        if (isCallActive && !isLoading && !isPlayingAudio) {
            // Small delay to prevent tight loops
            setTimeout(() => {
                if(isCallActive && !isListening) startListening();
            }, 300); 
        }
    };
    recognition.onerror = (e: any) => { 
        console.error(e); 
        setIsListening(false);
    };
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

  // SMART SCROLL
  const scrollToBottom = () => { 
      if (chatContainerRef.current) {
          const { scrollTop, scrollHeight, clientHeight } = chatContainerRef.current;
          // Only scroll if user is already near bottom to avoid annoying jumps while reading previous messages
          if (scrollHeight - scrollTop - clientHeight < 200) {
              messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }); 
          }
      }
  };

  useEffect(() => { 
      // Force scroll on new message or mode change
      if (!isTrainingMode && !isDialogueActive && !searchQuery) scrollToBottom(); 
  }, [messages.length, isTrainingMode, isDialogueActive, isLoading]);

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
  const freeUsageLeft = isFreeTier ? Math.max(0, 3 - user.freeUsage.count) : 0;
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
      
      // Artificial connection delay for realism
      setTimeout(() => {
          stopRingback();
          setIsCallConnecting(false);
          
          // Personalized TeacherMada Greeting
          const isMg = preferences.explanationLanguage === ExplanationLanguage.Malagasy;
          const greeting = isMg 
            ? `Salama ${user.username} ! TeacherMada eto. Vonona hiresaka amin'ny ${preferences.targetLanguage} ve ianao ?`
            : `Bonjour ${user.username}, ici TeacherMada ! On pratique un peu ton ${preferences.targetLanguage} ? Je t'écoute.`;
          
          handleSpeak(greeting);
      }, 3500);
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
    
    if (!textToSend.trim() || isLoading || isAnalyzing || isSending) return;

    if (!storageService.canPerformRequest(user.id).allowed) {
        notify("Crédit insuffisant.", 'error');
        setShowPaymentModal(true);
        if (isCallActive) handleEndCall();
        return;
    }
    
    setIsSending(true);

    // 1. Prepare UI Update - User Message
    const userMsg: ChatMessage = { id: Date.now().toString(), role: 'user', text: textToSend, timestamp: Date.now() };
    const historyForAI = [...messages]; 

    // 2. Prepare Placeholder for Streaming - AI Message
    // This allows the user to see "something is happening" immediately
    const tempAiId = (Date.now() + 1).toString();
    const placeholderMsg: ChatMessage = { id: tempAiId, role: 'model', text: '', timestamp: Date.now() };

    // Update state with both messages
    const updatedMessages = [...messages, userMsg, placeholderMsg];
    setMessages(updatedMessages);
    
    // Save user message to history immediately
    storageService.saveChatHistory(user.id, [...messages, userMsg], preferences.targetLanguage);
    
    setInput('');
    setVoiceTextInput('');
    setGeneratedImage(null);
    setIsLoading(true); // Sets typing indicator if using that state, or spinner
    onMessageSent();

    try {
      let finalResponseText = "";
      
      if (isCallActive) {
          // Voice Mode doesn't stream visually the same way to keep audio cohesive
          finalResponseText = await generateVoiceChatResponse(textToSend, user.id, historyForAI);
          
          // Update the placeholder with full text
          setMessages(prev => prev.map(m => m.id === tempAiId ? { ...m, text: finalResponseText } : m));
      } else {
          // Text Mode - REAL STREAMING
          const res = await sendMessageToGeminiStream(textToSend, user.id, historyForAI, (chunk) => {
              setMessages(currentMsgs => {
                  const lastMsg = currentMsgs[currentMsgs.length - 1];
                  // Only update if the last message is indeed our placeholder
                  if (lastMsg && lastMsg.id === tempAiId) {
                      return [
                          ...currentMsgs.slice(0, -1),
                          { ...lastMsg, text: lastMsg.text + chunk }
                      ];
                  }
                  return currentMsgs;
              });
              // Stop "thinking" spinner as soon as first chunk arrives
              setIsLoading(false); 
          });
          finalResponseText = res.fullText;
      }
      
      // Finalize history save
      const finalHistory = [...messages, userMsg, { id: tempAiId, role: 'model', text: finalResponseText, timestamp: Date.now() }];
      storageService.saveChatHistory(user.id, finalHistory as ChatMessage[], preferences.targetLanguage);
      
      if (isCallActive) {
          handleSpeak(finalResponseText);
      }
      
      refreshUserData();
    } catch (error) {
      // If error, remove the placeholder or show error text
      setMessages(prev => prev.filter(m => m.id !== tempAiId));
      handleErrorAction(error);
    } finally { 
      setIsLoading(false); 
      setIsSending(false); 
    }
  };

  const handleTranslateInput = async () => {
    if (!input.trim()) return;
    setIsTranslating(true);
    try {
        const translation = await translateText(input, preferences.targetLanguage, user.id);
        setInput(translation);
    } catch (e: any) {
        if(e.message === 'INSUFFICIENT_CREDITS') setShowPaymentModal(true);
    } finally { setIsTranslating(false); }
  };
  
  const handleGenerateImage = async () => {
    setIsGeneratingImage(true); setShowSmartOptions(false);
    try {
        const prompt = `Digital illustration of ${preferences.targetLanguage} culture or concept: ${input}`;
        const base64 = await generateConceptImage(prompt, user.id);
        if (base64) setGeneratedImage(base64);
    } catch (e: any) {
        if(e.message === 'INSUFFICIENT_CREDITS') setShowPaymentModal(true);
    } finally { setIsGeneratingImage(false); }
  };

  const handleValidateSummary = async () => {
      const num = parseInt(summaryInputVal);
      if (isNaN(num) || num < 1) return;
      setIsGeneratingSummary(true); setShowSummaryResultModal(true); setShowMenu(false);
      try {
        const summary = await getLessonSummary(num, "Résumé leçon", user.id);
        setSummaryContent(summary);
      } catch(e: any) {
        if(e.message === 'INSUFFICIENT_CREDITS') setShowPaymentModal(true);
      } finally { setIsGeneratingSummary(false); }
  };

  const handleSpeak = async (text: string, msgId?: string) => {
    stopAudio();
    stopListening(); // Stop input while AI speaks
    
    if (msgId) lastSpokenMessageId.current = msgId;
    setIsPlayingAudio(true);
    const cleanText = text.replace(/[*#_`~]/g, '');
    
    try {
        const rawAudioBuffer = await generateSpeech(cleanText, user.id);
        if (rawAudioBuffer) {
            const ctx = getAudioContext();
            if (ctx.state === 'suspended') await ctx.resume();
            const decoded = await ctx.decodeAudioData(rawAudioBuffer);
            const source = ctx.createBufferSource();
            source.buffer = decoded;
            source.connect(ctx.destination);
            activeSourceRef.current = source;
            source.onended = () => {
                setIsPlayingAudio(false);
                // Resume listening if in call
                if (isCallActive) startListening();
            };
            source.start(0);
        } else { 
            setIsPlayingAudio(false); 
            if (isCallActive) startListening();
        }
    } catch (error: any) { 
        setIsPlayingAudio(false);
        if (isCallActive) startListening();
        if(error.message === 'INSUFFICIENT_CREDITS') setShowPaymentModal(true);
    }
  };

  const handleStartTraining = async () => {
      setShowSmartOptions(false);
      setIsTrainingMode(true);
      setExercises([]);
      try {
          setIsLoadingExercises(true);
          const gen = await generatePracticalExercises(user, messages);
          setExercises(gen);
      } catch(e: any) {
          setExerciseError(true);
          if(e.message === 'INSUFFICIENT_CREDITS') setShowPaymentModal(true);
      } finally { setIsLoadingExercises(false); }
  };

  const handleQuitTraining = () => { setIsTrainingMode(false); setExercises([]); };
  
  const handleToggleExplanationLang = () => {
      const newLang = preferences.explanationLanguage === ExplanationLanguage.French ? ExplanationLanguage.Malagasy : ExplanationLanguage.French;
      const updatedPrefs = { ...preferences, explanationLanguage: newLang };
      const updatedUser = { ...user, preferences: updatedPrefs };
      storageService.updatePreferences(user.id, updatedPrefs);
      onUpdateUser(updatedUser);
      notify(`Langue: ${newLang.split(' ')[0]}`, 'success');
  };

  const handleFontSizeChange = (size: 'small' | 'normal' | 'large' | 'xl') => {
    const updatedUser = { ...user, preferences: { ...user.preferences!, fontSize: size } };
    onUpdateUser(updatedUser);
    storageService.updatePreferences(user.id, updatedUser.preferences!);
  };
  
  const handleTutorialComplete = () => { setShowTutorial(false); storageService.markTutorialSeen(user.id); onUpdateUser({ ...user, hasSeenTutorial: true }); };
  const handleExerciseComplete = (score: number, total: number) => { 
      setIsTrainingMode(false); 
      const resultMsg: ChatMessage = { id: Date.now().toString(), role: 'model', text: `🎯 **Résultat Exercice**\nScore: **${score}/${total}**`, timestamp: Date.now() }; 
      setMessages([...messages, resultMsg]); 
      storageService.saveChatHistory(user.id, [...messages, resultMsg], preferences.targetLanguage);
  };

  const stopAudio = () => { if (activeSourceRef.current) try { activeSourceRef.current.stop(); } catch(e){} activeSourceRef.current = null; setIsPlayingAudio(false); };
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
          if (typeof window.html2canvas === 'undefined') { notify("Export impossible", 'error'); return; }
          // @ts-ignore
          window.html2canvas(element).then((canvas: any) => {
              const link = document.createElement('a');
              link.download = `teacher_mada_${msgId}.png`;
              link.href = canvas.toDataURL();
              link.click();
          });
      } catch(e) { notify("Erreur export", 'error'); }
  };

  const getAudioContext = () => { const AC = window.AudioContext || (window as any).webkitAudioContext; if (!audioContextRef.current || audioContextRef.current.state === 'closed') audioContextRef.current = new AC(); return audioContextRef.current; };
  const handleValidateJump = () => { const num = parseInt(jumpInputVal); setShowMenu(false); handleSend(`Aller à la leçon ${num}`); };
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
                /* Analysis UI */
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

      {/* HEADER */}
      <header className="fixed top-0 left-0 right-0 z-40 bg-white/90 dark:bg-slate-900/95 backdrop-blur-md shadow-sm h-14 md:h-16 px-4 flex items-center justify-between border-b border-slate-100 dark:border-slate-800">
        
        {/* Left: Back + Smart Target Language */}
        <div className="flex-1 flex items-center gap-2 relative">
          <button onClick={() => { stopAudio(); onChangeMode(); }} disabled={isAnalyzing} className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-full transition-all group disabled:opacity-50 shrink-0">
             {isAnalyzing ? <Loader2 className="w-5 h-5 animate-spin text-indigo-600" /> : <ArrowLeft className="w-5 h-5 text-slate-500 dark:text-slate-400 group-hover:text-indigo-600" />}
          </button>
          
          <button 
             onClick={() => setShowSmartOptions(!showSmartOptions)}
             className="flex items-center gap-2 px-3 py-1.5 bg-indigo-50 dark:bg-indigo-900/20 text-indigo-800 dark:text-indigo-300 rounded-full border border-indigo-100 dark:border-indigo-900/50 hover:bg-indigo-100 dark:hover:bg-indigo-900/40 transition-colors max-w-full overflow-hidden"
          >
             <Globe className="w-4 h-4 shrink-0" />
             <span className="text-xs font-bold whitespace-nowrap truncate">{getLanguageDisplay()}</span>
             <ChevronDown className={`w-3 h-3 transition-transform shrink-0 ${showSmartOptions ? 'rotate-180' : ''}`} />
          </button>

          {/* Smart Options */}
          {showSmartOptions && (
              <div className="absolute top-12 left-0 md:left-10 w-64 bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-100 dark:border-slate-700 p-2 animate-fade-in z-50">
                  <div className="space-y-1">
                      <button onClick={handleStartTraining} className="w-full text-left p-2.5 hover:bg-slate-50 dark:hover:bg-slate-800 rounded-lg flex items-center gap-3 text-sm font-medium transition-colors">
                          <BrainCircuit className="w-4 h-4 text-orange-500"/>
                          <span className="text-slate-700 dark:text-slate-300">Exercice Pratique</span>
                      </button>
                      <button onClick={handleStartCall} className="w-full text-left p-2.5 hover:bg-slate-50 dark:hover:bg-slate-800 rounded-lg flex items-center gap-3 text-sm font-medium transition-colors">
                          <Phone className="w-4 h-4 text-purple-500"/>
                          <span className="text-slate-700 dark:text-slate-300">Appel Vocal</span>
                      </button>
                       <button onClick={() => { setShowSmartOptions(false); onChangeMode(); }} className="w-full text-left p-2.5 hover:bg-slate-50 dark:hover:bg-slate-800 rounded-lg flex items-center gap-3 text-sm font-medium transition-colors group">
                          <Library className="w-4 h-4 text-indigo-500"/>
                          <span className="text-slate-700 dark:text-slate-300">Autres Cours</span>
                      </button>
                  </div>
              </div>
          )}
        </div>

        {/* Center: Current Lesson */}
        <div className="flex flex-col items-center w-auto shrink-0 px-2">
             <h2 className="text-base md:text-lg font-black text-slate-800 dark:text-white flex items-center gap-2 whitespace-nowrap">
                Leçon {displayedLessonNumber}
             </h2>
        </div>

        {/* Right: Credits, Menu, Avatar */}
        <div className="flex-1 flex items-center justify-end gap-2">
             <button onClick={() => setShowPaymentModal(true)} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full border transition-colors group ${!canSend ? 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-900 animate-pulse' : 'bg-indigo-50 dark:bg-indigo-900/20 border-indigo-100 dark:border-indigo-800/50 hover:bg-indigo-100 dark:hover:bg-indigo-900/40'}`}>
                  {isFreeTier ? (
                      <>
                        <div className={`w-2 h-2 rounded-full ${canSend ? 'bg-emerald-500' : 'bg-red-500'} animate-pulse`}></div>
                        <span className={`text-xs font-bold ${canSend ? 'text-indigo-700 dark:text-indigo-300' : 'text-red-600 dark:text-red-400'}`}>{freeUsageLeft}/3</span>
                      </>
                  ) : (
                      <>
                        <Coins className={`w-3.5 h-3.5 ${canSend ? 'text-amber-500' : 'text-red-500'} group-hover:rotate-12 transition-transform`} />
                        <span className={`text-xs font-bold ${canSend ? 'text-indigo-900 dark:text-indigo-100' : 'text-red-600 dark:text-red-300'} hidden sm:inline`}>{user.role === 'admin' ? '∞' : user.credits}</span>
                        <span className="text-xs font-bold sm:hidden">{user.role === 'admin' ? '∞' : user.credits}</span>
                      </>
                  )}
             </button>

             <div className="relative">
                 <button 
                    onClick={() => setShowMenu(!showMenu)} 
                    className={`p-2 rounded-full transition-colors ${showMenu ? 'bg-indigo-100 dark:bg-indigo-900/50 text-indigo-600' : 'text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'}`}
                 >
                    <Menu className="w-5 h-5" />
                 </button>
                 
                 {/* MENU DROPDOWN */}
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
                        
                         {/* Controls Grid */}
                         <div className="grid grid-cols-2 gap-2 mb-2">
                             <button onClick={() => { setShowSummaryResultModal(false); setShowMenu(true); }} className="p-3 bg-slate-50 dark:bg-slate-800 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors flex flex-col items-center justify-center text-center gap-2 group">
                                 <div className="p-2 bg-white dark:bg-slate-700 rounded-full shadow-sm group-hover:scale-110 transition-transform">
                                    <BookOpen className="w-5 h-5 text-indigo-500"/>
                                 </div>
                                 <div className="w-full">
                                    <span className="block text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wide">Résumé</span>
                                    <div className="flex items-center justify-center gap-1 mt-1">
                                        <input type="number" placeholder="#" value={summaryInputVal} onChange={e => setSummaryInputVal(e.target.value)} onClick={e => e.stopPropagation()} className="w-8 text-center bg-transparent border-b border-slate-300 dark:border-slate-600 text-xs focus:border-indigo-500 outline-none"/>
                                        <div onClick={(e) => { e.stopPropagation(); handleValidateSummary(); }} className="text-[10px] font-black text-indigo-600 cursor-pointer">GO</div>
                                    </div>
                                 </div>
                             </button>

                             <button className="p-3 bg-slate-50 dark:bg-slate-800 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors flex flex-col items-center justify-center text-center gap-2 group">
                                 <div className="p-2 bg-white dark:bg-slate-700 rounded-full shadow-sm group-hover:scale-110 transition-transform">
                                    <RotateCcw className="w-5 h-5 text-emerald-500"/>
                                 </div>
                                 <div className="w-full">
                                    <span className="block text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wide">Aller à</span>
                                    <div className="flex items-center justify-center gap-1 mt-1">
                                        <input type="number" placeholder="#" value={jumpInputVal} onChange={e => setJumpInputVal(e.target.value)} onClick={e => e.stopPropagation()} className="w-8 text-center bg-transparent border-b border-slate-300 dark:border-slate-600 text-xs focus:border-emerald-500 outline-none"/>
                                        <div onClick={(e) => { e.stopPropagation(); handleValidateJump(); }} className="text-[10px] font-black text-emerald-600 cursor-pointer">GO</div>
                                    </div>
                                 </div>
                             </button>
                         </div>

                         <div className="grid grid-cols-2 gap-2 mb-2 border-t border-slate-100 dark:border-slate-800 pt-2">
                             <button onClick={toggleTheme} className="p-3 hover:bg-slate-50 dark:hover:bg-slate-800 rounded-lg flex items-center justify-center gap-2 transition-colors">
                                 {isDarkMode ? <Sun className="w-4 h-4 text-amber-500"/> : <Moon className="w-4 h-4 text-indigo-500"/>}
                                 <span className="text-xs font-bold text-slate-600 dark:text-slate-300">Thème</span>
                             </button>
                             <button onClick={handleToggleExplanationLang} className="p-3 hover:bg-slate-50 dark:hover:bg-slate-800 rounded-lg flex items-center justify-center gap-2 transition-colors">
                                 <Languages className="w-4 h-4 text-purple-500"/>
                                 <span className="text-xs font-bold text-slate-600 dark:text-slate-300">{preferences.explanationLanguage.split(' ')[0]}</span>
                             </button>
                         </div>
                     </div>
                 )}
             </div>
             
             {/* Enhanced Avatar with Mobile Fix */}
             <button onClick={onShowProfile} className="relative w-9 h-9 ml-1 group shrink-0">
                <div className="absolute -inset-1 bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500 rounded-full opacity-70 blur-sm group-hover:opacity-100 transition-opacity duration-500"></div>
                <div className="relative w-full h-full rounded-full bg-slate-900 text-white font-bold flex items-center justify-center border-2 border-white dark:border-slate-800 z-10 overflow-hidden">
                    <span className="z-10">{user.username.substring(0, 2).toUpperCase()}</span>
                    <div className="absolute inset-0 bg-gradient-to-tr from-indigo-600 to-violet-600 opacity-80"></div>
                </div>
                <div className="absolute bottom-0 right-0 w-3 h-3 bg-emerald-500 border-2 border-white dark:border-slate-900 rounded-full z-20"></div>
             </button>
        </div>
      </header>
      
      {/* Chat Area */}
      <div 
        id="chat-feed" 
        ref={chatContainerRef} 
        className={`flex-1 overflow-y-auto p-3 md:p-4 space-y-4 md:space-y-6 pt-20 pb-4 scrollbar-hide`}
      >
        {messages.filter(msg => !searchQuery || msg.text.toLowerCase().includes(searchQuery.toLowerCase())).map((msg, index) => {
            const isMatch = searchQuery && msg.text.toLowerCase().includes(searchQuery.toLowerCase());
            const isCurrentMatch = matchingMessages[currentMatchIndex]?.id === msg.id;

            return (
                <div key={msg.id} id={`msg-${msg.id}`} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'} animate-fade-in`}>
                    <div className={`flex max-w-[90%] md:max-w-[80%] ${msg.role === 'user' ? 'flex-row-reverse' : 'flex-row'}`}>
                        
                        {/* AVATAR: CUSTOMIZED */}
                        {msg.role === 'user' ? (
                            <div className="flex-shrink-0 w-8 h-8 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-white font-bold text-xs shadow-sm mt-1 mx-2 border border-white dark:border-slate-800">
                                {user.username.charAt(0).toUpperCase()}
                            </div>
                        ) : (
                            <div className="flex-shrink-0 w-8 h-8 rounded-full bg-white border flex items-center justify-center mt-1 mx-2 p-1 overflow-hidden">
                                {imgErrors[msg.id] ? (
                                    <div className="w-full h-full flex items-center justify-center bg-indigo-600 text-white text-[10px] font-bold rounded-full">TM</div>
                                ) : (
                                    <img 
                                        src="https://i.ibb.co/B2XmRwmJ/logo.png" 
                                        className="w-full h-full object-contain" 
                                        alt="Teacher" 
                                        onError={() => setImgErrors(prev => ({...prev, [msg.id]: true}))}
                                    />
                                )}
                            </div>
                        )}

                        <div 
                            id={`msg-content-${msg.id}`} 
                            className={`px-4 py-3 rounded-2xl shadow-sm ${textSizeClass} transition-all duration-300
                            ${msg.role === 'user' ? 'bg-indigo-600 text-white rounded-tr-none' : 'bg-white dark:bg-slate-800 dark:text-slate-200 text-slate-800 rounded-tl-none border border-slate-100 dark:border-slate-700'} 
                            ${isCurrentMatch ? 'ring-4 ring-yellow-400/50 shadow-yellow-200 dark:shadow-none' : isMatch ? 'ring-2 ring-yellow-200/50' : ''}`}
                        >
                             {msg.role === 'user' ? <p className="whitespace-pre-wrap">{msg.text}</p> : (
                                <>
                                    {/* Streaming Logic: Render what we have so far */}
                                    <MarkdownRenderer content={msg.text} onPlayAudio={(t) => handleSpeak(t)} highlight={searchQuery} />
                                    
                                    {/* Start Button on First Message */}
                                    {index === 0 && msg.role === 'model' && messages.length === 1 && (
                                        <div className="mt-4 pt-4 border-t border-slate-100 dark:border-slate-700 flex justify-center">
                                            <button 
                                                onClick={() => handleSend("Commence le cours")} 
                                                className="group relative px-6 py-2.5 bg-gradient-to-r from-indigo-600 to-violet-600 text-white font-bold rounded-full shadow-lg hover:shadow-xl hover:scale-105 transition-all duration-300 flex items-center gap-2"
                                            >
                                                <span>COMMENCER</span>
                                                <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                                            </button>
                                        </div>
                                    )}

                                    <div className="flex items-center gap-2 mt-2 pt-2 border-t border-slate-100 dark:border-slate-700/50" data-html2canvas-ignore>
                                        <button onClick={() => handleSpeak(msg.text, msg.id)} className="p-1 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-full transition-colors" title="Écouter"><Volume2 className="w-4 h-4 text-slate-400 hover:text-indigo-500"/></button>
                                        <button onClick={() => handleCopy(msg.text, msg.id)} className="p-1 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-full transition-colors" title="Copier">{copiedId === msg.id ? <Check className="w-4 h-4 text-emerald-500"/> : <Copy className="w-4 h-4 text-slate-400"/>}</button>
                                        <button onClick={() => handleExportPDF(msg.text)} className="p-1 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-full transition-colors" title="Télécharger PDF"><FileText className="w-4 h-4 text-slate-400 hover:text-red-500"/></button>
                                        <button onClick={() => handleExportImage(msg.id)} className="p-1 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-full transition-colors" title="Exporter Image"><ImageIcon className="w-4 h-4 text-slate-400 hover:text-purple-500"/></button>
                                    </div>
                                </>
                             )}
                        </div>
                    </div>
                </div>
            );
        })}
        
        {/* Loading Indicator */}
        {(isLoading || isAnalyzing) && (
             <div className="flex justify-start animate-fade-in">
                 <div className="flex-shrink-0 w-8 h-8 rounded-full bg-white border flex items-center justify-center mt-1 mx-2 p-1">
                    <img src="https://i.ibb.co/B2XmRwmJ/logo.png" className="w-full h-full object-contain" alt="Teacher" onError={(e) => { e.currentTarget.style.display = 'none'; e.currentTarget.parentElement!.innerText = "TM"; e.currentTarget.parentElement!.className += " font-bold text-xs bg-indigo-600 text-white"; }} />
                 </div>
                 <div className="bg-white dark:bg-slate-800 px-4 py-3 rounded-2xl rounded-tl-none border shadow-sm flex items-center gap-2 min-w-[120px]">
                    <TypingIndicator />
                 </div>
             </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input Area */}
      <div id="input-area" className="bg-white/80 dark:bg-slate-900/80 backdrop-blur-md border-t border-slate-100 dark:border-slate-800 p-3 md:p-4 sticky bottom-0">
        
        {/* Generated Image Display */}
        {(isGeneratingImage || generatedImage) && (
            <div className="max-w-md mx-auto mb-4 relative animate-fade-in-up">
                {isGeneratingImage ? (
                    <div className="h-48 w-full bg-slate-100 dark:bg-slate-800 rounded-2xl flex flex-col items-center justify-center border border-slate-200 dark:border-slate-700">
                        <Loader2 className="w-8 h-8 text-indigo-500 animate-spin mb-2" />
                        <span className="text-xs font-bold text-slate-500">Création artistique en cours...</span>
                    </div>
                ) : (
                    <div className="relative group">
                         <img src={generatedImage!} alt="Concept" className="w-full h-48 object-cover rounded-2xl shadow-lg border border-white/20" />
                         <button 
                            onClick={() => setGeneratedImage(null)}
                            className="absolute top-2 right-2 p-1.5 bg-black/50 hover:bg-black/70 text-white rounded-full backdrop-blur-sm transition-colors"
                         >
                            <X className="w-4 h-4" />
                         </button>
                    </div>
                )}
            </div>
        )}

        {/* Quick Actions Toolbar */}
        <div className="max-w-4xl mx-auto mb-2 flex items-center gap-2 px-2 overflow-x-auto scrollbar-hide">
            <Tooltip text="Appel Vocal">
                <button onClick={handleStartCall} className="p-2 bg-purple-50 dark:bg-purple-900/20 rounded-full shadow-sm border border-purple-100 dark:border-purple-800 text-purple-600 dark:text-purple-400 hover:bg-purple-100 dark:hover:bg-purple-900/40 transition-colors">
                    <Phone className="w-4 h-4" />
                </button>
            </Tooltip>
            
            {/* Smart Level Progress Bar */}
            <div className="flex-1 mx-3 flex flex-col justify-center">
                <div className="flex justify-between items-center text-[10px] font-bold text-slate-400 dark:text-slate-500 mb-1 px-1">
                    <span className="text-indigo-500 dark:text-indigo-400">{preferences.level}</span>
                    <span className="text-slate-300 dark:text-slate-600">{Math.round(progressData.percentage)}%</span>
                    {progressData.isLevelComplete ? (
                        <span className="text-emerald-500 flex items-center gap-1 animate-pulse">
                            Niveau Suivant <ArrowRight className="w-3 h-3" />
                        </span>
                    ) : (
                        <span className="text-slate-600 dark:text-slate-300">{progressData.nextLevelLabel} 🚀</span>
                    )}
                </div>
                <div className="h-1.5 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden relative shadow-inner">
                    <div 
                        className={`h-full animate-gradient-x absolute top-0 left-0 transition-all duration-1000 ease-out ${progressData.isLevelComplete ? 'bg-gradient-to-r from-emerald-400 to-green-600' : 'bg-gradient-to-r from-indigo-500 via-purple-500 to-indigo-500'}`}
                        style={{ width: `${progressData.percentage}%` }}
                    ></div>
                </div>
            </div>
            
             <Tooltip text="Leçon Suivante">
                <button 
                    onClick={() => handleSend("Suivant")} 
                    disabled={isSending} 
                    className={`flex items-center gap-2 px-3 py-1.5 bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-300 rounded-full text-xs font-bold hover:bg-indigo-100 dark:hover:bg-indigo-900/50 transition-colors border border-indigo-100 dark:border-indigo-900/50 ml-auto disabled:opacity-50`}
                >
                    {isSending && input.includes("Suivant") ? "Génération..." : "Suivant"} <ArrowRight className="w-3 h-3" />
                </button>
            </Tooltip>
        </div>

        <div className="max-w-4xl mx-auto relative flex items-end gap-2 bg-slate-50 dark:bg-slate-800 rounded-[26px] border border-slate-200 dark:border-slate-700 p-2 shadow-sm focus-within:ring-2 focus-within:ring-indigo-500/50">
            <textarea
                ref={textareaRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder={!canSend ? "Recharge nécessaire..." : "Message.. | Parler..."}
                disabled={isLoading || isAnalyzing || isSending}
                rows={1}
                className="w-full bg-transparent text-slate-800 dark:text-white rounded-xl pl-4 py-3 text-base focus:outline-none resize-none max-h-32 scrollbar-hide self-center disabled:opacity-50"
            />
            <div className="flex items-center gap-1 pb-1 pr-1">
                 <button onClick={handleTranslateInput} disabled={!input.trim() || isTranslating} className="p-2 rounded-full text-slate-400 hover:text-indigo-600 hover:bg-slate-200 dark:hover:bg-slate-700 disabled:opacity-50">
                    {isTranslating ? <Loader2 className="w-5 h-5 animate-spin" /> : <Languages className={`w-5 h-5 ${isTranslating ? 'animate-spin text-indigo-600' : ''}`} />}
                 </button>
                 <button onClick={toggleListening} className={`p-2 rounded-full ${isListening ? 'bg-red-500 text-white animate-pulse' : 'text-slate-400 hover:text-indigo-600 hover:bg-slate-200'}`}>
                    {isListening ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
                 </button>
                 <button 
                    onClick={() => handleSend()} 
                    disabled={!input.trim() || isLoading || isAnalyzing || isSending} 
                    className={`p-2.5 rounded-full text-white transition-all shadow-md transform hover:scale-105 active:scale-95 flex items-center justify-center
                        ${canSend ? 'bg-indigo-600 hover:bg-indigo-700' : 'bg-slate-400 cursor-not-allowed'}
                    `}
                 >
                    {canSend ? <Send className="w-4 h-4" /> : <Lock className="w-4 h-4" />}
                </button>
            </div>
        </div>
        <div className="text-center mt-1">
             <span className="text-[10px] text-slate-400">1 Leçon = 1 Crédit (50 Ar) • Gratuit: 3/semaines.</span>
        </div>
      </div>
    </div>
  );
};

export default ChatInterface;
