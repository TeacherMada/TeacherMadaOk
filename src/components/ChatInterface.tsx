
import React, { useState, useRef, useEffect, useMemo } from 'react';
import { Send, User, Mic, Volume2, ArrowLeft, Loader2, Copy, Check, ArrowRight, Phone, Globe, ChevronDown, MicOff, BookOpen, Search, AlertTriangle, X, Sun, Moon, Languages, FileDown, Coins, Plus, Lock, BrainCircuit, Menu, FileText, Type, LogOut, RotateCcw, Sparkles, MessageCircle, Mic2, GraduationCap, Image as ImageIcon, Library, ChevronUp, Play, PhoneOff, VolumeX, Maximize2, Trophy } from 'lucide-react';
import { UserProfile, ChatMessage, ExerciseItem, ExplanationLanguage, TargetLanguage, VoiceCallSummary } from '../types';
import { sendMessageToGemini, generateSpeech, generatePracticalExercises, getLessonSummary, translateText, generateConceptImage, generateVoiceChatResponse, analyzeVoiceCallPerformance } from '../services/geminiService';
import { storageService } from '../services/storageService';
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

  // === REAL LEVEL PROGRESS CALCULATION (0-50 Lessons) ===
  const levelProgressData = useMemo(() => {
      const currentLevelCode = user.preferences?.level || 'A1';
      // Fallback if migration hasn't run or field is missing
      const progressCount = user.stats.levelProgress || 0;
      
      const percentage = Math.min((progressCount / 50) * 100, 100);
      
      // Determine next level target for UI display
      let targetCode = 'A2';
      const levels = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'];
      const hskLevels = ['HSK 1', 'HSK 2', 'HSK 3', 'HSK 4', 'HSK 5', 'HSK 6'];
      
      const list = currentLevelCode.includes('HSK') ? hskLevels : levels;
      const idx = list.indexOf(currentLevelCode);
      if (idx !== -1 && idx < list.length - 1) {
          targetCode = list[idx + 1];
      } else {
          targetCode = 'MAX';
      }
      
      return { startCode: currentLevelCode, targetCode, percentage };
  }, [user.stats.levelProgress, user.preferences?.level]);

  // Dynamic Loading Text Logic for Voice Call
  useEffect(() => {
      let timer1: any, timer2: any;
      if (isLoading && isCallActive) {
          setLoadingText("Réflexion...");
          timer1 = setTimeout(() => {
              setLoadingText("Andraso kely fa ratsiratsy ny réseau...");
          }, 3500);
          timer2 = setTimeout(() => {
              setLoadingText("Eo am-panoratana ny valiny...");
          }, 8000);
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

  // Reset match index when query changes
  useEffect(() => {
    setCurrentMatchIndex(0);
  }, [searchQuery]);

  // Scroll to match
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

  // Dynamic Lesson Number Calculation
  const currentLessonNumber = useMemo(() => {
    // Try to parse from recent messages, otherwise default to stats
    for (let i = messages.length - 1; i >= 0; i--) {
        const match = messages[i].text.match(/##\s*(?:🟢|🔴|🔵)?\s*(?:LEÇON|LECON|LESSON|LESONA)\s*(\d+)/i);
        if (match) return match[1];
    }
    // Fallback to user stats
    return (user.stats.levelProgress || 0) + 1;
  }, [messages, user.stats.levelProgress]);

  // Font Size Mapping
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
    
    let lang = 'fr-FR';
    if (preferences.targetLanguage === TargetLanguage.English) lang = 'en-US';
    else if (preferences.targetLanguage === TargetLanguage.Spanish) lang = 'es-ES';
    else if (preferences.targetLanguage === TargetLanguage.German) lang = 'de-DE';
    else if (preferences.targetLanguage === TargetLanguage.Chinese) lang = 'zh-CN';
    
    recognition.lang = lang;
    
    recognition.onstart = () => setIsListening(true);
    recognition.onend = () => setIsListening(false);
    recognition.onerror = (e: any) => { console.error(e); setIsListening(false); };
    recognition.onresult = (e: any) => {
      const text = e.results[0][0].transcript;
      setInput(prev => prev + (prev ? ' ' : '') + text);
    };
    
    recognitionRef.current = recognition;
    recognition.start();
  };

  const toggleListening = () => {
    if (isListening) stopListening();
    else startListening();
  };

  // Auto-send in Call Mode when listening stops and input exists
  useEffect(() => {
      if (!isListening && isCallActive && input.trim().length > 0 && !isLoading && !isAnalyzing) {
          handleSend();
      }
  }, [isListening, isCallActive]);

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
    return () => { 
        stopAudio(); 
        stopListening();
        stopRingback();
    };
  }, []);

  const isFreeTier = user.role !== 'admin' && user.credits <= 0;
  const freeUsageLeft = isFreeTier ? Math.max(0, 2 - user.freeUsage.count) : 0;
  const canSend = storageService.canPerformRequest(user.id).allowed;
  
  const refreshUserData = () => {
     const updated = storageService.getUserById(user.id);
     if (updated) onUpdateUser(updated);
  };

  const handleErrorAction = (err: any) => {
     console.error(err);
     setIsLoading(false);
     if (err.message === 'INSUFFICIENT_CREDITS') {
         setShowPaymentModal(true);
         notify("Crédits insuffisants. Rechargez pour continuer.", 'error');
         if (isCallActive) handleEndCall();
     } else {
         notify("Une erreur est survenue.", 'error');
     }
  };

  // --- Call Handlers ---
  
  // Call Timer Logic & Credit Deduction
  useEffect(() => {
      let interval: any;
      if (isCallActive && !isCallConnecting && !callSummary) {
          interval = setInterval(() => {
              setCallSeconds(prev => {
                  const newVal = prev + 1;
                  
                  // Deduct credit every 60 seconds (1 minute = 1 credit)
                  if (newVal > 0 && newVal % 60 === 0) {
                      const updatedUser = storageService.deductCreditOrUsage(user.id);
                      
                      if (updatedUser) {
                          onUpdateUser(updatedUser);
                          notify("1 min écoulée : -1 Crédit", 'info');
                      } else {
                          // Crucial: Auto-cut if deduction fails (returns null)
                          clearInterval(interval);
                          notify("Crédit épuisé. Fin de l'appel.", 'error');
                          handleEndCall();
                      }
                  }
                  
                  // Warning at 50s mark of a minute if low credits
                  if (newVal % 60 === 50 && user.credits <= 1 && user.role !== 'admin') {
                      notify("Attention : Il vous reste 10 secondes...", 'info');
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
      
      // Standard Ringback Tone freq (approx 425Hz)
      osc.frequency.value = 425; 
      
      // Pattern: "tu-tu... tu-tu..."
      // Pulse 1
      gain.gain.setValueAtTime(0.5, ctx.currentTime);
      gain.gain.setValueAtTime(0, ctx.currentTime + 0.4);
      // Pulse 2
      gain.gain.setValueAtTime(0.5, ctx.currentTime + 0.8);
      gain.gain.setValueAtTime(0, ctx.currentTime + 1.2);
      
      osc.start();
      
      // Create a pulse effect
      const pulse = setInterval(() => {
          if (ctx.state === 'closed') return;
          const t = ctx.currentTime;
          gain.gain.setValueAtTime(0.5, t);
          gain.gain.setValueAtTime(0, t + 0.4);
          gain.gain.setValueAtTime(0.5, t + 0.8);
          gain.gain.setValueAtTime(0, t + 1.2);
      }, 3000); // Repeat every 3s

      ringbackOscillatorRef.current = osc;
      
      // Store pulse interval to clear it
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
      
      // Play Ringback
      playRingbackTone();
      
      // Connect after 5 seconds
      setTimeout(() => {
          stopRingback();
          setIsCallConnecting(false);
          
          // Initial Greeting based on Explanation Language
          const isMg = preferences.explanationLanguage === ExplanationLanguage.Malagasy;
          const greeting = isMg 
            ? `Allô ${user.username} ! 😊 Hianatra ${preferences.targetLanguage} miaraka isika, niveau ${preferences.level}...`
            : `Allô ${user.username} ! 😊 Nous allons pratiquer ensemble le ${preferences.targetLanguage}, niveau ${preferences.level}...`;
          
          handleSpeak(greeting);
      }, 5000);
  };

  const handleEndCall = async () => {
      stopListening();
      stopAudio();
      stopRingback();
      
      if (callSeconds > 10) {
          // Analyze call
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
          // Too short, just close
          closeCallOverlay();
      }
  };
  
  const closeCallOverlay = () => {
      setIsCallActive(false);
      setIsCallConnecting(false);
      setCallSummary(null);
      setIsMuted(false);
      setCallSeconds(0);
  };

  const toggleMute = () => setIsMuted(!isMuted);

  // --- Core Handlers ---

  const handleSend = async (textOverride?: string) => {
    stopAudio();
    const textToSend = typeof textOverride === 'string' ? textOverride : input;
    
    if (!textToSend.trim() || isLoading || isAnalyzing) return;

    const creditStatus = storageService.canPerformRequest(user.id);
    if (!creditStatus.allowed) {
        notify("Solde insuffisant. Veuillez recharger vos crédits.", 'error');
        setShowPaymentModal(true);
        if (isCallActive) handleEndCall();
        return;
    }
    
    const userMsg: ChatMessage = { id: Date.now().toString(), role: 'user', text: textToSend, timestamp: Date.now() };
    const updatedWithUser = [...messages, userMsg];
    setMessages(updatedWithUser);
    storageService.saveChatHistory(user.id, updatedWithUser, preferences.targetLanguage); 
    
    setInput('');
    setGeneratedImage(null);

    setIsLoading(true);
    onMessageSent();

    try {
      let responseText = "";
      
      if (isCallActive) {
          // Use specific Voice AI Logic
          responseText = await generateVoiceChatResponse(textToSend, user.id, updatedWithUser);
      } else {
          // Standard Chat Logic
          responseText = await sendMessageToGemini(textToSend, user.id);
      }

      const aiMsg: ChatMessage = { id: (Date.now() + 1).toString(), role: 'model', text: responseText, timestamp: Date.now() };
      const finalHistory = [...updatedWithUser, aiMsg];
      setMessages(finalHistory);
      storageService.saveChatHistory(user.id, finalHistory, preferences.targetLanguage);
      refreshUserData();
      
      // Voice Call Auto-Reply
      if (isCallActive) {
          handleSpeak(responseText);
      }

    } catch (error) {
      handleErrorAction(error);
    } finally { 
      setIsLoading(false); 
    }
  };

  const handleTranslateInput = async () => {
    if (!input.trim()) return;
    if (!storageService.canPerformRequest(user.id).allowed) {
        setShowPaymentModal(true);
        return;
    }
    setIsTranslating(true);
    try {
        const translation = await translateText(input, preferences.targetLanguage, user.id);
        setInput(translation);
        refreshUserData();
    } catch (e: any) {
        if(e.message === 'INSUFFICIENT_CREDITS') { setShowPaymentModal(true); }
        else { notify("Échec de la traduction.", 'error'); }
    } finally {
        setIsTranslating(false);
    }
  };
  
  const handleGenerateImage = async () => {
    if (!storageService.canPerformRequest(user.id).allowed) {
        setShowPaymentModal(true);
        return;
    }
    
    setIsGeneratingImage(true);
    setShowSmartOptions(false);
    
    try {
        const prompt = `Digital illustration of ${preferences.targetLanguage} learning concept or culture, colorful, modern vector art style, educational context.`;
        const base64Image = await generateConceptImage(prompt, user.id);
        
        if (base64Image) {
            setGeneratedImage(base64Image);
            refreshUserData();
        } else {
            notify("Impossible de générer l'image.", 'error');
        }
    } catch (e: any) {
        if(e.message === 'INSUFFICIENT_CREDITS') setShowPaymentModal(true);
        else notify("Erreur de génération d'image.", 'error');
    } finally {
        setIsGeneratingImage(false);
    }
  };

  const handleValidateSummary = async () => {
      const num = parseInt(summaryInputVal);
      if (isNaN(num) || num < 1) return;
      if (!storageService.canPerformRequest(user.id).allowed) {
        setShowPaymentModal(true);
        return;
      }
      setSummaryInputVal('');
      setIsGeneratingSummary(true); setShowSummaryResultModal(true); setShowMenu(false);
      const context = messages.slice(-10).map(m => m.text).join('\n');
      try {
        const summary = await getLessonSummary(num, context, user.id);
        setSummaryContent(summary);
        refreshUserData();
      } catch(e: any) {
        setSummaryContent("Erreur : Crédits insuffisants ou problème technique.");
        if(e.message === 'INSUFFICIENT_CREDITS') setShowPaymentModal(true);
      } finally {
        setIsGeneratingSummary(false);
      }
  };

  const handleSpeak = async (text: string, msgId?: string) => {
    stopAudio();
    if (msgId) lastSpokenMessageId.current = msgId;
    if (!storageService.canPerformRequest(user.id).allowed) {
        notify("Crédits insuffisants pour l'audio.", 'error');
        if (isCallActive) handleEndCall();
        return;
    }
    setIsPlayingAudio(true);
    const cleanText = text.replace(/[*#_`~]/g, '').replace(/\[.*?\]/g, '').replace(/-{3,}/g, ' ').replace(/\n/g, '. ').replace(/\s+/g, ' ').trim();
    try {
        const rawAudioBuffer = await generateSpeech(cleanText, user.id);
        refreshUserData();
        if (rawAudioBuffer && rawAudioBuffer.byteLength > 0) {
            const ctx = getAudioContext();
            if (ctx.state === 'suspended') await ctx.resume();
            const pcmData = new Int16Array(rawAudioBuffer);
            const audioBuffer = ctx.createBuffer(1, pcmData.length, 24000);
            const channelData = audioBuffer.getChannelData(0);
            for (let i = 0; i < pcmData.length; i++) channelData[i] = pcmData[i] / 32768.0;
            const source = ctx.createBufferSource();
            source.buffer = audioBuffer;
            source.connect(ctx.destination);
            activeSourceRef.current = source;
            source.onended = () => { if (activeSourceRef.current === source) { setIsPlayingAudio(false); activeSourceRef.current = null; } };
            source.start(0);
        } else { setIsPlayingAudio(false); }
    } catch (error: any) { 
        setIsPlayingAudio(false);
        if(error.message === 'INSUFFICIENT_CREDITS') setShowPaymentModal(true);
    }
  };

  const handleStartTraining = async () => {
      setShowSmartOptions(false);
      setIsTrainingMode(true);
      setExercises([]);
      setExerciseError(false);
      try {
          checkCreditsBeforeAction();
          setIsLoadingExercises(true);
          const gen = await generatePracticalExercises(user, messages);
          if (gen.length === 0) throw new Error("No exercises generated");
          setExercises(gen);
          refreshUserData();
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

  const handleToggleExplanationLang = () => {
      const newLang = preferences.explanationLanguage === ExplanationLanguage.French 
        ? ExplanationLanguage.Malagasy 
        : ExplanationLanguage.French;
      
      const updatedPrefs = { ...preferences, explanationLanguage: newLang };
      const updatedUser = { ...user, preferences: updatedPrefs };
      storageService.updatePreferences(user.id, updatedPrefs);
      onUpdateUser(updatedUser);
      notify(`Explications en : ${newLang.split(' ')[0]}`, 'success');
  };

  const handleFontSizeChange = (size: 'small' | 'normal' | 'large' | 'xl') => {
    const updatedUser = { ...user, preferences: { ...user.preferences!, fontSize: size } };
    onUpdateUser(updatedUser);
    storageService.updatePreferences(user.id, updatedUser.preferences!);
  };
  
  const checkCreditsBeforeAction = () => { const s = storageService.canPerformRequest(user.id); if(!s.allowed) throw new Error('INSUFFICIENT_CREDITS'); };

  const handleTutorialComplete = () => { setShowTutorial(false); storageService.markTutorialSeen(user.id); onUpdateUser({ ...user, hasSeenTutorial: true }); };
  const handleExerciseComplete = (score: number, total: number) => { 
      setIsTrainingMode(false); 
      const resultMsg: ChatMessage = { id: Date.now().toString(), role: 'model', text: `🎯 **Session d'entraînement terminée !**\n\nScore : **${score}/${total}**\n\nContinuez comme ça !`, timestamp: Date.now() }; 
      setMessages([...messages, resultMsg]); 
      storageService.saveChatHistory(user.id, [...messages, resultMsg], preferences.targetLanguage); // Save history
      onMessageSent(); 
  };

  const stopAudio = () => { if (activeSourceRef.current) { try { activeSourceRef.current.stop(); } catch (e) { } activeSourceRef.current = null; } setIsPlayingAudio(false); };
  const handleCopy = async (text: string, id: string) => { try { await navigator.clipboard.writeText(text); setCopiedId(id); setTimeout(() => setCopiedId(null), 2000); } catch (err) {} };
  
  const handleExportPDF = (text: string) => {
     const doc = new jsPDF();
     doc.setFontSize(16);
     doc.text("TeacherMada - Leçon", 10, 15);
     doc.setFontSize(10);
     doc.setTextColor(100);
     doc.text(new Date().toLocaleString(), doc.internal.pageSize.width - 10, 15, { align: 'right' });
     doc.setDrawColor(200);
     doc.line(10, 18, doc.internal.pageSize.width - 10, 18);
     doc.setFontSize(11);
     doc.setTextColor(0);
     const cleanText = text.replace(/[*#`]/g, '');
     const lines = doc.splitTextToSize(cleanText, 180);
     let yPos = 30;
     lines.forEach((line: string) => {
         if (yPos > doc.internal.pageSize.height - 20) { doc.addPage(); yPos = 20; }
         doc.text(line, 15, yPos);
         yPos += 6;
     });
     doc.save(`tm_lecon_${Date.now()}.pdf`);
     notify("PDF généré avec succès.", 'success');
  };
  
  const handleExportImage = async (msgId: string) => {
      const element = document.getElementById(`msg-content-${msgId}`);
      if (!element) return;
      try {
          // @ts-ignore
          if (typeof window.html2canvas === 'undefined') { notify("Erreur: Bibliothèque d'export indisponible", 'error'); return; }
          
          // Use onclone to add signature before capture
          // @ts-ignore
          const canvas = await window.html2canvas(element, { 
              scale: 2, 
              backgroundColor: null, 
              useCORS: true,
              onclone: (clonedDoc: Document) => {
                  const node = clonedDoc.getElementById(`msg-content-${msgId}`);
                  if (node) {
                      const footer = clonedDoc.createElement('div');
                      footer.innerHTML = `
                        <div style="margin-top: 24px; padding-top: 16px; border-top: 1px solid rgba(255,255,255,0.2); display: flex; justify-content: space-between; align-items: center;">
                           <div style="display: flex; align-items: center; gap: 8px;">
                              <div style="background: linear-gradient(to right, #4f46e5, #7c3aed); padding: 6px; border-radius: 6px; color: white; font-weight: bold; font-size: 14px;">TM</div>
                              <div>
                                  <div style="font-weight: 900; color: #6366f1; font-size: 16px;">TeacherMada 🎓</div>
                                  <div style="font-size: 10px; color: #94a3b8; font-weight: bold;">Votre Professeur</div>
                              </div>
                           </div>
                           <div style="font-size: 12px; color: #94a3b8; font-weight: 500;">
                              www.teachermada.mg
                           </div>
                        </div>
                      `;
                      node.appendChild(footer);
                  }
              }
          });
          
          const link = document.createElement('a');
          link.download = `lesson-${msgId}.png`;
          link.href = canvas.toDataURL("image/png");
          link.click();
          notify("Image téléchargée !", 'success');
      } catch (e) { console.error(e); notify("Erreur lors de l'exportation de l'image", 'error'); }
  };

  const getAudioContext = () => { const AC = window.AudioContext || (window as any).webkitAudioContext; if (!audioContextRef.current || audioContextRef.current.state === 'closed') audioContextRef.current = new AC(); return audioContextRef.current; };
  const handleValidateJump = () => { const num = parseInt(jumpInputVal); const regex = new RegExp(`##\\s*(?:🟢|🔴|🔵)?\\s*(?:LEÇON|LECON|LESSON|LESONA)\\s*${num}`, 'i'); const targetMsg = messages.find(m => m.role === 'model' && m.text.match(regex)); if (targetMsg) { setShowMenu(false); setJumpInputVal(''); document.getElementById(`msg-${targetMsg.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' }); } else { notify(`⚠️ Leçon ${num} introuvable.`, 'error'); } };
  
  const getLanguageDisplay = () => {
    const lang = preferences.targetLanguage;
    if (lang.includes("Chinois")) return "Chinois 🇨🇳";
    const parts = lang.split(' ');
    return `${parts[0]} ${parts[parts.length - 1]}`;
  };

  // Explanation Language for UI strings
  const isMg = preferences.explanationLanguage === ExplanationLanguage.Malagasy;

  return (
    <div className="flex flex-col h-screen bg-slate-50 dark:bg-slate-950 transition-colors duration-300">
      
      {/* Modals */}
      {showPaymentModal && <PaymentModal user={user} onClose={() => setShowPaymentModal(false)} />}
      {showTutorial && <TutorialOverlay onComplete={handleTutorialComplete} />}
      
      {/* Dialogue Session Modal */}
      {isDialogueActive && (
          <DialogueSession 
            user={user} 
            onClose={() => setIsDialogueActive(false)} 
            onUpdateUser={onUpdateUser}
            notify={notify}
          />
      )}

      {/* Voice Call Overlay */}
      {isCallActive && (
        <div className="fixed inset-0 z-[160] bg-slate-900/95 backdrop-blur-2xl flex flex-col items-center justify-between py-12 px-6 transition-all animate-fade-in overflow-hidden">
            {/* ... (Call overlay content logic reduced for safety) */}
            {isAnalyzingCall || callSummary ? (
                <div className="w-full max-w-sm bg-white dark:bg-slate-800 rounded-3xl p-6 shadow-2xl mt-20 relative border border-slate-100 dark:border-white/10">
                    {/* Simplified Analysis View */}
                    <div className="text-center">
                        <h3 className="text-xl font-bold text-slate-800 dark:text-white mb-2">{isAnalyzingCall ? "Analyse..." : "Bilan"}</h3>
                        {callSummary && (
                            <div className="bg-slate-50 dark:bg-black/20 p-4 rounded-xl mb-4 text-left">
                                <p className="mb-2"><strong>Score:</strong> {callSummary.score}/10</p>
                                <p className="text-sm">{callSummary.feedback}</p>
                            </div>
                        )}
                        <button onClick={closeCallOverlay} className="w-full py-3 bg-indigo-600 text-white rounded-xl font-bold">Fermer</button>
                    </div>
                </div>
            ) : (
                <div className="flex flex-col items-center justify-center w-full h-full">
                    <div className="text-center space-y-4 mb-12">
                        <h2 className="text-3xl font-bold text-white">Appel en cours</h2>
                        <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-slate-800/80 text-indigo-200 text-sm">
                            {isCallConnecting ? "Connexion..." : isLoading ? loadingText : "Connecté"}
                        </div>
                        <p className="text-4xl font-mono text-white/50">{Math.floor(callSeconds / 60)}:{(callSeconds % 60).toString().padStart(2, '0')}</p>
                    </div>
                    
                    <div className="grid grid-cols-3 gap-6 w-full max-w-xs">
                        <button onClick={toggleMute} className="flex flex-col items-center gap-2">
                            <div className={`p-4 rounded-full ${isMuted ? 'bg-white text-slate-900' : 'bg-slate-800 text-white'}`}><VolumeX className="w-6 h-6"/></div>
                        </button>
                        <button onClick={handleEndCall} className="flex flex-col items-center gap-2">
                            <div className="p-6 bg-red-500 text-white rounded-full"><PhoneOff className="w-8 h-8"/></div>
                        </button>
                        <button onClick={toggleListening} className="flex flex-col items-center gap-2">
                            <div className={`p-4 rounded-full ${isListening ? 'bg-white text-slate-900' : 'bg-slate-800 text-white'}`}><Mic className="w-6 h-6"/></div>
                        </button>
                    </div>
                </div>
            )}
        </div>
      )}

      {/* Training Mode Overlay */}
      {isTrainingMode && (
          <div className="fixed inset-0 z-50 bg-white dark:bg-slate-950 flex flex-col">
              {isLoadingExercises ? (
                  <div className="flex-1 flex flex-col items-center justify-center">
                      <Loader2 className="w-12 h-12 text-indigo-600 animate-spin mb-4" />
                      <p className="text-slate-500">Génération...</p>
                  </div>
              ) : exerciseError ? (
                  <div className="flex-1 flex flex-col items-center justify-center p-6 text-center">
                      <AlertTriangle className="w-12 h-12 text-red-500 mb-4" />
                      <button onClick={handleQuitTraining} className="mt-4 text-slate-500">Annuler</button>
                  </div>
              ) : (
                  <ExerciseSession exercises={exercises} onClose={handleQuitTraining} onComplete={handleExerciseComplete} />
              )}
          </div>
      )}

      {showSummaryResultModal && (
        <div className="fixed inset-0 z-[100] bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="bg-white dark:bg-slate-900 rounded-2xl w-full max-w-lg p-6 shadow-xl max-h-[80vh] flex flex-col">
                <div className="flex justify-between items-center mb-4 pb-2 border-b">
                    <h3 className="font-bold">Résumé</h3>
                    <button onClick={() => setShowSummaryResultModal(false)}><X/></button>
                </div>
                <div className="flex-1 overflow-y-auto">
                    {isGeneratingSummary ? <Loader2 className="animate-spin mx-auto"/> : <MarkdownRenderer content={summaryContent}/>}
                </div>
            </div>
        </div>
      )}

      {/* HEADER */}
      <header className="fixed top-0 left-0 right-0 z-40 bg-white/90 dark:bg-slate-900/95 backdrop-blur-md shadow-sm h-14 md:h-16 px-4 flex items-center justify-between border-b border-slate-100 dark:border-slate-800">
        <div className="flex-1 flex items-center gap-2">
          <button onClick={() => { stopAudio(); onChangeMode(); }} className="p-2 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800">
             <ArrowLeft className="w-5 h-5 text-slate-500" />
          </button>
          <div className="text-sm font-bold">{getLanguageDisplay()}</div>
        </div>
        <div className="flex-1 flex justify-end items-center gap-2">
             <button onClick={() => setShowPaymentModal(true)} className="flex items-center gap-1 bg-indigo-50 dark:bg-indigo-900/20 px-3 py-1.5 rounded-full">
                  <Coins className="w-4 h-4 text-indigo-600" />
                  <span className="text-xs font-bold">{user.credits}</span>
             </button>
             <button onClick={() => setShowMenu(!showMenu)} className="p-2 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800">
                <Menu className="w-5 h-5" />
             </button>
             
             {showMenu && (
                 <div className="absolute top-12 right-4 w-64 bg-white dark:bg-slate-900 rounded-xl shadow-xl border border-slate-100 dark:border-slate-800 p-2 z-50">
                     <button onClick={toggleTheme} className="w-full text-left p-2 hover:bg-slate-50 dark:hover:bg-slate-800 rounded flex items-center gap-2"><Sun className="w-4 h-4"/> Thème</button>
                     <button onClick={handleToggleExplanationLang} className="w-full text-left p-2 hover:bg-slate-50 dark:hover:bg-slate-800 rounded flex items-center gap-2"><Languages className="w-4 h-4"/> Langue Prof</button>
                     <button onClick={handleStartTraining} className="w-full text-left p-2 hover:bg-slate-50 dark:hover:bg-slate-800 rounded flex items-center gap-2"><BrainCircuit className="w-4 h-4"/> Exercices</button>
                 </div>
             )}
        </div>
      </header>
      
      {/* Chat Area */}
      <div id="chat-feed" className={`flex-1 overflow-y-auto p-3 md:p-4 space-y-4 pt-20 pb-4 scrollbar-hide`}>
        {messages.map((msg, index) => (
            <div key={msg.id} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[85%] p-3 rounded-2xl ${msg.role === 'user' ? 'bg-indigo-600 text-white rounded-tr-none' : 'bg-white dark:bg-slate-800 border dark:border-slate-700 rounded-tl-none'}`}>
                    {msg.role === 'user' ? (
                        <p>{msg.text}</p>
                    ) : (
                        <>
                            <MarkdownRenderer content={msg.text} onPlayAudio={(t) => handleSpeak(t)} />
                            <div className="flex gap-2 mt-2 pt-2 border-t border-slate-100 dark:border-slate-700/50">
                                <button onClick={() => handleSpeak(msg.text)} className="p-1 hover:bg-slate-100 rounded"><Volume2 className="w-4 h-4"/></button>
                                <button onClick={() => handleCopy(msg.text, msg.id)} className="p-1 hover:bg-slate-100 rounded"><Copy className="w-4 h-4"/></button>
                            </div>
                        </>
                    )}
                </div>
            </div>
        ))}
        {isLoading && <div className="text-center text-sm text-slate-400">TeacherMada écrit...</div>}
        <div ref={messagesEndRef} />
      </div>

      {/* Input Area */}
      <div id="input-area" className="bg-white/80 dark:bg-slate-900/80 backdrop-blur-md border-t border-slate-100 dark:border-slate-800 p-3 sticky bottom-0">
        
        {/* Progress Bar */}
        <div className="flex items-center gap-2 mb-2 px-1">
            <span className="text-[10px] font-bold text-indigo-500">{levelProgressData.startCode}</span>
            <div className="flex-1 h-1.5 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                <div className="h-full bg-indigo-500 transition-all duration-1000" style={{ width: levelProgressData.percentage + '%' }}></div>
            </div>
            <span className="text-[10px] font-bold text-slate-400">{levelProgressData.targetCode}</span>
        </div>

        <div className="flex items-end gap-2 bg-slate-50 dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-2">
            <textarea
                ref={textareaRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Message..."
                disabled={isLoading}
                rows={1}
                className="w-full bg-transparent text-slate-800 dark:text-white pl-2 py-2 outline-none resize-none max-h-32"
            />
            <div className="flex items-center gap-1 pb-1">
                 <button onClick={toggleListening} className={`p-2 rounded-full ${isListening ? 'bg-red-500 text-white' : 'text-slate-400'}`}>
                    {isListening ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
                 </button>
                 <button 
                    onClick={() => handleSend()} 
                    disabled={!input.trim() || isLoading} 
                    className="p-2 bg-indigo-600 text-white rounded-full disabled:opacity-50"
                 >
                    <Send className="w-4 h-4" />
                </button>
            </div>
        </div>
      </div>
    </div>
  );
};

export default ChatInterface;
