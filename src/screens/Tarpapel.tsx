import { useEffect, useRef, useState } from 'react';
import { buildTarpapelPdf, dpi, MAX_SHEETS, plan, type Orient, type TpSettings } from '../tarpapel';
import { loadPhoto, openPdf, type Source } from '../pdfsource';
import { savePdf, sharePdf } from '../files';
import { PRESETS } from '../units';
import { useBack } from '../back';
import { Back, Download, Image as ImageIcon, Share } from '../icons';

type U = 'mm' | 'cm' | 'in' | 'ft';
const MM: Record<U, number> = { mm: 1, cm: 10, in: 25.4, ft: 304.8 };
const show = (mm: number, u: U) => String(Math.round((mm / MM[u]) * 100) / 100);

function NumField({ label, mm, unit, onCommit }: { label: string; mm: number; unit: U; onCommit: (mm: number) => void }) {
  const [t, setT] = useState(show(mm, unit));
  useEffect(() => setT(show(mm, unit)), [mm, unit]);
  const commit = () => {
    const v = parseFloat(t.replace(',', '.')) * MM[unit];
    if (Number.isFinite(v) && v > 0) onCommit(v); else setT(show(mm, unit));
  };
  return (
    <label className="field">{label}
      <input inputMode="decimal" value={t} onChange={(e) => setT(e.target.value)} onBlur={commit} onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()} />
    </label>
  );
}

function Stepper({ label, value, onChange }: { label: string; value: number; onChange: (n: number) => void }) {
  return (
    <div className="field">{label}
      <div className="seg">
        <button onClick={() => onChange(Math.max(1, value - 1))} aria-label={`Fewer ${label}`}>−</button>
        <button className="on" style={{ minWidth: 56 }} tabIndex={-1}>{value}</button>
        <button onClick={() => onChange(Math.min(15, value + 1))} aria-label={`More ${label}`}>+</button>
      </div>
    </div>
  );
}

export default function Tarpapel({ onBack }: { onBack: () => void }) {
  const [src, setSrc] = useState<Source | null>(null);
  const [pdf, setPdf] = useState<Awaited<ReturnType<typeof openPdf>> | null>(null);
  const [pdfPage, setPdfPage] = useState(1);
  const [paper, setPaper] = useState('A4');
  const [unit, setUnit] = useState<U>('cm');
  const [name, setName] = useState('tarpapel');
  const [busy, setBusy] = useState('');
  const [msg, setMsg] = useState('');
  const [s, setS] = useState<TpSettings>({
    paperW: PRESETS.A4[0], paperH: PRESETS.A4[1], orient: 'auto', margin: 5, join: 'overlap', overlap: 10,
    mode: 'size', widthMm: 600, cols: 3, rows: 4, fill: false,
  });
  const fileRef = useRef<HTMLInputElement>(null);
  useBack(onBack);
  const set = (p: Partial<TpSettings>) => setS((o) => ({ ...o, ...p }));

  const pickFile = async (f: File | undefined) => {
    if (!f) return;
    setMsg(''); setBusy('Reading file…');
    try {
      pdf?.destroy(); setPdf(null);
      if (f.type === 'application/pdf' || /\.pdf$/i.test(f.name)) {
        const d = await openPdf(f); setPdf(d); setPdfPage(1);
        setSrc(await d.render(1));
      } else setSrc(await loadPhoto(f));
      setName(f.name.replace(/\.[^.]+$/, '') || 'tarpapel');
    } catch (e) { setMsg((e as Error).message || 'Could not open that file'); }
    finally { setBusy(''); if (fileRef.current) fileRef.current.value = ''; }
  };
  const gotoPage = async (n: number) => {
    if (!pdf || n < 1 || n > pdf.pages) return;
    setPdfPage(n); setBusy('Rendering page…');
    try { setSrc(await pdf.render(n)); } catch { setMsg('Could not render that page'); } finally { setBusy(''); }
  };

  const p = src ? plan(src.aspect, s) : null;
  const tooMany = !!p && p.count > MAX_SHEETS;
  const res = p && src ? dpi(src.pxW, p) : 0;

  const choosePaper = (n: string) => { setPaper(n); set({ paperW: PRESETS[n][0], paperH: PRESETS[n][1] }); };

  const run = async (kind: 'save' | 'share') => {
    if (!src) return;
    setMsg('');
    try {
      setBusy('Building PDF…');
      await new Promise((r) => setTimeout(r, 30)); // let the label paint
      const bytes = await buildTarpapelPdf(src.jpeg, src.aspect, s, name);
      if (kind === 'save') {
        try { setMsg(await savePdf(bytes, name)); }
        catch { await sharePdf(bytes, name); setMsg('Could not save directly, shared instead.'); }
      } else await sharePdf(bytes, name);
    } catch (e) {
      if (!/cancel/i.test(String((e as Error)?.message))) setMsg(`Export failed: ${(e as Error)?.message ?? 'unknown error'}`);
    } finally { setBusy(''); }
  };

  const pad = p ? Math.max(p.areaW, p.areaH) * 0.02 : 0;
  return (
    <div className="screen">
      <header className="topbar"><button className="icon-btn" onClick={onBack} aria-label="Back"><Back /></button><h2 className="grow">Tarpapel poster</h2></header>
      <main className="scroll pad">
        <input ref={fileRef} type="file" accept="image/*,application/pdf,.pdf" hidden onChange={(e) => pickFile(e.target.files?.[0])} />
        <button className="btn primary wide" style={{ marginTop: 0 }} onClick={() => fileRef.current?.click()}><ImageIcon /> {src ? 'Choose another photo or PDF' : 'Choose photo or PDF'}</button>
        {pdf && pdf.pages > 1 && (
          <div className="pager" style={{ background: 'none' }}>
            <button className="btn" disabled={pdfPage <= 1} onClick={() => gotoPage(pdfPage - 1)}>Prev</button>
            <span>PDF page {pdfPage} of {pdf.pages}</span>
            <button className="btn" disabled={pdfPage >= pdf.pages} onClick={() => gotoPage(pdfPage + 1)}>Next</button>
          </div>
        )}
        {!src && <p className="muted">Pick a photo or one page of a PDF. PDX splits it across sheets so, when printed and joined, it makes one big poster. Nothing here is saved, only the PDF you export.</p>}

        {src && p && (
          <>
            <svg className="tp-prev" viewBox={`${-pad} ${-pad} ${p.areaW + 2 * pad} ${p.areaH + 2 * pad}`} role="img" aria-label="Poster layout preview">
              <rect x={0} y={0} width={p.areaW} height={p.areaH} fill="#fff" stroke="#8a93a6" strokeWidth={0.5} vectorEffect="non-scaling-stroke" />
              <svg x={p.img.x} y={p.img.y} width={p.img.w} height={p.img.h} viewBox="0 0 1 1" preserveAspectRatio="none" overflow="hidden">
                <image href={src.preview} x={0} y={0} width={1} height={1} preserveAspectRatio="none" />
              </svg>
              {Array.from({ length: p.rows }).flatMap((_, r) => Array.from({ length: p.cols }).map((__, c) => (
                <g key={`${r}-${c}`}>
                  <rect x={c * p.stepX} y={r * p.stepY} width={p.cw} height={p.ch} fill="none" stroke={(r + c) % 2 ? '#FF2D95' : '#3D4DFF'} strokeWidth={1.5} strokeDasharray="4 3" vectorEffect="non-scaling-stroke" />
                  <text x={c * p.stepX + p.cw / 2} y={r * p.stepY + p.ch / 2} fontSize={Math.min(p.cw, p.ch) / 4} textAnchor="middle" dominantBaseline="central" fill="#fff" stroke="#000" strokeWidth={0.8} paintOrder="stroke" opacity={0.85}>{r * p.cols + c + 1}</text>
                </g>
              )))}
            </svg>
            <div className="summary">
              <div><b>{p.count}</b><span className="muted small">sheets ({p.cols} × {p.rows})</span></div>
              <div><b>{show(p.img.w, unit)} × {show(p.img.h, unit)}</b><span className="muted small">{unit} poster</span></div>
              <div><b>{Math.round(res)}</b><span className="muted small">DPI</span></div>
            </div>
            {res > 0 && res < 40 && <p className="warn">Low resolution: it will look blurry up close. Fine from a distance, or use a bigger source.</p>}
            {tooMany && <p className="warn">That's {p.count} sheets. The limit is {MAX_SHEETS}. Make the poster smaller.</p>}

            <div className="field">Final size
              <div className="seg">
                <button className={s.mode === 'size' ? 'on' : ''} onClick={() => set({ mode: 'size', widthMm: Math.max(50, p.img.w) })}>Exact size</button>
                <button className={s.mode === 'sheets' ? 'on' : ''} onClick={() => set({ mode: 'sheets', cols: p.cols, rows: p.rows })}>Sheets</button>
              </div>
            </div>
            {s.mode === 'size' ? (
              <div className="row">
                <NumField label="Width" mm={p.img.w} unit={unit} onCommit={(mm) => set({ widthMm: mm })} />
                <NumField label="Height" mm={p.img.h} unit={unit} onCommit={(mm) => set({ widthMm: mm * src.aspect })} />
                <div className="seg">{(['mm', 'cm', 'in', 'ft'] as U[]).map((u) => <button key={u} className={unit === u ? 'on' : ''} onClick={() => setUnit(u)}>{u}</button>)}</div>
              </div>
            ) : (
              <>
                <div className="row">
                  <Stepper label="Sheets across" value={s.cols} onChange={(n) => set({ cols: n })} />
                  <Stepper label="Sheets down" value={s.rows} onChange={(n) => set({ rows: n })} />
                </div>
                <label className="check"><input type="checkbox" checked={s.fill} onChange={(e) => set({ fill: e.target.checked })} /> Fill the sheets (crops the photo edges)</label>
              </>
            )}

            <div className="field">Paper
              <div className="chips">{Object.keys(PRESETS).map((n) => <button key={n} className={'chip' + (paper === n ? ' on' : '')} onClick={() => choosePaper(n)}>{n}</button>)}</div>
            </div>
            <div className="field">Sheet direction
              <div className="seg">{(['auto', 'portrait', 'landscape'] as Orient[]).map((o) => <button key={o} className={s.orient === o ? 'on' : ''} onClick={() => set({ orient: o })}>{o === 'auto' ? 'Auto (fewest)' : o[0].toUpperCase() + o.slice(1)}</button>)}</div>
            </div>
            <div className="field">Joining
              <div className="seg">
                <button className={s.join === 'overlap' ? 'on' : ''} onClick={() => set({ join: 'overlap' })}>Overlap and glue</button>
                <button className={s.join === 'trim' ? 'on' : ''} onClick={() => set({ join: 'trim' })}>Trim and tape</button>
              </div>
              <span className="muted small">{s.join === 'overlap'
                ? 'Each sheet repeats a strip of its neighbour. Trim the white border, then lay the sheet over the neighbour so the picture lines up, and glue.'
                : 'Sheets do not overlap. Cut along the corner marks, then tape the edges together.'}</span>
            </div>
            {s.join === 'overlap' && <label className="slider"><span>Overlap</span><input type="range" min={3} max={30} value={s.overlap} onChange={(e) => set({ overlap: Number(e.target.value) })} /><span className="muted val">{s.overlap} mm</span></label>}
            <label className="slider"><span>Printer border</span><input type="range" min={0} max={15} value={s.margin} onChange={(e) => set({ margin: Number(e.target.value) })} /><span className="muted val">{s.margin} mm</span></label>
            <p className="muted small">Printer border is the strip your printer can't print on. 5 mm suits most home printers. Print at 100% / "Actual size", not "Fit to page".</p>

            <label className="field">File name
              <div className="suffix"><input value={name} onChange={(e) => setName(e.target.value)} /><span>.pdf</span></div>
            </label>
            <button className="btn primary wide" disabled={!!busy || tooMany} onClick={() => run('save')}><Download /> Save to Files</button>
            <button className="btn wide" disabled={!!busy || tooMany} onClick={() => run('share')}><Share /> Share</button>
          </>
        )}
        {busy && <p className="muted" role="status">{busy}</p>}
        {msg && <p role="status">{msg}</p>}
      </main>
    </div>
  );
}
