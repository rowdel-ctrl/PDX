// Page finding, flattening and clean-up filters for scans. Everything runs on the phone.
export interface Pt { x: number; y: number } // fractions of the picture

export type Filter = 'orig' | 'magic' | 'bw' | 'gray';

export function canvasOf(w: number, h: number): HTMLCanvasElement {
  const c = document.createElement('canvas'); c.width = Math.max(1, Math.round(w)); c.height = Math.max(1, Math.round(h)); return c;
}

export async function decode(blob: Blob, maxPx: number): Promise<HTMLCanvasElement> {
  const url = URL.createObjectURL(blob);
  try {
    const img = await new Promise<HTMLImageElement>((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => rej(new Error('Could not read that picture')); i.src = url; });
    const k = Math.min(1, maxPx / Math.max(img.naturalWidth, img.naturalHeight));
    const c = canvasOf(img.naturalWidth * k, img.naturalHeight * k);
    const ctx = c.getContext('2d')!; ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height); ctx.drawImage(img, 0, 0, c.width, c.height);
    return c;
  } finally { URL.revokeObjectURL(url); }
}

export const toBlob = (c: HTMLCanvasElement, q = 0.88) => new Promise<Blob>((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error('Could not save the picture'))), 'image/jpeg', q));

export const defaultQuad = (): Pt[] => [{ x: 0.04, y: 0.04 }, { x: 0.96, y: 0.04 }, { x: 0.96, y: 0.96 }, { x: 0.04, y: 0.96 }];

/** Find the four corners of the page (top-left, top-right, bottom-right, bottom-left). Returns null if none is clear. */
export function detectCorners(src: HTMLCanvasElement): Pt[] | null {
  const k = 240 / Math.max(src.width, src.height);
  const w = Math.max(8, Math.round(src.width * k)), h = Math.max(8, Math.round(src.height * k));
  const c = canvasOf(w, h); const ctx = c.getContext('2d', { willReadFrequently: true })!;
  ctx.filter = 'blur(2px)'; ctx.drawImage(src, 0, 0, w, h);
  const d = ctx.getImageData(0, 0, w, h).data;
  const g = new Uint8Array(w * h); const hist = new Array(256).fill(0);
  for (let i = 0; i < w * h; i++) { const v = (d[i * 4] * 77 + d[i * 4 + 1] * 150 + d[i * 4 + 2] * 29) >> 8; g[i] = v; hist[v]++; }
  // Otsu threshold
  let sum = 0; for (let i = 0; i < 256; i++) sum += i * hist[i];
  let wB = 0, sB = 0, best = 0, th = 128; const tot = w * h;
  for (let t = 0; t < 256; t++) { wB += hist[t]; if (!wB) continue; const wF = tot - wB; if (!wF) break; sB += t * hist[t]; const mB = sB / wB, mF = (sum - sB) / wF; const v = wB * wF * (mB - mF) ** 2; if (v > best) { best = v; th = t; } }
  let bestQuad: Pt[] | null = null, bestArea = 0;
  for (const bright of [true, false]) {
    const mask = new Uint8Array(w * h); for (let i = 0; i < w * h; i++) mask[i] = (g[i] > th) === bright ? 1 : 0;
    const seen = new Uint8Array(w * h); const stack: number[] = [];
    for (let s = 0; s < w * h; s++) {
      if (!mask[s] || seen[s]) continue;
      let area = 0, tl = Infinity, tr = -Infinity, br = -Infinity, bl = Infinity; let ptl = 0, ptr = 0, pbr = 0, pbl = 0; let touches = 0;
      stack.push(s); seen[s] = 1;
      while (stack.length) {
        const p = stack.pop()!; const x = p % w, y = (p / w) | 0; area++;
        if (x === 0 || y === 0 || x === w - 1 || y === h - 1) touches++;
        const a = x + y, b = x - y;
        if (a < tl) { tl = a; ptl = p; } if (a > br) { br = a; pbr = p; } if (b > tr) { tr = b; ptr = p; } if (b < bl) { bl = b; pbl = p; }
        if (x > 0 && mask[p - 1] && !seen[p - 1]) { seen[p - 1] = 1; stack.push(p - 1); }
        if (x < w - 1 && mask[p + 1] && !seen[p + 1]) { seen[p + 1] = 1; stack.push(p + 1); }
        if (y > 0 && mask[p - w] && !seen[p - w]) { seen[p - w] = 1; stack.push(p - w); }
        if (y < h - 1 && mask[p + w] && !seen[p + w]) { seen[p + w] = 1; stack.push(p + w); }
      }
      // a page that fills the whole picture is not "found"; the background should leave some border
      if (area > bestArea && area > tot * 0.2 && area < tot * 0.97 && touches < (w + h) * 1.2) {
        const P = (p: number): Pt => ({ x: ((p % w) + 0.5) / w, y: (((p / w) | 0) + 0.5) / h });
        const q = [P(ptl), P(ptr), P(pbr), P(pbl)];
        // the four corners must make a believable quadrilateral
        const poly = Math.abs((q[0].x * q[1].y - q[1].x * q[0].y) + (q[1].x * q[2].y - q[2].x * q[1].y) + (q[2].x * q[3].y - q[3].x * q[2].y) + (q[3].x * q[0].y - q[0].x * q[3].y)) / 2;
        if (poly > 0.25 * (area / tot)) { bestArea = area; bestQuad = q; }
      }
    }
  }
  return bestQuad;
}

function solve(A: number[][], b: number[]): number[] {
  const n = b.length; const M = A.map((r, i) => [...r, b[i]]);
  for (let i = 0; i < n; i++) {
    let p = i; for (let r = i + 1; r < n; r++) if (Math.abs(M[r][i]) > Math.abs(M[p][i])) p = r;
    [M[i], M[p]] = [M[p], M[i]];
    for (let r = i + 1; r < n; r++) { const f = M[r][i] / (M[i][i] || 1e-12); for (let c = i; c <= n; c++) M[r][c] -= f * M[i][c]; }
  }
  const x = new Array(n).fill(0);
  for (let i = n - 1; i >= 0; i--) { let s = M[i][n]; for (let c = i + 1; c < n; c++) s -= M[i][c] * x[c]; x[i] = s / (M[i][i] || 1e-12); }
  return x;
}

/** Flatten the quadrilateral into a straight rectangle. */
export function flatten(src: HTMLCanvasElement, quad: Pt[], maxPx = 2200): HTMLCanvasElement {
  const P = quad.map((p) => ({ x: p.x * src.width, y: p.y * src.height }));
  const dist = (a: Pt, b: Pt) => Math.hypot(a.x - b.x, a.y - b.y);
  let W = (dist(P[0], P[1]) + dist(P[3], P[2])) / 2, H = (dist(P[0], P[3]) + dist(P[1], P[2])) / 2;
  const k = Math.min(1, maxPx / Math.max(W, H)); W = Math.max(8, Math.round(W * k)); H = Math.max(8, Math.round(H * k));
  // homography from the output rectangle to the picture
  const dst = [[0, 0], [W, 0], [W, H], [0, H]];
  const A: number[][] = [], b: number[] = [];
  for (let i = 0; i < 4; i++) {
    const [u, v] = dst[i]; const { x, y } = P[i];
    A.push([u, v, 1, 0, 0, 0, -u * x, -v * x]); b.push(x);
    A.push([0, 0, 0, u, v, 1, -u * y, -v * y]); b.push(y);
  }
  const hm = solve(A, b);
  const sctx = src.getContext('2d', { willReadFrequently: true })!;
  const sd = sctx.getImageData(0, 0, src.width, src.height); const sw = src.width, sh = src.height;
  const out = canvasOf(W, H); const octx = out.getContext('2d')!; const od = octx.createImageData(W, H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const z = hm[6] * x + hm[7] * y + 1;
    const sx = (hm[0] * x + hm[1] * y + hm[2]) / z, sy = (hm[3] * x + hm[4] * y + hm[5]) / z;
    const x0 = Math.floor(sx), y0 = Math.floor(sy); const o = (y * W + x) * 4;
    if (x0 < 0 || y0 < 0 || x0 >= sw - 1 || y0 >= sh - 1) { od.data[o] = od.data[o + 1] = od.data[o + 2] = 255; od.data[o + 3] = 255; continue; }
    const fx = sx - x0, fy = sy - y0; const i00 = (y0 * sw + x0) * 4, i10 = i00 + 4, i01 = i00 + sw * 4, i11 = i01 + 4;
    for (let c = 0; c < 3; c++) od.data[o + c] = sd.data[i00 + c] * (1 - fx) * (1 - fy) + sd.data[i10 + c] * fx * (1 - fy) + sd.data[i01 + c] * (1 - fx) * fy + sd.data[i11 + c] * fx * fy;
    od.data[o + 3] = 255;
  }
  octx.putImageData(od, 0, 0);
  return out;
}

export function rotate(src: HTMLCanvasElement, quarters: number): HTMLCanvasElement {
  const q = ((quarters % 4) + 4) % 4; if (!q) return src;
  const sw = q % 2 ? src.height : src.width, sh = q % 2 ? src.width : src.height;
  const c = canvasOf(sw, sh); const ctx = c.getContext('2d')!;
  ctx.translate(sw / 2, sh / 2); ctx.rotate((q * Math.PI) / 2); ctx.drawImage(src, -src.width / 2, -src.height / 2);
  return c;
}

/** Local background brightness, estimated on a small copy and scaled back up. */
function background(g: Float32Array, w: number, h: number, r: number): Float32Array {
  const tmp = new Float32Array(w * h), out = new Float32Array(w * h);
  for (let y = 0; y < h; y++) { let s = 0, n = 0; const row = y * w; for (let x = -r; x < w; x++) { const a = x + r, b = x - r - 1; if (a < w) { s += g[row + a]; n++; } if (b >= 0) { s -= g[row + b]; n--; } if (x >= 0) tmp[row + x] = s / n; } }
  for (let x = 0; x < w; x++) { let s = 0, n = 0; for (let y = -r; y < h; y++) { const a = y + r, b = y - r - 1; if (a < h) { s += tmp[a * w + x]; n++; } if (b >= 0) { s -= tmp[b * w + x]; n--; } if (y >= 0) out[y * w + x] = s / n; } }
  return out;
}

/** Apply a look to a flattened page. `bright` runs from -1 to 1. */
export function applyFilter(src: HTMLCanvasElement, f: Filter, bright: number): HTMLCanvasElement {
  const w = src.width, h = src.height; const out = canvasOf(w, h); const ctx = out.getContext('2d')!; ctx.drawImage(src, 0, 0);
  const img = ctx.getImageData(0, 0, w, h); const d = img.data; const add = bright * 70;
  if (f === 'orig') { if (bright) for (let i = 0; i < d.length; i += 4) { d[i] += add; d[i + 1] += add; d[i + 2] += add; } }
  else {
    const g = new Float32Array(w * h); for (let i = 0; i < w * h; i++) g[i] = d[i * 4] * 0.299 + d[i * 4 + 1] * 0.587 + d[i * 4 + 2] * 0.114;
    if (f === 'gray') { for (let i = 0; i < w * h; i++) { const v = g[i] + add; d[i * 4] = d[i * 4 + 1] = d[i * 4 + 2] = v; } }
    else {
      // work on a small copy to find the paper's shading, then divide it out
      const s = Math.min(1, 400 / Math.max(w, h)), sw = Math.max(4, Math.round(w * s)), sh = Math.max(4, Math.round(h * s));
      const sm = canvasOf(sw, sh); const sx = sm.getContext('2d', { willReadFrequently: true })!; sx.drawImage(out, 0, 0, sw, sh);
      const sd = sx.getImageData(0, 0, sw, sh).data; const sg = new Float32Array(sw * sh);
      for (let i = 0; i < sw * sh; i++) sg[i] = sd[i * 4] * 0.299 + sd[i * 4 + 1] * 0.587 + sd[i * 4 + 2] * 0.114;
      const bg = background(sg, sw, sh, Math.max(3, Math.round(sw / 14)));
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        const i = y * w + x; const b = Math.max(40, bg[Math.min(sh - 1, (y * s) | 0) * sw + Math.min(sw - 1, (x * s) | 0)]);
        const o = i * 4;
        if (f === 'bw') { const v = g[i] / b; const t = 0.5 + (bright * -0.12); const out8 = v > t + 0.14 ? 255 : v < t - 0.14 ? 0 : ((v - (t - 0.14)) / 0.28) * 255; d[o] = d[o + 1] = d[o + 2] = out8; }
        else { // magic: even out the light, keep colour, whiten the paper
          const k = 235 / b; const lift = add * 0.6;
          for (let c = 0; c < 3; c++) { let v = d[o + c] * k; v = (v - 128) * 1.12 + 128 + lift; d[o + c] = v > 238 ? 255 : v; }
        }
      }
    }
  }
  ctx.putImageData(img, 0, 0);
  return out;
}

export async function canvasToBytes(c: HTMLCanvasElement, q = 0.88): Promise<Uint8Array> { return new Uint8Array(await (await toBlob(c, q)).arrayBuffer()); }
