import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Group, Image as KImage, Layer, Line, Rect, Stage, Text as KText, Transformer } from 'react-konva';
import Konva from 'konva';
import type { Frame, Page, PageImage, PageText, Unit } from './types';
import { FULL, variantUrl } from './images';
import { cropMarkSegments, frameCrop } from './layout';
import { fmt } from './units';

const SNAP_PX = 8;
const PT_MM = 25.4 / 72;
const GUIDE = '#FF2D95';

type Guides = { v: number[]; h: number[] };
type Size = { w: number; h: number };

function useImg(im: PageImage) {
  const [img, setImg] = useState<HTMLImageElement | null>(null);
  useEffect(() => {
    let on = true;
    variantUrl(im.file, im.rot, im.crop, 1400)
      .then((u) => { const i = new window.Image(); i.onload = () => on && setImg(i); i.src = u; }).catch(() => {});
    return () => { on = false; };
  }, [im.file, im.rot, im.crop]);
  return img;
}

/** Snap a node's box to page center/edges/margins and other items. Mutates node position. */
function snap(node: Konva.Node, others: { x: number; y: number; w: number; h: number }[], S: Size, m: number): Guides {
  const w = node.width() * node.scaleX(), h = node.height() * node.scaleY();
  const xs = [0, S.w / 2, S.w, m, S.w - m], ys = [0, S.h / 2, S.h, m, S.h - m];
  for (const o of others) { xs.push(o.x, o.x + o.w / 2, o.x + o.w); ys.push(o.y, o.y + o.h / 2, o.y + o.h); }
  const best = (edges: number[], cands: number[]) => {
    let d = SNAP_PX + 1, at = 0;
    for (const e of edges) for (const c of cands) if (Math.abs(c - e) < Math.abs(d)) { d = c - e; at = c; }
    return Math.abs(d) <= SNAP_PX ? { d, at } : null;
  };
  const sx = best([node.x(), node.x() + w / 2, node.x() + w], xs);
  const sy = best([node.y(), node.y() + h / 2, node.y() + h], ys);
  if (sx) node.x(node.x() + sx.d);
  if (sy) node.y(node.y() + sy.d);
  return { v: sx ? [sx.at] : [], h: sy ? [sy.at] : [] };
}

interface Common {
  S: Size; m: number; unit: Unit; page: Page; selected: boolean;
  onSelect: () => void; onTap: () => void; setGuides: (g: Guides) => void; setHud: (s: string) => void;
  others: { x: number; y: number; w: number; h: number }[];
}

function useSnapHaptics(setGuides: (g: Guides) => void) {
  const last = useRef('');
  return (g: Guides | null) => {
    const key = g ? `${g.v}|${g.h}` : '';
    if (g && key !== last.current && (g.v.length || g.h.length)) navigator.vibrate?.(8);
    last.current = key;
    setGuides(g ?? { v: [], h: [] });
  };
}

function Item({ im, c, onChange, onSwap }: {
  im: PageImage; c: Common; onChange: (p: Partial<PageImage>) => void;
  onSwap: (otherId: string, startCx: number, startCy: number) => void;
}) {
  const { S, m, unit, page } = c;
  const img = useImg(im);
  const ref = useRef<Konva.Image>(null);
  const tr = useRef<Konva.Transformer>(null);
  const start = useRef({ x: 0, y: 0 });
  const guides = useSnapHaptics(c.setGuides);
  useEffect(() => {
    if (c.selected && tr.current && ref.current) { tr.current.nodes([ref.current]); tr.current.getLayer()?.batchDraw(); }
  }, [c.selected, img]);
  const mmW = page.widthMm / S.w, mmH = page.heightMm / S.h;
  const hud = (n: Konva.Node) => c.setHud(`${fmt(n.width() * n.scaleX() * mmW, unit)} × ${fmt(n.height() * n.scaleY() * mmH, unit)} ${unit}  ·  x ${fmt(n.x() * mmW, unit)}  y ${fmt(n.y() * mmH, unit)}`);
  return (
    <>
      <KImage
        ref={ref} image={img ?? undefined} x={im.x * S.w} y={im.y * S.h} width={im.w * S.w} height={im.h * S.h}
        draggable onClick={c.onSelect} onTap={c.onSelect} fill="#C9D3FF"
        onDragStart={(e) => { c.onSelect(); start.current = { x: e.target.x(), y: e.target.y() }; }}
        onDragMove={(e) => { guides(snap(e.target, c.others, S, m)); hud(e.target); }}
        onDragEnd={(e) => {
          guides(null); c.setHud('');
          const n = e.target, cx = n.x() + n.width() / 2, cy = n.y() + n.height() / 2;
          if (page.layout !== '1' && page.images.length > 1) {
            const hit = page.images.find((o) => o.id !== im.id && cx > o.x * S.w && cx < (o.x + o.w) * S.w && cy > o.y * S.h && cy < (o.y + o.h) * S.h);
            if (hit) { n.position(start.current); onSwap(hit.id, (start.current.x + n.width() / 2) / S.w, (start.current.y + n.height() / 2) / S.h); return; }
          }
          onChange({ x: n.x() / S.w, y: n.y() / S.h });
        }}
        onTransform={(e) => hud(e.target)}
        onTransformEnd={() => {
          c.setHud('');
          const n = ref.current!;
          const w = n.width() * n.scaleX(), h = n.height() * n.scaleY();
          n.scaleX(1); n.scaleY(1);
          onChange({ x: n.x() / S.w, y: n.y() / S.h, w: w / S.w, h: h / S.h });
        }}
      />
      {c.selected && (
        <Transformer
          ref={tr} rotateEnabled={false} keepRatio flipEnabled={false}
          enabledAnchors={['top-left', 'top-right', 'bottom-left', 'bottom-right']}
          anchorSize={22} anchorCornerRadius={11} anchorStroke="#3D4DFF" anchorFill="#fff" borderStroke="#3D4DFF"
          boundBoxFunc={(o, n) => (n.width < 20 || n.height < 20 ? o : n)}
        />
      )}
    </>
  );
}


function FrameItem({ f, c, kz, adjust, dropTarget, cutLines, cropMarks, onChange }: {
  f: Frame; c: Common; kz: number; adjust: boolean; dropTarget: boolean; cutLines: boolean; cropMarks: boolean; onChange: (p: Partial<Frame>) => void;
}) {
  const { S, m, unit, page } = c;
  const [img, setImg] = useState<HTMLImageElement | null>(null);
  useEffect(() => {
    if (!f.file) { setImg(null); return; }
    let on = true;
    variantUrl(f.file, f.rot, FULL, 1400).then((u) => { const i = new window.Image(); i.onload = () => on && setImg(i); i.src = u; }).catch(() => {});
    return () => { on = false; };
  }, [f.file, f.rot]);
  const guides = useSnapHaptics(c.setGuides);
  const fw = f.w * S.w, fh = f.h * S.h;
  const crop = frameCrop(f, page.widthMm, page.heightMm);
  const mmW = page.widthMm / S.w, mmH = page.heightMm / S.h;
  const pan = useRef({ px: 0, py: 0, cx: 0, cy: 0 });
  const imgRef = useRef<Konva.Image>(null);
  return (
    <Group
      x={f.x * S.w} y={f.y * S.h} width={fw} height={fh}
      draggable={!adjust} onClick={c.onTap} onTap={c.onTap} onDragStart={c.onSelect}
      onDragMove={(e) => { guides(snap(e.target, c.others, S, m)); c.setHud(`${fmt(f.w * page.widthMm, unit)} × ${fmt(f.h * page.heightMm, unit)} ${unit}  ·  x ${fmt(e.target.x() * mmW, unit)}  y ${fmt(e.target.y() * mmH, unit)}`); }}
      onDragEnd={(e) => { guides(null); c.setHud(''); onChange({ x: e.target.x() / S.w, y: e.target.y() / S.h }); }}
    >
      <Rect width={fw} height={fh} fill={img ? '#fff' : dropTarget ? '#FFD0E6' : '#EEF0FF'} />
      {img && (
        <KImage
          ref={imgRef} image={img} width={fw} height={fh}
          crop={{ x: crop.x * img.width, y: crop.y * img.height, width: crop.w * img.width, height: crop.h * img.height }}
          draggable={adjust && c.selected}
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
        <KText width={fw} height={fh} align="center" verticalAlign="middle" fontSize={Math.max(9, Math.min(fw, fh) / 6)} fill="#5B6372" listening={false}
          text={f.file ? '…' : `Drop photo\n${fmt(f.w * page.widthMm, unit)}×${fmt(f.h * page.heightMm, unit)} ${unit}`} />
      )}
      {cropMarks && img && cropMarkSegments(f.w * page.widthMm, f.h * page.heightMm).map((q, i) => (
        <Line key={i} points={q.map((v) => v * kz)} stroke="#333" strokeWidth={1} listening={false} />
      ))}
      <Rect width={fw} height={fh} listening={false}
        stroke={dropTarget ? GUIDE : c.selected ? '#3D4DFF' : cutLines || !img ? '#8a93a6' : undefined}
        strokeWidth={dropTarget || c.selected ? 2 : 1} dash={img ? undefined : [5, 4]} />
    </Group>
  );
}

function TextItem({ t, c, kz, onChange }: { t: PageText; c: Common; kz: number; onChange: (p: Partial<PageText>) => void }) {
  const { S, m, unit, page } = c;
  const ref = useRef<Konva.Text>(null);
  const tr = useRef<Konva.Transformer>(null);
  const guides = useSnapHaptics(c.setGuides);
  useEffect(() => {
    if (c.selected && tr.current && ref.current) { tr.current.nodes([ref.current]); tr.current.getLayer()?.batchDraw(); }
  }, [c.selected, t.text, t.sizePt, t.bold]);
  const mmW = page.widthMm / S.w, mmH = page.heightMm / S.h;
  return (
    <>
      <KText
        ref={ref} text={t.text || ' '} x={t.x * S.w} y={t.y * S.h} fontSize={t.sizePt * PT_MM * kz} lineHeight={1}
        fontFamily="Helvetica, Arial, sans-serif" fontStyle={t.bold ? 'bold' : 'normal'} fill={t.color} wrap="none"
        draggable onClick={c.onSelect} onTap={c.onSelect} onDragStart={c.onSelect}
        onDragMove={(e) => { guides(snap(e.target, c.others, S, m)); c.setHud(`x ${fmt(e.target.x() * mmW, unit)}  y ${fmt(e.target.y() * mmH, unit)} ${unit}`); }}
        onDragEnd={(e) => { guides(null); c.setHud(''); onChange({ x: e.target.x() / S.w, y: e.target.y() / S.h }); }}
      />
      {c.selected && <Transformer ref={tr} rotateEnabled={false} resizeEnabled={false} borderStroke="#3D4DFF" borderDash={[4, 3]} padding={4} />}
    </>
  );
}

export default function PageCanvas({ page, pageNo, pageNumbers, unit, selectedId, onSelect, onChange, onChangeText, onSwap, onChangeFrame, adjust, dropTarget, cutLines, cropMarks, hitRef }: {
  page: Page; pageNo: number; pageNumbers: boolean; unit: Unit; selectedId: string | null;
  onSelect: (id: string | null, tap?: boolean) => void;
  onChange: (imgId: string, p: Partial<PageImage>) => void;
  onChangeText: (id: string, p: Partial<PageText>) => void;
  onSwap: (aId: string, bId: string, startCx: number, startCy: number) => void;
  onChangeFrame: (id: string, p: Partial<Frame>) => void;
  adjust: boolean; dropTarget: string | null; cutLines: boolean; cropMarks: boolean;
  hitRef: React.MutableRefObject<((x: number, y: number) => string | null) | null>;
}) {
  const desk = useRef<HTMLDivElement>(null);
  const stageRef = useRef<Konva.Stage>(null);
  const [avail, setAvail] = useState({ w: 300, h: 400 });
  const [zoom, setZoom] = useState(1);
  const [guides, setGuides] = useState<Guides>({ v: [], h: [] });
  const [hud, setHud] = useState('');
  const anchor = useRef<{ fx: number; fy: number; vx: number; vy: number } | null>(null);
  const zoomRef = useRef(1); zoomRef.current = zoom;

  useEffect(() => {
    const el = desk.current!;
    const ro = new ResizeObserver(() => setAvail({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el); setAvail({ w: el.clientWidth, h: el.clientHeight });
    return () => ro.disconnect();
  }, []);

  // Keep the point under the pinch/zoom centre in place after zooming.
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

  // Two-finger pinch to zoom, two-finger drag to pan.
  useEffect(() => {
    const el = desk.current!;
    let d0 = 0, z0 = 1, mid0 = { x: 0, y: 0 };
    const info = (e: TouchEvent) => {
      const a = e.touches[0], b = e.touches[1], r = el.getBoundingClientRect();
      return { d: Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY), x: (a.clientX + b.clientX) / 2 - r.left, y: (a.clientY + b.clientY) / 2 - r.top };
    };
    const start = (e: TouchEvent) => {
      if (e.touches.length !== 2) return;
      (Konva as unknown as { DD?: { node?: Konva.Node } }).DD?.node?.stopDrag();
      const i = info(e); d0 = i.d; z0 = zoomRef.current; mid0 = { x: i.x, y: i.y };
    };
    const move = (e: TouchEvent) => {
      if (e.touches.length !== 2 || !d0) return;
      e.preventDefault();
      const i = info(e);
      el.scrollLeft -= i.x - mid0.x; el.scrollTop -= i.y - mid0.y; mid0 = { x: i.x, y: i.y };
      zoomTo(z0 * (i.d / d0), i.x, i.y);
    };
    const end = () => { d0 = 0; };
    el.addEventListener('touchstart', start, { passive: true });
    el.addEventListener('touchmove', move, { passive: false });
    el.addEventListener('touchend', end);
    return () => { el.removeEventListener('touchstart', start); el.removeEventListener('touchmove', move); el.removeEventListener('touchend', end); };
  }, []);

  useEffect(() => { const c = stageRef.current?.content; if (c) c.style.touchAction = 'none'; }, []);

  const pad = 24;
  const kFit = Math.max(0.01, Math.min((avail.w - pad * 2) / page.widthMm, (avail.h - pad * 2) / page.heightMm));
  const kz = kFit * zoom;
  const S = { w: page.widthMm * kz, h: page.heightMm * kz };
  const m = page.marginMm * kz;
  const bw = page.border.on ? Math.max(1, page.border.widthMm * kz) : 0;
  const boxes = (skip: string) => [
    ...page.images.filter((i) => i.id !== skip).map((i) => ({ x: i.x * S.w, y: i.y * S.h, w: i.w * S.w, h: i.h * S.h })),
    ...page.frames.filter((f) => f.id !== skip).map((f) => ({ x: f.x * S.w, y: f.y * S.h, w: f.w * S.w, h: f.h * S.h })),
  ];
  hitRef.current = (cx, cy) => {
    const r = stageRef.current?.container().getBoundingClientRect();
    if (!r) return null;
    const x = cx - r.left, y = cy - r.top;
    const f = [...page.frames].reverse().find((q) => x >= q.x * S.w && x <= (q.x + q.w) * S.w && y >= q.y * S.h && y <= (q.y + q.h) * S.h);
    return f ? f.id : null;
  };
  const common = (id: string): Common => ({
    S, m, unit, page, selected: id === selectedId, onSelect: () => onSelect(id), onTap: () => onSelect(id, true), setGuides, setHud, others: boxes(id),
  });
  const pnSize = 10 * PT_MM * kz;

  return (
    <div className="deskwrap">
      <div className={'desk' + (zoom > 1 ? ' zoomed' : '')} ref={desk}>
        <div style={{ margin: 'auto', padding: pad }}>
          <div style={{ width: S.w, height: S.h, boxShadow: '0 2px 14px rgba(0,0,0,.25)' }}>
            <Stage ref={stageRef} width={S.w} height={S.h}
              onMouseDown={(e) => e.target === e.target.getStage() && onSelect(null)}
              onTouchStart={(e) => e.target === e.target.getStage() && onSelect(null)}>
              <Layer>
                <Rect width={S.w} height={S.h} fill={page.background} onClick={() => onSelect(null)} onTap={() => onSelect(null)} />
                {m > 2 && <Rect x={m} y={m} width={S.w - 2 * m} height={S.h - 2 * m} stroke="#8a93a6" dash={[5, 4]} strokeWidth={1} listening={false} />}
                {page.images.map((im) => (
                  <Item key={im.id} im={im} c={common(im.id)} onChange={(p) => onChange(im.id, p)} onSwap={(b, cx, cy) => onSwap(im.id, b, cx, cy)} />
                ))}
                {page.frames.map((f) => (
                  <FrameItem key={f.id} f={f} c={common(f.id)} kz={kz} adjust={adjust} dropTarget={dropTarget === f.id} cutLines={cutLines} cropMarks={cropMarks} onChange={(p) => onChangeFrame(f.id, p)} />
                ))}
                {bw > 0 && <Rect x={bw / 2} y={bw / 2} width={S.w - bw} height={S.h - bw} stroke={page.border.color} strokeWidth={bw} listening={false} />}
                {page.texts.map((t) => <TextItem key={t.id} t={t} kz={kz} c={common(t.id)} onChange={(p) => onChangeText(t.id, p)} />)}
                {pageNumbers && <KText text={String(pageNo)} x={0} width={S.w} align="center" y={S.h - 8 * kz - 0.85 * pnSize} fontSize={pnSize} lineHeight={1} fontFamily="Helvetica, Arial, sans-serif" fill="#333" listening={false} />}
              </Layer>
              <Layer listening={false}>
                {guides.v.map((x) => <Line key={'v' + x} points={[x, 0, x, S.h]} stroke={GUIDE} strokeWidth={1} dash={[6, 4]} />)}
                {guides.h.map((y) => <Line key={'h' + y} points={[0, y, S.w, y]} stroke={GUIDE} strokeWidth={1} dash={[6, 4]} />)}
              </Layer>
            </Stage>
          </div>
        </div>
      </div>
      {hud && <div className="hud">{hud}</div>}
      <div className="zoomctl">
        <button onClick={() => zoomTo(zoom / 1.5)} disabled={zoom <= 1} aria-label="Zoom out">−</button>
        <button onClick={() => zoomTo(1)} aria-label="Fit page" className="zval">{Math.round(zoom * 100)}%</button>
        <button onClick={() => zoomTo(zoom * 1.5)} disabled={zoom >= 5} aria-label="Zoom in">+</button>
      </div>
    </div>
  );
}
