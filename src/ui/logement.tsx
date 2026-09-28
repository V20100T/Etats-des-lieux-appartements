import { useEffect, useState } from 'preact/hooks';
import { MODELES_LOGEMENTS } from '../data/modeles';
import { progression } from '../model/analyse';
import { appliquerModeleLogement, creerSortie, edlDepuisPrecedent, nouvelEdl, pieceDepuisModele } from '../model/factory';
import type { Edl, Logement, ModelePiece } from '../model/types';
import { dateFr } from '../io/rapport';
import {
  chargerLogement, chargerModelesPieces, chargerReglages, enregistrerEdl, enregistrerLogement, listerEdls, supprimerEdl, supprimerLogement,
} from '../storage/db';
import { aller } from './commun';

export function EcranLogement({ id }: { id: string }) {
  const [lg, setLg] = useState<Logement | null>();
  const [edls, setEdls] = useState<Edl[]>([]);
  const [creation, setCreation] = useState(false);

  const recharger = () => {
    chargerLogement(id).then((l) => setLg(l ?? null));
    listerEdls(id).then(setEdls);
  };
  useEffect(recharger, [id]);

  if (lg === undefined) return <p aria-busy="true" />;
  if (lg === null)
    return (
      <article>
        Logement introuvable. <a href="#/">Retour</a>
      </article>
    );

  const majLg = (champ: 'nom' | 'adresse' | 'description', v: string) => {
    const n = { ...lg, [champ]: v };
    setLg(n);
    enregistrerLogement(n);
  };

  return (
    <>
      <a href="#/">‹ Logements</a>
      <h1>{lg.nom}</h1>
      <p>
        {lg.adresse || <em>Adresse non renseignée</em>}
        {lg.description && (
          <>
            <br />
            <small>{lg.description}</small>
          </>
        )}
      </p>

      <h3>États des lieux</h3>
      {edls.length === 0 && <p>Aucun état des lieux.</p>}
      {edls.map((e) => {
        const p = progression(e);
        const signe = !!(e.signatures.bailleur.image && e.signatures.locataire.image);
        const aSortie = e.type === 'entree' && edls.some((x) => x.entreeId === e.id);
        return (
          <article key={e.id} class="carte-edl">
            <a href={`#/edl/${e.id}`} class="tuile">
              <span>
                <span class={`type-edl ${e.type}`}>{e.type === 'entree' ? 'ENTRÉE' : 'SORTIE'}</span> {dateFr(e.date)} {signe && '🔒'}
              </span>
              <small>
                {e.locataire.nom || 'Locataire non renseigné'} · {p.faits}/{p.total}
              </small>
            </a>
            <div class="grid">
              {e.type === 'entree' && !aSortie && (
                <button
                  class="outline"
                  onClick={async () => {
                    const s = creerSortie(e);
                    await enregistrerEdl(s);
                    aller(`edl/${s.id}`);
                  }}
                >
                  Créer la sortie
                </button>
              )}
              <button
                class="outline contrast mini"
                onClick={async () => {
                  if (!confirm(`Supprimer définitivement l'EDL ${e.type === 'entree' ? "d'entrée" : 'de sortie'} du ${dateFr(e.date)} et ses photos ?\nFaites un export ZIP avant si besoin.`)) return;
                  await supprimerEdl(e.id);
                  recharger();
                }}
              >
                Supprimer
              </button>
            </div>
          </article>
        );
      })}

      {creation ? (
        <NouvelEdl logement={lg} edls={edls} onAnnuler={() => setCreation(false)} />
      ) : (
        <button class="large" onClick={() => setCreation(true)}>
          + Nouvel EDL d'entrée
        </button>
      )}

      <details>
        <summary>Modifier le logement</summary>
        <label>
          Nom
          <input value={lg.nom} onInput={(e) => majLg('nom', (e.target as HTMLInputElement).value)} />
        </label>
        <label>
          Adresse complète du bien
          <textarea rows={2} value={lg.adresse} onInput={(e) => majLg('adresse', (e.target as HTMLTextAreaElement).value)} />
        </label>
        <label>
          Description
          <input value={lg.description} onInput={(e) => majLg('description', (e.target as HTMLInputElement).value)} />
        </label>
        <p>
          <small>Ces informations sont recopiées dans les prochains EDL (les EDL existants gardent les leurs).</small>
        </p>
        <button
          class="contrast outline"
          onClick={async () => {
            if (!confirm(`Supprimer le logement « ${lg.nom} », ses ${edls.length} EDL et leurs photos ?`)) return;
            if (edls.length && prompt('Tapez SUPPRIMER pour confirmer') !== 'SUPPRIMER') return;
            await supprimerLogement(lg.id);
            aller('');
          }}
        >
          Supprimer le logement
        </button>
      </details>
    </>
  );
}

function NouvelEdl({ logement, edls, onAnnuler }: { logement: Logement; edls: Edl[]; onAnnuler: () => void }) {
  const [source, setSource] = useState(edls.length ? 'precedent' : 'pieces');
  const [modeles, setModeles] = useState<ModelePiece[]>([]);
  const [choix, setChoix] = useState<Record<string, number>>({});
  useEffect(() => {
    chargerModelesPieces().then((m) => {
      setModeles(m);
      setChoix(Object.fromEntries(m.filter((x) => ['entree', 'sejour', 'chambre', 'cuisine', 'sdb', 'wc'].includes(x.id)).map((x) => [x.id, 1])));
    });
  }, []);

  async function creer() {
    const reglages = await chargerReglages();
    let edl: Edl;
    const modele = MODELES_LOGEMENTS.find((x) => 'modele:' + x.id === source);
    if (source === 'precedent' && edls[0]) edl = edlDepuisPrecedent(logement, edls[0], reglages);
    else if (modele) edl = appliquerModeleLogement(nouvelEdl(logement, reglages), modele);
    else {
      edl = nouvelEdl(logement, reglages);
      for (const m of modeles) {
        const n = choix[m.id] ?? 0;
        for (let i = 1; i <= n; i++) edl.pieces.push(pieceDepuisModele({ nom: n > 1 ? `${m.nom} ${i}` : m.nom, elements: m.elements }));
      }
    }
    await enregistrerEdl(edl);
    aller(`edl/${edl.id}`);
  }

  return (
    <article>
      <header>
        <strong>Nouvel EDL d'entrée — point de départ</strong>
      </header>
      {edls[0] && (
        <label>
          <input type="radio" name="src" checked={source === 'precedent'} onChange={() => setSource('precedent')} />
          Reprendre le dernier EDL ({edls[0].type === 'entree' ? 'entrée' : 'sortie'} du {dateFr(edls[0].date)}) : pièces, états et commentaires
        </label>
      )}
      {MODELES_LOGEMENTS.map((m) => (
        <label key={m.id}>
          <input type="radio" name="src" checked={source === 'modele:' + m.id} onChange={() => setSource('modele:' + m.id)} />
          Modèle « {m.nom} »
        </label>
      ))}
      <label>
        <input type="radio" name="src" checked={source === 'pieces'} onChange={() => setSource('pieces')} />
        Choisir les pièces
      </label>
      {source === 'pieces' && (
        <div class="choix-pieces">
          {modeles.map((m) => (
            <div key={m.id} class="ligne-element">
              <span>{m.nom}</span>
              <span class="qte">
                <button class="mini secondary outline" onClick={() => setChoix({ ...choix, [m.id]: Math.max(0, (choix[m.id] ?? 0) - 1) })}>
                  −
                </button>
                <span>{choix[m.id] ?? 0}</span>
                <button class="mini secondary outline" onClick={() => setChoix({ ...choix, [m.id]: (choix[m.id] ?? 0) + 1 })}>
                  +
                </button>
              </span>
            </div>
          ))}
        </div>
      )}
      <div class="grid">
        <button class="secondary outline" onClick={onAnnuler}>
          Annuler
        </button>
        <button onClick={creer}>Créer</button>
      </div>
    </article>
  );
}
