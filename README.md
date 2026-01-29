
# 🎓 TeacherMada - Plateforme Hybride (Production Ready)

TeacherMada utilise une architecture **Serverless Hybride**. 
Le Frontend communique directement avec Supabase pour la gestion des utilisateurs (Auth custom) et des données, garantissant une réactivité maximale et une synchronisation en ligne.

---

## 🚀 État de la Connexion (Architecture)

1.  **Frontend (Vite + React)** : Gère l'UI et la logique d'appel IA (Gemini).
2.  **Base de Données (Supabase)** : Agit comme le véritable Backend pour :
    *   L'authentification (Table `profiles`).
    *   Les crédits et abonnements.
    *   Le panel Admin et les demandes de paiement.

---

## 🛠️ Étape 1 : Base de Données (Supabase)

Pour que le mode "En Ligne" fonctionne, exécutez ce script SQL dans l'éditeur SQL de Supabase.

```sql
-- 1. Table Profils (Auth & Données)
create table if not exists public.profiles (
  id text primary key,
  username text,
  email text,
  phone_number text,
  password text, -- Mode "Auth Simplifié"
  role text default 'user',
  credits int default 0,
  is_suspended boolean default false,
  preferences jsonb,
  stats jsonb,
  free_usage jsonb,
  ai_memory text,
  has_seen_tutorial boolean,
  created_at bigint,
  skills jsonb
);

-- 2. Table Demandes Admin
create table if not exists public.admin_requests (
  id text primary key,
  user_id text,
  username text,
  type text,
  amount int,
  message text,
  contact_info text,
  status text default 'pending',
  created_at bigint
);

-- 3. Sécurité (RLS - Ouvert pour le mode Hybride)
alter table public.profiles enable row level security;
create policy "Enable all access for all users" on public.profiles for all using (true);

alter table public.admin_requests enable row level security;
create policy "Enable all access for all users" on public.admin_requests for all using (true);
```

---

## ☁️ Étape 2 : Variables d'Environnement (Render / Vercel)

Dans les paramètres de votre hébergeur (Render > Environment), ajoutez :

| Clé | Valeur |
| :--- | :--- |
| `VITE_SUPABASE_URL` | Votre URL de projet Supabase (https://xyz.supabase.co) |
| `VITE_SUPABASE_ANON_KEY` | Votre clé publique (anon) Supabase |
| `VITE_GOOGLE_API_KEY` | Votre clé API Google Gemini |

---

## ✅ Comment vérifier la connexion ?

1.  **Test Auth** : Créez un compte sur le site déployé. Allez dans Supabase > Table Editor > `profiles`. Si une nouvelle ligne apparaît, la connexion Frontend -> DB est **OK**.
2.  **Test Admin** : Dans l'app, allez sur le profil > "Message Direct Admin" > Envoyez un message. Vérifiez la table `admin_requests`.
3.  **Test IA** : Lancez un chat. Si Gemini répond, la clé API est correcte.

> **Note**: Le dossier `/backend` (Node.js) est optionnel dans cette configuration Serverless. L'application est entièrement fonctionnelle en déployant uniquement le Frontend (Static Site) connecté à Supabase.
