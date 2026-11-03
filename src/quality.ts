import type { Project } from './types';
import { pixelSize } from './images';
import { frameCrop } from './layout';

/** Below this many dots per inch a print starts to look soft. */
export const LOW_DPI = 150;
/** What "Shrink to sharp size" aims for. */
export const SHARP_DPI = 200;

export interface LowPhoto { page: number; id: string; kind: 'image' | 'frame'; label: string; dpi: number; wMm: number; hMm: number; file: string }

/** Photos that would print softly at their current size. */
export async function findLowRes(p: Project): Promise<LowPhoto[]> {
  const out: LowPhoto[] = [];
  for (let pi = 0; pi < p.pages.length; pi++) {
    const pg = p.pages[pi];
    let n = 0;
    const check = async (file: string, rot: number, cw: number, ch: number, wFrac: number, hFrac: number, id: string, kind: 'image' | 'frame') => {
      n++;
      try {
        const s = await pixelSize(file);
        const [pw, ph] = rot % 2 ? [s.h, s.w] : [s.w, s.h];
        const wMm = wFrac * pg.widthMm, hMm = hFrac * pg.heightMm;
        const dpi = Math.min((pw * cw) / (wMm / 25.4), (ph * ch) / (hMm / 25.4));
        if (Number.isFinite(dpi) && dpi < LOW_DPI) out.push({ page: pi, id, kind, label: `${kind === 'frame' ? 'Frame' : 'Photo'} ${n}${p.pages.length > 1 ? ` · page ${pi + 1}` : ''}`, dpi: Math.round(dpi), wMm, hMm, file });
      } catch { /* unreadable: skip */ }
    };
    for (const im of pg.images) await check(im.file, im.rot, im.crop.w, im.crop.h, im.w, im.h, im.id, 'image');
    for (const f of pg.frames) if (f.file) { const c = frameCrop(f, pg.widthMm, pg.heightMm); await check(f.file, f.rot, c.w, c.h, f.w, f.h, f.id, 'frame'); }
  }
  return out;
}
