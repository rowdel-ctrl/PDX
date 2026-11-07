import type * as OrtNS from 'onnxruntime-web/wasm';
import { canvasOf, type Pt } from './scanlib';

/**
 * DocAligner (Apache 2.0, DocsaidLab): a small neural network trained on many photos of documents.
 * It finds the four corners of the page, even with shadows, low contrast or a cluttered desk. Runs on the phone.
 */
const base = (p: string) => new URL(p, document.baseURI).href;
let sessP: Promise<{ ort: typeof OrtNS; sess: OrtNS.InferenceSession }> | null = null;

function getSession() {
  sessP ??= (async () => {
    const ort = await import('onnxruntime-web/wasm');
    const [js, wasm] = await Promise.all([
      fetch(base('./ort/ort-wasm-simd-threaded.mjs')).then((r) => r.text()),
      fetch(base('./ort/ort-wasm-simd-threaded.wasm')).then((r) => r.arrayBuffer()),
    ]);
    ort.env.wasm.wasmPaths = { mjs: URL.createObjectURL(new Blob([js], { type: 'text/javascript' })), wasm: base('./ort/ort-wasm-simd-threaded.wasm') };
    ort.env.wasm.wasmBinary = wasm; ort.env.wasm.numThreads = 1; ort.env.wasm.proxy = false;
    const buf = await (await fetch(base('./mp/docaligner_lcnet.onnx'))).arrayBuffer();
    return { ort, sess: await ort.InferenceSession.create(new Uint8Array(buf), { executionProviders: ['wasm'], graphOptimizationLevel: 'all' }) };
  })();
  sessP.catch(() => { sessP = null; });
  return sessP;
}

const N = 256, G = 128;

/** Four corners (top-left, top-right, bottom-right, bottom-left) as fractions, or null if no page is seen. */
export async function aiCorners(src: HTMLCanvasElement, minConf = 0.1): Promise<{ quad: Pt[]; conf: number } | null> {
  const { ort, sess } = await getSession();
  const c = canvasOf(N, N); const ctx = c.getContext('2d', { willReadFrequently: true })!; ctx.drawImage(src, 0, 0, N, N);
  const d = ctx.getImageData(0, 0, N, N).data; const t = new Float32Array(3 * N * N); const a = N * N;
  for (let i = 0, j = 0; i < d.length; i += 4, j++) { t[j] = d[i] / 255; t[j + a] = d[i + 1] / 255; t[j + 2 * a] = d[i + 2] / 255; }
  const out = await sess.run({ img: new ort.Tensor('float32', t, [1, 3, N, N]) });
  const hm = out.heatmap.data as Float32Array;
  const pts: { x: number; y: number; conf: number }[] = [];
  for (let k = 0; k < 4; k++) {
    const o = k * G * G; let best = -Infinity, bi = 0;
    for (let u = 0; u < G * G; u++) { const v = hm[o + u] ?? 0; if (v > best) { best = v; bi = u; } }
    if (best < minConf) return null;
    const mx = bi % G, my = (bi - mx) / G; const x0 = Math.max(0, mx - 4), x1 = Math.min(G - 1, mx + 4), y0 = Math.max(0, my - 4), y1 = Math.min(G - 1, my + 4);
    let sw = 0, sx = 0, sy = 0;
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) { const v = hm[o + y * G + x] ?? 0; if (v >= 0.3 * best) { sw += v; sx += v * x; sy += v * y; } }
    pts.push({ x: ((sw > 0 ? sx / sw : mx) + 0.5) / G, y: ((sw > 0 ? sy / sw : my) + 0.5) / G, conf: best });
  }
  // put them in order: top-left, top-right, bottom-right, bottom-left
  const cx = pts.reduce((s, p) => s + p.x, 0) / 4, cy = pts.reduce((s, p) => s + p.y, 0) / 4;
  const pick = (f: (p: { x: number; y: number }) => boolean) => pts.find((p) => f({ x: p.x - cx, y: p.y - cy }));
  const tl = pick((p) => p.x < 0 && p.y < 0), tr = pick((p) => p.x >= 0 && p.y < 0), br = pick((p) => p.x >= 0 && p.y >= 0), bl = pick((p) => p.x < 0 && p.y >= 0);
  if (!tl || !tr || !br || !bl) return null;
  return { quad: [tl, tr, br, bl].map((p) => ({ x: Math.min(1, Math.max(0, p.x)), y: Math.min(1, Math.max(0, p.y)) })), conf: Math.min(tl.conf, tr.conf, br.conf, bl.conf) };
}
