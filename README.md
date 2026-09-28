# États des lieux

Mini-application pour réaliser les **états des lieux d'entrée et de sortie** de mes logements, sur téléphone et sur place, **même sans réseau**.

👉 **https://v20100t.github.io/Etats-des-lieux-appartements/**

Sur le téléphone : ouvrir le lien, puis choisir « Ajouter à l'écran d'accueil ». L'app s'installe et fonctionne ensuite hors-ligne.

## Fonctionnalités

- **Logements**, et pour chacun ses EDL d'entrée et de sortie.
- **Pièces et éléments**. L'état se saisit en un tap : TB / B / M / KO / ABS, avec quantité et commentaire (la dictée passe par le micro du clavier).
- **Modèles de pièces** modifiables, et « tout le reste à B » par pièce.
- **Barre de progression**, par exemple « 34/52 éléments renseignés ».
- **EDL de sortie** créé à partir de l'entrée. L'état et les photos d'entrée s'affichent à côté de chaque élément. Les dégradations et les éléments manquants sont détectés, puis regroupés dans une **synthèse des écarts**.
- **Photos** prises directement ou depuis la galerie. Elles sont compressées, horodatées sur l'image, plusieurs par élément, avec un aperçu plein écran.
- **Compteurs** (index et photo, consommation calculée), **clés**, **vérifications rapides**, **observations**.
- **Signatures au doigt** du bailleur et du locataire, avec **tampon GPS** et heure. Un EDL signé passe en lecture seule.
- **Rapport** imprimable ou enregistrable en PDF, qu'on peut aussi exporter en HTML autonome.
- **Import** : Excel `.xlsx`, CSV (Excel FR, n'importe quel séparateur), ZIP, sauvegarde JSON.
- **Export** : CSV, ZIP (CSV, photos, signatures, rapport, `manifest.json`), sauvegarde complète JSON.

## Données et confidentialité

Il n'y a **aucun serveur**. Tout est stocké dans le navigateur du téléphone (IndexedDB) et le dépôt ne contient aucune donnée personnelle.
➡️ **Faire régulièrement une « Sauvegarde complète »** (bouton sur l'accueil) et la ranger ailleurs (e-mail, cloud).

## Compatibilité à long terme

Un fichier exporté aujourd'hui doit pouvoir être ré-importé dans plusieurs années. Les formats sont versionnés et documentés dans [docs/FORMAT.md](docs/FORMAT.md).
Des fichiers de référence figés (`tests/fixtures/v1/`) sont ré-importés à chaque build : si l'un d'eux ne se relit plus, rien n'est déployé.

## Développement

```bash
npm install
npm run dev      # http://localhost:5173/Etats-des-lieux-appartements/
npm test         # Vitest
npm run build    # vérification TypeScript + build PWA dans dist/
```

Stack : Vite, TypeScript, Preact, vite-plugin-pwa, Pico.css, fflate (ZIP/XLSX), idb-keyval, Vitest. Toutes les librairies sont embarquées au build (aucun CDN).

## Déploiement

Chaque push sur `main` déclenche `.github/workflows/deploy.yml` : tests, puis build, puis publication sur GitHub Pages.
**Si un test échoue, la version en ligne ne change pas.**
