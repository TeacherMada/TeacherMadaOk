# Recommandations d’évolution: module **EXAMEN** + **CERTIFICAT** (sans casser l’existant)

## Objectif produit
Permettre à un étudiant de:
1. sélectionner un **cours/langue** et un **niveau**,
2. lancer un **examen**,
3. subir une **déduction automatique de crédits**,
4. obtenir un **certificat** si score >= seuil,
5. tout en gardant les fonctionnalités stables actuelles (chat, exercices, rôleplay, dashboard, paiement).

---

## 1) Principe d’architecture recommandé (anti-régression)

### A. Ajouter, ne pas remplacer
- Conserver les flux existants (`chat`, `exercise`, `practice`) et introduire un mode séparé `exam`.
- Encapsuler la logique exam/certificat dans des services dédiés:
  - `examService.ts` (catalogue examens, tentative, soumission)
  - `certificateService.ts` (génération + vérification)
- Ne pas toucher à la logique courante de session chat tant que les tests de non-régression ne sont pas verts.

### B. Feature flag obligatoire
- Activer par drapeau (`FEATURE_FLAGS.examAndCertificate`) pour déployer progressivement.
- Plan de rollout:
  1) OFF en production,
  2) ON admin/testeurs,
  3) ON 10% utilisateurs,
  4) ON global après monitoring.

### C. Déduction crédit atomique
- La déduction ne doit **jamais** dépendre uniquement du front.
- Faire la déduction côté serveur (RPC / function transactionnelle) pour éviter:
  - double-débit,
  - course conditions (deux clics rapides),
  - contournement côté client.

---

## 2) Modèle de données minimal

## Tables proposées
1. `exam_definitions`
- `id`, `code`, `language`, `level`, `duration_minutes`, `passing_score`, `credit_cost`, `is_active`

2. `exam_attempts`
- `id`, `user_id`, `exam_id`, `status`, `score`, `started_at`, `submitted_at`, `graded_at`, `credit_debited`, `certificate_id`

3. `certificates`
- `id`, `user_id`, `exam_id`, `exam_code`, `language`, `level`, `score`, `issued_at`, `verification_code`

## Règles métiers
- 1 tentative = 1 débit au démarrage effectif.
- Pas de certificat si score < seuil.
- Vérification certificat par `verification_code` public.

---

## 3) Parcours utilisateur recommandé

1. Dashboard > bouton **Examen & Certificat**.
2. Écran sélection:
   - Langue/Cours
   - Niveau
   - Affichage coût crédit + durée + score requis
3. Clique “Commencer l’examen”:
   - Vérifie crédits
   - Débite (transaction serveur)
   - Crée tentative `in_progress`
4. Passage de l’examen (timer + anti refresh simple).
5. Soumission:
   - correction
   - statut `graded` ou `failed`
6. Si validé:
   - génération certificat
   - téléchargement PDF + page vérification.

---

## 4) Sécurité & stabilité (très important)

### A. Anti-double clic
- Désactiver le bouton “Commencer” après 1er clic.
- Idempotency key côté serveur.

### B. Anti-fraude légère
- Timestamp signé de début/fin.
- Empêcher soumission hors durée (avec marge serveur).

### C. Compatibilité ascendante
- Aucun changement cassant dans les interfaces existantes.
- Ajouts TypeScript uniquement (extension), pas de suppression de champs existants.

### D. Tolérance panne
- Si le débit échoue: examen ne démarre pas.
- Si création tentative échoue après débit: rollback transactionnel.

---

## 5) Plan d’implémentation en 4 phases

### Phase 1 — Fondation (faible risque)
- Ajouter types domaine (`ExamDefinition`, `ExamAttempt`, `UserCertificate`).
- Ajouter feature flag + grille de coût par niveau.
- Ajouter migration SQL des 3 tables.

### Phase 2 — Service backend (risque maîtrisé)
- RPC `start_exam_attempt(user_id, exam_id)` transactionnelle:
  - lock user row,
  - vérifier crédits,
  - déduire,
  - créer tentative.
- API `submit_exam_attempt` + scoring.

### Phase 3 — UI intégrée (safe)
- Nouveau composant `ExamCenter` isolé.
- Entrée depuis dashboard sans toucher aux flux historiques.

### Phase 4 — Certificat
- Génération certificat (PDF + code vérification unique).
- Historique certificats dans dashboard.

---

## 6) KPI à suivre après lancement
- Taux de démarrage examen.
- Taux de réussite par niveau.
- Écart crédits débités vs tentatives créées (doit être 0).
- Erreurs serveur `start_exam_attempt`.
- Tickets support liés au certificat.

---

## 7) Recommandations concrètes pour éviter de casser le stable

- Garder **strictement** les composants stables inchangés pendant les 2 premières phases.
- Ajouter des tests ciblés:
  - “pas assez de crédits => refus + message”
  - “débit OK => tentative créée”
  - “double clic => un seul débit”
  - “score validé => certificat créé”
- Déployer avec feature flag + monitoring + rollback plan.

En résumé: oui, l’ajout EXAMEN/CERTIFICAT est faisable proprement, à condition de faire la déduction crédit côté serveur de façon atomique, d’isoler le nouveau module et de le lancer progressivement.
