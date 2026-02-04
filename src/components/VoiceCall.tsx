import React, { useState, useEffect, useRef } from 'react';
import { X, Mic, MicOff, Phone, Keyboard, Send, Lock, Loader2, Volume2 } from 'lucide-react';
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

// --- Audio Helpers ---

function base64ToAudioBuffer(base64: string, ctx: AudioContext): Promise<AudioBuffer> {
    const binaryString = atob(base64);
    const len = binaryString.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
        bytes[i] = binaryString.charCodeAt(i);
    }
    // gemini-tts returns raw PCM at 24kHz usually, but let's check header? 
    // Actually the new SDK output might be raw PCM if no container specified, 
    // BUT playMessageAudio in ChatInterface used raw PCM logic.
    // However, here we will use a robust decoding if possible, or Raw PCM fallback.
    
    // For 'gemini-2.5-flash-preview-tts', the output is raw PCM 24kHz Mono (usually).
    // Let's implement the Raw PCM decoder as per SDK examples.
    const pcm16 = new Int16Array(bytes.buffer);
    const float32 = new Float32Array(pcm16.length);
    for (let i = 0; i < pcm16.length; i++) {
        float32[i] = pcm16[i] / 32768.0; 
    }
    const buffer = ctx.createBuffer(1, float32.length, 24000);
    buffer.copyToChannel(float32, 0);
    return Promise.resolve(buffer);
}

const getClient = () => {
    const rawKey = process.env.API_KEY || "";
    const keys = rawKey.split(',').map(k => k.trim()).filter(k => k.length > 0);
    const selectedKey = keys.length > 0 ? keys[Math.floor(Math.random() * keys.length)] : "";
    return new GoogleGenAI({ apiKey: selectedKey });
};

const VoiceCall: React.FC<VoiceCallProps> = ({ user, onClose, onUpdateUser, notify, onShowPayment }) => {
  // States: 'ringing' -> 'connecting' -> 'speaking' (AI) -> 'listening' (User) -> 'processing'
  const [status, setStatus] = useState<'ringing' | 'connecting' | 'speaking' | 'listening' | 'processing'>('ringing');
  const [duration, setDuration] = useState(0);
  const [subtitle, setSubtitle] = useState('');
  const [userTranscript, setUserTranscript] = useState('');
  const [audioLevel, setAudioLevel] = useState(0);

  // Refs
  const audioCtxRef = useRef<AudioContext | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const silenceTimerRef = useRef<any>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const sourceNodeRef = useRef<AudioBufferSourceNode | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const mountedRef = useRef(true);
  
  // History for context
  const historyRef = useRef<{role: string, parts: {text: string}[]}[]>([]);

  const TEACHER_AVATAR = "https://i.ibb.co/B2XmRwmJ/logo.png";

  useEffect(() => {
      mountedRef.current = true;
      return () => { 
          mountedRef.current = false; 
          cleanup();
      };
  }, []);

  // --- 1. Init & Ringing ---
  useEffect(() => {
      const startSequence = async () => {
          // Play Ringtone
          const ctx = new (window.AudioContext || (window as any).webkitAudioContext)({sampleRate: 24000});
          audioCtxRef.current = ctx;
          
          playRingingTone(ctx); // Function defined below
          
          setTimeout(() => {
              if (mountedRef.current) {
                  setStatus('connecting');
                  initializeCall();
              }
          }, 2500);
      };
      
      startSequence();
  }, []);

  // Timer
  useEffect(() => {
      let interval: any;
      if (status !== 'ringing' && status !== 'connecting') {
          interval = setInterval(() => setDuration(d => d + 1), 1000);
      }
      return () => clearInterval(interval);
  }, [status]);

  const cleanup = () => {
      if (streamRef.current) streamRef.current.getTracks().forEach(t => t.stop());
      if (audioCtxRef.current) audioCtxRef.current.close();
      if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
      if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
      if (sourceNodeRef.current) sourceNodeRef.current.stop();
  };

  const playRingingTone = (ctx: AudioContext) => {
      try {
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.connect(gain);
          gain.connect(ctx.destination);
          osc.frequency.value = 440; 
          gain.gain.value = 0.1;
          osc.start();
          osc.stop(ctx.currentTime + 2);
      } catch(e){}
  };

  // --- 2. Core Logic ---

  const initializeCall = async () => {
      // Step 1: Generate Initial Greeting Text
      try {
          const ai = getClient();
          
          const systemPrompt = `You are TeacherMada, a friendly language teacher calling ${user.username}.
          Target Language: ${user.preferences?.targetLanguage || 'French'}.
          Level: ${user.preferences?.level || 'Beginner'}.
          Explanation Language: ${user.preferences?.explanationLanguage || 'French'}.
          
          TASK: Start the call with a warm, short greeting in the Target Language, followed by a very brief translation or encouragement in the Explanation Language.
          Keep it under 2 sentences.`;

          const response = await ai.models.generateContent({
              model: 'gemini-3-flash-preview', // Fast text model
              contents: [{ role: 'user', parts: [{ text: "Start the call now." }] }],
              config: { systemInstruction: systemPrompt }
          });

          const greetingText = response.response.text;
          if (!greetingText) throw new Error("No greeting generated");

          // Update History
          historyRef.current.push({ role: 'model', parts: [{ text: greetingText }] });
          
          // Step 2: TTS & Play
          await speakText(greetingText);

      } catch (e) {
          console.error(e);
          notify("Erreur de connexion (Init).", "error");
          onClose();
      }
  };

  const speakText = async (text: string) => {
      if (!mountedRef.current) return;
      setStatus('speaking');
      setSubtitle(text);

      try {
          const ai = getClient();
          const response = await ai.models.generateContent({
              model: 'gemini-2.5-flash-preview-tts',
              contents: [{ parts: [{ text }] }],
              config: {
                  responseModalities: [Modality.AUDIO],
                  speechConfig: {
                      voiceConfig: { prebuiltVoiceConfig: { voiceName: user.preferences?.voiceName || 'Zephyr' } }
                  }
              }
          });

          const audioData = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
          if (!audioData) throw new Error("No audio data");

          const ctx = audioCtxRef.current!;
          const buffer = await base64ToAudioBuffer(audioData, ctx);
          
          const source = ctx.createBufferSource();
          source.buffer = buffer;
          source.connect(ctx.destination);
          sourceNodeRef.current = source;
          
          source.onended = () => {
              if (mountedRef.current) {
                  startListening();
              }
          };
          source.start();

      } catch (e) {
          console.error("TTS Error", e);
          notify("Erreur audio.", "error");
          // Fallback: just start listening if audio fails
          startListening();
      }
  };

  const startListening = async () => {
      if (!mountedRef.current) return;
      setStatus('listening');
      setSubtitle("À vous de parler...");
      setUserTranscript('');
      audioChunksRef.current = [];

      try {
          if (!streamRef.current) {
              const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
              streamRef.current = stream;
          }

          // VAD Setup
          const ctx = audioCtxRef.current!;
          const source = ctx.createMediaStreamSource(streamRef.current!);
          const analyser = ctx.createAnalyser();
          analyser.fftSize = 256;
          source.connect(analyser);
          analyserRef.current = analyser;

          const mimeType = MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm' : 'audio/mp4';
          const recorder = new MediaRecorder(streamRef.current!, { mimeType });
          mediaRecorderRef.current = recorder;

          recorder.ondataavailable = (e) => {
              if (e.data.size > 0) audioChunksRef.current.push(e.data);
          };

          recorder.start(100); // chunk every 100ms
          monitorAudioLevel();

      } catch (e) {
          notify("Microphone inaccessible.", "error");
      }
  };

  const monitorAudioLevel = () => {
      if (!analyserRef.current || status !== 'listening') return;

      const dataArray = new Uint8Array(analyserRef.current.frequencyBinCount);
      analyserRef.current.getByteFrequencyData(dataArray);
      
      const average = dataArray.reduce((a, b) => a + b) / dataArray.length;
      setAudioLevel(average);

      // Simple VAD Logic
      if (average > 30) { // Speech detected
          if (silenceTimerRef.current) {
              clearTimeout(silenceTimerRef.current);
              silenceTimerRef.current = null;
          }
      } else { // Silence
          if (!silenceTimerRef.current && audioChunksRef.current.length > 5) { // Ensure we have some data
              silenceTimerRef.current = setTimeout(() => {
                  stopListeningAndSend();
              }, 1500); // 1.5s of silence triggers send
          }
      }

      if (mountedRef.current && status === 'listening') {
          animationFrameRef.current = requestAnimationFrame(monitorAudioLevel);
      }
  };

  const stopListeningAndSend = async () => {
      if (!mediaRecorderRef.current || status !== 'listening') return;
      
      // Stop VAD loop
      if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
      if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);

      setStatus('processing');
      setSubtitle("Réflexion..."); // Feedback loop

      mediaRecorderRef.current.onstop = async () => {
          const audioBlob = new Blob(audioChunksRef.current, { type: mediaRecorderRef.current?.mimeType || 'audio/webm' });
          await processUserAudio(audioBlob);
      };
      mediaRecorderRef.current.stop();
  };

  const processUserAudio = async (blob: Blob) => {
      try {
          // Convert Blob to Base64
          const reader = new FileReader();
          reader.readAsDataURL(blob);
          reader.onloadend = async () => {
              const base64data = (reader.result as string).split(',')[1];
              const mimeType = blob.type;

              const ai = getClient();
              
              // 1. Send Audio to Text Model to get reply
              // Note: We use history to keep context
              const audioPart = { inlineData: { mimeType, data: base64data } };
              
              const prompt = `User just spoke. 
              1. If the audio is empty or noise, reply with "I didn't hear you."
              2. Otherwise, reply naturally to the user as the Teacher.
              3. Keep response concise (1-2 sentences).`;

              const result = await ai.models.generateContent({
                  model: 'gemini-3-flash-preview',
                  contents: [
                      ...historyRef.current,
                      { role: 'user', parts: [audioPart] } // Send audio directly!
                  ],
                  config: { systemInstruction: prompt }
              });

              const replyText = result.response.text;
              
              // Update credits
              const u = await storageService.getUserById(user.id);
              if (u && await storageService.canRequest(u.id)) {
                  await storageService.consumeCredit(u.id);
                  if(mountedRef.current) onUpdateUser(await storageService.getUserById(u.id) as UserProfile);
              } else {
                  notify("Crédits épuisés.", "error");
                  onShowPayment();
                  onClose();
                  return;
              }

              // Update History
              historyRef.current.push({ role: 'user', parts: [{ text: "(User Audio)" }] }); // Placeholder for history
              historyRef.current.push({ role: 'model', parts: [{ text: replyText }] });

              // 2. TTS the reply
              await speakText(replyText);
          };
      } catch (e) {
          console.error("Processing Error", e);
          notify("Je n'ai pas compris.", "error");
          startListening(); // Retry
      }
  };

  // --- Render ---

  const formatDuration = (s: number) => {
      const m = Math.floor(s / 60);
      const sec = s % 60;
      return `${m}:${sec < 10 ? '0' : ''}${sec}`;
  };

  return (
    <div className="fixed inset-0 z-[100] bg-slate-900 flex flex-col font-sans overflow-hidden">
        {/* Background Visuals */}
        <div className="absolute inset-0 bg-[url('https://images.unsplash.com/photo-1555445054-d166d149d751?q=80&w=2000')] bg-cover bg-center opacity-10 blur-xl scale-110"></div>
        <div className="absolute inset-0 bg-gradient-to-b from-slate-900/80 via-slate-900/50 to-slate-900"></div>
        
        <div className="relative z-10 flex flex-col h-full items-center justify-between p-8 safe-top safe-bottom">
            
            {/* Header */}
            <div className="text-center pt-8 space-y-2">
                <div className="inline-flex items-center gap-2 bg-white/10 px-3 py-1 rounded-full backdrop-blur-md border border-white/5">
                    <Lock className="w-3 h-3 text-emerald-400" />
                    <span className="text-[10px] text-white/70 font-bold uppercase tracking-wider">TeacherMada Secure</span>
                </div>
                <h2 className="text-3xl font-black text-white tracking-tight">Appel Vocal</h2>
                <p className="text-indigo-200 text-sm font-medium font-mono">
                    {status === 'ringing' ? "Appel entrant..." : status === 'connecting' ? "Connexion IA..." : formatDuration(duration)}
                </p>
            </div>

            {/* Main Visual (Avatar + Waves) */}
            <div className="relative flex-1 flex flex-col items-center justify-center w-full">
                
                {/* Status Indicator Text */}
                <div className="mb-8 h-12 flex items-center justify-center">
                    {status === 'speaking' && <span className="text-emerald-400 font-bold animate-pulse flex items-center gap-2"><Volume2 className="w-4 h-4"/> Le professeur parle...</span>}
                    {status === 'listening' && <span className="text-indigo-400 font-bold animate-pulse flex items-center gap-2"><Mic className="w-4 h-4"/> À vous...</span>}
                    {status === 'processing' && <span className="text-amber-400 font-bold flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin"/> Analyse...</span>}
                </div>

                {/* Avatar Circle */}
                <div className="relative">
                    {/* Ripple Effect based on State */}
                    {status === 'speaking' && (
                        <>
                            <div className="absolute inset-0 border-4 border-emerald-500/30 rounded-full animate-ping"></div>
                            <div className="absolute inset-0 border-4 border-emerald-500/50 rounded-full animate-pulse delay-75"></div>
                        </>
                    )}
                    {status === 'listening' && audioLevel > 10 && (
                        <div className="absolute inset-0 bg-indigo-500/20 rounded-full" style={{ transform: `scale(${1 + audioLevel/200})`, transition: 'transform 0.1s' }}></div>
                    )}

                    <div className={`w-48 h-48 rounded-full bg-gradient-to-br from-slate-800 to-slate-900 border-4 ${status === 'speaking' ? 'border-emerald-500' : status === 'listening' ? 'border-indigo-500' : 'border-white/10'} shadow-2xl flex items-center justify-center overflow-hidden transition-colors duration-500`}>
                        <img src={TEACHER_AVATAR} className={`w-full h-full object-cover p-6 ${status === 'ringing' ? 'animate-bounce-slight' : ''}`} alt="Teacher" />
                    </div>
                </div>

                {/* Subtitles */}
                <div className="mt-8 px-6 py-4 bg-black/40 backdrop-blur-md rounded-2xl max-w-xs text-center border border-white/5 min-h-[80px] flex items-center justify-center">
                    <p className="text-slate-200 text-sm font-medium leading-relaxed">
                        {status === 'ringing' ? "Préparation de votre cours..." : subtitle || "..."}
                    </p>
                </div>
            </div>

            {/* Controls */}
            <div className="grid grid-cols-3 gap-8 w-full max-w-xs items-center mb-8 relative z-10">
                {status !== 'ringing' ? (
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

                        <button className="flex flex-col items-center gap-2 group opacity-50 cursor-not-allowed">
                            <div className="w-14 h-14 rounded-full bg-white/10 flex items-center justify-center backdrop-blur-md">
                                <Keyboard className="w-6 h-6 text-white" />
                            </div>
                            <span className="text-[10px] text-white/50 font-bold uppercase">Clavier</span>
                        </button>
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