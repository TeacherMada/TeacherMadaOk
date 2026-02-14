
import React, { useState, useEffect, useRef } from 'react';
import { X, Mic, MicOff, AlertTriangle, Phone, Wifi, Volume2, Play, Loader2 } from 'lucide-react';
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
const GEMINI_SAMPLE_RATE = 24000; // Output from Gemini
const USER_SAMPLE_RATE = 16000;   // Input to Gemini (We downsample to this)

// --- UTILS ---

const getApiKeys = () => {
    const rawKey = process.env.API_KEY || "";
    return rawKey.split(',').map(k => k.trim()).filter(k => k.length >= 10);
};

// PCM (Base64) -> AudioBuffer (Browser)
// We create a buffer at Gemini's rate (24k). The context (48k) handles resampling on playback.
async function pcmToAudioBuffer(base64: string, ctx: AudioContext): Promise<AudioBuffer> {
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
    
    const buffer = ctx.createBuffer(1, float32.length, GEMINI_SAMPLE_RATE);
    buffer.copyToChannel(float32, 0);
    return buffer;
}

// Float32 (Browser) -> PCM16 (Base64)
// We assume input is already downsampled to 16kHz
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

// Downsample any rate to 16kHz
// CRITICAL FIX: Ensure AI hears normal speed audio
function downsampleBuffer(buffer: Float32Array, inputRate: number, outputRate: number = 16000): Float32Array {
    if (inputRate === outputRate) return buffer;
    
    const ratio = inputRate / outputRate;
    const newLength = Math.ceil(buffer.length / ratio);
    const result = new Float32Array(newLength);
    
    let offsetResult = 0;
    let offsetBuffer = 0;
    
    while (offsetResult < newLength) {
        const nextOffsetBuffer = Math.round((offsetResult + 1) * ratio);
        let accum = 0, count = 0;
        
        // Simple averaging for anti-aliasing
        for (let i = offsetBuffer; i < nextOffsetBuffer && i < buffer.length; i++) {
            accum += buffer[i];
            count++;
        }
        
        result[offsetResult] = count > 0 ? accum / count : 0;
        offsetResult++;
        offsetBuffer = nextOffsetBuffer;
    }
    
    return result;
}

const LiveTeacher: React.FC<LiveTeacherProps> = ({ user, onClose, onUpdateUser, notify, onShowPayment }) => {
  // --- STATE ---
  const [status, setStatus] = useState<'setup' | 'connecting' | 'connected' | 'error'>('setup');
  const [subStatus, setSubStatus] = useState(''); 
  const [duration, setDuration] = useState(0);
  const [audioLevel, setAudioLevel] = useState(0);
  const [isMicMuted, setIsMicMuted] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  
  // Visualizer
  const [bars, setBars] = useState<number[]>([10, 15, 10, 20, 10]);

  // --- REFS ---
  const audioCtxRef = useRef<AudioContext | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const liveSessionRef = useRef<any>(null);
  
  // Audio Queue
  const nextStartTimeRef = useRef(0);
  const mountedRef = useRef(true);

  const targetLang = user.preferences?.targetLanguage || 'Anglais';
  const level = user.preferences?.level || 'Débutant';

  // --- EFFECTS ---

  useEffect(() => {
      mountedRef.current = true;
      return () => { 
          mountedRef.current = false; 
          fullCleanup();
      };
  }, []);

  // Timer & Billing
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

  // Visualizer Animation
  useEffect(() => {
      let animFrame: number;
      const animate = () => {
          if (status === 'connected') {
              setBars(prev => prev.map(() => Math.max(6, Math.random() * (audioLevel + 20))));
          }
          animFrame = requestAnimationFrame(animate);
      };
      animate();
      return () => cancelAnimationFrame(animFrame);
  }, [status, audioLevel]);

  // --- ACTIONS ---

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

  const handleStart = async () => {
      const allowed = await storageService.canRequest(user.id, CREDIT_COST_PER_MINUTE);
      if (!allowed) {
          notify("Crédits insuffisants (min 5).", 'error');
          onShowPayment();
          return;
      }

      setStatus('connecting');
      setSubStatus("Initialisation Audio...");
      setErrorMessage('');

      try {
          // 1. Init Audio Context (Standard Rate)
          const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
          const ctx = new AudioContextClass(); // Let browser choose rate (usually 48k or 44.1k)
          await ctx.resume();
          audioCtxRef.current = ctx;
          nextStartTimeRef.current = ctx.currentTime;

          // 2. Billing
          await storageService.deductCredits(user.id, CREDIT_COST_PER_MINUTE);
          const u = await storageService.getUserById(user.id);
          if (u) onUpdateUser(u);

          setSubStatus("Connexion IA...");
          
          // 3. Connect
          await connectWithRotation(ctx);

      } catch (e: any) {
          console.error("Start Error", e);
          setStatus('error');
          setErrorMessage("Impossible d'accéder au microphone ou au serveur.");
          fullCleanup();
      }
  };

  const connectWithRotation = async (ctx: AudioContext, retryIndex = 0) => {
      const keys = getApiKeys();
      if (keys.length === 0) throw new Error("Clé API manquante.");
      
      const apiKey = keys[retryIndex % keys.length];
      if (retryIndex >= keys.length * 2) {
          throw new Error("Serveurs occupés. Veuillez réessayer.");
      }

      try {
          console.log(`Connecting with key index ${retryIndex}...`);
          const ai = new GoogleGenAI({ apiKey });
          
          // SYSTEM INSTRUCTION: Vital for behavior
          // We force the model to speak first.
          const sysPrompt = `You are a friendly language teacher helping a student learn ${targetLang} (Level: ${level}). 
          Speak clearly and briefly. Correct mistakes gently. 
          IMPORTANT: Start the conversation IMMEDIATELY by introducing yourself and asking a simple question in ${targetLang}.`;

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
                          setSubStatus("Connecté");
                          // Note: We don't send 'session.send' anymore as it causes TS Error.
                          // We rely on systemInstruction to trigger the greeting.
                      }
                  },
                  onmessage: async (msg: any) => {
                      if (!mountedRef.current) return;
                      
                      // Audio Output
                      const audioData = msg.serverContent?.modelTurn?.parts?.[0]?.inlineData?.data;
                      if (audioData) {
                          setSubStatus("TeacherMada parle...");
                          setAudioLevel(prev => Math.max(prev, 60)); // Fake visual boost for incoming audio
                          await processAudioChunk(audioData, ctx);
                      }
                      
                      // Turn Complete
                      if (msg.serverContent?.turnComplete) {
                          setSubStatus("À vous...");
                          // Ensure we don't drift too far
                          if (nextStartTimeRef.current < ctx.currentTime) {
                              nextStartTimeRef.current = ctx.currentTime;
                          }
                      }
                  },
                  onclose: () => {
                      if (mountedRef.current && status === 'connected') {
                          console.log("Session Closed Gracefully");
                          onClose();
                      }
                  },
                  onerror: (e) => {
                      console.error("Session Error", e);
                      // Don't kill unless critical
                  }
              }
          });

          liveSessionRef.current = session;
          
          // Start Mic
          await startMicrophone(ctx, session);

      } catch (e: any) {
          console.warn(`Connection Failed (idx ${retryIndex})`, e);
          await connectWithRotation(ctx, retryIndex + 1);
      }
  };

  // --- AUDIO OUTPUT PIPELINE ---

  const processAudioChunk = async (base64: string, ctx: AudioContext) => {
      try {
          if (ctx.state === 'suspended') await ctx.resume();

          // 1. Decode base64 to Float32 at 24kHz
          const buffer = await pcmToAudioBuffer(base64, ctx);
          
          // 2. Schedule Playback
          const source = ctx.createBufferSource();
          source.buffer = buffer;
          source.connect(ctx.destination);
          
          const now = ctx.currentTime;
          // If lagging, skip ahead
          if (nextStartTimeRef.current < now) {
              nextStartTimeRef.current = now + 0.01; // tiny buffer
          }
          
          source.start(nextStartTimeRef.current);
          nextStartTimeRef.current += buffer.duration;

      } catch (e) {
          console.error("Playback Error", e);
      }
  };

  // --- AUDIO INPUT PIPELINE ---

  const startMicrophone = async (ctx: AudioContext, session: any) => {
      try {
          // Request mic
          const stream = await navigator.mediaDevices.getUserMedia({
              audio: {
                  channelCount: 1,
                  echoCancellation: true,
                  noiseSuppression: true,
                  autoGainControl: true
              }
          });
          mediaStreamRef.current = stream;
          
          const source = ctx.createMediaStreamSource(stream);
          // 4096 buffer size = ~85ms latency at 48kHz
          const processor = ctx.createScriptProcessor(4096, 1, 1);
          processorRef.current = processor;

          processor.onaudioprocess = (e) => {
              if (isMicMuted || !liveSessionRef.current) return;
              
              const inputData = e.inputBuffer.getChannelData(0);
              const inputRate = e.inputBuffer.sampleRate;
              
              // 1. Visualizer (RMS)
              let sum = 0;
              for(let i=0; i<inputData.length; i+=10) sum += inputData[i] * inputData[i];
              const rms = Math.sqrt(sum / (inputData.length/10));
              setAudioLevel(Math.min(100, rms * 500)); 

              // 2. Downsample to 16kHz
              // This is crucial. Sending 48k data claiming it's 16k causes 'slow motion' audio on server.
              const downsampled = downsampleBuffer(inputData, inputRate, USER_SAMPLE_RATE);

              // 3. Convert to PCM16 Base64
              const base64Data = floatTo16BitPCM(downsampled);
              
              // 4. Send
              try {
                  session.sendRealtimeInput({
                      mimeType: `audio/pcm;rate=${USER_SAMPLE_RATE}`,
                      data: base64Data
                  });
              } catch(err) {
                  // Ignore send errors if closing
              }
          };

          source.connect(processor);
          processor.connect(ctx.destination); // Needed for script processor to fire

      } catch (e) {
          console.error("Mic Error", e);
          throw new Error("Microphone inaccessible.");
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
                          Technologie Gemini Live.<br/>
                          Zéro latence. Conversation fluide.<br/>
                          <strong>Coût : 5 Crédits / minute.</strong>
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
              {/* Ripple Effect */}
              {audioLevel > 20 && (
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
                              opacity: 0.8 + (height/100)
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
