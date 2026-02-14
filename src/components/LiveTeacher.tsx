
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
const INPUT_SAMPLE_RATE = 16000; // Standard for Speech-to-Text
const OUTPUT_SAMPLE_RATE = 24000; // Native Gemini Audio Output

// Helper to get keys from env and clean them
const getApiKeys = () => {
    const rawKey = process.env.API_KEY || "";
    return rawKey.split(',').map(k => k.trim()).filter(k => k.length >= 10);
};

// --- AUDIO UTILS (Raw PCM Handling) ---

// Base64 -> AudioBuffer
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

// Float32 (Browser Mic) -> Base64 PCM16 (Gemini Input)
function floatTo16BitPCM(input: Float32Array) {
    const output = new Int16Array(input.length);
    for (let i = 0; i < input.length; i++) {
        const s = Math.max(-1, Math.min(1, input[i]));
        output[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
    }
    
    const bytes = new Uint8Array(output.buffer);
    let binary = '';
    const len = bytes.byteLength;
    // Chunk processing for large buffers to avoid stack overflow
    const chunk = 8192;
    for (let i = 0; i < len; i += chunk) {
        binary += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, Math.min(i + chunk, len))));
    }
    return btoa(binary);
}

const LiveTeacher: React.FC<LiveTeacherProps> = ({ user, onClose, onUpdateUser, notify, onShowPayment }) => {
  // UI State
  const [status, setStatus] = useState<'setup' | 'connecting' | 'connected' | 'error'>('setup');
  const [subStatus, setSubStatus] = useState(''); 
  const [duration, setDuration] = useState(0);
  const [audioLevel, setAudioLevel] = useState(0);
  const [isMicMuted, setIsMicMuted] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  
  // Visualizer
  const [bars, setBars] = useState<number[]>([10, 15, 10, 20, 10]);

  // Audio References
  const audioCtxRef = useRef<AudioContext | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const liveSessionRef = useRef<any>(null);
  
  // Playback Queue Management
  const nextStartTimeRef = useRef(0);
  const mountedRef = useRef(true);
  const activeSourcesRef = useRef<AudioBufferSourceNode[]>([]);

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

  // Timer & Billing Logic
  useEffect(() => {
      let interval: any;
      if (status === 'connected') {
          interval = setInterval(async () => {
              setDuration(d => {
                  const newD = d + 1;
                  // Deduct credits every minute
                  if (newD > 0 && newD % 60 === 0) {
                      handleBilling();
                  }
                  return newD;
              });
          }, 1000);
      }
      return () => clearInterval(interval);
  }, [status]);

  // Visualizer Animation
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
          notify(`-5 Crédits (1 min)`, 'info');
      } else {
          notify("Crédits épuisés. Fin de l'appel.", 'error');
          stopSession(); 
      }
  };

  const stopSession = () => {
      fullCleanup();
      if (mountedRef.current) onClose();
  };

  const fullCleanup = () => {
      // 1. Close Gemini Session
      if (liveSessionRef.current) {
          try { liveSessionRef.current.close(); } catch(e){}
          liveSessionRef.current = null;
      }
      
      // 2. Stop Audio Input
      if (processorRef.current) {
          try { processorRef.current.disconnect(); } catch(e){}
          processorRef.current = null;
      }
      if (mediaStreamRef.current) {
          mediaStreamRef.current.getTracks().forEach(t => t.stop());
          mediaStreamRef.current = null;
      }

      // 3. Stop Audio Output (Active Sources)
      activeSourcesRef.current.forEach(source => {
          try { source.stop(); } catch(e){}
      });
      activeSourcesRef.current = [];

      // 4. Close Context
      if (audioCtxRef.current) {
          audioCtxRef.current.close().catch(() => {});
          audioCtxRef.current = null;
      }
  };

  // --- START LOGIC ---

  const handleStart = async () => {
      const allowed = await storageService.canRequest(user.id, CREDIT_COST_PER_MINUTE);
      if (!allowed) {
          notify("Il faut 5 crédits minimum pour démarrer.", 'error');
          onShowPayment();
          return;
      }

      setStatus('connecting');
      setSubStatus("Initialisation audio...");
      setErrorMessage('');

      try {
          // 1. Initialize Audio Context (Must be user gesture)
          const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
          if (!AudioContextClass) throw new Error("Navigateur non compatible.");
          
          const ctx = new AudioContextClass({ sampleRate: OUTPUT_SAMPLE_RATE });
          await ctx.resume();
          audioCtxRef.current = ctx;
          nextStartTimeRef.current = ctx.currentTime;

          // 2. Billing Initial Deduction
          const success = await storageService.deductCredits(user.id, CREDIT_COST_PER_MINUTE);
          if (!success) throw new Error("Crédits insuffisants");
          const u = await storageService.getUserById(user.id);
          if (u) onUpdateUser(u);

          setSubStatus("Connexion Serveur...");
          
          // 3. Connect with Rotation
          await connectWithRotation(ctx);

      } catch (e: any) {
          console.error("Start Error", e);
          setStatus('error');
          setErrorMessage(e.message || "Impossible de démarrer.");
          fullCleanup();
      }
  };

  // --- GEMINI CONNECTION ROTATION ---

  const connectWithRotation = async (ctx: AudioContext, retryIndex = 0) => {
      const keys = getApiKeys();
      if (keys.length === 0) throw new Error("Aucune clé API configurée.");
      
      // Round-robin selection
      const apiKey = keys[retryIndex % keys.length];
      const isLastTry = retryIndex >= keys.length * 2; // Allow 2 full loops

      if (isLastTry) {
          throw new Error("Tous les serveurs sont occupés. Réessayez.");
      }

      try {
          console.log(`Connecting with key index ${retryIndex % keys.length}...`);
          const ai = new GoogleGenAI({ apiKey });
          
          const sysPrompt = `You are a friendly language teacher helping a student learn ${targetLang} (Level: ${level}). 
          Speak briefly (1-2 sentences max). Correct mistakes gently. 
          IMPORTANT: Start IMMEDIATELY by introducing yourself in ${targetLang} and asking a simple question.`;

          const session = await ai.live.connect({
              model: LIVE_MODEL,
              config: {
                  responseModalities: [Modality.AUDIO], // Audio output only
                  systemInstruction: { parts: [{ text: sysPrompt }] },
                  speechConfig: {
                      voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Zephyr' } }
                  }
              },
              callbacks: {
                  onopen: () => {
                      console.log(">>> Live Connected <<<");
                      if (mountedRef.current) {
                          setStatus('connected');
                          setSubStatus("Connecté");
                          // FORCE START: Send a dummy message to trigger the model to speak first
                          setTimeout(() => {
                              session.send([{ text: "Hello teacher, please start the lesson now." }]);
                          }, 100);
                      }
                  },
                  onmessage: async (msg: any) => {
                      if (!mountedRef.current) return;
                      
                      // 1. Audio Output Handling
                      const audioData = msg.serverContent?.modelTurn?.parts?.[0]?.inlineData?.data;
                      if (audioData) {
                          setSubStatus("TeacherMada parle...");
                          setAudioLevel(prev => Math.max(prev, 60)); // Visual boost
                          await queueAudioChunk(audioData, ctx);
                      }
                      
                      // 2. Turn Complete
                      if (msg.serverContent?.turnComplete) {
                          setSubStatus("À vous...");
                          // Reset timer sync to avoid lag buildup
                          if (nextStartTimeRef.current < ctx.currentTime) {
                              nextStartTimeRef.current = ctx.currentTime;
                          }
                      }
                  },
                  onclose: (e) => {
                      console.log("Session closed", e);
                      // Only treat as error if not intentional closure
                      if (mountedRef.current && status === 'connected') {
                          notify("Connexion interrompue.", 'info');
                          onClose();
                      }
                  },
                  onerror: (e) => {
                      console.error("Session Error", e);
                      // Try next key if this one fails during session
                      if (mountedRef.current) {
                          notify("Changement de serveur...", 'info');
                          fullCleanup(); // Clean current
                          handleStart(); // Restart fully (simplified retry)
                      }
                  }
              }
          });

          liveSessionRef.current = session;
          
          // Start Input Stream immediately
          await startMicrophone(ctx, session);

      } catch (e: any) {
          console.warn(`Key failed (idx ${retryIndex})`, e);
          // Recursively try next key
          await connectWithRotation(ctx, retryIndex + 1);
      }
  };

  // --- AUDIO INPUT (MIC) ---

  const startMicrophone = async (ctx: AudioContext, session: any) => {
      try {
          const stream = await navigator.mediaDevices.getUserMedia({
              audio: {
                  channelCount: 1,
                  sampleRate: INPUT_SAMPLE_RATE,
                  echoCancellation: true,
                  noiseSuppression: true,
                  autoGainControl: true
              }
          });
          mediaStreamRef.current = stream;
          
          const source = ctx.createMediaStreamSource(stream);
          // ScriptProcessor is deprecated but reliable for raw PCM extraction in this context without extra files
          const processor = ctx.createScriptProcessor(4096, 1, 1);
          processorRef.current = processor;

          processor.onaudioprocess = (e) => {
              if (isMicMuted || !liveSessionRef.current) return;
              
              const inputData = e.inputBuffer.getChannelData(0);
              
              // 1. Calculate RMS for Visualizer
              let sum = 0;
              for(let i=0; i<inputData.length; i++) sum += inputData[i] * inputData[i];
              const rms = Math.sqrt(sum / inputData.length);
              setAudioLevel(Math.min(100, rms * 500)); 

              // 2. Downsample/Convert & Send
              // Note: We are capturing at system rate (often 48k) but Gemini wants PCM. 
              // Sending Float32 converted to PCM16 is standard.
              const base64Data = floatTo16BitPCM(inputData);
              
              try {
                  session.sendRealtimeInput({
                      mimeType: `audio/pcm;rate=${e.inputBuffer.sampleRate}`, // Dynamic rate
                      data: base64Data
                  });
              } catch(err) {
                  // Session might be closing
              }
          };

          source.connect(processor);
          processor.connect(ctx.destination); // Required for script processor to run

      } catch (e: any) {
          console.error("Mic setup failed", e);
          throw new Error("Microphone inaccessible. Vérifiez les permissions.");
      }
  };

  // --- AUDIO OUTPUT (SPEAKER) ---

  const queueAudioChunk = async (base64: string, ctx: AudioContext) => {
      try {
          // Keep context alive
          if (ctx.state === 'suspended') await ctx.resume();

          const buffer = await base64ToAudioBuffer(base64, ctx);
          const source = ctx.createBufferSource();
          source.buffer = buffer;
          source.connect(ctx.destination);
          
          // Gapless Scheduling
          const now = ctx.currentTime;
          // If next start time is in the past (lag), reset to now + tiny buffer
          if (nextStartTimeRef.current < now) {
              nextStartTimeRef.current = now + 0.05; 
          }
          
          source.start(nextStartTimeRef.current);
          nextStartTimeRef.current += buffer.duration;
          
          // Track source for cleanup
          activeSourcesRef.current.push(source);
          source.onended = () => {
              activeSourcesRef.current = activeSourcesRef.current.filter(s => s !== source);
          };

      } catch (e) {
          console.error("Playback error", e);
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
                          Streaming vocal ultra-rapide. Parlez librement, l'IA vous écoute et vous répond instantanément.
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

  // CONNECTED VIEW
  return (
      <div className="fixed inset-0 z-[150] bg-slate-950 flex flex-col font-sans overflow-hidden">
          {/* Header */}
          <div className="relative z-10 p-8 pt-12 text-center">
              <div className="inline-flex items-center gap-2 bg-slate-800/80 px-4 py-1.5 rounded-full border border-slate-700 mb-3 backdrop-blur-md">
                  {status === 'connecting' ? (
                      <Loader2 className="w-3 h-3 text-amber-500 animate-spin" />
                  ) : (
                      <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></div>
                  )}
                  <span className="text-[10px] font-black uppercase text-white tracking-widest">
                      {status === 'connecting' ? 'CONNEXION...' : `${Math.floor(duration/60)}:${(duration%60).toString().padStart(2,'0')}`}
                  </span>
              </div>
              <h2 className="text-3xl font-black text-white tracking-tight">{targetLang}</h2>
              <p className="text-indigo-400 text-xs font-bold uppercase tracking-widest mt-1">{level}</p>
          </div>

          {/* Avatar / Visualizer */}
          <div className="flex-1 flex flex-col items-center justify-center relative w-full mb-20">
              {/* Ripple Effect based on audio level */}
              {audioLevel > 10 && (
                  <>
                      <div className="absolute w-48 h-48 bg-indigo-500/20 rounded-full animate-ping" style={{ animationDuration: '1s' }}></div>
                      <div className="absolute w-72 h-72 bg-indigo-500/10 rounded-full animate-ping delay-100" style={{ animationDuration: '1.5s' }}></div>
                  </>
              )}
              
              <div className={`relative z-10 w-48 h-48 rounded-full bg-slate-900 border-4 transition-all duration-300 flex items-center justify-center overflow-hidden ${audioLevel > 20 ? 'border-emerald-500 shadow-[0_0_60px_rgba(16,185,129,0.4)] scale-105' : 'border-indigo-500/50 shadow-[0_0_60px_rgba(99,102,241,0.4)]'}`}>
                  <img src="https://i.ibb.co/B2XmRwmJ/logo.png" className="w-full h-full object-cover p-8" alt="Teacher" />
              </div>

              {/* Dynamic Visualizer Bars */}
              <div className="h-20 flex items-center justify-center gap-1.5 mt-12">
                  {bars.map((height, i) => (
                      <div 
                          key={i} 
                          className="w-2.5 rounded-full bg-white transition-all duration-75"
                          style={{
                              height: `${height}px`,
                              opacity: status === 'connecting' ? 0.2 : 0.8 + (height/100)
                          }}
                      ></div>
                  ))}
              </div>
              
              <p className="text-white/50 text-xs font-bold uppercase tracking-widest mt-6 animate-pulse">
                  {subStatus}
              </p>
          </div>

          {/* Controls */}
          <div className="p-10 pb-16 flex justify-center items-center gap-10 bg-gradient-to-t from-slate-950 to-transparent">
              <button 
                  onClick={() => setIsMicMuted(!isMicMuted)} 
                  className={`p-5 rounded-full transition-all shadow-lg ${isMicMuted ? 'bg-white text-slate-900' : 'bg-slate-800 text-white hover:bg-slate-700 border border-slate-700'}`}
              >
                  {isMicMuted ? <MicOff className="w-6 h-6"/> : <Mic className="w-6 h-6"/>}
              </button>
              
              <button 
                  onClick={stopSession} 
                  className="w-20 h-20 bg-red-500 hover:bg-red-600 rounded-full flex items-center justify-center shadow-[0_0_30px_rgba(239,68,68,0.4)] transition-transform hover:scale-105"
              >
                  <Phone className="w-8 h-8 text-white fill-white rotate-[135deg]" />
              </button>
              
              {/* Status Indicator */}
              <button className={`p-5 rounded-full cursor-not-allowed border border-slate-700 opacity-50 ${status === 'connected' ? 'bg-emerald-500/20 text-emerald-500' : 'bg-slate-800 text-slate-500'}`}>
                  <Wifi className="w-6 h-6"/>
              </button>
          </div>
      </div>
  );
};

export default LiveTeacher;
