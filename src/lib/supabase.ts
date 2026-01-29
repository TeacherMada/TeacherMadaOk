import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

// Log pour le débogage en prod (visible dans la console du navigateur)
console.log("Supabase Init:", { 
  urlExists: !!SUPABASE_URL, 
  keyExists: !!SUPABASE_ANON_KEY 
});

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.error("ERREUR CRITIQUE: VITE_SUPABASE_URL ou VITE_SUPABASE_ANON_KEY manquant.");
}

// On exporte quand même le client pour éviter le crash total de l'import, 
// mais les appels échoueront si l'URL est vide.
export const supabase = createClient(
  SUPABASE_URL || 'https://placeholder.supabase.co', 
  SUPABASE_ANON_KEY || 'placeholder'
);
