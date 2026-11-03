import { createContext, useContext } from 'react';
import type { Crop, Frame, LayoutId, Page, PageImage, PageText, Project, TrayItem, Unit } from './types';
import type { AlignMode } from './arrange';
import type { Template } from './templates';

export type PanelId = 'add' | 'layout' | 'text' | 'style' | 'page' | 'item';
export type AddTab = 'photos' | 'frames' | 'templates';

export interface Ed {
  proj: Project; page: Page; pi: number; unit: Unit;
  sel: string[]; selImage: PageImage | null; selFrame: Frame | null; selText: PageText | null;
  say: (m: string) => void;
  edit: (fn: (p: Project) => Project) => void;
  editPage: (fn: (pg: Page) => Page, index?: number) => void;
  panel: PanelId | null; setPanel: (p: PanelId | null) => void;
  addTab: AddTab; setAddTab: (t: AddTab) => void;
  // library
  addPhotos: (files: FileList | File[] | null) => Promise<void>;
  addFromLibrary: (t: TrayItem) => void;
  removeFromLibrary: (id: string) => void;
  selTray: string | null; setSelTray: (id: string | null) => void;
  hit: React.MutableRefObject<((x: number, y: number) => string | null) | null>;
  setOver: (id: string | null) => void;
  // frames
  fsize: { w: number; h: number }; setFsize: (w: number, h: number) => void;
  addFrame: () => void; fillWithFrames: () => void; clearFrames: () => void;
  placePhoto: (frameId: string, t: TrayItem) => void;
  updateFrame: (id: string, patch: Partial<Frame>) => void;
  resizeFrame: (f: Frame, w: number, h: number) => void;
  rotateFrame: (f: Frame, dir: 1 | -1) => void;
  copyToAll: (f: Frame) => void;
  centerFace: (id: string) => void; centerAll: () => void;
  autoFace: boolean; setAutoFace: (b: boolean) => void;
  adjust: boolean; setAdjust: (b: boolean) => void;
  // images
  rotateImage: (im: PageImage, dir: 1 | -1) => void;
  setCropSide: (im: PageImage, side: 'l' | 'r' | 't' | 'b', v: number) => void;
  resetCrop: (im: PageImage) => void;
  fillCell: (im: PageImage) => void; fitCell: (im: PageImage) => void;
  // text
  addText: () => void; updateText: (id: string, patch: Partial<PageText>) => void;
  // layout
  setLayout: (l: LayoutId) => void; relayout: (pg: Page) => Page;
  fillWith: (w: number, h: number) => void;
  applyTemplate: (t: Template) => void;
  // selection actions
  deleteSel: () => void; duplicateSel: () => void; toggleLock: () => void;
  align: (m: AlignMode) => void; distribute: (axis: 'x' | 'y') => void; order: (to: 'front' | 'back') => void;
  // pages
  addPage: () => void; dupPage: (i: number) => void; delPage: (i: number) => void; movePage: (f: number, t: number) => void; goPage: (i: number) => void;
  openGrid: () => void;
}

export const EdCtx = createContext<Ed | null>(null);
export const useEd = () => useContext(EdCtx)!;
export type { Crop };
