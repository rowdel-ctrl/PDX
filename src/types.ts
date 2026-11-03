export type Unit = 'mm' | 'cm' | 'in';
export type LayoutId = '1' | '2x1' | '2x2' | '2x3' | '3x3' | 'free';
export interface Crop { x: number; y: number; w: number; h: number }
/** A fixed-size box (e.g. an ID photo) that a photo is dropped into and auto-fitted. */
export interface Frame {
  id: string;
  x: number; y: number; w: number; h: number; // fractions of the page
  file: string;                // '' = empty
  aspect: number;              // natural aspect of the photo
  rot: number;                 // quarter turns
  zoom: number;                // 1 = photo just covers the frame
  cx: number; cy: number;      // centre of the visible part, fractions of the (rotated) photo
}
export interface FrameBorder { on: boolean; widthMm: number; color: string; place: 'outside' | 'inside' }
export interface TrayItem { id: string; file: string; aspect: number }
export interface PageText { id: string; text: string; x: number; y: number; sizePt: number; color: string; bold: boolean }
export type Quality = 'small' | 'standard' | 'high';

export interface PageImage {
  id: string;
  /** path inside app storage */
  file: string;
  /** natural aspect ratio (w / h) */
  aspect: number;
  /** clockwise quarter turns 0-3 */
  rot: number;
  /** crop in the rotated image, fractions 0-1 */
  crop: Crop;
  /** all fractions of the page */
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Page {
  id: string;
  widthMm: number;
  heightMm: number;
  background: string;
  border: { on: boolean; widthMm: number; color: string };
  marginMm: number;
  spacingMm: number;
  layout: LayoutId;
  images: PageImage[];
  texts: PageText[];
  frames: Frame[];
  /** set when the page was auto-filled with copies of one photo */
  fill?: { wMm: number; hMm: number };
}

export interface Project {
  id: string;
  name: string;
  created: number;
  updated: number;
  unit: Unit;
  /** size used for new pages (orientation already applied) */
  widthMm: number;
  heightMm: number;
  pageNumbers: boolean;
  /** border drawn around each filled frame, as a cutting guide */
  frameBorder: FrameBorder;
  cropMarks: boolean;
  tray: TrayItem[];
  pages: Page[];
}
