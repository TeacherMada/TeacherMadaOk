
import React, { useState, useEffect } from 'react';
import { SmartExam } from '../types';
import { Clock, ArrowRight, CheckCircle, AlertCircle } from 'lucide-react';

interface Props {
    exam: SmartExam;
    onFinish: (answers: Record<string, string>) => void;
    onCancel: () => void;
}

const ExamRunner: React.FC<Props> = ({ exam, onFinish, onCancel }) => {
    const [currentSectionIndex, setCurrentSectionIndex] = useState(0);
    const [answers, setAnswers] = useState<Record<string, string>>({});
    const [timeLeft, setTimeLeft] = useState(exam.totalQuestions * 3 * 60); // 3 min per question approx

    const currentSection = exam.sections[currentSectionIndex];
    const progress = ((currentSectionIndex) / exam.sections.length) * 100;

    useEffect(() => {
        const timer = setInterval(() => {
            setTimeLeft(prev => {
                if (prev <= 1) {
                    clearInterval(timer);
                    handleSubmit(); // Auto submit
                    return 0;
                }
                return prev - 1;
            });
        }, 1000);
        return () => clearInterval(timer);
    }, []);

    const handleAnswer = (val: string) => {
        setAnswers(prev => ({ ...prev, [currentSection.id]: val }));
    };

    const handleNext = () => {
        if (currentSectionIndex < exam.sections.length - 1) {
            setCurrentSectionIndex(prev => prev + 1);
        } else {
            handleSubmit();
        }
    };

    const handleSubmit = () => {
        onFinish(answers);
    };

    const formatTime = (seconds: number) => {
        const m = Math.floor(seconds / 60);
        const s = seconds % 60;
        return `${m}:${s.toString().padStart(2, '0')}`;
    };

    return (
        <div className="fixed inset-0 z-[90] bg-white dark:bg-slate-950 flex flex-col">
            {/* Header */}
            <div className="h-16 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between px-6 bg-slate-50 dark:bg-slate-900">
                <div className="flex items-center gap-4">
                    <span className="text-sm font-bold text-slate-500 uppercase tracking-wider">Question {currentSectionIndex + 1}/{exam.sections.length}</span>
                    <div className={`flex items-center gap-2 px-3 py-1 rounded-full font-mono font-bold text-sm ${timeLeft < 60 ? 'bg-red-100 text-red-600' : 'bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300'}`}>
                        <Clock className="w-4 h-4" />
                        {formatTime(timeLeft)}
                    </div>
                </div>
                <div className="w-1/3 h-2 bg-slate-200 dark:bg-slate-800 rounded-full overflow-hidden">
                    <div className="h-full bg-indigo-600 transition-all duration-500" style={{ width: `${progress}%` }}></div>
                </div>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto p-6 flex flex-col items-center justify-center max-w-3xl mx-auto w-full">
                <div className="w-full animate-slide-up">
                    <div className="mb-8">
                        <span className="inline-block px-3 py-1 rounded-lg bg-indigo-100 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300 text-xs font-bold uppercase mb-4">
                            {currentSection.type === 'qcm' ? 'Compréhension' : currentSection.type === 'writing' ? 'Expression Écrite' : 'Expression Orale'}
                        </span>
                        <h2 className="text-2xl font-bold text-slate-900 dark:text-white leading-relaxed">
                            {currentSection.question}
                        </h2>
                    </div>

                    {currentSection.type === 'qcm' && (
                        <div className="space-y-3">
                            {currentSection.options?.map((opt, idx) => (
                                <button
                                    key={idx}
                                    onClick={() => handleAnswer(opt)}
                                    className={`w-full p-5 text-left rounded-xl border-2 transition-all ${
                                        answers[currentSection.id] === opt
                                        ? 'border-indigo-600 bg-indigo-50 dark:bg-indigo-900/20 text-indigo-800 dark:text-indigo-300 shadow-md'
                                        : 'border-slate-200 dark:border-slate-700 hover:border-indigo-300 dark:hover:border-indigo-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200'
                                    }`}
                                >
                                    <span className="font-bold mr-3">{String.fromCharCode(65 + idx)}.</span> {opt}
                                </button>
                            ))}
                        </div>
                    )}

                    {(currentSection.type === 'writing' || currentSection.type === 'speaking') && (
                        <div className="space-y-4">
                            <textarea
                                value={answers[currentSection.id] || ''}
                                onChange={(e) => handleAnswer(e.target.value)}
                                placeholder={currentSection.type === 'speaking' ? "Écrivez ce que vous diriez à l'oral..." : "Rédigez votre réponse ici..."}
                                className="w-full h-64 p-5 rounded-xl border-2 border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 focus:border-indigo-500 outline-none resize-none text-slate-800 dark:text-white leading-relaxed"
                            />
                            {currentSection.type === 'speaking' && (
                                <p className="text-xs text-slate-500 italic flex items-center gap-1">
                                    <AlertCircle className="w-3 h-3"/> Mode simulation : Transcrivez votre réponse orale.
                                </p>
                            )}
                        </div>
                    )}
                </div>
            </div>

            {/* Footer */}
            <div className="p-6 border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex justify-end">
                <button
                    onClick={handleNext}
                    disabled={!answers[currentSection.id]}
                    className="px-8 py-4 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold rounded-xl shadow-lg flex items-center gap-2 transition-all"
                >
                    {currentSectionIndex < exam.sections.length - 1 ? 'Suivant' : 'Terminer l\'examen'}
                    <ArrowRight className="w-5 h-5" />
                </button>
            </div>
        </div>
    );
};

export default ExamRunner;
