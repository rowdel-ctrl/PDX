import { useEffect, useRef, useState } from 'react';
import { useEd } from './editorContext';
import { ExactForm, FillForm } from './sheets';
import { SliderRow, Switch } from './ui';
import { fmt } from './units';
import { enhancePreview, pixelSize } from './images';
import { AUTO, NEUTRAL, isNeutral, type Adjust } from './enhance';
import { canUpscale } from './upscale';
import { frameCrop } from './layout';
import { AlignB, AlignC, AlignL, AlignM, AlignR, AlignT, Copy, DistH, DistV, Face, Layers, Sparkle, Wand } from './icons';

export const ID_COLORS: [string, string][] = [['#FFFFFF', 'White'], ['#2F6FD6', 'Blue'], ['#C62828', 'Red'], ['#9CC4EE', 'Sky']];

/** The photo (loose or in a frame) that is selected. */
function useTarget() {
  const ed = useEd();
  const t = ed.selImage ?? (ed.selFrame?.file ? ed.selFrame : null);
  return { ed, t, id: t?.id ?? '', file: t?.file ?? '', bg: t?.bg };
}

/** Remove the background, clean the edges, even out the light. */
export function CutoutPanel() {
  const { ed, t, id, file } = useTarget();
  if (!t) return <div className="panel-body"><p className="muted small" style={{ margin: 0 }}>Select a photo to cut out its background.</p></div>;
  const cut = file.endsWith('.png');
  return (
    <div className="panel-body">
      <p className="muted small" style={{ margin: 0 }}>Background, edges and light for this photo. It runs on your phone.</p>
      <button className="btn primary wide" onClick={() => ed.removeBackground(id)}><Wand /> {cut ? 'Remove background again' : 'Remove background'}</button>
      <div className="row2">
        <button className="btn tonal" disabled={!cut} onClick={() => ed.refineEdges(id)}>Refine edges</button>
        <button className="btn tonal" onClick={() => ed.evenLight(id)}>Even out light</button>
      </div>
      {!cut && <span className="muted small">Refine edges works after the background is removed.</span>}
    </div>
  );
}

/** The colour behind a cut-out photo, for one frame or every frame. */
export function ColorPanel() {
  const { ed, t, id, bg } = useTarget();
  const frames = ed.page.frames.filter((f) => f.file).length;
  const [all, setAll] = useState(frames > 1);
  if (!t) return <div className="panel-body"><p className="muted small" style={{ margin: 0 }}>Select a photo to choose its background colour.</p></div>;
  const pick = (c: string | undefined) => (all && frames > 1 ? ed.setBgAll(c) : ed.setBg(id, c));
  const custom = !!bg && !ID_COLORS.some(([c]) => c.toLowerCase() === bg.toLowerCase());
  return (
    <div className="panel-body">
      <div className="field">Photo background
        <div className="idcolors">
          {ID_COLORS.map(([c, name]) => (
            <button key={c} className={'idc' + (bg?.toLowerCase() === c.toLowerCase() ? ' on' : '')} onClick={() => pick(c)} aria-pressed={bg?.toLowerCase() === c.toLowerCase()}>
              <span className="dot" style={{ background: c }} /><span>{name}</span>
            </button>
          ))}
          <label className={'idc' + (custom ? ' on' : '')}>
            <span className="dot plus" style={custom ? { background: bg } : undefined}>{custom ? '' : '+'}</span><span>Custom</span>
            <input type="color" value={bg && /^#[0-9a-f]{6}$/i.test(bg) ? bg : '#ffffff'} onChange={(e) => pick(e.target.value)} />
          </label>
        </div>
      </div>
      {frames > 1 && <Switch label="Apply to every ID frame" hint={`${frames} frames on this page`} checked={all} onChange={setAll} />}
      <button className="btn" style={{ alignSelf: 'flex-start' }} onClick={() => pick(undefined)}>No background colour</button>
      <span className="muted small">The colour is printed behind a cut-out. Use Cut out first to remove the photo's own background.</span>
    </div>
  );
}

const ALIGN: [React.ReactElement, string, Parameters<ReturnType<typeof useEd>['align']>[0]][] = [
  [<AlignL />, 'Align left', 'left'], [<AlignC />, 'Align center', 'center'], [<AlignR />, 'Align right', 'right'],
  [<AlignT />, 'Align top', 'top'], [<AlignM />, 'Align middle', 'middle'], [<AlignB />, 'Align bottom', 'bottom'],
];

/** Exact size and position, align, layer, spacing, and the actions that belong to the selected item. */
export function ArrangePanel() {
  const ed = useEd();
  const n = ed.sel.length;
  const { selImage: im, selFrame: fr } = ed;
  const [gx, setGx] = useState(ed.page.spacingMm), [gy, setGy] = useState(ed.page.spacingMm);
  if (!n) return <div className="panel-body"><p className="muted small" style={{ margin: 0 }}>Select something to arrange it.</p></div>;
  return (
    <div className="panel-body">
      {n === 1 && <ExactForm />}
      <div className="field">{n > 1 ? 'Align to each other' : 'Align to page'}
        <div className="alignrow">
          {ALIGN.map(([ic, label, m]) => <button key={m} aria-label={label} onClick={() => ed.align(m)}>{ic}</button>)}
        </div>
      </div>
      {n === 1 && (
        <div className="row2">
          <button className="btn" onClick={() => ed.order('front')}><Layers /> Bring to front</button>
          <button className="btn" onClick={() => ed.order('back')}><Layers /> Send to back</button>
        </div>
      )}
      {n > 1 && (
        <>
          <div className="field">Gap between the selected items
            <SliderRow label="Across" value={gx} min={0} max={60} suffix={`${fmt(gx, ed.unit)} ${ed.unit}`} onChange={(v) => { setGx(v); ed.setGap(v, gy); }} />
            <SliderRow label="Down" value={gy} min={0} max={60} suffix={`${fmt(gy, ed.unit)} ${ed.unit}`} onChange={(v) => { setGy(v); ed.setGap(gx, v); }} />
          </div>
          <div className="row2">
            <button className="btn tonal" disabled={n < 3} onClick={() => ed.distribute('x')}><DistH /> Space across</button>
            <button className="btn tonal" disabled={n < 3} onClick={() => ed.distribute('y')}><DistV /> Space down</button>
          </div>
        </>
      )}
      {im && (
        <div className="tools">
          {ed.page.frames.length > 0 && <button className="btn tonal" onClick={() => ed.fitIntoFrame(im.id)}>Put in a frame</button>}
          {ed.page.layout !== 'free' && <button className="btn tonal" onClick={() => ed.fillCell(im)}>Fill the space</button>}
          {ed.page.layout !== 'free' && <button className="btn tonal" onClick={() => ed.fitCell(im)}>Fit in space</button>}
        </div>
      )}
      {fr?.file && (
        <div className="tools">
          <button className="btn tonal" onClick={() => { ed.setAddTab('photos'); ed.setPanel('add'); }}>Replace photo</button>
          <button className="btn tonal" onClick={() => ed.centerFace(fr.id)}><Face /> Center on face</button>
          <button className="btn tonal" onClick={() => ed.copyToAll(fr)}>Use in all frames</button>
          <button className="btn" onClick={() => ed.detach(fr.id)}>Take out of frame</button>
          <button className="btn" onClick={() => ed.updateFrame(fr.id, { file: '', zoom: 1, cx: 0.5, cy: 0.5, rot: 0 })}>Remove photo</button>
        </div>
      )}
    </div>
  );
}

/** Duplicate, or fill the page with copies. */
export function CopiesPanel() {
  const ed = useEd();
  if (!ed.sel.length) return <div className="panel-body"><p className="muted small" style={{ margin: 0 }}>Select something to copy it.</p></div>;
  return (
    <div className="panel-body">
      <button className="btn tonal wide" onClick={ed.duplicateSel}><Copy /> Duplicate {ed.sel.length > 1 ? `${ed.sel.length} items` : 'once'}</button>
      <FillForm />
    </div>
  );
}

/** Pick items by type, or all of them. */
export function SelectPanel() {
  const ed = useEd();
  const { page, sel } = ed;
  const total = page.images.length + page.frames.length + page.texts.length;
  const chips: [string, number, () => void][] = [
    ['All', total, ed.selectAll],
    ['Frames', page.frames.length, () => ed.selectBy('frames')],
    ['Photos', page.images.length, () => ed.selectBy('photos')],
    ['Text', page.texts.length, () => ed.selectBy('text')],
    ['Empty frames', page.frames.filter((f) => !f.file).length, () => ed.selectBy('empty')],
  ];
  return (
    <div className="panel-body">
      <p className="muted small" style={{ margin: 0 }}>{sel.length ? `${sel.length} of ${total} selected.` : 'Tap items on the page, or draw a box around them.'}</p>
      <div className="chips">
        {chips.filter(([, c]) => c > 0).map(([l, c, on]) => <button key={l} className="chip" onClick={on}>{l} · {c}</button>)}
        {sel.length > 0 && <button className="chip" onClick={() => ed.selectBy('same')}>Same size as first</button>}
      </div>
      {sel.length > 0 && <button className="btn" style={{ alignSelf: 'flex-start' }} onClick={() => ed.setSel([])}>Clear selection</button>}
    </div>
  );
}

/** Make a selected group bigger or smaller. */
export function SizePanel() {
  const ed = useEd();
  return (
    <div className="panel-body">
      <p className="muted small" style={{ margin: 0 }}>Resize everything selected together. You can also drag a corner handle on the page.</p>
      <div className="row2">
        <button className="btn tonal" onClick={() => ed.scaleSel(1 / 1.1)}>Smaller −10%</button>
        <button className="btn tonal" onClick={() => ed.scaleSel(1.1)}>Bigger +10%</button>
      </div>
    </div>
  );
}

/** Make a photo look better: light, colour, sharpness, noise. Upscale 2× for photos that are too small to print sharp. */
export function EnhancePanel() {
  const { ed, t, id, file } = useTarget();
  const [adj, setAdj] = useState<Adjust>(NEUTRAL);
  const [preview, setPreview] = useState('');
  const [busy, setBusy] = useState('');
  const [px, setPx] = useState<{ w: number; h: number } | null>(null);
  const abort = useRef<AbortController | null>(null);
  useEffect(() => { setAdj(NEUTRAL); setPreview(''); abort.current?.abort(); }, [file]);
  useEffect(() => { if (file) pixelSize(file).then(setPx).catch(() => setPx(null)); }, [file]);
  useEffect(() => {
    if (!file) return;
    let on = true;
    const h = setTimeout(() => { enhancePreview(file, adj).then((u) => on && setPreview(u)).catch(() => {}); }, 160);
    return () => { on = false; clearTimeout(h); };
  }, [file, adj]);
  if (!t) return <div className="panel-body"><p className="muted small" style={{ margin: 0 }}>Select a photo to enhance it.</p></div>;
  const set = (p: Partial<Adjust>) => setAdj((a) => ({ ...a, ...p }));
  // print sharpness of this photo at the size it is placed
  const widthMm = ed.page.widthMm * t.w, crop = 'crop' in t ? t.crop : frameCrop(t as import('./types').Frame, ed.page.widthMm, ed.page.heightMm);
  const pxAcross = px ? ((t.rot % 2 ? px.h : px.w) * crop.w) : 0;
  const dpi = widthMm > 0 ? Math.round(pxAcross / (widthMm / 25.4)) : 0;
  const can = px ? canUpscale(px.w, px.h) : false;

  const apply = async () => { setBusy('Enhancing…'); await ed.enhancePhoto(id, adj); setBusy(''); };
  const upscale = async () => {
    const c = new AbortController(); abort.current = c;
    setBusy('Upscaling… 0%');
    const ok = await ed.upscalePhoto(id, (p) => setBusy(`Upscaling… ${Math.round(p * 100)}%`), c.signal);
    abort.current = null; setBusy(''); if (!ok) return;
  };
  return (
    <div className="panel-body">
      <div className="enh-top">
        {preview && <img className="enh-prev" src={preview} alt="Preview of the enhanced photo" />}
        <div className="enh-btns">
          <button className="btn tonal" disabled={!!busy} onClick={() => setAdj(AUTO)}><Sparkle /> Auto enhance</button>
          <button className="btn" disabled={!!busy || isNeutral(adj)} onClick={() => setAdj(NEUTRAL)}>Reset</button>
          <button className="btn primary" disabled={!!busy || isNeutral(adj)} onClick={apply}>Apply</button>
        </div>
      </div>
      <SliderRow label="Brightness" value={adj.brightness} min={-100} max={100} suffix={String(adj.brightness)} onChange={(v) => set({ brightness: v })} />
      <SliderRow label="Contrast" value={adj.contrast} min={-100} max={100} suffix={String(adj.contrast)} onChange={(v) => set({ contrast: v })} />
      <SliderRow label="Colour" value={adj.saturation} min={-100} max={100} suffix={String(adj.saturation)} onChange={(v) => set({ saturation: v })} />
      <SliderRow label="Warmth" value={adj.warmth} min={-100} max={100} suffix={String(adj.warmth)} onChange={(v) => set({ warmth: v })} />
      <SliderRow label="Sharpen" value={adj.sharpen} min={0} max={100} suffix={String(adj.sharpen)} onChange={(v) => set({ sharpen: v })} />
      <SliderRow label="Noise cleanup" value={adj.denoise} min={0} max={100} suffix={String(adj.denoise)} onChange={(v) => set({ denoise: v })} />
      <div className="field">Too small to print sharp?
        <span className="muted small">{px ? `This photo is ${px.w} × ${px.h} px, about ${dpi} dpi at its size on the page. Sharp prints need about 300.` : ''}</span>
        <button className="btn tonal" disabled={!!busy || !can} onClick={upscale}>Upscale 2× (AI)</button>
        <span className="muted small">{can ? 'Doubles the width and height on your phone. It can take a minute for bigger photos, and works best on photos under about 1500 px.' : 'This photo is already large, so it can not be upscaled.'}</span>
      </div>
      {busy && (
        <div className="banner busy"><span className="toast-ic" aria-hidden="true"><span className="spin" /></span><span className="toast-tx">{busy}</span>
          {abort.current && <button className="btn" onClick={() => abort.current?.abort()}>Cancel</button>}</div>
      )}
    </div>
  );
}
