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

const isPng = (path: string) => path.endsWith('.png');

function canvasOf(img: CanvasImageSource, sw: number, sh: number, maxPx: number, rot = 0, crop: Crop = FULL, keepAlpha = false) {
  const odd = rot % 2 === 1;
  const rwN = odd ? sh : sw, rhN = odd ? sw : sh; // rotated size at natural res
  const cwN = crop.w * rwN, chN = crop.h * rhN;
  const s = Math.min(1, maxPx / Math.max(cwN, chN));
  const iw = sw * s, ih = sh * s, rw = odd ? ih : iw, rh = odd ? iw : ih;
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(crop.w * rw)); c.height = Math.max(1, Math.round(crop.h * rh));
  const ctx = c.getContext('2d')!;
  if (!keepAlpha) { ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height); } // flatten transparency unless the photo is a cut-out
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
  const url = `data:${isPng(path) ? 'image/png' : 'image/jpeg'};base64,${r.data as string}`;
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
  const png = isPng(path);
  const c = canvasOf(img, img.naturalWidth, img.naturalHeight, maxPx, rot, crop, png);
  const url = png ? c.toDataURL('image/png') : c.toDataURL('image/jpeg', 0.85);
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
  high: { px: 6000, q: 0.92 },
};

/** Image bytes for the PDF at the chosen quality (PNG for cut-outs so they keep their transparency). */
export async function exportImage(path: string, rot: number, crop: Crop, quality: Quality): Promise<{ bytes: Uint8Array; png: boolean }> {
  const img = await element(path);
  const { px, q } = QUALITY[quality];
  const png = isPng(path);
  const c = canvasOf(img, img.naturalWidth, img.naturalHeight, px, rot, crop, png);
  const dataUrl = png ? c.toDataURL('image/png') : c.toDataURL('image/jpeg', q);
  c.width = c.height = 0;
  const bin = atob(dataUrl.split(',')[1]);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return { bytes: out, png };
}

const smooth = (a: number, b: number, x: number) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

/** Which photo a cut-out came from, so "Refine edges" can bring parts back. Kept on this phone. */
const ORIG_KEY = 'pdx.cutorig';
const origs: Record<string, string> = (() => { try { return JSON.parse(localStorage.getItem(ORIG_KEY) || '{}'); } catch { return {}; } })();
const rememberOrig = (cut: string, orig: string) => { origs[cut] = origs[orig] ?? orig; try { localStorage.setItem(ORIG_KEY, JSON.stringify(origs)); } catch { /* full */ } };
export const originalOf = (file: string): string | null => origs[file] ?? null;

async function saveCutCanvas(c: HTMLCanvasElement, from: string): Promise<{ file: string; aspect: number }> {
  const dataUrl = c.toDataURL('image/png');
  const aspect = c.width / c.height;
  const out = `images/${uid()}.png`;
  await Filesystem.writeFile({ path: out, data: dataUrl.split(',')[1], directory: Directory.Data, recursive: true });
  cache.set(out, dataUrl);
  rememberOrig(out, from);
  return { file: out, aspect };
}

/** Save an edited cut-out (from Refine edges). */
export async function saveCutout(c: HTMLCanvasElement, from: string) { return saveCutCanvas(c, from); }

/** Full-size alpha (0..255 in the alpha channel) from a low-res matte, smoothly scaled up. */
function upscaleMatte(m: { data: Float32Array; w: number; h: number }, w: number, h: number): Uint8ClampedArray {
  const mc = document.createElement('canvas'); mc.width = m.w; mc.height = m.h;
  const mctx = mc.getContext('2d')!;
  const mi = mctx.createImageData(m.w, m.h);
  for (let i = 0; i < m.data.length; i++) mi.data[4 * i + 3] = Math.round(Math.min(1, Math.max(0, m.data[i])) * 255);
  mctx.putImageData(mi, 0, 0);
  const up = document.createElement('canvas'); up.width = w; up.height = h;
  const uctx = up.getContext('2d', { willReadFrequently: true })!;
  uctx.imageSmoothingQuality = 'high';
  uctx.drawImage(mc, 0, 0, w, h);
  const d = uctx.getImageData(0, 0, w, h).data;
  mc.width = mc.height = up.width = up.height = 0;
  return d;
}

/**
 * Remove the background of a photo (on this phone). Saves a new transparent PNG and returns it.
 * Uses MODNet (portrait matting); falls back to the simpler selfie mask if it cannot run.
 */
export async function makeCutout(path: string): Promise<{ file: string; aspect: number }> {
  const img = await element(path);
  const k = Math.min(1, 1800 / Math.max(img.naturalWidth, img.naturalHeight));
  const w = Math.round(img.naturalWidth * k), h = Math.round(img.naturalHeight * k);
  let ramp: [number, number] = [0.15, 0.9];   // matte: soft edge, trims the halo
  let m: { data: Float32Array; w: number; h: number } | null = null;
  try { m = await (await import('./modnet')).modnetMatte(img); }
  catch (e) { console.warn('MODNet unavailable, using the simple mask', e); }
  if (!m) { m = await (await import('./vision')).personMask(img); ramp = [0.4, 0.62]; }
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const ctx = c.getContext('2d', { willReadFrequently: true })!;
  ctx.drawImage(img, 0, 0, w, h);
  const ud = upscaleMatte(m, w, h);
  const id = ctx.getImageData(0, 0, w, h);
  for (let i = 0; i < w * h; i++) id.data[4 * i + 3] = Math.round(smooth(ramp[0], ramp[1], ud[4 * i + 3] / 255) * 255);
  ctx.putImageData(id, 0, 0);
  const res = await saveCutCanvas(c, path);
  c.width = c.height = 0;
  return res;
}

/** Stored size of a photo in pixels. */
export async function pixelSize(path: string): Promise<{ w: number; h: number }> {
  const img = await element(path);
  return { w: img.naturalWidth, h: img.naturalHeight };
}

/** Even out the light of a photo: stretch dark and bright ends and bring the middle to a balanced level. Saves a new copy. */
export async function evenLight(path: string): Promise<{ file: string; aspect: number }> {
  const img = await element(path);
  const w = img.naturalWidth, h = img.naturalHeight, png = isPng(path);
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const ctx = c.getContext('2d', { willReadFrequently: true })!;
  ctx.drawImage(img, 0, 0);
  const id = ctx.getImageData(0, 0, w, h), d = id.data;
  const hist = new Uint32Array(256); let n = 0;
  for (let i = 0; i < d.length; i += 4) if (d[i + 3] > 200) { hist[Math.round(0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2])]++; n++; }
  const pct = (q: number) => { let a = 0; for (let v = 0; v < 256; v++) { a += hist[v]; if (a >= n * q) return v; } return 255; };
  const lo = pct(0.01), hi = Math.max(lo + 40, pct(0.99));
  // gamma so the middle of the picture lands near 50% grey (limited, so faces do not wash out)
  const mid = (pct(0.5) - lo) / (hi - lo);
  const gamma = Math.min(1.6, Math.max(0.65, mid > 0.01 && mid < 0.99 ? Math.log(0.5) / Math.log(mid) : 1));
  const lut = new Uint8ClampedArray(256);
  for (let v = 0; v < 256; v++) lut[v] = Math.round(255 * Math.pow(Math.min(1, Math.max(0, (v - lo) / (hi - lo))), gamma));
  for (let i = 0; i < d.length; i += 4) { d[i] = lut[d[i]]; d[i + 1] = lut[d[i + 1]]; d[i + 2] = lut[d[i + 2]]; }
  ctx.putImageData(id, 0, 0);
  const dataUrl = png ? c.toDataURL('image/png') : c.toDataURL('image/jpeg', 0.92);
  c.width = c.height = 0;
  const out = `images/${uid()}.${png ? 'png' : 'jpg'}`;
  await Filesystem.writeFile({ path: out, data: dataUrl.split(',')[1], directory: Directory.Data, recursive: true });
  cache.set(out, dataUrl);
  const o = originalOf(path); if (o) rememberOrig(out, o);
  return { file: out, aspect: w / h };
}

// ---------------------------------------------------------------- enhance and upscale
function adjustedCanvas(img: HTMLImageElement, a: import('./enhance').Adjust, maxPx: number, adjust: (d: ImageData, a: import('./enhance').Adjust) => void): HTMLCanvasElement {
  const k = Math.min(1, maxPx / Math.max(img.naturalWidth, img.naturalHeight));
  const c = document.createElement('canvas'); c.width = Math.max(1, Math.round(img.naturalWidth * k)); c.height = Math.max(1, Math.round(img.naturalHeight * k));
  const ctx = c.getContext('2d', { willReadFrequently: true })!;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(img, 0, 0, c.width, c.height);
  const id = ctx.getImageData(0, 0, c.width, c.height);
  adjust(id, a);
  ctx.putImageData(id, 0, 0);
  return c;
}

/** Small preview of a photo with the adjustments applied (a data URL). */
export async function enhancePreview(path: string, a: import('./enhance').Adjust, maxPx = 520): Promise<string> {
  const { adjustPixels } = await import('./enhance');
  const c = adjustedCanvas(await element(path), a, maxPx, adjustPixels);
  const url = c.toDataURL('image/jpeg', 0.85);
  c.width = c.height = 0;
  return url;
}

async function saveEdited(c: HTMLCanvasElement, from: string, png: boolean): Promise<{ file: string; aspect: number }> {
  const dataUrl = png ? c.toDataURL('image/png') : c.toDataURL('image/jpeg', 0.92);
  const aspect = c.width / c.height;
  const out = `images/${uid()}.${png ? 'png' : 'jpg'}`;
  await Filesystem.writeFile({ path: out, data: dataUrl.split(',')[1], directory: Directory.Data, recursive: true });
  cache.set(out, dataUrl);
  const o = originalOf(from); if (o) rememberOrig(out, o);
  return { file: out, aspect };
}

/** Apply the adjustments to the full photo and save a new copy. */
export async function enhanceFile(path: string, a: import('./enhance').Adjust): Promise<{ file: string; aspect: number }> {
  const { adjustPixels } = await import('./enhance');
  const img = await element(path);
  const c = adjustedCanvas(img, a, 9000, adjustPixels);
  const r = await saveEdited(c, path, isPng(path));
  c.width = c.height = 0;
  return r;
}

/** Make a photo twice as wide and tall with an AI model that runs on this phone. */
export async function upscaleFile(path: string, onProgress?: (p: number) => void, signal?: AbortSignal): Promise<{ file: string; aspect: number }> {
  const { upscaleImage } = await import('./upscale');
  const png = isPng(path);
  const c = await upscaleImage(await element(path), png, onProgress, signal);
  const r = await saveEdited(c, path, png);
  c.width = c.height = 0;
  return r;
}
