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
                    {type === 'privacy' ? 'Confidentialité des Données' : 'Conditions Générales de Service'}
                </h2>
            </div>
            <button onClick={onClose} className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-full transition-colors">
                <X className="w-6 h-6 text-slate-500" />
            </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 md:p-8 text-sm text-slate-600 dark:text-slate-300 leading-relaxed space-y-6 font-medium">
            {type === 'privacy' ? (
                <>
                    <p><strong>Engagement de confidentialité - TeacherMada Education</strong></p>
                    <p>Votre apprentissage est personnel. Nous nous engageons à protéger vos informations avec les standards de sécurité les plus élevés.</p>
                    
                    <h3 className="text-lg font-bold text-slate-900 dark:text-white mt-4">1. Données Apprenant</h3>
                    <p>Nous collectons uniquement les données nécessaires à votre progression pédagogique :</p>
                    <ul className="list-disc pl-5 space-y-1">
                        <li>Identifiants de connexion sécurisés (cryptés).</li>
                        <li>Statistiques d'apprentissage et historique des leçons pour personnaliser le cursus.</li>
                    </ul>

                    <h3 className="text-lg font-bold text-slate-900 dark:text-white mt-4">2. Technologie Pédagogique</h3>
                    <p>Vos exercices oraux et écrits sont traités par notre <strong>Moteur d'Analyse Linguistique Avancé</strong>. Ce système propriétaire permet une correction instantanée et naturelle, simulant un professeur natif expert. Vos échanges servent uniquement à générer des corrections en temps réel et ne sont pas vendus à des tiers.</p>

                    <h3 className="text-lg font-bold text-slate-900 dark:text-white mt-4">3. Sécurité</h3>
                    <p>Toutes les données transitent via des protocoles cryptés (SSL/TLS). Nos serveurs sont situés dans des environnements cloud sécurisés et conformes aux normes internationales.</p>
                </>
            ) : (
                <>
                    <p><strong>Conditions Générales d'Utilisation - Plateforme TeacherMada</strong></p>
                    
                    <h3 className="text-lg font-bold text-slate-900 dark:text-white mt-4">1. Accès au Service</h3>
                    <p>TeacherMada est une plateforme d'excellence linguistique. L'accès est personnel et incessible. Tout partage de compte peut entraîner une suspension temporaire pour des raisons de sécurité.</p>

                    <h3 className="text-lg font-bold text-slate-900 dark:text-white mt-4">2. Système de Crédits</h3>
                    <p>L'accès aux fonctionnalités avancées (Correction vocale, Cours personnalisés) nécessite des crédits. L'acquisition de crédits via Mobile Money est une transaction définitive garantissant l'accès immédiat aux ressources pédagogiques premium.</p>

                    <h3 className="text-lg font-bold text-slate-900 dark:text-white mt-4">3. Code de Conduite</h3>
                    <p>Les utilisateurs s'engagent à utiliser le Professeur Digital de manière respectueuse. La plateforme est un espace d'apprentissage bienveillant ; tout contenu inapproprié sera automatiquement filtré par nos systèmes de modération.</p>

                    <h3 className="text-lg font-bold text-slate-900 dark:text-white mt-4">4. Disponibilité</h3>
                    <p>Nous garantissons une disponibilité maximale du service pour assurer votre continuité pédagogique, sauf cas de force majeure ou maintenance technique programmée.</p>
                </>
            )}
        </div>

        {/* Footer */}
        <div className="p-6 border-t border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/50">
            <button onClick={onClose} className="w-full py-4 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl transition-all">
                Accepter et Fermer
            </button>
        </div>
      </div>
    </div>
  );
};

export default LegalModal;