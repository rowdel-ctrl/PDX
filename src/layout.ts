import type { LayoutId, Page, PageImage } from './types';

export const LAYOUTS: { id: LayoutId; label: string; cols: number; rows: number }[] = [
  { id: '1', label: '1', cols: 1, rows: 1 },
  { id: '2x1', label: '2×1', cols: 2, rows: 1 },
  { id: '2x2', label: '2×2', cols: 2, rows: 2 },
  { id: '2x3', label: '2×3', cols: 2, rows: 3 },
  { id: '3x3', label: '3×3', cols: 3, rows: 3 },
];

export const cellCount = (id: LayoutId) => {
  const l = LAYOUTS.find((x) => x.id === id)!;
  return l.cols * l.rows;
};

/** Fit an image (aspect) inside a cell, centered. All values in fractions of the page. */
function fit(aspect: number, cx: number, cy: number, cw: number, ch: number, pw: number, ph: number) {
  // work in mm-ish units so the aspect is right
  const cellW = cw * pw, cellH = ch * ph;
  let w = cellW, h = cellW / aspect;
  if (h > cellH) { h = cellH; w = cellH * aspect; }
  const fw = w / pw, fh = h / ph;
  return { x: cx + (cw - fw) / 2, y: cy + (ch - fh) / 2, w: fw, h: fh };
}

/** Place the page's images into the cells of its layout, in order. */
export function applyLayout(page: Page): Page {
  const l = LAYOUTS.find((x) => x.id === page.layout)!;
  const { widthMm: W, heightMm: H } = page;
  const m = Math.min(page.marginMm, Math.min(W, H) / 3);
  const s = page.spacingMm;
  const cellW = (W - 2 * m - s * (l.cols - 1)) / l.cols;
  const cellH = (H - 2 * m - s * (l.rows - 1)) / l.rows;
  const images: PageImage[] = page.images.map((img, i) => {
    const n = Math.min(i, l.cols * l.rows - 1);
    const col = n % l.cols, row = Math.floor(n / l.cols);
    const cx = (m + col * (cellW + s)) / W;
    const cy = (m + row * (cellH + s)) / H;
    return { ...img, ...fit(img.aspect, cx, cy, cellW / W, cellH / H, W, H) };
  });
  return { ...page, images };
}
