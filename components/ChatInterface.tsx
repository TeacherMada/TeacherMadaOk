
import React, { useState, useRef, useEffect } from 'react';
import { Send, Menu, Loader2, ArrowLeft, Trophy } from 'lucide-react';
import { UserProfile, ChatMessage, LearningSession } from '../types';
import { sendMessage } from '../services/geminiService';
import { storageService } from '../services/storageService';
import MarkdownRenderer from './MarkdownRenderer';
import { toast } from './Toaster';

interface Props {
  user: UserProfile;
  session: LearningSession;
  onShowProfile: () => void;
  onExit: () => void;
  onUpdateUser: (u: UserProfile) => void;
  notify: (m: string, t?: string) => void;
}

const ChatInterface: React.FC<Props> = ({ user, session, onShowProfile, onExit, onUpdateUser }) => {
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<ChatMessage[]>(session.messages);
  const [isLoading, setIsLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  const handleSend = async () => {
    if (!input.trim() || isLoading) return;

    if (!storageService.canRequest(user.id)) {
      toast.error("Crédits insuffisants.");
      return;
    }

    const userMsg: ChatMessage = { id: Date.now().toString(), role: 'user', text: input, timestamp: Date.now() };
    const newHistory = [...messages, userMsg];
    
    setMessages(newHistory);
    setInput('');
    setIsLoading(true);

    try {
      const responseText = await sendMessage(input, user, newHistory);
      
      const aiMsg: ChatMessage = { id: (Date.now() + 1).toString(), role: 'model', text: responseText, timestamp: Date.now() };
      const finalHistory = [...newHistory, aiMsg];
      
      setMessages(finalHistory);
      storageService.saveSession({ ...session, messages: finalHistory });
      
      // Update user stats (credits deducted in service)
      const updatedUser = storageService.getUserById(user.id);
      if (updatedUser) onUpdateUser(updatedUser);
      
    } catch (e) {
      toast.error("Erreur de connexion.");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    scrollRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isLoading]);

  return (
    <div className="flex flex-col h-screen overflow-hidden bg-slate-50 dark:bg-slate-950">
      {/* Header */}
      <header className="bg-white dark:bg-slate-900 border-b border-slate-100 dark:border-slate-800 shrink-0 z-40">
        <div className="h-14 flex items-center justify-between px-4">
          <div className="flex items-center gap-3">
            <button onClick={onExit} className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-full">
              <ArrowLeft size={20} />
            </button>
            <div>
              <h2 className="text-sm font-bold truncate max-w-[150px]">{user.preferences?.targetLanguage}</h2>
              <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">{user.preferences?.level}</p>
            </div>
          </div>
          
          <div className="flex items-center gap-4">
            <div className="hidden sm:flex items-center gap-2 px-3 py-1 bg-amber-50 dark:bg-amber-900/20 text-amber-600 rounded-full text-xs font-bold">
              <Trophy size={14} /> {user.credits} Crd
            </div>
            <button onClick={onShowProfile} className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-full transition-colors">
              <Menu size={20} />
            </button>
          </div>
        </div>
      </header>

      {/* Messages */}
      <main className="flex-1 overflow-y-auto p-4 md:p-6 space-y-6 scrollbar-hide">
        {messages.map((m) => (
          <div key={m.id} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'} animate-fade-in-up`}>
            <div className={`max-w-[85%] p-4 rounded-2xl shadow-sm ${m.role === 'user' ? 'bg-indigo-600 text-white rounded-tr-none' : 'bg-white dark:bg-slate-800 border dark:border-slate-700 rounded-tl-none'}`}>
              <MarkdownRenderer content={m.text} />
            </div>
          </div>
        ))}

        {isLoading && (
          <div className="flex justify-start">
             <div className="bg-white dark:bg-slate-800 p-4 rounded-2xl rounded-tl-none shadow-sm border border-slate-100 dark:border-slate-700">
                <Loader2 className="animate-spin text-indigo-500" size={20} />
             </div>
          </div>
        )}
        <div ref={scrollRef} className="h-4" />
      </main>

      {/* Input */}
      <footer className="p-4 bg-white dark:bg-slate-900 border-t border-slate-100 dark:border-slate-800">
        <div className="max-w-4xl mx-auto flex items-center gap-3">
          <div className="flex-1 relative">
            <textarea 
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Posez une question..."
              className="w-full bg-slate-100 dark:bg-slate-800/50 rounded-2xl px-4 py-3 resize-none outline-none focus:ring-2 ring-indigo-500/20 text-sm h-12 max-h-32"
              onKeyDown={(e) => { if(e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
            />
          </div>

          <button 
            onClick={handleSend}
            disabled={isLoading || !input.trim()}
            className="p-3.5 bg-indigo-600 text-white rounded-2xl shadow-lg hover:bg-indigo-700 disabled:opacity-50 transition-all"
          >
            {isLoading ? <Loader2 className="animate-spin" size={20} /> : <Send size={20} />}
          </button>
        </div>
      </footer>
    </div>
  );
};

export default ChatInterface;
