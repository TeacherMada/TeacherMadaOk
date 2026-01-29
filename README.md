
# 🎓 TeacherMada - Guide de Déploiement "Zéro Erreur"

Ce guide vous explique comment configurer Supabase et déployer sur Render sans avoir de page blanche.

---

## 🛠️ Étape 1 : Récupérer les Clés Supabase (Vital !)

Pour connecter votre App à sa base de données, il faut les bonnes clés.

1.  Connectez-vous à votre projet sur [Supabase.com](https://supabase.com).
2.  Allez dans le menu de gauche : **Project Settings** (l'icône d'engrenage).
3.  Cliquez sur **API**.
4.  Vous verrez une section **Project URL** et **Project API keys**.

### 📝 Notez ces 3 informations précieuses :
*   **URL** : (ex: `https://xyzxyzxyz.supabase.co`) -> C'est votre `SUPABASE_URL`.
*   **anon public** : C'est une longue clé. -> C'est votre `SUPABASE_ANON_KEY`. **(Celle-ci va dans le Frontend)**.
*   **service_role** : C'est une autre longue clé (ne la partagez jamais !). -> C'est votre `SUPABASE_SERVICE_ROLE_KEY`. **(Celle-ci va dans le Backend uniquement)**.

---

## ☁️ Étape 2 : Déploiement Backend (Render)

C'est le "cerveau" qui gère l'IA et les paiements.

1.  Sur [Render](https://dashboard.render.com), créez un **Web Service**.
2.  Connectez votre GitHub.
3.  **Paramètres** :
    *   **Name**: `teachermada-api`
    *   **Root Directory**: `backend`
    *   **Environment**: `Node`
    *   **Build Command**: `npm install`
    *   **Start Command**: `node server.js`
4.  **Environment Variables** (Section Advanced) - Ajoutez ceci :
    *   `NODE_VERSION` = `20.11.0`
    *   `SUPABASE_URL` = (Votre URL Supabase copiée à l'étape 1)
    *   `SUPABASE_SERVICE_ROLE_KEY` = (Votre clé **service_role** copiée à l'étape 1)
    *   `GOOGLE_API_KEY` = (Votre clé Gemini AI Studio)
5.  Déployez. Une fois fini, copiez l'URL en haut (ex: `https://teachermada-api.onrender.com`).

---

## 🖥️ Étape 3 : Déploiement Frontend (Render)

C'est l'interface React. C'est ici que se joue le problème de la page blanche.

1.  Sur [Render](https://dashboard.render.com), créez un **Static Site**.
2.  Connectez votre GitHub.
3.  **Paramètres** :
    *   **Name**: `teachermada-app`
    *   **Root Directory**: `.` (Laisser vide ou mettre un point)
    *   **Build Command**: `npm install && npm run build`
    *   **Publish Directory**: `dist`
4.  **Environment Variables** (Attention aux noms, ils commencent par VITE_) :
    *   `VITE_SUPABASE_URL` = (Votre URL Supabase copiée à l'étape 1)
    *   `VITE_SUPABASE_ANON_KEY` = (Votre clé **anon public** copiée à l'étape 1)
    *   `VITE_API_URL` = (L'URL de votre Backend déployé à l'étape 2. ex: `https://teachermada-api.onrender.com`)
5.  **🔴 CRUCIAL : Rewrite Rules (Pour éviter l'erreur 404/Page Blanche)**
    *   Allez dans l'onglet **Redirects/Rewrites** dans le menu de gauche du service Render.
    *   Cliquez sur **Add Rule**.
    *   **Source**: `/*`
    *   **Destination**: `/index.html`
    *   **Action**: `Rewrite` (⚠️ Ne choisissez PAS Redirect, choisissez REWRITE)
    *   Sauvegardez.

---

## ⚠️ Dépannage "Page Blanche"

Si vous avez toujours une page blanche :
1.  **Vérifiez les Logs** : Dans Render (Frontend), onglet "Logs". Si le build a échoué, c'est écrit.
2.  **Console Navigateur** : Ouvrez votre site, faites Clic-Droit > Inspecter > Console.
    *   Si vous voyez `Uncaught ReferenceError: process is not defined`, c'est que vous n'avez pas pris la mise à jour du code (fichier `supabase.ts`).
    *   Si vous voyez `404 Not Found` sur des fichiers JS/CSS, vérifiez que le *Publish Directory* est bien `dist`.
    *   Si vous voyez une erreur Supabase, vérifiez que `VITE_SUPABASE_URL` commence bien par `https://` et n'a pas d'espace.

## 📞 Support

Pour toute question technique :
*   Développeur : Tsanta Fiderana
*   Contact : via Facebook TeacherMada

*Bon déploiement !*
