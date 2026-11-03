export type Unit = 'mm' | 'cm' | 'in';
export type LayoutId = '1' | '2x1' | '2x2' | '2x3' | '3x3';
export type Quality = 'small' | 'standard' | 'high';

export interface PageImage {
  id: string;
  /** path inside app storage */
  file: string;
  /** natural aspect ratio (w / h) */
  aspect: number;
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
  pages: Page[];
}
