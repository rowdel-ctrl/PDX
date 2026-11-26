import { lazy, Suspense, useEffect, useState } from 'react';
import { checkUpdate, downloadUpdate, type Update } from './update';
import Projects from './screens/Projects';
import { ChoiceHost, ConfirmHost } from './notify';

const Editor = lazy(() => import('./screens/Editor'));
const Tarpapel = lazy(() => import('./screens/Tarpapel'));
const Scan = lazy(() => import('./screens/Scan'));
const Fill = lazy(() => import('./screens/Fill'));

export default function App() {
  const [open, setOpen] = useState<{ id: string; tab?: 'images' | 'frames' | 'layout' } | null>(null);
  const [poster, setPoster] = useState(false);
  const [tool, setTool] = useState<'scan' | 'fill' | null>(null);
  const [seed, setSeed] = useState<Blob[] | undefined>();
  const [upd, setUpd] = useState<Update | null>(null);
  useEffect(() => { checkUpdate().then(setUpd); }, []);
  const [over, setOver] = useState(false); // Fill shown on top of a Scan that stays alive underneath
  const scan = tool === 'scan' ? <div style={{ display: over ? 'none' : 'contents' }}><Scan onBack={() => setTool(null)} onType={(b) => { setSeed(b); setOver(true); }} onOpen={(id) => { setTool(null); setOpen({ id }); }} /></div> : null;
  const fillTop = over ? <Fill key="over" seed={seed} onBack={() => { setSeed(undefined); setOver(false); }} /> : null;
  const screen = scan ? <>{scan}{fillTop}</>
    : tool === 'fill' ? <Fill onBack={() => setTool(null)} />
    : poster ? <Tarpapel onBack={() => setPoster(false)} />
    : open ? <Editor key={open.id} id={open.id} initialTab={open.tab} onBack={() => setOpen(null)} /> : <Projects onOpen={(id, tab) => setOpen({ id, tab })} onPoster={() => setPoster(true)} onTool={(t) => { setSeed(undefined); setTool(t); }} />;
  return <><Suspense fallback={<div className="screen loading-screen" role="status">Opening…</div>}>{screen}</Suspense>
    {upd && (
      <div className="update-card" role="alert">
        <div className="grow-text"><b>Update available</b><br />PDX build {upd.build} is ready.</div>
        <button className="btn tonal" onClick={() => setUpd(null)}>Later</button>
        <button className="btn primary" onClick={() => { downloadUpdate(upd); setUpd(null); }}>Update</button>
      </div>
    )}
    <ConfirmHost /><ChoiceHost /></>;
}
