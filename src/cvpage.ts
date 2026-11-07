// Page finding with OpenCV (runs offline inside the app). Returns several likely pages, best first.
import { canvasOf, detectCorners, type Pt } from './scanlib';

let loading: Promise<any> | null = null;
export function loadCv(): Promise<any> {
  loading ??= new Promise((resolve, reject) => {
    const w = window as any;
    const ready = () => {
      const c = w.cv;
      if (c && typeof c.then === 'function') { c.then((m: any) => resolve(m)); return; } // newer builds resolve with the module
      if (c?.Mat) { resolve(c); return; }
      if (c) { c.onRuntimeInitialized = () => resolve(c); return; }
      reject(new Error('Page finder did not start'));
    };
    if (w.cv) { ready(); return; }
    const s = document.createElement('script');
    s.src = new URL('cv/opencv.js', document.baseURI).href;
    s.onload = ready; s.onerror = () => reject(new Error('Could not load the page finder'));
    document.head.appendChild(s);
  });
  loading.catch(() => { loading = null; });
  return loading;
}

const area = (q: Pt[]) => Math.abs(q.reduce((s, p, i) => s + (p.x * q[(i + 1) % 4].y - q[(i + 1) % 4].x * p.y), 0)) / 2;
function order(p: Pt[]): Pt[] {
  const s = p.map((q) => q.x + q.y), d = p.map((q) => q.x - q.y);
  return [p[s.indexOf(Math.min(...s))], p[d.indexOf(Math.max(...d))], p[s.indexOf(Math.max(...s))], p[d.indexOf(Math.min(...d))]];
}
function rectish(q: Pt[], aspect: number): boolean {
  for (let i = 0; i < 4; i++) {
    const a = q[(i + 3) % 4], b = q[i], c = q[(i + 1) % 4];
    const ux = (a.x - b.x) * aspect, uy = a.y - b.y, vx = (c.x - b.x) * aspect, vy = c.y - b.y;
    const l = Math.hypot(ux, uy) * Math.hypot(vx, vy); if (l < 1e-6) return false;
    if (Math.abs((ux * vx + uy * vy) / l) > 0.42) return false; // corners must be near 90 degrees
  }
  return true;
}

export async function findPages(src: HTMLCanvasElement): Promise<Pt[][]> {
  const out: { q: Pt[]; score: number }[] = [];
  try {
    const cv = await loadCv();
    const k = 520 / Math.max(src.width, src.height);
    const W = Math.max(8, Math.round(src.width * k)), H = Math.max(8, Math.round(src.height * k));
    const sm = canvasOf(W, H); sm.getContext('2d')!.drawImage(src, 0, 0, W, H);
    const rgba = cv.imread(sm), gray = new cv.Mat(), blur = new cv.Mat();
    cv.cvtColor(rgba, gray, cv.COLOR_RGBA2GRAY); cv.GaussianBlur(gray, blur, new cv.Size(5, 5), 0);
    const kernel = cv.getStructuringElement(cv.MORPH_RECT, new cv.Size(5, 5));
    const tot = W * H, aspect = W / H;
    const strategies: ((m: any) => void)[] = [
      (m) => { cv.Canny(blur, m, 40, 120); cv.morphologyEx(m, m, cv.MORPH_CLOSE, kernel); },
      (m) => { cv.Canny(blur, m, 90, 220); cv.dilate(m, m, kernel); },
      (m) => { cv.threshold(blur, m, 0, 255, cv.THRESH_BINARY | cv.THRESH_OTSU); },
      (m) => { cv.threshold(blur, m, 0, 255, cv.THRESH_BINARY_INV | cv.THRESH_OTSU); },
      (m) => { cv.adaptiveThreshold(blur, m, 255, cv.ADAPTIVE_THRESH_GAUSSIAN_C, cv.THRESH_BINARY_INV, 31, 8); cv.morphologyEx(m, m, cv.MORPH_CLOSE, kernel); },
    ];
    for (const run of strategies) {
      const m = new cv.Mat(); run(m);
      const cs = new cv.MatVector(), hi = new cv.Mat();
      cv.findContours(m, cs, hi, cv.RETR_LIST, cv.CHAIN_APPROX_SIMPLE);
      for (let i = 0; i < cs.size(); i++) {
        const cnt = cs.get(i); const a = cv.contourArea(cnt);
        if (a > tot * 0.07 && a < tot * 0.995) {
          const hull = new cv.Mat(); cv.convexHull(cnt, hull, false, true);
          const peri = cv.arcLength(hull, true); const ap = new cv.Mat();
          for (const e of [0.015, 0.025, 0.04, 0.06, 0.09]) { cv.approxPolyDP(hull, ap, e * peri, true); if (ap.rows <= 4) break; }
          if (ap.rows === 4) {
            const d = ap.data32S; const raw: Pt[] = [0, 1, 2, 3].map((j) => ({ x: Math.min(1, Math.max(0, d[j * 2] / W)), y: Math.min(1, Math.max(0, d[j * 2 + 1] / H)) }));
            const q = order(raw); const qa = area(q);
            if (qa > 0.07 && new Set(q.map((p) => p.x + ',' + p.y)).size === 4 && rectish(q, aspect)) {
              const dup = out.some((o) => o.q.every((p, j) => Math.abs(p.x - q[j].x) < 0.03 && Math.abs(p.y - q[j].y) < 0.03));
              if (!dup) { const edge = q.every((p) => p.x < 0.02 || p.x > 0.98 || p.y < 0.02 || p.y > 0.98); out.push({ q, score: qa * (a / (qa * tot)) * (edge ? 0.35 : 1) * (qa > 0.9 ? 0.6 : 1) }); } // big and well filled by the outline
            }
          }
          hull.delete(); ap.delete();
        }
        cnt.delete();
      }
      m.delete(); cs.delete(); hi.delete();
    }
    rgba.delete(); gray.delete(); blur.delete(); kernel.delete();
  } catch { /* fall back below */ }
  out.sort((a, b) => b.score - a.score);
  const list = out.slice(0, 6).map((o) => o.q);
  const old = detectCorners(src);
  if (old && !list.some((q) => q.every((p, j) => Math.abs(p.x - old[j].x) < 0.04 && Math.abs(p.y - old[j].y) < 0.04))) list.push(old);
  return list;
}
