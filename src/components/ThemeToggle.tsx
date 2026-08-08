import { Monitor, Moon, Sun } from 'lucide-react';
import type { Theme } from '../types';

interface ThemeToggleProps {
  theme: Theme;
  onCycle: () => void;
}

const ICONS = { light: Sun, dark: Moon, system: Monitor } as const;
const NEXT: Record<Theme, Theme> = { light: 'dark', dark: 'system', system: 'light' };

export function ThemeToggle({ theme, onCycle }: ThemeToggleProps) {
  const Icon = ICONS[theme];

  return (
    <button
      type="button"
      onClick={onCycle}
      className="btn btn-icon btn-subtle"
      title={`Theme: ${theme}`}
      aria-label={`Theme: ${theme}. Switch to ${NEXT[theme]}.`}
    >
      <Icon className="h-4 w-4" aria-hidden="true" />
    </button>
  );
}
