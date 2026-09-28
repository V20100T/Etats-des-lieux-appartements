/** Lecteur XLSX minimal (valeurs des cellules uniquement), basé sur fflate + DOMParser. */
import { unzipSync, strFromU8 } from 'fflate';

export interface Feuille {
  nom: string;
  lignes: string[][];
}

function xml(s: string): Document {
  return new DOMParser().parseFromString(s, 'application/xml');
}

const tous = (n: Document | Element, tag: string) => Array.from(n.getElementsByTagNameNS('*', tag));

/** Texte d'un <si> ou <is>, en ignorant la phonétique (<rPh>). */
function texteRiche(n: Element): string {
  return tous(n, 't')
    .filter((t) => t.parentElement?.localName !== 'rPh')
    .map((t) => t.textContent ?? '')
    .join('');
}

function colonne(ref: string): number {
  const lettres = ref.replace(/[0-9$]/g, '').toUpperCase();
  let n = 0;
  for (const c of lettres) n = n * 26 + (c.charCodeAt(0) - 64);
  return n - 1;
}

function nombre(v: string): string {
  const n = Number(v);
  if (!Number.isFinite(n)) return v;
  // 1.0 -> "1", 0.30000000000000004 -> "0.3"
  return String(Math.round(n * 1e9) / 1e9);
}

export function lireXlsx(octets: Uint8Array): Feuille[] {
  const fichiers = unzipSync(octets);
  const lire = (chemin: string) => {
    const f = fichiers[chemin];
    return f ? strFromU8(f) : undefined;
  };

  const partages: string[] = [];
  const sst = lire('xl/sharedStrings.xml');
  if (sst) for (const si of tous(xml(sst), 'si')) partages.push(texteRiche(si));

  const cibles = new Map<string, string>();
  const rels = lire('xl/_rels/workbook.xml.rels');
  if (rels) {
    for (const r of tous(xml(rels), 'Relationship')) {
      let t = r.getAttribute('Target') ?? '';
      t = t.startsWith('/') ? t.slice(1) : 'xl/' + t;
      cibles.set(r.getAttribute('Id') ?? '', t);
    }
  }

  const wb = lire('xl/workbook.xml');
  if (!wb) throw new Error("Ce fichier n'est pas un classeur Excel (.xlsx) valide.");
  const feuilles: Feuille[] = [];
  for (const s of tous(xml(wb), 'sheet')) {
    const rid =
      s.getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships', 'id') ??
      s.getAttribute('r:id') ??
      '';
    const chemin = cibles.get(rid);
    const contenu = chemin ? lire(chemin) : undefined;
    if (!contenu) continue;
    const lignes: string[][] = [];
    for (const row of tous(xml(contenu), 'row')) {
      const r = Number(row.getAttribute('r') ?? lignes.length + 1) - 1;
      const cells: string[] = [];
      let auto = 0;
      for (const c of tous(row as unknown as Document, 'c')) {
        const ref = c.getAttribute('r');
        const col = ref ? colonne(ref) : auto;
        auto = col + 1;
        const t = c.getAttribute('t');
        const v = tous(c, 'v')[0]?.textContent ?? '';
        let val: string;
        if (t === 's') val = partages[Number(v)] ?? '';
        else if (t === 'inlineStr') val = tous(c, 'is')[0] ? texteRiche(tous(c, 'is')[0]) : '';
        else if (t === 'b') val = v === '1' ? 'VRAI' : 'FAUX';
        else if (t === 'str' || t === 'e') val = v;
        else val = v ? nombre(v) : '';
        cells[col] = val;
      }
      lignes[r] = Array.from(cells, (x) => x ?? '');
    }
    feuilles.push({ nom: s.getAttribute('name') ?? '', lignes: Array.from(lignes, (l) => l ?? []) });
  }
  return feuilles;
}
