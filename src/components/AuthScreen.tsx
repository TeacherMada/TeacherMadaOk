
import React, { useState } from 'react';
import { UserProfile } from '../types';
import { supabase } from '../lib/supabase';
import { storageService } from '../services/storageService';
import { GraduationCap, ArrowRight, Sun, Moon, Mail, Lock, User, ArrowLeft, HelpCircle } from 'lucide-react';

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
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password || (isRegistering && !username)) {
        notify("Veuillez remplir tous les champs.", 'error');
        return;
    }

    setIsLoading(true);

    try {
        if (isRegistering) {
            // INSCRIPTION SUPABASE
            const { data, error } = await supabase.auth.signUp({
                email,
                password,
                options: {
                    data: { username: username } // Méta-données pour le trigger SQL
                }
            });
            
            if (error) throw error;
            if (data.user) {
                notify("Compte créé ! Connectez-vous.", 'success');
                setIsRegistering(false);
            }
        } else {
            // CONNEXION SUPABASE
            const { data, error } = await supabase.auth.signInWithPassword({
                email,
                password
            });

            if (error) throw error;
            
            if (data.user) {
                // Récupérer le profil complet depuis notre service (qui interroge la table profiles)
                const fullProfile = await storageService.getUserById(data.user.id);
                if (fullProfile) {
                    onAuthSuccess(fullProfile);
                } else {
                    // Fallback si le trigger n'a pas encore couru (rare)
                    notify("Profil en cours de création, réessayez...", 'info');
                }
            }
        }
    } catch (error: any) {
        notify(error.message || "Erreur d'authentification", 'error');
    } finally {
        setIsLoading(false);
    }
  };

  const handleForgotPassword = async () => {
      if (!email) return notify("Entrez votre email ci-dessus d'abord.", 'info');
      const { error } = await supabase.auth.resetPasswordForEmail(email);
      if (error) notify("Erreur: " + error.message, 'error');
      else notify("Email de réinitialisation envoyé !", 'success');
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex flex-col items-center justify-center p-4 transition-colors duration-300 relative">
       {/* Top Controls */}
      <div className="absolute top-0 left-0 w-full p-6 flex justify-between items-center z-10">
          <button onClick={onBack} className="p-2 text-slate-500 hover:bg-slate-200 dark:hover:bg-slate-800 rounded-full transition-colors"><ArrowLeft className="w-6 h-6" /></button>
          <button onClick={toggleTheme} className="p-3 rounded-full bg-white dark:bg-slate-900 shadow-md hover:shadow-lg text-slate-500 dark:text-slate-400"><Sun className="w-5 h-5" /></button>
      </div>

      <div className="max-w-md w-full bg-white dark:bg-slate-900 rounded-3xl shadow-2xl p-8 transform transition-all duration-500 animate-fade-in relative overflow-hidden">
        
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

        {/* Toggle Tabs */}
        <div className="flex bg-slate-100 dark:bg-slate-800 p-1 rounded-xl mb-6 relative z-10">
            <button onClick={() => setIsRegistering(false)} className={`flex-1 py-2 text-sm font-semibold rounded-lg transition-all ${!isRegistering ? 'bg-white dark:bg-slate-700 text-indigo-600 dark:text-white shadow-sm' : 'text-slate-500 dark:text-slate-400'}`}>Connexion</button>
            <button onClick={() => setIsRegistering(true)} className={`flex-1 py-2 text-sm font-semibold rounded-lg transition-all ${isRegistering ? 'bg-white dark:bg-slate-700 text-indigo-600 dark:text-white shadow-sm' : 'text-slate-500 dark:text-slate-400'}`}>Inscription</button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 relative z-10">
          {isRegistering && (
            <div>
                <label className="block text-xs font-bold text-slate-600 dark:text-slate-300 mb-1 ml-1">NOM D'UTILISATEUR</label>
                <div className="relative">
                    <User className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                    <input type="text" value={username} onChange={(e) => setUsername(e.target.value)} placeholder="Votre pseudo" className="w-full bg-slate-50 dark:bg-slate-800 text-slate-800 dark:text-white rounded-xl pl-12 pr-4 py-3.5 outline-none border border-slate-200 dark:border-slate-700" />
                </div>
            </div>
          )}

          <div>
            <label className="block text-xs font-bold text-slate-600 dark:text-slate-300 mb-1 ml-1">EMAIL</label>
            <div className="relative">
                <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="exemple@email.com" className="w-full bg-slate-50 dark:bg-slate-800 text-slate-800 dark:text-white rounded-xl pl-12 pr-4 py-3.5 outline-none border border-slate-200 dark:border-slate-700" />
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-600 dark:text-slate-300 mb-1 ml-1">MOT DE PASSE</label>
            <div className="relative">
                <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                <input type="password" required value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" className="w-full bg-slate-50 dark:bg-slate-800 text-slate-800 dark:text-white rounded-xl pl-12 pr-4 py-3.5 outline-none border border-slate-200 dark:border-slate-700" />
            </div>
          </div>

          <button type="submit" disabled={isLoading} className="w-full mt-4 bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-4 rounded-xl shadow-lg flex items-center justify-center gap-2 disabled:opacity-70">
            {isLoading ? "Chargement..." : (isRegistering ? "S'inscrire" : "Se connecter")}
            <ArrowRight className="w-5 h-5" />
          </button>
        </form>

        {!isRegistering && (
             <div className="mt-4 text-center">
                 <button onClick={handleForgotPassword} className="text-sm font-bold text-indigo-600 dark:text-indigo-400 hover:underline flex items-center justify-center gap-1 mx-auto">
                     <HelpCircle className="w-3 h-3"/> Mot de passe oublié ?
                 </button>
             </div>
        )}
      </div>
    </div>
  );
};

export default AuthScreen;
