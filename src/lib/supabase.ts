
import { createClient } from '@supabase/supabase-js';

// Remplacer ces valeurs par celles de votre projet Supabase (Settings -> API)
const SUPABASE_URL = process.env.REACT_APP_SUPABASE_URL || 'https://votre-projet.supabase.co';
const SUPABASE_ANON_KEY = process.env.REACT_APP_SUPABASE_ANON_KEY || 'votre-clé-publique-anon';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
