import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Circle, Group, Image as KImage, Layer, Line, Rect, Stage, Text as KText, Transformer } from 'react-konva';
import Konva from 'konva';
import type { Frame, FrameBorder, Page, PageImage, PageText, Unit } from './types';
import { FULL, variantUrl } from './images';
import { borderRect, cropMarkSegments, frameCrop } from './layout';
import { fmt } from './units';
import type { Face } from './vision';

const SNAP_PX = 8;
const PT_MM = 25.4 / 72;
const GUIDE = '#FF2D95';
const PRIMARY = '#7C5CFF';
const TEAL = '#14B8A6';
export const PAGE_HIT = '__page__';

type Guides = { v: number[]; h: number[] };
type Size = { w: number; h: number };
type B = { x: number; y: number; w: number; h: number };
export interface SelBox { x: number; y: number; w: number; h: number }

function useVariant(file: string, rot: number, crop = FULL, maxPx = 1400) {
  const [img, setImg] = useState<HTMLImageElement | null>(null);
  useEffect(() => {
    if (!file) { setImg(null); return; }
    let on = true;
    variantUrl(file, rot, crop, maxPx).then((u) => { const i = new window.Image(); i.onload = () => on && setImg(i); i.src = u; }).catch(() => {});
    return () => { on = false; };
  }, [file, rot, crop, maxPx]);
  return img;
}

/** Snap a node's bounding box to page centre/edges/margins and other items. Moves the node. */
function snap(node: Konva.Node, others: B[], S: Size, m: number): Guides {
  const r = node.getClientRect({ skipStroke: true, skipShadow: true, relativeTo: node.getLayer() ?? undefined });
  const xs = [0, S.w / 2, S.w, m, S.w - m], ys = [0, S.h / 2, S.h, m, S.h - m];
  for (const o of others) { xs.push(o.x, o.x + o.w / 2, o.x + o.w); ys.push(o.y, o.y + o.h / 2, o.y + o.h); }
  const best = (edges: number[], cands: number[]) => {
    let d = SNAP_PX + 1, at = 0;
    for (const e of edges) for (const c of cands) if (Math.abs(c - e) < Math.abs(d)) { d = c - e; at = c; }
    return Math.abs(d) <= SNAP_PX ? { d, at } : null;
  };
  const sx = best([r.x, r.x + r.width / 2, r.x + r.width], xs);
  const sy = best([r.y, r.y + r.height / 2, r.y + r.height], ys);
  if (sx) node.x(node.x() + sx.d);
  if (sy) node.y(node.y() + sy.d);
  return { v: sx ? [sx.at] : [], h: sy ? [sy.at] : [] };
}

interface Ctx {
  S: Size; kz: number; m: number; unit: Unit; page: Page;
  selected: Set<string>; adjust: boolean; dropTarget: string | null; border: FrameBorder; cropMarks: boolean;
  reg: (id: string) => (n: Konva.Node | null) => void;
  pick: (id: string, how: 'tap' | 'drag') => void;
  dragStart: (id: string) => void;
  dragMove: (id: string, node: Konva.Node) => void;
  dragEnd: (id: string) => void;
  setHud: (s: string) => void;
  setGuides: (g: Guides) => void;
  faces: Face[]; onPickFace: (i: number) => void; hand: boolean;
  hovered: () => string | null;
}

function ImageItem({ im, c, onChange, onSwap }: {
  im: PageImage; c: Ctx; onChange: (p: Partial<PageImage>) => void;
  onSwap: (otherId: string, startCx: number, startCy: number) => void;
}) {
  const node = useRef<Konva.Image | null>(null);
  const { S, page, unit } = c;
  const img = useVariant(im.file, im.rot, im.crop);
  const start = useRef({ x: 0, y: 0 });
  const mmW = page.widthMm / S.w, mmH = page.heightMm / S.h;
  const hud = (n: Konva.Node) => c.setHud(`${fmt(n.width() * n.scaleX() * mmW, unit)} × ${fmt(n.height() * n.scaleY() * mmH, unit)} ${unit}  ·  ${Math.round(n.rotation())}°`);
  const regFn = c.reg(im.id);
  return (
    <KImage
      ref={(n) => { node.current = n; regFn(n); }} image={img ?? undefined}
      x={(im.x + im.w / 2) * S.w} y={(im.y + im.h / 2) * S.h} width={im.w * S.w} height={im.h * S.h}
      offsetX={(im.w * S.w) / 2} offsetY={(im.h * S.h) / 2} rotation={im.angle ?? 0} fill={img ? im.bg : '#C9D3FF'}
      draggable={!im.locked && !c.hand} onClick={() => c.pick(im.id, 'tap')} onTap={() => c.pick(im.id, 'tap')}
      onDragStart={(e) => { start.current = { x: e.target.x(), y: e.target.y() }; c.dragStart(im.id); }}
      onDragMove={(e) => { c.dragMove(im.id, e.target); hud(e.target); }}
      onDragEnd={(e) => {
        const n = e.target;
        if (!c.hovered() && page.layout !== '1' && page.layout !== 'free' && page.images.length > 1 && c.selected.size <= 1) {
          const hit = page.images.find((o) => o.id !== im.id && n.x() > o.x * S.w && n.x() < (o.x + o.w) * S.w && n.y() > o.y * S.h && n.y() < (o.y + o.h) * S.h);
          if (hit) { c.setGuides({ v: [], h: [] }); c.setHud(''); n.position(start.current); onSwap(hit.id, start.current.x / S.w, start.current.y / S.h); c.dragEnd('__none__'); return; }
        }
        c.dragEnd(im.id);
      }}
      onTransform={(e) => hud(e.target)}
      onTransformEnd={() => {
        c.setHud('');
        const n = node.current!;
        const w = n.width() * n.scaleX(), h = n.height() * n.scaleY();
        n.scaleX(1); n.scaleY(1);
        let a = n.rotation() % 360; if (a > 180) a -= 360; if (a <= -180) a += 360;
        onChange({ x: n.x() / S.w - w / S.w / 2, y: n.y() / S.h - h / S.h / 2, w: w / S.w, h: h / S.h, angle: Math.round(a * 10) / 10 });
      }}
    />
  );
}

function FrameItem({ f, c, onChange }: { f: Frame; c: Ctx; onChange: (p: Partial<Frame>) => void }) {
  const node = useRef<Konva.Group | null>(null);
  const { S, kz, page, unit, border } = c;
  const img = useVariant(f.file, f.rot, FULL, 1400);
  const selected = c.selected.has(f.id), single = c.selected.size === 1 && selected;
  const adjusting = c.adjust && single && !!img && !f.locked;
  const fw = f.w * S.w, fh = f.h * S.h;
  const crop = frameCrop(f, page.widthMm, page.heightMm);
  const pan = useRef({ px: 0, py: 0, cx: 0, cy: 0 });
  const dropTarget = c.dropTarget === f.id;
  const regFn = c.reg(f.id);
  const prev = useRef(f.file);
  // springy pop when a photo lands in the frame
  useEffect(() => {
    const n = node.current;
    if (f.file && prev.current !== f.file && n) {
      n.scale({ x: 1.06, y: 1.06 });
      new Konva.Tween({ node: n, scaleX: 1, scaleY: 1, duration: 0.38, easing: Konva.Easings.BackEaseOut }).play();
    }
    prev.current = f.file;
  }, [f.file]);
  return (
    <Group
      ref={(n) => { node.current = n; regFn(n); }}
      x={f.x * S.w + fw / 2} y={f.y * S.h + fh / 2} offsetX={fw / 2} offsetY={fh / 2} width={fw} height={fh}
      draggable={!adjusting && !f.locked && !c.hand} onClick={() => c.pick(f.id, 'tap')} onTap={() => c.pick(f.id, 'tap')}
      onDragStart={() => c.dragStart(f.id)}
      onDragMove={(e) => { c.dragMove(f.id, e.target); c.setHud(`${fmt(f.w * page.widthMm, unit)} × ${fmt(f.h * page.heightMm, unit)} ${unit}`); }}
      onDragEnd={() => c.dragEnd(f.id)}
    >
      {adjusting && img && (
        <KImage image={img} x={(-crop.x * fw) / crop.w} y={(-crop.y * fh) / crop.h} width={fw / crop.w} height={fh / crop.h} opacity={0.38}
          onClick={(e) => { const q = e.target.getRelativePointerPosition(); if (q) onChange({ cx: q.x / (fw / crop.w), cy: q.y / (fh / crop.h) }); }}
          onTap={(e) => { const q = e.target.getRelativePointerPosition(); if (q) onChange({ cx: q.x / (fw / crop.w), cy: q.y / (fh / crop.h) }); }} />
      )}
      <Rect width={fw} height={fh} cornerRadius={4} fill={img ? (f.bg ?? '#fff') : dropTarget ? 'rgba(20,184,166,.16)' : '#F5F4FF'} />
      {img && (
        <KImage
          image={img} width={fw} height={fh}
          crop={{ x: crop.x * img.width, y: crop.y * img.height, width: crop.w * img.width, height: crop.h * img.height }}
          draggable={adjusting}
          onClick={(e) => { if (!adjusting) return; const q = e.target.getRelativePointerPosition(); if (q) onChange({ cx: crop.x + (q.x / fw) * crop.w, cy: crop.y + (q.y / fh) * crop.h }); }}
          onTap={(e) => { if (!adjusting) return; const q = e.target.getRelativePointerPosition(); if (q) onChange({ cx: crop.x + (q.x / fw) * crop.w, cy: crop.y + (q.y / fh) * crop.h }); }}
          onDragStart={(e) => { const p = e.target.getStage()!.getPointerPosition()!; pan.current = { px: p.x, py: p.y, cx: f.cx, cy: f.cy }; }}
          onDragMove={(e) => {
            const p = e.target.getStage()!.getPointerPosition()!;
            e.target.position({ x: 0, y: 0 });
            onChange({ cx: pan.current.cx - ((p.x - pan.current.px) / fw) * crop.w, cy: pan.current.cy - ((p.y - pan.current.py) / fh) * crop.h });
          }}
          onDragEnd={(e) => e.target.position({ x: 0, y: 0 })}
        />
      )}
      {!img && (
        <KText width={fw} height={fh} align="center" verticalAlign="middle" fontSize={Math.max(9, Math.min(fw, fh) / 6)} fill="#7A7F94" listening={false}
          text={f.file ? '…' : `Drop photo\n${fmt(f.w * page.widthMm, unit)}×${fmt(f.h * page.heightMm, unit)} ${unit}`} />
      )}
      {c.cropMarks && img && cropMarkSegments(f.w * page.widthMm, f.h * page.heightMm).map((q, i) => (
        <Line key={i} points={q.map((v) => v * kz)} stroke="#333" strokeWidth={1} listening={false} />
      ))}
      {img && border.on && (() => {
        const r = borderRect(f.w * page.widthMm, f.h * page.heightMm, border.widthMm, border.place);
        return <Rect x={r.x * kz} y={r.y * kz} width={r.w * kz} height={r.h * kz} stroke={border.color} strokeWidth={Math.max(1, border.widthMm * kz)} listening={false} />;
      })()}
      {(dropTarget || !img) && (
        <Rect width={fw} height={fh} cornerRadius={4} listening={false} stroke={dropTarget ? TEAL : '#B9B4E6'} strokeWidth={dropTarget ? 2.5 : 1.2} dash={img ? undefined : [5, 4]} />
      )}
      {adjusting && (
        <>
          <Rect width={fw} height={fh} listening={false} stroke={PRIMARY} strokeWidth={2} />
          {[[0, 0], [fw, 0], [0, fh], [fw, fh]].map(([x, y], i) => <Circle key={i} x={x} y={y} radius={7} fill="#fff" stroke={PRIMARY} strokeWidth={2} listening={false} shadowColor="#000" shadowBlur={4} shadowOpacity={0.25} />)}
          {c.faces.map((fc, i) => {
            const cx = ((fc.x - crop.x) / crop.w) * fw, cy = ((fc.y - crop.y) / crop.h) * fh, r = Math.max(14, ((fc.size / crop.h) * fh) / 2);
            return (
              <Group key={i} x={cx} y={cy} onClick={() => c.onPickFace(i)} onTap={() => c.onPickFace(i)}>
                <Circle radius={r} fill="rgba(0,0,0,0.001)" stroke="#fff" strokeWidth={2} dash={[6, 4]} shadowColor="#000" shadowBlur={3} shadowOpacity={0.5} />
                <Circle y={-r} radius={10} fill={PRIMARY} />
                <KText text={String(i + 1)} x={-10} y={-r - 6} width={20} align="center" fontSize={11} fontStyle="bold" fill="#fff" listening={false} />
              </Group>
            );
          })}
        </>
      )}
    </Group>
  );
}

function TextItem({ t, c, onChange }: { t: PageText; c: Ctx; onChange: (p: Partial<PageText>) => void }) {
  const node = useRef<Konva.Text | null>(null);
  const { S, kz, page, unit } = c;
  const mmW = page.widthMm / S.w, mmH = page.heightMm / S.h;
  const regFn = c.reg(t.id);
  return (
    <KText
      ref={(n) => { node.current = n; regFn(n); }} text={t.text || ' '} x={t.x * S.w} y={t.y * S.h} rotation={t.angle ?? 0}
      fontSize={t.sizePt * PT_MM * kz} lineHeight={1} fontFamily="Helvetica, Arial, sans-serif" fontStyle={t.bold ? 'bold' : 'normal'} fill={t.color} wrap="none"
      draggable={!t.locked && !c.hand} onClick={() => c.pick(t.id, 'tap')} onTap={() => c.pick(t.id, 'tap')}
      onDragStart={() => c.dragStart(t.id)}
      onDragMove={(e) => { c.dragMove(t.id, e.target); c.setHud(`x ${fmt(e.target.x() * mmW, unit)}  y ${fmt(e.target.y() * mmH, unit)} ${unit}`); }}
      onDragEnd={() => c.dragEnd(t.id)}
      onTransform={(e) => c.setHud(`${Math.round(e.target.rotation())}°`)}
      onTransformEnd={() => {
        c.setHud('');
        const n = node.current!; let a = n.rotation() % 360; if (a > 180) a -= 360; if (a <= -180) a += 360;
        onChange({ angle: Math.round(a * 10) / 10, x: n.x() / S.w, y: n.y() / S.h });
      }}
    />
  );
}

export default function PageCanvas(p: {
  page: Page; pageNo: number; pageNumbers: boolean; unit: Unit; selectedIds: string[];
  onPick: (id: string, how: 'tap' | 'drag') => void; onBlank: () => void;
  onMoveMany: (moves: { id: string; x: number; y: number }[]) => void;
  onChange: (imgId: string, patch: Partial<PageImage>) => void;
  onChangeText: (id: string, patch: Partial<PageText>) => void;
  onChangeFrame: (id: string, patch: Partial<Frame>) => void;
  onSwap: (aId: string, bId: string, startCx: number, startCy: number) => void;
  adjust: boolean; dropTarget: string | null; border: FrameBorder; cropMarks: boolean;
  hitRef: React.MutableRefObject<((x: number, y: number) => string | null) | null>;
  onSelBox: (b: SelBox | null) => void; onDragging: (d: boolean) => void;
  hand?: boolean; padB?: number; reserve?: string; focusId?: string | null; faces: Face[]; onPickFace: (i: number) => void; onSnap: (imgId: string, frameId: string) => void;
  children?: React.ReactNode;
}) {
  const { page, selectedIds } = p;
  const wrap = useRef<HTMLDivElement>(null);
  const desk = useRef<HTMLDivElement>(null);
  const stageRef = useRef<Konva.Stage>(null);
  const trRef = useRef<Konva.Transformer>(null);
  const [avail, setAvail] = useState({ w: 300, h: 400 });
  const [zoom, setZoom] = useState(1);
  const [guides, setGuides] = useState<Guides>({ v: [], h: [] });
  const [hud, setHud] = useState('');
  const anchor = useRef<{ fx: number; fy: number; vx: number; vy: number } | null>(null);
  const zoomRef = useRef(1); zoomRef.current = zoom;
  const nodes = useRef(new Map<string, Konva.Node>());
  const regs = useRef(new Map<string, (n: Konva.Node | null) => void>());
  const starts = useRef(new Map<string, { x: number; y: number }>());
  const dragOrigin = useRef<{ id: string; x: number; y: number } | null>(null);
  const hapticKey = useRef('');
  const lastBox = useRef('');
  const [hover, setHover] = useState<string | null>(null);
  const hoverRef = useRef<string | null>(null);
  const pan1 = useRef<{ x: number; y: number } | null>(null);
  const handRef = useRef(false); handRef.current = !!p.hand;
  // Hand tool adds some room around the page so it can be moved even when it fits on screen.
  useLayoutEffect(() => { const el = desk.current; if (el) { el.scrollLeft = p.hand ? 120 : 0; el.scrollTop = p.hand ? 160 : 0; } }, [p.hand]);   // one-finger pan that started on empty page

  useEffect(() => {
    const el = desk.current!;
    const ro = new ResizeObserver(() => setAvail({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el); setAvail({ w: el.clientWidth, h: el.clientHeight });
    return () => ro.disconnect();
  }, []);

  useLayoutEffect(() => {
    const a = anchor.current, el = desk.current;
    if (a && el) { el.scrollLeft = a.fx * el.scrollWidth - a.vx; el.scrollTop = a.fy * el.scrollHeight - a.vy; }
  }, [zoom]);

  const zoomTo = (z: number, vx?: number, vy?: number) => {
    const el = desk.current!;
    const nz = Math.min(5, Math.max(1, z));
    const x = vx ?? el.clientWidth / 2, y = vy ?? el.clientHeight / 2;
    anchor.current = { fx: (el.scrollLeft + x) / el.scrollWidth, fy: (el.scrollTop + y) / el.scrollHeight, vx: x, vy: y };
    setZoom(nz);
  };

  // Crop mode: zoom in on the frame being cropped, and back out afterwards.
  const focusFrame = p.focusId ? page.frames.find((q) => q.id === p.focusId) : undefined;
  const autoZoomed = useRef(false);
  const focusKey = focusFrame ? `${focusFrame.id}|${avail.w}|${avail.h}` : '';
  useEffect(() => {
    if (!focusFrame) { if (autoZoomed.current) { autoZoomed.current = false; setZoom(1); } return; }
    const k = Math.max(0.01, Math.min((avail.w - 24) / page.widthMm, (avail.h - 10 - (p.padB ?? 24)) / page.heightMm));
    const fw1 = focusFrame.w * page.widthMm * k, fh1 = focusFrame.h * page.heightMm * k;
    const z = Math.min(5, Math.max(1, Math.min((avail.w - 56) / fw1, (avail.h - 56) / fh1)));
    autoZoomed.current = true; anchor.current = null; setZoom(z);
  }, [focusKey]);
  useLayoutEffect(() => {
    const el = desk.current;
    if (!el || !focusFrame || !autoZoomed.current) return;
    const cx = 12 + (focusFrame.x + focusFrame.w / 2) * S.w, cy = 10 + (focusFrame.y + focusFrame.h / 2) * S.h;
    el.scrollLeft = cx - el.clientWidth / 2; el.scrollTop = cy - el.clientHeight / 2;
  }, [zoom, focusKey]);

  // two-finger pinch to zoom and pan
  useEffect(() => {
    const el = desk.current!;
    let d0 = 0, z0 = 1, mid0 = { x: 0, y: 0 };
    const info = (e: TouchEvent) => {
      const a = e.touches[0], b = e.touches[1], r = el.getBoundingClientRect();
      return { d: Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY), x: (a.clientX + b.clientX) / 2 - r.left, y: (a.clientY + b.clientY) / 2 - r.top };
    };
    const start = (e: TouchEvent) => {
      if (e.touches.length === 1 && handRef.current) { pan1.current = { x: e.touches[0].clientX, y: e.touches[0].clientY }; return; }   // Hand tool: one finger moves the view
      if (e.touches.length !== 2) return;
      (Konva as unknown as { DD?: { node?: Konva.Node } }).DD?.node?.stopDrag();
      const i = info(e); d0 = i.d; z0 = zoomRef.current; mid0 = { x: i.x, y: i.y };
    };
    const move = (e: TouchEvent) => {
      if (e.touches.length === 1 && pan1.current) {
        // one finger on empty page, zoomed in: scroll the view
        e.preventDefault();
        const t = e.touches[0];
        el.scrollLeft -= t.clientX - pan1.current.x; el.scrollTop -= t.clientY - pan1.current.y;
        pan1.current = { x: t.clientX, y: t.clientY };
        return;
      }
      if (e.touches.length !== 2 || !d0) return;
      e.preventDefault();
      const i = info(e);
      el.scrollLeft -= i.x - mid0.x; el.scrollTop -= i.y - mid0.y; mid0 = { x: i.x, y: i.y };
      zoomTo(z0 * (i.d / d0), i.x, i.y);
    };
    const end = () => { d0 = 0; pan1.current = null; };
    el.addEventListener('touchstart', start, { passive: true });
    el.addEventListener('touchmove', move, { passive: false });
    el.addEventListener('touchend', end);
    return () => { el.removeEventListener('touchstart', start); el.removeEventListener('touchmove', move); el.removeEventListener('touchend', end); };
  }, []);

  useEffect(() => { const c = stageRef.current?.content; if (c) c.style.touchAction = 'none'; }, []);

  const padT = 10, padX = 12, padB = p.padB ?? 24;
  const kFit = Math.max(0.01, Math.min((avail.w - padX * 2) / page.widthMm, (avail.h - padT - padB) / page.heightMm));
  const kz = kFit * zoom;
  const S = { w: page.widthMm * kz, h: page.heightMm * kz };
  const m = page.marginMm * kz;
  const bw = page.border.on ? Math.max(1, page.border.widthMm * kz) : 0;
  const selected = new Set(selectedIds);

  const boxes = (skip: Set<string>): B[] => [
    ...page.images.filter((i) => !skip.has(i.id)).map((i) => ({ x: i.x * S.w, y: i.y * S.h, w: i.w * S.w, h: i.h * S.h })),
    ...page.frames.filter((f) => !skip.has(f.id)).map((f) => ({ x: f.x * S.w, y: f.y * S.h, w: f.w * S.w, h: f.h * S.h })),
  ];

  const reg = (id: string) => {
    let fn = regs.current.get(id);
    if (!fn) { fn = (n) => { if (n) nodes.current.set(id, n); else nodes.current.delete(id); }; regs.current.set(id, fn); }
    return fn;
  };

  const haptic = (g: Guides) => {
    const key = `${g.v}|${g.h}`;
    if ((g.v.length || g.h.length) && key !== hapticKey.current) navigator.vibrate?.(8);
    hapticKey.current = (g.v.length || g.h.length) ? key : '';
  };

  const ctx: Ctx = {
    S, kz, m, unit: p.unit, page, selected, adjust: p.adjust, dropTarget: p.dropTarget ?? hover, border: p.border, cropMarks: p.cropMarks,
    reg, setHud, setGuides, faces: p.faces, onPickFace: p.onPickFace, hand: !!p.hand, hovered: () => hoverRef.current,
    pick: p.onPick,
    dragStart: (id) => {
      p.onPick(id, 'drag');
      const group = selected.has(id) ? selectedIds : [id];
      starts.current = new Map();
      for (const sid of group) { const n = nodes.current.get(sid); if (n) starts.current.set(sid, { x: n.x(), y: n.y() }); }
      const n = nodes.current.get(id);
      dragOrigin.current = n ? { id, x: n.x(), y: n.y() } : null;
      p.onDragging(true);
    },
    dragMove: (id, node) => {
      if (page.images.some((i) => i.id === id) && starts.current.size <= 1) {
        // The frame under your finger wins (works even when the photo is much bigger than the frame); otherwise the frame under the photo's centre.
        const inside = (q: Frame, x: number, y: number) => x > q.x * S.w && x < (q.x + q.w) * S.w && y > q.y * S.h && y < (q.y + q.h) * S.h;
        const ptr = node.getStage()?.getRelativePointerPosition();
        const f = (ptr && [...page.frames].reverse().find((q) => inside(q, ptr.x, ptr.y))) || [...page.frames].reverse().find((q) => inside(q, node.x(), node.y()));
        const nid = f ? f.id : null;
        if (nid !== hoverRef.current) { hoverRef.current = nid; setHover(nid); if (nid) navigator.vibrate?.(10); }
      }
      if (starts.current.size <= 1) { const g = snap(node, boxes(new Set([id])), S, m); haptic(g); setGuides(g); return; }
      const o = starts.current.get(id)!;
      const dx = node.x() - o.x, dy = node.y() - o.y;
      for (const [sid, st] of starts.current) if (sid !== id) nodes.current.get(sid)?.position({ x: st.x + dx, y: st.y + dy });
      node.getLayer()?.batchDraw();
    },
    dragEnd: (id) => {
      setGuides({ v: [], h: [] }); setHud(''); p.onDragging(false); hapticKey.current = '';
      const snapTo = hoverRef.current;
      hoverRef.current = null; setHover(null);
      if (snapTo && starts.current.size <= 1 && page.images.some((i) => i.id === id)) { starts.current = new Map(); p.onSnap(id, snapTo); return; }
      const moves: { id: string; x: number; y: number }[] = [];
      for (const sid of starts.current.keys()) {
        const n = nodes.current.get(sid); if (!n) continue;
        const im = page.images.find((i) => i.id === sid) ?? page.frames.find((q) => q.id === sid);
        moves.push(im ? { id: sid, x: n.x() / S.w - im.w / 2, y: n.y() / S.h - im.h / 2 } : { id: sid, x: n.x() / S.w, y: n.y() / S.h });
      }
      starts.current = new Map();
      if (id !== '__none__' && moves.length) p.onMoveMany(moves);
    },
  };

  // attach the transformer to the selected nodes
  const only = selectedIds.length === 1 ? selectedIds[0] : null;
  const onlyImage = only ? page.images.find((i) => i.id === only) : undefined;
  const onlyText = only ? page.texts.find((t) => t.id === only) : undefined;
  useEffect(() => {
    const ns = selectedIds.map((id) => nodes.current.get(id)).filter((n): n is Konva.Node => !!n);
    trRef.current?.nodes(ns);
    trRef.current?.getLayer()?.batchDraw();
  });

  // tell the editor where the selection is, so its toolbar can sit next to it
  const reportBox = () => {
    const stage = stageRef.current, w = wrap.current;
    const ns = selectedIds.map((id) => nodes.current.get(id)).filter((n): n is Konva.Node => !!n);
    if (!stage || !w || !ns.length) { if (lastBox.current !== '') { lastBox.current = ''; p.onSelBox(null); } return; }
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const n of ns) { const r = n.getClientRect({ relativeTo: stage }); x0 = Math.min(x0, r.x); y0 = Math.min(y0, r.y); x1 = Math.max(x1, r.x + r.width); y1 = Math.max(y1, r.y + r.height); }
    const sr = stage.container().getBoundingClientRect(), wr = w.getBoundingClientRect();
    const box = { x: sr.left - wr.left + x0, y: sr.top - wr.top + y0, w: x1 - x0, h: y1 - y0 };
    const key = [box.x, box.y, box.w, box.h].map((v) => Math.round(v)).join(',');
    if (key !== lastBox.current) { lastBox.current = key; p.onSelBox(box); }
  };
  useEffect(() => { reportBox(); });
  useEffect(() => {
    const el = desk.current!;
    el.addEventListener('scroll', reportBox, { passive: true });
    return () => el.removeEventListener('scroll', reportBox);
  });

  p.hitRef.current = (cx, cy) => {
    const r = stageRef.current?.container().getBoundingClientRect();
    if (!r) return null;
    const x = cx - r.left, y = cy - r.top;
    const f = [...page.frames].reverse().find((q) => x >= q.x * S.w && x <= (q.x + q.w) * S.w && y >= q.y * S.h && y <= (q.y + q.h) * S.h);
    if (f) return f.id;
    return x >= 0 && y >= 0 && x <= S.w && y <= S.h ? PAGE_HIT : null;
  };

  const locked = selectedIds.some((id) => {
    const it = page.images.find((i) => i.id === id) ?? page.frames.find((f) => f.id === id) ?? page.texts.find((t) => t.id === id);
    return !!it?.locked;
  });
  const canResize = !!onlyImage && !locked;
  const canRotate = (!!onlyImage || !!onlyText) && !locked;
  const pnSize = 10 * PT_MM * kz;

  return (
    <div className="deskwrap" ref={wrap} style={{ marginBottom: p.reserve }}>
      <div className={'desk' + (zoom > 1 ? ' zoomed' : '')} ref={desk}>
        <div style={{ margin: 'auto', padding: `${padT + (p.hand ? 160 : 0)}px ${padX + (p.hand ? 120 : 0)}px ${padB + (p.hand ? 160 : 0)}px` }}>
          <div style={{ width: S.w, height: S.h, boxShadow: '0 2px 14px rgba(0,0,0,.25)' }}>
            <Stage ref={stageRef} width={S.w} height={S.h}>
              <Layer>
                <Rect width={S.w} height={S.h} fill={page.background} onClick={p.onBlank} onTap={p.onBlank}
                  onTouchStart={(e) => { const t = (e.evt as TouchEvent).touches[0]; if (t && zoomRef.current > 1) pan1.current = { x: t.clientX, y: t.clientY }; }} />
                {m > 2 && <Rect x={m} y={m} width={S.w - 2 * m} height={S.h - 2 * m} stroke="#8a93a6" dash={[5, 4]} strokeWidth={1} listening={false} />}
                {page.images.map((im) => <ImageItem key={im.id} im={im} c={ctx} onChange={(pt) => p.onChange(im.id, pt)} onSwap={(b, cx, cy) => p.onSwap(im.id, b, cx, cy)} />)}
                {page.frames.map((f) => <FrameItem key={f.id} f={f} c={ctx} onChange={(pt) => p.onChangeFrame(f.id, pt)} />)}
                {bw > 0 && <Rect x={bw / 2} y={bw / 2} width={S.w - bw} height={S.h - bw} stroke={page.border.color} strokeWidth={bw} listening={false} />}
                {page.texts.map((t) => <TextItem key={t.id} t={t} c={ctx} onChange={(pt) => p.onChangeText(t.id, pt)} />)}
                {p.pageNumbers && <KText text={String(p.pageNo)} x={0} width={S.w} align="center" y={S.h - 8 * kz - 0.85 * pnSize} fontSize={pnSize} lineHeight={1} fontFamily="Helvetica, Arial, sans-serif" fill="#333" listening={false} />}
              </Layer>
              <Layer>
                {guides.v.map((x) => <Line key={'v' + x} points={[x, 0, x, S.h]} stroke={GUIDE} strokeWidth={1} dash={[6, 4]} listening={false} />)}
                {guides.h.map((y) => <Line key={'h' + y} points={[0, y, S.w, y]} stroke={GUIDE} strokeWidth={1} dash={[6, 4]} listening={false} />)}
                <Transformer
                  ref={trRef} rotateEnabled={canRotate} resizeEnabled={canResize} keepRatio flipEnabled={false}
                  enabledAnchors={canResize ? ['top-left', 'top-right', 'bottom-left', 'bottom-right'] : []}
                  rotationSnaps={[0, 90, 180, 270]} rotationSnapTolerance={6} rotateAnchorOffset={26}
                  anchorSize={22} anchorCornerRadius={11} anchorStroke={PRIMARY} anchorFill="#fff" borderStroke={PRIMARY} borderDash={locked ? [4, 3] : undefined}
                  padding={onlyText ? 4 : 0} boundBoxFunc={(o, n) => (n.width < 20 || n.height < 20 ? o : n)}
                />
              </Layer>
            </Stage>
          </div>
        </div>
      </div>
      {p.children}
      {hud && <div className="hud">{hud}</div>}
      <div className="zoomctl">
        <button onClick={() => zoomTo(zoom / 1.5)} disabled={zoom <= 1} aria-label="Zoom out">−</button>
        <button onClick={() => zoomTo(1)} aria-label="Fit page" className="zval">{Math.round(zoom * 100)}%</button>
        <button onClick={() => zoomTo(zoom * 1.5)} disabled={zoom >= 5} aria-label="Zoom in">+</button>
      </div>
    </div>
  );
}
