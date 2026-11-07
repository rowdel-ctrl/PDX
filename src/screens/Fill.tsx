import { useEffect, useMemo, useRef, useState } from 'react';
import { PDFDocument, rgb } from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import { findPages } from '../cvpage';
import { pdfjs } from '../pdfsource';
import { applyFilter, canvasOf, canvasToBytes, decode, flatten } from '../scanlib';
import { findFields, nameDefaults, nameFields, pdfFields, tidy, type Field } from '../formfields';
import { FORM_FONTS, fontOf, loadFormFonts } from '../formfonts';
import { savePdf, sharePdf } from '../files';
import { askConfirm, Banner } from '../notify';
import { newId } from '../images';
import { useBack } from '../back';
import { Back, Close, Download, Image as ImageIcon, Left, Right, Share, Trash } from '../icons';

interface FPage { id: string; img: string; aspect: number; wPt: number; hPt: number; fields: Field[]; jpeg?: Uint8Array }
/** Something typed on the page. x, y, size are fractions of the page width/height. */
interface Item { id: string; page: number; kind: 'text' | 'tick'; text: string; x: number; y: number; size: number; font: string; color: string; field?: string }

const COLORS = ['#0F1115', '#1B2A6B', '#C62828', '#1565C0'];
const FIELD_PAGE_PX = 1500;

export default function Fill({ onBack, seed }: { onBack: () => void; seed?: Blob[] }) {
  const [pages, setPages] = useState<FPage[]>([]);
  const [items, setItems] = useState<Item[]>([]);
  const [pdfBytes, setPdfBytes] = useState<Uint8Array | null>(null);
  const [name, setName] = useState('Filled form');
  const [msg, setMsg] = useState<{ t: string; k: 'ok' | 'warn' | 'busy' } | null>(null);
  const [showBoxes, setShowBoxes] = useState(true);
  const [sel, setSel] = useState<string | null>(null);      // selected item
  const [act, setAct] = useState<string | null>(null);      // active field
  const [hidden, setHidden] = useState<string[]>([]);
  const [fontOpen, setFontOpen] = useState(false);
  const [def, setDef] = useState({ font: 'calibri', color: '#1B2A6B' });
  const [curPage, setCurPage] = useState(0);
  const [busy, setBusy] = useState(false);
  const pdfRef = useRef<HTMLInputElement>(null), camRef = useRef<HTMLInputElement>(null), galRef = useRef<HTMLInputElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const flash = (t: string, k: 'ok' | 'warn' | 'busy' = 'ok', ms = 2600) => { setMsg({ t, k }); if (k !== 'busy') window.setTimeout(() => setMsg((m) => (m?.t === t ? null : m)), ms); };
  useEffect(() => { loadFormFonts(); }, []);
  useEffect(() => { if (seed?.length) openImages(seed, true); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);

  const fields = useMemo(() => pages.flatMap((p, pi) => p.fields.filter((f) => !hidden.includes(f.id)).map((f) => ({ ...f, page: pi }))), [pages, hidden]);
  const textFields = fields.filter((f) => f.kind !== 'tick');
  const item = items.find((i) => i.id === sel) ?? null;
  const field = fields.find((f) => f.id === act) ?? null;
  const edit = (id: string, patch: Partial<Item>) => setItems((l) => l.map((i) => (i.id === id ? { ...i, ...patch } : i)));

  // ---- opening
  const openPdf = async (file: File) => {
    flash('Opening the form…', 'busy'); setBusy(true);
    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      const lib: any = await pdfjs();
      const doc = await lib.getDocument({ data: bytes.slice() }).promise;
      const out: FPage[] = [];
      for (let n = 1; n <= Math.min(doc.numPages, 30); n++) {
        const page = await doc.getPage(n); const v1 = page.getViewport({ scale: 1 });
        const vp = page.getViewport({ scale: FIELD_PAGE_PX / v1.width });
        const c = canvasOf(vp.width, vp.height); const ctx = c.getContext('2d')!; ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height);
        await page.render({ canvasContext: ctx, viewport: vp }).promise;
        let fl = await pdfFields(page, v1.width, v1.height);
        if (!fl.length) fl = findFields(c);
        fl = tidy(fl); await nameFields(page, fl); fl = nameDefaults(fl);
        out.push({ id: newId(), img: c.toDataURL('image/jpeg', 0.85), aspect: v1.width / v1.height, wPt: v1.width, hPt: v1.height, fields: fl });
      }
      doc.destroy();
      setPdfBytes(bytes); setPages(out); setName(file.name.replace(/\.pdf$/i, '') + ' filled'); setMsg(null);
      { const n = out.reduce((s, p) => s + p.fields.length, 0); flash(n ? `${n} ${n === 1 ? "place" : "places"} to fill found` : "No places to fill found. Tap anywhere to type."); }
    } catch { flash('Could not open that PDF', 'warn'); } finally { setBusy(false); }
  };
  const openImages = async (files: FileList | Blob[] | null, flat = false) => {
    if (!files?.length) return;
    flash('Finding the page…', 'busy'); setBusy(true);
    try {
      const out: FPage[] = [];
      for (const f of Array.from(files)) {
        let c = await decode(f, 2200);
        if (!flat) { const q = (await findPages(c))[0]; if (q) c = flatten(c, q, 2200); c = applyFilter(c, 'magic', 0); }
        const fl = nameDefaults(tidy(findFields(c)));
        out.push({ id: newId(), img: c.toDataURL('image/jpeg', 0.85), aspect: c.width / c.height, wPt: 595.28, hPt: 595.28 / (c.width / c.height), fields: fl, jpeg: await canvasToBytes(c, 0.88) });
      }
      setPdfBytes(null); setPages(out); setMsg(null);
      { const n = out.reduce((s, p) => s + p.fields.length, 0); flash(n ? `${n} ${n === 1 ? "place" : "places"} to fill found` : "No places to fill found. Tap anywhere to type."); }
    } catch (e) { flash((e as Error).message || 'Could not open that picture', 'warn'); } finally { setBusy(false); }
  };

  // ---- placing things
  const sizeFor = (f: Field, p: FPage) => Math.min(0.045, Math.max(0.012, f.h * (p.hPt / p.wPt) * 0.72));
  const placeInField = (f: Field & { page: number }, text: string) => {
    const p = pages[f.page]; const size = sizeFor(f, p); const hFrac = size * (p.wPt / p.hPt);
    const it: Item = { id: newId(), page: f.page, kind: 'text', text, field: f.id, x: f.x + 0.004, y: f.y + f.h - hFrac * 0.95, size, font: def.font, color: def.color };
    setItems((l) => [...l, it]); setSel(it.id); return it;
  };
  const setText = (v: string) => {
    if (item && item.kind === 'text') { edit(item.id, { text: v }); return; }
    if (field) placeInField(field, v);
  };
  const tapField = (f: Field & { page: number }) => {
    setCurPage(f.page);
    if (f.kind === 'tick') {
      const ex = items.find((i) => i.field === f.id);
      if (ex) { setItems((l) => l.filter((i) => i.id !== ex.id)); setSel(null); }
      else { const size = Math.min(0.05, f.w * 0.95); setItems((l) => [...l, { id: newId(), page: f.page, kind: 'tick', text: '', field: f.id, x: f.x + f.w * 0.03, y: f.y + f.h * 0.03, size, font: def.font, color: def.color }]); }
      setAct(null); return;
    }
    setAct(f.id); const ex = items.find((i) => i.field === f.id); setSel(ex?.id ?? null);
    setTimeout(() => inputRef.current?.focus(), 30);
  };
  const addText = (text = '') => {
    const p = pages[curPage]; if (!p) return;
    const it: Item = { id: newId(), page: curPage, kind: 'text', text, x: 0.15, y: 0.15, size: 0.022, font: def.font, color: def.color };
    setItems((l) => [...l, it]); setSel(it.id); setAct(null); setTimeout(() => inputRef.current?.focus(), 30);
  };
  const addAt = (e: React.MouseEvent, pi: number) => {
    if (sel || act) { setSel(null); setAct(null); setFontOpen(false); return; } // first tap just lets go
    const r = e.currentTarget.getBoundingClientRect(); const p = pages[pi];
    const size = 0.022, hFrac = size * (p.wPt / p.hPt);
    const it: Item = { id: newId(), page: pi, kind: 'text', text: '', x: Math.min(0.9, Math.max(0, (e.clientX - r.left) / r.width)), y: Math.min(0.97, Math.max(0, (e.clientY - r.top) / r.height - hFrac / 2)), size, font: def.font, color: def.color };
    setCurPage(pi); setItems((l) => [...l, it]); setSel(it.id); setTimeout(() => inputRef.current?.focus(), 30);
  };
  const addTick = () => { if (!pages[curPage]) return; const it: Item = { id: newId(), page: curPage, kind: 'tick', text: '', x: 0.2, y: 0.2, size: 0.03, font: def.font, color: def.color }; setItems((l) => [...l, it]); setSel(it.id); setAct(null); };
  const addDate = () => {
    const d = new Date(); const t = `${String(d.getMonth() + 1).padStart(2, '0')} / ${String(d.getDate()).padStart(2, '0')} / ${d.getFullYear()}`;
    if (field) { const ex = items.find((i) => i.field === field.id); if (ex) { edit(ex.id, { text: t }); setSel(ex.id); } else placeInField(field, t); } else addText(t);
  };
  const jump = (dir: 1 | -1) => {
    if (!textFields.length) return;
    const i = textFields.findIndex((f) => f.id === act);
    const nx = textFields[(i + dir + textFields.length) % textFields.length] ?? textFields[0];
    tapField(nx);
    setTimeout(() => document.getElementById('fld-' + nx.id)?.scrollIntoView({ block: 'center', behavior: 'smooth' }), 40);
  };
  const remove = () => {
    if (item) { setItems((l) => l.filter((i) => i.id !== item.id)); setSel(null); }
    else if (field) { setHidden((h) => [...h, field.id]); setAct(null); }
  };
  const style = (patch: Partial<Item>) => { if (patch.font) setDef((d) => ({ ...d, font: patch.font! })); if (patch.color) setDef((d) => ({ ...d, color: patch.color! })); if (item) edit(item.id, patch); };

  // ---- moving typed text
  const startDrag = (it: Item) => (e: React.PointerEvent) => {
    e.stopPropagation(); setSel(it.id); setAct(it.field ?? null); setCurPage(it.page);
    const wrap = (e.currentTarget as HTMLElement).parentElement!; const r = wrap.getBoundingClientRect();
    const sx = e.clientX, sy = e.clientY, ox = it.x, oy = it.y; let moved = false;
    const move = (ev: PointerEvent) => { if (!moved && Math.hypot(ev.clientX - sx, ev.clientY - sy) < 5) return; moved = true; edit(it.id, { x: ox + (ev.clientX - sx) / r.width, y: oy + (ev.clientY - sy) / r.height }); };
    const up = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); };
    window.addEventListener('pointermove', move); window.addEventListener('pointerup', up);
  };

  // ---- saving
  const build = async (): Promise<Uint8Array> => {
    await loadFormFonts();
    const doc = pdfBytes ? await PDFDocument.load(pdfBytes) : await PDFDocument.create();
    doc.registerFontkit(fontkit);
    if (!pdfBytes) for (const p of pages) { const pg = doc.addPage([p.wPt, p.hPt]); pg.drawImage(await doc.embedJpg(p.jpeg!), { x: 0, y: 0, width: p.wPt, height: p.hPt }); }
    const cache = new Map<string, Awaited<ReturnType<typeof doc.embedFont>>>();
    const get = async (id: string) => { let f = cache.get(id); if (!f) { f = await doc.embedFont(new Uint8Array(await (await fetch(fontOf(id).url)).arrayBuffer()), { subset: true }); cache.set(id, f); } return f; };
    const hex = (c: string) => rgb(parseInt(c.slice(1, 3), 16) / 255, parseInt(c.slice(3, 5), 16) / 255, parseInt(c.slice(5, 7), 16) / 255);
    for (const it of items) {
      const pg = doc.getPage(it.page); const { width: W, height: H } = pg.getSize();
      const sz = it.size * W; const col = hex(it.color);
      if (it.kind === 'tick') {
        const x = it.x * W, top = H - it.y * H, t = sz * 0.1;
        pg.drawLine({ start: { x: x + sz * 0.17, y: top - sz * 0.52 }, end: { x: x + sz * 0.4, y: top - sz * 0.78 }, thickness: t, color: col });
        pg.drawLine({ start: { x: x + sz * 0.4, y: top - sz * 0.78 }, end: { x: x + sz * 0.85, y: top - sz * 0.22 }, thickness: t, color: col });
      } else if (it.text) {
        const f = await get(it.font); const m = (f as any).font; const upm = m?.unitsPerEm ?? 1000; const asc = (m?.ascent ?? 900) / upm, desc = -(m?.descent ?? -200) / upm;
        const base = ((1 - (asc + desc)) / 2 + asc) * sz;
        pg.drawText(it.text, { x: it.x * W, y: H - it.y * H - base, size: sz, font: f, color: col });
      }
    }
    return doc.save();
  };
  const finish = async (share: boolean) => {
    flash('Making your PDF…', 'busy'); setBusy(true);
    try { const b = await build(); if (share) await sharePdf(b, name); else flash(await savePdf(b, name)); if (share) setMsg(null); }
    catch { flash('Could not make the PDF', 'warn'); } finally { setBusy(false); }
  };

  const leave = async () => {
    if (fontOpen) { setFontOpen(false); return; }
    if (items.length && !(await askConfirm({ title: 'Leave without saving?', body: 'What you typed will be lost.', ok: 'Leave', danger: true }))) return;
    onBack();
  };
  useBack(leave);

  const total = fields.length;
  const idx = field ? textFields.findIndex((f) => f.id === field.id) + 1 : 0;
  const showBar = !!(field || (item && item.kind === 'text') || item);

  return (
    <div className="screen fill">
      <header className="topbar">
        <button className="icon-btn" onClick={leave} aria-label="Back"><Back /></button>
        <div className="grow title">{pages.length ? name : 'Fill a form'}</div>
        {pages.length > 0 && <button className="btn primary" disabled={busy} onClick={() => finish(true)}><Share /> Share</button>}
        {pages.length > 0 && <button className="icon-btn" disabled={busy} onClick={() => finish(false)} aria-label="Save PDF"><Download /></button>}
      </header>
      {msg && <Banner text={msg.t} kind={msg.k} />}

      {!pages.length ? (
        <div className="scan-empty">
          <p className="muted">Open a PDF or scan a form. Places to write are found for you. Tap one and type.</p>
          <button className="btn primary wide" disabled={busy} onClick={() => pdfRef.current?.click()}>Open a PDF</button>
          <button className="btn tonal wide" disabled={busy} onClick={() => camRef.current?.click()}><ImageIcon /> Scan with camera</button>
          <button className="btn tonal wide" disabled={busy} onClick={() => galRef.current?.click()}><ImageIcon /> Pick from gallery</button>
        </div>
      ) : (
        <>
          <div className="fill-tools">
            <button className="btn tonal" onClick={() => addText()}>+ Text</button>
            <button className="btn tonal" onClick={addTick}>✓ Tick</button>
            <button className="btn tonal" onClick={addDate}>Date</button>
            <span className="grow" />
            <button className={'btn' + (showBoxes ? ' on' : '')} aria-pressed={showBoxes} onClick={() => setShowBoxes((s) => !s)}>Auto-detect {showBoxes ? 'on' : 'off'}{total > 0 ? ` · ${total}` : ''}</button>
          </div>
          <p className="muted small fill-hint">{showBoxes && total === 0 ? 'No places to fill were found. ' : ''}Tap anywhere on the page to type.</p>
          <main className="scroll fill-pages" onPointerDown={(e) => { if (e.target === e.currentTarget) { setSel(null); setAct(null); setFontOpen(false); } }}>
            {pages.map((p, pi) => (
              <div key={p.id} className="fill-page" style={{ aspectRatio: String(p.aspect) }} onClick={(e) => { if (e.target === e.currentTarget || (e.target as HTMLElement).tagName === 'IMG') addAt(e, pi); }}>
                <img src={p.img} alt={`Page ${pi + 1}`} draggable={false} />
                {showBoxes && p.fields.filter((f) => !hidden.includes(f.id)).map((f) => (
                  <button key={f.id} id={'fld-' + f.id} className={'fill-box' + (act === f.id ? ' on' : '') + (items.some((i) => i.field === f.id) ? ' done' : '')} aria-label={f.label}
                    style={{ left: `${f.x * 100}%`, top: `${f.y * 100}%`, width: `${f.w * 100}%`, height: `${f.h * 100}%` }}
                    onPointerDown={(e) => e.stopPropagation()} onClick={() => tapField({ ...f, page: pi })} />
                ))}
                {items.filter((i) => i.page === pi).map((i) => (
                  <div key={i.id} className={'fill-item' + (sel === i.id ? ' on' : '')} onPointerDown={startDrag(i)}
                    style={{ left: `${i.x * 100}%`, top: `${i.y * 100}%`, fontSize: `${i.size * 100}cqw`, color: i.color, fontFamily: `'${fontOf(i.font).family}', sans-serif` }}>
                    {i.kind === 'tick' ? <svg viewBox="0 0 24 24" style={{ width: '1em', height: '1em', display: 'block' }}><path d="M4 12.5l5 5L20 5.5" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" /></svg> : (i.text || ' ')}
                  </div>
                ))}
              </div>
            ))}
            <div style={{ height: 140 }} />
          </main>
          {showBar && (
            <div className="fill-bar" onPointerDown={(e) => e.stopPropagation()}>
              <div className="fill-bar-top">
                <div className="grow-text"><span className="muted small">{field && idx ? `Field ${idx} of ${textFields.length}` : item?.kind === 'tick' ? 'Tick' : 'Text'}</span><br /><b>{field?.label ?? (item?.kind === 'tick' ? 'Drag it into place' : 'Type here')}</b></div>
                {field && textFields.length > 1 && (<><button className="icon-btn" onClick={() => jump(-1)} aria-label="Previous field"><Left /></button><button className="btn primary" onClick={() => jump(1)}>Next <Right /></button></>)}
              </div>
              {(!item || item.kind === 'text') && (
                <input ref={inputRef} className="fill-input" placeholder="Type here" value={item?.kind === 'text' ? item.text : ''} onChange={(e) => setText(e.target.value)}
                  style={{ fontFamily: `'${fontOf(item?.font ?? def.font).family}', sans-serif` }} onKeyDown={(e) => { if (e.key === 'Enter') { if (field && textFields.length > 1) jump(1); else (e.target as HTMLInputElement).blur(); } }} />
              )}
              <div className="fill-style">
                <button className="fill-font" aria-haspopup="listbox" aria-expanded={fontOpen} onClick={() => setFontOpen((o) => !o)} style={{ fontFamily: `'${fontOf(item?.font ?? def.font).family}', sans-serif` }}>{fontOf(item?.font ?? def.font).label} ⌄</button>
                <div className="fill-size">
                  <button onClick={() => item && edit(item.id, { size: Math.max(0.008, item.size * 0.92) })} aria-label="Smaller">−</button>
                  <span>{item ? Math.round(item.size * (pages[item.page]?.wPt ?? 595)) : '—'}</span>
                  <button onClick={() => item && edit(item.id, { size: Math.min(0.12, item.size * 1.09) })} aria-label="Bigger">+</button>
                </div>
                {COLORS.map((c) => <button key={c} className={'fill-col' + ((item?.color ?? def.color) === c ? ' on' : '')} style={{ background: c }} aria-label={`Colour ${c}`} onClick={() => style({ color: c })} />)}
                <button className="icon-btn" onClick={remove} aria-label={item ? 'Delete' : 'Not a field'}>{item ? <Trash /> : <Close />}</button>
              </div>
              {fontOpen && (
                <div className="fill-fontlist" role="listbox" aria-label="Fonts">
                  {FORM_FONTS.map((f) => (
                    <button key={f.id} role="option" aria-selected={(item?.font ?? def.font) === f.id} className={(item?.font ?? def.font) === f.id ? 'on' : ''} onClick={() => { style({ font: f.id }); setFontOpen(false); }} style={{ fontFamily: `'${f.family}', sans-serif` }}>{f.label}</button>
                  ))}
                </div>
              )}
            </div>
          )}
        </>
      )}
      <input ref={pdfRef} type="file" accept="application/pdf" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) openPdf(f); e.target.value = ''; }} />
      <input ref={camRef} type="file" accept="image/*" capture="environment" hidden onChange={(e) => { openImages(e.target.files); e.target.value = ''; }} />
      <input ref={galRef} type="file" accept="image/*" multiple hidden onChange={(e) => { openImages(e.target.files); e.target.value = ''; }} />
    </div>
  );
}
