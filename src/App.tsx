import { useState } from 'react';
import Projects from './screens/Projects';
import Editor from './screens/Editor';
import Tarpapel from './screens/Tarpapel';
import Scan from './screens/Scan';
import Fill from './screens/Fill';
import { ChoiceHost, ConfirmHost } from './notify';

export default function App() {
  const [open, setOpen] = useState<{ id: string; tab?: 'images' | 'frames' | 'layout' } | null>(null);
  const [poster, setPoster] = useState(false);
  const [tool, setTool] = useState<'scan' | 'fill' | null>(null);
  const [seed, setSeed] = useState<Blob[] | undefined>();
  const screen = tool === 'scan' ? <Scan onBack={() => setTool(null)} onType={(b) => { setSeed(b); setTool('fill'); }} onOpen={(id) => { setTool(null); setOpen({ id }); }} />
    : tool === 'fill' ? <Fill key={seed ? 's' : 'n'} seed={seed} onBack={() => { setSeed(undefined); setTool(null); }} />
    : poster ? <Tarpapel onBack={() => setPoster(false)} />
    : open ? <Editor key={open.id} id={open.id} initialTab={open.tab} onBack={() => setOpen(null)} /> : <Projects onOpen={(id, tab) => setOpen({ id, tab })} onPoster={() => setPoster(true)} onTool={(t) => { setSeed(undefined); setTool(t); }} />;
  return <>{screen}<ConfirmHost /><ChoiceHost /></>;
}
