import { useEffect, useMemo, useRef, useState } from 'react';
import type { Page, TrayItem, Unit } from './types';
import { useEd } from './editorContext';
import { cellCount, fitCount, fillFrames, LAYOUTS } from './layout';
import { fmt, MAX_MM, MIN_MM, presetOf, PRESETS } from './units';
import { PhotoThumb } from './PageThumb';
import PageThumb from './PageThumb';
import NumField from './NumField';
import { GROUPS, TEMPLATES } from './templates';
import { newPage } from './storage';
import { PAGE_HIT } from './PageCanvas';
import { myTemplates, removeMyTemplate, saveMyTemplate } from './usertemplates';
import { More, Segmented, SliderRow, Swatches, Switch } from './ui';
import type { Frame, PageImage } from './types';
import { Back, Crop, Edit, Face, FrameIcon, Plus, RotR, Template, Trash, Type, Wand } from './icons';

export const FRAME_SIZES: [string, number, number][] = [
  ['Passport 35×45', 35, 45], ['1×1 in', 25.4, 25.4], ['1.5×1.5 in', 38.1, 38.1], ['2×2 in', 50.8, 50.8], ['3×4 cm', 30, 40], ['Wallet 2×3 in', 50.8, 76.2],
];
const SIZE_CARDS: [string, string, number, number][] = [
  ['Wallet', '2×3 in', 50.8, 76.2], ['2R', '2.5×3.5 in', 63.5, 88.9], ['3R', '3.5×5 in', 88.9, 127], ['4R', '4×6 in', 101.6, 152.4],
  ['5R', '5×7 in', 127, 177.8], ['6R', '6×8 in', 152.4, 203.2], ['8R', '8×10 in', 203.2, 254],
  ['Passport', '35×45 mm', 35, 45], ['2×2 in', '50.8 mm', 50.8, 50.8], ['1.5×1.5 in', '38.1 mm', 38.1, 38.1], ['1×1 in', '25.4 mm', 25.4, 25.4], ['3×4 cm', '30×40 mm', 30, 40],
];
const PHOTO_SIZES: [string, number, number][] = [
  ['Passport 35×45 mm', 35, 45], ['US 2×2 in', 50.8, 50.8], ['Wallet 2.5×3.5 in', 63.5, 88.9], ['4×6 in', 101.6, 152.4], ['5×7 in', 127, 177.8],
];

const Chip = ({ on, onClick, children, disabled }: { on?: boolean; onClick: () => void; children: React.ReactNode; disabled?: boolean }) => (
  <button className={'chip' + (on ? ' on' : '')} aria-pressed={!!on} disabled={disabled} onClick={onClick}>{children}</button>
);

const SubHead = ({ title, onBack }: { title: string; onBack: () => void }) => (
  <button className="back-row" onClick={onBack}><Back /> {title}</button>
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
  const hasFrames = ed.page.frames.length > 0;

  return (
    <>
      <input ref={fileRef} type="file" accept="image/*" multiple hidden onChange={(e) => { ed.addPhotos(e.target.files); e.target.value = ''; }} />
      <button className="btn primary wide" style={{ marginTop: 0 }} onClick={() => fileRef.current?.click()}><Plus /> Add photos from phone</button>
      {proj.tray.length > 0 && (
        <>
          <span className="muted small">
            Your photos. Tap one to add it{hasFrames ? ', or hold and drag it onto a frame' : ''}.
            {selFrame && !selFrame.file ? ' A frame is selected, so it goes there.' : ''}
          </span>
          <div className="strip" ref={strip}>
            {proj.tray.map((t) => (
              <div key={t.id} className="strip-item tray" role="button" aria-label="Photo. Tap to add" onPointerDown={(e) => down(e, t)} onPointerMove={move} onPointerUp={(e) => up(e, t)} onPointerCancel={cancel} onContextMenu={(e) => e.preventDefault()}>
                <PhotoThumb file={t.file} size={64} />
                <button className="x" aria-label="Remove from your photos" onPointerDown={(e) => e.stopPropagation()} onClick={(e) => { e.stopPropagation(); ed.removeFromLibrary(t.id); }}>×</button>
              </div>
            ))}
          </div>
        </>
      )}
      {ghost && <div className="ghost" style={{ left: ghost.x, top: ghost.y }}><PhotoThumb file={ghost.t.file} size={72} /></div>}
    </>
  );
}

function FramesTab() {
  const ed = useEd();
  const { page, unit, fsize: size } = ed;
  const n = fillFrames(page, size.w, size.h).length;
  const known = SIZE_CARDS.find(([, , w, h]) => (Math.abs(size.w - w) < 0.2 && Math.abs(size.h - h) < 0.2) || (Math.abs(size.w - h) < 0.2 && Math.abs(size.h - w) < 0.2));
  return (
    <>
      <SizeCards />
      <div className="fillbar">
        <div className="fillbar-tx"><span className="muted small">Last size</span><b>{known ? known[0] : 'Custom'} · {fmt(size.w, unit)}×{fmt(size.h, unit)} {unit}</b></div>
        <button className="btn primary" disabled={!n} onClick={ed.fillWithFrames}>{n ? `Fill page with ${n} frames` : 'Does not fit'}</button>
      </div>
      <More>
        <div className="field">Custom frame size
          <div className="row">
            <NumField label="Width" mm={size.w} unit={unit} onCommit={(mm) => ed.setFsize(mm, size.h)} />
            <NumField label="Height" mm={size.h} unit={unit} onCommit={(mm) => ed.setFsize(size.w, mm)} />
            <button className="btn" onClick={() => ed.setFsize(size.h, size.w)} aria-label="Swap width and height">⇄</button>
          </div>
          <button className="btn tonal" onClick={ed.addFrame}><Plus /> Add one frame of this size</button>
        </div>
        <Switch label="Same photo in every frame" hint="When all frames are empty" checked={ed.sameAll} onChange={ed.setSameAll} />
        <Switch label="Center faces automatically" hint="Off by default. New photos go on the biggest face." checked={ed.autoFace} onChange={ed.setAutoFace} />
        {page.frames.length > 0 && <button className="btn danger-outline" onClick={ed.clearFrames}><Trash /> Remove all frames</button>}
      </More>
    </>
  );
}

/** Photo print and ID sizes. Tap to add a frame of that size to this page, or hold and drag it onto the page. */

function SizeCards() {
  const ed = useEd();
  const [land, setLand] = useState(false);
  const [ghost, setGhost] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  const d = useRef<{ timer: number; on: boolean; sx: number; sy: number; w: number; h: number } | null>(null);
  useEffect(() => {
    if (!ghost) return;
    const stop = (e: TouchEvent) => e.preventDefault();
    window.addEventListener('touchmove', stop, { passive: false });
    return () => window.removeEventListener('touchmove', stop);
  }, [!!ghost]);
  const pageRect = () => (document.querySelector('.deskwrap .konvajs-content canvas') as HTMLCanvasElement | null)?.getBoundingClientRect() ?? null;
  const dims = (w: number, h: number) => (land ? { w: h, h: w } : { w, h });
  const down = (e: React.PointerEvent, w0: number, h0: number) => {
    const { w, h } = dims(w0, h0);
    d.current = { timer: 0, on: false, sx: e.clientX, sy: e.clientY, w, h };
    const target = e.currentTarget as HTMLElement, pid = e.pointerId;
    d.current.timer = window.setTimeout(() => {
      if (!d.current) return;
      d.current.on = true; navigator.vibrate?.(15);
      try { target.setPointerCapture(pid); } catch { /* ignore */ }
      const r = pageRect(), k = r ? r.width / ed.page.widthMm : 1;
      setGhost({ x: d.current.sx, y: d.current.sy, w: w * k, h: h * k });
    }, 260);
  };
  const move = (e: React.PointerEvent) => {
    const c = d.current; if (!c) return;
    if (c.on) setGhost((g) => (g ? { ...g, x: e.clientX, y: e.clientY } : g));
    else if (Math.hypot(e.clientX - c.sx, e.clientY - c.sy) > 10) { window.clearTimeout(c.timer); d.current = null; }
  };
  const up = (e: React.PointerEvent) => {
    const c = d.current; d.current = null; if (!c) return;
    window.clearTimeout(c.timer);
    if (!c.on) { ed.setFsize(c.w, c.h); ed.addFrameSized(c.w, c.h); return; }            // a tap: put it at a free spot
    setGhost(null);
    const r = pageRect();
    if (r && e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom) {
      ed.setFsize(c.w, c.h);
      ed.addFrameSized(c.w, c.h, { x: (e.clientX - r.left) / r.width, y: (e.clientY - r.top) / r.height });
    }
  };
  const cancel = () => { if (d.current) window.clearTimeout(d.current.timer); d.current = null; setGhost(null); };
  return (
    <div className="field">
      <span className="muted small">Tap a size to add a frame. Hold and drag to place it where you want.</span>
      <div className="seg"><button className={!land ? 'on' : ''} onClick={() => setLand(false)}>Portrait</button><button className={land ? 'on' : ''} onClick={() => setLand(true)}>Landscape</button></div>
      <div className="size-grid">
        {SIZE_CARDS.map(([name, label, w0, h0]) => {
          const { w, h } = dims(w0, h0), k = 46 / Math.max(w, h);
          const on = Math.abs(ed.fsize.w - w) < 0.2 && Math.abs(ed.fsize.h - h) < 0.2;
          return (
            <button key={name} className={'tcard size-pick size-card' + (on ? ' on' : '')} onPointerDown={(e) => down(e, w0, h0)} onPointerMove={move} onPointerUp={up} onPointerCancel={cancel} onContextMenu={(e) => e.preventDefault()}>
              <span className="tcard-thumb"><span className="size-box" style={{ width: w * k, height: h * k }} /></span>
              <span className="tcard-name">{name}</span>
              <span className="tcard-sub">{label}</span>
            </button>
          );
        })}
      </div>
      {ghost && <div className="drag-ghost" style={{ left: ghost.x - ghost.w / 2, top: ghost.y - ghost.h / 2, width: ghost.w, height: ghost.h }} />}
    </div>
  );
}

function TemplatesTab() {
  const ed = useEd();
  const thumbs = useMemo(() => TEMPLATES.map((t) => ({ t, page: t.make(newPage(t.w, t.h)) })), []);
  const [mine, setMine] = useState(() => myTemplates());
  const mineThumbs = useMemo(() => mine.map((t) => ({ t, page: t.make(newPage(t.w, t.h)) })), [mine]);
  const [name, setName] = useState('');
  const canSave = ed.page.frames.length > 0 || ed.page.texts.length > 0;
  const save = () => { saveMyTemplate(name || 'My template', ed.page); setMine(myTemplates()); setName(''); ed.say('Saved. Find it under My templates.'); };
  return (
    <>
      <p className="muted small" style={{ margin: 0 }}>Full-page layouts. Tapping one replaces this page's layout. You can undo it.</p>
      <div className="field">My templates
        {mineThumbs.length > 0 && (
          <div className="strip">
            {mineThumbs.map(({ t, page }) => (
              <span key={t.id} className="tcard-wrap">
                <button className="tcard" onClick={() => ed.applyTemplate(t)}>
                  <span className="tcard-thumb"><PageThumb page={page} maxW={78} maxH={92} /></span>
                  <span className="tcard-name">{t.name}</span>
                </button>
                <button className="tcard-x" aria-label={`Delete ${t.name}`} onClick={() => { removeMyTemplate(t.id); setMine(myTemplates()); }}>✕</button>
              </span>
            ))}
          </div>
        )}
        <div className="suffix"><input placeholder="Name this layout" value={name} onChange={(e) => setName(e.target.value)} aria-label="Template name" />
          <button className="btn tonal" disabled={!canSave} onClick={save}>Save this page</button></div>
        <span className="muted small">Saves the frames, text and page set-up, not the photos.</span>
      </div>
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
  if (ed.addTab === 'frames') return <div className="panel-body"><SubHead title="Sizes" onBack={() => ed.setAddTab('photos')} /><FramesTab /></div>;
  if (ed.addTab === 'templates') return <div className="panel-body"><SubHead title="Templates" onBack={() => ed.setAddTab('photos')} /><TemplatesTab /></div>;
  return (
    <div className="panel-body">
      <Library />
      <div className="field">Also add
        <div className="row3">
          <button className="btn tonal" onClick={() => ed.setAddTab('frames')}><FrameIcon /> Sizes</button>
          <button className="btn tonal" onClick={() => ed.setAddTab('templates')}><Template /> Templates</button>
          <button className="btn tonal" onClick={ed.addText}><Type /> Text</button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- Layout

const LayoutIcon = ({ cols, rows }: { cols: number; rows: number }) => {
  const g = 3, w = (30 - g * (cols + 1)) / cols, h = (38 - g * (rows + 1)) / rows;
  return (
    <svg width="30" height="38" viewBox="0 0 30 38" aria-hidden>
      <rect x="0.5" y="0.5" width="29" height="37" rx="2" fill="none" stroke="currentColor" opacity=".5" />
      {Array.from({ length: rows }).flatMap((_, r) => Array.from({ length: cols }).map((__, c) => (
        <rect key={`${r}${c}`} x={g + c * (w + g)} y={g + r * (h + g)} width={w} height={h} rx="1" fill="currentColor" />
      )))}
    </svg>
  );
};

export function LayoutPanel() {
  const ed = useEd();
  const { page, unit } = ed;
  return (
    <div className="panel-body">
      <div className="field" style={{ marginTop: 0 }}>Photos on this page
        <div className="lcards">
          {LAYOUTS.map((l) => {
            const n = l.cols * l.rows;
            return (
              <button key={l.id} className={'lcard' + (page.layout === l.id ? ' on' : '')} aria-pressed={page.layout === l.id} aria-label={`${n} ${n === 1 ? 'photo' : 'photos'}`} onClick={() => ed.setLayout(l.id)}>
                <LayoutIcon cols={l.cols} rows={l.rows} /><span>{n}</span>
              </button>
            );
          })}
          {page.layout === 'free' && <button className="lcard on" aria-pressed><span style={{ fontSize: 12 }}>Free</span></button>}
        </div>
      </div>
      <SliderRow label="Gap" value={page.spacingMm} min={0} max={30} suffix={`${fmt(page.spacingMm, unit)} ${unit}`} onChange={(v) => ed.editPage((pg) => ed.relayout({ ...pg, spacingMm: v }))} />
      <SliderRow label="Edge" value={page.marginMm} min={0} max={50} suffix={`${fmt(page.marginMm, unit)} ${unit}`} onChange={(v) => ed.editPage((pg) => ed.relayout({ ...pg, marginMm: v }))} />
      {cellCount(page.layout) < 99 && <span className="muted small">{page.images.length} of {cellCount(page.layout)} photos on this page.</span>}
    </div>
  );
}

// ---------------------------------------------------------------- Text

export function TextPanel() {
  const ed = useEd();
  const t = ed.selText;
  return (
    <div className="panel-body">
      {t ? (
        <>
          <label className="field" style={{ marginTop: 0 }}>Your text
            <input value={t.text} autoFocus onChange={(e) => ed.updateText(t.id, { text: e.target.value })} />
          </label>
          <SliderRow label="Size" value={t.sizePt} min={6} max={120} suffix={`${t.sizePt} pt`} onChange={(v) => ed.updateText(t.id, { sizePt: v })} />
          <Swatches label="Color" value={t.color} onChange={(c) => ed.updateText(t.id, { color: c })} />
          <Switch label="Bold" checked={t.bold} onChange={(b) => ed.updateText(t.id, { bold: b })} />
          <div className="row"><button className="btn tonal" onClick={ed.addText}><Plus /> Add another text</button><button className="btn danger-outline" onClick={ed.deleteSel}><Trash /> Delete</button></div>
        </>
      ) : (
        <>
          <button className="btn primary wide" style={{ marginTop: 0 }} onClick={ed.addText}><Plus /> Add text</button>
          <p className="muted small" style={{ margin: 0 }}>Tap a text on the page to change it. Drag the round handle to turn it.</p>
        </>
      )}
      <span className="muted small">Letters, numbers and common symbols only. Other characters print as "?".</span>
    </div>
  );
}

// ---------------------------------------------------------------- Page (size, color, guides)

/** Thickness in mm: a slider for quick changes and a box to type any value. */
function ThickRow({ label, value, min, max, onChange }: { label: string; value: number; min: number; max: number; onChange: (v: number) => void }) {
  return (
    <label className="slider thick"><span>{label}</span>
      <input type="range" aria-label={label} min={min} max={max} step={0.1} value={Math.min(max, value)} onChange={(e) => onChange(Number(e.target.value))} />
      <input className="num" type="number" inputMode="decimal" aria-label={`${label} in mm`} step={0.1} min={0.05} max={20} value={Number(value.toFixed(2))}
        onChange={(e) => { const v = parseFloat(e.target.value); if (Number.isFinite(v)) onChange(Math.min(20, Math.max(0.05, v))); }} />
      <span className="muted">mm</span>
    </label>
  );
}

export function PagePanel() {
  const ed = useEd();
  const { page, unit, proj } = ed;
  const multi = proj.pages.length > 1;
  const [scope, setScope] = useState<'this' | 'all'>('this');
  const [custom, setCustom] = useState(false);
  const [wMm, setW] = useState(page.widthMm);
  const [hMm, setH] = useState(page.heightMm);
  useEffect(() => { setW(page.widthMm); setH(page.heightMm); }, [page.id, page.widthMm, page.heightMm]);
  const landscape = page.widthMm > page.heightMm;
  const preset = presetOf(page.widthMm, page.heightMm);
  const fb = proj.frameBorder;
  const clampMm = (v: number) => Math.min(MAX_MM, Math.max(MIN_MM, v));
  const apply = (w: number, h: number) => {
    ed.edit((p) => ({
      ...p, widthMm: w, heightMm: h,
      pages: p.pages.map((pg, k) => (scope === 'all' || k === ed.pi ? ed.relayout({ ...pg, widthMm: w, heightMm: h }) : pg)),
    }));
    ed.say(scope === 'all' && multi ? 'Size applied to all pages' : 'Size applied');
  };
  const pick = (name: string) => { const [a, b] = PRESETS[name]; setCustom(false); apply(landscape ? b : a, landscape ? a : b); };
  return (
    <div className="panel-body">
      <div className="field" style={{ marginTop: 0 }}>Paper
        <div className="chips">
          {Object.keys(PRESETS).map((n) => <Chip key={n} on={!custom && preset === n} onClick={() => pick(n)}>{n}</Chip>)}
          <button className={'chip custom' + (custom || !preset ? ' on' : '')} aria-pressed={custom || !preset} onClick={() => setCustom(!custom)}><Edit /> Custom</button>
        </div>
      </div>
      {(custom || !preset) && (
        <div className="field">Custom size
          <div className="row">
            <NumField label="Width" mm={wMm} unit={unit} onCommit={(mm) => setW(clampMm(mm))} />
            <button className="btn" onClick={() => { setW(hMm); setH(wMm); }} aria-label="Swap width and height">⇄</button>
            <NumField label="Height" mm={hMm} unit={unit} onCommit={(mm) => setH(clampMm(mm))} />
            <Segmented<Unit> value={unit} onChange={(u) => ed.edit((p) => ({ ...p, unit: u }))} options={[['mm', 'mm'], ['cm', 'cm'], ['in', 'in']]} />
          </div>
        </div>
      )}
      {multi && (
        <div className="tp-line"><span>Apply to</span>
          <Segmented value={scope} onChange={setScope} options={[['this', 'This page'], ['all', `All ${proj.pages.length} pages`]]} />
        </div>
      )}
      <div className="tp-line"><span>Direction</span>
        <Segmented value={landscape ? 'l' : 'p'} onChange={(v) => { if ((v === 'l') !== landscape) apply(page.heightMm, page.widthMm); }} options={[['p', 'Portrait'], ['l', 'Landscape']]} />
      </div>
      {(custom || !preset) && <button className="btn primary wide" style={{ marginTop: 0 }} onClick={() => apply(wMm, hMm)}>Apply size</button>}
      <Swatches label="Page color" value={page.background} onChange={(c) => ed.editPage((pg) => ({ ...pg, background: c }))} />
      <Switch label="Page numbers" checked={proj.pageNumbers} onChange={(b) => ed.edit((p) => ({ ...p, pageNumbers: b }))} />
      <Switch label="Cutting lines around photos" hint="Thin line to cut along" checked={fb.on} onChange={(b) => ed.edit((p) => ({ ...p, frameBorder: { ...p.frameBorder, on: b } }))} />
      {fb.on && (
        <>
          <ThickRow label="Line thickness" value={fb.widthMm} min={0.1} max={5} onChange={(v) => ed.edit((p) => ({ ...p, frameBorder: { ...p.frameBorder, widthMm: v } }))} />
          <Swatches label="Cutting line color" value={fb.color} onChange={(c) => ed.edit((p) => ({ ...p, frameBorder: { ...p.frameBorder, color: c } }))} />
        </>
      )}
      <Switch label="Border around the page" checked={page.border.on} onChange={(b) => ed.editPage((pg) => ({ ...pg, border: { ...pg.border, on: b } }))} />
      {page.border.on && (
        <>
          <ThickRow label="Border thickness" value={page.border.widthMm} min={0.5} max={10} onChange={(v) => ed.editPage((pg) => ({ ...pg, border: { ...pg.border, widthMm: v } }))} />
          <Swatches label="Border color" value={page.border.color} onChange={(c) => ed.editPage((pg) => ({ ...pg, border: { ...pg.border, color: c } }))} />
        </>
      )}
      <button className="btn tonal" style={{ alignSelf: 'flex-start' }} onClick={ed.openPrinter}>Printer check</button>
      <More>
        {fb.on && (
          <div className="field">Cutting line sits
            <Segmented value={fb.place} onChange={(v) => ed.edit((p) => ({ ...p, frameBorder: { ...p.frameBorder, place: v } }))} options={[['outside', 'Outside the photo'], ['inside', 'Inside']]} />
            <span className="muted small">{fb.place === 'outside' ? 'Keeps the photo full size. Cut just inside the line.' : 'Draws over the photo edge. Cut along the outer edge.'}</span>
          </div>
        )}
        <Switch label="Corner marks" hint={proj.cropMarks && page.spacingMm < 4 ? 'Needs about 4 mm gap between photos' : 'Small marks at each photo corner'} checked={proj.cropMarks} onChange={(b) => ed.edit((p) => ({ ...p, cropMarks: b }))} />
        <button className="btn tonal" onClick={ed.openGrid}>Show all pages</button>
      </More>
    </div>
  );
}

// ---------------------------------------------------------------- Item (crop / frame options)

/** Remove background, plus the color shown behind a cut-out (for example the blue or white of an ID photo). */
export function ItemPanel() {
  const ed = useEd();
  const { selImage: im, selFrame: fr, unit, fsize } = ed;
  if (im) {
    const c = im.crop;
    const sides = { l: c.x, t: c.y, r: 1 - c.x - c.w, b: 1 - c.y - c.h };
    return (
      <div className="panel-body">
        <div className="tools">
          <button className="btn" onClick={() => ed.rotateImage(im, 1)}><RotR /> Turn</button>
          {ed.page.layout !== 'free' && <button className="btn tonal" onClick={() => ed.fillCell(im)}>Fill the space</button>}
          {ed.page.layout !== 'free' && <button className="btn tonal" onClick={() => ed.fitCell(im)}>Fit in space</button>}
        </div>
        <div className="field">Trim the edges
          {(['l', 'r', 't', 'b'] as const).map((s) => (
            <SliderRow key={s} label={{ l: 'Left', r: 'Right', t: 'Top', b: 'Bottom' }[s]} value={sides[s]} min={0} max={0.45} step={0.01} suffix={`${Math.round(sides[s] * 100)}%`} onChange={(v) => ed.setCropSide(im, s, v)} />
          ))}
          <button className="btn" style={{ alignSelf: 'flex-start' }} onClick={() => ed.resetCrop(im)}>Undo trimming</button>
        </div>
        <span className="muted small">To tilt the photo, drag the round handle above it.</span>
      </div>
    );
  }
  if (fr) {
    return (
      <div className="panel-body">
        {fr.file ? (
          <div className="tools">
            <button className="btn primary" onClick={() => { ed.setAdjust(true); ed.setPanel(null); }}><Crop /> Crop</button>
            <button className="btn" onClick={() => ed.rotateFrame(fr, 1)}><RotR /> Turn</button>
            <button className="btn tonal" onClick={() => ed.centerFace(fr.id)}><Face /> Center on face</button>
            <button className="btn tonal" onClick={() => ed.copyToAll(fr)}>Use in all frames</button>
            <button className="btn" onClick={() => ed.detach(fr.id)}>Take out of frame</button>
            <button className="btn" onClick={() => ed.updateFrame(fr.id, { file: '', zoom: 1, cx: 0.5, cy: 0.5, rot: 0 })}>Remove photo</button>
          </div>
        ) : <p className="muted small" style={{ margin: 0 }}>This frame is empty. Open Add and tap a photo, or drag a photo onto it.</p>}
        <More title="Frame size">
          <div className="row" style={{ alignItems: 'center' }}>
            <span className="muted small">This frame: {fmt(fr.w * ed.page.widthMm, unit)} × {fmt(fr.h * ed.page.heightMm, unit)} {unit}</span>
            <button className="btn" onClick={() => ed.resizeFrame(fr, fsize.w, fsize.h)}>Change to {fmt(fsize.w, unit)}×{fmt(fsize.h, unit)} {unit}</button>
          </div>
        </More>
      </div>
    );
  }
  return <div className="panel-body"><p className="muted small">Tap a photo or frame on the page to edit it.</p></div>;
}

export type { Page };
