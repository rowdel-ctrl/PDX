import { useEffect, useRef, useState } from 'react';
import type React from 'react';

/** Touch-and-hold, then drag to reorder items that carry data-pi="<index>". A quick tap selects. */
export function useReorder(onTap: (i: number) => void, onMove: (from: number, to: number) => void) {
  const ref = useRef<HTMLDivElement>(null);
  const [drag, setDrag] = useState<{ from: number; over: number } | null>(null);
  const dragRef = useRef(drag); dragRef.current = drag;
  const timer = useRef(0);
  const start = useRef({ x: 0, y: 0 });

  useEffect(() => {
    const el = ref.current!;
    const stop = (e: TouchEvent) => { if (dragRef.current) e.preventDefault(); };
    el.addEventListener('touchmove', stop, { passive: false });
    return () => el.removeEventListener('touchmove', stop);
  }, []);

  const bind = (i: number) => ({
    'data-pi': i,
    onContextMenu: (e: React.MouseEvent) => e.preventDefault(),
    onPointerDown: (e: React.PointerEvent) => {
      const target = e.currentTarget as HTMLElement, pid = e.pointerId;
      start.current = { x: e.clientX, y: e.clientY };
      window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => {
        timer.current = 0;
        try { target.setPointerCapture(pid); } catch { /* ignore */ }
        setDrag({ from: i, over: i });
        navigator.vibrate?.(15);
      }, 350);
    },
    onPointerMove: (e: React.PointerEvent) => {
      const d = dragRef.current;
      if (d) {
        const el = document.elementFromPoint(e.clientX, e.clientY)?.closest('[data-pi]') as HTMLElement | null;
        const o = el ? Number(el.dataset.pi) : null;
        if (o !== null && o !== d.over) setDrag({ ...d, over: o });
      } else if (timer.current && Math.hypot(e.clientX - start.current.x, e.clientY - start.current.y) > 10) {
        window.clearTimeout(timer.current); timer.current = 0; // the user is scrolling
      }
    },
    onPointerUp: () => {
      const d = dragRef.current;
      if (d) { onMove(d.from, d.over); setDrag(null); }
      else if (timer.current) { window.clearTimeout(timer.current); timer.current = 0; onTap(i); }
    },
    onPointerCancel: () => { window.clearTimeout(timer.current); timer.current = 0; setDrag(null); },
  });
  return { ref, drag, bind };
}
