/** Parseur / générateur CSV maison, compatible Excel (BOM, `;`, Windows-1252). */

/** Décode des octets en texte : UTF-8 (avec ou sans BOM), sinon Windows-1252 (Excel FR). */
export function decoderTexte(octets: Uint8Array): string {
  if (octets[0] === 0xff && octets[1] === 0xfe) return new TextDecoder('utf-16le').decode(octets.subarray(2));
  if (octets[0] === 0xfe && octets[1] === 0xff) return new TextDecoder('utf-16be').decode(octets.subarray(2));
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(octets).replace(/^﻿/, '');
  } catch {
    return new TextDecoder('windows-1252').decode(octets);
  }
}

/** Devine le séparateur sur les premières lignes (hors guillemets). */
export function detecterSeparateur(texte: string): string {
  const candidats = [';', ',', '\t', '|'];
  const lignes: string[] = [];
  let cur = '';
  let q = false;
  for (let i = 0; i < texte.length && lignes.length < 10; i++) {
    const c = texte[i];
    if (c === '"') q = !q;
    if (!q && (c === '\n' || c === '\r')) {
      if (cur) lignes.push(cur);
      cur = '';
    } else cur += c;
  }
  if (cur && lignes.length < 10) lignes.push(cur);
  let meilleur = ';';
  let score = -1;
  for (const sep of candidats) {
    const comptes = lignes.map((l) => compterHorsGuillemets(l, sep));
    const premier = comptes[0] ?? 0;
    if (premier === 0) continue;
    // Séparateur régulier d'une ligne à l'autre = bon candidat.
    const reguliers = comptes.filter((c) => c === premier).length;
    const s = reguliers * 100 + premier;
    if (s > score) {
      score = s;
      meilleur = sep;
    }
  }
  return meilleur;
}

function compterHorsGuillemets(ligne: string, sep: string): number {
  let n = 0;
  let q = false;
  for (const c of ligne) {
    if (c === '"') q = !q;
    else if (!q && c === sep) n++;
  }
  return n;
}

/** Parse un CSV (RFC 4180 + tolérances). Renvoie un tableau de lignes. */
export function parserCsv(texte: string, sep = detecterSeparateur(texte)): string[][] {
  texte = texte.replace(/^﻿/, '');
  const lignes: string[][] = [];
  let ligne: string[] = [];
  let champ = '';
  let q = false;
  for (let i = 0; i < texte.length; i++) {
    const c = texte[i];
    if (q) {
      if (c === '"') {
        if (texte[i + 1] === '"') {
          champ += '"';
          i++;
        } else q = false;
      } else champ += c;
    } else if (c === '"' && champ === '') {
      q = true;
    } else if (c === sep) {
      ligne.push(champ);
      champ = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && texte[i + 1] === '\n') i++;
      ligne.push(champ);
      lignes.push(ligne);
      ligne = [];
      champ = '';
    } else champ += c;
  }
  if (champ !== '' || ligne.length) {
    ligne.push(champ);
    lignes.push(ligne);
  }
  return lignes.filter((l) => l.some((c) => c.trim() !== ''));
}

function echapper(v: string, sep: string): string {
  return /["\r\n]/.test(v) || v.includes(sep) || /^\s|\s$/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}

/** Génère un CSV pour Excel : BOM UTF-8, `;`, fins de ligne CRLF. */
export function genererCsv(lignes: (string | number | undefined)[][], sep = ';'): string {
  return '﻿' + lignes.map((l) => l.map((v) => echapper(v == null ? '' : String(v), sep)).join(sep)).join('\r\n') + '\r\n';
}
