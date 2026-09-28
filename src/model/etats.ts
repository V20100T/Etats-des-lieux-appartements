import type { Etat } from './types';

export const ETATS: Etat[] = ['TB', 'B', 'M', 'KO', 'ABS'];

export const ETAT_LIBELLE: Record<Etat, string> = {
  TB: 'Très bon',
  B: 'Bon',
  M: 'Moyen',
  KO: 'Mauvais',
  ABS: 'Absent',
};

export const ETAT_DESCRIPTION: Record<Etat, string> = {
  TB: 'Très bon - Neuf ou presque',
  B: 'Bon - Usage normal',
  M: 'Moyen - Usage avancé',
  KO: 'Mauvais état - A remplacer',
  ABS: "Absent - Elément manquant ou complètement cassé - hors d'usage",
};

/** Plus le rang est haut, meilleur est l'état. */
export const ETAT_RANG: Record<Etat, number> = { TB: 4, B: 3, M: 2, KO: 1, ABS: 0 };

/** Minuscules, sans accents ni ponctuation. */
export function normaliser(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '');
}

const SYNONYMES: Record<string, Etat> = {
  tb: 'TB', tresbon: 'TB', neuf: 'TB', tresbonetat: 'TB', n: 'TB',
  b: 'B', bon: 'B', bonetat: 'B', be: 'B',
  m: 'M', moyen: 'M', usage: 'M', use: 'M', usag: 'M', passable: 'M', me: 'M',
  ko: 'KO', mauvais: 'KO', mauvaisetat: 'KO', degrade: 'KO', d: 'KO', hs: 'KO', mv: 'KO',
  abs: 'ABS', absent: 'ABS', a: 'ABS', manquant: 'ABS',
};

/** Convertit un libellé d'état libre (Excel, CSV, ancienne version) en Etat. */
export function lireEtat(v: unknown): Etat | undefined {
  if (v == null) return undefined;
  const s = String(v).trim();
  if (!s) return undefined;
  const k = normaliser(s);
  if (SYNONYMES[k]) return SYNONYMES[k];
  // "TB Très Bon - ..." : on essaie le premier mot.
  const premier = normaliser(s.split(/[\s\-–]+/)[0] ?? '');
  return SYNONYMES[premier];
}

/**
 * Dégradation = l'état a baissé ET il est au plus « Moyen ».
 * TB -> B n'est pas signalé : c'est l'usure normale (vétusté), non imputable au locataire.
 */
export function estDegrade(avant: Etat | undefined, apres: Etat | undefined): boolean {
  if (!avant || !apres) return false;
  return ETAT_RANG[apres] < ETAT_RANG[avant] && ETAT_RANG[apres] <= ETAT_RANG.M;
}
