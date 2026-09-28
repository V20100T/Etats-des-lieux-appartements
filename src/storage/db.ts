/** Stockage local (IndexedDB via idb-keyval). Tout ce qui est relu passe par les migrations. */
import { createStore, del, delMany, entries, get, keys, set, setMany, getMany } from 'idb-keyval';
import { MODELES_PIECES, REGLAGES_DEFAUT } from '../data/modeles';
import { uid } from '../model/ids';
import { lireEdl, lireLogement } from '../model/migrate';
import type { Edl, Logement, ModelePiece, Reglages } from '../model/types';
import { photosDeEdl, type Lot, type PhotoData } from '../io/paquet';

const donnees = createStore('edl-donnees', 'kv');
const photos = createStore('edl-photos', 'kv');

/** Photos stockées en ArrayBuffer (plus fiable que Blob sur d'anciens Safari iOS). */
interface PhotoStockee {
  type: string;
  data: ArrayBuffer;
  creeLe: string;
}

const K = {
  logement: (id: string) => `logement:${id}`,
  edl: (id: string) => `edl:${id}`,
  reglages: 'reglages',
  modeles: 'modelesPieces',
  sauvegarde: 'derniereSauvegarde',
};

async function lister<T>(prefixe: string, lire: (x: unknown) => T): Promise<T[]> {
  const tout = await entries(donnees);
  const res: T[] = [];
  for (const [k, v] of tout) {
    if (typeof k === 'string' && k.startsWith(prefixe)) {
      try {
        res.push(lire(v));
      } catch (e) {
        console.error('Donnée illisible', k, e);
      }
    }
  }
  return res;
}

export const listerLogements = () =>
  lister('logement:', lireLogement).then((l) => l.sort((a, b) => a.nom.localeCompare(b.nom, 'fr')));

export async function chargerLogement(id: string): Promise<Logement | undefined> {
  const v = await get(K.logement(id), donnees);
  return v ? lireLogement(v) : undefined;
}

export const enregistrerLogement = (l: Logement) => set(K.logement(l.id), { ...l, modifieLe: new Date().toISOString() }, donnees);

export const listerEdls = (logementId?: string) =>
  lister('edl:', lireEdl).then((l) =>
    l.filter((e) => !logementId || e.logementId === logementId).sort((a, b) => b.date.localeCompare(a.date) || b.creeLe.localeCompare(a.creeLe)),
  );

export async function chargerEdl(id: string): Promise<Edl | undefined> {
  const v = await get(K.edl(id), donnees);
  return v ? lireEdl(v) : undefined;
}

export const enregistrerEdl = (e: Edl) => set(K.edl(e.id), e, donnees);

export async function supprimerEdl(id: string): Promise<void> {
  await del(K.edl(id), donnees);
  await nettoyerPhotos();
}

export async function supprimerLogement(id: string): Promise<void> {
  const edls = await listerEdls(id);
  await delMany([K.logement(id), ...edls.map((e) => K.edl(e.id))], donnees);
  await nettoyerPhotos();
}

/* ---------- Photos ---------- */

export async function ajouterPhoto(blob: Blob): Promise<string> {
  const id = uid('ph_');
  const p: PhotoStockee = { type: blob.type || 'image/jpeg', data: await blob.arrayBuffer(), creeLe: new Date().toISOString() };
  await set(id, p, photos);
  return id;
}

export async function lirePhoto(id: string): Promise<PhotoData | undefined> {
  const p = (await get(id, photos)) as PhotoStockee | undefined;
  return p ? { id, type: p.type, octets: new Uint8Array(p.data) } : undefined;
}

const cacheUrls = new Map<string, Promise<string | undefined>>();

/** URL objet d'une photo (mise en cache pour la session). */
export function urlPhoto(id: string): Promise<string | undefined> {
  let u = cacheUrls.get(id);
  if (!u) {
    u = lirePhoto(id).then((p) => (p ? URL.createObjectURL(new Blob([p.octets as BlobPart], { type: p.type })) : undefined));
    cacheUrls.set(id, u);
  }
  return u;
}

/** Supprime les photos qui ne sont plus référencées par aucun EDL. */
export async function nettoyerPhotos(): Promise<number> {
  const utilisees = new Set((await listerEdls()).flatMap(photosDeEdl));
  const orphelines = (await keys(photos)).filter((k) => !utilisees.has(String(k)));
  // Garde les photos très récentes (EDL en cours d'enregistrement).
  const anciennes: IDBValidKey[] = [];
  const infos = (await getMany(orphelines, photos)) as (PhotoStockee | undefined)[];
  const limite = Date.now() - 10 * 60 * 1000;
  orphelines.forEach((k, i) => {
    const t = Date.parse(infos[i]?.creeLe ?? '');
    if (!(t > limite)) anciennes.push(k);
  });
  await delMany(anciennes, photos);
  return anciennes.length;
}

/* ---------- Réglages & modèles ---------- */

export async function chargerReglages(): Promise<Reglages> {
  const r = (await get(K.reglages, donnees)) as Partial<Reglages> | undefined;
  return {
    bailleur: { ...REGLAGES_DEFAUT.bailleur, ...(r?.bailleur ?? {}) },
    faitA: r?.faitA ?? REGLAGES_DEFAUT.faitA,
    mentions: r?.mentions ?? REGLAGES_DEFAUT.mentions,
  };
}

export const enregistrerReglages = (r: Reglages) => set(K.reglages, r, donnees);

export async function chargerModelesPieces(): Promise<ModelePiece[]> {
  const m = (await get(K.modeles, donnees)) as ModelePiece[] | undefined;
  return Array.isArray(m) && m.length ? m : MODELES_PIECES;
}

export const enregistrerModelesPieces = (m: ModelePiece[]) => set(K.modeles, m, donnees);
export const reinitialiserModelesPieces = () => del(K.modeles, donnees);

/* ---------- Import / sauvegarde ---------- */

export async function edlsExistants(lot: Lot): Promise<Edl[]> {
  const res: Edl[] = [];
  for (const e of lot.edls) {
    const x = await chargerEdl(e.id);
    if (x) res.push(x);
  }
  return res;
}

export async function importerLot(lot: Lot, remplacer: boolean): Promise<{ edls: number; logements: number; photos: number }> {
  const aEcrire: [IDBValidKey, unknown][] = [];
  let nbEdls = 0;
  let nbLog = 0;
  for (const l of lot.logements) {
    if (!(await get(K.logement(l.id), donnees)) || remplacer) {
      aEcrire.push([K.logement(l.id), l]);
      nbLog++;
    }
  }
  for (const e of lot.edls) {
    if (!(await get(K.edl(e.id), donnees)) || remplacer) {
      aEcrire.push([K.edl(e.id), e]);
      nbEdls++;
    }
  }
  if (lot.reglages) aEcrire.push([K.reglages, lot.reglages]);
  if (lot.modelesPieces?.length) aEcrire.push([K.modeles, lot.modelesPieces]);
  await setMany(aEcrire, donnees);
  const existantes = new Set((await keys(photos)).map(String));
  const nouvelles = lot.photos.filter((p) => !existantes.has(p.id));
  await setMany(
    nouvelles.map((p) => [p.id, { type: p.type, data: p.octets.slice().buffer, creeLe: new Date().toISOString() } satisfies PhotoStockee]),
    photos,
  );
  return { edls: nbEdls, logements: nbLog, photos: nouvelles.length };
}

export async function toutExporter(): Promise<Lot> {
  const [logements, edls, reglages, modeles] = await Promise.all([
    listerLogements(),
    listerEdls(),
    chargerReglages(),
    get(K.modeles, donnees) as Promise<ModelePiece[] | undefined>,
  ]);
  const ids = [...new Set(edls.flatMap(photosDeEdl))];
  const ph = (await Promise.all(ids.map(lirePhoto))).filter((p): p is PhotoData => !!p);
  return { logements, edls, photos: ph, reglages, modelesPieces: modeles };
}

export const noterSauvegarde = () => set(K.sauvegarde, new Date().toISOString(), donnees);
export const derniereSauvegarde = () => get(K.sauvegarde, donnees) as Promise<string | undefined>;

export async function demanderPersistance(): Promise<boolean> {
  try {
    return (await navigator.storage?.persist?.()) ?? false;
  } catch {
    return false;
  }
}
