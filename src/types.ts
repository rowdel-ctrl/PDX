export type Unit = 'mm' | 'cm' | 'in';
export type LayoutId = '1' | '2x1' | '2x2' | '2x3' | '3x3' | 'free';
export interface Crop { x: number; y: number; w: number; h: number }
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
  pages: Page[];
}
