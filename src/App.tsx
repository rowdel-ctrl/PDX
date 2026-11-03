import { useState } from 'react';
import Projects from './screens/Projects';
import Editor from './screens/Editor';

export default function App() {
  const [openId, setOpenId] = useState<string | null>(null);
  return openId ? <Editor id={openId} onBack={() => setOpenId(null)} /> : <Projects onOpen={setOpenId} />;
}
