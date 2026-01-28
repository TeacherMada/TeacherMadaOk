
import React, { useState, useRef, useEffect } from 'react';
import { Send, User, Mic, Volume2, VolumeX, ArrowLeft, Play, FastForward, Loader2, Target, CheckCircle, Copy, Check, ArrowRight, Music, Dumbbell, Phone, Globe, ChevronDown, PhoneOff, MicOff, MoreHorizontal, BookOpen, Search, AlertTriangle, X, ChevronUp, Sun, Moon, Languages, FileDown, ExternalLink, Lightbulb, CheckCircle2, XCircle, Info } from 'lucide-react';
import { UserProfile, ChatMessage, LearningMode, ExplanationLanguage, TargetLanguage, ExerciseItem } from '../types';
import { sendMessageToGemini, generateSpeech, generatePracticalExercises, getLessonSummary, translateText } from '../services/geminiService';
import { storageService } from '../services/storageService';
import MarkdownRenderer from './MarkdownRenderer';
import ExerciseSession from './ExerciseSession';
import TutorialOverlay from './TutorialOverlay';
import Tooltip from './Tooltip';
import { jsPDF } from 'jspdf';

// Type definition for Web Speech API
interface IWindow extends Window {
  webkitSpeechRecognition: any;
  SpeechRecognition: any;
}

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
}

interface ToastNotification {
  message: string;
  type: 'success' | 'error' | 'info';
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
  fontSize
}) => {
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [isPlayingAudio, setIsPlayingAudio] = useState(false);
  const [showLanguageMenu, setShowLanguageMenu] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  
  // Translation State
  const [isTranslating, setIsTranslating] = useState(false);

  // Call Mode State
  const [isCallActive, setIsCallActive] = useState(false);
  const [isCallConnecting, setIsCallConnecting] = useState(false); 
  const [isListening, setIsListening] = useState(false);

  // Exercise Mode State
  const [showExercise, setShowExercise] = useState(false);
  const [exercises, setExercises] = useState<ExerciseItem[]>([]);
  const [isLoadingExercises, setIsLoadingExercises] = useState(false);
  
  // Lesson Summary & Jump States
  const [showSummaryResultModal, setShowSummaryResultModal] = useState(false);
  const [summaryContent, setSummaryContent] = useState('');
  const [isGeneratingSummary, setIsGeneratingSummary] = useState(false);

  // Collapses Inputs
  const [showSummaryCollapse, setShowSummaryCollapse] = useState(false);
  const [summaryInputVal, setSummaryInputVal] = useState('');
  
  const [showJumpCollapse, setShowJumpCollapse] = useState(false);
  const [jumpInputVal, setJumpInputVal] = useState('');

  // Explanation Language Toggle State
  const [showExplanationToggle, setShowExplanationToggle] = useState(false);

  // Toast State
  const [toast, setToast] = useState<ToastNotification | null>(null);

  // Tutorial State
  const [showTutorial, setShowTutorial] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const lastSpokenMessageId = useRef<string | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const activeSourceRef = useRef<AudioBufferSourceNode | null>(null);
  
  // Audio Refs for Ringback/Waiting Tone
  const waitingOscillatorRef = useRef<OscillatorNode | null>(null);
  const waitingOscillator2Ref = useRef<OscillatorNode | null>(null);
  const waitingGainRef = useRef<GainNode | null>(null);
  const ringIntervalRef = useRef<any>(null);

  const recognitionRef = useRef<any>(null);

  const preferences = user.preferences!;

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    if (!showJumpCollapse) { // Don't scroll if user is trying to jump
        scrollToBottom();
    }
  }, [messages]);

  // Auto-resize textarea
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
        stopWaitingSound();
    };
  }, []);

  // Tutorial Disabled based on user request "Désactiver le tutoriel 1/5"
  /*
  useEffect(() => {
    if (user && !user.hasSeenTutorial) {
        // Small delay to ensure UI is ready
        const timer = setTimeout(() => setShowTutorial(true), 1000);
        return () => clearTimeout(timer);
    }
  }, [user]);
  */

  const handleTutorialComplete = () => {
      setShowTutorial(false);
      storageService.markTutorialSeen(user.id);
      // Update central state so it persists in the current session
      const updatedUser = { ...user, hasSeenTutorial: true };
      onUpdateUser(updatedUser);
  };

  // Toast Auto-Dismiss
  useEffect(() => {
      if (toast) {
          const timer = setTimeout(() => setToast(null), 3500);
          return () => clearTimeout(timer);
      }
  }, [toast]);

  const showToast = (message: string, type: 'success' | 'error' | 'info' = 'info') => {
      setToast({ message, type });
  };

  // Auto-play logic for Call Mode & Stop Ringing
  useEffect(() => {
      if (isCallActive && !isLoading && !isAnalyzing) {
          if (isCallConnecting) {
              setIsCallConnecting(false);
              stopWaitingSound();
          }

          const lastMsg = messages[messages.length - 1];
          if (lastMsg && lastMsg.role === 'model' && lastSpokenMessageId.current !== lastMsg.id) {
              handleSpeak(lastMsg.text, lastMsg.id);
          }
      }
  }, [messages, isCallActive, isLoading, isAnalyzing, isCallConnecting]);

  // Ringback Tone Logic
  useEffect(() => {
      if (isCallActive && isCallConnecting) {
          startWaitingSound();
      } else {
          stopWaitingSound();
      }
  }, [isCallActive, isCallConnecting]);

  const saveConversation = (newMessages: ChatMessage[]) => {
    setMessages(newMessages);
    storageService.saveChatHistory(user.id, newMessages);
  };

  const getCurrentLessonNumber = () => {
    if (preferences.mode !== LearningMode.Course) return 0;
    const lessonRegex = /##\s*(?:🟢|🔴|🔵)?\s*(?:LEÇON|LECON|LESSON|LESONA)\s*(\d+)/i;
    let lastLesson = 0;
    messages.forEach(m => {
        if (m.role === 'model') {
            const match = m.text.match(lessonRegex);
            if (match) lastLesson = parseInt(match[1]);
        }
    });
    return lastLesson;
  };

  const currentLessonNum = getCurrentLessonNumber();
  const lessonLabel = preferences.explanationLanguage === ExplanationLanguage.Malagasy ? 'Lesona' : 'Leçon';
  const levelProgress = Math.min((user.stats.lessonsCompleted % 50) * 2, 100); 

  const getShortLevel = (levelString: string) => {
    const match = levelString.match(/\((.*?)\)/);
    if (match) return match[1].split('-')[0];
    return levelString.split(' ')[0].substring(0, 3).toUpperCase(); 
  };
  const shortLevel = preferences.level ? getShortLevel(preferences.level) : 'LVL';
  
  // Font Size Classes Mapping
  const getFontSizeClass = () => {
      switch(fontSize) {
          case 'small': return 'text-sm';
          case 'large': return 'text-lg';
          case 'xl': return 'text-xl';
          default: return 'text-base';
      }
  };

  // --- STT & TTS Logic (Same as before) ---
  const getLocaleCode = (targetLang: string) => {
      if (targetLang.includes('Anglais')) return 'en-US';
      if (targetLang.includes('Français')) return 'fr-FR';
      if (targetLang.includes('Chinois')) return 'zh-CN';
      if (targetLang.includes('Espagnol')) return 'es-ES';
      if (targetLang.includes('Allemand')) return 'de-DE';
      return 'fr-FR'; 
  };

  const startListening = () => {
      if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) {
          alert("Votre navigateur ne supporte pas la reconnaissance vocale.");
          return;
      }
      const SpeechRecognition = (window as unknown as IWindow).SpeechRecognition || (window as unknown as IWindow).webkitSpeechRecognition;
      const recognition = new SpeechRecognition();
      recognition.lang = getLocaleCode(preferences.targetLanguage);
      recognition.continuous = false;
      recognition.interimResults = false;
      recognition.onstart = () => setIsListening(true);
      recognition.onend = () => setIsListening(false);
      recognition.onresult = (event: any) => {
          const transcript = event.results[0][0].transcript;
          if (transcript) handleSend(transcript);
      };
      recognition.onerror = (event: any) => setIsListening(false);
      recognitionRef.current = recognition;
      recognition.start();
  };

  const stopListening = () => {
      if (recognitionRef.current) {
          recognitionRef.current.stop();
          setIsListening(false);
      }
  };

  const toggleListening = () => isListening ? stopListening() : startListening();

  const getAudioContext = () => {
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      if (!audioContextRef.current || audioContextRef.current.state === 'closed') {
          audioContextRef.current = new AudioContextClass();
      }
      return audioContextRef.current;
  };

  const startWaitingSound = () => {
      if (isMuted) return;
      try {
          const ctx = getAudioContext();
          if (waitingOscillatorRef.current) return;
          const osc1 = ctx.createOscillator();
          const osc2 = ctx.createOscillator();
          const gain = ctx.createGain();
          osc1.type = 'sine'; osc1.frequency.setValueAtTime(440, ctx.currentTime); 
          osc2.type = 'sine'; osc2.frequency.setValueAtTime(480, ctx.currentTime);
          gain.gain.setValueAtTime(0, ctx.currentTime);
          osc1.connect(gain); osc2.connect(gain); gain.connect(ctx.destination);
          osc1.start(); osc2.start();
          waitingOscillatorRef.current = osc1; waitingOscillator2Ref.current = osc2; waitingGainRef.current = gain;
          const playRing = () => {
              const now = ctx.currentTime;
              const vol = 0.1;
              gain.gain.setValueAtTime(0, now);
              gain.gain.linearRampToValueAtTime(vol, now + 0.05);
              gain.gain.setValueAtTime(vol, now + 0.4);
              gain.gain.linearRampToValueAtTime(0, now + 0.45);
              gain.gain.linearRampToValueAtTime(vol, now + 0.65);
              gain.gain.setValueAtTime(vol, now + 1.0);
              gain.gain.linearRampToValueAtTime(0, now + 1.05);
          };
          playRing();
          ringIntervalRef.current = setInterval(() => { if (ctx.state === 'running') playRing(); }, 4000);
      } catch (e) { }
  };

  const stopWaitingSound = () => {
      if (ringIntervalRef.current) { clearInterval(ringIntervalRef.current); ringIntervalRef.current = null; }
      const stopOsc = (oscRef: any) => { if (oscRef.current) { try { oscRef.current.stop(); oscRef.current.disconnect(); } catch(e) {} oscRef.current = null; } };
      stopOsc(waitingOscillatorRef); stopOsc(waitingOscillator2Ref);
      if (waitingGainRef.current) { try { waitingGainRef.current.disconnect(); } catch(e) {} waitingGainRef.current = null; }
  };

  const handleSpeak = async (text: string, msgId?: string) => {
    stopAudio(); stopWaitingSound();
    if (msgId) lastSpokenMessageId.current = msgId;
    setIsPlayingAudio(true);
    const cleanText = text.replace(/[*#_`~]/g, '').replace(/\[.*?\]/g, '').replace(/-{3,}/g, ' ').replace(/\n/g, '. ').replace(/\s+/g, ' ').trim();
    try {
        const rawAudioBuffer = await generateSpeech(cleanText.substring(0, 4000));
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
    } catch (error) { setIsPlayingAudio(false); }
  };

  const stopAudio = () => {
    if (activeSourceRef.current) { try { activeSourceRef.current.stop(); } catch (e) { } activeSourceRef.current = null; }
    setIsPlayingAudio(false);
  };

  const toggleMute = () => {
    const newMutedState = !isMuted;
    setIsMuted(newMutedState);
    if (newMutedState) { stopAudio(); stopWaitingSound(); }
  };

  const handleCopy = async (text: string, id: string) => {
    try { await navigator.clipboard.writeText(text); setCopiedId(id); setTimeout(() => setCopiedId(null), 2000); } catch (err) {}
  };

  const handleExportPDF = (text: string) => {
    try {
        const doc = new jsPDF();
        // Remove markdown chars for cleaner PDF
        const cleanText = text.replace(/[*#]/g, '');
        const splitText = doc.splitTextToSize(cleanText, 180);
        doc.text(splitText, 10, 10);
        doc.save('lecon-teachermada.pdf');
    } catch (e) {
        showToast("Erreur lors de la création du PDF.", 'error');
    }
  };

  // Translate logic using Gemini API
  const handleTranslateInput = async () => {
    if (!input.trim()) return;
    setIsTranslating(true);
    try {
        const translation = await translateText(input, preferences.targetLanguage);
        setInput(translation);
    } catch (e) {
        showToast("Échec de la traduction.", 'error');
    } finally {
        setIsTranslating(false);
    }
  };

  const handleSend = async (textOverride?: string) => {
    stopAudio();
    const textToSend = typeof textOverride === 'string' ? textOverride : input;
    if (!textToSend.trim() || isLoading || isAnalyzing) return;
    const userMsg: ChatMessage = { id: Date.now().toString(), role: 'user', text: textToSend, timestamp: Date.now() };
    const updatedWithUser = [...messages, userMsg];
    saveConversation(updatedWithUser);
    setInput('');
    setIsLoading(true);
    onMessageSent();
    try {
      const responseText = await sendMessageToGemini(textToSend);
      const aiMsg: ChatMessage = { id: (Date.now() + 1).toString(), role: 'model', text: responseText, timestamp: Date.now() };
      saveConversation([...updatedWithUser, aiMsg]);
    } catch (error) { console.error(error); } finally { setIsLoading(false); }
  };

  // --- Handlers for Summary & Jump ---

  // Generate Summary (Collapse in Menu -> Modal)
  const handleValidateSummary = async () => {
      const num = parseInt(summaryInputVal);
      if (isNaN(num) || num < 1) {
          showToast("Veuillez entrer un numéro valide.", 'error');
          return;
      }
      
      // Check if lesson exists in Chat History OR in previous progress
      const existsInChat = messages.some(m => m.text.match(new RegExp(`LEÇON\\s*${num}`, 'i')));
      const isPastLesson = num <= user.stats.lessonsCompleted;
      const isCurrentLesson = num === currentLessonNum;
      
      if (!existsInChat && !isPastLesson && !isCurrentLesson) {
          showToast(`⚠️ La leçon ${num} n'existe pas encore.`, 'error');
          return;
      }

      setShowLanguageMenu(false);
      setShowSummaryCollapse(false);
      setSummaryInputVal('');
      setIsGeneratingSummary(true);
      setShowSummaryResultModal(true);
      
      const context = messages.slice(-10).map(m => m.text).join('\n');
      const summary = await getLessonSummary(num, context);
      
      setSummaryContent(summary);
      setIsGeneratingSummary(false);
  };

  // Jump to Lesson (Collapse in Topbar -> Scroll)
  const handleValidateJump = () => {
      const num = parseInt(jumpInputVal);
      if (isNaN(num)) {
          showToast("Numéro invalide", 'error');
          return;
      }

      // Logic: Search for specific regex in chat
      const lessonRegex = new RegExp(`##\\s*(?:🟢|🔴|🔵)?\\s*(?:LEÇON|LECON|LESSON|LESONA)\\s*${num}`, 'i');
      const targetMsg = messages.find(m => m.role === 'model' && m.text.match(lessonRegex));

      if (targetMsg) {
          setShowJumpCollapse(false);
          setJumpInputVal('');
          
          const el = document.getElementById(`msg-${targetMsg.id}`);
          if (el) {
              el.scrollIntoView({ behavior: 'smooth', block: 'start' });
              // Highlight effect
              el.classList.add('ring-4', 'ring-indigo-300', 'transition-all');
              setTimeout(() => el.classList.remove('ring-4', 'ring-indigo-300'), 2000);
          }
      } else {
           showToast(`⚠️ La leçon ${num} n'existe pas dans ce chat.`, 'error');
      }
  };
  
  const handleLanguageOption = async (action: 'practice' | 'pronunciation' | 'voice' | 'switch') => {
    // Note: 'summary' is handled by the collapse inside the menu
    setShowLanguageMenu(false);
    switch (action) {
        case 'practice':
            setIsLoadingExercises(true);
            try {
                const generated = await generatePracticalExercises(user, messages);
                setExercises(generated);
                setShowExercise(true);
            } catch (e) { handleSend("Donne-moi des exercices pratiques."); } finally { setIsLoadingExercises(false); }
            break;
        case 'pronunciation':
            handleSend("Donne-moi des exercices de prononciation.");
            break;
        case 'voice':
            setIsCallActive(true);
            setIsCallConnecting(true);
            setIsMuted(false);
            handleSend("SESSION D'APPEL VOCAL: Agis comme si tu m'appelais au téléphone.");
            break;
        case 'switch':
            onChangeLanguage();
            break;
    }
  };

  const handleSwitchExplanation = (lang: ExplanationLanguage) => {
    const newPrefs = { ...user.preferences!, explanationLanguage: lang };
    storageService.updatePreferences(user.id, newPrefs);
    
    // Send hidden instruction to AI
    handleSend(`[SYSTEM UPDATE: SWITCH EXPLANATION LANGUAGE TO ${lang}]`);
    
    setShowExplanationToggle(false);
    showToast(`Langue changée en ${lang.split(' ')[0]}`, 'success');
  };

  const handleExerciseComplete = (score: number, total: number) => {
      setShowExercise(false);
      const resultMsg: ChatMessage = { id: Date.now().toString(), role: 'model', text: `🎯 **Session d'exercice terminée !**\n\nScore : **${score}/${total}**`, timestamp: Date.now() };
      saveConversation([...messages, resultMsg]);
      onMessageSent(); 
  };

  const endCall = () => {
      setIsCallActive(false); setIsCallConnecting(false); stopAudio(); stopListening(); stopWaitingSound();
  };

  const getSuggestedActions = () => {
    if (isLoading) return [];
    const lastMsg = messages[messages.length - 1];
    const actions = [];
    if (messages.length === 1 && lastMsg?.role === 'model' && preferences.mode === LearningMode.Course) {
      actions.push({ label: 'Commencer 🚀', text: 'Commençons la première leçon !', icon: Play });
    }
    if (lastMsg?.role === 'model' && lastMsg.text.toLowerCase().includes('récapitulatif') && preferences.mode === LearningMode.Course) {
      actions.push({ label: 'Suivante ⏭️', text: 'Passons à la leçon suivante.', icon: FastForward });
    }
    return actions;
  };
  const suggestedActions = getSuggestedActions();

  // --- Render Components ---

  const renderLanguageMenu = () => {
    if (!showLanguageMenu) return null;
    return (
        <div id="topbar-mode" className="absolute top-14 left-16 z-50 w-72 bg-white dark:bg-slate-900 rounded-xl shadow-xl border border-slate-100 dark:border-slate-700 p-2 animate-fade-in origin-top-left">
            <div className="text-xs font-bold text-slate-400 dark:text-slate-500 px-3 py-2 uppercase tracking-wider">Options d'apprentissage</div>
            
            <button onClick={() => handleLanguageOption('practice')} className="w-full text-left flex items-center gap-3 px-3 py-3 hover:bg-slate-50 dark:hover:bg-slate-800 rounded-lg transition-colors group">
                <div className="bg-orange-100 dark:bg-orange-900/30 p-2 rounded-lg text-orange-600 dark:text-orange-400"><Dumbbell className="w-4 h-4" /></div>
                <div><div className="font-semibold text-slate-800 dark:text-white text-sm">Exercice pratique</div></div>
            </button>

            {/* Summary Item with Collapse */}
            <div className="border-b border-slate-100 dark:border-slate-700 pb-1 mb-1">
                <button 
                    onClick={() => setShowSummaryCollapse(!showSummaryCollapse)}
                    className="w-full text-left flex items-center gap-3 px-3 py-3 hover:bg-slate-50 dark:hover:bg-slate-800 rounded-lg transition-colors group"
                >
                    <div className="bg-blue-100 dark:bg-blue-900/30 p-2 rounded-lg text-blue-600 dark:text-blue-400"><BookOpen className="w-4 h-4" /></div>
                    <div className="flex-1"><div className="font-semibold text-slate-800 dark:text-white text-sm">Résumé Leçon</div></div>
                    {showSummaryCollapse ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
                </button>
                
                {/* Collapse Content */}
                {showSummaryCollapse && (
                    <div className="px-3 pb-2 animate-fade-in flex gap-2">
                        <input 
                            type="number" 
                            placeholder="N°"
                            value={summaryInputVal}
                            onChange={(e) => setSummaryInputVal(e.target.value)}
                            className="w-16 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-2 py-1.5 text-sm font-bold text-center outline-none focus:ring-2 focus:ring-indigo-500"
                        />
                        <button 
                            onClick={handleValidateSummary}
                            className="flex-1 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-lg px-2 transition-colors"
                        >
                            Valider
                        </button>
                    </div>
                )}
            </div>

            <button onClick={() => handleLanguageOption('pronunciation')} className="w-full text-left flex items-center gap-3 px-3 py-3 hover:bg-slate-50 dark:hover:bg-slate-800 rounded-lg transition-colors group">
                <div className="bg-purple-100 dark:bg-purple-900/30 p-2 rounded-lg text-purple-600 dark:text-purple-400"><Mic className="w-4 h-4" /></div>
                <div><div className="font-semibold text-slate-800 dark:text-white text-sm">Prononciation</div></div>
            </button>

            <button onClick={() => handleLanguageOption('voice')} className="w-full text-left flex items-center gap-3 px-3 py-3 hover:bg-slate-50 dark:hover:bg-slate-800 rounded-lg transition-colors group">
                <div className="bg-emerald-100 dark:bg-emerald-900/30 p-2 rounded-lg text-emerald-600 dark:text-emerald-400"><Phone className="w-4 h-4" /></div>
                <div><div className="font-semibold text-slate-800 dark:text-white text-sm">Appel Vocal</div></div>
            </button>
            <div className="h-px bg-slate-100 dark:bg-slate-700 my-1"></div>
            <button onClick={() => handleLanguageOption('switch')} className="w-full text-left flex items-center gap-3 px-3 py-3 hover:bg-slate-50 dark:hover:bg-slate-800 rounded-lg transition-colors group">
                <div className="bg-indigo-100 dark:bg-indigo-900/30 p-2 rounded-lg text-indigo-600 dark:text-indigo-400"><Globe className="w-4 h-4" /></div>
                <div><div className="font-semibold text-slate-800 dark:text-white text-sm">Changer de langue</div></div>
            </button>
        </div>
    );
  };

  const renderVoiceCallOverlay = () => {
    if (!isCallActive) return null;
    return (
        <div className="fixed inset-0 z-[60] bg-slate-900/95 backdrop-blur-xl flex flex-col items-center justify-between py-12 px-6 transition-all animate-fade-in">
            <div className="text-center space-y-2 mt-8">
                <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-slate-800 border border-slate-700 text-indigo-300 text-sm font-medium">
                    <div className={`w-2 h-2 rounded-full ${isLoading ? 'bg-indigo-400 animate-pulse' : 'bg-emerald-500'}`}></div>
                    {isCallConnecting ? "Appel en cours..." : (isLoading ? "Réflexion..." : "Connecté")}
                </div>
                <h2 className="text-3xl font-bold text-white tracking-tight">TeacherMada</h2>
                <p className="text-slate-400">{preferences.targetLanguage}</p>
            </div>
            <div className="relative flex items-center justify-center w-full max-w-sm aspect-square">
                {isPlayingAudio && <div className="absolute w-48 h-48 bg-indigo-500/20 rounded-full animate-ping opacity-75"></div>}
                <div className={`w-32 h-32 md:w-40 md:h-40 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 p-1 shadow-[0_0_40px_rgba(99,102,241,0.5)] z-10 transition-transform duration-500 ${isPlayingAudio ? 'scale-110' : 'scale-100'}`}>
                    <div className="w-full h-full bg-slate-900 rounded-full flex items-center justify-center border-4 border-white/10">
                         {isCallConnecting ? <Phone className="w-12 h-12 text-white animate-bounce" /> : <span className="text-5xl">🎓</span>}
                    </div>
                </div>
            </div>
            <div className="flex items-center gap-6 mb-8 relative">
                <button onClick={toggleListening} className={`p-5 rounded-full transition-all transform hover:scale-105 active:scale-95 shadow-xl ${isListening ? 'bg-white text-slate-900 ring-4 ring-emerald-500/30' : 'bg-slate-800 text-white hover:bg-slate-700 border border-slate-700'}`}>
                    {isListening ? <Mic className="w-7 h-7" /> : <MicOff className="w-7 h-7" />}
                </button>
                <button onClick={endCall} className="p-6 bg-red-500 hover:bg-red-600 text-white rounded-full shadow-[0_0_30px_rgba(239,68,68,0.4)] transform hover:scale-110 transition-all border-4 border-slate-900">
                    <PhoneOff className="w-8 h-8 fill-current" />
                </button>
                <button onClick={toggleMute} className={`p-5 rounded-full transition-all transform hover:scale-105 ${isMuted ? 'bg-slate-700 text-slate-400 border border-slate-600' : 'bg-slate-800 text-white hover:bg-slate-700 border border-slate-700'}`}>
                    {isMuted ? <VolumeX className="w-7 h-7" /> : <Volume2 className="w-7 h-7" />}
                </button>
            </div>
        </div>
    );
  };

  return (
    <div className="flex flex-col h-screen bg-slate-50 dark:bg-slate-950 transition-colors duration-300">
      
      {/* TOAST NOTIFICATION CONTAINER */}
      <div className="fixed top-24 right-4 z-[120] flex flex-col gap-2 pointer-events-none">
        {toast && (
            <div className={`pointer-events-auto flex items-center gap-3 px-4 py-3 rounded-xl shadow-xl backdrop-blur-md border animate-slide-in-toast transition-all duration-300 min-w-[300px] ${
                toast.type === 'error' ? 'bg-red-500/95 border-red-400 text-white' : 
                toast.type === 'success' ? 'bg-emerald-500/95 border-emerald-400 text-white' : 
                'bg-indigo-600/95 border-indigo-400 text-white'
            }`}>
                <div className="p-1.5 bg-white/20 rounded-full shrink-0">
                    {toast.type === 'error' && <XCircle className="w-5 h-5" />}
                    {toast.type === 'success' && <CheckCircle2 className="w-5 h-5" />}
                    {toast.type === 'info' && <Info className="w-5 h-5" />}
                </div>
                <div className="flex-1 text-sm font-semibold leading-tight">{toast.message}</div>
                <button onClick={() => setToast(null)} className="p-1 hover:bg-white/20 rounded-full transition-colors">
                    <X className="w-4 h-4" />
                </button>
            </div>
        )}
      </div>

      <style>{`
        @keyframes slideInToast {
          from { opacity: 0; transform: translateX(20px); }
          to { opacity: 1; transform: translateX(0); }
        }
        .animate-slide-in-toast {
          animation: slideInToast 0.4s cubic-bezier(0.16, 1, 0.3, 1);
        }
      `}</style>

      {/* TUTORIAL OVERLAY */}
      {showTutorial && <TutorialOverlay onComplete={handleTutorialComplete} />}

      {/* SUMMARY RESULT MODAL */}
      {showSummaryResultModal && (
        <div className="fixed inset-0 z-[100] bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 animate-fade-in">
            <div className="bg-white dark:bg-slate-900 rounded-2xl w-full max-w-lg p-6 shadow-xl border border-slate-100 dark:border-slate-800 max-h-[80vh] flex flex-col">
                <div className="flex justify-between items-center mb-4 border-b border-slate-100 dark:border-slate-800 pb-2">
                    <h3 className="text-lg font-bold text-slate-800 dark:text-white flex items-center gap-2">
                        <BookOpen className="w-5 h-5 text-indigo-500" />
                        Résumé Intelligent
                    </h3>
                    <button onClick={() => setShowSummaryResultModal(false)} className="p-1 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-full">
                        <X className="w-5 h-5 text-slate-500" />
                    </button>
                </div>
                <div className="flex-1 overflow-y-auto pr-2 scrollbar-hide">
                    {isGeneratingSummary ? (
                        <div className="flex flex-col items-center justify-center py-10 space-y-4">
                            <Loader2 className="w-10 h-10 text-indigo-500 animate-spin" />
                            <p className="text-slate-500 animate-pulse">Génération du résumé en cours...</p>
                        </div>
                    ) : (
                        <MarkdownRenderer content={summaryContent} />
                    )}
                </div>
                <button 
                    onClick={() => setShowSummaryResultModal(false)}
                    className="mt-4 w-full py-3 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl transition-colors"
                >
                    Fermer
                </button>
            </div>
        </div>
      )}

      {showExercise && exercises.length > 0 && <ExerciseSession exercises={exercises} onClose={() => setShowExercise(false)} onComplete={handleExerciseComplete} />}
      {renderVoiceCallOverlay()}

      {/* HEADER */}
      <header className="fixed top-0 left-0 right-0 z-50 bg-white/90 dark:bg-slate-900/95 backdrop-blur-md shadow-sm h-14 md:h-16 px-3 md:px-4 flex items-center justify-between transition-colors duration-300 border-b border-slate-100 dark:border-slate-800">
        
        <div className="flex items-center gap-2 md:gap-3 w-1/3 z-20">
          <Tooltip text="Terminer la session" position="bottom">
              <button onClick={() => { stopAudio(); onChangeMode(); }} disabled={isAnalyzing} className="p-1.5 md:p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-full transition-all group cursor-pointer disabled:opacity-50">
                {isAnalyzing ? <Loader2 className="w-5 h-5 animate-spin text-indigo-600" /> : <ArrowLeft className="w-5 h-5 text-slate-500 dark:text-slate-400 group-hover:text-indigo-600 dark:group-hover:text-indigo-400" />}
              </button>
          </Tooltip>
          <div className="relative">
            <Tooltip text="Menu d'apprentissage" position="bottom">
                <button onClick={() => setShowLanguageMenu(!showLanguageMenu)} className="flex items-center gap-2 group hover:bg-slate-100 dark:hover:bg-slate-800 px-2 py-1 rounded-full transition-all">
                    <div className="w-8 h-8 md:w-9 md:h-9 bg-white dark:bg-slate-800 rounded-full flex items-center justify-center border border-slate-100 dark:border-slate-700 shadow-sm group-hover:border-indigo-200 dark:group-hover:border-indigo-700">
                        <span className="text-lg md:text-xl">{preferences.targetLanguage.split(' ').pop()}</span>
                    </div>
                    <div className="hidden sm:flex flex-col items-start">
                        <span className="font-bold text-sm md:text-base tracking-tight text-slate-800 dark:text-white truncate flex items-center gap-1">
                            {preferences.targetLanguage.replace(/ .*/, '')}
                            <ChevronDown className={`w-3 h-3 transition-transform ${showLanguageMenu ? 'rotate-180' : ''}`} />
                        </span>
                    </div>
                </button>
            </Tooltip>
            {renderLanguageMenu()}
          </div>
        </div>

        {/* Center: Jump to Lesson Collapse */}
        <div id="topbar-lesson-jump" className="absolute left-1/2 -translate-x-1/2 flex justify-center w-auto z-10 max-w-[40%]">
          {currentLessonNum > 0 ? (
            <div className="flex flex-col items-center">
                <Tooltip text="Sauter à une leçon" position="bottom">
                    <button 
                        onClick={() => setShowJumpCollapse(!showJumpCollapse)}
                        className="bg-indigo-50 dark:bg-indigo-900/30 border border-indigo-100 dark:border-indigo-800 px-3 py-1 md:px-4 md:py-1.5 rounded-full flex items-center gap-1.5 md:gap-2 shadow-sm transition-all hover:scale-105 hover:bg-indigo-100 dark:hover:bg-indigo-900/50 cursor-pointer whitespace-nowrap group"
                    >
                        <div className="w-1.5 h-1.5 md:w-2 md:h-2 rounded-full bg-emerald-50 animate-pulse shadow-[0_0_8px_rgba(16,185,129,0.5)]"></div>
                        <span className="text-xs md:text-sm font-bold text-indigo-900 dark:text-indigo-200 flex items-center gap-1">
                            <span className="md:hidden">{lessonLabel.charAt(0)}. {currentLessonNum}</span>
                            <span className="hidden md:inline">{lessonLabel} {currentLessonNum}</span>
                            <Search className="w-3 h-3 opacity-50 group-hover:opacity-100 transition-opacity ml-1" />
                        </span>
                    </button>
                </Tooltip>
                
                {/* Jump Popover */}
                {showJumpCollapse && (
                    <div className="absolute top-full mt-2 left-1/2 -translate-x-1/2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 shadow-xl rounded-xl p-2 flex gap-2 w-48 animate-fade-in z-50">
                         <input 
                            type="number" 
                            placeholder="N°"
                            value={jumpInputVal}
                            onChange={(e) => setJumpInputVal(e.target.value)}
                            className="w-16 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-2 py-1.5 text-sm font-bold text-center outline-none focus:ring-2 focus:ring-indigo-500"
                            autoFocus
                        />
                        <button 
                            onClick={handleValidateJump}
                            className="flex-1 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-lg px-2 transition-colors"
                        >
                            Aller
                        </button>
                    </div>
                )}
            </div>
          ) : (
            <div className="text-xs md:text-sm font-medium text-slate-500 dark:text-slate-400 hidden md:block opacity-60">
                {preferences.mode}
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 md:gap-3 w-1/3 z-20">
             <Tooltip text={isDarkMode ? "Passer en mode clair" : "Passer en mode sombre"} position="bottom">
                 <button 
                    onClick={toggleTheme}
                    className="p-2 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500 dark:text-slate-400 transition-colors"
                 >
                     {isDarkMode ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
                 </button>
             </Tooltip>

             {/* Explanation Language Toggle */}
             <div className="relative">
                <Tooltip text="Langue des explications" position="bottom">
                    <button 
                        id="topbar-explanation"
                        onClick={() => setShowExplanationToggle(!showExplanationToggle)}
                        className="p-2 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500 dark:text-slate-400 transition-colors"
                        title="Changer langue explication"
                    >
                        <Lightbulb className="w-5 h-5" />
                    </button>
                </Tooltip>
                {showExplanationToggle && (
                    <div className="absolute top-full right-0 mt-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 shadow-xl rounded-xl p-2 w-40 animate-fade-in z-50 flex flex-col gap-1">
                        <button onClick={() => handleSwitchExplanation(ExplanationLanguage.French)} className="px-3 py-2 text-left text-sm font-medium hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg">
                            Français 🇫🇷
                        </button>
                        <button onClick={() => handleSwitchExplanation(ExplanationLanguage.Malagasy)} className="px-3 py-2 text-left text-sm font-medium hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg">
                            Malagasy 🇲🇬
                        </button>
                    </div>
                )}
             </div>
             
             <Tooltip text={isMuted ? "Réactiver le son" : "Couper le son"} position="bottom">
                 <button onClick={toggleMute} className={`p-2 rounded-full transition-all ${isMuted ? 'text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800' : 'text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-900/30'} ${isPlayingAudio ? 'animate-pulse' : ''}`}>
                    {isMuted ? <VolumeX className="w-5 h-5" /> : <Volume2 className="w-5 h-5" />}
                 </button>
             </Tooltip>
             
             <Tooltip text="Profil & Paramètres" position="bottom">
                 <button id="topbar-profile" onClick={onShowProfile} className="relative group transition-transform active:scale-95">
                    <div className="w-8 h-8 md:w-10 md:h-10 bg-gradient-to-br from-indigo-100 to-white dark:from-indigo-900 dark:to-slate-800 rounded-full flex items-center justify-center border-2 border-white dark:border-slate-700 shadow-md group-hover:border-indigo-200 dark:group-hover:border-indigo-700 transition-colors overflow-hidden">
                        <span className="font-bold text-indigo-700 dark:text-indigo-300 text-xs md:text-sm">{user.username.substring(0, 2).toUpperCase()}</span>
                    </div>
                 </button>
             </Tooltip>
        </div>
      </header>
      
      {/* Chat Area */}
      <div id="chat-feed" className={`flex-1 overflow-y-auto p-3 md:p-4 space-y-4 md:space-y-6 pt-20 md:pt-24 pb-4 scrollbar-hide ${getFontSizeClass()}`}>
        {messages.map((msg, index) => {
          const isLatest = index === messages.length - 1;
          const showNextInline = isLatest && !isLoading && !isAnalyzing && preferences.mode === LearningMode.Course && (msg.text.includes('RÉCAPITULATIF') || msg.text.includes('récapitulatif'));
          return (
            <div key={msg.id} id={`msg-${msg.id}`} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'} animate-fade-in`}>
                <div className={`flex max-w-[95%] md:max-w-[80%] ${msg.role === 'user' ? 'flex-row-reverse' : 'flex-row'}`}>
                <div className={`flex-shrink-0 w-7 h-7 md:w-8 md:h-8 rounded-full flex items-center justify-center mt-1 mx-1.5 md:mx-2 shadow-sm ${msg.role === 'user' ? 'bg-indigo-100 dark:bg-indigo-900' : 'bg-white dark:bg-slate-800 border border-slate-100 dark:border-slate-700'}`}>
                    {msg.role === 'user' ? <User className="w-4 h-4 md:w-5 md:h-5 text-indigo-600 dark:text-indigo-300" /> : <span className="text-base md:text-lg">🎓</span>}
                </div>
                <div className={`relative px-4 py-2.5 md:px-5 md:py-3 rounded-2xl shadow-sm text-sm md:text-base transition-colors duration-300 overflow-hidden ${msg.role === 'user' ? 'bg-indigo-600 dark:bg-indigo-700 text-white rounded-tr-none shadow-indigo-200 dark:shadow-none' : 'bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200 rounded-tl-none border border-slate-100 dark:border-slate-700'}`}>
                    {msg.role === 'user' ? <p className="whitespace-pre-wrap leading-relaxed">{msg.text}</p> : (
                    <div className="w-full overflow-x-hidden">
                        <MarkdownRenderer content={msg.text} onPlayAudio={(text) => handleSpeak(text)} />
                        
                        {/* Action Buttons */}
                        <div className="flex flex-wrap items-center mt-3 pt-3 border-t border-slate-100 dark:border-slate-700/50">
                            {/* Group Left */}
                            <div className="flex items-center gap-2">
                                <Tooltip text="Écouter le message">
                                    <button onClick={() => handleSpeak(msg.text, msg.id)} disabled={isPlayingAudio && lastSpokenMessageId.current === msg.id} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-all ${isPlayingAudio && lastSpokenMessageId.current === msg.id ? 'bg-indigo-50 text-indigo-600 dark:bg-indigo-900/30 dark:text-indigo-300 ring-1 ring-indigo-200 dark:ring-indigo-800' : 'bg-slate-50 text-slate-600 hover:bg-slate-100 dark:bg-slate-700/50 dark:text-slate-300 dark:hover:bg-slate-700'}`}>
                                        {isPlayingAudio && msg.id === lastSpokenMessageId.current ? <><Loader2 className="w-3.5 h-3.5 animate-spin" />Lecture...</> : <><Volume2 className="w-3.5 h-3.5" />Écouter</>}
                                    </button>
                                </Tooltip>
                                
                                <Tooltip text="Copier le texte">
                                    <button onClick={() => handleCopy(msg.text, msg.id)} className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium bg-slate-50 text-slate-600 hover:bg-slate-100 dark:bg-slate-700/50 dark:text-slate-300 dark:hover:bg-slate-700 transition-all">
                                        {copiedId === msg.id ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
                                        {copiedId === msg.id ? <span className="text-emerald-600 dark:text-emerald-400">Copié</span> : "Copier"}
                                    </button>
                                </Tooltip>
                                
                                <Tooltip text="Exporter en PDF">
                                    <button onClick={() => handleExportPDF(msg.text)} className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium bg-slate-50 text-slate-600 hover:bg-slate-100 dark:bg-slate-700/50 dark:text-slate-300 dark:hover:bg-slate-700 transition-all">
                                        <FileDown className="w-3.5 h-3.5" /> PDF
                                    </button>
                                </Tooltip>
                            </div>

                            {/* Group Right */}
                            <Tooltip text={isLatest ? "Continuer la leçon" : "Action désactivée"} className="ml-auto">
                                <button 
                                    onClick={() => handleSend("Continuer")} 
                                    disabled={!isLatest || isLoading || isAnalyzing}
                                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold transition-all border 
                                        ${!isLatest || isLoading || isAnalyzing
                                            ? 'bg-slate-100 text-slate-400 border-slate-200 dark:bg-slate-800 dark:text-slate-600 dark:border-slate-700 cursor-not-allowed opacity-60' 
                                            : 'bg-indigo-50 text-indigo-600 hover:bg-indigo-100 dark:bg-indigo-900/30 dark:text-indigo-300 dark:hover:bg-indigo-900/50 border-indigo-100 dark:border-indigo-800/30 shadow-sm'
                                        }`}
                                >
                                    Suivant <ArrowRight className="w-3.5 h-3.5" />
                                </button>
                            </Tooltip>
                        </div>
                    </div>
                    )}
                </div>
                </div>
            </div>
          );
        })}
        {(isLoading || isAnalyzing) && (
          <div className="flex justify-start animate-fade-in">
             <div className="flex-shrink-0 w-7 h-7 md:w-8 md:h-8 rounded-full bg-white dark:bg-slate-800 border border-slate-100 dark:border-slate-700 flex items-center justify-center mt-1 mx-1.5 md:mx-2 shadow-sm"><span className="text-base md:text-lg">🎓</span></div>
             <div className="bg-white dark:bg-slate-800 px-4 py-3 md:px-5 md:py-4 rounded-2xl rounded-tl-none border border-slate-100 dark:border-slate-700 shadow-sm flex gap-1 items-center">
               {isAnalyzing ? <span className="text-xs md:text-sm text-indigo-600 dark:text-indigo-400 font-medium animate-pulse flex items-center gap-2"><Loader2 className="w-3 h-3 md:w-4 md:h-4 animate-spin" />Analyse...</span> : <><div className="w-1.5 h-1.5 md:w-2 md:h-2 bg-indigo-400 dark:bg-indigo-500 rounded-full typing-dot"></div><div className="w-1.5 h-1.5 md:w-2 md:h-2 bg-indigo-400 dark:bg-indigo-500 rounded-full typing-dot"></div><div className="w-1.5 h-1.5 md:w-2 md:h-2 bg-indigo-400 dark:bg-indigo-500 rounded-full typing-dot"></div></>}
             </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      <div id="input-area" className="bg-white/80 dark:bg-slate-900/80 backdrop-blur-md border-t border-slate-100 dark:border-slate-800 p-3 md:p-4 sticky bottom-0 transition-colors duration-300 pb-5 md:pb-6">
        {suggestedActions.length > 0 && !isAnalyzing && (
          <div className="flex justify-center gap-2 md:gap-3 mb-2 md:mb-3 animate-slide-up overflow-x-auto pb-1 scrollbar-hide">
            {suggestedActions.filter(a => !a.text.includes("C'est compris ! Passons à la leçon suivante.")).map((action, index) => (
              <button key={index} onClick={() => handleSend(action.text)} className="flex items-center gap-1.5 md:gap-2 px-4 py-2 md:px-5 md:py-2.5 bg-white dark:bg-slate-800 hover:bg-indigo-50 dark:hover:bg-slate-700 text-indigo-700 dark:text-indigo-300 rounded-full text-xs md:text-sm font-semibold transition-all border border-indigo-100 dark:border-slate-700 shadow-sm hover:shadow-md hover:-translate-y-0.5 whitespace-nowrap">
                {action.icon && <action.icon className="w-3.5 h-3.5 md:w-4 md:h-4" />} {action.label}
              </button>
            ))}
          </div>
        )}
        
        {/* New Textarea Layout */}
        <div className="max-w-4xl mx-auto relative flex items-end gap-2 bg-slate-50 dark:bg-slate-800 rounded-[26px] border border-slate-200 dark:border-slate-700 p-2 transition-shadow focus-within:ring-2 focus-within:ring-indigo-500/50 shadow-sm">
            
            <textarea
                ref={textareaRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder={isLoading ? "..." : isAnalyzing ? "..." : (isListening ? "Parlez maintenant..." : "Message... (Enter pour saut de ligne)")}
                disabled={isLoading || isAnalyzing}
                rows={1}
                className="w-full bg-transparent text-slate-800 dark:text-white rounded-xl pl-4 py-3 text-base focus:outline-none resize-none max-h-32 scrollbar-hide self-center"
                style={{ minHeight: '48px' }}
            />
            
            <div className="flex items-center gap-1 pb-1 pr-1">
                 {/* Translate Button - Using Gemini API */}
                 <Tooltip text="Traduire le texte">
                    <button onClick={handleTranslateInput} disabled={!input.trim() || isTranslating} className="p-2 rounded-full transition-all text-slate-400 hover:text-indigo-600 hover:bg-slate-200 dark:hover:bg-slate-700 disabled:opacity-50">
                        {isTranslating ? <Loader2 className="w-5 h-5 animate-spin" /> : <Languages className="w-5 h-5" />}
                    </button>
                 </Tooltip>

                 {/* Mic Button Inside */}
                 <Tooltip text="Dictée vocale">
                     <button onClick={toggleListening} className={`p-2 rounded-full transition-all ${isListening ? 'bg-red-500 text-white animate-pulse' : 'text-slate-400 hover:text-indigo-600 hover:bg-slate-200 dark:hover:bg-slate-700'}`} title="Dictée vocale">
                        {isListening ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
                     </button>
                 </Tooltip>
                 
                 {/* Send Button Inside */}
                 <Tooltip text="Envoyer le message">
                     <button onClick={() => handleSend()} disabled={!input.trim() || isLoading || isAnalyzing} className="p-2.5 bg-indigo-600 hover:bg-indigo-700 dark:bg-indigo-500 dark:hover:bg-indigo-600 text-white rounded-full disabled:bg-slate-300 dark:disabled:bg-slate-700 disabled:cursor-not-allowed transition-all shadow-md transform hover:scale-105 active:scale-95 flex items-center justify-center">
                        <Send className="w-4 h-4" />
                    </button>
                 </Tooltip>
            </div>
        </div>
      </div>
    </div>
  );
};

export default ChatInterface;
