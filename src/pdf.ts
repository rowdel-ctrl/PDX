import { degrees, PDFDocument, PDFFont, rgb, StandardFonts } from 'pdf-lib';
import type { Project, Quality } from './types';
import { exportImage } from './images';
import { borderRect, cropMarkSegments, frameCrop } from './layout';
import { mmToPt } from './units';
import { addScaledPage, closeScaled, scaleOff } from './printer';

const hex = (c: string) => {
  const n = parseInt(c.replace('#', ''), 16);
  return rgb(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255);
};

/** Standard PDF fonts can't draw every character; swap unsupported ones for '?'. */
const clean = (font: PDFFont, t: string) => {
  const ok = new Set(font.getCharacterSet());
  return Array.from(t).map((ch) => (ok.has(ch.codePointAt(0)!) ? ch : '?')).join('');
};

export async function buildPdf(p: Project, quality: Quality, onProgress?: (n: number, total: number) => void, opts?: { noScale?: boolean }): Promise<Uint8Array> {
  scaleOff.on = !!opts?.noScale;
  try { return await build(p, quality, onProgress); } finally { scaleOff.on = false; }
}

async function build(p: Project, quality: Quality, onProgress?: (n: number, total: number) => void): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const regular = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const embedded = new Map<string, Awaited<ReturnType<PDFDocument['embedJpg']>>>();
  const embed = async (file: string, rot: number, crop: import('./types').Crop) => {
    const key = `${file}|${rot}|${JSON.stringify(crop)}|${quality}`;
    let e = embedded.get(key);
    if (!e) { const r = await exportImage(file, rot, crop, quality); e = r.png ? await doc.embedPng(r.bytes) : await doc.embedJpg(r.bytes); embedded.set(key, e); }
    return e;
  };
  for (let i = 0; i < p.pages.length; i++) {
    onProgress?.(i, p.pages.length);
    const pg = p.pages[i];
    const W = mmToPt(pg.widthMm), H = mmToPt(pg.heightMm);
    const page = addScaledPage(doc, [W, H]);
    page.drawRectangle({ x: 0, y: 0, width: W, height: H, color: hex(pg.background) });
    for (const im of pg.images) {
      const e = await embed(im.file, im.rot, im.crop);
      const a = ((im.angle ?? 0) * Math.PI) / 180, cs = Math.cos(a), sn = Math.sin(a);
      // bottom-left corner after rotating about the centre (screen coords, y down), then to pdf coords
      const cx = (im.x + im.w / 2) * W, cy = (im.y + im.h / 2) * H, hw = (im.w * W) / 2, hh = (im.h * H) / 2;
      const bx = cx + (-hw * cs - hh * sn), by = cy + (-hw * sn + hh * cs);
      if (im.bg) page.drawRectangle({ x: bx, y: H - by, width: im.w * W, height: im.h * H, color: hex(im.bg), rotate: degrees(-(im.angle ?? 0)) });
      page.drawImage(e, { x: bx, y: H - by, width: im.w * W, height: im.h * H, rotate: degrees(-(im.angle ?? 0)) });
    }
    for (const f of pg.frames) {
      if (!f.file) continue;
      const crop = frameCrop(f, pg.widthMm, pg.heightMm);
      const e = await embed(f.file, f.rot, crop);
      if (f.bg) page.drawRectangle({ x: f.x * W, y: H - (f.y + f.h) * H, width: f.w * W, height: f.h * H, color: hex(f.bg) });
      page.drawImage(e, { x: f.x * W, y: H - (f.y + f.h) * H, width: f.w * W, height: f.h * H });
      if (p.frameBorder.on) {
        const bw = p.frameBorder.widthMm, r = borderRect(f.w * pg.widthMm, f.h * pg.heightMm, bw, p.frameBorder.place);
        page.drawRectangle({
          x: mmToPt(f.x * pg.widthMm + r.x), y: H - mmToPt(f.y * pg.heightMm + r.y + r.h), width: mmToPt(r.w), height: mmToPt(r.h),
          borderColor: hex(p.frameBorder.color), borderWidth: mmToPt(bw),
        });
      }
    }
    if (p.cropMarks) {
      for (const f of pg.frames) {
        if (!f.file) continue;
        const fx = f.x * pg.widthMm, fy = f.y * pg.heightMm;
        for (const [x1, y1, x2, y2] of cropMarkSegments(f.w * pg.widthMm, f.h * pg.heightMm)) {
          page.drawLine({ start: { x: mmToPt(fx + x1), y: H - mmToPt(fy + y1) }, end: { x: mmToPt(fx + x2), y: H - mmToPt(fy + y2) }, thickness: 0.4, color: rgb(0.2, 0.2, 0.2) });
        }
      }
    }
    if (pg.border.on) {
      const bw = mmToPt(pg.border.widthMm);
      page.drawRectangle({ x: bw / 2, y: bw / 2, width: W - bw, height: H - bw, borderColor: hex(pg.border.color), borderWidth: bw });
    }
    for (const t of pg.texts) {
      const f = t.bold ? bold : regular;
      const a = ((t.angle ?? 0) * Math.PI) / 180, d = 0.85 * t.sizePt;
      // baseline start = top-left corner + (0, d) rotated clockwise about the corner
      page.drawText(clean(f, t.text), { x: t.x * W - d * Math.sin(a), y: H - (t.y * H + d * Math.cos(a)), size: t.sizePt, font: f, color: hex(t.color), rotate: degrees(-(t.angle ?? 0)) });
    }
    if (p.pageNumbers) {
      const txt = String(i + 1), size = 10;
      page.drawText(txt, { x: W / 2 - regular.widthOfTextAtSize(txt, size) / 2, y: mmToPt(8), size, font: regular, color: rgb(0.2, 0.2, 0.2) });
    }
  }
  closeScaled(doc);
  onProgress?.(p.pages.length, p.pages.length);
  doc.setTitle(p.name);
  doc.setCreator('PDX');
  return doc.save();
}
