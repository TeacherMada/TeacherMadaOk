
import React, { useState, useRef, useEffect } from 'react';
import { Send, Volume2, Menu, User, Loader2, Mic, Globe, Coins, ShieldAlert } from 'lucide-react';
import { UserProfile, ChatMessage } from '../types';
import { sendMessageStream, generateSpeech } from '../services/geminiService';
import { storageService } from '../services/storageService';
import MarkdownRenderer from './MarkdownRenderer';
import PaymentModal from './PaymentModal';

interface Props {
  user: UserProfile;
  messages: ChatMessage[];
  setMessages: React.Dispatch<React.SetStateAction<ChatMessage[]>>;
  onShowProfile: () => void;
  isDarkMode: boolean;
  toggleTheme: () => void;
  notify: (m: string, t?: string) => void;
  onUpdateUser: (u: UserProfile) => void;
}

const ChatInterface: React.FC<Props> = ({ user, messages, setMessages, onShowProfile, notify, onUpdateUser }) => {
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [streamText, setStreamText] = useState('');
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [showPayment, setShowPayment] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const audioCtx = useRef<AudioContext | null>(null);

  const initAudio = () => {
    if (!audioCtx.current) {
      audioCtx.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
    }
    if (audioCtx.current.state === 'suspended') audioCtx.current.resume();
  };

  const handleSend = async () => {
    if (!input.trim() || isLoading) return;
    initAudio();
    
    if (!storageService.canPerformRequest(user.id)) {
      setShowPayment(true);
      return;
    }

    const userMsg: ChatMessage = { id: Date.now().toString(), role: 'user', text: input, timestamp: Date.now() };
    const newHistory = [...messages, userMsg];
    setMessages(newHistory);
    setInput('');
    setIsLoading(true);
    setStreamText('');

    try {
      const full = await sendMessageStream(input, user.id, newHistory, (txt) => setStreamText(txt));
      const aiMsg: ChatMessage = { id: (Date.now() + 1).toString(), role: 'model', text: full, timestamp: Date.now() };
      const final = [...newHistory, aiMsg];
      setMessages(final);
      storageService.saveChatHistory(user.id, final, user.preferences!.targetLanguage);
      onUpdateUser(storageService.getUserById(user.id)!);
    } catch (e) {
      notify("Erreur de connexion IA.", "error");
    } finally {
      setIsLoading(false);
      setStreamText('');
    }
  };

  const playAudio = async (text: string) => {
    if (isSpeaking) return;
    initAudio();
    setIsSpeaking(true);
    const raw = await generateSpeech(text, user.preferences?.voiceName);
    if (raw && audioCtx.current) {
      const audioBuffer = audioCtx.current.createBuffer(1, raw.length, 24000);
      const channelData = audioBuffer.getChannelData(0);
      const int16 = new Int16Array(raw.buffer);
      for (let i = 0; i < int16.length; i++) channelData[i] = int16[i] / 32768.0;
      
      const source = audioCtx.current.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(audioCtx.current.destination);
      source.onended = () => setIsSpeaking(false);
      source.start(0);
    } else setIsSpeaking(false);
  };

  useEffect(() => { scrollRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages, streamText]);

  return (
    <div className="flex flex-col h-screen overflow-hidden bg-slate-50 dark:bg-slate-950 font-sans">
      {showPayment && <PaymentModal user={user} onClose={() => setShowPayment(false)} />}
      
      <header className="h-16 flex items-center justify-between px-6 bg-white/80 dark:bg-slate-900/80 backdrop-blur-md border-b dark:border-slate-800 shrink-0 z-40">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-indigo-600 flex items-center justify-center text-white font-black shadow-lg shadow-indigo-500/20">TM</div>
          <div className="hidden sm:block">
            <h1 className="font-black text-lg tracking-tight">TeacherMada</h1>
            <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest">{user.preferences?.targetLanguage.split(' ')[0]}</p>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <button onClick={() => setShowPayment(true)} className="flex items-center gap-2 px-3 py-1.5 bg-indigo-50 dark:bg-indigo-900/20 text-indigo-700 dark:text-indigo-300 rounded-full text-xs font-black transition-all hover:scale-105">
            <Coins className="w-4 h-4 text-amber-500" />
            {user.role === 'admin' ? '∞' : user.credits}
          </button>
          <button onClick={onShowProfile} className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-full transition-colors"><Menu /></button>
        </div>
      </header>

      <main className="flex-1 overflow-y-auto p-4 md:p-6 space-y-6 scrollbar-hide">
        {messages.map((m) => (
          <div key={m.id} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'} animate-fade-in`}>
            <div className={`max-w-[90%] md:max-w-[80%] p-4 rounded-3xl shadow-sm ${m.role === 'user' ? 'bg-indigo-600 text-white rounded-tr-none' : 'bg-white dark:bg-slate-800 dark:text-slate-200 rounded-tl-none border dark:border-slate-700'}`}>
              <MarkdownRenderer content={m.text} />
              {m.role === 'model' && (
                <div className="mt-3 pt-2 border-t dark:border-slate-700 flex gap-2">
                  <button onClick={() => playAudio(m.text)} className="p-2 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-full text-slate-400 hover:text-indigo-500 transition-all">
                    <Volume2 size={16} />
                  </button>
                </div>
              )}
            </div>
          </div>
        ))}
        {streamText && (
          <div className="flex justify-start">
            <div className="max-w-[90%] md:max-w-[80%] p-4 rounded-3xl bg-white dark:bg-slate-800 shadow-sm rounded-tl-none border dark:border-slate-700">
              <MarkdownRenderer content={streamText} />
            </div>
          </div>
        )}
        {isLoading && !streamText && (
          <div className="flex justify-start">
            <div className="p-4 bg-white dark:bg-slate-800 rounded-2xl shadow-sm border dark:border-slate-700">
              <Loader2 className="w-5 h-5 animate-spin text-indigo-500" />
            </div>
          </div>
        )}
        <div ref={scrollRef} className="h-10" />
      </main>

      <footer className="p-4 bg-white/80 dark:bg-slate-900/80 backdrop-blur-md border-t dark:border-slate-800">
        <div className="max-w-4xl mx-auto flex items-end gap-2 bg-slate-100 dark:bg-slate-800 p-2 rounded-[2rem] border dark:border-slate-700 focus-within:ring-2 ring-indigo-500/20 transition-all">
          <textarea 
            value={input} onChange={(e) => setInput(e.target.value)}
            placeholder="Répondez ici..."
            className="flex-1 bg-transparent px-4 py-3 resize-none outline-none text-slate-800 dark:text-white max-h-32 text-base"
            rows={1}
            onKeyDown={(e) => { if(e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
          />
          <button onClick={handleSend} disabled={isLoading || !input.trim()} className="p-4 bg-indigo-600 text-white rounded-full shadow-lg shadow-indigo-500/30 hover:bg-indigo-700 disabled:opacity-50 transition-all transform active:scale-90 shrink-0">
            {isLoading ? <Loader2 className="animate-spin w-5 h-5" /> : <Send size={20} />}
          </button>
        </div>
      </footer>
    </div>
  );
};

export default ChatInterface;
