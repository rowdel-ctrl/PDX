import { useEffect, useState } from 'react';
import type { Unit } from './types';
import { fmt, toMm } from './units';

/** Number box shown in the chosen unit, stored in mm. */
export default function NumField({ label, mm, unit, onCommit }: { label: string; mm: number; unit: Unit; onCommit: (mm: number) => void }) {
  const [t, setT] = useState(fmt(mm, unit));
  useEffect(() => setT(fmt(mm, unit)), [mm, unit]);
  const commit = () => {
    const v = toMm(parseFloat(t.replace(',', '.')), unit);
    if (Number.isFinite(v) && v > 0) onCommit(v); else setT(fmt(mm, unit));
  };
  return (
    <label className="field">{label}
      <input inputMode="decimal" value={t} onChange={(e) => setT(e.target.value)} onBlur={commit} onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()} />
    </label>
  );
}
