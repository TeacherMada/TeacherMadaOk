
# 📘 TeacherMada - Guide Complet & Base de Connaissances

Bienvenue dans la documentation officielle de **TeacherMada**. Ce document détaille chaque aspect de l'application, de l'inscription à l'utilisation des fonctionnalités avancées. Il est conçu pour les utilisateurs débutants et sert de contexte pour les assistants.

---

## 📑 Table des Matières

1.  [Introduction & Concept](#1-introduction--concept)
2.  [Premiers Pas (Installation & Compte)](#2-premiers-pas-installation--compte)
3.  [Configuration Initiale (Onboarding)](#3-configuration-initiale-onboarding)
4.  [L'Interface Principale (Le Chat)](#4-linterface-principale-le-chat)
5.  [Live Teacher (Appel Vocal IA)](#5-live-teacher-appel-vocal-ia)
6.  [Modules d'Apprentissage](#6-modules-dapprentissage)
    *   [Jeux de Rôle (Dialogues)](#jeux-de-rôle)
    *   [Exercices Générés](#exercices)
7.  [Espace Personnel (Dashboard)](#7-espace-personnel-dashboard)
8.  [Système de Crédits & Paiements](#8-système-de-crédits--paiements)
9.  [Assistant Guide (Chatbot Aide)](#9-assistant-guide-chatbot-aide)
<!--10. [Architecture Technique (Pour Développeurs/IA)](#10-architecture-technique)-->

---

## 1. Introduction & Concept

**TeacherMada** est une plateforme moderne d’apprentissage des langues conçue pour aider chaque apprenant à parler, comprendre et maîtriser une langue étrangère de manière progressive, pratique et efficace.
Elle offre un accompagnement personnalisé, interactif et adapté au rythme et au niveau de chacun, afin de transformer l’apprentissage en une expérience naturelle et motivante.

*   **Objectif :**
1️⃣ Rendre l’apprentissage accessible à tous
Permettre à chacun d’apprendre une langue étrangère facilement, sans méthodes compliquées ni coûts excessifs.
2️⃣ Favoriser la pratique réelle
Encourager les utilisateurs à parler activement, s’exprimer librement et appliquer immédiatement ce qu’ils apprennent.
3️⃣ Adapter l’enseignement au niveau de l’apprenant
Offrir un accompagnement progressif, du niveau débutant au niveau avancé, avec des explications claires et structurées.
4️⃣ Renforcer la confiance
Aider l’apprenant à corriger ses erreurs, améliorer sa prononciation et développer son assurance à l’oral.
5️⃣ Développer une maîtrise concrète
L’objectif final est que l’utilisateur puisse comprendre, communiquer et utiliser la langue cible dans des situations réelles.

---

## 2. Premiers Pas (Installation & Compte)

### 📥 Installation (PWA)
L'application peut s'installer comme une application native sur Android, iOS ou PC sans passer par les stores.
*   **Bouton :** "Installer l'application" (sur la page d'accueil) ou via le menu du navigateur ("Ajouter à l'écran d'accueil").
*   **Avantages :** Fonctionne en plein écran, accès rapide, cache hors-ligne partiel.

### 🔐 Authentification
L'écran d'authentification gère l'accès sécurisé.
*   **Inscription :** Nécessite un Nom d'utilisateur (unique), un Mot de passe, et optionnellement un Email/Téléphone.
*   **Connexion :** Via Nom d'utilisateur/Email/Numéro et Mot de passe.
*   **Mot de passe oublié :** Il n'y a pas d'email automatique. L'utilisateur remplit un formulaire de "Récupération" qui envoie une requête à l'administrateur. L'admin contactera l'utilisateur manuellement via E-mail.

---

## 3. Configuration Initiale (Onboarding)

À la première connexion, l'utilisateur passe par 3 étapes cruciales :

1.  **Langue Cible :** Quelle langue apprendre ? (Ex: Anglais, Français, Chinois, Espagnol...+14Langues disponibles).
2.  **Niveau Actuel :**
    *   De **A1** (Débutant) à **C2** (Maîtrise).
    *   Option **"Je ne connais pas mon niveau"** : Place l'utilisateur en niveau par défaut (A1 ou HSK1) avec une évaluation progressive.
3.  **Langue d'Explication :**
    *   **Français 🇫🇷** : Les règles et consignes seront en français.
    *   **Malagasy 🇲🇬** : Les explications seront en Malagasy (idéal pour les locaux).

---

## 4. L'Interface Principale (Le Chat)

C'est le cœur de l'application où se déroule le cours structuré.

### 🧩 Sections de l'écran
1.  **En-tête (Header) :**
    *   **Bouton Retour :** Quitte la session pour revenir à l'accueil.
    *   **Indicateur Langue/Niveau (à cliquer):** Affiche le cours actuel (ex: "Anglais • B1").
    *   **Menu (Chevrons) :** Permet de changer rapidement de mode (Vers Dialogues, Exercices, Appel Vocal, Changer langue).
    *   **Compteur de Crédits (Éclair/Zap) :** Affiche le solde. Clic pour recharger.
    *   **Profil (Avatar) :** Ouvre le profil utilisateur Smart Dashboard.

2.  **Zone de Messages (Body) :**
    *   Affiche l'historique de la conversation.
    *   **Messages prof (Leçon):** Formatés en Markdown (Gras, Listes, Titres, Prononciation word).
    *   **Bouton Audio (Haut-parleur) :** Permet d'écouter la prononciation d'un message spécifique.

3.  **Zone de Saisie (Footer) :**
    *   **Champ Texte :** Pour écrire les messages, réponses, questions etc..
    *   **Bouton Suivant :** Cliquer pour définir le numéro du Leçon X à envoyer.
    *   **Bouton Envoyer (Avion) :** Envoyer les messages ou Leçon X souhaiter.
    *   **Bouton "Appel Vocal" (Téléphone) :** Bouton spécial avec effet "Glow" pour lancer le pratique vocal avec un prof.

### 🧠 Logique Pédagogique
*   Le prof suit une structure : Objectif -> Concept -> Vocabulaire -> Pratique.
*   Elle corrige systématiquement les fautes avant de continuer.

---

## 5. Appel Vocal

Le mode le plus avancé pour l'immersion totale.

### ⚡ Fonctionnement
*   Connecte l'utilisateur directement un prof particulier (en temps réel).
*   **Latence ultra-faible :** La conversation est fluide comme un appel téléphonique.

### 🎓 Méthodologie "Immersion"
Le système suit une méthode strict :
1.  **Langue :** Parle 90% dans la langue cible.
2.  **Correction Bienveillante :**
    *   Si l'élève fait une faute : Encourager ("Good try!") → Corriger ("Say: ...") → Faire répéter ("Repeat please").
3.  **Débit :** Le prof parle lentement et articule clairement.

### 🎨 Interface Visuelle
*   **Avatar Central :** S'anime avec un halo énergétique (Emerald/Cyan) quand le prof parle.
*   **Ondes Concentriques :** S'animent autour de l'utilisateur quand il parle (réactif au volume micro).
*   **Timer :** Affiche la durée de l'appel.

### 💰 Coût
*   **5 Crédits / Minute**.
*   Notification visuelle "-5 Crédits" chaque 60 secondes.
*   Coupure automatique si le solde est épuisé.

---

## 6. Modules d'Apprentissage

Accessibles via le Menu ou le Dashboard.

### 🎭 Jeux de Rôle (Dialogues)
Mise en situation pratique.
*   **Scénarios :** Libre, Marché, Docteur, Entretien d'embauche, Aéroport, etc.
*   **Déroulement :** Le prof joue le rôle opposé (vendeur, médecin..).
*   **Correction :** Feedback immédiat si la phrase est incorrecte.
*   **Score Final (bouton Terminer):** À la fin, le prof donne une note sur 20 et des conseils.

### 🧠 Exercices
Génération de quiz basés sur l'historique du chat.
*   **Types :** QCM (Choix multiple), Vrai/Faux, Textes à trous.
*   **Feedback :** Explication immédiate après chaque réponse.
*   **Gain :** Réussir des exercices rapporte de l'XP (Expérience).

---

## 7. Espace Personnel (Dashboard)

Accessible en cliquant sur l'avatar en haut à droite. C'est le panneau de contrôle de l'utilisateur.

### 📊 Contenu
1.  **En-tête Profil :** Avatar, Nom, Niveau actuel.
2.  **Cartes d'Action Rapide :**
    *   **Dialogues :** Accès aux scénarios.
    *   **Appel Vocal :** Lancer le Live Teacher.
    *   **Exercices :** Lancer une session de quiz.
3.  **Portefeuille :** Affiche le solde de crédits et bouton "Recharger".
4.  **Préférences :**
    *   Changer la langue d'explication.
    *   Mode Sombre/Clair.
    *   Modifier le mot de passe.
5.  **Sauvegarde :**
    *   **Exporter :** Télécharge un fichier `.json` contenant toute la progression (utile si changement de téléphone).
    *   **Importer :** Restaure la progression depuis un fichier.

---

## 8. Système de Crédits & Paiements

TeacherMada fonctionne sur une économie de crédits pour financer les coûts serveurs.

### 💎 Économie
*   **1 Message (leçon)** = 1 Crédit.
*   **1 Exercice** = 1 Crédit.
*   **1 Minute d'Appel Vocal** = 5 Crédits.
*   **1 Explication audio** = 1 Crédit.

### 💳 Rechargement (Paiement)
Le système simule un paiement Mobile Money (très populaire à Madagascar).
1.  L'utilisateur choisit/définir un montant (ex: 2000 Ar) échanger auto équivalent en crédit crd.
2.  La modale affiche les numéros **Telma/Mvola**, **Airtel**, **Orange** **nom mobile money Tsanta Fiderana** de l'admin.
3.  L'utilisateur effectue le transfert réel sur son téléphone ou via Cash point.
4.  L'utilisateur entre la **Référence de transaction** ou **indices de la transaction** (reçue par SMS) dans l'app et envoie la demande.
5.  **Validation :** La demande crédits valide automatique instantané si la référence ou indices sont égaux à celle la reçu de paiement de l'admin. Sinon La demande part dans le "Dashboard Admin". L'admin vérifie son téléphone et valide les crédits manuels.

---

## 9. Assistant Guide (Chatbot Aide)

Un petit robot flottant en bas à gauche de l'écran.
*   **Rôle :** Aider l'utilisateur à naviguer dans l'app. Conseiller et donner des tutoriels étape par étape.

---

<!---## 10. Architecture Technique

*(Section destinée aux développeurs ou à l'Agent IA pour la maintenance)*

### 📂 Structure des Fichiers
*   `src/App.tsx` : Orchestrateur principal. Gère l'état global (User, Session, Modes).
*   `src/components/` : Contient tous les éléments visuels (ChatInterface, LiveTeacher, SmartDashboard...).
*   `src/services/geminiService.ts` : Pont vers l'API Google Gemini. Gère les prompts, le streaming et la configuration des modèles.
*   `src/services/storageService.ts` : Gère la persistance des données (LocalStorage + Supabase en parallèle pour la synchronisation).

### 🤖 Modèles IA Utilisés
*   **Chat & Texte :** `gemini-3-flash-preview` (Rapide et intelligent).
*   **Live Teacher :** `gemini-2.5-flash-native-audio-preview-12-2025` (Modèle multimodal natif pour l'audio temps réel).
*   **Support Agent :** `gemini-2.0-flash` (Léger pour les réponses rapides).

### ☁️ Backend (Supabase)
*   Table `profiles` : Stocke les utilisateurs, crédits, stats.
*   Table `admin_requests` : Stocke les demandes de paiement en attente de validation.
*   Table `system_settings` : Stocke les configurations globales (clés API, prix, langues custom).

### 🔒 Sécurité
*   Les clés API Gemini sont stockées côté serveur (via Proxy ou Variable d'env) ou sécurisées dans `SystemSettings` (DB).
*   La validation des crédits est manuelle (humaine) pour éviter la fraude.

---
*Dernière mise à jour : Guide v1.0 - TeacherMada App*
