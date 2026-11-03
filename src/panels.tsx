import { useEffect, useMemo, useRef, useState } from 'react';
import type { Page, TrayItem, Unit } from './types';
import { useEd } from './editorContext';
import { cellCount, fitCount, fillFrames, LAYOUTS } from './layout';
import { fmt, MAX_MM, MIN_MM, presetOf, PRESETS, toMm } from './units';
import { PhotoThumb } from './PageThumb';
import PageThumb from './PageThumb';
import NumField from './NumField';
import { GROUPS, TEMPLATES } from './templates';
import { newPage } from './storage';
import { PAGE_HIT } from './PageCanvas';
import { Segmented, Swatches, SliderRow, Switch } from './ui';
import { Face, Grid as GridIcon, Plus, RotR, Trash } from './icons';

export const FRAME_SIZES: [string, number, number][] = [
  ['Passport 35×45', 35, 45], ['1×1 in', 25.4, 25.4], ['1.5×1.5 in', 38.1, 38.1], ['2×2 in', 50.8, 50.8], ['3×4 cm', 30, 40], ['Wallet 2×3 in', 50.8, 76.2],
];
const PHOTO_SIZES: [string, number, number][] = [
  ['Passport 35×45 mm', 35, 45], ['US 2×2 in', 50.8, 50.8], ['Wallet 2.5×3.5 in', 63.5, 88.9], ['4×6 in', 101.6, 152.4], ['5×7 in', 127, 177.8],
];

const Chip = ({ on, onClick, children, disabled }: { on?: boolean; onClick: () => void; children: React.ReactNode; disabled?: boolean }) => (
  <button className={'chip' + (on ? ' on' : '')} aria-pressed={!!on} disabled={disabled} onClick={onClick}>{children}</button>
);

// ---------------------------------------------------------------- Add

function Library() {
  const ed = useEd();
  const fileRef = useRef<HTMLInputElement>(null);
  const strip = useRef<HTMLDivElement>(null);
  const [ghost, setGhost] = useState<{ x: number; y: number; t: TrayItem } | null>(null);
  const ghostRef = useRef(ghost); ghostRef.current = ghost;
  const timer = useRef(0);
  const down0 = useRef({ x: 0, y: 0 });
  const { proj, selFrame } = ed;

  useEffect(() => {
    const el = strip.current;
    if (!el) return;
    const stop = (e: TouchEvent) => { if (ghostRef.current) e.preventDefault(); };
    el.addEventListener('touchmove', stop, { passive: false });
    return () => el.removeEventListener('touchmove', stop);
  }, []);

  const down = (e: React.PointerEvent, t: TrayItem) => {
    const target = e.currentTarget as HTMLElement, pid = e.pointerId;
    down0.current = { x: e.clientX, y: e.clientY };
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => {
      timer.current = 0;
      try { target.setPointerCapture(pid); } catch { /* ignore */ }
      setGhost({ x: down0.current.x, y: down0.current.y, t });
      navigator.vibrate?.(15);
    }, 250);
  };
  const move = (e: React.PointerEvent) => {
    if (ghostRef.current) {
      setGhost({ ...ghostRef.current, x: e.clientX, y: e.clientY });
      const h = ed.hit.current?.(e.clientX, e.clientY) ?? null;
      ed.setOver(h && h !== PAGE_HIT ? h : null);
    } else if (timer.current && Math.hypot(e.clientX - down0.current.x, e.clientY - down0.current.y) > 10) {
      window.clearTimeout(timer.current); timer.current = 0;
    }
  };
  const up = (e: React.PointerEvent, t: TrayItem) => {
    const g = ghostRef.current;
    if (g) {
      const h = ed.hit.current?.(e.clientX, e.clientY);
      if (h === PAGE_HIT) ed.addFromLibrary(g.t); else if (h) ed.placePhoto(h, g.t);
      setGhost(null); ed.setOver(null);
    } else if (timer.current) {
      window.clearTimeout(timer.current); timer.current = 0;
      ed.addFromLibrary(t);
    }
  };
  const cancel = () => { window.clearTimeout(timer.current); timer.current = 0; setGhost(null); ed.setOver(null); };

  return (
    <>
      <input ref={fileRef} type="file" accept="image/*" multiple hidden onChange={(e) => { ed.addPhotos(e.target.files); e.target.value = ''; }} />
      <div className="row" style={{ alignItems: 'center' }}>
        <button className="btn primary" onClick={() => fileRef.current?.click()}><Plus /> Add photos</button>
        <span className="muted small grow">{proj.tray.length ? 'Tap a photo to add it. Hold and drag onto a frame.' : 'Photos you add live here, so you can reuse them.'}</span>
      </div>
      {(
        <div className="strip" ref={strip}>
          {proj.tray.map((t) => (
            <div key={t.id} className="strip-item tray" role="button" aria-label="Photo. Tap to add" onPointerDown={(e) => down(e, t)} onPointerMove={move} onPointerUp={(e) => up(e, t)} onPointerCancel={cancel} onContextMenu={(e) => e.preventDefault()}>
              <PhotoThumb file={t.file} size={64} />
              <button className="x" aria-label="Remove from library" onPointerDown={(e) => e.stopPropagation()} onClick={(e) => { e.stopPropagation(); ed.removeFromLibrary(t.id); }}>×</button>
            </div>
          ))}
        </div>
      )}
      {selFrame && !selFrame.file && proj.tray.length > 0 && <span className="muted small">A frame is selected: tapping a photo puts it in that frame.</span>}
      {ghost && <div className="ghost" style={{ left: ghost.x, top: ghost.y }}><PhotoThumb file={ghost.t.file} size={72} /></div>}
    </>
  );
}

function FramesTab() {
  const ed = useEd();
  const { page, unit, fsize: size } = ed;
  return (
    <>
      <div className="field">Frame size
        <div className="chips">
          {FRAME_SIZES.map(([n, w, h]) => <Chip key={n} on={Math.abs(size.w - w) < 0.2 && Math.abs(size.h - h) < 0.2} onClick={() => ed.setFsize(w, h)}>{n}</Chip>)}
        </div>
        <div className="row">
          <NumField label="Width" mm={size.w} unit={unit} onCommit={(mm) => ed.setFsize(mm, size.h)} />
          <NumField label="Height" mm={size.h} unit={unit} onCommit={(mm) => ed.setFsize(size.w, mm)} />
          <button className="btn" onClick={() => ed.setFsize(size.h, size.w)} aria-label="Swap width and height">⇄</button>
        </div>
      </div>
      <div className="row">
        <button className="btn primary" onClick={ed.addFrame}><Plus /> Add frame</button>
        <button className="btn tonal" onClick={ed.fillWithFrames}>Fill page ({fillFrames(page, size.w, size.h).length})</button>
        {page.frames.length > 0 && <button className="btn danger-outline" onClick={ed.clearFrames}><Trash /> Clear</button>}
      </div>
      <Switch label="Auto-center face when placing a photo" checked={ed.autoFace} onChange={ed.setAutoFace} />
      {page.frames.some((f) => f.file) && <button className="btn tonal" onClick={ed.centerAll}><Face /> Center faces in all frames</button>}
    </>
  );
}

function TemplatesTab() {
  const ed = useEd();
  const thumbs = useMemo(() => TEMPLATES.map((t) => ({ t, page: t.make(newPage(t.w, t.h)) })), []);
  return (
    <>
      <p className="muted small" style={{ margin: 0 }}>Applying a template replaces what is on this page. You can undo it.</p>
      {GROUPS.map((g) => (
        <div key={g} className="field">{g}
          <div className="strip">
            {thumbs.filter((x) => x.t.group === g).map(({ t, page }) => (
              <button key={t.id} className="tcard" onClick={() => ed.applyTemplate(t)}>
                <span className="tcard-thumb"><PageThumb page={page} maxW={78} maxH={92} /></span>
                <span className="tcard-name">{t.name}</span>
              </button>
            ))}
          </div>
        </div>
      ))}
    </>
  );
}

export function AddPanel() {
  const ed = useEd();
  return (
    <div className="panel-body">
      <Segmented value={ed.addTab} onChange={ed.setAddTab} options={[['photos', 'Photos'], ['frames', 'Frames'], ['templates', 'Templates']]} />
      {ed.addTab === 'photos' && <Library />}
      {ed.addTab === 'frames' && <FramesTab />}
      {ed.addTab === 'templates' && <TemplatesTab />}
    </div>
  );
}

// ---------------------------------------------------------------- Layout

export function LayoutPanel() {
  const ed = useEd();
  const { page, unit } = ed;
  return (
    <div className="panel-body">
      <div className="chips">
        {LAYOUTS.map((l) => <Chip key={l.id} on={page.layout === l.id} onClick={() => ed.setLayout(l.id)}>{l.label}</Chip>)}
        {page.layout === 'free' && <Chip on onClick={() => undefined}>Free</Chip>}
      </div>
      <SliderRow label="Margins" value={page.marginMm} min={0} max={50} suffix={`${fmt(page.marginMm, unit)} ${unit}`} onChange={(v) => ed.editPage((pg) => ed.relayout({ ...pg, marginMm: v }))} />
      <SliderRow label="Spacing" value={page.spacingMm} min={0} max={30} suffix={`${fmt(page.spacingMm, unit)} ${unit}`} onChange={(v) => ed.editPage((pg) => ed.relayout({ ...pg, spacingMm: v }))} />
      <div className="field">Print a photo at exact size (fills the page with copies)
        <div className="chips">
          {PHOTO_SIZES.map(([n, w, h]) => { const c = fitCount(page, w, h); return <Chip key={n} disabled={!c} onClick={() => ed.fillWith(w, h)}>{n}{c ? ` · ${c}` : ''}</Chip>; })}
        </div>
        <span className="muted small">Uses the selected photo (or the first one on the page).</span>
      </div>
      <span className="muted small">{cellCount(page.layout) < 99 ? `${page.images.length} of ${cellCount(page.layout)} photos on this page.` : ''} Changing layout, margins or spacing re-places the photos.</span>
    </div>
  );
}

// ---------------------------------------------------------------- Text

export function TextPanel() {
  const ed = useEd();
  const t = ed.selText;
  return (
    <div className="panel-body">
      <div className="row">
        <button className="btn primary" onClick={ed.addText}><Plus /> Add text</button>
        {t && <button className="btn danger-outline" onClick={ed.deleteSel}><Trash /> Delete</button>}
      </div>
      {t ? (
        <>
          <label className="field" style={{ marginTop: 0 }}>Text
            <input value={t.text} onChange={(e) => ed.updateText(t.id, { text: e.target.value })} />
          </label>
          <SliderRow label="Size" value={t.sizePt} min={6} max={120} suffix={`${t.sizePt} pt`} onChange={(v) => ed.updateText(t.id, { sizePt: v })} />
          <Swatches label="Color" value={t.color} onChange={(c) => ed.updateText(t.id, { color: c })} />
          <Switch label="Bold" checked={t.bold} onChange={(b) => ed.updateText(t.id, { bold: b })} />
        </>
      ) : <p className="muted small">Add text, or tap a text on the page to edit it. Drag the round handle to rotate.</p>}
      <p className="muted small">Text uses a standard PDF font: Latin letters only, other characters print as "?".</p>
    </div>
  );
}

// ---------------------------------------------------------------- Style

export function StylePanel() {
  const ed = useEd();
  const { page, proj } = ed;
  const fb = proj.frameBorder;
  return (
    <div className="panel-body">
      <Swatches label="Page background" value={page.background} onChange={(c) => ed.editPage((pg) => ({ ...pg, background: c }))} />
      <Switch label="Page border" checked={page.border.on} onChange={(b) => ed.editPage((pg) => ({ ...pg, border: { ...pg.border, on: b } }))} />
      {page.border.on && (
        <>
          <SliderRow label="Width" value={page.border.widthMm} min={0.5} max={10} step={0.5} suffix={`${page.border.widthMm} mm`} onChange={(v) => ed.editPage((pg) => ({ ...pg, border: { ...pg.border, widthMm: v } }))} />
          <Swatches label="Border color" value={page.border.color} onChange={(c) => ed.editPage((pg) => ({ ...pg, border: { ...pg.border, color: c } }))} />
        </>
      )}
      <Switch label="Borders around photos" hint="A guide for cutting ID photos" checked={fb.on} onChange={(b) => ed.edit((p) => ({ ...p, frameBorder: { ...p.frameBorder, on: b } }))} />
      {fb.on && (
        <>
          <SliderRow label="Thickness" value={fb.widthMm} min={0.1} max={2} step={0.1} suffix={`${fb.widthMm.toFixed(1)} mm`} onChange={(v) => ed.edit((p) => ({ ...p, frameBorder: { ...p.frameBorder, widthMm: v } }))} />
          <Swatches label="Photo border color" value={fb.color} onChange={(c) => ed.edit((p) => ({ ...p, frameBorder: { ...p.frameBorder, color: c } }))} />
          <div className="field">Border sits
            <Segmented value={fb.place} onChange={(v) => ed.edit((p) => ({ ...p, frameBorder: { ...p.frameBorder, place: v } }))} options={[['outside', 'Outside'], ['inside', 'Inside']]} />
            <span className="muted small">{fb.place === 'outside' ? 'Keeps the photo at full size. Cut just inside the line.' : 'Draws over the photo edge. Cut along the outer edge.'}</span>
          </div>
        </>
      )}
      <Switch label="Crop marks at photo corners" hint={proj.cropMarks && page.spacingMm < 4 ? 'Needs about 4 mm spacing between frames' : undefined} checked={proj.cropMarks} onChange={(b) => ed.edit((p) => ({ ...p, cropMarks: b }))} />
    </div>
  );
}

// ---------------------------------------------------------------- Page settings

export function PagePanel() {
  const ed = useEd();
  const { page, unit } = ed;
  const [wMm, setW] = useState(page.widthMm);
  const [hMm, setH] = useState(page.heightMm);
  const [all, setAll] = useState(false);
  useEffect(() => { setW(page.widthMm); setH(page.heightMm); }, [page.id, page.widthMm, page.heightMm]);
  const landscape = wMm > hMm;
  const preset = presetOf(wMm, hMm);
  const clampMm = (v: number) => Math.min(MAX_MM, Math.max(MIN_MM, v));
  const pick = (name: string) => { const [a, b] = PRESETS[name]; setW(landscape ? b : a); setH(landscape ? a : b); };
  const apply = (w: number, h: number) => {
    ed.edit((p) => ({
      ...p, widthMm: w, heightMm: h,
      pages: p.pages.map((pg, k) => (all || k === ed.pi ? ed.relayout({ ...pg, widthMm: w, heightMm: h }) : pg)),
    }));
    ed.say('Size applied');
  };
  return (
    <div className="panel-body">
      <div className="chips">
        {Object.keys(PRESETS).map((n) => <Chip key={n} on={preset === n} onClick={() => pick(n)}>{n}</Chip>)}
        <Chip on={!preset} onClick={() => undefined}>Custom</Chip>
      </div>
      <Segmented value={landscape ? 'l' : 'p'} onChange={(v) => { if ((v === 'l') !== landscape) { setW(hMm); setH(wMm); } }} options={[['p', 'Portrait'], ['l', 'Landscape']]} />
      <div className="row">
        <NumField label="Width" mm={wMm} unit={unit} onCommit={(mm) => setW(clampMm(mm))} />
        <NumField label="Height" mm={hMm} unit={unit} onCommit={(mm) => setH(clampMm(mm))} />
        <Segmented<Unit> value={unit} onChange={(u) => ed.edit((p) => ({ ...p, unit: u }))} options={[['mm', 'mm'], ['cm', 'cm'], ['in', 'in']]} />
      </div>
      <Switch label="Apply size to all pages" checked={all} onChange={setAll} />
      <button className="btn primary wide" onClick={() => apply(wMm, hMm)}>Apply size</button>
      <Switch label="Page numbers" hint="Bottom centre of every page" checked={ed.proj.pageNumbers} onChange={(b) => ed.edit((p) => ({ ...p, pageNumbers: b }))} />
      <button className="btn tonal" onClick={ed.openGrid}><GridIcon /> Show all pages</button>
      <span className="muted small">{toMm(1, unit) > 0 ? '' : ''}Size: {fmt(page.widthMm, unit)} × {fmt(page.heightMm, unit)} {unit}</span>
    </div>
  );
}

// ---------------------------------------------------------------- Item (crop / frame options)

export function ItemPanel() {
  const ed = useEd();
  const { selImage: im, selFrame: fr, unit, fsize } = ed;
  if (im) {
    const c = im.crop;
    const sides = { l: c.x, t: c.y, r: 1 - c.x - c.w, b: 1 - c.y - c.h };
    return (
      <div className="panel-body">
        <div className="tools">
          <button className="btn" onClick={() => ed.rotateImage(im, -1)}><RotR /> Rotate</button>
          <button className="btn" onClick={() => ed.resetCrop(im)}>Reset crop</button>
          {ed.page.layout !== 'free' && <button className="btn tonal" onClick={() => ed.fillCell(im)}>Fill cell</button>}
          {ed.page.layout !== 'free' && <button className="btn tonal" onClick={() => ed.fitCell(im)}>Fit cell</button>}
        </div>
        {(['l', 'r', 't', 'b'] as const).map((s) => (
          <SliderRow key={s} label={{ l: 'Left', r: 'Right', t: 'Top', b: 'Bottom' }[s]} value={sides[s]} min={0} max={0.45} step={0.01} suffix={`${Math.round(sides[s] * 100)}%`} onChange={(v) => ed.setCropSide(im, s, v)} />
        ))}
        <span className="muted small">Crop trims the photo. Use the round handle on the page to rotate freely.</span>
      </div>
    );
  }
  if (fr) {
    return (
      <div className="panel-body">
        {fr.file ? (
          <>
            <SliderRow label="Zoom" value={fr.zoom} min={1} max={4} step={0.02} suffix={`${Math.round(fr.zoom * 100)}%`} onChange={(v) => ed.updateFrame(fr.id, { zoom: v })} />
            <div className="tools">
              <button className={'btn' + (ed.adjust ? ' on' : '')} onClick={() => ed.setAdjust(!ed.adjust)}>{ed.adjust ? 'Done' : 'Move photo'}</button>
              <button className="btn" onClick={() => ed.rotateFrame(fr, -1)}><RotR /> Rotate</button>
              <button className="btn tonal" onClick={() => ed.centerFace(fr.id)}><Face /> Center face</button>
              <button className="btn tonal" onClick={() => ed.copyToAll(fr)}>Copy to all frames</button>
              <button className="btn" onClick={() => ed.updateFrame(fr.id, { file: '', zoom: 1, cx: 0.5, cy: 0.5, rot: 0 })}>Remove photo</button>
            </div>
          </>
        ) : <p className="muted small" style={{ margin: 0 }}>This frame is empty. Open Add, then tap a photo to put it here.</p>}
        <div className="row" style={{ alignItems: 'center' }}>
          <span className="muted small">{fmt(fr.w * ed.page.widthMm, unit)} × {fmt(fr.h * ed.page.heightMm, unit)} {unit}</span>
          <button className="btn" onClick={() => ed.resizeFrame(fr, fsize.w, fsize.h)}>Set to {fmt(fsize.w, unit)}×{fmt(fsize.h, unit)} {unit}</button>
        </div>
      </div>
    );
  }
  return <div className="panel-body"><p className="muted small">Tap a photo or frame on the page to edit it.</p></div>;
}

export type { Page };
