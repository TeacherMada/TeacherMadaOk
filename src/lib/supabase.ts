
import { createClient } from '@supabase/supabase-js';

// Utilisation des clés fournies directement pour garantir le fonctionnement immédiat
const SUPABASE_URL = (import.meta as any).env.VITE_SUPABASE_URL || 'https://parlmoragdqyrfzhdyqr.supabase.co';
const SUPABASE_ANON_KEY = (import.meta as any).env.VITE_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBhcmxtb3JhZ2RxeXJmemhkeXFyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njk0NzEzNjMsImV4cCI6MjA4NTA0NzM2M30.H_FE6XE3VzAUuQjoRthwkCGYLDw8aAXUxLYrpXES8pE';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
