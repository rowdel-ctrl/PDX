import type { Frame, Page, PageImage, PageText } from './types';

export type Kind = 'image' | 'frame' | 'text';
export type Box = { x: number; y: number; w: number; h: number };
export type AlignMode = 'left' | 'center' | 'right' | 'top' | 'middle' | 'bottom';

let ctx: CanvasRenderingContext2D | null = null;
/** Approximate size of a text item in mm (Helvetica, one line). */
export function textSizeMm(t: PageText): { w: number; h: number } {
  ctx ??= document.createElement('canvas').getContext('2d');
  const mm = (t.sizePt * 25.4) / 72;
  let w = mm * 0.55 * (t.text.length || 1);
  if (ctx) { ctx.font = `${t.bold ? 'bold ' : ''}100px Helvetica, Arial, sans-serif`; w = (ctx.measureText(t.text || ' ').width / 100) * mm; }
  return { w, h: mm };
}

/** Axis-aligned bounds of a w x h rect rotated by `deg` about the point (px, py) given in rect-local coords. */
function rotated(x: number, y: number, w: number, h: number, deg: number, px: number, py: number): Box {
  const a = (deg * Math.PI) / 180, c = Math.cos(a), s = Math.sin(a);
  const pts = [[0, 0], [w, 0], [w, h], [0, h]].map(([qx, qy]) => {
    const dx = qx - px, dy = qy - py;
    return [x + px + dx * c - dy * s, y + py + dx * s + dy * c];
  });
  const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
  const x0 = Math.min(...xs), y0 = Math.min(...ys);
  return { x: x0, y: y0, w: Math.max(...xs) - x0, h: Math.max(...ys) - y0 };
}

export type AnyItem = PageImage | Frame | PageText;

export function kindOf(page: Page, id: string): Kind | null {
  if (page.images.some((i) => i.id === id)) return 'image';
  if (page.frames.some((f) => f.id === id)) return 'frame';
  if (page.texts.some((t) => t.id === id)) return 'text';
  return null;
}

export function findItem(page: Page, id: string): { kind: Kind; item: AnyItem } | null {
  const im = page.images.find((i) => i.id === id); if (im) return { kind: 'image', item: im };
  const f = page.frames.find((q) => q.id === id); if (f) return { kind: 'frame', item: f };
  const t = page.texts.find((q) => q.id === id); if (t) return { kind: 'text', item: t };
  return null;
}

/** Bounds in mm (includes rotation). */
export function itemBox(page: Page, kind: Kind, item: AnyItem): Box {
  const W = page.widthMm, H = page.heightMm;
  if (kind === 'text') {
    const t = item as PageText, sz = textSizeMm(t);
    return rotated(t.x * W, t.y * H, sz.w, sz.h, t.angle ?? 0, 0, 0);
  }
  const o = item as PageImage | Frame;
  const angle = kind === 'image' ? (o as PageImage).angle ?? 0 : 0;
  return rotated(o.x * W, o.y * H, o.w * W, o.h * H, angle, (o.w * W) / 2, (o.h * H) / 2);
}

export function isLocked(page: Page, id: string): boolean {
  const f = findItem(page, id);
  return !!f && !!(f.item as { locked?: boolean }).locked;
}

/** Shift an item by dx, dy mm. */
function shifted<T extends AnyItem>(item: T, page: Page, dx: number, dy: number): T {
  return { ...item, x: item.x + dx / page.widthMm, y: item.y + dy / page.heightMm };
}

export function mapSelected(page: Page, ids: Set<string>, fn: (kind: Kind, item: AnyItem) => AnyItem): Page {
  return {
    ...page,
    images: page.images.map((i) => (ids.has(i.id) ? (fn('image', i) as PageImage) : i)),
    frames: page.frames.map((f) => (ids.has(f.id) ? (fn('frame', f) as Frame) : f)),
    texts: page.texts.map((t) => (ids.has(t.id) ? (fn('text', t) as PageText) : t)),
  };
}

/** Align one item to the page, or several items to each other. */
export function alignItems(page: Page, ids: string[], mode: AlignMode): Page {
  const refs = ids.map((id) => findItem(page, id)).filter((r): r is { kind: Kind; item: AnyItem } => !!r && !(r.item as { locked?: boolean }).locked);
  if (!refs.length) return page;
  const boxes = refs.map((r) => itemBox(page, r.kind, r.item));
  const all = ids.length === 1 ? [{ x: 0, y: 0, w: page.widthMm, h: page.heightMm }] : boxes;
  const x0 = Math.min(...all.map((b) => b.x)), x1 = Math.max(...all.map((b) => b.x + b.w));
  const y0 = Math.min(...all.map((b) => b.y)), y1 = Math.max(...all.map((b) => b.y + b.h));
  const delta = new Map<string, [number, number]>();
  refs.forEach((r, i) => {
    const b = boxes[i];
    let dx = 0, dy = 0;
    if (mode === 'left') dx = x0 - b.x;
    if (mode === 'center') dx = (x0 + x1) / 2 - (b.x + b.w / 2);
    if (mode === 'right') dx = x1 - (b.x + b.w);
    if (mode === 'top') dy = y0 - b.y;
    if (mode === 'middle') dy = (y0 + y1) / 2 - (b.y + b.h / 2);
    if (mode === 'bottom') dy = y1 - (b.y + b.h);
    delta.set((r.item as { id: string }).id, [dx, dy]);
  });
  return mapSelected(page, new Set(delta.keys()), (_k, item) => { const d = delta.get((item as { id: string }).id)!; return shifted(item, page, d[0], d[1]); });
}

/** Equal gaps between three or more items. */
export function distributeItems(page: Page, ids: string[], axis: 'x' | 'y'): Page {
  const refs = ids.map((id) => findItem(page, id)).filter((r): r is { kind: Kind; item: AnyItem } => !!r && !(r.item as { locked?: boolean }).locked);
  if (refs.length < 3) return page;
  const items = refs.map((r) => ({ id: (r.item as { id: string }).id, b: itemBox(page, r.kind, r.item) }));
  const pos = (b: Box) => (axis === 'x' ? b.x : b.y), size = (b: Box) => (axis === 'x' ? b.w : b.h);
  items.sort((a, b) => pos(a.b) - pos(b.b));
  const start = pos(items[0].b), end = Math.max(...items.map((i) => pos(i.b) + size(i.b)));
  const gap = (end - start - items.reduce((s, i) => s + size(i.b), 0)) / (items.length - 1);
  const delta = new Map<string, number>();
  let cur = start;
  for (const it of items) { delta.set(it.id, cur - pos(it.b)); cur += size(it.b) + gap; }
  return mapSelected(page, new Set(delta.keys()), (_k, item) => {
    const d = delta.get((item as { id: string }).id)!;
    return axis === 'x' ? shifted(item, page, d, 0) : shifted(item, page, 0, d);
  });
}

/** Move selected items to the front or back of their own group. */
export function reorder(page: Page, id: string, to: 'front' | 'back'): Page {
  const mv = <T extends { id: string }>(list: T[]): T[] => {
    const it = list.find((x) => x.id === id);
    if (!it) return list;
    const rest = list.filter((x) => x.id !== id);
    return to === 'front' ? [...rest, it] : [it, ...rest];
  };
  return { ...page, images: mv(page.images), frames: mv(page.frames), texts: mv(page.texts) };
}
