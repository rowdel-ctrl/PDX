import type { Frame } from './types';
import { SliderRow } from './ui';
import { ZoomIn } from './icons';

/** Crop mode card: zoom, reset, done. Dragging moves the photo; tapping a spot centers it. */
export default function CropCard({ frame, onZoom, onReset, onDone }: {
  frame: Frame | null; onZoom: (z: number) => void; onReset: () => void; onDone: () => void;
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
        <div className="faces-label" style={{ width: 'auto' }}>Drag the photo to move it. Tap a spot to put it in the middle, for example someone's face.</div>
      </div>
    </div>
  );
}
