import { useState } from 'react';
import { buildTestSheet, getScale, setScale } from './printer';
import { savePdf, sharePdf } from './files';
import { Close } from './icons';
import { Switch } from './ui';

/** Printer check: print a test sheet, measure it, and let PDX correct for a printer that prints a little small or large. */
export default function SettingsSheet({ onClose }: { onClose: () => void }) {
  const [w, setW] = useState(''), [h, setH] = useState('');
  const [scale, setS] = useState(getScale());
  const [msg, setMsg] = useState('');
  const mw = parseFloat(w), mh = parseFloat(h);
  const vals = [mw, mh].filter((v) => Number.isFinite(v) && v > 50 && v < 150);
  const ratio = vals.length ? 100 / (vals.reduce((a, b) => a + b, 0) / vals.length) : null;
  const pct = ratio ? (ratio - 1) * 100 : 0;
  const ok = ratio !== null && ratio > 0.9 && ratio < 1.1;

  const sheet = async (kind: 'save' | 'share') => {
    setMsg('');
    try {
      const bytes = await buildTestSheet();
      if (kind === 'save') setMsg(await savePdf(bytes, 'PDX test sheet')); else await sharePdf(bytes, 'PDX test sheet');
    } catch (e) { if (!/cancel/i.test(String((e as Error)?.message))) setMsg('Could not make the test sheet.'); }
  };
  const apply = (on: boolean) => { const v = on && ok ? ratio! : 1; setScale(v); setS(v); };

  return (
    <div className="sheet-back" onClick={onClose}>
      <div className="sheet" role="dialog" aria-label="Printer check" onClick={(e) => e.stopPropagation()}>
        <div className="sheet-grab" />
        <div className="sheet-head"><b>Printer check</b><button className="icon-btn" onClick={onClose} aria-label="Close"><Close /></button></div>
        <p className="muted small" style={{ margin: '0 0 6px' }}>Make sure photos print at their real size. This takes one sheet of A4.</p>
        <ol className="steps small">
          <li>Save the test sheet and print it at 100% (not “fit to page”).</li>
          <li>Measure the box with a ruler.</li>
          <li>Type what you measured below.</li>
        </ol>
        <div className="row2">
          <button className="btn tonal" onClick={() => sheet('save')}>Save test sheet</button>
          <button className="btn" onClick={() => sheet('share')}>Share it</button>
        </div>
        <div className="two-col">
          <label className="field">Box width (mm)<input className="box" type="number" inputMode="decimal" step={0.1} placeholder="100" value={w} onChange={(e) => setW(e.target.value)} /></label>
          <label className="field">Box height (mm)<input className="box" type="number" inputMode="decimal" step={0.1} placeholder="100" value={h} onChange={(e) => setH(e.target.value)} /></label>
        </div>
        {ratio !== null && ok && (
          <div className="note">
            {Math.abs(pct) < 0.3 ? <b>Your printer is accurate. No correction needed.</b> : <><b>Your printer prints {Math.abs(pct).toFixed(1)}% {pct > 0 ? 'small' : 'large'}.</b><br />PDX can {pct > 0 ? 'enlarge' : 'shrink'} every page by {(ratio * 100).toFixed(1)}% so photos come out exact.</>}
          </div>
        )}
        {ratio !== null && !ok && <p className="muted small">That does not look right. The box should measure close to 100 mm.</p>}
        <Switch label="Use this correction" hint={scale !== 1 ? `On: pages are drawn at ${(scale * 100).toFixed(1)}%` : 'Off'} checked={scale !== 1} onChange={apply} />
        <p className="muted small">The correction applies to every PDF you save from now on. Turn it off if you change printers.</p>
        {msg && <p role="status">{msg}</p>}
      </div>
    </div>
  );
}
