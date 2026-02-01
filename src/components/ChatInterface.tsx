import React, { useState, useRef, useEffect, useMemo } from 'react';
import { Send, User, Mic, Volume2, ArrowLeft, Loader2, Phone, Globe, ChevronDown, MicOff, Sun, Moon, Coins, Menu, Type, PhoneOff, VolumeX } from 'lucide-react';
import { UserProfile, ChatMessage, VoiceName } from '../types';
import { sendMessageToGemini, generateSpeech, generateVoiceChatResponse } from '../services/geminiService';
import { storageService } from '../services/storageService';
import MarkdownRenderer from './MarkdownRenderer';
import DialogueSession from './DialogueSession';
import PaymentModal from './PaymentModal';

interface ChatInterfaceProps {
  user: UserProfile;
  messages: ChatMessage[];
  setMessages: React.Dispatch<React.SetStateAction<ChatMessage[]>>;
  onChangeMode: () => void;
  onChangeLanguage: () => void;
  onLogout: () => void;
  onUpdateUser: (user: UserProfile) => void;
  onShowProfile: () => void;
  isDarkMode: boolean;
  toggleTheme: () => void;
  isAnalyzing: boolean;
  onMessageSent: () => void;
  fontSize: 'small' | 'normal' | 'large' | 'xl';
  notify: (message: string, type: 'success' | 'error' | 'info') => void;
}

const ChatInterface: React.FC<ChatInterfaceProps> = ({ 
  user, messages, setMessages, onChangeMode, onShowProfile, onUpdateUser, isDarkMode, toggleTheme, isAnalyzing, onMessageSent, fontSize, notify
}) => {
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isPlayingAudio, setIsPlayingAudio] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [isCallActive, setIsCallActive] = useState(false);
  const [isCallConnecting, setIsCallConnecting] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [callSeconds, setCallSeconds] = useState(0);
  const [isDialogueActive, setIsDialogueActive] = useState(false);
  const [showPaymentModal, setShowPaymentModal] = useState(false);

  const chatContainerRef = useRef<HTMLDivElement>(null); 
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const activeSourceRef = useRef<AudioBufferSourceNode | null>(null);
  const recognitionRef = useRef<any>(null);

  const preferences = user.preferences!;

  const textSizeClass = useMemo(() => {
      switch (fontSize) {
          case 'small': return 'text-sm';
          case 'large': return 'text-lg';
          case 'xl': return 'text-xl leading-relaxed';
          default: return 'text-base';
      }
  }, [fontSize]);

  const getAudioContext = async () => {
      if (!audioContextRef.current || audioContextRef.current.state === 'closed') {
          audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
      }
      if (audioContextRef.current.state === 'suspended') {
          await audioContextRef.current.resume();
      }
      return audioContextRef.current;
  };

  const decodePCM = (data: Uint8Array, ctx: AudioContext): AudioBuffer => {
      const dataInt16 = new Int16Array(data.buffer, data.byteOffset, data.byteLength / 2);
      const audioBuffer = ctx.createBuffer(1, dataInt16.length, 24000);
      const channelData = audioBuffer.getChannelData(0);
      for (let i = 0; i < dataInt16.length; i++) {
          channelData[i] = dataInt16[i] / 32768.0; 
      }
      return audioBuffer;
  };

  const handleSpeak = async (text: string) => {
    stopAudio();
    setIsPlayingAudio(true);
    try {
        const rawPCM = await generateSpeech(text, user.id, user.preferences?.voiceName);
        if (rawPCM) {
            const ctx = await getAudioContext();
            const audioBuffer = decodePCM(rawPCM, ctx);
            const source = ctx.createBufferSource();
            source.buffer = audioBuffer;
            source.connect(ctx.destination);
            activeSourceRef.current = source;
            source.onended = () => { setIsPlayingAudio(false); };
            source.start(0);
        } else { setIsPlayingAudio(false); }
    } catch (e) { setIsPlayingAudio(false); }
  };

  const stopAudio = () => { 
      if (activeSourceRef.current) { 
          try { activeSourceRef.current.stop(); } catch(e){} 
          activeSourceRef.current = null; 
      } 
      setIsPlayingAudio(false); 
  };

  const handleSend = async (textOverride?: string) => {
    // CRITIQUE : Activer l'AudioContext dès le clic utilisateur pour autoriser l'Auto-play plus tard
    await getAudioContext();
    
    const textToSend = textOverride || input;
    if (!textToSend.trim() || isLoading) return;

    const userMsg: ChatMessage = { id: Date.now().toString(), role: 'user', text: textToSend, timestamp: Date.now() };
    const updatedHistory = [...messages, userMsg];
    setMessages(updatedHistory);
    
    setInput('');
    setIsLoading(true);
    onMessageSent();

    try {
      let reply = "";
      if (isCallActive) {
          reply = await generateVoiceChatResponse(textToSend, user.id, updatedHistory);
      } else {
          reply = await sendMessageToGemini(textToSend, user.id, updatedHistory);
      }
      
      const safeReply = reply.replace(/```[\s\S]*?```/g, '').trim();
      const aiMsg: ChatMessage = { id: (Date.now() + 1).toString(), role: 'model', text: safeReply, timestamp: Date.now() };
      const finalHistory = [...updatedHistory, aiMsg];
      setMessages(finalHistory);
      storageService.saveChatHistory(user.id, finalHistory, preferences.targetLanguage);
      
      // AUTO-PLAY : On lance la voix immédiatement
      handleSpeak(safeReply);

      const updated = storageService.getUserById(user.id);
      if(updated) onUpdateUser(updated);
    } catch (error: any) {
      notify(error.message || "Erreur.", 'error');
    } finally { 
      setIsLoading(false); 
    }
  };

  const scrollToBottom = () => { messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }); };
  useEffect(() => { scrollToBottom(); }, [messages, isLoading]);

  return (
    <div className="flex flex-col h-screen bg-slate-50 dark:bg-slate-950 transition-colors duration-300 font-sans overflow-hidden">
      {showPaymentModal && <PaymentModal user={user} onClose={() => setShowPaymentModal(false)} />}
      {isDialogueActive && <DialogueSession user={user} onClose={() => setIsDialogueActive(false)} onUpdateUser={onUpdateUser} notify={notify} />}

      {/* Header */}
      <header className="fixed top-0 left-0 right-0 z-40 bg-white/90 dark:bg-slate-900/95 backdrop-blur-md shadow-sm h-14 px-4 flex items-center justify-between border-b border-slate-100 dark:border-slate-800">
        <div className="flex items-center gap-2">
          <button onClick={onChangeMode} className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-full transition-all">
             <ArrowLeft className="w-5 h-5 text-slate-500" />
          </button>
          <div className="flex items-center gap-2 px-3 py-1 bg-indigo-50 dark:bg-indigo-900/20 text-indigo-800 dark:text-indigo-300 rounded-full border border-indigo-100 dark:border-indigo-900/50">
             <Globe className="w-3.5 h-3.5" />
             <span className="text-[10px] font-black uppercase tracking-wider">{preferences.targetLanguage.split(' ')[0]}</span>
          </div>
        </div>
        
        <div className="flex items-center gap-2">
             <button onClick={() => setShowPaymentModal(true)} className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-indigo-50 dark:bg-indigo-900/20 border border-indigo-100 dark:border-indigo-900/50">
                  <Coins className="w-3.5 h-3.5 text-amber-500" />
                  <span className="text-xs font-bold text-indigo-900 dark:text-indigo-100">{user.role === 'admin' ? '∞' : user.credits}</span>
             </button>
             <button onClick={onShowProfile} className="w-8 h-8 rounded-full bg-indigo-600 text-white font-black flex items-center justify-center border-2 border-white dark:border-slate-800 shadow-sm overflow-hidden">
                {user.username.substring(0, 1).toUpperCase()}
             </button>
        </div>
      </header>
      
      {/* Messages */}
      <div id="chat-feed" ref={chatContainerRef} className="flex-1 overflow-y-auto p-3 md:p-6 space-y-5 pt-16 pb-4 scrollbar-hide">
        {messages.map((msg) => (
            <div key={msg.id} className={`flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'} animate-fade-in`}>
                <div className={`flex max-w-[92%] md:max-w-[80%] ${msg.role === 'user' ? 'flex-row-reverse' : 'flex-row'}`}>
                    <div className={`flex-shrink-0 w-7 h-7 rounded-full flex items-center justify-center mt-1 mx-1.5 ${msg.role === 'user' ? 'bg-indigo-100' : 'bg-white border p-1 shadow-sm'}`}>
                        {msg.role === 'user' ? <User className="w-3.5 h-3.5 text-indigo-600" /> : <img src="https://i.ibb.co/B2XmRwmJ/logo.png" className="w-full h-full object-contain" alt="Teacher" />}
                    </div>
                    <div className={`px-4 py-3 rounded-[1.3rem] shadow-sm ${textSizeClass} transition-all duration-300 ${msg.role === 'user' ? 'bg-indigo-600 text-white rounded-tr-none' : 'bg-white dark:bg-slate-800 dark:text-slate-200 text-slate-800 rounded-tl-none border border-slate-50 dark:border-slate-700'}`}>
                         {msg.role === 'user' ? <p className="whitespace-pre-wrap">{msg.text}</p> : (
                            <>
                                <MarkdownRenderer content={msg.text} onPlayAudio={(t) => handleSpeak(t)} />
                                <div className="flex items-center gap-2 mt-2 pt-2 border-t border-slate-50 dark:border-slate-700/50">
                                    <button onClick={() => handleSpeak(msg.text)} className={`p-1.5 hover:bg-slate-50 dark:hover:bg-slate-700 rounded-full transition-colors ${isPlayingAudio ? 'text-indigo-600' : 'text-slate-400'}`}><Volume2 className="w-4 h-4"/></button>
                                </div>
                            </>
                         )}
                    </div>
                </div>
            </div>
        ))}
        {isLoading && (
             <div className="flex justify-start animate-fade-in">
                 <div className="flex-shrink-0 w-7 h-7 rounded-full bg-white border flex items-center justify-center mt-1 mx-1.5 p-1"><img src="https://i.ibb.co/B2XmRwmJ/logo.png" className="w-full h-full object-contain" alt="Teacher" /></div>
                 <div className="bg-white dark:bg-slate-800 px-4 py-3 rounded-2xl rounded-tl-none border border-slate-50 shadow-sm"><Loader2 className="w-4 h-4 animate-spin text-indigo-500"/></div>
             </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input Area */}
      <div id="input-area" className="bg-white/80 dark:bg-slate-900/80 backdrop-blur-md border-t border-slate-100 dark:border-slate-800 p-3 sticky bottom-0">
        <div className="max-w-4xl mx-auto flex items-end gap-2 bg-slate-50 dark:bg-slate-800 rounded-3xl border border-slate-200 dark:border-slate-700 p-1.5 shadow-sm">
            <textarea
                ref={textareaRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Écrire..."
                disabled={isLoading}
                rows={1}
                className="w-full bg-transparent text-slate-800 dark:text-white rounded-xl pl-4 py-3 text-base focus:outline-none resize-none max-h-32 scrollbar-hide self-center"
                onKeyDown={(e) => { if(e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
            />
            <div className="flex items-center gap-1 pb-1 pr-1">
                 <button onClick={() => handleSend()} disabled={!input.trim() || isLoading} className="p-3 rounded-full bg-indigo-600 text-white shadow-lg hover:bg-indigo-700 disabled:opacity-50 transform active:scale-95 transition-all"><Send className="w-4.5 h-4.5" /></button>
            </div>
        </div>
      </div>
    </div>
  );
};

export default ChatInterface;