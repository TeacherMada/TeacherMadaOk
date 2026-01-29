
# 🎓 TeacherMada - Plateforme d'Apprentissage Hybride

Bienvenue dans le guide technique de TeacherMada. Cette application est conçue pour fonctionner en mode **Hybride** (Authentification locale simulée + Backend de validation) afin de garantir une expérience fluide même avec une connectivité limitée, tout en permettant une gestion sécurisée des crédits via un Backend.

---

## 🏗️ Architecture Hybride

1.  **Frontend (React + Vite)** :
    *   Gère toute l'interface utilisateur, l'authentification locale (stockage navigateur), et l'interaction directe avec l'IA Gemini.
    *   **Pourquoi ?** Pour que l'élève puisse commencer à apprendre immédiatement sans attendre une validation serveur complexe.
2.  **Backend (Node.js + Supabase)** :
    *   Sert de "Source de Vérité" pour valider les paiements réels et synchroniser les données critiques si l'utilisateur change d'appareil.
    *   Gère le panneau administrateur sécurisé.

---

## 🛠️ Étape 1 : Initialisation Base de Données (OBLIGATOIRE)

Pour que le backend et le système de crédits fonctionnent, vous devez initialiser la structure de données dans Supabase.

1.  Connectez-vous à votre projet **Supabase**.
2.  Allez dans **SQL Editor**.
3.  Créez un **New Query**.
4.  Collez et exécutez le script suivant :

```sql
-- 1. Activation des extensions nécessaires
create extension if not exists "uuid-ossp";

-- 2. Table des Profils Utilisateurs
-- Cette table stocke les infos publiques et les crédits validés par l'admin
create table if not exists public.profiles (
  id text primary key, -- Peut être un UUID ou un identifiant local synchronisé
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

-- 3. Table des Demandes Administratives (Paiements, Support, Reset MDP)
create table if not exists public.admin_requests (
  id text primary key,
  user_id text, -- Référence libre pour supporter les utilisateurs non-sync
  username text,
  type text, -- 'credit', 'message', 'password_reset'
  amount int,
  message text,
  contact_info text,
  status text default 'pending', -- 'pending', 'approved', 'rejected'
  created_at bigint
);

-- 4. Table d'Historique de Chat (Pour sauvegarde cloud optionnelle)
create table if not exists public.chat_history (
  id uuid default uuid_generate_v4() primary key,
  user_id text,
  role text,
  text text,
  timestamp bigint
);

-- 5. Sécurité (Row Level Security) - Permettre l'accès public pour le mode Hybride
alter table public.profiles enable row level security;
create policy "Public profiles access" on public.profiles for select using (true);
create policy "Public profiles insert" on public.profiles for insert with check (true);
create policy "Public profiles update" on public.profiles for update using (true);

alter table public.admin_requests enable row level security;
create policy "Public requests access" on public.admin_requests for select using (true);
create policy "Public requests insert" on public.admin_requests for insert with check (true);
create policy "Public requests update" on public.admin_requests for update using (true);
```

---

## 💻 Étape 2 : Commandes Manuelles (Local & Prod)

### 1. Démarrer le Backend (API & Admin Logic)
Dans un terminal, naviguez vers le dossier `backend` :

```bash
cd backend
npm install
# Créez un fichier .env avec :
# SUPABASE_URL=votre_url_supabase
# SUPABASE_SERVICE_ROLE_KEY=votre_cle_secrete_service_role
# GOOGLE_API_KEY=votre_cle_gemini
node server.js
```
*Le serveur écoutera sur le port défini (ex: 3000).*

### 2. Démarrer le Frontend (App Client)
Dans un **autre** terminal, à la racine du projet :

```bash
npm install
# Créez un fichier .env à la racine avec :
# VITE_SUPABASE_URL=votre_url_supabase
# VITE_SUPABASE_ANON_KEY=votre_cle_publique_anon
# VITE_GOOGLE_API_KEY=votre_cle_gemini
# VITE_API_URL=http://localhost:3000 (ou l'URL de production Render)
npm run dev
```
*L'application sera accessible sur `http://localhost:5173`.*

---

## ✅ Checklist de Validation (Connexion Frontend/Backend)

Pour vous assurer que tout communique correctement :

*   [ ] **Base de Données** : Les tables `profiles` et `admin_requests` existent dans Supabase.
*   [ ] **Env Variables** :
    *   Frontend : `VITE_API_URL` pointe vers le bon backend.
    *   Backend : `SUPABASE_SERVICE_ROLE_KEY` est défini (nécessaire pour écrire les crédits).
*   [ ] **Test Admin** :
    1.  Ouvrez l'app (Frontend).
    2.  Allez dans "Profil" -> "Message Direct Admin".
    3.  Envoyez une demande.
    4.  Vérifiez dans la table Supabase `admin_requests` si une nouvelle ligne apparaît. Si oui, la connexion est valide.

## 🚀 Déploiement Production (Render.com)

1.  **Backend** : Déployez le dossier `/backend` comme un **Web Service**. Ajoutez les variables d'environnement (`SUPABASE_...`).
2.  **Frontend** : Déployez la racine comme un **Static Site**.
    *   Build Command: `npm install && npm run build`
    *   Publish Directory: `dist`
    *   Add Environment Variables: `VITE_API_URL` (URL de votre service backend Render), `VITE_GOOGLE_API_KEY`, etc.
    *   **Rewrite Rule** : Source `/*`, Destination `/index.html`, Action `Rewrite`.

---
*TeacherMada - L'excellence pédagogique accessible à tous.*
