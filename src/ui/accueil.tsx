import { useEffect, useState } from 'preact/hooks';
import { progression } from '../model/analyse';
import { nouveauLogement } from '../model/factory';
import type { Edl, Logement } from '../model/types';
import { exporterSauvegarde, importerFichier, type Lot } from '../io/paquet';
import { dateFr, dateHeureFr } from '../io/rapport';
import {
  chargerReglages, derniereSauvegarde, edlsExistants, enregistrerLogement, importerLot, listerEdls, listerLogements, noterSauvegarde, toutExporter,
} from '../storage/db';
import { aller, choisirFichier, partager, peutPartager, telecharger } from './commun';

export function Accueil() {
  const [logements, setLogements] = useState<Logement[]>();
  const [edls, setEdls] = useState<Edl[]>([]);
  const [sauvegarde, setSauvegarde] = useState<string>();
  const [creation, setCreation] = useState(false);

  const recharger = () => {
    listerLogements().then(setLogements);
    listerEdls().then(setEdls);
    derniereSauvegarde().then(setSauvegarde);
  };
  useEffect(recharger, []);

  const joursDepuis = sauvegarde ? (Date.now() - Date.parse(sauvegarde)) / 86400000 : Infinity;

  return (
    <>
      <h1>États des lieux</h1>
      {logements === undefined ? (
        <p aria-busy="true" />
      ) : logements.length === 0 ? (
        <article>
          <p>Aucun logement pour l'instant.</p>
          <p>Créez un logement, ou importez un fichier (Excel .xlsx, CSV, ZIP ou sauvegarde JSON).</p>
        </article>
      ) : (
        logements.map((l) => {
          const siens = edls.filter((e) => e.logementId === l.id);
          const dernier = siens[0];
          const p = dernier && progression(dernier);
          return (
            <a key={l.id} class="tuile logement" href={`#/logement/${l.id}`}>
              <span>{l.nom}</span>
              <small>{l.adresse}</small>
              <small>
                {siens.length} EDL
                {dernier && p && ` · dernier : ${dernier.type === 'entree' ? 'entrée' : 'sortie'} du ${dateFr(dernier.date)} (${p.faits}/${p.total})`}
              </small>
            </a>
          );
        })
      )}

      {creation ? (
        <NouveauLogement onAnnuler={() => setCreation(false)} onCree={(l) => aller(`logement/${l.id}`)} />
      ) : (
        <button class="large" onClick={() => setCreation(true)}>
          + Nouveau logement
        </button>
      )}

      <BoutonImport onFini={recharger} />

      <h3>Sauvegarde</h3>
      <p class={joursDepuis > 30 ? 'bandeau' : ''}>
        <small>
          Les données restent sur ce téléphone. {sauvegarde ? `Dernière sauvegarde : ${dateHeureFr(sauvegarde)}.` : 'Aucune sauvegarde faite.'}
          {joursDepuis > 30 && ' Pensez à sauvegarder régulièrement (e-mail, cloud).'}
        </small>
      </p>
      <BoutonsSauvegarde onFait={recharger} />
      <p>
        <a href="#/reglages">⚙ Réglages et modèles de pièces</a>
      </p>
      <p class="petit">Version {__APP_VERSION__}</p>
    </>
  );
}

function NouveauLogement({ onAnnuler, onCree }: { onAnnuler: () => void; onCree: (l: Logement) => void }) {
  const [nom, setNom] = useState('');
  const [adresse, setAdresse] = useState('');
  const [description, setDescription] = useState('');
  return (
    <article>
      <header>
        <strong>Nouveau logement</strong>
      </header>
      <label>
        Nom (pour vous)
        <input value={nom} placeholder="ex. Studio centre-ville" onInput={(e) => setNom((e.target as HTMLInputElement).value)} />
      </label>
      <label>
        Adresse complète du bien
        <textarea rows={2} value={adresse} onInput={(e) => setAdresse((e.target as HTMLTextAreaElement).value)} />
      </label>
      <label>
        Description
        <input value={description} placeholder="ex. Studio de 19 m², 2e étage" onInput={(e) => setDescription((e.target as HTMLInputElement).value)} />
      </label>
      <div class="grid">
        <button class="secondary outline" onClick={onAnnuler}>
          Annuler
        </button>
        <button
          disabled={!nom.trim()}
          onClick={async () => {
            const l = nouveauLogement(nom.trim(), adresse.trim(), description.trim());
            await enregistrerLogement(l);
            onCree(l);
          }}
        >
          Créer
        </button>
      </div>
    </article>
  );
}

export function BoutonImport({ onFini, libelle = '⬆ Importer un fichier' }: { onFini: (lot: Lot) => void; libelle?: string }) {
  const [enCours, setEnCours] = useState(false);
  return (
    <button
      class="outline secondary large"
      aria-busy={enCours}
      onClick={async () => {
        const f = await choisirFichier('.xlsx,.csv,.txt,.zip,.json,application/json,text/csv');
        if (!f) return;
        setEnCours(true);
        try {
          const lot = importerFichier(f.name, new Uint8Array(await f.arrayBuffer()), await chargerReglages());
          const existants = await edlsExistants(lot);
          let remplacer = false;
          if (existants.length) {
            remplacer = confirm(
              `${existants.length} état(s) des lieux de ce fichier existe(nt) déjà sur cet appareil.\n\nOK = remplacer par la version du fichier\nAnnuler = ne garder que les nouveaux`,
            );
          }
          const r = await importerLot(lot, remplacer);
          alert(`Import terminé : ${r.logements} logement(s), ${r.edls} EDL, ${r.photos} photo(s).`);
          onFini(lot);
        } catch (e) {
          alert('Import impossible : ' + (e as Error).message);
        } finally {
          setEnCours(false);
        }
      }}
    >
      {libelle}
    </button>
  );
}

function BoutonsSauvegarde({ onFait }: { onFait: () => void }) {
  const [enCours, setEnCours] = useState(false);
  const faire = async (mode: 'dl' | 'partage') => {
    setEnCours(true);
    try {
      const json = exporterSauvegarde(await toutExporter(), __APP_VERSION__);
      const d = new Date().toISOString().slice(0, 10);
      const blob = new Blob([json], { type: 'application/json' });
      const nom = `sauvegarde-edl-${d}.json`;
      if (mode === 'partage') await partager(nom, blob, 'Sauvegarde EDL');
      else telecharger(nom, blob);
      await noterSauvegarde();
      onFait();
    } catch (e) {
      alert('Sauvegarde impossible : ' + (e as Error).message);
    } finally {
      setEnCours(false);
    }
  };
  return (
    <div class="grid">
      <button class="outline" aria-busy={enCours} onClick={() => faire('dl')}>
        💾 Sauvegarde complète
      </button>
      {peutPartager() && (
        <button class="outline secondary" aria-busy={enCours} onClick={() => faire('partage')}>
          ↗ Partager la sauvegarde
        </button>
      )}
    </div>
  );
}
