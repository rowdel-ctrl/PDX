import { useCallback, useEffect, useRef, useState } from 'react';
import { applyFilter, canvasOf, decode, defaultQuad, detectCorners, flatten, rotate, toBlob, type Filter, type Pt } from '../scanlib';
import { recognize, type OcrPage } from '../ocr';
import { scansToPdf } from '../scanout';
import { savePdf, sharePdf, saveFiles } from '../files';
import { importImage, newId, FULL } from '../images';
import { gridBox } from '../layout';
import { newProject, saveProject } from '../storage';
import { askChoice, askConfirm, Banner } from '../notify';
import { useBack } from '../back';
import { SliderRow, Switch } from '../ui';
import { Back, Close, Copy, Crop, Download, Image as ImageIcon, Left, Plus, Right, RotR, Share, Trash, Type, Wand } from '../icons';

interface SP { id: string; src: Blob; quad: Pt[]; rot: number; filter: Filter; bright: number; thumb: string; ocr?: OcrPage }

const FILTERS: [Filter, string, string][] = [['orig', 'Original', '#E8E4DA'], ['magic', 'Magic', '#FFFFFF'], ['bw', 'Black & white', '#FFFFFF'], ['gray', 'Gray', '#C9C9CF']];

function useSize<T extends HTMLElement>() {
  const ref = useRef<T>(null); const [s, setS] = useState({ w: 0, h: 0 });
  useEffect(() => { const el = ref.current; if (!el) return; const ro = new ResizeObserver(() => setS({ w: el.clientWidth, h: el.clientHeight })); ro.observe(el); return () => ro.disconnect(); }, []);
  return [ref, s] as const;
}
const fit = (aspect: number, w: number, h: number) => (w / h > aspect ? { w: h * aspect, h } : { w, h: w / aspect });

async function renderPage(p: SP, src: HTMLCanvasElement, maxPx: number) {
  return applyFilter(rotate(flatten(src, p.quad, maxPx), p.rot), p.filter, p.bright);
}
function thumbOf(c: HTMLCanvasElement) {
  const k = 120 / Math.max(c.width, c.height); const t = canvasOf(c.width * k, c.height * k);
  t.getContext('2d')!.drawImage(c, 0, 0, t.width, t.height); return t.toDataURL('image/jpeg', 0.7);
}

export default function Scan({ onBack, onOpen }: { onBack: () => void; onOpen: (id: string) => void }) {
  const [pages, setPages] = useState<SP[]>([]);
  const [cur, setCur] = useState(0);
  const [mode, setMode] = useState<'corners' | 'edit'>('edit');
  const [msg, setMsg] = useState<{ t: string; k: 'ok' | 'warn' | 'busy' } | null>(null);
  const [preview, setPreview] = useState('');
  const [srcUrl, setSrcUrl] = useState(''); const [srcAspect, setSrcAspect] = useState(1);
  const [saving, setSaving] = useState(false); const [name, setName] = useState('Scan'); const [searchable, setSearchable] = useState(true);
  const [text, setText] = useState<{ busy: boolean; value: string } | null>(null);
  const camRef = useRef<HTMLInputElement>(null), galRef = useRef<HTMLInputElement>(null);
  const srcCache = useRef<{ id: string; c: HTMLCanvasElement } | null>(null);
  const [stageRef, stage] = useSize<HTMLDivElement>();
  const p = pages[cur] as SP | undefined;
  const flash = (t: string, k: 'ok' | 'warn' | 'busy' = 'ok', ms = 2600) => { setMsg({ t, k }); if (k !== 'busy') window.setTimeout(() => setMsg((m) => (m?.t === t ? null : m)), ms); };

  const upd = useCallback((id: string, patch: Partial<SP>) => setPages((l) => l.map((x) => {
    if (x.id !== id) return x;
    const changes = 'quad' in patch || 'rot' in patch || 'filter' in patch || 'bright' in patch;
    return { ...x, ...patch, ...(changes ? { ocr: undefined } : {}) };
  })), []);
  const sourceOf = async (sp: SP) => {
    if (srcCache.current?.id === sp.id) return srcCache.current.c;
    const c = await decode(sp.src, 2200); srcCache.current = { id: sp.id, c }; return c;
  };

  // picture shown in the corner editor
  useEffect(() => {
    if (!p || mode !== 'corners') return;
    const u = URL.createObjectURL(p.src); setSrcUrl(u);
    sourceOf(p).then((c) => setSrcAspect(c.width / c.height));
    return () => URL.revokeObjectURL(u);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [p?.id, mode]);

  // flattened preview
  const key = p ? `${p.id}|${p.quad.map((q) => q.x.toFixed(4) + q.y.toFixed(4)).join()}|${p.rot}|${p.filter}|${p.bright}` : '';
  useEffect(() => {
    if (!p || mode !== 'edit') return;
    let dead = false;
    const t = window.setTimeout(async () => {
      try {
        const out = await renderPage(p, await sourceOf(p), 1100);
        if (dead) return;
        setPreview(out.toDataURL('image/jpeg', 0.85));
        const th = thumbOf(out);
        setPages((l) => l.map((x) => (x.id === p.id ? { ...x, thumb: th } : x)));
      } catch (e) { flash((e as Error).message, 'warn'); }
    }, 60);
    return () => { dead = true; window.clearTimeout(t); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, mode]);

  const add = async (files: FileList | null) => {
    if (!files?.length) return;
    flash('Finding the page…', 'busy');
    try {
      const added: SP[] = [];
      for (const f of Array.from(files)) {
        const c = await decode(f, 2200); const quad = detectCorners(c) ?? defaultQuad();
        const sp: SP = { id: newId(), src: await toBlob(c, 0.9), quad, rot: 0, filter: 'magic', bright: 0, thumb: thumbOf(c) };
        srcCache.current = { id: sp.id, c }; added.push(sp);
      }
      setCur(pages.length); setPages((l) => [...l, ...added]);
      setMode(added.length === 1 ? 'corners' : 'edit');
      setMsg(null);
    } catch (e) { flash((e as Error).message, 'warn'); }
  };
  const pick = async () => {
    const v = await askChoice({ title: pages.length ? 'Add a page' : 'Scan', options: [{ value: 'cam', label: 'Camera', hint: 'Take a picture of the page' }, { value: 'gal', label: 'Gallery', hint: 'Pick one or more pictures' }] });
    if (v === 'cam') camRef.current?.click(); else if (v === 'gal') galRef.current?.click();
  };

  const auto = async () => { if (!p) return; const c = await sourceOf(p); const q = detectCorners(c); if (q) { upd(p.id, { quad: q }); flash('Page found'); } else { upd(p.id, { quad: defaultQuad() }); flash('No clear page edge. Drag the corners.', 'warn'); } };

  const del = async () => {
    if (!p) return;
    if (pages.length > 1 && !(await askConfirm({ title: 'Delete this page?', ok: 'Delete', danger: true }))) return;
    const i = cur; setPages((l) => l.filter((x) => x.id !== p.id)); setCur(Math.max(0, i - (i === pages.length - 1 ? 1 : 0)));
    if (pages.length === 1) setMode('edit');
  };
  const move = (d: number) => setPages((l) => { const j = cur + d; if (j < 0 || j >= l.length) return l; const a = [...l]; [a[cur], a[j]] = [a[j], a[cur]]; setCur(j); return a; });

  const finals = async () => { const out: HTMLCanvasElement[] = []; for (const sp of pages) out.push(await renderPage(sp, await decode(sp.src, 2200), 2200)); return out; };
  const buildPdf = async () => {
    flash('Making your PDF…', 'busy');
    const cs = await finals();
    let texts: (OcrPage | null)[] | undefined;
    if (searchable) { texts = []; for (let i = 0; i < cs.length; i++) { flash(`Reading text, page ${i + 1} of ${cs.length}…`, 'busy'); texts.push(pages[i].ocr ?? (await recognize(cs[i]))); } }
    const bytes = await scansToPdf(cs, texts); setMsg(null); return bytes;
  };
  const save = async (share: boolean) => {
    try { const b = await buildPdf(); if (share) await sharePdf(b, name); else flash(await savePdf(b, name)); setSaving(false); } catch (e) { flash((e as Error).message || 'Could not make the PDF', 'warn'); }
  };

  const readText = async () => {
    if (!p) return;
    setText({ busy: true, value: '' });
    try {
      const o = p.ocr ?? (await recognize(await renderPage(p, await decode(p.src, 2200), 2200)));
      upd(p.id, { ocr: o }); setPages((l) => l.map((x) => (x.id === p.id ? { ...x, ocr: o } : x)));
      setText({ busy: false, value: o.text || 'No text found on this page.' });
    } catch { setText(null); flash('Could not read the text', 'warn'); }
  };
  const copyText = async () => { try { await navigator.clipboard.writeText(text?.value ?? ''); flash('Copied'); } catch { flash('Could not copy', 'warn'); } };
  const saveText = async () => { flash(await saveFiles([{ bytes: new TextEncoder().encode(text?.value ?? ''), name: `${name || 'Scan'}.txt`, mime: 'text/plain' }])); };

  const toPage = async () => {
    const size = await askChoice({ title: 'Put on a page', body: 'Your scans are placed on one page. You can move and resize them there.', options: [{ value: 'a4', label: 'A4', hint: '210 × 297 mm' }, { value: 'letter', label: 'Letter', hint: '8.5 × 11 in' }, { value: 'legal', label: 'Legal', hint: '8.5 × 13 in' }] });
    if (!size) return;
    const [w, h] = size === 'a4' ? [210, 297] : size === 'letter' ? [215.9, 279.4] : [215.9, 330.2];
    flash('Setting up the page…', 'busy');
    try {
      const proj = newProject('Scans', w, h); const pg = proj.pages[0];
      const infos: { file: string; aspect: number }[] = [];
      for (const c of await finals()) infos.push(await importImage(await toBlob(c, 0.9)));
      pg.images = infos.map((inf, i) => ({ id: newId(), file: inf.file, aspect: inf.aspect, rot: 0, crop: FULL, ...gridBox(pg, inf.aspect, i, infos.length) }));
      saveProject(proj); onOpen(proj.id);
    } catch (e) { flash((e as Error).message || 'Could not set up the page', 'warn'); }
  };

  const leave = async () => {
    if (saving) { setSaving(false); return; }
    if (text) { setText(null); return; }
    if (mode === 'corners' && pages.length) { setMode('edit'); return; }
    if (pages.length && !(await askConfirm({ title: 'Leave without saving?', body: 'Your scanned pages will be lost.', ok: 'Leave', danger: true }))) return;
    onBack();
  };
  useBack(leave);

  // dragging a corner
  const wrapRef = useRef<HTMLDivElement>(null);
  const drag = (i: number) => (e: React.PointerEvent) => {
    e.preventDefault(); (e.target as HTMLElement).setPointerCapture(e.pointerId);
    const move = (ev: PointerEvent) => {
      const r = wrapRef.current!.getBoundingClientRect(); if (!p) return;
      const x = Math.min(1, Math.max(0, (ev.clientX - r.left) / r.width)), y = Math.min(1, Math.max(0, (ev.clientY - r.top) / r.height));
      setPages((l) => l.map((s) => (s.id === p.id ? { ...s, quad: s.quad.map((q, j) => (j === i ? { x, y } : q)), ocr: undefined } : s)));
    };
    const up = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); };
    window.addEventListener('pointermove', move); window.addEventListener('pointerup', up);
  };

  const box = fit(srcAspect, Math.max(1, stage.w), Math.max(1, stage.h));

  return (
    <div className="screen scan">
      <header className="topbar">
        <button className="icon-btn" onClick={leave} aria-label="Back"><Back /></button>
        <div className="grow title">{mode === 'corners' ? 'Find the page' : pages.length ? `Scan · ${pages.length} ${pages.length === 1 ? 'page' : 'pages'}` : 'Scan'}</div>
        {mode === 'corners' && p && <button className="btn primary" onClick={() => setMode('edit')}>Done</button>}
        {mode === 'edit' && pages.length > 0 && <button className="btn primary" onClick={() => setSaving(true)}>Save</button>}
      </header>
      {msg && <Banner text={msg.t} kind={msg.k} />}

      <div className="scan-stage" ref={stageRef}>
        {!p && (
          <div className="scan-empty">
            <p className="muted">Scan a paper, ID or form. The page is found and straightened for you.</p>
            <button className="btn primary wide" onClick={() => camRef.current?.click()}><ImageIcon /> Camera</button>
            <button className="btn tonal wide" onClick={() => galRef.current?.click()}><ImageIcon /> Gallery</button>
          </div>
        )}
        {p && mode === 'corners' && srcUrl && (
          <div ref={wrapRef} className="scan-wrap" style={{ width: box.w, height: box.h }}>
            <img src={srcUrl} alt="" draggable={false} />
            <svg viewBox="0 0 1 1" preserveAspectRatio="none" className="scan-poly"><polygon points={p.quad.map((q) => `${q.x},${q.y}`).join(' ')} vectorEffect="non-scaling-stroke" /></svg>
            {p.quad.map((q, i) => <span key={i} className="scan-handle" role="slider" aria-label={`Corner ${i + 1}`} style={{ left: `${q.x * 100}%`, top: `${q.y * 100}%` }} onPointerDown={drag(i)} />)}
          </div>
        )}
        {p && mode === 'edit' && (preview ? <img className="scan-prev" src={preview} alt="Scanned page" /> : <span className="muted">Working…</span>)}
      </div>

      {p && mode === 'corners' && (
        <div className="scan-panel">
          <p className="muted small" style={{ margin: 0 }}>Drag the four corners onto the corners of the page.</p>
          <div className="row">
            <button className="btn tonal" onClick={auto}><Wand /> Find page again</button>
            <button className="btn" onClick={() => upd(p.id, { quad: defaultQuad() })}>Reset</button>
          </div>
        </div>
      )}

      {p && mode === 'edit' && (
        <div className="scan-panel">
          <div className="scan-looks">
            {FILTERS.map(([f, label, col]) => (
              <button key={f} className={'scan-look' + (p.filter === f ? ' on' : '')} onClick={() => upd(p.id, { filter: f })} aria-pressed={p.filter === f}>
                <span className="scan-sw" style={{ background: col, borderColor: f === 'bw' ? 'var(--text)' : undefined }} />{label}
              </button>
            ))}
          </div>
          <SliderRow label="Brightness" value={Math.round(p.bright * 100)} min={-100} max={100} suffix="" onChange={(v) => upd(p.id, { bright: v / 100 })} />
          <div className="scan-strip">
            {pages.map((x, i) => (
              <button key={x.id} className={'scan-th' + (i === cur ? ' on' : '')} onClick={() => setCur(i)} aria-label={`Page ${i + 1}`}><img src={x.thumb} alt="" /><span>{i + 1}</span></button>
            ))}
            <button className="scan-th add" onClick={pick} aria-label="Add a page"><Plus /></button>
          </div>
          <div className="scan-bar">
            <button onClick={() => move(-1)} disabled={cur === 0} aria-label="Move page earlier"><Left /><span>Earlier</span></button>
            <button onClick={() => move(1)} disabled={cur >= pages.length - 1} aria-label="Move page later"><Right /><span>Later</span></button>
            <button onClick={() => upd(p.id, { rot: (p.rot + 1) % 4 })}><RotR /><span>Rotate</span></button>
            <button onClick={() => setMode('corners')}><Crop /><span>Crop</span></button>
            <button onClick={readText}><Type /><span>Text</span></button>
            <button onClick={toPage}><Copy /><span>To page</span></button>
            <button onClick={del}><Trash /><span>Delete</span></button>
          </div>
        </div>
      )}

      <input ref={camRef} type="file" accept="image/*" capture="environment" hidden onChange={(e) => { add(e.target.files); e.target.value = ''; }} />
      <input ref={galRef} type="file" accept="image/*" multiple hidden onChange={(e) => { add(e.target.files); e.target.value = ''; }} />

      {saving && (
        <div className="sheet-back" onClick={() => setSaving(false)}>
          <div className="sheet" role="dialog" aria-label="Save" onClick={(e) => e.stopPropagation()}>
            <div className="sheet-grab" />
            <div className="sheet-head"><b>Save as PDF</b><button className="icon-btn" onClick={() => setSaving(false)} aria-label="Close"><Close /></button></div>
            <label className="field">Name<input value={name} onChange={(e) => setName(e.target.value)} /></label>
            <Switch checked={searchable} onChange={setSearchable} label="Make the PDF searchable" hint="The page looks the same, but the text can be selected and searched." />
            <div className="row" style={{ marginTop: 12 }}>
              <button className="btn primary grow" onClick={() => save(false)}><Download /> Save</button>
              <button className="btn tonal grow" onClick={() => save(true)}><Share /> Share</button>
            </div>
          </div>
        </div>
      )}
      {text && (
        <div className="sheet-back" onClick={() => setText(null)}>
          <div className="sheet" role="dialog" aria-label="Recognised text" onClick={(e) => e.stopPropagation()}>
            <div className="sheet-grab" />
            <div className="sheet-head"><b>Recognised text</b><button className="icon-btn" onClick={() => setText(null)} aria-label="Close"><Close /></button></div>
            <p className="muted small" style={{ margin: '0 0 8px' }}>English · done on your phone</p>
            {text.busy ? <p className="muted">Reading the page…</p> : <textarea className="scan-text" readOnly value={text.value} />}
            <div className="row" style={{ marginTop: 10 }}>
              <button className="btn tonal grow" disabled={text.busy} onClick={copyText}><Copy /> Copy all</button>
              <button className="btn tonal grow" disabled={text.busy} onClick={saveText}><Download /> Save as text</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
