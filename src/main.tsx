import { createRoot } from 'react-dom/client';
import App from './App';
import { installBackButton } from './back';
import '@fontsource/poppins/400.css';
import '@fontsource/poppins/500.css';
import '@fontsource/poppins/600.css';
import '@fontsource/inter/400.css';
import '@fontsource/inter/500.css';
import './styles.css';

try { document.documentElement.dataset.theme = localStorage.getItem('pdx.theme') === 'dark' ? 'dark' : 'light'; } catch { /* ignore */ }
installBackButton();
createRoot(document.getElementById('root')!).render(<App />);
