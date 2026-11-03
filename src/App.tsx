import { useState } from 'react';
import Projects from './screens/Projects';
import Editor from './screens/Editor';
import Tarpapel from './screens/Tarpapel';

export default function App() {
  const [open, setOpen] = useState<{ id: string; tab?: 'images' | 'frames' | 'layout' } | null>(null);
  const [poster, setPoster] = useState(false);
  if (poster) return <Tarpapel onBack={() => setPoster(false)} />;
  return open ? <Editor key={open.id} id={open.id} initialTab={open.tab} onBack={() => setOpen(null)} /> : <Projects onOpen={(id, tab) => setOpen({ id, tab })} onPoster={() => setPoster(true)} />;
}
