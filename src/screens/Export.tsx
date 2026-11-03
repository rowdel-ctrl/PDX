import { useState } from 'react';
import type { Project, Quality } from '../types';
import { buildPdf } from '../pdf';
import { savePdf, sharePdf } from '../files';
import { fmt, presetOf } from '../units';
import { Back, Download, Share } from '../icons';

const Q: [Quality, string][] = [['small', 'Small'], ['standard', 'Standard'], ['high', 'High']];

export default function Export({ project, onBack }: { project: Project; onBack: () => void }) {
  const [name, setName] = useState(project.name);
  const [quality, setQuality] = useState<Quality>('standard');
  const [busy, setBusy] = useState('');
  const [msg, setMsg] = useState('');
  const pg = project.pages[0];
  const sizes = new Set(project.pages.map((p) => `${p.widthMm}x${p.heightMm}`));
  const sizeLabel = sizes.size > 1 ? 'Mixed sizes' : presetOf(pg.widthMm, pg.heightMm) ?? `${fmt(pg.widthMm, project.unit)}×${fmt(pg.heightMm, project.unit)} ${project.unit}`;
  const orient = sizes.size > 1 ? 'Mixed' : pg.widthMm > pg.heightMm ? 'Landscape' : 'Portrait';

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
    <div className="screen">
      <header className="topbar"><button className="icon-btn" onClick={onBack} aria-label="Back"><Back /></button><h2 className="grow">Export</h2></header>
      <main className="scroll pad">
        <div className="summary">
          <div><b>{project.pages.length}</b><span className="muted small">{project.pages.length === 1 ? 'page' : 'pages'}</span></div>
          <div><b>{sizeLabel}</b><span className="muted small">size</span></div>
          <div><b>{orient}</b><span className="muted small">orientation</span></div>
        </div>
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
      </main>
    </div>
  );
}
