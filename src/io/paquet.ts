/**
 * Formats de fichiers échangés (voir docs/FORMAT.md) :
 *  - ZIP d'un EDL : manifest.json + edl.json + edl.csv + rapport.html + photos/ + signatures/
 *  - Sauvegarde complète JSON : { format: "edl-sauvegarde", schema, logements, edls, photos, ... }
 *  - CSV / XLSX : voir tableau.ts
 */
import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate';
import { lireEdl, lireLogement, verifierVersion } from '../model/migrate';
import type { Edl, Logement, ModelePiece, Reglages } from '../model/types';
import { SCHEMA_VERSION } from '../model/types';
import { decoderTexte, genererCsv, parserCsv } from './csv';
import { edlVersLignes, feuillesVersEdl, lignesVersEdl } from './tableau';
import { lireXlsx } from './xlsx';

export interface PhotoData {
  id: string;
  type: string;
  octets: Uint8Array;
}

/** Ensemble de données à importer / exporter. */
export interface Lot {
  logements: Logement[];
  edls: Edl[];
  photos: PhotoData[];
  reglages?: Reglages;
  modelesPieces?: ModelePiece[];
}

export const FORMAT_ZIP = 'edl-zip';
export const FORMAT_DOCUMENT = 'edl-document';
export const FORMAT_SAUVEGARDE = 'edl-sauvegarde';

/** Tous les identifiants de photos référencés par un EDL (y compris les photos d'entrée recopiées). */
export function photosDeEdl(edl: Edl): string[] {
  const ids = new Set<string>();
  const els = [...edl.pieces.flatMap((p) => p.elements), ...edl.cles];
  for (const e of els) {
    e.photos.forEach((p) => ids.add(p));
    e.entree?.photos.forEach((p) => ids.add(p));
  }
  for (const c of edl.compteurs) {
    c.photos.forEach((p) => ids.add(p));
    c.entree?.photos.forEach((p) => ids.add(p));
  }
  return [...ids];
}

const EXT: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };
const MIME: Record<string, string> = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp' };

export function nomFichierEdl(edl: Edl): string {
  const nom = `EDL ${edl.type === 'entree' ? 'entree' : 'sortie'} ${edl.logement.nom} ${edl.date}`;
  return nom.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\w.-]+/g, '_');
}

export function exporterCsv(edl: Edl): string {
  return genererCsv(edlVersLignes(edl));
}

function dataUrlVersOctets(url: string): { type: string; octets: Uint8Array } | undefined {
  const m = /^data:([^;,]+)?(;base64)?,(.*)$/s.exec(url);
  if (!m) return undefined;
  const type = m[1] ?? 'application/octet-stream';
  if (m[2]) {
    const bin = atob(m[3]);
    const octets = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) octets[i] = bin.charCodeAt(i);
    return { type, octets };
  }
  return { type, octets: strToU8(decodeURIComponent(m[3])) };
}

export function octetsVersDataUrl(type: string, octets: Uint8Array): string {
  let bin = '';
  for (let i = 0; i < octets.length; i += 0x8000) bin += String.fromCharCode(...octets.subarray(i, i + 0x8000));
  return `data:${type};base64,${btoa(bin)}`;
}

export function exporterZip(edl: Edl, logement: Logement | undefined, photos: PhotoData[], rapportHtml: string, version = '0'): Uint8Array {
  const fichiers: Record<string, Uint8Array> = {};
  const photosListe: { id: string; fichier: string; type: string }[] = [];
  for (const p of photos) {
    const fichier = `photos/${p.id}.${EXT[p.type] ?? 'bin'}`;
    fichiers[fichier] = p.octets;
    photosListe.push({ id: p.id, fichier, type: p.type });
  }
  const signatures: Record<string, string> = {};
  for (const qui of ['bailleur', 'locataire'] as const) {
    const img = edl.signatures[qui].image;
    const d = img ? dataUrlVersOctets(img) : undefined;
    if (d) {
      signatures[qui] = `signatures/${qui}.png`;
      fichiers[signatures[qui]] = d.octets;
    }
  }
  fichiers['edl.json'] = strToU8(JSON.stringify({ format: FORMAT_DOCUMENT, schema: SCHEMA_VERSION, edl, logement }, null, 2));
  fichiers['edl.csv'] = strToU8(exporterCsv(edl));
  fichiers['rapport.html'] = strToU8(rapportHtml);
  fichiers['manifest.json'] = strToU8(
    JSON.stringify(
      {
        format: FORMAT_ZIP,
        schema: SCHEMA_VERSION,
        app: { nom: 'etats-des-lieux', version },
        exporteLe: new Date().toISOString(),
        edl: { id: edl.id, type: edl.type, logement: edl.logement.nom, date: edl.date },
        fichiers: { edl: 'edl.json', csv: 'edl.csv', rapport: 'rapport.html', photos: photosListe, signatures },
      },
      null,
      2,
    ),
  );
  return zipSync(fichiers, { level: 0 }); // photos déjà compressées
}

export function exporterSauvegarde(lot: Lot, version = '0'): string {
  const photos: Record<string, string> = {};
  for (const p of lot.photos) photos[p.id] = octetsVersDataUrl(p.type, p.octets);
  return JSON.stringify({
    format: FORMAT_SAUVEGARDE,
    schema: SCHEMA_VERSION,
    app: { nom: 'etats-des-lieux', version },
    exporteLe: new Date().toISOString(),
    reglages: lot.reglages,
    modelesPieces: lot.modelesPieces,
    logements: lot.logements,
    edls: lot.edls,
    photos,
  });
}

/** Logement minimal reconstitué depuis l'instantané contenu dans un EDL. */
function logementDepuisEdl(edl: Edl): Logement {
  return lireLogement({ id: edl.logementId, ...edl.logement, creeLe: edl.creeLe });
}

function lireDocumentJson(d: any): Lot {
  verifierVersion(d);
  if (d.format === FORMAT_SAUVEGARDE) {
    const photos: PhotoData[] = [];
    for (const [id, url] of Object.entries(d.photos ?? {})) {
      const o = typeof url === 'string' ? dataUrlVersOctets(url) : undefined;
      if (o) photos.push({ id, ...o });
    }
    const edls = (Array.isArray(d.edls) ? d.edls : []).map(lireEdl);
    const logements = (Array.isArray(d.logements) ? d.logements : []).map(lireLogement);
    for (const e of edls) if (!logements.some((l: Logement) => l.id === e.logementId)) logements.push(logementDepuisEdl(e));
    return { logements, edls, photos, reglages: d.reglages, modelesPieces: d.modelesPieces };
  }
  const brut = d.format === FORMAT_DOCUMENT ? d.edl : d;
  if (!brut || !Array.isArray(brut.pieces)) throw new Error("Ce fichier JSON n'est pas un état des lieux reconnu.");
  const edl = lireEdl(brut);
  const logement = d.logement ? lireLogement(d.logement) : logementDepuisEdl(edl);
  logement.id = edl.logementId;
  return { logements: [logement], edls: [edl], photos: [] };
}

function lireZipEdl(fichiers: Record<string, Uint8Array>): Lot {
  const manifestBrut = fichiers['manifest.json'];
  const manifest = manifestBrut ? JSON.parse(strFromU8(manifestBrut)) : {};
  verifierVersion(manifest);
  const cheminEdl = manifest.fichiers?.edl ?? 'edl.json';
  let lot: Lot;
  if (fichiers[cheminEdl]) {
    lot = lireDocumentJson(JSON.parse(strFromU8(fichiers[cheminEdl])));
  } else {
    const csv = Object.keys(fichiers).find((f) => f.toLowerCase().endsWith('.csv'));
    if (!csv) throw new Error('Archive ZIP sans edl.json ni CSV.');
    lot = lotDepuisTableau(lignesVersEdl(parserCsv(decoderTexte(fichiers[csv])), csv.replace(/\.csv$/i, '')));
  }
  for (const [chemin, octets] of Object.entries(fichiers)) {
    const m = /^photos\/([^/]+)\.(\w+)$/.exec(chemin);
    if (m) lot.photos.push({ id: m[1], type: MIME[m[2].toLowerCase()] ?? 'application/octet-stream', octets });
  }
  return lot;
}

function lotDepuisTableau(r: { logement: Logement; edls: Edl[] }): Lot {
  return { logements: [r.logement], edls: r.edls, photos: [] };
}

/** Point d'entrée unique de l'import : détecte le format et renvoie les données normalisées. */
export function importerFichier(nomFichier: string, octets: Uint8Array, reglages?: Reglages): Lot {
  const base = nomFichier.replace(/\.[^.]+$/, '').replace(/[_]+/g, ' ').trim() || 'Logement importé';
  if (octets[0] === 0x50 && octets[1] === 0x4b) {
    const fichiers = unzipSync(octets);
    if (fichiers['xl/workbook.xml']) return lotDepuisTableau(feuillesVersEdl(lireXlsx(octets), base, reglages));
    return lireZipEdl(fichiers);
  }
  const texte = decoderTexte(octets);
  const debut = texte.trimStart()[0];
  if (debut === '{' || debut === '[') {
    let d: any;
    try {
      d = JSON.parse(texte);
    } catch {
      throw new Error('Fichier JSON illisible (corrompu ou incomplet).');
    }
    return lireDocumentJson(d);
  }
  if (/\.xls$/i.test(nomFichier)) throw new Error('Ancien format .xls non pris en charge : enregistrez-le en .xlsx ou .csv depuis Excel.');
  return lotDepuisTableau(lignesVersEdl(parserCsv(texte), base, reglages));
}
