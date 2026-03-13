import React, { useState } from 'react';
import { Lock, ArrowRight, AlertTriangle, CheckCircle } from 'lucide-react';
import { storageService } from '../services/storageService';
import { useAppStore } from '../store/useAppStore';

const ResetPasswordScreen: React.FC = () => {
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState(false);
    const setShowResetPassword = useAppStore(state => state.setShowResetPassword);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError(null);

        if (password.length < 6) {
            setError("Le mot de passe doit contenir au moins 6 caractères.");
            return;
        }
        if (password !== confirmPassword) {
            setError("Les mots de passe ne correspondent pas.");
            return;
        }

        setIsLoading(true);
        const result = await storageService.updatePassword(password);
        setIsLoading(false);

        if (result.success) {
            setSuccess(true);
            setTimeout(() => {
                setShowResetPassword(false);
            }, 3000);
        } else {
            setError(result.error || "Une erreur est survenue.");
        }
    };

    return (
        <div className="fixed inset-0 z-[300] bg-slate-50 dark:bg-slate-950 flex flex-col items-center justify-center p-4 font-sans">
            <div className="max-w-md w-full bg-white dark:bg-slate-900 rounded-[2rem] shadow-2xl p-8 border border-slate-100 dark:border-slate-800 animate-fade-in relative">
                <div className="w-16 h-16 bg-indigo-50 dark:bg-indigo-500/10 rounded-2xl flex items-center justify-center mb-6 text-indigo-600 dark:text-indigo-400 mx-auto">
                    <Lock className="w-8 h-8" />
                </div>
                
                <h2 className="text-2xl font-black text-slate-900 dark:text-white text-center mb-2">Nouveau mot de passe</h2>
                <p className="text-slate-500 dark:text-slate-400 text-center text-sm mb-8">
                    Veuillez entrer votre nouveau mot de passe pour sécuriser votre compte.
                </p>

                {success ? (
                    <div className="bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 dark:text-emerald-400 p-4 rounded-2xl flex flex-col items-center gap-3 text-center animate-fade-in">
                        <CheckCircle className="w-8 h-8" />
                        <p className="font-bold">Mot de passe mis à jour !</p>
                        <p className="text-sm opacity-80">Vous allez être redirigé vers l'application...</p>
                    </div>
                ) : (
                    <form onSubmit={handleSubmit} className="space-y-5">
                        {error && (
                            <div className="bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-300 text-xs font-bold p-4 rounded-2xl flex items-center gap-3 animate-fade-in">
                                <AlertTriangle className="w-5 h-5 shrink-0" />
                                {error}
                            </div>
                        )}

                        <div>
                            <label className="block text-[10px] font-bold text-slate-400 dark:text-slate-500 mb-2 ml-1 tracking-widest uppercase">Nouveau mot de passe</label>
                            <div className="relative group">
                                <div className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400 group-focus-within:text-indigo-500 transition-colors"><Lock className="w-full h-full" /></div>
                                <input type="password" required value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" className="w-full bg-slate-50 dark:bg-slate-800/50 text-slate-800 dark:text-white rounded-2xl pl-12 pr-4 py-4 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 dark:focus:border-indigo-400 transition-all font-medium" />
                            </div>
                        </div>

                        <div>
                            <label className="block text-[10px] font-bold text-slate-400 dark:text-slate-500 mb-2 ml-1 tracking-widest uppercase">Confirmer le mot de passe</label>
                            <div className="relative group">
                                <div className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400 group-focus-within:text-indigo-500 transition-colors"><Lock className="w-full h-full" /></div>
                                <input type="password" required value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} placeholder="••••••••" className="w-full bg-slate-50 dark:bg-slate-800/50 text-slate-800 dark:text-white rounded-2xl pl-12 pr-4 py-4 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 dark:focus:border-indigo-400 transition-all font-medium" />
                            </div>
                        </div>

                        <button type="submit" disabled={isLoading} className="w-full mt-4 bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-4 rounded-2xl shadow-lg hover:shadow-indigo-500/30 transition-all flex items-center justify-center gap-2 disabled:opacity-70">
                            {isLoading ? "Mise à jour..." : "Enregistrer"}
                            {!isLoading && <ArrowRight className="w-5 h-5" />}
                        </button>
                    </form>
                )}
            </div>
        </div>
    );
};

export default ResetPasswordScreen;
