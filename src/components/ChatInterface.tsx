
import React, { useState, useRef, useEffect } from 'react';
import { Send, Mic, Volume2, Menu, User, Loader2, Phone } from 'lucide-react';
import { UserProfile, ChatMessage } from '../types';
import { sendMessageStream, generateSpeech } from '../services/geminiService';
import { storageService } from '../services/storageService';
import MarkdownRenderer from './MarkdownRenderer';

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

const ChatInterface: React.FC<Props> = ({ user, messages, setMessages, onShowProfile, isDarkMode, toggleTheme, notify, onUpdateUser }) => {
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [streamText, setStreamText] = useState('');
  const [isSpeaking, setIsSpeaking] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const audioCtx = useRef<AudioContext | null>(null);

  const initAudio = () => {
    if (!audioCtx.current) audioCtx.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
  };

  const handleSend = async () => {
    if (!input.trim() || isLoading) return;
    initAudio();
    if (!storageService.canPerformRequest(user.id)) { notify("Crédits épuisés", "error"); return; }

    const userMsg: ChatMessage = { id: Date.now().toString(), role: 'user', text: input, timestamp: Date.now() };
    const newHistory = [...messages, userMsg];
    setMessages(newHistory);
    setInput('');
    setIsLoading(true);
    setStreamText('');

    try {
      const fullReply = await sendMessageStream(input, user.id, newHistory, (txt) => setStreamText(txt));
      const aiMsg: ChatMessage = { id: (Date.now() + 1).toString(), role: 'model', text: fullReply, timestamp: Date.now() };
      const finalHistory = [...newHistory, aiMsg];
      setMessages(finalHistory);
      storageService.saveChatHistory(user.id, finalHistory, user.preferences!.targetLanguage);
      onUpdateUser(storageService.getUserById(user.id)!);
    } catch (e) { notify("Erreur de connexion", "error"); }
    finally { setIsLoading(false); setStreamText(''); }
  };

  const playAudio = async (text: string) => {
    if (isSpeaking) return;
    setIsSpeaking(true);
    const raw = await generateSpeech(text, user.preferences?.voiceName);
    if (raw && audioCtx.current) {
        const buffer = await audioCtx.current.decodeAudioData(raw.buffer);
        const source = audioCtx.current.createBufferSource();
        source.buffer = buffer;
        source.connect(audioCtx.current.destination);
        source.onended = () => setIsSpeaking(false);
        source.start(0);
    } else setIsSpeaking(false);
  };

  useEffect(() => { scrollRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages, streamText]);

  return (
    <div className="flex flex-col h-screen overflow-hidden">
      <header className="h-16 flex items-center justify-between px-6 bg-white dark:bg-slate-900 border-b border-slate-100 dark:border-slate-800 shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-indigo-600 flex items-center justify-center text-white font-bold">TM</div>
          <h1 className="font-black text-lg">TeacherMada</h1>
        </div>
        <div className="flex items-center gap-4">
          <div className="px-3 py-1 bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 rounded-full text-xs font-bold">
            {user.role === 'admin' ? '∞' : user.credits} Crédits
          </div>
          <button onClick={onShowProfile} className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-full"><Menu /></button>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto p-4 space-y-6 scrollbar-hide bg-slate-50 dark:bg-slate-950">
        {messages.map((m) => (
          <div key={m.id} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-[85%] p-4 rounded-2xl shadow-sm ${m.role === 'user' ? 'bg-indigo-600 text-white' : 'bg-white dark:bg-slate-800'}`}>
              <MarkdownRenderer content={m.text} />
              {m.role === 'model' && (
                <button onClick={() => playAudio(m.text)} className="mt-2 p-1 text-slate-400 hover:text-indigo-500 transition-colors">
                  <Volume2 size={16} />
                </button>
              )}
            </div>
          </div>
        ))}
        {streamText && (
          <div className="flex justify-start">
            <div className="max-w-[85%] p-4 rounded-2xl bg-white dark:bg-slate-800 shadow-sm">
              <MarkdownRenderer content={streamText} />
            </div>
          </div>
        )}
        <div ref={scrollRef} />
      </div>

      <div className="p-4 bg-white dark:bg-slate-900 border-t border-slate-100 dark:border-slate-800">
        <div className="max-w-4xl mx-auto flex items-center gap-2">
          <textarea 
            value={input} 
            onChange={(e) => setInput(e.target.value)}
            placeholder="Écrire un message..."
            className="flex-1 bg-slate-100 dark:bg-slate-800 rounded-2xl px-4 py-3 resize-none outline-none focus:ring-2 focus:ring-indigo-500 h-12"
            onKeyDown={(e) => { if(e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
          />
          <button onClick={handleSend} disabled={isLoading || !input.trim()} className="p-3 bg-indigo-600 text-white rounded-2xl shadow-lg hover:bg-indigo-700 disabled:opacity-50">
            {isLoading ? <Loader2 className="animate-spin" /> : <Send size={20} />}
          </button>
        </div>
      </div>
    </div>
  );
};

export default ChatInterface;
