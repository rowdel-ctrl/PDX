import { useCallback, useEffect, useRef, useState } from 'react';
import type { LayoutId, Page, PageImage, Project } from '../types';
import { listProjects, newPage, saveProject } from '../storage';
import { applyLayout, cellCount, LAYOUTS } from '../layout';
import { deleteImages, importImage, newId } from '../images';
import { fmt, fromMm, MAX_MM, MIN_MM, presetOf, PRESETS, toMm } from '../units';
import type { Unit } from '../types';
import PageCanvas from '../PageCanvas';
import PageThumb from '../PageThumb';
import Export from './Export';
import { Back, Copy, Grid, Image as ImageIcon, Left, Palette, Pages as PagesIcon, Plus, Right, Size, Trash } from '../icons';

type Tab = 'images' | 'layout' | 'size' | 'style' | 'pages';
const TABS: [Tab, string, () => React.ReactElement][] = [
  ['images', 'Images', ImageIcon], ['layout', 'Layout', Grid], ['size', 'Size', Size], ['style', 'Style', Palette], ['pages', 'Pages', PagesIcon],
];

export default function Editor({ id, onBack }: { id: string; onBack: () => void }) {
  const [proj, setProj] = useState<Project | null>(() => listProjects().find((p) => p.id === id) ?? null);
  const [pi, setPi] = useState(0);
  const [tab, setTab] = useState<Tab>('images');
  const [sel, setSel] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const [toast, setToast] = useState('');
  const [saved, setSaved] = useState(true);
  const fileRef = useRef<HTMLInputElement>(null);

  // autosave
  useEffect(() => {
    if (!proj) return;
    setSaved(false);
    const t = setTimeout(() => { saveProject(proj); setSaved(true); }, 400);
    return () => clearTimeout(t);
  }, [proj]);

  const say = (m: string) => { setToast(m); setTimeout(() => setToast(''), 2500); };
  const edit = useCallback((fn: (p: Project) => Project) => setProj((p) => (p ? fn(p) : p)), []);
  const editPage = useCallback((fn: (pg: Page) => Page, index?: number) =>
    edit((p) => { const i = index ?? pi; return { ...p, pages: p.pages.map((pg, k) => (k === i ? fn(pg) : pg)) }; }), [edit, pi]);

  if (!proj) return <div className="screen pad"><button className="btn" onClick={onBack}>Back</button><p>Project not found.</p></div>;
  const page = proj.pages[Math.min(pi, proj.pages.length - 1)];
  const unit = proj.unit;

  const addImages = async (files: FileList | null) => {
    if (!files?.length) return;
    say('Adding images…');
    let added = 0, full = false;
    try {
      const imported: { file: string; aspect: number }[] = [];
      for (const f of Array.from(files)) {
        try { imported.push(await importImage(f)); } catch { /* skip unreadable */ }
      }
      editPage((pg) => {
        let imgs = [...pg.images];
        const cap = cellCount(pg.layout);
        for (const im of imported) {
          if (imgs.length >= cap) { full = true; break; }
          imgs.push({ id: newId(), file: im.file, aspect: im.aspect, x: 0, y: 0, w: 0.5, h: 0.5 });
          added++;
        }
        return applyLayout({ ...pg, images: imgs });
      });
      // files that didn't fit are not kept
      if (full) { await deleteImages(imported.slice(added).map((i) => i.file)); say(`Page is full (${cellCount(page.layout)} max). Use a bigger layout or add a page.`); }
      else say(added ? `Added ${added}` : 'Could not read that image');
    } catch { say('Could not add images'); }
    if (fileRef.current) fileRef.current.value = '';
  };

  const removeImage = (imgId: string) => {
    const im = page.images.find((i) => i.id === imgId);
    editPage((pg) => applyLayout({ ...pg, images: pg.images.filter((i) => i.id !== imgId) }));
    setSel(null);
    if (im && !proj.pages.some((pg) => pg.images.some((i) => i.id !== imgId && i.file === im.file))) deleteImages([im.file]);
  };

  const updateImage = (imgId: string, patch: Partial<PageImage>) =>
    editPage((pg) => ({ ...pg, images: pg.images.map((i) => (i.id === imgId ? { ...i, ...patch } : i)) }));

  const setLayout = (l: LayoutId) => editPage((pg) => {
    const imgs = pg.images.slice(0, cellCount(l));
    deleteImages(pg.images.slice(cellCount(l)).map((i) => i.file));
    return applyLayout({ ...pg, layout: l, images: imgs });
  });

  const goPage = (i: number) => { setPi(i); setSel(null); };

  const addPage = () => { edit((p) => ({ ...p, pages: [...p.pages, newPage(p.widthMm, p.heightMm)] })); goPage(proj.pages.length); };
  const dupPage = (i: number) => {
    edit((p) => {
      const src = p.pages[i];
      const copy: Page = { ...src, id: newId(), images: src.images.map((im) => ({ ...im, id: newId() })) };
      const pages = [...p.pages]; pages.splice(i + 1, 0, copy);
      return { ...p, pages };
    });
    goPage(i + 1);
  };
  const delPage = (i: number) => {
    if (proj.pages.length < 2) { say("A project needs at least one page"); return; }
    if (!confirm(`Delete page ${i + 1}?`)) return;
    const gone = proj.pages[i];
    const keep = new Set(proj.pages.filter((_, k) => k !== i).flatMap((pg) => pg.images.map((im) => im.file)));
    deleteImages(gone.images.map((im) => im.file).filter((f) => !keep.has(f)));
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

  return (
    <div className="screen">
      <header className="topbar">
        <button className="icon-btn" onClick={() => { saveProject(proj); onBack(); }} aria-label="Back"><Back /></button>
        <button className="title-btn" onClick={renameProject}>
          <div className="t1">{proj.name}</div>
          <div className="t2 muted">{saved ? 'Saved' : 'Saving…'} · {sz}</div>
        </button>
        <button className="btn primary" onClick={() => setExporting(true)}>Export</button>
      </header>

      <PageCanvas page={page} selectedId={sel} onSelect={setSel} onChange={updateImage} />

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
              {sel && <button className="btn danger-outline" onClick={() => removeImage(sel)}><Trash /> Remove selected</button>}
            </div>
            <p className="muted small">{page.images.length} of {cellCount(page.layout)} on this page. Drag to move, drag corners to resize.</p>
            <div className="strip">
              {page.images.map((im) => (
                <button key={im.id} className={'strip-item' + (im.id === sel ? ' on' : '')} onClick={() => setSel(im.id)}>
                  <PageThumb page={{ ...page, images: [{ ...im, x: 0, y: 0, w: 1, h: 1 }], widthMm: im.aspect * 100, heightMm: 100, border: { ...page.border, on: false } }} maxW={72} maxH={72} />
                </button>
              ))}
            </div>
          </div>
        )}
        {tab === 'layout' && (
          <div className="panel-body">
            <div className="chips">
              {LAYOUTS.map((l) => <button key={l.id} className={'chip' + (page.layout === l.id ? ' on' : '')} onClick={() => setLayout(l.id)}>{l.label}</button>)}
            </div>
            <Slider label="Margins" value={page.marginMm} max={50} unit={unit} onChange={(v) => editPage((pg) => applyLayout({ ...pg, marginMm: v }))} />
            <Slider label="Spacing" value={page.spacingMm} max={30} unit={unit} onChange={(v) => editPage((pg) => applyLayout({ ...pg, spacingMm: v }))} />
            <p className="muted small">Changing layout, margins or spacing re-places the images on this page.</p>
          </div>
        )}
        {tab === 'size' && <SizePanel key={page.id} page={page} unit={unit} onUnit={(u) => edit((p) => ({ ...p, unit: u }))}
          onApply={(w, h, all) => {
            edit((p) => ({
              ...p, widthMm: w, heightMm: h,
              pages: p.pages.map((pg, k) => (all || k === pi ? applyLayout({ ...pg, widthMm: w, heightMm: h }) : pg)),
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

void fromMm;
