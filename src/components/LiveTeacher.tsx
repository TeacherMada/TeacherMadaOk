
import React, { useState, useEffect, useRef } from 'react';
import { X, Mic, MicOff, Phone, Wifi, Loader2, AlertCircle, Volume2, Activity } from 'lucide-react';
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

// 2. Rééchantillonnage (Downsampling) : 44.1/48kHz -> 16kHz
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
    // Rotation basique si plusieurs clés
    const keys = (process.env.API_KEY || "").split(',').map(k => k.trim()).filter(k => k.length > 10);
    return keys[Math.floor(Math.random() * keys.length)];
};

const LiveTeacher: React.FC<LiveTeacherProps> = ({ user, onClose, onUpdateUser, notify, onShowPayment }) => {
  const [status, setStatus] = useState<'idle' | 'connecting' | 'connected' | 'error'>('idle');
  const [subStatus, setSubStatus] = useState('');
  const [volume, setVolume] = useState(0); // Pour la visualisation
  const [isMuted, setIsMuted] = useState(false);
  const [duration, setDuration] = useState(0);
  const [teacherSpeaking, setTeacherSpeaking] = useState(false);
  
  // Refs pour gestion mémoire et audio
  const audioContextRef = useRef<AudioContext | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const nextStartTimeRef = useRef(0); // Pour coller les morceaux audio sans trous
  const isMountedRef = useRef(true);
  const activeSourceRef = useRef<AudioBufferSourceNode | null>(null);

  useEffect(() => {
      isMountedRef.current = true;
      // Démarrage auto
      startSession();
      
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
                  // Facturation chaque minute
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
          notify("Il faut 5 crédits minimum pour l'appel Live.", "error");
          onShowPayment();
          onClose();
          return;
      }

      setStatus('connecting');
      setSubStatus("Initialisation audio...");

      try {
          // 1. Initialiser l'AudioContext (Impératif sur click utilisateur ou au mount si autorisé)
          const AC = window.AudioContext || (window as any).webkitAudioContext;
          const ctx = new AC(); // Pas de sampleRate forcé ici, on s'adapte au hardware
          await ctx.resume();
          audioContextRef.current = ctx;
          nextStartTimeRef.current = ctx.currentTime + 0.1; // Buffer initial

          // 2. Connexion Gemini
          const apiKey = getApiKey();
          if (!apiKey) throw new Error("Clé API manquante");

          const client = new GoogleGenAI({ apiKey });
          
          setSubStatus("Connexion IA...");
          
          // Prompt système strict
          const sysPrompt = `You are TeacherMada, a friendly language teacher helping user learn ${user.preferences?.targetLanguage || 'French'}.
          Level: ${user.preferences?.level || 'Beginner'}.
          Keep responses concise and conversational (1-2 sentences max).
          Correction policy: Gently correct mistakes before answering.`;

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
                          
                          // FORCE TEACHER TO SPEAK FIRST
                          // On envoie un message texte "caché" pour déclencher la réponse audio
                          session.send([{ text: "Introduce yourself briefly and ask me a simple question." }], true);
                      }
                  },
                  onmessage: async (msg: any) => {
                      // Audio du modèle
                      const audioData = msg.serverContent?.modelTurn?.parts?.[0]?.inlineData?.data;
                      if (audioData) {
                          setTeacherSpeaking(true);
                          setSubStatus("Le prof parle...");
                          await playAudioChunk(audioData, ctx);
                      }
                      
                      // Fin du tour
                      if (msg.serverContent?.turnComplete) {
                          setTeacherSpeaking(false);
                          setSubStatus("À vous...");
                          // Resynchronisation si latence excessive
                          if (nextStartTimeRef.current < ctx.currentTime) {
                              nextStartTimeRef.current = ctx.currentTime;
                          }
                      }
                  },
                  onclose: () => {
                      console.log("Session closed remote");
                      handleHangup();
                  },
                  onerror: (err) => {
                      console.error("Session error", err);
                      // Ignore les erreurs mineures de fermeture
                      if (isMountedRef.current) {
                          // notify("Erreur de connexion live", "error");
                      }
                  }
              }
          });

          // 3. Démarrer le Micro et le streaming vers l'IA
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
              }
          });
          mediaStreamRef.current = stream;

          const source = ctx.createMediaStreamSource(stream);
          // Utilisation de ScriptProcessor (legacy mais large support) pour capter le PCM
          const processor = ctx.createScriptProcessor(4096, 1, 1);
          processorRef.current = processor;

          processor.onaudioprocess = (e) => {
              // Ne pas envoyer si on est en mute
              if (isMuted) return;

              const inputData = e.inputBuffer.getChannelData(0);
              const actualSampleRate = e.inputBuffer.sampleRate;

              // 1. Visualizer (RMS)
              let sum = 0;
              // Echantillonnage partiel pour perf
              for (let i = 0; i < inputData.length; i += 10) sum += inputData[i] * inputData[i];
              const rms = Math.sqrt(sum / (inputData.length / 10));
              setVolume(Math.min(100, rms * 400)); // Amplification visuelle

              // 2. Downsampling CRITIQUE (ex: 48k -> 16k)
              // C'est ici que la magie opère pour que l'IA comprenne la voix
              const downsampledData = downsampleBuffer(inputData, actualSampleRate, INPUT_SAMPLE_RATE);

              // 3. Conversion & Envoi
              const base64Audio = floatTo16BitPCM(downsampledData);
              
              try {
                  // Envoi en temps réel
                  session.sendRealtimeInput([{
                      mimeType: `audio/pcm;rate=${INPUT_SAMPLE_RATE}`,
                      data: base64Audio
                  }]);
              } catch (err) {
                  // Session fermée ou erreur réseau
              }
          };

          source.connect(processor);
          // Hack: le processor doit être connecté à la destination pour "tirer" le flux,
          // mais on met le gain à 0 pour ne pas s'entendre soi-même (feedback loop).
          const muteNode = ctx.createGain();
          muteNode.gain.value = 0;
          processor.connect(muteNode);
          muteNode.connect(ctx.destination);

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
          // Gestion file d'attente "Gapless"
          // Si le temps prévu est passé, on joue tout de suite
          // Sinon on planifie à la suite du morceau précédent
          const startTime = Math.max(now, nextStartTimeRef.current);
          
          source.start(startTime);
          nextStartTimeRef.current = startTime + buffer.duration;
          
          activeSourceRef.current = source;

      } catch (e) {
          console.error("Playback Error", e);
      }
  };

  const handleHangup = () => {
      if (mediaStreamRef.current) {
          mediaStreamRef.current.getTracks().forEach(t => t.stop());
      }
      if (processorRef.current) {
          processorRef.current.disconnect();
      }
      if (audioContextRef.current) {
          audioContextRef.current.close().catch(() => {});
      }
      
      mediaStreamRef.current = null;
      processorRef.current = null;
      audioContextRef.current = null;
      
      if (isMountedRef.current && status !== 'error') {
          onClose();
      }
  };

  // --- RENDER UI ---

  return (
      <div className="fixed inset-0 z-[150] bg-slate-950 flex flex-col font-sans overflow-hidden">
          
          {/* Header */}
          <div className="p-8 pt-12 text-center relative z-10">
              <div className={`inline-flex items-center gap-2 px-3 py-1 rounded-full backdrop-blur-md border mb-4 transition-all ${
                  status === 'connected' ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400' : 'bg-slate-800 border-slate-700 text-slate-400'
              }`}>
                  {status === 'connecting' ? <Loader2 className="w-3 h-3 animate-spin"/> : <Wifi className="w-3 h-3"/>}
                  <span className="text-[10px] font-bold uppercase tracking-widest">
                      {status === 'connecting' ? 'CONNEXION...' : status === 'connected' ? 'EN LIGNE' : 'ERREUR'}
                  </span>
              </div>
              <h2 className="text-3xl font-black text-white tracking-tight">{user.preferences?.targetLanguage}</h2>
              <p className="text-indigo-400 font-mono text-sm mt-1">
                  {Math.floor(duration/60).toString().padStart(2,'0')}:{(duration%60).toString().padStart(2,'0')}
              </p>
          </div>

          {/* Visualizer Central */}
          <div className="flex-1 flex flex-col items-center justify-center relative w-full">
              {/* Cercles qui pulsent selon le volume ou l'activité du prof */}
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                  {/* Pulse Micro Utilisateur */}
                  {!teacherSpeaking && (
                      <>
                        <div className="w-48 h-48 rounded-full border border-indigo-500/30 transition-all duration-75" style={{ transform: `scale(${1 + volume/100})`, opacity: Math.min(1, volume/50) }}></div>
                        <div className="w-64 h-64 rounded-full border border-indigo-500/20 absolute transition-all duration-100" style={{ transform: `scale(${1 + volume/150})`, opacity: Math.min(0.5, volume/80) }}></div>
                      </>
                  )}
                  {/* Pulse Professeur */}
                  {teacherSpeaking && (
                      <>
                        <div className="w-56 h-56 rounded-full bg-emerald-500/10 animate-ping absolute"></div>
                        <div className="w-48 h-48 rounded-full border-2 border-emerald-500/50 animate-pulse absolute"></div>
                      </>
                  )}
              </div>

              {/* Avatar */}
              <div className={`relative z-10 w-40 h-40 rounded-full bg-slate-900 border-4 shadow-[0_0_50px_rgba(99,102,241,0.3)] overflow-hidden transition-colors duration-300 ${teacherSpeaking ? 'border-emerald-500' : 'border-indigo-500'}`}>
                  <img src="https://i.ibb.co/B2XmRwmJ/logo.png" className="w-full h-full object-cover p-6" alt="AI Teacher" />
              </div>

              {/* Statut Textuel */}
              <div className="mt-8 h-6 flex items-center gap-2">
                  {teacherSpeaking ? (
                      <Activity className="w-4 h-4 text-emerald-400 animate-bounce" />
                  ) : (
                      <div className={`w-2 h-2 rounded-full ${isMuted ? 'bg-red-500' : 'bg-indigo-500 animate-pulse'}`}></div>
                  )}
                  <p className="text-slate-400 text-xs font-bold uppercase tracking-widest">
                      {subStatus}
                  </p>
              </div>
          </div>

          {/* Erreur overlay */}
          {status === 'error' && (
              <div className="absolute inset-0 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center z-50">
                  <div className="bg-slate-900 p-6 rounded-2xl border border-red-500/50 text-center max-w-xs">
                      <AlertCircle className="w-10 h-10 text-red-500 mx-auto mb-3" />
                      <h3 className="text-white font-bold mb-1">Erreur de connexion</h3>
                      <p className="text-slate-400 text-xs mb-4">{subStatus}</p>
                      <button onClick={onClose} className="w-full py-3 bg-white text-slate-900 font-bold rounded-xl">Quitter</button>
                  </div>
              </div>
          )}

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
