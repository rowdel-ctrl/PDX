import { concatTransformationMatrix, PDFDocument, popGraphicsState, pushGraphicsState, rgb, StandardFonts, type PDFPage } from 'pdf-lib';
import { mmToPt } from './units';

const KEY = 'pdx.printscale';
/** Print correction as a ratio (1 = off). 1.015 enlarges everything 1.5% for printers that print small. */
/** Turned on while making picture files, which are not printed through a printer correction. */
export const scaleOff = { on: false };
export const getScale = (): number => { if (scaleOff.on) return 1; try { const v = parseFloat(localStorage.getItem(KEY) || '1'); return Number.isFinite(v) && v > 0.9 && v < 1.1 ? v : 1; } catch { return 1; } };
export const setScale = (v: number) => { try { if (Math.abs(v - 1) < 0.0005) localStorage.removeItem(KEY); else localStorage.setItem(KEY, String(v)); } catch { /* full */ } };

/** Add a page that is drawn with the saved print correction (scaled about the page centre). */
export function addScaledPage(doc: PDFDocument, size: [number, number]): PDFPage {
  const page = doc.addPage(size), s = getScale();
  if (s !== 1) page.pushOperators(pushGraphicsState(), concatTransformationMatrix(s, 0, 0, s, (size[0] / 2) * (1 - s), (size[1] / 2) * (1 - s)));
  return page;
}
/** Close the scaling of every page made with addScaledPage. */
export function closeScaled(doc: PDFDocument) {
  if (getScale() !== 1) for (const p of doc.getPages()) p.pushOperators(popGraphicsState());
}

/** One A4 page with a 100 mm square and line. Print at 100% and measure it with a ruler. Thin gray lines only. */
export async function buildTestSheet(): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const W = mmToPt(210), H = mmToPt(297), page = doc.addPage([W, H]);
  const gray = rgb(0.35, 0.35, 0.35), x0 = mmToPt(55), top = H - mmToPt(40);
  page.drawRectangle({ x: x0, y: top - mmToPt(100), width: mmToPt(100), height: mmToPt(100), borderColor: gray, borderWidth: 0.6 });
  page.drawText('100 x 100 mm box', { x: x0 + mmToPt(26), y: top - mmToPt(108), size: 10, font, color: gray });
  const ly = top - mmToPt(130);
  page.drawLine({ start: { x: x0, y: ly }, end: { x: x0 + mmToPt(100), y: ly }, thickness: 0.6, color: gray });
  for (const dx of [0, 100]) page.drawLine({ start: { x: x0 + mmToPt(dx), y: ly - 4 }, end: { x: x0 + mmToPt(dx), y: ly + 4 }, thickness: 0.6, color: gray });
  page.drawText('100 mm line', { x: x0 + mmToPt(33), y: ly - 16, size: 10, font, color: gray });
  // corner marks 5 mm in from the paper edge: if one is missing, your printer cannot print that close to the edge
  const m = mmToPt(5), L = mmToPt(6);
  for (const [cx, cy, sx, sy] of [[m, m, 1, 1], [W - m, m, -1, 1], [m, H - m, 1, -1], [W - m, H - m, -1, -1]] as const) {
    page.drawLine({ start: { x: cx, y: cy }, end: { x: cx + sx * L, y: cy }, thickness: 0.6, color: gray });
    page.drawLine({ start: { x: cx, y: cy }, end: { x: cx, y: cy + sy * L }, thickness: 0.6, color: gray });
  }
  page.drawText('Print at 100% (not "fit to page"). Measure the box with a ruler.', { x: mmToPt(30), y: mmToPt(30), size: 10, font, color: gray });
  page.drawText('If a corner mark is cut off, keep important content further from that edge.', { x: mmToPt(30), y: mmToPt(24), size: 10, font, color: gray });
  doc.setTitle('PDX printer test sheet');
  return doc.save();
}
