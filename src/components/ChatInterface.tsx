import React, { useState, useRef, useEffect, useMemo } from 'react';
import { Send, User, Mic, Volume2, ArrowLeft, Loader2, Copy, Check, ArrowRight, Phone, Globe, ChevronDown, MicOff, BookOpen, Search, AlertTriangle, X, Sun, Moon, Languages, Coins, Lock, BrainCircuit, Menu, FileText, Type, RotateCcw, MessageCircle, Image as ImageIcon, Library, PhoneOff, VolumeX, Trophy, Info, ChevronUp, Keyboard, Star, Sliders } from 'lucide-react';
import { UserProfile, ChatMessage, ExerciseItem, ExplanationLanguage, TargetLanguage, VoiceCallSummary, VoiceName } from '../types';
import { sendMessageToGemini, generateSpeech, generatePracticalExercises, translateText, generateVoiceChatResponse, analyzeVoiceCallPerformance } from '../services/geminiService';
import { storageService } from '../services/storageService';
import MarkdownRenderer from './MarkdownRenderer';
import DialogueSession from './DialogueSession';
import PaymentModal from './PaymentModal';
import Tooltip from './Tooltip';

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
  user, messages, setMessages, onChangeMode, onShowProfile, onUpdateUser, isDarkMode, toggleTheme, isAnalyzing, onMessageSent, fontSize, notify
}) => {
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isPlayingAudio, setIsPlayingAudio] = useState(false);
  const [showMenu, setShowMenu] = useState(false);
  const [isListening, setIsListening] = useState(false);
  
  // Voice Call States
  const [isCallActive, setIsCallActive] = useState(false);
  const [isCallConnecting, setIsCallConnecting] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [callSeconds, setCallSeconds] = useState(0);
  const [interimTranscript, setInterimTranscript] = useState('');
  const [aiLastReply, setAiLastReply] = useState('');

  // Modals
  const [isDialogueActive, setIsDialogueActive] = useState(false);
  const [showPaymentModal, setShowPaymentModal] = useState(false);

  const chatContainerRef = useRef<HTMLDivElement>(null); 
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  
  const audioContextRef = useRef<AudioContext | null>(null);
  const activeSourceRef = useRef<AudioBufferSourceNode | null>(null);
  const recognitionRef = useRef<any>(null);
  const silenceTimerRef = useRef<any>(null);

  const preferences = user.preferences!;

  const textSizeClass = useMemo(() => {
      switch (fontSize) {
          case 'small': return 'text-sm';
          case 'large': return 'text-lg';
          case 'xl': return 'text-xl leading-relaxed';
          default: return 'text-base';
      }
  }, [fontSize]);

  useEffect(() => {
    return () => {
        stopAudio();
        stopListening();
        if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
    };
  }, []);

  // --- Animation de la Waveform ---
  useEffect(() => {
      if (!isCallActive || !canvasRef.current) return;
      const canvas = canvasRef.current;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      let animationId: number;
      const bars = Array.from({ length: 40 }, () => Math.random() * 20 + 5);

      const render = () => {
          ctx.clearRect(0, 0, canvas.width, canvas.height);
          const barWidth = canvas.width / bars.length;
          const isActive = isListening || isPlayingAudio || isLoading;
          
          bars.forEach((h, i) => {
              const target = isActive ? (Math.random() * 70 + 10) : (Math.random() * 10 + 2);
              bars[i] += (target - bars[i]) * 0.2;
              const x = i * barWidth;
              const y = (canvas.height - bars[i]) / 2;
              
              const grad = ctx.createLinearGradient(0, y, 0, y + bars[i]);
              grad.addColorStop(0, '#6366f1');
              grad.addColorStop(1, '#a855f7');
              
              ctx.fillStyle = grad;
              ctx.beginPath();
              ctx.roundRect(x + 2, y, barWidth - 4, bars[i], 4);
              ctx.fill();
          });
          animationId = requestAnimationFrame(render);
      };
      render();
      return () => cancelAnimationFrame(animationId);
  }, [isCallActive, isListening, isPlayingAudio, isLoading]);

  useEffect(() => {
      let interval: any;
      if (isCallActive && !isCallConnecting) {
          interval = setInterval(() => {
              setCallSeconds(prev => {
                  const next = prev + 1;
                  if (next > 0 && next % 60 === 0) {
                      const updated = storageService.deductCreditOrUsage(user.id);
                      if (updated) onUpdateUser(updated);
                      else handleEndCall();
                  }
                  return next;
              });
          }, 1000);
      }
      return () => clearInterval(interval);
  }, [isCallActive, isCallConnecting, user.id]);

  const getAudioContext = async () => {
      if (!audioContextRef.current || audioContextRef.current.state === 'closed') {
          audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
      }
      if (audioContextRef.current.state === 'suspended') await audioContextRef.current.resume();
      return audioContextRef.current;
  };

  const decodePCM = (data: Uint8Array, ctx: AudioContext): AudioBuffer => {
      const dataInt16 = new Int16Array(data.buffer, data.byteOffset, data.byteLength / 2);
      const audioBuffer = ctx.createBuffer(1, dataInt16.length, 24000);
      const channelData = audioBuffer.getChannelData(0);
      for (let i = 0; i < dataInt16.length; i++) {
          channelData[i] = dataInt16[i] / 32768.0; 
      }
      return audioBuffer;
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
    const SpeechRec = (window as any).SpeechRecognition || (window as any).webkitRecognition;
    if (!SpeechRec) return;

    const recognition = new SpeechRec();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = preferences.targetLanguage.toLowerCase().includes('anglais') ? 'en-US' : 'fr-FR'; 
    
    recognition.onstart = () => setIsListening(true);
    recognition.onend = () => setIsListening(false);
    
    recognition.onresult = (e: any) => {
      const transcript = Array.from(e.results).map((r: any) => r[0].transcript).join('');
      setInterimTranscript(transcript);

      if (isCallActive) {
          if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
          silenceTimerRef.current = setTimeout(() => {
              if (transcript.trim().length > 2) {
                  stopListening();
                  handleSend(transcript);
              }
          }, 2000); 
      }
    };
    
    recognitionRef.current = recognition;
    recognition.start();
  };

  const handleStartCall = async () => {
      if (!storageService.canPerformRequest(user.id).allowed) {
          setShowPaymentModal(true);
          return;
      }
      setIsCallActive(true);
      setIsCallConnecting(true);
      setCallSeconds(0);
      setInterimTranscript('');
      setAiLastReply('');
      
      await getAudioContext();
      
      setTimeout(async () => {
          setIsCallConnecting(false);
          const isMg = preferences.explanationLanguage.includes('Mada');
          const greeting = isMg 
            ? `Salama ! TeacherMada eto. Vonona hiresaka ve ianao ?`
            : `Allô ! Je suis TeacherMada. Prêt pour notre conversation ?`;
          handleSpeak(greeting);
      }, 1500);
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
    const textToSend = textOverride || input;
    if (!textToSend.trim() || isLoading) return;

    const userMsg: ChatMessage = { id: Date.now().toString(), role: 'user', text: textToSend, timestamp: Date.now() };
    const updatedHistory = [...messages, userMsg];
    setMessages(updatedHistory);
    
    setInput('');
    setInterimTranscript('');
    setIsLoading(true);
    onMessageSent();

    try {
      let reply = "";
      if (isCallActive) {
          reply = await generateVoiceChatResponse(textToSend, user.id, updatedHistory);
      } else {
          reply = await sendMessageToGemini(textToSend, user.id, updatedHistory);
      }
      
      const aiMsg: ChatMessage = { id: (Date.now() + 1).toString(), role: 'model', text: reply, timestamp: Date.now() };
      const finalHistory = [...updatedHistory, aiMsg];
      setMessages(finalHistory);
      storageService.saveChatHistory(user.id, finalHistory, preferences.targetLanguage);
      
      if (isCallActive) setAiLastReply(reply);

      // --- AUTO PLAY IA ---
      // On lance la voix automatiquement pour chaque réponse de l'IA
      handleSpeak(reply);

      const updated = storageService.getUserById(user.id);
      if(updated) onUpdateUser(updated);
    } catch (error: any) {
      notify(error.message || "Problème de réseau.", 'error');
    } finally { 
      setIsLoading(false); 
    }
  };

  const handleSpeak = async (text: string) => {
    stopAudio();
    stopListening();
    setIsPlayingAudio(true);
    
    try {
        const rawPCM = await generateSpeech(text, user.id, user.preferences?.voiceName);
        if (rawPCM) {
            const ctx = await getAudioContext();
            const audioBuffer = decodePCM(rawPCM, ctx);
            const source = ctx.createBufferSource();
            source.buffer = audioBuffer;
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

  const scrollToBottom = () => { messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }); };
  useEffect(() => { if (!isDialogueActive && !showMenu) scrollToBottom(); }, [messages, isDialogueActive, showMenu]);

  return (
    <div className="flex flex-col h-screen bg-slate-50 dark:bg-slate-950 transition-colors duration-300 font-sans overflow-hidden">
      {showPaymentModal && <PaymentModal user={user} onClose={() => setShowPaymentModal(false)} />}
      {isDialogueActive && <DialogueSession user={user} onClose={() => setIsDialogueActive(false)} onUpdateUser={onUpdateUser} notify={notify} />}

      {/* Appel Vocal */}
      {isCallActive && (
          <div className="fixed inset-0 z-[200] bg-slate-950 flex flex-col items-center justify-between p-8 text-white animate-fade-in overflow-hidden">
              <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-indigo-600/10 rounded-full blur-[150px] pointer-events-none"></div>

              <div className="w-full flex justify-between items-center z-10">
                  <button onClick={handleEndCall} className="p-3 bg-white/5 rounded-full hover:bg-white/10 transition-colors"><ChevronDown className="w-6 h-6 text-slate-400"/></button>
                  <div className="flex flex-col items-center">
                    <div className="flex items-center gap-2 mb-1">
                        <div className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse"></div>
                        <span className="text-[10px] font-black uppercase tracking-widest text-emerald-400">Audio HD</span>
                    </div>
                    <h2 className="text-xs font-bold text-slate-500">{preferences.targetLanguage}</h2>
                  </div>
                  <div className="w-12"></div>
              </div>

              <div className="flex flex-col items-center justify-center w-full z-10 flex-1">
                  <div className="relative mb-10">
                      <div className={`w-32 h-32 md:w-40 md:h-40 rounded-[3rem] bg-gradient-to-br from-indigo-500 to-purple-600 p-1 shadow-2xl transition-all duration-700 ${isPlayingAudio ? 'scale-110 shadow-indigo-500/30' : 'scale-100'}`}>
                          <div className="w-full h-full bg-slate-900 rounded-[2.8rem] flex items-center justify-center overflow-hidden border-4 border-white/5">
                              <img src="https://i.ibb.co/B2XmRwmJ/logo.png" className="w-20 h-20 md:w-28 md:h-28 object-contain" alt="Tutor" />
                          </div>
                      </div>
                      {isListening && <div className="absolute -bottom-1 -right-1 bg-emerald-500 text-white p-2.5 rounded-full shadow-lg animate-bounce ring-4 ring-slate-950"><Mic className="w-5 h-5"/></div>}
                  </div>

                  <h3 className="text-2xl font-black mb-1">TeacherMada</h3>
                  <p className="text-slate-500 font-mono text-lg">{Math.floor(callSeconds / 60)}:{(callSeconds % 60).toString().padStart(2, '0')}</p>

                  <div className="w-full max-w-xs h-24 mt-8">
                      <canvas ref={canvasRef} width={400} height={160} className="w-full h-full opacity-60" />
                  </div>

                  <div className="mt-8 px-6 text-center h-20 max-w-md flex items-center justify-center">
                      {interimTranscript ? (
                          <p className="text-lg font-bold text-indigo-300 animate-fade-in line-clamp-2 italic">"{interimTranscript}"</p>
                      ) : isPlayingAudio ? (
                          <p className="text-xs font-black text-slate-500 uppercase tracking-widest animate-pulse">L'IA répond...</p>
                      ) : !isLoading ? (
                          <p className="text-[10px] font-bold text-slate-700 uppercase tracking-[0.2em] border border-white/5 px-4 py-2 rounded-full">En attente...</p>
                      ) : null}
                  </div>
              </div>

              <div className="w-full max-w-md grid grid-cols-3 gap-6 pb-12 z-10">
                  <button onClick={() => setIsMuted(!isMuted)} className={`flex flex-col items-center gap-2 ${isMuted ? 'text-white' : 'text-slate-500'}`}>
                      <div className={`p-5 rounded-full transition-all ${isMuted ? 'bg-white text-slate-900' : 'bg-white/5 border border-white/10'}`}>
                          {isMuted ? <VolumeX className="w-7 h-7"/> : <Volume2 className="w-7 h-7"/>}
                      </div>
                      <span className="text-[10px] font-black uppercase tracking-widest">Muet</span>
                  </button>
                  <button onClick={handleEndCall} className="flex flex-col items-center gap-2">
                      <div className="p-8 bg-red-500 rounded-full shadow-2xl hover:bg-red-600 transition-all transform active:scale-90 ring-4 ring-slate-950">
                          <PhoneOff className="w-9 h-9 fill-current"/>
                      </div>
                      <span className="text-[10px] font-black text-red-500 uppercase tracking-widest mt-1">Fin</span>
                  </button>
                  <button onClick={() => { if(isListening) stopListening(); else startListening(); }} className={`flex flex-col items-center gap-2 ${isListening ? 'text-indigo-400' : 'text-slate-500'}`}>
                      <div className={`p-5 rounded-full transition-all ${isListening ? 'bg-indigo-600 text-white shadow-xl' : 'bg-white/5 border border-white/10'}`}>
                          <Mic className="w-7 h-7"/>
                      </div>
                      <span className="text-[10px] font-black uppercase tracking-widest">Micro</span>
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
             <Globe className="w-3.5 h-3.5" />
             <span className="text-[10px] font-black uppercase whitespace-nowrap tracking-wider">{preferences.targetLanguage.split(' ')[0]}</span>
          </div>
        </div>
        
        <div className="flex items-center gap-2">
             <button onClick={() => setShowPaymentModal(true)} className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-indigo-50 dark:bg-indigo-900/20 text-indigo-900 dark:text-indigo-100 border border-indigo-100 dark:border-indigo-900/50">
                  <Coins className="w-3.5 h-3.5 text-amber-500" />
                  <span className="text-xs font-bold">{user.role === 'admin' ? '∞' : user.credits}</span>
             </button>
             <button onClick={onShowProfile} className="w-9 h-9 rounded-full bg-indigo-600 text-white font-bold flex items-center justify-center border-2 border-white dark:border-slate-800 shadow-sm overflow-hidden">
                {user.username.substring(0, 1).toUpperCase()}
             </button>
        </div>
      </header>
      
      {/* Messages */}
      <div id="chat-feed" ref={chatContainerRef} className="flex-1 overflow-y-auto p-3 md:p-6 space-y-6 pt-20 pb-4 scrollbar-hide">
        {messages.map((msg) => (
            <div key={msg.id} className={`flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'} animate-fade-in`}>
                <div className={`flex max-w-[92%] md:max-w-[85%] ${msg.role === 'user' ? 'flex-row-reverse' : 'flex-row'}`}>
                    <div className={`flex-shrink-0 w-7 h-7 rounded-full flex items-center justify-center mt-1 mx-1.5 ${msg.role === 'user' ? 'bg-indigo-100' : 'bg-white border p-1 shadow-sm'}`}>
                        {msg.role === 'user' ? <User className="w-3.5 h-3.5 text-indigo-600" /> : <img src="https://i.ibb.co/B2XmRwmJ/logo.png" className="w-full h-full object-contain" alt="Teacher" />}
                    </div>
                    <div className={`px-4 py-3 rounded-2xl shadow-sm ${textSizeClass} transition-all duration-300 ${msg.role === 'user' ? 'bg-indigo-600 text-white rounded-tr-none' : 'bg-white dark:bg-slate-800 dark:text-slate-200 text-slate-800 rounded-tl-none border border-slate-50 dark:border-slate-700'}`}>
                         {msg.role === 'user' ? <p className="whitespace-pre-wrap">{msg.text}</p> : (
                            <>
                                <MarkdownRenderer content={msg.text} onPlayAudio={(t) => handleSpeak(t)} />
                                <div className="flex items-center gap-2 mt-2.5 pt-2 border-t border-slate-50 dark:border-slate-700/50">
                                    <button onClick={() => handleSpeak(msg.text)} className={`p-1.5 hover:bg-slate-50 dark:hover:bg-slate-700 rounded-full transition-colors ${isPlayingAudio ? 'text-indigo-600' : 'text-slate-400'}`}><Volume2 className="w-4 h-4"/></button>
                                </div>
                            </>
                         )}
                    </div>
                </div>
            </div>
        ))}
        {isLoading && (
             <div className="flex justify-start animate-fade-in">
                 <div className="flex-shrink-0 w-7 h-7 rounded-full bg-white border flex items-center justify-center mt-1 mx-1.5 p-1"><img src="https://i.ibb.co/B2XmRwmJ/logo.png" className="w-full h-full object-contain" alt="Teacher" /></div>
                 <div className="bg-white dark:bg-slate-800 px-4 py-3 rounded-2xl rounded-tl-none border border-slate-50 shadow-sm"><Loader2 className="w-4 h-4 animate-spin text-indigo-500"/></div>
             </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div id="input-area" className="bg-white/80 dark:bg-slate-900/80 backdrop-blur-md border-t border-slate-100 dark:border-slate-800 p-3 md:p-4 sticky bottom-0">
        <div className="max-w-4xl mx-auto flex items-end gap-2 bg-slate-50 dark:bg-slate-800 rounded-[26px] border border-slate-200 dark:border-slate-700 p-1.5 shadow-sm">
            <textarea
                ref={textareaRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Message..."
                disabled={isLoading}
                rows={1}
                className="w-full bg-transparent text-slate-800 dark:text-white rounded-xl pl-4 py-3 text-base focus:outline-none resize-none max-h-32 scrollbar-hide self-center"
                onKeyDown={(e) => { if(e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
            />
            <div className="flex items-center gap-1 pb-1 pr-1">
                 <button onClick={handleStartCall} className="p-2.5 rounded-full text-purple-500 hover:bg-purple-100 dark:hover:bg-purple-900/30 transition-colors"><Phone className="w-5 h-5"/></button>
                 <button onClick={() => { if(isListening) stopListening(); else startListening(); }} className={`p-2.5 rounded-full transition-all ${isListening ? 'bg-red-500 text-white animate-pulse' : 'text-slate-400 hover:bg-slate-200'}`}><Mic className="w-5 h-5" /></button>
                 <button onClick={() => handleSend()} disabled={!input.trim() || isLoading} className="p-3 rounded-full bg-indigo-600 text-white shadow-lg hover:bg-indigo-700 disabled:opacity-50 transform active:scale-95 transition-all"><Send className="w-4.5 h-4.5" /></button>
            </div>
        </div>
      </div>
    </div>
  );
};

export default ChatInterface;