import { useState } from 'react';
import type { Project } from './types';
import PageThumb from './PageThumb';
import { useReorder } from './reorder';
import { Checklist, Close, Copy, Plus, Trash } from './icons';

/** Full-screen view of every page, for reordering, duplicating and deleting. "Select" picks several pages at once. */
export default function PageGrid({ project, current, onSelect, onMove, onAdd, onDup, onDel, onDupMany, onDelMany, onClose }: {
  project: Project; current: number; onSelect: (i: number) => void; onMove: (f: number, t: number) => void;
  onAdd: () => void; onDup: () => void; onDel: () => void; onDupMany: (idx: number[]) => void; onDelMany: (idx: number[]) => Promise<boolean>; onClose: () => void;
}) {
  const { ref, drag, bind } = useReorder((i) => { onSelect(i); onClose(); }, onMove);
  const [picking, setPicking] = useState(false);
  const [chosen, setChosen] = useState<number[]>([]);
  const n = project.pages.length;
  const toggle = (i: number) => setChosen((c) => (c.includes(i) ? c.filter((x) => x !== i) : [...c, i]));
  const leave = () => { setPicking(false); setChosen([]); };
  return (
    <div className="fullsheet" role="dialog" aria-label="All pages">
      <header className="topbar">
        {picking
          ? <button className="icon-btn" onClick={leave} aria-label="Stop selecting"><Close /></button>
          : <button className="icon-btn" onClick={onClose} aria-label="Close"><Close /></button>}
        <h2 className="grow">{picking ? `${chosen.length} selected` : 'All pages'}</h2>
        {picking
          ? <button className="btn tonal" onClick={() => setChosen(chosen.length === n ? [] : project.pages.map((_, i) => i))}>{chosen.length === n ? 'Clear' : 'Select all'}</button>
          : n > 1 && <button className="btn tonal" onClick={() => setPicking(true)}><Checklist /> Select</button>}
      </header>
      <p className="muted small" style={{ margin: '0 16px 8px' }}>
        {picking ? 'Tap pages to select them. Then duplicate or delete them together.' : 'Tap a page to open it. Touch and hold, then drag to reorder.'}
      </p>
      <div className="pgrid2" ref={ref}>
        {project.pages.map((pg, i) => {
          const on = chosen.includes(i);
          const cls = 'pcell2' + (picking ? (on ? ' picked' : '') : i === current ? ' on' : '') + (drag?.from === i ? ' dragging' : '') + (drag && drag.over === i && drag.from !== i ? ' target' : '');
          const body = (
            <>
              {picking && <span className={'pcheck' + (on ? ' on' : '')} aria-hidden="true">{on ? '✓' : ''}</span>}
              <PageThumb page={pg} maxW={90} maxH={120} />
              <span className="small">{i + 1}</span>
            </>
          );
          return picking
            ? <button key={pg.id} className={cls} aria-pressed={on} aria-label={`Page ${i + 1}`} onClick={() => toggle(i)}>{body}</button>
            : <div key={pg.id} {...bind(i)} className={cls}>{body}</div>;
        })}
      </div>
      <footer className="footbar">
        {picking ? (
          <>
            <button className="btn tonal" disabled={!chosen.length} onClick={() => { onDupMany(chosen); leave(); }}><Copy /> Duplicate{chosen.length ? ` ${chosen.length}` : ''}</button>
            <button className="btn danger-outline" disabled={!chosen.length} onClick={async () => { if (await onDelMany(chosen)) leave(); }}><Trash /> Delete{chosen.length ? ` ${chosen.length}` : ''}</button>
          </>
        ) : (
          <>
            <button className="btn tonal" onClick={onAdd}><Plus /> Add</button>
            <button className="btn tonal" onClick={onDup}><Copy /> Duplicate</button>
            <button className="btn danger-outline" onClick={onDel}><Trash /> Delete</button>
          </>
        )}
      </footer>
    </div>
  );
}
