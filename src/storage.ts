import type { Page, Project } from './types';
import { newId } from './images';
import { applyLayout, fillFrames } from './layout';
import type { LayoutId } from './types';

const KEY = 'pdx.projects.v1';

export function listProjects(): Project[] {
  try {
    const list = (JSON.parse(localStorage.getItem(KEY) || '[]') as Project[]).map(normalize);
    return list.sort((a, b) => b.updated - a.updated);
  } catch { return []; }
}

/** Fill in fields older saved projects don't have. */
function normalize(p: Project): Project {
  return {
    ...p, pageNumbers: p.pageNumbers ?? false, frameBorder: p.frameBorder ?? { on: (p as unknown as { cutLines?: boolean }).cutLines ?? true, widthMm: 0.3, color: '#555555', place: 'outside' }, cropMarks: p.cropMarks ?? false, tray: p.tray ?? [],
    pages: p.pages.map((pg) => ({
      ...pg, texts: pg.texts ?? [], frames: pg.frames ?? [],
      images: pg.images.map((im) => ({ ...im, rot: im.rot ?? 0, crop: im.crop ?? { x: 0, y: 0, w: 1, h: 1 } })),
    })),
  };
}

export function saveProject(p: Project) {
  const all = listProjects().filter((x) => x.id !== p.id);
  all.push({ ...p, updated: Date.now() });
  localStorage.setItem(KEY, JSON.stringify(all));
}

export function removeProject(id: string) {
  localStorage.setItem(KEY, JSON.stringify(listProjects().filter((x) => x.id !== id)));
}

export function newPage(widthMm: number, heightMm: number): Page {
  return {
    id: newId(), widthMm, heightMm, background: '#FFFFFF',
    border: { on: false, widthMm: 1, color: '#12151C' },
    marginMm: 10, spacingMm: 5, layout: '1', images: [], texts: [], frames: [],
  };
}

export function newProject(name: string, widthMm = 210, heightMm = 297): Project {
  const now = Date.now();
  return { id: newId(), name, created: now, updated: now, unit: 'mm', widthMm, heightMm, pageNumbers: false, frameBorder: { on: true, widthMm: 0.3, color: '#555555', place: 'outside' }, cropMarks: false, tray: [], pages: [newPage(widthMm, heightMm)] };
}

export { applyLayout };

export type StartKind = 'id' | 'prints' | 'collage' | 'document' | 'blank';

/** New project already set up for a common job (page size, layout, frames). */
export function startProject(kind: StartKind, size?: { w: number; h: number }): { project: Project; tab: 'images' | 'frames' | 'layout' } {
  const cfg: Record<StartKind, { name: string; w: number; h: number; layout: LayoutId; margin: number; spacing: number }> = {
    id: { name: 'ID photos', w: 210, h: 297, layout: '1', margin: 10, spacing: 5 },
    prints: { name: 'Photo prints', w: 101.6, h: 152.4, layout: '1', margin: 3, spacing: 3 },
    collage: { name: 'Collage', w: 210, h: 297, layout: '2x2', margin: 10, spacing: 5 },
    document: { name: 'Document', w: 210, h: 297, layout: '1', margin: 10, spacing: 5 },
    blank: { name: 'Untitled', w: 210, h: 297, layout: '1', margin: 10, spacing: 5 },
  };
  const c = { ...cfg[kind], ...(size ? { w: size.w, h: size.h } : {}) };
  const project = newProject(c.name, c.w, c.h);
  let pg = { ...project.pages[0], layout: c.layout, marginMm: c.margin, spacingMm: c.spacing };
  if (kind === 'id') pg = { ...pg, frames: fillFrames(pg, 35, 45) };
  project.pages = [pg];
  return { project, tab: kind === 'id' ? 'frames' : kind === 'collage' ? 'layout' : 'images' };
}
