
import React, { useState, useEffect, useRef } from 'react';
import { X, Phone, Keyboard, Send, Lock, Loader2, ChevronDown, Lightbulb, Languages, Sparkles, Mic, Volume2, Wifi, WifiOff, Activity, AlertTriangle, Settings2, Globe } from 'lucide-react';
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
const LANGUAGES = [
    { code: 'Anglais', label: 'Anglais 🇬🇧', voice: 'Fenrir', bcp47: 'en-US' },
    { code: 'Français', label: 'Français 🇫🇷', voice: 'Zephyr', bcp47: 'fr-FR' },
    { code: 'Chinois', label: 'Chinois 🇨🇳', voice: 'Puck', bcp47: 'zh-CN' },
    { code: 'Espagnol', label: 'Espagnol 🇪🇸', voice: 'Kore', bcp47: 'es-ES' },
    { code: 'Allemand', label: 'Allemand 🇩🇪', voice: 'Fenrir', bcp47: 'de-DE' },
];

const LIVE_MODEL = 'gemini-2.0-flash-exp'; 

// --- UTILS ---
const getApiKeys = () => {
    const rawKey = process.env.API_KEY || "";
    return rawKey.split(',').map(k => k.trim()).filter(k => k.length >= 10);
};

// PCM Utils for Level 1 & 2
function base64ToAudioBuffer(base64: string, ctx: AudioContext, sampleRate: number = 24000): Promise<AudioBuffer> {
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
    const buffer = ctx.createBuffer(1, float32.length, sampleRate);
    buffer.copyToChannel(float32, 0);
    return Promise.resolve(buffer);
}

// Encode float32 to base64 PCM16 (For Live Input)
function floatTo16BitPCM(input: Float32Array) {
    const output = new Int16Array(input.length);
    for (let i = 0; i < input.length; i++) {
        const s = Math.max(-1, Math.min(1, input[i]));
        output[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
    }
    const bytes = new Uint8Array(output.buffer);
    let binary = '';
    for (let i = 0; i < bytes.byteLength; i++) {
        binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
}

const VoiceCall: React.FC<VoiceCallProps> = ({ user, onClose, onUpdateUser, notify, onShowPayment }) => {
  // Architecture Level: 1=Live Only (Test Mode)
  const [archLevel, setArchLevel] = useState<1 | 2 | 3>(1);
  
  // UI States
  const [status, setStatus] = useState<'setup' | 'ringing' | 'connecting' | 'connected' | 'speaking' | 'listening' | 'processing'>('setup');
  const [duration, setDuration] = useState(0);
  const [audioLevel, setAudioLevel] = useState(0);
  const [selectedLang, setSelectedLang] = useState(user.preferences?.targetLanguage?.split(' ')[0] || 'Anglais');
  
  // Interaction
  const [currentTeacherText, setCurrentTeacherText] = useState('');
  const [showHint, setShowHint] = useState(false);

  // --- REFS ---
  const audioCtxRef = useRef<AudioContext | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null); // For Live Input
  const streamRef = useRef<MediaStream | null>(null);
  
  // Live Specific Refs
  const liveSessionRef = useRef<any>(null);
  const nextStartTimeRef = useRef(0);
  
  const mountedRef = useRef(true);
  const TEACHER_AVATAR = "https://i.ibb.co/B2XmRwmJ/logo.png";

  // --- LIFECYCLE ---
  useEffect(() => {
      mountedRef.current = true;
      return () => { 
          mountedRef.current = false; 
          cleanup();
      };
  }, []);

  useEffect(() => {
      let interval: any;
      if (status !== 'setup' && status !== 'ringing' && status !== 'connecting') {
          interval = setInterval(() => {
              setDuration(d => {
                  // Live Mode Cost: 1 Credit per minute
                  if (archLevel === 1 && d > 0 && d % 60 === 0) {
                      consumeCredit();
                  }
                  return d + 1;
              });
          }, 1000);
      }
      return () => clearInterval(interval);
  }, [status, archLevel]);

  const cleanup = () => {
      // Clean Live
      if (liveSessionRef.current) {
          try { liveSessionRef.current.close(); } catch(e){}
      }
      // Clean Audio
      if (streamRef.current) streamRef.current.getTracks().forEach(t => t.stop());
      if (processorRef.current) { processorRef.current.disconnect(); processorRef.current = null; }
      if (audioCtxRef.current) {
          audioCtxRef.current.close().catch(() => {});
          audioCtxRef.current = null;
      }
  };

  const consumeCredit = async () => {
      const updated = await storageService.deductCreditOrUsage(user.id);
      if (updated) {
          onUpdateUser(updated);
          return true;
      } else {
          notify("Crédits épuisés.", "error");
          onShowPayment();
          onClose();
          return false;
      }
  };

  // --- INITIALIZATION ---

  const handleStartCall = async () => {
      const allowed = await storageService.canRequest(user.id);
      if (!allowed) {
          notify("Crédits insuffisants.", "error");
          onShowPayment();
          return;
      }

      setStatus('ringing');
      
      // Init Audio Context (User Gesture)
      try {
          const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
          const ctx = new AudioContextClass({ sampleRate: 24000 }); // Gemini Native Rate
          await ctx.resume();
          audioCtxRef.current = ctx;
          playRingingTone(ctx);
      } catch (e) {
          console.error("Audio Context Init Failed", e);
          notify("Erreur initialisation Audio. Vérifiez votre navigateur.", "error");
      }

      // Attempt Level 1 (Live) after delay
      setTimeout(() => {
          if (mountedRef.current) {
              connectLevel1_Live();
          }
      }, 2000);
  };

  const playRingingTone = (ctx: AudioContext) => {
      try {
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.connect(gain);
          gain.connect(ctx.destination);
          osc.frequency.value = 440; 
          gain.gain.value = 0.05;
          osc.start();
          osc.stop(ctx.currentTime + 0.4);
      } catch(e){}
  };

  const getSystemPrompt = () => `
    CONTEXTE: Appel téléphonique Vocal Live.
    RÔLE: Professeur de langue natif (${selectedLang}).
    TON: Amical, encourageant, conversationnel.
    RÈGLES:
    1. Réponses COURTES (max 15 mots).
    2. Pose toujours une question de relance.
    3. IMPÉRATIF: PRENDS LA PAROLE IMMÉDIATEMENT (Dis "Bonjour, je suis ton prof ${selectedLang}, on commence ?").
  `;

  // --- LEVEL 1: GEMINI LIVE ONLY (TEST MODE) ---

  const connectLevel1_Live = async () => {
      setStatus('connecting');
      const keys = getApiKeys();
      if (keys.length === 0) {
          notify("Aucune Clé API trouvée (Mode Test).", "error");
          setStatus('setup');
          return;
      }
      
      const apiKey = keys[Math.floor(Math.random() * keys.length)];

      try {
          const ai = new GoogleGenAI({ apiKey });
          
          // Connect to Live Session
          const session = await ai.live.connect({
              model: LIVE_MODEL,
              config: {
                  responseModalities: [Modality.AUDIO],
                  systemInstruction: { parts: [{ text: getSystemPrompt() }] },
                  speechConfig: {
                      voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Zephyr' } }
                  }
              },
              callbacks: {
                  onopen: () => {
                      console.log(">>> LIVE SESSION ESTABLISHED <<<");
                      setStatus('connected');
                  },
                  onmessage: async (msg: any) => {
                      // 1. Audio Output
                      const audioData = msg.serverContent?.modelTurn?.parts?.[0]?.inlineData?.data;
                      if (audioData && audioCtxRef.current) {
                          try {
                              const buffer = await base64ToAudioBuffer(audioData, audioCtxRef.current);
                              const source = audioCtxRef.current.createBufferSource();
                              source.buffer = buffer;
                              source.connect(audioCtxRef.current.destination);
                              
                              const currentTime = audioCtxRef.current.currentTime;
                              if (nextStartTimeRef.current < currentTime) {
                                  nextStartTimeRef.current = currentTime;
                              }
                              
                              source.start(nextStartTimeRef.current);
                              nextStartTimeRef.current += buffer.duration;
                              
                              setStatus('speaking');
                              source.onended = () => {
                                  // Heuristic: if no next audio scheduled within 200ms, assume listening
                                  if (audioCtxRef.current && audioCtxRef.current.currentTime >= nextStartTimeRef.current - 0.2) {
                                      setStatus('listening');
                                  }
                              };
                          } catch (e) {
                              console.error("Decoding error", e);
                          }
                      }
                  },
                  onclose: () => {
                      console.log("Live Session Closed");
                      notify("Session Live fermée par le serveur.", "info");
                      onClose(); // Close app, DO NOT FALLBACK
                  },
                  onerror: (err: any) => {
                      console.error("Live Error", err);
                      notify(`Erreur Live API: ${err.message || 'Inconnue'}`, "error");
                      // DO NOT FALLBACK - We want to see the error
                  }
              }
          });

          liveSessionRef.current = session;

          // Deduct initial credit for connection
          await consumeCredit();

          // Setup Audio Pipeline (Microphone Input)
          setStatus('connected');
          setArchLevel(1);
          await setupLiveAudioInput(session);

      } catch (e: any) {
          console.error("Live Connection Exception:", e);
          notify(`Echec Connexion Live: ${e.message}`, "error");
          setStatus('setup');
          // DO NOT FALLBACK
      }
  };

  const setupLiveAudioInput = async (session: any) => {
      if (!audioCtxRef.current) return;
      
      try {
          const stream = await navigator.mediaDevices.getUserMedia({ audio: {
              sampleRate: 16000,
              channelCount: 1,
              echoCancellation: true,
              autoGainControl: true,
              noiseSuppression: true
          }});
          streamRef.current = stream;

          const source = audioCtxRef.current.createMediaStreamSource(stream);
          const processor = audioCtxRef.current.createScriptProcessor(4096, 1, 1);
          
          processor.onaudioprocess = (e) => {
              if (status === 'listening' || status === 'connected' || status === 'speaking') {
                  const inputData = e.inputBuffer.getChannelData(0);
                  // Calculate volume
                  let sum = 0;
                  for(let i = 0; i < inputData.length; i++) sum += inputData[i] * inputData[i];
                  setAudioLevel(Math.sqrt(sum / inputData.length) * 100);

                  const base64Data = floatTo16BitPCM(inputData);
                  
                  // Ensure session is open before sending
                  try {
                      session.sendRealtimeInput({
                          mimeType: "audio/pcm;rate=16000",
                          data: base64Data
                      });
                  } catch(err) {
                      // Session might be closed or busy
                  }
              }
          };

          source.connect(processor);
          processor.connect(audioCtxRef.current.destination); // Required for script processor to run
          processorRef.current = processor;
      } catch (e) {
          console.error("Mic Error", e);
          notify("Microphone inaccessible. Vérifiez les permissions.", "error");
      }
  };

  // --- UI HANDLERS ---

  const handleMicClick = () => {
      // Mute toggle visualization
      notify("Micro actif (streaming continu)", "info");
  };

  // --- RENDER ---

  if (status === 'setup') {
      return (
        <div className="fixed inset-0 z-[100] bg-slate-900/90 backdrop-blur-xl flex items-center justify-center p-6 animate-fade-in font-sans">
            <div className="bg-white dark:bg-slate-900 w-full max-w-sm rounded-3xl p-8 shadow-2xl border border-slate-200 dark:border-slate-800 relative overflow-hidden">
                <button onClick={onClose} className="absolute top-4 right-4 p-2 bg-slate-100 dark:bg-slate-800 rounded-full hover:bg-red-50 hover:text-red-500 transition-colors"><X className="w-5 h-5"/></button>
                <div className="text-center mb-8">
                    <div className="w-20 h-20 bg-indigo-50 dark:bg-indigo-900/20 rounded-full flex items-center justify-center mx-auto mb-4 animate-bounce-slight">
                        <Settings2 className="w-10 h-10 text-indigo-600 dark:text-indigo-400" />
                    </div>
                    <h2 className="text-2xl font-black text-slate-900 dark:text-white">Live Test Mode</h2>
                    <p className="text-slate-500 text-sm mt-1">Appel Vocal (Strict Live API)</p>
                </div>
                <div className="space-y-4">
                    <div>
                        <label className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2 block flex items-center gap-2"><Globe className="w-3 h-3" /> Langue</label>
                        <div className="grid grid-cols-2 gap-2 max-h-32 overflow-y-auto scrollbar-hide">
                            {LANGUAGES.map(l => (
                                <button key={l.code} onClick={() => setSelectedLang(l.code)} className={`px-3 py-3 rounded-xl text-sm font-bold border transition-all ${selectedLang === l.code ? 'bg-indigo-600 text-white border-indigo-600 shadow-md' : 'bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-transparent hover:border-slate-300'}`}>{l.label}</button>
                            ))}
                        </div>
                    </div>
                    <button onClick={handleStartCall} className="w-full py-4 bg-emerald-500 hover:bg-emerald-600 text-white font-black rounded-2xl shadow-lg shadow-emerald-500/30 transform active:scale-95 transition-all flex items-center justify-center gap-2 mt-4">
                        <Phone className="w-5 h-5 fill-current" /> TESTER LIVE (1 Crd)
                    </button>
                </div>
            </div>
        </div>
      );
  }

  return (
    <div className="fixed inset-0 z-[100] bg-slate-950 flex flex-col font-sans overflow-hidden">
        {/* Header */}
        <div className="relative z-10 p-8 pt-10 text-center">
            <div className="inline-flex items-center gap-2 bg-red-500/20 px-3 py-1 rounded-full backdrop-blur-md border border-red-500/50 mb-2">
                <Wifi className="w-3 h-3 text-red-400 animate-pulse"/>
                <span className="text-[10px] text-red-100 font-bold uppercase tracking-wider">
                    MODE TEST: LIVE ONLY
                </span>
            </div>
            <h2 className="text-3xl font-black text-white tracking-tight mb-1">Teacher {selectedLang}</h2>
            <p className="text-indigo-300 text-sm font-medium font-mono tracking-widest">
                {status === 'ringing' ? "Appel entrant..." : status === 'connecting' ? "Connexion WebSocket..." : `${Math.floor(duration/60)}:${(duration%60).toString().padStart(2,'0')}`}
            </p>
        </div>

        {/* Visualizer */}
        <div className="relative flex-1 flex flex-col items-center justify-center w-full mb-10">
            <div className={`w-40 h-40 rounded-full bg-slate-900 border-4 shadow-2xl flex items-center justify-center overflow-hidden transition-all duration-500 relative z-20 ${status === 'speaking' ? 'border-emerald-500 scale-105' : 'border-white/10'}`}>
                <img src={TEACHER_AVATAR} className={`w-full h-full object-cover p-5 ${status === 'ringing' ? 'animate-bounce-slight' : ''}`} alt="Teacher" />
            </div>
            
            {/* Audio Wave */}
            <div className="h-24 flex items-center justify-center gap-1.5 mt-8 w-full max-w-xs">
                {status === 'listening' || archLevel === 1 ? (
                    [...Array(5)].map((_, i) => (
                        <div key={i} className="w-2 bg-indigo-500 rounded-full transition-all duration-75" style={{ height: `${Math.max(10, audioLevel * (1 + Math.random()))}px` }}></div>
                    ))
                ) : <div className="h-1 w-20 bg-white/5 rounded-full"></div>}
            </div>
        </div>

        {/* Input Controls */}
        <div className="grid grid-cols-3 gap-8 w-full max-w-xs mx-auto items-center mb-12 relative z-10">
            <button onClick={() => setShowHint(!showHint)} className="flex flex-col items-center gap-2 group">
                <div className="w-14 h-14 rounded-full bg-white/10 flex items-center justify-center text-white"><Lightbulb className="w-6 h-6"/></div>
                <span className="text-[10px] text-white/50 font-bold uppercase">Aide</span>
            </button>
            <button onClick={onClose} className="flex flex-col items-center gap-2 group hover:scale-105 transition-transform">
                <div className="w-20 h-20 rounded-full bg-red-500 flex items-center justify-center shadow-lg shadow-red-500/40"><Phone className="w-8 h-8 text-white fill-white rotate-[135deg]" /></div>
            </button>
            <button className="flex flex-col items-center gap-2 group opacity-50 cursor-not-allowed">
                <div className="w-14 h-14 rounded-full bg-white/10 flex items-center justify-center text-white"><Keyboard className="w-6 h-6"/></div>
                <span className="text-[10px] text-white/50 font-bold uppercase">Clavier Off</span>
            </button>
        </div>
    </div>
  );
};

export default VoiceCall;
