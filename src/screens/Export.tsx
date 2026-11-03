import { useEffect, useState } from 'react';
import { findLowRes, LOW_DPI, SHARP_DPI, type LowPhoto } from '../quality';
import type { Project, Quality } from '../types';
import { buildPdf } from '../pdf';
import { savePdf, sharePdf } from '../files';
import { fmt, presetOf } from '../units';
import { Download, Share } from '../icons';

const Q: [Quality, string][] = [['small', 'Small'], ['standard', 'Standard'], ['high', 'High']];

/** Bottom sheet over the editor: name, quality, save or share the PDF. */
export default function ExportSheet({ project, onClose, onShrink, onShow }: { project: Project; onClose: () => void; onShrink: (page: number, id: string, factor: number) => void; onShow: (page: number, id: string) => void }) {
  const [name, setName] = useState(project.name);
  const [quality, setQuality] = useState<Quality>('standard');
  const [busy, setBusy] = useState('');
  const [msg, setMsg] = useState('');
  const [low, setLow] = useState<LowPhoto[]>([]);
  const [warnOpen, setWarnOpen] = useState(true);
  useEffect(() => { let on = true; findLowRes(project).then((l) => on && setLow(l)); return () => { on = false; }; }, [project]);
  const shrinkable = low.filter((l) => l.kind === 'image');
  const pg = project.pages[0];
  const sizes = new Set(project.pages.map((p) => `${p.widthMm}x${p.heightMm}`));
  const sizeLabel = sizes.size > 1 ? 'Mixed sizes' : presetOf(pg.widthMm, pg.heightMm) ?? `${fmt(pg.widthMm, project.unit)}×${fmt(pg.heightMm, project.unit)} ${project.unit}`;

  const run = async (kind: 'save' | 'share') => {
    setMsg('');
    try {
      setBusy('Building PDF…');
      const bytes = await buildPdf(project, quality, (n, t) => setBusy(`Building PDF… ${n}/${t}`));
      if (kind === 'save') {
        try { setMsg(await savePdf(bytes, name)); }
        catch { setBusy('Opening share sheet…'); await sharePdf(bytes, name); setMsg('Could not save directly, shared instead.'); }
      } else await sharePdf(bytes, name);
    } catch (e) {
      if (!/cancel/i.test(String((e as Error)?.message))) setMsg(`Export failed: ${(e as Error)?.message ?? 'unknown error'}`);
    } finally { setBusy(''); }
  };

  return (
    <div className="sheet-back" onClick={onClose}>
      <div className="sheet" role="dialog" aria-label="Share" onClick={(e) => e.stopPropagation()}>
        <div className="sheet-grab" />
        <div className="sheet-head"><b>Share as PDF</b><button className="icon-btn" onClick={onClose} aria-label="Close">✕</button></div>
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
        <label className="field">File name
          <div className="suffix"><input value={name} onChange={(e) => setName(e.target.value)} /><span>.pdf</span></div>
        </label>
        <div className="field">Image quality
          <div className="seg">{Q.map(([q, l]) => <button key={q} className={quality === q ? 'on' : ''} onClick={() => setQuality(q)}>{l}</button>)}</div>
        </div>
        <button className="btn primary wide" disabled={!!busy} onClick={() => run('save')}><Download /> Save to Files</button>
        <button className="btn wide" disabled={!!busy} onClick={() => run('share')}><Share /> Share (WhatsApp, Email, other apps)</button>
        {busy && <p className="muted" role="status">{busy}</p>}
        {msg && <p role="status">{msg}</p>}
      </div>
    </div>
  );
}
