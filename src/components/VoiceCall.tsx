import React, { useState, useEffect, useRef } from 'react';
import { X, Phone, Keyboard, Send, Lock, Loader2, ChevronDown, Settings2, Globe, BarChart, Lightbulb, Languages, Sparkles, Mic, Volume2, RefreshCw } from 'lucide-react';
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

// --- Constants ---
const LANGUAGES = [
    { code: 'Anglais', label: 'Anglais 🇬🇧', voice: 'Fenrir', bcp47: 'en-GB' },
    { code: 'Français', label: 'Français 🇫🇷', voice: 'Zephyr', bcp47: 'fr-FR' },
    { code: 'Chinois', label: 'Chinois 🇨🇳', voice: 'Puck', bcp47: 'zh-CN' },
    { code: 'Espagnol', label: 'Espagnol 🇪🇸', voice: 'Kore', bcp47: 'es-ES' },
    { code: 'Allemand', label: 'Allemand 🇩🇪', voice: 'Fenrir', bcp47: 'de-DE' },
    { code: 'Italien', label: 'Italien 🇮🇹', voice: 'Zephyr', bcp47: 'it-IT' },
    { code: 'Portugais', label: 'Portugais 🇵🇹', voice: 'Puck', bcp47: 'pt-PT' },
    { code: 'Russe', label: 'Russe 🇷🇺', voice: 'Fenrir', bcp47: 'ru-RU' },
    { code: 'Japonais', label: 'Japonais 🇯🇵', voice: 'Kore', bcp47: 'ja-JP' },
    { code: 'Coréen', label: 'Coréen 🇰🇷', voice: 'Puck', bcp47: 'ko-KR' },
    { code: 'Hindi', label: 'Hindi 🇮🇳', voice: 'Charon', bcp47: 'hi-IN' },
    { code: 'Arabe', label: 'Arabe 🇸🇦', voice: 'Zephyr', bcp47: 'ar-SA' },
    { code: 'Swahili', label: 'Swahili 🇰🇪', voice: 'Fenrir', bcp47: 'sw-KE' },
];

const LEVELS = ['Débutant (A1)', 'Élémentaire (A2)', 'Intermédiaire (B1)', 'Avancé (B2)', 'Expert (C1)'];

// --- Audio Helpers ---

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
    const buffer = ctx.createBuffer(1, float32.length, 24000);
    buffer.copyToChannel(float32, 0);
    return Promise.resolve(buffer);
}

const getApiKeys = () => {
    const rawKey = process.env.API_KEY || "";
    return rawKey.split(',').map(k => k.trim()).filter(k => k.length >= 10);
};

// Robust Retry Logic with Model Fallback
const generateWithFallback = async (primaryModel: string, params: any, fallbackModel: string = 'gemini-2.0-flash') => {
    const keys = getApiKeys();
    if (keys.length === 0) throw new Error("Clé API manquante.");
    
    // Helper to try a specific model with key rotation
    const tryModel = async (modelName: string) => {
        const shuffledKeys = [...keys].sort(() => 0.5 - Math.random());
        const attempts = Math.min(2, keys.length); // Try 2 keys per model
        
        for (let i = 0; i < attempts; i++) {
            try {
                const ai = new GoogleGenAI({ apiKey: shuffledKeys[i] });
                const result = await ai.models.generateContent({ model: modelName, ...params });
                return result;
            } catch (e: any) {
                console.warn(`Attempt failed with ${modelName}:`, e.message);
                // Continue to next key
            }
        }
        throw new Error(`All keys failed for ${modelName}`);
    };

    try {
        // 1. Try Primary (e.g., Gemini 3)
        return await tryModel(primaryModel);
    } catch (e) {
        console.log("Primary model failed, switching to fallback...");
        // 2. Try Fallback (e.g., Gemini 2.0)
        return await tryModel(fallbackModel);
    }
};

const VoiceCall: React.FC<VoiceCallProps> = ({ user, onClose, onUpdateUser, notify, onShowPayment }) => {
  // States
  const [status, setStatus] = useState<'setup' | 'ringing' | 'connecting' | 'speaking' | 'listening' | 'processing'>('setup');
  const [duration, setDuration] = useState(0);
  const [audioLevel, setAudioLevel] = useState(0);
  
  // Configuration
  const [selectedLang, setSelectedLang] = useState(user.preferences?.targetLanguage?.split(' ')[0] || 'Anglais');
  const [selectedLevel, setSelectedLevel] = useState(user.preferences?.level || 'Débutant (A1)');

  // Interaction
  const [showKeyboard, setShowKeyboard] = useState(false);
  const [textInput, setTextInput] = useState('');
  const [currentTeacherText, setCurrentTeacherText] = useState('');
  
  // Assistance
  const [showHint, setShowHint] = useState(false);
  const [translation, setTranslation] = useState<string | null>(null);
  const [isTranslating, setIsTranslating] = useState(false);

  // Refs for Media
  const audioCtxRef = useRef<AudioContext | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const silenceTimerRef = useRef<any>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const sourceNodeRef = useRef<AudioBufferSourceNode | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const mountedRef = useRef(true);
  
  // Conversation History (Context)
  const historyRef = useRef<{role: string, parts: {text: string}[]}[]>([]);

  const TEACHER_AVATAR = "https://i.ibb.co/B2XmRwmJ/logo.png";

  useEffect(() => {
      mountedRef.current = true;
      return () => { 
          mountedRef.current = false; 
          cleanup();
      };
  }, []);

  useEffect(() => {
      let interval: any;
      if (status !== 'setup' && status !== 'ringing') {
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
          gain.gain.value = 0.05;
          osc.start();
          osc.stop(ctx.currentTime + 0.4);
          setTimeout(() => {
             if(mountedRef.current && status === 'ringing') {
                 const osc2 = ctx.createOscillator();
                 const gain2 = ctx.createGain();
                 osc2.connect(gain2);
                 gain2.connect(ctx.destination);
                 osc2.frequency.value = 440;
                 gain2.gain.value = 0.05;
                 osc2.start();
                 osc2.stop(ctx.currentTime + 0.4);
             }
          }, 800);
      } catch(e){}
  };

  // --- 1. Start Call ---
  const handleStartCall = async () => {
      if (!(await storageService.canRequest(user.id))) {
          notify("Crédits insuffisants.", "error");
          onShowPayment();
          return;
      }

      setStatus('ringing');
      
      // Initialize AudioContext immediately on user gesture
      const ctx = new (window.AudioContext || (window as any).webkitAudioContext)({sampleRate: 24000});
      if (ctx.state === 'suspended') await ctx.resume();
      audioCtxRef.current = ctx;
      
      playRingingTone(ctx);

      // Force a slight delay for realism, then connect
      setTimeout(() => {
          if (mountedRef.current) {
              setStatus('connecting');
              initializeConversation();
          }
      }, 2500);
  };

  const getSystemPrompt = () => `
    RÔLE: Tu es TeacherMada, un professeur de langue natif (${selectedLang}).
    CONTEXTE: Appel téléphonique avec ${user.username}.
    TON: Chaleureux, encourageant, très naturel.
    RÈGLES:
    1. Fais des phrases COURTES (15 mots max). C'est de l'oral.
    2. Pose toujours une petite question de relance.
    3. Ne dis JAMAIS que tu es une IA.
    4. Si l'élève parle une autre langue, traduis et réponds dans la langue cible.
  `;

  const initializeConversation = async () => {
      try {
          // Try Gemini 3, fallback to Gemini 2.0
          const response = await generateWithFallback('gemini-3-flash-preview', {
              contents: [{ role: 'user', parts: [{ text: "L'appel commence. Dis bonjour chaleureusement (max 10 mots) et demande comment ça va." }] }],
              config: { systemInstruction: getSystemPrompt() }
          }, 'gemini-2.0-flash');

          const greeting = response.text || "Bonjour ! Comment vas-tu ?";
          
          // Commit to history ONLY after success
          historyRef.current = [{ role: 'model', parts: [{ text: greeting }] }];
          
          await speakText(greeting);

      } catch (e) {
          console.error("Init failed", e);
          // Hard fallback if everything fails
          const fallback = "Bonjour ! Je suis prêt.";
          historyRef.current = [{ role: 'model', parts: [{ text: fallback }] }];
          await speakText(fallback);
      }
  };

  const speakText = async (text: string) => {
      if (!mountedRef.current) return;
      
      setCurrentTeacherText(text);
      setStatus('speaking');

      try {
          const currentVoice = LANGUAGES.find(l => l.code === selectedLang)?.voice || 'Zephyr';
          
          // Audio generation (No fallback needed usually, but logic kept simple)
          const keys = getApiKeys();
          const ai = new GoogleGenAI({ apiKey: keys[Math.floor(Math.random() * keys.length)] });
          
          const response = await ai.models.generateContent({
              model: 'gemini-2.5-flash-preview-tts',
              contents: [{ parts: [{ text }] }],
              config: {
                  responseModalities: [Modality.AUDIO],
                  speechConfig: {
                      voiceConfig: { prebuiltVoiceConfig: { voiceName: currentVoice } }
                  }
              }
          });

          const audioData = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
          if (!audioData) throw new Error("Audio generation failed");

          const ctx = audioCtxRef.current!;
          if (ctx.state === 'suspended') await ctx.resume();

          const buffer = await base64ToAudioBuffer(audioData, ctx);
          const source = ctx.createBufferSource();
          source.buffer = buffer;
          source.connect(ctx.destination);
          sourceNodeRef.current = source;
          
          source.onended = () => {
              if (mountedRef.current) {
                  // AUTO-SWITCH TO LISTENING
                  startListening();
              }
          };
          source.start();

      } catch (e) {
          console.error("TTS Error", e);
          notify("Erreur audio. Je passe en écoute.", "error");
          // If audio fails, we still want to let the user reply to the text
          setTimeout(() => {
              if(mountedRef.current) startListening(); 
          }, 1000);
      }
  };

  const startListening = async () => {
      if (!mountedRef.current) return;
      if (showHint) return; // Paused for hint reading

      setStatus('listening');
      audioChunksRef.current = [];

      try {
          if (!streamRef.current) {
              const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
              streamRef.current = stream;
          }

          const ctx = audioCtxRef.current!;
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

          recorder.start(100); 
          monitorAudioLevel();

      } catch (e) {
          console.warn("Mic Error", e);
          setShowKeyboard(true);
      }
  };

  const monitorAudioLevel = () => {
      if (!analyserRef.current || status !== 'listening' || showHint) return;

      const dataArray = new Uint8Array(analyserRef.current.frequencyBinCount);
      analyserRef.current.getByteFrequencyData(dataArray);
      const average = dataArray.reduce((a, b) => a + b) / dataArray.length;
      setAudioLevel(average);

      const THRESHOLD = 25; 
      
      if (average > THRESHOLD) { 
          // User is speaking, reset silence timer
          if (silenceTimerRef.current) {
              clearTimeout(silenceTimerRef.current);
              silenceTimerRef.current = null;
          }
      } else { 
          // Silence detection
          if (!silenceTimerRef.current && audioChunksRef.current.length > 5) { 
              silenceTimerRef.current = setTimeout(() => {
                  stopListeningAndSend();
              }, 1800); // 1.8s silence = end of turn
          }
      }

      if (mountedRef.current && status === 'listening') {
          animationFrameRef.current = requestAnimationFrame(monitorAudioLevel);
      }
  };

  const stopListeningAndSend = async () => {
      if (!mediaRecorderRef.current || status !== 'listening') return;
      
      if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
      if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);

      setStatus('processing');

      mediaRecorderRef.current.onstop = async () => {
          const audioBlob = new Blob(audioChunksRef.current, { type: mediaRecorderRef.current?.mimeType || 'audio/webm' });
          
          // CRITICAL FIX: Don't send empty/short noise to API
          if (audioBlob.size < 2000) {
              console.log("Audio too short, ignoring...");
              startListening(); // Just restart listening
              return;
          }
          await processTurn(audioBlob);
      };
      mediaRecorderRef.current.stop();
  };

  const handleTextSubmit = async () => {
      if (!textInput.trim()) return;
      const text = textInput;
      setTextInput('');
      setShowKeyboard(false);
      setStatus('processing');
      await processTurn(text);
  };

  // --- CORE CONVERSATION LOGIC ---
  const processTurn = async (input: Blob | string) => {
      // 1. Prepare User Part
      let userPart: any;
      let tempHistoryEntry: any;

      if (typeof input === 'string') {
          userPart = { text: input };
          tempHistoryEntry = { role: 'user', parts: [{ text: input }] };
      } else {
          const reader = new FileReader();
          const base64Promise = new Promise<string>((resolve) => {
              reader.onloadend = () => resolve((reader.result as string).split(',')[1]);
              reader.readAsDataURL(input);
          });
          const base64data = await base64Promise;
          userPart = { inlineData: { mimeType: input.type, data: base64data } };
          tempHistoryEntry = { role: 'user', parts: [{ text: "(audio)" }] };
      }

      // 2. Build Request (Existing History + New Input)
      const requestContents = [
          ...historyRef.current.slice(-8), 
          { role: 'user', parts: [userPart] }
      ];

      try {
          // 3. Call AI with Fallback
          const result = await generateWithFallback('gemini-3-flash-preview', {
              contents: requestContents,
              config: { systemInstruction: getSystemPrompt() }
          }, 'gemini-2.0-flash');

          const replyText = result.text;
          if (!replyText) throw new Error("Empty response");

          // 4. ATOMIC UPDATE: Consume Credit & Refresh
          // Using deductCreditOrUsage ensures we get the latest user state immediately
          // without waiting for async propagation or risking incomplete objects
          const updatedUser = await storageService.deductCreditOrUsage(user.id);
          
          if (updatedUser) {
              // Safety Check: Ensure preferences exist before updating to avoid onboarding redirect
              if (updatedUser.preferences && updatedUser.preferences.targetLanguage) {
                  if(mountedRef.current) onUpdateUser(updatedUser);
              } else {
                  console.warn("Update received without preferences, skipping UI update to prevent redirect.");
              }
          } else {
              notify("Crédits épuisés.", "error");
              onShowPayment();
              onClose();
              return;
          }

          // Commit to history now
          historyRef.current.push(tempHistoryEntry);
          historyRef.current.push({ role: 'model', parts: [{ text: replyText }] });

          // 5. Play Audio
          await speakText(replyText);

      } catch (e: any) {
          console.error("Turn failed", e);
          notify("Je n'ai pas compris, réessayez.", "warning");
          setTimeout(() => {
              if (mountedRef.current) startListening();
          }, 1500);
      }
  };

  const toggleHint = async () => {
      if (showHint) {
          setShowHint(false);
          // Resume if we were active
          if (status === 'listening' || status === 'speaking') {
              startListening();
          }
      } else {
          // Pause logic
          if (mediaRecorderRef.current?.state === 'recording') mediaRecorderRef.current.stop();
          if (sourceNodeRef.current) sourceNodeRef.current.stop();
          
          setShowHint(true);
          
          if (!currentTeacherText) return;
          setIsTranslating(true);
          try {
              const prompt = `
                Tâche : 
                1. Traduis ceci en Malagasy très simple : "${currentTeacherText}".
                2. Suggère une réponse courte et naturelle que l'élève pourrait dire (dans la langue cible).
                Format : 
                "🇲🇬 [Traduction Malagasy]
                💡 Valiny : [Suggestion de réponse]"
              `;
              const response = await generateWithFallback('gemini-3-flash-preview', {
                  contents: [{ role: 'user', parts: [{ text: prompt }] }]
              }, 'gemini-2.0-flash');
              setTranslation(response.text || "Traduction indisponible");
          } catch (e) {
              setTranslation("Erreur de traduction.");
          } finally {
              setIsTranslating(false);
          }
      }
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
                    <h2 className="text-2xl font-black text-slate-900 dark:text-white">Configuration</h2>
                    <p className="text-slate-500 text-sm mt-1">Personnalisez votre appel</p>
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
                    <div>
                        <label className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2 block flex items-center gap-2"><BarChart className="w-3 h-3" /> Niveau</label>
                        <select value={selectedLevel} onChange={(e) => setSelectedLevel(e.target.value)} className="w-full p-4 bg-slate-50 dark:bg-slate-800 rounded-xl font-bold text-slate-800 dark:text-white outline-none border border-transparent focus:border-indigo-500 appearance-none">
                            {LEVELS.map(l => <option key={l} value={l}>{l}</option>)}
                        </select>
                    </div>
                    <button onClick={handleStartCall} className="w-full py-4 bg-emerald-500 hover:bg-emerald-600 text-white font-black rounded-2xl shadow-lg shadow-emerald-500/30 transform active:scale-95 transition-all flex items-center justify-center gap-2 mt-4"><Phone className="w-5 h-5 fill-current" /> Démarrer l'appel</button>
                </div>
            </div>
        </div>
      );
  }

  return (
    <div className="fixed inset-0 z-[100] bg-slate-950 flex flex-col font-sans overflow-hidden">
        {/* BG Visuals */}
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-indigo-900/40 via-slate-900 to-slate-950"></div>
        
        {/* Header */}
        <div className="relative z-10 p-8 pt-10 text-center">
            <div className="inline-flex items-center gap-2 bg-white/5 px-3 py-1 rounded-full backdrop-blur-md border border-white/10 mb-2">
                <Lock className="w-3 h-3 text-emerald-400" />
                <span className="text-[10px] text-white/60 font-bold uppercase tracking-wider">Secure Channel</span>
            </div>
            <h2 className="text-3xl font-black text-white tracking-tight mb-1">Pratique {selectedLang}</h2>
            <p className="text-indigo-300 text-sm font-medium font-mono tracking-widest">
                {status === 'ringing' ? "Appel entrant..." : status === 'connecting' ? "Connexion..." : `${Math.floor(duration/60)}:${(duration%60).toString().padStart(2,'0')}`}
            </p>
        </div>

        {/* VISUALIZER */}
        <div className="relative flex-1 flex flex-col items-center justify-center w-full mb-10">
            <div className="relative z-20">
                {status === 'speaking' && (
                    <>
                        <div className="absolute inset-0 border-2 border-emerald-500/50 rounded-full animate-[ping_2s_linear_infinite]"></div>
                        <div className="absolute inset-[-10px] border border-emerald-400/30 rounded-full animate-[ping_3s_linear_infinite_0.5s]"></div>
                        <div className="absolute inset-0 bg-emerald-500/20 blur-xl rounded-full animate-pulse"></div>
                    </>
                )}
                {status === 'processing' && <div className="absolute inset-[-4px] border-t-2 border-amber-500 rounded-full animate-spin"></div>}

                <div className={`w-40 h-40 rounded-full bg-slate-900 border-4 shadow-2xl flex items-center justify-center overflow-hidden transition-all duration-500 relative z-20 ${status === 'speaking' ? 'border-emerald-500 scale-105' : status === 'listening' ? 'border-indigo-500' : 'border-white/10'}`}>
                    <img src={TEACHER_AVATAR} className={`w-full h-full object-cover p-5 ${status === 'ringing' ? 'animate-bounce-slight' : ''}`} alt="Teacher" />
                </div>
            </div>

            {/* Waveform */}
            <div className="h-24 flex items-center justify-center gap-1.5 mt-8 w-full max-w-xs">
                {status === 'listening' && !showHint ? (
                    [...Array(7)].map((_, i) => (
                        <div key={i} className="w-2 bg-indigo-500 rounded-full transition-all duration-75" style={{ height: `${Math.max(8, Math.min(60, audioLevel * (1 + Math.random()))) }px`, opacity: 0.6 + (audioLevel / 100) }}></div>
                    ))
                ) : status === 'speaking' ? (
                    <div className="flex items-center gap-2">
                        <span className="w-2 h-2 bg-emerald-500 rounded-full animate-bounce"></span>
                        <span className="w-2 h-2 bg-emerald-500 rounded-full animate-bounce delay-100"></span>
                        <span className="w-2 h-2 bg-emerald-500 rounded-full animate-bounce delay-200"></span>
                    </div>
                ) : <div className="h-1 w-20 bg-white/5 rounded-full"></div>}
            </div>

            <div className="mt-4 h-8 flex items-center justify-center">
                {showHint && <span className="text-yellow-400 font-bold tracking-widest text-sm uppercase flex items-center gap-2 animate-pulse">Lecture / Pause...</span>}
                {!showHint && status === 'speaking' && <span className="text-emerald-400 font-bold tracking-widest text-sm uppercase animate-pulse">Teacher Speaking...</span>}
                {!showHint && status === 'listening' && <span className="text-indigo-400 font-bold tracking-widest text-sm uppercase animate-pulse">Listening...</span>}
                {!showHint && status === 'processing' && <span className="text-amber-400 font-bold tracking-widest text-sm uppercase flex items-center gap-2"><Loader2 className="w-3 h-3 animate-spin"/> Thinking...</span>}
            </div>
        </div>

        {/* Hint / Translation Overlay */}
        {showHint && (
            <div className="absolute bottom-32 left-4 right-4 z-50 animate-slide-up">
                <div className="bg-slate-900/90 backdrop-blur-xl p-6 rounded-3xl border border-white/10 shadow-2xl relative overflow-hidden">
                    <button onClick={toggleHint} className="absolute top-4 right-4 p-2 bg-white/10 rounded-full hover:bg-white/20 transition-colors"><ChevronDown className="w-4 h-4 text-white"/></button>
                    <div className="mb-4">
                        <h4 className="text-xs font-bold text-emerald-400 uppercase tracking-widest mb-2 flex items-center gap-2"><Languages className="w-3 h-3"/> Professeur a dit :</h4>
                        <p className="text-white text-lg font-medium leading-relaxed">{currentTeacherText || "..."}</p>
                    </div>
                    <div className="pt-4 border-t border-white/10">
                        <h4 className="text-xs font-bold text-yellow-400 uppercase tracking-widest mb-2 flex items-center gap-2"><Sparkles className="w-3 h-3"/> Aide & Traduction :</h4>
                        {isTranslating ? <div className="flex items-center gap-2 text-slate-400 text-sm"><Loader2 className="w-4 h-4 animate-spin"/> Traduction...</div> : <div className="text-slate-300 text-sm leading-relaxed whitespace-pre-wrap">{translation || "..."}</div>}
                    </div>
                </div>
            </div>
        )}

        {/* Keyboard Input */}
        {showKeyboard && !showHint && (
            <div className="absolute bottom-32 left-4 right-4 z-50 animate-slide-up">
                <div className="bg-slate-800/95 backdrop-blur-xl p-2 rounded-2xl border border-white/10 shadow-2xl flex gap-2">
                    <input value={textInput} onChange={(e) => setTextInput(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && handleTextSubmit()} placeholder="Écrivez votre réponse..." autoFocus className="flex-1 bg-transparent border-none outline-none text-white text-base px-3 py-2 placeholder:text-slate-500"/>
                    <button onClick={handleTextSubmit} disabled={!textInput.trim()} className="p-3 bg-indigo-600 rounded-xl text-white disabled:opacity-50 font-bold"><Send className="w-5 h-5" /></button>
                </div>
                <button onClick={() => setShowKeyboard(false)} className="absolute -top-10 right-0 p-2 bg-black/50 text-white rounded-full backdrop-blur-md"><ChevronDown className="w-5 h-5"/></button>
            </div>
        )}

        {/* Controls */}
        <div className="grid grid-cols-3 gap-8 w-full max-w-xs mx-auto items-center mb-12 relative z-10">
            {status !== 'ringing' ? (
                <>
                    <button onClick={toggleHint} className="flex flex-col items-center gap-2 group transition-transform active:scale-95">
                        <div className={`w-14 h-14 rounded-full flex items-center justify-center backdrop-blur-md transition-colors border border-white/10 ${showHint ? 'bg-yellow-400 text-slate-900' : 'bg-white/10 text-white hover:bg-white/20'}`}><Lightbulb className="w-6 h-6" /></div>
                        <span className="text-[10px] text-white/50 font-bold uppercase tracking-widest">{showHint ? "Fermer" : "Aide"}</span>
                    </button>
                    
                    <button onClick={onClose} className="flex flex-col items-center gap-2 group transform hover:scale-105 transition-transform active:scale-95">
                        <div className="w-20 h-20 rounded-full bg-red-500 hover:bg-red-600 flex items-center justify-center shadow-lg shadow-red-500/40 border-4 border-white/10"><Phone className="w-8 h-8 text-white fill-white rotate-[135deg]" /></div>
                    </button>

                    <div className="relative flex flex-col items-center gap-2 group transition-transform active:scale-95">
                        <button onClick={() => setShowKeyboard(!showKeyboard)} className={`w-14 h-14 rounded-full flex items-center justify-center backdrop-blur-md transition-colors border border-white/10 ${showKeyboard ? 'bg-indigo-600 text-white' : 'bg-white/10 text-white hover:bg-white/20'}`}><Keyboard className="w-6 h-6" /></button>
                        <span className="text-[10px] text-white/50 font-bold uppercase tracking-widest">Clavier</span>
                    </div>
                </>
            ) : (
                <div className="col-span-3 flex justify-center">
                    <button onClick={onClose} className="flex flex-col items-center gap-2 group transform hover:scale-105 transition-transform">
                        <div className="w-20 h-20 rounded-full bg-red-500 hover:bg-red-600 flex items-center justify-center shadow-lg shadow-red-500/40 border-4 border-white/10"><Phone className="w-8 h-8 text-white fill-white rotate-[135deg]" /></div>
                        <span className="text-xs text-white font-bold mt-2">Refuser</span>
                    </button>
                </div>
            )}
        </div>
    </div>
  );
};

export default VoiceCall;