
import React, { useState, useRef, useEffect, useMemo } from 'react';
import { Send, User, Mic, Volume2, ArrowLeft, Loader2, Copy, Check, ArrowRight, Phone, Globe, ChevronDown, MicOff, BookOpen, Search, AlertTriangle, X, Sun, Moon, Languages, FileText, Type, RotateCcw, BrainCircuit, Menu, Coins, Lock, Image as ImageIcon, Library, ChevronUp, PhoneOff, VolumeX, Trophy, MessageCircle, Play } from 'lucide-react';
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
  // --- STATE ---
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isPlayingAudio, setIsPlayingAudio] = useState(false);
  const [showMenu, setShowMenu] = useState(false);
  const [showSmartOptions, setShowSmartOptions] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  
  const [isTranslating, setIsTranslating] = useState(false);
  const [isListening, setIsListening] = useState(false);
  
  // Voice Call
  const [isCallActive, setIsCallActive] = useState(false);
  const [isCallConnecting, setIsCallConnecting] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [callSeconds, setCallSeconds] = useState(0);
  const [loadingText, setLoadingText] = useState("Réflexion...");
  const [callSummary, setCallSummary] = useState<VoiceCallSummary | null>(null);
  const [isAnalyzingCall, setIsAnalyzingCall] = useState(false);
  
  const ringbackOscillatorRef = useRef<OscillatorNode | null>(null);

  // Image Gen
  const [generatedImage, setGeneratedImage] = useState<string | null>(null);
  const [isGeneratingImage, setIsGeneratingImage] = useState(false);

  // Search
  const [searchQuery, setSearchQuery] = useState('');
  const [currentMatchIndex, setCurrentMatchIndex] = useState(0);

  // Training
  const [isTrainingMode, setIsTrainingMode] = useState(false);
  const [exercises, setExercises] = useState<ExerciseItem[]>([]);
  const [isLoadingExercises, setIsLoadingExercises] = useState(false);
  const [exerciseError, setExerciseError] = useState(false);

  // Dialogue
  const [isDialogueActive, setIsDialogueActive] = useState(false);
  
  // Summary
  const [showSummaryResultModal, setShowSummaryResultModal] = useState(false);
  const [summaryContent, setSummaryContent] = useState('');
  const [isGeneratingSummary, setIsGeneratingSummary] = useState(false);
  const [summaryInputVal, setSummaryInputVal] = useState('');
  const [jumpInputVal, setJumpInputVal] = useState('');
  
  // Overlays
  const [showTutorial, setShowTutorial] = useState(false);
  const [showPaymentModal, setShowPaymentModal] = useState(false);

  // Refs
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const lastSpokenMessageId = useRef<string | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const activeSourceRef = useRef<AudioBufferSourceNode | null>(null);
  const recognitionRef = useRef<any>(null);
  
  const preferences = user.preferences!;

  // --- DERIVED STATE ---

  const levelProgressData = useMemo(() => {
      const currentLevelCode = user.preferences?.level || 'A1';
      const progressCount = user.stats.levelProgress || 0;
      const percentage = Math.min((progressCount / 50) * 100, 100);
      
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

  // Loading text animation
  useEffect(() => {
      let timer1: any, timer2: any;
      if (isLoading && isCallActive) {
          setLoadingText("Réflexion...");
          timer1 = setTimeout(() => { setLoadingText("Andraso kely fa ratsiratsy ny réseau..."); }, 3500);
          timer2 = setTimeout(() => { setLoadingText("Eo am-panoratana ny valiny..."); }, 8000);
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

  const handleNextMatch = () => { if (matchingMessages.length) setCurrentMatchIndex(prev => (prev + 1) % matchingMessages.length); };
  const handlePrevMatch = () => { if (matchingMessages.length) setCurrentMatchIndex(prev => (prev - 1 + matchingMessages.length) % matchingMessages.length); };

  const currentLessonNumber = useMemo(() => {
    for (let i = messages.length - 1; i >= 0; i--) {
        const match = messages[i].text.match(/##\s*(?:🟢|🔴|🔵)?\s*(?:LEÇON|LECON|LESSON|LESONA)\s*(\d+)/i);
        if (match) return match[1];
    }
    return (user.stats.levelProgress || 0) + 1;
  }, [messages, user.stats.levelProgress]);

  const getTextSizeClass = () => {
      switch (fontSize) {
          case 'small': return 'text-sm';
          case 'large': return 'text-lg';
          case 'xl': return 'text-xl leading-relaxed';
          default: return 'text-base';
      }
  };
  const textSizeClass = getTextSizeClass();

  // --- AUDIO & VOICE LOGIC ---

  const getAudioContext = () => { 
      const AC = window.AudioContext || (window as any).webkitAudioContext; 
      if (!audioContextRef.current || audioContextRef.current.state === 'closed') {
          audioContextRef.current = new AC();
      }
      return audioContextRef.current; 
  };

  const stopAudio = () => { 
      if (activeSourceRef.current) { 
          try { activeSourceRef.current.stop(); } catch (e) { } 
          activeSourceRef.current = null; 
      } 
      setIsPlayingAudio(false); 
  };

  const stopListening = () => {
    if (recognitionRef.current) {
        try { recognitionRef.current.stop(); } catch(e){}
        recognitionRef.current = null;
    }
    setIsListening(false);
  };

  const startListening = () => {
    if (isMuted && isCallActive) { notify("Micro désactivé.", 'info'); return; }

    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) { notify("Reconnaissance vocale non supportée", 'error'); return; }
    
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

  const toggleListening = () => { if (isListening) stopListening(); else startListening(); };

  useEffect(() => {
      if (!isListening && isCallActive && input.trim().length > 0 && !isLoading && !isAnalyzing) {
          handleSend();
      }
  }, [isListening, isCallActive]);

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

  // --- CALL HANDLERS ---
  
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
  };

  const toggleMute = () => setIsMuted(!isMuted);

  // --- ACTIONS ---

  const handleSend = async (textOverride?: string) => {
    stopAudio();
    const textToSend = typeof textOverride === 'string' ? textOverride : input;
    
    if (!textToSend.trim() || isLoading || isAnalyzing) return;

    const creditStatus = storageService.canPerformRequest(user.id);
    if (!creditStatus.allowed) {
        notify("Solde insuffisant.", 'error');
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
          responseText = await generateVoiceChatResponse(textToSend, user.id, updatedWithUser);
      } else {
          responseText = await sendMessageToGemini(textToSend, user.id);
      }

      const aiMsg: ChatMessage = { id: (Date.now() + 1).toString(), role: 'model', text: responseText, timestamp: Date.now() };
      const finalHistory = [...updatedWithUser, aiMsg];
      setMessages(finalHistory);
      storageService.saveChatHistory(user.id, finalHistory, preferences.targetLanguage);
      refreshUserData();
      
      if (isCallActive) handleSpeak(responseText);

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
    if (!storageService.canPerformRequest(user.id).allowed) { setShowPaymentModal(true); return; }
    setIsGeneratingImage(true);
    setShowSmartOptions(false);
    try {
        const prompt = `Digital illustration of ${preferences.targetLanguage} learning concept, colorful, vector art style.`;
        const base64Image = await generateConceptImage(prompt, user.id);
        if (base64Image) { setGeneratedImage(base64Image); refreshUserData(); } 
        else { notify("Impossible de générer l'image.", 'error'); }
    } catch (e: any) {
        if(e.message === 'INSUFFICIENT_CREDITS') setShowPaymentModal(true);
        else notify("Erreur de génération d'image.", 'error');
    } finally { setIsGeneratingImage(false); }
  };

  const handleValidateSummary = async () => {
      const num = parseInt(summaryInputVal);
      if (isNaN(num) || num < 1) return;
      if (!storageService.canPerformRequest(user.id).allowed) { setShowPaymentModal(true); return; }
      
      setSummaryInputVal('');
      setIsGeneratingSummary(true); 
      setShowSummaryResultModal(true); 
      setShowMenu(false);
      
      const context = messages.slice(-10).map(m => m.text).join('\n');
      try {
        const summary = await getLessonSummary(num, context, user.id);
        setSummaryContent(summary);
        refreshUserData();
      } catch(e: any) {
        setSummaryContent("Erreur : Crédits insuffisants ou problème technique.");
        if(e.message === 'INSUFFICIENT_CREDITS') setShowPaymentModal(true);
      } finally { setIsGeneratingSummary(false); }
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
          setExerciseError(true);
          if(e.message === 'INSUFFICIENT_CREDITS') {
              setShowPaymentModal(true);
              setIsTrainingMode(false);
          } else {
              notify("Erreur de génération. Réessayez.", 'error');
          }
      } finally { setIsLoadingExercises(false); }
  };

  const handleQuitTraining = () => { setIsTrainingMode(false); setExercises([]); };

  const handleToggleExplanationLang = () => {
      const newLang = preferences.explanationLanguage === ExplanationLanguage.French ? ExplanationLanguage.Malagasy : ExplanationLanguage.French;
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
      storageService.saveChatHistory(user.id, [...messages, resultMsg], preferences.targetLanguage); 
      onMessageSent(); 
  };

  const handleCopy = async (text: string, id: string) => { try { await navigator.clipboard.writeText(text); setCopiedId(id); setTimeout(() => setCopiedId(null), 2000); } catch (err) {} };
  
  const handleExportPDF = (text: string) => {
     const doc = new jsPDF();
     doc.setFontSize(16);
     doc.text("TeacherMada - Leçon", 10, 15);
     doc.setFontSize(11);
     const cleanText = text.replace(/[*#`]/g, '');
     const lines = doc.splitTextToSize(cleanText, 180);
     let yPos = 30;
     lines.forEach((line: string) => {
         if (yPos > 280) { doc.addPage(); yPos = 20; }
         doc.text(line, 15, yPos);
         yPos += 6;
     });
     doc.save(`tm_lecon_${Date.now()}.pdf`);
     notify("PDF généré.", 'success');
  };
  
  const handleExportImage = async (msgId: string) => {
      const element = document.getElementById(`msg-content-${msgId}`);
      if (!element) return;
      try {
          // @ts-ignore
          if (typeof window.html2canvas === 'undefined') { notify("Erreur librairie.", 'error'); return; }
          // @ts-ignore
          const canvas = await window.html2canvas(element, { scale: 2, backgroundColor: null, useCORS: true });
          const link = document.createElement('a');
          link.download = `lesson-${msgId}.png`;
          link.href = canvas.toDataURL("image/png");
          link.click();
          notify("Image téléchargée !", 'success');
      } catch (e) { notify("Erreur export image.", 'error'); }
  };

  const handleValidateJump = () => { 
      const num = parseInt(jumpInputVal); 
      const regex = new RegExp(`##\\s*(?:🟢|🔴|🔵)?\\s*(?:LEÇON|LECON|LESSON|LESONA)\\s*${num}`, 'i'); 
      const targetMsg = messages.find(m => m.role === 'model' && m.text.match(regex)); 
      if (targetMsg) { 
          setShowMenu(false); setJumpInputVal(''); 
          document.getElementById(`msg-${targetMsg.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' }); 
      } else { notify(`Leçon ${num} introuvable.`, 'error'); } 
  };
  
  const getLanguageDisplay = () => {
    const lang = preferences.targetLanguage;
    if (lang.includes("Chinois")) return "Chinois 🇨🇳";
    const parts = lang.split(' ');
    return `${parts[0]} ${parts[parts.length - 1]}`;
  };

  const isMg = preferences.explanationLanguage === ExplanationLanguage.Malagasy;

  // Render Variables
  const sendBtnClass = `p-2.5 rounded-full text-white transition-all shadow-md transform hover:scale-105 active:scale-95 flex items-center justify-center ${canSend ? 'bg-indigo-600 hover:bg-indigo-700' : 'bg-slate-400 cursor-not-allowed'}`;
  const micBtnClass = `p-2 rounded-full ${isListening ? 'bg-red-500 text-white animate-pulse' : 'text-slate-400 hover:text-indigo-600 hover:bg-slate-200'}`;

  return (
    <div className="flex flex-col h-screen bg-slate-50 dark:bg-slate-950 transition-colors duration-300">
      
      {/* Modals */}
      {showPaymentModal && <PaymentModal user={user} onClose={() => setShowPaymentModal(false)} />}
      {showTutorial && <TutorialOverlay onComplete={handleTutorialComplete} />}
      
      {/* Dialogue */}
      {isDialogueActive && <DialogueSession user={user} onClose={() => setIsDialogueActive(false)} onUpdateUser={onUpdateUser} notify={notify} />}

      {/* Voice Call Overlay */}
      {isCallActive && (
        <div className="fixed inset-0 z-[160] bg-slate-900/95 backdrop-blur-2xl flex flex-col items-center justify-between py-12 px-6 transition-all animate-fade-in overflow-hidden">
            {/* Logic for call UI here (simplified for brevity, keeping existing logic) */}
            {isAnalyzingCall || callSummary ? (
                <div className="w-full max-w-sm bg-white dark:bg-slate-800 rounded-3xl p-6 shadow-2xl animate-fade-in-up mt-20 relative border border-slate-100 dark:border-white/10">
                    {isAnalyzingCall ? (
                        <div className="flex flex-col items-center justify-center py-12 space-y-4">
                            <div className="w-16 h-16 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin"></div>
                            <p className="text-slate-600 dark:text-slate-300 font-bold animate-pulse">{isMg ? "Mamakafaka ny resaka..." : "Analyse de la conversation..."}</p>
                        </div>
                    ) : (
                        <div className="text-center">
                            <div className="w-20 h-20 mx-auto bg-indigo-100 dark:bg-indigo-900/30 rounded-full flex items-center justify-center mb-4 relative">
                                <Trophy className="w-10 h-10 text-indigo-600 dark:text-indigo-400 absolute opacity-20" />
                                <span className="text-4xl font-black text-indigo-600 dark:text-indigo-400 relative z-10">{callSummary?.score}</span>
                            </div>
                            <h3 className="text-xl font-bold text-slate-800 dark:text-white mb-2">{isMg ? "Bilan'ny antso" : "Bilan de l'appel"}</h3>
                            <div className="bg-slate-50 dark:bg-black/20 p-4 rounded-xl mb-4 text-sm text-slate-600 dark:text-slate-300 text-left border border-slate-100 dark:border-white/5">
                                <p className="mb-3"><strong>Feedback:</strong> {callSummary?.feedback}</p>
                                <div className="p-3 bg-emerald-50 dark:bg-emerald-900/10 rounded-lg border border-emerald-100 dark:border-emerald-900/20">
                                    <p className="text-emerald-700 dark:text-emerald-400 font-medium text-xs">💡 <strong>Tip:</strong> {callSummary?.tip}</p>
                                </div>
                            </div>
                            <button onClick={closeCallOverlay} className="w-full py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-bold transition-all shadow-lg shadow-indigo-500/30">
                                {isMg ? "Hikatona" : "Fermer"}
                            </button>
                        </div>
                    )}
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
                            {isCallConnecting ? (isMg ? "Mampiditra..." : "Appel en cours...") : (isLoading ? loadingText : (isMg ? "Mihaino..." : "Connecté"))}
                        </div>
                        {!isCallConnecting && (
                            <p className="text-4xl font-mono text-white/50 tracking-widest">{Math.floor(callSeconds / 60)}:{(callSeconds % 60).toString().padStart(2, '0')}</p>
                        )}
                    </div>
                    
                    <div className="relative flex items-center justify-center w-full max-w-sm aspect-square z-10">
                        {!isCallConnecting && (isPlayingAudio || isLoading) && (
                            <>
                                <div className="absolute w-40 h-40 rounded-full border border-indigo-500/30 animate-ripple-1"></div>
                                <div className="absolute w-40 h-40 rounded-full border border-indigo-500/20 animate-ripple-2"></div>
                                <div className="absolute w-40 h-40 rounded-full border border-indigo-500/10 animate-ripple-3"></div>
                            </>
                        )}
                        <div className={`w-40 h-40 rounded-full bg-gradient-to-br from-indigo-600 to-violet-700 p-1 shadow-[0_0_60px_rgba(99,102,241,0.4)] z-20 transition-transform duration-500 relative ${isPlayingAudio ? 'scale-110' : 'scale-100'}`}>
                            <div className="w-full h-full bg-slate-900 rounded-full flex items-center justify-center border-4 border-white/10 relative overflow-hidden">
                                {isCallConnecting ? (
                                    <Phone className="w-16 h-16 text-white animate-bounce" />
                                ) : (
                                    <div className="text-6xl select-none">🎓</div>
                                )}
                            </div>
                        </div>
                    </div>
                    
                    <div className="w-full max-w-xs grid grid-cols-3 gap-6 mb-12 relative z-20">
                        <button onClick={toggleMute} className={`flex flex-col items-center gap-2 group`}>
                            <div className={`p-4 rounded-full transition-all ${isMuted ? 'bg-white text-slate-900' : 'bg-slate-800/50 text-white border border-slate-700 hover:bg-slate-700'}`}>
                                {isMuted ? <VolumeX className="w-6 h-6" /> : <Volume2 className="w-6 h-6" />}
                            </div>
                            <span className="text-xs text-slate-400 font-medium">Mute</span>
                        </button>
                        <button onClick={handleEndCall} className="flex flex-col items-center gap-2 transform hover:scale-105 transition-transform">
                            <div className="p-6 bg-red-500 hover:bg-red-600 text-white rounded-full shadow-[0_0_30px_rgba(239,68,68,0.4)] border-4 border-slate-900/50">
                                <PhoneOff className="w-8 h-8 fill-current" />
                            </div>
                            <span className="text-xs text-slate-400 font-medium">Raccrocher</span>
                        </button>
                        <div className="relative flex flex-col items-center gap-2">
                            <div className="absolute -top-10 left-1/2 -translate-x-1/2 bg-white text-slate-900 text-[10px] font-bold px-2 py-1 rounded shadow-lg animate-bounce pointer-events-none z-30 whitespace-nowrap">
                                {isMg ? "Tsindrio eto" : "Appuyez ici"}
                                <div className="absolute bottom-0 left-1/2 -translate-x-1/2 translate-y-1/2 rotate-45 w-1.5 h-1.5 bg-white"></div>
                            </div>
                            <button onClick={toggleListening} className={`p-4 rounded-full transition-all ${isListening ? 'bg-white text-slate-900 ring-4 ring-emerald-500/50' : 'bg-slate-800/50 text-white border border-slate-700 hover:bg-slate-700'}`}>
                                {isListening ? <Mic className="w-6 h-6" /> : <MicOff className="w-6 h-6" />}
                            </button>
                            <span className="text-xs text-slate-400 font-medium">Micro</span>
                        </div>
                    </div>
                </>
            )}
        </div>
      )}

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

      {/* Summary Modal */}
      {showSummaryResultModal && (
        <div className="fixed inset-0 z-[100] bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="bg-white dark:bg-slate-900 rounded-2xl w-full max-w-lg p-6 shadow-xl border border-slate-100 max-h-[80vh] flex flex-col">
                <div className="flex justify-between items-center mb-4 pb-2 border-b">
                    <h3 className="font-bold flex items-center gap-2 text-slate-800 dark:text-white"><BookOpen className="text-indigo-500"/> Résumé</h3>
                    <button onClick={() => setShowSummaryResultModal(false)}><X className="text-slate-500"/></button>
                </div>
                <div className="flex-1 overflow-y-auto scrollbar-hide">
                    {isGeneratingSummary ? <div className="text-center py-10"><Loader2 className="animate-spin mx-auto text-indigo-500 mb-2"/>Génération...</div> : <MarkdownRenderer content={summaryContent}/>}
                </div>
            </div>
        </div>
      )}

      {/* HEADER (TOPBAR) */}
      <header className="fixed top-0 left-0 right-0 z-40 bg-white/80 dark:bg-slate-900/90 backdrop-blur-xl shadow-sm h-16 px-4 flex items-center justify-between border-b border-slate-200/50 dark:border-slate-800/50 transition-all duration-300">
        
        {/* LEFT: Navigation & Smart Context */}
        <div className="flex-1 flex items-center gap-3">
            <button 
                onClick={() => { stopAudio(); onChangeMode(); }} 
                disabled={isAnalyzing}
                className="group p-2 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 hover:bg-indigo-100 dark:hover:bg-indigo-900/30 hover:text-indigo-600 dark:hover:text-indigo-400 transition-all disabled:opacity-50 shrink-0"
                title="Retour au menu"
            >
                {isAnalyzing ? <Loader2 className="w-5 h-5 animate-spin" /> : <ArrowLeft className="w-5 h-5 group-hover:-translate-x-0.5 transition-transform" />}
            </button>

            {/* Smart Context Pill (Flag + Level) */}
            <div className="relative">
                <button 
                    onClick={() => setShowSmartOptions(!showSmartOptions)}
                    className="flex items-center gap-2 pl-1 pr-3 py-1.5 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-full hover:border-indigo-300 dark:hover:border-indigo-700 transition-all group active:scale-95"
                >
                    <div className="w-7 h-7 rounded-full bg-white dark:bg-slate-700 flex items-center justify-center shadow-sm text-lg leading-none pb-0.5">
                        {preferences.targetLanguage.split(' ').pop()} 
                    </div>
                    <div className="flex flex-col items-start leading-none gap-0.5">
                        <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">Niveau</span>
                        <span className="text-sm font-bold text-slate-800 dark:text-white group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors">
                            {preferences.level}
                        </span>
                    </div>
                    <ChevronDown className={`w-3 h-3 text-slate-400 ml-1 transition-transform duration-300 ${showSmartOptions ? 'rotate-180' : ''}`} />
                </button>

                {/* Smart Options Dropdown */}
                {showSmartOptions && (
                    <div className="absolute top-12 left-0 w-64 bg-white dark:bg-slate-900 rounded-2xl shadow-xl border border-slate-100 dark:border-slate-700 p-2 animate-fade-in-up z-50">
                        <div className="p-2 border-b border-slate-100 dark:border-slate-800 mb-2 text-xs font-bold text-slate-400 uppercase tracking-wider">
                            Options Smart
                        </div>
                        <div className="space-y-1">
                            <button onClick={handleStartTraining} className="w-full text-left p-2.5 hover:bg-slate-50 dark:hover:bg-slate-800 rounded-lg flex items-center gap-3 text-sm font-medium transition-colors">
                                <BrainCircuit className="w-4 h-4 text-orange-500"/>
                                <span className="text-slate-700 dark:text-slate-300">Exercice Pratique</span>
                            </button>
                            <button onClick={handleStartCall} className="w-full text-left p-2.5 hover:bg-slate-50 dark:hover:bg-slate-800 rounded-lg flex items-center gap-3 text-sm font-medium transition-colors">
                                <Phone className="w-4 h-4 text-purple-500"/>
                                <span className="text-slate-700 dark:text-slate-300">Appel Vocal</span>
                            </button>
                            <button onClick={() => { setShowSmartOptions(false); setInput("Peux-tu traduire ceci : "); textareaRef.current?.focus(); }} className="w-full text-left p-2.5 hover:bg-slate-50 dark:hover:bg-slate-800 rounded-lg flex items-center gap-3 text-sm font-medium transition-colors">
                                <Languages className="w-4 h-4 text-blue-500"/>
                                <span className="text-slate-700 dark:text-slate-300">Traduction</span>
                            </button>
                            <button onClick={() => { setShowSmartOptions(false); setIsDialogueActive(true); }} className="w-full text-left p-2.5 hover:bg-slate-50 dark:hover:bg-slate-800 rounded-lg flex items-center gap-3 text-sm font-medium transition-colors">
                                <MessageCircle className="w-4 h-4 text-emerald-500"/>
                                <span className="text-slate-700 dark:text-slate-300">Dialogues</span>
                            </button>
                             <div className="my-1 border-t border-slate-100 dark:border-slate-800"></div>
                             <button onClick={() => { setShowSmartOptions(false); onChangeMode(); }} className="w-full text-left p-2.5 hover:bg-slate-50 dark:hover:bg-slate-800 rounded-lg flex items-center gap-3 text-sm font-medium transition-colors group">
                                <Library className="w-4 h-4 text-indigo-500"/>
                                <span className="text-slate-700 dark:text-slate-300">Autres Cours</span>
                            </button>
                        </div>
                    </div>
                )}
            </div>
        </div>

        {/* CENTER: Lesson Title (Hidden on small mobile) */}
        <div className="hidden md:flex flex-col items-center justify-center absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 pointer-events-none">
            <span className="text-[10px] font-bold text-indigo-500 uppercase tracking-widest bg-indigo-50 dark:bg-indigo-900/20 px-2 py-0.5 rounded-full mb-0.5">
                Cours Structuré
            </span>
            <h1 className="text-base font-black text-slate-800 dark:text-white">
                Leçon {currentLessonNumber}
            </h1>
        </div>

        {/* RIGHT: Credits & Profile */}
        <div className="flex-1 flex items-center justify-end gap-3">
            
            {/* Wallet / Credits Pill */}
            <button 
                onClick={() => setShowPaymentModal(true)} 
                className={`flex items-center gap-2 px-3 py-1.5 rounded-full border transition-all ${
                    canSend 
                    ? 'bg-amber-50 dark:bg-amber-900/10 border-amber-200 dark:border-amber-800/30 text-amber-700 dark:text-amber-500 hover:bg-amber-100 hover:border-amber-300 dark:hover:border-amber-700' 
                    : 'bg-red-50 border-red-200 text-red-600 animate-pulse'
                }`}
                title="Recharger mes crédits"
            >
                <div className={`p-0.5 rounded-full ${canSend ? 'bg-amber-200 dark:bg-amber-800' : 'bg-red-200'}`}>
                    <Coins className={`w-3.5 h-3.5 ${canSend ? 'text-amber-700 dark:text-amber-200' : 'text-red-700'}`} />
                </div>
                <span className="font-bold text-sm hidden sm:inline">{user.role === 'admin' ? '∞' : user.credits} CR</span>
                <span className="font-bold text-sm sm:hidden">{user.role === 'admin' ? '∞' : user.credits}</span>
            </button>

            {/* Menu Trigger */}
            <div className="relative">
                <button 
                    onClick={() => setShowMenu(!showMenu)}
                    className={`p-2 rounded-full transition-colors ${showMenu ? 'bg-indigo-100 dark:bg-indigo-900/50 text-indigo-600' : 'text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800'}`}
                >
                    <Menu className="w-6 h-6" />
                </button>
                
                {/* Menu Dropdown */}
                {showMenu && (
                     <div className="absolute top-12 right-0 w-72 bg-white dark:bg-slate-900 rounded-2xl shadow-xl border border-slate-100 dark:border-slate-700 p-3 animate-fade-in-up z-50">
                         {/* Enhanced Search inside Menu */}
                         <div className="p-2 border-b border-slate-100 dark:border-slate-800 mb-2">
                             <div className="relative flex items-center">
                                 <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400"/>
                                 <input 
                                    type="text" 
                                    placeholder="Rechercher..." 
                                    value={searchQuery}
                                    onChange={(e) => setSearchQuery(e.target.value)}
                                    className="w-full bg-slate-50 dark:bg-black/20 text-sm py-2 pl-9 pr-10 rounded-lg border-none outline-none focus:ring-1 focus:ring-indigo-500"
                                 />
                             </div>
                         </div>
                        
                         {/* Controls Grid */}
                         <div className="grid grid-cols-2 gap-2 mb-2">
                             <button onClick={() => { setShowSummaryResultModal(false); setShowMenu(true); }} className="p-3 bg-slate-50 dark:bg-slate-800 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors flex flex-col items-center justify-center text-center gap-2 group">
                                 <BookOpen className="w-5 h-5 text-indigo-500 group-hover:scale-110 transition-transform"/>
                                 <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wide">Résumé</span>
                             </button>

                             <button className="p-3 bg-slate-50 dark:bg-slate-800 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors flex flex-col items-center justify-center text-center gap-2 group">
                                 <RotateCcw className="w-5 h-5 text-emerald-500 group-hover:scale-110 transition-transform"/>
                                 <div className="w-full flex items-center justify-center gap-1">
                                     <input type="number" placeholder="#" value={jumpInputVal} onChange={e => setJumpInputVal(e.target.value)} onClick={e => e.stopPropagation()} className="w-6 text-center bg-transparent border-b border-slate-300 dark:border-slate-600 text-xs focus:border-emerald-500 outline-none"/>
                                     <span onClick={(e) => { e.stopPropagation(); handleValidateJump(); }} className="text-[10px] font-black text-emerald-600 cursor-pointer">GO</span>
                                 </div>
                             </button>
                         </div>

                         <div className="border-t border-slate-100 dark:border-slate-800 pt-2 space-y-1">
                             <button onClick={toggleTheme} className="w-full p-2.5 hover:bg-slate-50 dark:hover:bg-slate-800 rounded-lg flex items-center gap-3 transition-colors">
                                 {isDarkMode ? <Sun className="w-4 h-4 text-amber-500"/> : <Moon className="w-4 h-4 text-indigo-500"/>}
                                 <span className="text-xs font-bold text-slate-600 dark:text-slate-300">Thème</span>
                             </button>
                             <button onClick={handleToggleExplanationLang} className="w-full p-2.5 hover:bg-slate-50 dark:hover:bg-slate-800 rounded-lg flex items-center gap-3 transition-colors">
                                 <Languages className="w-4 h-4 text-purple-500"/>
                                 <span className="text-xs font-bold text-slate-600 dark:text-slate-300">Prof: {preferences.explanationLanguage.split(' ')[0]}</span>
                             </button>
                         </div>

                         <div className="p-2 bg-slate-50 dark:bg-slate-800 rounded-lg mt-2">
                            <div className="flex items-center gap-2 text-xs font-bold mb-2 text-slate-500 dark:text-slate-400 uppercase">
                                <Type className="w-3 h-3"/> Taille Texte
                            </div>
                            <div className="flex bg-white dark:bg-slate-700 rounded-lg p-1 gap-1">
                                {(['small', 'normal', 'large', 'xl'] as const).map(s => (
                                    <button key={s} onClick={() => handleFontSizeChange(s)} className={`flex-1 text-[10px] py-1.5 rounded-md font-bold transition-all ${fontSize === s ? 'bg-indigo-600 shadow text-white' : 'text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-600'}`}>
                                        {s === 'small' ? 'A' : s === 'normal' ? 'A+' : 'A++'}
                                    </button>
                                ))}
                            </div>
                         </div>
                     </div>
                 )}
             </div>
             
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
      <div id="chat-feed" className={`flex-1 overflow-y-auto p-3 md:p-4 space-y-4 md:space-y-6 pt-20 pb-4 scrollbar-hide`}>
        {messages.filter(msg => !searchQuery || msg.text.toLowerCase().includes(searchQuery.toLowerCase())).map((msg, index) => {
            const isMatch = searchQuery && msg.text.toLowerCase().includes(searchQuery.toLowerCase());
            const isCurrentMatch = matchingMessages[currentMatchIndex]?.id === msg.id;

            return (
                <div key={msg.id} id={`msg-${msg.id}`} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'} animate-fade-in`}>
                    <div className={`flex max-w-[90%] md:max-w-[80%] ${msg.role === 'user' ? 'flex-row-reverse' : 'flex-row'}`}>
                        <div className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center mt-1 mx-2 shadow-sm ${msg.role === 'user' ? 'bg-indigo-100' : 'bg-white border p-1'}`}>
                            {msg.role === 'user' ? <User className="w-4 h-4 text-indigo-600" /> : <img src="/logo.png" onError={(e) => { e.currentTarget.onerror = null; e.currentTarget.src = '/logo.svg'; }} className="w-full h-full object-contain" alt="Teacher" />}
                        </div>
                        <div 
                            id={`msg-content-${msg.id}`} 
                            className={`px-4 py-3 rounded-2xl shadow-sm ${textSizeClass} transition-all duration-300
                            ${msg.role === 'user' ? 'bg-indigo-600 text-white rounded-tr-none' : 'bg-white dark:bg-slate-800 dark:text-slate-200 text-slate-800 rounded-tl-none border border-slate-100 dark:border-slate-700'} 
                            ${isCurrentMatch ? 'ring-4 ring-yellow-400/50 shadow-yellow-200 dark:shadow-none' : isMatch ? 'ring-2 ring-yellow-200/50' : ''}`}
                        >
                             {msg.role === 'user' ? <p className="whitespace-pre-wrap">{msg.text}</p> : (
                                <>
                                    <MarkdownRenderer content={msg.text} onPlayAudio={(t) => handleSpeak(t)} highlight={searchQuery} />
                                    
                                    {index === 0 && msg.role === 'model' && messages.length === 1 && (
                                        <div className="mt-4 pt-4 border-t border-slate-100 dark:border-slate-700 flex justify-center">
                                            <button 
                                                onClick={() => handleSend("Commence le cours / Leçon 1")} 
                                                className="group relative px-6 py-2.5 bg-gradient-to-r from-indigo-600 to-violet-600 text-white font-bold rounded-full shadow-lg hover:shadow-xl hover:scale-105 transition-all duration-300 flex items-center gap-2"
                                            >
                                                <span>COMMENCER</span>
                                                <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                                            </button>
                                        </div>
                                    )}

                                    <div className="flex items-center gap-2 mt-2 pt-2 border-t border-slate-100 dark:border-slate-700/50" data-html2canvas-ignore>
                                        <button onClick={() => handleSpeak(msg.text, msg.id)} className="p-1 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-full transition-colors" title="Écouter"><Volume2 className="w-4 h-4 text-slate-400 hover:text-indigo-500"/></button>
                                        <button onClick={() => handleCopy(msg.text, msg.id)} className="p-1 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-full transition-colors" title="Copier">{copiedId === msg.id ? <Check className="w-4 h-4 text-emerald-500"/> : <Copy className="w-4 h-4 text-slate-400"/></button>
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
        {(isLoading || isAnalyzing) && (
             <div className="flex justify-start animate-fade-in">
                 <div className="flex-shrink-0 w-8 h-8 rounded-full bg-white border flex items-center justify-center mt-1 mx-2 p-1"><img src="/logo.png" onError={(e) => { e.currentTarget.onerror = null; e.currentTarget.src = '/logo.svg'; }} className="w-full h-full object-contain" alt="Teacher" /></div>
                 <div className="bg-white dark:bg-slate-800 px-4 py-3 rounded-2xl rounded-tl-none border shadow-sm flex items-center gap-2">
                    <Loader2 className="w-4 h-4 animate-spin text-indigo-500"/> <span className="text-sm text-slate-500">TeacherMada écrit...</span>
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
                         <button onClick={() => setGeneratedImage(null)} className="absolute top-2 right-2 p-1.5 bg-black/50 hover:bg-black/70 text-white rounded-full backdrop-blur-sm transition-colors"><X className="w-4 h-4" /></button>
                    </div>
                )}
            </div>
        )}

        {/* Quick Actions Toolbar with Progress Bar */}
        <div className="max-w-4xl mx-auto mb-2 flex items-center gap-2 px-2 overflow-x-auto scrollbar-hide">
            <Tooltip text="Appel Vocal">
                <button onClick={handleStartCall} className="p-2 bg-purple-50 dark:bg-purple-900/20 rounded-full shadow-sm border border-purple-100 dark:border-purple-800 text-purple-600 dark:text-purple-400 hover:bg-purple-100 dark:hover:bg-purple-900/40 transition-colors">
                    <Phone className="w-4 h-4" />
                </button>
            </Tooltip>
            
            <div className="flex-1 mx-3 flex flex-col justify-center">
                <div className="flex justify-between items-center text-[10px] font-bold text-slate-400 dark:text-slate-500 mb-1 px-1">
                    <span className="text-indigo-500 dark:text-indigo-400">{levelProgressData.startCode}</span>
                    <span className="text-slate-300 dark:text-slate-600">{Math.round(levelProgressData.percentage)}%</span>
                    <span>{levelProgressData.targetCode}</span>
                </div>
                <div className="h-1.5 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden relative shadow-inner">
                    <div className="h-full bg-gradient-to-r from-indigo-500 via-purple-500 to-indigo-500 animate-gradient-x absolute top-0 left-0 transition-all duration-1000 ease-out" style={{ width: `${levelProgressData.percentage}%` }}></div>
                </div>
            </div>
            
             <Tooltip text="Leçon Suivante">
                <button onClick={() => handleSend("Passe à la suite / Leçon suivante")} className="flex items-center gap-2 px-3 py-1.5 bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-300 rounded-full text-xs font-bold hover:bg-indigo-100 dark:hover:bg-indigo-900/50 transition-colors border border-indigo-100 dark:border-indigo-900/50">
                    Suivant <ArrowRight className="w-3 h-3" />
                </button>
            </Tooltip>
        </div>

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
                 <button onClick={handleTranslateInput} disabled={!input.trim() || isTranslating} className="p-2 rounded-full text-slate-400 hover:text-indigo-600 hover:bg-slate-200 dark:hover:bg-slate-700 disabled:opacity-50">
                    {isTranslating ? <Loader2 className="w-5 h-5 animate-spin" /> : <Languages className={`w-5 h-5 ${isTranslating ? 'animate-spin text-indigo-600' : ''}`} />}
                 </button>
                 <button onClick={toggleListening} className={micBtnClass}>
                    {isListening ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
                 </button>
                 <button 
                    onClick={() => handleSend()} 
                    disabled={!input.trim() || isLoading || isAnalyzing} 
                    className={sendBtnClass}
                 >
                    {canSend ? <Send className="w-4 h-4" /> : <Lock className="w-4 h-4" />}
                </button>
            </div>
        </div>
        <div className="text-center mt-1">
             <span className="text-[10px] text-slate-400">1 Leçon = 1 Crédit (50 Ar) • Gratuit: 2/semaines.</span>
        </div>
      </div>
    </div>
  );
};

export default ChatInterface;
