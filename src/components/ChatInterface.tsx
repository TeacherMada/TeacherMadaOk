
import React, { useState, useRef, useEffect, useMemo } from 'react';
import { Send, User, Mic, Volume2, ArrowLeft, Loader2, Copy, Check, ArrowRight, Phone, Globe, ChevronDown, MicOff, BookOpen, Search, AlertTriangle, X, Sun, Moon, Languages, Coins, Lock, BrainCircuit, Menu, FileText, Type, RotateCcw, MessageCircle, Image as ImageIcon, Library, PhoneOff, VolumeX, Trophy, Info } from 'lucide-react';
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
  onShowProfile,
  onUpdateUser,
  isDarkMode,
  toggleTheme,
  isAnalyzing,
  onMessageSent,
  fontSize,
  notify
}) => {
  // --- STATE MANAGEMENT ---
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isPlayingAudio, setIsPlayingAudio] = useState(false);
  const [showMenu, setShowMenu] = useState(false);
  const [showSmartOptions, setShowSmartOptions] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  
  const [isTranslating, setIsTranslating] = useState(false);
  const [isListening, setIsListening] = useState(false);
  
  // Voice Call
  const [showCallConfirm, setShowCallConfirm] = useState(false);
  const [isCallActive, setIsCallActive] = useState(false);
  const [isCallConnecting, setIsCallConnecting] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [callSeconds, setCallSeconds] = useState(0);
  const [loadingText, setLoadingText] = useState("Réflexion...");
  const [callSummary, setCallSummary] = useState<VoiceCallSummary | null>(null);
  const [isAnalyzingCall, setIsAnalyzingCall] = useState(false);
  const [voiceTextInput, setVoiceTextInput] = useState(''); // New input for voice fallback
  
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
  
  // Summary & Tools
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

  // --- CALCULATED VALUES ---

  const levelProgressData = useMemo(() => {
      const currentLevelCode = user.preferences?.level || 'A1';
      const percentage = Math.min((user.stats.levelProgress || 0) * 2, 100); // 0-50 mapped to 0-100%
      
      let targetCode = 'MAX';
      const levels = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'];
      const hskLevels = ['HSK 1', 'HSK 2', 'HSK 3', 'HSK 4', 'HSK 5', 'HSK 6'];
      
      const list = currentLevelCode.includes('HSK') ? hskLevels : levels;
      const idx = list.indexOf(currentLevelCode);
      if (idx !== -1 && idx < list.length - 1) {
          targetCode = list[idx + 1];
      }
      
      return { startCode: currentLevelCode, targetCode, percentage };
  }, [user.stats.levelProgress, user.preferences?.level]);

  // Search Logic
  const matchingMessages = useMemo(() => {
    if (!searchQuery.trim()) return [];
    return messages
      .map((m, i) => ({ id: m.id, index: i, match: m.text.toLowerCase().includes(searchQuery.toLowerCase()) }))
      .filter(m => m.match);
  }, [messages, searchQuery]);

  // --- EFFECTS ---

  useEffect(() => { setCurrentMatchIndex(0); }, [searchQuery]);

  useEffect(() => {
    if (matchingMessages.length > 0) {
      const match = matchingMessages[currentMatchIndex];
      const el = document.getElementById(`msg-${match.id}`);
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [currentMatchIndex, matchingMessages]);

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

  // --- AUDIO HELPER ---
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
    setVoiceTextInput(''); // Clear voice text input too
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
      
      const updatedUser = storageService.getUserById(user.id);
      if (updatedUser) onUpdateUser(updatedUser);
      
      if (isCallActive) handleSpeak(responseText);

    } catch (error) {
        console.error(error);
        setIsLoading(false);
        notify("Erreur lors de la génération.", 'error');
    } finally { 
      setIsLoading(false); 
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
        const updatedUser = storageService.getUserById(user.id);
        if (updatedUser) onUpdateUser(updatedUser);

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

  // --- VOICE CALL LOGIC ---
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

  const initiateCallFlow = () => {
      if (!storageService.canPerformRequest(user.id).allowed) {
          setShowPaymentModal(true);
          return;
      }
      setShowSmartOptions(false);
      setShowCallConfirm(true); // Open confirmation modal first
  };

  const confirmStartCall = () => {
      setShowCallConfirm(false);
      setIsCallActive(true);
      setIsCallConnecting(true);
      setCallSeconds(0);
      setCallSummary(null);
      setIsAnalyzingCall(false);
      
      // Ringback logic would go here
      setTimeout(() => {
          setIsCallConnecting(false);
          const isMg = preferences.explanationLanguage === ExplanationLanguage.Malagasy;
          const greeting = isMg 
            ? `Manao ahoana ${user.username} ! Vonona hianatra ve ianao?`
            : `Bonjour ${user.username} ! Je suis TeacherMada. Prêt pour la pratique orale?`;
          handleSpeak(greeting);
      }, 3000);
  };

  const handleEndCall = async () => {
      stopAudio();
      stopListening(); // Stop listening if call ends
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

  // --- AUTO MICROPHONE LOGIC ---
  useEffect(() => {
      if (!isCallActive || isCallConnecting || callSummary) {
          // If call not active or connecting, stop everything
          if (isListening) stopListening();
          return;
      }

      // If Audio IS Playing (Prof speaks) OR Loading (Thinking) -> Stop Listening
      if (isPlayingAudio || isLoading) {
          if (isListening) stopListening();
      } 
      // If Audio Stopped AND Not Loading -> User Turn -> Start Listening
      else {
          if (!isListening && !isMuted) {
              startListening();
          }
      }
  }, [isCallActive, isCallConnecting, isPlayingAudio, isLoading, callSummary]); // Added mute logic in startListening check

  // --- OTHER HANDLERS ---
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

  const handleTranslateInput = async () => {
    if (!input.trim()) return;
    setIsTranslating(true);
    try {
        const translation = await translateText(input, preferences.targetLanguage, user.id);
        setInput(translation);
    } catch (e: any) {
        if(e.message === 'INSUFFICIENT_CREDITS') { setShowPaymentModal(true); }
        else { notify("Échec traduction.", 'error'); }
    } finally {
        setIsTranslating(false);
    }
  };

  const handleStartTraining = async () => {
      setShowSmartOptions(false);
      setIsTrainingMode(true);
      setExercises([]);
      setExerciseError(false);
      setIsLoadingExercises(true);
      try {
          const gen = await generatePracticalExercises(user, messages);
          setExercises(gen);
      } catch(e: any) {
          setExerciseError(true);
      } finally { setIsLoadingExercises(false); }
  };

  const handleValidateSummary = async () => {
      const num = parseInt(summaryInputVal);
      if (isNaN(num)) return;
      setIsGeneratingSummary(true); setShowSummaryResultModal(true); setShowMenu(false);
      try {
        const summary = await getLessonSummary(num, messages.slice(-10).map(m=>m.text).join('\n'), user.id);
        setSummaryContent(summary);
      } catch(e) { setSummaryContent("Erreur."); } finally { setIsGeneratingSummary(false); }
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

  // --- SPEECH RECOGNITION ---
  const stopListening = () => {
    if (recognitionRef.current) {
        try { recognitionRef.current.stop(); } catch(e){}
        recognitionRef.current = null;
    }
    setIsListening(false);
  };

  const startListening = () => {
    if (isMuted && isCallActive) {
        // notify("Micro désactivé.", 'info'); // Silent check
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
    recognition.onend = () => {
        setIsListening(false);
        // If still call active and not playing audio, restart? 
        // No, let useEffect handle restart based on state, or manual toggle.
        // Actually, for continuous conversation, we might want to restart if input is empty
        // But for now, let's rely on standard flow.
    };
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

  // --- EXPORT TOOLS ---
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
          if (typeof (window as any).html2canvas === 'undefined') { notify("Bibliothèque d'export indisponible", 'error'); return; }
          
          const canvas = await (window as any).html2canvas(element, { 
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

  // --- CLEANUP ---
  useEffect(() => {
    textareaRef.current?.focus();
    return () => { 
        stopAudio(); 
        stopListening();
    };
  }, []);

  // --- RENDER ---
  const canSend = storageService.canPerformRequest(user.id).allowed;
  const isFreeTier = user.role !== 'admin' && user.credits <= 0;
  const freeUsageLeft = isFreeTier ? Math.max(0, 2 - user.freeUsage.count) : 0;
  const isMg = preferences.explanationLanguage === ExplanationLanguage.Malagasy;

  const renderCallOverlay = () => {
      if (isAnalyzingCall || callSummary) {
          return (
            <div className="w-full max-w-sm bg-white dark:bg-slate-800 rounded-3xl p-6 shadow-2xl animate-fade-in-up mt-20 relative border border-slate-100 dark:border-white/10">
                {isAnalyzingCall ? (
                    <div className="flex flex-col items-center justify-center py-12 space-y-4">
                        <Loader2 className="w-16 h-16 text-indigo-500 animate-spin"/>
                        <p className="text-slate-600 dark:text-slate-300 font-bold animate-pulse">{isMg ? "Mamakafaka..." : "Analyse..."}</p>
                    </div>
                ) : (
                    <div className="text-center">
                        <div className="w-20 h-20 mx-auto bg-indigo-100 dark:bg-indigo-900/30 rounded-full flex items-center justify-center mb-4 relative">
                            <Trophy className="w-10 h-10 text-indigo-600 dark:text-indigo-400" />
                            <span className="text-4xl font-black text-indigo-600 dark:text-indigo-400 absolute">{callSummary?.score}</span>
                        </div>
                        <h3 className="text-xl font-bold text-slate-800 dark:text-white mb-2">{isMg ? "Bilan" : "Bilan"}</h3>
                        <p className="mb-4 text-sm text-slate-600 dark:text-slate-300 font-medium">"{callSummary?.feedback}"</p>
                        <div className="bg-emerald-50 dark:bg-emerald-900/20 p-3 rounded-lg mb-4 text-xs text-emerald-700 dark:text-emerald-300">
                            💡 {callSummary?.tip}
                        </div>
                        <button onClick={closeCallOverlay} className="w-full py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-bold">Fermer</button>
                    </div>
                )}
            </div>
          );
      }

      return (
        <>
            {/* Top Bar with Quit */}
            <div className="absolute top-6 right-6 z-50">
                <button onClick={handleEndCall} className="p-3 bg-white/20 hover:bg-white/30 backdrop-blur-md rounded-full text-white transition-colors">
                    <X className="w-6 h-6" />
                </button>
            </div>

            <div className="text-center space-y-4 mt-12 z-20">
                <h2 className="text-3xl font-bold text-white drop-shadow-md">TeacherMada</h2>
                <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-slate-800/80 border border-slate-700 backdrop-blur-sm text-indigo-200 text-sm font-medium">
                    <div className={`w-2 h-2 rounded-full ${isCallConnecting ? 'bg-amber-500 animate-pulse' : 'bg-emerald-500'}`}></div>
                    {isCallConnecting ? "Connexion..." : (isLoading ? "Réfléchit..." : "En ligne")}
                </div>
                {!isCallConnecting && <p className="text-4xl font-mono text-white/50">{Math.floor(callSeconds / 60)}:{(callSeconds % 60).toString().padStart(2, '0')}</p>}
            </div>
            
            <div className="relative flex items-center justify-center w-full max-w-sm aspect-square z-10">
                <div className={`w-40 h-40 rounded-full bg-gradient-to-br from-indigo-600 to-violet-700 p-1 shadow-[0_0_60px_rgba(99,102,241,0.4)] z-20 transition-transform duration-500 ${isPlayingAudio ? 'scale-110' : 'scale-100'}`}>
                    <div className="w-full h-full bg-slate-900 rounded-full flex items-center justify-center border-4 border-white/10 overflow-hidden">
                        {isCallConnecting ? (
                            <Phone className="w-16 h-16 text-white animate-bounce" /> 
                        ) : (
                            <img src="/logo.png" className="w-full h-full object-cover p-2" alt="Teacher" />
                        )}
                    </div>
                </div>
                
                {/* Text Fallback Input - Improved Responsive */}
                <div className="absolute -bottom-24 w-full px-6 animate-fade-in-up flex justify-center">
                    <div className="flex gap-2 bg-slate-800/90 backdrop-blur-md p-2 rounded-2xl border border-slate-700/50 shadow-xl w-full max-w-sm">
                        <input 
                            type="text" 
                            value={voiceTextInput}
                            onChange={(e) => setVoiceTextInput(e.target.value)}
                            onKeyDown={(e) => e.key === 'Enter' && handleSend(voiceTextInput)}
                            placeholder={isListening ? "Je vous écoute..." : "Écrire si micro HS..."}
                            className="flex-1 bg-transparent text-white px-3 text-sm outline-none placeholder:text-slate-400 min-w-0"
                        />
                        <button onClick={() => handleSend(voiceTextInput)} disabled={!voiceTextInput.trim() || isLoading} className="p-2.5 bg-indigo-600 hover:bg-indigo-700 rounded-xl text-white disabled:opacity-50 shrink-0 transition-colors">
                            <Send className="w-4 h-4" />
                        </button>
                    </div>
                </div>
            </div>
            
            <div className="w-full max-w-xs grid grid-cols-3 gap-6 mb-12 relative z-20 mt-auto">
                <button onClick={() => setIsMuted(!isMuted)} className="flex flex-col items-center gap-2 group">
                    <div className={`p-4 rounded-full transition-all ${isMuted ? 'bg-white text-slate-900' : 'bg-slate-800/50 text-white border border-slate-700'}`}>
                        {isMuted ? <VolumeX className="w-6 h-6" /> : <Volume2 className="w-6 h-6" />}
                    </div>
                    <span className="text-xs text-slate-400">Mute</span>
                </button>
                <button onClick={handleEndCall} className="flex flex-col items-center gap-2 transform hover:scale-105">
                    <div className="p-6 bg-red-500 text-white rounded-full shadow-lg border-4 border-slate-900/50"><PhoneOff className="w-8 h-8" /></div>
                    <span className="text-xs text-slate-400">Raccrocher</span>
                </button>
                <button onClick={toggleListening} className="flex flex-col items-center gap-2">
                    <div className={`p-4 rounded-full transition-all ${isListening ? 'bg-white text-slate-900 animate-pulse' : 'bg-slate-800/50 text-white border border-slate-700'}`}>
                        {isListening ? <MicOff className="w-6 h-6" /> : <Mic className="w-6 h-6" />}
                    </div>
                    <span className="text-xs text-slate-400">Micro {isListening ? 'ON' : 'OFF'}</span>
                </button>
            </div>
        </>
      );
  };

  return (
    <div className="flex flex-col h-screen bg-slate-50 dark:bg-slate-950 transition-colors duration-300">
      
      {/* Modals */}
      {showPaymentModal && <PaymentModal user={user} onClose={() => setShowPaymentModal(false)} />}
      {showTutorial && <TutorialOverlay onComplete={() => setShowTutorial(false)} />}
      {isDialogueActive && <DialogueSession user={user} onClose={() => setIsDialogueActive(false)} onUpdateUser={onUpdateUser} notify={notify} />}

      {/* Voice Call Confirmation Modal */}
      {showCallConfirm && (
          <div className="fixed inset-0 z-[150] bg-slate-900/80 backdrop-blur-sm flex items-center justify-center p-6 animate-fade-in">
              <div className="bg-white dark:bg-slate-900 w-full max-w-sm rounded-3xl p-6 shadow-2xl border border-slate-100 dark:border-slate-800 text-center relative overflow-hidden">
                  <div className="absolute top-0 left-0 w-full h-2 bg-gradient-to-r from-purple-500 to-indigo-600"></div>
                  
                  <div className="w-16 h-16 bg-indigo-50 dark:bg-indigo-900/30 rounded-full flex items-center justify-center mx-auto mb-4 animate-pulse">
                      <Phone className="w-8 h-8 text-indigo-600 dark:text-indigo-400" />
                  </div>
                  
                  <h3 className="text-xl font-bold text-slate-900 dark:text-white mb-2">
                      {isMg ? "Hantso TeacherMada ?" : "Appeler TeacherMada ?"}
                  </h3>
                  
                  <div className="bg-slate-50 dark:bg-slate-800 p-4 rounded-xl mb-6 text-left space-y-3 border border-slate-100 dark:border-slate-700">
                      <div className="flex items-start gap-2 text-sm text-slate-600 dark:text-slate-300">
                          <Check className="w-4 h-4 text-emerald-500 mt-0.5 shrink-0" />
                          <span>{isMg ? "Miresaka mivantana (Audio)" : "Conversation directe (Audio)"}</span>
                      </div>
                      <div className="flex items-start gap-2 text-sm text-slate-600 dark:text-slate-300">
                          <Info className="w-4 h-4 text-blue-500 mt-0.5 shrink-0" />
                          <span>{isMg ? "Ampiasao écouteur raha azo atao" : "Utilisez des écouteurs de préférence"}</span>
                      </div>
                      <div className="flex items-start gap-2 text-sm text-slate-600 dark:text-slate-300">
                          <Coins className="w-4 h-4 text-amber-500 mt-0.5 shrink-0" />
                          <span>1 min = 1 Crédit</span>
                      </div>
                  </div>

                  <div className="flex gap-3">
                      <button onClick={() => setShowCallConfirm(false)} className="flex-1 py-3 text-slate-500 font-bold hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-colors">
                          {isMg ? "Tsy tsisy" : "Annuler"}
                      </button>
                      <button onClick={confirmStartCall} className="flex-1 py-3 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl shadow-lg transition-transform active:scale-95 flex items-center justify-center gap-2">
                          <Phone className="w-4 h-4" /> {isMg ? "Antsoy" : "Appeler"}
                      </button>
                  </div>
              </div>
          </div>
      )}

      {/* Voice Overlay */}
      {isCallActive && (
        <div className="fixed inset-0 z-[160] bg-slate-900/95 backdrop-blur-2xl flex flex-col items-center justify-between py-12 px-6 transition-all animate-fade-in overflow-hidden">
            {renderCallOverlay()}
        </div>
      )}

      {/* Training Overlay */}
      {isTrainingMode && (
          <div className="fixed inset-0 z-50 bg-white dark:bg-slate-950 flex flex-col">
              {isLoadingExercises ? (
                  <div className="flex-1 flex flex-col items-center justify-center space-y-4">
                      <Loader2 className="w-16 h-16 text-indigo-600 animate-spin"/>
                      <h3 className="text-xl font-bold dark:text-white">Génération...</h3>
                  </div>
              ) : exerciseError ? (
                  <div className="flex-1 flex flex-col items-center justify-center p-6 text-center">
                      <AlertTriangle className="w-12 h-12 text-red-500 mb-4" />
                      <h3 className="text-xl font-bold mb-2">Erreur</h3>
                      <button onClick={() => setIsTrainingMode(false)} className="mt-4 text-slate-500">Fermer</button>
                  </div>
              ) : (
                  <ExerciseSession exercises={exercises} onClose={() => setIsTrainingMode(false)} onComplete={(s, t) => { setIsTrainingMode(false); notify(`Score: ${s}/${t}`, 'success'); }} />
              )}
          </div>
      )}

      {showSummaryResultModal && (
        <div className="fixed inset-0 z-[100] bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="bg-white dark:bg-slate-900 rounded-2xl w-full max-w-lg p-6 shadow-xl border border-slate-100 max-h-[80vh] flex flex-col">
                <div className="flex justify-between items-center mb-4 pb-2 border-b dark:border-slate-800">
                    <h3 className="font-bold flex items-center gap-2 text-slate-800 dark:text-white"><BookOpen className="text-indigo-500"/> Résumé</h3>
                    <button onClick={() => setShowSummaryResultModal(false)}><X className="text-slate-500"/></button>
                </div>
                <div className="flex-1 overflow-y-auto scrollbar-hide">
                    {isGeneratingSummary ? <div className="text-center py-10"><Loader2 className="animate-spin mx-auto text-indigo-500 mb-2"/>Génération...</div> : <MarkdownRenderer content={summaryContent}/>}
                </div>
            </div>
        </div>
      )}

      {/* HEADER FIXED */}
      <header className="fixed top-0 left-0 right-0 z-40 bg-white/90 dark:bg-slate-900/95 backdrop-blur-md shadow-sm h-16 px-4 border-b border-slate-100 dark:border-slate-800">
        <div className="max-w-7xl mx-auto h-full flex items-center justify-between relative">
            
            {/* Left: Back & Level */}
            <div className="flex items-center gap-2 z-20">
                <button onClick={() => { stopAudio(); onChangeMode(); }} className="p-2 rounded-full bg-slate-100 dark:bg-slate-800 hover:bg-indigo-100 dark:hover:bg-indigo-900/30 transition-colors text-slate-500 dark:text-slate-400">
                    <ArrowLeft className="w-5 h-5" />
                </button>
                <button 
                    onClick={() => setShowSmartOptions(!showSmartOptions)}
                    className="flex items-center gap-2 px-3 py-1.5 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-full hover:border-indigo-300 transition-all"
                >
                    <div className="w-6 h-6 rounded-full bg-white dark:bg-slate-700 flex items-center justify-center shadow-sm text-sm">
                        {preferences.targetLanguage.split(' ').pop()}
                    </div>
                    <span className="text-sm font-bold text-slate-800 dark:text-white hidden sm:inline">{preferences.level.split(' ')[0]}</span>
                    <ChevronDown className="w-3 h-3 text-slate-400" />
                </button>
            </div>

            {/* Smart Options Dropdown (Absolute Left) */}
            {showSmartOptions && (
                <div className="absolute top-16 left-4 w-64 bg-white dark:bg-slate-900 rounded-2xl shadow-xl border border-slate-100 dark:border-slate-700 p-2 z-50 animate-fade-in-up">
                    <div className="p-2 border-b border-slate-100 dark:border-slate-800 mb-2 text-xs font-bold text-slate-400 uppercase tracking-wider">Options Smart</div>
                    <button onClick={handleStartTraining} className="w-full text-left p-2.5 hover:bg-slate-50 dark:hover:bg-slate-800 rounded-lg flex items-center gap-3 text-sm font-medium"><BrainCircuit className="w-4 h-4 text-orange-500"/><span className="text-slate-700 dark:text-slate-300">Exercice Pratique</span></button>
                    <button onClick={initiateCallFlow} className="w-full text-left p-2.5 hover:bg-slate-50 dark:hover:bg-slate-800 rounded-lg flex items-center gap-3 text-sm font-medium"><Phone className="w-4 h-4 text-purple-500"/><span className="text-slate-700 dark:text-slate-300">Appel Vocal</span></button>
                    <button onClick={() => { setShowSmartOptions(false); setInput("Traduire: "); textareaRef.current?.focus(); }} className="w-full text-left p-2.5 hover:bg-slate-50 dark:hover:bg-slate-800 rounded-lg flex items-center gap-3 text-sm font-medium"><Languages className="w-4 h-4 text-blue-500"/><span className="text-slate-700 dark:text-slate-300">Traduction</span></button>
                    <button onClick={() => { setShowSmartOptions(false); setIsDialogueActive(true); }} className="w-full text-left p-2.5 hover:bg-slate-50 dark:hover:bg-slate-800 rounded-lg flex items-center gap-3 text-sm font-medium"><MessageCircle className="w-4 h-4 text-emerald-500"/><span className="text-slate-700 dark:text-slate-300">Dialogues</span></button>
                </div>
            )}

            {/* Center: Lesson Title (Absolute Centered) */}
            <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 pointer-events-none z-10">
                <div className="flex flex-col items-center">
                    <span className="text-[10px] font-bold text-indigo-500 uppercase tracking-widest bg-indigo-50 dark:bg-indigo-900/20 px-2 py-0.5 rounded-full mb-0.5 hidden sm:block">Cours Structuré</span>
                    <h1 className="text-sm md:text-base font-black text-slate-800 dark:text-white whitespace-nowrap">
                        Leçon {currentLessonNumber}
                    </h1>
                </div>
            </div>

            {/* Right: Credits & Menu */}
            <div className="flex items-center gap-2 z-20">
                <button 
                    onClick={() => setShowPaymentModal(true)} 
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full border transition-all ${user.credits > 0 || user.role === 'admin' ? 'bg-amber-50 dark:bg-amber-900/10 border-amber-200 text-amber-700' : 'bg-red-50 border-red-200 text-red-600 animate-pulse'}`}
                >
                    <Coins className="w-3.5 h-3.5" />
                    <span className="font-bold text-sm">{user.role === 'admin' ? '∞' : user.credits}</span>
                </button>
                
                <div className="relative">
                    <button onClick={() => setShowMenu(!showMenu)} className={`p-2 rounded-full transition-colors ${showMenu ? 'bg-indigo-100 text-indigo-600' : 'text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 dark:text-slate-400'}`}>
                        <Menu className="w-5 h-5" />
                    </button>
                    
                    {/* Main Menu Dropdown */}
                    {showMenu && (
                        <div className="absolute top-12 right-0 w-72 bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-100 dark:border-slate-700 p-3 animate-fade-in-up z-50">
                            {/* Search */}
                            <div className="p-2 border-b border-slate-100 dark:border-slate-800 mb-2">
                                <div className="relative flex items-center">
                                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400"/>
                                    <input type="text" placeholder="Rechercher..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="w-full bg-slate-50 dark:bg-black/20 text-sm py-2 pl-9 pr-10 rounded-lg outline-none focus:ring-1 focus:ring-indigo-500 dark:text-white"/>
                                </div>
                            </div>
                            
                            {/* Tools Grid */}
                            <div className="grid grid-cols-2 gap-2 mb-2">
                                <button onClick={() => { setShowSummaryResultModal(false); setShowMenu(true); }} className="p-3 bg-slate-50 dark:bg-slate-800 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-700 flex flex-col items-center gap-1 group">
                                    <BookOpen className="w-5 h-5 text-indigo-500"/>
                                    <span className="text-[10px] font-bold text-slate-500 uppercase">Résumé</span>
                                    <div className="flex items-center gap-1 w-full justify-center" onClick={e=>e.stopPropagation()}>
                                        <input type="number" value={summaryInputVal} onChange={e=>setSummaryInputVal(e.target.value)} className="w-8 text-center text-xs bg-transparent border-b outline-none" placeholder="#"/>
                                        <span onClick={handleValidateSummary} className="text-[10px] font-black text-indigo-600 cursor-pointer">GO</span>
                                    </div>
                                </button>
                                <button className="p-3 bg-slate-50 dark:bg-slate-800 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-700 flex flex-col items-center gap-1 group">
                                    <RotateCcw className="w-5 h-5 text-emerald-500"/>
                                    <span className="text-[10px] font-bold text-slate-500 uppercase">Sauter</span>
                                    <div className="flex items-center gap-1 w-full justify-center" onClick={e=>e.stopPropagation()}>
                                        <input type="number" value={jumpInputVal} onChange={e=>setJumpInputVal(e.target.value)} className="w-8 text-center text-xs bg-transparent border-b outline-none" placeholder="#"/>
                                        <span onClick={handleValidateJump} className="text-[10px] font-black text-emerald-600 cursor-pointer">GO</span>
                                    </div>
                                </button>
                            </div>

                            {/* Theme & Lang */}
                            <div className="border-t border-slate-100 dark:border-slate-800 pt-2 space-y-1">
                                <button onClick={toggleTheme} className="w-full p-2.5 hover:bg-slate-50 dark:hover:bg-slate-800 rounded-lg flex items-center gap-3 transition-colors">
                                    {isDarkMode ? <Sun className="w-4 h-4 text-amber-500"/> : <Moon className="w-4 h-4 text-indigo-500"/>}
                                    <span className="text-xs font-bold text-slate-600 dark:text-slate-300">Thème {isDarkMode ? 'Sombre' : 'Clair'}</span>
                                </button>
                                <button onClick={handleToggleExplanationLang} className="w-full p-2.5 hover:bg-slate-50 dark:hover:bg-slate-800 rounded-lg flex items-center gap-3 transition-colors">
                                    <Languages className="w-4 h-4 text-purple-500"/>
                                    <span className="text-xs font-bold text-slate-600 dark:text-slate-300">Prof: {preferences.explanationLanguage.split(' ')[0]}</span>
                                </button>
                            </div>
                            
                            {/* Font Size */}
                            <div className="p-2 bg-slate-50 dark:bg-slate-800 rounded-lg mt-2">
                                <div className="flex items-center gap-2 text-xs font-bold mb-2 text-slate-500 uppercase"><Type className="w-3 h-3"/> Taille Texte</div>
                                <div className="flex bg-white dark:bg-slate-700 rounded-lg p-1 gap-1">
                                    {(['small', 'normal', 'large', 'xl'] as const).map(s => (
                                        <button key={s} onClick={() => handleFontSizeChange(s)} className={`flex-1 text-[10px] py-1.5 rounded-md font-bold ${fontSize === s ? 'bg-indigo-600 text-white shadow' : 'text-slate-400'}`}>{s === 'small' ? 'A' : s === 'normal' ? 'A+' : 'A++'}</button>
                                    ))}
                                </div>
                            </div>
                        </div>
                    )}
                </div>
                
                <button onClick={onShowProfile} className="relative w-9 h-9 ml-1 group shrink-0">
                    <div className="w-full h-full rounded-full bg-slate-900 text-white font-bold flex items-center justify-center border-2 border-white dark:border-slate-800 overflow-hidden">
                        {user.username.substring(0, 2).toUpperCase()}
                    </div>
                </button>
            </div>
        </div>
      </header>

      {/* Chat Feed */}
      <div id="chat-feed" className="flex-1 overflow-y-auto p-3 md:p-4 space-y-4 pt-20 pb-4 scrollbar-hide">
        {messages.filter(msg => !searchQuery || msg.text.toLowerCase().includes(searchQuery.toLowerCase())).map((msg, index) => (
            <div key={msg.id} id={`msg-${msg.id}`} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'} animate-fade-in`}>
                <div className={`flex max-w-[90%] md:max-w-[80%] ${msg.role === 'user' ? 'flex-row-reverse' : 'flex-row'}`}>
                    <div className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center mt-1 mx-2 shadow-sm ${msg.role === 'user' ? 'bg-indigo-100' : 'bg-white border p-1'}`}>
                        {msg.role === 'user' ? <User className="w-4 h-4 text-indigo-600" /> : <img src="/logo.png" onError={(e) => { e.currentTarget.onerror = null; e.currentTarget.src = '/logo.svg'; }} className="w-full h-full object-contain" alt="Teacher" />}
                    </div>
                    <div className={`px-4 py-3 rounded-2xl shadow-sm ${textSizeClass} ${msg.role === 'user' ? 'bg-indigo-600 text-white rounded-tr-none' : 'bg-white dark:bg-slate-800 dark:text-slate-200 text-slate-800 rounded-tl-none border border-slate-100 dark:border-slate-700'}`}>
                        {msg.role === 'user' ? <p className="whitespace-pre-wrap">{msg.text}</p> : (
                            <>
                                <MarkdownRenderer content={msg.text} onPlayAudio={(t) => handleSpeak(t)} highlight={searchQuery} />
                                {index === 0 && messages.length === 1 && (
                                    <div className="mt-4 pt-4 border-t border-slate-100 dark:border-slate-700 flex justify-center">
                                        <button onClick={() => handleSend("Commence le cours")} className="px-6 py-2.5 bg-gradient-to-r from-indigo-600 to-violet-600 text-white font-bold rounded-full shadow-lg flex items-center gap-2 hover:scale-105 transition-transform">
                                            <span>COMMENCER</span> <ArrowRight className="w-4 h-4" />
                                        </button>
                                    </div>
                                )}
                                <div className="flex items-center gap-2 mt-2 pt-2 border-t border-slate-100 dark:border-slate-700/50">
                                    <button onClick={() => handleSpeak(msg.text, msg.id)} className="p-1 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-full"><Volume2 className="w-4 h-4 text-slate-400"/></button>
                                    <button onClick={() => { navigator.clipboard.writeText(msg.text); setCopiedId(msg.id); setTimeout(() => setCopiedId(null), 2000); }} className="p-1 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-full">{copiedId === msg.id ? <Check className="w-4 h-4 text-emerald-500"/> : <Copy className="w-4 h-4 text-slate-400"/>}</button>
                                    <button onClick={() => handleExportPDF(msg.text)} className="p-1 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-full"><FileText className="w-4 h-4 text-slate-400"/></button>
                                    <button onClick={() => handleExportImage(msg.id)} className="p-1 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-full"><ImageIcon className="w-4 h-4 text-slate-400"/></button>
                                </div>
                            </>
                        )}
                    </div>
                </div>
            </div>
        ))}
        {(isLoading || isAnalyzing) && (
             <div className="flex justify-start animate-fade-in">
                 <div className="bg-white dark:bg-slate-800 px-4 py-3 rounded-2xl rounded-tl-none border shadow-sm flex items-center gap-2 ml-12">
                    <Loader2 className="w-4 h-4 animate-spin text-indigo-500"/> <span className="text-sm text-slate-500">TeacherMada écrit...</span>
                 </div>
             </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input Area */}
      <div className="bg-white/80 dark:bg-slate-900/80 backdrop-blur-md border-t border-slate-100 dark:border-slate-800 p-3 md:p-4 sticky bottom-0">
        
        {/* Quick Actions Bar */}
        <div className="max-w-4xl mx-auto mb-2 flex items-center gap-2 px-2 overflow-x-auto scrollbar-hide">
            <Tooltip text="Appel Vocal">
                <button onClick={initiateCallFlow} className="p-2 bg-purple-50 dark:bg-purple-900/20 rounded-full shadow-sm border border-purple-100 dark:border-purple-800 text-purple-600 dark:text-purple-400">
                    <Phone className="w-4 h-4" />
                </button>
            </Tooltip>
            <div className="flex-1 mx-3 flex flex-col justify-center">
                <div className="flex justify-between items-center text-[10px] font-bold text-slate-400 dark:text-slate-500 mb-1 px-1">
                    <span className="text-indigo-500">{levelProgressData.startCode}</span>
                    <span className="text-slate-300">{Math.round(levelProgressData.percentage)}%</span>
                    <span>{levelProgressData.targetCode}</span>
                </div>
                <div className="h-1.5 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden relative shadow-inner">
                    <div className="h-full bg-gradient-to-r from-indigo-500 to-purple-500" style={{ width: `${levelProgressData.percentage}%` }}></div>
                </div>
            </div>
            <button onClick={() => handleSend("Leçon suivante")} className="flex items-center gap-2 px-3 py-1.5 bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-300 rounded-full text-xs font-bold border border-indigo-100 dark:border-indigo-900/50">
                Suivant <ArrowRight className="w-3 h-3" />
            </button>
        </div>

        <div className="max-w-4xl mx-auto relative flex items-end gap-2 bg-slate-50 dark:bg-slate-800 rounded-[26px] border border-slate-200 dark:border-slate-700 p-2 shadow-sm focus-within:ring-2 focus-within:ring-indigo-500/50">
            <textarea
                ref={textareaRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder={!canSend ? "Recharge nécessaire..." : "Message..."}
                disabled={isLoading || isAnalyzing}
                rows={1}
                className="w-full bg-transparent text-slate-800 dark:text-white rounded-xl pl-4 py-3 text-base focus:outline-none resize-none max-h-32 scrollbar-hide self-center disabled:opacity-50"
            />
            <div className="flex items-center gap-1 pb-1 pr-1">
                 <button onClick={handleTranslateInput} disabled={!input.trim() || isTranslating} className="p-2 rounded-full text-slate-400 hover:text-indigo-600 hover:bg-slate-200 dark:hover:bg-slate-700 disabled:opacity-50">
                    {isTranslating ? <Loader2 className="w-5 h-5 animate-spin" /> : <Languages className={`w-5 h-5 ${isTranslating ? 'animate-spin text-indigo-600' : ''}`} />}
                 </button>
                 <button onClick={toggleListening} className={`p-2 rounded-full ${isListening ? 'bg-red-500 text-white animate-pulse' : 'text-slate-400 hover:text-indigo-600'}`}>
                    {isListening ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
                 </button>
                 <button onClick={() => handleSend()} disabled={!input.trim() || isLoading} className={`p-2.5 rounded-full text-white transition-all shadow-md flex items-center justify-center ${canSend ? 'bg-indigo-600 hover:bg-indigo-700' : 'bg-slate-400'}`}>
                    {canSend ? <Send className="w-4 h-4" /> : <Lock className="w-4 h-4" />}
                </button>
            </div>
        </div>
      </div>
    </div>
  );
};

export default ChatInterface;
