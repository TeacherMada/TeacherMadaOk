
import { createClient } from '@supabase/supabase-js';

// Récupération sécurisée des variables d'environnement
const getEnvVar = (key: string) => {
    // @ts-ignore
    if (typeof import.meta !== 'undefined' && import.meta.env) {
        // @ts-ignore
        return import.meta.env[key] || '';
    }
    // Fallback pour process.env si nécessaire
    return process.env[key] || '';
};

const supabaseUrl = getEnvVar('VITE_SUPABASE_URL');
const supabaseAnonKey = getEnvVar('VITE_SUPABASE_ANON_KEY');

const isConfigured = supabaseUrl && supabaseAnonKey && supabaseUrl !== '' && supabaseAnonKey !== '';

if (!isConfigured) {
    console.warn("⚠️ CONFIGURATION SUPABASE MANQUANTE : L'application passera en mode local uniquement.");
    console.log("Assurez-vous d'avoir un fichier .env avec VITE_SUPABASE_URL et VITE_SUPABASE_ANON_KEY");
}

// On crée le client même s'il manque des clés pour éviter un crash au démarrage,
// mais les appels échoueront et seront gérés par storageService.
export const supabase = createClient(
    supabaseUrl || 'https://placeholder.supabase.co', 
    supabaseAnonKey || 'placeholder'
);

export const isSupabaseConfigured = () => isConfigured;
