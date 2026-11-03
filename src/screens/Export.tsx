import { useState } from 'react';
import type { Project, Quality } from '../types';
import { buildPdf } from '../pdf';
import { savePdf, sharePdf } from '../files';
import { fmt, presetOf } from '../units';
import { Download, Share } from '../icons';

const Q: [Quality, string][] = [['small', 'Small'], ['standard', 'Standard'], ['high', 'High']];

/** Bottom sheet over the editor: name, quality, save or share the PDF. */
export default function ExportSheet({ project, onClose }: { project: Project; onClose: () => void }) {
  const [name, setName] = useState(project.name);
  const [quality, setQuality] = useState<Quality>('standard');
  const [busy, setBusy] = useState('');
  const [msg, setMsg] = useState('');
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
