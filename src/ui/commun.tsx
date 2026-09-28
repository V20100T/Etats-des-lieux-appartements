import { useEffect, useRef, useState } from 'preact/hooks';
import type { ComponentChildren } from 'preact';
import { ETAT_LIBELLE, ETATS } from '../model/etats';
import type { Etat } from '../model/types';
import { compresserPhoto } from '../photos/compression';
import { ajouterPhoto, urlPhoto } from '../storage/db';

/* ---------- Routeur (hash) ---------- */

export function useRoute(): string[] {
  const lire = () => location.hash.replace(/^#\/?/, '').split('/').filter(Boolean).map(decodeURIComponent);
  const [r, setR] = useState(lire);
  useEffect(() => {
    const f = () => {
      setR(lire());
      window.scrollTo(0, 0);
    };
    addEventListener('hashchange', f);
    return () => removeEventListener('hashchange', f);
  }, []);
  return r;
}

export const aller = (chemin: string) => {
  location.hash = '#/' + chemin.replace(/^\//, '');
};

/* ---------- Divers ---------- */

export function Progression({ faits, total }: { faits: number; total: number }) {
  return (
    <div class="progression">
      <progress value={faits} max={total || 1} />
      <small>
        {faits}/{total} éléments renseignés
      </small>
    </div>
  );
}

export function EtatBadge({ etat }: { etat?: Etat }) {
  return <span class={`badge e-${etat ?? 'vide'}`}>{etat ?? '—'}</span>;
}

export function EtatBoutons({ valeur, onChange, ro }: { valeur?: Etat; onChange: (e: Etat | undefined) => void; ro?: boolean }) {
  return (
    <div class="etats" role="group">
      {ETATS.map((e) => (
        <button
          type="button"
          key={e}
          class={`etat e-${e} ${valeur === e ? 'actif' : ''}`}
          aria-pressed={valeur === e}
          title={ETAT_LIBELLE[e]}
          disabled={ro}
          onClick={() => onChange(valeur === e ? undefined : e)}
        >
          {e}
        </button>
      ))}
    </div>
  );
}

/** Textarea qui grandit avec son contenu. */
export function Texte(props: { value: string; onInput: (v: string) => void; placeholder?: string; ro?: boolean; lignes?: number }) {
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    const t = ref.current;
    if (t) {
      t.style.height = 'auto';
      t.style.height = t.scrollHeight + 2 + 'px';
    }
  }, [props.value]);
  return (
    <textarea
      ref={ref}
      rows={props.lignes ?? 1}
      value={props.value}
      placeholder={props.placeholder}
      readOnly={props.ro}
      onInput={(e) => props.onInput((e.target as HTMLTextAreaElement).value)}
    />
  );
}

export function Miniature({ id, onClick }: { id: string; onClick?: () => void }) {
  const [url, setUrl] = useState<string>();
  const [absente, setAbsente] = useState(false);
  useEffect(() => {
    let vivant = true;
    urlPhoto(id).then((u) => {
      if (!vivant) return;
      if (u) setUrl(u);
      else setAbsente(true);
    });
    return () => {
      vivant = false;
    };
  }, [id]);
  return (
    <button type="button" class="miniature" onClick={onClick} title={absente ? 'Photo absente de cet appareil' : 'Agrandir'}>
      {url ? <img src={url} alt="" loading="lazy" /> : <span>{absente ? '∅' : '…'}</span>}
    </button>
  );
}

/** Visionneuse plein écran. */
export function Visionneuse({ ids, index, onClose, onDelete }: { ids: string[]; index: number; onClose: () => void; onDelete?: (id: string) => void }) {
  const [i, setI] = useState(index);
  const [url, setUrl] = useState<string>();
  const id = ids[i];
  useEffect(() => {
    if (id) urlPhoto(id).then(setUrl);
  }, [id]);
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowRight') setI((x) => Math.min(ids.length - 1, x + 1));
      if (e.key === 'ArrowLeft') setI((x) => Math.max(0, x - 1));
    };
    addEventListener('keydown', k);
    return () => removeEventListener('keydown', k);
  }, [ids.length]);
  if (!id) return null;
  return (
    <div class="visionneuse" onClick={onClose}>
      {url && <img src={url} alt="" />}
      <div class="barre" onClick={(e) => e.stopPropagation()}>
        <button class="secondary" disabled={i === 0} onClick={() => setI(i - 1)}>
          ◀
        </button>
        <span>
          {i + 1}/{ids.length}
        </span>
        <button class="secondary" disabled={i >= ids.length - 1} onClick={() => setI(i + 1)}>
          ▶
        </button>
        {onDelete && (
          <button
            class="contrast"
            onClick={() => {
              if (confirm('Supprimer cette photo ?')) {
                onDelete(id);
                onClose();
              }
            }}
          >
            🗑
          </button>
        )}
        <button onClick={onClose}>✕</button>
      </div>
    </div>
  );
}

/** Bandeau de photos d'un élément, avec prise de vue. */
export function Photos({ ids, onChange, ro, titre }: { ids: string[]; onChange?: (ids: string[]) => void; ro?: boolean; titre?: string }) {
  const [vue, setVue] = useState<number>();
  const [attente, setAttente] = useState(0);
  const camera = useRef<HTMLInputElement>(null);
  const galerie = useRef<HTMLInputElement>(null);
  const courant = useRef(ids);
  courant.current = ids;

  async function ajouter(e: Event) {
    const input = e.target as HTMLInputElement;
    const fichiers = Array.from(input.files ?? []);
    input.value = '';
    setAttente((n) => n + fichiers.length);
    for (const f of fichiers) {
      try {
        const id = await ajouterPhoto(await compresserPhoto(f));
        courant.current = [...courant.current, id];
        onChange?.(courant.current);
      } catch (err) {
        alert('Photo illisible : ' + (err as Error).message);
      } finally {
        setAttente((n) => n - 1);
      }
    }
  }

  if (ro && !ids.length) return null;
  return (
    <div class="photos">
      {titre && ids.length > 0 && <small class="titre-photos">{titre}</small>}
      {ids.map((id, i) => (
        <Miniature key={id} id={id} onClick={() => setVue(i)} />
      ))}
      {attente > 0 && <span class="miniature" aria-busy="true" />}
      {!ro && onChange && (
        <>
          <button type="button" class="ajout-photo outline" onClick={() => camera.current?.click()} title="Prendre une photo">
            📷
          </button>
          <button type="button" class="ajout-photo outline secondary" onClick={() => galerie.current?.click()} title="Depuis la galerie">
            🖼
          </button>
          <input ref={camera} type="file" accept="image/*" capture="environment" hidden onChange={ajouter} />
          <input ref={galerie} type="file" accept="image/*" multiple hidden onChange={ajouter} />
        </>
      )}
      {vue != null && (
        <Visionneuse
          ids={ids}
          index={vue}
          onClose={() => setVue(undefined)}
          onDelete={!ro && onChange ? (id) => onChange(ids.filter((x) => x !== id)) : undefined}
        />
      )}
    </div>
  );
}

/* ---------- Fichiers ---------- */

export function telecharger(nom: string, contenu: Blob) {
  const url = URL.createObjectURL(contenu);
  const a = document.createElement('a');
  a.href = url;
  a.download = nom;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

export function peutPartager(): boolean {
  try {
    return !!navigator.canShare?.({ files: [new File(['x'], 'x.txt', { type: 'text/plain' })] });
  } catch {
    return false;
  }
}

export async function partager(nom: string, contenu: Blob, titre: string) {
  const f = new File([contenu], nom, { type: contenu.type });
  try {
    await navigator.share({ files: [f], title: titre });
  } catch (e) {
    if ((e as Error).name !== 'AbortError') telecharger(nom, contenu);
  }
}

export function choisirFichier(accept: string): Promise<File | undefined> {
  return new Promise((ok) => {
    const i = document.createElement('input');
    i.type = 'file';
    i.accept = accept;
    i.onchange = () => ok(i.files?.[0]);
    i.click();
  });
}

export function Section({ titre, children, ouvert }: { titre: ComponentChildren; children: ComponentChildren; ouvert?: boolean }) {
  return (
    <details open={ouvert}>
      <summary>{titre}</summary>
      {children}
    </details>
  );
}
