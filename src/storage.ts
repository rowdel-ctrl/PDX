import type { Page, Project } from './types';
import { newId } from './images';
import { applyLayout } from './layout';

const KEY = 'pdx.projects.v1';

export function listProjects(): Project[] {
  try {
    const list = JSON.parse(localStorage.getItem(KEY) || '[]') as Project[];
    return list.sort((a, b) => b.updated - a.updated);
  } catch { return []; }
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
    marginMm: 10, spacingMm: 5, layout: '1', images: [],
  };
}

export function newProject(name: string, widthMm = 210, heightMm = 297): Project {
  const now = Date.now();
  return { id: newId(), name, created: now, updated: now, unit: 'mm', widthMm, heightMm, pages: [newPage(widthMm, heightMm)] };
}

export { applyLayout };
