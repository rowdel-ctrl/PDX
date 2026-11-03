import { useEffect, useState } from 'react';
import type { Page } from './types';
import { imageUrl } from './images';

function Img({ path, style }: { path: string; style: React.CSSProperties }) {
  const [u, setU] = useState('');
  useEffect(() => { let on = true; imageUrl(path).then((x) => on && setU(x)).catch(() => {}); return () => { on = false; }; }, [path]);
  return <div style={{ ...style, position: 'absolute', background: u ? `center / 100% 100% url(${u})` : '#C9D3FF' }} />;
}

/** Small CSS rendering of a page. Fits inside maxW x maxH. */
export default function PageThumb({ page, maxW, maxH }: { page: Page; maxW: number; maxH: number }) {
  const k = Math.min(maxW / page.widthMm, maxH / page.heightMm);
  const w = page.widthMm * k, h = page.heightMm * k;
  return (
    <div className="thumb" style={{ width: w, height: h, background: page.background, outline: page.border.on ? `${Math.max(1, page.border.widthMm * k)}px solid ${page.border.color}` : undefined, outlineOffset: page.border.on ? `-${Math.max(1, page.border.widthMm * k)}px` : undefined }}>
      {page.images.map((im) => (
        <Img key={im.id} path={im.file} style={{ left: im.x * w, top: im.y * h, width: im.w * w, height: im.h * h }} />
      ))}
    </div>
  );
}
