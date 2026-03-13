
import React, { useState } from 'react';
import { UserProfile } from '../../../types';
import { SmartExam, ExamResultDetailed, ExamType } from '../types';
import { SmartExamService, COST_DIAGNOSTIC, COST_CERTIFICATION } from '../SmartExamService';
import { Loader2, ShieldCheck, FileText, AlertTriangle, CheckCircle, XCircle, Clock, Award } from 'lucide-react';
import ExamRunner from './ExamRunner';
import ExamResult from './ExamResult';

interface Props {
    user: UserProfile;
    onClose: () => void;
    onUpdateUser: (u: UserProfile) => void;
    onShowPayment: () => void;
}

const ExamHub: React.FC<Props> = ({ user, onClose, onUpdateUser, onShowPayment }) => {
    if (!user) return null;
    const [view, setView] = useState<'hub' | 'runner' | 'result'>('hub');
    const [loading, setLoading] = useState(false);
    const [currentExam, setCurrentExam] = useState<SmartExam | null>(null);
    const [result, setResult] = useState<ExamResultDetailed | null>(null);

    const handleStart = async (type: ExamType) => {
        const cost = type === 'certification' ? COST_CERTIFICATION : COST_DIAGNOSTIC;
        
        if (user.credits < cost) {
            onShowPayment();
            return;
        }

        // Removed native confirm to avoid UI blocking issues, relying on explicit action
        
        setLoading(true);
        try {
            const exam = await SmartExamService.startExam(
                user.id, 
                type, 
                user.preferences?.level || 'A1', 
                user.preferences?.targetLanguage || 'Anglais'
            );
            
            if (exam && exam.sections && exam.sections.length > 0) {
                // Update local credits immediately
                onUpdateUser({ ...user, credits: user.credits - cost });
                setCurrentExam(exam);
                setView('runner');
            } else {
                alert("Erreur: Impossible de générer l'examen. Veuillez réessayer.");
            }
        } catch (e) {
            console.error(e);
            alert("Erreur de connexion au service d'examen.");
        } finally {
            setLoading(false);
        }
    };

    const handleFinishExam = async (answers: Record<string, string>) => {
        if (!currentExam) return;
        setLoading(true);
        try {
            const res = await SmartExamService.evaluateExam(currentExam, answers, user);
            setResult(res);
            setView('result');
        } catch (e) {
            alert("Erreur lors de la correction. Veuillez réessayer.");
        } finally {
            setLoading(false);
        }
    };

    if (loading) {
        return (
            <div className="fixed inset-0 z-[100] bg-white dark:bg-slate-950 flex flex-col items-center justify-center">
                <Loader2 className="w-12 h-12 text-indigo-600 animate-spin mb-4" />
                <p className="text-lg font-bold text-slate-700 dark:text-slate-300">TeacherMada travaille...</p>
                <p className="text-sm text-slate-500">Préparation de l'environnement d'examen sécurisé</p>
            </div>
        );
    }

    if (view === 'runner' && currentExam) {
        return <ExamRunner exam={currentExam} onFinish={handleFinishExam} onCancel={onClose} />;
    }

    if (view === 'result' && result) {
        return <ExamResult result={result} onClose={onClose} />;
    }

    return (
        <div className="fixed inset-0 z-[80] bg-slate-50 dark:bg-slate-950 overflow-y-auto animate-fade-in">
            <div className="max-w-4xl mx-auto p-6 min-h-screen flex flex-col">
                <div className="flex justify-between items-center mb-8">
                    <h1 className="text-2xl font-black text-slate-900 dark:text-white flex items-center gap-2">
                        <ShieldCheck className="w-8 h-8 text-indigo-600" />
                        Centre d'Examen
                    </h1>
                    <button onClick={onClose} className="p-2 bg-slate-200 dark:bg-slate-800 rounded-full hover:bg-slate-300 transition-colors">
                        <XCircle className="w-6 h-6 text-slate-500" />
                    </button>
                </div>

                <div className="grid md:grid-cols-2 gap-6">
                    {/* Diagnostic Card */}
                    <div className="bg-white dark:bg-slate-900 rounded-3xl p-8 border-2 border-slate-100 dark:border-slate-800 hover:border-indigo-200 dark:hover:border-indigo-900 transition-all shadow-lg group relative overflow-hidden">
                        <div className="absolute top-0 right-0 bg-indigo-100 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300 text-xs font-bold px-3 py-1 rounded-bl-xl">
                            RECOMMANDÉ
                        </div>
                        <div className="w-16 h-16 bg-indigo-50 dark:bg-indigo-900/20 rounded-2xl flex items-center justify-center mb-6 text-indigo-600">
                            <FileText className="w-8 h-8" />
                        </div>
                        <h2 className="text-xl font-bold text-slate-900 dark:text-white mb-2">Diagnostic Complet</h2>
                        <p className="text-slate-500 dark:text-slate-400 text-sm mb-6 leading-relaxed">
                            Évaluez précisément votre niveau réel (CEFR) sans pression. Idéal pour connaître vos points forts et faibles.
                        </p>
                        <ul className="space-y-2 mb-8 text-sm text-slate-600 dark:text-slate-300">
                            <li className="flex items-center gap-2"><CheckCircle className="w-4 h-4 text-emerald-500"/> Analyse détaillée</li>
                            <li className="flex items-center gap-2"><CheckCircle className="w-4 h-4 text-emerald-500"/> Pas de certificat</li>
                            <li className="flex items-center gap-2"><CheckCircle className="w-4 h-4 text-emerald-500"/> Durée ~15 min</li>
                        </ul>
                        <button onClick={() => handleStart('diagnostic')} className="w-full py-4 bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-white font-bold rounded-xl hover:bg-indigo-600 hover:text-white transition-all flex items-center justify-center gap-2">
                            Commencer ({COST_DIAGNOSTIC} Crédits)
                        </button>
                    </div>

                    {/* Certification Card */}
                    <div className="bg-gradient-to-br from-slate-900 to-slate-800 dark:from-[#0F1422] dark:to-[#1E293B] rounded-3xl p-8 border-2 border-slate-700 shadow-xl text-white relative overflow-hidden group">
                        <div className="absolute -right-10 -top-10 w-40 h-40 bg-indigo-500/20 rounded-full blur-3xl group-hover:bg-indigo-500/30 transition-colors"></div>
                        
                        <div className="w-16 h-16 bg-white/10 rounded-2xl flex items-center justify-center mb-6 text-yellow-400 backdrop-blur-sm border border-white/10">
                            <Award className="w-8 h-8" />
                        </div>
                        <h2 className="text-xl font-bold mb-2">Certification Officielle</h2>
                        <p className="text-slate-300 text-sm mb-6 leading-relaxed">
                            Passez l'examen final pour valider votre niveau {user.preferences?.level}. Certificat professionnel vérifiable inclus si réussite.
                        </p>
                        <ul className="space-y-2 mb-8 text-sm text-slate-300">
                            <li className="flex items-center gap-2"><CheckCircle className="w-4 h-4 text-yellow-400"/> Certificat PDF + QR Code</li>
                            <li className="flex items-center gap-2"><CheckCircle className="w-4 h-4 text-yellow-400"/> Vérification Blockchain (Hash)</li>
                            <li className="flex items-center gap-2"><CheckCircle className="w-4 h-4 text-yellow-400"/> Seuil de réussite 70%</li>
                        </ul>
                        <button onClick={() => handleStart('certification')} className="w-full py-4 bg-gradient-to-r from-indigo-600 to-purple-600 text-white font-bold rounded-xl hover:shadow-lg hover:scale-[1.02] transition-all flex items-center justify-center gap-2 border border-white/10">
                            Passer l'Examen ({COST_CERTIFICATION} Crédits)
                        </button>
                    </div>
                </div>

                <div className="mt-8 p-4 bg-amber-50 dark:bg-amber-900/10 border border-amber-100 dark:border-amber-900/30 rounded-xl flex items-start gap-3">
                    <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                    <p className="text-xs text-amber-800 dark:text-amber-200">
                        <strong>Note importante :</strong> Assurez-vous d'avoir une connexion stable. Tout abandon en cours d'examen ne donne pas lieu à un remboursement des crédits. Le certificat n'est délivré que si le score est supérieur au seuil requis.
                    </p>
                </div>
            </div>
        </div>
    );
};

export default ExamHub;
