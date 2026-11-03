import type * as OrtNS from 'onnxruntime-web/wasm';

/**
 * MODNet portrait matting, running on this phone (ONNX Runtime, WebAssembly).
 * Gives a soft 0..1 matte, much better than a plain mask on hair and edges.
 * Model and runtime ship inside the app.
 */
const base = (p: string) => new URL(p, document.baseURI).href;
let ortP: Promise<typeof OrtNS> | null = null;
let sessP: Promise<OrtNS.InferenceSession> | null = null;

function getSession() {
  sessP ??= (async () => {
    ortP ??= import('onnxruntime-web/wasm');
    const ort = await ortP;
    // Load the runtime from memory so it does not depend on how the app's web server labels .mjs/.wasm files.
    const [js, wasm] = await Promise.all([
      fetch(base('./ort/ort-wasm-simd-threaded.mjs')).then((r) => r.text()),
      fetch(base('./ort/ort-wasm-simd-threaded.wasm')).then((r) => r.arrayBuffer()),
    ]);
    ort.env.wasm.wasmPaths = { mjs: URL.createObjectURL(new Blob([js], { type: 'text/javascript' })), wasm: base('./ort/ort-wasm-simd-threaded.wasm') };
    ort.env.wasm.wasmBinary = wasm;
    ort.env.wasm.numThreads = 1;
    ort.env.wasm.proxy = false;
    const buf = await (await fetch(base('./mp/modnet_q.onnx'))).arrayBuffer();
    return ort.InferenceSession.create(new Uint8Array(buf), { executionProviders: ['wasm'], graphOptimizationLevel: 'all' });
  })();
  sessP.catch(() => { sessP = null; });
  return sessP;
}

/** Soft matte for a photo. Values 0 (background) to 1 (person); w x h is the model's working size. */
export async function modnetMatte(img: HTMLImageElement): Promise<{ data: Float32Array; w: number; h: number }> {
  const sess = await getSession();
  const ort = await ortP!;
  const iw = img.naturalWidth, ih = img.naturalHeight;
  // short side 512, long side at most 768, both multiples of 32
  let k = 512 / Math.min(iw, ih);
  if (Math.max(iw, ih) * k > 768) k = 768 / Math.max(iw, ih);
  const w = Math.max(32, Math.round((iw * k) / 32) * 32), h = Math.max(32, Math.round((ih * k) / 32) * 32);
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const ctx = c.getContext('2d', { willReadFrequently: true })!;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(img, 0, 0, w, h);
  const px = ctx.getImageData(0, 0, w, h).data;
  c.width = c.height = 0;
  const t = new Float32Array(3 * w * h);
  for (let i = 0; i < w * h; i++) {
    t[i] = px[4 * i] / 127.5 - 1;
    t[w * h + i] = px[4 * i + 1] / 127.5 - 1;
    t[2 * w * h + i] = px[4 * i + 2] / 127.5 - 1;
  }
  const out = await sess.run({ [sess.inputNames[0]]: new ort.Tensor('float32', t, [1, 3, h, w]) });
  const o = out[sess.outputNames[0]];
  const data = Float32Array.from(o.data as Float32Array);
  const dims = o.dims;
  if (data.length !== w * h || dims[dims.length - 1] !== w) throw new Error('Unexpected matte size');
  return { data, w, h };
}
