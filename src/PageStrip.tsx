import { useState } from 'react';
import type { Project } from './types';
import PageThumb from './PageThumb';
import { useReorder } from './reorder';
import { Copy, Grid, Plus, Trash } from './icons';

/** Canva-style row of page thumbnails under the canvas. */
export default function PageStrip({ project, current, onSelect, onMove, onAdd, onDup, onDel, onGrid }: {
  project: Project; current: number; onSelect: (i: number) => void; onMove: (from: number, to: number) => void;
  onAdd: () => void; onDup: () => void; onDel: () => void; onGrid: () => void;
}) {
  const [menu, setMenu] = useState(false);
  const { ref, drag, bind } = useReorder((i) => { if (i === current) setMenu((m) => !m); else { setMenu(false); onSelect(i); } }, (f, t) => { setMenu(false); onMove(f, t); });
  return (
    <div className="pstrip-wrap">
      {menu && (
        <div className="pstrip-menu">
          <button onClick={() => { setMenu(false); onDup(); }}><Copy /> Duplicate page</button>
          <button className="danger" onClick={() => { setMenu(false); onDel(); }}><Trash /> Delete page</button>
        </div>
      )}
      <div className="pstrip" ref={ref}>
        {project.pages.map((pg, i) => (
          <div key={pg.id} {...bind(i)}
            className={'pcard' + (i === current ? ' on' : '') + (drag?.from === i ? ' dragging' : '') + (drag && drag.over === i && drag.from !== i ? ' target' : '')}
            aria-label={`Page ${i + 1}${i === current ? ', tap again for options' : ''}`}>
            <PageThumb page={pg} maxW={44} maxH={58} />
            <span className="small">{i + 1}</span>
          </div>
        ))}
        <button className="pcard add" onClick={onAdd} aria-label="Add page"><Plus /></button>
      </div>
      <button className="strip-grid" onClick={onGrid} aria-label="Show all pages"><Grid /></button>
    </div>
  );
}
