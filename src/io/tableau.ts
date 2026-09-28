/**
 * Conversion EDL <-> tableau (CSV ou feuille Excel).
 *
 * Format CSV v1 (colonne `schema` = "edl-csv/1") : une ligne par élément.
 * L'import accepte aussi les tableaux « maison » (ex. colonnes Excel
 * « Type équipement | Nom élément | Nombre | Etat Entrée | Commentaire Entrée | Etat Sortie | Commentaire Sortie »).
 */
import { lireEtat, normaliser } from '../model/etats';
import { creerSortie, nouveauCompteur, nouveauLogement, nouvelEdl, nouvelElement } from '../model/factory';
import { uid } from '../model/ids';
import { FormatTropRecent } from '../model/migrate';
import type { Compteur, Edl, Element, Logement, Reglages, TypeCompteur } from '../model/types';
import { SCHEMA_VERSION } from '../model/types';
import type { Feuille } from './xlsx';

export const SCHEMA_CSV = `edl-csv/${SCHEMA_VERSION}`;

export const COLONNES_CSV = [
  'schema', 'section', 'piece', 'element', 'quantite',
  'etat_entree', 'commentaire_entree', 'etat_sortie', 'commentaire_sortie',
  'numero', 'index_entree', 'index_sortie', 'photos_entree', 'photos_sortie',
] as const;
type Colonne = (typeof COLONNES_CSV)[number];

/** "ENTREE COIN NUIT" -> "Entree coin nuit" (uniquement si tout est en majuscules). */
export function adoucirCasse(s: string): string {
  return /[A-Z]/.test(s) && s === s.toUpperCase() ? s.charAt(0) + s.slice(1).toLowerCase() : s;
}

const joindre = (ids: string[]) => ids.join('|');
const separer = (s: string | undefined) => (s ?? '').split(/[|,\s]+/).map((x) => x.trim()).filter(Boolean);

export function edlVersLignes(edl: Edl): string[][] {
  const sortie = edl.type === 'sortie';
  const out: string[][] = [[...COLONNES_CSV]];
  const ligne = (v: Partial<Record<Colonne, string | number | undefined>>) =>
    out.push(COLONNES_CSV.map((c) => (c === 'schema' ? SCHEMA_CSV : String(v[c] ?? ''))));
  const el = (section: string, piece: string, e: Element) =>
    ligne(
      sortie
        ? {
            section, piece, element: e.nom, quantite: e.quantite,
            etat_entree: e.entree?.etat, commentaire_entree: e.entree?.commentaire,
            etat_sortie: e.etat, commentaire_sortie: e.commentaire,
            photos_entree: joindre(e.entree?.photos ?? []), photos_sortie: joindre(e.photos),
          }
        : {
            section, piece, element: e.nom, quantite: e.quantite,
            etat_entree: e.etat, commentaire_entree: e.commentaire, photos_entree: joindre(e.photos),
          },
    );
  for (const p of edl.pieces) for (const e of p.elements) el('piece', p.nom, e);
  for (const e of edl.cles) el('cle', 'Clés', e);
  for (const c of edl.compteurs)
    ligne({
      section: 'compteur', piece: 'Compteurs', element: c.nom, numero: c.numero, quantite: c.type,
      index_entree: sortie ? c.entree?.index : c.index,
      index_sortie: sortie ? c.index : '',
      photos_entree: joindre(sortie ? c.entree?.photos ?? [] : c.photos),
      photos_sortie: sortie ? joindre(c.photos) : '',
    });
  return out;
}

/** Alias d'en-têtes (normalisés) acceptés à l'import. */
const ALIAS: Record<Colonne, string[]> = {
  schema: ['schema', 'format'],
  section: ['section'],
  piece: ['piece', 'typeequipement', 'type', 'zone', 'categorie', 'local', 'pieces'],
  element: ['element', 'nomelement', 'nom', 'designation', 'equipement', 'elements'],
  quantite: ['quantite', 'nombre', 'qte', 'nb', 'quantites'],
  etat_entree: ['etatentree', 'etat', 'etatalentree', 'entree'],
  commentaire_entree: ['commentaireentree', 'commentaire', 'commentaires', 'observations', 'observationsentree', 'remarques'],
  etat_sortie: ['etatsortie', 'etatalasortie', 'sortie'],
  commentaire_sortie: ['commentairesortie', 'observationssortie'],
  numero: ['numero', 'ndecompteur', 'n'],
  index_entree: ['indexentree', 'index', 'releveentree'],
  index_sortie: ['indexsortie', 'relevesortie'],
  photos_entree: ['photosentree', 'photos'],
  photos_sortie: ['photossortie'],
};

function lireEntetes(ligne: string[]): Partial<Record<Colonne, number>> | undefined {
  const map: Partial<Record<Colonne, number>> = {};
  ligne.forEach((h, i) => {
    const k = normaliser(h);
    if (!k) return;
    for (const col of COLONNES_CSV) {
      if (map[col] == null && ALIAS[col].includes(k)) {
        map[col] = i;
        return;
      }
    }
  });
  return map.element != null ? map : undefined;
}

const TYPES_COMPTEUR: TypeCompteur[] = ['eau', 'eau_chaude', 'electricite', 'gaz', 'autre'];

function typeCompteur(s: string): TypeCompteur {
  const k = normaliser(s);
  if ((TYPES_COMPTEUR as string[]).includes(s)) return s as TypeCompteur;
  if (k.includes('chaude')) return 'eau_chaude';
  if (k.includes('eau')) return 'eau';
  if (k.includes('elec')) return 'electricite';
  if (k.includes('gaz')) return 'gaz';
  return 'autre';
}

export interface ResultatTableau {
  logement: Logement;
  edls: Edl[];
}

/** Construit un logement + EDL d'entrée (et de sortie si des états de sortie sont remplis). */
export function lignesVersEdl(lignes: string[][], nom: string, reglages?: Reglages): ResultatTableau {
  let debut = -1;
  let cols: Partial<Record<Colonne, number>> | undefined;
  for (let i = 0; i < Math.min(lignes.length, 20); i++) {
    cols = lireEntetes(lignes[i] ?? []);
    if (cols) {
      debut = i;
      break;
    }
  }
  if (!cols || debut < 0) {
    throw new Error("Colonnes introuvables : il faut au moins une colonne « element » (ou « Nom élément »).");
  }
  const c = cols;
  const val = (l: string[], col: Colonne) => (c[col] == null ? '' : (l[c[col]!] ?? '').trim());

  const logement = nouveauLogement(nom);
  const entree = nouvelEdl(logement, reglages);
  entree.pieces = [];
  entree.cles = [];
  const compteursLus: { c: Compteur; indexSortie: string; photosSortie: string[] }[] = [];
  const sorties = new Map<Element, { etat: string; commentaire: string; photos: string[] }>();
  let aSortie = false;

  for (const l of lignes.slice(debut + 1)) {
    if (!l) continue;
    const schema = val(l, 'schema');
    const m = /^edl-csv\/(\d+)$/.exec(schema);
    if (m && Number(m[1]) > SCHEMA_VERSION) throw new FormatTropRecent(Number(m[1]));
    const nomEl = adoucirCasse(val(l, 'element'));
    if (!nomEl) continue;
    const pieceNom = adoucirCasse(val(l, 'piece')) || 'Général';
    const k = normaliser(pieceNom);
    const sectionBrute = normaliser(val(l, 'section'));
    const section =
      sectionBrute === 'cle' || sectionBrute === 'compteur' || sectionBrute === 'piece'
        ? sectionBrute
        : /^(cles?|clefs?)$/.test(k) || k.startsWith('cles') || k.startsWith('clefs')
          ? 'cle'
          : k.startsWith('compteur')
            ? 'compteur'
            : 'piece';

    if (section === 'compteur') {
      const ct = nouveauCompteur(typeCompteur(val(l, 'quantite') || nomEl), nomEl, val(l, 'numero'));
      ct.index = val(l, 'index_entree');
      ct.photos = separer(val(l, 'photos_entree'));
      const indexSortie = val(l, 'index_sortie');
      if (indexSortie) aSortie = true;
      compteursLus.push({ c: ct, indexSortie, photosSortie: separer(val(l, 'photos_sortie')) });
      continue;
    }

    const qte = parseFloat(val(l, 'quantite').replace(',', '.'));
    const el = nouvelElement(nomEl, Number.isFinite(qte) ? qte : 1, val(l, 'commentaire_entree'));
    const etat = lireEtat(val(l, 'etat_entree'));
    if (etat) el.etat = etat;
    el.photos = separer(val(l, 'photos_entree'));
    const s = { etat: val(l, 'etat_sortie'), commentaire: val(l, 'commentaire_sortie'), photos: separer(val(l, 'photos_sortie')) };
    if (s.etat || s.commentaire || s.photos.length) aSortie = true;
    sorties.set(el, s);

    if (section === 'cle') entree.cles.push(el);
    else {
      let p = entree.pieces.find((x) => x.nom === pieceNom);
      if (!p) {
        p = { id: uid('pc_'), nom: pieceNom, elements: [] };
        entree.pieces.push(p);
      }
      p.elements.push(el);
    }
  }
  if (compteursLus.length) entree.compteurs = compteursLus.map((x) => x.c);

  const edls = [entree];
  if (aSortie) {
    const sortie = creerSortie(entree);
    const sourcesEl = [...entree.pieces.flatMap((p) => p.elements), ...entree.cles];
    const ciblesEl = [...sortie.pieces.flatMap((p) => p.elements), ...sortie.cles];
    ciblesEl.forEach((cible, i) => {
      const s = sorties.get(sourcesEl[i]);
      if (!s) return;
      const etat = lireEtat(s.etat);
      if (etat) cible.etat = etat;
      cible.commentaire = s.commentaire;
      cible.photos = s.photos;
    });
    sortie.compteurs.forEach((ct, i) => {
      ct.index = compteursLus[i]?.indexSortie ?? '';
      ct.photos = compteursLus[i]?.photosSortie ?? [];
    });
    edls.push(sortie);
  }
  return { logement, edls };
}

/** Informations de l'onglet « Intro » d'un classeur EDL Excel (heuristique, tout est optionnel). */
export interface InfosIntro {
  nom?: string;
  adresse?: string;
  description?: string;
  compteurs: { type: TypeCompteur; nom: string; numero: string; indexEntree: string; indexSortie: string }[];
}

export function lireIntro(feuilles: Feuille[]): InfosIntro {
  const infos: InfosIntro = { compteurs: [] };
  for (const f of feuilles) {
    if (f.lignes.slice(0, 20).some((l) => lireEntetes(l ?? []))) continue; // feuille d'éléments
    const textes = f.lignes.map((l) => (l ?? []).filter((x) => x && x.trim()));
    textes.forEach((cells, i) => {
      const t = cells.join(' ');
      if (!infos.nom) {
        const m = /["«“]\s*([^"»”]+?)\s*["»”]/.exec(t);
        if (m && /(studio|appartement|maison|logement|du |de l)/i.test(t)) infos.nom = m[1];
      }
      if (!infos.description) {
        const d = /((studio|appartement|maison|t\d|f\d)[^"«“]*?\d+(?:[.,]\d+)?\s*m(²|2))/i.exec(t);
        if (d) infos.description = d[1].charAt(0).toUpperCase() + d[1].slice(1);
      }
      if (!infos.adresse && /situ[ée]e?\s*:?\s*$/i.test(t)) {
        const suivante = textes.slice(i + 1).find((x) => x.length);
        if (suivante) infos.adresse = suivante.join(' ');
      }
      const cpt = /compteur\s+(?:d['’]\s*)?(eau\s+chaude|eau|[ée]lectricit[ée]|gaz)?(.*?)\s*N\s*[°o]\s*(\d[\w-]*)/i.exec(t);
      if (cpt) {
        // Relevés : ligne suivante « A l'arrivée : xxx   Au départ : yyy »
        const releve = textes[i + 2] ?? textes[i + 1] ?? [];
        const valeurs = releve.filter((x) => /\d/.test(x) && !/arriv|d[ée]part/i.test(x));
        infos.compteurs.push({
          type: typeCompteur(cpt[1] ?? ''),
          nom: ('Compteur ' + (cpt[1] ?? '') + ' ' + cpt[2]).replace(/\s+/g, ' ').replace(/[:\s]+$/, '').trim(),
          numero: cpt[3],
          indexEntree: valeurs[0] ?? '',
          indexSortie: valeurs[1] ?? '',
        });
      }
    });
  }
  return infos;
}

/** Import d'un classeur Excel : feuille d'éléments + onglet d'intro facultatif. */
export function feuillesVersEdl(feuilles: Feuille[], nomFichier: string, reglages?: Reglages): ResultatTableau {
  const f = feuilles.find((x) => x.lignes.slice(0, 20).some((l) => lireEntetes(l ?? [])));
  if (!f) throw new Error("Aucun onglet avec une colonne « Nom élément » / « element » n'a été trouvé.");
  const intro = lireIntro(feuilles);
  const res = lignesVersEdl(f.lignes, intro.nom || nomFichier, reglages);
  const lg = res.logement;
  if (intro.adresse) lg.adresse = intro.adresse;
  if (intro.description) lg.description = intro.description;
  for (const edl of res.edls) {
    edl.logement = { nom: lg.nom, adresse: lg.adresse, description: lg.description };
    edl.locataire.adresse = edl.locataire.adresse || lg.adresse;
  }
  if (intro.compteurs.length && !f.lignes.some((l) => normaliser(l?.[0] ?? '').startsWith('compteur'))) {
    const [entree, sortie] = res.edls;
    entree.compteurs = intro.compteurs.map((c) => ({ ...nouveauCompteur(c.type, c.nom, c.numero), index: c.indexEntree }));
    entree.compteurs.push(nouveauCompteur('electricite', 'Electricité'));
    if (sortie) {
      sortie.compteurs = entree.compteurs.map((c, i) => ({
        ...nouveauCompteur(c.type, c.nom, c.numero),
        index: intro.compteurs[i]?.indexSortie ?? '',
        entree: { index: c.index, photos: [] },
      }));
    }
  }
  return res;
}
