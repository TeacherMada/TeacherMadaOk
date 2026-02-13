
import React, { useState, useRef, useEffect } from 'react';
import { Bot, X, Send, LifeBuoy, Sparkles } from 'lucide-react';
import { UserProfile } from '../types';
import { generateSupportResponse } from '../services/geminiService';
import MarkdownRenderer from './MarkdownRenderer';

interface TutorialAgentProps {
  user: UserProfile;
  context: string; // Describes the current screen/mode
}

interface SupportMessage {
  id: string;
  role: 'user' | 'assistant';
  text: string;
}

const TutorialAgent: React.FC<TutorialAgentProps> = ({ user, context }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<SupportMessage[]>([]);
  const [isTyping, setIsTyping] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Initial Greeting based on context
  useEffect(() => {
    if (isOpen && messages.length === 0) {
      setMessages([
        { 
          id: 'welcome', 
          role: 'assistant', 
          text: `Bonjour ${user.username} ! 👋 \n\nJe suis votre guide TeacherMada. Vous êtes actuellement sur **${context}**.\n\nComment puis-je vous aider à utiliser l'application ?` 
        }
      ]);
    }
  }, [isOpen, context, user.username]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isTyping]);

  const handleSend = async () => {
    if (!input.trim() || isTyping) return;

    const userText = input;
    const newMsg: SupportMessage = { id: Date.now().toString(), role: 'user', text: userText };
    
    setMessages(prev => [...prev, newMsg]);
    setInput('');
    setIsTyping(true);

    try {
      // Filter history for context
      const historyForAI = messages.map(m => ({ role: m.role, text: m.text }));
      
      const responseText = await generateSupportResponse(userText, context, user, historyForAI);
      
      const aiMsg: SupportMessage = { 
        id: (Date.now() + 1).toString(), 
        role: 'assistant', 
        text: responseText 
      };
      
      setMessages(prev => [...prev, aiMsg]);
    } catch (e) {
      setMessages(prev => [...prev, { id: 'err', role: 'assistant', text: "Désolé, j'ai eu un petit souci de connexion. Réessayez ?" }]);
    } finally {
      setIsTyping(false);
    }
  };

  return (
    <>
      {/* Floating Action Button (FAB) */}
      <button 
        onClick={() => setIsOpen(!isOpen)}
        className={`fixed bottom-24 right-4 z-[40] p-4 rounded-full shadow-2xl transition-all duration-300 group ${isOpen ? 'bg-slate-200 dark:bg-slate-800 rotate-90 scale-90' : 'bg-teal-500 hover:bg-teal-600 hover:scale-110'}`}
      >
        {isOpen ? (
            <X className="w-6 h-6 text-slate-500" />
        ) : (
            <>
                <Bot className="w-7 h-7 text-white" />
                <span className="absolute -top-1 -right-1 w-3 h-3 bg-red-500 rounded-full border-2 border-white dark:border-slate-900 animate-pulse"></span>
            </>
        )}
      </button>

      {/* Chat Window */}
      {isOpen && (
        <div className="fixed bottom-40 right-4 w-[90vw] max-w-[350px] h-[500px] max-h-[60vh] bg-white dark:bg-[#1E293B] rounded-3xl shadow-2xl border border-slate-200 dark:border-slate-700 flex flex-col overflow-hidden z-[40] animate-slide-up origin-bottom-right">
          
          {/* Header */}
          <div className="p-4 bg-teal-500 text-white flex items-center gap-3 shadow-md">
            <div className="p-2 bg-white/20 rounded-xl backdrop-blur-sm">
                <LifeBuoy className="w-5 h-5" />
            </div>
            <div>
                <h3 className="font-bold text-sm">Assistant Guide</h3>
                <p className="text-[10px] text-teal-100 opacity-90 flex items-center gap-1">
                    <Sparkles className="w-2 h-2" /> Toujours là pour vous
                </p>
            </div>
          </div>

          {/* Messages Area */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-slate-50 dark:bg-[#0F172A] scrollbar-hide">
            {messages.map((msg) => (
              <div 
                key={msg.id} 
                className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                {msg.role === 'assistant' && (
                    <div className="w-6 h-6 rounded-full bg-teal-100 dark:bg-teal-900/50 flex items-center justify-center mr-2 mt-1 shrink-0">
                        <Bot className="w-3.5 h-3.5 text-teal-600 dark:text-teal-400" />
                    </div>
                )}
                <div 
                  className={`max-w-[85%] p-3 rounded-2xl text-xs leading-relaxed shadow-sm ${
                    msg.role === 'user' 
                      ? 'bg-teal-600 text-white rounded-tr-none' 
                      : 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 border border-slate-100 dark:border-slate-700 rounded-tl-none'
                  }`}
                >
                  <MarkdownRenderer content={msg.text} />
                </div>
              </div>
            ))}
            
            {isTyping && (
              <div className="flex justify-start">
                 <div className="w-6 h-6 mr-2"></div>
                 <div className="bg-white dark:bg-slate-800 px-3 py-2 rounded-2xl rounded-tl-none border border-slate-100 dark:border-slate-700 flex gap-1">
                    <div className="w-1.5 h-1.5 bg-teal-400 rounded-full animate-bounce"></div>
                    <div className="w-1.5 h-1.5 bg-teal-400 rounded-full animate-bounce delay-75"></div>
                    <div className="w-1.5 h-1.5 bg-teal-400 rounded-full animate-bounce delay-150"></div>
                 </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Input Area */}
          <div className="p-3 bg-white dark:bg-[#1E293B] border-t border-slate-100 dark:border-slate-700 flex gap-2">
            <input 
              type="text" 
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSend()}
              placeholder="Une question sur l'appli ?"
              className="flex-1 bg-slate-100 dark:bg-slate-900 rounded-xl px-3 py-2 text-xs text-slate-800 dark:text-white outline-none focus:ring-2 focus:ring-teal-500/50 transition-all"
            />
            <button 
              onClick={handleSend}
              disabled={!input.trim() || isTyping}
              className="p-2 bg-teal-500 hover:bg-teal-600 text-white rounded-xl shadow-sm transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Send className="w-4 h-4" />
            </button>
          </div>

        </div>
      )}
    </>
  );
};

export default TutorialAgent;
