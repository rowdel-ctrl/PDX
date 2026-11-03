import { createRoot } from 'react-dom/client';
import App from './App';
import { installBackButton } from './back';
import '@fontsource/roboto/400.css';
import '@fontsource/roboto/500.css';
import '@fontsource/roboto/700.css';
import './styles.css';

try { document.documentElement.dataset.theme = localStorage.getItem('pdx.theme') === 'dark' ? 'dark' : 'light'; } catch { /* ignore */ }
installBackButton();
createRoot(document.getElementById('root')!).render(<App />);
