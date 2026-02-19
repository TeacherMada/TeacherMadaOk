# Analyse et recommandations — TeacherMada

## 1) État actuel observé

### Points forts
- Build de production fonctionnel (`npm run build`) avec génération PWA sans erreur bloquante.
- Architecture modulaire globale (composants / services / types) déjà en place.
- TypeScript activé en mode strict.
- Découpage des bundles Vite (manualChunks) déjà configuré.

### Points d’attention
- La commande `npm run lint` échoue car ESLint v9 est présent mais **aucun fichier `eslint.config.*` n’est défini**.
- Le `README.md` mentionne React 19 alors que `package.json` est sur React 18.2.0 (incohérence documentaire).
- Une clé API Google est injectée côté client via `vite.config.ts` (`process.env.API_KEY`) : cela expose une surface de risque sécurité (clé visible côté navigateur).
- Le `README` indique un backend “serverless/hybride”, mais le frontend contient encore des logiques sensibles côté client (auth custom/gestion de crédits), ce qui peut compliquer la sécurité métier.

---

## 2) Recommandations priorisées

## Priorité Haute (Semaine 1)

1. **Rétablir la qualité continue (lint) immédiatement**
   - Ajouter `eslint.config.js` (Flat config ESLint v9).
   - Intégrer TypeScript + React rules minimales.
   - Bloquer les commits/CI si lint KO.

2. **Sécuriser l’usage de la clé Gemini**
   - Ne plus injecter de clé API côté client.
   - Mettre un proxy serveur (Supabase Edge Function / backend léger) pour appeler Gemini.
   - Ajouter rate-limit et contrôle d’auth côté serveur.

3. **Aligner la documentation avec la réalité technique**
   - Corriger README (React 18 vs 19).
   - Documenter précisément ce qui est côté client vs côté serveur.

## Priorité Moyenne (Semaine 2–3)

4. **Stabiliser les types et conventions**
   - Éviter les `any` (ex: onboarding prefs dans `App.tsx`).
   - Activer progressivement `noUnusedLocals` et `noUnusedParameters` à `true`.

5. **Tests minimaux de non-régression**
   - Ajouter Vitest + React Testing Library.
   - Couvrir au moins : Auth flow, création de session, affichage chat/dashboard.

6. **Observabilité produit**
   - Ajouter journalisation structurée (erreurs API, storage fallback).
   - Créer une page/section diagnostics simple (version app, statut sync, erreurs récentes).

## Priorité Basse (Semaine 4+)

7. **Performance UI & DX**
   - Revoir lazy loading des écrans lourds (dashboard, roleplay).
   - Ajouter scripts qualité (`typecheck`, `test`, `lint:fix`).

8. **Hardening PWA**
   - Vérifier `includeAssets` distants (icônes externes), préférer assets locaux.
   - Auditer stratégie cache Workbox pour éviter contenu obsolète de ressources critiques.

---

## 3) Plan d’action proposé (concret)

### Sprint rapide 1 (1–2 jours)
- Ajouter config ESLint v9.
- Corriger README (versions et architecture réelle).
- Ajouter scripts npm : `typecheck`, `check` (lint+build).

### Sprint rapide 2 (2–4 jours)
- Introduire un endpoint serveur sécurisé pour Gemini.
- Migrer l’appel IA client vers ce endpoint.
- Mettre en place logs d’erreurs centralisés.

### Sprint qualité (1 semaine)
- Ajouter tests unitaires/intégration critiques.
- Renforcer typage strict (suppression `any`).
- Ajouter CI (lint + build + tests).

---

## 4) Impact attendu

- **Fiabilité**: moins de régressions grâce à lint/tests.
- **Sécurité**: réduction forte du risque de fuite/abus de clé API.
- **Maintenabilité**: docs alignées et architecture plus claire.
- **Scalabilité**: meilleure base pour multi-utilisateurs et montée en charge.
