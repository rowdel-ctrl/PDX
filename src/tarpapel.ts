import { clip, degrees, endPath, PDFDocument, PDFFont, PDFPage, popGraphicsState, pushGraphicsState, rectangle, rgb, StandardFonts } from 'pdf-lib';
import { mmToPt } from './units';
import { addScaledPage, closeScaled } from './printer';

export type Orient = 'auto' | 'portrait' | 'landscape';
export interface TpSettings {
  paperW: number; paperH: number; // portrait mm
  orient: Orient;
  margin: number;                 // unprintable border on each sheet, mm
  join: 'overlap' | 'trim';
  overlap: number;                // mm, overlap mode only
  mode: 'size' | 'sheets';
  widthMm: number;                // size mode: final poster width
  cols: number; rows: number;     // sheets mode
  fill: boolean;                  // sheets mode: crop to fill instead of fitting
  cutLines: boolean;              // dashed cut lines with scissors, and neighbour tags
  glueShade: boolean;             // shade the glue strip (overlap mode)
  guidePage: boolean;             // add an assembly guide as the first page
}

export interface TpPlan {
  sheetW: number; sheetH: number; // mm, after orientation
  cw: number; ch: number;         // printable content per sheet, mm
  stepX: number; stepY: number;   // distance between sheet origins, mm
  cols: number; rows: number; count: number;
  overlap: number;                // mm actually used
  areaW: number; areaH: number;   // everything the sheets cover, mm
  img: { x: number; y: number; w: number; h: number }; // placement in area coords, mm
}

export const MAX_SHEETS = 200;
/** Cut guides live in the printer border (it gets trimmed off), so it must be wide enough for them. */
export const GUIDE_MARGIN = 6;
const eff = (s: TpSettings): TpSettings => (s.cutLines ? { ...s, margin: Math.max(s.margin, GUIDE_MARGIN) } : s);

function planFor(aspect: number, s: TpSettings, landscape: boolean): TpPlan {
  const sheetW = landscape ? s.paperH : s.paperW, sheetH = landscape ? s.paperW : s.paperH;
  const cw = Math.max(10, sheetW - 2 * s.margin), ch = Math.max(10, sheetH - 2 * s.margin);
  const o = s.join === 'overlap' ? Math.min(Math.max(0, s.overlap), Math.min(cw, ch) / 3) : 0;
  const stepX = cw - o, stepY = ch - o;
  let cols: number, rows: number, img: TpPlan['img'];
  if (s.mode === 'size') {
    const w = Math.max(1, s.widthMm), h = w / aspect;
    cols = Math.max(1, Math.ceil((w - cw) / stepX - 1e-3) + 1);
    rows = Math.max(1, Math.ceil((h - ch) / stepY - 1e-3) + 1);
    img = { x: 0, y: 0, w, h };
  } else {
    cols = Math.max(1, s.cols); rows = Math.max(1, s.rows);
    const aw = (cols - 1) * stepX + cw, ah = (rows - 1) * stepY + ch;
    // contain: whole picture fits inside; cover: picture fills the area (overflow is cut). Both centred.
    const fh = s.fill ? Math.max(ah, aw / aspect) : Math.min(ah, aw / aspect);
    const fw = fh * aspect;
    img = { x: (aw - fw) / 2, y: (ah - fh) / 2, w: fw, h: fh };
  }
  return {
    sheetW, sheetH, cw, ch, stepX, stepY, cols, rows, count: cols * rows, overlap: o,
    areaW: (cols - 1) * stepX + cw, areaH: (rows - 1) * stepY + ch, img,
  };
}

/** Work out the sheet grid. "auto" picks whichever paper orientation needs fewer sheets. */
export function plan(aspect: number, s0: TpSettings): TpPlan {
  const s = eff(s0);
  if (s.orient === 'portrait') return planFor(aspect, s, false);
  if (s.orient === 'landscape') return planFor(aspect, s, true);
  const p = planFor(aspect, s, false), l = planFor(aspect, s, true);
  if (l.count < p.count) return l;
  if (p.count < l.count) return p;
  return aspect > 1 ? l : p;
}

export const dpi = (pixelsW: number, p: TpPlan) => pixelsW / (p.img.w / 25.4);
/** Number of PDF pages for these settings. */
export const pageCount = (p: TpPlan, s: TpSettings) => p.count + (s.guidePage ? 1 : 0);

// Guides are thin dark-gray lines only: no color and no filled areas, so they use almost no ink.
const LINE = rgb(0.25, 0.25, 0.25), HATCH = rgb(0.5, 0.5, 0.5), GRAY = rgb(0.35, 0.35, 0.35), WHITE = rgb(1, 1, 1), INK = rgb(0.1, 0.1, 0.14);

/** Lucide-style scissors, centred on (xmm, ymm), blades pointing along `angle` (degrees, clockwise, 0 = right). */
function scissors(page: PDFPage, SH: number, xmm: number, ymm: number, angle: number, k: number) {
  const a = (angle * Math.PI) / 180, cs = Math.cos(a), sn = Math.sin(a);
  const T = (px: number, py: number) => {
    const dx = (px - 12) * k, dy = (py - 12) * k;
    return { x: mmToPt(xmm + dx * cs - dy * sn), y: SH - mmToPt(ymm + dx * sn + dy * cs) };
  };
  const segs: [number, number, number, number][] = [[8.12, 8.12, 12, 12], [20, 4, 8.12, 15.88], [14.8, 14.8, 20, 20]];
  for (const [color, thickness] of [[WHITE, 2.4], [LINE, 0.9]] as const) {
    for (const [x1, y1, x2, y2] of segs) page.drawLine({ start: T(x1, y1), end: T(x2, y2), thickness, color, lineCap: 1 });
    for (const [cx, cy] of [[6, 6], [6, 18]]) { const c = T(cx, cy); page.drawCircle({ x: c.x, y: c.y, size: mmToPt(3 * k), borderColor: color, borderWidth: thickness }); }
  }
}

function wrap(text: string, font: PDFFont, size: number, maxW: number): string[] {
  const out: string[] = []; let line = '';
  for (const w of text.split(' ')) {
    const t = line ? `${line} ${w}` : w;
    if (font.widthOfTextAtSize(t, size) > maxW && line) { out.push(line); line = w; } else line = t;
  }
  if (line) out.push(line);
  return out;
}

export async function buildTarpapelPdf(jpeg: Uint8Array, aspect: number, s0: TpSettings, name: string): Promise<Uint8Array> {
  const s = eff(s0);
  const p = plan(aspect, s0);
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const image = await doc.embedJpg(jpeg);
  const SW = mmToPt(p.sheetW), SH = mmToPt(p.sheetH);
  const m = s.margin, o = p.overlap, overlap = s.join === 'overlap';
  const tick = Math.min(4, m - 0.8);
  const X = mmToPt, Y = (y: number) => SH - mmToPt(y);

  if (s.guidePage) {
    const pg = addScaledPage(doc, [SW, SH]);
    const pad = 14, base = p.sheetW >= 200 ? 10 : 8;
    const text = (t: string, x: number, y: number, size: number, f = font, color = INK) => pg.drawText(t, { x: X(x), y: Y(y) - size, size, font: f, color });
    text('Assembly guide', pad, pad, base * 2, bold);
    text(`${name}  ·  Poster ${Math.round(p.img.w) / 10} × ${Math.round(p.img.h) / 10} cm  ·  ${p.count} sheets (${p.cols} × ${p.rows})  ·  ${overlap ? 'overlap and glue' : 'trim and tape'}`, pad, pad + base * 1.5, base * 0.9, font, GRAY);
    // steps (measured first so the map can use the space that is left)
    const steps = overlap ? [
      'Print every page at 100% ("Actual size"). Do not choose "Fit to page".',
      `Cut along the dashed lines (the scissors show where each line starts). On every sheet cut the left and top edges. Also cut the bottom edge in the last row and the right edge in the last column.`,
      'Start with sheet 1. Put glue along the right edge of its picture, the strip named GLUE in the border. Lay sheet 2 on top and line up the picture. Repeat along the row.',
      'Build the next row the same way. Put glue along the bottom edge of the picture in the row above (the strip named GLUE in the border) and lay the new row on top.',
    ] : [
      'Print every page at 100% ("Actual size"). Do not choose "Fit to page".',
      'Cut along the dashed lines on all four sides of every sheet.',
      'Lay the sheets out in order, edge to edge, and line up the picture.',
      'Tape the seams on the back. Join each row first, then tape the rows together.',
    ];
    const textW = p.sheetW - 2 * pad - 8;
    const stepLines = steps.map((t) => wrap(t, font, base, X(textW)));
    const stepsH = stepLines.reduce((h, l) => h + Math.max(6, l.length * base * 0.5) + base * 0.5, 0);
    // map of the sheets
    const mapW = p.sheetW - 2 * pad;
    const mapH = Math.max(30, Math.min(p.sheetH * 0.45, p.sheetH - 2 * pad - base * 3.2 - stepsH - base * 3.6 - 8)), k = Math.min(mapW / p.areaW, mapH / p.areaH);
    const mx = pad + (mapW - p.areaW * k) / 2, my = pad + base * 3.2;
    // outline of the whole poster, and the strips that overlap (outlined, not filled)
    pg.drawRectangle({ x: X(mx + p.img.x * k), y: Y(my + (p.img.y + p.img.h) * k), width: X(p.img.w * k), height: X(p.img.h * k), borderColor: HATCH, borderWidth: 0.5 });
    if (overlap && o > 0) {
      for (let c = 1; c < p.cols; c++) pg.drawRectangle({ x: X(mx + c * p.stepX * k), y: Y(my + p.areaH * k), width: X(o * k), height: X(p.areaH * k), borderColor: HATCH, borderWidth: 0.4, borderDashArray: [2, 2] });
      for (let r = 1; r < p.rows; r++) pg.drawRectangle({ x: X(mx), y: Y(my + r * p.stepY * k + o * k), width: X(p.areaW * k), height: X(o * k), borderColor: HATCH, borderWidth: 0.4, borderDashArray: [2, 2] });
    }
    const fs = Math.max(10, Math.min(34, Math.min(p.cw, p.ch) * k * 1.3));
    for (let r = 0; r < p.rows; r++) for (let c = 0; c < p.cols; c++) {
      const tx = mx + c * p.stepX * k, ty = my + r * p.stepY * k, tw = p.cw * k, th = p.ch * k;
      pg.drawRectangle({ x: X(tx), y: Y(ty + th), width: X(tw), height: X(th), borderColor: LINE, borderWidth: 0.7, borderDashArray: [4, 3] });
      const n = String(r * p.cols + c + 1), w = bold.widthOfTextAtSize(n, fs);
      const nx = X(tx + tw / 2) - w / 2, ny = Y(ty + th / 2) - fs * 0.35;
      pg.drawText(n, { x: nx, y: ny, size: fs, font: bold, color: INK });
    }
    // "start here" on sheet 1
    const sw = bold.widthOfTextAtSize('START HERE', 7) + 10;
    pg.drawRectangle({ x: X(mx + 2), y: Y(my + 2) - 12, width: sw, height: 12, borderColor: LINE, borderWidth: 0.8 });
    pg.drawText('START HERE', { x: X(mx + 2) + 5, y: Y(my + 2) - 9, size: 7, font: bold, color: INK });
    text('Sheets are numbered left to right, top to bottom.', mx, my + p.areaH * k + 2, base * 0.8, font, GRAY);
    let y = my + p.areaH * k + base * 2.4;
    steps.forEach((t, i) => {
      pg.drawCircle({ x: X(pad + 2.5), y: Y(y + 2.2), size: X(2.6), borderColor: LINE, borderWidth: 0.8 });
      pg.drawText(String(i + 1), { x: X(pad + 2.5) - 2.2, y: Y(y + 2.2) - 3, size: 8, font: bold, color: INK });
      const lines = stepLines[i];
      lines.forEach((ln, j) => pg.drawText(ln, { x: X(pad + 8), y: Y(y + j * base * 0.5 + 1) - base, size: base, font, color: INK }));
      y += Math.max(6, lines.length * base * 0.5) + base * 0.5;
    });
    // legend
    const ly = p.sheetH - pad - 4;
    pg.drawLine({ start: { x: X(pad), y: Y(ly) }, end: { x: X(pad + 14), y: Y(ly) }, thickness: 0.9, color: LINE, dashArray: [4, 2.5] });
    text('Cut line', pad + 16, ly - 1.6, base * 0.8, font, GRAY);
    if (overlap) { pg.drawRectangle({ x: X(pad + 38), y: Y(ly + 1.5), width: X(10), height: X(3), borderColor: HATCH, borderWidth: 0.4, borderDashArray: [1.5, 1.5] }); text('Glue strip (named in the border)', pad + 50, ly - 1.6, base * 0.8, font, GRAY); }
    text('Made with PDX', p.sheetW - pad - 22, ly - 1.6, base * 0.8, font, GRAY);
  }

  for (let r = 0; r < p.rows; r++) {
    for (let c = 0; c < p.cols; c++) {
      const page = addScaledPage(doc, [SW, SH]);
      const ox = c * p.stepX, oy = r * p.stepY; // origin of this sheet's content in area coords
      const cx = X(m), cy = Y(m + p.ch), cwP = X(p.cw), chP = X(p.ch);
      page.pushOperators(pushGraphicsState(), rectangle(cx, cy, cwP, chP), clip(), endPath());
      page.drawImage(image, { x: X(m + p.img.x - ox), y: Y(m + p.img.y - oy + p.img.h), width: X(p.img.w), height: X(p.img.h) });
      page.pushOperators(popGraphicsState());

      // glue strips: the next sheet to the right / below goes on top of the picture edge. Marked in the border only, never on the picture.
      if (overlap && s.glueShade && o > 0 && m >= 4.5) {
        const sz = 5.5, tx = `GLUE strip: ${Math.round(o * 10) / 10} mm, on the picture edge beside this border`;
        const tw = bold.widthOfTextAtSize(tx, sz);
        if (c < p.cols - 1 && p.ch > 130) {
          // right border (stays under the next sheet): rotated text, plus a short bracket that shows the strip width on the border's top edge
          page.drawText(tx, { x: X(m + p.cw + m / 2) + sz * 0.35, y: Y(m + p.ch - 6), size: sz, font: bold, color: INK, rotate: degrees(90) });
        }
        if (r < p.rows - 1 && p.cw > 150) {
          page.drawText(tx, { x: X(m + 72), y: Y(m + p.ch + m / 2) - sz * 0.35, size: sz, font: bold, color: INK });
        }
      }

      // cut lines with scissors
      if (s.cutLines) {
        const cutRight = !overlap || c === p.cols - 1, cutBottom = !overlap || r === p.rows - 1;
        const dash = { thickness: 0.8, color: LINE, dashArray: [5, 3] };
        const x0 = m, x1 = m + p.cw, y0 = m, y1 = m + p.ch;
        const offX = Math.min(14, p.cw / 4), offY = Math.min(14, p.ch / 4);
        const k = Math.min(0.3, Math.max(0.12, (m - 1) / 24));   // scissors fit in the border
        page.drawLine({ start: { x: X(x0), y: Y(y0) }, end: { x: X(x0), y: Y(y1) }, ...dash });
        page.drawLine({ start: { x: X(x0), y: Y(y0) }, end: { x: X(x1), y: Y(y0) }, ...dash });
        scissors(page, SH, m / 2, y0 + offY, 90, k);
        scissors(page, SH, x0 + offX, m / 2, 0, k);
        if (cutRight) { page.drawLine({ start: { x: X(x1), y: Y(y0) }, end: { x: X(x1), y: Y(y1) }, ...dash }); scissors(page, SH, x1 + m / 2, y1 - offY, 270, k); }
        if (cutBottom) { page.drawLine({ start: { x: X(x0), y: Y(y1) }, end: { x: X(x1), y: Y(y1) }, ...dash }); scissors(page, SH, x1 - offX, y1 + m / 2, 180, k); }

        // which sheet goes where: small text in the border, so it never lands on the picture
        const n = (rr: number, cc: number) => rr * p.cols + cc + 1;
        const sz = 5.5;
        if (r > 0) { const t = `Above: sheet ${n(r - 1, c)}`; page.drawText(t, { x: X(m + p.cw / 2) - font.widthOfTextAtSize(t, sz) / 2, y: Y(m / 2) - sz * 0.35, size: sz, font, color: INK }); }
        if (c > 0) { const t = `Left: sheet ${n(r, c - 1)}`; page.drawText(t, { x: X(m / 2) + sz * 0.35, y: Y(m + p.ch / 2) - font.widthOfTextAtSize(t, sz) / 2, size: sz, font, color: INK, rotate: degrees(90) }); }
        if (c < p.cols - 1) { const t = `Right: sheet ${n(r, c + 1)}`; page.drawText(t, { x: X(m + p.cw + m / 2) + sz * 0.35, y: Y(m + p.ch / 2) - font.widthOfTextAtSize(t, sz) / 2, size: sz, font, color: INK, rotate: degrees(90) }); }
        if (r < p.rows - 1) { const t = `Below: sheet ${n(r + 1, c)}`; page.drawText(t, { x: X(m + p.cw) - font.widthOfTextAtSize(t, sz), y: Y(m + p.ch + m / 2) - sz * 0.35, size: sz, font, color: INK }); }
      }

      // corner marks in the unprintable border
      if (tick > 0.5) {
        for (const x of [m, m + p.cw]) for (const y of [m, m + p.ch]) {
          const px = X(x), py = Y(y);
          const dx = x === m ? -1 : 1, dy = y === m ? 1 : -1; // outward
          page.drawLine({ start: { x: px + dx * X(0.8), y: py }, end: { x: px + dx * X(0.8 + tick), y: py }, thickness: 0.4, color: GRAY });
          page.drawLine({ start: { x: px, y: py + dy * X(0.8) }, end: { x: px, y: py + dy * X(0.8 + tick) }, thickness: 0.4, color: GRAY });
        }
      }
      if (m >= 4) page.drawText(`${name}  ·  Row ${r + 1}, Col ${c + 1}  ·  Sheet ${r * p.cols + c + 1} of ${p.count}`, { x: X(m), y: X(1.6), size: 6, font, color: GRAY });
    }
  }
  doc.setTitle(name);
  doc.setCreator('PDX');
  closeScaled(doc);
  return doc.save();
}
