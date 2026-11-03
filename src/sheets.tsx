import { useEffect, useState } from 'react';
import { useEd } from './editorContext';
import { findItem, gridFit, groupBox } from './arrange';
import { fmt, fromMm, toMm } from './units';
import { Close } from './icons';
import { Switch } from './ui';
import type { Unit } from './types';

function Head({ title, hint, onClose }: { title: string; hint?: string; onClose: () => void }) {
  return (
    <>
      <div className="sheet-grab" />
      <div className="sheet-head"><b>{title}</b><button className="icon-btn" onClick={onClose} aria-label="Close"><Close /></button></div>
      {hint && <p className="muted small" style={{ margin: '0 0 8px' }}>{hint}</p>}
    </>
  );
}

const Stepper = ({ label, value, max, onChange }: { label: string; value: number; max: number; onChange: (v: number) => void }) => (
  <div className="field">{label}
    <div className="stepper">
      <button aria-label={`Fewer ${label.toLowerCase()}`} disabled={value <= 1} onClick={() => onChange(value - 1)}>−</button>
      <b>{value}</b>
      <button aria-label={`More ${label.toLowerCase()}`} disabled={value >= max} onClick={() => onChange(value + 1)}>+</button>
    </div>
  </div>
);

/** Repeat the selected item or group in rows and columns across the page. */
export function FillGridSheet({ onClose }: { onClose: () => void }) {
  const ed = useEd();
  const [gap, setGap] = useState(ed.page.spacingMm || 2);
  const fit = gridFit(ed.page, ed.sel, gap);
  const [across, setAcross] = useState(fit?.across ?? 1), [down, setDown] = useState(fit?.down ?? 1);
  const [auto, setAuto] = useState(true);
  useEffect(() => { if (fit && auto) { setAcross(fit.across); setDown(fit.down); } }, [gap, fit?.across, fit?.down, auto]);
  if (!fit) return null;
  const a = Math.min(across, fit.across), d = Math.min(down, fit.down), copies = a * d - 1;
  return (
    <div className="sheet-back" onClick={onClose}>
      <div className="sheet" role="dialog" aria-label="Fill the page" onClick={(e) => e.stopPropagation()}>
        <Head title="Fill the page" hint="Copies the selected items into rows and columns." onClose={onClose} />
        <div className="two-col">
          <Stepper label="Across" value={a} max={fit.across} onChange={(v) => { setAuto(false); setAcross(v); }} />
          <Stepper label="Down" value={d} max={fit.down} onChange={(v) => { setAuto(false); setDown(v); }} />
        </div>
        <label className="slider"><span>Gap</span>
          <input type="range" min={0} max={20} step={0.5} value={gap} onChange={(e) => setGap(Number(e.target.value))} />
          <span className="muted val">{fmt(gap, ed.unit)} {ed.unit}</span>
        </label>
        <p className="muted small">Fits {fit.across} × {fit.down} of {fmt(fit.w, ed.unit)} × {fmt(fit.h, ed.unit)} {ed.unit} from where the selection starts. Copies that do not fit are skipped.</p>
        <button className="btn primary wide" disabled={copies < 1} onClick={() => { ed.fillGridSel(a, d, gap); onClose(); }}>Fill page · {copies < 1 ? 'nothing to add' : `${a * d} in total`}</button>
      </div>
    </div>
  );
}

const field = (mm: number, u: Unit) => fmt(mm, u);

/** Type the exact size and position of the selected item. */
export function ExactSheet({ onClose }: { onClose: () => void }) {
  const ed = useEd();
  const id = ed.selImage?.id ?? ed.selFrame?.id ?? ed.selText?.id ?? '';
  const it = findItem(ed.page, id);
  const b = it ? groupBox(ed.page, [id]) : null;
  const isText = it?.kind === 'text';
  const [unit, setUnit] = useState<Unit>(ed.unit);
  const [keep, setKeep] = useState(true);
  const mm = b ? { x: b.x * ed.page.widthMm, y: b.y * ed.page.heightMm, w: b.w * ed.page.widthMm, h: b.h * ed.page.heightMm } : { x: 0, y: 0, w: 0, h: 0 };
  const [txt, setTxt] = useState<Record<string, string>>({});
  useEffect(() => { setTxt({}); }, [id, unit, mm.x.toFixed(2), mm.y.toFixed(2), mm.w.toFixed(2), mm.h.toFixed(2)]);
  if (!it || !b) return null;
  const rotated = it.kind === 'image' && !!(it.item as { angle?: number }).angle;

  const commit = (k: 'x' | 'y' | 'w' | 'h', raw: string) => {
    setTxt((t) => ({ ...t, [k]: raw }));
    const v = parseFloat(raw);
    if (!Number.isFinite(v) || v < 0) return;
    const val = toMm(v, unit);
    if (k === 'w' || k === 'h') {
      if (val < 1) return;
      const r = mm.w / Math.max(0.001, mm.h);
      ed.setBox(id, keep ? (k === 'w' ? { w: val, h: val / r } : { h: val, w: val * r }) : { [k]: val });
    } else ed.setBox(id, { [k]: val });
  };
  const nudge = (dx: number, dy: number) => ed.setBox(id, { x: mm.x + dx, y: mm.y + dy });
  const val = (k: 'x' | 'y' | 'w' | 'h') => txt[k] ?? field(mm[k], unit);
  const F = ({ k, label, off }: { k: 'x' | 'y' | 'w' | 'h'; label: string; off?: boolean }) => (
    <label className="field">{label}
      <input className="box" type="number" inputMode="decimal" step={unit === 'in' ? 0.01 : 0.1} disabled={off} value={val(k)} onChange={(e) => commit(k, e.target.value)} />
    </label>
  );
  return (
    <div className="sheet-back" onClick={onClose}>
      <div className="sheet" role="dialog" aria-label="Size and position" onClick={(e) => e.stopPropagation()}>
        <Head title="Size and position" hint="Type exact values. Measured from the top-left corner of the page." onClose={onClose} />
        <div className="seg" style={{ alignSelf: 'flex-end' }}>{(['mm', 'cm', 'in'] as Unit[]).map((u) => <button key={u} className={unit === u ? 'on' : ''} onClick={() => setUnit(u)}>{u}</button>)}</div>
        <div className="two-col">
          <F k="w" label={`Width (${unit})`} off={isText} />
          <F k="h" label={`Height (${unit})`} off={isText} />
          <F k="x" label={`From left (${unit})`} />
          <F k="y" label={`From top (${unit})`} />
        </div>
        {!isText && <Switch label="Keep proportions" checked={keep} onChange={setKeep} />}
        {rotated && <p className="muted small">This photo is turned, so the box shown is its outline. Size changes apply to the photo itself.</p>}
        <div className="field">Nudge 1 mm
          <div className="nudge">
            <button aria-label="Nudge left" onClick={() => nudge(-1, 0)}>‹</button>
            <button aria-label="Nudge up" onClick={() => nudge(0, -1)}>⌃</button>
            <button aria-label="Nudge down" onClick={() => nudge(0, 1)}>⌄</button>
            <button aria-label="Nudge right" onClick={() => nudge(1, 0)}>›</button>
          </div>
        </div>
      </div>
    </div>
  );
}
