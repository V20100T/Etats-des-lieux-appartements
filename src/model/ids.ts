export function uid(prefixe = ''): string {
  const c = globalThis.crypto;
  const id =
    c && 'randomUUID' in c
      ? c.randomUUID().replace(/-/g, '').slice(0, 16)
      : Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
  return prefixe + id;
}

export function maintenant(): string {
  return new Date().toISOString();
}

export function aujourdhui(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}
