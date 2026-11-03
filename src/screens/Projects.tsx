import { useMemo, useState } from 'react';
import { listProjects, removeProject, saveProject, startProject, type StartKind } from '../storage';
import { deleteImages } from '../images';
import { fmt, presetOf } from '../units';
import PageThumb from '../PageThumb';
import { newPage } from '../storage';
import { projectFromTemplate, TEMPLATES } from '../templates';
import { Moon, Sun, Trash, Edit, FrameIcon, Image as ImageIcon, Grid, Pages as PagesIcon, Plus, Size, More } from '../icons';

export default function Projects({ onOpen, onPoster }: { onOpen: (id: string, tab?: 'images' | 'frames' | 'layout') => void; onPoster: () => void }) {
  const [list, setList] = useState(listProjects);
  const [dark, setDark] = useState(document.documentElement.dataset.theme === 'dark');
  const [menu, setMenu] = useState<string | null>(null);
  const refresh = () => setList(listProjects());
  const thumbs = useMemo(() => TEMPLATES.map((t) => ({ t, page: t.make(newPage(t.w, t.h)) })), []);

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
  const fromTemplate = (i: number) => {
    const p = projectFromTemplate(TEMPLATES[i]);
    saveProject(p);
    onOpen(p.id, TEMPLATES[i].group === 'Collage' ? 'frames' : 'frames');
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
    await deleteImages([...new Set([...p.pages.flatMap((pg) => [...pg.images.map((i) => i.file), ...pg.frames.map((f) => f.file).filter(Boolean)]), ...p.tray.map((t) => t.file)])]);
    removeProject(id); refresh(); setMenu(null);
  };

  const starts: [StartKind | 'poster', string, () => React.ReactElement, string][] = [
    ['id', 'ID photos', FrameIcon, 'c1'], ['prints', 'Photo prints', ImageIcon, 'c2'], ['collage', 'Collage', Grid, 'c3'],
    ['document', 'Document', PagesIcon, 'c4'], ['poster', 'Tarpapel poster', Size, 'c5'], ['blank', 'Blank', Plus, 'c6'],
  ];

  return (
    <div className="screen">
      <header className="topbar">
        <div className="wordmark">PDX</div>
        <button className="icon-btn" onClick={toggle} aria-label="Toggle dark theme">{dark ? <Sun /> : <Moon />}</button>
      </header>
      <main className="scroll pad">
        <h1>What will you make?</h1>
        <div className="starts">
          {starts.map(([k, label, Ic, cls]) => (
            <button key={k} className={'start ' + cls} onClick={() => (k === 'poster' ? onPoster() : create(k))}><Ic />{label}</button>
          ))}
        </div>

        <h2 className="sec">Templates</h2>
        <div className="hscroll">
          {thumbs.map(({ t, page }, i) => (
            <button key={t.id} className="tcard" onClick={() => fromTemplate(i)}>
              <span className="tcard-thumb"><PageThumb page={page} maxW={78} maxH={92} /></span>
              <span className="tcard-name">{t.name}</span>
            </button>
          ))}
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
                  <div className="card-thumb"><PageThumb page={pg} maxW={140} maxH={112} /></div>
                  <div className="card-info">
                    <div className="card-name">{p.name}</div>
                    <div className="muted small">{sz} · {p.pages.length} {p.pages.length === 1 ? 'page' : 'pages'}</div>
                  </div>
                </button>
                <button className="dots" aria-label="Project options" onClick={() => setMenu(menu === p.id ? null : p.id)}><More /></button>
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
