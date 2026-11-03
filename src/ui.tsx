import type { ReactNode } from 'react';
import { Check } from './icons';

export function Switch({ checked, onChange, label, hint }: { checked: boolean; onChange: (b: boolean) => void; label: string; hint?: string }) {
  return (
    <label className="row-switch">
      <span><span className="rs-label">{label}</span>{hint && <span className="rs-hint">{hint}</span>}</span>
      <input type="checkbox" role="switch" className="md-switch" checked={checked} onChange={(e) => onChange(e.target.checked)} />
    </label>
  );
}

export const SWATCHES = ['#FFFFFF', '#000000', '#6B7280', '#EF4444', '#F97316', '#FACC15', '#22C55E', '#14B8A6', '#3B82F6', '#4355B9', '#A855F7', '#EC4899', '#FBE9D0', '#D9E4FF'];

/** Row of ready colors plus a "+" for any color. */
export function Swatches({ value, onChange, label }: { value: string; onChange: (c: string) => void; label: string }) {
  const custom = !SWATCHES.some((c) => c.toLowerCase() === value.toLowerCase());
  return (
    <div className="field" role="group" aria-label={label}>{label}
      <div className="swatches">
        {SWATCHES.map((c) => (
          <button key={c} className={'swatch' + (c.toLowerCase() === value.toLowerCase() ? ' on' : '')} style={{ background: c }} aria-label={c} aria-pressed={c.toLowerCase() === value.toLowerCase()} onClick={() => onChange(c)}>
            {c.toLowerCase() === value.toLowerCase() && <span style={{ color: parseInt(c.slice(1), 16) > 0x888888 ? '#000' : '#fff' }}><Check /></span>}
          </button>
        ))}
        <label className={'swatch plus' + (custom ? ' on' : '')} style={custom ? { background: value } : undefined} aria-label="Custom color">
          {custom ? <Check /> : '+'}
          <input type="color" value={/^#[0-9a-f]{6}$/i.test(value) ? value : '#000000'} onChange={(e) => onChange(e.target.value)} />
        </label>
      </div>
    </div>
  );
}

export function SliderRow({ label, value, min, max, step = 1, suffix, onChange }: { label: string; value: number; min: number; max: number; step?: number; suffix: string; onChange: (v: number) => void }) {
  return (
    <label className="slider">
      <span>{label}</span>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} />
      <span className="muted val">{suffix}</span>
    </label>
  );
}

export function Segmented<T extends string>({ value, options, onChange }: { value: T; options: [T, ReactNode][]; onChange: (v: T) => void }) {
  return (
    <div className="seg" role="group">
      {options.map(([v, label]) => (
        <button key={v} className={value === v ? 'on' : ''} aria-pressed={value === v} onClick={() => onChange(v)}>{value === v && <Check />}{label}</button>
      ))}
    </div>
  );
}

/** Collapsed by default: keeps advanced options one tap away without cluttering the panel. */
export function More({ title = 'More options', children }: { title?: string; children: ReactNode }) {
  return (
    <details className="more">
      <summary>{title}</summary>
      <div className="more-body">{children}</div>
    </details>
  );
}
