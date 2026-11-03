import { useEffect, useRef, useState } from 'react';
import { FULL, originalOf, saveCutout, variantUrl } from './images';
import { Close, Undo } from './icons';
import { SliderRow } from './ui';

const load = (src: string) => new Promise<HTMLImageElement>((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => rej(new Error('image')); i.src = src; });

/** Paint away leftovers or bring parts of the person back. Works on a cut-out; Restore needs the original photo. */
export default function RefineEdges({ file, bg, onDone, onCancel }: {
  file: string; bg?: string; onDone: (r: { file: string; aspect: number }) => void; onCancel: () => void;
}) {
  const view = useRef<HTMLCanvasElement>(null);
  const work = useRef<HTMLCanvasElement | null>(null);   // the cut-out being edited (full size)
  const orig = useRef<HTMLCanvasElement | null>(null);   // the original photo, same size
  const hist = useRef<ImageData[]>([]);
  const last = useRef<{ x: number; y: number } | null>(null);
  const [mode, setMode] = useState<'erase' | 'restore'>('erase');
  const [size, setSize] = useState(24);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [canRestore, setCanRestore] = useState(false);
  const [undos, setUndos] = useState(0);
  const from = originalOf(file);

  const draw = () => {
    const v = view.current, w = work.current;
    if (!v || !w) return;
    const x = v.getContext('2d')!;
    x.clearRect(0, 0, v.width, v.height);
    // checkerboard, or the colour that will sit behind the photo
    if (bg) { x.fillStyle = bg; x.fillRect(0, 0, v.width, v.height); }
    else {
      const s = 12;
      for (let yy = 0; yy < v.height; yy += s) for (let xx = 0; xx < v.width; xx += s) { x.fillStyle = ((xx + yy) / s) % 2 ? '#e4e4ea' : '#fff'; x.fillRect(xx, yy, s, s); }
    }
    x.drawImage(w, 0, 0, v.width, v.height);
  };

  useEffect(() => {
    let on = true;
    (async () => {
      const cut = await load(await variantUrl(file, 0, FULL, 2400));
      const w = document.createElement('canvas'); w.width = cut.naturalWidth; w.height = cut.naturalHeight;
      w.getContext('2d', { willReadFrequently: true })!.drawImage(cut, 0, 0);
      work.current = w;
      if (from) {
        try {
          const o = await load(await variantUrl(from, 0, FULL, 2400));
          const oc = document.createElement('canvas'); oc.width = w.width; oc.height = w.height;
          oc.getContext('2d')!.drawImage(o, 0, 0, w.width, w.height);
          orig.current = oc; if (on) setCanRestore(true);
        } catch { /* original gone */ }
      }
      if (!on) return;
      const box = view.current!.parentElement!.getBoundingClientRect();
      const k = Math.min(box.width / w.width, box.height / w.height);
      view.current!.width = Math.round(w.width * k); view.current!.height = Math.round(w.height * k);
      setReady(true); draw();
    })().catch(() => onCancel());
    return () => { on = false; };
  }, []);
  useEffect(() => { if (ready) draw(); }, [ready, bg]);

  const pos = (e: React.PointerEvent) => {
    const v = view.current!, r = v.getBoundingClientRect(), w = work.current!;
    return { x: ((e.clientX - r.left) / r.width) * w.width, y: ((e.clientY - r.top) / r.height) * w.height };
  };
  const brushPx = () => { const w = work.current!, v = view.current!; return (size * w.width) / v.width; };

  const stroke = (a: { x: number; y: number }, b: { x: number; y: number }) => {
    const w = work.current!, r = brushPx() / 2;
    const wc = w.getContext('2d')!;
    const path = (c: CanvasRenderingContext2D) => { c.lineCap = 'round'; c.lineJoin = 'round'; c.lineWidth = r * 2; c.beginPath(); c.moveTo(a.x, a.y); c.lineTo(b.x, b.y); c.stroke(); };
    if (mode === 'erase') { wc.save(); wc.globalCompositeOperation = 'destination-out'; wc.strokeStyle = '#000'; path(wc); wc.restore(); return; }
    const o = orig.current; if (!o) return;
    const x0 = Math.max(0, Math.floor(Math.min(a.x, b.x) - r - 2)), y0 = Math.max(0, Math.floor(Math.min(a.y, b.y) - r - 2));
    const x1 = Math.min(w.width, Math.ceil(Math.max(a.x, b.x) + r + 2)), y1 = Math.min(w.height, Math.ceil(Math.max(a.y, b.y) + r + 2));
    const bw = x1 - x0, bh = y1 - y0; if (bw <= 0 || bh <= 0) return;
    const t = document.createElement('canvas'); t.width = bw; t.height = bh;
    const tc = t.getContext('2d')!;
    tc.save(); tc.translate(-x0, -y0); tc.strokeStyle = '#000'; path(tc); tc.restore();
    tc.globalCompositeOperation = 'source-in'; tc.drawImage(o, x0, y0, bw, bh, 0, 0, bw, bh);
    wc.drawImage(t, x0, y0);
    t.width = t.height = 0;
  };

  const down = (e: React.PointerEvent) => {
    if (!ready || busy) return;
    (e.target as Element).setPointerCapture(e.pointerId);
    const w = work.current!;
    hist.current.push(w.getContext('2d')!.getImageData(0, 0, w.width, w.height));
    if (hist.current.length > 6) hist.current.shift();
    setUndos(hist.current.length);
    const p = pos(e); last.current = p; stroke(p, p); draw();
  };
  const move = (e: React.PointerEvent) => { if (!last.current) return; const p = pos(e); stroke(last.current, p); last.current = p; draw(); };
  const up = () => { last.current = null; };
  const undo = () => { const h = hist.current.pop(); if (h && work.current) { work.current.getContext('2d')!.putImageData(h, 0, 0); draw(); } setUndos(hist.current.length); };

  const done = async () => {
    if (!work.current) return;
    setBusy(true);
    try { onDone(await saveCutout(work.current, from ?? file)); } catch { setBusy(false); onCancel(); }
  };

  return (
    <div className="refine" role="dialog" aria-label="Refine edges">
      <div className="refine-bar">
        <button className="icon-btn" onClick={onCancel} aria-label="Cancel"><Close /></button>
        <b>Refine edges</b>
        <button className="icon-btn" onClick={undo} disabled={!undos} aria-label="Undo"><Undo /></button>
        <button className="btn primary" onClick={done} disabled={!ready || busy}>{busy ? 'Saving…' : 'Done'}</button>
      </div>
      <div className="refine-stage">
        <canvas ref={view} className="refine-canvas" onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up} />
      </div>
      <div className="refine-tools">
        <div className="seg">
          <button className={mode === 'erase' ? 'on' : ''} onClick={() => setMode('erase')}>Erase</button>
          <button className={mode === 'restore' ? 'on' : ''} onClick={() => canRestore && setMode('restore')} disabled={!canRestore}>Bring back</button>
        </div>
        <SliderRow label="Brush" value={size} min={6} max={80} suffix={`${size}`} onChange={setSize} />
        <span className="muted small">{mode === 'erase' ? 'Paint over leftovers to remove them.' : 'Paint to bring back hair or edges that were cut off.'}{!canRestore && ' Bring back needs the original photo, which is not available for this one.'}</span>
      </div>
    </div>
  );
}
