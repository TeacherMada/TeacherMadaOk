
import React, { useState, useRef, useEffect, useMemo } from 'react';
import { Send, User, Mic, Volume2, ArrowLeft, Loader2, Copy, Check, ArrowRight, Phone, Globe, ChevronDown, MicOff, BookOpen, Search, AlertTriangle, X, Sun, Moon, Languages, Coins, Lock, BrainCircuit, Menu, FileText, Type, RotateCcw, MessageCircle, Image as ImageIcon, Library, PhoneOff, VolumeX, Trophy, Info, ChevronUp, Keyboard, Star } from 'lucide-react';
import { UserProfile, ChatMessage, ExerciseItem, ExplanationLanguage, TargetLanguage, VoiceCallSummary } from '../types';
import { sendMessageToGemini, generateSpeech, generatePracticalExercises, getLessonSummary, translateText, generateConceptImage, generateVoiceChatResponse, analyzeVoiceCallPerformance } from '../services/geminiService';
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
  const [callSummary, setCallSummary] = useState<VoiceCallSummary | null>(null);
  const [isAnalyzingCall, setIsAnalyzingCall] = useState(false);
  
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

  const chatContainerRef = useRef<HTMLDivElement>(null); 
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  
  const audioContextRef = useRef<AudioContext | null>(null);
  const activeSourceRef = useRef<AudioBufferSourceNode | null>(null);
  const recognitionRef = useRef<any>(null);

  const preferences = user.preferences!;

  const progressData = useMemo(() => {
      const currentLang = preferences.targetLanguage;
      const currentLevel = preferences.level.split(' ')[0] || 'A1';
      const nextLevel = NEXT_LEVEL_MAP[currentLevel] || 'Expert';
      const courseKey = `${currentLang}-${preferences.level}`;
      const lessonsDone = user.stats.progressByLevel?.[courseKey] || 0;
      const percentage = Math.min((lessonsDone / TOTAL_LESSONS_PER_LEVEL) * 100, 100);
      return { currentLevel, nextLevel, percentage, lessonsDone };
  }, [user.stats.progressByLevel, preferences.targetLanguage, preferences.level]);

  // SMART AUTO-SCROLL
  const scrollToBottom = (force = false) => { 
      if (chatContainerRef.current) {
          const { scrollTop, scrollHeight, clientHeight } = chatContainerRef.current;
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

  const textSizeClass = useMemo(() => {
      switch (fontSize) {
          case 'small': return 'text-sm';
          case 'large': return 'text-lg';
          case 'xl': return 'text-xl leading-relaxed';
          default: return 'text-base';
      }
  }, [fontSize]);

  const getAudioContext = async () => {
      if (!audioContextRef.current) {
          audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
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
    if (isMuted && isCallActive) return;
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
    recognition.onerror = () => setIsListening(false);
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

  const toggleListening = () => { if (isListening) stopListening(); else startListening(); };

  const handleStartCall = async () => {
      if (!storageService.canPerformRequest(user.id).allowed) {
          setShowPaymentModal(true);
          return;
      }
      setIsCallActive(true);
      setIsCallConnecting(true);
      setCallSeconds(0);
      
      // Warm up audio context
      await getAudioContext();
      
      setTimeout(() => {
          setIsCallConnecting(false);
          const greeting = `Bonjour ${user.username} ! 😊 Je vous écoute pour pratiquer le ${preferences.targetLanguage}.`;
          handleSpeak(greeting);
      }, 1000);
  };

  const handleEndCall = () => {
      stopListening();
      stopAudio();
      setIsCallActive(false);
      setIsCallConnecting(false);
      setCallSeconds(0);
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
    const newHistory = [...messages, userMsg];
    setMessages(newHistory);
    storageService.saveChatHistory(user.id, newHistory, preferences.targetLanguage);
    
    setInput('');
    setIsLoading(true);
    onMessageSent();
    
    setTimeout(() => scrollToBottom(true), 100);

    try {
      let finalResponseText = "";
      if (isCallActive) {
          finalResponseText = await generateVoiceChatResponse(textToSend, user.id, newHistory);
      } else {
          finalResponseText = await sendMessageToGemini(textToSend, user.id, newHistory);
      }
      
      const aiMsg: ChatMessage = { id: (Date.now() + 1).toString(), role: 'model', text: finalResponseText, timestamp: Date.now() };
      const finalHistory = [...newHistory, aiMsg];
      setMessages(finalHistory);
      storageService.saveChatHistory(user.id, finalHistory, preferences.targetLanguage);
      
      if (isCallActive) handleSpeak(finalResponseText);
      const updated = storageService.getUserById(user.id);
      if(updated) onUpdateUser(updated);

    } catch (error: any) {
      console.error(error);
      const errMsg = error.message?.includes("API_KEY") ? "Erreur Configuration API." : "Erreur de connexion. Réessayez.";
      notify(errMsg, 'error');
    } finally { 
      setIsLoading(false); 
    }
  };

  const handleSpeak = async (text: string) => {
    stopAudio();
    stopListening();
    setIsPlayingAudio(true);
    
    try {
        const rawAudioBuffer = await generateSpeech(text, user.id);
        if (rawAudioBuffer) {
            const ctx = await getAudioContext();
            const decoded = await ctx.decodeAudioData(rawAudioBuffer);
            const source = ctx.createBufferSource();
            source.buffer = decoded;
            source.connect(ctx.destination);
            activeSourceRef.current = source;
            source.onended = () => { 
                setIsPlayingAudio(false); 
                if (isCallActive) startListening(); 
            };
            source.start(0);
        } else {
            setIsPlayingAudio(false);
            if (isCallActive) startListening();
        }
    } catch (error) {
        setIsPlayingAudio(false);
        if (isCallActive) startListening();
    }
  };

  const stopAudio = () => { 
      if (activeSourceRef.current) { 
          try { activeSourceRef.current.stop(); } catch(e){} 
          activeSourceRef.current = null; 
      } 
      setIsPlayingAudio(false); 
  };

  const getLanguageDisplay = () => {
    const lang = preferences.targetLanguage;
    const level = preferences.level.split(' ')[0];
    return `${lang} • ${level}`;
  };

  return (
    <div className="flex flex-col h-screen bg-slate-50 dark:bg-slate-950 transition-colors duration-300">
      {showPaymentModal && <PaymentModal user={user} onClose={() => setShowPaymentModal(false)} />}
      {showTutorial && <TutorialOverlay onComplete={() => setShowTutorial(false)} />}
      {isDialogueActive && <DialogueSession user={user} onClose={() => setIsDialogueActive(false)} onUpdateUser={onUpdateUser} notify={notify} />}

      {/* Voice Call Overlay */}
      {isCallActive && (
          <div className="fixed inset-0 z-[150] bg-slate-900/95 backdrop-blur-xl flex flex-col items-center justify-center p-6 text-white animate-fade-in">
              <div className="text-center space-y-4 mb-12">
                  <div className="w-32 h-32 mx-auto bg-indigo-600 rounded-full flex items-center justify-center shadow-2xl animate-pulse">
                      <Phone className="w-16 h-16 text-white" />
                  </div>
                  <h2 className="text-2xl font-bold">Appel avec TeacherMada</h2>
                  <p className="text-indigo-300">{isCallConnecting ? "Connexion..." : isPlayingAudio ? "TeacherMada parle..." : isListening ? "Je vous écoute..." : "En attente..."}</p>
              </div>
              
              <div className="flex gap-8">
                  <button onClick={handleEndCall} className="p-6 bg-red-500 rounded-full shadow-lg hover:bg-red-600 transition-all">
                      <PhoneOff className="w-8 h-8" />
                  </button>
              </div>
          </div>
      )}

      {/* Header */}
      <header className="fixed top-0 left-0 right-0 z-40 bg-white/90 dark:bg-slate-900/95 backdrop-blur-md shadow-sm h-14 md:h-16 px-4 flex items-center justify-between border-b border-slate-100 dark:border-slate-800">
        <div className="flex items-center gap-2">
          <button onClick={onChangeMode} className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-full transition-all shrink-0">
             <ArrowLeft className="w-5 h-5 text-slate-500" />
          </button>
          <div className="flex items-center gap-2 px-3 py-1.5 bg-indigo-50 dark:bg-indigo-900/20 text-indigo-800 dark:text-indigo-300 rounded-full border border-indigo-100 dark:border-indigo-900/50">
             <Globe className="w-4 h-4" />
             <span className="text-xs font-bold whitespace-nowrap">{getLanguageDisplay()}</span>
          </div>
        </div>
        
        <div className="flex items-center gap-2">
             <button onClick={() => setShowPaymentModal(true)} className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-indigo-50 dark:bg-indigo-900/20 text-indigo-900 dark:text-indigo-100">
                  <Coins className="w-3.5 h-3.5 text-amber-500" />
                  <span className="text-xs font-bold">{user.role === 'admin' ? '∞' : user.credits}</span>
             </button>
             <button onClick={onShowProfile} className="w-9 h-9 rounded-full bg-indigo-600 text-white font-bold flex items-center justify-center border-2 border-white dark:border-slate-800 shadow-sm">
                {user.username.substring(0, 1).toUpperCase()}
             </button>
        </div>
      </header>
      
      {/* Chat Area */}
      <div id="chat-feed" ref={chatContainerRef} className="flex-1 overflow-y-auto p-3 md:p-4 space-y-6 pt-20 pb-4 scrollbar-hide">
        {messages.map((msg, index) => (
            <div key={msg.id} className={`flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'} animate-fade-in`}>
                
                {/* Badge AI */}
                {msg.role === 'model' && (
                    <div className="ml-12 mb-1">
                        <span className="text-[10px] font-bold text-indigo-500 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-900/30 px-2 py-0.5 rounded-full border border-indigo-100 dark:border-indigo-900/50 uppercase tracking-widest">
                            {preferences.targetLanguage.split(' ')[0]} • {preferences.level.split(' ')[0]}
                        </span>
                    </div>
                )}

                <div className={`flex max-w-[90%] md:max-w-[80%] ${msg.role === 'user' ? 'flex-row-reverse' : 'flex-row'}`}>
                    <div className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center mt-1 mx-2 ${msg.role === 'user' ? 'bg-indigo-100' : 'bg-white border p-1'}`}>
                        {msg.role === 'user' ? <User className="w-4 h-4 text-indigo-600" /> : <img src="https://i.ibb.co/B2XmRwmJ/logo.png" className="w-full h-full object-contain" alt="Teacher" />}
                    </div>
                    <div id={`msg-content-${msg.id}`} className={`px-4 py-3 rounded-2xl shadow-sm ${textSizeClass} transition-all duration-300 ${msg.role === 'user' ? 'bg-indigo-600 text-white rounded-tr-none' : 'bg-white dark:bg-slate-800 dark:text-slate-200 text-slate-800 rounded-tl-none border border-slate-100 dark:border-slate-700'}`}>
                         {msg.role === 'user' ? <p className="whitespace-pre-wrap">{msg.text}</p> : (
                            <>
                                <MarkdownRenderer content={msg.text} onPlayAudio={(t) => handleSpeak(t)} />
                                <div className="flex items-center gap-2 mt-2 pt-2 border-t border-slate-100 dark:border-slate-700/50">
                                    <button onClick={() => handleSpeak(msg.text)} className="p-1.5 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-full transition-colors"><Volume2 className="w-4 h-4 text-slate-400"/></button>
                                    <button onClick={() => navigator.clipboard.writeText(msg.text)} className="p-1.5 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-full transition-colors"><Copy className="w-4 h-4 text-slate-400"/></button>
                                </div>
                            </>
                         )}
                    </div>
                </div>
            </div>
        ))}
        {isLoading && (
             <div className="flex justify-start animate-fade-in">
                 <div className="flex-shrink-0 w-8 h-8 rounded-full bg-white border flex items-center justify-center mt-1 mx-2 p-1"><img src="https://i.ibb.co/B2XmRwmJ/logo.png" className="w-full h-full object-contain" alt="Teacher" /></div>
                 <div className="bg-white dark:bg-slate-800 px-4 py-3 rounded-2xl rounded-tl-none border shadow-sm flex items-center gap-2"><TypingIndicator /></div>
             </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input Area */}
      <div id="input-area" className="bg-white/80 dark:bg-slate-900/80 backdrop-blur-md border-t border-slate-100 dark:border-slate-800 p-3 md:p-4 sticky bottom-0">
        <div className="max-w-4xl mx-auto flex items-end gap-2 bg-slate-50 dark:bg-slate-800 rounded-[26px] border border-slate-200 dark:border-slate-700 p-2 shadow-sm">
            <textarea
                ref={textareaRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Message..."
                disabled={isLoading}
                rows={1}
                className="w-full bg-transparent text-slate-800 dark:text-white rounded-xl pl-4 py-3 text-base focus:outline-none resize-none max-h-32 scrollbar-hide self-center"
            />
            <div className="flex items-center gap-1 pb-1 pr-1">
                 <button onClick={handleStartCall} className="p-2 rounded-full text-purple-500 hover:bg-purple-100 dark:hover:bg-purple-900/30" title="Appel Vocal"><Phone className="w-5 h-5"/></button>
                 <button onClick={toggleListening} className={`p-2 rounded-full ${isListening ? 'bg-red-500 text-white animate-pulse' : 'text-slate-400 hover:text-indigo-600'}`}><Mic className="w-5 h-5" /></button>
                 <button onClick={() => handleSend()} disabled={!input.trim() || isLoading} className="p-2.5 rounded-full bg-indigo-600 text-white shadow-md hover:bg-indigo-700 disabled:opacity-50"><Send className="w-4 h-4" /></button>
            </div>
        </div>
      </div>
    </div>
  );
};

export default ChatInterface;
