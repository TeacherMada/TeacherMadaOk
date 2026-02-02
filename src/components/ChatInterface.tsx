
import React, { useState, useRef, useEffect } from 'react';
import { Send, Volume2, Menu, Loader2, RefreshCcw, ArrowLeft, Trophy, Sparkles } from 'lucide-react';
import { UserProfile, ChatMessage, LearningSession } from '../types';
import { streamTeacherResponse, speak } from '../services/geminiService';
import { storageService } from '../services/storageService';
import MarkdownRenderer from './MarkdownRenderer';

interface Props {
  user: UserProfile;
  session: LearningSession;
  onShowProfile: () => void;
  onExit: () => void;
  onUpdateUser: (u: UserProfile) => void;
  notify: (m: string, t?: string) => void;
}

const ChatInterface: React.FC<Props> = ({ user, session, onShowProfile, onExit, onUpdateUser, notify }) => {
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<ChatMessage[]>(session.messages);
  const [isLoading, setIsLoading] = useState(false);
  const [streamText, setStreamText] = useState('');
  const [isSpeaking, setIsSpeaking] = useState(false);
  
  const scrollRef = useRef<HTMLDivElement>(null);
  const audioCtx = useRef<AudioContext | null>(null);

  const initAudio = () => {
    if (!audioCtx.current) {
      audioCtx.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
    }
  };

  const handleSend = async () => {
    if (!input.trim() || isLoading) return;
    initAudio();

    if (!storageService.canRequest(user.id)) {
      notify("Crédits insuffisants. Rechargez votre compte.", "error");
      return;
    }

    const userMsg: ChatMessage = { id: Date.now().toString(), role: 'user', text: input, timestamp: Date.now() };
    const newHistory = [...messages, userMsg];
    
    setMessages(newHistory);
    setInput('');
    setIsLoading(true);
    setStreamText('');

    try {
      const fullReply = await streamTeacherResponse(input, user, newHistory, (chunk) => setStreamText(chunk));
      
      const aiMsg: ChatMessage = { id: (Date.now() + 1).toString(), role: 'model', text: fullReply, timestamp: Date.now() };
      const finalHistory = [...newHistory, aiMsg];
      
      setMessages(finalHistory);
      storageService.saveSession({ ...session, messages: finalHistory });
      onUpdateUser(storageService.getUserById(user.id)!);
    } catch (e) {
      notify("La connexion a échoué.", "error");
    } finally {
      setIsLoading(false);
      setStreamText('');
    }
  };

  const handleReset = () => {
    if (window.confirm("Voulez-vous vraiment recommencer ce cours de zéro ?")) {
      setMessages([]);
      storageService.saveSession({ ...session, messages: [], progress: 0 });
      notify("Cours réinitialisé.");
    }
  };

  const playAudio = async (text: string) => {
    if (isSpeaking) return;
    setIsSpeaking(true);
    initAudio();
    
    const raw = await speak(text, user.preferences?.voiceName);
    if (raw && audioCtx.current) {
        const buffer = await audioCtx.current.decodeAudioData(raw.buffer);
        const source = audioCtx.current.createBufferSource();
        source.buffer = buffer;
        source.connect(audioCtx.current.destination);
        source.onended = () => setIsSpeaking(false);
        source.start(0);
    } else {
        setIsSpeaking(false);
    }
  };

  useEffect(() => {
    scrollRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, streamText]);

  return (
    <div className="flex flex-col h-screen overflow-hidden bg-slate-50 dark:bg-slate-950">
      {/* Header avec barre de progression */}
      <header className="bg-white dark:bg-slate-900 border-b border-slate-100 dark:border-slate-800 shrink-0 z-40">
        <div className="h-14 flex items-center justify-between px-4">
          <div className="flex items-center gap-3">
            <button onClick={onExit} className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-full">
              <ArrowLeft size={20} />
            </button>
            <div>
              <h2 className="text-sm font-bold truncate max-w-[150px]">{user.preferences?.targetLanguage}</h2>
              <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">{user.preferences?.level} • {user.preferences?.mode.split(' ')[0]}</p>
            </div>
          </div>
          
          <div className="flex items-center gap-4">
            <div className="hidden sm:flex items-center gap-2 px-3 py-1 bg-amber-50 dark:bg-amber-900/20 text-amber-600 rounded-full text-xs font-bold">
              <Trophy size={14} /> {user.stats.xp} XP
            </div>
            <button onClick={onShowProfile} className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-full transition-colors">
              <Menu size={20} />
            </button>
          </div>
        </div>
        
        {/* Progress Bar */}
        <div className="h-1.5 w-full bg-slate-100 dark:bg-slate-800">
           <div className="h-full bg-indigo-500 transition-all duration-1000 ease-out" style={{ width: `${session.progress}%` }} />
        </div>
      </header>

      {/* Zone de messages */}
      <main className="flex-1 overflow-y-auto p-4 md:p-6 space-y-6 scrollbar-hide">
        {messages.length === 0 && !isLoading && (
          <div className="flex flex-col items-center justify-center h-full text-center space-y-4 opacity-60 animate-fade-in">
             <div className="w-16 h-16 bg-indigo-100 dark:bg-indigo-900/30 rounded-full flex items-center justify-center text-indigo-600">
               <Sparkles size={32} />
             </div>
             <p className="font-bold text-slate-500">Prêt pour votre leçon ?<br/>Dites "Bonjour" pour commencer !</p>
          </div>
        )}

        {messages.map((m) => (
          <div key={m.id} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'} animate-fade-in-up`}>
            <div className={`max-w-[85%] p-4 rounded-2xl shadow-sm ${m.role === 'user' ? 'bg-indigo-600 text-white rounded-tr-none' : 'bg-white dark:bg-slate-800 border dark:border-slate-700 rounded-tl-none'}`}>
              <MarkdownRenderer content={m.text} />
              {m.role === 'model' && (
                <div className="mt-3 pt-2 border-t border-slate-100 dark:border-slate-700 flex gap-2">
                  <button onClick={() => playAudio(m.text)} className="p-2 hover:bg-indigo-50 dark:hover:bg-indigo-900/30 rounded-full text-indigo-500 transition-colors">
                    <Volume2 size={16} />
                  </button>
                </div>
              )}
            </div>
          </div>
        ))}

        {streamText && (
          <div className="flex justify-start animate-fade-in">
            <div className="max-w-[85%] p-4 rounded-2xl bg-white dark:bg-slate-800 border dark:border-slate-700 rounded-tl-none shadow-sm">
              <MarkdownRenderer content={streamText} />
            </div>
          </div>
        )}

        {isLoading && !streamText && (
          <div className="flex justify-start">
             <div className="bg-white dark:bg-slate-800 p-4 rounded-2xl rounded-tl-none shadow-sm border border-slate-100 dark:border-slate-700">
                <Loader2 className="animate-spin text-indigo-500" size={20} />
             </div>
          </div>
        )}
        <div ref={scrollRef} className="h-4" />
      </main>

      {/* Footer input Area */}
      <footer className="p-4 bg-white dark:bg-slate-900 border-t border-slate-100 dark:border-slate-800">
        <div className="max-w-4xl mx-auto flex items-center gap-3">
          <button onClick={handleReset} title="Recommencer" className="p-3 text-slate-400 hover:text-red-500 transition-colors">
            <RefreshCcw size={20} />
          </button>
          
          <div className="flex-1 relative">
            <textarea 
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Répondez ou posez une question..."
              className="w-full bg-slate-100 dark:bg-slate-800/50 rounded-2xl px-4 py-3 resize-none outline-none focus:ring-2 ring-indigo-500/20 text-sm h-12 max-h-32 transition-all"
              onKeyDown={(e) => { if(e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
            />
          </div>

          <button 
            onClick={handleSend}
            disabled={isLoading || !input.trim()}
            className="p-3.5 bg-indigo-600 text-white rounded-2xl shadow-lg shadow-indigo-500/30 hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transform active:scale-95 transition-all"
          >
            {isLoading ? <Loader2 className="animate-spin" size={20} /> : <Send size={20} />}
          </button>
        </div>
      </footer>
    </div>
  );
};

export default ChatInterface;
