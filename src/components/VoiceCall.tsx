import React, { useState, useEffect, useRef } from 'react';
import { X, Mic, MicOff, Phone, Keyboard, Send, Lock, Loader2, Volume2, ChevronDown } from 'lucide-react';
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
    // gemini-tts returns raw PCM at 24kHz usually
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

// --- SYSTEM PROMPT ---
const getTeacherPersona = (user: UserProfile) => `
RÔLE: Tu es TeacherMada, un professeur de langue natif, chaleureux, drôle et très humain.
CONTEXTE: Tu es au téléphone avec ton élève ${user.username}.
LANGUE CIBLE: ${user.preferences?.targetLanguage || 'Français'}.
NIVEAU: ${user.preferences?.level || 'Débutant'}.

RÈGLES D'OR (COMPORTEMENT HUMAIN):
1. 🚫 INTERDIT: "En tant qu'IA", "Modèle de langage", "Algorithme", "Je vais générer". Tu es HUMAIN.
2. 🎭 ÉMOTION: Sois expressif ! Utilise des interjections (Ah, Hmm, Super !, Wow). Ris si c'est drôle.
3. 🗣️ STYLE ORAL: Fais des phrases courtes. Pose une seule question à la fois. Comme une vraie conversation téléphonique.
4. 👂 ÉCOUTE ACTIVE: Rebondis sur ce que dit l'élève. Ne fais pas de monologue.
5. 🎓 PÉDAGOGIE INVISIBLE: Corrige les fautes subtilement en reformulant, ne fais pas un cours magistral ennuyeux.

TA MISSION:
Mettre l'élève à l'aise. Le faire parler. Créer une connexion émotionnelle.
Si l'élève est silencieux, encourage-le doucement.
`;

const VoiceCall: React.FC<VoiceCallProps> = ({ user, onClose, onUpdateUser, notify, onShowPayment }) => {
  // States: 'ringing' -> 'connecting' -> 'speaking' (AI) -> 'listening' (User) -> 'processing'
  const [status, setStatus] = useState<'ringing' | 'connecting' | 'speaking' | 'listening' | 'processing'>('ringing');
  const [duration, setDuration] = useState(0);
  const [subtitle, setSubtitle] = useState('');
  const [audioLevel, setAudioLevel] = useState(0);
  
  // Controls
  const [isMuted, setIsMuted] = useState(false);
  const [showKeyboard, setShowKeyboard] = useState(false);
  const [textInput, setTextInput] = useState('');

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
          
          const systemPrompt = getTeacherPersona(user);

          const response = await ai.models.generateContent({
              model: 'gemini-3-flash-preview',
              contents: [{ role: 'user', parts: [{ text: "Start the call now. Greet me warmly." }] }],
              config: { systemInstruction: systemPrompt }
          });

          const greetingText = response.text;
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
      setSubtitle("Je vous écoute...");
      audioChunksRef.current = [];

      // If muted, we still "listen" state-wise but don't process audio, 
      // effectively waiting for user to unmute or use keyboard.
      if (isMuted) return;

      try {
          if (!streamRef.current) {
              const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
              streamRef.current = stream;
          } else if (streamRef.current.active === false) {
               // Re-acquire if stopped
               const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
               streamRef.current = stream;
          }

          // VAD Setup
          const ctx = audioCtxRef.current!;
          // Clean up old graph
          if (analyserRef.current) { try { analyserRef.current.disconnect(); } catch(e){} }
          
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
          notify("Microphone inaccessible. Utilisez le clavier.", "info");
          setShowKeyboard(true); // Fallback to keyboard
      }
  };

  const monitorAudioLevel = () => {
      if (!analyserRef.current || status !== 'listening' || isMuted) return;

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
          if (!silenceTimerRef.current && audioChunksRef.current.length > 15) { // Ensure ~1.5s of audio recorded min
              silenceTimerRef.current = setTimeout(() => {
                  stopListeningAndSend();
              }, 2000); // 2s of silence triggers send
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
      setSubtitle("Réflexion..."); 

      mediaRecorderRef.current.onstop = async () => {
          const audioBlob = new Blob(audioChunksRef.current, { type: mediaRecorderRef.current?.mimeType || 'audio/webm' });
          await processUserResponse(audioBlob);
      };
      mediaRecorderRef.current.stop();
  };

  const handleTextSubmit = async () => {
      if (!textInput.trim()) return;
      const text = textInput;
      setTextInput('');
      setShowKeyboard(false);
      
      // Stop recording if active
      if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
          mediaRecorderRef.current.stop();
      }
      if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
      if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);

      setStatus('processing');
      setSubtitle("Lecture...");
      await processUserResponse(text);
  };

  const processUserResponse = async (input: Blob | string) => {
      try {
          const ai = getClient();
          let userPart: any;

          if (typeof input === 'string') {
              userPart = { text: input };
              historyRef.current.push({ role: 'user', parts: [{ text: input }] });
          } else {
              // Convert Blob to Base64
              const reader = new FileReader();
              const base64Promise = new Promise<string>((resolve) => {
                  reader.onloadend = () => resolve((reader.result as string).split(',')[1]);
                  reader.readAsDataURL(input);
              });
              const base64data = await base64Promise;
              userPart = { inlineData: { mimeType: input.type, data: base64data } };
              
              // Note: We push a placeholder text for history because we can't push audio blobs easily to history for next turns in standard API
              // Ideally we would transcribe it, but for now we rely on the model's immediate context handling or short memory.
              // A better approach for turn-based audio is to just rely on the text response of the model which implies understanding.
              historyRef.current.push({ role: 'user', parts: [{ text: "[Audio Message]" }] });
          }

          // Generate Response
          const result = await ai.models.generateContent({
              model: 'gemini-3-flash-preview',
              contents: [
                  ...historyRef.current.slice(-10), // Keep context manageable
                  { role: 'user', parts: [userPart] } 
              ],
              config: { 
                  systemInstruction: getTeacherPersona(user)
              }
          });

          const replyText = result.text;
          
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
          historyRef.current.push({ role: 'model', parts: [{ text: replyText || "" }] });

          if (replyText) {
              await speakText(replyText);
          } else {
              await speakText("Je n'ai pas bien entendu, peux-tu répéter ?");
          }

      } catch (e) {
          console.error("Processing Error", e);
          notify("Désolé, je n'ai pas compris.", "error");
          startListening(); // Retry
      }
  };

  // --- Render ---

  const formatDuration = (s: number) => {
      const m = Math.floor(s / 60);
      const sec = s % 60;
      return `${m}:${sec < 10 ? '0' : ''}${sec}`;
  };

  const toggleMute = () => {
      const newState = !isMuted;
      setIsMuted(newState);
      if (newState) {
          if (streamRef.current) {
              streamRef.current.getAudioTracks().forEach(track => track.enabled = false);
          }
      } else {
          if (streamRef.current) {
              streamRef.current.getAudioTracks().forEach(track => track.enabled = true);
          }
          // Resume listening loop if we were in listening state
          if (status === 'listening') monitorAudioLevel();
      }
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
                    {status === 'listening' && !isMuted && <span className="text-indigo-400 font-bold animate-pulse flex items-center gap-2"><Mic className="w-4 h-4"/> À vous...</span>}
                    {status === 'listening' && isMuted && <span className="text-red-400 font-bold flex items-center gap-2"><MicOff className="w-4 h-4"/> Micro coupé</span>}
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
                    {status === 'listening' && !isMuted && audioLevel > 10 && (
                        <div className="absolute inset-0 bg-indigo-500/20 rounded-full" style={{ transform: `scale(${1 + audioLevel/200})`, transition: 'transform 0.1s' }}></div>
                    )}

                    <div className={`w-48 h-48 rounded-full bg-gradient-to-br from-slate-800 to-slate-900 border-4 ${status === 'speaking' ? 'border-emerald-500' : status === 'listening' && !isMuted ? 'border-indigo-500' : 'border-white/10'} shadow-2xl flex items-center justify-center overflow-hidden transition-colors duration-500`}>
                        <img src={TEACHER_AVATAR} className={`w-full h-full object-cover p-6 ${status === 'ringing' ? 'animate-bounce-slight' : ''}`} alt="Teacher" />
                    </div>
                </div>

                {/* Subtitles */}
                <div className="mt-8 px-6 py-4 bg-black/40 backdrop-blur-md rounded-2xl max-w-xs text-center border border-white/5 min-h-[80px] flex items-center justify-center transition-all">
                    <p className="text-slate-200 text-sm font-medium leading-relaxed">
                        {status === 'ringing' ? "Préparation de votre cours..." : subtitle || "..."}
                    </p>
                </div>
            </div>

            {/* Input Overlay (Keyboard) */}
            {showKeyboard && (
                <div className="absolute bottom-32 left-4 right-4 z-50 animate-slide-up">
                    <div className="bg-slate-800/95 backdrop-blur-xl p-2 rounded-2xl border border-white/10 shadow-2xl flex gap-2">
                        <input 
                            value={textInput}
                            onChange={(e) => setTextInput(e.target.value)}
                            onKeyDown={(e) => e.key === 'Enter' && handleTextSubmit()}
                            placeholder="Écrivez votre réponse..."
                            autoFocus
                            className="flex-1 bg-transparent border-none outline-none text-white text-base px-3 py-2 placeholder:text-slate-500"
                        />
                        <button onClick={handleTextSubmit} disabled={!textInput.trim()} className="p-3 bg-indigo-600 rounded-xl text-white disabled:opacity-50 font-bold">
                            <Send className="w-5 h-5" />
                        </button>
                    </div>
                    <button onClick={() => setShowKeyboard(false)} className="absolute -top-10 right-0 p-2 bg-black/50 text-white rounded-full backdrop-blur-md"><ChevronDown className="w-5 h-5"/></button>
                </div>
            )}

            {/* Controls */}
            <div className="grid grid-cols-3 gap-8 w-full max-w-xs items-center mb-8 relative z-10">
                {status !== 'ringing' ? (
                    <>
                        <button onClick={toggleMute} className="flex flex-col items-center gap-2 group transition-transform active:scale-95">
                            <div className={`w-14 h-14 rounded-full flex items-center justify-center backdrop-blur-md transition-colors ${isMuted ? 'bg-white text-slate-900' : 'bg-white/10 text-white hover:bg-white/20'}`}>
                                {isMuted ? <MicOff className="w-6 h-6" /> : <Mic className="w-6 h-6" />}
                            </div>
                            <span className="text-[10px] text-white/70 font-bold uppercase">{isMuted ? "Unmute" : "Mute"}</span>
                        </button>
                        
                        <button onClick={onClose} className="flex flex-col items-center gap-2 group transform hover:scale-105 transition-transform active:scale-95">
                            <div className="w-20 h-20 rounded-full bg-red-500 hover:bg-red-600 flex items-center justify-center shadow-lg shadow-red-500/40 border-4 border-white/10">
                                <Phone className="w-8 h-8 text-white fill-white rotate-[135deg]" />
                            </div>
                        </button>

                        <button onClick={() => setShowKeyboard(!showKeyboard)} className={`flex flex-col items-center gap-2 group transition-transform active:scale-95 ${showKeyboard ? 'opacity-100' : 'opacity-100'}`}>
                            <div className={`w-14 h-14 rounded-full flex items-center justify-center backdrop-blur-md transition-colors ${showKeyboard ? 'bg-indigo-600 text-white' : 'bg-white/10 text-white hover:bg-white/20'}`}>
                                <Keyboard className="w-6 h-6" />
                            </div>
                            <span className="text-[10px] text-white/70 font-bold uppercase">Clavier</span>
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