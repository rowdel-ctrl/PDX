import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Crop, Frame, LayoutId, Page, PageImage, PageText, Project, TrayItem } from '../types';
import { listProjects, newPage, saveProject } from '../storage';
import { applyLayout, cellCount, gridBox, cellRect, clampFrame, cropToAspect, dispAspect, emptyFrame, fillFrames, fillPage, frameCrop, freeBox, freeSpot, rotateCrop } from '../layout';
import { alignItems, distributeItems, findItem, gapItems, fillGrid, groupBox, mapSelected, reorder, scaleItems, selectWhere, setBoxMm, type SelectMode, type AlignMode, type AnyItem } from '../arrange';
import { deleteImages, evenLight as evenLightFile, FULL, importImage, makeCutout, newId } from '../images';
import RefineEdges from '../RefineEdges';
import { faceFit, findFaces, mainFace, type Face } from '../vision';
import { useBack } from '../back';
import { askChoice, askConfirm, kindOf, Toast, type ToastKind } from '../notify';
import PageCanvas, { type SelBox } from '../PageCanvas';
import PagePill from '../PagePill';
import CropCard from '../CropCard';
import PageGrid from '../PageGrid';
import ExportSheet from './Export';
import { FloatingToolbar, PositionSheet } from '../Toolbar';
import { ExactSheet, FillGridSheet } from '../sheets';
import { AddPanel, ItemPanel, LayoutPanel, PagePanel, TextPanel } from '../panels';
import { EdCtx, type AddTab, type Ed, type PanelId } from '../editorContext';
import type { Template } from '../templates';
import { presetOf } from '../units';
import { Back, Checklist, Close, Hand, Grid, Plus, Redo, Share, Tune, Type, Undo, Image as ImageIcon } from '../icons';

export type Tab = PanelId;
const NAV: [PanelId, string, () => React.ReactElement][] = [
  ['add', 'Add', Plus], ['layout', 'Layout', Grid], ['text', 'Text', Type], ['page', 'Page', Tune],
];
const TITLES: Record<PanelId, string> = { add: 'Add', layout: 'Layout', text: 'Text', page: 'Page', item: 'Edit' };

const filesOf = (p: Project) => new Set([
  ...p.pages.flatMap((pg) => [...pg.images.map((i) => i.file), ...pg.frames.map((f) => f.file).filter(Boolean)]),
  ...p.tray.map((t) => t.file),
]);
const clampN = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));

/** ID-sheet style: several empty frames, all the same small size. One photo then goes in every frame. */
const idSheet = (pg: Page) => pg.frames.length > 1 && pg.frames.every((f) => !f.file)
  && pg.frames.every((f) => Math.abs(f.w - pg.frames[0].w) * pg.widthMm < 0.6 && Math.abs(f.h - pg.frames[0].h) * pg.heightMm < 0.6)
  && pg.frames[0].w * pg.widthMm <= 80;

export default function Editor({ id, onBack, initialTab }: { id: string; onBack: () => void; initialTab?: 'images' | 'frames' | 'layout' }) {
  const [proj, setProj] = useState<Project | null>(() => listProjects().find((p) => p.id === id) ?? null);
  const projRef = useRef(proj);
  const past = useRef<Project[]>([]);
  const future = useRef<Project[]>([]);
  const lastPush = useRef(0);
  const seen = useRef<Set<string>>(new Set(proj ? filesOf(proj) : []));
  const [hist, setHist] = useState({ u: 0, r: 0 });
  const [pi, setPi] = useState(0);
  const [sel, setSel] = useState<string[]>([]);
  const [multi, setMulti] = useState(false);
  const [hand, setHand] = useState(false);
  const [panel, setPanel] = useState<PanelId | null>(initialTab === 'layout' ? 'layout' : initialTab === 'frames' ? 'add' : null);
  const [addTab, setAddTab] = useState<AddTab>('photos');
  const [exporting, setExporting] = useState(false);
  const [posOpen, setPosOpen] = useState(false);
  const [gridOpen, setGridOpen] = useState(false);
  const [toast, setToast] = useState<{ text: string; kind: ToastKind } | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const [saved, setSaved] = useState(true);
  const [fsize, setFs] = useState({ w: 35, h: 45 });
  const [selTray, setSelTray] = useState<string | null>(null);
  const [adjust, setAdjust] = useState(false);
  const [shownPanel, setShownPanel] = useState<PanelId>('add');
  const [sameAll, setSameAll] = useState(true);
  const [autoFace, setAutoFace] = useState(false);   // off unless the user turns it on
  const [faces, setFaces] = useState<Face[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState<string | null>(null);
  const [selBox, setSelBox] = useState<SelBox | null>(null);
  const [dragging, setDragging] = useState(false);
  const hit = useRef<((x: number, y: number) => string | null) | null>(null);
  const lastTap = useRef({ id: '', t: 0 });

  useEffect(() => { if (panel) setShownPanel(panel); }, [panel]);
  useEffect(() => {
    if (!proj) return;
    setSaved(false);
    const t = setTimeout(() => { saveProject(proj); setSaved(true); }, 400);
    return () => clearTimeout(t);
  }, [proj]);

  const say = useCallback((m: string) => {
    const kind = kindOf(m);
    setToast({ text: m, kind }); clearTimeout(toastTimer.current);
    if (kind === 'ok') navigator.vibrate?.(12); else if (kind === 'warn') navigator.vibrate?.([20, 40, 20]);
    toastTimer.current = setTimeout(() => setToast(null), kind === 'busy' ? 20000 : kind === 'warn' ? 5500 : 3600);
  }, []);
  const sync = () => setHist({ u: past.current.length, r: future.current.length });

  /** Every change goes through here so it can be undone. Quick bursts (slider drags) count as one step. */
  const edit = useCallback((fn: (p: Project) => Project) => {
    const cur = projRef.current;
    if (!cur) return;
    const next = fn(cur);
    if (next === cur) return;
    const now = Date.now();
    if (now - lastPush.current > 500) { past.current.push(cur); if (past.current.length > 60) past.current.shift(); }
    lastPush.current = now;
    future.current = [];
    projRef.current = next; setProj(next); sync();
  }, []);
  const piRef = useRef(pi); piRef.current = pi;
  const editPage = useCallback((fn: (pg: Page) => Page, index?: number) => {
    const i = index ?? piRef.current;
    edit((p) => ({ ...p, pages: p.pages.map((pg, k) => (k === i ? fn(pg) : pg)) }));
  }, [edit]);

  const jump = (to: Project) => {
    projRef.current = to; setProj(to); sync();
    setPi((i) => Math.min(i, to.pages.length - 1)); setSel([]);
    lastPush.current = 0;
  };
  const undo = () => { const p = past.current.pop(); if (p && projRef.current) { future.current.push(projRef.current); jump(p); } };
  const redo = () => { const p = future.current.pop(); if (p && projRef.current) { past.current.push(projRef.current); jump(p); } };

  const leave = () => {
    const cur = projRef.current;
    if (cur) {
      saveProject(cur);
      const keep = filesOf(cur);
      deleteImages([...seen.current].filter((f) => !keep.has(f)));
    }
    onBack();
  };
  useBack(() => {
    if (posOpen) setPosOpen(false);
    else if (gridOpen) setGridOpen(false);
    else if (exporting) setExporting(false);
    else if (panel) setPanel(null);
    else leave();
  });

  const page: Page | undefined = proj ? proj.pages[Math.min(pi, proj.pages.length - 1)] : undefined;
  // only keep selected ids that still exist (after undo, delete, page change)
  const selIds = useMemo(() => (page ? sel.filter((i) => findItem(page, i)) : []), [sel, page]);
  const selImage = page && selIds.length === 1 ? page.images.find((i) => i.id === selIds[0]) ?? null : null;
  const selFrame = page && selIds.length === 1 ? page.frames.find((i) => i.id === selIds[0]) ?? null : null;
  const selText = page && selIds.length === 1 ? page.texts.find((i) => i.id === selIds[0]) ?? null : null;
  useEffect(() => { if (!selFrame?.file) setAdjust(false); }, [selFrame?.file, selFrame?.id]);
  useEffect(() => {
    if (!adjust || !selFrame?.file) { setFaces([]); return; }
    let on = true;
    findFaces(selFrame.file, selFrame.rot).then((l) => { if (on) setFaces(l); });
    return () => { on = false; };
  }, [adjust, selFrame?.file, selFrame?.rot]);
  useEffect(() => { if (!selIds.length) setSelBox(null); }, [selIds.length]);

  if (!proj || !page) return <div className="screen pad"><button className="btn" onClick={onBack}>Back</button><p>Project not found.</p></div>;
  const unit = proj.unit;

  // ---------------------------------------------------------------- frames
  const updateFrame = (fid: string, patch: Partial<Frame>, idx?: number) =>
    editPage((pg) => ({ ...pg, frames: pg.frames.map((f) => (f.id === fid ? clampFrame({ ...f, ...patch }, pg.widthMm, pg.heightMm) : f)) }), idx);

  /** Move and zoom a frame's photo so a face sits in the middle (the biggest one, or the face you picked). */
  const centerFace = async (fid: string, quiet = false, idx = pi, pick?: Face) => {
    const f = projRef.current?.pages[idx]?.frames.find((q) => q.id === fid);
    if (!f?.file) return;
    if (!quiet) say('Looking for a face…');
    const face = pick ?? mainFace(await findFaces(f.file, f.rot));
    const now = projRef.current?.pages[idx]?.frames.find((q) => q.id === fid);
    if (!now || now.file !== f.file) return;
    if (!face) { if (!quiet) say('No face found. Use Crop to move the photo.'); return; }
    editPage((pg) => ({ ...pg, frames: pg.frames.map((q) => (q.id === fid ? clampFrame({ ...q, ...faceFit(q, face, pg.widthMm, pg.heightMm) }, pg.widthMm, pg.heightMm) : q)) }), idx);
    if (!quiet) say('Face centered');
  };
  const pickFace = (i: number) => { if (selFrame && faces[i]) centerFace(selFrame.id, true, pi, faces[i]); };

  const placePhoto = (fid: string, t: TrayItem) => {
    const fill = { file: t.file, aspect: t.aspect, rot: 0, zoom: 1, cx: 0.5, cy: 0.5 };
    const every = sameAll && idSheet(page);   // first photo on an empty sheet goes in every frame
    const ids = every ? page.frames.map((f) => f.id) : [fid];
    editPage((pg) => ({ ...pg, frames: pg.frames.map((f) => (ids.includes(f.id) ? clampFrame({ ...f, ...fill }, pg.widthMm, pg.heightMm) : f)) }));
    setSel([fid]);
    if (autoFace) for (const i of ids) centerFace(i, true);
  };

  const addFrame = () => {
    let { w, h } = fsize;
    let spot = freeSpot(page, w, h);
    if (!spot) { spot = freeSpot(page, h, w); if (spot) [w, h] = [h, w]; }
    if (!spot) { say('No room for another frame on this page'); return; }
    const f = emptyFrame(spot.x, spot.y, w, h, page.widthMm, page.heightMm);
    editPage((pg) => ({ ...pg, frames: [...pg.frames, f] })); setSel([f.id]);
  };
  const fillWithFrames = () => {
    const fr = fillFrames(page, fsize.w, fsize.h);
    if (!fr.length) { say('That size does not fit on this page'); return; }
    editPage((pg) => ({ ...pg, frames: fr })); setSel([]);
  };
  const resizeFrame = (f: Frame, w: number, h: number) => editPage((pg) => ({
    ...pg, frames: pg.frames.map((q) => {
      if (q.id !== f.id) return q;
      const cx = q.x + q.w / 2, cy = q.y + q.h / 2, fw = w / pg.widthMm, fh = h / pg.heightMm;
      return clampFrame({ ...q, w: fw, h: fh, x: clampN(cx - fw / 2, 0, 1 - fw), y: clampN(cy - fh / 2, 0, 1 - fh) }, pg.widthMm, pg.heightMm);
    }),
  }));
  const rotateFrame = (f: Frame, dir: 1 | -1) => {
    let { cx, cy } = f;
    for (let k = 0; k < (dir === 1 ? 1 : 3); k++) [cx, cy] = [1 - cy, cx];
    updateFrame(f.id, { rot: (f.rot + dir + 4) % 4, cx, cy });
  };
  const copyToAll = (f: Frame) => editPage((pg) => ({
    ...pg, frames: pg.frames.map((q) => clampFrame({ ...q, file: f.file, aspect: f.aspect, rot: f.rot, zoom: f.zoom, cx: f.cx, cy: f.cy, bg: f.bg }, pg.widthMm, pg.heightMm)),
  }));

  // ---------------------------------------------------------------- photo library
  const addToLibrary = async (files: FileList | File[]) => {
    const items: TrayItem[] = [];
    for (const f of Array.from(files)) {
      try { const r = await importImage(f); seen.current.add(r.file); items.push({ id: newId(), file: r.file, aspect: r.aspect }); } catch { /* skip unreadable */ }
    }
    if (items.length) edit((p) => ({ ...p, tray: [...p.tray, ...items] }));
    return items;
  };

  /** Put photos on the page: empty frames first, then loose on frame pages, or layout slots, then new pages. */
  const placeItems = (items: TrayItem[], mode: 'flow' | 'one' | 'separate' = 'flow') => {
    const idx = pi;
    if (mode === 'separate') { placeSeparate(items); return; }
    let extra = 0, placed = 0;
    const filled: { page: number; id: string }[] = [];
    edit((p) => {
      const pages = [...p.pages];
      const queue = [...items];
      let k = idx;
      while (queue.length) {
        const pg = pages[k];
        const same = sameAll && items.length === 1 && idSheet(pg);   // one photo on an empty sheet fills every frame
        const frames = pg.frames.map((f) => {
          if (!f.file && queue.length) {
            const it = same ? queue[0] : queue.shift()!; if (!same) placed++; filled.push({ page: k, id: f.id });
            return { ...f, file: it.file, aspect: it.aspect, rot: 0, zoom: 1, cx: 0.5, cy: 0.5 };
          }
          return f;
        });
        if (same) { queue.shift(); placed++; }
        const imgs = [...pg.images];
        const hasFrames = pg.frames.length > 0;
        let layoutNow = pg.layout;
        if (mode === 'one' && !hasFrames) {
          const need = imgs.length + queue.length;
          layoutNow = need <= 1 ? '1' : need <= 2 ? '2x1' : need <= 4 ? '2x2' : need <= 6 ? '2x3' : need <= 9 ? '3x3' : 'free';
        }
        const total = imgs.length + queue.length;
        const cap = mode === 'one' ? 9999 : hasFrames ? 99 : cellCount(pg.layout);
        while (queue.length && imgs.length < cap) {
          const it = queue.shift()!; placed++;
          imgs.push({ id: newId(), file: it.file, aspect: it.aspect, rot: 0, crop: FULL, ...(mode === 'one' && layoutNow === 'free' && !hasFrames ? gridBox(pg, it.aspect, imgs.length, total) : pg.layout === 'free' || hasFrames ? freeBox(pg, it.aspect, imgs.length) : { x: 0, y: 0, w: 0.5, h: 0.5 }) });
        }
        const layout: LayoutId = hasFrames && imgs.length > pg.images.length ? 'free' : layoutNow;
        const { fill: _drop, ...rest } = pg; void _drop;
        pages[k] = applyLayout({ ...rest, layout, frames, images: imgs });
        if (queue.length) { pages.splice(k + 1, 0, { ...pg, id: newId(), images: [], texts: [], frames: [], fill: undefined }); extra++; k++; }
      }
      return { ...p, pages };
    });
    say(`Added ${placed}${extra ? ` (${extra} new ${extra === 1 ? 'page' : 'pages'})` : ''}`);
    if (autoFace) for (const f of filled) centerFace(f.id, true, f.page);
  };
  /** Each photo gets its own page (a sheet with frames gets the photo in every frame). */
  const placeSeparate = (items: TrayItem[]) => {
    const idx = pi;
    edit((p) => {
      const base = p.pages[idx];
      const hasFrames = base.frames.length > 0;
      const blank = (pg: Page): Page => ({ ...pg, id: newId(), images: [], texts: [], fill: undefined, frames: pg.frames.map((f) => ({ ...f, id: newId(), file: '', zoom: 1, cx: 0.5, cy: 0.5, rot: 0, bg: undefined })) });
      const fillPage1 = (pg: Page, it: TrayItem): Page => (hasFrames
        ? { ...pg, frames: pg.frames.map((f) => ({ ...f, file: it.file, aspect: it.aspect, rot: 0, zoom: 1, cx: 0.5, cy: 0.5 })) }
        : applyLayout({ ...pg, layout: '1', images: [{ id: newId(), file: it.file, aspect: it.aspect, rot: 0, crop: FULL, x: 0, y: 0, w: 1, h: 1 }] }));
      const empty = base.images.length === 0 && base.frames.every((f) => !f.file);
      const pages = [...p.pages], made: Page[] = [];
      items.forEach((it, j) => {
        if (j === 0 && empty) pages[idx] = fillPage1(base, it);
        else made.push(fillPage1(blank(base), it));
      });
      pages.splice(idx + 1, 0, ...made);
      return { ...p, pages };
    });
    say(`Added ${items.length} ${items.length === 1 ? 'photo' : 'photos'}, one per page`);
  };
  const addPhotos = async (files: FileList | File[] | null) => {
    if (!files || !files.length) return;
    say('Adding photos…');
    const items = await addToLibrary(files);
    if (!items.length) { say('Could not read that photo'); return; }
    if (items.length < 2) { placeItems(items); return; }
    const framed = page.frames.length > 0;
    const choice = await askChoice<'one' | 'separate' | 'flow'>({
      title: `Add ${items.length} photos`,
      body: 'Where should they go?',
      options: framed
        ? [{ value: 'flow', label: 'Fill the frames on this page', hint: 'Extra photos go onto new pages' }, { value: 'separate', label: 'One photo per page', hint: 'Each sheet repeats its photo in every frame' }]
        : [{ value: 'one', label: 'All on this page', hint: 'Arranged in a neat grid' }, { value: 'separate', label: 'Each on its own page', hint: `Makes ${items.length} pages` }],
    });
    if (!choice) { say(`${items.length} photos are in Your photos. Tap one to add it.`); return; }
    placeItems(items, choice);
  };
  const addFromLibrary = (t: TrayItem) => {
    if (selFrame && !selFrame.file) { placePhoto(selFrame.id, t); return; }
    placeItems([t]);
  };
  /** A loose photo dropped on a frame fills it (you can then Crop to move or zoom). */
  const snapIntoFrame = (imgId: string, fid: string) => {
    editPage((pg) => {
      const im = pg.images.find((i) => i.id === imgId);
      if (!im) return pg;
      const frames = pg.frames.map((f) => (f.id === fid
        ? clampFrame({ ...f, file: im.file, aspect: im.aspect, rot: im.rot, zoom: 1, cx: im.crop.x + im.crop.w / 2, cy: im.crop.y + im.crop.h / 2 }, pg.widthMm, pg.heightMm) : f));
      return { ...pg, fill: undefined, frames, images: pg.images.filter((i) => i.id !== imgId) };
    });
    setSel([fid]);
    if (autoFace) centerFace(fid, true);
  };
  /** Take the photo out of its frame so it floats on the page again. */
  const detach = (fid: string) => {
    editPage((pg) => {
      const f = pg.frames.find((q) => q.id === fid);
      if (!f || !f.file) return pg;
      const img: PageImage = { id: newId(), file: f.file, aspect: f.aspect, rot: f.rot, crop: frameCrop(f, pg.widthMm, pg.heightMm), x: f.x, y: f.y, w: f.w, h: f.h };
      return { ...pg, layout: 'free', fill: undefined, images: [...pg.images, img], frames: pg.frames.map((q) => (q.id === fid ? { ...q, file: '', zoom: 1, cx: 0.5, cy: 0.5, rot: 0 } : q)) };
    });
    setSel([]);
  };
  /** Cut the person out of the photo (runs on the phone). The cut-out replaces the photo and is also kept in your photos. */
  const removeBackground = async (id: string) => {
    const it = findItem(page, id);
    if (!it || it.kind === 'text') return;
    const src = (it.item as { file: string }).file;
    if (!src) return;
    const idx = pi;
    say('Removing the background…');
    try {
      const cut = await makeCutout(src);
      seen.current.add(cut.file);
      edit((p) => ({
        ...p,
        tray: [...p.tray, { id: newId(), file: cut.file, aspect: cut.aspect }],
        pages: p.pages.map((pg, k) => (k !== idx ? pg : {
          ...pg,
          images: pg.images.map((i) => (i.id === id ? { ...i, file: cut.file, aspect: cut.aspect } : i)),
          frames: pg.frames.map((f) => (f.id === id ? { ...f, file: cut.file, aspect: cut.aspect } : f)),
        })),
      }));
      say('Background removed. Pick a color behind the photo in its options.');
    } catch (e) {
      console.error(e);
      say('Could not remove the background on this phone.');
    }
  };
  const [refine, setRefine] = useState<{ id: string; file: string; bg?: string } | null>(null);
  const refineEdges = (id: string) => {
    const it = findItem(page, id);
    if (!it || it.kind === 'text') return;
    const o = it.item as { file: string; bg?: string };
    if (o.file) setRefine({ id, file: o.file, bg: o.bg });
  };
  const applyRefined = (id: string, cut: { file: string; aspect: number }) => {
    const idx = pi;
    seen.current.add(cut.file);
    edit((p) => ({
      ...p,
      tray: [...p.tray, { id: newId(), file: cut.file, aspect: cut.aspect }],
      pages: p.pages.map((pg, k) => (k !== idx ? pg : {
        ...pg,
        images: pg.images.map((i) => (i.id === id ? { ...i, file: cut.file, aspect: cut.aspect } : i)),
        frames: pg.frames.map((f) => (f.id === id ? { ...f, file: cut.file, aspect: cut.aspect } : f)),
      })),
    }));
    setRefine(null);
  };
  const evenLight = async (id: string) => {
    const it = findItem(page, id);
    if (!it || it.kind === 'text') return;
    const src = (it.item as { file: string }).file; if (!src) return;
    say('Evening out the light…');
    try { applyRefined(id, await evenLightFile(src)); say('Done. Undo if you prefer the original.'); } catch { say('Could not change this photo.'); }
  };
  const setBgAll = (color: string | undefined) => editPage((pg) => ({ ...pg, frames: pg.frames.map((f) => (f.file ? { ...f, bg: color } : f)) }));
  const setBg = (id: string, color: string | undefined) => editPage((pg) => ({
    ...pg,
    images: pg.images.map((i) => (i.id === id ? { ...i, bg: color } : i)),
    frames: pg.frames.map((f) => (f.id === id ? { ...f, bg: color } : f)),
  }));
  const removeFromLibrary = (tid: string) => { edit((p) => ({ ...p, tray: p.tray.filter((t) => t.id !== tid) })); if (selTray === tid) setSelTray(null); };

  // ---------------------------------------------------------------- images
  /** New shape fits inside the old box, same centre. */
  const reshape = (imgId: string, patch: Partial<Pick<PageImage, 'rot' | 'crop'>>) =>
    editPage((pg) => ({
      ...pg, fill: undefined,
      images: pg.images.map((i) => {
        if (i.id !== imgId) return i;
        const n = { ...i, ...patch };
        const a = dispAspect(n), bw = i.w * pg.widthMm, bh = i.h * pg.heightMm;
        let w = bw, h = bw / a;
        if (h > bh) { h = bh; w = bh * a; }
        const fw = w / pg.widthMm, fh = h / pg.heightMm;
        return { ...n, x: i.x + (i.w - fw) / 2, y: i.y + (i.h - fh) / 2, w: fw, h: fh };
      }),
    }));
  const rotateImage = (im: PageImage, dir: 1 | -1) => {
    let crop = im.crop;
    for (let k = 0; k < (dir === 1 ? 1 : 3); k++) crop = rotateCrop(crop);
    reshape(im.id, { rot: (im.rot + dir + 4) % 4, crop });
  };
  const setCropSide = (im: PageImage, side: 'l' | 'r' | 't' | 'b', v: number) => {
    const c = im.crop;
    const l = side === 'l' ? v : c.x, t = side === 't' ? v : c.y;
    const r = side === 'r' ? v : 1 - c.x - c.w, b = side === 'b' ? v : 1 - c.y - c.h;
    const crop: Crop = { x: l, y: t, w: Math.max(0.1, 1 - l - r), h: Math.max(0.1, 1 - t - b) };
    reshape(im.id, { crop });
  };
  const resetCrop = (im: PageImage) => reshape(im.id, { crop: FULL });
  const fillCell = (im: PageImage) => editPage((pg) => {
    const k = pg.images.findIndex((i) => i.id === im.id);
    const cell = cellRect(pg, k);
    if (!cell) return pg;
    const crop = cropToAspect(im, (cell.w * pg.widthMm) / (cell.h * pg.heightMm));
    return { ...pg, images: pg.images.map((i) => (i.id === im.id ? { ...i, crop, ...cell, angle: 0 } : i)) };
  });
  const fitCell = (im: PageImage) => editPage((pg) => {
    if (!cellRect(pg, pg.images.findIndex((i) => i.id === im.id))) return pg;
    return applyLayout({ ...pg, images: pg.images.map((i) => (i.id === im.id ? { ...i, crop: FULL, angle: 0 } : i)) });
  });
  const updateImage = (imgId: string, patch: Partial<PageImage>) =>
    editPage((pg) => ({ ...pg, fill: undefined, images: pg.images.map((i) => (i.id === imgId ? { ...i, ...patch } : i)) }));
  const swap = (aId: string, bId: string, startCx: number, startCy: number) => editPage((pg) => {
    const a = pg.images.find((i) => i.id === aId)!, b = pg.images.find((i) => i.id === bId)!;
    const bc = { x: b.x + b.w / 2, y: b.y + b.h / 2 };
    void a;
    return {
      ...pg, fill: undefined,
      images: pg.images.map((i) => i.id === aId ? { ...i, x: bc.x - i.w / 2, y: bc.y - i.h / 2 } : i.id === bId ? { ...i, x: startCx - i.w / 2, y: startCy - i.h / 2 } : i),
    };
  });

  // ---------------------------------------------------------------- text
  const addText = () => {
    const t: PageText = { id: newId(), text: 'Text', x: 0.1, y: 0.1, sizePt: 24, color: '#12151C', bold: false };
    editPage((pg) => ({ ...pg, texts: [...pg.texts, t] }));
    setSel([t.id]); setPanel('text');
  };
  const updateText = (tid: string, patch: Partial<PageText>) =>
    editPage((pg) => ({ ...pg, texts: pg.texts.map((t) => (t.id === tid ? { ...t, ...patch } : t)) }));

  // ---------------------------------------------------------------- layout
  const relayout = (pg: Page) => (pg.fill && pg.images[0] ? fillPage(pg, pg.images[0], pg.fill.wMm, pg.fill.hMm) : applyLayout(pg));
  const setLayout = (l: LayoutId) => editPage((pg) => applyLayout({ ...pg, fill: undefined, layout: l, images: pg.images.slice(0, cellCount(l)) }));
  const fillWith = (wMm: number, hMm: number) => {
    const src = selImage ?? page.images[0];
    if (!src) { say('Add a photo to the page first'); return; }
    const out = fillPage(page, src, wMm, hMm);
    if (out === page) { say('That size does not fit on this page'); return; }
    editPage(() => out); setSel([]);
  };
  const applyTemplate = (t: Template) => {
    edit((p) => ({ ...p, widthMm: t.w, heightMm: t.h, pages: p.pages.map((pg, k) => (k === pi ? t.make(pg) : pg)) }));
    setSel([]); say(`Applied ${t.name}`);
  };

  // ---------------------------------------------------------------- selection actions
  const deleteSel = () => {
    const ids = new Set(selIds);
    editPage((pg) => applyLayout({ ...pg, fill: undefined, images: pg.images.filter((i) => !ids.has(i.id)), frames: pg.frames.filter((f) => !ids.has(f.id)), texts: pg.texts.filter((t) => !ids.has(t.id)) }));
    setSel([]);
  };
  const duplicateSel = () => {
    const made: string[] = [];
    editPage((pg) => {
      const ids = new Set(selIds);
      const gb = groupBox(pg, selIds);
      const dx = gb ? clampN(0.03, -gb.x, Math.max(0, 1 - gb.x - gb.w)) : 0.03, dy = gb ? clampN(0.03, -gb.y, Math.max(0, 1 - gb.y - gb.h)) : 0.03;
      const off = (o: { x: number; y: number }, _w: number, _h: number) => ({ x: o.x + dx, y: o.y + dy });
      const nid = () => { const i = newId(); made.push(i); return i; };
      return {
        ...pg, fill: undefined, layout: pg.images.some((i) => ids.has(i.id)) ? 'free' : pg.layout,
        images: [...pg.images, ...pg.images.filter((i) => ids.has(i.id)).map((i) => ({ ...i, id: nid(), locked: false, ...off(i, i.w, i.h) }))],
        frames: [...pg.frames, ...pg.frames.filter((f) => ids.has(f.id)).map((f) => ({ ...f, id: nid(), locked: false, ...off(f, f.w, f.h) }))],
        texts: [...pg.texts, ...pg.texts.filter((t) => ids.has(t.id)).map((t) => ({ ...t, id: nid(), locked: false, ...off(t, 0.1, 0.05) }))],
      };
    });
    setSel(made);
  };
  const toggleLock = () => {
    const ids = new Set(selIds);
    editPage((pg) => {
      const all = selIds.every((i) => (findItem(pg, i)?.item as { locked?: boolean } | undefined)?.locked);
      return mapSelected(pg, ids, (_k, item: AnyItem) => ({ ...item, locked: !all }) as AnyItem);
    });
  };
  const scaleMany = (f: number, ox: number, oy: number, nx: number, ny: number) => editPage((pg) => scaleItems(pg, selIds, f, ox, oy, nx, ny));
  /** Grow or shrink the whole selection around its centre. */
  const scaleSel = (f: number) => editPage((pg) => {
    const b = groupBox(pg, selIds); if (!b) return pg;
    return scaleItems(pg, selIds, f, b.x, b.y, b.x - ((f - 1) * b.w) / 2, b.y - ((f - 1) * b.h) / 2);
  });
  const [sheet, setSheet] = useState<'fill' | 'exact' | null>(null);
  const selectMany = (ids: string[]) => { setSel(ids); if (ids.length > 1) setMulti(true); };
  const selectBy = (m: SelectMode) => {
    const ids = selectWhere(page, m, selIds[0]);
    if (!ids.length) { say('Nothing to select'); return; }
    setMulti(true); setSel(ids);
  };
  const fillGridSel = (across: number, down: number, gapMm: number) => {
    const made: string[] = [];
    editPage((pg) => { const r = fillGrid(pg, selIds, across, down, gapMm, () => { const i = newId(); made.push(i); return i; }); return r.page; });
    setSel([...selIds, ...made]);
  };
  const setBox = (id: string, b: Partial<{ x: number; y: number; w: number; h: number }>) => editPage((pg) => setBoxMm(pg, id, b));
  const setGap = (gx: number, gy: number) => editPage((pg) => gapItems(pg, selIds, gx, gy));
  const selectAll = () => setSel([...page.frames.map((f) => f.id), ...page.images.map((i) => i.id), ...page.texts.map((t) => t.id)]);
  /** Put a loose photo into the nearest frame (an empty one if there is one). */
  const fitIntoFrame = (imgId: string) => {
    const im = page.images.find((i) => i.id === imgId);
    if (!im || !page.frames.length) { say('Add a frame first'); return; }
    const c = { x: im.x + im.w / 2, y: im.y + im.h / 2 };
    const dist = (f: Frame) => Math.hypot(f.x + f.w / 2 - c.x, f.y + f.h / 2 - c.y);
    const pool = page.frames.some((f) => !f.file) ? page.frames.filter((f) => !f.file) : page.frames;
    const target = [...pool].sort((a, b) => dist(a) - dist(b))[0];
    snapIntoFrame(imgId, target.id);
  };
  const align = (m: AlignMode) => editPage((pg) => alignItems(pg, selIds, m));
  const distribute = (axis: 'x' | 'y') => editPage((pg) => distributeItems(pg, selIds, axis));
  const order = (to: 'front' | 'back') => { if (selIds.length === 1) editPage((pg) => reorder(pg, selIds[0], to)); };
  const moveMany = (moves: { id: string; x: number; y: number }[]) => {
    const m = new Map(moves.map((v) => [v.id, v]));
    editPage((pg) => ({
      ...pg, fill: undefined,
      images: pg.images.map((i) => (m.has(i.id) ? { ...i, x: m.get(i.id)!.x, y: m.get(i.id)!.y } : i)),
      frames: pg.frames.map((f) => (m.has(f.id) ? { ...f, x: m.get(f.id)!.x, y: m.get(f.id)!.y } : f)),
      texts: pg.texts.map((t) => (m.has(t.id) ? { ...t, x: m.get(t.id)!.x, y: m.get(t.id)!.y } : t)),
    }));
  };
  const onPick = (pid: string, how: 'tap' | 'drag') => {
    if (how === 'drag') { setSel((s) => (s.includes(pid) ? s : [pid])); return; }
    const now = Date.now();
    if (lastTap.current.id === pid && now - lastTap.current.t < 250) return;
    lastTap.current = { id: pid, t: now };
    const f = page.frames.find((q) => q.id === pid);
    if (f && !f.file && selTray && !multi) {
      const t = proj.tray.find((x) => x.id === selTray);
      if (t) { placePhoto(pid, t); return; }
    }
    if (multi) setSel((s) => (s.includes(pid) ? s.filter((x) => x !== pid) : [...s, pid]));
    else setSel([pid]);
  };

  // ---------------------------------------------------------------- pages
  const goPage = (i: number) => { setPi(i); setSel([]); };
  const addPage = () => { edit((p) => ({ ...p, pages: [...p.pages, newPage(p.widthMm, p.heightMm)] })); goPage(proj.pages.length); };
  const dupPage = (i: number) => {
    edit((p) => {
      const src = p.pages[i];
      const copy: Page = { ...src, id: newId(), images: src.images.map((im) => ({ ...im, id: newId() })), texts: src.texts.map((t) => ({ ...t, id: newId() })), frames: src.frames.map((f) => ({ ...f, id: newId() })) };
      const pages = [...p.pages]; pages.splice(i + 1, 0, copy);
      return { ...p, pages };
    });
    goPage(i + 1);
  };
  const delPage = async (i: number) => {
    if (proj.pages.length < 2) { say('A project needs at least one page'); return; }
    if (!(await askConfirm({ title: `Delete page ${i + 1}?`, body: 'You can undo this with the undo button.', ok: 'Delete page', danger: true }))) return;
    edit((p) => ({ ...p, pages: p.pages.filter((_, k) => k !== i) }));
    goPage(Math.max(0, Math.min(i, proj.pages.length - 2)));
    say(`Page ${i + 1} deleted. Tap undo to bring it back.`);
  };
  const movePage = (from: number, to: number) => {
    if (from === to) return;
    edit((p) => { const pages = [...p.pages]; const [m] = pages.splice(from, 1); pages.splice(to, 0, m); return { ...p, pages }; });
    goPage(to);
  };
  const renameProject = () => { const n = prompt('Project name', proj.name)?.trim(); if (n) edit((p) => ({ ...p, name: n })); };

  const ed: Ed = {
    proj, page, pi, unit, sel: selIds, selImage, selFrame, selText, say, edit, editPage, panel, setPanel, addTab, setAddTab,
    addPhotos, addFromLibrary, removeFromLibrary, selTray, setSelTray, hit, setOver,
    fsize, setFsize: (w, h) => setFs({ w, h }), addFrame, fillWithFrames, clearFrames: () => { editPage((pg) => ({ ...pg, frames: [] })); setSel([]); },
    placePhoto, updateFrame: (fid, patch) => updateFrame(fid, patch), resizeFrame, rotateFrame, copyToAll,
    detach, sameAll, setSameAll, adjust, setAdjust, autoFace, setAutoFace, centerFace: (fid) => { centerFace(fid); }, removeBackground: (i) => { removeBackground(i); }, refineEdges, evenLight, setBgAll, setBg,
    rotateImage, setCropSide, resetCrop, fillCell, fitCell, addText, updateText, setLayout, relayout, fillWith, applyTemplate,
    deleteSel, duplicateSel, toggleLock, scaleSel, selectMany, selectBy, fillGridSel, setBox, openSheet: setSheet, align, distribute, order, setGap, selectAll, fitIntoFrame,
    addPage, dupPage, delPage, movePage, goPage, openGrid: () => setGridOpen(true),
  };

  const sz = presetOf(page.widthMm, page.heightMm) ?? `${Math.round(page.widthMm)}×${Math.round(page.heightMm)} mm`;
  const toggleNav = (id: PanelId) => setPanel(panel === id ? null : id);
  const cropping = adjust && !!selFrame?.file;
  const showTools = !!panel;

  return (
    <EdCtx.Provider value={ed}>
      <div className="screen">
        <header className="topbar">
          <button className="icon-btn" onClick={leave} aria-label="Back"><Back /></button>
          <button className="title-btn" onClick={renameProject}>
            <span className="t1">{proj.name}</span>
            <span className="t2" title={sz}>{saved ? 'Saved' : 'Saving…'}</span>
          </button>
          <button className="icon-btn" disabled={!hist.u} onClick={undo} aria-label="Undo"><Undo /></button>
          <button className="icon-btn" disabled={!hist.r} onClick={redo} aria-label="Redo"><Redo /></button>
          <button className="btn primary" onClick={() => setExporting(true)}><Share /> Share</button>
        </header>

        <PageCanvas
          page={page} pageNo={pi + 1} pageNumbers={proj.pageNumbers} unit={unit} selectedIds={selIds}
          onPick={onPick} onBlank={() => { setSel([]); setAdjust(false); }} onMoveMany={moveMany} onScaleMany={scaleMany} marquee={multi} onMarquee={(ids) => { if (ids.length) setSel(ids); }}
          onChange={updateImage} onChangeText={updateText} onChangeFrame={(fid, patch) => updateFrame(fid, patch)} onSwap={swap}
          hand={hand} adjust={adjust} dropTarget={over} border={proj.frameBorder} cropMarks={proj.cropMarks} hitRef={hit}
          onSelBox={setSelBox} onDragging={setDragging}
          padB={showTools || cropping ? 14 : 112} reserve={cropping ? '208px' : showTools ? 'calc(92px + var(--sheet-h))' : '0px'}
          faces={cropping ? faces : []} onPickFace={pickFace} onSnap={snapIntoFrame} focusId={cropping ? selFrame?.id : null}
        >
          <button className={'fab-small' + (multi ? ' on' : '')} aria-pressed={multi} aria-label="Select multiple items" onClick={() => { setMulti(!multi); if (multi) setSel(sel.slice(0, 1)); }}><Checklist /></button>
          <button className={'fab-small second' + (hand ? ' on' : '')} aria-pressed={hand} aria-label="Hand tool: move the view with one finger" onClick={() => setHand(!hand)}><Hand /></button>
          {hand && <div className="chip-hint" style={{ top: 58 }}>Hand tool: drag to move the view. Pinch to zoom.</div>}
          {(multi || selIds.length > 1) && (() => {
            const total = page.images.length + page.frames.length + page.texts.length;
            return (
              <>
              <div className="chip-hint">
                {selIds.length ? <b>{selIds.length} of {total} selected</b> : 'Tap items to select them'}
                {selIds.length < total && <button onClick={selectAll}>Select all</button>}
                {selIds.length > 0 && <button onClick={() => setSel([])}>Clear</button>}
              </div>
              {(multi || selIds.length > 1) && (
                <div className="sel-chips" role="group" aria-label="Select by type">
                  {page.frames.length > 0 && <button onClick={() => selectBy('frames')}>Frames · {page.frames.length}</button>}
                  {page.images.length > 0 && <button onClick={() => selectBy('photos')}>Photos · {page.images.length}</button>}
                  {page.texts.length > 0 && <button onClick={() => selectBy('text')}>Text · {page.texts.length}</button>}
                  {page.frames.some((f) => !f.file) && <button onClick={() => selectBy('empty')}>Empty frames · {page.frames.filter((f) => !f.file).length}</button>}
                  {selIds.length > 0 && <button onClick={() => selectBy('same')}>Same size as first</button>}
                </div>
              )}
              </>
            );
          })()}
          {!panel && !selIds.length && !page.images.length && !page.texts.length && page.frames.every((f) => !f.file) && (
            <div className="empty-card">
              <span>{page.frames.length ? 'Add a photo. It fills every frame.' : 'Start by adding your photos'}</span>
              <button className="btn primary" onClick={() => fileRef.current?.click()}><ImageIcon /> Add photos</button>
            </div>
          )}
          {selBox && selIds.length > 0 && !dragging && !cropping && <FloatingToolbar box={selBox} onPosition={() => setPosOpen(true)} />}
        </PageCanvas>

        <input ref={fileRef} type="file" accept="image/*" multiple hidden onChange={(e) => { addPhotos(e.target.files); e.target.value = ''; }} />
        <PagePill project={proj} current={pi} hide={showTools || cropping} onGo={goPage} onAdd={addPage} onGrid={() => setGridOpen(true)} />

        <section className={'sheetpanel' + (panel ? ' open' : '')} aria-label={TITLES[shownPanel]} aria-hidden={!panel}>
          <div className="sheetpanel-head">
            <b>{shownPanel === 'item' ? (selFrame ? 'Frame' : 'Edit photo') : TITLES[shownPanel]}</b>
            <button className="icon-btn" onClick={() => setPanel(null)} aria-label="Close panel"><Close /></button>
          </div>
          <div className="sheetpanel-body">
            {shownPanel === 'add' && <AddPanel />}
            {shownPanel === 'layout' && <LayoutPanel />}
            {shownPanel === 'text' && <TextPanel />}
            {shownPanel === 'page' && <PagePanel />}
            {shownPanel === 'item' && <ItemPanel />}
          </div>
        </section>

        <CropCard
          frame={cropping ? selFrame : null} faces={faces} onFace={pickFace}
          onZoom={(z) => selFrame && updateFrame(selFrame.id, { zoom: z })}
          onReset={() => selFrame && updateFrame(selFrame.id, { zoom: 1, cx: 0.5, cy: 0.5 })}
          onDone={() => setAdjust(false)}
        />

        <nav className={'dock' + (cropping ? ' hide' : '')} aria-label="Tools">
          <div className="dock-in">
            {NAV.map(([id, label, Ic]) => (
              <button key={id} className={'dock-btn' + (panel === id ? ' on' : '')} aria-label={label} aria-pressed={panel === id} onClick={() => toggleNav(id)}>
                <Ic /><span>{label}</span>
              </button>
            ))}
          </div>
        </nav>

        {toast && <Toast text={toast.text} kind={toast.kind} onDismiss={() => setToast(null)} />}
        {exporting && <ExportSheet project={proj} onClose={() => setExporting(false)}
          onShow={(pgIdx, id) => { setExporting(false); goPage(pgIdx); setSel([id]); }}
          onShrink={(pgIdx, id, f) => editPage((pg) => {
            const it = findItem(pg, id); if (!it || it.kind === 'text') return pg;
            const b = groupBox(pg, [id]); if (!b) return pg;
            return scaleItems(pg, [id], f, b.x, b.y, b.x + (b.w * (1 - f)) / 2, b.y + (b.h * (1 - f)) / 2);
          }, pgIdx)} />}
        {sheet === 'fill' && <FillGridSheet onClose={() => setSheet(null)} />}
        {sheet === 'exact' && <ExactSheet onClose={() => setSheet(null)} />}
        {refine && <RefineEdges file={refine.file} bg={refine.bg} onCancel={() => setRefine(null)} onDone={(c) => applyRefined(refine.id, c)} />}
        {posOpen && <PositionSheet onClose={() => setPosOpen(false)} />}
        {gridOpen && <PageGrid project={proj} current={pi} onSelect={goPage} onMove={movePage} onAdd={addPage} onDup={() => dupPage(pi)} onDel={() => delPage(pi)} onClose={() => setGridOpen(false)} />}
      </div>
    </EdCtx.Provider>
  );
}
