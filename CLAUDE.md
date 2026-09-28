# CLAUDE.md — notes pour les sessions futures

PWA hors-ligne d'états des lieux (EDL) pour un propriétaire, utilisée surtout sur téléphone. Aucun serveur : GitHub Pages, données en IndexedDB.
Code, UI et commentaires **en français**.

## Contrainte n°1 : compatibilité des fichiers sur 3 à 6 ans
- Lire `docs/FORMAT.md` avant de toucher à `src/model/types.ts`, `src/model/migrate.ts` ou `src/io/*`.
- Ne jamais supprimer ni renommer un champ. Un nouveau champ est optionnel, ou bien on passe par une migration avec `SCHEMA_VERSION + 1`.
- Ne **jamais** modifier ni régénérer `tests/fixtures/v1/*` : ce sont des fichiers figés. Pour une v2 : `GEN_FIXTURES=2 npx vitest run tests/compat.test.ts`.
- Toute donnée lue (import comme stockage) passe par `lireEdl` / `lireLogement`.

## Confidentialité
- Le dépôt est **public**. Aucune adresse réelle, aucun nom de locataire ou de bailleur, aucun fichier Excel réel.
- `*.xlsx` est ignoré par git, sauf `tests/fixtures/xlsx/exemple.xlsx`, une copie anonymisée.
- Le modèle intégré « Studio 19 m² avec terrasse » (`src/data/modeles.ts`) ne contient volontairement pas d'adresse.

## Architecture
- `src/model/` : types (schéma v1), états TB/B/M/KO/ABS (`etats.ts`), fabriques (création d'EDL, `creerSortie`), analyse (progression, écarts), migrations.
- `src/io/` : fonctions **pures**, testées sans navigateur. `csv.ts` (parseur maison, encodages Excel), `xlsx.ts` (lecteur minimal fflate + DOMParser), `tableau.ts` (tableau ⇄ EDL), `paquet.ts` (ZIP, sauvegarde JSON, `importerFichier` qui détecte le format), `rapport.ts` (rapport HTML autonome).
- `src/storage/db.ts` : idb-keyval, deux bases (`edl-donnees`, `edl-photos`). Les photos sont stockées en ArrayBuffer (fiable sur iOS) et nettoyées quand plus aucun EDL ne les référence.
- `src/ui/` : Preact, routeur par hash (`#/logement/:id`, `#/edl/:id/<section>`). `edl.tsx` contient l'éditeur : sauvegarde automatique avec un délai de 400 ms, plus une sauvegarde à `visibilitychange` et `pagehide`.
- Un EDL de sortie **copie** l'état d'entrée dans `element.entree` : il reste autonome.
- Dégradation = baisse vers M, KO ou ABS (TB → B, c'est de la vétusté, pas un écart). Voir `estDegrade`.
- Un EDL avec les deux signatures est en lecture seule. Pour le modifier, il faut effacer les signatures.

## Commandes
- `npm test` · `npm run build` (tsc + vite) · `npm run dev` puis ouvrir `http://localhost:5173/Etats-des-lieux-appartements/`
- La base `/Etats-des-lieux-appartements/` est fixée dans `vite.config.ts` (surchargeable via `BASE_PATH`).
- Le déploiement se fait par push sur `main` (workflow `deploy.yml` : tests, build, Pages).

## Environnement
- Windows, Git Bash. Dépôt GitHub `V20100T/Etats-des-lieux-appartements`, public.
