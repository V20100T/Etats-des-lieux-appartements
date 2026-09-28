/**
 * Lecture tolérante et migrations des données.
 *
 * Toute donnée venant de l'extérieur (import) ou du stockage passe par ici :
 *  1. on refuse un schéma plus récent que celui que l'app connaît ;
 *  2. on applique les migrations successives v(n) -> v(n+1) ;
 *  3. on normalise (champs manquants remplis par des valeurs par défaut).
 *
 * Pour ajouter une v2 : ajouter MIGRATIONS[1] = (v1) => v2 et incrémenter SCHEMA_VERSION.
 * Ne JAMAIS modifier une migration existante : les fichiers v1 doivent toujours se relire.
 */
import { lireEtat } from './etats';
import { uid } from './ids';
import type {
  Compteur, Edl, Element, Logement, Piece, RefEntree, Signature, StatutVerif, TypeCompteur, Verification,
} from './types';
import { SCHEMA_VERSION } from './types';

export class FormatTropRecent extends Error {
  constructor(v: number) {
    super(`Ce fichier a été créé avec une version plus récente de l'application (schéma ${v}). Mettez l'application à jour.`);
  }
}

type Brut = Record<string, any>;
type Migration = (d: Brut) => Brut;

/** MIGRATIONS[n] transforme un EDL du schéma n vers n+1. */
const MIGRATIONS_EDL: Record<number, Migration> = {};
const MIGRATIONS_LOGEMENT: Record<number, Migration> = {};

function versionDe(d: Brut): number {
  const v = Number(d?.schema ?? 1);
  return Number.isFinite(v) && v >= 1 ? Math.floor(v) : 1;
}

function migrer(d: Brut, table: Record<number, Migration>): Brut {
  let v = versionDe(d);
  if (v > SCHEMA_VERSION) throw new FormatTropRecent(v);
  let cur = d;
  while (v < SCHEMA_VERSION) {
    const m = table[v];
    if (m) cur = m(cur);
    v++;
  }
  return cur;
}

const str = (v: unknown, def = ''): string => (v == null ? def : String(v));
const num = (v: unknown, def = 1): number => {
  const n = typeof v === 'number' ? v : parseFloat(String(v ?? '').replace(',', '.'));
  return Number.isFinite(n) ? n : def;
};
const arr = <T>(v: unknown): T[] => (Array.isArray(v) ? v : []);
const strs = (v: unknown): string[] => arr<unknown>(v).map((x) => String(x)).filter(Boolean);

function refEntree(r: Brut | undefined): RefEntree | undefined {
  if (!r || typeof r !== 'object') return undefined;
  return {
    etat: lireEtat(r.etat),
    quantite: r.quantite == null ? undefined : num(r.quantite),
    commentaire: str(r.commentaire),
    photos: strs(r.photos),
  };
}

function element(e: Brut): Element {
  const el: Element = {
    id: str(e?.id) || uid('el_'),
    nom: str(e?.nom),
    quantite: num(e?.quantite, 1),
    etat: lireEtat(e?.etat),
    commentaire: str(e?.commentaire),
    photos: strs(e?.photos),
  };
  const r = refEntree(e?.entree);
  if (r) el.entree = r;
  if (!el.etat) delete el.etat;
  return el;
}

function piece(p: Brut): Piece {
  return { id: str(p?.id) || uid('pc_'), nom: str(p?.nom), elements: arr<Brut>(p?.elements).map(element) };
}

const TYPES_COMPTEUR: TypeCompteur[] = ['eau', 'eau_chaude', 'electricite', 'gaz', 'autre'];

function compteur(c: Brut): Compteur {
  const type = TYPES_COMPTEUR.includes(c?.type) ? c.type : 'autre';
  const res: Compteur = {
    id: str(c?.id) || uid('ct_'),
    type,
    nom: str(c?.nom),
    numero: str(c?.numero),
    index: str(c?.index),
    photos: strs(c?.photos),
  };
  if (c?.entree) res.entree = { index: str(c.entree.index), photos: strs(c.entree.photos) };
  return res;
}

function verification(v: Brut): Verification {
  const statut: StatutVerif | undefined = ['ok', 'nok', 'na'].includes(v?.statut) ? v.statut : undefined;
  const res: Verification = { id: str(v?.id) || uid('vf_'), nom: str(v?.nom), commentaire: str(v?.commentaire) };
  if (statut) res.statut = statut;
  return res;
}

function signature(s: Brut | undefined): Signature {
  const res: Signature = { nom: str(s?.nom) };
  if (s?.image) res.image = str(s.image);
  if (s?.date) res.date = str(s.date);
  return res;
}

/** Normalise un EDL brut (n'importe quelle version connue) vers le schéma courant. */
export function lireEdl(brut: unknown): Edl {
  if (!brut || typeof brut !== 'object') throw new Error('EDL invalide');
  const d = migrer(brut as Brut, MIGRATIONS_EDL);
  const t = new Date().toISOString();
  const edl: Edl = {
    schema: SCHEMA_VERSION,
    id: str(d.id) || uid('edl_'),
    logementId: str(d.logementId) || uid('lg_'),
    type: d.type === 'sortie' ? 'sortie' : 'entree',
    date: str(d.date).slice(0, 10) || t.slice(0, 10),
    logement: {
      nom: str(d.logement?.nom),
      adresse: str(d.logement?.adresse),
      description: str(d.logement?.description),
    },
    bailleur: { nom: str(d.bailleur?.nom), adresse: str(d.bailleur?.adresse) },
    locataire: {
      nom: str(d.locataire?.nom),
      adresse: str(d.locataire?.adresse),
      adresseDepart: str(d.locataire?.adresseDepart),
    },
    pieces: arr<Brut>(d.pieces).map(piece),
    cles: arr<Brut>(d.cles).map(element),
    compteurs: arr<Brut>(d.compteurs).map(compteur),
    verifications: arr<Brut>(d.verifications).map(verification),
    observations: str(d.observations),
    mentions: str(d.mentions),
    faitA: str(d.faitA),
    signatures: { bailleur: signature(d.signatures?.bailleur), locataire: signature(d.signatures?.locataire) },
    creeLe: str(d.creeLe) || t,
    modifieLe: str(d.modifieLe) || t,
  };
  if (d.entreeId) edl.entreeId = str(d.entreeId);
  if (d.gps && Number.isFinite(Number(d.gps.lat)) && Number.isFinite(Number(d.gps.lon))) {
    edl.gps = { lat: Number(d.gps.lat), lon: Number(d.gps.lon), precision: num(d.gps.precision, 0), date: str(d.gps.date) };
  }
  return edl;
}

export function lireLogement(brut: unknown): Logement {
  if (!brut || typeof brut !== 'object') throw new Error('Logement invalide');
  const d = migrer(brut as Brut, MIGRATIONS_LOGEMENT);
  const t = new Date().toISOString();
  return {
    schema: SCHEMA_VERSION,
    id: str(d.id) || uid('lg_'),
    nom: str(d.nom),
    adresse: str(d.adresse),
    description: str(d.description),
    creeLe: str(d.creeLe) || t,
    modifieLe: str(d.modifieLe) || t,
  };
}

/** Vérifie la version d'un conteneur (sauvegarde, manifest) avant lecture. */
export function verifierVersion(d: Brut): void {
  const v = versionDe(d);
  if (v > SCHEMA_VERSION) throw new FormatTropRecent(v);
}
