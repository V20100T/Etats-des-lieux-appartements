# Formats de fichiers — contrat de compatibilité

Les baux durent de 3 à 6 ans. **Un fichier exporté par une version N doit toujours se ré-importer dans toute version ≥ N.**
C'est la contrainte n°1 du projet.

## Règles

1. Chaque fichier porte une version de schéma (`schema`), actuellement **1** (`SCHEMA_VERSION` dans `src/model/types.ts`).
2. On ne **supprime** ni ne **renomme** jamais un champ. Tout nouveau champ est **optionnel**.
3. Si un changement incompatible est inévitable : `SCHEMA_VERSION + 1`, et on ajoute une migration `MIGRATIONS_EDL[N]` (N → N+1) dans `src/model/migrate.ts`. On ne modifie jamais une migration existante.
4. Toute donnée lue (import **et** stockage local) passe par `lireEdl` / `lireLogement` : migrations, puis normalisation tolérante (les champs manquants reçoivent une valeur par défaut, les états inconnus sont ignorés).
5. Un fichier dont le schéma est **plus récent** que l'app est refusé avec un message clair (`FormatTropRecent`), jamais lu à moitié.
6. Les fichiers de `tests/fixtures/v<N>/` sont **figés**. `tests/compat.test.ts` les ré-importe à chaque build. Si un test échoue, le déploiement est bloqué.
   Quand le schéma passe en v2 : `GEN_FIXTURES=2 npx vitest run tests/compat.test.ts`, puis on ajoute les assertions v2 **sans toucher à celles de v1**.

## États

| Code | Signification |
|------|---------------|
| `TB` | Très bon, neuf ou presque |
| `B`  | Bon, usage normal |
| `M`  | Moyen, usage avancé |
| `KO` | Mauvais état, à remplacer |
| `ABS`| Absent, manquant ou hors d'usage |

À l'import, les libellés libres sont reconnus : « Très bon », « Neuf », « Usagé », « Dégradé », « Mauvais », « Absent »…
Une **dégradation** est une baisse d'état vers M, KO ou ABS. Un passage TB → B relève de l'usure normale et n'est pas signalé.

## 1. Sauvegarde complète (`.json`)

```json
{
  "format": "edl-sauvegarde",
  "schema": 1,
  "app": { "nom": "etats-des-lieux", "version": "1.0.0" },
  "exporteLe": "2026-09-28T21:00:00.000Z",
  "reglages": { "bailleur": { "nom": "", "adresse": "" }, "faitA": "", "mentions": "" },
  "modelesPieces": [ { "id": "", "nom": "", "elements": [ { "nom": "", "quantite": 1, "commentaire": "" } ] } ],
  "logements": [ Logement ],
  "edls": [ Edl ],
  "photos": { "ph_xxx": "data:image/jpeg;base64,..." }
}
```

## 2. ZIP d'un EDL (`.zip`)

```
manifest.json   { format: "edl-zip", schema: 1, app, exporteLe, edl: {id,type,logement,date},
                  fichiers: { edl, csv, rapport, photos: [{id,fichier,type}], signatures: {bailleur,locataire} } }
edl.json        { format: "edl-document", schema: 1, edl: Edl, logement: Logement }
edl.csv         voir §3
rapport.html    rapport imprimable (les images pointent vers photos/)
photos/<id>.jpg
signatures/bailleur.png, signatures/locataire.png
```

`edl.json` fait foi à l'import. Si ce fichier manque, l'import se rabat sur le premier `.csv` de l'archive.

## 3. CSV (`.csv`)

UTF-8 avec BOM, séparateur `;`, fins de ligne CRLF (ouverture directe dans Excel). Une ligne par élément.

| Colonne | Contenu |
|---|---|
| `schema` | `edl-csv/1` |
| `section` | `piece`, `cle` ou `compteur` |
| `piece` | nom de la pièce |
| `element` | nom de l'élément (ou du compteur) |
| `quantite` | nombre (pour un compteur : type `eau`/`eau_chaude`/`electricite`/`gaz`/`autre`) |
| `etat_entree`, `commentaire_entree` | état et commentaire à l'entrée |
| `etat_sortie`, `commentaire_sortie` | état et commentaire à la sortie (vides pour un EDL d'entrée) |
| `numero`, `index_entree`, `index_sortie` | compteurs |
| `photos_entree`, `photos_sortie` | identifiants de photos séparés par `\|` |

À l'import, le séparateur (`;` `,` tabulation `|`) et l'encodage (UTF-8, UTF-16, Windows-1252 d'Excel) sont détectés automatiquement.
Les en-têtes sont reconnus sans tenir compte de la casse, des accents ni de la ponctuation. Des alias sont acceptés, par exemple « Type équipement », « Nom élément », « Nombre », « Etat Entrée ».
Si un état ou un commentaire de sortie est rempli, l'import crée un EDL d'entrée **et** un EDL de sortie.

## 4. Classeur Excel (`.xlsx`)

La feuille dont une ligne d'en-tête contient une colonne « élément » est lue comme un CSV (§3).
Un onglet d'introduction facultatif est exploité par heuristique : nom entre guillemets, adresse sur la ligne qui suit « situé : », surface « … m² », « compteur … N° xxx ».

## Modèle de données (schéma 1)

Voir `src/model/types.ts`, qui fait référence. Les photos sont stockées à part et référencées par leur identifiant (`ph_…`).
Un EDL de sortie contient une **copie** de l'état d'entrée de chaque élément (`element.entree`) : il reste lisible même si l'EDL d'entrée a disparu.
