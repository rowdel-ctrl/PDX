/** 2x AI upscaling (ESRGAN slim via UpscalerJS and TensorFlow.js). The model ships inside the app, about 0.9 MB. */
const base = (p: string) => new URL(p, document.baseURI).href;
let upP: Promise<{ up: { upscale: (src: unknown, o: Record<string, unknown>) => Promise<string> } }> | null = null;

function getUpscaler() {
  upP ??= (async () => {
    const [{ default: Upscaler }, { default: model }] = await Promise.all([import('upscaler'), import('@upscalerjs/esrgan-slim/2x')]);
    const def = { ...(model as object), path: base('./upscale/x2/model.json') };
    return { up: new Upscaler({ model: def as never }) as never };
  })();
  upP.catch(() => { upP = null; });
  return upP;
}

const MAX_OUT = 5200;
export const canUpscale = (w: number, h: number) => Math.max(w, h) * 2 <= MAX_OUT;

/** Returns a canvas twice the size. Transparent photos keep their transparency. */
export async function upscaleImage(img: HTMLImageElement, keepAlpha: boolean, onProgress?: (p: number) => void, signal?: AbortSignal): Promise<HTMLCanvasElement> {
  const w = img.naturalWidth, h = img.naturalHeight;
  if (!canUpscale(w, h)) throw new Error('This photo is already large');
  const { up } = await getUpscaler();
  // the model works on colour only: put the photo on white (alpha is handled separately below)
  const src = document.createElement('canvas'); src.width = w; src.height = h;
  const sx = src.getContext('2d', { willReadFrequently: true })!;
  if (keepAlpha) { sx.fillStyle = '#fff'; sx.fillRect(0, 0, w, h); }
  sx.drawImage(img, 0, 0);
  const url = await up.upscale(src, { patchSize: 64, padding: 4, output: 'base64', progress: (p: number) => onProgress?.(p), signal });
  src.width = src.height = 0;
  const big = await new Promise<HTMLImageElement>((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => rej(new Error('upscale')); i.src = url; });
  const out = document.createElement('canvas'); out.width = big.naturalWidth; out.height = big.naturalHeight;
  const ox = out.getContext('2d', { willReadFrequently: true })!;
  ox.drawImage(big, 0, 0);
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
