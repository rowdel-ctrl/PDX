import type { Unit } from './types';

export const PRESETS: Record<string, [number, number]> = {
  A3: [297, 420],
  A4: [210, 297],
  A5: [148, 210],
  Letter: [215.9, 279.4],
  Legal: [215.9, 330.2],
};

const PER_MM: Record<Unit, number> = { mm: 1, cm: 0.1, in: 1 / 25.4 };
export const MIN_MM = 20;
export const MAX_MM = 5000; // PDF limit is 14400 pt (~5080 mm)

export const fromMm = (mm: number, u: Unit) => mm * PER_MM[u];
export const toMm = (v: number, u: Unit) => v / PER_MM[u];
export const fmt = (mm: number, u: Unit) => {
  const v = fromMm(mm, u);
  return String(Math.round(v * (u === 'in' ? 100 : 10)) / (u === 'in' ? 100 : 10));
};
export const mmToPt = (mm: number) => (mm * 72) / 25.4;

export function presetOf(w: number, h: number): string | null {
  const [a, b] = w <= h ? [w, h] : [h, w];
  for (const [name, [pw, ph]] of Object.entries(PRESETS)) {
    if (Math.abs(pw - a) < 0.5 && Math.abs(ph - b) < 0.5) return name;
  }
  return null;
}
