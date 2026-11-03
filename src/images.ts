import { Directory, Filesystem } from '@capacitor/filesystem';
import type { Crop, Quality } from './types';

const cache = new Map<string, string>();
const elCache = new Map<string, Promise<HTMLImageElement>>();
const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
export const newId = uid;

export const FULL: Crop = { x: 0, y: 0, w: 1, h: 1 };
const MAX_STORE_PX = 2400; // stored copies are downscaled so big photos can't crash the app

function loadSrc(src: string): Promise<HTMLImageElement> {
  return new Promise((res, rej) => {
    const img = new Image();
    img.onload = () => res(img);
    img.onerror = () => rej(new Error('Could not read image'));
    img.src = src;
  });
}

async function loadBlob(blob: Blob) {
  const url = URL.createObjectURL(blob);
  try { return await loadSrc(url); } finally { URL.revokeObjectURL(url); }
}

function canvasOf(img: CanvasImageSource, sw: number, sh: number, maxPx: number, rot = 0, crop: Crop = FULL) {
  const odd = rot % 2 === 1;
  const rwN = odd ? sh : sw, rhN = odd ? sw : sh; // rotated size at natural res
  const cwN = crop.w * rwN, chN = crop.h * rhN;
  const s = Math.min(1, maxPx / Math.max(cwN, chN));
  const iw = sw * s, ih = sh * s, rw = odd ? ih : iw, rh = odd ? iw : ih;
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(crop.w * rw)); c.height = Math.max(1, Math.round(crop.h * rh));
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#fff'; // flatten transparency
  ctx.fillRect(0, 0, c.width, c.height);
  ctx.translate(-crop.x * rw, -crop.y * rh);
  ctx.translate(rw / 2, rh / 2);
  ctx.rotate((rot * Math.PI) / 2);
  ctx.drawImage(img, -iw / 2, -ih / 2, iw, ih);
  return c;
}

/** Downscale + copy a picked image into app storage. */
export async function importImage(file: Blob): Promise<{ file: string; aspect: number }> {
  const img = await loadBlob(file);
  const c = canvasOf(img, img.naturalWidth, img.naturalHeight, MAX_STORE_PX);
  const dataUrl = c.toDataURL('image/jpeg', 0.9);
  const aspect = c.width / c.height;
  c.width = c.height = 0;
  const path = `images/${uid()}.jpg`;
  await Filesystem.writeFile({ path, data: dataUrl.split(',')[1], directory: Directory.Data, recursive: true });
  cache.set(path, dataUrl);
  return { file: path, aspect };
}

export async function imageUrl(path: string): Promise<string> {
  const hit = cache.get(path);
  if (hit) return hit;
  const r = await Filesystem.readFile({ path, directory: Directory.Data });
  const url = `data:image/jpeg;base64,${r.data as string}`;
  cache.set(path, url);
  return url;
}

function element(path: string) {
  let p = elCache.get(path);
  if (!p) { p = imageUrl(path).then(loadSrc); elCache.set(path, p); p.catch(() => elCache.delete(path)); }
  return p;
}

const variants = new Map<string, string>();
/** Display copy of an image with rotation + crop applied (for canvas and thumbnails). */
export async function variantUrl(path: string, rot: number, crop: Crop, maxPx: number): Promise<string> {
  const key = `${path}|${rot}|${crop.x.toFixed(3)},${crop.y.toFixed(3)},${crop.w.toFixed(3)},${crop.h.toFixed(3)}|${maxPx}`;
  const hit = variants.get(key);
  if (hit) return hit;
  const img = await element(path);
  const c = canvasOf(img, img.naturalWidth, img.naturalHeight, maxPx, rot, crop);
  const url = c.toDataURL('image/jpeg', 0.85);
  c.width = c.height = 0;
  variants.set(key, url);
  if (variants.size > 80) variants.delete(variants.keys().next().value as string);
  return url;
}

export async function deleteImages(paths: string[]) {
  for (const p of paths) {
    cache.delete(p); elCache.delete(p);
    try { await Filesystem.deleteFile({ path: p, directory: Directory.Data }); } catch { /* already gone */ }
  }
}

const QUALITY: Record<Quality, { px: number; q: number }> = {
  small: { px: 1000, q: 0.6 },
  standard: { px: 1800, q: 0.8 },
  high: { px: MAX_STORE_PX, q: 0.92 },
};

/** JPEG bytes for the PDF at the chosen quality. */
export async function exportBytes(path: string, rot: number, crop: Crop, quality: Quality): Promise<Uint8Array> {
  const img = await element(path);
  const { px, q } = QUALITY[quality];
  const c = canvasOf(img, img.naturalWidth, img.naturalHeight, px, rot, crop);
  const dataUrl = c.toDataURL('image/jpeg', q);
  c.width = c.height = 0;
  const bin = atob(dataUrl.split(',')[1]);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
