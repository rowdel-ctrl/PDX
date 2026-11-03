import type { Project } from './types';
import PageThumb from './PageThumb';
import { useReorder } from './reorder';
import { Close, Copy, Plus, Trash } from './icons';

/** Full-screen view of every page, for reordering, duplicating and deleting. */
export default function PageGrid({ project, current, onSelect, onMove, onAdd, onDup, onDel, onClose }: {
  project: Project; current: number; onSelect: (i: number) => void; onMove: (f: number, t: number) => void;
  onAdd: () => void; onDup: () => void; onDel: () => void; onClose: () => void;
}) {
  const { ref, drag, bind } = useReorder((i) => { onSelect(i); onClose(); }, onMove);
  return (
    <div className="fullsheet" role="dialog" aria-label="All pages">
      <header className="topbar">
        <button className="icon-btn" onClick={onClose} aria-label="Close"><Close /></button>
        <h2 className="grow">All pages</h2>
      </header>
      <p className="muted small" style={{ margin: '0 16px 8px' }}>Tap a page to open it. Touch and hold, then drag to reorder.</p>
      <div className="pgrid2" ref={ref}>
        {project.pages.map((pg, i) => (
          <div key={pg.id} {...bind(i)}
            className={'pcell2' + (i === current ? ' on' : '') + (drag?.from === i ? ' dragging' : '') + (drag && drag.over === i && drag.from !== i ? ' target' : '')}>
            <PageThumb page={pg} maxW={90} maxH={120} />
            <span className="small">{i + 1}</span>
          </div>
        ))}
      </div>
      <footer className="footbar">
        <button className="btn tonal" onClick={onAdd}><Plus /> Add</button>
        <button className="btn tonal" onClick={onDup}><Copy /> Duplicate</button>
        <button className="btn danger-outline" onClick={onDel}><Trash /> Delete</button>
      </footer>
    </div>
  );
}
