
# 🚀 TeacherMada - Mise à jour v2.1 "Streaming & Vocabulaire"

## 📋 Nouveautés

1.  **Streaming des Réponses (Chat)** :
    *   Les réponses de l'IA s'affichent désormais mot par mot en temps réel.
    *   Améliore la perception de vitesse, crucial pour les connexions lentes à Madagascar.
    *   Utilise `sendMessageStream` de l'API Gemini.

2.  **Boîte à Mots (Vocabulaire)** :
    *   Nouvel onglet "Mots" dans le Dashboard (SmartDashboard).
    *   **Génération IA** : Un bouton permet d'analyser les 6 derniers messages pour extraire automatiquement 3-5 mots clés avec traduction et contexte.
    *   **Ajout Manuel** : L'utilisateur peut ajouter ses propres mots.
    *   **Audio TTS** : Écoute de la prononciation de chaque mot via l'icône haut-parleur.
    *   **Suivi** : Marquer les mots comme "Maîtrisés".

3.  **Gestion Dynamique des Langues (Admin)** :
    *   L'Admin peut désormais ajouter des langues non prévues initialement (ex: Portugais, Russe...).
    *   L'IA génère automatiquement le drapeau (Emoji) et le nom standardisé.
    *   Ces langues apparaissent immédiatement sur la Landing Page et l'Onboarding.

## 🛠️ Modifications Techniques

*   **Frontend** : Refonte de `handleSend` dans `ChatInterface` pour gérer le stream.
*   **Backend/Storage** : Mise à jour de `UserProfile` pour inclure `vocabulary` et `SystemSettings` pour `customLanguages`.
*   **Services** : Ajout de `sendMessageToGeminiStream` et `generateVocabularyFromHistory` dans `geminiService`.

## ⚠️ Notes Importantes

*   Le streaming fonctionne uniquement en mode Chat texte. Le mode Vocal reste en réponse unique pour optimiser la latence audio.
*   La génération de vocabulaire consomme 1 crédit utilisateur.
*   Les langues ajoutées par l'admin sont stockées dans `system_settings` sur Supabase (si connecté) ou LocalStorage.
