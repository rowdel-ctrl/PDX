import { useEffect, useRef, useState } from 'react';
import { useEd } from './editorContext';
import type { SelBox } from './PageCanvas';
import { AlignB, AlignC, AlignL, AlignM, AlignR, AlignT, Close, Copy, Crop, DistH, DistV, Edit, Layers, Lock, Move, More, RotR, Trash, Tune, Unlock } from './icons';

interface Btn { key: string; label: string; icon: React.ReactElement; on: () => void; active?: boolean; danger?: boolean }

export function FloatingToolbar({ box, onPosition }: { box: SelBox; onPosition: () => void }) {
  const ed = useEd();
  const [menu, setMenu] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const [parentW, setParentW] = useState(390);
  useEffect(() => { setMenu(false); }, [ed.sel.join(',')]);
  useEffect(() => { const w = ref.current?.parentElement?.clientWidth; if (w) setParentW(w); });
  const { selImage: im, selFrame: fr, selText: tx, sel } = ed;
  const multi = sel.length > 1;
  const locked = !!(im?.locked || fr?.locked || tx?.locked) || (multi && sel.every((id) => {
    const o = ed.page.images.find((i) => i.id === id) ?? ed.page.frames.find((f) => f.id === id) ?? ed.page.texts.find((t) => t.id === id);
    return !!o?.locked;
  }));
  const btns: Btn[] = [];
  if (multi) btns.push({ key: 'pos', label: 'Position and align', icon: <AlignC />, on: onPosition });
  else if (im) {
    btns.push({ key: 'rot', label: 'Rotate 90°', icon: <RotR />, on: () => ed.rotateImage(im, 1) });
    btns.push({ key: 'edit', label: 'Crop and edit', icon: <Crop />, on: () => ed.setPanel(ed.panel === 'item' ? null : 'item'), active: ed.panel === 'item' });
  } else if (fr) {
    if (fr.file) btns.push({ key: 'move', label: ed.adjust ? 'Done moving photo' : 'Move photo in frame', icon: <Move />, on: () => ed.setAdjust(!ed.adjust), active: ed.adjust });
    if (fr.file) btns.push({ key: 'rot', label: 'Rotate photo', icon: <RotR />, on: () => ed.rotateFrame(fr, 1) });
    btns.push({ key: 'edit', label: 'Frame options', icon: <Tune />, on: () => ed.setPanel(ed.panel === 'item' ? null : 'item'), active: ed.panel === 'item' });
  } else if (tx) btns.push({ key: 'edit', label: 'Edit text', icon: <Edit />, on: () => ed.setPanel('text') });
  btns.push({ key: 'dup', label: 'Duplicate', icon: <Copy />, on: ed.duplicateSel });
  btns.push({ key: 'lock', label: locked ? 'Unlock' : 'Lock', icon: locked ? <Unlock /> : <Lock />, on: ed.toggleLock, active: locked });
  btns.push({ key: 'del', label: 'Delete', icon: <Trash />, on: ed.deleteSel, danger: true });
  if (!multi) btns.push({ key: 'more', label: 'More', icon: <More />, on: () => setMenu((m) => !m), active: menu });

  const half = (btns.length * 40 + 12) / 2;
  const cx = Math.min(parentW - half - 8, Math.max(half + 8, box.x + box.w / 2));
  const above = box.y - 84;           // leaves room for the rotate handle
  const top = above < 6 ? Math.min(box.y + box.h + 18, 9999) : above;
  const menuBelow = top < box.y;

  return (
    <div ref={ref} className="ftb" style={{ left: cx, top }} role="toolbar" aria-label="Item actions">
      <div className="ftb-row">
        {btns.map((b) => (
          <button key={b.key} className={'ftb-btn' + (b.active ? ' on' : '') + (b.danger ? ' danger' : '')} aria-label={b.label} aria-pressed={b.active} onClick={b.on}>{b.icon}</button>
        ))}
      </div>
      {menu && (
        <div className="ftb-menu" style={menuBelow ? { bottom: 'auto', top: 56 } : undefined}>
          <button onClick={() => { setMenu(false); onPosition(); }}><Layers /> Position and align</button>
          <button onClick={() => { setMenu(false); ed.order('front'); }}>Bring to front</button>
          <button onClick={() => { setMenu(false); ed.order('back'); }}>Send to back</button>
          {im && ed.page.layout !== 'free' && <button onClick={() => { setMenu(false); ed.fillCell(im); }}>Fill cell</button>}
          {im && ed.page.layout !== 'free' && <button onClick={() => { setMenu(false); ed.fitCell(im); }}>Fit cell</button>}
          {fr?.file && <button onClick={() => { setMenu(false); ed.centerFace(fr.id); }}>Center face</button>}
          {fr?.file && <button onClick={() => { setMenu(false); ed.copyToAll(fr); }}>Copy to all frames</button>}
        </div>
      )}
    </div>
  );
}

export function PositionSheet({ onClose }: { onClose: () => void }) {
  const ed = useEd();
  const n = ed.sel.length;
  const A: [React.ReactElement, string, Parameters<typeof ed.align>[0]][] = [
    [<AlignL />, 'Align left', 'left'], [<AlignC />, 'Align center', 'center'], [<AlignR />, 'Align right', 'right'],
    [<AlignT />, 'Align top', 'top'], [<AlignM />, 'Align middle', 'middle'], [<AlignB />, 'Align bottom', 'bottom'],
  ];
  return (
    <div className="sheet-back" onClick={onClose}>
      <div className="sheet" role="dialog" aria-label="Position" onClick={(e) => e.stopPropagation()}>
        <div className="sheet-grab" />
        <div className="sheet-head"><b>Position</b><button className="icon-btn" onClick={onClose} aria-label="Close"><Close /></button></div>
        <p className="muted small" style={{ margin: '0 0 8px' }}>{n > 1 ? 'Align the selected items to each other.' : 'Align the item to the page.'}</p>
        <div className="icon-grid">
          {A.map(([ic, label, m]) => <button key={m} className="tile" aria-label={label} onClick={() => ed.align(m)}>{ic}<span>{label.replace('Align ', '')}</span></button>)}
        </div>
        <div className="field">Spacing
          <div className="icon-grid two">
            <button className="tile" disabled={n < 3} onClick={() => ed.distribute('x')}><DistH /><span>Distribute across</span></button>
            <button className="tile" disabled={n < 3} onClick={() => ed.distribute('y')}><DistV /><span>Distribute down</span></button>
          </div>
          {n < 3 && <span className="muted small">Select 3 or more items to space them evenly.</span>}
        </div>
        <div className="field">Layer
          <div className="icon-grid two">
            <button className="tile" disabled={n !== 1} onClick={() => ed.order('front')}><Layers /><span>Bring to front</span></button>
            <button className="tile" disabled={n !== 1} onClick={() => ed.order('back')}><Layers /><span>Send to back</span></button>
          </div>
        </div>
      </div>
    </div>
  );
}
