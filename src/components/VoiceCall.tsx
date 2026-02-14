
import React, { useState, useEffect, useRef } from 'react';
import { X, Phone, Keyboard, Lightbulb, Wifi, AlertTriangle, Settings2, Globe, RefreshCcw, Mic, MicOff, Volume2, Loader2 } from 'lucide-react';
import { UserProfile } from '../types';
import { GoogleGenAI, Modality } from '@google/genai';
import { storageService } from '../services/storageService';

interface VoiceCallProps {
  user: UserProfile;
  onClose: () => void;
  onUpdateUser: (u: UserProfile) => void;
  notify: (m: string, t?: string) => void;
  onShowPayment: () => void;
}

// --- CONSTANTS ---
const TEACHER_AVATAR = "https://i.ibb.co/B2XmRwmJ/logo.png";

const LANGUAGES = [
    { code: 'Anglais', label: 'Anglais 🇬🇧', voice: 'Fenrir', bcp47: 'en-US' },
    { code: 'Français', label: 'Français 🇫🇷', voice: 'Zephyr', bcp47: 'fr-FR' },
    { code: 'Chinois', label: 'Chinois 🇨🇳', voice: 'Puck', bcp47: 'zh-CN' },
    { code: 'Espagnol', label: 'Espagnol 🇪🇸', voice: 'Kore', bcp47: 'es-ES' },
    { code: 'Allemand', label: 'Allemand 🇩🇪', voice: 'Fenrir', bcp47: 'de-DE' },
];

const LIVE_MODEL = 'gemini-2.5-flash-native-audio-preview-12-2025'; 

// --- AUDIO UTILS ---

// Convert Base64 (Server Output) -> AudioBuffer
function base64ToAudioBuffer(base64: string, ctx: AudioContext): Promise<AudioBuffer> {
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
    // Gemini Output is usually 24kHz
    const buffer = ctx.createBuffer(1, float32.length, 24000);
    buffer.copyToChannel(float32, 0);
    return Promise.resolve(buffer);
}

// Convert Float32 (Mic Input) -> Base64 PCM16
function floatTo16BitPCM(input: Float32Array) {
    const output = new Int16Array(input.length);
    for (let i = 0; i < input.length; i++) {
        const s = Math.max(-1, Math.min(1, input[i]));
        output[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
    }
    const bytes = new Uint8Array(output.buffer);
    let binary = '';
    const len = bytes.byteLength;
    for (let i = 0; i < len; i++) {
        binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
}

const getApiKeys = () => {
    const rawKey = process.env.API_KEY || "";
    return rawKey.split(',').map(k => k.trim()).filter(k => k.length >= 10);
};

const VoiceCall: React.FC<VoiceCallProps> = ({ user, onClose, onUpdateUser, notify, onShowPayment }) => {
  // UI States
  const [status, setStatus] = useState<'setup' | 'initializing' | 'connected' | 'error'>('setup');
  const [subStatus, setSubStatus] = useState<string>(''); // For detailed feedback (Listening/Speaking)
  const [errorMessage, setErrorMessage] = useState<string>('');
  const [duration, setDuration] = useState(0);
  const [audioLevel, setAudioLevel] = useState(0); // 0-100
  const [selectedLang, setSelectedLang] = useState(user.preferences?.targetLanguage?.split(' ')[0] || 'Anglais');
  const [isMicMuted, setIsMicMuted] = useState(false);

  // Refs for Audio Pipeline
  const audioCtxRef = useRef<AudioContext | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const sourceNodeRef = useRef<MediaStreamAudioSourceNode | null>(null);
  
  // Refs for Live Session
  const liveSessionRef = useRef<any>(null);
  const nextStartTimeRef = useRef(0);
  const mountedRef = useRef(true);

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
                  if (d > 0 && d % 60 === 0) consumeCredit();
                  return d + 1;
              });
          }, 1000);
      }
      return () => clearInterval(interval);
  }, [status]);

  const fullCleanup = () => {
      console.log("Cleaning up VoiceCall resources...");
      
      // Close Session
      if (liveSessionRef.current) {
          try { liveSessionRef.current.close(); } catch(e){}
          liveSessionRef.current = null;
      }

      // Stop Processor
      if (processorRef.current) {
          processorRef.current.disconnect();
          processorRef.current = null;
      }

      // Stop Source
      if (sourceNodeRef.current) {
          sourceNodeRef.current.disconnect();
          sourceNodeRef.current = null;
      }

      // Stop Tracks
      if (mediaStreamRef.current) {
          mediaStreamRef.current.getTracks().forEach(t => t.stop());
          mediaStreamRef.current = null;
      }

      // Close Context
      if (audioCtxRef.current) {
          audioCtxRef.current.close().catch(() => {});
          audioCtxRef.current = null;
      }
  };

  const consumeCredit = async () => {
      const updated = await storageService.deductCreditOrUsage(user.id);
      if (updated) {
          onUpdateUser(updated);
      } else {
          notify("Crédits épuisés.", "error");
          onShowPayment();
          onClose(); // Force close on credit exhaustion
      }
  };

  // --- START LOGIC ---

  const handleStart = async () => {
      const allowed = await storageService.canRequest(user.id);
      if (!allowed) {
          notify("Crédits insuffisants.", "error");
          onShowPayment();
          return;
      }

      setStatus('initializing');
      setSubStatus("Initialisation Audio...");
      setErrorMessage('');

      try {
          // 1. Initialize Audio Context (User Gesture)
          const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
          const ctx = new AudioContextClass(); // Let browser choose rate (usually 44100 or 48000)
          await ctx.resume();
          audioCtxRef.current = ctx;

          // 2. Connect Live API
          setSubStatus("Connexion IA...");
          await connectLiveSession(ctx);

      } catch (e: any) {
          console.error("Start Error:", e);
          setStatus('error');
          setErrorMessage(e.message || "Erreur inconnue");
          fullCleanup();
      }
  };

  const connectLiveSession = async (ctx: AudioContext) => {
      const keys = getApiKeys();
      if (keys.length === 0) throw new Error("Clé API manquante");
      
      const apiKey = keys[Math.floor(Math.random() * keys.length)];
      const ai = new GoogleGenAI({ apiKey });

      const sysPrompt = `
        You are a helpful language teacher. 
        Language: ${selectedLang}.
        Target Level: A1/A2 (Beginner).
        Keep responses SHORT (max 1 sentence).
        Speak slowly and clearly.
        IMPORTANT: Say hello immediately when connected.
      `;

      try {
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
                  onopen: async () => {
                      console.log(">>> Connected to Gemini Live <<<");
                      if (!mountedRef.current) return;
                      setStatus('connected');
                      setSubStatus("Connecté");
                      
                      // 3. Start Recording ONLY after connection is open
                      await startAudioCapture(ctx, session);

                      // 4. Send Initial Trigger to force Model to speak
                      setTimeout(() => {
                          if (mountedRef.current) {
                              console.log("Sending trigger...");
                              session.send([{ text: "Bonjour, présente-toi brièvement." }]);
                          }
                      }, 500); // Small delay to ensure audio pipeline is ready
                  },
                  onmessage: async (msg: any) => {
                      if (!mountedRef.current) return;
                      
                      // Handle Audio Output
                      const audioData = msg.serverContent?.modelTurn?.parts?.[0]?.inlineData?.data;
                      if (audioData) {
                          setSubStatus("Le prof parle...");
                          await playAudioChunk(audioData, ctx);
                      }

                      // Handle Turn Complete (Model finished speaking)
                      if (msg.serverContent?.turnComplete) {
                          setSubStatus("Je vous écoute...");
                          // Reset next start time if there was a gap
                          if (ctx.currentTime > nextStartTimeRef.current) {
                              nextStartTimeRef.current = ctx.currentTime;
                          }
                      }
                  },
                  onclose: (e) => {
                      console.log("Session Closed", e);
                      if (mountedRef.current) {
                          setStatus('error');
                          setErrorMessage("Session terminée par le serveur (Code: " + e.code + ")");
                      }
                  },
                  onerror: (e) => {
                      console.error("Session Error", e);
                      if (mountedRef.current) {
                          setStatus('error');
                          setErrorMessage("Erreur protocole Live.");
                      }
                  }
              }
          });

          liveSessionRef.current = session;
          // Initial Credit
          await consumeCredit();

      } catch (e: any) {
          throw new Error(`Echec WebSocket: ${e.message}`);
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

          // Use ScriptProcessor for capturing raw PCM
          // Buffer size 4096 gives decent latency/performance balance
          const processor = ctx.createScriptProcessor(4096, 1, 1);
          processorRef.current = processor;

          processor.onaudioprocess = (e) => {
              if (isMicMuted) return;

              const inputData = e.inputBuffer.getChannelData(0);
              
              // Visualization
              let sum = 0;
              for(let i = 0; i < inputData.length; i++) sum += inputData[i] * inputData[i];
              const rms = Math.sqrt(sum / inputData.length);
              setAudioLevel(Math.min(100, rms * 500));

              // Convert to PCM16 Base64
              const base64Data = floatTo16BitPCM(inputData);
              
              // Send to Model
              // CRITICAL: Send the ACTUAL sample rate of the context
              // If context is 48kHz, we must say rate=48000
              try {
                  session.sendRealtimeInput({
                      mimeType: `audio/pcm;rate=${ctx.sampleRate}`,
                      data: base64Data
                  });
              } catch(err) {
                  // Ignore send errors if session closed
              }
          };

          source.connect(processor);
          processor.connect(ctx.destination); // Needed for Chrome to fire events

      } catch (e: any) {
          throw new Error(`Erreur Micro: ${e.message}`);
      }
  };

  const playAudioChunk = async (base64: string, ctx: AudioContext) => {
      try {
          const buffer = await base64ToAudioBuffer(base64, ctx);
          const source = ctx.createBufferSource();
          source.buffer = buffer;
          source.connect(ctx.destination);

          const now = ctx.currentTime;
          // Schedule just after previous chunk
          const start = Math.max(now, nextStartTimeRef.current);
          
          source.start(start);
          nextStartTimeRef.current = start + buffer.duration;
      } catch (e) {
          console.error("Playback error", e);
      }
  };

  // --- RENDER ---

  // ERROR VIEW
  if (status === 'error') {
      return (
        <div className="fixed inset-0 z-[120] bg-slate-900/95 backdrop-blur-xl flex items-center justify-center p-6 animate-fade-in font-sans">
            <div className="bg-white dark:bg-slate-900 w-full max-w-sm rounded-3xl p-8 text-center shadow-2xl border-2 border-red-500/50">
                <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
                    <AlertTriangle className="w-8 h-8 text-red-600" />
                </div>
                <h3 className="text-xl font-black text-slate-800 dark:text-white mb-2">Oups !</h3>
                <p className="text-sm text-slate-500 mb-6">{errorMessage}</p>
                <div className="flex gap-3">
                    <button onClick={onClose} className="flex-1 py-3 bg-slate-100 rounded-xl font-bold">Quitter</button>
                    <button onClick={handleStart} className="flex-1 py-3 bg-indigo-600 text-white rounded-xl font-bold">Réessayer</button>
                </div>
            </div>
        </div>
      );
  }

  // SETUP VIEW
  if (status === 'setup') {
      return (
        <div className="fixed inset-0 z-[120] bg-slate-900/90 backdrop-blur-xl flex items-center justify-center p-6 animate-fade-in font-sans">
            <div className="bg-white dark:bg-slate-900 w-full max-w-sm rounded-3xl p-8 shadow-2xl border border-slate-200 dark:border-slate-800 relative">
                <button onClick={onClose} className="absolute top-4 right-4 p-2 bg-slate-100 dark:bg-slate-800 rounded-full hover:text-red-500"><X className="w-5 h-5"/></button>
                <div className="text-center mb-8">
                    <div className="w-20 h-20 bg-indigo-50 dark:bg-indigo-900/20 rounded-full flex items-center justify-center mx-auto mb-4 animate-bounce-slight">
                        <Mic className="w-10 h-10 text-indigo-600 dark:text-indigo-400" />
                    </div>
                    <h2 className="text-2xl font-black text-slate-900 dark:text-white">Appel Live</h2>
                    <p className="text-slate-500 text-sm mt-1">Conversation Fluide (Bêta)</p>
                </div>
                
                <div className="space-y-4">
                    <div>
                        <label className="text-xs font-bold text-slate-400 uppercase mb-2 block flex items-center gap-2"><Globe className="w-3 h-3" /> Langue Cible</label>
                        <div className="grid grid-cols-2 gap-2">
                            {LANGUAGES.map(l => (
                                <button key={l.code} onClick={() => setSelectedLang(l.code)} className={`px-3 py-2.5 rounded-xl text-sm font-bold border transition-all ${selectedLang === l.code ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-transparent'}`}>{l.label}</button>
                            ))}
                        </div>
                    </div>
                    <div className="bg-amber-50 dark:bg-amber-900/20 p-3 rounded-xl border border-amber-100 dark:border-amber-800/30 flex gap-2">
                        <Wifi className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                        <p className="text-xs text-amber-800 dark:text-amber-200 leading-tight">Nécessite une bonne connexion. Coût: 1 Crédit / min.</p>
                    </div>
                    <button onClick={handleStart} className="w-full py-4 bg-emerald-500 hover:bg-emerald-600 text-white font-black rounded-2xl shadow-lg shadow-emerald-500/30 active:scale-95 transition-all flex items-center justify-center gap-2">
                        <Phone className="w-5 h-5 fill-current" /> DÉMARRER
                    </button>
                </div>
            </div>
        </div>
      );
  }

  // CONNECTED / INITIALIZING VIEW
  return (
    <div className="fixed inset-0 z-[120] bg-slate-950 flex flex-col font-sans overflow-hidden">
        {/* Header */}
        <div className="relative z-10 p-8 pt-10 text-center">
            <div className={`inline-flex items-center gap-2 px-3 py-1 rounded-full backdrop-blur-md border mb-2 ${status === 'connected' ? 'bg-emerald-500/20 border-emerald-500/50 text-emerald-300' : 'bg-amber-500/20 border-amber-500/50 text-amber-300'}`}>
                <Wifi className="w-3 h-3 animate-pulse"/>
                <span className="text-[10px] font-bold uppercase tracking-wider">
                    {status === 'initializing' ? 'CONNEXION...' : 'LIVE CONNECTÉ'}
                </span>
            </div>
            <h2 className="text-3xl font-black text-white tracking-tight mb-1">Teacher {selectedLang}</h2>
            <p className="text-indigo-300 text-sm font-medium font-mono tracking-widest">
                {status === 'initializing' ? "Négociation..." : `${Math.floor(duration/60)}:${(duration%60).toString().padStart(2,'0')}`}
            </p>
        </div>

        {/* Visualizer Area */}
        <div className="relative flex-1 flex flex-col items-center justify-center w-full mb-10">
            {/* Avatar */}
            <div className={`relative w-40 h-40 rounded-full bg-slate-900 border-4 flex items-center justify-center overflow-hidden transition-all duration-500 z-20 ${subStatus.includes('parle') ? 'border-emerald-500 scale-110 shadow-[0_0_40px_rgba(16,185,129,0.4)]' : 'border-white/10'}`}>
                <img src={TEACHER_AVATAR} className="w-full h-full object-cover p-5" alt="Teacher" />
            </div>
            
            {/* Ripples when AI speaks */}
            {subStatus.includes('parle') && (
                <>
                    <div className="absolute w-60 h-60 rounded-full border border-emerald-500/30 animate-ping opacity-20"></div>
                    <div className="absolute w-80 h-80 rounded-full border border-emerald-500/20 animate-ping opacity-10 animation-delay-500"></div>
                </>
            )}

            {/* Audio Bars */}
            <div className="h-24 flex items-center justify-center gap-1.5 mt-10 w-full max-w-xs">
                {status === 'connected' ? (
                    [...Array(5)].map((_, i) => (
                        <div 
                            key={i} 
                            className={`w-2 rounded-full transition-all duration-75 ${subStatus.includes('parle') ? 'bg-emerald-500' : 'bg-indigo-500'}`} 
                            style={{ 
                                height: `${Math.max(8, audioLevel * (subStatus.includes('parle') ? 1.5 : 1) * (1 + Math.random()))}px`,
                                opacity: 0.8
                            }}
                        ></div>
                    ))
                ) : (
                    <Loader2 className="w-8 h-8 text-white/20 animate-spin" />
                )}
            </div>
            
            <p className="text-white/60 text-xs font-bold uppercase tracking-widest mt-6 animate-pulse">
                {subStatus}
            </p>
        </div>

        {/* Controls */}
        <div className="grid grid-cols-3 gap-8 w-full max-w-xs mx-auto items-center mb-12 relative z-10">
            <button onClick={() => setIsMicMuted(!isMicMuted)} className={`flex flex-col items-center gap-2 group transition-all ${isMicMuted ? 'text-red-400' : 'text-white'}`}>
                <div className={`w-14 h-14 rounded-full flex items-center justify-center ${isMicMuted ? 'bg-red-500/20' : 'bg-white/10'}`}>
                    {isMicMuted ? <MicOff className="w-6 h-6"/> : <Mic className="w-6 h-6"/>}
                </div>
                <span className="text-[10px] font-bold uppercase opacity-50">{isMicMuted ? 'Muté' : 'Micro On'}</span>
            </button>

            <button onClick={onClose} className="flex flex-col items-center gap-2 group hover:scale-105 transition-transform">
                <div className="w-20 h-20 rounded-full bg-red-500 flex items-center justify-center shadow-lg shadow-red-500/40">
                    <Phone className="w-8 h-8 text-white fill-white rotate-[135deg]" />
                </div>
                <span className="text-[10px] font-bold uppercase text-white/50">Raccrocher</span>
            </button>

            <button className="flex flex-col items-center gap-2 group opacity-50 cursor-not-allowed">
                <div className="w-14 h-14 rounded-full bg-white/10 flex items-center justify-center text-white"><Keyboard className="w-6 h-6"/></div>
                <span className="text-[10px] font-bold uppercase opacity-50">Clavier</span>
            </button>
        </div>
    </div>
  );
};

export default VoiceCall;
