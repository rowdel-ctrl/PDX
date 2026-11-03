import { Directory, Filesystem } from '@capacitor/filesystem';
import type { Quality } from './types';

const cache = new Map<string, string>();
const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
export const newId = uid;

const MAX_STORE_PX = 2400; // stored copies are downscaled so big photos can't crash the app

function loadBitmap(blob: Blob): Promise<HTMLImageElement> {
  return new Promise((res, rej) => {
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); res(img); };
    img.onerror = () => { URL.revokeObjectURL(url); rej(new Error('Could not read image')); };
    img.src = url;
  });
}

function toJpeg(img: CanvasImageSource, sw: number, sh: number, maxPx: number, q: number) {
  const k = Math.min(1, maxPx / Math.max(sw, sh));
  const w = Math.max(1, Math.round(sw * k)), h = Math.max(1, Math.round(sh * k));
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#fff'; // flatten transparency
  ctx.fillRect(0, 0, w, h);
  ctx.drawImage(img, 0, 0, w, h);
  const dataUrl = c.toDataURL('image/jpeg', q);
  c.width = c.height = 0;
  return { dataUrl, w, h };
}

/** Downscale + copy a picked image into app storage. */
export async function importImage(file: Blob): Promise<{ file: string; aspect: number }> {
  const img = await loadBitmap(file);
  const { dataUrl, w, h } = toJpeg(img, img.naturalWidth, img.naturalHeight, MAX_STORE_PX, 0.9);
  const path = `images/${uid()}.jpg`;
  await Filesystem.writeFile({
    path, data: dataUrl.split(',')[1], directory: Directory.Data, recursive: true,
  });
  cache.set(path, dataUrl);
  return { file: path, aspect: w / h };
}

export async function imageUrl(path: string): Promise<string> {
  const hit = cache.get(path);
  if (hit) return hit;
  const r = await Filesystem.readFile({ path, directory: Directory.Data });
  const url = `data:image/jpeg;base64,${r.data as string}`;
  cache.set(path, url);
  return url;
}

export async function deleteImages(paths: string[]) {
  for (const p of paths) {
    cache.delete(p);
    try { await Filesystem.deleteFile({ path: p, directory: Directory.Data }); } catch { /* already gone */ }
  }
}

const QUALITY: Record<Quality, { px: number; q: number }> = {
  small: { px: 1000, q: 0.6 },
  standard: { px: 1800, q: 0.8 },
  high: { px: MAX_STORE_PX, q: 0.92 },
};

/** JPEG bytes for the PDF at the chosen quality. */
export async function exportBytes(path: string, quality: Quality): Promise<Uint8Array> {
  const url = await imageUrl(path);
  const blob = await (await fetch(url)).blob();
  const img = await loadBitmap(blob);
  const { px, q } = QUALITY[quality];
  const { dataUrl } = toJpeg(img, img.naturalWidth, img.naturalHeight, px, q);
  const bin = atob(dataUrl.split(',')[1]);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
