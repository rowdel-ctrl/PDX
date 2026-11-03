import { useEffect, useRef, useState } from 'react';
import { buildTarpapelPdf, dpi, MAX_SHEETS, pageCount, plan, type Orient, type TpSettings } from '../tarpapel';
import { loadPhoto, openPdf, type Source } from '../pdfsource';
import { savePdf, sharePdf } from '../files';
import { PRESETS } from '../units';
import { useBack } from '../back';
import { Segmented, SliderRow, Switch } from '../ui';
import { Back, Download, Edit, Image as ImageIcon, Share, Wand } from '../icons';

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

const MiniOverlap = () => (
  <svg width="62" height="34" viewBox="0 0 62 34" aria-hidden><rect x="1" y="3" width="34" height="28" rx="3" fill="#C9D6F5" stroke="#7C5CFF" strokeWidth="1.5" /><rect x="27" y="3" width="34" height="28" rx="3" fill="#F5C9D2" stroke="#7C5CFF" strokeWidth="1.5" /><rect x="27" y="3" width="8" height="28" fill="#7C5CFF" opacity=".35" /></svg>
);
const MiniTrim = () => (
  <svg width="62" height="34" viewBox="0 0 62 34" aria-hidden><rect x="1" y="3" width="29" height="28" rx="3" fill="#C9D6F5" stroke="#7C5CFF" strokeWidth="1.5" /><rect x="32" y="3" width="29" height="28" rx="3" fill="#F5C9D2" stroke="#7C5CFF" strokeWidth="1.5" /><rect x="26" y="12" width="10" height="10" fill="#FFE08A" opacity=".9" /></svg>
);

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
    mode: 'size', widthMm: 600, cols: 3, rows: 4, fill: false, cutLines: true, glueShade: true, guidePage: true,
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
  const pages = p ? pageCount(p, s) : 0;
  const overlap = s.join === 'overlap';

  const choosePaper = (n: string) => { setPaper(n); if (n !== 'Custom') set({ paperW: PRESETS[n][0], paperH: PRESETS[n][1] }); };
  const setCustom = (w: number, h: number) => { setPaper('Custom'); set({ paperW: Math.min(w, h), paperH: Math.max(w, h) }); };

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
      <input ref={fileRef} type="file" accept="image/*,application/pdf,.pdf" hidden onChange={(e) => pickFile(e.target.files?.[0])} />
      <main className="scroll tp-main">
        {!src && (
          <div className="tp-card tp-empty">
            <p className="muted" style={{ margin: 0 }}>Pick a photo or one page of a PDF. PDX splits it across sheets so, when printed and joined, it makes one big poster.</p>
            <button className="btn primary wide" onClick={() => fileRef.current?.click()}><ImageIcon /> Choose photo or PDF</button>
          </div>
        )}

        {src && p && (
          <>
            <div className="tp-hero">
              <div className="tp-hero-img">
                <svg className="tp-prev" viewBox={`${-pad} ${-pad} ${p.areaW + 2 * pad} ${p.areaH + 2 * pad}`} role="img" aria-label="Poster layout preview">
                  <rect x={0} y={0} width={p.areaW} height={p.areaH} fill="#fff" />
                  <svg x={p.img.x} y={p.img.y} width={p.img.w} height={p.img.h} viewBox="0 0 1 1" preserveAspectRatio="none" overflow="hidden">
                    <image href={src.preview} x={0} y={0} width={1} height={1} preserveAspectRatio="none" />
                  </svg>
                  {overlap && p.overlap > 0 && <>
                    {Array.from({ length: p.cols - 1 }).map((_, c) => <rect key={'v' + c} x={(c + 1) * p.stepX} y={0} width={p.overlap} height={p.areaH} fill="#7C5CFF" opacity={0.22} />)}
                    {Array.from({ length: p.rows - 1 }).map((_, r) => <rect key={'h' + r} x={0} y={(r + 1) * p.stepY} width={p.areaW} height={p.overlap} fill="#7C5CFF" opacity={0.22} />)}
                  </>}
                  {Array.from({ length: p.rows }).flatMap((_, r) => Array.from({ length: p.cols }).map((__, c) => (
                    <g key={`${r}-${c}`}>
                      <rect x={c * p.stepX} y={r * p.stepY} width={p.cw} height={p.ch} fill="none" stroke="#7C5CFF" strokeWidth={1.5} strokeDasharray="5 4" vectorEffect="non-scaling-stroke" />
                      <text x={c * p.stepX + p.cw / 2} y={r * p.stepY + p.ch / 2} fontSize={Math.min(p.cw, p.ch) / 4} textAnchor="middle" dominantBaseline="central" fill="#fff" stroke="#1B1B2F" strokeWidth={0.9} paintOrder="stroke" fontFamily="Poppins, sans-serif" fontWeight={600}>{r * p.cols + c + 1}</text>
                    </g>
                  )))}
                </svg>
                <span className="tp-chip tl">{p.count} sheets · {p.cols} × {p.rows}</span>
                <span className="tp-chip tr">{show(p.img.w, 'cm')} × {show(p.img.h, 'cm')} cm</span>
                {res > 0 && res < 40 && <span className="tp-chip warn-chip">Low resolution · {Math.round(res)} DPI</span>}
              </div>
              <div className="tp-source">
                <span className="tp-thumb" style={{ backgroundImage: `url(${src.preview})` }} />
                <span className="grow-text"><b>{pdf ? 'PDF' : 'Photo'}</b>{pdf ? ` · page ${pdfPage} of ${pdf.pages}` : ` · ${Math.round(res)} DPI at this size`}</span>
                {pdf && pdf.pages > 1 && <>
                  <button className="icon-btn" disabled={pdfPage <= 1} onClick={() => gotoPage(pdfPage - 1)} aria-label="Previous PDF page">‹</button>
                  <button className="icon-btn" disabled={pdfPage >= pdf.pages} onClick={() => gotoPage(pdfPage + 1)} aria-label="Next PDF page">›</button>
                </>}
                <button className="btn tonal" onClick={() => fileRef.current?.click()}>Change</button>
              </div>
            </div>
            {tooMany && <p className="warn">That's {p.count} sheets. The limit is {MAX_SHEETS}. Make the poster smaller.</p>}

            <section className="tp-card">
              <div className="tp-head"><h3>Size</h3>
                <Segmented value={s.mode} onChange={(m) => set(m === 'size' ? { mode: 'size', widthMm: Math.max(50, p.img.w) } : { mode: 'sheets', cols: p.cols, rows: p.rows })} options={[['size', 'Exact size'], ['sheets', 'Sheets']]} />
              </div>
              {s.mode === 'size' ? (
                <div className="row">
                  <NumField label="Width" mm={p.img.w} unit={unit} onCommit={(mm) => set({ widthMm: mm })} />
                  <NumField label="Height" mm={p.img.h} unit={unit} onCommit={(mm) => set({ widthMm: mm * src.aspect })} />
                  <Segmented<U> value={unit} onChange={setUnit} options={[['mm', 'mm'], ['cm', 'cm'], ['in', 'in'], ['ft', 'ft']]} />
                </div>
              ) : (
                <>
                  <div className="row">
                    <Stepper label="Sheets across" value={s.cols} onChange={(n) => set({ cols: n })} />
                    <Stepper label="Sheets down" value={s.rows} onChange={(n) => set({ rows: n })} />
                  </div>
                  <Switch label="Fill the sheets" hint="Crops the photo edges instead of fitting it" checked={s.fill} onChange={(b) => set({ fill: b })} />
                </>
              )}
            </section>

            <section className="tp-card">
              <div className="tp-head"><h3>Paper</h3></div>
              <div className="chips">
                {Object.keys(PRESETS).map((n) => <button key={n} className={'chip' + (paper === n ? ' on' : '')} aria-pressed={paper === n} onClick={() => choosePaper(n)}>{n}</button>)}
                <button className={'chip custom' + (paper === 'Custom' ? ' on' : '')} aria-pressed={paper === 'Custom'} onClick={() => choosePaper('Custom')}><Edit /> Custom</button>
              </div>
              {paper === 'Custom' && (
                <>
                  <div className="row">
                    <NumField label="Paper width" mm={s.paperW} unit={unit} onCommit={(mm) => setCustom(mm, s.paperH)} />
                    <NumField label="Paper height" mm={s.paperH} unit={unit} onCommit={(mm) => setCustom(s.paperW, mm)} />
                    <Segmented<U> value={unit} onChange={setUnit} options={[['mm', 'mm'], ['cm', 'cm'], ['in', 'in']]} />
                  </div>
                  <span className="muted small">Sheet {show(s.paperW, unit)} × {show(s.paperH, unit)} {unit}. Your printer must handle this paper.</span>
                </>
              )}
              <div className="tp-line"><span>Direction</span>
                <Segmented<Orient> value={s.orient} onChange={(o) => set({ orient: o })} options={[['auto', 'Auto'], ['portrait', 'Portrait'], ['landscape', 'Landscape']]} />
              </div>
            </section>

            <section className="tp-card">
              <div className="tp-head"><h3>How will you join the sheets?</h3></div>
              <div className="join-cards">
                <button className={'join-card' + (overlap ? ' on' : '')} aria-pressed={overlap} onClick={() => set({ join: 'overlap' })}>
                  <MiniOverlap /><b>Overlap and glue</b><span>Strip to glue. Easy to line up.</span>
                </button>
                <button className={'join-card' + (!overlap ? ' on' : '')} aria-pressed={!overlap} onClick={() => set({ join: 'trim' })}>
                  <MiniTrim /><b>Trim and tape</b><span>Cut edges, tape together.</span>
                </button>
              </div>
              {overlap && <SliderRow label="Overlap" value={s.overlap} min={3} max={30} suffix={`${s.overlap} mm`} onChange={(v) => set({ overlap: v })} />}
              <SliderRow label="Printer border" value={s.margin} min={0} max={15} suffix={`${s.margin} mm`} onChange={(v) => set({ margin: v })} />
              <span className="muted small">Printer border is the strip your printer can't print on. 5 mm suits most home printers. Print at "Actual size", not "Fit to page".</span>
            </section>

            <section className="tp-card">
              <div className="tp-head"><h3>Cut guides on every sheet</h3></div>
              <Switch label="Cut lines with scissors" hint="Red dashed line shows where to cut" checked={s.cutLines} onChange={(b) => set({ cutLines: b })} />
              <Switch label="Shade the glue strip" hint={overlap ? 'Marks where the next sheet goes' : 'Only for overlap and glue'} checked={s.glueShade && overlap} onChange={(b) => set({ glueShade: b })} />
              <Switch label="Assembly guide page" hint="A map and steps as the first page" checked={s.guidePage} onChange={(b) => set({ guidePage: b })} />
            </section>

            <label className="field tp-name">File name
              <div className="suffix"><input value={name} onChange={(e) => setName(e.target.value)} /><span>.pdf</span></div>
            </label>
          </>
        )}
        {busy && <p className="muted" role="status">{busy}</p>}
        {msg && <p role="status">{msg}</p>}
      </main>

      {src && p && (
        <div className="tp-actions">
          <button className="btn primary tp-save" disabled={!!busy || tooMany} onClick={() => run('save')}><Download /> Save PDF <small>{pages} {pages === 1 ? 'page' : 'pages'}</small></button>
          <button className="btn tonal tp-share" disabled={!!busy || tooMany} onClick={() => run('share')} aria-label="Share"><Share /></button>
        </div>
      )}
    </div>
  );
}
void Wand;
