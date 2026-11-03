import { useState } from 'react';
import type { Unit } from './types';
import NumField from './NumField';
import { MAX_MM, MIN_MM, PRESETS } from './units';
import { Segmented } from './ui';
import { Close, Edit } from './icons';

const LABEL: Record<string, string> = { A4: '210 × 297 mm', A3: '297 × 420 mm', A5: '148 × 210 mm', Letter: '8.5 × 11 in', Legal: '8.5 × 14 in' };
const ORDER = ['A4', 'A3', 'A5', 'Letter', 'Legal'];

/** "Pick a page size" sheet shown when starting a new document. */
export default function SizeSheet({ title, onCreate, onClose }: { title: string; onCreate: (size: { w: number; h: number }) => void; onClose: () => void }) {
  const [choice, setChoice] = useState('A4');
  const [unit, setUnit] = useState<Unit>('mm');
  const [land, setLand] = useState(false);
  const [wMm, setW] = useState(PRESETS.A4[0]);
  const [hMm, setH] = useState(PRESETS.A4[1]);
  const clamp = (v: number) => Math.min(MAX_MM, Math.max(MIN_MM, v));
  const pick = (n: string) => { setChoice(n); setW(PRESETS[n][0]); setH(PRESETS[n][1]); };
  const create = () => { const lo = Math.min(wMm, hMm), hi = Math.max(wMm, hMm); onCreate(land ? { w: hi, h: lo } : { w: lo, h: hi }); };
  return (
    <div className="sheet-back" onClick={onClose}>
      <div className="sheet" role="dialog" aria-label={title} onClick={(e) => e.stopPropagation()}>
        <div className="sheet-grab" />
        <div className="sheet-head"><div><div>{title}</div><div className="muted small" style={{ fontFamily: 'var(--body)', fontWeight: 400 }}>Pick a page size. You can change it later in Page.</div></div><button className="icon-btn" onClick={onClose} aria-label="Close"><Close /></button></div>
        <div className="size-cards">
          {ORDER.map((n) => {
            const [w, h] = PRESETS[n], k = 52 / Math.max(w, h);
            return (
              <button key={n} className={'size-card' + (choice === n ? ' on' : '')} aria-pressed={choice === n} onClick={() => pick(n)}>
                <span className="size-shape" style={land ? { width: h * k, height: w * k } : { width: w * k, height: h * k }} />
                <b>{n}</b><span>{LABEL[n]}</span>
              </button>
            );
          })}
          <button className={'size-card custom' + (choice === 'Custom' ? ' on' : '')} aria-pressed={choice === 'Custom'} onClick={() => setChoice('Custom')}>
            <Edit /><b>Custom</b><span>Type your own</span>
          </button>
        </div>
        <div className="row">
          <NumField label="Width" mm={wMm} unit={unit} onCommit={(mm) => { setW(clamp(mm)); setChoice('Custom'); }} />
          <NumField label="Height" mm={hMm} unit={unit} onCommit={(mm) => { setH(clamp(mm)); setChoice('Custom'); }} />
          <Segmented<Unit> value={unit} onChange={setUnit} options={[['mm', 'mm'], ['cm', 'cm'], ['in', 'in']]} />
        </div>
        <Segmented value={land ? 'l' : 'p'} onChange={(v) => setLand(v === 'l')} options={[['p', 'Portrait'], ['l', 'Landscape']]} />
        <button className="btn primary wide" onClick={create}>Create</button>
      </div>
    </div>
  );
}
