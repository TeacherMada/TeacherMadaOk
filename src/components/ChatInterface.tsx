import React, { useState, useRef, useEffect, useMemo } from 'react';
import { Send, User, Mic, Volume2, ArrowLeft, Loader2, Copy, Check, Phone, Globe, ChevronDown, MicOff, BookOpen, Search, X, Sun, Moon, FileText, Type, Coins, BrainCircuit, Menu, MessageCircle, PhoneOff, VolumeX } from 'lucide-react';
import { UserProfile, ChatMessage, ExerciseItem } from '../types';
import { sendMessageToGeminiStream, generateSpeech, generatePracticalExercises, generateVoiceChatResponse } from '../services/geminiService';
import { storageService } from '../services/storageService';
import MarkdownRenderer from './MarkdownRenderer';
import ExerciseSession from './ExerciseSession';
import DialogueSession from './DialogueSession';
import PaymentModal from './PaymentModal';

interface ChatInterfaceProps {
  user: UserProfile; messages: ChatMessage[]; setMessages: React.Dispatch<React.SetStateAction<ChatMessage[]>>;
  onChangeMode: () => void; onShowProfile: () => void; onUpdateUser: (u: UserProfile) => void;
  isDarkMode: boolean; toggleTheme: () => void; isAnalyzing: boolean; onMessageSent: () => void;
  fontSize: 'small' | 'normal' | 'large' | 'xl'; notify: (m: string, t: any) => void;
}

const ChatInterface: React.FC<ChatInterfaceProps> = ({ 
  user, messages, setMessages, onChangeMode, onShowProfile, onUpdateUser, isDarkMode, toggleTheme, isAnalyzing, onMessageSent, fontSize, notify
}) => {
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [streamingText, setStreamingText] = useState('');
  const [isPlayingAudio, setIsPlayingAudio] = useState(false);
  const [showMenu, setShowMenu] = useState(false);
  const [showSmartOptions, setShowSmartOptions] = useState(false);
  const [isListening, setIsListening] = useState(false);

  const [isCallActive, setIsCallActive] = useState(false);
  const [isTrainingMode, setIsTrainingMode] = useState(false);
  const [isDialogueActive, setIsDialogueActive] = useState(false);
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [exercises, setExercises] = useState<ExerciseItem[]>([]);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const activeSourceRef = useRef<AudioBufferSourceNode | null>(null);

  const initAudio = async () => {
      if (!audioContextRef.current || audioContextRef.current.state === 'closed') {
          audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
      }
      if (audioContextRef.current.state === 'suspended') await audioContextRef.current.resume();
      return audioContextRef.current;
  };

  const handleSpeak = async (text: string) => {
    if (activeSourceRef.current) try { activeSourceRef.current.stop(); } catch(e){}
    setIsPlayingAudio(true);
    try {
        const raw = await generateSpeech(text, user.id, user.preferences?.voiceName);
        if (raw) {
            const ctx = await initAudio();
            const audioBuffer = ctx.createBuffer(1, raw.length, 24000);
            const channelData = audioBuffer.getChannelData(0);
            const int16 = new Int16Array(raw.buffer);
            for (let i = 0; i < int16.length; i++) channelData[i] = int16[i] / 32768.0;
            const source = ctx.createBufferSource();
            source.buffer = audioBuffer;
            source.connect(ctx.destination);
            activeSourceRef.current = source;
            source.onended = () => setIsPlayingAudio(false);
            source.start(0);
        } else setIsPlayingAudio(false);
    } catch (e) { setIsPlayingAudio(false); }
  };

  const handleSend = async (override?: string) => {
    await initAudio();
    const txt = override || input;
    if (!txt.trim() || isLoading) return;
    if (!storageService.canPerformRequest(user.id).allowed) { setShowPaymentModal(true); return; }

    const userMsg: ChatMessage = { id: Date.now().toString(), role: 'user', text: txt, timestamp: Date.now() };
    const history = [...messages, userMsg];
    setMessages(history);
    setInput('');
    setIsLoading(true);
    setStreamingText('');

    try {
      const final = isCallActive 
        ? await generateVoiceChatResponse(txt, user.id, history)
        : await sendMessageToGeminiStream(txt, user.id, history, (t) => setStreamingText(t));
      
      const aiMsg: ChatMessage = { id: (Date.now() + 1).toString(), role: 'model', text: final, timestamp: Date.now() };
      setMessages([...history, aiMsg]);
      setStreamingText('');
      storageService.saveChatHistory(user.id, [...history, aiMsg], user.preferences!.targetLanguage);
      handleSpeak(final);
      onUpdateUser(storageService.getUserById(user.id)!);
    } catch (e) { notify("Erreur réseau.", 'error'); } 
    finally { setIsLoading(false); }
  };

  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages, streamingText]);

  return (
    <div className="flex flex-col h-screen bg-slate-50 dark:bg-slate-950 font-sans overflow-hidden">
      {showPaymentModal && <PaymentModal user={user} onClose={() => setShowPaymentModal(false)} />}
      {isDialogueActive && <DialogueSession user={user} onClose={() => setIsDialogueActive(false)} onUpdateUser={onUpdateUser} notify={notify} />}
      {isTrainingMode && (
          <div className="fixed inset-0 z-[200] bg-white dark:bg-slate-950 flex flex-col">
              {exercises.length > 0 ? <ExerciseSession exercises={exercises} onClose={() => setIsTrainingMode(false)} onComplete={() => setIsTrainingMode(false)} /> : <div className="flex-1 flex flex-col items-center justify-center"><Loader2 className="animate-spin text-indigo-500 mb-4"/>Génération...</div>}
          </div>
      )}

      {isCallActive && (
          <div className="fixed inset-0 z-[160] bg-slate-900/95 backdrop-blur-2xl flex flex-col items-center justify-between py-20 px-6 animate-fade-in">
              <div className="text-center"><h2 className="text-3xl font-black text-white">TeacherMada</h2><p className="text-slate-300">{user.preferences?.targetLanguage}</p></div>
              <div className={`w-40 h-40 rounded-full bg-gradient-to-br from-indigo-600 to-violet-700 p-1 shadow-2xl transition-transform duration-500 ${isPlayingAudio ? 'scale-110' : 'scale-100'}`}><div className="w-full h-full bg-slate-900 rounded-full flex items-center justify-center overflow-hidden"><img src="https://i.ibb.co/B2XmRwmJ/logo.png" className="w-24 h-24 object-contain" alt="Logo" /></div></div>
              <div className="w-full max-w-xs grid grid-cols-3 gap-6">
                  <button onClick={() => setIsPlayingAudio(false)} className="p-4 rounded-full bg-slate-800 text-white"><VolumeX/></button>
                  <button onClick={() => setIsCallActive(false)} className="p-6 bg-red-500 text-white rounded-full shadow-xl"><PhoneOff/></button>
                  <button onClick={() => notify("Micro actif", "info")} className="p-4 rounded-full bg-slate-800 text-white"><Mic/></button>
              </div>
          </div>
      )}

      <header className="fixed top-0 left-0 right-0 z-40 bg-white/90 dark:bg-slate-900/95 backdrop-blur-md shadow-sm h-14 px-4 flex items-center justify-between border-b border-slate-100 dark:border-slate-800">
        <div className="flex items-center gap-2">
          <button onClick={onChangeMode} className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-full transition-all"><ArrowLeft className="w-5 h-5 text-slate-500" /></button>
          <button onClick={() => setShowSmartOptions(!showSmartOptions)} className="flex items-center gap-2 px-3 py-1.5 bg-indigo-50 dark:bg-indigo-900/20 text-indigo-800 dark:text-indigo-300 rounded-full border border-indigo-100">
             <Globe className="w-3.5 h-3.5" /> <span className="text-[10px] font-black uppercase">{user.preferences?.targetLanguage.split(' ')[0]}</span> <ChevronDown className="w-3 h-3" />
          </button>
          {showSmartOptions && (
              <div className="absolute top-14 left-10 w-64 bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border p-2 animate-fade-in z-50">
                  <button onClick={() => { setShowSmartOptions(false); setIsTrainingMode(true); generatePracticalExercises(user, messages).then(setExercises); }} className="w-full text-left p-3 hover:bg-slate-50 dark:hover:bg-slate-800 rounded-xl flex items-center gap-3 text-sm font-bold"><BrainCircuit className="w-4 h-4 text-orange-500"/>Exercice Pratique</button>
                  <button onClick={() => { setShowSmartOptions(false); setIsCallActive(true); }} className="w-full text-left p-3 hover:bg-slate-50 dark:hover:bg-slate-800 rounded-xl flex items-center gap-3 text-sm font-bold"><Phone className="w-4 h-4 text-purple-500"/>Appel Vocal</button>
                  <button onClick={() => { setShowSmartOptions(false); setIsDialogueActive(true); }} className="w-full text-left p-3 hover:bg-slate-50 dark:hover:bg-slate-800 rounded-xl flex items-center gap-3 text-sm font-bold"><MessageCircle className="w-4 h-4 text-emerald-500"/>Dialogues</button>
              </div>
          )}
        </div>
        <div className="flex items-center gap-2">
             <button onClick={() => setShowPaymentModal(true)} className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-indigo-50 dark:bg-indigo-900/20 border"><Coins className="w-3.5 h-3.5 text-amber-500" /> <span className="text-xs font-bold">{user.role === 'admin' ? '∞' : user.credits}</span></button>
             <button onClick={() => setShowMenu(!showMenu)} className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-full transition-colors"><Menu className="w-5 h-5 text-slate-500" /></button>
             {showMenu && (
                 <div className="absolute top-14 right-4 w-72 bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border p-3 animate-fade-in z-50">
                    <div className="grid grid-cols-2 gap-2 border-t pt-3">
                        <button onClick={toggleTheme} className="flex flex-col items-center p-3 hover:bg-slate-50 dark:hover:bg-slate-800 rounded-xl">
                            {isDarkMode ? <Sun className="text-amber-500 mb-1"/> : <Moon className="text-indigo-500 mb-1"/>}
                            <span className="text-[10px] font-black uppercase">Thème</span>
                        </button>
                        <button onClick={onShowProfile} className="flex flex-col items-center p-3 hover:bg-slate-50 dark:hover:bg-slate-800 rounded-xl"><User className="text-indigo-600 mb-1"/><span className="text-[10px] font-black uppercase">Profil</span></button>
                    </div>
                 </div>
             )}
        </div>
      </header>
      
      <div id="chat-feed" className="flex-1 overflow-y-auto p-3 md:p-6 space-y-5 pt-16 pb-4 scrollbar-hide">
        {messages.map((msg) => (
            <div key={msg.id} className={`flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'} animate-fade-in`}>
                <div className={`flex max-w-[92%] md:max-w-[80%] ${msg.role === 'user' ? 'flex-row-reverse' : 'flex-row'}`}>
                    <div className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center mt-1 mx-1.5 ${msg.role === 'user' ? 'bg-indigo-100' : 'bg-white border p-1 shadow-sm'}`}>{msg.role === 'user' ? <User className="w-4 h-4 text-indigo-600" /> : <img src="https://i.ibb.co/B2XmRwmJ/logo.png" className="w-full h-full object-contain" alt="Teacher" />}</div>
                    <div id={`msg-content-${msg.id}`} className={`px-4 py-3 rounded-[1.3rem] shadow-sm ${fontSize} ${msg.role === 'user' ? 'bg-indigo-600 text-white rounded-tr-none' : 'bg-white dark:bg-slate-800 dark:text-slate-200 text-slate-800 rounded-tl-none border'}`}>
                         {msg.role === 'user' ? <p className="whitespace-pre-wrap">{msg.text}</p> : (
                            <>
                                <MarkdownRenderer content={msg.text} onPlayAudio={(t) => handleSpeak(t)} />
                                <div className="flex items-center gap-2 mt-2 pt-2 border-t" data-html2canvas-ignore>
                                    <button onClick={() => handleSpeak(msg.text)} className="p-1.5 hover:bg-slate-50 dark:hover:bg-slate-700 rounded-full text-slate-400"><Volume2 className="w-4 h-4"/></button>
                                </div>
                            </>
                         )}
                    </div>
                </div>
            </div>
        ))}
        {streamingText && (
             <div className="flex justify-start animate-fade-in">
                 <div className="flex-shrink-0 w-8 h-8 rounded-full bg-white border flex items-center justify-center mt-1 mx-1.5 p-1"><img src="https://i.ibb.co/B2XmRwmJ/logo.png" className="w-full h-full object-contain" alt="Teacher" /></div>
                 <div className="bg-white dark:bg-slate-800 px-4 py-3 rounded-[1.3rem] rounded-tl-none border shadow-sm"><MarkdownRenderer content={streamingText} /></div>
             </div>
        )}
        {isLoading && !streamingText && (
             <div className="flex justify-start animate-fade-in"><div className="bg-white dark:bg-slate-800 px-4 py-3 rounded-2xl border shadow-sm"><Loader2 className="w-4 h-4 animate-spin text-indigo-500"/></div></div>
        )}
        <div ref={messagesEndRef} />
      </div>

      <div id="input-area" className="bg-white/80 dark:bg-slate-900/80 backdrop-blur-md border-t p-3 sticky bottom-0">
        <div className="max-w-4xl mx-auto flex items-end gap-2 bg-slate-50 dark:bg-slate-800 rounded-3xl border p-1.5 shadow-sm">
            <textarea value={input} onChange={(e) => setInput(e.target.value)} placeholder="Écrire..." disabled={isLoading} rows={1} className="w-full bg-transparent text-slate-800 dark:text-white rounded-xl pl-4 py-3 text-base focus:outline-none resize-none max-h-32 scrollbar-hide self-center" onKeyDown={(e) => { if(e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); } }} />
            <div className="flex items-center gap-1 pb-1 pr-1">
                 <button onClick={() => handleSend()} disabled={!input.trim() || isLoading} className="p-3 rounded-full bg-indigo-600 text-white shadow-lg disabled:opacity-50 transform active:scale-95 transition-all"><Send className="w-4.5 h-4.5" /></button>
            </div>
        </div>
      </div>
    </div>
  );
};

export default ChatInterface;