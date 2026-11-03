import { useEffect, useRef, useState } from 'react';
import { Image as KImage, Layer, Rect, Stage, Transformer } from 'react-konva';
import type Konva from 'konva';
import type { Page, PageImage } from './types';
import { imageUrl } from './images';

function useImg(path: string) {
  const [img, setImg] = useState<HTMLImageElement | null>(null);
  useEffect(() => {
    let on = true;
    imageUrl(path).then((u) => { const i = new window.Image(); i.onload = () => on && setImg(i); i.src = u; }).catch(() => {});
    return () => { on = false; };
  }, [path]);
  return img;
}

function Item({ im, S, selected, onSelect, onChange }: {
  im: PageImage; S: { w: number; h: number }; selected: boolean;
  onSelect: () => void; onChange: (p: Partial<PageImage>) => void;
}) {
  const img = useImg(im.file);
  const ref = useRef<Konva.Image>(null);
  const tr = useRef<Konva.Transformer>(null);
  useEffect(() => {
    if (selected && tr.current && ref.current) { tr.current.nodes([ref.current]); tr.current.getLayer()?.batchDraw(); }
  }, [selected, img]);
  return (
    <>
      <KImage
        ref={ref} image={img ?? undefined} x={im.x * S.w} y={im.y * S.h} width={im.w * S.w} height={im.h * S.h}
        draggable onClick={onSelect} onTap={onSelect} onDragStart={onSelect}
        fill="#C9D3FF"
        onDragEnd={(e) => onChange({ x: e.target.x() / S.w, y: e.target.y() / S.h })}
        onTransformEnd={() => {
          const n = ref.current!;
          const w = n.width() * n.scaleX(), h = n.height() * n.scaleY();
          n.scaleX(1); n.scaleY(1);
          onChange({ x: n.x() / S.w, y: n.y() / S.h, w: w / S.w, h: h / S.h });
        }}
      />
      {selected && (
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

export default function PageCanvas({ page, selectedId, onSelect, onChange }: {
  page: Page; selectedId: string | null; onSelect: (id: string | null) => void;
  onChange: (imgId: string, p: Partial<PageImage>) => void;
}) {
  const box = useRef<HTMLDivElement>(null);
  const [avail, setAvail] = useState({ w: 300, h: 400 });
  useEffect(() => {
    const el = box.current!;
    const ro = new ResizeObserver(() => setAvail({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el); setAvail({ w: el.clientWidth, h: el.clientHeight });
    return () => ro.disconnect();
  }, []);
  const pad = 24;
  const k = Math.max(0.01, Math.min((avail.w - pad * 2) / page.widthMm, (avail.h - pad * 2) / page.heightMm));
  const S = { w: page.widthMm * k, h: page.heightMm * k };
  const m = page.marginMm * k;
  const bw = page.border.on ? Math.max(1, page.border.widthMm * k) : 0;
  return (
    <div className="desk" ref={box}>
      <div style={{ width: S.w, height: S.h, boxShadow: '0 2px 14px rgba(0,0,0,.25)' }}>
        <Stage width={S.w} height={S.h} onMouseDown={(e) => e.target === e.target.getStage() && onSelect(null)} onTouchStart={(e) => e.target === e.target.getStage() && onSelect(null)}>
          <Layer>
            <Rect width={S.w} height={S.h} fill={page.background} onClick={() => onSelect(null)} onTap={() => onSelect(null)} />
            {m > 2 && <Rect x={m} y={m} width={S.w - 2 * m} height={S.h - 2 * m} stroke="#8a93a6" dash={[5, 4]} strokeWidth={1} listening={false} />}
            {page.images.map((im) => (
              <Item key={im.id} im={im} S={S} selected={im.id === selectedId} onSelect={() => onSelect(im.id)} onChange={(p) => onChange(im.id, p)} />
            ))}
            {bw > 0 && <Rect x={bw / 2} y={bw / 2} width={S.w - bw} height={S.h - bw} stroke={page.border.color} strokeWidth={bw} listening={false} />}
          </Layer>
        </Stage>
      </div>
    </div>
  );
}
