import { CLES_DEFAUT, REGLAGES_DEFAUT, VERIFICATIONS_DEFAUT } from '../data/modeles';
import { aujourdhui, maintenant, uid } from './ids';
import type {
  Compteur, Edl, Element, Logement, ModeleElement, ModeleLogement, ModelePiece, Piece, Reglages, TypeCompteur,
} from './types';
import { SCHEMA_VERSION } from './types';

export function nouvelElement(nom = '', quantite = 1, commentaire = ''): Element {
  return { id: uid('el_'), nom, quantite, commentaire, photos: [] };
}

export function elementDepuisModele(m: ModeleElement): Element {
  return nouvelElement(m.nom, m.quantite ?? 1, m.commentaire ?? '');
}

export function pieceDepuisModele(m: Pick<ModelePiece, 'nom' | 'elements'>): Piece {
  return { id: uid('pc_'), nom: m.nom, elements: m.elements.map(elementDepuisModele) };
}

export function nouveauCompteur(type: TypeCompteur, nom: string, numero = ''): Compteur {
  return { id: uid('ct_'), type, nom, numero, index: '', photos: [] };
}

export function compteursDefaut(): Compteur[] {
  return [
    nouveauCompteur('eau', 'Eau froide'),
    nouveauCompteur('electricite', 'Electricité'),
    nouveauCompteur('gaz', 'Gaz'),
  ];
}

export function nouveauLogement(nom: string, adresse = '', description = ''): Logement {
  const t = maintenant();
  return { schema: SCHEMA_VERSION, id: uid('lg_'), nom, adresse, description, creeLe: t, modifieLe: t };
}

export function nouvelEdl(logement: Logement, reglages: Reglages = REGLAGES_DEFAUT): Edl {
  const t = maintenant();
  return {
    schema: SCHEMA_VERSION,
    id: uid('edl_'),
    logementId: logement.id,
    type: 'entree',
    date: aujourdhui(),
    logement: { nom: logement.nom, adresse: logement.adresse, description: logement.description },
    bailleur: { ...reglages.bailleur },
    locataire: { nom: '', adresse: logement.adresse, adresseDepart: '' },
    pieces: [],
    cles: CLES_DEFAUT.map(elementDepuisModele),
    compteurs: compteursDefaut(),
    verifications: VERIFICATIONS_DEFAUT.map((nom) => ({ id: uid('vf_'), nom, commentaire: '' })),
    observations: '',
    mentions: reglages.mentions,
    faitA: reglages.faitA,
    signatures: { bailleur: { nom: reglages.bailleur.nom }, locataire: { nom: '' } },
    creeLe: t,
    modifieLe: t,
  };
}

export function appliquerModeleLogement(edl: Edl, m: ModeleLogement): Edl {
  return {
    ...edl,
    pieces: m.pieces.map(pieceDepuisModele),
    cles: m.cles.map(elementDepuisModele),
    compteurs: m.compteurs.map((c) => nouveauCompteur(c.type, c.nom, c.numero ?? '')),
  };
}

/** Nouvel EDL d'entrée reprenant la structure, les états et commentaires d'un EDL précédent. */
export function edlDepuisPrecedent(logement: Logement, precedent: Edl, reglages: Reglages): Edl {
  const base = nouvelEdl(logement, reglages);
  const copie = (el: Element): Element => ({
    ...nouvelElement(el.nom, el.quantite, el.commentaire),
    etat: el.etat,
  });
  return {
    ...base,
    pieces: precedent.pieces.map((p) => ({ id: uid('pc_'), nom: p.nom, elements: p.elements.map(copie) })),
    cles: precedent.cles.map(copie),
    compteurs: precedent.compteurs.map((c) => ({ ...nouveauCompteur(c.type, c.nom, c.numero), index: c.index })),
    verifications: precedent.verifications.map((v) => ({ id: uid('vf_'), nom: v.nom, commentaire: '' })),
  };
}

/** Crée l'EDL de sortie : même structure, l'état d'entrée est recopié en référence. */
export function creerSortie(entree: Edl): Edl {
  const t = maintenant();
  const versSortie = (el: Element): Element => ({
    id: uid('el_'),
    nom: el.nom,
    quantite: el.quantite,
    commentaire: '',
    photos: [],
    entree: { etat: el.etat, quantite: el.quantite, commentaire: el.commentaire, photos: [...el.photos] },
  });
  return {
    ...structuredClone(entree),
    id: uid('edl_'),
    type: 'sortie',
    entreeId: entree.id,
    date: aujourdhui(),
    locataire: { ...entree.locataire, adresseDepart: '' },
    pieces: entree.pieces.map((p) => ({ id: uid('pc_'), nom: p.nom, elements: p.elements.map(versSortie) })),
    cles: entree.cles.map(versSortie),
    compteurs: entree.compteurs.map((c) => ({
      ...nouveauCompteur(c.type, c.nom, c.numero),
      entree: { index: c.index, photos: [...c.photos] },
    })),
    verifications: entree.verifications.map((v) => ({ id: uid('vf_'), nom: v.nom, commentaire: '' })),
    observations: '',
    signatures: { bailleur: { nom: entree.signatures.bailleur.nom }, locataire: { nom: entree.signatures.locataire.nom } },
    gps: undefined,
    creeLe: t,
    modifieLe: t,
  };
}
