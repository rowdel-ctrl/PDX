import { useEffect, useRef, useState } from 'react';
import { useEd } from './editorContext';
import type { SelBox } from './PageCanvas';
import { Copy, Lock, RotR, Trash, Unlock } from './icons';

interface Btn { key: string; label: string; icon: React.ReactElement; on: () => void; active?: boolean; danger?: boolean; text?: string }

export function FloatingToolbar({ box }: { box: SelBox }) {
  const ed = useEd();
  const ref = useRef<HTMLDivElement>(null);
  const [parentW, setParentW] = useState(390);
  useEffect(() => { const w = ref.current?.parentElement?.clientWidth; if (w) setParentW(w); });
  const { selImage: im, selFrame: fr, sel } = ed;
  const multi = sel.length > 1;
  const locked = !!(im?.locked || fr?.locked || ed.selText?.locked) || (multi && sel.every((id) => {
    const o = ed.page.images.find((i) => i.id === id) ?? ed.page.frames.find((f) => f.id === id) ?? ed.page.texts.find((t) => t.id === id);
    return !!o?.locked;
  }));
  // quick actions only; everything else lives in the bottom bar
  const btns: Btn[] = [];
  if (im) btns.push({ key: 'rot', label: 'Rotate 90°', icon: <RotR />, on: () => ed.rotateImage(im, 1) });
  else if (fr?.file) btns.push({ key: 'rot', label: 'Rotate photo', icon: <RotR />, on: () => ed.rotateFrame(fr, 1) });
  btns.push({ key: 'dup', label: 'Duplicate', icon: <Copy />, on: ed.duplicateSel });
  btns.push({ key: 'lock', label: locked ? 'Unlock' : 'Lock', icon: locked ? <Unlock /> : <Lock />, on: ed.toggleLock, active: locked });
  btns.push({ key: 'del', label: 'Delete', icon: <Trash />, on: ed.deleteSel, danger: true });

  const half = (btns.length * 38 + 12) / 2;
  const cx = Math.min(parentW - half - 8, Math.max(half + 8, box.x + box.w / 2));
  const above = box.y - 84;           // leaves room for the rotate handle
  const top = above < 6 ? Math.min(box.y + box.h + 18, 9999) : above;

  return (
    <div ref={ref} className="ftb" style={{ left: cx, top }} role="toolbar" aria-label="Item actions">
      <div className="ftb-row">
        {btns.map((b) => (
          <button key={b.key} className={'ftb-btn' + (b.active ? ' on' : '') + (b.danger ? ' danger' : '')} aria-label={b.label} aria-pressed={b.active} onClick={b.on}>{b.icon}</button>
        ))}
      </div>
    </div>
  );
}
