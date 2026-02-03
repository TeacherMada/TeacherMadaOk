
import React, { useState, useEffect } from 'react';
import { X, Smartphone, Calculator, ArrowRight, Send, CheckCircle, Copy, Check, Coins, Ticket, Loader2, ChevronLeft, AlertTriangle } from 'lucide-react';
import { ADMIN_CONTACTS, CREDIT_PRICE_ARIARY } from '../constants';
import { storageService } from '../services/storageService';
import { UserProfile } from '../types';

interface PaymentModalProps {
  onClose: () => void;
  user: UserProfile;
}

const PRESET_AMOUNTS = [1000, 2000, 5000, 10000];

const PaymentModal: React.FC<PaymentModalProps> = ({ onClose, user }) => {
  const [activeTab, setActiveTab] = useState<'money' | 'coupon'>('money');
  
  // Mobile Money State
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [amount, setAmount] = useState<string>('2000');
  const [selectedOperator, setSelectedOperator] = useState<'mvola' | 'airtel' | 'orange'>('mvola');
  const [reference, setReference] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  // Coupon State
  const [couponCode, setCouponCode] = useState('');
  const [couponStatus, setCouponStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [couponMessage, setCouponMessage] = useState('');

  // Derived
  const numericAmount = parseInt(amount.replace(/\D/g, '') || '0');
  const credits = Math.floor(numericAmount / CREDIT_PRICE_ARIARY);
  const cleanUsername = user.username.replace(/[^a-zA-Z0-9]/g, '');
  const motifCode = `Crd_${cleanUsername}`.substring(0, 15);

  const copyToClipboard = (text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  const handleAmountSelect = (val: number) => {
    setAmount(val.toString());
  };

  const handleMoneySubmit = async () => {
    if (!reference.trim()) return;
    setIsSubmitting(true);
    
    try {
      await storageService.sendAdminRequest(
        user.id,
        user.username,
        'credit',
        credits,
        `Mobile Money (${selectedOperator.toUpperCase()}). Réf: ${reference}`,
        user.phoneNumber || '' // Pass user phone if available
      );
      setIsSuccess(true);
      setTimeout(() => {
        onClose();
      }, 3000);
    } catch (e) {
      console.error(e);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCouponSubmit = async () => {
    if (!couponCode.trim()) return;
    setCouponStatus('loading');
    
    try {
      const result = await storageService.redeemCode(user.id, couponCode.trim());
      if (result.success) {
        setCouponStatus('success');
        setCouponMessage(`+${result.amount} Crédits ajoutés !`);
        setTimeout(() => {
            window.location.reload(); // Simple reload to refresh context
        }, 2000);
      } else {
        setCouponStatus('error');
        setCouponMessage(result.message || "Code invalide");
      }
    } catch (e) {
      setCouponStatus('error');
      setCouponMessage("Erreur de connexion");
    }
  };

  return (
    <div className="fixed inset-0 z-[150] flex items-end sm:items-center justify-center pointer-events-none">
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm pointer-events-auto transition-opacity animate-fade-in" 
        onClick={onClose}
      />

      {/* Modal Container */}
      <div className="bg-white dark:bg-[#0F1422] w-full sm:max-w-md h-[85vh] sm:h-auto sm:max-h-[80vh] rounded-t-[2rem] sm:rounded-[2rem] shadow-2xl pointer-events-auto flex flex-col overflow-hidden animate-slide-up border border-slate-200 dark:border-slate-800">
        
        {/* Header Gradient */}
        <div className="bg-gradient-to-r from-indigo-600 to-violet-600 p-6 pb-8 relative shrink-0">
            <button onClick={onClose} className="absolute top-4 right-4 p-2 bg-white/10 hover:bg-white/20 rounded-full text-white transition-colors">
                <X className="w-5 h-5" />
            </button>
            <div className="text-center">
                <h2 className="text-2xl font-black text-white tracking-tight mb-1">Portefeuille</h2>
                <p className="text-indigo-100 text-xs font-medium">Solde actuel: {user.credits} Crédits</p>
            </div>

            {/* Floating Tabs */}
            <div className="absolute -bottom-6 left-6 right-6 h-12 bg-white dark:bg-slate-800 rounded-2xl shadow-xl flex p-1 border border-slate-100 dark:border-slate-700">
                <button 
                    onClick={() => setActiveTab('money')}
                    className={`flex-1 rounded-xl text-xs font-bold uppercase tracking-wider flex items-center justify-center gap-2 transition-all ${activeTab === 'money' ? 'bg-indigo-600 text-white shadow-md' : 'text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-700'}`}
                >
                    <Smartphone className="w-4 h-4" /> Mobile Money
                </button>
                <button 
                    onClick={() => setActiveTab('coupon')}
                    className={`flex-1 rounded-xl text-xs font-bold uppercase tracking-wider flex items-center justify-center gap-2 transition-all ${activeTab === 'coupon' ? 'bg-indigo-600 text-white shadow-md' : 'text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-700'}`}
                >
                    <Ticket className="w-4 h-4" /> Coupon
                </button>
            </div>
        </div>

        {/* Body Content */}
        <div className="flex-1 overflow-y-auto p-6 pt-10 scrollbar-hide">
            
            {/* --- TAB: MOBILE MONEY --- */}
            {activeTab === 'money' && !isSuccess && (
                <div className="space-y-6">
                    {/* Step Indicator */}
                    <div className="flex items-center justify-between mb-2 px-2">
                        <div className={`h-1.5 flex-1 rounded-full ${step >= 1 ? 'bg-indigo-500' : 'bg-slate-100 dark:bg-slate-800'}`}></div>
                        <div className="w-2"></div>
                        <div className={`h-1.5 flex-1 rounded-full ${step >= 2 ? 'bg-indigo-500' : 'bg-slate-100 dark:bg-slate-800'}`}></div>
                        <div className="w-2"></div>
                        <div className={`h-1.5 flex-1 rounded-full ${step >= 3 ? 'bg-indigo-500' : 'bg-slate-100 dark:bg-slate-800'}`}></div>
                    </div>

                    {/* STEP 1: AMOUNT */}
                    {step === 1 && (
                        <div className="space-y-6 animate-fade-in">
                            <div className="text-center space-y-2">
                                <label className="text-xs font-bold text-slate-400 uppercase tracking-widest">Montant à recharger</label>
                                <div className="relative max-w-[200px] mx-auto">
                                    <input 
                                        type="number" 
                                        value={amount}
                                        onChange={(e) => setAmount(e.target.value)}
                                        className="w-full bg-transparent text-center text-4xl font-black text-slate-800 dark:text-white outline-none placeholder:text-slate-200 pb-2 border-b-2 border-slate-200 dark:border-slate-700 focus:border-indigo-500 transition-colors"
                                        placeholder="0"
                                    />
                                    <span className="absolute right-0 bottom-4 text-sm font-bold text-slate-400">Ar</span>
                                </div>
                                <div className="inline-flex items-center gap-2 bg-emerald-50 dark:bg-emerald-900/20 px-4 py-2 rounded-full">
                                    <Coins className="w-4 h-4 text-emerald-500"/>
                                    <span className="font-bold text-emerald-700 dark:text-emerald-400 text-sm">= {credits} Crédits</span>
                                </div>
                            </div>

                            <div className="grid grid-cols-2 gap-3">
                                {PRESET_AMOUNTS.map(amt => (
                                    <button 
                                        key={amt} 
                                        onClick={() => handleAmountSelect(amt)}
                                        className={`p-3 rounded-xl border-2 font-bold text-sm transition-all ${parseInt(amount) === amt ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-900/20 text-indigo-700 dark:text-indigo-300' : 'border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-400 hover:border-slate-300'}`}
                                    >
                                        {amt.toLocaleString()} Ar
                                    </button>
                                ))}
                            </div>

                            <button onClick={() => setStep(2)} disabled={numericAmount < 500} className="w-full py-4 bg-slate-900 dark:bg-white text-white dark:text-slate-900 font-bold rounded-2xl flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed hover:scale-[1.02] transition-transform">
                                Continuer <ArrowRight className="w-5 h-5" />
                            </button>
                        </div>
                    )}

                    {/* STEP 2: OPERATOR */}
                    {step === 2 && (
                        <div className="space-y-5 animate-slide-in-right">
                            <button onClick={() => setStep(1)} className="text-xs font-bold text-slate-400 flex items-center gap-1 hover:text-indigo-500"><ChevronLeft className="w-4 h-4"/> Modifier montant</button>
                            
                            <h3 className="text-lg font-bold text-slate-800 dark:text-white text-center">Envoyer via Mobile Money</h3>
                            
                            <div className="space-y-3">
                                <OperatorButton 
                                    name="MVola" 
                                    color="bg-yellow-500" 
                                    number={ADMIN_CONTACTS.telma} 
                                    selected={selectedOperator === 'mvola'} 
                                    onSelect={() => setSelectedOperator('mvola')}
                                    onCopy={() => copyToClipboard(ADMIN_CONTACTS.telma, 'mvola')}
                                    isCopied={copiedKey === 'mvola'}
                                />
                                <OperatorButton 
                                    name="Airtel Money" 
                                    color="bg-red-500" 
                                    number={ADMIN_CONTACTS.airtel} 
                                    selected={selectedOperator === 'airtel'} 
                                    onSelect={() => setSelectedOperator('airtel')}
                                    onCopy={() => copyToClipboard(ADMIN_CONTACTS.airtel, 'airtel')}
                                    isCopied={copiedKey === 'airtel'}
                                />
                                <OperatorButton 
                                    name="Orange Money" 
                                    color="bg-orange-500" 
                                    number={ADMIN_CONTACTS.orange} 
                                    selected={selectedOperator === 'orange'} 
                                    onSelect={() => setSelectedOperator('orange')}
                                    onCopy={() => copyToClipboard(ADMIN_CONTACTS.orange, 'orange')}
                                    isCopied={copiedKey === 'orange'}
                                />
                            </div>

                            <div className="bg-slate-50 dark:bg-slate-800/50 p-4 rounded-xl border border-slate-200 dark:border-slate-700">
                                <div className="flex justify-between items-center text-sm mb-1">
                                    <span className="text-slate-500">Nom :</span>
                                    <span className="font-bold text-slate-800 dark:text-white">TSANTA FIDERANA</span>
                                </div>
                                <div className="flex justify-between items-center text-sm">
                                    <span className="text-slate-500">Motif (Important) :</span>
                                    <button onClick={() => copyToClipboard(motifCode, 'motif')} className="flex items-center gap-1 font-mono font-bold text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-900/30 px-2 py-0.5 rounded cursor-pointer hover:bg-indigo-100">
                                        {motifCode} {copiedKey === 'motif' ? <Check className="w-3 h-3"/> : <Copy className="w-3 h-3"/>}
                                    </button>
                                </div>
                            </div>

                            <button onClick={() => setStep(3)} className="w-full py-4 bg-slate-900 dark:bg-white text-white dark:text-slate-900 font-bold rounded-2xl flex items-center justify-center gap-2 hover:scale-[1.02] transition-transform">
                                J'ai envoyé l'argent <ArrowRight className="w-5 h-5" />
                            </button>
                        </div>
                    )}

                    {/* STEP 3: CONFIRM */}
                    {step === 3 && (
                        <div className="space-y-6 animate-slide-in-right">
                            <button onClick={() => setStep(2)} className="text-xs font-bold text-slate-400 flex items-center gap-1 hover:text-indigo-500"><ChevronLeft className="w-4 h-4"/> Retour</button>
                            
                            <div className="text-center">
                                <div className="w-16 h-16 bg-indigo-50 dark:bg-indigo-900/20 rounded-full flex items-center justify-center mx-auto mb-4 text-indigo-600">
                                    <Smartphone className="w-8 h-8" />
                                </div>
                                <h3 className="text-xl font-bold text-slate-800 dark:text-white">Validation</h3>
                                <p className="text-sm text-slate-500 dark:text-slate-400 mt-2 px-4">Entrez la référence du SMS reçu pour valider vos <strong>{credits} Crédits</strong>.</p>
                            </div>

                            <div className="space-y-2">
                                <label className="text-xs font-bold text-slate-500 uppercase ml-2">Référence de transaction</label>
                                <textarea 
                                    rows={3}
                                    value={reference}
                                    onChange={(e) => setReference(e.target.value)}
                                    placeholder="Collez le SMS ou la référence ici..."
                                    className="w-full p-4 bg-slate-50 dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 outline-none focus:ring-2 focus:ring-indigo-500 dark:text-white text-sm"
                                />
                            </div>

                            <button 
                                onClick={handleMoneySubmit} 
                                disabled={!reference.trim() || isSubmitting}
                                className="w-full py-4 bg-gradient-to-r from-emerald-500 to-teal-600 text-white font-bold rounded-2xl flex items-center justify-center gap-2 hover:shadow-lg disabled:opacity-70 transition-all"
                            >
                                {isSubmitting ? <Loader2 className="w-5 h-5 animate-spin"/> : <Send className="w-5 h-5" />}
                                Envoyer la demande
                            </button>
                        </div>
                    )}
                </div>
            )}

            {isSuccess && (
                <div className="flex flex-col items-center justify-center h-full text-center space-y-6 animate-scale-in">
                    <div className="w-24 h-24 bg-emerald-100 dark:bg-emerald-900/30 rounded-full flex items-center justify-center">
                        <CheckCircle className="w-12 h-12 text-emerald-500" />
                    </div>
                    <div>
                        <h3 className="text-2xl font-black text-slate-900 dark:text-white">Demande Envoyée !</h3>
                        <p className="text-slate-500 dark:text-slate-400 mt-2">L'administrateur validera vos crédits dans quelques instants.</p>
                    </div>
                </div>
            )}

            {/* --- TAB: COUPON --- */}
            {activeTab === 'coupon' && (
                <div className="flex flex-col h-full justify-center space-y-8 animate-fade-in pb-10">
                    <div className="text-center">
                        <div className="w-20 h-20 bg-indigo-50 dark:bg-slate-800 rounded-3xl rotate-3 mx-auto mb-6 flex items-center justify-center shadow-sm">
                            <Ticket className="w-10 h-10 text-indigo-500" />
                        </div>
                        <h3 className="text-xl font-bold text-slate-900 dark:text-white">Avez-vous un code ?</h3>
                        <p className="text-sm text-slate-500 dark:text-slate-400 mt-2">Entrez votre code promo pour obtenir des crédits instantanément.</p>
                    </div>

                    <div className="space-y-4">
                        <input 
                            type="text" 
                            placeholder="CODE-PROMO" 
                            value={couponCode}
                            onChange={(e) => { setCouponCode(e.target.value.toUpperCase()); setCouponStatus('idle'); }}
                            className="w-full text-center text-2xl font-black tracking-widest p-5 rounded-2xl bg-slate-50 dark:bg-slate-800 border-2 border-slate-200 dark:border-slate-700 outline-none focus:border-indigo-500 uppercase placeholder:text-slate-300 dark:placeholder:text-slate-600 transition-colors dark:text-white"
                            disabled={couponStatus === 'loading' || couponStatus === 'success'}
                        />
                        
                        {couponStatus === 'error' && (
                            <div className="flex items-center justify-center gap-2 text-red-500 text-sm font-bold bg-red-50 dark:bg-red-900/20 p-3 rounded-xl animate-shake">
                                <AlertTriangle className="w-4 h-4"/> {couponMessage}
                            </div>
                        )}
                        {couponStatus === 'success' && (
                            <div className="flex items-center justify-center gap-2 text-emerald-600 text-sm font-bold bg-emerald-50 dark:bg-emerald-900/20 p-3 rounded-xl animate-bounce-slight">
                                <CheckCircle className="w-4 h-4"/> {couponMessage}
                            </div>
                        )}

                        <button 
                            onClick={handleCouponSubmit}
                            disabled={!couponCode.trim() || couponStatus === 'loading' || couponStatus === 'success'}
                            className="w-full py-4 bg-indigo-600 text-white font-bold rounded-2xl shadow-lg shadow-indigo-500/20 hover:scale-[1.02] active:scale-[0.98] transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                        >
                            {couponStatus === 'loading' ? <Loader2 className="w-5 h-5 animate-spin"/> : 'Valider le code'}
                        </button>
                    </div>
                </div>
            )}

        </div>
      </div>
    </div>
  );
};

const OperatorButton = ({ name, color, number, selected, onSelect, onCopy, isCopied }: any) => (
    <div 
        onClick={onSelect}
        className={`p-4 rounded-2xl border-2 cursor-pointer transition-all flex items-center gap-4 ${selected ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-900/10' : 'border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900 hover:border-slate-200 dark:hover:border-slate-700'}`}
    >
        <div className={`w-10 h-10 rounded-full ${color} flex items-center justify-center text-white shadow-sm shrink-0`}>
            <Smartphone className="w-5 h-5" />
        </div>
        <div className="flex-1 min-w-0">
            <h4 className="font-bold text-slate-800 dark:text-white text-sm">{name}</h4>
            <div className="flex items-center gap-2 group" onClick={(e) => { e.stopPropagation(); onCopy(); }}>
                <span className="text-xs font-mono text-slate-500 dark:text-slate-400 group-hover:text-indigo-500 transition-colors">{number}</span>
                {isCopied ? <Check className="w-3 h-3 text-emerald-500"/> : <Copy className="w-3 h-3 text-slate-300 opacity-0 group-hover:opacity-100 transition-opacity"/>}
            </div>
        </div>
        <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${selected ? 'border-indigo-500 bg-indigo-500' : 'border-slate-300 dark:border-slate-600'}`}>
            {selected && <Check className="w-3 h-3 text-white" />}
        </div>
    </div>
);

export default PaymentModal;
