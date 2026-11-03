import { useEffect, useState } from 'react';
import type { Page } from './types';
import { variantUrl, FULL } from './images';
import { frameCrop } from './layout';

function Img({ im, style }: { im: Page['images'][number]; style: React.CSSProperties }) {
  const [u, setU] = useState('');
  useEffect(() => {
    let on = true;
    variantUrl(im.file, im.rot, im.crop, 300).then((x) => on && setU(x)).catch(() => {});
    return () => { on = false; };
  }, [im.file, im.rot, im.crop]);
  return <div style={{ ...style, position: 'absolute', background: u ? `center / 100% 100% url(${u})` : '#C9D3FF' }} />;
}

/** Small CSS rendering of a page. Fits inside maxW x maxH. */
export default function PageThumb({ page, maxW, maxH }: { page: Page; maxW: number; maxH: number }) {
  const k = Math.min(maxW / page.widthMm, maxH / page.heightMm);
  const w = page.widthMm * k, h = page.heightMm * k;
  const bw = Math.max(1, page.border.widthMm * k);
  return (
    <div className="thumb" style={{ width: w, height: h, background: page.background, outline: page.border.on ? `${bw}px solid ${page.border.color}` : undefined, outlineOffset: page.border.on ? `-${bw}px` : undefined }}>
      {page.images.map((im) => (
        <Img key={im.id} im={im} style={{ left: im.x * w, top: im.y * h, width: im.w * w, height: im.h * h }} />
      ))}
      {page.frames.map((f) => f.file
        ? <Img key={f.id} im={{ id: f.id, file: f.file, rot: f.rot, crop: frameCrop(f, page.widthMm, page.heightMm), aspect: f.aspect, x: 0, y: 0, w: 0, h: 0 }} style={{ left: f.x * w, top: f.y * h, width: f.w * w, height: f.h * h }} />
        : <div key={f.id} style={{ position: 'absolute', left: f.x * w, top: f.y * h, width: f.w * w, height: f.h * h, border: '1px dashed #8a93a6', boxSizing: 'border-box' }} />)}
      {page.texts.map((t) => (
        <div key={t.id} style={{ position: 'absolute', left: t.x * w, top: t.y * h, fontSize: t.sizePt * (25.4 / 72) * k, lineHeight: 1, color: t.color, fontWeight: t.bold ? 700 : 400, fontFamily: 'Helvetica, Arial, sans-serif', whiteSpace: 'nowrap' }}>{t.text}</div>
      ))}
    </div>
  );
}

/** Square-ish thumbnail of a whole photo. */
export function PhotoThumb({ file, size }: { file: string; size: number }) {
  const [u, setU] = useState('');
  useEffect(() => { let on = true; variantUrl(file, 0, FULL, 240).then((x) => on && setU(x)).catch(() => {}); return () => { on = false; }; }, [file]);
  return <div style={{ width: size, height: size, borderRadius: 8, background: u ? `center / cover url(${u})` : '#C9D3FF', pointerEvents: 'none' }} />;
}
