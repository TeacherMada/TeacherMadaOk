# 🎓 TeacherMada - Votre Professeur de Langue Personnel

TeacherMada est une application web progressive (PWA) conçue pour démocratiser l'apprentissage des langues. Elle combine l'intelligence artificielle générative (Google Gemini) avec une pédagogie structurée pour offrir une expérience d'apprentissage fluide, personnalisée et accessible.

## 🏗️ Architecture de l'Application

Le projet suit une architecture **Serverless / Hybride** moderne, optimisée pour la performance et la facilité de déploiement.

### 1. Frontend (Le Cœur)
*   **Framework**: React 19 (Hooks, Context, Streaming SSR support).
*   **Build Tool**: Vite (Rapide, HMR optimisé).
*   **Langage**: TypeScript (Typage strict pour la robustesse).
*   **Styling**: Tailwind CSS (Design responsive, Dark mode natif).
*   **Icons**: Lucide React.

### 2. Services & Logique Métier (`src/services/`)
L'application ne dépend pas d'un backend Node.js complexe. La logique est déportée dans des services côté client qui communiquent avec des APIs :
*   **`geminiService.ts`** :
    *   Interface directe avec l'API Google Gemini (`@google/genai`).
    *   Gère le **Streaming** de texte pour une réponse rapide (faible latence perçue).
    *   Gère l'extraction de vocabulaire et les jeux de rôle.
*   **`storageService.ts`** :
    *   Agit comme une couche d'abstraction (Pattern Facade).
    *   Gère la synchronisation **Supabase** (Base de données PostgreSQL) pour les utilisateurs connectés.
    *   Gère le repli sur **LocalStorage** pour le mode hors-ligne ou sans compte.
    *   Centralise la logique des Crédits, de l'Authentification et des Paramètres Système.

### 3. Base de Données (Supabase)
TeacherMada utilise Supabase comme Backend-as-a-Service (BaaS) :
*   **Authentification** : Gestion des utilisateurs (email/password custom).
*   **Tables** : `profiles` (stats, crédits, vocabulaire), `admin_requests` (paiements mobile money).
*   **Sécurité** : Row Level Security (RLS) configuré pour protéger les données.

### 4. Composants Clés (`src/components/`)
*   **`ChatInterface`** : Le moteur de conversation. Gère l'historique, le Markdown, et le feedback visuel du streaming.
*   **`SmartDashboard`** : Le panneau de contrôle de l'élève. Affiche les statistiques, le vocabulaire extrait par IA, et les réglages.
*   **`DialogueSession`** : Module de mise en situation (Roleplay) avec objectifs et correction automatique.
*   **`PaymentModal`** : Interface de rechargement de crédits via Mobile Money (MVola, Orange, Airtel).
*   **`Toaster`** : Système de notifications global.

## 🚀 Fonctionnalités Principales

1.  **Professeur IA (Gemini 2.0)** :
    *   Correction instantanée des erreurs.
    *   Adaptation au niveau (A1 à C2).
    *   Explications en Français ou Malagasy.

2.  **Smart Vocabulary** :
    *   Extraction automatique des mots difficiles d'une conversation.
    *   Génération de définitions et exemples contextuels.
    *   Synthèse vocale (Text-to-Speech) pour la prononciation.

3.  **Mode Roleplay** :
    *   Scénarios pré-définis (Marché, Médecin, Entretien...).
    *   Chronomètre (1 min = 1 crédit).
    *   Score et feedback final.

4.  **Admin Dashboard** :
    *   Gestion des utilisateurs et des crédits.
    *   Validation des paiements Mobile Money.
    *   Ajout dynamique de nouvelles langues.

## 📦 Installation & Développement

1.  Cloner le repo.
2.  `npm install`
3.  Créer un fichier `.env` avec :
    *   `VITE_GOOGLE_API_KEY` (Clé Gemini)
    *   `VITE_SUPABASE_URL`
    *   `VITE_SUPABASE_ANON_KEY`
4.  `npm run dev` pour lancer le serveur local.

---
© TeacherMada Team - Education for All.