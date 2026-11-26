import { useEffect, useRef, useState } from 'react';
import { Banner } from '../notify';
import { buildTestSheet, getScale } from '../printer';
import { findLowRes, LOW_DPI, SHARP_DPI, type LowPhoto } from '../quality';
import type { Project, Quality } from '../types';
import { buildPdf } from '../pdf';
import { savePdf, saveFiles, sharePdf, shareFiles, type OutFile } from '../files';
import { openPdf, pdfToImages } from '../pdfsource';
import { fmt, presetOf } from '../units';
import { Download, Share } from '../icons';

type Fmt = 'pdf' | 'png' | 'jpg';
const safeName = (n: string) => n.trim().replace(/[\\/:*?"<>|]+/g, '_') || 'document';
const Q: [Quality, string][] = [['small', 'Small'], ['standard', 'Standard'], ['high', 'High']];

/** Bottom sheet over the editor: name, quality, save or share the PDF. */
export default function ExportSheet({ project, onClose, onShrink, onShow, onPrinterCheck }: { project: Project; onClose: () => void; onShrink: (page: number, id: string, factor: number) => void; onShow: (page: number, id: string) => void; onPrinterCheck: () => void }) {
  const [name, setName] = useState(project.name);
  const [quality, setQuality] = useState<Quality>('standard');
  const [fmt0, setFmt] = useState<Fmt>('pdf');
  const [dpi, setDpi] = useState(150);
  const [busy, setBusy] = useState('');
  const [msg, setMsg] = useState('');
  const [low, setLow] = useState<LowPhoto[]>([]);
  const [warnOpen, setWarnOpen] = useState(true);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewPage, setPreviewPage] = useState(1);
  const [previewPages, setPreviewPages] = useState(0);
  const [previewImage, setPreviewImage] = useState('');
  const [previewError, setPreviewError] = useState('');
  const [showSafeArea, setShowSafeArea] = useState(true);
  const previewDoc = useRef<Awaited<ReturnType<typeof openPdf>> | null>(null);
  const previewRequest = useRef(0);
  useEffect(() => { let on = true; findLowRes(project).then((l) => on && setLow(l)); return () => { on = false; }; }, [project]);
  useEffect(() => () => previewDoc.current?.destroy(), []);
  const shrinkable = low.filter((l) => l.kind === 'image');
  const pg = project.pages[0];
  const sizes = new Set(project.pages.map((p) => `${p.widthMm}x${p.heightMm}`));
  const sizeLabel = sizes.size > 1 ? 'Mixed sizes' : presetOf(pg.widthMm, pg.heightMm) ?? `${fmt(pg.widthMm, project.unit)}×${fmt(pg.heightMm, project.unit)} ${project.unit}`;
  const previewSize = project.pages[previewPage - 1] ?? pg;

  const renderPreviewPage = async (doc: NonNullable<typeof previewDoc.current>, pageNo: number) => {
    const request = ++previewRequest.current;
    setBusy(`Rendering preview… ${pageNo}/${doc.pages}`);
    try {
      const source = await doc.render(pageNo, 1200);
      if (request === previewRequest.current) { setPreviewImage(source.preview); setPreviewError(''); setPreviewPage(pageNo); }
    } catch (e) {
      if (request === previewRequest.current) {
        const message = (e as Error)?.message ?? 'Could not render this page.';
        setPreviewError(message); setMsg(`Preview failed: ${message}`);
      }
    } finally {
      if (request === previewRequest.current) setBusy('');
    }
  };

  const preview = async () => {
    setMsg('');
    try {
      setBusy('Building preview…');
      const bytes = await buildPdf(project, quality, undefined, { noScale: fmt0 !== 'pdf' });
      const doc = await openPdf(new Blob([bytes as BlobPart], { type: 'application/pdf' }));
      previewDoc.current?.destroy();
      previewDoc.current = doc;
      setPreviewPages(doc.pages);
      setPreviewPage(1);
      setPreviewImage('');
      setPreviewError('');
      setPreviewOpen(true);
      await renderPreviewPage(doc, 1);
    } catch (e) {
      setMsg(`Preview failed: ${(e as Error)?.message ?? 'Could not build the PDF preview.'}`);
      setBusy('');
    }
  };

  const closePreview = () => {
    previewRequest.current++;
    previewDoc.current?.destroy();
    previewDoc.current = null;
    setPreviewImage('');
    setPreviewError('');
    setPreviewOpen(false);
    setBusy('');
  };

  const saveCalibrationSheet = async () => {
    setMsg('');
    try {
      setBusy('Preparing calibration sheet…');
      const bytes = await buildTestSheet();
      setMsg(await savePdf(bytes, `${safeName(name)}-printer-test`));
    } catch (e) {
      setMsg(`Calibration sheet failed: ${(e as Error)?.message ?? 'Could not create the test sheet.'}`);
    } finally { setBusy(''); }
  };

  const run = async (kind: 'save' | 'share') => {
    setMsg('');
    try {
      setBusy('Building…');
      const bytes = await buildPdf(project, quality, (n, t) => setBusy(`Building… ${n}/${t}`), { noScale: fmt0 !== 'pdf' });
      if (fmt0 === 'pdf') {
        if (kind === 'save') {
          try { setMsg(await savePdf(bytes, name)); }
          catch { setBusy('Opening share sheet…'); await sharePdf(bytes, name); setMsg('Could not save directly, shared instead.'); }
        } else await sharePdf(bytes, name);
      } else {
        const imgs = await pdfToImages(bytes, dpi, fmt0, (n, t) => setBusy(`Making pictures… ${n}/${t}`));
        const base = safeName(name), mime = fmt0 === 'png' ? 'image/png' : 'image/jpeg';
        const files: OutFile[] = imgs.map((b, i) => ({ bytes: b, mime, name: `${base}${imgs.length > 1 ? `-${i + 1}` : ''}.${fmt0}` }));
        if (kind === 'save') setMsg(await saveFiles(files)); else await shareFiles(files);
      }
    } catch (e) {
      if (!/cancel/i.test(String((e as Error)?.message))) setMsg(`Export failed: ${(e as Error)?.message ?? 'unknown error'}`);
    } finally { setBusy(''); }
  };

  return (
    <div className="sheet-back" onClick={onClose}>
      <div className="sheet" role="dialog" aria-label="Share" onClick={(e) => e.stopPropagation()}>
        <div className="sheet-grab" />
        <div className="sheet-head"><b>Save or share</b><button className="icon-btn" onClick={onClose} aria-label="Close">✕</button></div>
        <p className="muted small" style={{ margin: '0 0 4px' }}>{project.pages.length} {project.pages.length === 1 ? 'page' : 'pages'} · {sizeLabel}</p>
        {low.length > 0 && warnOpen && (
          <div className="lowres" role="alert">
            <b>{low.length} {low.length === 1 ? 'photo' : 'photos'} may print blurry</b>
            <span className="muted small">Sharp prints need about 300 dots per inch (dpi). These are below {LOW_DPI}.</span>
            {low.slice(0, 4).map((l) => (
              <div key={l.page + l.id} className="lowres-row">
                <span><b>{l.label}</b><span className="muted small"> {l.dpi} dpi at {Math.round(l.wMm)} × {Math.round(l.hMm)} mm</span></span>
                <button className="btn tonal" onClick={() => onShow(l.page, l.id)}>Show</button>
              </div>
            ))}
            {low.length > 4 && <span className="muted small">and {low.length - 4} more</span>}
            {shrinkable.length > 0 && <button className="btn tonal" onClick={() => shrinkable.forEach((l) => onShrink(l.page, l.id, Math.max(0.2, l.dpi / SHARP_DPI)))}>Shrink loose photos to sharp size</button>}
            <button className="btn" onClick={() => setWarnOpen(false)}>Hide this</button>
          </div>
        )}
        {getScale() !== 1 && <p className="muted small" style={{ margin: 0 }}>Printer correction is on ({(getScale() * 100).toFixed(1)}%). Change it in Printer check on the home screen.</p>}
        <div className="print-check">
          <b>Print preview and calibration</b>
          <span>Preview the generated pages, including borders and cut marks. For exact dimensions, print at “Actual size” (100%), not “Fit to page”.</span>
          <div className="row2">
            <button className="btn tonal" disabled={!!busy} onClick={preview}>Preview PDF</button>
            <button className="btn" disabled={!!busy} onClick={saveCalibrationSheet}>Save 100 mm test sheet</button>
          </div>
          <span className="muted small">Measure the test sheet before printing exact-size photos. Printer correction: {(getScale() * 100).toFixed(1)}%.</span>
          <button className="btn" onClick={onPrinterCheck}>Adjust printer correction</button>
        </div>
        <label className="field">File name
          <div className="suffix"><input value={name} onChange={(e) => setName(e.target.value)} /><span>.{fmt0}</span></div>
        </label>
        <div className="field">File type
          <div className="seg">{(['pdf', 'png', 'jpg'] as Fmt[]).map((f) => <button key={f} className={fmt0 === f ? 'on' : ''} onClick={() => setFmt(f)}>{f.toUpperCase()}</button>)}</div>
          {fmt0 !== 'pdf' && <span className="muted small">One picture per page{project.pages.length > 1 ? ` (${project.pages.length} files)` : ''}. {fmt0 === 'png' ? 'PNG is lossless.' : 'JPG makes smaller files.'}</span>}
        </div>
        <div className="field">{fmt0 === 'pdf' ? 'Image quality' : 'Picture sharpness'}
          {fmt0 === 'pdf'
            ? <div className="seg">{Q.map(([q, l]) => <button key={q} className={quality === q ? 'on' : ''} onClick={() => setQuality(q)}>{l}</button>)}</div>
            : <div className="seg">{([[100, 'Small'], [150, 'Normal'], [300, 'Sharp']] as [number, string][]).map(([d, l]) => <button key={d} className={dpi === d ? 'on' : ''} onClick={() => setDpi(d)}>{l}</button>)}</div>}
        </div>
        {fmt0 !== 'pdf' && <span className="muted small">{dpi} dots per inch. Sharp is best for printing; Small is best for messaging.</span>}
        <div className="save-row">
          <button className="btn primary" disabled={!!busy} onClick={() => run('save')}><Download /> Save to Files</button>
          <button className="btn tonal" disabled={!!busy} onClick={() => run('share')} aria-label="Share to WhatsApp, Email or other apps"><Share /> Share</button>
        </div>
        {busy && <Banner kind="busy" text={busy} />}
        {msg && <Banner kind={/fail|could not/i.test(msg) ? 'warn' : 'ok'} text={msg} />}
      </div>
      {previewOpen && (
        <div className="pdf-preview-back" onClick={(e) => { e.stopPropagation(); closePreview(); }}>
          <section className="pdf-preview" role="dialog" aria-modal="true" aria-label="PDF print preview" onClick={(e) => e.stopPropagation()}>
            <div className="pdf-preview-head">
              <b>PDF print preview</b>
              <span>{previewPage} / {previewPages}</span>
              <label className="pdf-safe-toggle"><input type="checkbox" checked={showSafeArea} onChange={(e) => setShowSafeArea(e.target.checked)} /> 5 mm safe area</label>
              <button className="icon-btn" onClick={closePreview} aria-label="Close preview">✕</button>
            </div>
            <div className="pdf-preview-body">
              {previewImage ? (
                <div className="pdf-preview-page">
                  <img src={previewImage} alt={`Rendered PDF page ${previewPage}`} />
                  {showSafeArea && (
                    <div className="pdf-safe-area" style={{
                      left: `${5 / previewSize.widthMm * 100}%`, right: `${5 / previewSize.widthMm * 100}%`,
                      top: `${5 / previewSize.heightMm * 100}%`, bottom: `${5 / previewSize.heightMm * 100}%`,
                    }}><span>5 mm safe area · advisory</span></div>
                  )}
                </div>
              ) : <span>{previewError || 'Rendering page…'}</span>}
            </div>
            <div className="pdf-preview-foot">
              <span>Dashed safe area is advisory only and is not included in the PDF. Check your printer, then print at Actual size (100%).</span>
              <div className="row2">
                <button className="btn" disabled={!!busy || previewPage <= 1} onClick={() => previewDoc.current && renderPreviewPage(previewDoc.current, previewPage - 1)}>Previous</button>
                <button className="btn" disabled={!!busy || previewPage >= previewPages} onClick={() => previewDoc.current && renderPreviewPage(previewDoc.current, previewPage + 1)}>Next</button>
              </div>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
