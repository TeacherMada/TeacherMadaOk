
import React from 'react';
import { X, Shield, FileText } from 'lucide-react';

interface LegalModalProps {
  type: 'privacy' | 'terms' | null;
  onClose: () => void;
}

const LegalModal: React.FC<LegalModalProps> = ({ type, onClose }) => {
  if (!type) return null;

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-slate-900/70 backdrop-blur-sm animate-fade-in">
      <div className="bg-white dark:bg-slate-900 w-full max-w-2xl max-h-[80vh] rounded-3xl shadow-2xl flex flex-col overflow-hidden relative">
        
        {/* Header */}
        <div className="p-6 border-b border-slate-100 dark:border-slate-800 flex justify-between items-center bg-white dark:bg-slate-900 z-10">
            <div className="flex items-center gap-3">
                <div className={`p-2 rounded-xl ${type === 'privacy' ? 'bg-emerald-100 text-emerald-600' : 'bg-blue-100 text-blue-600'}`}>
                    {type === 'privacy' ? <Shield className="w-6 h-6"/> : <FileText className="w-6 h-6"/>}
                </div>
                <h2 className="text-xl font-black text-slate-900 dark:text-white">
                    {type === 'privacy' ? 'Politique de Confidentialité' : 'Conditions d\'Utilisation'}
                </h2>
            </div>
            <button onClick={onClose} className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-full transition-colors">
                <X className="w-6 h-6 text-slate-500" />
            </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 md:p-8 text-sm text-slate-600 dark:text-slate-300 leading-relaxed space-y-6">
            {type === 'privacy' ? (
                <>
                    <p><strong>Dernière mise à jour : {new Date().toLocaleDateString()}</strong></p>
                    <p>Chez TeacherMada, la confidentialité de vos données est notre priorité. Cette politique décrit comment nous traitons vos informations.</p>
                    
                    <h3 className="text-lg font-bold text-slate-900 dark:text-white mt-4">1. Données collectées</h3>
                    <ul className="list-disc pl-5 space-y-1">
                        <li>Informations de compte (Nom d'utilisateur, email, mot de passe hashé).</li>
                        <li>Données d'apprentissage (Progression, vocabulaire, historique de chat).</li>
                        <li>Données techniques (Type d'appareil pour l'optimisation).</li>
                    </ul>

                    <h3 className="text-lg font-bold text-slate-900 dark:text-white mt-4">2. Utilisation de l'IA</h3>
                    <p>Vos conversations sont traitées par Google Gemini API pour générer des réponses. Ces données ne sont pas utilisées par Google pour entraîner leurs modèles publics via notre API (selon les CGU Enterprise de Google Cloud), mais nous vous conseillons de ne jamais partager d'informations personnelles sensibles (bancaires, santé) dans le chat.</p>

                    <h3 className="text-lg font-bold text-slate-900 dark:text-white mt-4">3. Stockage</h3>
                    <p>Vos données sont stockées de manière sécurisée via Supabase (hébergé sur AWS). Les mots de passe sont cryptés. Nous ne vendons jamais vos données à des tiers.</p>
                </>
            ) : (
                <>
                    <p><strong>Bienvenue sur TeacherMada.</strong> En utilisant cette application, vous acceptez les conditions suivantes.</p>
                    
                    <h3 className="text-lg font-bold text-slate-900 dark:text-white mt-4">1. Usage Personnel</h3>
                    <p>Le compte est strictement personnel. Le partage de compte peut entraîner une suspension.</p>

                    <h3 className="text-lg font-bold text-slate-900 dark:text-white mt-4">2. Crédits et Paiements</h3>
                    <p>L'achat de crédits via Mobile Money est définitif. Les crédits permettent d'accéder aux fonctionnalités IA coûteuses. En cas de bug technique avéré, un remboursement sous forme de crédits sera effectué.</p>

                    <h3 className="text-lg font-bold text-slate-900 dark:text-white mt-4">3. Modération</h3>
                    <p>Tout propos haineux, raciste ou illégal généré volontairement envers l'IA ou stocké dans l'application entraînera la suppression immédiate du compte sans remboursement.</p>

                    <h3 className="text-lg font-bold text-slate-900 dark:text-white mt-4">4. Disponibilité</h3>
                    <p>L'application est fournie "telle quelle". Nous nous efforçons d'assurer une disponibilité 24/7 mais ne sommes pas responsables des pannes liées aux fournisseurs d'IA (Google) ou d'hébergement.</p>
                </>
            )}
        </div>

        {/* Footer */}
        <div className="p-6 border-t border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/50">
            <button onClick={onClose} className="w-full py-4 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl transition-all">
                J'ai compris
            </button>
        </div>
      </div>
    </div>
  );
};

export default LegalModal;
