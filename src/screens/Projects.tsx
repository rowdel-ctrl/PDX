import { useState } from 'react';
import { listProjects, removeProject, saveProject, startProject, type StartKind } from '../storage';
import { deleteImages } from '../images';
import { fmt, presetOf } from '../units';
import PageThumb from '../PageThumb';
import { Moon, Sun, Trash, Edit, FrameIcon, Image as ImageIcon, Grid, Pages as PagesIcon, Plus, Size } from '../icons';

export default function Projects({ onOpen, onPoster }: { onOpen: (id: string, tab?: 'images' | 'frames' | 'layout') => void; onPoster: () => void }) {
  const [list, setList] = useState(listProjects);
  const [dark, setDark] = useState(document.documentElement.dataset.theme === 'dark');
  const [menu, setMenu] = useState<string | null>(null);
  const refresh = () => setList(listProjects());

  const toggle = () => {
    const next = !dark;
    setDark(next);
    document.documentElement.dataset.theme = next ? 'dark' : 'light';
    try { localStorage.setItem('pdx.theme', next ? 'dark' : 'light'); } catch { /* ignore */ }
  };
  const create = (kind: StartKind) => {
    const { project, tab } = startProject(kind);
    saveProject(project);
    onOpen(project.id, tab);
  };
  const rename = (id: string) => {
    const p = list.find((x) => x.id === id)!;
    const name = prompt('Rename project', p.name)?.trim();
    if (name) { saveProject({ ...p, name }); refresh(); }
    setMenu(null);
  };
  const del = async (id: string) => {
    const p = list.find((x) => x.id === id)!;
    if (!confirm(`Delete "${p.name}"? This can't be undone.`)) return;
    await deleteImages([...new Set(p.pages.flatMap((pg) => pg.images.map((i) => i.file)))]);
    removeProject(id); refresh(); setMenu(null);
  };

  return (
    <div className="screen">
      <header className="topbar">
        <div className="wordmark">PDX</div>
        <button className="icon-btn" onClick={toggle} aria-label="Toggle dark mode">{dark ? <Sun /> : <Moon />}</button>
      </header>
      <main className="scroll pad">
        <h1>What will you make?</h1>
        <div className="starts">
          {([
            ['id', 'ID photos', FrameIcon, '#E7EAFF'], ['prints', 'Photo prints', ImageIcon, '#FFE5D6'], ['collage', 'Collage', Grid, '#DDF3E4'],
            ['document', 'Document', PagesIcon, '#F1E3FA'],
          ] as [StartKind, string, () => React.ReactElement, string][]).map(([k, label, Ic, bg]) => (
            <button key={k} className="start" onClick={() => create(k)}><span className="start-ic" style={{ background: bg }}><Ic /></span>{label}</button>
          ))}
          <button className="start" onClick={onPoster}><span className="start-ic" style={{ background: '#FFF3C4' }}><Size /></span>Tarpapel poster</button>
          <button className="start" onClick={() => create('blank')}><span className="start-ic" style={{ background: 'var(--accent-soft)' }}><Plus /></span>Blank</button>
        </div>
        <h2 className="sec">Recent</h2>
        {list.length === 0 && <p className="empty muted">Your projects will show up here. Saved on this phone.</p>}
        <div className="cards">
          {list.map((p) => {
            const pg = p.pages[0];
            const sz = presetOf(p.widthMm, p.heightMm) ?? `${fmt(p.widthMm, p.unit)}×${fmt(p.heightMm, p.unit)} ${p.unit}`;
            return (
              <div key={p.id} className="card">
                <button className="card-main" onClick={() => onOpen(p.id)}>
                  <div className="card-thumb"><PageThumb page={pg} maxW={140} maxH={150} /></div>
                  <div className="card-name">{p.name}</div>
                  <div className="muted small">{sz} · {p.pages.length} {p.pages.length === 1 ? 'page' : 'pages'}</div>
                </button>
                <button className="dots" aria-label="Project options" onClick={() => setMenu(menu === p.id ? null : p.id)}>⋯</button>
                {menu === p.id && (
                  <div className="menu">
                    <button onClick={() => rename(p.id)}><Edit /> Rename</button>
                    <button className="danger" onClick={() => del(p.id)}><Trash /> Delete</button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </main>
    </div>
  );
}
