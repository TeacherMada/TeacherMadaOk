
# 🎓 TeacherMada - Plateforme d'Apprentissage de Langues par IA

![TeacherMada Logo](/logo.png)

> **TeacherMada** est une application éducative innovante qui utilise l'Intelligence Artificielle (Google Gemini) pour offrir un tuteur de langue personnel, patient et disponible 24/7. Conçue pour le contexte Malagasy, elle intègre un système de crédits, des cours structurés et des appels vocaux réalistes.

---

## 🏗️ Architecture Technique

Le projet utilise une architecture moderne et sécurisée, séparant le Frontend (Interface) du Backend (Logique & Sécurité).

### 1. Frontend (Interface Utilisateur)
*   **Framework** : React (Vite) + TypeScript
*   **Styling** : TailwindCSS
*   **Auth & Data** : Supabase Client (Connexion directe pour lecture profil)
*   **Hébergement** : Render Static Site

### 2. Backend (API & Sécurité)
*   **Serveur** : Node.js + Express
*   **Rôle** : 
    *   Protège la clé API Google Gemini (ne jamais l'exposer au front).
    *   Gère la logique de paiement/crédits (Vérification côté serveur).
    *   Orchestre les appels IA complexes.
*   **Hébergement** : Render Web Service

### 3. Base de Données & Auth
*   **Service** : Supabase (PostgreSQL)
*   **Rôle** : Stockage des utilisateurs, historique de chat, transactions et authentification.

---

## 🚀 Installation Locale (Pour le développement)

### Pré-requis
1.  **Node.js** (v18 ou plus) installé.
2.  Un compte **Supabase** (gratuit).
3.  Une clé API **Google Gemini** (via Google AI Studio).

### Étape 1 : Configuration Supabase
1.  Créez un nouveau projet sur [Supabase](https://supabase.com).
2.  Allez dans **SQL Editor** et exécutez le script suivant pour créer les tables :

```sql
-- TABLES
create table profiles (
  id uuid references auth.users not null primary key,
  username text unique,
  email text,
  role text default 'user', -- 'user' ou 'admin'
  credits int default 2,
  xp int default 0,
  streak int default 0,
  lessons_completed int default 0,
  preferences jsonb,
  is_suspended boolean default false,
  created_at timestamp with time zone default timezone('utc'::text, now())
);

create table chat_history (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references profiles(id),
  role text,
  text text,
  timestamp bigint
);

create table admin_requests (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references profiles(id),
  username text,
  type text,
  amount int,
  message text,
  status text default 'pending',
  created_at timestamp with time zone default timezone('utc'::text, now())
);

-- SECURITÉ (RLS)
alter table profiles enable row level security;
alter table chat_history enable row level security;
alter table admin_requests enable row level security;

create policy "Users can see own profile" on profiles for select using (auth.uid() = id);
create policy "Users can see own history" on chat_history for select using (auth.uid() = user_id);
create policy "Users can insert own requests" on admin_requests for insert with check (auth.uid() = user_id);
create policy "Users can read own requests" on admin_requests for select using (auth.uid() = user_id);

-- TRIGGER AUTH (Création auto profil)
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, email, username)
  values (new.id, new.email, new.raw_user_meta_data->>'username');
  return new;
end;
$$ language plpgsql security definer;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();
```

### Étape 2 : Lancer le Backend
1.  Ouvrez un terminal dans le dossier `backend`.
2.  Installez les dépendances : `npm install`
3.  Créez un fichier `.env` dans `backend/` :
    ```env
    PORT=3000
    SUPABASE_URL=https://votre-projet.supabase.co
    SUPABASE_SERVICE_ROLE_KEY=votre-cle-service-role-supabase-super-secrete
    GOOGLE_API_KEY=votre-cle-google-gemini
    ```
    *(Note : La `SERVICE_ROLE_KEY` se trouve dans Supabase > Settings > API. Elle donne les droits admin au serveur backend).*
4.  Lancez le serveur : `npm run dev`

### Étape 3 : Lancer le Frontend
1.  Ouvrez un terminal à la racine du projet.
2.  Installez les dépendances : `npm install`
3.  Créez un fichier `.env` à la racine :
    ```env
    REACT_APP_SUPABASE_URL=https://votre-projet.supabase.co
    REACT_APP_SUPABASE_ANON_KEY=votre-cle-publique-anon
    ```
4.  Lancez l'app : `npm start` (ou `npm run dev` selon votre setup Vite).

---

## ☁️ Guide de Déploiement sur Render (Gratuit)

Vous allez déployer deux services distincts sur Render : un **Web Service** (Backend) et un **Static Site** (Frontend).

### Partie A : Déployer le Backend (Node.js)

1.  Poussez votre code sur GitHub/GitLab.
2.  Allez sur [Render Dashboard](https://dashboard.render.com/) > **New +** > **Web Service**.
3.  Connectez votre repo GitHub.
4.  **Configuration** :
    *   **Name** : `teachermada-api`
    *   **Root Directory** : `backend` (Important !)
    *   **Environment** : `Node`
    *   **Build Command** : `npm install`
    *   **Start Command** : `node server.js`
5.  **Environment Variables** (Ajoutez-les dans la section Advanced) :
    *   `NODE_VERSION` : `20.11.0` (Ajoutez cette variable pour forcer une version récente de Node)
    *   `SUPABASE_URL` : Votre URL Supabase.
    *   `SUPABASE_SERVICE_ROLE_KEY` : Votre clé secrète Supabase.
    *   `GOOGLE_API_KEY` : Votre clé API Gemini.
6.  Cliquez sur **Create Web Service**.
7.  Une fois déployé, copiez l'URL du service (ex: `https://teachermada-api.onrender.com`).

### Partie B : Déployer le Frontend (React)

1.  Dans votre code Frontend (`src/services/storageService.ts`), mettez à jour la constante `API_URL` avec l'URL de votre backend Render que vous venez de copier.
    *   *Astuce Pro* : Utilisez une variable d'environnement pour ça aussi si possible, ou changez le code avant de push.
2.  Allez sur Render > **New +** > **Static Site**.
3.  Connectez le même repo GitHub.
4.  **Configuration** :
    *   **Name** : `teachermada-app`
    *   **Root Directory** : `.` (laisser vide ou point)
    *   **Build Command** : `npm install && npm run build`
    *   **Publish Directory** : `dist` (si Vite) ou `build` (si Create-React-App).
5.  **Environment Variables** :
    *   `REACT_APP_SUPABASE_URL`
    *   `REACT_APP_SUPABASE_ANON_KEY`
6.  **Rewrite Rules** (Important pour React Router) :
    *   Allez dans l'onglet "Redirects/Rewrites".
    *   Ajoutez une règle : Source `/*`, Destination `/index.html`, Action `Rewrite`.
7.  Cliquez sur **Create Static Site**.

🎉 **Félicitations !** Votre application est en ligne, sécurisée et prête pour les étudiants.

---

## 🛡️ Administration & Sécurité

*   **Compte Admin** : Le système génère un compte admin par défaut (voir `storageService.seedAdmin`). Vous pouvez aussi changer le rôle d'un utilisateur en 'admin' directement dans la table `profiles` de Supabase.
*   **Paiements** : Les demandes de crédits arrivent dans le Dashboard Admin. Vérifiez la réception Mobile Money avant de valider.
*   **Sécurité API** : La clé Gemini est cachée dans le backend. Le frontend ne peut pas l'exposer.

## 📞 Support

Pour toute question technique ou demande de crédits :
*   **Telma** : 034 93 102 68
*   **Airtel** : 033 38 784 20
*   **Orange** : 032 69 790 17

*Développé avec ❤️ pour l'éducation à Madagascar.*
