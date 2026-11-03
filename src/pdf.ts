import { PDFDocument, PDFFont, rgb, StandardFonts } from 'pdf-lib';
import type { Project, Quality } from './types';
import { exportBytes } from './images';
import { mmToPt } from './units';

const hex = (c: string) => {
  const n = parseInt(c.replace('#', ''), 16);
  return rgb(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255);
};

/** Standard PDF fonts can't draw every character; swap unsupported ones for '?'. */
const clean = (font: PDFFont, t: string) => {
  const ok = new Set(font.getCharacterSet());
  return Array.from(t).map((ch) => (ok.has(ch.codePointAt(0)!) ? ch : '?')).join('');
};

export async function buildPdf(p: Project, quality: Quality, onProgress?: (n: number, total: number) => void): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const regular = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const embedded = new Map<string, Awaited<ReturnType<PDFDocument['embedJpg']>>>();
  for (let i = 0; i < p.pages.length; i++) {
    onProgress?.(i, p.pages.length);
    const pg = p.pages[i];
    const W = mmToPt(pg.widthMm), H = mmToPt(pg.heightMm);
    const page = doc.addPage([W, H]);
    page.drawRectangle({ x: 0, y: 0, width: W, height: H, color: hex(pg.background) });
    for (const im of pg.images) {
      const key = `${im.file}|${im.rot}|${JSON.stringify(im.crop)}`;
      let e = embedded.get(key);
      if (!e) { e = await doc.embedJpg(await exportBytes(im.file, im.rot, im.crop, quality)); embedded.set(key, e); }
      page.drawImage(e, { x: im.x * W, y: H - (im.y + im.h) * H, width: im.w * W, height: im.h * H });
    }
    if (pg.border.on) {
      const bw = mmToPt(pg.border.widthMm);
      page.drawRectangle({ x: bw / 2, y: bw / 2, width: W - bw, height: H - bw, borderColor: hex(pg.border.color), borderWidth: bw });
    }
    for (const t of pg.texts) {
      const f = t.bold ? bold : regular;
      page.drawText(clean(f, t.text), { x: t.x * W, y: H - t.y * H - 0.85 * t.sizePt, size: t.sizePt, font: f, color: hex(t.color) });
    }
    if (p.pageNumbers) {
      const txt = String(i + 1), size = 10;
      page.drawText(txt, { x: W / 2 - regular.widthOfTextAtSize(txt, size) / 2, y: mmToPt(8), size, font: regular, color: rgb(0.2, 0.2, 0.2) });
    }
  }
  onProgress?.(p.pages.length, p.pages.length);
  doc.setTitle(p.name);
  doc.setCreator('PDX');
  return doc.save();
}
