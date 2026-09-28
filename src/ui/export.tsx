import { useEffect, useState } from 'preact/hooks';
import type { Edl } from '../model/types';
import { exporterCsv, exporterZip, nomFichierEdl, octetsVersDataUrl, photosDeEdl, type PhotoData } from '../io/paquet';
import { CSS_RAPPORT, rapportHtml } from '../io/rapport';
import { chargerLogement, lirePhoto, urlPhoto } from '../storage/db';
import { aller, partager, peutPartager, telecharger } from './commun';

async function photosEdl(edl: Edl): Promise<PhotoData[]> {
  return (await Promise.all(photosDeEdl(edl).map(lirePhoto))).filter((p): p is PhotoData => !!p);
}

const EXT: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };

type Fabrique = () => Promise<{ nom: string; blob: Blob }>;

export function EcranExport({ edl }: { edl: Edl }) {
  const [enCours, setEnCours] = useState<string>();
  const partage = peutPartager();
  const nom = nomFichierEdl(edl);

  const fabriques: [string, string, Fabrique][] = [
    [
      'ZIP complet',
      'CSV + photos + signatures + rapport + manifest.json. Ré-importable.',
      async () => {
        const photos = await photosEdl(edl);
        const html = rapportHtml(edl, (id) => {
          const p = photos.find((x) => x.id === id);
          return p ? `photos/${id}.${EXT[p.type] ?? 'bin'}` : undefined;
        });
        const zip = exporterZip(edl, await chargerLogement(edl.logementId), photos, html, __APP_VERSION__);
        return { nom: nom + '.zip', blob: new Blob([zip as BlobPart], { type: 'application/zip' }) };
      },
    ],
    [
      'Rapport HTML',
      'Un seul fichier avec les photos, à envoyer par e-mail ou imprimer.',
      async () => {
        const photos = await photosEdl(edl);
        const urls = new Map(photos.map((p) => [p.id, octetsVersDataUrl(p.type, p.octets)]));
        return { nom: nom + '.html', blob: new Blob([rapportHtml(edl, (id) => urls.get(id))], { type: 'text/html' }) };
      },
    ],
    ['CSV', 'Tableau pour Excel (sans photos).', async () => ({ nom: nom + '.csv', blob: new Blob([exporterCsv(edl)], { type: 'text/csv' }) })],
  ];

  async function lancer(titre: string, f: Fabrique, mode: 'dl' | 'partage') {
    setEnCours(titre + mode);
    try {
      const { nom: n, blob } = await f();
      if (mode === 'partage') await partager(n, blob, titre);
      else telecharger(n, blob);
    } catch (e) {
      alert('Export impossible : ' + (e as Error).message);
    } finally {
      setEnCours(undefined);
    }
  }

  return (
    <>
      <h2>Rapport & export</h2>
      <button class="large" onClick={() => aller(`edl/${edl.id}/rapport`)}>
        📄 Voir le rapport / enregistrer en PDF
      </button>
      {fabriques.map(([titre, desc, f]) => (
        <article key={titre}>
          <strong>{titre}</strong>
          <p>
            <small>{desc}</small>
          </p>
          <div class="grid">
            <button class="outline" aria-busy={enCours === titre + 'dl'} onClick={() => lancer(titre, f, 'dl')}>
              ⬇ Télécharger
            </button>
            {partage && (
              <button class="outline secondary" aria-busy={enCours === titre + 'partage'} onClick={() => lancer(titre, f, 'partage')}>
                ↗ Partager
              </button>
            )}
          </div>
        </article>
      ))}
    </>
  );
}

export function EcranRapport({ edl }: { edl: Edl }) {
  const [urls, setUrls] = useState<Map<string, string>>();
  useEffect(() => {
    document.documentElement.classList.add('mode-rapport');
    Promise.all(photosDeEdl(edl).map(async (id) => [id, await urlPhoto(id)] as const)).then((l) =>
      setUrls(new Map(l.filter((x): x is [string, string] => !!x[1]))),
    );
    return () => document.documentElement.classList.remove('mode-rapport');
  }, [edl.id]);
  if (!urls) return <p aria-busy="true">Préparation du rapport…</p>;
  return (
    <>
      <div class="barre-rapport">
        <button class="secondary" onClick={() => history.back()}>
          ‹ Retour
        </button>
        <button onClick={() => window.print()}>🖨 Imprimer / PDF</button>
      </div>
      <style>{CSS_RAPPORT}</style>
      <div dangerouslySetInnerHTML={{ __html: rapportHtml(edl, (id) => urls.get(id), false) }} />
    </>
  );
}
