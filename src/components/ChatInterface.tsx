import React, { useState, useRef, useEffect } from 'react';
import { Send, Menu, ArrowRight, BookOpen, Star, Mic } from 'lucide-react';
import { UserProfile, ChatMessage, LearningSession } from '../types';
import { sendMessageStream, generateNextLessonPrompt } from '../services/geminiService';
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

const ChatInterface: React.FC<Props> = ({ user, session, onShowProfile, onUpdateUser, notify }) => {
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<ChatMessage[]>(session.messages);
  const [isStreaming, setIsStreaming] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  const progressPercent = Math.min((messages.length / 50) * 100, 100);

  const processMessage = async (text: string, isAuto: boolean = false) => {
    if (isStreaming) return;
    
    const userMsg: ChatMessage = { 
        id: Date.now().toString(), 
        role: 'user', 
        text: isAuto ? "➡️ Continuer le cours" : text, 
        timestamp: Date.now() 
    };
    
    // Optimistic update
    const newHistory = [...messages, userMsg];
    setMessages(newHistory);
    setInput('');
    setIsStreaming(true);

    try {
      const promptToSend = isAuto ? generateNextLessonPrompt(user) : text;
      
      // Initialize empty AI message
      const aiMsgId = (Date.now() + 1).toString();
      const initialAiMsg: ChatMessage = { 
          id: aiMsgId, 
          role: 'model', 
          text: "", 
          timestamp: Date.now() 
      };
      
      setMessages(prev => [...prev, initialAiMsg]);

      // Stream handling
      const stream = sendMessageStream(promptToSend, user, messages);
      let fullText = "";

      for await (const chunk of stream) {
        if (chunk) {
            fullText += chunk;
            setMessages(prev => prev.map(m => m.id === aiMsgId ? { ...m, text: fullText } : m));
            scrollRef.current?.scrollIntoView({ behavior: 'smooth' });
        }
      }
      
      // Final Save
      const finalHistory = [...newHistory, { ...initialAiMsg, text: fullText }];
      
      const updatedSession = { ...session, messages: finalHistory, progress: progressPercent };
      storageService.saveSession(updatedSession);
      
      const updatedUser = { ...user, stats: { ...user.stats, xp: user.stats.xp + 5 } };
      storageService.saveUserProfile(updatedUser);
      onUpdateUser(updatedUser);

    } catch (e) {
      notify("Erreur de connexion.", "error");
    } finally {
      setIsStreaming(false);
    }
  };

  const handleSend = () => {
    if (!input.trim()) return;
    processMessage(input);
  };

  const handleNext = () => {
    processMessage("", true);
  };

  useEffect(() => {
    scrollRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  return (
    <div className="flex flex-col h-screen bg-slate-50 dark:bg-slate-950 font-sans transition-colors duration-300">
      
      {/* Top Bar */}
      <header className="bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 h-16 flex items-center justify-between px-4 shrink-0 z-20 shadow-sm safe-top">
        <div className="flex items-center gap-3">
            <button onClick={onShowProfile} className="p-2 -ml-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-full transition-colors text-slate-600 dark:text-slate-300">
                <Menu className="w-6 h-6" />
            </button>
            <div className="flex flex-col">
                <h1 className="text-sm font-bold text-slate-800 dark:text-white flex items-center gap-2">
                    {user.preferences?.targetLanguage}
                </h1>
                <div className="flex items-center gap-2 w-32">
                    <div className="flex-1 h-1.5 bg-slate-200 dark:bg-slate-800 rounded-full overflow-hidden">
                        <div className="h-full bg-indigo-500 transition-all duration-500" style={{ width: `${progressPercent}%` }} />
                    </div>
                </div>
            </div>
        </div>

        <div className="flex items-center gap-1 bg-amber-50 dark:bg-amber-900/20 px-3 py-1.5 rounded-full border border-amber-100 dark:border-amber-900/50">
            <Star className="w-4 h-4 text-amber-500 fill-amber-500" />
            <span className="text-xs font-bold text-amber-700 dark:text-amber-400">{user.stats.xp}</span>
        </div>
      </header>

      {/* Chat Area */}
      <main className="flex-1 overflow-y-auto p-4 space-y-6 scrollbar-hide relative">
        {messages.length === 0 && (
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none opacity-50">
                <div className="text-center">
                    <BookOpen className="w-16 h-16 text-slate-300 mx-auto mb-4" />
                    <p className="text-slate-400 font-medium">Le cours commence ici.</p>
                </div>
            </div>
        )}
        
        {messages.map((msg, idx) => (
          <div key={msg.id || idx} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'} animate-fade-in-up`}>
            <div className={`max-w-[90%] md:max-w-[75%] p-4 rounded-2xl text-sm leading-relaxed shadow-sm ${
                msg.role === 'user' 
                ? 'bg-indigo-600 text-white rounded-tr-none' 
                : 'bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 border border-slate-100 dark:border-slate-700 rounded-tl-none'
            }`}>
              <MarkdownRenderer content={msg.text} />
            </div>
          </div>
        ))}
        
        {isStreaming && messages[messages.length - 1]?.role === 'user' && (
            <div className="flex justify-start animate-fade-in">
                <div className="bg-white dark:bg-slate-800 p-4 rounded-2xl rounded-tl-none shadow-sm border border-slate-100 dark:border-slate-700 flex items-center gap-2">
                    <div className="w-2 h-2 bg-indigo-400 rounded-full animate-bounce"></div>
                    <div className="w-2 h-2 bg-indigo-400 rounded-full animate-bounce delay-100"></div>
                    <div className="w-2 h-2 bg-indigo-400 rounded-full animate-bounce delay-200"></div>
                </div>
            </div>
        )}
        <div ref={scrollRef} className="h-4" />
      </main>

      {/* Input Area */}
      <footer className="bg-white dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800 p-4 safe-bottom">
        <div className="max-w-3xl mx-auto flex gap-3 items-end">
            <div className="flex-1 bg-slate-100 dark:bg-slate-800 rounded-2xl p-2 focus-within:ring-2 ring-indigo-500/50 transition-all">
                <textarea
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); }}}
                    placeholder="Posez une question..."
                    className="w-full bg-transparent border-none outline-none text-slate-800 dark:text-white text-sm px-2 resize-none max-h-32"
                    rows={1}
                    style={{ minHeight: '44px', lineHeight: '1.5', padding: '10px' }}
                />
            </div>
            
            {input.trim().length === 0 ? (
                <button 
                    onClick={handleNext}
                    disabled={isStreaming}
                    className="h-[52px] px-6 bg-emerald-500 hover:bg-emerald-600 text-white rounded-2xl font-bold text-sm shadow-lg shadow-emerald-500/20 transition-all active:scale-95 flex items-center gap-2"
                >
                    Suivant <ArrowRight className="w-4 h-4" />
                </button>
            ) : (
                <button 
                    onClick={handleSend}
                    disabled={isStreaming}
                    className="h-[52px] w-[52px] bg-indigo-600 hover:bg-indigo-700 text-white rounded-2xl shadow-lg shadow-indigo-500/20 transition-all active:scale-95 flex items-center justify-center"
                >
                    <Send className="w-5 h-5" />
                </button>
            )}
        </div>
      </footer>
    </div>
  );
};

export default ChatInterface;