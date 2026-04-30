# SAU-main-courante

Application web de **main courante journalière** pour :
- la planification des commandes et tâches,
- la vérification des Box et secteurs,
- la création et modification complète d'une checklist,
- la signature numérique du rapport,
- la prise de photos de contrôle,
- un usage simple sur **PC** et **smartphone** (mode d'affichage basculable).

## Fonctions disponibles

- Ajout, édition, duplication et suppression de points de checklist.
- Suivi de chaque point: zone, responsable, échéance, commentaire et statut OK.
- Sous-checklist par contexte: choix d'une vérification programmée puis d'une sous-partie (ex: Box 1), avec points détaillés dédiés.
- Navigation par onglets pour afficher une seule zone à la fois (infos, planification, checklist, signature, photos, suivi).
- Planification utilisée comme page admin: création des vérifications et des sous-parties (ex: Box 1, Box 2).
- Onglet Templates: paramétrage complet par secteur puis sous-catégorie, avec édition de la checklist précise et des paramètres de planification par défaut.
- Organisation générale: secteur -> sous-catégorie -> checklist précise.
- Checklist hiérarchique en 3 étapes: sélection du secteur du jour, sélection de la sous-catégorie planifiée, puis checklist détaillée.
- Chaque item détaillé peut être coché, commenté et illustré par une photo.
- Planification itérative des vérifications: récurrence (quotidienne, hebdomadaire, mensuelle) et itérations automatiques.
- Validation signée par vérification: bouton "Valider & signer" sur chaque ligne de planification (utilise la signature enregistrée).
- Signature via zone de dessin (souris/doigt), avec nom du signataire et fonction.
- Ajout de photos depuis smartphone ou PC, notes par photo, suppression.
- Export JSON complet de la main courante.
- Impression du rapport (fonction navigateur).

## Lancer l'application

Ouvrir `index.html` dans un navigateur, ou lancer un serveur statique :

```bash
python3 server.py
```

Puis ouvrir `http://127.0.0.1:8000/`.

Dans Codespaces, ouvrir l'URL du port `8000` (pas `4173`) pour eviter les erreurs de frame/origine.

Connexion initiale:

- Identifiant: `admin`
- Mot de passe: `admin123`

## Architecture code (sectorisee)

- `js/main.js`: point d'entree et orchestration des rendus.
- `js/core/state.js`: etat global, persistance localStorage, helpers de modele.
- `js/core/dom.js`: references DOM centralisees.
- `js/features/templates.js`: gestion secteur -> sous-categorie -> sous-categorie d'item -> items.
- `js/features/planning.js`: planification par secteur + recurrence infinie.
- `js/features/checklist.js`: parcours checklist journalier et edition des items.
- `js/features/signature.js`: signature et metadonnees signataire.
- `js/features/photos.js`: galerie photo globale.
