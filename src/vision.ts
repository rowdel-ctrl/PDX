import type { FaceDetector, ImageSegmenter } from '@mediapipe/tasks-vision';
import { FULL, variantUrl } from './images';
import { frameCrop } from './layout';
import type { Frame } from './types';

/** On-device vision (MediaPipe): face finding and background removal. Models and runtime ship inside the app. */
const base = () => new URL('./mp', document.baseURI).href;
let kit: Promise<{ m: typeof import('@mediapipe/tasks-vision'); fs: Awaited<ReturnType<(typeof import('@mediapipe/tasks-vision'))['FilesetResolver']['forVisionTasks']>> }> | null = null;
let detector: Promise<FaceDetector> | null = null;
let segmenter: Promise<ImageSegmenter> | null = null;

function load() {
  kit ??= (async () => {
    const m = await import('@mediapipe/tasks-vision');
    return { m, fs: await m.FilesetResolver.forVisionTasks(base()) };
  })();
  return kit;
}

async function getDetector() {
  detector ??= load().then(({ m, fs }) => m.FaceDetector.createFromOptions(fs, {
    baseOptions: { modelAssetPath: `${base()}/blaze_face_short_range.tflite`, delegate: 'CPU' },
    runningMode: 'IMAGE', minDetectionConfidence: 0.5,
  }));
  detector.catch(() => { detector = null; });
  return detector;
}

async function getSegmenter() {
  segmenter ??= load().then(({ m, fs }) => m.ImageSegmenter.createFromOptions(fs, {
    baseOptions: { modelAssetPath: `${base()}/selfie_segmenter.tflite`, delegate: 'CPU' },
    runningMode: 'IMAGE', outputCategoryMask: false, outputConfidenceMasks: true,
  }));
  segmenter.catch(() => { segmenter = null; });
  return segmenter;
}

/** A face as fractions of the (rotated) photo: centre and height. */
export interface Face { x: number; y: number; size: number }

const faceCache = new Map<string, Promise<Face[]>>();

async function detectFaces(file: string, rot: number): Promise<Face[]> {
  const det = await getDetector();
  const img = new Image();
  img.src = await variantUrl(file, rot, FULL, 800);
  await new Promise((res, rej) => { img.onload = res; img.onerror = () => rej(new Error('image')); });
  const w = img.naturalWidth, h = img.naturalHeight;
  return det.detect(img).detections
    .map((d) => d.boundingBox)
    .filter((b): b is NonNullable<typeof b> => !!b)
    .map((b) => ({ x: (b.originX + b.width / 2) / w, y: (b.originY + b.height / 2) / h, size: b.height / h }))
    .sort((a, b) => a.x - b.x)
    .slice(0, 8);
}

/** Every face found, left to right. Empty when none (or when the device can't run the detector). */
export function findFaces(file: string, rot: number): Promise<Face[]> {
  const key = `${file}|${rot}`;
  let p = faceCache.get(key);
  if (!p) { p = detectFaces(file, rot).catch((e) => { console.error('face detection failed', e); return []; }); faceCache.set(key, p); }
  return p;
}

/** The biggest face, usually the subject. */
export const mainFace = (faces: Face[]): Face | null => faces.reduce<Face | null>((best, f) => (!best || f.size > best.size ? f : best), null);

/**
 * Zoom and centre so the head fills about `headFrac` of the frame height.
 * The detector box is brow to chin; the whole head is about 1.5 times that.
 */
export function faceFit(f: Frame, face: Face, pageW: number, pageH: number, headFrac = 0.66): Partial<Frame> {
  const base1 = frameCrop({ ...f, zoom: 1 }, pageW, pageH);
  const targetH = (face.size * 1.5) / headFrac;
  const zoom = Math.min(4, Math.max(1, base1.h / targetH));
  return { zoom, cx: face.x, cy: face.y - face.size * 0.12 };
}

/** Person confidence (0 to 1) for each pixel of a low-resolution mask. */
export async function personMask(img: HTMLImageElement): Promise<{ data: Float32Array; w: number; h: number }> {
  const seg = await getSegmenter();
  const res = seg.segment(img);
  const masks = res.confidenceMasks ?? [];
  if (!masks.length) throw new Error('No mask');
  const arrs = masks.map((m) => ({ a: m.getAsFloat32Array(), w: m.width, h: m.height }));
  res.close();
  // The person mask is the one that is stronger in the middle than at the edges.
  const score = (m: { a: Float32Array; w: number; h: number }) => {
    let c = 0, cn = 0, e = 0, en = 0;
    for (let y = 0; y < m.h; y++) for (let x = 0; x < m.w; x++) {
      const v = m.a[y * m.w + x], inner = x > m.w * 0.3 && x < m.w * 0.7 && y > m.h * 0.3 && y < m.h * 0.7;
      if (inner) { c += v; cn++; } else if (x < m.w * 0.1 || x > m.w * 0.9) { e += v; en++; }
    }
    return c / Math.max(1, cn) - e / Math.max(1, en);
  };
  let best = arrs[0];
  for (const m of arrs) if (score(m) > score(best)) best = m;
  if (arrs.length === 1 && score(best) < 0) best = { ...best, a: best.a.map((v) => 1 - v) };
  return { data: best.a, w: best.w, h: best.h };
}
