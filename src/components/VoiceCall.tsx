import React, { useState, useEffect, useRef } from 'react';
import { X, Mic, MicOff, Phone, Keyboard, Send, Lock, Loader2 } from 'lucide-react';
import { UserProfile } from '../types';
import { GoogleGenAI, LiveServerMessage, Modality } from '@google/genai';
import { storageService } from '../services/storageService';

interface VoiceCallProps {
  user: UserProfile;
  onClose: () => void;
  onUpdateUser: (u: UserProfile) => void;
  notify: (m: string, t?: string) => void;
  onShowPayment: () => void;
}

// Helpers
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

function base64ToUint8Array(base64: string) {
  const binaryString = atob(base64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

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

const playRingingTone = (ctx: AudioContext) => {
    try {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.frequency.value = 440; 
        osc.type = 'sine';
        const now = ctx.currentTime;
        gain.gain.setValueAtTime(0, now);
        gain.gain.linearRampToValueAtTime(0.5, now + 0.1);
        gain.gain.linearRampToValueAtTime(0.5, now + 2);
        gain.gain.linearRampToValueAtTime(0, now + 2.1);
        osc.start(now);
        osc.stop(now + 2.5);
    } catch (e) {
        console.warn("Ringing tone error", e);
    }
};

const VoiceCall: React.FC<VoiceCallProps> = ({ user, onClose, onUpdateUser, notify, onShowPayment }) => {
  const [status, setStatus] = useState<'ringing' | 'connecting' | 'connected'>('ringing');
  const [duration, setDuration] = useState(0);
  const [aiSpeaking, setAiSpeaking] = useState(false);
  const [showInput, setShowInput] = useState(false);
  const [inputText, setInputText] = useState('');
  const [canSendText, setCanSendText] = useState(false); 

  const audioCtxRef = useRef<AudioContext | null>(null);
  const sessionRef = useRef<any>(null);
  const nextStartTimeRef = useRef<number>(0);
  const sourcesRef = useRef<Set<AudioBufferSourceNode>>(new Set());
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const inputSourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const ringIntervalRef = useRef<any>(null);
  const connectTimeoutRef = useRef<any>(null);
  const mountedRef = useRef(true);

  const TEACHER_AVATAR = "https://i.ibb.co/B2XmRwmJ/logo.png";

  useEffect(() => {
      mountedRef.current = true;
      return () => { mountedRef.current = false; };
  }, []);

  // Init & Ringing
  useEffect(() => {
    const init = async () => {
        try {
            const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
            const ctx = new AudioContextClass({sampleRate: 24000});
            
            if (ctx.state === 'suspended') {
                await ctx.resume().catch(() => console.warn("Audio Context resume failed (autoplay policy)"));
            }
            
            audioCtxRef.current = ctx;
            nextStartTimeRef.current = ctx.currentTime;

            playRingingTone(ctx);
            ringIntervalRef.current = setInterval(() => {
                if (mountedRef.current && status === 'ringing') playRingingTone(ctx);
            }, 3000);

            connectTimeoutRef.current = setTimeout(() => {
                if (mountedRef.current) {
                    clearInterval(ringIntervalRef.current);
                    setStatus('connecting');
                    connectLive();
                }
            }, 3500); 
        } catch (e) {
            console.error("Voice Call Init Error:", e);
            notify("Erreur d'initialisation audio.", "error");
            if (mountedRef.current) onClose();
        }
    };
    init();

    return () => {
        cleanup();
    };
  }, []);

  // Timer
  useEffect(() => {
      let interval: any;
      if (status === 'connected') {
          interval = setInterval(() => setDuration(d => d + 1), 1000);
      }
      return () => clearInterval(interval);
  }, [status]);

  const cleanup = async () => {
      if (connectTimeoutRef.current) clearTimeout(connectTimeoutRef.current);
      if (ringIntervalRef.current) clearInterval(ringIntervalRef.current);
      
      if (processorRef.current) { 
          try { processorRef.current.disconnect(); } catch(e){}
          processorRef.current = null; 
      }
      if (inputSourceRef.current) { 
          try { inputSourceRef.current.disconnect(); } catch(e){}
          inputSourceRef.current = null; 
      }
      
      sourcesRef.current.forEach(s => {
          try { s.stop(); } catch(e){}
      });
      sourcesRef.current.clear();
      
      if (sessionRef.current) {
          try { (await sessionRef.current).close(); } catch(e) {}
          sessionRef.current = null;
      }
      
      if (audioCtxRef.current && audioCtxRef.current.state !== 'closed') {
          try { await audioCtxRef.current.close(); } catch(e) {}
      }
  };

  const connectLive = async () => {
      // Validate API Key - Handle Comma Separated Keys
      const rawKey = process.env.API_KEY || "";
      const keys = rawKey.split(',').map(k => k.trim()).filter(k => k.length > 0);
      
      if (keys.length === 0) {
          console.error("API Key missing");
          notify("Clé API manquante.", "error");
          onClose();
          return;
      }

      // Randomly select one key
      const apiKey = keys[Math.floor(Math.random() * keys.length)];

      try {
          const ai = new GoogleGenAI({ apiKey });
          
          // Ensure AudioContext is ready
          if (!audioCtxRef.current) {
              const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
              audioCtxRef.current = new AudioContextClass({sampleRate: 24000});
          }
          const ctx = audioCtxRef.current;
          if (ctx.state === 'suspended') await ctx.resume();

          const sessionPromise = ai.live.connect({
              model: 'gemini-2.5-flash-native-audio-preview-12-2025',
              config: {
                  responseModalities: [Modality.AUDIO],
                  speechConfig: {
                      voiceConfig: { prebuiltVoiceConfig: { voiceName: user.preferences?.voiceName || 'Zephyr' } }
                  },
                  systemInstruction: {
                      parts: [{ text: `
                      IDENTITY: You are "TeacherMada", a warm teacher. 
                      USER: ${user.username}, Learning: ${user.preferences?.targetLanguage}, Level: ${user.preferences?.level}.
                      TASK: Simulate a phone call. 
                      CRITICAL: SPEAK FIRST IMMEDIATELY. Say "Allô !" and introduce yourself in ${user.preferences?.explanationLanguage || 'French'}.
                      ` }]
                  }
              },
              callbacks: {
                  onopen: async () => {
                      if (!mountedRef.current) return;
                      setStatus('connected');
                      
                      // Capabilities Check & Trigger
                      sessionPromise.then(session => {
                          if (!mountedRef.current) return;
                          
                          // Check if we can send text
                          if (typeof (session as any).send === 'function') {
                              setCanSendText(true);
                              try {
                                  (session as any).send({
                                      clientContent: {
                                          turns: [{ role: "user", parts: [{ text: "SYSTEM: Call connected. Please say 'Allô' now." }] }],
                                          turnComplete: true
                                      }
                                  });
                              } catch (e) {}
                          }

                          // Audio Trigger (Silent Burst) - Essential for VAD wakeup
                          setTimeout(() => {
                              if (mountedRef.current) {
                                  try {
                                      const silentData = new Float32Array(4800); // 300ms silence
                                      const pcmBlob = createBlob(silentData);
                                      session.sendRealtimeInput({ media: pcmBlob });
                                  } catch(e) { console.error("Audio trigger failed", e); }
                              }
                          }, 500);
                      });

                      // Microphone
                      try {
                          const stream = await navigator.mediaDevices.getUserMedia({ 
                              audio: { sampleRate: 16000, echoCancellation: true, noiseSuppression: true, autoGainControl: true } 
                          });
                          
                          // Use a separate input context for the microphone to avoid sample rate mismatches
                          const InputAudioContext = window.AudioContext || (window as any).webkitAudioContext;
                          const inputCtx = new InputAudioContext({sampleRate: 16000});
                          const source = inputCtx.createMediaStreamSource(stream);
                          const processor = inputCtx.createScriptProcessor(4096, 1, 1);
                          
                          processor.onaudioprocess = (e) => {
                              if (!mountedRef.current) return;
                              const inputData = e.inputBuffer.getChannelData(0);
                              const pcmBlob = createBlob(inputData);
                              sessionPromise.then(s => s.sendRealtimeInput({ media: pcmBlob })).catch(() => {});
                          };
                          
                          source.connect(processor);
                          processor.connect(inputCtx.destination);
                          
                          inputSourceRef.current = source;
                          processorRef.current = processor;
                      } catch (e) {
                          console.error("Microphone Access Error:", e);
                          notify("Microphone inaccessible", "error");
                          onClose();
                      }
                  },
                  onmessage: async (msg: LiveServerMessage) => {
                      if (!mountedRef.current) return;

                      // Credit Logic
                      if (msg.serverContent?.turnComplete) {
                          const u = await storageService.getUserById(user.id);
                          if (u && await storageService.canRequest(u.id)) {
                              await storageService.consumeCredit(u.id);
                              const newU = await storageService.getUserById(u.id);
                              if(newU) onUpdateUser(newU);
                          } else {
                              notify("Crédits épuisés.", "error");
                              onClose();
                              onShowPayment();
                          }
                      }

                      // Audio Output
                      const audioData = msg.serverContent?.modelTurn?.parts?.[0]?.inlineData?.data;
                      if (audioData) {
                          setAiSpeaking(true);
                          try {
                              const buffer = pcmToAudioBuffer(base64ToUint8Array(audioData), ctx, 24000);
                              const source = ctx.createBufferSource();
                              source.buffer = buffer;
                              source.connect(ctx.destination);
                              
                              const now = ctx.currentTime;
                              if (nextStartTimeRef.current < now) nextStartTimeRef.current = now;
                              source.start(nextStartTimeRef.current);
                              nextStartTimeRef.current += buffer.duration;
                              
                              sourcesRef.current.add(source);
                              source.onended = () => {
                                  sourcesRef.current.delete(source);
                                  if (sourcesRef.current.size === 0) setAiSpeaking(false);
                              };
                          } catch (audioErr) {
                              console.error("Audio Decode Error", audioErr);
                          }
                      }
                  },
                  onclose: () => {
                      // Only close if intended or error, not just connection close (which shouldn't happen unless done)
                      console.log("Live Session Closed");
                      if (mountedRef.current) onClose();
                  },
                  onerror: (e) => {
                      console.error("Live API Error:", e);
                      // Don't close immediately on minor errors, but log
                  }
              }
          });
          
          sessionRef.current = sessionPromise;
          
          sessionPromise.catch(err => {
              console.error("Session Promise Rejected:", err);
              if (mountedRef.current) {
                  notify("Échec de connexion au serveur.", "error");
                  onClose();
              }
          });

      } catch (e) {
          console.error("Setup Exception:", e);
          notify("Erreur de connexion Live.", "error");
          onClose();
      }
  };

  const sendText = async () => {
      if (!inputText.trim() || !sessionRef.current) return;
      try {
          const session = await sessionRef.current;
          if (typeof session.send === 'function') {
              session.send({
                  clientContent: {
                      turns: [{ role: "user", parts: [{ text: inputText }] }],
                      turnComplete: true
                  }
              });
              setInputText('');
              setShowInput(false);
          } else {
              notify("Message texte non supporté sur cet appareil.", "error");
          }
      } catch (e) {
          notify("Erreur d'envoi.", "error");
      }
  };

  const formatDuration = (s: number) => {
      const m = Math.floor(s / 60);
      const sec = s % 60;
      return `${m}:${sec < 10 ? '0' : ''}${sec}`;
  };

  const isRinging = status === 'ringing';

  return (
    <div className="fixed inset-0 z-[100] bg-slate-900 flex flex-col font-sans overflow-hidden">
        {/* Background */}
        <div className="absolute inset-0 bg-[url('https://images.unsplash.com/photo-1555445054-d166d149d751?q=80&w=2000')] bg-cover bg-center opacity-20 blur-xl scale-110"></div>
        
        <div className="relative z-10 flex flex-col h-full items-center justify-between p-8 safe-top safe-bottom">
            {/* Header */}
            <div className="text-center pt-8 space-y-2">
                <div className="inline-flex items-center gap-2 bg-white/10 px-3 py-1 rounded-full backdrop-blur-md">
                    <Lock className="w-3 h-3 text-white/70" />
                    <span className="text-[10px] text-white/70 font-bold uppercase tracking-wider">Sécurisé</span>
                </div>
                <h2 className="text-3xl font-black text-white tracking-tight">TeacherMada</h2>
                <p className="text-indigo-200 text-sm font-medium animate-pulse">
                    {isRinging ? "Appel entrant..." : status === 'connecting' ? "Connexion..." : formatDuration(duration)}
                </p>
            </div>

            {/* Avatar */}
            <div className="relative">
                {isRinging && <div className="absolute inset-0 bg-white/10 rounded-full animate-ping blur-2xl"></div>}
                {!isRinging && aiSpeaking && <div className="absolute inset-0 border-4 border-emerald-400/50 rounded-full animate-pulse scale-110"></div>}
                
                <div className="w-48 h-48 rounded-full bg-gradient-to-br from-slate-800 to-slate-900 border-4 border-white/10 shadow-2xl flex items-center justify-center overflow-hidden">
                    <img src={TEACHER_AVATAR} className={`w-full h-full object-cover p-6 ${isRinging ? 'animate-bounce-slight' : ''}`} alt="Teacher" />
                </div>
            </div>

            {/* Input Overlay */}
            {showInput && (
                <div className="absolute bottom-32 left-6 right-6 z-20 animate-slide-up">
                    <div className="bg-slate-800/90 backdrop-blur-md p-3 rounded-2xl border border-white/10 shadow-xl flex gap-2">
                        <input 
                            value={inputText}
                            onChange={(e) => setInputText(e.target.value)}
                            onKeyDown={(e) => e.key === 'Enter' && sendText()}
                            placeholder="Écrire un message..."
                            autoFocus
                            className="flex-1 bg-transparent border-none outline-none text-white text-sm px-2 placeholder:text-slate-500"
                        />
                        <button onClick={sendText} disabled={!inputText.trim()} className="p-2 bg-indigo-600 rounded-xl text-white disabled:opacity-50">
                            <Send className="w-4 h-4" />
                        </button>
                    </div>
                </div>
            )}

            {/* Controls */}
            <div className="grid grid-cols-3 gap-8 w-full max-w-xs items-center mb-8 relative z-10">
                {!isRinging ? (
                    <>
                        <button className="flex flex-col items-center gap-2 group opacity-50 cursor-not-allowed">
                            <div className="w-14 h-14 rounded-full bg-white/10 flex items-center justify-center backdrop-blur-md">
                                <MicOff className="w-6 h-6 text-white" />
                            </div>
                            <span className="text-[10px] text-white/50 font-bold uppercase">Mute</span>
                        </button>
                        
                        <button onClick={onClose} className="flex flex-col items-center gap-2 group transform hover:scale-105 transition-transform">
                            <div className="w-20 h-20 rounded-full bg-red-500 hover:bg-red-600 flex items-center justify-center shadow-lg shadow-red-500/40 border-4 border-white/10">
                                <Phone className="w-8 h-8 text-white fill-white rotate-[135deg]" />
                            </div>
                        </button>

                        {canSendText ? (
                            <button 
                                onClick={() => setShowInput(!showInput)}
                                className={`flex flex-col items-center gap-2 group transition-all ${showInput ? 'scale-110' : ''}`}
                            >
                                <div className={`w-14 h-14 rounded-full flex items-center justify-center backdrop-blur-md transition-all ${showInput ? 'bg-indigo-600 text-white' : 'bg-white/10 hover:bg-white/20 text-white'}`}>
                                    <Keyboard className="w-6 h-6" />
                                </div>
                                <span className="text-[10px] text-white/50 font-bold uppercase">Clavier</span>
                            </button>
                        ) : (
                            <div className="w-14"></div> // Spacer
                        )}
                    </>
                ) : (
                    <div className="col-span-3 flex justify-center">
                        <button onClick={onClose} className="flex flex-col items-center gap-2 group transform hover:scale-105 transition-transform">
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
};

export default VoiceCall;