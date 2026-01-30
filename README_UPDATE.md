
# 🚀 TeacherMada - Mise à jour "Intelligence & Progression"

Cette mise à jour introduit une refonte majeure du système de niveaux et de progression pédagogique.

## 📋 Nouveautés Principales

1.  **Niveaux Standardisés** :
    *   **Langues Européennes** : A1, A2, B1, B2, C1, C2 (CECRL).
    *   **Chinois (Mandarin)** : HSK 1 à HSK 6.
2.  **Sélection Intelligente** : Nouvelle interface d'Onboarding avec descriptions détaillées de chaque niveau.
3.  **Prompt Système Adaptatif** : L'IA reçoit désormais des instructions strictes pour respecter le niveau choisi (vocabulaire, grammaire).
4.  **Suivi de Progression Précis** : La barre de progression dans le chat reflète désormais l'avancement réel dans le niveau actuel (0 à 50 leçons).

## 🛠️ Actions Requises (Admin)

Aucune action manuelle n'est requise dans la base de données. 
Le code gère automatiquement la migration des anciens profils utilisateurs lors de leur prochaine connexion en initialisant leur `levelProgress` à 0.

## 🔍 Vérification

Pour tester le nouveau système :
1.  Connectez-vous avec un compte utilisateur.
2.  Allez dans **Paramètres > Modifier Infos** ou cliquez sur le drapeau de langue en haut à gauche.
3.  Changez de langue ou réinitialisez vos préférences.
4.  Vérifiez que l'écran de sélection de niveau affiche bien les codes (A1/HSK1) avec leurs descriptions.
5.  Lancez une leçon et vérifiez que la barre de progression en bas affiche bien le niveau actuel (ex: A1 -> A2).
