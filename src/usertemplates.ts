import type { Frame, Page, PageText } from './types';
import { newId } from './images';
import type { Template } from './templates';

const KEY = 'pdx.mytemplates';

interface Saved { id: string; name: string; w: number; h: number; margin: number; spacing: number; background: string; border: Page['border']; frames: Frame[]; texts: PageText[] }

const read = (): Saved[] => { try { return JSON.parse(localStorage.getItem(KEY) || '[]'); } catch { return []; } };
const write = (l: Saved[]) => { try { localStorage.setItem(KEY, JSON.stringify(l)); } catch { /* full */ } };

/** Save the frames, text and page set-up of a page (not the photos) so it can be used again. */
export function saveMyTemplate(name: string, pg: Page) {
  const frames = pg.frames.map((f) => ({ ...f, file: '', zoom: 1, cx: 0.5, cy: 0.5, rot: 0, bg: undefined, locked: false }));
  write([...read(), { id: newId(), name: name.trim() || 'My template', w: pg.widthMm, h: pg.heightMm, margin: pg.marginMm, spacing: pg.spacingMm, background: pg.background, border: pg.border, frames, texts: pg.texts }]);
}

export const removeMyTemplate = (id: string) => write(read().filter((t) => t.id !== id));

export function myTemplates(): Template[] {
  return read().map((s) => ({
    id: s.id, name: s.name, group: 'My templates', w: s.w, h: s.h,
    make: (p) => ({
      ...p, widthMm: s.w, heightMm: s.h, layout: 'free', images: [], fill: undefined, marginMm: s.margin, spacingMm: s.spacing, background: s.background, border: s.border,
      frames: s.frames.map((f) => ({ ...f, id: newId() })), texts: s.texts.map((t) => ({ ...t, id: newId() })),
    }),
  }));
}
