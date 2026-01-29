import { createClient } from '@supabase/supabase-js';

// En Vite, on utilise import.meta.env.VITE_...
// Si les variables ne sont pas définies, on met une chaîne vide pour éviter le crash immédiat, 
// mais l'app affichera une erreur de connexion plus tard.

// Fix: Cast import.meta to any to avoid TypeScript error 'Property env does not exist on type ImportMeta'
const SUPABASE_URL = (import.meta as any).env.VITE_SUPABASE_URL || '';
// Fix: Cast import.meta to any to avoid TypeScript error 'Property env does not exist on type ImportMeta'
const SUPABASE_ANON_KEY = (import.meta as any).env.VITE_SUPABASE_ANON_KEY || '';

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.error("ERREUR CRITIQUE: Les clés Supabase sont manquantes dans le fichier .env ou la config Render.");
}

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);