
import React from 'react';
import { ExamResultDetailed } from '../types';
import { CheckCircle, Share2, Download, X } from 'lucide-react';

interface Props {
    result: ExamResultDetailed;
    onClose: () => void;
}

const CertificateView: React.FC<Props> = ({ result, onClose }) => {
    return (
        <div className="fixed inset-0 z-[100] bg-slate-900/90 backdrop-blur-md flex items-center justify-center p-4 overflow-y-auto">
            <div className="relative w-full max-w-4xl bg-white text-slate-900 p-10 md:p-16 shadow-2xl rounded-sm border-[16px] border-double border-slate-200">
                <button onClick={onClose} className="absolute top-4 right-4 p-2 bg-slate-100 rounded-full hover:bg-slate-200">
                    <X className="w-6 h-6" />
                </button>

                {/* Watermark */}
                <div className="absolute inset-0 flex items-center justify-center opacity-[0.03] pointer-events-none">
                    <img src="https://i.ibb.co/B2XmRwmJ/logo.png" className="w-[500px] h-[500px]" />
                </div>

                {/* Content */}
                <div className="relative z-10 text-center">
                    <div className="flex justify-center mb-8">
                        <div className="flex items-center gap-3 text-slate-900">
                            <img src="https://i.ibb.co/B2XmRwmJ/logo.png" className="w-12 h-12" />
                            <span className="text-xl font-serif font-bold tracking-widest">TEACHERMADA</span>
                        </div>
                    </div>

                    <h1 className="text-5xl md:text-6xl font-serif font-bold text-slate-900 mb-4 uppercase tracking-tighter">Certificat de Réussite</h1>
                    <p className="text-xl text-slate-500 font-serif italic mb-12">Ce document atteste que</p>

                    <h2 className="text-4xl md:text-5xl font-black text-indigo-900 mb-8 font-sans uppercase tracking-wide border-b-2 border-slate-200 inline-block pb-4 px-8">
                        {/* User Name would be here, fetched from context or props if available in result */}
                        ÉTUDIANT CERTIFIÉ
                    </h2>

                    <p className="text-xl text-slate-600 mb-8 max-w-2xl mx-auto leading-relaxed">
                        a validé avec succès l'examen de certification pour le niveau
                    </p>

                    <div className="text-6xl font-black text-emerald-600 mb-12 font-serif">
                        {result.detectedLevel}
                    </div>

                    <div className="grid grid-cols-2 gap-12 max-w-2xl mx-auto mb-16 text-left">
                        <div>
                            <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">Compétences</p>
                            <ul className="text-sm font-medium text-slate-700 space-y-1">
                                <li className="flex justify-between"><span>Compréhension Écrite</span> <span>{result.skillScores.reading}%</span></li>
                                <li className="flex justify-between"><span>Expression Écrite</span> <span>{result.skillScores.writing}%</span></li>
                                <li className="flex justify-between"><span>Compréhension Orale</span> <span>{result.skillScores.listening}%</span></li>
                                <li className="flex justify-between"><span>Expression Orale</span> <span>{result.skillScores.speaking}%</span></li>
                            </ul>
                        </div>
                        <div className="flex flex-col justify-end">
                            <div className="border-t border-slate-900 pt-4">
                                <img src="https://upload.wikimedia.org/wikipedia/commons/e/e4/Signature_sample.svg" className="h-8 mb-2 opacity-50" />
                                <p className="text-xs font-bold text-slate-900 uppercase">Directeur Pédagogique</p>
                                <p className="text-[10px] text-slate-500">TeacherMada Institute</p>
                            </div>
                        </div>
                    </div>

                    {/* Footer */}
                    <div className="flex items-center justify-between border-t border-slate-200 pt-6">
                        <div className="text-left">
                            <p className="text-[10px] text-slate-400 font-mono">ID: {result.certificateId}</p>
                            <p className="text-[10px] text-slate-400 font-mono">Date: {new Date(result.date).toLocaleDateString()}</p>
                        </div>
                        <div className="bg-white p-1 border border-slate-200">
                            {/* Placeholder QR */}
                            <div className="w-16 h-16 bg-slate-900 flex items-center justify-center text-white text-[8px] text-center">
                                QR CODE<br/>VERIFICATION
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default CertificateView;
