import pico from './vendor/pico.js';
import cascadeUrl from './vendor/facefinder.bin?url';
import { FULL, variantUrl } from './images';
import type { Frame } from './types';
import { frameCrop } from './layout';

let classify: ReturnType<typeof pico.unpack_cascade> | null = null;
const found = new Map<string, Promise<Face | null>>();

/** Face centre and size as fractions of the (rotated) photo. */
export interface Face { x: number; y: number; size: number }

async function load() {
  if (!classify) {
    const buf = await (await fetch(cascadeUrl)).arrayBuffer();
    classify = pico.unpack_cascade(new Int8Array(buf));
  }
  return classify;
}

async function detect(file: string, rot: number): Promise<Face | null> {
  const cls = await load();
  const img = new Image();
  img.src = await variantUrl(file, rot, FULL, 640);
  await new Promise((res, rej) => { img.onload = res; img.onerror = () => rej(new Error('image')); });
  const w = img.naturalWidth, h = img.naturalHeight;
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const ctx = c.getContext('2d', { willReadFrequently: true })!;
  ctx.drawImage(img, 0, 0);
  const rgba = ctx.getImageData(0, 0, w, h).data;
  const gray = new Uint8Array(w * h);
  for (let i = 0; i < gray.length; i++) gray[i] = (rgba[4 * i] * 299 + rgba[4 * i + 1] * 587 + rgba[4 * i + 2] * 114) / 1000;
  c.width = c.height = 0;
  const dets = pico.cluster_detections(
    pico.run_cascade({ pixels: gray, nrows: h, ncols: w, ldim: w }, cls, { shiftfactor: 0.1, scalefactor: 1.1, minsize: Math.max(24, Math.min(w, h) * 0.12), maxsize: 1000 }),
    0.2,
  ).filter((d) => d[3] >= 25);
  if (!dets.length) return null;
  // the biggest confident face is the subject
  dets.sort((a, b) => b[2] * Math.min(b[3], 100) - a[2] * Math.min(a[3], 100));
  const [r, col, s] = dets[0];
  return { x: col / w, y: r / h, size: s / h };
}

/** Find the main face in a photo (cached). Resolves to null when none is found. */
export function findFace(file: string, rot: number): Promise<Face | null> {
  const key = `${file}|${rot}`;
  let p = found.get(key);
  if (!p) { p = detect(file, rot).catch(() => null); found.set(key, p); }
  return p;
}

/**
 * Zoom and centre so the head fills about `headFrac` of the frame height.
 * The detector box covers brow to chin, so the whole head is about 1.45 times that.
 */
export function faceFit(f: Frame, face: Face, pageW: number, pageH: number, headFrac = 0.66): Partial<Frame> {
  const base = frameCrop({ ...f, zoom: 1 }, pageW, pageH);
  const head = face.size * 1.45;
  const targetH = head / headFrac;
  const zoom = Math.min(4, Math.max(1, base.h / targetH));
  return { zoom, cx: face.x, cy: face.y - face.size * 0.08 };
}
