import { useCallback, useEffect, useState } from 'react';
import type { Theme } from '../types';

const THEME_KEY = 'monthly-task-tracker:theme';
const ORDER: Theme[] = ['light', 'dark', 'system'];

function readStoredTheme(): Theme {
  try {
    const stored = localStorage.getItem(THEME_KEY);
    if (stored === 'light' || stored === 'dark' || stored === 'system') return stored;
  } catch {
    /* storage unavailable — fall through to the system preference */
  }
  return 'system';
}

function prefersDark(): boolean {
  return typeof matchMedia === 'function' && matchMedia('(prefers-color-scheme: dark)').matches;
}

/** Applies the theme by toggling the `dark` class Tailwind keys off. */
export function useTheme() {
  const [theme, setTheme] = useState<Theme>(readStoredTheme);

  useEffect(() => {
    const apply = () => {
      const dark = theme === 'dark' || (theme === 'system' && prefersDark());
      document.documentElement.classList.toggle('dark', dark);
      document.documentElement.style.colorScheme = dark ? 'dark' : 'light';
    };
    apply();

    try {
      localStorage.setItem(THEME_KEY, theme);
    } catch {
      /* preference simply will not persist */
    }

    if (theme !== 'system' || typeof matchMedia !== 'function') return;
    const media = matchMedia('(prefers-color-scheme: dark)');
    media.addEventListener('change', apply);
    return () => media.removeEventListener('change', apply);
  }, [theme]);

  const cycleTheme = useCallback(
    () => setTheme((current) => ORDER[(ORDER.indexOf(current) + 1) % ORDER.length]),
    [],
  );

  return { theme, setTheme, cycleTheme };
}
