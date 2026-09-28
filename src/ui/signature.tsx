import { useEffect, useRef, useState } from 'preact/hooks';

/** Signature au doigt sur canvas. Renvoie une image PNG (data URL). */
export function PadSignature({ onValider, onAnnuler }: { onValider: (png: string) => void; onAnnuler: () => void }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const [vide, setVide] = useState(true);

  useEffect(() => {
    const c = canvas.current!;
    const ratio = Math.max(1, window.devicePixelRatio || 1);
    const r = c.getBoundingClientRect();
    c.width = r.width * ratio;
    c.height = r.height * ratio;
    const ctx = c.getContext('2d')!;
    ctx.scale(ratio, ratio);
    ctx.lineWidth = 2.5;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = '#0a1a5c';
    let dessine = false;
    let x = 0;
    let y = 0;
    const pos = (e: PointerEvent) => {
      const b = c.getBoundingClientRect();
      return [e.clientX - b.left, e.clientY - b.top];
    };
    const down = (e: PointerEvent) => {
      e.preventDefault();
      c.setPointerCapture(e.pointerId);
      dessine = true;
      [x, y] = pos(e);
      ctx.beginPath();
      ctx.arc(x, y, 1.2, 0, Math.PI * 2);
      ctx.fillStyle = ctx.strokeStyle;
      ctx.fill();
      setVide(false);
    };
    const move = (e: PointerEvent) => {
      if (!dessine) return;
      e.preventDefault();
      const [nx, ny] = pos(e);
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(nx, ny);
      ctx.stroke();
      [x, y] = [nx, ny];
    };
    const up = () => {
      dessine = false;
    };
    c.addEventListener('pointerdown', down);
    c.addEventListener('pointermove', move);
    c.addEventListener('pointerup', up);
    c.addEventListener('pointercancel', up);
    return () => {
      c.removeEventListener('pointerdown', down);
      c.removeEventListener('pointermove', move);
      c.removeEventListener('pointerup', up);
      c.removeEventListener('pointercancel', up);
    };
  }, []);

  function effacer() {
    const c = canvas.current!;
    c.getContext('2d')!.clearRect(0, 0, c.width, c.height);
    setVide(true);
  }

  return (
    <div class="pad-signature">
      <canvas ref={canvas} />
      <div class="grid">
        <button class="secondary outline" onClick={onAnnuler}>
          Annuler
        </button>
        <button class="secondary" onClick={effacer}>
          Effacer
        </button>
        <button disabled={vide} onClick={() => onValider(canvas.current!.toDataURL('image/png'))}>
          Valider
        </button>
      </div>
    </div>
  );
}
