
import React, { useState, useEffect, useRef } from 'react';
import { Mic, MicOff, Phone, Wifi, Loader2, AlertCircle, Activity, Volume2, Sparkles } from 'lucide-react';
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
const INPUT_SAMPLE_RATE = 16000;
const OUTPUT_SAMPLE_RATE = 24000;

// --- UTILS AUDIO ---
const pcmToAudioBuffer = (base64: string, ctx: AudioContext) => {
    const binaryString = atob(base64);
    const len = binaryString.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) bytes[i] = binaryString.charCodeAt(i);
    
    const pcm16 = new Int16Array(bytes.buffer);
    const float32 = new Float32Array(pcm16.length);
    for (let i = 0; i < pcm16.length; i++) float32[i] = pcm16[i] / 32768.0;
    
    const buffer = ctx.createBuffer(1, float32.length, OUTPUT_SAMPLE_RATE);
    buffer.copyToChannel(float32, 0);
    return buffer;
};

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

const floatTo16BitPCM = (input: Float32Array) => {
    const output = new Int16Array(input.length);
    for (let i = 0; i < input.length; i++) {
        const s = Math.max(-1, Math.min(1, input[i]));
        output[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
    }
    const bytes = new Uint8Array(output.buffer);
    let binary = '';
    const len = bytes.byteLength;
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
  const [volume, setVolume] = useState(0); // 0 to 100
  const [isMuted, setIsMuted] = useState(false);
  const [duration, setDuration] = useState(0);
  const [teacherSpeaking, setTeacherSpeaking] = useState(false);
  
  const audioContextRef = useRef<AudioContext | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const nextStartTimeRef = useRef(0);
  const isMountedRef = useRef(true);

  // Animation Refs
  const visualizerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
      isMountedRef.current = true;
      startSession();
      return () => {
          isMountedRef.current = false;
          handleHangup();
      };
  }, []);

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
          notify("Il faut 5 crédits minimum pour l'appel Live.", "error");
          onShowPayment();
          onClose();
          return;
      }

      setStatus('connecting');
      setSubStatus("Initialisation...");

      try {
          const AC = window.AudioContext || (window as any).webkitAudioContext;
          const ctx = new AC(); 
          await ctx.resume();
          audioContextRef.current = ctx;
          nextStartTimeRef.current = ctx.currentTime + 0.1;

          const apiKey = getApiKey();
          if (!apiKey) throw new Error("Clé API manquante");

          const client = new GoogleGenAI({ apiKey });
          
          setSubStatus("Connexion IA...");
          
          // --- PROMPT SYSTÈME AVANCÉ ---
          const sysPrompt = `
          IDENTITY: You are "TeacherMada", a highly professional, warm, and natural language tutor.
          TARGET LANGUAGE: ${user.preferences?.targetLanguage || 'French'}.
          USER LEVEL: ${user.preferences?.level || 'Beginner'}.
          
          STYLE & TONE:
          - Voice: Use a natural, conversational prosody. Be enthusiastic but patient.
          - Emotion: Show empathy. If the user struggles, be encouraging. If they succeed, be genuinely happy.
          - Role: Simulate a real voice call with a human tutor. Avoid robotic phrasing.
          
          PEDAGOGY:
          1. Start by introducing yourself briefly and warmly.
          2. Ask a simple open question to gauge the user's mood or readiness.
          3. Guide the conversation step-by-step.
          4. Gentle Correction: Do not interrupt. Wait for the user to finish, then gently suggest a better way to say it before continuing.
          
          CRITICAL INSTRUCTION:
          You MUST speak first immediately upon connection. Introduce yourself and welcome the student.
          `;

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
                          setStatus('connected');
                          setSubStatus("En ligne");
                          
                          // FORCE TEACHER TO SPEAK FIRST
                          // Envoi d'un message textuel caché pour déclencher la réponse audio immédiate
                          // @ts-ignore - 'send' exists on session but might be missing in type definition depending on version
                          session.send([{ text: "Bonjour ! Introduce yourself as TeacherMada and ask me how I am doing today." }], true);
                      }
                  },
                  onmessage: async (msg: any) => {
                      const audioData = msg.serverContent?.modelTurn?.parts?.[0]?.inlineData?.data;
                      if (audioData) {
                          setTeacherSpeaking(true);
                          setSubStatus("TeacherMada parle...");
                          await playAudioChunk(audioData, ctx);
                      }
                      
                      if (msg.serverContent?.turnComplete) {
                          setTeacherSpeaking(false);
                          setSubStatus("Je vous écoute...");
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
                  }
              }
          });

          await startMicrophone(ctx, session);

      } catch (e: any) {
          setStatus('error');
          setSubStatus("Erreur technique");
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
          const processor = ctx.createScriptProcessor(4096, 1, 1);
          processorRef.current = processor;

          processor.onaudioprocess = (e) => {
              if (isMuted) return;

              const inputData = e.inputBuffer.getChannelData(0);
              
              // Visualizer fluidité
              let sum = 0;
              // Sampling plus large pour éviter performance hit
              for (let i = 0; i < inputData.length; i += 10) sum += inputData[i] * inputData[i];
              const rms = Math.sqrt(sum / (inputData.length / 10));
              
              // Lissage visuel pour éviter les sauts brusques
              setVolume(v => v * 0.8 + (rms * 100) * 0.2);

              const downsampledData = downsampleBuffer(inputData, e.inputBuffer.sampleRate, INPUT_SAMPLE_RATE);
              const base64Audio = floatTo16BitPCM(downsampledData);
              
              try {
                  session.sendRealtimeInput({
                      media: {
                          mimeType: `audio/pcm;rate=${INPUT_SAMPLE_RATE}`,
                          data: base64Audio
                      }
                  });
              } catch (err) {}
          };

          source.connect(processor);
          const muteNode = ctx.createGain();
          muteNode.gain.value = 0;
          processor.connect(muteNode);
          muteNode.connect(ctx.destination);

      } catch (e) {
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
          const startTime = Math.max(now, nextStartTimeRef.current);
          
          source.start(startTime);
          nextStartTimeRef.current = startTime + buffer.duration;
      } catch (e) {
          console.error("Playback Error", e);
      }
  };

  const handleHangup = () => {
      if (mediaStreamRef.current) mediaStreamRef.current.getTracks().forEach(t => t.stop());
      if (processorRef.current) processorRef.current.disconnect();
      if (audioContextRef.current) audioContextRef.current.close().catch(() => {});
      
      mediaStreamRef.current = null;
      processorRef.current = null;
      audioContextRef.current = null;
      
      if (isMountedRef.current && status !== 'error') onClose();
  };

  // UI HELPERS
  // Mapping du volume (0-100) vers une échelle CSS (1.0 - 2.5)
  const scale = 1 + (volume / 20); 

  return (
      <div className="fixed inset-0 z-[150] bg-[#0B0F19] flex flex-col font-sans overflow-hidden">
          
          {/* Background Ambient Glow - Animated */}
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-indigo-600/10 rounded-full blur-[120px] pointer-events-none animate-pulse-slow"></div>

          {/* Header */}
          <div className="p-8 pt-12 text-center relative z-10 flex flex-col items-center">
              <div className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full backdrop-blur-md border mb-6 transition-all shadow-lg ${
                  status === 'connected' 
                  ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400' 
                  : 'bg-slate-800/50 border-slate-700 text-slate-400'
              }`}>
                  {status === 'connecting' ? <Loader2 className="w-3 h-3 animate-spin"/> : <Wifi className="w-3 h-3"/>}
                  <span className="text-[10px] font-black uppercase tracking-widest">
                      {status === 'connecting' ? 'CONNEXION...' : status === 'connected' ? 'APPEL EN COURS' : 'ERREUR'}
                  </span>
              </div>
              
              <h2 className="text-3xl md:text-4xl font-black text-white tracking-tight drop-shadow-md">TeacherMada</h2>
              <div className="flex items-center gap-2 mt-2 text-indigo-400 font-medium">
                  <Sparkles className="w-4 h-4" />
                  <span className="text-sm">{user.preferences?.targetLanguage || 'Apprentissage'} • Niveau {user.preferences?.level}</span>
              </div>
              <p className="text-slate-500 font-mono text-xs mt-4 tracking-widest bg-slate-900/50 px-3 py-1 rounded-lg border border-slate-800">
                  {Math.floor(duration/60).toString().padStart(2,'0')}:{(duration%60).toString().padStart(2,'0')}
              </p>
          </div>

          {/* Visualizer Central */}
          <div className="flex-1 flex flex-col items-center justify-center relative w-full mb-10">
              
              {/* Effets d'Ondes Visuelles (User Speaking) */}
              {!teacherSpeaking && (
                  <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                        {/* Cercle 1 - Réactif */}
                        <div className="absolute w-48 h-48 rounded-full border border-indigo-500/40 transition-transform duration-75 ease-out" 
                             style={{ transform: `scale(${scale})`, opacity: Math.min(1, volume * 0.1) }}></div>
                        {/* Cercle 2 - Echo */}
                        <div className="absolute w-60 h-60 rounded-full border border-indigo-500/20 transition-transform duration-150 ease-out" 
                             style={{ transform: `scale(${scale * 0.9})`, opacity: Math.min(0.6, volume * 0.08) }}></div>
                        {/* Cercle 3 - Large */}
                        <div className="absolute w-80 h-80 rounded-full border border-indigo-500/10 transition-transform duration-300 ease-out" 
                             style={{ transform: `scale(${scale * 0.8})`, opacity: Math.min(0.3, volume * 0.05) }}></div>
                  </div>
              )}

              {/* Effets Pulsation (Teacher Speaking) */}
              {teacherSpeaking && (
                  <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                        <div className="absolute w-52 h-52 rounded-full bg-emerald-500/10 animate-ping"></div>
                        <div className="absolute w-64 h-64 rounded-full border-2 border-emerald-500/20 animate-pulse"></div>
                  </div>
              )}

              {/* Avatar Central */}
              <div className={`relative z-20 w-44 h-44 rounded-full bg-[#0F1422] flex items-center justify-center transition-all duration-500 shadow-2xl ${
                  teacherSpeaking 
                  ? 'scale-110 border-4 border-emerald-500 shadow-[0_0_60px_rgba(16,185,129,0.4)]' 
                  : 'border-4 border-indigo-500/30 shadow-[0_0_40px_rgba(99,102,241,0.15)]'
              }`}>
                  <img src="https://i.ibb.co/B2XmRwmJ/logo.png" className="w-28 h-28 object-contain" alt="AI Teacher" />
                  
                  {/* Status Dot on Avatar */}
                  <div className={`absolute bottom-4 right-4 w-6 h-6 rounded-full border-4 border-[#0F1422] flex items-center justify-center transition-colors ${teacherSpeaking ? 'bg-emerald-500' : 'bg-indigo-500'}`}>
                      {teacherSpeaking ? (
                          <Activity className="w-3 h-3 text-white animate-bounce" />
                      ) : (
                          <div className="w-2 h-2 bg-white rounded-full"></div>
                      )}
                  </div>
              </div>

              {/* Status Textuel Dynamique */}
              <div className="mt-16 h-8 flex items-center gap-3 px-6 py-2 rounded-2xl bg-white/5 backdrop-blur-md border border-white/10 transition-all duration-500">
                  {teacherSpeaking ? (
                      <>
                        <Volume2 className="w-4 h-4 text-emerald-400 animate-pulse" />
                        <span className="text-emerald-100 text-xs font-bold uppercase tracking-wide">TeacherMada parle...</span>
                      </>
                  ) : (
                      <>
                        <Mic className={`w-4 h-4 ${isMuted ? 'text-red-500' : 'text-indigo-400'}`} />
                        <span className="text-indigo-100 text-xs font-bold uppercase tracking-wide">
                            {isMuted ? "Micro coupé" : "Je vous écoute..."}
                        </span>
                      </>
                  )}
              </div>
          </div>

          {/* Erreur overlay */}
          {status === 'error' && (
              <div className="absolute inset-0 bg-slate-950/90 backdrop-blur-md flex items-center justify-center z-50 animate-fade-in">
                  <div className="bg-[#1E293B] p-8 rounded-3xl border border-red-500/30 text-center max-w-xs shadow-2xl">
                      <div className="w-16 h-16 bg-red-500/20 rounded-full flex items-center justify-center mx-auto mb-4">
                          <AlertCircle className="w-8 h-8 text-red-500" />
                      </div>
                      <h3 className="text-white font-black text-lg mb-2">Connexion Interrompue</h3>
                      <p className="text-slate-400 text-xs mb-6 font-medium leading-relaxed">{subStatus || "Vérifiez votre connexion internet."}</p>
                      <button onClick={onClose} className="w-full py-3.5 bg-white text-slate-900 font-bold rounded-2xl hover:scale-[1.02] transition-transform">Fermer</button>
                  </div>
              </div>
          )}

          {/* Contrôles Glassmorphism */}
          <div className="p-8 pb-12 flex items-center justify-center gap-8 relative z-10">
              <button 
                  onClick={() => setIsMuted(!isMuted)}
                  className={`p-6 rounded-full transition-all duration-300 shadow-xl backdrop-blur-sm border group ${
                      isMuted 
                      ? 'bg-white text-slate-900 border-white rotate-180' 
                      : 'bg-slate-800/60 text-white border-slate-700 hover:bg-slate-700'
                  }`}
              >
                  {isMuted ? <MicOff className="w-6 h-6"/> : <Mic className="w-6 h-6 group-hover:scale-110 transition-transform"/>}
              </button>

              <button 
                  onClick={handleHangup}
                  className="w-24 h-24 bg-red-500 hover:bg-red-600 rounded-full flex items-center justify-center shadow-[0_0_40px_rgba(239,68,68,0.4)] transition-all hover:scale-105 active:scale-95 group border-4 border-red-400/50"
              >
                  <Phone className="w-10 h-10 text-white fill-current rotate-[135deg] group-hover:animate-pulse" />
              </button>

              {/* Bouton Speaker fictif pour symétrie */}
              <div className="p-6 rounded-full bg-slate-800/40 text-slate-600 border border-slate-800/50 cursor-default">
                  <Volume2 className="w-6 h-6"/>
              </div>
          </div>
      </div>
  );
};

export default LiveTeacher;
