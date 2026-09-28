/**
 * Tests de compatibilité : chaque fichier de tests/fixtures/v<N>/ a été produit
 * par la version N de l'application et est FIGÉ (ne jamais le régénérer ni le modifier).
 * Toutes les versions futures doivent continuer à les importer.
 *
 * Pour figer les fixtures d'une nouvelle version de schéma :
 *   GEN_FIXTURES=<N> npx vitest run tests/compat.test.ts
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { exporterCsv, exporterSauvegarde, exporterZip, importerFichier } from '../src/io/paquet';
import { rapportHtml } from '../src/io/rapport';
import { creerSortie } from '../src/model/factory';
import { progression } from '../src/model/analyse';

const racine = join(process.cwd(), 'tests/fixtures');
const gen = process.env.GEN_FIXTURES;

if (gen) {
  describe('génération des fixtures', () => {
    it(`écrit fixtures/v${gen}`, () => {
      const dossier = join(racine, `v${gen}`);
      if (existsSync(dossier) && readdirSync(dossier).length) throw new Error(`fixtures/v${gen} existe déjà : fixtures figées.`);
      mkdirSync(dossier, { recursive: true });
      const xlsx = new Uint8Array(readFileSync(join(racine, 'xlsx/exemple.xlsx')));
      const lot = importerFichier('exemple.xlsx', xlsx);
      const entree = lot.edls[0];
      entree.locataire.nom = 'Jean Exemple';
      entree.bailleur.nom = 'Bailleur Exemple';
      entree.pieces[0].elements[0].photos = ['ph_fixture1'];
      entree.compteurs[0].index = '123,4';
      entree.verifications[0].statut = 'ok';
      entree.signatures.bailleur.image = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
      entree.gps = { lat: 48.372, lon: 2.816, precision: 12, date: '2026-09-28T10:00:00.000Z' };
      const sortie = creerSortie(entree);
      sortie.pieces[0].elements[0].etat = 'KO';
      sortie.pieces[0].elements[0].commentaire = 'Fuite';
      sortie.pieces[0].elements[1].etat = 'B';
      sortie.compteurs[0].index = '150';
      // JPEG 1x1 minimal (octets arbitraires suffisent pour le test)
      const photos = [{ id: 'ph_fixture1', type: 'image/jpeg', octets: new Uint8Array([0xff, 0xd8, 0xff, 0xd9]) }];
      writeFileSync(join(dossier, 'sauvegarde.json'), exporterSauvegarde({ logements: lot.logements, edls: [entree, sortie], photos }, 'fixture'));
      writeFileSync(join(dossier, 'sortie.zip'), exporterZip(sortie, lot.logements[0], photos, rapportHtml(sortie, () => undefined), 'fixture'));
      writeFileSync(join(dossier, 'sortie.csv'), exporterCsv(sortie));
      writeFileSync(join(dossier, 'entree.csv'), exporterCsv(entree));
    });
  });
}

const versions = existsSync(racine) ? readdirSync(racine).filter((d) => /^v\d+$/.test(d)) : [];

describe.skipIf(!!gen)('compatibilité des anciens fichiers', () => {
  it('au moins une version de fixtures existe', () => expect(versions.length).toBeGreaterThan(0));

  for (const v of versions) {
    const lire = (f: string) => new Uint8Array(readFileSync(join(racine, v, f)));

    it(`${v} : sauvegarde complète JSON`, () => {
      const lot = importerFichier('sauvegarde.json', lire('sauvegarde.json'));
      expect(lot.logements).toHaveLength(1);
      expect(lot.edls.map((e) => e.type)).toEqual(['entree', 'sortie']);
      const [entree, sortie] = lot.edls;
      expect(entree.locataire.nom).toBe('Jean Exemple');
      expect(entree.pieces[0].elements[0].photos).toEqual(['ph_fixture1']);
      expect(entree.signatures.bailleur.image).toMatch(/^data:image\/png/);
      expect(entree.gps?.lat).toBeCloseTo(48.372);
      expect(progression(entree).total).toBe(40);
      expect(sortie.entreeId).toBe(entree.id);
      expect(sortie.pieces[0].elements[0]).toMatchObject({ etat: 'KO', commentaire: 'Fuite', entree: { etat: 'TB' } });
      expect(sortie.compteurs[0]).toMatchObject({ index: '150', entree: { index: '123,4' } });
      expect(lot.photos.map((p) => p.id)).toEqual(['ph_fixture1']);
    });

    it(`${v} : ZIP d'un EDL de sortie`, () => {
      const lot = importerFichier('sortie.zip', lire('sortie.zip'));
      const [s] = lot.edls;
      expect(s.type).toBe('sortie');
      expect(s.pieces[0].elements[0]).toMatchObject({ etat: 'KO', entree: { etat: 'TB', photos: ['ph_fixture1'] } });
      expect(lot.photos[0].id).toBe('ph_fixture1');
      expect(lot.logements[0].id).toBe(s.logementId);
    });

    it(`${v} : CSV`, () => {
      const e = importerFichier('entree.csv', lire('entree.csv'));
      expect(e.edls).toHaveLength(1);
      expect(progression(e.edls[0])).toEqual({ faits: 40, total: 40 });
      const s = importerFichier('sortie.csv', lire('sortie.csv'));
      expect(s.edls.map((x) => x.type)).toEqual(['entree', 'sortie']);
      expect(s.edls[1].pieces[0].elements[0]).toMatchObject({ etat: 'KO', commentaire: 'Fuite' });
      expect(s.edls[1].compteurs[0]).toMatchObject({ index: '150', entree: { index: '123,4' } });
    });
  }
});
