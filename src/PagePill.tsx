import type { Project } from './types';
import { Grid, Left, Plus, Right } from './icons';

/** Small floating page switcher under the page: arrows, count, add, all pages. */
export default function PagePill({ project, current, hide, onGo, onAdd, onGrid }: {
  project: Project; current: number; hide: boolean; onGo: (i: number) => void; onAdd: () => void; onGrid: () => void;
}) {
  const n = project.pages.length;
  return (
    <div className={'pagepill' + (hide ? ' hide' : '')}>
      <div className="pagepill-in">
        <button aria-label="Previous page" disabled={current <= 0} onClick={() => onGo(current - 1)}><Left /></button>
        <span>Page {current + 1} of {n}</span>
        <button aria-label="Next page" disabled={current >= n - 1} onClick={() => onGo(current + 1)}><Right /></button>
        <span className="pagepill-sep" />
        <button aria-label="Add page" onClick={onAdd}><Plus /></button>
        <button aria-label="All pages" onClick={onGrid}><Grid /></button>
      </div>
    </div>
  );
}
