import { clip, endPath, PDFDocument, popGraphicsState, pushGraphicsState, rectangle, rgb, StandardFonts } from 'pdf-lib';
import { mmToPt } from './units';

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
}

export interface TpPlan {
  sheetW: number; sheetH: number; // mm, after orientation
  cw: number; ch: number;         // printable content per sheet, mm
  stepX: number; stepY: number;   // distance between sheet origins, mm
  cols: number; rows: number; count: number;
  areaW: number; areaH: number;   // everything the sheets cover, mm
  img: { x: number; y: number; w: number; h: number }; // placement in area coords, mm
}

export const MAX_SHEETS = 200;

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
    sheetW, sheetH, cw, ch, stepX, stepY, cols, rows, count: cols * rows,
    areaW: (cols - 1) * stepX + cw, areaH: (rows - 1) * stepY + ch, img,
  };
}

/** Work out the sheet grid. "auto" picks whichever paper orientation needs fewer sheets. */
export function plan(aspect: number, s: TpSettings): TpPlan {
  if (s.orient === 'portrait') return planFor(aspect, s, false);
  if (s.orient === 'landscape') return planFor(aspect, s, true);
  const p = planFor(aspect, s, false), l = planFor(aspect, s, true);
  if (l.count < p.count) return l;
  if (p.count < l.count) return p;
  return aspect > 1 ? l : p;
}

export const dpi = (pixelsW: number, p: TpPlan) => pixelsW / (p.img.w / 25.4);

export async function buildTarpapelPdf(jpeg: Uint8Array, aspect: number, s: TpSettings, name: string): Promise<Uint8Array> {
  const p = plan(aspect, s);
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const image = await doc.embedJpg(jpeg);
  const SW = mmToPt(p.sheetW), SH = mmToPt(p.sheetH);
  const m = s.margin;
  const tick = Math.min(4, m - 0.8);
  const gray = rgb(0.35, 0.35, 0.35);
  for (let r = 0; r < p.rows; r++) {
    for (let c = 0; c < p.cols; c++) {
      const page = doc.addPage([SW, SH]);
      const ox = c * p.stepX, oy = r * p.stepY; // origin of this sheet's content in area coords
      // content rectangle (pdf coords are bottom-up)
      const cx = mmToPt(m), cy = SH - mmToPt(m + p.ch), cwP = mmToPt(p.cw), chP = mmToPt(p.ch);
      page.pushOperators(pushGraphicsState(), rectangle(cx, cy, cwP, chP), clip(), endPath());
      page.drawImage(image, {
        x: mmToPt(m + p.img.x - ox), y: SH - mmToPt(m + p.img.y - oy + p.img.h),
        width: mmToPt(p.img.w), height: mmToPt(p.img.h),
      });
      page.pushOperators(popGraphicsState());
      // crop marks in the unprintable border, at each corner of the content area
      if (tick > 0.5) {
        const xs = [m, m + p.cw], ys = [m, m + p.ch];
        for (const x of xs) for (const y of ys) {
          const px = mmToPt(x), py = SH - mmToPt(y);
          const dx = x === m ? -1 : 1, dy = y === m ? 1 : -1; // outward
          page.drawLine({ start: { x: px + dx * mmToPt(0.8), y: py }, end: { x: px + dx * mmToPt(0.8 + tick), y: py }, thickness: 0.4, color: gray });
          page.drawLine({ start: { x: px, y: py + dy * mmToPt(0.8) }, end: { x: px, y: py + dy * mmToPt(0.8 + tick) }, thickness: 0.4, color: gray });
        }
      }
      if (m >= 4) {
        const label = `${name}  ·  Row ${r + 1}, Col ${c + 1}  ·  Sheet ${r * p.cols + c + 1} of ${p.count}`;
        page.drawText(label, { x: mmToPt(m), y: mmToPt(1.6), size: 6, font, color: gray });
      }
    }
  }
  doc.setTitle(name);
  doc.setCreator('PDX');
  return doc.save();
}
