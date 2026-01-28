
import React, { useState } from 'react';
import { X, Smartphone, ShieldCheck, Calculator, ArrowRight, Send, CheckCircle, Copy, Check } from 'lucide-react';
import { ADMIN_CONTACTS, CREDIT_PRICE_ARIARY } from '../constants';
import { storageService } from '../services/storageService';

interface PaymentModalProps {
  onClose: () => void;
  userId: string;
}

const PaymentModal: React.FC<PaymentModalProps> = ({ onClose, userId }) => {
  const [view, setView] = useState<'info' | 'request'>('info');
  const [amount, setAmount] = useState<number>(2000); // Default 2000 Ar
  const [refMessage, setRefMessage] = useState('');
  const [isSent, setIsSent] = useState(false);
  const [copied, setCopied] = useState(false);
  
  const credits = Math.floor(amount / CREDIT_PRICE_ARIARY);
  
  // Motif Generation: Crd_{username} (Max 20 chars)
  // Clean username first
  const cleanUsername = userId.replace(/[^a-zA-Z0-9]/g, ''); 
  const motifCode = `Crd_${cleanUsername}`.substring(0, 20); 

  const handleSendRequest = () => {
      if (!refMessage.trim()) return;
      
      const creditRequest = Math.floor(amount / CREDIT_PRICE_ARIARY);
      
      storageService.sendAdminRequest(
          userId, 
          userId,
          'credit',
          creditRequest,
          `Paiement Mobile Money. Réf/Détails: ${refMessage}`
      );
      
      setIsSent(true);
      setTimeout(() => {
          onClose();
      }, 2500);
  };

  const handleCopyMotif = () => {
      navigator.clipboard.writeText(motifCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-slate-900/80 backdrop-blur-md animate-fade-in">
      <div className="bg-white dark:bg-slate-900 w-full max-w-md rounded-3xl overflow-hidden shadow-2xl border border-white/20 max-h-[90vh] overflow-y-auto scrollbar-hide">
        
        {/* Header */}
        <div className="bg-gradient-to-r from-indigo-600 to-violet-600 p-6 text-white relative">
            <button onClick={onClose} className="absolute top-4 right-4 p-2 bg-white/10 hover:bg-white/20 rounded-full transition-colors">
                <X className="w-5 h-5" />
            </button>
            <div className="flex items-center gap-3 mb-2">
                <div className="p-2 bg-white/20 rounded-lg">
                    <ShieldCheck className="w-6 h-6" />
                </div>
                <h2 className="text-xl font-bold">
                    {view === 'info' ? "Recharger mes crédits" : "Confirmer le paiement"}
                </h2>
            </div>
            <p className="text-indigo-100 text-sm">
                {view === 'info' ? "Investissez dans votre savoir. 1 Requête = 1 Crédit." : "Envoyez la référence pour validation rapide."}
            </p>
        </div>

        <div className="p-6 space-y-6">
            
            {view === 'info' ? (
                <>
                    {/* Calculator */}
                    <div className="bg-slate-50 dark:bg-slate-800 p-4 rounded-2xl border border-slate-200 dark:border-slate-700">
                        <div className="flex items-center gap-2 mb-4 text-slate-500 dark:text-slate-400 text-sm font-bold uppercase">
                            <Calculator className="w-4 h-4" /> Calculateur
                        </div>
                        <div className="flex flex-col gap-4">
                            <div>
                                <label className="text-xs font-bold text-slate-500 mb-1 block">Montant en Ariary</label>
                                <input 
                                    type="number" 
                                    step="500"
                                    min="500"
                                    value={amount}
                                    onChange={(e) => setAmount(Number(e.target.value))}
                                    className="w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded-xl px-4 py-3 text-lg font-bold text-slate-800 dark:text-white focus:ring-2 focus:ring-indigo-500 outline-none"
                                />
                            </div>
                            <div className="flex items-center justify-between bg-indigo-50 dark:bg-indigo-900/20 p-3 rounded-xl">
                                <span className="font-medium text-indigo-800 dark:text-indigo-300">Crédits obtenus :</span>
                                <span className="text-2xl font-black text-indigo-600 dark:text-indigo-400">{credits}</span>
                            </div>
                            <p className="text-xs text-center text-slate-400">1 Crédit = {CREDIT_PRICE_ARIARY} Ar</p>
                        </div>
                    </div>

                    {/* Mobile Money Info */}
                    <div className="space-y-4">
                        <h3 className="font-bold text-slate-800 dark:text-white flex items-center gap-2">
                            <Smartphone className="w-5 h-5 text-emerald-500" />
                            Envoyer Mobile Money à :
                        </h3>

                        {/* Animated Recipient Name */}
                        <div className="flex items-center justify-between bg-slate-50 dark:bg-slate-800 p-3 rounded-lg border border-slate-200 dark:border-slate-700">
                             <span className="text-xs font-bold text-slate-500 uppercase">Nom :</span>
                             <span className="font-black text-lg bg-clip-text text-transparent bg-gradient-to-r from-indigo-600 via-purple-600 to-indigo-600 animate-pulse">
                                Tsanta Fiderana
                             </span>
                        </div>
                        
                        {/* Reference Hint Block */}
                        <div className="bg-indigo-50 dark:bg-indigo-900/10 border border-indigo-100 dark:border-indigo-800 rounded-xl p-3">
                            <p className="text-xs text-indigo-800 dark:text-indigo-300 mb-2 font-medium">
                                💡 <strong>Astuce :</strong> Ajoutez ceci comme "Motif" ou "Raison" lors de l'envoi pour validation instantanée :
                            </p>
                            <div className="flex items-center gap-2 bg-white dark:bg-slate-800 p-2 rounded-lg border border-slate-200 dark:border-slate-700">
                                <code className="flex-1 font-mono font-bold text-slate-800 dark:text-white text-sm text-center">
                                    {motifCode}
                                </code>
                                <button 
                                    onClick={handleCopyMotif}
                                    className="p-1.5 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-md transition-colors"
                                >
                                    {copied ? <Check className="w-4 h-4 text-emerald-500" /> : <Copy className="w-4 h-4 text-slate-500" />}
                                </button>
                            </div>
                        </div>

                        <div className="grid grid-cols-1 gap-2">
                            <ContactRow operator="Telma (MVola)" number={ADMIN_CONTACTS.telma} color="bg-yellow-500" />
                            <ContactRow operator="Airtel Money" number={ADMIN_CONTACTS.airtel} color="bg-red-500" />
                            <ContactRow operator="Orange Money" number={ADMIN_CONTACTS.orange} color="bg-orange-500" />
                        </div>
                    </div>

                    <button onClick={() => setView('request')} className="w-full py-4 bg-slate-900 dark:bg-white text-white dark:text-slate-900 font-bold rounded-xl hover:scale-[1.02] transition-transform flex items-center justify-center gap-2 shadow-lg">
                        J'ai effectué le paiement <ArrowRight className="w-5 h-5" />
                    </button>
                </>
            ) : (
                <div className="animate-slide-up space-y-6">
                    {isSent ? (
                        <div className="flex flex-col items-center justify-center py-8 text-center">
                            <div className="w-16 h-16 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mb-4 animate-bounce">
                                <CheckCircle className="w-8 h-8" />
                            </div>
                            <h3 className="text-xl font-bold text-slate-800 dark:text-white">Demande Envoyée !</h3>
                            <p className="text-slate-500 dark:text-slate-400 mt-2">L'administrateur validera vos crédits sous peu.</p>
                        </div>
                    ) : (
                        <>
                            <div className="bg-blue-50 dark:bg-blue-900/20 p-4 rounded-xl text-sm text-blue-800 dark:text-blue-200 border border-blue-100 dark:border-blue-900/50">
                                <strong>Dernière étape :</strong> Veuillez saisir la référence de transaction ou un détail pour que l'admin identifie votre paiement de <strong>{amount} Ar</strong>.
                            </div>

                            <div>
                                <label className="text-xs font-bold text-slate-500 mb-1 block uppercase">Référence / Message</label>
                                <textarea 
                                    rows={3}
                                    placeholder={`Ex: Ref 123456. Motif: ${motifCode}`}
                                    value={refMessage}
                                    onChange={(e) => setRefMessage(e.target.value)}
                                    className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-600 rounded-xl px-4 py-3 text-sm text-slate-800 dark:text-white focus:ring-2 focus:ring-indigo-500 outline-none"
                                />
                            </div>

                            <div className="flex gap-3">
                                <button onClick={() => setView('info')} className="flex-1 py-3 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 font-bold rounded-xl hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors">
                                    Retour
                                </button>
                                <button onClick={handleSendRequest} disabled={!refMessage.trim()} className="flex-[2] py-3 bg-indigo-600 text-white font-bold rounded-xl hover:bg-indigo-700 transition-colors flex items-center justify-center gap-2 disabled:opacity-50">
                                    Envoyer la demande <Send className="w-4 h-4" />
                                </button>
                            </div>
                        </>
                    )}
                </div>
            )}
        </div>

      </div>
    </div>
  );
};

const ContactRow = ({ operator, number, color }: { operator: string, number: string, color: string }) => (
    <div className="flex items-center justify-between p-3 bg-white dark:bg-slate-800 border border-slate-100 dark:border-slate-700 rounded-xl">
        <div className="flex items-center gap-3">
            <div className={`w-2 h-8 rounded-full ${color}`}></div>
            <span className="font-medium text-slate-700 dark:text-slate-300">{operator}</span>
        </div>
        <span className="font-mono font-bold text-slate-800 dark:text-white select-all cursor-pointer hover:text-indigo-500">{number}</span>
    </div>
);

export default PaymentModal;
