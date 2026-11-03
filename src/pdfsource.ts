const MAX_PX = 4096;

export interface Source { jpeg: Uint8Array; preview: string; aspect: number; pxW: number; pxH: number }

function fromCanvas(c: HTMLCanvasElement): Source {
  const bytes = (q: number) => {
    const bin = atob(c.toDataURL('image/jpeg', q).split(',')[1]);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  };
  const k = Math.min(1, 1000 / Math.max(c.width, c.height));
  const pc = document.createElement('canvas');
  pc.width = Math.max(1, Math.round(c.width * k)); pc.height = Math.max(1, Math.round(c.height * k));
  pc.getContext('2d')!.drawImage(c, 0, 0, pc.width, pc.height);
  const src = { jpeg: bytes(0.9), preview: pc.toDataURL('image/jpeg', 0.8), aspect: c.width / c.height, pxW: c.width, pxH: c.height };
  pc.width = pc.height = 0; c.width = c.height = 0;
  return src;
}

export async function loadPhoto(file: Blob): Promise<Source> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((res, rej) => {
      const i = new Image(); i.onload = () => res(i); i.onerror = () => rej(new Error('Could not read that image')); i.src = url;
    });
    const k = Math.min(1, MAX_PX / Math.max(img.naturalWidth, img.naturalHeight));
    const c = document.createElement('canvas');
    c.width = Math.round(img.naturalWidth * k); c.height = Math.round(img.naturalHeight * k);
    const ctx = c.getContext('2d')!;
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height);
    ctx.drawImage(img, 0, 0, c.width, c.height);
    return fromCanvas(c);
  } finally { URL.revokeObjectURL(url); }
}

// pdf.js is large, so it is only loaded when someone opens a PDF.
async function pdfjs() {
  const lib = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const worker = (await import('pdfjs-dist/legacy/build/pdf.worker.min.mjs?url')).default;
  lib.GlobalWorkerOptions.workerSrc = worker;
  return lib;
}

export async function openPdf(file: Blob) {
  const lib = await pdfjs();
  const doc = await lib.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
  return {
    pages: doc.numPages,
    async render(n: number): Promise<Source> {
      const page = await doc.getPage(n);
      const v1 = page.getViewport({ scale: 1 });
      const vp = page.getViewport({ scale: MAX_PX / Math.max(v1.width, v1.height) });
      const c = document.createElement('canvas');
      c.width = Math.round(vp.width); c.height = Math.round(vp.height);
      const ctx = c.getContext('2d')!;
      ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height);
      await page.render({ canvasContext: ctx, viewport: vp }).promise;
      return fromCanvas(c);
    },
    destroy: () => doc.destroy(),
  };
}
