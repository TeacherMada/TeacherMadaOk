
import { createClient } from '@supabase/supabase-js';

// En production, ces variables DOIVENT être définies dans l'interface de Render/Vercel/Netlify.
// Ne jamais laisser de clés "en dur" dans le code pour la sécurité finale.

const supabaseUrl = (import.meta as any).env.VITE_SUPABASE_URL;
const supabaseAnonKey = (import.meta as any).env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
    console.warn("⚠️ ATTENTION: Les clés Supabase (VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY) sont manquantes.");
}

export const supabase = createClient(
    supabaseUrl || '', 
    supabaseAnonKey || ''
);
