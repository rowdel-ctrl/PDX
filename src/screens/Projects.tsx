import { useState } from 'react';
import { listProjects, newProject, removeProject, saveProject } from '../storage';
import { deleteImages } from '../images';
import { fmt, presetOf } from '../units';
import PageThumb from '../PageThumb';
import { Moon, Plus, Sun, Trash, Edit } from '../icons';

export default function Projects({ onOpen, onPoster }: { onOpen: (id: string) => void; onPoster: () => void }) {
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
  const create = () => {
    const p = newProject(`Project ${list.length + 1}`);
    saveProject(p);
    onOpen(p.id);
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
        <h1>Projects</h1>
        <p className="muted">Saved on this phone</p>
        {list.length === 0 && <p className="empty muted">No projects yet. Tap "New project" to start.</p>}
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
      <footer className="footbar"><button className="btn" onClick={onPoster}>Tarpapel poster</button>
        <button className="btn primary" onClick={create}><Plus /> New project</button></footer>
    </div>
  );
}
