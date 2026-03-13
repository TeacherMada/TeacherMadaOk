import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3'

// ==============================================================================
// TEACHERMADA - SUPABASE EDGE FUNCTION (PROXY GEMINI)
// ==============================================================================
// Cette fonction sert de proxy sécurisé entre le frontend et l'API Gemini.
// Elle récupère les clés API stockées dans la table `system_settings` de Supabase,
// effectue la rotation des clés en backend, et masque les clés au client.
// ==============================================================================

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  // Gestion du preflight CORS
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // 1. Vérification de l'authentification (Sécurité)
    const authHeader = req.headers.get('Authorization')!
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: authHeader } } }
    )

    const { data: { user }, error: userError } = await supabaseClient.auth.getUser()
    if (userError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // 2. Récupération des clés API depuis la base de données (system_settings)
    // Seul le backend peut lire ces clés de manière sécurisée sans les exposer au client
    const { data: settings, error: settingsError } = await supabaseClient
      .from('system_settings')
      .select('api_keys, active_model')
      .single()

    if (settingsError || !settings || !settings.api_keys || settings.api_keys.length === 0) {
      return new Response(JSON.stringify({ error: 'No API keys configured in system_settings' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const apiKeys = settings.api_keys;
    const body = await req.json();
    const { contents, config, model } = body;
    const targetModel = model || settings.active_model || 'gemini-3.1-pro-preview';

    // 3. Rotation des clés API (Backend-side)
    let lastError = null;
    for (const apiKey of apiKeys) {
      try {
        // Appel à l'API Google Gemini
        const geminiResponse = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${targetModel}:generateContent?key=${apiKey}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ contents, ...config })
        });

        if (!geminiResponse.ok) {
          const errorData = await geminiResponse.json();
          // Si c'est une erreur de quota (429), on passe à la clé suivante
          if (geminiResponse.status === 429) {
             lastError = errorData;
             continue;
          }
          throw new Error(errorData.error?.message || 'Gemini API Error');
        }

        const data = await geminiResponse.json();
        
        // 4. Retourner la réponse au client (Succès)
        return new Response(JSON.stringify(data), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })

      } catch (e) {
        lastError = e;
        continue; // Essayer la clé suivante
      }
    }

    // Si toutes les clés ont échoué
    return new Response(JSON.stringify({ error: 'All API keys exhausted or failed', details: lastError }), {
      status: 503,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })

  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
