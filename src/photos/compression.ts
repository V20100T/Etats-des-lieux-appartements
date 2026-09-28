/** Compression des photos + incrustation de la date et de l'heure. */

const MAX = 1600;
const QUALITE = 0.72;

async function charger(fichier: Blob): Promise<ImageBitmap | HTMLImageElement> {
  if ('createImageBitmap' in window) {
    try {
      return await createImageBitmap(fichier, { imageOrientation: 'from-image' });
    } catch {
      /* repli sur <img> */
    }
  }
  const url = URL.createObjectURL(fichier);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    return img;
  } finally {
    URL.revokeObjectURL(url);
  }
}

export function horodatage(d: Date): string {
  return d.toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export async function compresserPhoto(fichier: File): Promise<Blob> {
  const img = await charger(fichier);
  const w0 = 'naturalWidth' in img ? img.naturalWidth : img.width;
  const h0 = 'naturalHeight' in img ? img.naturalHeight : img.height;
  const r = Math.min(1, MAX / Math.max(w0, h0));
  const w = Math.round(w0 * r);
  const h = Math.round(h0 * r);
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d')!;
  ctx.drawImage(img, 0, 0, w, h);
  if ('close' in img) img.close();

  // Date de prise de vue : lastModified (appareil photo = maintenant, galerie = date du fichier).
  const texte = horodatage(new Date(fichier.lastModified || Date.now()));
  const taille = Math.max(14, Math.round(Math.min(w, h) / 28));
  ctx.font = `bold ${taille}px system-ui, sans-serif`;
  const tw = ctx.measureText(texte).width;
  const pad = Math.round(taille / 2);
  ctx.fillStyle = 'rgba(0,0,0,0.55)';
  ctx.fillRect(w - tw - pad * 3, h - taille - pad * 3, tw + pad * 2, taille + pad * 2);
  ctx.fillStyle = '#ffcc00';
  ctx.textBaseline = 'bottom';
  ctx.fillText(texte, w - tw - pad * 2, h - pad * 2);

  return new Promise((ok, ko) => canvas.toBlob((b) => (b ? ok(b) : ko(new Error('Compression impossible'))), 'image/jpeg', QUALITE));
}
