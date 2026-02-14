
import React, { useState, useEffect, useRef } from 'react';
import { X, Mic, MicOff, AlertTriangle, Phone, Activity, Wifi, Volume2, User, Play, Loader2 } from 'lucide-react';
import { UserProfile } from '../types';
import { GoogleGenAI, Modality } from '@google/genai';
import { storageService } from '../services/storageService';

interface LiveTeacherProps {
  user: UserProfile;
  onClose: () => void;
  onUpdateUser: (u: UserProfile) => void;
  notify: (m: string, t?: string) => void;
  onShowPayment: () => void;
}

// --- CONFIGURATION ---
const LIVE_MODEL = 'gemini-2.5-flash-native-audio-preview-12-2025';
const CREDIT_COST_PER_MINUTE = 5;
const OUTPUT_SAMPLE_RATE = 24000; // Native Gemini Output

// Helper: Get API Keys
const getApiKeys = () => {
    const rawKey = process.env.API_KEY || "";
    return rawKey.split(',').map(k => k.trim()).filter(k => k.length >= 10);
};

// --- AUDIO UTILS ---

// PCM Base64 -> AudioBuffer
async function base64ToAudioBuffer(base64: string, ctx: AudioContext): Promise<AudioBuffer> {
    const binaryString = atob(base64);
    const len = binaryString.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
        bytes[i] = binaryString.charCodeAt(i);
    }
    const pcm16 = new Int16Array(bytes.buffer);
    const float32 = new Float32Array(pcm16.length);
    for (let i = 0; i < pcm16.length; i++) {
        float32[i] = pcm16[i] / 32768.0; 
    }
    
    const buffer = ctx.createBuffer(1, float32.length, OUTPUT_SAMPLE_RATE);
    buffer.copyToChannel(float32, 0);
    return buffer;
}

// Float32 -> PCM16 Base64
function floatTo16BitPCM(input: Float32Array) {
    const output = new Int16Array(input.length);
    for (let i = 0; i < input.length; i++) {
        const s = Math.max(-1, Math.min(1, input[i]));
        output[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
    }
    
    const bytes = new Uint8Array(output.buffer);
    let binary = '';
    const len = bytes.byteLength;
    const chunk = 8192;
    for (let i = 0; i < len; i += chunk) {
        binary += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, Math.min(i + chunk, len))));
    }
    return btoa(binary);
}

const LiveTeacher: React.FC<LiveTeacherProps> = ({ user, onClose, onUpdateUser, notify, onShowPayment }) => {
  // State
  const [status, setStatus] = useState<'setup' | 'connecting' | 'connected' | 'error'>('setup');
  const [subStatus, setSubStatus] = useState(''); 
  const [duration, setDuration] = useState(0);
  const [audioLevel, setAudioLevel] = useState(0);
  const [isMicMuted, setIsMicMuted] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  
  // Visualizer
  const [bars, setBars] = useState<number[]>([10, 15, 10, 20, 10]);

  // Refs
  const audioCtxRef = useRef<AudioContext | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const liveSessionRef = useRef<any>(null);
  const nextStartTimeRef = useRef(0);
  const mountedRef = useRef(true);

  const targetLang = user.preferences?.targetLanguage || 'Anglais';
  const level = user.preferences?.level || 'Débutant';

  // --- LIFECYCLE ---

  useEffect(() => {
      mountedRef.current = true;
      return () => { 
          mountedRef.current = false; 
          fullCleanup();
      };
  }, []);

  useEffect(() => {
      let interval: any;
      if (status === 'connected') {
          interval = setInterval(() => {
              setDuration(d => {
                  const newD = d + 1;
                  if (newD > 0 && newD % 60 === 0) handleBilling();
                  return newD;
              });
          }, 1000);
      }
      return () => clearInterval(interval);
  }, [status]);

  // Visualizer Loop
  useEffect(() => {
      let animFrame: number;
      const animate = () => {
          if (status === 'connected') {
              setBars(prev => prev.map(() => Math.max(4, Math.random() * (audioLevel + 10))));
          }
          animFrame = requestAnimationFrame(animate);
      };
      animate();
      return () => cancelAnimationFrame(animFrame);
  }, [status, audioLevel]);

  const handleBilling = async () => {
      const success = await storageService.deductCredits(user.id, CREDIT_COST_PER_MINUTE);
      if (success) {
          const updated = await storageService.getUserById(user.id);
          if (updated) onUpdateUser(updated);
          notify(`-5 Crédits`, 'info');
      } else {
          notify("Crédits épuisés.", 'error');
          stopSession(); 
      }
  };

  const stopSession = () => {
      fullCleanup();
      if (mountedRef.current) onClose();
  };

  const fullCleanup = () => {
      if (liveSessionRef.current) {
          try { liveSessionRef.current.close(); } catch(e){}
          liveSessionRef.current = null;
      }
      if (processorRef.current) {
          try { processorRef.current.disconnect(); } catch(e){}
          processorRef.current = null;
      }
      if (mediaStreamRef.current) {
          mediaStreamRef.current.getTracks().forEach(t => t.stop());
          mediaStreamRef.current = null;
      }
      if (audioCtxRef.current) {
          audioCtxRef.current.close().catch(() => {});
          audioCtxRef.current = null;
      }
  };

  // --- CONNECTION ---

  const handleStart = async () => {
      if (!(await storageService.canRequest(user.id, CREDIT_COST_PER_MINUTE))) {
          notify("Crédits insuffisants (min 5).", 'error');
          onShowPayment();
          return;
      }

      setStatus('connecting');
      setSubStatus("Initialisation audio...");
      setErrorMessage('');

      try {
          const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
          const ctx = new AudioContextClass({ sampleRate: OUTPUT_SAMPLE_RATE });
          await ctx.resume();
          audioCtxRef.current = ctx;
          nextStartTimeRef.current = ctx.currentTime;

          await storageService.deductCredits(user.id, CREDIT_COST_PER_MINUTE);
          
          setSubStatus("Connexion IA...");
          await connectWithRotation(ctx);

      } catch (e: any) {
          console.error("Start Error", e);
          setStatus('error');
          setErrorMessage(e.message || "Erreur technique");
          fullCleanup();
      }
  };

  const connectWithRotation = async (ctx: AudioContext, retryIndex = 0) => {
      const keys = getApiKeys();
      if (keys.length === 0) throw new Error("Clé API manquante.");
      
      const apiKey = keys[retryIndex % keys.length];
      if (retryIndex >= keys.length * 2) throw new Error("Serveurs occupés.");

      try {
          const ai = new GoogleGenAI({ apiKey });
          
          // Instruction stricte pour forcer l'IA à parler
          const sysPrompt = `Act as a language teacher for ${targetLang} (${level}). 
          IMPORTANT: Speak IMMEDIATELY. Say a short greeting and ask a simple question to start.
          Keep responses concise (1-2 sentences).`;

          const session = await ai.live.connect({
              model: LIVE_MODEL,
              config: {
                  responseModalities: [Modality.AUDIO],
                  systemInstruction: { parts: [{ text: sysPrompt }] },
                  speechConfig: {
                      voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Zephyr' } }
                  }
              },
              callbacks: {
                  onopen: () => {
                      if (mountedRef.current) {
                          setStatus('connected');
                          setSubStatus("Connecté - Dites Bonjour !");
                      }
                  },
                  onmessage: async (msg: any) => {
                      if (!mountedRef.current) return;
                      
                      const audioData = msg.serverContent?.modelTurn?.parts?.[0]?.inlineData?.data;
                      if (audioData) {
                          setSubStatus("Teacher parle...");
                          setAudioLevel(prev => Math.max(prev, 60));
                          await queueAudioChunk(audioData, ctx);
                      }
                      
                      if (msg.serverContent?.turnComplete) {
                          setSubStatus("À vous...");
                          // Reset sync if laggy
                          if (nextStartTimeRef.current < ctx.currentTime) {
                              nextStartTimeRef.current = ctx.currentTime;
                          }
                      }
                  },
                  onclose: () => {
                      if (mountedRef.current && status === 'connected') {
                          notify("Session terminée.", 'info');
                          onClose();
                      }
                  },
                  onerror: (e) => console.error("Live Error", e)
              }
          });

          liveSessionRef.current = session;
          await startMicrophone(ctx, session);

      } catch (e) {
          console.warn(`Retry connection...`, e);
          await connectWithRotation(ctx, retryIndex + 1);
      }
  };

  // --- AUDIO I/O ---

  const startMicrophone = async (ctx: AudioContext, session: any) => {
      try {
          const stream = await navigator.mediaDevices.getUserMedia({
              audio: {
                  channelCount: 1,
                  sampleRate: 16000,
                  echoCancellation: true,
                  noiseSuppression: true,
                  autoGainControl: true
              }
          });
          mediaStreamRef.current = stream;
          
          const source = ctx.createMediaStreamSource(stream);
          const processor = ctx.createScriptProcessor(4096, 1, 1);
          processorRef.current = processor;

          processor.onaudioprocess = (e) => {
              if (isMicMuted || !liveSessionRef.current) return;
              
              const inputData = e.inputBuffer.getChannelData(0);
              
              // Visualizer logic
              let sum = 0;
              for(let i=0; i<inputData.length; i++) sum += inputData[i] * inputData[i];
              const rms = Math.sqrt(sum / inputData.length);
              setAudioLevel(Math.min(100, rms * 500)); 

              // Send to Gemini
              const base64Data = floatTo16BitPCM(inputData);
              try {
                  session.sendRealtimeInput({
                      mimeType: `audio/pcm;rate=${e.inputBuffer.sampleRate}`,
                      data: base64Data
                  });
              } catch(err) {}
          };

          source.connect(processor);
          processor.connect(ctx.destination);

      } catch (e) {
          console.error("Mic Error", e);
          throw new Error("Microphone inaccessible.");
      }
  };

  const queueAudioChunk = async (base64: string, ctx: AudioContext) => {
      try {
          if (ctx.state === 'suspended') await ctx.resume();

          const buffer = await base64ToAudioBuffer(base64, ctx);
          const source = ctx.createBufferSource();
          source.buffer = buffer;
          source.connect(ctx.destination);
          
          const now = ctx.currentTime;
          if (nextStartTimeRef.current < now) nextStartTimeRef.current = now + 0.05;
          
          source.start(nextStartTimeRef.current);
          nextStartTimeRef.current += buffer.duration;
      } catch (e) {
          console.error("Playback Error", e);
      }
  };

  // --- RENDER ---

  if (status === 'setup') {
      return (
          <div className="fixed inset-0 z-[150] bg-slate-900/95 backdrop-blur-xl flex items-center justify-center p-6 animate-fade-in font-sans">
              <div className="bg-white dark:bg-slate-900 w-full max-w-sm rounded-3xl p-8 shadow-2xl border border-slate-200 dark:border-slate-800 text-center relative overflow-hidden">
                  <button onClick={onClose} className="absolute top-4 right-4 p-2 bg-slate-100 dark:bg-slate-800 rounded-full hover:text-red-500 transition-colors"><X className="w-5 h-5"/></button>
                  
                  <div className="w-24 h-24 bg-indigo-50 dark:bg-indigo-900/20 rounded-full flex items-center justify-center mx-auto mb-6 animate-bounce-slight">
                      <Phone className="w-10 h-10 text-indigo-600 dark:text-indigo-400" />
                  </div>
                  
                  <h2 className="text-2xl font-black text-slate-900 dark:text-white mb-2">Live Teacher</h2>
                  <p className="text-slate-500 text-sm mb-6">Conversation naturelle en {targetLang}.</p>
                  
                  <div className="bg-emerald-50 dark:bg-emerald-900/20 p-4 rounded-2xl border border-emerald-100 dark:border-emerald-800/30 mb-6 text-left">
                      <div className="flex items-center gap-2 mb-2 font-bold text-emerald-700 dark:text-emerald-400 text-sm">
                          <Wifi className="w-4 h-4"/> Mode Audio Natif
                      </div>
                      <p className="text-xs text-emerald-800 dark:text-emerald-300 leading-relaxed">
                          Streaming vocal temps réel. Parlez librement.
                          <br/><strong>Coût : 5 Crédits / minute.</strong>
                      </p>
                  </div>

                  <button onClick={handleStart} className="w-full py-4 bg-indigo-600 hover:bg-indigo-700 text-white font-black rounded-2xl shadow-lg shadow-indigo-500/30 transform active:scale-95 transition-all flex items-center justify-center gap-2">
                      <Play className="w-5 h-5 fill-current" /> Démarrer l'appel
                  </button>
              </div>
          </div>
      );
  }

  if (status === 'error') {
      return (
          <div className="fixed inset-0 z-[150] bg-slate-900/95 flex items-center justify-center p-6 animate-fade-in font-sans">
              <div className="bg-white dark:bg-slate-900 w-full max-w-sm rounded-3xl p-8 text-center border-2 border-red-500/50 shadow-2xl">
                  <AlertTriangle className="w-12 h-12 text-red-500 mx-auto mb-4" />
                  <h3 className="text-xl font-bold text-slate-800 dark:text-white mb-2">Erreur</h3>
                  <p className="text-sm text-slate-500 mb-6">{errorMessage}</p>
                  <button onClick={onClose} className="w-full py-3 bg-slate-100 dark:bg-slate-800 font-bold rounded-xl hover:bg-slate-200 transition-colors">Fermer</button>
              </div>
          </div>
      );
  }

  return (
      <div className="fixed inset-0 z-[150] bg-slate-950 flex flex-col font-sans overflow-hidden">
          {/* Header */}
          <div className="relative z-10 p-8 pt-12 text-center">
              <div className="inline-flex items-center gap-2 bg-slate-800/80 px-4 py-1.5 rounded-full border border-slate-700 mb-3 backdrop-blur-md">
                  {status === 'connecting' ? <Loader2 className="w-3 h-3 text-amber-500 animate-spin" /> : <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></div>}
                  <span className="text-[10px] font-black uppercase text-white tracking-widest">
                      {status === 'connecting' ? 'CONNEXION...' : `${Math.floor(duration/60)}:${(duration%60).toString().padStart(2,'0')}`}
                  </span>
              </div>
              <h2 className="text-3xl font-black text-white tracking-tight">{targetLang}</h2>
              <p className="text-indigo-400 text-xs font-bold uppercase tracking-widest mt-1">{level}</p>
          </div>

          {/* Visualizer */}
          <div className="flex-1 flex flex-col items-center justify-center relative w-full mb-20">
              {audioLevel > 10 && (
                  <>
                      <div className="absolute w-48 h-48 bg-indigo-500/20 rounded-full animate-ping" style={{ animationDuration: '1s' }}></div>
                      <div className="absolute w-72 h-72 bg-indigo-500/10 rounded-full animate-ping delay-100" style={{ animationDuration: '1.5s' }}></div>
                  </>
              )}
              
              <div className={`relative z-10 w-48 h-48 rounded-full bg-slate-900 border-4 transition-all duration-300 flex items-center justify-center overflow-hidden ${audioLevel > 20 ? 'border-emerald-500 shadow-[0_0_60px_rgba(16,185,129,0.4)] scale-105' : 'border-indigo-500/50 shadow-[0_0_60px_rgba(99,102,241,0.4)]'}`}>
                  <img src="https://i.ibb.co/B2XmRwmJ/logo.png" className="w-full h-full object-cover p-8" alt="Teacher" />
              </div>

              <div className="h-20 flex items-center justify-center gap-1.5 mt-12">
                  {bars.map((height, i) => (
                      <div key={i} className="w-2.5 rounded-full bg-white transition-all duration-75" style={{ height: `${height}px`, opacity: 0.8 + (height/100) }}></div>
                  ))}
              </div>
              
              <p className="text-white/50 text-xs font-bold uppercase tracking-widest mt-6 animate-pulse">{subStatus}</p>
          </div>

          {/* Controls */}
          <div className="p-10 pb-16 flex justify-center items-center gap-10 bg-gradient-to-t from-slate-950 to-transparent">
              <button onClick={() => setIsMicMuted(!isMicMuted)} className={`p-5 rounded-full transition-all shadow-lg ${isMicMuted ? 'bg-white text-slate-900' : 'bg-slate-800 text-white hover:bg-slate-700 border border-slate-700'}`}>
                  {isMicMuted ? <MicOff className="w-6 h-6"/> : <Mic className="w-6 h-6"/>}
              </button>
              
              <button onClick={stopSession} className="w-20 h-20 bg-red-500 hover:bg-red-600 rounded-full flex items-center justify-center shadow-[0_0_30px_rgba(239,68,68,0.4)] transition-transform hover:scale-105">
                  <Phone className="w-8 h-8 text-white fill-white rotate-[135deg]" />
              </button>
              
              <button className={`p-5 rounded-full cursor-not-allowed border border-slate-700 opacity-50 ${status === 'connected' ? 'bg-emerald-500/20 text-emerald-500' : 'bg-slate-800 text-slate-500'}`}>
                  <Wifi className="w-6 h-6"/>
              </button>
          </div>
      </div>
  );
};

export default LiveTeacher;
