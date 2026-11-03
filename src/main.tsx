import { createRoot } from 'react-dom/client';
import App from './App';
import '@fontsource/manrope/400.css';
import '@fontsource/manrope/600.css';
import '@fontsource/manrope/800.css';
import './styles.css';

try { document.documentElement.dataset.theme = localStorage.getItem('pdx.theme') === 'dark' ? 'dark' : 'light'; } catch { /* ignore */ }
createRoot(document.getElementById('root')!).render(<App />);
