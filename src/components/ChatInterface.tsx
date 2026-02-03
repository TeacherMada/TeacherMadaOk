
import React, { useState, useRef, useEffect, useMemo } from 'react';
import { Send, Phone, ArrowRight, X, Mic, Volume2, ArrowLeft, Sun, Moon, Zap, ChevronDown, Repeat, MessageCircle, Brain, Target, Star, Loader2, StopCircle, MicOff, WifiOff } from 'lucide-react';
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
  const [currentLessonTitle, setCurrentLessonTitle] = useState(`Leçon ${(user.stats.lessonsCompleted || 0) + 1}`);
  const [showTopMenu, setShowTopMenu] = useState(false);
  
  const [isDarkMode, setIsDarkMode] = useState(() => localStorage.getItem('tm_theme') === 'dark');
  
  // Audio Playback State
  const [speakingMessageId, setSpeakingMessageId] = useState<string | null>(null);
  const [audioContext, setAudioContext] = useState<AudioContext | null>(null);
  const [currentSource, setCurrentSource] = useState<AudioBufferSourceNode | null>(null);
  const [isLoadingAudio, setIsLoadingAudio] = useState(false);

  // Live API State
  const [isVoiceMode, setIsVoiceMode] = useState(false);
  const [voiceStatus, setVoiceStatus] = useState<'idle' | 'listening' | 'speaking' | 'connecting' | 'reconnecting'>('idle');
  const [callDuration, setCallDuration] = useState(0);
  const liveSessionRef = useRef<any>(null);
  const liveAudioContextRef = useRef<AudioContext | null>(null);
  const liveInputSourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const liveProcessorRef = useRef<ScriptProcessorNode | null>(null);
  const liveNextStartTimeRef = useRef<number>(0);
  const liveSourcesRef = useRef<Set<AudioBufferSourceNode>>(new Set());

  // Logo URL for avatar
  const TEACHER_AVATAR = "https://i.ibb.co/B2XmRwmJ/logo.png";

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

  // Lesson Number Sync from AI Messages
  useEffect(() => {
      const lastAiMessage = [...messages].reverse().find(m => m.role === 'model');
      if (lastAiMessage) {
          const match = lastAiMessage.text.match(/\[Leçon (\d+)\]/i);
          if (match) {
              setCurrentLessonTitle(`Leçon ${match[1]}`);
          }
      }
  }, [messages]);

  // Format Time
  const formatTime = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m < 10 ? '0' : ''}${m}:${s < 10 ? '0' : ''}${s}`;
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
            .replace(/\[Leçon \d+\]/gi, '')
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
          const apiKey = process.env.API_KEY || '';
          if (!apiKey) {
              throw new Error("Clé API manquante");
          }

          setVoiceStatus('connecting');
          const ai = new GoogleGenAI({ apiKey });
          
          // Audio Context for Live Session (Input 16k, Output 24k)
          const ctx = new (window.AudioContext || (window as any).webkitAudioContext)({sampleRate: 24000});
          // Fix for autoplay policy: Ensure we resume context on user gesture (Voice button click)
          if (ctx.state === 'suspended') {
              await ctx.resume();
          }
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
                      parts: [{ text: `
                      ACT AS: A friendly language teacher on a phone call with your student ${user.username}.
                      TARGET LANGUAGE: ${user.preferences?.targetLanguage}.
                      LEVEL: ${user.preferences?.level}.
                      GOAL: Practice speaking naturally. Correct pronunciation or grammar gently without interrupting the flow too much.
                      IMPORTANT: 
                      - Do NOT act like a robot. Be human, warm, and engaging.
                      - Keep responses concise (like a real phone chat).
                      - Ask follow-up questions to keep the student talking.
                      ` }]
                  }
              },
              callbacks: {
                  onopen: async () => {
                      setVoiceStatus('listening');
                      // Start Microphone Streaming
                      try {
                          const stream = await navigator.mediaDevices.getUserMedia({ audio: {
                              sampleRate: 16000,
                              channelCount: 1,
                              echoCancellation: true,
                              noiseSuppression: true,
                              autoGainControl: true
                          }});
                          
                          const inputCtx = new (window.AudioContext || (window as any).webkitAudioContext)({sampleRate: 16000});
                          const source = inputCtx.createMediaStreamSource(stream);
                          const processor = inputCtx.createScriptProcessor(4096, 1, 1);
                          
                          processor.onaudioprocess = (e) => {
                              const inputData = e.inputBuffer.getChannelData(0);
                              const pcmBlob = createBlob(inputData);
                              sessionPromise.then(session => {
                                  session.sendRealtimeInput({ media: pcmBlob });
                              }).catch(err => {
                                  console.error("Failed to send audio chunk", err);
                              });
                          };
                          
                          source.connect(processor);
                          processor.connect(inputCtx.destination);
                          
                          liveInputSourceRef.current = source;
                          liveProcessorRef.current = processor;
                      } catch (micErr) {
                          console.error("Microphone Access Error", micErr);
                          notify("Microphone inaccessible.", "error");
                          stopLiveSession();
                      }
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
                          
                          // Gapless scheduling logic improved for stability
                          const now = ctx.currentTime;
                          if (liveNextStartTimeRef.current < now) {
                              liveNextStartTimeRef.current = now;
                          }
                          
                          const startAt = liveNextStartTimeRef.current;
                          source.start(startAt);
                          liveNextStartTimeRef.current = startAt + buffer.duration;
                          
                          liveSourcesRef.current.add(source);
                          source.onended = () => {
                              liveSourcesRef.current.delete(source);
                              if (liveSourcesRef.current.size === 0) setVoiceStatus('listening');
                          };
                      }
                      
                      if (msg.serverContent?.interrupted) {
                          liveSourcesRef.current.forEach(s => s.stop());
                          liveSourcesRef.current.clear();
                          liveNextStartTimeRef.current = ctx.currentTime;
                          setVoiceStatus('listening');
                      }
                  },
                  onclose: () => {
                      setVoiceStatus('idle');
                      if (isVoiceMode) {
                          // Only notify if we didn't close it intentionally
                          notify("Appel terminé.", "info");
                          setIsVoiceMode(false);
                      }
                  },
                  onerror: (e) => {
                      console.error("Live Error", e);
                      // Don't kill immediately on minor errors, but notify
                      notify("Instabilité réseau...", "error");
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
      
      if (liveAudioContextRef.current) {
          try { await liveAudioContextRef.current.close(); } catch(e) {}
      }
      
      // Close Session
      if (liveSessionRef.current) {
          try {
              const session = await liveSessionRef.current;
              session.close();
          } catch(e) {}
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

  // Progress Calculation
  const progressData = useMemo(() => {
      const levels = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2', 'HSK 1', 'HSK 2', 'HSK 3', 'HSK 4', 'HSK 5', 'HSK 6'];
      const currentLevel = user.preferences?.level || 'A1';
      const currentIndex = levels.indexOf(currentLevel);
      const nextLevel = currentIndex < levels.length - 1 ? levels[currentIndex + 1] : 'Expert';
      
      const points = (user.stats.lessonsCompleted * 10) + (user.stats.exercisesCompleted * 5) + (user.stats.dialoguesCompleted * 8);
      const threshold = 500;
      const currentPoints = points % threshold;
      const percentage = Math.min(Math.round((currentPoints / threshold) * 100), 100);
      
      return { percentage, nextLevel };
  }, [user.stats, user.preferences?.level]);

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

    const userDisplayMsg = isAuto ? "Suivant" : text;
    const promptToSend = isAuto ? generateNextLessonPrompt(user) : text;

    const userMsg: ChatMessage = { 
        id: Date.now().toString(), 
        role: 'user', 
        text: userDisplayMsg, 
        timestamp: Date.now() 
    };
    
    const newHistory = [...messages, userMsg];
    setMessages(newHistory);
    setInput('');
    setIsStreaming(true);

    try {
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
      
      // Update User Stats (Simplified)
      if (isAuto) {
          // Increment Lesson Count logic could go here or parsing from AI message
          const newStats = { ...user.stats, lessonsCompleted: (user.stats.lessonsCompleted || 0) + 1 };
          const updated = { ...user, stats: newStats };
          await storageService.saveUserProfile(updated);
          onUpdateUser(updated);
      }

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

  // Render Live Call Overlay
  if (isVoiceMode) {
      return (
          <div className="fixed inset-0 z-[100] bg-slate-900/90 backdrop-blur-3xl text-white flex flex-col items-center justify-between p-6 animate-fade-in font-sans overflow-hidden">
              {/* Top Controls */}
              <div className="w-full flex justify-between items-center z-10 pt-4 px-2">
                  <button onClick={() => setIsVoiceMode(false)} className="p-3 bg-white/10 rounded-full hover:bg-white/20 backdrop-blur-md transition-all">
                      <ChevronDown className="w-6 h-6" />
                  </button>
                  <div className="flex flex-col items-center">
                      <span className="text-xs font-bold uppercase tracking-widest text-slate-300">TeacherMada</span>
                      <span className="font-mono text-sm opacity-70">{formatTime(callDuration)}</span>
                  </div>
                  <div className="w-12">
                      {voiceStatus === 'reconnecting' && <WifiOff className="w-5 h-5 text-red-400 animate-pulse"/>}
                  </div>
              </div>

              {/* Center Avatar & Status */}
              <div className="flex flex-col items-center justify-center gap-8 w-full z-10 flex-1 relative">
                  
                  {/* Status Indicator */}
                  <div className="h-6">
                      {voiceStatus === 'listening' && <p className="text-indigo-300 text-sm font-bold animate-pulse tracking-wide">J'écoute...</p>}
                      {voiceStatus === 'speaking' && <p className="text-emerald-300 text-sm font-bold tracking-wide">Teacher parle...</p>}
                      {voiceStatus === 'connecting' && <p className="text-slate-400 text-sm font-medium animate-pulse">Connexion en cours...</p>}
                      {voiceStatus === 'reconnecting' && <p className="text-red-400 text-sm font-bold animate-pulse">Reconnexion...</p>}
                      {voiceStatus === 'idle' && <p className="text-slate-400 text-sm font-medium">En attente...</p>}
                  </div>

                  {/* Pulsing Avatar Container */}
                  <div className="relative">
                      {voiceStatus === 'speaking' && (
                          <>
                            <div className="absolute inset-0 bg-emerald-500/20 rounded-full animate-ping blur-xl"></div>
                            <div className="absolute inset-0 bg-emerald-500/10 rounded-full animate-pulse delay-100 scale-125"></div>
                          </>
                      )}
                      {voiceStatus === 'listening' && (
                          <div className="absolute inset-0 bg-indigo-500/20 rounded-full animate-pulse scale-110 blur-xl"></div>
                      )}
                      {voiceStatus === 'reconnecting' && (
                          <div className="absolute inset-0 bg-red-500/20 rounded-full animate-ping blur-xl"></div>
                      )}

                      <div className="relative w-40 h-40 md:w-56 md:h-56 rounded-full p-2 bg-gradient-to-b from-slate-700 to-slate-900 shadow-2xl flex items-center justify-center border-4 border-slate-700/50 overflow-hidden">
                          <img src={TEACHER_AVATAR} className="w-full h-full object-cover rounded-full p-4" alt="Teacher AI" />
                      </div>
                  </div>

                  <div className="text-center space-y-1">
                      <h2 className="text-2xl font-bold text-white tracking-tight">Appel en cours</h2>
                      <p className="text-slate-400 font-medium text-sm">{user.preferences?.targetLanguage} • {user.preferences?.level}</p>
                  </div>
              </div>

              {/* Bottom Controls */}
              <div className="w-full max-w-sm grid grid-cols-3 gap-6 mb-8 z-10 items-center justify-items-center">
                  <button className="flex flex-col items-center gap-2 group opacity-50 hover:opacity-100 transition-opacity">
                      <div className="w-14 h-14 rounded-full bg-slate-800 flex items-center justify-center text-white">
                          <Volume2 className="w-6 h-6" />
                      </div>
                      <span className="text-[10px] uppercase font-bold tracking-wider">Speaker</span>
                  </button>

                  <button onClick={() => setIsVoiceMode(false)} className="flex flex-col items-center gap-2 group transform hover:scale-105 transition-transform">
                      <div className="w-20 h-20 rounded-full bg-red-500 hover:bg-red-600 flex items-center justify-center shadow-lg shadow-red-500/40 border-4 border-slate-900">
                          <Phone className="w-8 h-8 text-white fill-white rotate-[135deg]" />
                      </div>
                  </button>

                  <button className="flex flex-col items-center gap-2 group opacity-50 hover:opacity-100 transition-opacity">
                      <div className="w-14 h-14 rounded-full bg-slate-800 flex items-center justify-center text-white">
                          <MicOff className="w-6 h-6" />
                      </div>
                      <span className="text-[10px] uppercase font-bold tracking-wider">Mute</span>
                  </button>
              </div>
          </div>
      );
  }

  return (
    <div className="flex flex-col h-[100dvh] bg-[#F0F2F5] dark:bg-[#0B0F19] font-sans transition-colors duration-300 overflow-hidden" onClick={() => setShowTopMenu(false)}>
      
      {/* --- FIXED HEADER --- */}
      <header className="fixed top-0 left-0 w-full z-30 bg-white/80 dark:bg-[#131825]/90 backdrop-blur-md border-b border-slate-200 dark:border-slate-800 shadow-sm safe-top transition-colors">
        <div className="max-w-5xl mx-auto px-4 h-16 flex items-center justify-between">
            <div className="flex items-center gap-3 flex-1">
                <button onClick={onExit} className="p-2 -ml-2 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-full transition-colors shrink-0">
                    <ArrowLeft className="w-6 h-6" />
                </button>
                <div className="relative">
                    <button 
                        onClick={(e) => { e.stopPropagation(); setShowTopMenu(!showTopMenu); }}
                        className="flex items-center gap-1.5 bg-slate-100 dark:bg-slate-800 px-3 py-1.5 rounded-full border border-slate-200 dark:border-slate-700 shadow-sm hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
                    >
                        <span className="text-xl leading-none">{user.preferences?.targetLanguage?.split(' ')[1] || '🇨🇵'}</span>
                        <div className="h-4 w-px bg-slate-300 dark:bg-slate-600 mx-1"></div>
                        <span className="text-xs font-black text-indigo-600 dark:text-indigo-400 uppercase">{user.preferences?.level}</span>
                        <ChevronDown className={`w-3 h-3 text-slate-400 transition-transform ${showTopMenu ? 'rotate-180' : ''}`} />
                    </button>
                    {showTopMenu && (
                        <div className="absolute top-full left-0 mt-2 w-48 bg-white dark:bg-slate-800 rounded-xl shadow-xl border border-slate-100 dark:border-slate-700 overflow-hidden z-50 animate-fade-in-up">
                            <button onClick={onStartPractice} className="w-full text-left px-4 py-3 hover:bg-slate-50 dark:hover:bg-slate-700/50 flex items-center gap-2 text-sm font-bold text-slate-700 dark:text-slate-200"><MessageCircle className="w-4 h-4 text-indigo-500" /> Dialogue</button>
                            <button onClick={onStartExercise} className="w-full text-left px-4 py-3 hover:bg-slate-50 dark:hover:bg-slate-700/50 flex items-center gap-2 text-sm font-bold text-slate-700 dark:text-slate-200"><Brain className="w-4 h-4 text-emerald-500" /> Exercices</button>
                            <button onClick={() => setIsVoiceMode(true)} className="w-full text-left px-4 py-3 hover:bg-slate-50 dark:hover:bg-slate-700/50 flex items-center gap-2 text-sm font-bold text-slate-700 dark:text-slate-200"><Phone className="w-4 h-4 text-purple-500" /> Appel Vocal</button>
                            <div className="h-px bg-slate-100 dark:bg-slate-700 mx-2 my-1"></div>
                            <button onClick={onExit} className="w-full text-left px-4 py-3 hover:bg-red-50 dark:hover:bg-red-900/10 flex items-center gap-2 text-xs font-bold text-red-500"><Repeat className="w-3.5 h-3.5" /> Changer Cours</button>
                        </div>
                    )}
                </div>
            </div>
            <div className="flex flex-col items-center justify-center shrink-0">
                <h1 className="text-[10px] font-black text-slate-400 uppercase tracking-widest leading-tight">{currentLessonTitle}</h1>
                <button onClick={onShowPayment} className="flex items-center gap-1 mt-0.5 hover:scale-105 transition-transform">
                    <Zap className="w-3.5 h-3.5 text-amber-500 fill-amber-500" />
                    <span className="text-sm font-black text-amber-500">{user.freeUsage.count < 3 ? `${3 - user.freeUsage.count} Free` : user.credits}</span>
                </button>
            </div>
            <div className="flex items-center justify-end gap-2 flex-1">
                <button onClick={toggleTheme} className="p-2 text-slate-400 hover:text-indigo-600 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors">{isDarkMode ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}</button>
                <button onClick={onShowProfile} className="relative group flex items-center gap-2">
                    <div className="hidden sm:flex flex-col items-end"><span className="text-xs font-bold text-slate-700 dark:text-slate-200">{user.vocabulary.length} Mots</span></div>
                    <img src={`https://api.dicebear.com/9.x/micah/svg?seed=${user.username}`} alt="User" className="w-9 h-9 rounded-full bg-slate-200 dark:bg-slate-800 shadow-md group-hover:scale-105 transition-transform border border-white dark:border-slate-600"/>
                </button>
            </div>
        </div>
      </header>

      {/* Chat Area */}
      <main className="flex-1 overflow-y-auto pt-16 pb-32 px-4 md:px-6 space-y-6 scrollbar-hide relative">
        <div className="max-w-3xl mx-auto space-y-6">
            {messages.length === 0 && (
                <div className="flex flex-col items-center justify-center py-20 opacity-60">
                    <div className="w-24 h-24 bg-white dark:bg-slate-800 rounded-[2rem] flex items-center justify-center mb-6 shadow-xl border border-slate-100 dark:border-slate-700">
                        <img src="https://i.ibb.co/B2XmRwmJ/logo.png" className="w-14 h-14 object-contain" />
                    </div>
                    <h3 className="text-xl font-bold text-slate-800 dark:text-white mb-2">Bonjour, {user.username} !</h3>
                    <p className="text-slate-500 dark:text-slate-400 text-sm text-center max-w-xs">Prêt pour {currentLessonTitle} en {user.preferences?.targetLanguage} ?</p>
                    <div className="flex flex-wrap justify-center gap-2 mt-6">
                        <button onClick={() => processMessage("Commence la leçon")} className="px-4 py-2 bg-indigo-600 text-white rounded-full text-xs font-bold shadow-md hover:bg-indigo-700 transition-colors">🚀 Démarrer {currentLessonTitle}</button>
                    </div>
                </div>
            )}
            
            {messages.map((msg, idx) => (
            <div key={msg.id || idx} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'} animate-slide-up group`}>
                {msg.role === 'model' && (
                    <div className="w-10 h-10 rounded-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 flex items-center justify-center mr-3 mt-1 shrink-0 overflow-hidden shadow-sm">
                        <img src={TEACHER_AVATAR} className="w-full h-full object-cover p-1" />
                    </div>
                )}
                
                <div className={`max-w-[90%] md:max-w-[80%] p-5 rounded-2xl text-sm leading-relaxed shadow-sm transition-all duration-200 ${
                    msg.role === 'user' 
                    ? 'bg-indigo-600 text-white rounded-tr-sm shadow-indigo-500/20' 
                    : 'bg-white dark:bg-[#131825] text-slate-800 dark:text-slate-200 border border-slate-200 dark:border-slate-800 rounded-tl-sm'
                }`}>
                    <MarkdownRenderer 
                        content={msg.text.replace(/\[Leçon \d+\]/g, '')} 
                        onPlayAudio={(text) => playMessageAudio(text, msg.id + text)} 
                    />
                    
                    {msg.role === 'model' && (
                        <div className="mt-3 pt-3 border-t border-slate-100 dark:border-slate-800 flex justify-end">
                            <button 
                                onClick={() => speakingMessageId === msg.id ? stopSpeaking() : playMessageAudio(msg.text, msg.id)}
                                className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-bold transition-all ${speakingMessageId === msg.id ? 'bg-indigo-100 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400' : 'bg-slate-100 dark:bg-slate-800 text-slate-500 hover:text-indigo-600 dark:hover:text-indigo-400'}`}
                                disabled={isLoadingAudio && speakingMessageId !== msg.id}
                            >
                                {isLoadingAudio && speakingMessageId === msg.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : speakingMessageId === msg.id ? <StopCircle className="w-3.5 h-3.5" /> : <Volume2 className="w-3.5 h-3.5" />}
                                {speakingMessageId === msg.id ? 'Arrêter' : 'Écouter'}
                            </button>
                        </div>
                    )}
                </div>
                
                {msg.role === 'user' && (
                    <div className="w-8 h-8 rounded-full bg-slate-200 dark:bg-slate-700 ml-3 mt-1 shrink-0 overflow-hidden shadow-sm border border-white dark:border-slate-600">
                        <img src={`https://api.dicebear.com/9.x/micah/svg?seed=${user.username}`} className="w-full h-full object-cover" />
                    </div>
                )}
            </div>
            ))}
            
            {isStreaming && (
                <div className="flex justify-start">
                    <div className="w-10 h-10 mr-3"></div>
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
            
            {/* SMART PROGRESS STATS */}
            {!input && messages.length > 0 && !isStreaming && (
                <div className="mb-3 px-1 animate-fade-in">
                    <div className="flex justify-between items-center mb-1.5">
                        <div className="flex items-center gap-1.5">
                            <Target className="w-3.5 h-3.5 text-indigo-500" />
                            <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                                Progression vers {progressData.nextLevel}
                            </span>
                        </div>
                        <div className="flex items-center gap-1">
                            <Star className="w-3 h-3 text-yellow-400 fill-yellow-400" />
                            <span className="text-xs font-black text-indigo-600 dark:text-indigo-400">{progressData.percentage}%</span>
                        </div>
                    </div>
                    <div className="h-1.5 w-full bg-slate-100 dark:bg-slate-700 rounded-full overflow-hidden">
                        <div 
                            className="h-full bg-gradient-to-r from-indigo-500 via-purple-500 to-indigo-500 bg-[length:200%_100%] animate-gradient"
                            style={{ width: `${progressData.percentage}%` }}
                        ></div>
                    </div>
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
