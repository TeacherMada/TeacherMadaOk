
import React, { useState, useRef, useEffect, useMemo } from 'react';
import { Send, Phone, ArrowRight, X, Mic, Volume2, ArrowLeft, Sun, Moon, Zap, ChevronDown, Repeat, MessageCircle, Brain, Target, Star, Loader2, StopCircle, MicOff, Wifi, WifiOff, Lock } from 'lucide-react';
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

// Tone Generator for Ringing
const playRingingTone = (ctx: AudioContext) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    
    // Classic phone ring frequencies
    osc.frequency.value = 440; 
    osc.type = 'sine';
    
    // Modulation to sound like a ring (brrr-brrr)
    const now = ctx.currentTime;
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(0.5, now + 0.1);
    gain.gain.linearRampToValueAtTime(0.5, now + 2);
    gain.gain.linearRampToValueAtTime(0, now + 2.1);
    
    osc.start(now);
    osc.stop(now + 2.5); // 2.5s loop
};

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
  
  // Initialize Lesson Title from User Stats or Default
  const [currentLessonTitle, setCurrentLessonTitle] = useState(() => {
      const lastAiMessage = [...session.messages].reverse().find(m => m.role === 'model');
      if (lastAiMessage) {
          const match = lastAiMessage.text.match(/(?:Leçon|Lesson)\s+(\d+)/i);
          if (match) return `Leçon ${match[1]}`;
      }
      const lessonNum = (user.stats.lessonsCompleted || 0) + 1;
      return `Leçon ${lessonNum}`;
  });
  
  const [showTopMenu, setShowTopMenu] = useState(false);
  
  const [isDarkMode, setIsDarkMode] = useState(() => localStorage.getItem('tm_theme') === 'dark');
  
  // Audio Playback State (TTS)
  const [speakingMessageId, setSpeakingMessageId] = useState<string | null>(null);
  const [audioContext, setAudioContext] = useState<AudioContext | null>(null);
  const [currentSource, setCurrentSource] = useState<AudioBufferSourceNode | null>(null);
  const [isLoadingAudio, setIsLoadingAudio] = useState(false);

  // --- LIVE CALL STATE ---
  const [isVoiceMode, setIsVoiceMode] = useState(false);
  const [callStatus, setCallStatus] = useState<'idle' | 'ringing' | 'connecting' | 'connected' | 'reconnecting'>('idle');
  const [callDuration, setCallDuration] = useState(0);
  const [aiSpeaking, setAiSpeaking] = useState(false);
  
  // Refs for Live API
  const liveSessionRef = useRef<any>(null);
  const liveAudioContextRef = useRef<AudioContext | null>(null);
  const liveInputSourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const liveProcessorRef = useRef<ScriptProcessorNode | null>(null);
  const liveNextStartTimeRef = useRef<number>(0);
  const liveSourcesRef = useRef<Set<AudioBufferSourceNode>>(new Set());
  const ringIntervalRef = useRef<any>(null);

  // Invisible Tracking Metrics
  const callMetrics = useRef({
      userSpeakingTime: 0,
      aiSpeakingTime: 0,
      hesitationCount: 0,
      vocabularyScore: 0
  });

  const TEACHER_AVATAR = "https://i.ibb.co/B2XmRwmJ/logo.png";
  const MIN_LESSONS_FOR_CALL = 1;

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
              const ctx = new (window.AudioContext || (window as any).webkitAudioContext)({sampleRate: 24000});
              setAudioContext(ctx);
          }
      };
      window.addEventListener('click', initAudio, { once: true });
      return () => window.removeEventListener('click', initAudio);
  }, [audioContext]);

  // Voice Call Timer
  useEffect(() => {
    let interval: any;
    if (callStatus === 'connected') {
      interval = setInterval(() => {
          setCallDuration(p => p + 1);
          // Invisible metric tracking
          if (!aiSpeaking) callMetrics.current.userSpeakingTime += 1;
      }, 1000);
    } else {
      setCallDuration(0);
    }
    return () => clearInterval(interval);
  }, [callStatus, aiSpeaking]);

  // Lesson Title Update
  useEffect(() => {
      const lastAiMessage = [...messages].reverse().find(m => m.role === 'model');
      if (lastAiMessage) {
          const match = lastAiMessage.text.match(/(?:Leçon|Lesson)\s+(\d+)/i);
          if (match) {
              const newTitle = `Leçon ${match[1]}`;
              if (newTitle !== currentLessonTitle) setCurrentLessonTitle(newTitle);
          }
      }
  }, [messages, currentLessonTitle]);

  const formatTime = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m < 10 ? '0' : ''}${m}:${s < 10 ? '0' : ''}${s}`;
  };

  // --- TTS PLAYBACK ---
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
      if (!(await storageService.canRequest(user.id))) {
          notify("Crédits insuffisants pour le TTS.", "error");
          return;
      }
      stopSpeaking();
      setIsLoadingAudio(true);
      setSpeakingMessageId(id);

      try {
          const cleanText = text.replace(/[#*`_]/g, '').replace(/\[Leçon \d+\]/gi, '');
          const pcmBuffer = await generateSpeech(cleanText);
          const updatedUser = await storageService.getUserById(user.id);
          if (updatedUser) onUpdateUser(updatedUser);

          if (!pcmBuffer || !audioContext) throw new Error("Audio init failed");

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
          notify("Erreur lecture ou Crédits épuisés", "error");
          setSpeakingMessageId(null);
      } finally {
          setIsLoadingAudio(false);
      }
  };

  // --- LIVE CALL SIMULATION ---

  const handleVoiceModeClick = async () => {
      // 1. Check Condition
      if ((user.stats.lessonsCompleted || 0) < MIN_LESSONS_FOR_CALL) {
          notify(`Complétez ${MIN_LESSONS_FOR_CALL - (user.stats.lessonsCompleted || 0)} leçon(s) de plus pour débloquer l'appel !`, "error");
          return;
      }

      // 2. Check Credits
      const canReq = await storageService.canRequest(user.id);
      if (!canReq) {
          notify("Crédits insuffisants pour l'appel.", "error");
          onShowPayment();
          return;
      }

      // 3. Initialize Audio Context (User Gesture)
      const ctx = new (window.AudioContext || (window as any).webkitAudioContext)({sampleRate: 24000});
      if (ctx.state === 'suspended') await ctx.resume();
      liveAudioContextRef.current = ctx;
      liveNextStartTimeRef.current = ctx.currentTime;

      // 4. Start Ringing Phase
      setIsVoiceMode(true);
      setCallStatus('ringing');
      
      // Simulate Ringing Sound
      playRingingTone(ctx);
      ringIntervalRef.current = setInterval(() => playRingingTone(ctx), 3000);

      // 5. Connect after delay (Simulate pick up)
      setTimeout(() => {
          clearInterval(ringIntervalRef.current);
          startLiveSession();
      }, 4500); // 4.5s ringing
  };

  const startLiveSession = async () => {
      try {
          const apiKey = process.env.API_KEY || '';
          setCallStatus('connecting');
          const ai = new GoogleGenAI({ apiKey });
          
          let ctx = liveAudioContextRef.current;
          if (!ctx) {
              ctx = new (window.AudioContext || (window as any).webkitAudioContext)({sampleRate: 24000});
              liveAudioContextRef.current = ctx;
          }

          const sessionPromise = ai.live.connect({
              model: 'gemini-2.5-flash-native-audio-preview-12-2025',
              config: {
                  responseModalities: [Modality.AUDIO],
                  speechConfig: {
                      voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Zephyr' } }
                  },
                  systemInstruction: {
                      parts: [{ text: `
                      IDENTITY: You are "TeacherMada", a warm, human teacher located in Antananarivo, Madagascar. The administrator is Tsanta Fiderana.
                      
                      USER CONTEXT:
                      - Name: ${user.username}
                      - Target Language: ${user.preferences?.targetLanguage}
                      - Level: ${user.preferences?.level}
                      - Lessons Done: ${user.stats.lessonsCompleted}
                      
                      GOAL: Simulate a REAL phone call to practice speaking fluency.
                      
                      BEHAVIOR RULES (IMPORTANT):
                      1. **SPEAK FIRST**: When connection starts, IMMEDIATELY say "Allô !" followed by a warm intro in ${user.preferences?.targetLanguage}.
                      2. **ACT HUMAN**: Use filler words ("umm", "euh...", "alors"), laugh naturally ("haha"), take breaths. Do NOT sound robotic.
                      3. **PEDAGOGY**: Briefly review a concept from recent lessons, then ask a question. Correct major errors gently but focus on flow.
                      4. **ACCENT**: Speak with a native accent for the target language.
                      5. **EMOTION**: Be encouraging, patient, and dynamic.
                      
                      Start the call now.
                      ` }]
                  }
              },
              callbacks: {
                  onopen: async () => {
                      setCallStatus('connected');
                      
                      // TRIGGER AI TO SPEAK FIRST (Crucial)
                      sessionPromise.then(session => {
                          try {
                              // @ts-ignore
                              session.send({ parts: [{ text: "L'utilisateur a décroché le téléphone. Dis 'Allô !' immédiatement et présente-toi chaleureusement comme TeacherMada." }] }, true);
                          } catch(e) {}
                      });

                      // Microphone Setup
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
                              }).catch(err => {});
                          };
                          
                          source.connect(processor);
                          processor.connect(inputCtx.destination);
                          liveInputSourceRef.current = source;
                          liveProcessorRef.current = processor;
                      } catch (micErr) {
                          notify("Microphone inaccessible.", "error");
                          stopLiveSession();
                      }
                  },
                  onmessage: async (msg: LiveServerMessage) => {
                      if (msg.serverContent?.turnComplete) {
                          // Credit deduction logic
                          const currentUser = await storageService.getUserById(user.id);
                          if (currentUser && await storageService.canRequest(currentUser.id)) {
                              await storageService.consumeCredit(currentUser.id);
                              const updatedUser = await storageService.getUserById(currentUser.id);
                              if (updatedUser) onUpdateUser(updatedUser);
                          } else {
                              stopLiveSession();
                              notify("Crédits épuisés.", "error");
                              onShowPayment();
                          }
                      }

                      const audioData = msg.serverContent?.modelTurn?.parts?.[0]?.inlineData?.data;
                      if (audioData) {
                          setAiSpeaking(true);
                          callMetrics.current.aiSpeakingTime += 1; // Metric
                          
                          const bytes = base64ToUint8Array(audioData);
                          const buffer = pcmToAudioBuffer(bytes, ctx, 24000);
                          const source = ctx.createBufferSource();
                          source.buffer = buffer;
                          source.connect(ctx.destination);
                          
                          const now = ctx.currentTime;
                          if (liveNextStartTimeRef.current < now) liveNextStartTimeRef.current = now;
                          
                          const startAt = liveNextStartTimeRef.current;
                          source.start(startAt);
                          liveNextStartTimeRef.current = startAt + buffer.duration;
                          
                          liveSourcesRef.current.add(source);
                          source.onended = () => {
                              liveSourcesRef.current.delete(source);
                              if (liveSourcesRef.current.size === 0) setAiSpeaking(false);
                          };
                      }
                  },
                  onclose: () => { if (isVoiceMode) setCallStatus('idle'); },
                  onerror: (e) => console.error(e)
              }
          });
          liveSessionRef.current = sessionPromise;
      } catch (e) {
          notify("Echec de l'appel.", "error");
          setIsVoiceMode(false);
      }
  };

  const stopLiveSession = async () => {
      clearInterval(ringIntervalRef.current);
      if (liveInputSourceRef.current) {
          liveInputSourceRef.current.disconnect();
          liveInputSourceRef.current = null;
      }
      if (liveProcessorRef.current) {
          liveProcessorRef.current.disconnect();
          liveProcessorRef.current = null;
      }
      liveSourcesRef.current.forEach(s => s.stop());
      liveSourcesRef.current.clear();
      
      if (liveAudioContextRef.current && liveAudioContextRef.current.state !== 'closed') {
          try { await liveAudioContextRef.current.close(); } catch(e) {}
      }
      liveAudioContextRef.current = null;
      
      if (liveSessionRef.current) {
          try { (await liveSessionRef.current).close(); } catch(e) {}
          liveSessionRef.current = null;
      }
      setCallStatus('idle');
      setAiSpeaking(false);
  };

  useEffect(() => {
      return () => { if (!isVoiceMode) stopLiveSession(); };
  }, [isVoiceMode]);

  // --- PROGRESS ---
  const progressData = useMemo(() => {
      const levels = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2', 'HSK 1', 'HSK 2', 'HSK 3', 'HSK 4', 'HSK 5', 'HSK 6'];
      const currentLevel = user.preferences?.level || 'A1';
      const currentIndex = levels.indexOf(currentLevel);
      const nextLevel = currentIndex < levels.length - 1 ? levels[currentIndex + 1] : 'Expert';
      let lessonNum = 1;
      const match = currentLessonTitle.match(/(\d+)/);
      if (match) lessonNum = parseInt(match[1], 10);
      else lessonNum = (user.stats.lessonsCompleted || 0) + 1;
      const percentage = Math.min(lessonNum * 2, 100);
      return { percentage, nextLevel, currentLevel };
  }, [currentLessonTitle, user.preferences?.level, user.stats.lessonsCompleted]);

  // --- TEXT CHAT ---
  const processMessage = async (text: string, isAuto: boolean = false) => {
    if (isStreaming) return;
    const canProceed = await storageService.canRequest(user.id);
    if (!canProceed) {
        onShowPayment();
        return;
    }
    const userDisplayMsg = isAuto ? "Suivant" : text;
    const promptToSend = isAuto ? generateNextLessonPrompt(user) : text;
    const userMsg: ChatMessage = { id: Date.now().toString(), role: 'user', text: userDisplayMsg, timestamp: Date.now() };
    const newHistory = [...messages, userMsg];
    setMessages(newHistory);
    setInput('');
    setIsStreaming(true);

    try {
      const stream = sendMessageStream(promptToSend, user, messages);
      let fullText = "";
      const aiMsgId = (Date.now() + 1).toString();
      setMessages(prev => [...prev, { id: aiMsgId, role: 'model', text: "", timestamp: Date.now() }]);

      for await (const chunk of stream) {
        if (chunk) {
            fullText += chunk;
            setMessages(prev => prev.map(m => m.id === aiMsgId ? { ...m, text: fullText } : m));
            scrollRef.current?.scrollIntoView({ behavior: 'smooth' });
        }
      }
      
      const updatedUser = await storageService.getUserById(user.id);
      if (updatedUser) onUpdateUser(updatedUser);
      storageService.saveSession({ ...session, messages: [...newHistory, { id: aiMsgId, role: 'model', text: fullText, timestamp: Date.now() }], progress: (messages.length / 20) * 100 });
      if (isAuto) {
          const newStats = { ...user.stats, lessonsCompleted: (user.stats.lessonsCompleted || 0) + 1 };
          const updated = { ...(updatedUser || user), stats: newStats };
          await storageService.saveUserProfile(updated);
          onUpdateUser(updated);
      }
    } catch (e) {
      notify("Connexion instable.", "error");
    } finally {
      setIsStreaming(false);
    }
  };

  const handleSend = () => { if (input.trim()) processMessage(input); };
  useEffect(() => { scrollRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages, isStreaming]);

  // --- LIVE CALL UI ---
  if (isVoiceMode) {
      const isRinging = callStatus === 'ringing';
      return (
          <div className="fixed inset-0 z-[100] bg-slate-900 flex flex-col font-sans overflow-hidden">
              {/* Background Image/Blur */}
              <div className="absolute inset-0 bg-[url('https://images.unsplash.com/photo-1555445054-d166d149d751?q=80&w=2000')] bg-cover bg-center opacity-20 blur-xl scale-110"></div>
              
              <div className="relative z-10 flex flex-col h-full items-center justify-between p-8 safe-top safe-bottom">
                  {/* Top Info */}
                  <div className="text-center pt-8 space-y-2">
                      <div className="inline-flex items-center gap-2 bg-white/10 px-3 py-1 rounded-full backdrop-blur-md">
                          <Lock className="w-3 h-3 text-white/70" />
                          <span className="text-[10px] text-white/70 font-bold uppercase tracking-wider">Sécurisé</span>
                      </div>
                      <h2 className="text-3xl font-black text-white tracking-tight">TeacherMada</h2>
                      <p className="text-indigo-200 text-sm font-medium animate-pulse">
                          {isRinging ? "Appel entrant..." : formatTime(callDuration)}
                      </p>
                  </div>

                  {/* Avatar / Visualizer */}
                  <div className="relative">
                      {isRinging && (
                          <>
                            <div className="absolute inset-0 bg-white/10 rounded-full animate-ping blur-2xl delay-100"></div>
                            <div className="absolute inset-0 bg-white/5 rounded-full animate-ping blur-3xl delay-300 scale-150"></div>
                          </>
                      )}
                      
                      {/* Active Speaking Indicator */}
                      {!isRinging && aiSpeaking && (
                          <div className="absolute inset-0 border-4 border-emerald-400/50 rounded-full animate-pulse scale-110"></div>
                      )}

                      <div className="w-48 h-48 rounded-full bg-gradient-to-br from-slate-800 to-slate-900 border-4 border-white/10 shadow-2xl flex items-center justify-center relative overflow-hidden">
                          <img src={TEACHER_AVATAR} className={`w-full h-full object-cover p-6 ${isRinging ? 'animate-bounce-slight' : ''}`} alt="Teacher" />
                      </div>
                  </div>

                  {/* Context Info */}
                  {!isRinging && (
                      <div className="bg-white/10 backdrop-blur-md rounded-2xl p-4 w-full max-w-xs border border-white/5 text-center">
                          <p className="text-white text-sm font-medium leading-relaxed">
                              "Je suis ton prof à Tana. On discute du cours ?"
                          </p>
                          <div className="mt-2 flex justify-center gap-1">
                              <span className="w-1.5 h-1.5 bg-emerald-400 rounded-full animate-bounce"></span>
                              <span className="w-1.5 h-1.5 bg-emerald-400 rounded-full animate-bounce delay-100"></span>
                              <span className="w-1.5 h-1.5 bg-emerald-400 rounded-full animate-bounce delay-200"></span>
                          </div>
                      </div>
                  )}

                  {/* Actions */}
                  <div className="grid grid-cols-3 gap-8 w-full max-w-xs items-center mb-8">
                      {!isRinging && (
                          <>
                            <button className="flex flex-col items-center gap-2 group">
                                <div className="w-14 h-14 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center backdrop-blur-md transition-all">
                                    <MicOff className="w-6 h-6 text-white" />
                                </div>
                                <span className="text-[10px] text-white/50 font-bold uppercase">Mute</span>
                            </button>
                            <button onClick={() => { setIsVoiceMode(false); stopLiveSession(); }} className="flex flex-col items-center gap-2 group transform hover:scale-105 transition-transform">
                                <div className="w-20 h-20 rounded-full bg-red-500 hover:bg-red-600 flex items-center justify-center shadow-lg shadow-red-500/40 border-4 border-white/10">
                                    <Phone className="w-8 h-8 text-white fill-white rotate-[135deg]" />
                                </div>
                            </button>
                            <button className="flex flex-col items-center gap-2 group">
                                <div className="w-14 h-14 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center backdrop-blur-md transition-all">
                                    <Volume2 className="w-6 h-6 text-white" />
                                </div>
                                <span className="text-[10px] text-white/50 font-bold uppercase">Speaker</span>
                            </button>
                          </>
                      )}
                      
                      {isRinging && (
                          <div className="col-span-3 flex justify-center">
                              <button onClick={() => { setIsVoiceMode(false); stopLiveSession(); }} className="flex flex-col items-center gap-2 group transform hover:scale-105 transition-transform">
                                <div className="w-20 h-20 rounded-full bg-red-500 hover:bg-red-600 flex items-center justify-center shadow-lg shadow-red-500/40 border-4 border-white/10">
                                    <Phone className="w-8 h-8 text-white fill-white rotate-[135deg]" />
                                </div>
                                <span className="text-xs text-white font-bold">Refuser</span>
                            </button>
                          </div>
                      )}
                  </div>
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
                            
                            {/* LOCKED VOICE CALL BUTTON */}
                            <button 
                                onClick={handleVoiceModeClick} 
                                className={`w-full text-left px-4 py-3 flex items-center gap-2 text-sm font-bold transition-colors ${
                                    (user.stats.lessonsCompleted || 0) >= MIN_LESSONS_FOR_CALL 
                                    ? 'hover:bg-slate-50 dark:hover:bg-slate-700/50 text-slate-700 dark:text-slate-200' 
                                    : 'opacity-50 cursor-not-allowed bg-slate-50 dark:bg-slate-800/50 text-slate-400'
                                }`}
                            >
                                <Phone className="w-4 h-4 text-purple-500" /> 
                                Appel Vocal
                                {(user.stats.lessonsCompleted || 0) < MIN_LESSONS_FOR_CALL && <Lock className="w-3 h-3 ml-auto text-slate-400"/>}
                            </button>

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
            
            {/* SMART PROGRESS STATS - Mobile First Layout */}
            {!input && messages.length > 0 && !isStreaming && (
                <div className="mb-3 px-1 animate-fade-in">
                    <div className="flex justify-between items-center mb-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                        <span className="flex-1 text-left">{progressData.currentLevel}</span>
                        <div className="flex items-center gap-1">
                            <Star className="w-3 h-3 text-yellow-400 fill-yellow-400" />
                            <span className="text-indigo-600 dark:text-indigo-400">{progressData.percentage}%</span>
                        </div>
                        <span className="flex-1 text-right">{progressData.nextLevel}</span>
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
                {/* LOCKED PHONE BUTTON */}
                <button 
                    onClick={handleVoiceModeClick}
                    className={`h-10 w-10 shrink-0 rounded-full flex items-center justify-center transition-all ${
                        (user.stats.lessonsCompleted || 0) >= MIN_LESSONS_FOR_CALL 
                        ? 'bg-slate-200 dark:bg-slate-700 text-slate-500 dark:text-slate-400 hover:text-indigo-600 hover:bg-indigo-100 dark:hover:bg-indigo-900/30' 
                        : 'bg-slate-100 dark:bg-slate-800 text-slate-300 dark:text-slate-600 cursor-not-allowed'
                    }`}
                >
                    {(user.stats.lessonsCompleted || 0) >= MIN_LESSONS_FOR_CALL ? <Phone className="w-5 h-5" /> : <Lock className="w-4 h-4"/>}
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
