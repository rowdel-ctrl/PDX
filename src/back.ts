import { useEffect, useRef } from 'react';
import { App as CapApp } from '@capacitor/app';
import { Capacitor } from '@capacitor/core';

const stack: (() => void)[] = [];

/** Register a handler for the Android back button while the component is mounted. */
export function useBack(fn: () => void) {
  const ref = useRef(fn); ref.current = fn;
  useEffect(() => {
    const h = () => ref.current();
    stack.push(h);
    return () => { const i = stack.indexOf(h); if (i >= 0) stack.splice(i, 1); };
  }, []);
}

export function installBackButton() {
  if (!Capacitor.isNativePlatform()) return;
  CapApp.addListener('backButton', () => {
    const top = stack[stack.length - 1];
    if (top) top(); else CapApp.exitApp();
  });
}
