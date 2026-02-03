
import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Send, Menu, ArrowRight, Phone, Dumbbell, Brain, Sparkles, X, MicOff, Volume2, Lightbulb, Zap, BookOpen, MessageCircle, Mic, StopCircle, ArrowLeft, Sun, Moon, User, Play, Loader2 } from 'lucide-react';
import { UserProfile, ChatMessage, LearningSession } from '../types';
import { sendMessageStream, generateNextLessonPrompt, generateSpeech } from '../services/geminiService';
import { storageService } from '../services/storageService';
import MarkdownRenderer from './MarkdownRenderer';
import { GoogleGenAI, LiveServerMessage, Modality } from '@google/genai';

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

// Helper to convert Raw PCM to AudioBuffer
function pcmToAudioBuffer(data: Uint8Array, ctx: AudioContext, sampleRate: number = 24000) {
    const pcm16 = new Int16Array(data.buffer);
    const float32 = new Float32Array(pcm16.length);
    for (let i = 0; i < pcm16.length; i++) {
        float32[i] = pcm16[i] / 32768.0; 
    }
    const buffer = ctx.createBuffer(1, float32.length, sampleRate);
    buffer.copyToChannel(float32, 0);
    return buffer;
}

// Helper for Base64 decode
function base64ToUint8Array(base64: string) {
  const binaryString = atob(base64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

// Helper for Audio Input (Microphone to PCM) for Live API
function createBlob(data: Float32Array): { data: string, mimeType: string } {
  const l = data.length;
  const int16 = new Int16Array(l);
  for (let i = 0; i < l; i++) {
    int16[i] = data[i] * 32768;
  }
  const bytes = new Uint8Array(int16.buffer);
  let binary = '';
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return {
    data: btoa(binary),
    mimeType: 'audio/pcm;rate=16000',
  };
}

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
  
  // Audio Playback State
  const [speakingMessageId, setSpeakingMessageId] = useState<string | null>(null);
  const [audioContext, setAudioContext] = useState<AudioContext | null>(null);
  const [currentSource, setCurrentSource] = useState<AudioBufferSourceNode | null>(null);
  const [isLoadingAudio, setIsLoadingAudio] = useState(false);

  // Live API State
  const [isVoiceMode, setIsVoiceMode] = useState(false);
  const [voiceStatus, setVoiceStatus] = useState<'idle' | 'listening' | 'speaking'>('idle');
  const [callDuration, setCallDuration] = useState(0);
  const liveSessionRef = useRef<any>(null);
  const liveAudioContextRef = useRef<AudioContext | null>(null);
  const liveInputSourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const liveProcessorRef = useRef<ScriptProcessorNode | null>(null);
  const liveNextStartTimeRef = useRef<number>(0);
  const liveSourcesRef = useRef<Set<AudioBufferSourceNode>>(new Set());

  // Sync theme
  const toggleTheme = () => {
      const newMode = !isDarkMode;
      setIsDarkMode(newMode);
      document.documentElement.classList.toggle('dark', newMode);
      localStorage.setItem('tm_theme', newMode ? 'dark' : 'light');
  };

  // Initialize Playback Audio Context
  useEffect(() => {
      const initAudio = () => {
          if (!audioContext) {
              const ctx = new (window.AudioContext || (window as any).webkitAudioContext)({sampleRate: 24000}); // TTS is 24kHz
              setAudioContext(ctx);
          }
      };
      window.addEventListener('click', initAudio, { once: true });
      return () => window.removeEventListener('click', initAudio);
  }, [audioContext]);

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

  // Format Time
  const formatTime = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  };

  // --- GEMINI HIGH QUALITY TTS PLAYBACK (MESSAGE CLICK) ---
  const stopSpeaking = () => {
      if (currentSource) {
          try { currentSource.stop(); } catch (e) {}
          setCurrentSource(null);
      }
      setSpeakingMessageId(null);
      setIsLoadingAudio(false);
  };

  const playMessageAudio = async (text: string, id: string) => {
      if (speakingMessageId === id) {
          stopSpeaking();
          return;
      }

      stopSpeaking();
      setIsLoadingAudio(true);
      setSpeakingMessageId(id);

      try {
          const cleanText = text
            .replace(/[#*`_]/g, '') 
            .replace(/Lesona \d+/gi, '')
            .replace(/Tanjona|Vocabulaire|Grammaire|Pratique/gi, '');

          // Service returns raw PCM ArrayBuffer
          const pcmBuffer = await generateSpeech(cleanText);
          
          if (!pcmBuffer || !audioContext) {
              throw new Error("Audio init failed");
          }

          // Decode PCM
          const audioBuffer = pcmToAudioBuffer(new Uint8Array(pcmBuffer), audioContext, 24000);
          
          const source = audioContext.createBufferSource();
          source.buffer = audioBuffer;
          source.connect(audioContext.destination);
          
          source.onended = () => {
              setSpeakingMessageId(null);
              setCurrentSource(null);
          };

          source.start(0);
          setCurrentSource(source);

      } catch (e) {
          console.error("Audio Playback Error", e);
          notify("Erreur lecture audio", "error");
          setSpeakingMessageId(null);
      } finally {
          setIsLoadingAudio(false);
      }
  };

  // --- LIVE API (VOICE CALL) LOGIC ---
  const startLiveSession = async () => {
      try {
          const ai = new GoogleGenAI({ apiKey: process.env.API_KEY || '' });
          
          // Audio Context for Live Session (Input 16k, Output 24k)
          const ctx = new (window.AudioContext || (window as any).webkitAudioContext)({sampleRate: 24000});
          liveAudioContextRef.current = ctx;
          liveNextStartTimeRef.current = ctx.currentTime;

          // Connect
          const sessionPromise = ai.live.connect({
              model: 'gemini-2.5-flash-native-audio-preview-12-2025',
              config: {
                  responseModalities: [Modality.AUDIO],
                  speechConfig: {
                      voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Zephyr' } }
                  },
                  systemInstruction: {
                      parts: [{ text: `Tu es TeacherMada. Parle avec ${user.username} en ${user.preferences?.targetLanguage}. Sois bref et encourageant.` }]
                  }
              },
              callbacks: {
                  onopen: async () => {
                      setVoiceStatus('listening');
                      // Start Microphone Streaming
                      const stream = await navigator.mediaDevices.getUserMedia({ audio: {
                          sampleRate: 16000,
                          channelCount: 1,
                          echoCancellation: true
                      }});
                      
                      const inputCtx = new (window.AudioContext || (window as any).webkitAudioContext)({sampleRate: 16000});
                      const source = inputCtx.createMediaStreamSource(stream);
                      const processor = inputCtx.createScriptProcessor(4096, 1, 1);
                      
                      processor.onaudioprocess = (e) => {
                          const inputData = e.inputBuffer.getChannelData(0);
                          const pcmBlob = createBlob(inputData);
                          sessionPromise.then(session => {
                              session.sendRealtimeInput({ media: pcmBlob });
                          });
                      };
                      
                      source.connect(processor);
                      processor.connect(inputCtx.destination);
                      
                      liveInputSourceRef.current = source;
                      liveProcessorRef.current = processor;
                  },
                  onmessage: (msg: LiveServerMessage) => {
                      const audioData = msg.serverContent?.modelTurn?.parts?.[0]?.inlineData?.data;
                      if (audioData) {
                          setVoiceStatus('speaking');
                          const bytes = base64ToUint8Array(audioData);
                          const buffer = pcmToAudioBuffer(bytes, ctx, 24000);
                          
                          // Schedule playback
                          const source = ctx.createBufferSource();
                          source.buffer = buffer;
                          source.connect(ctx.destination);
                          
                          // Gapless scheduling
                          const now = ctx.currentTime;
                          const startAt = Math.max(now, liveNextStartTimeRef.current);
                          source.start(startAt);
                          liveNextStartTimeRef.current = startAt + buffer.duration;
                          
                          liveSourcesRef.current.add(source);
                          source.onended = () => {
                              liveSourcesRef.current.delete(source);
                              if (liveSourcesRef.current.size === 0) setVoiceStatus('listening');
                          };
                      }
                      
                      if (msg.serverContent?.interrupted) {
                          // Stop current playback if interrupted
                          liveSourcesRef.current.forEach(s => s.stop());
                          liveSourcesRef.current.clear();
                          liveNextStartTimeRef.current = ctx.currentTime;
                          setVoiceStatus('listening');
                      }
                  },
                  onclose: () => {
                      setVoiceStatus('idle');
                  },
                  onerror: (e) => {
                      console.error("Live Error", e);
                      notify("Erreur Appel Vocal", "error");
                      stopLiveSession();
                  }
              }
          });
          
          liveSessionRef.current = sessionPromise;

      } catch (e) {
          console.error("Live Connection Failed", e);
          notify("Impossible de démarrer l'appel.", "error");
          setIsVoiceMode(false);
      }
  };

  const stopLiveSession = async () => {
      // Stop Mic
      if (liveInputSourceRef.current) liveInputSourceRef.current.disconnect();
      if (liveProcessorRef.current) liveProcessorRef.current.disconnect();
      
      // Stop Playback
      liveSourcesRef.current.forEach(s => s.stop());
      liveSourcesRef.current.clear();
      
      if (liveAudioContextRef.current) liveAudioContextRef.current.close();
      
      // Close Session
      if (liveSessionRef.current) {
          const session = await liveSessionRef.current;
          session.close();
      }
      
      setIsVoiceMode(false);
      setVoiceStatus('idle');
  };

  // Toggle Voice Mode
  useEffect(() => {
      if (isVoiceMode) {
          startLiveSession();
      } else {
          stopLiveSession();
      }
      // Cleanup on unmount
      return () => {
          if (isVoiceMode) stopLiveSession();
      };
  }, [isVoiceMode]);


  // -------------------

  const processMessage = async (text: string, isAuto: boolean = false) => {
    if (isStreaming) return;
    
    // --- CREDIT CHECK ---
    const canProceed = await storageService.checkAndConsumeCredit(user.id);
    if (!canProceed) {
        onShowPayment();
        return;
    }
    
    const updatedUser = await storageService.getUserById(user.id);
    if (updatedUser) onUpdateUser(updatedUser);
    // --------------------

    const userMsg: ChatMessage = { 
        id: Date.now().toString(), 
        role: 'user', 
        text: isAuto ? `➡️ Leçon ${currentLessonNum || 1} : La suite SVP.` : text, 
        timestamp: Date.now() 
    };
    
    const newHistory = [...messages, userMsg];
    setMessages(newHistory);
    setInput('');
    setIsStreaming(true);

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
            scrollRef.current?.scrollIntoView({ behavior: 'smooth' });
        }
      }
      
      const finalHistory: ChatMessage[] = [...newHistory, { id: aiMsgId, role: 'model', text: fullText, timestamp: Date.now() }];
      storageService.saveSession({ ...session, messages: finalHistory, progress: (messages.length / 20) * 100 });
      
      const newXp = user.stats.xp + 10; 
      const xpUser = { ...user, stats: { ...user.stats, xp: newXp } };
      await storageService.saveUserProfile(xpUser);
      onUpdateUser(xpUser);

    } catch (e) {
      notify("Connexion instable.", "error");
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

  // Current Lesson Calc
  const currentLessonNum = (user.stats.lessonsCompleted || 0) + 1;

  // Render Live Call Overlay
  if (isVoiceMode) {
      return (
          <div className="fixed inset-0 z-[100] bg-[#0B0F19] text-white flex flex-col items-center justify-between p-8 animate-fade-in font-sans overflow-hidden">
              {/* Background FX */}
              <div className="absolute inset-0 z-0">
                  <div className={`absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] bg-indigo-600/20 rounded-full blur-[100px] transition-all duration-1000 ${voiceStatus === 'listening' ? 'scale-125 opacity-30' : 'scale-100 opacity-20'}`}></div>
              </div>

              {/* Header */}
              <div className="w-full flex justify-between items-start opacity-90 z-10">
                  <button onClick={() => setIsVoiceMode(false)} className="p-3 bg-white/10 rounded-full hover:bg-white/20 backdrop-blur-md transition-all">
                      <X className="w-6 h-6" />
                  </button>
                  <div className="flex flex-col items-center">
                      <div className="flex items-center gap-2 mb-1">
                          <span className={`w-2 h-2 rounded-full ${voiceStatus === 'idle' ? 'bg-slate-500' : 'bg-green-500 animate-pulse'}`}></span>
                          <span className="text-xs font-bold uppercase tracking-widest text-indigo-200">Appel Live</span>
                      </div>
                      <span className="font-mono text-xl text-white font-medium">{formatTime(callDuration)}</span>
                  </div>
                  <div className="w-12"></div>
              </div>

              {/* Center Visualization */}
              <div className="flex flex-col items-center justify-center gap-10 w-full z-10 flex-1 relative">
                  <div className="h-8 flex items-center justify-center">
                      {voiceStatus === 'listening' && <p className="text-indigo-300 font-medium animate-pulse flex items-center gap-2"><Mic className="w-4 h-4"/> Je vous écoute...</p>}
                      {voiceStatus === 'speaking' && <p className="text-emerald-300 font-medium flex items-center gap-2"><Volume2 className="w-4 h-4"/> Je parle...</p>}
                      {voiceStatus === 'idle' && <p className="text-slate-400 font-medium text-sm">Connexion...</p>}
                  </div>

                  <div className="relative">
                      {voiceStatus === 'speaking' && (
                          <div className="absolute inset-0 bg-emerald-500/20 rounded-full animate-ping blur-md"></div>
                      )}
                      {voiceStatus === 'listening' && (
                          <div className="absolute inset-0 bg-indigo-500/20 rounded-full animate-pulse scale-110 blur-md"></div>
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

              {/* Controls */}
              <div className="w-full max-w-sm flex justify-center mb-8 z-10">
                  <button onClick={() => setIsVoiceMode(false)} className="flex flex-col items-center gap-3 group transform hover:scale-105 transition-transform">
                      <div className="w-20 h-20 rounded-full bg-red-500 hover:bg-red-600 flex items-center justify-center shadow-lg shadow-red-500/40 border-4 border-[#0B0F19]">
                          <Phone className="w-10 h-10 text-white fill-white rotate-[135deg]" />
                      </div>
                      <span className="text-xs font-bold text-red-400 group-hover:text-red-300 transition-colors uppercase tracking-wider">Raccrocher</span>
                  </button>
              </div>
          </div>
      );
  }

  return (
    <div className="flex flex-col h-[100dvh] bg-[#F0F2F5] dark:bg-[#0B0F19] font-sans transition-colors duration-300 overflow-hidden">
      
      {/* --- FIXED HEADER --- */}
      <header className="fixed top-0 left-0 w-full z-30 bg-white/80 dark:bg-[#131825]/90 backdrop-blur-md border-b border-slate-200 dark:border-slate-800 shadow-sm safe-top transition-colors">
        <div className="max-w-5xl mx-auto px-4 h-16 flex items-center justify-between">
            
            <div className="flex items-center gap-3 flex-1">
                <button onClick={onExit} className="p-2 -ml-2 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-full transition-colors shrink-0">
                    <ArrowLeft className="w-6 h-6" />
                </button>
                
                <div className="flex items-center gap-1.5 bg-slate-100 dark:bg-slate-800 px-3 py-1.5 rounded-full border border-slate-200 dark:border-slate-700 shadow-sm">
                    <span className="text-xl leading-none">{user.preferences?.targetLanguage?.split(' ')[1] || '🇨🇵'}</span>
                    <div className="h-4 w-px bg-slate-300 dark:bg-slate-600 mx-1"></div>
                    <span className="text-xs font-black text-indigo-600 dark:text-indigo-400 uppercase">{user.preferences?.level}</span>
                </div>
            </div>

            <div className="flex flex-col items-center justify-center shrink-0">
                <h1 className="text-[10px] font-black text-slate-400 uppercase tracking-widest leading-tight">
                    Leçon {currentLessonNum}
                </h1>
                <button 
                    onClick={onShowPayment} 
                    className="flex items-center gap-1 mt-0.5 hover:scale-105 transition-transform"
                >
                    <Zap className="w-3.5 h-3.5 text-amber-500 fill-amber-500" />
                    <span className="text-sm font-black text-amber-500">
                        {user.freeUsage.count < 3 ? `${3 - user.freeUsage.count} Free` : user.credits}
                    </span>
                </button>
            </div>

            <div className="flex items-center justify-end gap-2 flex-1">
                <button
                  onClick={toggleTheme}
                  className="p-2 text-slate-400 hover:text-indigo-600 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                >
                  {isDarkMode ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
                </button>

                <button 
                    onClick={onShowProfile} 
                    className="relative group"
                >
                    <div className="w-9 h-9 bg-indigo-600 text-white rounded-full flex items-center justify-center font-bold text-sm shadow-md group-hover:scale-105 transition-transform ring-2 ring-white dark:ring-slate-900">
                        {user.username.charAt(0).toUpperCase()}
                    </div>
                </button>
            </div>
        </div>
      </header>

      {/* Chat Area - Padding top for fixed header, padding bottom for fixed footer */}
      <main className="flex-1 overflow-y-auto pt-16 pb-32 px-4 md:px-6 space-y-6 scrollbar-hide relative">
        <div className="max-w-3xl mx-auto space-y-6">
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
                    <MarkdownRenderer 
                        content={msg.text} 
                        onPlayAudio={(text) => playMessageAudio(text, msg.id + text)} 
                    />
                    
                    {/* Audio Playback Control for AI Messages */}
                    {msg.role === 'model' && (
                        <div className="mt-3 pt-3 border-t border-slate-100 dark:border-slate-800 flex justify-end">
                            <button 
                                onClick={() => speakingMessageId === msg.id ? stopSpeaking() : playMessageAudio(msg.text, msg.id)}
                                className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-bold transition-all ${speakingMessageId === msg.id ? 'bg-indigo-100 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400' : 'bg-slate-100 dark:bg-slate-800 text-slate-500 hover:text-indigo-600 dark:hover:text-indigo-400'}`}
                                disabled={isLoadingAudio && speakingMessageId !== msg.id}
                            >
                                {isLoadingAudio && speakingMessageId === msg.id ? (
                                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                ) : (
                                    speakingMessageId === msg.id ? <StopCircle className="w-3.5 h-3.5" /> : <Volume2 className="w-3.5 h-3.5" />
                                )}
                                {speakingMessageId === msg.id ? 'Arrêter' : 'Écouter'}
                            </button>
                        </div>
                    )}
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

      {/* Footer - FIXED POSITION */}
      <footer className="fixed bottom-0 left-0 w-full bg-white/95 dark:bg-[#131825]/95 backdrop-blur-lg border-t border-slate-200 dark:border-slate-800 safe-bottom z-30 shadow-2xl">
        <div className="max-w-3xl mx-auto p-4">
            
            {/* Enhanced Suggestions (Scrollable) */}
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
