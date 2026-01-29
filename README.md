
# 🎓 TeacherMada - Plateforme d'Apprentissage Hybride (Cloud-Connected)

TeacherMada est une application d'apprentissage des langues assistée par IA.
Cette version est configurée en mode **Hybride Connecté**, utilisant Supabase comme source de vérité pour l'authentification et les données, tout en conservant une expérience utilisateur fluide.

---

## 🏗️ Architecture Technique

1.  **Frontend (React + Vite)** :
    *   Hébergé sur Render (Static Site).
    *   Communique directement avec Supabase pour synchroniser les profils et envoyer les demandes Admin.
    *   Gère l'IA via Google Gemini API.
2.  **Base de Données (Supabase)** :
    *   Stocke les profils utilisateurs (`profiles`).
    *   Gère les demandes de crédits/paiements (`admin_requests`).
    *   Authentification "Douce" (Pseudo/Pass stocké, synchronisé).

---

## 🛠️ Étape 1 : Initialisation Base de Données (OBLIGATOIRE)

Pour que l'application fonctionne en ligne, exécutez ce SQL dans votre projet Supabase (SQL Editor).

```sql
-- 1. Extensions
create extension if not exists "uuid-ossp";

-- 2. Table Profils (Source de vérité Utilisateurs)
create table if not exists public.profiles (
  id text primary key,
  username text,
  email text,
  phone_number text,
  password text, -- Hachage recommandé en prod réelle, ici texte pour mode "Simulé"
  role text default 'user',
  credits int default 0,
  is_suspended boolean default false,
  preferences jsonb,
  stats jsonb,
  free_usage jsonb,
  created_at bigint
);

-- 3. Table Demandes Admin (Paiements, Support)
create table if not exists public.admin_requests (
  id text primary key,
  user_id text,
  username text,
  type text, -- 'credit', 'message', 'password_reset'
  amount int,
  message text,
  contact_info text,
  status text default 'pending',
  created_at bigint
);

-- 4. Sécurité RLS (Ouverte pour le mode Hybride Demo)
alter table public.profiles enable row level security;
create policy "Public Access Profiles" on public.profiles for all using (true);

alter table public.admin_requests enable row level security;
create policy "Public Access Requests" on public.admin_requests for all using (true);
```

---

## 🚀 Déploiement Production (Render)

### Frontend (Static Site)
1.  **Build Command** : `npm install && npm run build`
2.  **Publish Directory** : `dist`
3.  **Variables d'Environnement** :
    *   `VITE_SUPABASE_URL` : Votre URL Supabase.
    *   `VITE_SUPABASE_ANON_KEY` : Votre clé publique Supabase.
    *   `VITE_GOOGLE_API_KEY` : Votre clé Gemini AI.
4.  **Rewrite Rule** :
    *   Source: `/*`
    *   Destination: `/index.html`
    *   Action: `Rewrite`

---

## ✅ Validation de la Connexion

1.  Lancez l'app.
2.  Créez un compte.
3.  Vérifiez dans Supabase > Table `profiles` si la ligne apparaît.
4.  Allez dans "Profil" > "Message Admin", envoyez une demande.
5.  Vérifiez dans Supabase > Table `admin_requests`.

*L'application est maintenant prête pour la production en ligne.*
