
import React, { useState } from 'react';
import { UserProfile } from '../types';
import { storageService } from '../services/storageService';
import { GraduationCap, ArrowRight, Sun, Moon, Mail, Lock, User, ArrowLeft, HelpCircle, Phone, X, Send } from 'lucide-react';

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
  
  // Forgot Password Modal State
  const [showForgotModal, setShowForgotModal] = useState(false);
  // State object for the 3 separate inputs
  const [forgotData, setForgotData] = useState({
      username: '',
      phone: '',
      email: ''
  });
  const [forgotLoading, setForgotLoading] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (!username.trim() && isRegistering) {
        notify("Le nom d'utilisateur est requis.", 'error');
        return;
    }
    
    // For login, 'username' state holds the identifier (email/phone/user)
    if (!isRegistering && !username.trim()) {
        notify("Veuillez entrer votre identifiant.", 'error');
        return;
    }

    if (!password.trim()) {
        notify("Mot de passe requis.", 'error');
        return;
    }

    setIsLoading(true);
    
    setTimeout(() => {
        let result;
        if (isRegistering) {
            result = storageService.register(username, password, email, phoneNumber);
        } else {
            result = storageService.login(username, password); // username acts as identifier here
        }

        setIsLoading(false);

        if (result.success && result.user) {
            onAuthSuccess(result.user);
        } else {
            notify(result.error || "Une erreur est survenue.", 'error');
        }
    }, 800);
  };

  const handleForgotPasswordRequest = () => {
      // Validate that at least one field is filled to help identification
      if (!forgotData.username.trim() && !forgotData.phone.trim() && !forgotData.email.trim()) {
          notify("Veuillez remplir au moins un champ pour que l'admin puisse vous retrouver.", 'error');
          return;
      }

      setForgotLoading(true);
      
      // Construct a summary string of the provided info
      const contactSummary = `User: ${forgotData.username || 'N/A'}, Tél: ${forgotData.phone || 'N/A'}, Email: ${forgotData.email || 'N/A'}`;
      
      // Simulate API call
      setTimeout(() => {
          storageService.sendAdminRequest(
              '', // No User ID known yet
              forgotData.username || 'Utilisateur Inconnu',
              'password_reset',
              undefined,
              `Demande réinitialisation MDP.\nDonnées fournies : ${contactSummary}`,
              forgotData.email || forgotData.phone || 'Aucun contact direct' // Primary contact info for admin UI
          );
          setForgotLoading(false);
          setShowForgotModal(false);
          setForgotData({ username: '', phone: '', email: '' });
          notify("Demande envoyée ! L'administrateur vous enverra un nouveau mot de passe par Email.", 'success');
      }, 1000);
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex flex-col items-center justify-center p-4 transition-colors duration-300 relative">
       {/* Top Controls */}
      <div className="absolute top-0 left-0 w-full p-6 flex justify-between items-center z-10">
          <button onClick={onBack} className="p-2 text-slate-500 hover:bg-slate-200 dark:hover:bg-slate-800 rounded-full transition-colors"><ArrowLeft className="w-6 h-6" /></button>
          <button onClick={toggleTheme} className="p-3 rounded-full bg-white dark:bg-slate-900 shadow-md hover:shadow-lg text-slate-500 dark:text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 transition-all cursor-pointer"><Sun className="w-5 h-5" /></button>
      </div>

      <div className="max-w-md w-full bg-white dark:bg-slate-900 rounded-3xl shadow-2xl p-8 transform transition-all duration-500 animate-fade-in relative overflow-hidden">
        
        {/* Logo Area */}
        <div className="flex flex-col items-center justify-center mb-8 relative z-10">
          <div className="w-20 h-20 bg-indigo-50 dark:bg-indigo-900/20 p-2 rounded-2xl shadow-lg mb-4 transform -rotate-3 hover:rotate-0 transition-transform">
            <img 
                src="https://i.ibb.co/B2XmRwmJ/logo.png" 
                onError={(e) => { e.currentTarget.onerror = null; e.currentTarget.src = '/logo.svg'; }}
                alt="Logo" 
                className="w-full h-full object-contain" 
            />
          </div>
          <h1 className="text-2xl font-bold text-slate-800 dark:text-white text-center">
              {isRegistering ? "Créer un compte" : "Bienvenue"}
          </h1>
        </div>

        {/* Tabs */}
        <div className="flex bg-slate-100 dark:bg-slate-800 p-1 rounded-xl mb-6 relative z-10">
            <button onClick={() => setIsRegistering(false)} className={`flex-1 py-2 text-sm font-semibold rounded-lg transition-all ${!isRegistering ? 'bg-white dark:bg-slate-700 text-indigo-600 dark:text-white shadow-sm' : 'text-slate-500 dark:text-slate-400'}`}>Connexion</button>
            <button onClick={() => setIsRegistering(true)} className={`flex-1 py-2 text-sm font-semibold rounded-lg transition-all ${isRegistering ? 'bg-white dark:bg-slate-700 text-indigo-600 dark:text-white shadow-sm' : 'text-slate-500 dark:text-slate-400'}`}>Inscription</button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 relative z-10">
          
          <div>
            <label className="block text-xs font-bold text-slate-600 dark:text-slate-300 mb-1 ml-1">
                {isRegistering ? "NOM D'UTILISATEUR" : "EMAIL / TÉL / NOM UTILISATEUR"}
            </label>
            <div className="relative">
                <User className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                <input
                type="text"
                required
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder={isRegistering ? "Votre pseudo" : "ex: 034... ou email@..."}
                className="w-full bg-slate-50 dark:bg-slate-800 text-slate-800 dark:text-white rounded-xl pl-12 pr-4 py-3.5 focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:focus:ring-indigo-400 transition-all border border-slate-200 dark:border-slate-700"
                />
            </div>
          </div>

          {isRegistering && (
            <div className="space-y-4 animate-fade-in">
                <div>
                    <label className="block text-xs font-bold text-slate-600 dark:text-slate-300 mb-1 ml-1">
                        EMAIL (OPTIONNEL)
                    </label>
                    <div className="relative">
                        <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                        <input
                        type="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="exemple@email.com"
                        className="w-full bg-slate-50 dark:bg-slate-800 text-slate-800 dark:text-white rounded-xl pl-12 pr-4 py-3.5 focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:focus:ring-indigo-400 transition-all border border-slate-200 dark:border-slate-700"
                        />
                    </div>
                </div>
                <div>
                    <label className="block text-xs font-bold text-slate-600 dark:text-slate-300 mb-1 ml-1">
                        TÉLÉPHONE (OPTIONNEL)
                    </label>
                    <div className="relative">
                        <Phone className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                        <input
                        type="tel"
                        value={phoneNumber}
                        onChange={(e) => setPhoneNumber(e.target.value)}
                        placeholder="034 00 000 00"
                        className="w-full bg-slate-50 dark:bg-slate-800 text-slate-800 dark:text-white rounded-xl pl-12 pr-4 py-3.5 focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:focus:ring-indigo-400 transition-all border border-slate-200 dark:border-slate-700"
                        />
                    </div>
                </div>
            </div>
          )}

          <div>
            <label className="block text-xs font-bold text-slate-600 dark:text-slate-300 mb-1 ml-1">
                MOT DE PASSE
            </label>
            <div className="relative">
                <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full bg-slate-50 dark:bg-slate-800 text-slate-800 dark:text-white rounded-xl pl-12 pr-4 py-3.5 focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:focus:ring-indigo-400 transition-all border border-slate-200 dark:border-slate-700"
                />
            </div>
          </div>

          <button
            type="submit"
            disabled={isLoading}
            className="w-full mt-4 bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-4 rounded-xl shadow-lg hover:shadow-xl transition-all flex items-center justify-center gap-2 disabled:opacity-70 disabled:cursor-not-allowed group"
          >
            {isLoading ? (
              <span className="flex items-center gap-2">
                 <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                 Connexion...
              </span>
            ) : (
              <>
                {isRegistering ? "S'inscrire" : "Se connecter"}
                <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
              </>
            )}
          </button>
        </form>

        {!isRegistering && (
             <div className="mt-4 text-center">
                 <button onClick={() => setShowForgotModal(true)} className="text-sm font-bold text-indigo-600 dark:text-indigo-400 hover:underline flex items-center justify-center gap-1 mx-auto">
                     <HelpCircle className="w-3 h-3"/> Mot de passe oublié ?
                 </button>
             </div>
        )}
      </div>

      {/* Forgot Password Smart Modal */}
      {showForgotModal && (
          <div className="fixed inset-0 z-[120] bg-slate-900/80 backdrop-blur-sm flex items-center justify-center p-4 animate-fade-in">
              <div className="bg-white dark:bg-slate-900 w-full max-w-sm rounded-2xl shadow-2xl border border-white/20 p-6 relative">
                  <button onClick={() => setShowForgotModal(false)} className="absolute top-4 right-4 p-1 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-full transition-colors">
                      <X className="w-5 h-5 text-slate-500"/>
                  </button>
                  
                  <div className="text-center mb-6">
                      <div className="w-14 h-14 bg-indigo-100 dark:bg-indigo-900/30 rounded-full flex items-center justify-center mx-auto mb-3 text-indigo-600 dark:text-indigo-400">
                          <Lock className="w-7 h-7" />
                      </div>
                      <h3 className="text-xl font-bold text-slate-800 dark:text-white">Récupération</h3>
                      <p className="text-sm text-slate-500 dark:text-slate-400 mt-2 leading-relaxed">
                          Entrez vos identifiants. L'administrateur vous enverra un nouveau mot de passe par <strong>Email</strong>.
                      </p>
                  </div>

                  <div className="space-y-3">
                      <div>
                          <label className="text-[10px] font-bold text-slate-500 uppercase ml-1">Nom d'utilisateur</label>
                          <div className="relative">
                              <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                              <input 
                                type="text" 
                                placeholder="Votre pseudo" 
                                value={forgotData.username}
                                onChange={e => setForgotData({...forgotData, username: e.target.value})}
                                className="w-full pl-9 pr-3 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500 text-sm text-slate-800 dark:text-white"
                              />
                          </div>
                      </div>

                      <div>
                          <label className="text-[10px] font-bold text-slate-500 uppercase ml-1">Téléphone</label>
                          <div className="relative">
                              <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                              <input 
                                type="tel" 
                                placeholder="034 00 000 00" 
                                value={forgotData.phone}
                                onChange={e => setForgotData({...forgotData, phone: e.target.value})}
                                className="w-full pl-9 pr-3 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500 text-sm text-slate-800 dark:text-white"
                              />
                          </div>
                      </div>

                      <div>
                          <label className="text-[10px] font-bold text-slate-500 uppercase ml-1">Adresse Email</label>
                          <div className="relative">
                              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                              <input 
                                type="email" 
                                placeholder="exemple@email.com" 
                                value={forgotData.email}
                                onChange={e => setForgotData({...forgotData, email: e.target.value})}
                                className="w-full pl-9 pr-3 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500 text-sm text-slate-800 dark:text-white"
                              />
                          </div>
                      </div>

                      <button 
                        onClick={handleForgotPasswordRequest}
                        disabled={forgotLoading || (!forgotData.username && !forgotData.phone && !forgotData.email)}
                        className="w-full mt-2 py-3 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl flex items-center justify-center gap-2 disabled:opacity-70 transition-all shadow-lg"
                      >
                          {forgotLoading ? "Envoi..." : "Envoyer Demande"} <Send className="w-4 h-4"/>
                      </button>
                  </div>
              </div>
          </div>
      )}
    </div>
  );
};

export default AuthScreen;
