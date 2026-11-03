import { useState } from 'react';
import Projects from './screens/Projects';
import Editor from './screens/Editor';
import Tarpapel from './screens/Tarpapel';

export default function App() {
  const [openId, setOpenId] = useState<string | null>(null);
  const [poster, setPoster] = useState(false);
  if (poster) return <Tarpapel onBack={() => setPoster(false)} />;
  return openId ? <Editor id={openId} onBack={() => setOpenId(null)} /> : <Projects onOpen={setOpenId} onPoster={() => setPoster(true)} />;
}
