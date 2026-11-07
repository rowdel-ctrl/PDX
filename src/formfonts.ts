import carlito from '@fontsource/carlito/files/carlito-latin-400-normal.woff?url';
import tinos from '@fontsource/tinos/files/tinos-latin-400-normal.woff?url';
import arimo from '@fontsource/arimo/files/arimo-latin-400-normal.woff?url';
import caladea from '@fontsource/caladea/files/caladea-latin-400-normal.woff?url';
import gelasio from '@fontsource/gelasio/files/gelasio-latin-400-normal.woff?url';
import cousine from '@fontsource/cousine/files/cousine-latin-400-normal.woff?url';
import openSans from '@fontsource/open-sans/files/open-sans-latin-400-normal.woff?url';
import caveat from '@fontsource/caveat/files/caveat-latin-500-normal.woff?url';
import poppins from '@fontsource/poppins/files/poppins-latin-400-normal.woff?url';

/** Common fonts. Each uses a free font with the same letter widths, so the page looks the same wherever it is opened. */
export interface FormFont { id: string; label: string; family: string; url: string }
export const FORM_FONTS: FormFont[] = [
  { id: 'calibri', label: 'Calibri', family: 'Carlito', url: carlito },
  { id: 'times', label: 'Times New Roman', family: 'Tinos', url: tinos },
  { id: 'arial', label: 'Arial', family: 'Arimo', url: arimo },
  { id: 'cambria', label: 'Cambria', family: 'Caladea', url: caladea },
  { id: 'georgia', label: 'Georgia', family: 'Gelasio', url: gelasio },
  { id: 'courier', label: 'Courier New', family: 'Cousine', url: cousine },
  { id: 'verdana', label: 'Verdana', family: 'Open Sans', url: openSans },
  { id: 'hand', label: 'Handwriting', family: 'Caveat', url: caveat },
  { id: 'poppins', label: 'Poppins', family: 'Poppins', url: poppins },
];
export const fontOf = (id: string) => FORM_FONTS.find((f) => f.id === id) ?? FORM_FONTS[0];

let loaded: Promise<void> | null = null;
export function loadFormFonts(): Promise<void> {
  loaded ??= Promise.all(FORM_FONTS.map(async (f) => { try { const ff = new FontFace(f.family, `url(${f.url})`); await ff.load(); document.fonts.add(ff); } catch { /* falls back to a system font */ } })).then(() => undefined);
  return loaded;
}
