import { useCallback, useEffect, useRef, useState } from 'react';
import type { Crop, Frame, LayoutId, Page, PageImage, PageText, Project, TrayItem, Unit } from '../types';
import { listProjects, newPage, saveProject } from '../storage';
import { applyLayout, cellCount, cellRect, clampFrame, cropToAspect, dispAspect, emptyFrame, fillFrames, fillPage, fitCount, freeBox, freeSpot, LAYOUTS, rotateCrop } from '../layout';
import { deleteImages, FULL, importImage, newId } from '../images';
import { fmt, MAX_MM, MIN_MM, presetOf, PRESETS, toMm } from '../units';
import PageCanvas from '../PageCanvas';
import PageThumb, { PhotoThumb } from '../PageThumb';
import NumField from '../NumField';
import Export from './Export';
import { useBack } from '../back';
import { Back, Copy, Grid, Image as ImageIcon, Left, Palette, Pages as PagesIcon, Plus, Right, Size, Trash, Type, Undo, Redo, RotL, RotR, FrameIcon } from '../icons';

type Tab = 'images' | 'layout' | 'size' | 'style' | 'text' | 'frames' | 'pages';
const TABS: [Tab, string, () => React.ReactElement][] = [
  ['images', 'Images', ImageIcon], ['layout', 'Layout', Grid], ['size', 'Size', Size], ['style', 'Style', Palette], ['text', 'Text', Type], ['frames', 'Frames', FrameIcon], ['pages', 'Pages', PagesIcon],
];

const PHOTO_SIZES: [string, number, number][] = [
  ['Passport 35×45 mm', 35, 45], ['US 2×2 in', 50.8, 50.8], ['Wallet 2.5×3.5 in', 63.5, 88.9], ['4×6 in', 101.6, 152.4], ['5×7 in', 127, 177.8],
];

const FRAME_SIZES: [string, number, number][] = [
  ['Passport 35×45 mm', 35, 45], ['1×1 in', 25.4, 25.4], ['1.5×1.5 in', 38.1, 38.1], ['2×2 in', 50.8, 50.8],
  ['3×4 cm', 30, 40], ['Wallet 2×3 in', 50.8, 76.2],
];

const filesOf = (p: Project) => new Set([
  ...p.pages.flatMap((pg) => [...pg.images.map((i) => i.file), ...pg.frames.map((f) => f.file).filter(Boolean)]),
  ...p.tray.map((t) => t.file),
]);

export default function Editor({ id, onBack }: { id: string; onBack: () => void }) {
  const [proj, setProj] = useState<Project | null>(() => listProjects().find((p) => p.id === id) ?? null);
  const projRef = useRef(proj);
  const past = useRef<Project[]>([]);
  const future = useRef<Project[]>([]);
  const lastPush = useRef(0);
  const seen = useRef<Set<string>>(new Set(proj ? filesOf(proj) : []));
  const [hist, setHist] = useState({ u: 0, r: 0 });
  const [pi, setPi] = useState(0);
  const [tab, setTab] = useState<Tab>('images');
  const [sel, setSel] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const [toast, setToast] = useState('');
  const [saved, setSaved] = useState(true);
  const [cropOpen, setCropOpen] = useState(false);
  const [fsize, setFsize] = useState({ w: 35, h: 45 });
  const [selTray, setSelTray] = useState<string | null>(null);
  const [adjust, setAdjust] = useState(false);
  const [over, setOver] = useState<string | null>(null);
  const hit = useRef<((x: number, y: number) => string | null) | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  // autosave
  useEffect(() => {
    if (!proj) return;
    setSaved(false);
    const t = setTimeout(() => { saveProject(proj); setSaved(true); }, 400);
    return () => clearTimeout(t);
  }, [proj]);

  const say = (m: string) => { setToast(m); setTimeout(() => setToast(''), 2500); };
  const sync = () => setHist({ u: past.current.length, r: future.current.length });

  /** Every change goes through here so it can be undone. Quick bursts (slider drags) count as one step. */
  const edit = useCallback((fn: (p: Project) => Project) => {
    const cur = projRef.current;
    if (!cur) return;
    const next = fn(cur);
    if (next === cur) return;
    const now = Date.now();
    if (now - lastPush.current > 500) { past.current.push(cur); if (past.current.length > 60) past.current.shift(); }
    lastPush.current = now;
    future.current = [];
    projRef.current = next; setProj(next); sync();
  }, []);
  const editPage = useCallback((fn: (pg: Page) => Page, index?: number) => {
    const i = index ?? pi;
    edit((p) => ({ ...p, pages: p.pages.map((pg, k) => (k === i ? fn(pg) : pg)) }));
  }, [edit, pi]);

  const jump = (to: Project) => {
    projRef.current = to; setProj(to); sync();
    setPi((i) => Math.min(i, to.pages.length - 1)); setSel(null);
    lastPush.current = 0;
  };
  const undo = () => { const p = past.current.pop(); if (p && projRef.current) { future.current.push(projRef.current); jump(p); } };
  const redo = () => { const p = future.current.pop(); if (p && projRef.current) { past.current.push(projRef.current); jump(p); } };

  /** Leave the editor: save, then delete image files nothing uses any more. */
  const leave = () => {
    const cur = projRef.current;
    if (cur) {
      saveProject(cur);
      const keep = filesOf(cur);
      deleteImages([...seen.current].filter((f) => !keep.has(f)));
    }
    onBack();
  };
  useBack(() => { if (exporting) setExporting(false); else leave(); });

  if (!proj) return <div className="screen pad"><button className="btn" onClick={onBack}>Back</button><p>Project not found.</p></div>;
  const page = proj.pages[Math.min(pi, proj.pages.length - 1)];
  const unit = proj.unit;
  const selImage = page.images.find((i) => i.id === sel) ?? null;
  const selText = page.texts.find((t) => t.id === sel) ?? null;

  const addImages = async (files: FileList | null) => {
    if (!files?.length) return;
    const idx = pi;
    say('Adding images…');
    try {
      const imported: { file: string; aspect: number }[] = [];
      for (const f of Array.from(files)) {
        try { const r = await importImage(f); imported.push(r); seen.current.add(r.file); } catch { /* skip unreadable */ }
      }
      let added = 0, extra = 0;
      // Fill this page, then continue onto new pages (same size and style) so nothing is dropped.
      edit((p) => {
        const pages = [...p.pages];
        const queue = [...imported];
        let k = idx;
        while (queue.length) {
          const pg = pages[k];
          const cap = cellCount(pg.layout);
          const imgs = [...pg.images];
          while (queue.length && imgs.length < cap) {
            const im = queue.shift()!;
            const base = { id: newId(), file: im.file, aspect: im.aspect, rot: 0, crop: FULL };
            imgs.push({ ...base, ...(pg.layout === 'free' ? freeBox(pg, im.aspect, imgs.length) : { x: 0, y: 0, w: 0.5, h: 0.5 }) });
            added++;
          }
          const { fill: _drop, ...rest } = pg; void _drop;
          pages[k] = applyLayout({ ...rest, images: imgs });
          if (queue.length) {
            pages.splice(k + 1, 0, { ...pg, id: newId(), images: [], texts: [], fill: undefined });
            extra++; k++;
          }
        }
        return { ...p, pages };
      });
      if (!added) say('Could not read that image');
      else say(`Added ${added}${extra ? ` (${extra} new ${extra === 1 ? 'page' : 'pages'})` : ''}`);
    } catch { say('Could not add images'); }
    if (fileRef.current) fileRef.current.value = '';
  };

  const removeImage = (imgId: string) => {
    editPage((pg) => applyLayout({ ...pg, fill: undefined, images: pg.images.filter((i) => i.id !== imgId) }));
    setSel(null);
  };

  const updateImage = (imgId: string, patch: Partial<PageImage>) =>
    editPage((pg) => ({ ...pg, fill: undefined, images: pg.images.map((i) => (i.id === imgId ? { ...i, ...patch } : i)) }));

  /** Change crop/rotation: new shape fits inside the old box, same centre. */
  const reshape = (imgId: string, patch: Partial<Pick<PageImage, 'rot' | 'crop'>>) =>
    editPage((pg) => ({
      ...pg, fill: undefined,
      images: pg.images.map((i) => {
        if (i.id !== imgId) return i;
        const n = { ...i, ...patch };
        const a = dispAspect(n), bw = i.w * pg.widthMm, bh = i.h * pg.heightMm;
        let w = bw, h = bw / a;
        if (h > bh) { h = bh; w = bh * a; }
        const fw = w / pg.widthMm, fh = h / pg.heightMm;
        return { ...n, x: i.x + (i.w - fw) / 2, y: i.y + (i.h - fh) / 2, w: fw, h: fh };
      }),
    }));
  const rotate = (im: PageImage, dir: 1 | -1) => {
    let crop = im.crop;
    for (let k = 0; k < (dir === 1 ? 1 : 3); k++) crop = rotateCrop(crop);
    reshape(im.id, { rot: (im.rot + dir + 4) % 4, crop });
  };
  const setCropSide = (im: PageImage, side: 'l' | 'r' | 't' | 'b', v: number) => {
    const c = im.crop;
    const l = side === 'l' ? v : c.x, t = side === 't' ? v : c.y;
    const r = side === 'r' ? v : 1 - c.x - c.w, b = side === 'b' ? v : 1 - c.y - c.h;
    const crop: Crop = { x: l, y: t, w: Math.max(0.1, 1 - l - r), h: Math.max(0.1, 1 - t - b) };
    reshape(im.id, { crop });
  };
  /** Make the photo cover its grid cell exactly (crops the overflow). */
  const fillCell = (im: PageImage) => editPage((pg) => {
    const k = pg.images.findIndex((i) => i.id === im.id);
    const cell = cellRect(pg, k);
    if (!cell) return pg;
    const crop = cropToAspect(im, (cell.w * pg.widthMm) / (cell.h * pg.heightMm));
    return { ...pg, images: pg.images.map((i) => (i.id === im.id ? { ...i, crop, ...cell } : i)) };
  });
  const fitCell = (im: PageImage) => editPage((pg) => {
    const k = pg.images.findIndex((i) => i.id === im.id);
    if (!cellRect(pg, k)) return pg;
    const imgs = pg.images.map((i) => (i.id === im.id ? { ...i, crop: FULL } : i));
    return applyLayout({ ...pg, images: imgs });
  });
  const order = (imgId: string, to: 'front' | 'back') => editPage((pg) => {
    const m = pg.images.find((i) => i.id === imgId)!;
    const rest = pg.images.filter((i) => i.id !== imgId);
    return { ...pg, layout: pg.layout === 'free' ? 'free' : pg.layout, images: to === 'front' ? [...rest, m] : [m, ...rest] };
  });
  const swap = (aId: string, bId: string, startCx: number, startCy: number) => editPage((pg) => {
    const a = pg.images.find((i) => i.id === aId)!, b = pg.images.find((i) => i.id === bId)!;
    const bc = { x: b.x + b.w / 2, y: b.y + b.h / 2 };
    return {
      ...pg, fill: undefined,
      images: pg.images.map((i) => i.id === aId ? { ...i, x: bc.x - i.w / 2, y: bc.y - i.h / 2 }
        : i.id === bId ? { ...i, x: startCx - i.w / 2, y: startCy - i.h / 2 } : i),
    };
  });
  const fillWith = (wMm: number, hMm: number) => {
    const src = selImage ?? page.images[0];
    if (!src) { say('Add a photo first'); return; }
    const out = fillPage(page, src, wMm, hMm);
    if (out === page) { say('That size does not fit on this page'); return; }
    editPage(() => out); setSel(null);
  };
  const relayout = (pg: Page) => {
    if (pg.fill && pg.images[0]) return fillPage(pg, pg.images[0], pg.fill.wMm, pg.fill.hMm);
    return applyLayout(pg);
  };

  const setLayout = (l: LayoutId) => editPage((pg) => {
    const imgs = pg.images.slice(0, cellCount(l));
    return applyLayout({ ...pg, fill: undefined, layout: l, images: imgs });
  });

  const addText = () => {
    const t: PageText = { id: newId(), text: 'Text', x: 0.1, y: 0.1, sizePt: 24, color: '#12151C', bold: false };
    editPage((pg) => ({ ...pg, texts: [...pg.texts, t] }));
    setSel(t.id); setTab('text');
  };
  const updateText = (tid: string, patch: Partial<PageText>) =>
    editPage((pg) => ({ ...pg, texts: pg.texts.map((t) => (t.id === tid ? { ...t, ...patch } : t)) }));

  // ---- frames (ID photos)
  const selFrame = page.frames.find((f) => f.id === sel) ?? null;
  const updateFrame = (fid: string, patch: Partial<Frame>) =>
    editPage((pg) => ({ ...pg, frames: pg.frames.map((f) => (f.id === fid ? clampFrame({ ...f, ...patch }, pg.widthMm, pg.heightMm) : f)) }));
  const placePhoto = (fid: string, t: TrayItem) => {
    updateFrame(fid, { file: t.file, aspect: t.aspect, rot: 0, zoom: 1, cx: 0.5, cy: 0.5 });
    setSel(fid);
  };
  const addTray = async (files: FileList | null) => {
    if (!files?.length) return;
    say('Adding photos…');
    const items: TrayItem[] = [];
    for (const f of Array.from(files)) {
      try { const r = await importImage(f); seen.current.add(r.file); items.push({ id: newId(), file: r.file, aspect: r.aspect }); } catch { /* skip */ }
    }
    if (items.length) { edit((p) => ({ ...p, tray: [...p.tray, ...items] })); say(`Added ${items.length}`); } else say('Could not read that photo');
  };
  const addFrame = () => {
    let { w, h } = fsize;
    let spot = freeSpot(page, w, h);
    if (!spot) { spot = freeSpot(page, h, w); if (spot) [w, h] = [h, w]; }
    if (!spot) { say('No room for another frame on this page'); return; }
    const f = emptyFrame(spot.x, spot.y, w, h, page.widthMm, page.heightMm);
    editPage((pg) => ({ ...pg, frames: [...pg.frames, f] })); setSel(f.id);
  };
  const fillWithFrames = () => {
    const fr = fillFrames(page, fsize.w, fsize.h);
    if (!fr.length) { say('That size does not fit on this page'); return; }
    editPage((pg) => ({ ...pg, frames: fr })); setSel(fr[0].id);
  };
  const resizeFrame = (f: Frame, w: number, h: number) => editPage((pg) => ({
    ...pg, frames: pg.frames.map((q) => {
      if (q.id !== f.id) return q;
      const cx = q.x + q.w / 2, cy = q.y + q.h / 2, fw = w / pg.widthMm, fh = h / pg.heightMm;
      return clampFrame({ ...q, w: fw, h: fh, x: Math.min(1 - fw, Math.max(0, cx - fw / 2)), y: Math.min(1 - fh, Math.max(0, cy - fh / 2)) }, pg.widthMm, pg.heightMm);
    }),
  }));
  const rotateFrame = (f: Frame, dir: 1 | -1) => {
    let { cx, cy } = f;
    for (let k = 0; k < (dir === 1 ? 1 : 3); k++) [cx, cy] = [1 - cy, cx];
    updateFrame(f.id, { rot: (f.rot + dir + 4) % 4, cx, cy });
  };
  const copyToAll = (f: Frame) => editPage((pg) => ({
    ...pg, frames: pg.frames.map((q) => clampFrame({ ...q, file: f.file, aspect: f.aspect, rot: f.rot, zoom: f.zoom, cx: f.cx, cy: f.cy }, pg.widthMm, pg.heightMm)),
  }));
  const onCanvasSelect = (id: string | null, tap?: boolean) => {
    setSel(id);
    const f = id ? page.frames.find((q) => q.id === id) : null;
    if (!f) { setAdjust(false); return; }
    setTab('frames');
    if (tap && !f.file && selTray) { const t = proj.tray.find((x) => x.id === selTray); if (t) placePhoto(f.id, t); }
  };

  const goPage = (i: number) => { setPi(i); setSel(null); };
  const addPage = () => { edit((p) => ({ ...p, pages: [...p.pages, newPage(p.widthMm, p.heightMm)] })); goPage(proj.pages.length); };
  const dupPage = (i: number) => {
    edit((p) => {
      const src = p.pages[i];
      const copy: Page = { ...src, id: newId(), images: src.images.map((im) => ({ ...im, id: newId() })), texts: src.texts.map((t) => ({ ...t, id: newId() })), frames: src.frames.map((f) => ({ ...f, id: newId() })) };
      const pages = [...p.pages]; pages.splice(i + 1, 0, copy);
      return { ...p, pages };
    });
    goPage(i + 1);
  };
  const delPage = (i: number) => {
    if (proj.pages.length < 2) { say('A project needs at least one page'); return; }
    if (!confirm(`Delete page ${i + 1}? You can undo this.`)) return;
    edit((p) => ({ ...p, pages: p.pages.filter((_, k) => k !== i) }));
    goPage(Math.max(0, Math.min(i, proj.pages.length - 2)));
  };
  const movePage = (from: number, to: number) => {
    if (from === to) return;
    edit((p) => { const pages = [...p.pages]; const [m] = pages.splice(from, 1); pages.splice(to, 0, m); return { ...p, pages }; });
    goPage(to);
  };
  const renameProject = () => {
    const n = prompt('Project name', proj.name)?.trim();
    if (n) edit((p) => ({ ...p, name: n }));
  };

  if (exporting) return <Export project={proj} onBack={() => setExporting(false)} />;

  const sz = presetOf(page.widthMm, page.heightMm) ?? `${fmt(page.widthMm, unit)}×${fmt(page.heightMm, unit)} ${unit}`;
  const cropSides = selImage ? { l: selImage.crop.x, t: selImage.crop.y, r: 1 - selImage.crop.x - selImage.crop.w, b: 1 - selImage.crop.y - selImage.crop.h } : null;
  const gridLayout = page.layout !== 'free';

  return (
    <div className="screen">
      <header className="topbar">
        <button className="icon-btn" onClick={leave} aria-label="Back"><Back /></button>
        <button className="title-btn" onClick={renameProject}>
          <div className="t1">{proj.name}</div>
          <div className="t2 muted">{saved ? 'Saved' : 'Saving…'} · {sz}</div>
        </button>
        <button className="icon-btn" disabled={!hist.u} onClick={undo} aria-label="Undo"><Undo /></button>
        <button className="icon-btn" disabled={!hist.r} onClick={redo} aria-label="Redo"><Redo /></button>
        <button className="btn primary" onClick={() => setExporting(true)}>Export</button>
      </header>

      <PageCanvas page={page} pageNo={pi + 1} pageNumbers={proj.pageNumbers} unit={unit} selectedId={sel} onSelect={onCanvasSelect}
        onChange={updateImage} onChangeText={updateText} onSwap={swap} onChangeFrame={updateFrame}
        adjust={adjust && !!selFrame?.file} dropTarget={over} cutLines={proj.cutLines} hitRef={hit} />

      <div className="pager">
        <button className="icon-btn" disabled={pi === 0} onClick={() => goPage(pi - 1)} aria-label="Previous page"><Left /></button>
        <span>Page {pi + 1} of {proj.pages.length}</span>
        <button className="icon-btn" disabled={pi >= proj.pages.length - 1} onClick={() => goPage(pi + 1)} aria-label="Next page"><Right /></button>
      </div>

      <section className="panel">
        {tab === 'images' && (
          <div className="panel-body">
            <input ref={fileRef} type="file" accept="image/*" multiple hidden onChange={(e) => addImages(e.target.files)} />
            <div className="row">
              <button className="btn primary" onClick={() => fileRef.current?.click()}><Plus /> Add images</button>
              {selImage && <button className="btn danger-outline" onClick={() => removeImage(selImage.id)}><Trash /> Remove</button>}
            </div>
            {selImage && (
              <>
                <div className="tools">
                  <button className="btn" onClick={() => rotate(selImage, -1)} aria-label="Rotate left"><RotL /></button>
                  <button className="btn" onClick={() => rotate(selImage, 1)} aria-label="Rotate right"><RotR /></button>
                  <button className={'btn' + (cropOpen ? ' on' : '')} onClick={() => setCropOpen(!cropOpen)}>Crop</button>
                  {gridLayout ? <>
                    <button className="btn" onClick={() => fillCell(selImage)}>Fill cell</button>
                    <button className="btn" onClick={() => fitCell(selImage)}>Fit cell</button>
                  </> : null}
                  <button className="btn" onClick={() => order(selImage.id, 'front')}>To front</button>
                  <button className="btn" onClick={() => order(selImage.id, 'back')}>To back</button>
                </div>
                {cropOpen && cropSides && (['l', 'r', 't', 'b'] as const).map((s) => (
                  <label key={s} className="slider">
                    <span>{{ l: 'Left', r: 'Right', t: 'Top', b: 'Bottom' }[s]}</span>
                    <input type="range" min={0} max={0.45} step={0.01} value={cropSides[s]} onChange={(e) => setCropSide(selImage, s, Number(e.target.value))} />
                    <span className="muted val">{Math.round(cropSides[s] * 100)}%</span>
                  </label>
                ))}
              </>
            )}
            <p className="muted small">{page.images.length}{page.layout === 'free' ? '' : ` of ${cellCount(page.layout)}`} on this page. Drag to move, corners to resize{page.layout !== '1' && page.images.length > 1 ? ', drop on another photo to swap' : ''}.</p>
            <div className="strip">
              {page.images.map((im) => (
                <button key={im.id} className={'strip-item' + (im.id === sel ? ' on' : '')} onClick={() => setSel(im.id)}>
                  <PageThumb page={{ ...page, texts: [], images: [{ ...im, x: 0, y: 0, w: 1, h: 1 }], widthMm: dispAspect(im) * 100, heightMm: 100, border: { ...page.border, on: false } }} maxW={64} maxH={64} />
                </button>
              ))}
            </div>
          </div>
        )}
        {tab === 'layout' && (
          <div className="panel-body">
            <div className="chips">
              {LAYOUTS.map((l) => <button key={l.id} className={'chip' + (page.layout === l.id ? ' on' : '')} onClick={() => setLayout(l.id)}>{l.label}</button>)}
              {page.layout === 'free' && <button className="chip on">Custom</button>}
            </div>
            <Slider label="Margins" value={page.marginMm} max={50} unit={unit} onChange={(v) => editPage((pg) => relayout({ ...pg, marginMm: v }))} />
            <Slider label="Spacing" value={page.spacingMm} max={30} unit={unit} onChange={(v) => editPage((pg) => relayout({ ...pg, spacingMm: v }))} />
            <div className="field" style={{ marginTop: 4 }}>Print a photo at exact size (fills the page with copies)
              <div className="chips">
                {PHOTO_SIZES.map(([n, w, h]) => {
                  const c = fitCount(page, w, h);
                  return <button key={n} className="chip" disabled={!c} onClick={() => fillWith(w, h)}>{n}{c ? ` · ${c}` : ''}</button>;
                })}
              </div>
              <span className="muted small">Uses the selected photo (or the first one). Counts show how many fit with the current margins and spacing.</span>
            </div>
          </div>
        )}
        {tab === 'size' && <SizePanel key={page.id} page={page} unit={unit} onUnit={(u) => edit((p) => ({ ...p, unit: u }))}
          onApply={(w, h, all) => {
            edit((p) => ({
              ...p, widthMm: w, heightMm: h,
              pages: p.pages.map((pg, k) => (all || k === pi ? relayout({ ...pg, widthMm: w, heightMm: h }) : pg)),
            }));
            say('Size applied');
          }} />}
        {tab === 'style' && (
          <div className="panel-body">
            <label className="field-row">Background
              <input type="color" value={page.background} onChange={(e) => editPage((pg) => ({ ...pg, background: e.target.value }))} />
            </label>
            <label className="field-row">Border
              <input type="checkbox" checked={page.border.on} onChange={(e) => editPage((pg) => ({ ...pg, border: { ...pg.border, on: e.target.checked } }))} />
            </label>
            {page.border.on && (
              <>
                <Slider label="Border width" value={page.border.widthMm} max={10} step={0.5} unit={unit} onChange={(v) => editPage((pg) => ({ ...pg, border: { ...pg.border, widthMm: v } }))} />
                <label className="field-row">Border color
                  <input type="color" value={page.border.color} onChange={(e) => editPage((pg) => ({ ...pg, border: { ...pg.border, color: e.target.value } }))} />
                </label>
              </>
            )}
          </div>
        )}
        {tab === 'text' && (
          <div className="panel-body">
            <div className="row">
              <button className="btn primary" onClick={addText}><Plus /> Add text</button>
              {selText && <button className="btn danger-outline" onClick={() => { editPage((pg) => ({ ...pg, texts: pg.texts.filter((t) => t.id !== selText.id) })); setSel(null); }}><Trash /> Remove</button>}
            </div>
            {selText && (
              <>
                <label className="field" style={{ marginTop: 0 }}>Text
                  <input value={selText.text} onChange={(e) => updateText(selText.id, { text: e.target.value })} />
                </label>
                <label className="slider">
                  <span>Size</span>
                  <input type="range" min={6} max={120} value={selText.sizePt} onChange={(e) => updateText(selText.id, { sizePt: Number(e.target.value) })} />
                  <span className="muted val">{selText.sizePt} pt</span>
                </label>
                <label className="field-row">Color
                  <input type="color" value={selText.color} onChange={(e) => updateText(selText.id, { color: e.target.value })} />
                </label>
                <label className="field-row">Bold
                  <input type="checkbox" checked={selText.bold} onChange={(e) => updateText(selText.id, { bold: e.target.checked })} />
                </label>
              </>
            )}
            <label className="field-row">Page numbers (all pages)
              <input type="checkbox" checked={proj.pageNumbers} onChange={(e) => edit((p) => ({ ...p, pageNumbers: e.target.checked }))} />
            </label>
            <p className="muted small">Text uses a standard PDF font (Latin letters only; other characters print as "?").</p>
          </div>
        )}
        {tab === 'frames' && (
          <FramesPanel project={proj} page={page} unit={unit} frame={selFrame} selTray={selTray} adjust={adjust} size={fsize} hitRef={hit} setOver={setOver}
            onSize={(w, h) => setFsize({ w, h })} onAddFrame={addFrame} onFill={fillWithFrames}
            onClear={() => { editPage((pg) => ({ ...pg, frames: [] })); setSel(null); }}
            onAddPhotos={addTray} onSelectTray={setSelTray}
            onRemoveTray={(tid) => { edit((p) => ({ ...p, tray: p.tray.filter((t) => t.id !== tid) })); if (selTray === tid) setSelTray(null); }}
            onPlace={placePhoto} onFrame={(patch) => selFrame && updateFrame(selFrame.id, patch)}
            onRotate={(d) => selFrame && rotateFrame(selFrame, d)}
            onRemovePhoto={() => selFrame && updateFrame(selFrame.id, { file: '', zoom: 1, cx: 0.5, cy: 0.5, rot: 0 })}
            onSetSize={() => selFrame && resizeFrame(selFrame, fsize.w, fsize.h)} onCopyAll={() => selFrame && copyToAll(selFrame)}
            onDelete={() => { if (selFrame) { editPage((pg) => ({ ...pg, frames: pg.frames.filter((f) => f.id !== selFrame.id) })); setSel(null); } }}
            onAdjust={setAdjust} onCutLines={(b) => edit((p) => ({ ...p, cutLines: b }))} />
        )}
        {tab === 'pages' && <PagesPanel project={proj} current={pi} onSelect={goPage} onMove={movePage} onAdd={addPage} onDup={() => dupPage(pi)} onDel={() => delPage(pi)} />}
      </section>

      <nav className="tabs">
        {TABS.map(([t, label, Ic]) => (
          <button key={t} className={tab === t ? 'on' : ''} onClick={() => setTab(t)}><Ic /><span>{label}</span></button>
        ))}
      </nav>
      {toast && <div className="toast" role="status">{toast}</div>}
    </div>
  );
}

function FramesPanel(p: {
  project: Project; page: Page; unit: Unit; frame: Frame | null; selTray: string | null; adjust: boolean; size: { w: number; h: number };
  hitRef: React.MutableRefObject<((x: number, y: number) => string | null) | null>; setOver: (id: string | null) => void;
  onSize: (w: number, h: number) => void; onAddFrame: () => void; onFill: () => void; onClear: () => void;
  onAddPhotos: (f: FileList | null) => void; onSelectTray: (id: string | null) => void; onRemoveTray: (id: string) => void;
  onPlace: (frameId: string, t: TrayItem) => void; onFrame: (patch: Partial<Frame>) => void; onRotate: (d: 1 | -1) => void;
  onRemovePhoto: () => void; onSetSize: () => void; onCopyAll: () => void; onDelete: () => void; onAdjust: (b: boolean) => void; onCutLines: (b: boolean) => void;
}) {
  const { project, page, frame, unit, size } = p;
  const fileRef = useRef<HTMLInputElement>(null);
  const strip = useRef<HTMLDivElement>(null);
  const [ghost, setGhost] = useState<{ x: number; y: number; t: TrayItem } | null>(null);
  const ghostRef = useRef(ghost); ghostRef.current = ghost;
  const timer = useRef(0);
  const down0 = useRef({ x: 0, y: 0 });

  useEffect(() => {
    const el = strip.current!;
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
      p.setOver(p.hitRef.current?.(e.clientX, e.clientY) ?? null);
    } else if (timer.current && Math.hypot(e.clientX - down0.current.x, e.clientY - down0.current.y) > 10) {
      window.clearTimeout(timer.current); timer.current = 0; // user is scrolling the strip
    }
  };
  const up = (e: React.PointerEvent, t: TrayItem) => {
    const g = ghostRef.current;
    if (g) {
      const target = p.hitRef.current?.(e.clientX, e.clientY);
      if (target) p.onPlace(target, g.t);
      setGhost(null); p.setOver(null);
    } else if (timer.current) {
      window.clearTimeout(timer.current); timer.current = 0;
      if (frame && !frame.file) p.onPlace(frame.id, t);          // tap with an empty frame selected: place it
      else p.onSelectTray(p.selTray === t.id ? null : t.id);      // otherwise highlight it, then tap an empty frame
    }
  };
  const cancel = () => { window.clearTimeout(timer.current); timer.current = 0; setGhost(null); p.setOver(null); };

  return (
    <div className="panel-body">
      <input ref={fileRef} type="file" accept="image/*" multiple hidden onChange={(e) => { p.onAddPhotos(e.target.files); e.target.value = ''; }} />
      <div className="field" style={{ marginTop: 0 }}>Photos — tap one (with a frame selected), or touch and hold, then drag onto a frame
        <div className="strip" ref={strip}>
          <button className="strip-item add" onClick={() => fileRef.current?.click()} aria-label="Add photos"><Plus /></button>
          {project.tray.map((t) => (
            <div key={t.id} className={'strip-item tray' + (p.selTray === t.id ? ' on' : '')} role="button" aria-label="Photo"
              onPointerDown={(e) => down(e, t)} onPointerMove={move} onPointerUp={(e) => up(e, t)} onPointerCancel={cancel} onContextMenu={(e) => e.preventDefault()}>
              <PhotoThumb file={t.file} size={64} />
              <button className="x" aria-label="Remove photo from tray" onPointerDown={(e) => e.stopPropagation()} onClick={(e) => { e.stopPropagation(); p.onRemoveTray(t.id); }}>×</button>
            </div>
          ))}
        </div>
      </div>

      <div className="field">Frame size
        <div className="chips">
          {FRAME_SIZES.map(([n, w, h]) => <button key={n} className={'chip' + (Math.abs(size.w - w) < 0.2 && Math.abs(size.h - h) < 0.2 ? ' on' : '')} onClick={() => p.onSize(w, h)}>{n}</button>)}
        </div>
        <div className="row">
          <NumField label="Width" mm={size.w} unit={unit} onCommit={(mm) => p.onSize(mm, size.h)} />
          <NumField label="Height" mm={size.h} unit={unit} onCommit={(mm) => p.onSize(size.w, mm)} />
          <button className="btn" onClick={() => p.onSize(size.h, size.w)} aria-label="Swap width and height">⇄</button>
        </div>
      </div>
      <div className="row">
        <button className="btn primary" onClick={p.onAddFrame}><Plus /> Add frame</button>
        <button className="btn" onClick={p.onFill}>Fill page ({fillFramesCount(page, size.w, size.h)})</button>
        {page.frames.length > 0 && <button className="btn danger-outline" onClick={p.onClear}><Trash /> Clear</button>}
      </div>

      {frame ? (
        <div className="field">Selected frame · {fmt(frame.w * page.widthMm, unit)} × {fmt(frame.h * page.heightMm, unit)} {unit}
          {frame.file ? (
            <>
              <div className="tools">
                <button className={'btn' + (p.adjust ? ' on' : '')} onClick={() => p.onAdjust(!p.adjust)}>{p.adjust ? 'Done adjusting' : 'Move photo'}</button>
                <button className="btn" onClick={() => p.onRotate(-1)} aria-label="Rotate left"><RotL /></button>
                <button className="btn" onClick={() => p.onRotate(1)} aria-label="Rotate right"><RotR /></button>
                <button className="btn" onClick={p.onCopyAll}>Copy to all frames</button>
                <button className="btn" onClick={p.onRemovePhoto}>Remove photo</button>
              </div>
              <label className="slider"><span>Zoom</span>
                <input type="range" min={1} max={4} step={0.02} value={frame.zoom} onChange={(e) => p.onFrame({ zoom: Number(e.target.value) })} />
                <span className="muted val">{Math.round(frame.zoom * 100)}%</span></label>
              {p.adjust && <span className="muted small">Drag the photo inside the frame to position it.</span>}
            </>
          ) : <span className="muted small">Empty. Pick a photo above to put in it.</span>}
          <div className="tools">
            <button className="btn" onClick={p.onSetSize}>Set to {fmt(size.w, unit)}×{fmt(size.h, unit)} {unit}</button>
            <button className="btn danger-outline" onClick={p.onDelete}><Trash /> Delete frame</button>
          </div>
        </div>
      ) : <p className="muted small">Tap a frame on the page to select it. Drag it to move it.</p>}
      <label className="field-row">Cut lines around photos
        <input type="checkbox" checked={project.cutLines} onChange={(e) => p.onCutLines(e.target.checked)} />
      </label>

      {ghost && <div className="ghost" style={{ left: ghost.x, top: ghost.y }}><PhotoThumb file={ghost.t.file} size={72} /></div>}
    </div>
  );
}

const fillFramesCount = (page: Page, w: number, h: number) => fillFrames(page, w, h).length;

function Slider({ label, value, max, step = 1, unit, onChange }: { label: string; value: number; max: number; step?: number; unit: Unit; onChange: (v: number) => void }) {
  return (
    <label className="slider">
      <span>{label}</span>
      <input type="range" min={0} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} />
      <span className="muted val">{fmt(value, unit)} {unit}</span>
    </label>
  );
}

function SizePanel({ page, unit, onUnit, onApply }: { page: Page; unit: Unit; onUnit: (u: Unit) => void; onApply: (w: number, h: number, all: boolean) => void }) {
  const [wMm, setW] = useState(page.widthMm);
  const [hMm, setH] = useState(page.heightMm);
  const [all, setAll] = useState(false);
  const [wTxt, setWTxt] = useState(fmt(page.widthMm, unit));
  const [hTxt, setHTxt] = useState(fmt(page.heightMm, unit));
  useEffect(() => { setWTxt(fmt(wMm, unit)); setHTxt(fmt(hMm, unit)); }, [unit, wMm, hMm]);
  const landscape = wMm > hMm;
  const preset = presetOf(wMm, hMm);
  const setOrient = (land: boolean) => { if (land !== landscape) { setW(hMm); setH(wMm); } };
  const pick = (name: string) => { const [a, b] = PRESETS[name]; setW(landscape ? b : a); setH(landscape ? a : b); };
  const commit = (txt: string, set: (n: number) => void, cur: number) => {
    const v = toMm(parseFloat(txt.replace(',', '.')), unit);
    set(Number.isFinite(v) ? Math.min(MAX_MM, Math.max(MIN_MM, v)) : cur);
  };
  const k = Math.min(60 / wMm, 80 / hMm);
  return (
    <div className="panel-body">
      <div className="size-top">
        <div className="size-prev" style={{ width: wMm * k, height: hMm * k }} />
        <div>
          <div className="seg">
            <button className={!landscape ? 'on' : ''} onClick={() => setOrient(false)}>Portrait</button>
            <button className={landscape ? 'on' : ''} onClick={() => setOrient(true)}>Landscape</button>
          </div>
          <div className="muted small" style={{ marginTop: 6 }}>{preset ?? 'Custom'} · {fmt(wMm, unit)} × {fmt(hMm, unit)} {unit}</div>
        </div>
      </div>
      <div className="chips">
        {Object.keys(PRESETS).map((n) => <button key={n} className={'chip' + (preset === n ? ' on' : '')} onClick={() => pick(n)}>{n}</button>)}
        <button className={'chip' + (!preset ? ' on' : '')} onClick={() => { /* custom = edit fields */ }}>Custom</button>
      </div>
      <div className="row">
        <label className="field">Width
          <input inputMode="decimal" value={wTxt} onChange={(e) => setWTxt(e.target.value)} onBlur={() => commit(wTxt, setW, wMm)} />
        </label>
        <label className="field">Height
          <input inputMode="decimal" value={hTxt} onChange={(e) => setHTxt(e.target.value)} onBlur={() => commit(hTxt, setH, hMm)} />
        </label>
        <div className="seg">
          {(['mm', 'cm', 'in'] as Unit[]).map((u) => <button key={u} className={unit === u ? 'on' : ''} onClick={() => onUnit(u)}>{u}</button>)}
        </div>
      </div>
      <label className="check"><input type="checkbox" checked={all} onChange={(e) => setAll(e.target.checked)} /> Apply to all pages</label>
      <button className="btn primary wide" onClick={() => {
        const w = toMm(parseFloat(wTxt.replace(',', '.')), unit), h = toMm(parseFloat(hTxt.replace(',', '.')), unit);
        const cw = Number.isFinite(w) ? Math.min(MAX_MM, Math.max(MIN_MM, w)) : wMm;
        const ch = Number.isFinite(h) ? Math.min(MAX_MM, Math.max(MIN_MM, h)) : hMm;
        setW(cw); setH(ch); onApply(cw, ch, all);
      }}>Apply size</button>
    </div>
  );
}

function PagesPanel({ project, current, onSelect, onMove, onAdd, onDup, onDel }: {
  project: Project; current: number; onSelect: (i: number) => void; onMove: (from: number, to: number) => void;
  onAdd: () => void; onDup: () => void; onDel: () => void;
}) {
  const grid = useRef<HTMLDivElement>(null);
  const [drag, setDrag] = useState<{ from: number; over: number } | null>(null);
  const timer = useRef<number>(0);
  const dragRef = useRef(drag); dragRef.current = drag;

  // block scrolling while dragging (touch)
  useEffect(() => {
    const el = grid.current!;
    const stop = (e: TouchEvent) => { if (dragRef.current) e.preventDefault(); };
    el.addEventListener('touchmove', stop, { passive: false });
    return () => el.removeEventListener('touchmove', stop);
  }, []);

  const overIndex = (x: number, y: number) => {
    const el = document.elementFromPoint(x, y)?.closest('[data-pi]') as HTMLElement | null;
    return el ? Number(el.dataset.pi) : null;
  };
  const down = (e: React.PointerEvent, i: number) => {
    const { clientX, clientY } = e;
    const target = e.currentTarget as HTMLElement;
    const pid = e.pointerId;
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => {
      try { target.setPointerCapture(pid); } catch { /* ignore */ }
      setDrag({ from: i, over: i });
      navigator.vibrate?.(20);
    }, 350);
    void clientX; void clientY;
  };
  const move = (e: React.PointerEvent) => {
    if (!drag) return;
    const o = overIndex(e.clientX, e.clientY);
    if (o !== null && o !== drag.over) setDrag({ ...drag, over: o });
  };
  const up = (i: number) => {
    window.clearTimeout(timer.current);
    if (drag) { onMove(drag.from, drag.over); setDrag(null); } else onSelect(i);
  };
  const cancel = () => { window.clearTimeout(timer.current); setDrag(null); };

  return (
    <div className="panel-body">
      <p className="muted small">Touch and hold a page, then drag to reorder.</p>
      <div className="pgrid" ref={grid}>
        {project.pages.map((pg, i) => (
          <div key={pg.id} data-pi={i}
            className={'pcell' + (i === current ? ' on' : '') + (drag?.from === i ? ' dragging' : '') + (drag && drag.over === i && drag.from !== i ? ' target' : '')}
            onPointerDown={(e) => down(e, i)} onPointerMove={move} onPointerUp={() => up(i)} onPointerCancel={cancel}
            onContextMenu={(e) => e.preventDefault()}>
            <PageThumb page={pg} maxW={80} maxH={100} />
            <span className="small">{i + 1}</span>
          </div>
        ))}
      </div>
      <div className="row">
        <button className="btn" onClick={onAdd}><Plus /> Add page</button>
        <button className="btn" onClick={onDup}><Copy /> Duplicate</button>
        <button className="btn danger-outline" onClick={onDel}><Trash /> Delete</button>
      </div>
    </div>
  );
}

