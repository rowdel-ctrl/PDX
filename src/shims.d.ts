declare module 'pdfjs-dist/legacy/build/pdf.mjs' {
  export const GlobalWorkerOptions: { workerSrc: string };
  export function getDocument(src: { data: Uint8Array }): {
    promise: Promise<{
      numPages: number;
      getPage(n: number): Promise<{
        getViewport(o: { scale: number }): { width: number; height: number };
        render(o: { canvasContext: CanvasRenderingContext2D; viewport: unknown }): { promise: Promise<void> };
      }>;
      destroy(): void;
    }>;
  };
}
declare module 'pdfjs-dist/legacy/build/pdf.worker.min.mjs?url' { const url: string; export default url; }
declare module '*/vendor/pico.js' {
  const pico: {
    unpack_cascade(bytes: Int8Array): (r: number, c: number, s: number, pixels: Uint8Array, ldim: number) => number;
    run_cascade(image: { pixels: Uint8Array; nrows: number; ncols: number; ldim: number }, classify: unknown, params: { shiftfactor: number; minsize: number; maxsize: number; scalefactor: number }): number[][];
    cluster_detections(dets: number[][], iou: number): number[][];
  };
  export default pico;
}
declare module '*.bin?url' { const url: string; export default url; }
