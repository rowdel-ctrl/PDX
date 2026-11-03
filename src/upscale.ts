/**
 * 2x AI upscaling: an ESRGAN-slim (RDN) model run with TensorFlow.js. The model ships inside the app, about 0.9 MB.
 * The photo is cut into overlapping tiles, each tile is enlarged, and only its centre is kept, so there are no seams.
 */
const base = (p: string) => new URL(p, document.baseURI).href;

type TF = typeof import('@tensorflow/tfjs');
let tfP: Promise<{ tf: TF; model: import('@tensorflow/tfjs').LayersModel }> | null = null;

function load() {
  tfP ??= (async () => {
    const tf = await import('@tensorflow/tfjs');
    // many phone GPUs lose precision with half-float textures, which shows up as stripes: ask for full floats
    tf.env().set('WEBGL_FORCE_F16_TEXTURES', false);
    try { await tf.setBackend('webgl'); } catch { await tf.setBackend('cpu'); }
    await tf.ready();
    const model = await tf.loadLayersModel(base('./upscale/x2/model.json'));
    return { tf, model };
  })();
  tfP.catch(() => { tfP = null; });
  return tfP;
}

const MAX_OUT = 5200;
export const canUpscale = (w: number, h: number) => Math.max(w, h) * 2 <= MAX_OUT;

const CORE = 96, PAD = 12;

/** Enlarge one tile. Returns the 2x pixels (0 to 255, RGB), or null if the result looks broken. */
function run(tf: TF, model: import('@tensorflow/tfjs').LayersModel, rgb: Float32Array, w: number, h: number): Float32Array | null {
  const input = tf.tensor4d(rgb, [1, h, w, 3]);
  const out = model.predict(input) as import('@tensorflow/tfjs').Tensor4D;
  try {
    const data = Float32Array.from(out.dataSync() as Float32Array);
    for (let i = 0; i < data.length; i += 97) if (!Number.isFinite(data[i])) return null;
    return data;
  } finally { input.dispose(); out.dispose(); }
}

/** Returns a canvas twice the size. Transparent photos keep their transparency. */
export async function upscaleImage(img: HTMLImageElement, keepAlpha: boolean, onProgress?: (p: number) => void, signal?: AbortSignal): Promise<HTMLCanvasElement> {
  const W = img.naturalWidth, H = img.naturalHeight;
  if (!canUpscale(W, H)) throw new Error('This photo is already large');
  let { tf, model } = await load();
  const src = document.createElement('canvas'); src.width = W; src.height = H;
  const sx = src.getContext('2d', { willReadFrequently: true })!;
  if (keepAlpha) { sx.fillStyle = '#fff'; sx.fillRect(0, 0, W, H); }   // the model works on colour only; alpha is added back below
  sx.drawImage(img, 0, 0);
  const px = sx.getImageData(0, 0, W, H).data;
  src.width = src.height = 0;

  const out = document.createElement('canvas'); out.width = W * 2; out.height = H * 2;
  const ox = out.getContext('2d', { willReadFrequently: true })!;
  const tilesX = Math.ceil(W / CORE), tilesY = Math.ceil(H / CORE), total = tilesX * tilesY;
  let done = 0, usedCpu = false;

  for (let ty = 0; ty < tilesY; ty++) {
    for (let tx = 0; tx < tilesX; tx++) {
      if (signal?.aborted) throw new DOMException('Cancelled', 'AbortError');
      const cx = tx * CORE, cy = ty * CORE, cw = Math.min(CORE, W - cx), ch = Math.min(CORE, H - cy);
      const x0 = Math.max(0, cx - PAD), y0 = Math.max(0, cy - PAD), x1 = Math.min(W, cx + cw + PAD), y1 = Math.min(H, cy + ch + PAD);
      const w = x1 - x0, h = y1 - y0;
      const rgb = new Float32Array(w * h * 3);
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        const s = ((y0 + y) * W + (x0 + x)) * 4, d = (y * w + x) * 3;
        rgb[d] = px[s]; rgb[d + 1] = px[s + 1]; rgb[d + 2] = px[s + 2];
      }
      let big = run(tf, model, rgb, w, h);
      if (!big && !usedCpu) {            // the graphics chip gave garbage: switch to the slower but safe processor
        usedCpu = true;
        await tf.setBackend('cpu'); await tf.ready();
        model = await tf.loadLayersModel(base('./upscale/x2/model.json'));
        big = run(tf, model, rgb, w, h);
      }
      if (!big) throw new Error('The upscaler gave a broken result');
      // keep only the centre of the enlarged tile
      const bw = w * 2, id = ox.createImageData(cw * 2, ch * 2), ix0 = (cx - x0) * 2, iy0 = (cy - y0) * 2;
      for (let y = 0; y < ch * 2; y++) for (let x = 0; x < cw * 2; x++) {
        const s = ((iy0 + y) * bw + (ix0 + x)) * 3, d = (y * cw * 2 + x) * 4;
        id.data[d] = big[s]; id.data[d + 1] = big[s + 1]; id.data[d + 2] = big[s + 2]; id.data[d + 3] = 255;
      }
      ox.putImageData(id, cx * 2, cy * 2);
      onProgress?.(++done / total);
      if (done % 4 === 0) await new Promise((r) => setTimeout(r, 0));   // let the screen update and Cancel work
    }
  }

  if (keepAlpha) {
    // smoothly enlarged copy of the original, used only for its transparency
    const a = document.createElement('canvas'); a.width = out.width; a.height = out.height;
    const ax = a.getContext('2d', { willReadFrequently: true })!;
    ax.imageSmoothingQuality = 'high';
    ax.drawImage(img, 0, 0, a.width, a.height);
    const ad = ax.getImageData(0, 0, a.width, a.height).data, od = ox.getImageData(0, 0, out.width, out.height);
    for (let i = 3; i < od.data.length; i += 4) od.data[i] = ad[i];
    ox.putImageData(od, 0, 0);
    a.width = a.height = 0;
  }
  return out;
}
