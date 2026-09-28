/**
 * Schéma de données v1.
 *
 * RÈGLE DE COMPATIBILITÉ (voir docs/FORMAT.md) :
 *  - on ne supprime ni ne renomme jamais un champ existant ;
 *  - un nouveau champ est toujours optionnel, ou ajouté par une migration ;
 *  - tout changement incompatible => SCHEMA_VERSION + 1 et une migration dans migrate.ts.
 */
export const SCHEMA_VERSION = 1;

/** TB = Très bon, B = Bon, M = Moyen, KO = Mauvais, ABS = Absent */
export type Etat = 'TB' | 'B' | 'M' | 'KO' | 'ABS';
export type TypeEdl = 'entree' | 'sortie';

/** Rappel de l'état d'entrée, copié dans l'EDL de sortie (qui reste autonome). */
export interface RefEntree {
  etat?: Etat;
  quantite?: number;
  commentaire: string;
  photos: string[];
}

export interface Element {
  id: string;
  nom: string;
  quantite: number;
  etat?: Etat;
  commentaire: string;
  /** Identifiants de photos (stockées à part). */
  photos: string[];
  entree?: RefEntree;
}

export interface Piece {
  id: string;
  nom: string;
  elements: Element[];
}

export type TypeCompteur = 'eau' | 'eau_chaude' | 'electricite' | 'gaz' | 'autre';

export interface Compteur {
  id: string;
  type: TypeCompteur;
  nom: string;
  numero: string;
  index: string;
  photos: string[];
  entree?: { index: string; photos: string[] };
}

export type StatutVerif = 'ok' | 'nok' | 'na';

export interface Verification {
  id: string;
  nom: string;
  statut?: StatutVerif;
  commentaire: string;
}

export interface Signature {
  nom: string;
  /** Image PNG en data URL. */
  image?: string;
  date?: string;
}

export interface Gps {
  lat: number;
  lon: number;
  precision: number;
  date: string;
}

export interface Personne {
  nom: string;
  adresse: string;
}

export interface Edl {
  schema: number;
  id: string;
  logementId: string;
  type: TypeEdl;
  /** Pour une sortie : l'EDL d'entrée d'origine. */
  entreeId?: string;
  /** Date de l'EDL (AAAA-MM-JJ). */
  date: string;
  logement: { nom: string; adresse: string; description: string };
  bailleur: Personne;
  locataire: Personne & { adresseDepart: string };
  pieces: Piece[];
  cles: Element[];
  compteurs: Compteur[];
  verifications: Verification[];
  observations: string;
  mentions: string;
  faitA: string;
  signatures: { bailleur: Signature; locataire: Signature };
  gps?: Gps;
  creeLe: string;
  modifieLe: string;
}

export interface Logement {
  schema: number;
  id: string;
  nom: string;
  adresse: string;
  description: string;
  creeLe: string;
  modifieLe: string;
}

export interface ModeleElement {
  nom: string;
  quantite?: number;
  commentaire?: string;
}

export interface ModelePiece {
  id: string;
  nom: string;
  elements: ModeleElement[];
}

/** Modèle de logement complet (structure d'un EDL, sans états). */
export interface ModeleLogement {
  id: string;
  nom: string;
  adresse: string;
  description: string;
  pieces: { nom: string; elements: ModeleElement[] }[];
  cles: ModeleElement[];
  compteurs: { type: TypeCompteur; nom: string; numero?: string }[];
}

export interface Reglages {
  bailleur: Personne;
  faitA: string;
  mentions: string;
}
