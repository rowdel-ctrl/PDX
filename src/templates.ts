import type { Frame, Page, PageText, Project } from './types';
import { emptyFrame, fillFrames } from './layout';
import { newId } from './images';
import { newProject } from './storage';

export type Group = 'ID photos' | 'Photo prints' | 'Collage' | 'Documents' | 'My templates';
export interface Template { id: string; name: string; group: Group; w: number; h: number; make: (p: Page) => Page }

const blank = (p: Page, w: number, h: number, margin: number, spacing: number): Page =>
  ({ ...p, widthMm: w, heightMm: h, layout: 'free', images: [], texts: [], frames: [], fill: undefined, marginMm: margin, spacingMm: spacing });

const fromRects = (p: Page, rects: [number, number, number, number][]): Frame[] =>
  rects.map(([x, y, w, h]) => emptyFrame(x, y, w, h, p.widthMm, p.heightMm));

const grid = (id: string, name: string, group: Group, w: number, h: number, fw: number, fh: number, margin: number, spacing: number): Template => ({
  id, name, group, w, h,
  make: (p) => { const b = blank(p, w, h, margin, spacing); return { ...b, frames: fillFrames(b, fw, fh) }; },
});

const single = (id: string, name: string, w: number, h: number): Template => ({
  id, name, group: 'Photo prints', w, h,
  make: (p) => { const b = blank(p, w, h, 0, 0); return { ...b, frames: fromRects(b, [[0, 0, w, h]]) }; },
});

/** Collage cells inside A4 content area (10 mm margin, 6 mm gap). */
const collage = (id: string, name: string, cells: (cw: number, ch: number, g: number) => [number, number, number, number][]): Template => ({
  id, name, group: 'Collage', w: 210, h: 297,
  make: (p) => {
    const m = 10, g = 6, b = blank(p, 210, 297, m, g);
    return { ...b, frames: fromRects(b, cells(210 - 2 * m, 297 - 2 * m, g).map(([x, y, w, h]) => [x + m, y + m, w, h] as [number, number, number, number])) };
  },
});
const rc = (cw: number, ch: number, g: number, cols: number, rows: number): [number, number, number, number][] => {
  const w = (cw - g * (cols - 1)) / cols, h = (ch - g * (rows - 1)) / rows, out: [number, number, number, number][] = [];
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) out.push([c * (w + g), r * (h + g), w, h]);
  return out;
};

const text = (t: string, x: number, y: number, W: number, H: number): PageText =>
  ({ id: newId(), text: t, x: x / W, y: y / H, sizePt: 11, color: '#5B6372', bold: true });

export const TEMPLATES: Template[] = [
  grid('id-pp-a4', 'Passport 35×45 · A4', 'ID photos', 210, 297, 35, 45, 8, 5),
  grid('id-22-a4', '2×2 in · A4', 'ID photos', 210, 297, 50.8, 50.8, 8, 5),
  grid('id-11-a4', '1×1 in · A4', 'ID photos', 210, 297, 25.4, 25.4, 8, 4),
  grid('id-15-a4', '1.5×1.5 in · A4', 'ID photos', 210, 297, 38.1, 38.1, 8, 4),
  grid('id-34-a4', '3×4 cm · A4', 'ID photos', 210, 297, 30, 40, 8, 4),
  grid('id-pp-legal', 'Passport 35×45 · Legal', 'ID photos', 215.9, 330.2, 35, 45, 8, 5),
  grid('id-pp-4r', 'Passport · 4R sideways', 'ID photos', 152.4, 101.6, 35, 45, 1.5, 3),
  {
    id: 'id-mixed', name: '2×2 in + passport · A4', group: 'ID photos', w: 210, h: 297,
    make: (p) => {
      const b = blank(p, 210, 297, 8, 5), rects: [number, number, number, number][] = [];
      for (let c = 0; c < 3; c++) rects.push([23.8 + c * 55.8, 10, 50.8, 50.8]);
      for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) rects.push([27.5 + c * 40, 68.8 + r * 50, 35, 45]);
      return { ...b, frames: fromRects(b, rects) };
    },
  },
  single('pr-2r', '2R · 1 per page', 63.5, 88.9),
  single('pr-3r', '3R · 1 per page', 88.9, 127),
  single('pr-4r', '4R · 1 per page', 101.6, 152.4),
  single('pr-5r', '5R · 1 per page', 127, 177.8),
  single('pr-6r', '6R · 1 per page', 152.4, 203.2),
  single('pr-8r', '8R · 1 per page', 203.2, 254),
  single('pr-wallet', 'Wallet 2×3 in · 1 per page', 50.8, 76.2),
  grid('pr-2r-a4', '2R × 9 · A4', 'Photo prints', 210, 297, 63.5, 88.9, 3, 4),
  grid('pr-3r-a4', '3R × 4 · A4', 'Photo prints', 210, 297, 88.9, 127, 3, 4),
  grid('pr-4r-a4', '4R × 2 · A4', 'Photo prints', 210, 297, 101.6, 152.4, 2, 2),
  grid('pr-wallet-a4', 'Wallet 2×3 in × 9 · A4', 'Photo prints', 210, 297, 50.8, 76.2, 8, 4),
  grid('pr-wallet-4r', 'Wallet 2×3 in × 4 · 4R', 'Photo prints', 101.6, 152.4, 50.8, 76.2, 0, 0),
  collage('co-2', '2 photos', (cw, ch, g) => rc(cw, ch, g, 1, 2)),
  collage('co-3', '3 photos', (cw, ch, g) => { const h1 = (ch - g) * 0.58, h2 = ch - g - h1, w = (cw - g) / 2; return [[0, 0, cw, h1], [0, h1 + g, w, h2], [w + g, h1 + g, w, h2]]; }),
  collage('co-4', '4 photos', (cw, ch, g) => rc(cw, ch, g, 2, 2)),
  collage('co-6', '6 photos', (cw, ch, g) => rc(cw, ch, g, 2, 3)),
  collage('co-hero', '1 big + 3', (cw, ch, g) => { const h1 = (ch - g) * 0.62, h2 = ch - g - h1, w = (cw - 2 * g) / 3; return [[0, 0, cw, h1], [0, h1 + g, w, h2], [w + g, h1 + g, w, h2], [2 * (w + g), h1 + g, w, h2]]; }),
  {
    id: 'doc-idcard', name: 'ID card front + back · A4', group: 'Documents', w: 210, h: 297,
    make: (p) => {
      const b = blank(p, 210, 297, 10, 5), x = (210 - 85.6) / 2, y1 = 50, y2 = 50 + 54 + 36;
      return { ...b, frames: fromRects(b, [[x, y1, 85.6, 54], [x, y2, 85.6, 54]]), texts: [text('Front', x, y1 - 8, 210, 297), text('Back', x, y2 - 8, 210, 297)] };
    },
  },
];

export const GROUPS: Group[] = ['ID photos', 'Photo prints', 'Collage', 'Documents'];

export function projectFromTemplate(t: Template): Project {
  const p = newProject(t.name, t.w, t.h);
  p.pages = [t.make(p.pages[0])];
  return p;
}
