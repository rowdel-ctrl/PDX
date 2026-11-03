import { useMemo, useState } from 'react';
import { listProjects, removeProject, saveProject, startProject, type StartKind } from '../storage';
import { deleteImages } from '../images';
import { fmt, presetOf } from '../units';
import PageThumb from '../PageThumb';
import SettingsSheet from '../SettingsSheet';
import { askConfirm } from '../notify';
import SizeSheet from '../SizeSheet';
import { newPage } from '../storage';
import { projectFromTemplate, TEMPLATES } from '../templates';
import { Moon, Sun, Trash, Edit, FrameIcon, Image as ImageIcon, Plus, Size, More, Tune, Close } from '../icons';

export default function Projects({ onOpen, onPoster }: { onOpen: (id: string, tab?: 'images' | 'frames' | 'layout') => void; onPoster: () => void }) {
  const [list, setList] = useState(listProjects);
  const [dark, setDark] = useState(document.documentElement.dataset.theme === 'dark');
  const [menu, setMenu] = useState<string | null>(null);
  const [askSize, setAskSize] = useState<StartKind | null>(null);
  const [printer, setPrinter] = useState(false);
  const [prints, setPrints] = useState<'Photo prints' | 'ID photos' | null>(null);
  const refresh = () => setList(listProjects());
  const thumbs = useMemo(() => TEMPLATES.map((t) => ({ t, page: t.make(newPage(t.w, t.h)) })), []);

  const toggle = () => {
    const next = !dark;
    setDark(next);
    document.documentElement.dataset.theme = next ? 'dark' : 'light';
    try { localStorage.setItem('pdx.theme', next ? 'dark' : 'light'); } catch { /* ignore */ }
  };
  const create = (kind: StartKind, size?: { w: number; h: number }) => {
    const { project, tab } = startProject(kind, size);
    saveProject(project);
    onOpen(project.id, tab);
  };
  // Documents, collages and blank pages ask for a size first. ID photos and photo prints have fixed sizes.
  const start = (kind: StartKind) => (kind === 'prints' ? setPrints('Photo prints') : kind === 'id' ? setPrints('ID photos') : kind === 'document' || kind === 'blank' || kind === 'collage' ? setAskSize(kind) : create(kind));
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
    if (!(await askConfirm({ title: `Delete "${p.name}"?`, body: 'The project and its photos are removed from this phone. This cannot be undone.', ok: 'Delete', danger: true }))) return;
    await deleteImages([...new Set([...p.pages.flatMap((pg) => [...pg.images.map((i) => i.file), ...pg.frames.map((f) => f.file).filter(Boolean)]), ...p.tray.map((t) => t.file)])]);
    removeProject(id); refresh(); setMenu(null);
  };

  const starts: [StartKind | 'poster', string, () => React.ReactElement, string][] = [
    ['id', 'ID photos', FrameIcon, 'c1'], ['prints', 'Photo prints', ImageIcon, 'c2'],
    ['poster', 'Tarpapel poster', Size, 'c5'], ['blank', 'Blank', Plus, 'c6'],
  ];

  return (
    <div className="screen">
      <header className="topbar">
        <div className="wordmark">PDX</div>
        <div style={{ display: 'flex', gap: 4 }}>
          <button className="icon-btn" onClick={() => setPrinter(true)} aria-label="Printer check"><Tune /></button>
          <button className="icon-btn" onClick={toggle} aria-label="Toggle dark theme">{dark ? <Sun /> : <Moon />}</button>
        </div>
      </header>
      <main className="scroll pad">
        <h1>What will you make?</h1>
        <div className="starts">
          {starts.map(([k, label, Ic, cls]) => (
            <button key={k} className={'start ' + cls} onClick={() => (k === 'poster' ? onPoster() : start(k))}><Ic />{label}</button>
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
      {prints && (
        <div className="sheet-back" onClick={() => setPrints(null)}>
          <div className="sheet" role="dialog" aria-label={prints} onClick={(e) => e.stopPropagation()}>
            <div className="sheet-grab" />
            <div className="sheet-head"><b>{prints}</b><button className="icon-btn" onClick={() => setPrints(null)} aria-label="Close"><Close /></button></div>
            <p className="muted small" style={{ margin: '0 0 8px' }}>{prints === 'ID photos' ? 'Pick a sheet of ID photos. You can change frame sizes later.' : 'Pick a print size. One photo per page, or several on a sheet.'}</p>
            <div className="print-scroll">{(() => {
              const inch = (v: number) => String(Math.round((v / 25.4) * 10) / 10);
              const all = thumbs.map((x, i) => ({ ...x, i })).filter((x) => x.t.group === prints);
              const groups: [string, string, typeof all][] = prints === 'Photo prints'
                ? [['Same size paper', 'Print on photo paper of the same size as the name.', all.filter((x) => x.t.w !== 210)], ['Only have A4 photo paper?', 'Several photos on one A4 sheet. Cut them out after printing.', all.filter((x) => x.t.w === 210)]]
                : [['Sheets', '', all]];
              return groups.map(([title, hint, list]) => list.length > 0 && (
                <div key={title}>
                  {prints === 'Photo prints' && <div className="print-head"><b>{title}</b><span className="muted small">{hint}</span></div>}
                  <div className="print-grid">
                    {list.map(({ t, page, i }) => (
                      <button key={t.id} className="tcard" onClick={() => { setPrints(null); fromTemplate(i); }}>
                        <span className="tcard-thumb"><PageThumb page={page} maxW={78} maxH={92} /></span>
                        <span className="tcard-name">{t.name}</span>
                        <span className="tcard-sub">{t.w === 210 ? 'A4 paper' : `Paper ${inch(t.w)}×${inch(t.h)} in`}{page.frames.length > 1 ? ` · ${page.frames.length} photos` : ''}</span>
                      </button>
                    ))}
                  </div>
                </div>
              ));
            })()}</div>
          </div>
        </div>
      )}
      {printer && <SettingsSheet onClose={() => setPrinter(false)} />}
      {askSize && <SizeSheet title={askSize === 'collage' ? 'New collage' : askSize === 'blank' ? 'New page' : 'New document'} onClose={() => setAskSize(null)} onCreate={(size) => { const k = askSize; setAskSize(null); create(k, size); }} />}
    </div>
  );
}
