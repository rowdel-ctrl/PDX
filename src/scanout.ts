import { PDFDocument, StandardFonts } from 'pdf-lib';
import { canvasToBytes } from './scanlib';
import type { OcrPage } from './ocr';

const A4 = [595.28, 841.89];

/** Build a PDF from finished scan pages. With `text`, the page also holds invisible words so it can be searched. */
export async function scansToPdf(pages: HTMLCanvasElement[], text?: (OcrPage | null)[]): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  for (let i = 0; i < pages.length; i++) {
    const c = pages[i];
    const land = c.width > c.height * 1.1;
    const [pw, ph] = land ? [A4[1], A4[0]] : A4;
    const k = Math.min(pw / c.width, ph / c.height);
    const w = c.width * k, h = c.height * k, x = (pw - w) / 2, y = (ph - h) / 2;
    const page = doc.addPage([pw, ph]);
    page.drawImage(await doc.embedJpg(await canvasToBytes(c, 0.85)), { x, y, width: w, height: h });
    const o = text?.[i];
    if (o) for (const wd of o.words) {
      const t = wd.text.replace(/[^\x20-\x7E]/g, '');
      if (!t) continue;
      const size = Math.max(4, (wd.y1 - wd.y0) * k * 0.85);
      page.drawText(t, { x: x + wd.x0 * k, y: y + h - wd.y1 * k, size, font, opacity: 0 });
    }
  }
  return doc.save();
}
