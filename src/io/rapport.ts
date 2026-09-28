/** Rapport HTML imprimable (autonome : styles et images intégrés). */
import { consommation, ecarts } from '../model/analyse';
import { estDegrade, ETAT_DESCRIPTION, ETATS } from '../model/etats';
import type { Edl, Element, Etat } from '../model/types';

const h = (s: unknown) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
const br = (s: string) => h(s).replace(/\n/g, '<br>');

export function dateFr(iso: string | undefined): string {
  if (!iso) return '';
  const [a, m, j] = iso.slice(0, 10).split('-');
  return j ? `${j}/${m}/${a}` : iso;
}

export function dateHeureFr(iso: string | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  return isNaN(+d) ? iso : d.toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' });
}

const etat = (e?: Etat) => (e ? `<span class="etat e-${e}">${e}</span>` : '<span class="etat vide">—</span>');

export const CSS_RAPPORT = `
.rapport{font:13px/1.4 system-ui,-apple-system,Segoe UI,Roboto,sans-serif;color:#111;background:#fff;max-width:900px;margin:0 auto;padding:16px}
.rapport,.rapport :is(h1,h2,h3,p,div,span,strong,small,td,th,li){color:#111}
.rapport :is(h1,h2){font-family:inherit;font-weight:700;letter-spacing:0}
.rapport td{background:#fff}
.rapport h1{font-size:22px;text-align:center;margin:0 0 4px}
.rapport h2{font-size:16px;margin:22px 0 6px;padding:4px 8px;background:#e8eef6;border-left:4px solid #1d6fb8;break-after:avoid}
.rapport .sous{text-align:center;color:#444;margin:0 0 12px}
.rapport table{width:100%;border-collapse:collapse;margin:4px 0;break-inside:auto}
.rapport th,.rapport td{border:1px solid #bbb;padding:4px 6px;vertical-align:top;text-align:left}
.rapport th{background:#f2f2f2;font-weight:600;font-size:12px}
.rapport tr{break-inside:avoid}
.rapport .grille{display:grid;grid-template-columns:1fr 1fr;gap:8px 16px}
.rapport .bloc{border:1px solid #bbb;padding:6px 8px;border-radius:4px}
.rapport .etat{display:inline-block;min-width:32px;text-align:center;font-weight:700;border-radius:3px;padding:0 4px}
.rapport .e-TB{background:#c8f0d0}.rapport .e-B{background:#dff3c4}.rapport .e-M{background:#ffe9b0}.rapport .e-KO{background:#ffc9c2}.rapport .e-ABS{background:#ddd}
.rapport .degrade td{background:#fff0ee}
.rapport .photos{display:flex;flex-wrap:wrap;gap:4px;margin-top:4px}
.rapport .photos img{width:110px;height:82px;object-fit:cover;border:1px solid #999}
.rapport .sig{display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-top:8px;break-inside:avoid}
.rapport .sig img{max-width:100%;height:110px;object-fit:contain;border-bottom:1px solid #333;display:block}
.rapport .mentions{font-size:11px;color:#333;white-space:pre-line}
.rapport .petit{font-size:11px;color:#555}
.rapport table{font-size:12px;word-break:break-word}
.rapport td,.rapport th{border-color:#bbb}
@media print{.rapport{padding:0;max-width:none}@page{margin:12mm}}
`;

export function rapportHtml(edl: Edl, urlPhoto: (id: string) => string | undefined, autonome = true): string {
  const sortie = edl.type === 'sortie';
  const titre = `État des lieux ${sortie ? 'de sortie' : "d'entrée"}`;
  const photos = (ids: string[] | undefined, legende = '') => {
    const imgs = (ids ?? []).map((id) => urlPhoto(id)).filter(Boolean);
    return imgs.length
      ? `<div class="photos">${legende ? `<span class="petit">${h(legende)}</span>` : ''}${imgs.map((u) => `<img src="${h(u)}" alt="">`).join('')}</div>`
      : '';
  };
  const tableElements = (elements: Element[]) => {
    const ent = sortie
      ? '<tr><th>Élément</th><th>Qté</th><th>Entrée</th><th>Sortie</th><th>Commentaires</th></tr>'
      : '<tr><th>Élément</th><th>Qté</th><th>État</th><th>Commentaire</th></tr>';
    const lignes = elements.map((e) => {
      const deg = sortie && (estDegrade(e.entree?.etat, e.etat) || (e.entree?.quantite != null && e.quantite < e.entree.quantite));
      if (sortie) {
        const q = e.entree?.quantite != null && e.entree.quantite !== e.quantite ? `${e.entree.quantite} → ${e.quantite}` : e.quantite;
        return `<tr class="${deg ? 'degrade' : ''}"><td>${h(e.nom)}</td><td>${h(q)}</td><td>${etat(e.entree?.etat)}</td><td>${etat(e.etat)}</td><td>${
          e.entree?.commentaire ? `<div class="petit">Entrée : ${br(e.entree.commentaire)}</div>` : ''
        }${br(e.commentaire)}${photos(e.entree?.photos, 'Entrée')}${photos(e.photos, 'Sortie')}</td></tr>`;
      }
      return `<tr><td>${h(e.nom)}</td><td>${h(e.quantite)}</td><td>${etat(e.etat)}</td><td>${br(e.commentaire)}${photos(e.photos)}</td></tr>`;
    });
    return `<table>${ent}${lignes.join('')}</table>`;
  };

  const liste = ecarts(edl);
  const parts: string[] = [];
  parts.push(`<h1>${h(titre)}</h1><p class="sous">${h(edl.logement.nom)}${edl.logement.description ? ' — ' + h(edl.logement.description) : ''}<br>${h(edl.logement.adresse)}<br>Le ${h(dateFr(edl.date))}</p>`);
  parts.push(`<div class="grille">
    <div class="bloc"><strong>Bailleur</strong><br>${h(edl.bailleur.nom)}<br>${br(edl.bailleur.adresse)}</div>
    <div class="bloc"><strong>Locataire</strong><br>${h(edl.locataire.nom)}<br>${
      sortie && edl.locataire.adresseDepart ? 'Nouvelle adresse : ' + br(edl.locataire.adresseDepart) : br(edl.locataire.adresse)
    }</div></div>`);
  if (edl.mentions) parts.push(`<p class="mentions">${h(edl.mentions)}</p>`);
  parts.push(`<p class="petit"><strong>Légende :</strong> ${ETATS.map((e) => `${etat(e)} ${h(ETAT_DESCRIPTION[e])}`).join(' · ')}</p>`);

  if (edl.compteurs.length) {
    parts.push('<h2>Compteurs</h2><table>');
    parts.push(sortie ? '<tr><th>Compteur</th><th>N°</th><th>Index entrée</th><th>Index sortie</th><th>Conso.</th></tr>' : '<tr><th>Compteur</th><th>N°</th><th>Index</th></tr>');
    for (const c of edl.compteurs) {
      parts.push(
        sortie
          ? `<tr><td>${h(c.nom)}${photos(c.photos)}</td><td>${h(c.numero)}</td><td>${h(c.entree?.index)}</td><td>${h(c.index)}</td><td>${h(consommation(c.entree?.index, c.index))}</td></tr>`
          : `<tr><td>${h(c.nom)}${photos(c.photos)}</td><td>${h(c.numero)}</td><td>${h(c.index)}</td></tr>`,
      );
    }
    parts.push('</table>');
  }

  for (const p of edl.pieces) {
    parts.push(`<h2>${h(p.nom)}</h2>${tableElements(p.elements)}`);
  }
  if (edl.cles.length) parts.push(`<h2>Clés remises</h2>${tableElements(edl.cles)}`);

  if (edl.verifications.length) {
    const lib = { ok: 'OK', nok: 'Non OK', na: 'N/A' } as const;
    parts.push('<h2>Vérifications</h2><table><tr><th>Point</th><th>Statut</th><th>Commentaire</th></tr>');
    for (const v of edl.verifications) parts.push(`<tr><td>${h(v.nom)}</td><td>${v.statut ? lib[v.statut] : '—'}</td><td>${br(v.commentaire)}</td></tr>`);
    parts.push('</table>');
  }

  if (sortie) {
    parts.push('<h2>Synthèse des écarts entrée / sortie</h2>');
    parts.push(
      liste.length
        ? `<table><tr><th>Zone</th><th>Élément</th><th>Entrée</th><th>Sortie</th><th>Commentaire</th></tr>${liste
            .map(
              (x) =>
                `<tr class="degrade"><td>${h(x.zone)}</td><td>${h(x.element)}</td><td>${etat(x.avant)}${x.motif === 'quantite' ? ' ×' + x.quantiteAvant : ''}</td><td>${etat(x.apres)}${x.motif === 'quantite' ? ' ×' + x.quantiteApres : ''}</td><td>${br(x.commentaire)}</td></tr>`,
            )
            .join('')}</table>`
        : '<p>Aucune dégradation constatée par rapport à l\'état des lieux d\'entrée.</p>',
    );
  }

  if (edl.observations) parts.push(`<h2>Observations générales</h2><p>${br(edl.observations)}</p>`);

  parts.push(`<h2>Signatures</h2><p>Fait en deux exemplaires${edl.faitA ? ' à ' + h(edl.faitA) : ''}, le ${h(dateFr(edl.date))}.${
    edl.gps ? ` <span class="petit">Position : ${edl.gps.lat.toFixed(5)}, ${edl.gps.lon.toFixed(5)} (±${Math.round(edl.gps.precision)} m) le ${h(dateHeureFr(edl.gps.date))}</span>` : ''
  }</p><div class="sig">${(['bailleur', 'locataire'] as const)
    .map((q) => {
      const s = edl.signatures[q];
      return `<div><strong>${q === 'bailleur' ? 'Le bailleur' : 'Le locataire'}</strong> — ${h(s.nom)}<br><span class="petit">« Certifié exact »${s.date ? ' — ' + h(dateHeureFr(s.date)) : ''}</span>${
        s.image ? `<img src="${h(s.image)}" alt="Signature">` : '<div style="height:110px;border-bottom:1px solid #333"></div>'
      }</div>`;
    })
    .join('')}</div>`);

  const corps = `<div class="rapport">${parts.join('\n')}</div>`;
  if (!autonome) return corps;
  return `<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${h(titre)} — ${h(edl.logement.nom)} — ${h(dateFr(edl.date))}</title><style>body{margin:0;background:#fff}${CSS_RAPPORT}</style></head><body>${corps}</body></html>`;
}

