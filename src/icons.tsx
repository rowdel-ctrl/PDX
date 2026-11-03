import type { ReactNode } from 'react';
const I = ({ children, size = 22 }: { children: ReactNode; size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>{children}</svg>
);
export const Back = () => <I><path d="M15 5l-7 7 7 7" /></I>;
export const Plus = () => <I><path d="M12 5v14M5 12h14" /></I>;
export const Moon = () => <I><path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z" /></I>;
export const Sun = () => <I><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></I>;
export const Image = () => <I><rect x="3" y="4" width="18" height="16" rx="2" /><circle cx="9" cy="10" r="1.8" /><path d="M21 16l-5-5-9 9" /></I>;
export const Grid = () => <I><rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" /></I>;
export const Size = () => <I><path d="M4 4h16v16H4z" /><path d="M4 9h5M9 4v5" /></I>;
export const Palette = () => <I><path d="M12 3a9 9 0 1 0 0 18c1.4 0 2-1 1.5-2.2-.5-1.3.3-2.3 1.7-2.3H18a3 3 0 0 0 3-3A9 9 0 0 0 12 3z" /><circle cx="7.5" cy="11" r="1" /><circle cx="10" cy="7" r="1" /><circle cx="15" cy="7.5" r="1" /></I>;
export const Pages = () => <I><rect x="6" y="3" width="13" height="16" rx="2" /><path d="M3 7v13a1 1 0 0 0 1 1h11" /></I>;
export const Trash = () => <I><path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3" /></I>;
export const Copy = () => <I><rect x="8" y="8" width="12" height="12" rx="2" /><path d="M16 8V5a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3" /></I>;
export const Left = () => <I><path d="M15 5l-7 7 7 7" /></I>;
export const Right = () => <I><path d="M9 5l7 7-7 7" /></I>;
export const Download = () => <I><path d="M12 4v11M7 11l5 5 5-5M5 20h14" /></I>;
export const Share = () => <I><circle cx="6" cy="12" r="2.5" /><circle cx="18" cy="6" r="2.5" /><circle cx="18" cy="18" r="2.5" /><path d="M8.2 10.8l7.6-3.6M8.2 13.2l7.6 3.6" /></I>;
export const Edit = () => <I><path d="M4 20h4L19 9l-4-4L4 16v4zM13.5 6.5l4 4" /></I>;
export const Type = () => <I><path d="M5 6V4h14v2M12 4v16M9 20h6" /></I>;
export const Undo = () => <I><path d="M9 14L4 9l5-5" /><path d="M4 9h10a6 6 0 0 1 0 12h-3" /></I>;
export const Redo = () => <I><path d="M15 14l5-5-5-5" /><path d="M20 9H10a6 6 0 0 0 0 12h3" /></I>;
export const RotL = () => <I><path d="M4 4v6h6" /><path d="M4.5 14a8 8 0 1 0 2-8.5L4 10" /></I>;
export const RotR = () => <I><path d="M20 4v6h-6" /><path d="M19.5 14a8 8 0 1 1-2-8.5L20 10" /></I>;
export const FrameIcon = () => <I><rect x="4" y="3" width="16" height="18" rx="1.5" strokeDasharray="3 2.5" /><circle cx="12" cy="10" r="2.5" /><path d="M7 18c.8-3 3-4 5-4s4.2 1 5 4" /></I>;
