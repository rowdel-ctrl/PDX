import { PDFDocument, rgb } from 'pdf-lib';
import type { Project, Quality } from './types';
import { exportBytes } from './images';
import { mmToPt } from './units';

const hex = (c: string) => {
  const n = parseInt(c.replace('#', ''), 16);
  return rgb(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255);
};

export async function buildPdf(p: Project, quality: Quality, onProgress?: (n: number, total: number) => void): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const embedded = new Map<string, Awaited<ReturnType<PDFDocument['embedJpg']>>>();
  for (let i = 0; i < p.pages.length; i++) {
    onProgress?.(i, p.pages.length);
    const pg = p.pages[i];
    const W = mmToPt(pg.widthMm), H = mmToPt(pg.heightMm);
    const page = doc.addPage([W, H]);
    page.drawRectangle({ x: 0, y: 0, width: W, height: H, color: hex(pg.background) });
    for (const im of pg.images) {
      let e = embedded.get(im.file);
      if (!e) {
        e = await doc.embedJpg(await exportBytes(im.file, quality));
        embedded.set(im.file, e);
      }
      page.drawImage(e, { x: im.x * W, y: H - (im.y + im.h) * H, width: im.w * W, height: im.h * H });
    }
    if (pg.border.on) {
      const bw = mmToPt(pg.border.widthMm);
      page.drawRectangle({ x: bw / 2, y: bw / 2, width: W - bw, height: H - bw, borderColor: hex(pg.border.color), borderWidth: bw });
    }
  }
  onProgress?.(p.pages.length, p.pages.length);
  doc.setTitle(p.name);
  doc.setCreator('PDX');
  return doc.save();
}
