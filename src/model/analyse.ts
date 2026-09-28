import { estDegrade } from './etats';
import type { Edl, Element, Etat } from './types';

export function progression(edl: Edl): { faits: number; total: number } {
  return progressionElements([...edl.pieces.flatMap((p) => p.elements), ...edl.cles]);
}

export function progressionElements(elements: Element[]): { faits: number; total: number } {
  return { faits: elements.filter((e) => e.etat).length, total: elements.length };
}

export interface Ecart {
  zone: string;
  element: string;
  avant?: Etat;
  apres?: Etat;
  quantiteAvant?: number;
  quantiteApres?: number;
  commentaire: string;
  photos: string[];
  motif: 'degradation' | 'quantite';
}

/** Synthèse des écarts entrée / sortie : dégradations et éléments manquants. */
export function ecarts(edl: Edl): Ecart[] {
  const res: Ecart[] = [];
  const zones: [string, Element[]][] = [
    ...edl.pieces.map((p): [string, Element[]] => [p.nom, p.elements]),
    ['Clés', edl.cles],
  ];
  for (const [zone, elements] of zones) {
    for (const el of elements) {
      if (!el.entree) continue;
      const base = { zone, element: el.nom, commentaire: el.commentaire, photos: el.photos, avant: el.entree.etat, apres: el.etat };
      if (estDegrade(el.entree.etat, el.etat)) {
        res.push({ ...base, motif: 'degradation' });
      } else if (el.entree.quantite != null && el.quantite < el.entree.quantite) {
        res.push({ ...base, quantiteAvant: el.entree.quantite, quantiteApres: el.quantite, motif: 'quantite' });
      }
    }
  }
  return res;
}

/** Consommation d'un compteur entre entrée et sortie ("" si non calculable). */
export function consommation(avant: string | undefined, apres: string): string {
  const a = parseFloat((avant ?? '').replace(',', '.'));
  const b = parseFloat(apres.replace(',', '.'));
  if (isNaN(a) || isNaN(b)) return '';
  return String(Math.round((b - a) * 1000) / 1000).replace('.', ',');
}
