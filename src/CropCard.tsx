import { useEffect, useState } from 'react';
import type { Frame } from './types';
import type { Face } from './vision';
import { FULL, variantUrl } from './images';
import { SliderRow as _unused } from './ui';
import { ZoomIn } from './icons';
void _unused;

/** One face, shown as a round avatar cut from the photo. */
function FaceChip({ file, rot, aspect, face, index, onPick }: { file: string; rot: number; aspect: number; face: Face; index: number; onPick: () => void }) {
  const [url, setUrl] = useState('');
  useEffect(() => { let on = true; variantUrl(file, rot, FULL, 320).then((u) => on && setUrl(u)).catch(() => {}); return () => { on = false; }; }, [file, rot]);
  const a = rot % 2 ? 1 / aspect : aspect;                       // width / height of the shown photo
  const hs = Math.min(1, face.size * 1.9), ws = Math.min(1, hs / a);
  const x0 = Math.min(1 - ws, Math.max(0, face.x - ws / 2)), y0 = Math.min(1 - hs, Math.max(0, face.y - hs / 2));
  const px = ws >= 1 ? 0 : (x0 / (1 - ws)) * 100, py = hs >= 1 ? 0 : (y0 / (1 - hs)) * 100;
  return (
    <button className="face-chip" aria-label={`Center on face ${index + 1}`} onClick={onPick}
      style={{ backgroundImage: url ? `url(${url})` : undefined, backgroundSize: `${100 / ws}% ${100 / hs}%`, backgroundPosition: `${px}% ${py}%` }} />
  );
}

/** Crop mode card: zoom, reset, done. Drag moves the photo, tap a spot to center it, or pick a face. */
export default function CropCard({ frame, faces, onZoom, onReset, onDone, onFace }: {
  frame: Frame | null; faces: Face[]; onZoom: (z: number) => void; onReset: () => void; onDone: () => void; onFace: (i: number) => void;
}) {
  return (
    <div className={'cropcard' + (frame ? ' open' : '')} aria-hidden={!frame}>
      <div className="cropcard-head">
        <b>Crop</b>
        <button className="btn text" onClick={onReset}>Reset</button>
        <button className="btn primary" onClick={onDone}>Done</button>
      </div>
      <label className="slider" style={{ gridTemplateColumns: '24px 1fr 52px' }}>
        <span className="muted"><ZoomIn /></span>
        <input type="range" aria-label="Zoom" min={1} max={4} step={0.02} value={frame?.zoom ?? 1} onChange={(e) => onZoom(Number(e.target.value))} />
        <span className="muted val">{Math.round((frame?.zoom ?? 1) * 100)}%</span>
      </label>
      <div className="faces">
        <div className="faces-label">{faces.length ? <>Center on a face<br />(optional)</> : <>Drag to move.<br />Tap to center.</>}</div>
        {frame && faces.map((fc, i) => <FaceChip key={i} file={frame.file} rot={frame.rot} aspect={frame.aspect} face={fc} index={i} onPick={() => onFace(i)} />)}
      </div>
    </div>
  );
}
