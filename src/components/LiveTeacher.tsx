
import React, { useState, useEffect, useRef } from 'react';
import { X, Mic, MicOff, AlertTriangle, Activity, Phone, Settings2 } from 'lucide-react';
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

const LIVE_MODEL = 'gemini-2.5-flash-native-audio-preview-12-2025';
const CREDIT_COST_PER_MINUTE = 5;

// Helper to get keys from env
const getApiKeys = () => {
    const rawKey = process.env.API_KEY || "";
    return rawKey.split(',').map(k => k.trim()).filter(k => k.length >= 10);
};

// --- AUDIO UTILS ---

// Convert Base64 (from Gemini) to AudioBuffer (for Browser)
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
    
    // Gemini Live Output is 24kHz
    const buffer = ctx.createBuffer(1, float32.length, 24000);
    buffer.copyToChannel(float32, 0);
    return buffer;
}

// Convert Browser Input (Float32) to PCM16 Base64 (for Gemini)
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
  // States
  const [status, setStatus] = useState<'setup' | 'connecting' | 'connected' | 'error'>('setup');
  const [subStatus, setSubStatus] = useState(''); 
  const [duration, setDuration] = useState(0);
  const [audioLevel, setAudioLevel] = useState(0);
  const [isMicMuted, setIsMicMuted] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  // Refs
  const audioCtxRef = useRef<AudioContext | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const sourceNodeRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const liveSessionRef = useRef<any>(null);
  const nextStartTimeRef = useRef(0);
  const mountedRef = useRef(true);

  // Configuration
  const targetLang = user.preferences?.targetLanguage || 'Anglais';
  const level = user.preferences?.level || 'Débutant';

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
          interval = setInterval(async () => {
              setDuration(d => {
                  const newD = d + 1;
                  if (newD > 0 && newD % 60 === 0) {
                      handleBilling();
                  }
                  return newD;
              });
          }, 1000);
      }
      return () => clearInterval(interval);
  }, [status]);

  const handleBilling = async () => {
      const success = await storageService.deductCredits(user.id, CREDIT_COST_PER_MINUTE);
      if (success) {
          const updated = await storageService.getUserById(user.id);
          if (updated) onUpdateUser(updated);
          notify(`-5 Crédits (1 min)`, 'info');
      } else {
          notify("Crédits épuisés. Fin de l'appel.", 'error');
          onShowPayment();
          onClose(); 
      }
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
      if (sourceNodeRef.current) {
          try { sourceNodeRef.current.disconnect(); } catch(e){}
          sourceNodeRef.current = null;
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
          notify("Il faut 5 crédits minimum pour démarrer.", 'error');
          onShowPayment();
          return;
      }

      setStatus('connecting');
      setSubStatus("Initialisation audio (16kHz)...");
      setErrorMessage('');

      try {
          // --- CRITICAL AUDIO SETUP ---
          // Gemini Live Output is 24kHz.
          const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
          const ctx = new AudioContextClass({ sampleRate: 24000 });
          
          await ctx.resume();
          audioCtxRef.current = ctx;

          // Deduct initial 5 credits
          const success = await storageService.deductCredits(user.id, CREDIT_COST_PER_MINUTE);
          if (!success) throw new Error("Crédits insuffisants");
          
          const u = await storageService.getUserById(user.id);
          if (u) onUpdateUser(u);

          setSubStatus("Connexion IA...");
          await connectWithRotation(ctx);

      } catch (e: any) {
          console.error("Start Error", e);
          setStatus('error');
          setErrorMessage(e.message || "Erreur de démarrage");
          notify(e.message || "Erreur microphone ou réseau", 'error');
          fullCleanup();
      }
  };

  const connectWithRotation = async (ctx: AudioContext) => {
      const keys = getApiKeys();
      if (keys.length === 0) {
          notify("Erreur configuration API. Contactez l'admin.", 'error');
          throw new Error("Aucune clé API configurée.");
      }

      let connected = false;

      for (const apiKey of keys) {
          try {
              console.log("Connecting to Gemini Live...");
              const ai = new GoogleGenAI({ apiKey });
              
              const sysPrompt = `
                Rôle: Professeur de langue (${targetLang}, ${level}).
                Tâche: Converse oralement.
                Instruction:
                1. Sois bref et encourageant.
                2. Corrige les fautes gentiment.
                3. COMMENCE TOUT DE SUITE par une salutation chaleureuse.
              `;

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
                          console.log(">>> Live Connected <<<");
                          if (mountedRef.current) {
                              setStatus('connected');
                              setSubStatus("Connecté");
                          }
                      },
                      onmessage: async (msg: any) => {
                          if (!mountedRef.current) return;
                          
                          // Audio Output Processing
                          const audioData = msg.serverContent?.modelTurn?.parts?.[0]?.inlineData?.data;
                          if (audioData) {
                              setSubStatus("Le prof parle...");
                              await playAudioChunk(audioData, ctx);
                          }
                          
                          // Turn Management
                          if (msg.serverContent?.turnComplete) {
                              setSubStatus("À vous...");
                              // Sync time for gapless playback
                              if (ctx.currentTime > nextStartTimeRef.current) {
                                  nextStartTimeRef.current = ctx.currentTime;
                              }
                          }
                      },
                      onclose: (e) => {
                          console.log("Session closed", e);
                          if (mountedRef.current && status === 'connected') {
                              setStatus('error');
                              setErrorMessage("Appel terminé.");
                          }
                      },
                      onerror: (e) => {
                          console.error("Session Error", e);
                          notify("Erreur de session IA", 'error');
                      }
                  }
              });

              liveSessionRef.current = session;
              connected = true;
              
              // --- CRITICAL FIX: SEND TRIGGER MESSAGE ---
              // Force the model to speak first by sending a hidden text prompt
              try {
                  await session.send([{ text: "Bonjour ! La session commence. Présente-toi brièvement." }], true);
              } catch (triggerError) {
                  console.warn("Trigger warning:", triggerError);
              }

              // Start Capture AFTER session is ready
              await startAudioCapture(ctx, session);
              break; 

          } catch (e: any) {
              console.warn("Key failed, trying next...", e);
              continue;
          }
      }

      if (!connected) {
          notify("Service indisponible. Réessayez plus tard.", 'error');
          throw new Error("Service indisponible (Connexion échouée).");
      }
  };

  const startAudioCapture = async (ctx: AudioContext, session: any) => {
      try {
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
          sourceNodeRef.current = source;
          
          const processor = ctx.createScriptProcessor(4096, 1, 1);
          processorRef.current = processor;

          processor.onaudioprocess = (e) => {
              if (isMicMuted) return;
              
              const inputData = e.inputBuffer.getChannelData(0);
              
              // Calculate volume
              let sum = 0;
              for(let i=0; i<inputData.length; i++) sum += inputData[i] * inputData[i];
              const rms = Math.sqrt(sum / inputData.length);
              setAudioLevel(Math.min(100, rms * 800));

              // Convert & Send
              const base64Data = floatTo16BitPCM(inputData);
              
              try {
                  session.sendRealtimeInput({
                      mimeType: "audio/pcm;rate=16000",
                      data: base64Data
                  });
              } catch(err) {
                  // Session might be closing
              }
          };

          source.connect(processor);
          processor.connect(ctx.destination);

      } catch (e: any) {
          console.error("Mic setup failed", e);
          notify("Microphone inaccessible. Vérifiez vos permissions.", 'error');
          throw new Error("Microphone inaccessible.");
      }
  };

  const playAudioChunk = async (base64: string, ctx: AudioContext) => {
      try {
          // Ensure context is running
          if (ctx.state === 'suspended') {
              await ctx.resume();
          }

          const buffer = await base64ToAudioBuffer(base64, ctx);
          const source = ctx.createBufferSource();
          source.buffer = buffer;
          source.connect(ctx.destination);
          
          const now = ctx.currentTime;
          
          // Gapless logic: If we fell behind, catch up to 'now'
          if (nextStartTimeRef.current < now) {
              nextStartTimeRef.current = now;
          }
          
          source.start(nextStartTimeRef.current);
          nextStartTimeRef.current += buffer.duration;
      } catch (e) {
          console.error("Playback error", e);
      }
  };

  // --- RENDER ---

  if (status === 'setup') {
      return (
          <div className="fixed inset-0 z-[150] bg-slate-900/95 backdrop-blur-xl flex items-center justify-center p-6 animate-fade-in font-sans">
              <div className="bg-white dark:bg-slate-900 w-full max-w-sm rounded-3xl p-8 shadow-2xl border border-slate-200 dark:border-slate-800 text-center relative">
                  <button onClick={onClose} className="absolute top-4 right-4 p-2 bg-slate-100 dark:bg-slate-800 rounded-full hover:text-red-500"><X className="w-5 h-5"/></button>
                  
                  <div className="w-24 h-24 bg-indigo-50 dark:bg-indigo-900/20 rounded-full flex items-center justify-center mx-auto mb-6 animate-bounce-slight">
                      <Phone className="w-10 h-10 text-indigo-600 dark:text-indigo-400" />
                  </div>
                  
                  <h2 className="text-2xl font-black text-slate-900 dark:text-white mb-2">Live Teacher</h2>
                  <p className="text-slate-500 text-sm mb-6">Conversation orale en temps réel avec IA.</p>
                  
                  <div className="bg-amber-50 dark:bg-amber-900/20 p-4 rounded-2xl border border-amber-100 dark:border-amber-800/30 mb-6 text-left">
                      <div className="flex items-center gap-2 mb-2 font-bold text-amber-700 dark:text-amber-400 text-sm">
                          <Activity className="w-4 h-4"/> Coût estimé
                      </div>
                      <p className="text-xs text-amber-800 dark:text-amber-300 leading-relaxed">
                          Ce mode utilise le modèle haute performance Gemini Live.
                          <br/><strong>Coût : 5 Crédits / minute.</strong>
                      </p>
                  </div>

                  <button onClick={handleStart} className="w-full py-4 bg-indigo-600 hover:bg-indigo-700 text-white font-black rounded-2xl shadow-lg shadow-indigo-500/30 transform active:scale-95 transition-all">
                      Appeler ({user.credits} crédits)
                  </button>
              </div>
          </div>
      );
  }

  if (status === 'error') {
      return (
          <div className="fixed inset-0 z-[150] bg-slate-900/95 flex items-center justify-center p-6">
              <div className="bg-white dark:bg-slate-900 w-full max-w-sm rounded-3xl p-8 text-center border-2 border-red-500/50">
                  <AlertTriangle className="w-12 h-12 text-red-500 mx-auto mb-4" />
                  <h3 className="text-xl font-bold text-slate-800 dark:text-white mb-2">Fin de l'appel</h3>
                  <p className="text-sm text-slate-500 mb-6">{errorMessage}</p>
                  <button onClick={onClose} className="w-full py-3 bg-slate-100 dark:bg-slate-800 font-bold rounded-xl">Fermer</button>
              </div>
          </div>
      );
  }

  // Connected View
  return (
      <div className="fixed inset-0 z-[150] bg-slate-950 flex flex-col font-sans overflow-hidden">
          {/* Header */}
          <div className="relative z-10 p-8 text-center">
              <div className="inline-flex items-center gap-2 bg-slate-800/50 px-3 py-1 rounded-full border border-slate-700 mb-2">
                  <div className={`w-2 h-2 rounded-full ${status === 'connecting' ? 'bg-amber-500 animate-pulse' : 'bg-emerald-500'}`}></div>
                  <span className="text-[10px] font-bold uppercase text-slate-300 tracking-wider">
                      {status === 'connecting' ? 'CONNEXION...' : `${Math.floor(duration/60)}:${(duration%60).toString().padStart(2,'0')}`}
                  </span>
              </div>
              <h2 className="text-2xl font-black text-white">{targetLang}</h2>
              <p className="text-indigo-400 text-xs font-bold uppercase tracking-widest">{level}</p>
          </div>

          {/* Avatar / Visualizer */}
          <div className="flex-1 flex flex-col items-center justify-center relative w-full">
              {/* Pulse Waves */}
              {subStatus.includes('parle') && (
                  <>
                      <div className="absolute w-48 h-48 bg-indigo-500/20 rounded-full animate-ping"></div>
                      <div className="absolute w-64 h-64 bg-indigo-500/10 rounded-full animate-ping delay-100"></div>
                  </>
              )}
              
              <div className="relative z-10 w-40 h-40 rounded-full bg-slate-900 border-4 border-indigo-500/50 shadow-[0_0_50px_rgba(99,102,241,0.3)] flex items-center justify-center overflow-hidden">
                  <img src="https://i.ibb.co/B2XmRwmJ/logo.png" className="w-full h-full object-cover p-6" alt="Teacher" />
              </div>

              <div className="h-16 flex items-center justify-center gap-1 mt-12">
                  {[...Array(5)].map((_, i) => (
                      <div 
                          key={i} 
                          className="w-2 rounded-full bg-emerald-400 transition-all duration-75"
                          style={{
                              height: status === 'connecting' ? '4px' : `${Math.max(4, audioLevel * (1 + Math.random()) * 1.5)}px`,
                              opacity: status === 'connecting' ? 0.2 : 0.8
                          }}
                      ></div>
                  ))}
              </div>
              
              <p className="text-white/50 text-xs font-bold uppercase tracking-widest mt-4 animate-pulse">
                  {subStatus}
              </p>
          </div>

          {/* Controls */}
          <div className="p-10 pb-16 flex justify-center items-center gap-8">
              <button 
                  onClick={() => setIsMicMuted(!isMicMuted)} 
                  className={`p-4 rounded-full transition-all ${isMicMuted ? 'bg-white text-slate-900' : 'bg-slate-800 text-white hover:bg-slate-700'}`}
              >
                  {isMicMuted ? <MicOff className="w-6 h-6"/> : <Mic className="w-6 h-6"/>}
              </button>
              
              <button 
                  onClick={onClose} 
                  className="w-20 h-20 bg-red-500 hover:bg-red-600 rounded-full flex items-center justify-center shadow-lg shadow-red-500/40 transition-transform hover:scale-105"
              >
                  <Phone className="w-8 h-8 text-white fill-white rotate-[135deg]" />
              </button>
              
              <button className="p-4 bg-slate-800 text-slate-500 rounded-full cursor-not-allowed">
                  <Settings2 className="w-6 h-6"/>
              </button>
          </div>
      </div>
  );
};

export default LiveTeacher;
