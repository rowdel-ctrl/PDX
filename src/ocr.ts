// Offline text recognition (English). The engine and language data ship inside the app.
export interface OcrWord { text: string; x0: number; y0: number; x1: number; y1: number }
export interface OcrPage { text: string; words: OcrWord[]; w: number; h: number }

let worker: Promise<any> | null = null;
async function get() {
  if (!worker) {
    worker = (async () => {
      const { createWorker } = await import('tesseract.js');
      const base = new URL('ocr/', document.baseURI).href;
      return createWorker('eng', 1, { workerPath: base + 'worker.min.js', corePath: base, langPath: base, gzip: true, workerBlobURL: false } as never);
    })();
    worker.catch(() => { worker = null; });
  }
  return worker;
}

export async function recognize(c: HTMLCanvasElement): Promise<OcrPage> {
  const w = await get();
  const r = await w.recognize(c);
  const words: OcrWord[] = (r.data.words ?? []).filter((x: any) => x.text?.trim()).map((x: any) => ({ text: x.text, x0: x.bbox.x0, y0: x.bbox.y0, x1: x.bbox.x1, y1: x.bbox.y1 }));
  return { text: (r.data.text ?? '').trim(), words, w: c.width, h: c.height };
}

export async function stopOcr() { const w = worker; worker = null; try { (await w)?.terminate(); } catch { /* ignore */ } }
