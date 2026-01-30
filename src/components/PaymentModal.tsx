
import React, { useState } from 'react';
import { X, Smartphone, ShieldCheck, Calculator, ArrowRight, Send, CheckCircle, Copy, Check, Coins, CreditCard, ChevronRight, User, Hash, FileText } from 'lucide-react';
import { ADMIN_CONTACTS, CREDIT_PRICE_ARIARY } from '../constants';
import { storageService } from '../services/storageService';
import { UserProfile } from '../types';

interface PaymentModalProps {
  onClose: () => void;
  user: UserProfile;
}

const AMOUNTS = [1000, 2000, 5000, 10000];

const PaymentModal: React.FC<PaymentModalProps> = ({ onClose, user }) => {
  const [view, setView] = useState<'amount' | 'operator' | 'confirm'>('amount');
  const [amount, setAmount] = useState<number>(2000);
  const [refMessage, setRefMessage] = useState('');
  const [isSent, setIsSent] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [selectedOperator, setSelectedOperator] = useState<'mvola' | 'airtel' | 'orange' | null>(null);
  
  const credits = Math.floor(amount / CREDIT_PRICE_ARIARY);
  
  // Motif Generation
  const cleanUsername = user.username.replace(/[^a-zA-Z0-9]/g, ''); 
  const motifCode = `Crd_${cleanUsername}`.substring(0, 20); 

  const copyToClipboard = (text: string, key: string) => {
      navigator.clipboard.writeText(text);
      setCopied(key);
      setTimeout(() => setCopied(null), 2000);
  };

  const handleSendRequest = async () => {
      if (!refMessage.trim()) return;
      setLoading(true);
      
      try {
          await storageService.sendAdminRequest(
              user.id,
              user.username,
              'credit',
              credits,
              `Paiement ${selectedOperator?.toUpperCase()}. Détails: ${refMessage}`
          );
          
          setIsSent(true);
          setTimeout(() => {
              onClose();
          }, 3000);
      } catch (e) {
          console.error("Payment Request Error", e);
      } finally {
          setLoading(false);
      }
  };

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xl animate-fade-in">
      <div className="bg-white dark:bg-[#0B0F19] w-full max-w-md rounded-[2rem] overflow-hidden shadow-2xl border border-white/20 dark:border-slate-800 max-h-[90vh] flex flex-col">
        
        {/* Header Moderne */}
        <div className="relative h-32 bg-gradient-to-br from-indigo-600 to-violet-700 flex items-center justify-center overflow-hidden shrink-0">
            <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/cubes.png')] opacity-10"></div>
            <div className="absolute top-0 right-0 w-32 h-32 bg-white/10 rounded-full blur-2xl -mr-10 -mt-10"></div>
            <div className="absolute bottom-0 left-0 w-24 h-24 bg-black/10 rounded-full blur-xl -ml-5 -mb-5"></div>
            
            <button onClick={onClose} className="absolute top-4 right-4 p-2 bg-black/20 hover:bg-black/30 rounded-full text-white transition-colors backdrop-blur-md z-20">
                <X className="w-5 h-5" />
            </button>

            <div className="text-center z-10">
                <h2 className="text-2xl font-black text-white tracking-tight">Recharger</h2>
                <div className="flex items-center justify-center gap-2 mt-1 opacity-90">
                    <span className="text-xs font-bold uppercase tracking-widest text-indigo-200">Solde Actuel</span>
                    <span className="bg-white/20 px-2 py-0.5 rounded text-sm font-bold text-white backdrop-blur-sm">{user.credits} CRD</span>
                </div>
            </div>
        </div>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto scrollbar-hide p-6">
            
            {/* ETAPE 1 : CHOIX MONTANT */}
            {view === 'amount' && (
                <div className="space-y-6 animate-slide-up">
                    <div className="text-center">
                        <p className="text-slate-500 dark:text-slate-400 text-sm font-medium">Combien voulez-vous investir ?</p>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                        {AMOUNTS.map((amt) => (
                            <button 
                                key={amt}
                                onClick={() => setAmount(amt)}
                                className={`p-4 rounded-2xl border-2 transition-all relative overflow-hidden group ${amount === amt 
                                    ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-900/20' 
                                    : 'border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900 hover:border-indigo-200'}`}
                            >
                                <div className="text-lg font-black text-slate-800 dark:text-white group-hover:scale-105 transition-transform">{amt.toLocaleString()} Ar</div>
                                <div className="text-xs font-bold text-indigo-500 dark:text-indigo-400">
                                    {Math.floor(amt / CREDIT_PRICE_ARIARY)} CRD
                                </div>
                                {amount === amt && (
                                    <div className="absolute top-2 right-2 text-indigo-500"><CheckCircle className="w-4 h-4 fill-indigo-100 dark:fill-indigo-900" /></div>
                                )}
                            </button>
                        ))}
                    </div>

                    {/* Custom Amount Input */}
                    <div className="relative">
                        <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                            <span className="text-slate-400 font-bold">Ar</span>
                        </div>
                        <input 
                            type="number" 
                            value={amount}
                            onChange={(e) => setAmount(Number(e.target.value))}
                            className="w-full pl-10 pr-4 py-4 bg-slate-50 dark:bg-slate-800/50 rounded-2xl font-bold text-slate-800 dark:text-white focus:ring-2 focus:ring-indigo-500 outline-none border border-transparent focus:bg-white dark:focus:bg-slate-800 transition-all text-center text-lg"
                        />
                    </div>

                    <div className="bg-indigo-500/5 p-4 rounded-2xl flex justify-between items-center border border-indigo-500/10">
                        <span className="text-sm font-medium text-slate-600 dark:text-slate-300">Vous recevrez :</span>
                        <div className="flex items-center gap-2">
                            <Coins className="w-5 h-5 text-amber-500 fill-amber-500" />
                            <span className="text-2xl font-black text-slate-800 dark:text-white">{Math.floor(amount / CREDIT_PRICE_ARIARY)}</span>
                            <span className="text-xs font-bold text-slate-400 self-end mb-1">CRD</span>
                        </div>
                    </div>

                    <button 
                        onClick={() => setView('operator')}
                        className="w-full py-4 bg-slate-900 dark:bg-white text-white dark:text-slate-900 font-bold rounded-2xl hover:scale-[1.02] transition-transform flex items-center justify-center gap-2 shadow-xl shadow-indigo-500/10"
                    >
                        Continuer <ArrowRight className="w-5 h-5" />
                    </button>
                </div>
            )}

            {/* ETAPE 2 : OPERATEUR */}
            {view === 'operator' && (
                <div className="space-y-6 animate-slide-in-right">
                    <div className="flex justify-between items-center mb-2">
                        <button onClick={() => setView('amount')} className="text-xs font-bold text-slate-400 hover:text-indigo-500 flex items-center gap-1">
                            <ArrowRight className="w-3 h-3 rotate-180"/> Modifier montant
                        </button>
                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Sélectionner</span>
                    </div>

                    <div className="space-y-3">
                        <OperatorCard 
                            name="MVola" 
                            color="bg-yellow-500" 
                            number={ADMIN_CONTACTS.telma} 
                            selected={selectedOperator === 'mvola'}
                            onSelect={() => setSelectedOperator('mvola')}
                            onCopy={(n: string) => copyToClipboard(n, 'mvola')}
                            isCopied={copied === 'mvola'}
                        />
                        <OperatorCard 
                            name="Airtel Money" 
                            color="bg-red-500" 
                            number={ADMIN_CONTACTS.airtel} 
                            selected={selectedOperator === 'airtel'}
                            onSelect={() => setSelectedOperator('airtel')}
                            onCopy={(n: string) => copyToClipboard(n, 'airtel')}
                            isCopied={copied === 'airtel'}
                        />
                        <OperatorCard 
                            name="Orange Money" 
                            color="bg-orange-500" 
                            number={ADMIN_CONTACTS.orange} 
                            selected={selectedOperator === 'orange'}
                            onSelect={() => setSelectedOperator('orange')}
                            onCopy={(n: string) => copyToClipboard(n, 'orange')}
                            isCopied={copied === 'orange'}
                        />
                    </div>

                    {/* Nom Mobile Money */}
                    <div className="bg-indigo-50 dark:bg-indigo-900/20 p-3 rounded-xl border border-indigo-100 dark:border-indigo-800 text-center">
                        <p className="text-[10px] font-bold text-indigo-400 uppercase tracking-widest mb-1">Nom Mobile Money</p>
                        <p className="text-lg font-black text-indigo-700 dark:text-indigo-200">TSANTA FIDERANA</p>
                    </div>

                    <div className="bg-slate-100 dark:bg-slate-800 p-4 rounded-2xl relative overflow-hidden group cursor-pointer" onClick={() => copyToClipboard(motifCode, 'motif')}>
                        <div className="absolute left-0 top-0 bottom-0 w-1 bg-indigo-500"></div>
                        <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">Description | Raison | Motif</p>
                        <div className="flex justify-between items-center">
                            <code className="font-mono font-bold text-lg text-indigo-600 dark:text-indigo-400">{motifCode}</code>
                            {copied === 'motif' ? <Check className="w-5 h-5 text-emerald-500"/> : <Copy className="w-5 h-5 text-slate-400 group-hover:text-indigo-500"/>}
                        </div>
                    </div>

                    <button 
                        onClick={() => setView('confirm')}
                        disabled={!selectedOperator}
                        className="w-full py-4 bg-slate-900 dark:bg-white text-white dark:text-slate-900 font-bold rounded-2xl hover:scale-[1.02] transition-transform flex items-center justify-center gap-2 shadow-xl shadow-indigo-500/10 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        J'ai envoyé l'argent <ArrowRight className="w-5 h-5" />
                    </button>
                </div>
            )}

            {/* ETAPE 3 : CONFIRMATION */}
            {view === 'confirm' && (
                <div className="space-y-6 animate-slide-in-right h-full flex flex-col justify-between">
                    {!isSent ? (
                        <>
                            <div className="space-y-4">
                                <button onClick={() => setView('operator')} className="text-xs font-bold text-slate-400 hover:text-indigo-500 flex items-center gap-1 mb-2">
                                    <ArrowRight className="w-3 h-3 rotate-180"/> Retour
                                </button>

                                <div className="text-center">
                                    <div className="w-16 h-16 bg-indigo-100 dark:bg-indigo-900/30 rounded-full flex items-center justify-center mx-auto mb-4 text-indigo-600 dark:text-indigo-400">
                                        <Smartphone className="w-8 h-8" />
                                    </div>
                                    <h3 className="text-xl font-bold text-slate-800 dark:text-white">Validation Rapide</h3>
                                    <p className="text-sm text-slate-500 dark:text-slate-400 mt-2">
                                        Pour que l'admin valide vos <strong>{credits} CRD</strong> instantanément, identifier un indice dans votre transaction, comme nom numéro ou nom du destinataire ou Référence ou Description.
                                    </p>
                                </div>

                                <div className="bg-slate-50 dark:bg-slate-800 p-4 rounded-2xl border border-slate-200 dark:border-slate-700">
                                    <div className="flex flex-col gap-2 mb-2">
                                        <div className="flex items-center gap-2 text-xs font-bold text-slate-500 uppercase">
                                            <User className="w-3 h-3"/> Nom
                                            <span className="mx-1">•</span>
                                            <Hash className="w-3 h-3"/> Tél
                                            <span className="mx-1">•</span>
                                            <FileText className="w-3 h-3"/> Réf
                                        </div>
                                    </div>
                                    <textarea 
                                        rows={3}
                                        placeholder="ex: Entrer un indice de votre transaction"
                                        value={refMessage}
                                        onChange={(e) => setRefMessage(e.target.value)}
                                        className="w-full bg-transparent text-slate-800 dark:text-white outline-none resize-none font-medium placeholder:text-slate-400"
                                    />
                                </div>
                            </div>

                            <button 
                                onClick={handleSendRequest}
                                disabled={!refMessage.trim() || loading}
                                className="w-full py-4 bg-gradient-to-r from-emerald-500 to-teal-500 text-white font-bold rounded-2xl hover:shadow-lg hover:shadow-emerald-500/30 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
                            >
                                {loading ? 'Envoi...' : 'Valider maintenant'} <Send className="w-5 h-5" />
                            </button>
                        </>
                    ) : (
                        <div className="flex flex-col items-center justify-center h-full text-center py-10">
                            <div className="w-20 h-20 bg-emerald-100 dark:bg-emerald-900/30 rounded-full flex items-center justify-center mb-6 animate-bounce">
                                <CheckCircle className="w-10 h-10 text-emerald-500" />
                            </div>
                            <h3 className="text-2xl font-black text-slate-800 dark:text-white">Reçu 5/5 !</h3>
                            <p className="text-slate-500 dark:text-slate-400 mt-2 font-medium">L'admin valide votre compte en un éclair.</p>
                        </div>
                    )}
                </div>
            )}

        </div>
      </div>
    </div>
  );
};

const OperatorCard = ({ name, color, number, selected, onSelect, onCopy, isCopied }: any) => (
    <div 
        onClick={onSelect}
        className={`p-3 rounded-2xl border-2 transition-all cursor-pointer flex items-center gap-4 ${selected ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-900/20' : 'border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900 hover:border-slate-200 dark:hover:border-slate-700'}`}
    >
        <div className={`w-12 h-12 rounded-xl ${color} flex items-center justify-center text-white shadow-md`}>
            <Smartphone className="w-6 h-6" />
        </div>
        <div className="flex-1">
            <h4 className="font-bold text-slate-800 dark:text-white">{name}</h4>
            <div className="flex items-center gap-2" onClick={(e) => { e.stopPropagation(); onCopy(number); }}>
                <span className="font-mono text-sm text-slate-500 dark:text-slate-400">{number}</span>
                {isCopied ? <Check className="w-3 h-3 text-emerald-500"/> : <Copy className="w-3 h-3 text-slate-300 hover:text-indigo-500"/>}
            </div>
        </div>
        <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center ${selected ? 'border-indigo-500 bg-indigo-500' : 'border-slate-300'}`}>
            {selected && <Check className="w-4 h-4 text-white" />}
        </div>
    </div>
);

export default PaymentModal;
