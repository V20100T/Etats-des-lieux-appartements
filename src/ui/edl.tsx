import { useCallback, useEffect, useRef, useState } from 'preact/hooks';
import { consommation, ecarts, progression, progressionElements } from '../model/analyse';
import { estDegrade, ETAT_DESCRIPTION, ETATS } from '../model/etats';
import { nouveauCompteur, nouvelElement, pieceDepuisModele } from '../model/factory';
import { uid } from '../model/ids';
import type { Edl, Element, ModelePiece, StatutVerif, TypeCompteur } from '../model/types';
import { dateHeureFr } from '../io/rapport';
import { chargerEdl, chargerModelesPieces, enregistrerEdl } from '../storage/db';
import { aller, EtatBadge, EtatBoutons, Photos, Progression, Texte } from './commun';
import { PadSignature } from './signature';
import { EcranExport, EcranRapport } from './export';

/* ---------- Chargement / sauvegarde automatique ---------- */

export type Maj = (fn: (d: Edl) => void) => void;

function useEdlStocke(id: string): [Edl | null | undefined, Maj] {
  const [edl, setEdl] = useState<Edl | null>();
  const ref = useRef<Edl | null>();
  const timer = useRef<number>();
  const sale = useRef(false);

  const sauver = useCallback(() => {
    clearTimeout(timer.current);
    if (sale.current && ref.current) {
      sale.current = false;
      enregistrerEdl(ref.current).catch((e) => alert('Enregistrement impossible : ' + e.message));
    }
  }, []);

  useEffect(() => {
    let vivant = true;
    chargerEdl(id).then((e) => {
      if (!vivant) return;
      ref.current = e ?? null;
      setEdl(e ?? null);
    });
    return () => {
      vivant = false;
      sauver();
    };
  }, [id]);

  useEffect(() => {
    const f = () => sauver();
    addEventListener('pagehide', f);
    document.addEventListener('visibilitychange', f);
    return () => {
      removeEventListener('pagehide', f);
      document.removeEventListener('visibilitychange', f);
    };
  }, []);

  const maj = useCallback<Maj>((fn) => {
    if (!ref.current) return;
    const d = structuredClone(ref.current);
    fn(d);
    d.modifieLe = new Date().toISOString();
    ref.current = d;
    sale.current = true;
    setEdl(d);
    clearTimeout(timer.current);
    timer.current = window.setTimeout(sauver, 400);
  }, []);

  return [edl, maj];
}

const estSigne = (e: Edl) => !!(e.signatures.bailleur.image && e.signatures.locataire.image);

function tamponGps(maj: Maj): Promise<void> {
  return new Promise((ok) => {
    if (!navigator.geolocation) return ok();
    navigator.geolocation.getCurrentPosition(
      (p) => {
        maj((d) => {
          d.gps = { lat: p.coords.latitude, lon: p.coords.longitude, precision: p.coords.accuracy, date: new Date().toISOString() };
        });
        ok();
      },
      () => ok(),
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 60000 },
    );
  });
}

/* ---------- Écran EDL ---------- */

export function EcranEdl({ id, sous }: { id: string; sous: string[] }) {
  const [edl, maj] = useEdlStocke(id);
  if (edl === undefined) return <p aria-busy="true">Chargement…</p>;
  if (edl === null)
    return (
      <article>
        EDL introuvable. <a href="#/">Retour</a>
      </article>
    );

  const ro = estSigne(edl);
  const [section, param] = sous;
  const etapes = [
    'infos',
    ...edl.pieces.map((p) => 'piece/' + p.id),
    'cles',
    'compteurs',
    'verifs',
    'obs',
    ...(edl.type === 'sortie' ? ['synthese'] : []),
    'signatures',
    'export',
  ];
  const courant = section === 'piece' ? 'piece/' + param : section;
  const i = etapes.indexOf(courant);
  const base = `edl/${edl.id}`;
  const nav = section && section !== 'rapport' && (
    <nav class="nav-bas">
      <button class="secondary outline" onClick={() => aller(i > 0 ? `${base}/${etapes[i - 1]}` : base)}>
        ◀
      </button>
      <button class="secondary" onClick={() => aller(base)}>
        Sommaire
      </button>
      <button onClick={() => aller(i >= 0 && i < etapes.length - 1 ? `${base}/${etapes[i + 1]}` : base)}>Suivant ▶</button>
    </nav>
  );

  if (section === 'rapport') return <EcranRapport edl={edl} />;

  let contenu;
  switch (section) {
    case undefined:
      contenu = <Sommaire edl={edl} maj={maj} />;
      break;
    case 'infos':
      contenu = <Infos edl={edl} maj={maj} ro={ro} />;
      break;
    case 'piece':
      contenu = <EcranPiece edl={edl} maj={maj} ro={ro} pieceId={param} />;
      break;
    case 'cles':
      contenu = (
        <ListeElements
          titre="Clés remises"
          elements={edl.cles}
          sortie={edl.type === 'sortie'}
          ro={ro}
          maj={(fn) => maj((d) => fn(d.cles))}
          aideAjout="Clé, badge, télécommande…"
        />
      );
      break;
    case 'compteurs':
      contenu = <Compteurs edl={edl} maj={maj} ro={ro} />;
      break;
    case 'verifs':
      contenu = <Verifications edl={edl} maj={maj} ro={ro} />;
      break;
    case 'obs':
      contenu = (
        <>
          <h2>Observations générales</h2>
          <Texte lignes={6} value={edl.observations} ro={ro} placeholder="Observations (utilisez le micro du clavier pour dicter)" onInput={(v) => maj((d) => (d.observations = v))} />
        </>
      );
      break;
    case 'synthese':
      contenu = <Synthese edl={edl} />;
      break;
    case 'signatures':
      contenu = <Signatures edl={edl} maj={maj} />;
      break;
    case 'export':
      contenu = <EcranExport edl={edl} />;
      break;
    default:
      contenu = <p>Section inconnue.</p>;
  }
  return (
    <>
      <EnTeteEdl edl={edl} />
      {ro && section !== 'signatures' && section !== 'export' && (
        <p class="bandeau">
          🔒 EDL signé : lecture seule.{' '}
          <a href={`#/${base}/signatures`}>Modifier</a>
        </p>
      )}
      {contenu}
      {nav}
    </>
  );
}

function EnTeteEdl({ edl }: { edl: Edl }) {
  return (
    <div class="entete-edl">
      <a href={`#/logement/${edl.logementId}`}>‹ {edl.logement.nom}</a>
      <strong>
        {edl.type === 'entree' ? 'Entrée' : 'Sortie'} du {edl.date.split('-').reverse().join('/')}
      </strong>
      <Progression {...progression(edl)} />
    </div>
  );
}

function Tuile({ href, titre, detail, fait }: { href: string; titre: string; detail?: string; fait?: boolean }) {
  return (
    <a class={`tuile ${fait ? 'fait' : ''}`} href={'#/' + href}>
      <span>{titre}</span>
      {detail && <small>{detail}</small>}
    </a>
  );
}

function Sommaire({ edl, maj }: { edl: Edl; maj: Maj }) {
  const base = `edl/${edl.id}`;
  const [modeles, setModeles] = useState<ModelePiece[]>([]);
  const [ajout, setAjout] = useState(false);
  useEffect(() => {
    chargerModelesPieces().then(setModeles);
  }, []);
  const ro = estSigne(edl);
  const pc = progressionElements(edl.cles);
  const nbEcarts = edl.type === 'sortie' ? ecarts(edl).length : 0;
  return (
    <>
      <div class="tuiles">
        <Tuile href={`${base}/infos`} titre="Informations" detail={edl.locataire.nom || 'Locataire, bailleur, date'} fait={!!edl.locataire.nom} />
        {edl.pieces.map((p) => {
          const pr = progressionElements(p.elements);
          return <Tuile key={p.id} href={`${base}/piece/${p.id}`} titre={p.nom} detail={`${pr.faits}/${pr.total}`} fait={pr.total > 0 && pr.faits === pr.total} />;
        })}
        <Tuile href={`${base}/cles`} titre="Clés" detail={`${pc.faits}/${pc.total}`} fait={pc.faits === pc.total} />
        <Tuile href={`${base}/compteurs`} titre="Compteurs" detail={edl.compteurs.map((c) => c.index || '—').join(' · ')} fait={edl.compteurs.every((c) => c.index)} />
        <Tuile href={`${base}/verifs`} titre="Vérifications" detail={`${edl.verifications.filter((v) => v.statut).length}/${edl.verifications.length}`} fait={edl.verifications.every((v) => v.statut)} />
        <Tuile href={`${base}/obs`} titre="Observations" fait={!!edl.observations} />
        {edl.type === 'sortie' && <Tuile href={`${base}/synthese`} titre="Synthèse des écarts" detail={nbEcarts ? `${nbEcarts} écart(s)` : 'Aucun écart'} />}
        <Tuile href={`${base}/signatures`} titre="Signatures" detail={ro ? 'Signé' : 'À signer'} fait={ro} />
        <Tuile href={`${base}/export`} titre="Rapport & export" detail="PDF, ZIP, CSV" />
      </div>
      {!ro &&
        (ajout ? (
          <AjoutPiece
            modeles={modeles}
            onAnnuler={() => setAjout(false)}
            onAjouter={(m, nom) => {
              const p = pieceDepuisModele({ nom, elements: m.elements });
              maj((d) => d.pieces.push(p));
              setAjout(false);
              aller(`${base}/piece/${p.id}`);
            }}
          />
        ) : (
          <button class="outline large" onClick={() => setAjout(true)}>
            + Ajouter une pièce
          </button>
        ))}
    </>
  );
}

function AjoutPiece({ modeles, onAjouter, onAnnuler }: { modeles: ModelePiece[]; onAjouter: (m: ModelePiece, nom: string) => void; onAnnuler: () => void }) {
  const [mid, setMid] = useState(modeles[0]?.id ?? '');
  const m = modeles.find((x) => x.id === mid);
  const [nom, setNom] = useState(m?.nom ?? '');
  return (
    <article>
      <label>
        Modèle
        <select
          value={mid}
          onChange={(e) => {
            const v = (e.target as HTMLSelectElement).value;
            setMid(v);
            setNom(modeles.find((x) => x.id === v)?.nom ?? '');
          }}
        >
          {modeles.map((x) => (
            <option key={x.id} value={x.id}>
              {x.nom} ({x.elements.length})
            </option>
          ))}
        </select>
      </label>
      <label>
        Nom de la pièce
        <input value={nom} onInput={(e) => setNom((e.target as HTMLInputElement).value)} />
      </label>
      <div class="grid">
        <button class="secondary outline" onClick={onAnnuler}>
          Annuler
        </button>
        <button disabled={!m || !nom.trim()} onClick={() => m && onAjouter(m, nom.trim())}>
          Ajouter
        </button>
      </div>
    </article>
  );
}

/* ---------- Informations ---------- */

function Champ({ label, value, onInput, ro, type = 'text' }: { label: string; value: string; onInput: (v: string) => void; ro?: boolean; type?: string }) {
  return (
    <label>
      {label}
      <input type={type} value={value} readOnly={ro} onInput={(e) => onInput((e.target as HTMLInputElement).value)} />
    </label>
  );
}

function Infos({ edl, maj, ro }: { edl: Edl; maj: Maj; ro: boolean }) {
  const [gpsEnCours, setGps] = useState(false);
  return (
    <>
      <h2>Informations</h2>
      <Champ label="Date de l'état des lieux" type="date" value={edl.date} ro={ro} onInput={(v) => maj((d) => (d.date = v))} />
      <fieldset>
        <legend>
          <strong>Locataire</strong>
        </legend>
        <Champ label="Nom(s)" value={edl.locataire.nom} ro={ro} onInput={(v) => maj((d) => { d.locataire.nom = v; d.signatures.locataire.nom = v; })} />
        <Champ label="Adresse à l'entrée" value={edl.locataire.adresse} ro={ro} onInput={(v) => maj((d) => (d.locataire.adresse = v))} />
        {edl.type === 'sortie' && <Champ label="Nouvelle adresse (départ)" value={edl.locataire.adresseDepart} ro={ro} onInput={(v) => maj((d) => (d.locataire.adresseDepart = v))} />}
      </fieldset>
      <fieldset>
        <legend>
          <strong>Bailleur / mandataire</strong>
        </legend>
        <Champ label="Nom" value={edl.bailleur.nom} ro={ro} onInput={(v) => maj((d) => { d.bailleur.nom = v; d.signatures.bailleur.nom = v; })} />
        <Champ label="Adresse" value={edl.bailleur.adresse} ro={ro} onInput={(v) => maj((d) => (d.bailleur.adresse = v))} />
      </fieldset>
      <fieldset>
        <legend>
          <strong>Logement</strong>
        </legend>
        <Champ label="Nom" value={edl.logement.nom} ro={ro} onInput={(v) => maj((d) => (d.logement.nom = v))} />
        <Champ label="Adresse" value={edl.logement.adresse} ro={ro} onInput={(v) => maj((d) => (d.logement.adresse = v))} />
        <Champ label="Description" value={edl.logement.description} ro={ro} onInput={(v) => maj((d) => (d.logement.description = v))} />
      </fieldset>
      <Champ label="Fait à (ville)" value={edl.faitA} ro={ro} onInput={(v) => maj((d) => (d.faitA = v))} />
      <p>
        <strong>Tampon GPS :</strong>{' '}
        {edl.gps ? (
          <a href={`https://www.openstreetmap.org/?mlat=${edl.gps.lat}&mlon=${edl.gps.lon}#map=18/${edl.gps.lat}/${edl.gps.lon}`} target="_blank" rel="noopener">
            {edl.gps.lat.toFixed(5)}, {edl.gps.lon.toFixed(5)} (±{Math.round(edl.gps.precision)} m) — {dateHeureFr(edl.gps.date)}
          </a>
        ) : (
          'aucun'
        )}
      </p>
      {!ro && (
        <button
          class="outline"
          aria-busy={gpsEnCours}
          onClick={async () => {
            setGps(true);
            await tamponGps(maj);
            setGps(false);
          }}
        >
          📍 Tamponner position et heure
        </button>
      )}
      <details>
        <summary>Mentions légales du rapport</summary>
        <Texte lignes={6} value={edl.mentions} ro={ro} onInput={(v) => maj((d) => (d.mentions = v))} />
      </details>
    </>
  );
}

/* ---------- Pièces & éléments ---------- */

function EcranPiece({ edl, maj, ro, pieceId }: { edl: Edl; maj: Maj; ro: boolean; pieceId: string }) {
  const idx = edl.pieces.findIndex((p) => p.id === pieceId);
  const p = edl.pieces[idx];
  if (!p) return <p>Pièce introuvable.</p>;
  const majPiece = (fn: (d: Edl, i: number) => void) =>
    maj((d) => {
      const i = d.pieces.findIndex((x) => x.id === pieceId);
      if (i >= 0) fn(d, i);
    });
  return (
    <>
      <ListeElements
        titre={p.nom}
        elements={p.elements}
        sortie={edl.type === 'sortie'}
        ro={ro}
        maj={(fn) => majPiece((d, i) => fn(d.pieces[i].elements))}
        aideAjout="Nom de l'élément"
      />
      {!ro && (
        <details class="outils-piece">
          <summary>Modifier la pièce</summary>
          <label>
            Nom de la pièce
            <input value={p.nom} onInput={(e) => majPiece((d, i) => (d.pieces[i].nom = (e.target as HTMLInputElement).value))} />
          </label>
          <div class="grid">
            <button class="secondary outline" disabled={idx === 0} onClick={() => majPiece((d, i) => d.pieces.splice(i - 1, 0, ...d.pieces.splice(i, 1)))}>
              ▲ Monter
            </button>
            <button class="secondary outline" disabled={idx === edl.pieces.length - 1} onClick={() => majPiece((d, i) => d.pieces.splice(i + 1, 0, ...d.pieces.splice(i, 1)))}>
              ▼ Descendre
            </button>
            <button
              class="contrast outline"
              onClick={() => {
                if (confirm(`Supprimer la pièce « ${p.nom} » et ses ${p.elements.length} éléments ?`)) {
                  aller(`edl/${edl.id}`);
                  majPiece((d, i) => d.pieces.splice(i, 1));
                }
              }}
            >
              Supprimer
            </button>
          </div>
        </details>
      )}
    </>
  );
}

function ListeElements(props: {
  titre: string;
  elements: Element[];
  sortie: boolean;
  ro: boolean;
  maj: (fn: (els: Element[]) => void) => void;
  aideAjout: string;
}) {
  const { elements, sortie, ro, maj } = props;
  const [nouveau, setNouveau] = useState('');
  const [edition, setEdition] = useState(false);
  const pr = progressionElements(elements);
  const majEl = (id: string, fn: (e: Element) => void) =>
    maj((els) => {
      const e = els.find((x) => x.id === id);
      if (e) fn(e);
    });
  const nonRenseignes = elements.filter((e) => !e.etat).length;
  return (
    <>
      <h2 class="titre-piece">
        {props.titre} <small>{pr.faits}/{pr.total}</small>
      </h2>
      {!ro && nonRenseignes > 0 && (
        <div class="grid actions-piece">
          <button class="outline" onClick={() => maj((els) => els.forEach((e) => (e.etat ??= 'B')))}>
            Tout le reste à « B »
          </button>
          {sortie && (
            <button class="outline secondary" onClick={() => maj((els) => els.forEach((e) => (e.etat ??= e.entree?.etat)))}>
              Reste = état d'entrée
            </button>
          )}
        </div>
      )}
      {elements.map((el, i) => (
        <CarteElement
          key={el.id}
          el={el}
          ro={ro}
          sortie={sortie}
          edition={edition}
          majEl={(fn) => majEl(el.id, fn)}
          onMonter={i > 0 ? () => maj((els) => els.splice(i - 1, 0, ...els.splice(i, 1))) : undefined}
          onSupprimer={() => confirm(`Supprimer « ${el.nom} » ?`) && maj((els) => els.splice(els.findIndex((x) => x.id === el.id), 1))}
        />
      ))}
      {!ro && (
        <>
          <form
            role="group"
            onSubmit={(e) => {
              e.preventDefault();
              if (!nouveau.trim()) return;
              maj((els) => els.push(nouvelElement(nouveau.trim())));
              setNouveau('');
            }}
          >
            <input placeholder={props.aideAjout} value={nouveau} onInput={(e) => setNouveau((e.target as HTMLInputElement).value)} />
            <button type="submit">Ajouter</button>
          </form>
          <label>
            <input type="checkbox" role="switch" checked={edition} onChange={() => setEdition(!edition)} /> Modifier la liste (noms, ordre, suppression)
          </label>
        </>
      )}
    </>
  );
}

function CarteElement({
  el, ro, sortie, edition, majEl, onMonter, onSupprimer,
}: {
  el: Element;
  ro: boolean;
  sortie: boolean;
  edition: boolean;
  majEl: (fn: (e: Element) => void) => void;
  onMonter?: () => void;
  onSupprimer: () => void;
}) {
  const [ouvert, setOuvert] = useState(!!el.commentaire);
  const degrade = sortie && (estDegrade(el.entree?.etat, el.etat) || (el.entree?.quantite != null && el.quantite < el.entree.quantite));
  return (
    <article class={`element ${el.etat ? 'rempli' : ''} ${degrade ? 'degrade' : ''}`}>
      <div class="ligne-element">
        {edition && !ro ? (
          <input class="nom-edit" value={el.nom} onInput={(e) => majEl((x) => (x.nom = (e.target as HTMLInputElement).value))} />
        ) : (
          <strong class="nom" onClick={() => setOuvert(!ouvert)}>
            {el.nom}
          </strong>
        )}
        <span class="qte">
          {!ro && <button class="mini secondary outline" onClick={() => majEl((x) => (x.quantite = Math.max(0, x.quantite - 1)))}>−</button>}
          <span title="Quantité">×{el.quantite}</span>
          {!ro && <button class="mini secondary outline" onClick={() => majEl((x) => (x.quantite += 1))}>+</button>}
        </span>
      </div>
      {edition && !ro && (
        <div class="grid outils-element">
          <button class="mini secondary outline" disabled={!onMonter} onClick={onMonter}>
            ▲ Monter
          </button>
          <button class="mini contrast outline" onClick={onSupprimer}>
            Supprimer
          </button>
        </div>
      )}
      {sortie && el.entree && (
        <div class="ref-entree">
          <span>
            Entrée : <EtatBadge etat={el.entree.etat} />
            {el.entree.quantite != null && el.entree.quantite !== el.quantite && <> ×{el.entree.quantite}</>} {el.entree.commentaire}
          </span>
          <Photos ids={el.entree.photos} ro />
        </div>
      )}
      <EtatBoutons valeur={el.etat} ro={ro} onChange={(v) => majEl((x) => (v ? (x.etat = v) : delete x.etat))} />
      {ouvert || el.commentaire || ro ? (
        (el.commentaire || !ro) && (
          <Texte value={el.commentaire} ro={ro} placeholder="Commentaire (micro du clavier pour dicter)" onInput={(v) => majEl((x) => (x.commentaire = v))} />
        )
      ) : (
        <button class="lien" onClick={() => setOuvert(true)}>
          + commentaire
        </button>
      )}
      <Photos ids={el.photos} ro={ro} onChange={(ids) => majEl((x) => (x.photos = ids))} />
    </article>
  );
}

/* ---------- Compteurs ---------- */

const LIB_COMPTEUR: Record<TypeCompteur, string> = {
  eau: 'Eau froide',
  eau_chaude: 'Eau chaude',
  electricite: 'Électricité',
  gaz: 'Gaz',
  autre: 'Autre',
};

function Compteurs({ edl, maj, ro }: { edl: Edl; maj: Maj; ro: boolean }) {
  const majC = (id: string, fn: (c: Edl['compteurs'][number]) => void) =>
    maj((d) => {
      const c = d.compteurs.find((x) => x.id === id);
      if (c) fn(c);
    });
  return (
    <>
      <h2>Compteurs</h2>
      {edl.compteurs.map((c) => (
        <article key={c.id} class="element">
          <div class="grid">
            <label>
              Compteur
              <input value={c.nom} readOnly={ro} onInput={(e) => majC(c.id, (x) => (x.nom = (e.target as HTMLInputElement).value))} />
            </label>
            <label>
              N° / emplacement
              <input value={c.numero} readOnly={ro} onInput={(e) => majC(c.id, (x) => (x.numero = (e.target as HTMLInputElement).value))} />
            </label>
          </div>
          {c.entree && (
            <p class="ref-entree">
              Index d'entrée : <strong>{c.entree.index || '—'}</strong>
              <Photos ids={c.entree.photos} ro />
            </p>
          )}
          <label>
            Index {edl.type === 'sortie' ? 'de sortie' : ''}
            <input inputMode="decimal" value={c.index} readOnly={ro} onInput={(e) => majC(c.id, (x) => (x.index = (e.target as HTMLInputElement).value))} />
          </label>
          {c.entree && consommation(c.entree.index, c.index) && <p>Consommation : {consommation(c.entree.index, c.index)}</p>}
          <Photos ids={c.photos} ro={ro} onChange={(ids) => majC(c.id, (x) => (x.photos = ids))} />
          {!ro && (
            <div class="grid">
              <select value={c.type} onChange={(e) => majC(c.id, (x) => (x.type = (e.target as HTMLSelectElement).value as TypeCompteur))}>
                {Object.entries(LIB_COMPTEUR).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </select>
              <button class="mini contrast outline" onClick={() => confirm(`Supprimer « ${c.nom} » ?`) && maj((d) => (d.compteurs = d.compteurs.filter((x) => x.id !== c.id)))}>
                Supprimer
              </button>
            </div>
          )}
        </article>
      ))}
      {!ro && (
        <button class="outline" onClick={() => maj((d) => d.compteurs.push(nouveauCompteur('autre', 'Compteur')))}>
          + Ajouter un compteur
        </button>
      )}
    </>
  );
}

/* ---------- Vérifications ---------- */

function Verifications({ edl, maj, ro }: { edl: Edl; maj: Maj; ro: boolean }) {
  const [nouveau, setNouveau] = useState('');
  const majV = (id: string, fn: (v: Edl['verifications'][number]) => void) =>
    maj((d) => {
      const v = d.verifications.find((x) => x.id === id);
      if (v) fn(v);
    });
  const opts: [StatutVerif, string][] = [
    ['ok', 'OK'],
    ['nok', 'Non OK'],
    ['na', 'N/A'],
  ];
  return (
    <>
      <h2>Vérifications rapides</h2>
      {edl.verifications.map((v) => (
        <article key={v.id} class="element">
          <div class="ligne-element">
            <strong>{v.nom}</strong>
            {!ro && (
              <button class="mini contrast outline" onClick={() => maj((d) => (d.verifications = d.verifications.filter((x) => x.id !== v.id)))}>
                ✕
              </button>
            )}
          </div>
          <div class="etats verifs">
            {opts.map(([k, l]) => (
              <button key={k} class={`etat v-${k} ${v.statut === k ? 'actif' : ''}`} disabled={ro} onClick={() => majV(v.id, (x) => (x.statut === k ? delete x.statut : (x.statut = k)))}>
                {l}
              </button>
            ))}
          </div>
          {(v.commentaire || !ro) && <Texte value={v.commentaire} ro={ro} placeholder="Commentaire" onInput={(t) => majV(v.id, (x) => (x.commentaire = t))} />}
        </article>
      ))}
      {!ro && (
        <form
          role="group"
          onSubmit={(e) => {
            e.preventDefault();
            if (nouveau.trim()) maj((d) => d.verifications.push({ id: uid('vf_'), nom: nouveau.trim(), commentaire: '' }));
            setNouveau('');
          }}
        >
          <input placeholder="Autre point à vérifier" value={nouveau} onInput={(e) => setNouveau((e.target as HTMLInputElement).value)} />
          <button type="submit">Ajouter</button>
        </form>
      )}
    </>
  );
}

/* ---------- Synthèse ---------- */

function Synthese({ edl }: { edl: Edl }) {
  const liste = ecarts(edl);
  const nonRenseignes = [...edl.pieces.flatMap((p) => p.elements.map((e) => [p.nom, e] as const)), ...edl.cles.map((e) => ['Clés', e] as const)].filter(([, e]) => !e.etat);
  return (
    <>
      <h2>Synthèse des écarts</h2>
      {liste.length === 0 ? (
        <p>✅ Aucune dégradation constatée par rapport à l'entrée.</p>
      ) : (
        liste.map((x, i) => (
          <article key={i} class="element degrade">
            <small>{x.zone}</small>
            <div class="ligne-element">
              <strong>{x.element}</strong>
              <span>
                <EtatBadge etat={x.avant} /> → <EtatBadge etat={x.apres} />
                {x.motif === 'quantite' && (
                  <>
                    {' '}
                    (×{x.quantiteAvant} → ×{x.quantiteApres})
                  </>
                )}
              </span>
            </div>
            {x.commentaire && <p>{x.commentaire}</p>}
            <Photos ids={x.photos} ro />
          </article>
        ))
      )}
      {nonRenseignes.length > 0 && (
        <details>
          <summary>{nonRenseignes.length} élément(s) non renseigné(s)</summary>
          <ul>
            {nonRenseignes.map(([z, e]) => (
              <li key={e.id}>
                {z} — {e.nom}
              </li>
            ))}
          </ul>
        </details>
      )}
      <p class="petit">
        Légende : {ETATS.map((e) => `${e} = ${ETAT_DESCRIPTION[e]}`).join(' · ')}
      </p>
    </>
  );
}

/* ---------- Signatures ---------- */

function Signatures({ edl, maj }: { edl: Edl; maj: Maj }) {
  const [qui, setQui] = useState<'bailleur' | 'locataire'>();
  const signe = estSigne(edl);
  const { faits, total } = progression(edl);
  return (
    <>
      <h2>Signatures</h2>
      {faits < total && !signe && <p class="bandeau">⚠️ {total - faits} élément(s) non renseigné(s).</p>}
      <p>
        Fait {edl.faitA ? `à ${edl.faitA}` : ''} le {edl.date.split('-').reverse().join('/')}. Chaque partie signe précédée de la mention « certifié exact ».
      </p>
      {(['bailleur', 'locataire'] as const).map((q) => {
        const s = edl.signatures[q];
        return (
          <article key={q}>
            <header>
              <strong>{q === 'bailleur' ? 'Bailleur' : 'Locataire'}</strong>
            </header>
            <label>
              Nom
              <input value={s.nom} readOnly={!!s.image} onInput={(e) => maj((d) => (d.signatures[q].nom = (e.target as HTMLInputElement).value))} />
            </label>
            {qui === q ? (
              <PadSignature
                onAnnuler={() => setQui(undefined)}
                onValider={(png) => {
                  maj((d) => {
                    d.signatures[q].image = png;
                    d.signatures[q].date = new Date().toISOString();
                  });
                  setQui(undefined);
                  if (!edl.gps) tamponGps(maj);
                }}
              />
            ) : s.image ? (
              <>
                <img class="signature" src={s.image} alt="Signature" />
                <small>Signé le {dateHeureFr(s.date)}</small>
              </>
            ) : (
              <button class="large" onClick={() => setQui(q)}>
                ✍️ Signer
              </button>
            )}
          </article>
        );
      })}
      {(edl.signatures.bailleur.image || edl.signatures.locataire.image) && (
        <button
          class="contrast outline"
          onClick={() => {
            if (confirm('Effacer les signatures pour modifier l’EDL ? Il faudra signer à nouveau.'))
              maj((d) => {
                delete d.signatures.bailleur.image;
                delete d.signatures.locataire.image;
                delete d.signatures.bailleur.date;
                delete d.signatures.locataire.date;
              });
          }}
        >
          Effacer les signatures (pour modifier)
        </button>
      )}
    </>
  );
}
