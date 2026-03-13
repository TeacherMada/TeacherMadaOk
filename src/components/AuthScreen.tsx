
import React, { useState } from 'react';
import { UserProfile } from '../types';
import { storageService } from '../services/storageService';
import { ArrowRight, Sun, Moon, Mail, Lock, User, ArrowLeft, AlertTriangle, Sparkles, KeyRound, Phone, X, Send } from 'lucide-react';
import LegalModal from './LegalModals';

interface AuthScreenProps {
  onAuthSuccess: (user: UserProfile) => void;
  onBack: () => void;
  isDarkMode: boolean;
  toggleTheme: () => void;
  notify: (message: string, type: 'success' | 'error' | 'info') => void;
}

const AuthScreen: React.FC<AuthScreenProps> = ({ onAuthSuccess, onBack, isDarkMode, toggleTheme, notify }) => {
  const [isRegistering, setIsRegistering] = useState(false);
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  
  const [showForgotModal, setShowForgotModal] = useState(false);
  const [forgotMethod, setForgotMethod] = useState<'email' | 'whatsapp' | null>(null);
  const [activeLegal, setActiveLegal] = useState<'privacy' | 'terms' | null>(null);
  const [forgotIdentifier, setForgotIdentifier] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    if (!username.trim() || !password.trim()) {
        setErrorMessage("Veuillez remplir les champs obligatoires.");
        return;
    }

    setIsLoading(true);
    
    try {
        let result;
        if (isRegistering) {
            result = await storageService.register(username, password, email, phoneNumber);
        } else {
            result = await storageService.login(username, password);
        }

        if (result.success && result.user) {
            onAuthSuccess(result.user);
        } else {
            setErrorMessage(result.error || "Une erreur est survenue.");
            notify(result.error || "Erreur de connexion.", 'error');
        }
    } catch (error) {
        console.error(error);
        setErrorMessage("Erreur critique de connexion.");
    } finally {
        setIsLoading(false);
    }
  };

  const handleForgotPassword = async (e: React.FormEvent) => {
      e.preventDefault();
      if (!forgotIdentifier.trim()) {
          notify("Veuillez entrer votre identifiant ou email.", "error");
          return;
      }
      setIsLoading(true);
      const result = await storageService.resetPassword(forgotIdentifier);
      setIsLoading(false);
      
      if (result.success) {
          notify(result.message, "success");
          setShowForgotModal(false);
      } else {
          notify(result.message, "error");
      }
  };

  return (
    <div className="min-h-screen bg-white dark:bg-slate-950 flex font-sans transition-colors duration-300">
       <LegalModal type={activeLegal} onClose={() => setActiveLegal(null)} />

       {/* Left Side - Image/Branding (Hidden on Mobile) */}
       <div className="hidden lg:flex lg:w-1/2 relative overflow-hidden bg-indigo-900">
           <img 
              src="https://images.unsplash.com/photo-1522202176988-66273c2fd55f?q=80&w=2071&auto=format&fit=crop" 
              alt="Students learning" 
              className="absolute inset-0 w-full h-full object-cover opacity-40 mix-blend-overlay"
           />
           <div className="absolute inset-0 bg-gradient-to-t from-indigo-950 via-indigo-900/80 to-transparent"></div>
           
           <div className="relative z-10 flex flex-col justify-end p-16 h-full text-white">
               <div className="w-16 h-16 bg-white/10 backdrop-blur-md rounded-2xl flex items-center justify-center mb-8 border border-white/20">
                   <img src="https://i.ibb.co/B2XmRwmJ/logo.png" alt="Logo" className="w-10 h-10" />
               </div>
               <h1 className="text-5xl font-black mb-6 leading-tight tracking-tight">
                   Maîtrisez une langue,<br/>
                   <span className="text-indigo-300">ouvrez le monde.</span>
               </h1>
               <p className="text-indigo-100/80 text-lg max-w-md leading-relaxed">
                   Rejoignez TeacherMada et apprenez avec une intelligence artificielle conçue pour s'adapter à votre rythme.
               </p>
           </div>
       </div>

       {/* Right Side - Form */}
       <div className="w-full lg:w-1/2 flex flex-col relative">
           {/* Header Controls */}
           <div className="absolute top-0 left-0 w-full p-6 flex justify-between items-center z-10">
               <button onClick={onBack} className="p-3 bg-slate-100 dark:bg-slate-900 rounded-full text-slate-500 hover:text-indigo-600 dark:hover:text-indigo-400 transition-all hover:scale-105">
                   <ArrowLeft className="w-5 h-5" />
               </button>
               <button onClick={toggleTheme} className="p-3 rounded-full bg-slate-100 dark:bg-slate-900 text-slate-500 dark:text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 transition-all">
                   {isDarkMode ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
               </button>
           </div>

           <div className="flex-1 flex items-center justify-center p-6 sm:p-12">
               <div className="w-full max-w-md animate-fade-in">
                   
                   <div className="mb-10 text-center lg:text-left">
                       <h2 className="text-3xl font-black text-slate-900 dark:text-white tracking-tight mb-2">
                           {isRegistering ? "Créer un compte" : "Bon retour !"}
                       </h2>
                       <p className="text-slate-500 dark:text-slate-400">
                           {isRegistering ? "Commencez votre apprentissage dès aujourd'hui." : "Connectez-vous pour reprendre vos leçons."}
                       </p>
                   </div>

                   {/* Toggle Login/Register */}
                   <div className="flex bg-slate-100 dark:bg-slate-800/80 p-1.5 rounded-2xl mb-8">
                       <button onClick={() => { setIsRegistering(false); setErrorMessage(null); }} className={`flex-1 py-3 text-xs font-bold uppercase tracking-wider rounded-xl transition-all ${!isRegistering ? 'bg-white dark:bg-slate-700 text-indigo-600 dark:text-white shadow-sm ring-1 ring-black/5 dark:ring-white/10' : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'}`}>Connexion</button>
                       <button onClick={() => { setIsRegistering(true); setErrorMessage(null); }} className={`flex-1 py-3 text-xs font-bold uppercase tracking-wider rounded-xl transition-all ${isRegistering ? 'bg-white dark:bg-slate-700 text-indigo-600 dark:text-white shadow-sm ring-1 ring-black/5 dark:ring-white/10' : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'}`}>Inscription</button>
                   </div>

                   <form onSubmit={handleSubmit} className="space-y-5">
                       {errorMessage && (
                           <div className="bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-300 text-xs font-bold p-4 rounded-2xl flex items-center gap-3 animate-fade-in border border-red-100 dark:border-red-900/30">
                               <AlertTriangle className="w-5 h-5 shrink-0" />
                               {errorMessage}
                           </div>
                       )}

                       <div>
                           <label className="block text-[10px] font-bold text-slate-400 dark:text-slate-500 mb-2 ml-1 tracking-widest uppercase">
                               {isRegistering ? "NOM D'UTILISATEUR" : "EMAIL / TÉL / NOM"}
                           </label>
                           <div className="relative group">
                               <div className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400 group-focus-within:text-indigo-500 transition-colors"><User className="w-full h-full" /></div>
                               <input type="text" required value={username} onChange={(e) => setUsername(e.target.value)} placeholder="Votre identifiant" className="w-full bg-slate-50 dark:bg-slate-900 text-slate-800 dark:text-white rounded-2xl pl-12 pr-4 py-4 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 dark:focus:border-indigo-400 transition-all border border-slate-200 dark:border-slate-800 font-medium placeholder:text-slate-400 text-sm" />
                           </div>
                       </div>

                       {isRegistering && (
                           <div className="animate-fade-in">
                               <label className="block text-[10px] font-bold text-slate-400 dark:text-slate-500 mb-2 ml-1 tracking-widest uppercase">
                                   EMAIL <span className="text-slate-300 dark:text-slate-600">(RECOMMANDÉ)</span>
                               </label>
                               <div className="relative group">
                                   <div className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400 group-focus-within:text-indigo-500 transition-colors"><Mail className="w-full h-full" /></div>
                                   <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Pour récupérer le compte" className="w-full bg-slate-50 dark:bg-slate-900 text-slate-800 dark:text-white rounded-2xl pl-12 pr-4 py-4 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 dark:focus:border-indigo-400 transition-all border border-slate-200 dark:border-slate-800 font-medium placeholder:text-slate-400 text-sm" />
                               </div>
                           </div>
                       )}

                       <div>
                           <div className="flex justify-between items-center mb-2 ml-1">
                               <label className="block text-[10px] font-bold text-slate-400 dark:text-slate-500 tracking-widest uppercase">MOT DE PASSE</label>
                               {!isRegistering && (
                                   <button type="button" onClick={() => setShowForgotModal(true)} className="text-[10px] font-bold text-indigo-500 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors">
                                       Oublié ?
                                   </button>
                               )}
                           </div>
                           <div className="relative group">
                               <div className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400 group-focus-within:text-indigo-500 transition-colors"><Lock className="w-full h-full" /></div>
                               <input type="password" required value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" className="w-full bg-slate-50 dark:bg-slate-900 text-slate-800 dark:text-white rounded-2xl pl-12 pr-4 py-4 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 dark:focus:border-indigo-400 transition-all border border-slate-200 dark:border-slate-800 font-medium placeholder:text-slate-400 text-sm" />
                           </div>
                       </div>

                       <button type="submit" disabled={isLoading} className="w-full mt-8 bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-4 rounded-2xl shadow-lg hover:shadow-indigo-500/30 transition-all flex items-center justify-center gap-2 disabled:opacity-70 disabled:cursor-not-allowed group transform active:scale-[0.98]">
                           {isLoading ? "Connexion..." : (isRegistering ? "Créer mon compte" : "Se connecter")}
                           {!isLoading && <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />}
                       </button>
                   </form>

                   <div className="mt-10 text-center">
                       <p className="text-[11px] text-slate-400 dark:text-slate-500">
                           En continuant, vous acceptez nos 
                           <button onClick={() => setActiveLegal('terms')} className="text-indigo-500 hover:underline mx-1 font-bold">Conditions d'utilisation</button>.
                       </p>
                   </div>
               </div>
           </div>
       </div>

       {/* Smart Forgot Password Modal */}
       {showForgotModal && (
           <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fade-in">
               <div className="bg-white dark:bg-slate-900 rounded-[2rem] shadow-2xl w-full max-w-md p-8 relative border border-slate-100 dark:border-slate-800 animate-slide-up">
                   <button onClick={() => { setShowForgotModal(false); setForgotMethod(null); }} className="absolute top-4 right-4 p-2 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-full transition-colors"><X className="w-5 h-5"/></button>
                   
                   <div className="w-16 h-16 bg-indigo-50 dark:bg-indigo-500/10 rounded-2xl flex items-center justify-center mb-6 text-indigo-600 dark:text-indigo-400">
                       <KeyRound className="w-8 h-8" />
                   </div>
                   
                   <h3 className="text-2xl font-black text-slate-900 dark:text-white mb-2 tracking-tight">Mot de passe oublié ?</h3>
                   
                   {!forgotMethod ? (
                       <>
                           <p className="text-slate-500 dark:text-slate-400 text-sm mb-6">Comment souhaitez-vous récupérer votre compte ?</p>
                           <div className="space-y-3">
                               <button onClick={() => setForgotMethod('email')} className="w-full p-4 border border-slate-200 dark:border-slate-700 rounded-2xl flex items-center gap-4 hover:border-indigo-500 hover:bg-indigo-50 dark:hover:bg-indigo-500/10 transition-all text-left group">
                                   <div className="w-10 h-10 bg-indigo-100 dark:bg-indigo-500/20 rounded-full flex items-center justify-center text-indigo-600 dark:text-indigo-400 group-hover:scale-110 transition-transform"><Mail className="w-5 h-5"/></div>
                                   <div>
                                       <div className="font-bold text-slate-800 dark:text-white">J'ai une adresse email</div>
                                       <div className="text-xs text-slate-500">Récupération automatique par lien</div>
                                   </div>
                               </button>
                               <button onClick={() => setForgotMethod('whatsapp')} className="w-full p-4 border border-slate-200 dark:border-slate-700 rounded-2xl flex items-center gap-4 hover:border-emerald-500 hover:bg-emerald-50 dark:hover:bg-emerald-500/10 transition-all text-left group">
                                   <div className="w-10 h-10 bg-emerald-100 dark:bg-emerald-500/20 rounded-full flex items-center justify-center text-emerald-600 dark:text-emerald-400 group-hover:scale-110 transition-transform"><Phone className="w-5 h-5"/></div>
                                   <div>
                                       <div className="font-bold text-slate-800 dark:text-white">Je n'ai pas d'email</div>
                                       <div className="text-xs text-slate-500">Assistance via WhatsApp</div>
                                   </div>
                               </button>
                           </div>
                       </>
                   ) : forgotMethod === 'email' ? (
                       <form onSubmit={handleForgotPassword} className="space-y-6 animate-fade-in">
                           <p className="text-slate-500 dark:text-slate-400 text-sm mb-4">Entrez l'adresse email liée à votre compte pour recevoir un lien de réinitialisation.</p>
                           <div>
                               <div className="relative group">
                                   <div className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400 group-focus-within:text-indigo-500 transition-colors"><Mail className="w-full h-full" /></div>
                                   <input type="email" required value={forgotIdentifier} onChange={(e) => setForgotIdentifier(e.target.value)} placeholder="votre@email.com" className="w-full bg-slate-50 dark:bg-slate-800/50 text-slate-800 dark:text-white rounded-2xl pl-12 pr-4 py-4 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 dark:focus:border-indigo-400 transition-all border border-slate-200 dark:border-slate-700 font-medium" />
                               </div>
                           </div>
                           <button type="submit" disabled={isLoading} className="w-full py-4 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-2xl shadow-lg hover:shadow-indigo-500/30 transition-all disabled:opacity-70 flex items-center justify-center gap-2">
                               {isLoading ? "Envoi..." : "Envoyer le lien"}
                               {!isLoading && <Send className="w-4 h-4" />}
                           </button>
                           <button type="button" onClick={() => setForgotMethod(null)} className="w-full py-2 text-sm text-slate-500 hover:text-slate-800 dark:hover:text-white font-medium">Retour</button>
                       </form>
                   ) : (
                       <div className="space-y-6 animate-fade-in">
                           <p className="text-slate-500 dark:text-slate-400 text-sm mb-4">Comme vous n'avez pas d'email, notre équipe doit vérifier votre identité manuellement.</p>
                           <div>
                               <label className="block text-[10px] font-bold text-slate-400 dark:text-slate-500 mb-2 ml-1 tracking-widest uppercase">VOTRE NOM D'UTILISATEUR</label>
                               <div className="relative group">
                                   <div className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400 group-focus-within:text-emerald-500 transition-colors"><User className="w-full h-full" /></div>
                                   <input type="text" value={forgotIdentifier} onChange={(e) => setForgotIdentifier(e.target.value)} placeholder="ex: jean.dupont" className="w-full bg-slate-50 dark:bg-slate-800/50 text-slate-800 dark:text-white rounded-2xl pl-12 pr-4 py-4 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 dark:focus:border-emerald-400 transition-all border border-slate-200 dark:border-slate-700 font-medium" />
                               </div>
                           </div>
                           <button 
                               onClick={() => {
                                   if(!forgotIdentifier.trim()) { notify("Veuillez entrer votre nom d'utilisateur", "error"); return; }
                                   const msg = encodeURIComponent(`Bonjour TeacherMada, j'ai oublié mon mot de passe. Mon identifiant est : ${forgotIdentifier}. Pouvez-vous m'aider à le réinitialiser ?`);
                                   window.open(`https://wa.me/261349310268?text=${msg}`, '_blank');
                               }}
                               className="w-full py-4 bg-emerald-500 hover:bg-emerald-600 text-white font-bold rounded-2xl shadow-lg hover:shadow-emerald-500/30 transition-all flex items-center justify-center gap-2"
                           >
                               Contacter sur WhatsApp
                               <Phone className="w-4 h-4" />
                           </button>
                           <button type="button" onClick={() => setForgotMethod(null)} className="w-full py-2 text-sm text-slate-500 hover:text-slate-800 dark:hover:text-white font-medium">Retour</button>
                       </div>
                   )}
               </div>
           </div>
       )}
    </div>
  );
};

export default AuthScreen;
