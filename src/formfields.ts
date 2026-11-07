import { canvasOf } from './scanlib';

/** A place on the page where something can be typed. Fractions of the page. */
export interface Field { id: string; kind: 'line' | 'box' | 'tick'; x: number; y: number; w: number; h: number; label: string }

let n = 0;
const fid = () => `f${++n}`;

/** Look for underlines (long thin dark runs) and small hollow squares in a picture of a page. */
export function findFields(src: HTMLCanvasElement): Field[] {
  const k = Math.min(1, 900 / src.width);
  const W = Math.round(src.width * k), H = Math.round(src.height * k);
  const c = canvasOf(W, H); const ctx = c.getContext('2d', { willReadFrequently: true })!;
  ctx.drawImage(src, 0, 0, W, H);
  const d = ctx.getImageData(0, 0, W, H).data;
  const dark = new Uint8Array(W * H); const gray = new Uint8Array(W * H);
  for (let i = 0; i < W * H; i++) { const g = d[i * 4] * 0.299 + d[i * 4 + 1] * 0.587 + d[i * 4 + 2] * 0.114; gray[i] = g; dark[i] = g < 150 ? 1 : 0; }
  const out: Field[] = [];

  // underlines: runs of dark pixels, stacked into thin lines
  const minRun = Math.max(24, W * 0.07);
  type Run = { y: number; x0: number; x1: number };
  const runs: Run[] = [];
  for (let y = 0; y < H; y++) {
    let s = -1, gap = 0;
    for (let x = 0; x <= W; x++) {
      const on = x < W && dark[y * W + x];
      if (on) { if (s < 0) s = x; gap = 0; }
      else if (s >= 0) { gap++; if (gap > 2 || x === W) { const e = x - gap; if (e - s >= minRun) runs.push({ y, x0: s, x1: e }); s = -1; gap = 0; } }
    }
  }
  const lines: { y0: number; y1: number; x0: number; x1: number }[] = [];
  for (const r of runs) {
    const l = lines.find((q) => r.y - q.y1 <= 1 && Math.abs(r.x0 - q.x0) < 6 && Math.abs(r.x1 - q.x1) < 6);
    if (l) { l.y1 = r.y; } else lines.push({ y0: r.y, y1: r.y, x0: r.x0, x1: r.x1 });
  }
  // A line only counts when the space right above it is empty, white and big enough to write in.
  // That leaves out table edges with a label or text on them, lines under filled-in text and shaded areas.
  const maxH = Math.max(16, Math.min(34, W * 0.03)), minH = Math.max(13, W * 0.016);
  const free = (x0: number, x1: number, y: number) => {
    let h = 0;
    for (let yy = y - 3; yy >= 0 && h < maxH; yy--) { // the two rows next to the line are its soft edge, so they are skipped
      let on = 0, sum = 0, n = 0;
      for (let x = x0 + 2; x < x1 - 2; x++) { on += dark[yy * W + x]; sum += gray[yy * W + x]; n++; }
      if (n < 6 || on / n > 0.02 || sum / n < 226) break;
      h++;
    }
    return h > 0 ? h + 2 : 0;
  };
  const kept: { x0: number; x1: number; y0: number; y1: number }[] = [];
  const vline = (x: number, ya: number, yb: number) => { // is there a vertical stroke near x between ya and yb
    const lo = Math.max(0, Math.min(ya, yb)), hi = Math.min(H - 1, Math.max(ya, yb)); if (hi - lo < 6) return false;
    for (let dx = -3; dx <= 3; dx++) { const xx = Math.min(W - 1, Math.max(0, x + dx)); let on = 0; for (let y = lo; y <= hi; y++) on += dark[y * W + xx]; if (on / (hi - lo + 1) > 0.85) return true; }
    return false;
  };
  for (const l of lines) {
    if (l.y1 - l.y0 > 4) continue; // thick bars are not underlines
    const fh = free(l.x0, l.x1, l.y0);
    if (fh < minH) continue;
    const y0 = l.y0 - fh, y1 = l.y0;
    // the top edge of a table (strokes go down from it, none go up) is not somewhere to write
    const below = vline(l.x0, l.y1 + 2, l.y1 + 14) || vline(l.x1, l.y1 + 2, l.y1 + 14), above = vline(l.x0, y0, y1 - 1) || vline(l.x1, y0, y1 - 1);
    if (below && !above) continue;
    // cut the box where cell walls cross it
    const cuts: number[] = [l.x0];
    for (let x = l.x0 + 6; x < l.x1 - 6; x++) if (vline(x, y0 + 1, y1 - 1)) { cuts.push(x); x += 6; }
    cuts.push(l.x1);
    for (let i = 0; i + 1 < cuts.length; i++) {
      const sx0 = cuts[i] + (i ? 4 : 0), sx1 = cuts[i + 1] - (i + 2 < cuts.length ? 4 : 0);
      if (sx1 - sx0 < minRun * 0.6) continue;
      if (kept.some((k) => Math.min(k.x1, sx1) - Math.max(k.x0, sx0) > 0.5 * Math.min(k.x1 - k.x0, sx1 - sx0) && Math.min(k.y1, y1) - Math.max(k.y0, y0) > 0.3 * fh)) continue;
      kept.push({ x0: sx0, x1: sx1, y0, y1 });
      out.push({ id: fid(), kind: 'line', x: sx0 / W, y: y0 / H, w: (sx1 - sx0) / W, h: fh / H, label: '' });
    }
  }
  // a frame (table cell border) has two long lines close together: keep both, they are harmless

  // small hollow squares: connected dark outlines of square shape
  const seen = new Uint8Array(W * H); const stack: number[] = [];
  const lo = Math.max(7, W * 0.011), hi = Math.max(22, W * 0.05);
  for (let s = 0; s < W * H; s++) {
    if (!dark[s] || seen[s]) continue;
    let x0 = W, y0 = H, x1 = 0, y1 = 0, area = 0; stack.push(s); seen[s] = 1;
    while (stack.length) {
      const p = stack.pop()!; const x = p % W, y = (p / W) | 0; area++;
      if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
      if (area > 4000) { stack.length = 0; break; }
      if (x > 0 && dark[p - 1] && !seen[p - 1]) { seen[p - 1] = 1; stack.push(p - 1); }
      if (x < W - 1 && dark[p + 1] && !seen[p + 1]) { seen[p + 1] = 1; stack.push(p + 1); }
      if (y > 0 && dark[p - W] && !seen[p - W]) { seen[p - W] = 1; stack.push(p - W); }
      if (y < H - 1 && dark[p + W] && !seen[p + W]) { seen[p + W] = 1; stack.push(p + W); }
    }
    const bw = x1 - x0 + 1, bh = y1 - y0 + 1;
    if (bw < lo || bw > hi || bh < lo || bh > hi || Math.abs(bw - bh) > Math.max(2, bw * 0.2)) continue;
    if (area > bw * bh * 0.45) continue; // filled blob, not an outline
    // the inside must be empty
    let inner = 0; const mx = Math.max(2, Math.round(bw * 0.25)), my = Math.max(2, Math.round(bh * 0.25));
    for (let y = y0 + my; y <= y1 - my; y++) for (let x = x0 + mx; x <= x1 - mx; x++) inner += dark[y * W + x];
    if (inner > 0) continue;
    // all four sides must be nearly solid lines (letters such as O or D are not)
    const row = (y: number) => { let on = 0; for (let x = x0; x <= x1; x++) on += dark[y * W + x]; return on / bw; };
    const col = (x: number) => { let on = 0; for (let y = y0; y <= y1; y++) on += dark[y * W + x]; return on / bh; };
    const e = Math.max(1, Math.round(bw * 0.2));
    let top = 0, bot = 0, lef = 0, rig = 0;
    for (let i = 0; i < e; i++) { top = Math.max(top, row(y0 + i)); bot = Math.max(bot, row(y1 - i)); lef = Math.max(lef, col(x0 + i)); rig = Math.max(rig, col(x1 - i)); }
    if (Math.min(top, bot, lef, rig) < 0.85) continue;
    out.push({ id: fid(), kind: 'tick', x: x0 / W, y: y0 / H, w: bw / W, h: bh / H, label: '' });
  }
  return out;
}

/** Real form fields and drawn lines in a PDF page, plus the printed words next to each one. */
export async function pdfFields(page: any, scaleW: number, scaleH: number): Promise<Field[]> {
  const out: Field[] = [];
  const vp = page.getViewport({ scale: 1 });
  try {
    for (const a of await page.getAnnotations()) {
      if (a.subtype !== 'Widget' || !a.rect) continue;
      if (a.fieldType !== 'Tx' && a.fieldType !== 'Btn') continue;
      const [x0, y0, x1, y1] = a.rect as number[];
      const p0 = vp.convertToViewportPoint(x0, y1), p1 = vp.convertToViewportPoint(x1, y0);
      const x = p0[0] / scaleW, y = p0[1] / scaleH, w = (p1[0] - p0[0]) / scaleW, h = (p1[1] - p0[1]) / scaleH;
      if (w <= 0 || h <= 0) continue;
      out.push({ id: fid(), kind: a.fieldType === 'Btn' ? 'tick' : h > 0.04 ? 'box' : 'line', x, y, w, h, label: String(a.alternativeText || a.fieldName || '') });
    }
  } catch { /* no form fields */ }
  return out;
}

/** Give each field a name from the printed words just left of it or just above it. */
export async function nameFields(page: any, fields: Field[]): Promise<void> {
  const vp = page.getViewport({ scale: 1 });
  let items: { s: string; x: number; y: number; w: number; h: number }[] = [];
  try {
    const t = await page.getTextContent();
    items = t.items.filter((i: any) => i.str?.trim()).map((i: any) => ({ s: i.str.trim(), x: i.transform[4] / vp.width, y: 1 - i.transform[5] / vp.height, w: i.width / vp.width, h: i.height / vp.height }));
  } catch { return; }
  fields.forEach((f, idx) => {
    if (f.label) return;
    const mid = f.y + f.h / 2, base = f.y + f.h;
    let best: { s: string; d: number } | null = null;
    for (const t of items) {
      const right = t.x + t.w;
      // same line, to the left
      if (Math.abs(t.y - base) < Math.max(0.012, f.h) && right <= f.x + 0.004 && f.x - right < 0.35) { const d = f.x - right; if (!best || d < best.d) best = { s: t.s, d }; }
      // directly above, overlapping sideways
      else if (t.y < f.y + 0.004 && f.y - t.y < 0.045 && right > f.x && t.x < f.x + f.w) { const d = 0.35 + (f.y - t.y); if (!best || d < best.d) best = { s: t.s, d }; }
    }
    void mid;
    f.label = (best?.s ?? '').replace(/[:_.\s]+$/g, '').slice(0, 40) || `Field ${idx + 1}`;
  });
}

/** Sort top to bottom, then left to right, and merge boxes that cover the same spot. */
export function tidy(fields: Field[]): Field[] {
  const keep: Field[] = [];
  for (const f of fields) if (!keep.some((g) => Math.abs(g.x - f.x) < 0.01 && Math.abs(g.y - f.y) < 0.012 && Math.abs(g.w - f.w) < 0.03)) keep.push(f);
  keep.sort((a, b) => (Math.abs(a.y - b.y) < 0.012 ? a.x - b.x : a.y - b.y));
  return keep;
}

export const nameDefaults = (fields: Field[]): Field[] => fields.map((f, i) => ({ ...f, label: f.label || `Field ${i + 1}` }));
