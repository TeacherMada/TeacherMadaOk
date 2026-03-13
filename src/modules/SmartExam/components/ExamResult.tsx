
import React from 'react';
import { ExamResultDetailed } from '../types';
import { CheckCircle, XCircle, Download, Share2, Award, ChevronRight } from 'lucide-react';
import CertificateView from './Certificate';

interface Props {
    result: ExamResultDetailed;
    onClose: () => void;
}

const ExamResult: React.FC<Props> = ({ result, onClose }) => {
    const [showCert, setShowCert] = React.useState(false);

    if (showCert && result.certificateId) {
        return <CertificateView result={result} onClose={() => setShowCert(false)} />;
    }

    return (
        <div className="fixed inset-0 z-[90] bg-slate-50 dark:bg-slate-950 overflow-y-auto animate-fade-in">
            <div className="max-w-3xl mx-auto p-6 min-h-screen flex flex-col items-center justify-center">
                
                <div className="bg-white dark:bg-slate-900 rounded-[2rem] shadow-2xl overflow-hidden w-full border border-slate-200 dark:border-slate-800">
                    {/* Header Banner */}
                    <div className={`p-8 text-center ${result.passed ? 'bg-emerald-600' : 'bg-slate-800'}`}>
                        <div className="w-24 h-24 bg-white/20 rounded-full flex items-center justify-center mx-auto mb-4 backdrop-blur-sm">
                            {result.passed ? <Award className="w-12 h-12 text-white" /> : <XCircle className="w-12 h-12 text-white/80" />}
                        </div>
                        <h1 className="text-3xl font-black text-white mb-2">
                            {result.passed ? "Félicitations !" : "Examen Terminé"}
                        </h1>
                        <p className="text-white/80 font-medium">
                            {result.passed ? "Vous avez validé le niveau." : "Le niveau n'est pas encore atteint."}
                        </p>
                    </div>

                    {/* Scores */}
                    <div className="p-8">
                        <div className="flex justify-center mb-8">
                            <div className="text-center">
                                <div className="text-6xl font-black text-slate-900 dark:text-white mb-1">{Math.round(result.globalScore)}<span className="text-2xl text-slate-400">/100</span></div>
                                <div className="inline-block px-3 py-1 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 text-xs font-bold uppercase tracking-wider">
                                    Niveau Réel Détecté : {result.detectedLevel}
                                </div>
                            </div>
                        </div>

                        <div className="grid grid-cols-2 gap-4 mb-8">
                            {Object.entries(result.skillScores).map(([skill, score]) => (
                                <div key={skill} className="p-4 bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-slate-100 dark:border-slate-700">
                                    <div className="text-xs text-slate-400 uppercase font-bold mb-1">{skill}</div>
                                    <div className="text-xl font-black text-slate-800 dark:text-white">{score}%</div>
                                    <div className="h-1.5 bg-slate-200 dark:bg-slate-700 rounded-full mt-2 overflow-hidden">
                                        <div className="h-full bg-indigo-500" style={{ width: `${score}%` }}></div>
                                    </div>
                                </div>
                            ))}
                        </div>

                        <div className="bg-indigo-50 dark:bg-indigo-900/10 p-6 rounded-2xl border border-indigo-100 dark:border-indigo-900/30 mb-8">
                            <h3 className="text-sm font-bold text-indigo-800 dark:text-indigo-300 uppercase mb-2">Feedback du Professeur</h3>
                            <p className="text-slate-700 dark:text-slate-300 text-sm leading-relaxed italic">
                                "{result.feedback}"
                            </p>
                        </div>

                        <div className="flex flex-col gap-3">
                            {result.passed && result.certificateId && (
                                <button onClick={() => setShowCert(true)} className="w-full py-4 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl shadow-lg transition-all flex items-center justify-center gap-2">
                                    <Award className="w-5 h-5" /> Voir mon Certificat Officiel
                                </button>
                            )}
                            <button onClick={onClose} className="w-full py-4 bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-white font-bold rounded-xl hover:bg-slate-200 dark:hover:bg-slate-700 transition-all">
                                Retour au menu
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default ExamResult;
