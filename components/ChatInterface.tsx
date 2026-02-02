
import React, { useState, useRef, useEffect } from 'react';
import { Send, Volume2, Menu, Loader2, Sparkles, Plus, Mic, ArrowLeft } from 'lucide-react';
import { UserProfile, ChatMessage } from '../types';
import { sendMessageStream, textToSpeech } from '../services/geminiService';
import { storageService } from '../services/storageService';
import MarkdownRenderer from './MarkdownRenderer';
import { toast } from './Toaster';

interface Props {
  user: UserProfile;
  onUpdateUser: (u: UserProfile) => void;
  onShowDashboard: () => void;
  isDarkMode: boolean;
  toggleTheme: () => void;
}

const ChatInterface: React.FC<Props> = ({ user, onUpdateUser, onShowDashboard }) => {
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<ChatMessage[]>(() => storageService.getChatHistory(user.preferences!.targetLanguage));
  const [isLoading, setIsLoading] = useState(false);
  const [streamText, setStreamText] = useState('');
  const [isSpeaking, setIsSpeaking] = useState(false);
  
  const scrollRef = useRef<HTMLDivElement>(null);
  const audioCtx = useRef<AudioContext | null>(null);

  useEffect(() => {
    scrollRef.current?.scrollIntoView({ behavior: 'smooth' });
    storageService.saveChatHistory(user.preferences!.targetLanguage, messages);
  }, [messages, streamText]);

  const initAudio = () => {
    if (!audioCtx.current) {
      audioCtx.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
    }
  };

  const handleSend = async () => {
    if (!input.trim() || isLoading) return;
    initAudio();

    if (user.role !== 'admin' && user.credits <= 0) {
      toast.error("Crédits insuffisants. Veuillez recharger.");
      return;
    }

    const userMsg: ChatMessage = { id: Date.now().toString(), role: 'user', text: input, timestamp: Date.now() };
    const newHistory = [...messages, userMsg];
    
    setMessages(newHistory);
    setInput('');
    setIsLoading(true);
    setStreamText('');

    try {
      const fullReply = await sendMessageStream(input, user, newHistory, (txt) => setStreamText(txt));
      const aiMsg: ChatMessage = { id: (Date.now() + 1).toString(), role: 'model', text: fullReply, timestamp: Date.now() };
      setMessages(prev => [...prev, aiMsg]);
      
      // Mise à jour crédits/XP
      if (user.role !== 'admin') {
        const updatedUser = { ...user, credits: user.credits - 1, xp: user.xp + 10 };
        onUpdateUser(updatedUser);
      }
    } catch (e) {
      toast.error("Erreur de connexion IA.");
    } finally {
      setIsLoading(false);
      setStreamText('');
    }
  };

  const playSpeech = async (text: string) => {
    if (isSpeaking) return;
    initAudio();
    setIsSpeaking(true);
    const bytes = await textToSpeech(text, user.preferences?.voiceName);
    if (bytes && audioCtx.current) {
      const buffer = await audioCtx.current.decodeAudioData(bytes.buffer);
      const source = audioCtx.current.createBufferSource();
      source.buffer = buffer;
      source.connect(audioCtx.current.destination);
      source.onended = () => setIsSpeaking(false);
      source.start(0);
    } else setIsSpeaking(false);
  };

  return (
    <div className="flex flex-col h-screen overflow-hidden bg-slate-50 dark:bg-slate-950 font-sans safe-top safe-bottom">
      {/* Header Compact */}
      <header className="h-16 flex items-center justify-between px-4 bg-white/80 dark:bg-slate-900/80 backdrop-blur-md border-b dark:border-slate-800 shrink-0 z-40">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-brand-600 flex items-center justify-center text-white shadow-lg shadow-brand-500/20">
             <img src="https://i.ibb.co/B2XmRwmJ/logo.png" className="w-6 h-6 object-contain" />
          </div>
          <div>
            <h1 className="text-sm font-bold truncate max-w-[120px]">{user.preferences?.targetLanguage}</h1>
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{user.preferences?.level}</p>
          </div>
        </div>
        
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5 px-3 py-1.5 bg-brand-50 dark:bg-brand-900/20 text-brand-600 dark:text-brand-400 rounded-full text-xs font-bold">
            <Sparkles className="w-3 h-3" /> {user.credits}
          </div>
          <button onClick={onShowDashboard} className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-all">
            <Menu className="w-5 h-5" />
          </button>
        </div>
      </header>

      {/* Zone de Chat */}
      <main className="flex-1 overflow-y-auto p-4 space-y-6 scrollbar-hide">
        {messages.map((m) => (
          <div key={m.id} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'} animate-fade-in`}>
            <div className={`max-w-[85%] md:max-w-[70%] p-4 rounded-2xl shadow-sm ${m.role === 'user' ? 'bg-brand-600 text-white rounded-tr-none' : 'bg-white dark:bg-slate-900 border dark:border-slate-800 rounded-tl-none'}`}>
              <MarkdownRenderer content={m.text} />
              {m.role === 'model' && (
                <div className="mt-3 pt-3 border-t dark:border-slate-800 flex gap-2">
                  <button onClick={() => playSpeech(m.text)} className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg text-slate-400 hover:text-brand-500 transition-colors">
                    <Volume2 size={16} />
                  </button>
                </div>
              )}
            </div>
          </div>
        ))}
        {streamText && (
          <div className="flex justify-start animate-fade-in">
             <div className="max-w-[85%] p-4 rounded-2xl bg-white dark:bg-slate-900 border dark:border-slate-800 rounded-tl-none shadow-sm">
               <MarkdownRenderer content={streamText} />
             </div>
          </div>
        )}
        {isLoading && !streamText && (
           <div className="flex justify-start">
             <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border dark:border-slate-800 shadow-sm">
                <Loader2 className="w-5 h-5 animate-spin text-brand-500" />
             </div>
           </div>
        )}
        <div ref={scrollRef} className="h-10" />
      </main>

      {/* Barre de Saisie */}
      <footer className="p-4 bg-white dark:bg-slate-900 border-t dark:border-slate-800">
        <div className="max-w-4xl mx-auto flex items-end gap-2 bg-slate-100 dark:bg-slate-800 p-1.5 rounded-[1.8rem] transition-all focus-within:ring-2 ring-brand-500/20">
          <textarea 
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Posez une question..."
            rows={1}
            className="flex-1 bg-transparent px-4 py-3 resize-none outline-none text-sm dark:text-white max-h-32"
            onKeyDown={(e) => { if(e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
          />
          <button 
            onClick={handleSend}
            disabled={!input.trim() || isLoading}
            className="p-3.5 bg-brand-600 text-white rounded-full shadow-lg shadow-brand-500/30 hover:scale-105 active:scale-95 transition-all disabled:opacity-50"
          >
            {isLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Send className="w-5 h-5" />}
          </button>
        </div>
      </footer>
    </div>
  );
};

export default ChatInterface;
