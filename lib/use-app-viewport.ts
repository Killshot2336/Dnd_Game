'use client';

import { useEffect } from 'react';

/**
 * Keeps CSS vars in sync with the real visible viewport (mobile chrome + keyboard).
 * Sets --app-height / --app-width and toggles html classes for layout modes.
 */
export function useAppViewport(): void {
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const root = document.documentElement;

    const sync = () => {
      const vv = window.visualViewport;
      const height = Math.round(vv?.height ?? window.innerHeight);
      const width = Math.round(vv?.width ?? window.innerWidth);
      const offsetTop = Math.round(vv?.offsetTop ?? 0);
      const layoutH = window.innerHeight;

      root.style.setProperty('--app-height', `${height}px`);
      root.style.setProperty('--app-width', `${width}px`);
      root.style.setProperty('--vv-offset-top', `${offsetTop}px`);
      root.style.setProperty('--app-pad-bottom', 'env(safe-area-inset-bottom, 0px)');
      root.style.setProperty('--app-pad-top', 'env(safe-area-inset-top, 0px)');

      const keyboardOpen = layoutH - height > 120;
      root.classList.toggle('vv-keyboard', keyboardOpen);
      root.classList.toggle('vv-short', height < 700);
      root.classList.toggle('vv-tiny', height < 560);
      root.classList.toggle('vv-landscape', width > height);
      root.classList.toggle('vv-narrow', width < 640);
    };

    sync();
    window.addEventListener('resize', sync);
    window.addEventListener('orientationchange', sync);
    window.visualViewport?.addEventListener('resize', sync);
    window.visualViewport?.addEventListener('scroll', sync);

    return () => {
      window.removeEventListener('resize', sync);
      window.removeEventListener('orientationchange', sync);
      window.visualViewport?.removeEventListener('resize', sync);
      window.visualViewport?.removeEventListener('scroll', sync);
    };
  }, []);
}
