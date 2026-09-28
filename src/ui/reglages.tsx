import { useEffect, useState } from 'preact/hooks';
import { MENTIONS_DEFAUT } from '../data/modeles';
import { uid } from '../model/ids';
import type { ModeleElement, ModelePiece, Reglages } from '../model/types';
import {
  chargerModelesPieces, chargerReglages, enregistrerModelesPieces, enregistrerReglages, nettoyerPhotos, reinitialiserModelesPieces,
} from '../storage/db';

/** Une ligne par élément : « Nom » ou « Nom ; commentaire par défaut ». */
const versTexte = (els: ModeleElement[]) => els.map((e) => (e.commentaire ? `${e.nom} ; ${e.commentaire}` : e.nom)).join('\n');
const depuisTexte = (t: string): ModeleElement[] =>
  t
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => {
      const [nom, ...c] = l.split(';');
      return { nom: nom.trim(), quantite: 1, commentaire: c.join(';').trim() };
    });

export function EcranReglages() {
  const [r, setR] = useState<Reglages>();
  const [modeles, setModeles] = useState<ModelePiece[]>();
  const [stockage, setStockage] = useState<string>();

  useEffect(() => {
    chargerReglages().then(setR);
    chargerModelesPieces().then(setModeles);
    navigator.storage?.estimate?.().then((e) => setStockage(`${((e.usage ?? 0) / 1e6).toFixed(1)} Mo utilisés`));
  }, []);

  if (!r || !modeles) return <p aria-busy="true" />;

  const majR = (n: Reglages) => {
    setR(n);
    enregistrerReglages(n);
  };
  const majM = (n: ModelePiece[]) => {
    setModeles(n);
    enregistrerModelesPieces(n);
  };

  return (
    <>
      <a href="#/">‹ Accueil</a>
      <h1>Réglages</h1>
      <p>
        <small>Valeurs recopiées dans chaque nouvel EDL.</small>
      </p>
      <label>
        Bailleur (nom)
        <input value={r.bailleur.nom} onInput={(e) => majR({ ...r, bailleur: { ...r.bailleur, nom: (e.target as HTMLInputElement).value } })} />
      </label>
      <label>
        Adresse du bailleur
        <input value={r.bailleur.adresse} onInput={(e) => majR({ ...r, bailleur: { ...r.bailleur, adresse: (e.target as HTMLInputElement).value } })} />
      </label>
      <label>
        Fait à (ville par défaut)
        <input value={r.faitA} onInput={(e) => majR({ ...r, faitA: (e.target as HTMLInputElement).value })} />
      </label>
      <label>
        Mentions légales du rapport
        <textarea rows={8} value={r.mentions} onInput={(e) => majR({ ...r, mentions: (e.target as HTMLTextAreaElement).value })} />
      </label>
      <button class="outline secondary mini" onClick={() => majR({ ...r, mentions: MENTIONS_DEFAUT })}>
        Rétablir le texte par défaut
      </button>

      <h2>Modèles de pièces</h2>
      <p>
        <small>Une ligne par élément. Commentaire par défaut après un point-virgule : « Sol ; Parquet chêne ».</small>
      </p>
      {modeles.map((m, i) => (
        <details key={m.id}>
          <summary>
            {m.nom} ({m.elements.length})
          </summary>
          <label>
            Nom
            <input value={m.nom} onInput={(e) => majM(modeles.map((x, j) => (j === i ? { ...x, nom: (e.target as HTMLInputElement).value } : x)))} />
          </label>
          <textarea
            rows={Math.max(4, m.elements.length + 1)}
            value={versTexte(m.elements)}
            onChange={(e) => majM(modeles.map((x, j) => (j === i ? { ...x, elements: depuisTexte((e.target as HTMLTextAreaElement).value) } : x)))}
          />
          <button class="contrast outline mini" onClick={() => confirm(`Supprimer le modèle « ${m.nom} » ?`) && majM(modeles.filter((_, j) => j !== i))}>
            Supprimer ce modèle
          </button>
        </details>
      ))}
      <div class="grid">
        <button class="outline" onClick={() => majM([...modeles, { id: uid('md_'), nom: 'Nouveau modèle', elements: [] }])}>
          + Nouveau modèle
        </button>
        <button
          class="outline secondary"
          onClick={async () => {
            if (!confirm('Rétablir les modèles de pièces d’origine ?')) return;
            await reinitialiserModelesPieces();
            setModeles(await chargerModelesPieces());
          }}
        >
          Rétablir les modèles
        </button>
      </div>

      <h2>Stockage</h2>
      <p>
        <small>{stockage}</small>
      </p>
      <button
        class="outline secondary"
        onClick={async () => {
          const n = await nettoyerPhotos();
          alert(`${n} photo(s) inutilisée(s) supprimée(s).`);
        }}
      >
        Nettoyer les photos inutilisées
      </button>
    </>
  );
}
