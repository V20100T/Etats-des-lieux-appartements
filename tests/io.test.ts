import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { strToU8, unzipSync, strFromU8 } from 'fflate';
import { decoderTexte, detecterSeparateur, genererCsv, parserCsv } from '../src/io/csv';
import { lireXlsx } from '../src/io/xlsx';
import { exporterCsv, exporterSauvegarde, exporterZip, importerFichier, photosDeEdl } from '../src/io/paquet';
import { lireEtat, estDegrade } from '../src/model/etats';
import { creerSortie } from '../src/model/factory';
import { ecarts, progression, consommation } from '../src/model/analyse';
import { rapportHtml } from '../src/io/rapport';

const xlsx = new Uint8Array(readFileSync(join(process.cwd(), 'tests/fixtures/xlsx/exemple.xlsx')));

describe('états', () => {
  it('lit les libellés courants', () => {
    expect(lireEtat('TB')).toBe('TB');
    expect(lireEtat('Très bon')).toBe('TB');
    expect(lireEtat('neuf')).toBe('TB');
    expect(lireEtat(' b ')).toBe('B');
    expect(lireEtat('Usagé')).toBe('M');
    expect(lireEtat('Dégradé')).toBe('KO');
    expect(lireEtat('ABS')).toBe('ABS');
    expect(lireEtat('TB Très Bon - Neuf ou presque')).toBe('TB');
    expect(lireEtat('')).toBeUndefined();
    expect(lireEtat('n’importe quoi')).toBeUndefined();
  });
  it('détecte les dégradations', () => {
    expect(estDegrade('B', 'KO')).toBe(true);
    expect(estDegrade('B', 'B')).toBe(false);
    expect(estDegrade('TB', 'B')).toBe(false); // usure normale
    expect(estDegrade('TB', 'M')).toBe(true);
    expect(estDegrade('M', 'TB')).toBe(false);
    expect(estDegrade(undefined, 'KO')).toBe(false);
  });
});

describe('CSV', () => {
  it('détecte le séparateur', () => {
    expect(detecterSeparateur('a;b;c\n1;2;3')).toBe(';');
    expect(detecterSeparateur('a,b,c\n1,2,3')).toBe(',');
    expect(detecterSeparateur('a\tb\tc\n1\t2\t3')).toBe('\t');
    expect(detecterSeparateur('a;b\n"x,y,z";2')).toBe(';');
  });
  it('gère guillemets, retours ligne et CRLF', () => {
    const t = 'a;b\r\n"x;1";"ligne1\nligne2"\r\n"dit ""bonjour""";\r\n';
    expect(parserCsv(t)).toEqual([['a', 'b'], ['x;1', 'ligne1\nligne2'], ['dit "bonjour"', '']]);
  });
  it('aller-retour', () => {
    const l = [['a', 'b;c', 'd"e', 'f\ng', ' h']];
    expect(parserCsv(genererCsv(l))).toEqual(l);
  });
  it('décode UTF-8 avec BOM et Windows-1252 (Excel)', () => {
    expect(decoderTexte(new Uint8Array([0xef, 0xbb, 0xbf, 0xc3, 0xa9]))).toBe('é');
    expect(decoderTexte(new Uint8Array([0x45, 0x74, 0x61, 0x74, 0x20, 0xe9]))).toBe('Etat é');
  });
  it('importe un CSV Excel FR (cp1252, point-virgule)', () => {
    const texte = 'Type équipement;Nom élément;Nombre;Etat Entrée;Commentaire Entrée\r\nCuisine;Évier;1;Bon;Inox\r\nClés;Porte;2;TB;\r\n';
    const octets = new Uint8Array([...texte].map((c) => c.charCodeAt(0))); // latin-1 ≈ cp1252 ici
    const lot = importerFichier('cuisine.csv', octets);
    const [e] = lot.edls;
    expect(e.pieces[0].nom).toBe('Cuisine');
    expect(e.pieces[0].elements[0]).toMatchObject({ nom: 'Évier', etat: 'B', commentaire: 'Inox' });
    expect(e.cles[0]).toMatchObject({ nom: 'Porte', quantite: 2, etat: 'TB' });
  });
});

describe('XLSX Classeur exemple', () => {
  it('lit les feuilles', () => {
    const f = lireXlsx(xlsx);
    expect(f.map((x) => x.nom)).toHaveLength(2);
    expect(f[1].lignes[1][1]).toBe("BALLON D'EAU CHAUDE");
  });
  it("importe l'EDL", () => {
    const lot = importerFichier('exemple.xlsx', xlsx);
    expect(lot.edls).toHaveLength(1);
    const [edl] = lot.edls;
    const lg = lot.logements[0];
    expect(lg.nom).toBe('Studio Exemple');
    expect(lg.adresse).toContain('VILLE-EXEMPLE');
    expect(lg.description).toMatch(/19 m²/);
    expect(edl.pieces.map((p) => p.nom)).toEqual([
      'Equipement de chauffage', 'Entree coin nuit et cuisine', "Salle d'eau", 'Elements exterieurs et autres',
    ]);
    expect(edl.cles).toHaveLength(5);
    expect(progression(edl)).toEqual({ faits: 40, total: 40 });
    const tel = edl.pieces[1].elements.find((e) => e.nom === 'Prise téléphone');
    expect(tel?.etat).toBe('ABS');
    expect(edl.pieces[1].elements.find((e) => e.nom === 'Prises')?.commentaire).toContain('13 Prises');
    expect(edl.compteurs[0]).toMatchObject({ type: 'eau', numero: '101' });
  });
});

describe('entrée → sortie', () => {
  const lot = importerFichier('studio.xlsx', xlsx);
  const entree = lot.edls[0];
  entree.pieces[0].elements[0].photos = ['ph_a'];
  const sortie = creerSortie(entree);
  it('recopie l’état d’entrée en référence', () => {
    expect(sortie.type).toBe('sortie');
    expect(sortie.entreeId).toBe(entree.id);
    const el = sortie.pieces[0].elements[0];
    expect(el.etat).toBeUndefined();
    expect(el.entree).toMatchObject({ etat: 'TB', photos: ['ph_a'] });
    expect(photosDeEdl(sortie)).toEqual(['ph_a']);
  });
  it('synthèse des écarts', () => {
    sortie.pieces[0].elements[0].etat = 'KO';
    sortie.pieces[0].elements[1].etat = 'TB';
    sortie.cles[0].quantite = 0;
    sortie.cles[0].etat = 'TB';
    const e = ecarts(sortie);
    expect(e.map((x) => [x.element, x.motif])).toEqual([
      ["Ballon d'eau chaude", 'degradation'],
      ["Porte d'entrée appartement", 'quantite'],
    ]);
    expect(consommation('120,5', '130')).toBe('9,5');
  });
  it('CSV sortie → réimport entrée + sortie', () => {
    const csv = exporterCsv(sortie);
    const lot2 = importerFichier('x.csv', strToU8(csv));
    expect(lot2.edls.map((e) => e.type)).toEqual(['entree', 'sortie']);
    const s = lot2.edls[1];
    expect(s.pieces[0].elements[0]).toMatchObject({ etat: 'KO', entree: { etat: 'TB', photos: ['ph_a'] } });
    expect(s.cles[0]).toMatchObject({ quantite: 0 });
    expect(s.compteurs[0].numero).toBe('101');
  });
  it('ZIP aller-retour avec photos', () => {
    const photos = [{ id: 'ph_a', type: 'image/jpeg', octets: new Uint8Array([1, 2, 3]) }];
    const zip = exporterZip(sortie, lot.logements[0], photos, rapportHtml(sortie, () => undefined));
    const fichiers = unzipSync(zip);
    expect(JSON.parse(strFromU8(fichiers['manifest.json'])).format).toBe('edl-zip');
    const lot2 = importerFichier('x.zip', zip);
    expect(lot2.edls[0]).toEqual(sortie);
    expect(lot2.photos).toEqual(photos);
  });
  it('sauvegarde complète aller-retour', () => {
    const photos = [{ id: 'ph_a', type: 'image/jpeg', octets: new Uint8Array([255, 0, 7]) }];
    const json = exporterSauvegarde({ logements: lot.logements, edls: [entree, sortie], photos });
    const lot2 = importerFichier('sauvegarde.json', strToU8(json));
    expect(lot2.edls).toEqual([entree, sortie]);
    expect(lot2.logements).toEqual(lot.logements);
    expect(lot2.photos).toEqual(photos);
  });
  it('refuse un fichier d’une version future', () => {
    expect(() => importerFichier('f.json', strToU8(JSON.stringify({ format: 'edl-sauvegarde', schema: 99 })))).toThrow(/plus récente/);
  });
  it('rapport HTML', () => {
    const html = rapportHtml(sortie, (id) => (id === 'ph_a' ? 'data:image/jpeg;base64,AA==' : undefined));
    expect(html).toContain('État des lieux de sortie');
    expect(html).toContain('Synthèse des écarts');
    expect(html).toContain('data:image/jpeg;base64,AA==');
  });
});
