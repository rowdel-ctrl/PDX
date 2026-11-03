import type { Crop, LayoutId, Page, PageImage } from './types';
import { newId } from './images';

export const LAYOUTS: { id: LayoutId; label: string; cols: number; rows: number }[] = [
  { id: '1', label: '1', cols: 1, rows: 1 },
  { id: '2x1', label: '2×1', cols: 2, rows: 1 },
  { id: '2x2', label: '2×2', cols: 2, rows: 2 },
  { id: '2x3', label: '2×3', cols: 2, rows: 3 },
  { id: '3x3', label: '3×3', cols: 3, rows: 3 },
];

export const cellCount = (id: LayoutId) => {
  const l = LAYOUTS.find((x) => x.id === id);
  return l ? l.cols * l.rows : 99;
};

/** Aspect (w/h) of an image as shown, after rotation and crop. */
export const dispAspect = (im: Pick<PageImage, 'aspect' | 'rot' | 'crop'>) =>
  (im.rot % 2 ? 1 / im.aspect : im.aspect) * (im.crop.w / im.crop.h);

type Box = { x: number; y: number; w: number; h: number };

/** Fit an aspect inside a cell, centered. All in fractions of the page. */
function fit(aspect: number, c: Box, W: number, H: number): Box {
  const cellW = c.w * W, cellH = c.h * H;
  let w = cellW, h = cellW / aspect;
  if (h > cellH) { h = cellH; w = cellH * aspect; }
  const fw = w / W, fh = h / H;
  return { x: c.x + (c.w - fw) / 2, y: c.y + (c.h - fh) / 2, w: fw, h: fh };
}

export function cellRect(page: Page, n: number): Box | null {
  const l = LAYOUTS.find((x) => x.id === page.layout);
  if (!l) return null;
  const { widthMm: W, heightMm: H } = page;
  const m = Math.min(page.marginMm, Math.min(W, H) / 3);
  const s = page.spacingMm;
  const cw = (W - 2 * m - s * (l.cols - 1)) / l.cols;
  const ch = (H - 2 * m - s * (l.rows - 1)) / l.rows;
  const i = Math.min(n, l.cols * l.rows - 1);
  const col = i % l.cols, row = Math.floor(i / l.cols);
  return { x: (m + col * (cw + s)) / W, y: (m + row * (ch + s)) / H, w: cw / W, h: ch / H };
}

/** Place the page's images into the cells of its layout, in order. Free pages are left alone. */
export function applyLayout(page: Page): Page {
  if (page.layout === 'free') return page;
  const images = page.images.map((img, i) => {
    const cell = cellRect(page, i)!;
    return { ...img, ...fit(dispAspect(img), cell, page.widthMm, page.heightMm) };
  });
  return { ...page, images };
}

/** Crop (in rotated space) that makes an image cover a target aspect, centered. */
export function cropToAspect(im: Pick<PageImage, 'aspect' | 'rot'>, target: number): Crop {
  const full = im.rot % 2 ? 1 / im.aspect : im.aspect;
  if (full > target) { const w = target / full; return { x: (1 - w) / 2, y: 0, w, h: 1 }; }
  const h = full / target; return { x: 0, y: (1 - h) / 2, w: 1, h };
}

/** Crop after turning the image a quarter turn clockwise. */
export const rotateCrop = (c: Crop): Crop => ({ x: 1 - c.y - c.h, y: c.x, w: c.h, h: c.w });

/** How many w×h cells fit on the page, and the grid. */
function gridFor(page: Page, w: number, h: number) {
  const m = page.marginMm, s = page.spacingMm;
  const cols = Math.floor((page.widthMm - 2 * m + s) / (w + s));
  const rows = Math.floor((page.heightMm - 2 * m + s) / (h + s));
  return { cols: Math.max(0, cols), rows: Math.max(0, rows) };
}

export function fitCount(page: Page, w: number, h: number) {
  const a = gridFor(page, w, h), b = gridFor(page, h, w);
  return Math.max(a.cols * a.rows, b.cols * b.rows);
}

/** Fill the page with copies of one photo at an exact size (for printing). */
export function fillPage(page: Page, src: PageImage, wMm: number, hMm: number): Page {
  const a = gridFor(page, wMm, hMm), b = gridFor(page, hMm, wMm);
  const turned = b.cols * b.rows > a.cols * a.rows;
  const [w, h] = turned ? [hMm, wMm] : [wMm, hMm];
  const { cols, rows } = turned ? b : a;
  if (!cols || !rows) return page;
  const crop = cropToAspect(src, w / h);
  const s = page.spacingMm;
  const gw = cols * w + (cols - 1) * s, gh = rows * h + (rows - 1) * s;
  const x0 = (page.widthMm - gw) / 2, y0 = (page.heightMm - gh) / 2;
  const images: PageImage[] = [];
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
    images.push({
      id: newId(), file: src.file, aspect: src.aspect, rot: src.rot, crop,
      x: (x0 + c * (w + s)) / page.widthMm, y: (y0 + r * (h + s)) / page.heightMm,
      w: w / page.widthMm, h: h / page.heightMm,
    });
  }
  return { ...page, layout: 'free', images, fill: { wMm, hMm } };
}

/** Default box for a newly added image on a free page. */
export function freeBox(page: Page, aspect: number, n: number): Box {
  const b = fit(aspect, { x: 0.15, y: 0.15, w: 0.7, h: 0.7 }, page.widthMm, page.heightMm);
  const off = (n % 5) * 0.03;
  return { ...b, x: Math.min(1 - b.w, b.x + off), y: Math.min(1 - b.h, b.y + off) };
}
