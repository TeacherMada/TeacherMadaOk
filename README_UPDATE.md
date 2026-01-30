
# 🚀 TeacherMada - Mise à jour "Intelligence & Progression" (v2.0)

Cette mise à jour majeure transforme l'application en un tuteur intelligent adaptatif, avec une progression pédagogique stricte (CECRL / HSK).

## 📋 Nouveautés Principales

1.  **Niveaux Standardisés & Intelligents** :
    *   Support complet des niveaux CECRL (A1 à C2) pour les langues européennes.
    *   Support complet des niveaux HSK (1 à 6) pour le Mandarin.
2.  **Sélection Intelligente (Onboarding)** :
    *   Nouvelle interface d'Onboarding interactive.
    *   Descriptions détaillées et exemples concrets pour chaque niveau avant sélection.
    *   Option "Je ne connais pas mon niveau" qui active un mode d'évaluation IA.
3.  **Cerveau Pédagogique (Prompt System)** :
    *   L'IA reçoit désormais des instructions contextuelles strictes.
    *   Si l'utilisateur est A1, l'IA s'interdit d'utiliser du vocabulaire complexe.
    *   Détection automatique des écarts de niveau (ex: un utilisateur se dit B2 mais fait des fautes A1 -> l'IA adapte).
4.  **Suivi de Progression Précis** :
    *   La barre de progression dans le chat n'est plus aléatoire.
    *   Elle suit la progression réelle dans le niveau actuel (0 à 50 leçons).
    *   Animation visuelle A1 -> A2 dans l'interface.

## 🛠️ Actions Requises (Admin / Développeur)

### 1. Base de Données (Supabase)
Aucune migration bloquante n'est nécessaire car nous utilisons le champ JSONB `stats`, mais pour information, la structure interne de `stats` évolue :
- Avant : `{ xp, streak, lessonsCompleted }`
- Maintenant : `{ xp, streak, lessonsCompleted, levelProgress }`

Le code gère automatiquement la migration des anciens utilisateurs lors de leur prochaine connexion (initialisation de `levelProgress` à 0).

### 2. Configuration Backend (Si mode Hybride)
Si vous utilisez le Backend Node.js optionnel, assurez-vous de redéployer le serveur. Cependant, cette mise à jour est conçue pour fonctionner en mode Serverless (Frontend -> Supabase Direct).

### 3. Vérification post-déploiement
1.  Connectez-vous avec un compte existant.
2.  Allez dans le menu (cliquez sur le drapeau en haut à gauche) pour changer de langue/niveau.
3.  Vérifiez que l'écran de sélection affiche bien les cartes détaillées (A1, A2, etc.).
4.  Lancez une leçon et vérifiez que la barre de progression (en bas) indique bien "A1 -> A2" (ou HSK1 -> HSK2) avec un pourcentage cohérent.

## 🐛 Corrections Incluses
- Correction de l'erreur de syntaxe `error TS1005: '}' expected` dans `ChatInterface.tsx`.
- Optimisation des types TypeScript pour éviter les conflits d'enum.
