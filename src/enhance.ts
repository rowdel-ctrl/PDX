/** Photo enhancement on a pixel buffer: light and colour, noise cleanup and sharpening. Runs on this phone, no network. */
export interface Adjust { auto: boolean; brightness: number; contrast: number; saturation: number; warmth: number; sharpen: number; denoise: number }

export const NEUTRAL: Adjust = { auto: false, brightness: 0, contrast: 0, saturation: 0, warmth: 0, sharpen: 0, denoise: 0 };
export const isNeutral = (a: Adjust) => !a.auto && a.brightness === 0 && a.contrast === 0 && a.saturation === 0 && a.warmth === 0 && a.sharpen === 0 && a.denoise === 0;
/** What "Auto enhance" sets: balanced light plus a little contrast, colour and sharpness. */
export const AUTO: Adjust = { auto: true, brightness: 0, contrast: 8, saturation: 10, warmth: 0, sharpen: 25, denoise: 0 };

/** Box blur of the colour channels (alpha is left alone). */
function boxBlur(src: Uint8ClampedArray, w: number, h: number, r: number): Uint8ClampedArray {
  const tmp = new Uint8ClampedArray(src.length), out = new Uint8ClampedArray(src.length), n = 2 * r + 1;
  for (let y = 0; y < h; y++) {
    for (let c = 0; c < 3; c++) {
      let sum = 0;
      for (let k = -r; k <= r; k++) sum += src[(y * w + Math.min(w - 1, Math.max(0, k))) * 4 + c];
      for (let x = 0; x < w; x++) {
        tmp[(y * w + x) * 4 + c] = sum / n;
        sum += src[(y * w + Math.min(w - 1, x + r + 1)) * 4 + c] - src[(y * w + Math.max(0, x - r)) * 4 + c];
      }
    }
  }
  for (let x = 0; x < w; x++) {
    for (let c = 0; c < 3; c++) {
      let sum = 0;
      for (let k = -r; k <= r; k++) sum += tmp[(Math.min(h - 1, Math.max(0, k)) * w + x) * 4 + c];
      for (let y = 0; y < h; y++) {
        out[(y * w + x) * 4 + c] = sum / n;
        sum += tmp[(Math.min(h - 1, y + r + 1) * w + x) * 4 + c] - tmp[(Math.max(0, y - r) * w + x) * 4 + c];
      }
    }
  }
  for (let i = 3; i < out.length; i += 4) out[i] = src[i];
  return out;
}

const smooth = (a: number, b: number, x: number) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

/** Change the pixels in place. */
export function adjustPixels(img: ImageData, a: Adjust): void {
  const { width: w, height: h, data: d } = img;
  const lum = (i: number) => 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];

  // 1. noise cleanup: blend with a blurred copy where the picture is flat, keep edges
  if (a.denoise > 0) {
    const b = boxBlur(d, w, h, Math.max(1, Math.round(1 + a.denoise / 60)));
    const amt = a.denoise / 100;
    for (let i = 0; i < d.length; i += 4) {
      const diff = Math.abs(lum(i) - (0.299 * b[i] + 0.587 * b[i + 1] + 0.114 * b[i + 2]));
      const k = amt * (1 - smooth(6, 28, diff));
      d[i] += (b[i] - d[i]) * k; d[i + 1] += (b[i + 1] - d[i + 1]) * k; d[i + 2] += (b[i + 2] - d[i + 2]) * k;
    }
  }

  // 2. light: auto levels, brightness and contrast through one lookup table
  const lut = new Uint8ClampedArray(256);
  let lo = 0, hi = 255, gamma = 1;
  if (a.auto) {
    const hist = new Uint32Array(256); let n = 0;
    for (let i = 0; i < d.length; i += 4) if (d[i + 3] > 200) { hist[Math.round(lum(i))]++; n++; }
    const pct = (q: number) => { let s = 0; for (let v = 0; v < 256; v++) { s += hist[v]; if (s >= n * q) return v; } return 255; };
    lo = pct(0.005); hi = Math.max(lo + 40, pct(0.995));
    const mid = (pct(0.5) - lo) / (hi - lo);
    gamma = Math.min(1.5, Math.max(0.7, mid > 0.02 && mid < 0.98 ? Math.log(0.48) / Math.log(mid) : 1));
  }
  const con = 1 + a.contrast / 100, bri = (a.brightness / 100) * 0.3;
  for (let v = 0; v < 256; v++) {
    let x = Math.min(1, Math.max(0, (v - lo) / (hi - lo)));
    x = Math.pow(x, gamma);
    x = (x - 0.5) * con + 0.5 + bri;
    lut[v] = Math.round(Math.min(1, Math.max(0, x)) * 255);
  }
  // 3. colour strength and warmth
  const sat = 1 + a.saturation / 100, warm = (a.warmth / 100) * 22;
  const colour = a.saturation !== 0 || a.warmth !== 0;
  for (let i = 0; i < d.length; i += 4) {
    let r = lut[d[i]], g = lut[d[i + 1]], b = lut[d[i + 2]];
    if (colour) {
      const l = 0.299 * r + 0.587 * g + 0.114 * b;
      r = l + (r - l) * sat + warm; g = l + (g - l) * sat; b = l + (b - l) * sat - warm;
    }
    d[i] = r; d[i + 1] = g; d[i + 2] = b;
  }

  // 4. sharpen (unsharp mask)
  if (a.sharpen > 0) {
    const b = boxBlur(d, w, h, Math.max(1, Math.round(Math.max(w, h) / 1400)));
    const amt = (a.sharpen / 100) * 1.6;
    for (let i = 0; i < d.length; i += 4) {
      for (let c = 0; c < 3; c++) {
        const diff = d[i + c] - b[i + c];
        if (Math.abs(diff) > 2) d[i + c] += diff * amt;
      }
    }
  }
}
