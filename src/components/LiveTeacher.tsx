
import React, { useState, useEffect, useRef } from 'react';
import { X, Mic, MicOff, Phone, Wifi, Loader2, AlertCircle, Volume2 } from 'lucide-react';
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
const INPUT_SAMPLE_RATE = 16000; // Gemini attend du 16kHz
const OUTPUT_SAMPLE_RATE = 24000; // Gemini renvoie du 24kHz

// --- UTILS AUDIO ---

// 1. Conversion PCM Base64 (Sortie IA) -> AudioBuffer (Navigateur)
const pcmToAudioBuffer = (base64: string, ctx: AudioContext) => {
    const binaryString = atob(base64);
    const len = binaryString.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) bytes[i] = binaryString.charCodeAt(i);
    
    const pcm16 = new Int16Array(bytes.buffer);
    const float32 = new Float32Array(pcm16.length);
    
    for (let i = 0; i < pcm16.length; i++) {
        float32[i] = pcm16[i] / 32768.0;
    }
    
    const buffer = ctx.createBuffer(1, float32.length, OUTPUT_SAMPLE_RATE);
    buffer.copyToChannel(float32, 0);
    return buffer;
};

// 2. Rééchantillonnage (Downsampling) : 48kHz -> 16kHz
const downsampleBuffer = (buffer: Float32Array, inputRate: number, outputRate: number) => {
    if (inputRate === outputRate) return buffer;
    
    const ratio = inputRate / outputRate;
    const newLength = Math.ceil(buffer.length / ratio);
    const result = new Float32Array(newLength);
    
    let offsetResult = 0;
    let offsetBuffer = 0;
    
    while (offsetResult < newLength) {
        const nextOffsetBuffer = Math.round((offsetResult + 1) * ratio);
        let accum = 0, count = 0;
        
        for (let i = offsetBuffer; i < nextOffsetBuffer && i < buffer.length; i++) {
            accum += buffer[i];
            count++;
        }
        
        result[offsetResult] = count > 0 ? accum / count : 0;
        offsetResult++;
        offsetBuffer = nextOffsetBuffer;
    }
    return result;
};

// 3. Conversion Float32 (Micro) -> PCM16 Base64 (Entrée IA)
const floatTo16BitPCM = (input: Float32Array) => {
    const output = new Int16Array(input.length);
    for (let i = 0; i < input.length; i++) {
        const s = Math.max(-1, Math.min(1, input[i]));
        output[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
    }
    
    const bytes = new Uint8Array(output.buffer);
    let binary = '';
    const len = bytes.byteLength;
    // Chunking pour éviter stack overflow sur gros buffers
    for (let i = 0; i < len; i += 8192) {
        binary += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, Math.min(i + 8192, len))));
    }
    return btoa(binary);
};

const getApiKey = () => {
    const keys = (process.env.API_KEY || "").split(',').map(k => k.trim()).filter(k => k.length > 10);
    return keys[Math.floor(Math.random() * keys.length)];
};

const LiveTeacher: React.FC<LiveTeacherProps> = ({ user, onClose, onUpdateUser, notify, onShowPayment }) => {
  const [status, setStatus] = useState<'idle' | 'connecting' | 'connected' | 'error'>('idle');
  const [subStatus, setSubStatus] = useState('');
  const [volume, setVolume] = useState(0); // Pour la visualisation
  const [isMuted, setIsMuted] = useState(false);
  const [duration, setDuration] = useState(0);
  
  // Refs pour gestion mémoire et audio
  const audioContextRef = useRef<AudioContext | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const wsSessionRef = useRef<any>(null); // Session Gemini
  const nextStartTimeRef = useRef(0); // Pour coller les morceaux audio sans trous
  const isMountedRef = useRef(true);

  useEffect(() => {
      isMountedRef.current = true;
      return () => {
          isMountedRef.current = false;
          handleHangup();
      };
  }, []);

  // Timer de facturation
  useEffect(() => {
      let interval: any;
      if (status === 'connected') {
          interval = setInterval(() => {
              setDuration(d => {
                  const next = d + 1;
                  if (next > 0 && next % 60 === 0) handleBilling();
                  return next;
              });
          }, 1000);
      }
      return () => clearInterval(interval);
  }, [status]);

  const handleBilling = async () => {
      const u = await storageService.deductCreditOrUsage(user.id);
      if (u) {
          onUpdateUser(u);
      } else {
          notify("Crédits épuisés !", "error");
          handleHangup();
      }
  };

  const startSession = async () => {
      if (!(await storageService.canRequest(user.id, 5))) {
          notify("Il faut 5 crédits minimum.", "error");
          onShowPayment();
          return;
      }

      setStatus('connecting');
      setSubStatus("Initialisation audio...");

      try {
          // 1. Initialiser l'AudioContext
          const AC = window.AudioContext || (window as any).webkitAudioContext;
          const ctx = new AC(); 
          await ctx.resume();
          audioContextRef.current = ctx;
          nextStartTimeRef.current = ctx.currentTime;

          // 2. Connexion Gemini
          const apiKey = getApiKey();
          if (!apiKey) throw new Error("Clé API manquante");

          const client = new GoogleGenAI({ apiKey });
          
          setSubStatus("Connexion IA...");
          
          // Prompt système strict pour forcer l'interaction
          const sysPrompt = `You are a friendly language teacher for ${user.preferences?.targetLanguage || 'English'} (Level: ${user.preferences?.level || 'Beginner'}). 
          Introduce yourself briefly in 1 sentence and ask a simple question to start the conversation.
          IMPORTANT: Speak immediately upon connection.`;

          const session = await client.live.connect({
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
                      if (isMountedRef.current) {
                          console.log(">>> LIVE CONNECTED");
                          setStatus('connected');
                          setSubStatus("En ligne");
                          // Note: On ne peut pas envoyer de texte ici avec la version actuelle du SDK Live
                          // On compte sur le systemInstruction pour déclencher la parole.
                      }
                  },
                  onmessage: async (msg: any) => {
                      // Audio du modèle
                      const audioData = msg.serverContent?.modelTurn?.parts?.[0]?.inlineData?.data;
                      if (audioData) {
                          setSubStatus("Teacher parle...");
                          await playAudioChunk(audioData, ctx);
                      }
                      
                      // Fin du tour
                      if (msg.serverContent?.turnComplete) {
                          setSubStatus("À vous...");
                          // Resynchronisation si latence
                          if (nextStartTimeRef.current < ctx.currentTime) {
                              nextStartTimeRef.current = ctx.currentTime;
                          }
                      }
                  },
                  onclose: () => {
                      console.log("Session closed");
                      handleHangup();
                  },
                  onerror: (err) => {
                      console.error("Session error", err);
                      notify("Erreur de connexion", "error");
                      handleHangup();
                  }
              }
          });

          wsSessionRef.current = session;

          // 3. Démarrer le Micro
          await startMicrophone(ctx, session);

      } catch (e: any) {
          console.error("Start Error", e);
          setStatus('error');
          setSubStatus(e.message || "Erreur technique");
      }
  };

  const startMicrophone = async (ctx: AudioContext, session: any) => {
      try {
          const stream = await navigator.mediaDevices.getUserMedia({
              audio: {
                  channelCount: 1,
                  echoCancellation: true,
                  noiseSuppression: true,
                  autoGainControl: true,
                  sampleRate: INPUT_SAMPLE_RATE // On demande, mais le navigateur peut ignorer
              }
          });
          mediaStreamRef.current = stream;

          const source = ctx.createMediaStreamSource(stream);
          const processor = ctx.createScriptProcessor(4096, 1, 1);
          processorRef.current = processor;

          processor.onaudioprocess = (e) => {
              if (isMuted || !wsSessionRef.current) return;

              const inputData = e.inputBuffer.getChannelData(0);
              const actualSampleRate = e.inputBuffer.sampleRate;

              // 1. Visualizer
              let sum = 0;
              for (let i = 0; i < inputData.length; i += 10) sum += inputData[i] * inputData[i];
              const rms = Math.sqrt(sum / (inputData.length / 10));
              setVolume(Math.min(100, rms * 500));

              // 2. Downsampling CRITIQUE (ex: 48k -> 16k)
              // C'est ici que la magie opère pour que l'IA comprenne la voix
              const downsampledData = downsampleBuffer(inputData, actualSampleRate, INPUT_SAMPLE_RATE);

              // 3. Conversion & Envoi
              const base64Audio = floatTo16BitPCM(downsampledData);
              
              try {
                  session.sendRealtimeInput({
                      mimeType: `audio/pcm;rate=${INPUT_SAMPLE_RATE}`,
                      data: base64Audio
                  });
              } catch (err) {
                  // Ignore erreurs si session fermée entre temps
              }
          };

          source.connect(processor);
          processor.connect(ctx.destination); // Nécessaire pour activer le scriptProcessor

      } catch (e) {
          console.error("Mic Error", e);
          throw new Error("Microphone inaccessible");
      }
  };

  const playAudioChunk = async (base64: string, ctx: AudioContext) => {
      try {
          if (ctx.state === 'suspended') await ctx.resume();

          const buffer = pcmToAudioBuffer(base64, ctx);
          const source = ctx.createBufferSource();
          source.buffer = buffer;
          source.connect(ctx.destination);

          const now = ctx.currentTime;
          // Gestion file d'attente
          if (nextStartTimeRef.current < now) {
              nextStartTimeRef.current = now + 0.05; // Petit buffer de sécurité
          }

          source.start(nextStartTimeRef.current);
          nextStartTimeRef.current += buffer.duration;

      } catch (e) {
          console.error("Playback Error", e);
      }
  };

  const handleHangup = () => {
      if (wsSessionRef.current) {
          try { wsSessionRef.current.close(); } catch(e){}
      }
      if (mediaStreamRef.current) {
          mediaStreamRef.current.getTracks().forEach(t => t.stop());
      }
      if (processorRef.current) {
          processorRef.current.disconnect();
      }
      if (audioContextRef.current) {
          audioContextRef.current.close().catch(() => {});
      }
      
      wsSessionRef.current = null;
      mediaStreamRef.current = null;
      processorRef.current = null;
      audioContextRef.current = null;
      
      if (isMountedRef.current && status !== 'error') {
          onClose();
      }
  };

  // --- RENDER UI ---

  if (status === 'idle') {
      return (
          <div className="fixed inset-0 z-[150] bg-slate-900/90 backdrop-blur-md flex items-center justify-center p-6 animate-fade-in font-sans">
              <div className="bg-white dark:bg-slate-900 w-full max-w-sm rounded-3xl p-8 text-center shadow-2xl relative border border-slate-200 dark:border-slate-800">
                  <button onClick={onClose} className="absolute top-4 right-4 p-2 text-slate-400 hover:text-red-500 transition-colors"><X className="w-5 h-5"/></button>
                  
                  <div className="w-24 h-24 bg-indigo-50 dark:bg-indigo-900/20 rounded-full flex items-center justify-center mx-auto mb-6 relative">
                      <div className="absolute inset-0 rounded-full border-2 border-indigo-500/20 animate-ping"></div>
                      <Phone className="w-10 h-10 text-indigo-600 dark:text-indigo-400" />
                  </div>
                  
                  <h2 className="text-2xl font-black text-slate-900 dark:text-white mb-2">Appel Live</h2>
                  <p className="text-slate-500 text-sm mb-6 px-4">
                      Discutez naturellement avec l'IA. <br/>Correction et fluidité en temps réel.
                  </p>
                  
                  <div className="flex flex-col gap-3">
                      <button 
                          onClick={startSession}
                          className="w-full py-4 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-2xl shadow-lg transition-transform active:scale-95 flex items-center justify-center gap-2"
                      >
                          <Phone className="w-5 h-5 fill-current" /> Démarrer (5 crédits)
                      </button>
                      <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">Coût : 1 crédit / minute après</p>
                  </div>
              </div>
          </div>
      );
  }

  if (status === 'error') {
      return (
          <div className="fixed inset-0 z-[150] bg-slate-900/90 flex items-center justify-center p-6 font-sans">
              <div className="bg-white dark:bg-slate-900 w-full max-w-sm rounded-3xl p-8 text-center shadow-2xl border-2 border-red-500/50">
                  <AlertCircle className="w-12 h-12 text-red-500 mx-auto mb-4" />
                  <h3 className="text-xl font-bold text-slate-800 dark:text-white mb-2">Erreur</h3>
                  <p className="text-sm text-slate-500 mb-6">{subStatus}</p>
                  <button onClick={onClose} className="w-full py-3 bg-slate-100 dark:bg-slate-800 font-bold rounded-xl">Fermer</button>
              </div>
          </div>
      );
  }

  // INTERFACE D'APPEL ACTIF
  return (
      <div className="fixed inset-0 z-[150] bg-slate-950 flex flex-col font-sans overflow-hidden">
          
          {/* Header */}
          <div className="p-8 pt-12 text-center relative z-10">
              <div className="inline-flex items-center gap-2 bg-emerald-500/10 border border-emerald-500/20 px-3 py-1 rounded-full mb-4">
                  {status === 'connecting' ? <Loader2 className="w-3 h-3 text-emerald-400 animate-spin"/> : <Wifi className="w-3 h-3 text-emerald-400"/>}
                  <span className="text-[10px] font-bold text-emerald-400 uppercase tracking-widest">
                      {status === 'connecting' ? 'CONNEXION...' : 'EN LIGNE'}
                  </span>
              </div>
              <h2 className="text-3xl font-black text-white tracking-tight">{user.preferences?.targetLanguage}</h2>
              <p className="text-indigo-400 font-mono text-sm mt-1">
                  {Math.floor(duration/60).toString().padStart(2,'0')}:{(duration%60).toString().padStart(2,'0')}
              </p>
          </div>

          {/* Visualizer Central */}
          <div className="flex-1 flex flex-col items-center justify-center relative w-full">
              {/* Cercles qui pulsent selon le volume */}
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                  <div className="w-48 h-48 rounded-full border border-indigo-500/30 transition-all duration-75" style={{ transform: `scale(${1 + volume/100})`, opacity: Math.min(1, volume/50) }}></div>
                  <div className="w-64 h-64 rounded-full border border-indigo-500/20 absolute transition-all duration-100" style={{ transform: `scale(${1 + volume/150})`, opacity: Math.min(0.5, volume/80) }}></div>
              </div>

              {/* Avatar */}
              <div className="relative z-10 w-40 h-40 rounded-full bg-slate-900 border-4 border-indigo-500 shadow-[0_0_50px_rgba(99,102,241,0.3)] overflow-hidden">
                  <img src="https://i.ibb.co/B2XmRwmJ/logo.png" className="w-full h-full object-cover p-6" alt="AI Teacher" />
              </div>

              {/* Statut Textuel */}
              <div className="mt-8 h-6">
                  <p className="text-slate-400 text-xs font-bold uppercase tracking-widest animate-pulse">
                      {subStatus}
                  </p>
              </div>
          </div>

          {/* Contrôles */}
          <div className="p-10 pb-16 flex items-center justify-center gap-8 relative z-10">
              <button 
                  onClick={() => setIsMuted(!isMuted)}
                  className={`p-5 rounded-full transition-all shadow-lg ${isMuted ? 'bg-white text-slate-900' : 'bg-slate-800 text-white hover:bg-slate-700'}`}
              >
                  {isMuted ? <MicOff className="w-6 h-6"/> : <Mic className="w-6 h-6"/>}
              </button>

              <button 
                  onClick={handleHangup}
                  className="w-20 h-20 bg-red-500 hover:bg-red-600 rounded-full flex items-center justify-center shadow-[0_0_30px_rgba(239,68,68,0.4)] transition-transform hover:scale-105"
              >
                  <Phone className="w-8 h-8 text-white fill-current rotate-[135deg]" />
              </button>

              <div className="p-5 rounded-full bg-slate-800 text-slate-500 opacity-50 cursor-not-allowed">
                  <Volume2 className="w-6 h-6"/>
              </div>
          </div>
      </div>
  );
};

export default LiveTeacher;
