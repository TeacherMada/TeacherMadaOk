
# 🎓 TeacherMada - Guide de Déploiement & Initialisation

Ce guide couvre le déploiement complet, l'initialisation de la base de données et les commandes manuelles pour valider la connexion entre le Frontend et le Backend.

---

## 🚀 État de l'Intégration (Architecture)

*   **Frontend** : React + Vite + Tailwind (Gère l'UI, l'IA Gemini via API, et le stockage local des conversations).
*   **Backend** : Node.js + Express (Gère la validation des paiements et l'administration sécurisée via Supabase Admin).
*   **Base de Données** : Supabase (PostgreSQL).

> **Note importante** : Par défaut, l'application Frontend est configurée pour fonctionner en mode "Hybride" (Auth simulée + Stockage Local) pour garantir une démonstration instantanée sans bloquer l'utilisateur. Le Backend est requis pour la synchronisation multi-appareils et la validation réelle des paiements.

---

## 🛠️ Étape 1 : Initialisation Base de Données (MANUEL REQUIS)

Pour que le backend fonctionne, vous devez créer les tables dans Supabase.
Allez dans **Supabase > SQL Editor**, cliquez sur **New Query**, collez le code ci-dessous et cliquez sur **RUN**.

```sql
-- 1. Activer les extensions
create extension if not exists "uuid-ossp";

-- 2. Table des Profils Utilisateurs (Liée à Supabase Auth si activé, ou gestion custom)
create table public.profiles (
  id text primary key, -- On utilise text pour supporter les IDs locaux ou UUID
  username text,
  email text,
  phone_number text,
  role text default 'user', -- 'user' ou 'admin'
  credits int default 0,
  is_suspended boolean default false,
  preferences jsonb,
  stats jsonb,
  created_at bigint,
  free_usage jsonb
);

-- 3. Table des Demandes Admin (Paiements, Messages)
create table public.admin_requests (
  id text primary key,
  user_id text references public.profiles(id),
  username text,
  type text, -- 'credit', 'message', 'password_reset'
  amount int,
  message text,
  contact_info text,
  status text default 'pending', -- 'pending', 'approved', 'rejected'
  created_at bigint
);

-- 4. Table d'Historique de Chat (Pour synchro future)
create table public.chat_history (
  id uuid default uuid_generate_v4() primary key,
  user_id text references public.profiles(id),
  role text,
  text text,
  timestamp bigint
);

-- 5. Activer la sécurité (RLS) - Optionnel pour le démarrage rapide mais recommandé
alter table profiles enable row level security;
create policy "Public profiles are viewable by everyone." on profiles for select using ( true );
```

---

## 💻 Étape 2 : Commandes Manuelles (Local)

Pour tester l'application sur votre machine avant de déployer.

### 1. Démarrer le Backend
Ouvrez un terminal dans le dossier racine :

```bash
cd backend
npm install
# Créez un fichier .env dans /backend avec :
# SUPABASE_URL=votre_url
# SUPABASE_SERVICE_ROLE_KEY=votre_cle_service_role
# GOOGLE_API_KEY=votre_cle_gemini
node server.js
```
*Le serveur démarrera sur le port 3000.*

### 2. Démarrer le Frontend
Ouvrez un **deuxième** terminal dans le dossier racine :

```bash
npm install
# Créez un fichier .env à la racine avec :
# VITE_SUPABASE_URL=votre_url
# VITE_SUPABASE_ANON_KEY=votre_cle_anon
# VITE_GOOGLE_API_KEY=votre_cle_gemini
# VITE_API_URL=http://localhost:3000
npm run dev
```
*L'application sera accessible sur `http://localhost:5173`.*

---

## ☁️ Étape 3 : Déploiement Production (Render)

### Backend (Web Service)
1.  Command de build : `npm install`
2.  Command de start : `node server.js`
3.  **Variables d'Env** : `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `GOOGLE_API_KEY`.

### Frontend (Static Site)
1.  Command de build : `npm install && npm run build`
2.  Dossier de publication : `dist`
3.  **Variables d'Env** : `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_GOOGLE_API_KEY`, `VITE_API_URL` (L'URL de votre backend Render).
4.  **Règle de Réécriture (Rewrite Rule)** :
    *   Source : `/*`
    *   Destination : `/index.html`
    *   Action : `Rewrite`

---

## ✅ Checklist de Validation

*   [ ] Le fichier `.env` du frontend contient `VITE_GOOGLE_API_KEY`.
*   [ ] Le fichier `.env` du backend contient `SUPABASE_SERVICE_ROLE_KEY`.
*   [ ] Les tables SQL ont été créées dans Supabase via l'éditeur SQL.
*   [ ] Le logo est présent dans `/public/logo.png`.

## 🎨 Personnalisation

*   **Logo** : Remplacez `/public/logo.png`.
*   **Nom** : Modifiez `metadata.json` et `index.html`.
*   **Couleurs** : `tailwind.config.js` (déjà configuré pour le thème Indigo/Slate).

