
import React, { useState } from 'react';
import { UserProfile } from '../types';
import { storageService } from '../services/storageService';
import { GraduationCap, ArrowRight, Sun, Moon, Mail, Lock, User, ArrowLeft } from 'lucide-react';

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

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (!username.trim() || !password.trim()) {
        notify("Veuillez remplir tous les champs obligatoires.", 'error');
        return;
    }

    setIsLoading(true);
    
    // Simulate Network Delay
    setTimeout(() => {
        let result;
        if (isRegistering) {
            result = storageService.register(username, password, email);
        } else {
            result = storageService.login(username, password);
        }

        setIsLoading(false);

        if (result.success && result.user) {
            onAuthSuccess(result.user);
        } else {
            notify(result.error || "Une erreur est survenue.", 'error');
        }
    }, 1000);
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex flex-col items-center justify-center p-4 transition-colors duration-300 relative">
       {/* Top Controls */}
      <div className="absolute top-0 left-0 w-full p-6 flex justify-between items-center z-10">
          <button 
            onClick={onBack}
            className="p-2 text-slate-500 hover:bg-slate-200 dark:hover:bg-slate-800 rounded-full transition-colors"
          >
             <ArrowLeft className="w-6 h-6" />
          </button>
          <button
            onClick={toggleTheme}
            className="p-3 rounded-full bg-white dark:bg-slate-900 shadow-md hover:shadow-lg text-slate-500 dark:text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 transition-all cursor-pointer"
          >
            {isDarkMode ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
          </button>
      </div>

      <div className="max-w-md w-full bg-white dark:bg-slate-900 rounded-3xl shadow-2xl p-8 transform transition-all duration-500 animate-fade-in relative overflow-hidden">
        
        {/* Background Decoration */}
        <div className="absolute top-0 right-0 w-32 h-32 bg-indigo-500/10 rounded-bl-full -z-0"></div>
        
        <div className="flex flex-col items-center justify-center mb-8 relative z-10">
          <div className="bg-indigo-600 p-4 rounded-2xl shadow-lg mb-4 transform -rotate-3 hover:rotate-0 transition-transform">
            <GraduationCap className="w-10 h-10 text-white" />
          </div>
          <h2 className="text-sm font-bold text-indigo-600 dark:text-indigo-400 uppercase tracking-widest mb-1">TeacherMada</h2>
          <h1 className="text-2xl font-bold text-slate-800 dark:text-white text-center">
              {isRegistering ? "Créer un compte" : "Bienvenue"}
          </h1>
          <p className="text-slate-500 dark:text-slate-400 text-center mt-2 text-sm">
            {isRegistering ? "Commencez votre voyage linguistique." : "Reprenez là où vous vous êtes arrêté."}
          </p>
        </div>

        {/* Toggle Tabs */}
        <div className="flex bg-slate-100 dark:bg-slate-800 p-1 rounded-xl mb-6 relative z-10">
            <button 
                onClick={() => { setIsRegistering(false); }}
                className={`flex-1 py-2 text-sm font-semibold rounded-lg transition-all ${!isRegistering ? 'bg-white dark:bg-slate-700 text-indigo-600 dark:text-white shadow-sm' : 'text-slate-500 dark:text-slate-400'}`}
            >
                Connexion
            </button>
            <button 
                onClick={() => { setIsRegistering(true); }}
                className={`flex-1 py-2 text-sm font-semibold rounded-lg transition-all ${isRegistering ? 'bg-white dark:bg-slate-700 text-indigo-600 dark:text-white shadow-sm' : 'text-slate-500 dark:text-slate-400'}`}
            >
                Inscription
            </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 relative z-10">
          
          <div>
            <label className="block text-xs font-bold text-slate-600 dark:text-slate-300 mb-1 ml-1">
                {isRegistering ? "NOM D'UTILISATEUR" : "EMAIL OU NOM D'UTILISATEUR"}
            </label>
            <div className="relative">
                <User className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                <input
                type="text"
                required
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder={isRegistering ? "Votre pseudo" : "pseudo ou email"}
                className="w-full bg-slate-50 dark:bg-slate-800 text-slate-800 dark:text-white rounded-xl pl-12 pr-4 py-3.5 focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:focus:ring-indigo-400 transition-all border border-slate-200 dark:border-slate-700"
                />
            </div>
          </div>

          {isRegistering && (
            <div className="animate-fade-in">
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
                 Traitement...
              </span>
            ) : (
              <>
                {isRegistering ? "S'inscrire gratuitement" : "Se connecter"}
                <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
              </>
            )}
          </button>
        </form>
        
        <div className="mt-8 text-center border-t border-slate-100 dark:border-slate-800 pt-4">
            <p className="text-xs text-slate-400 dark:text-slate-500">
                En {isRegistering ? "vous inscrivant" : "vous connectant"}, vous acceptez nos Conditions d'utilisation et notre Politique de confidentialité.
            </p>
        </div>
      </div>
    </div>
  );
};

export default AuthScreen;
