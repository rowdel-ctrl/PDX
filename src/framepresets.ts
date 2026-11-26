export interface FramePreset {
  id: string;
  name: string;
  wMm: number;
  hMm: number;
}

const KEY = 'pdx.framepresets.v1';

function isFramePreset(value: unknown): value is FramePreset {
  return typeof value === 'object' && value !== null &&
    'id' in value && typeof value.id === 'string' &&
    'name' in value && typeof value.name === 'string' &&
    'wMm' in value && typeof value.wMm === 'number' && Number.isFinite(value.wMm) && value.wMm > 0 &&
    'hMm' in value && typeof value.hMm === 'number' && Number.isFinite(value.hMm) && value.hMm > 0;
}

export function listFramePresets(): FramePreset[] {
  const raw = localStorage.getItem(KEY);
  if (!raw) return [];

  let value: unknown;
  try { value = JSON.parse(raw); } catch { throw new Error('Saved frame sizes could not be read.'); }
  if (!Array.isArray(value) || !value.every(isFramePreset)) throw new Error('Saved frame sizes are invalid.');
  return value;
}

export function saveFramePreset(name: string, wMm: number, hMm: number): FramePreset[] {
  const cleanName = name.trim();
  if (!cleanName || !Number.isFinite(wMm) || wMm <= 0 || !Number.isFinite(hMm) || hMm <= 0) {
    throw new Error('Enter a name and valid frame dimensions.');
  }

  const presets = listFramePresets();
  const index = presets.findIndex((p) => p.name.toLocaleLowerCase() === cleanName.toLocaleLowerCase());
  const preset = {
    id: index >= 0 ? presets[index].id : Math.random().toString(36).slice(2, 10) + Date.now().toString(36),
    name: cleanName,
    wMm,
    hMm,
  };
  const next = index >= 0 ? presets.map((p, i) => i === index ? preset : p) : [...presets, preset];
  localStorage.setItem(KEY, JSON.stringify(next));
  return next;
}

export function deleteFramePreset(id: string): FramePreset[] {
  const next = listFramePresets().filter((p) => p.id !== id);
  localStorage.setItem(KEY, JSON.stringify(next));
  return next;
}
