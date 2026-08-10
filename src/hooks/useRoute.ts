import { useCallback, useEffect, useState } from 'react';

/** Top-level sections of the app. */
export type Section = 'tasks' | 'time' | 'reports' | 'leaderboard';

/** Sub-pages within the time tracker. */
export type TimeTab = 'timer' | 'sessions';

export interface Route {
  section: Section;
  timeTab: TimeTab;
}

export const DEFAULT_ROUTE: Route = { section: 'tasks', timeTab: 'timer' };

/**
 * Hash routing keeps the app a single static file that works from `file://` and
 * from any subdirectory — the same constraint that makes it local-first.
 */
export function parseHash(hash: string): Route {
  const path = hash.replace(/^#\/?/, '').split('?')[0];
  const [section, sub] = path.split('/');

  switch (section) {
    case 'time':
      return { section: 'time', timeTab: sub === 'sessions' ? 'sessions' : 'timer' };
    case 'reports':
      return { section: 'reports', timeTab: 'timer' };
    case 'leaderboard':
      return { section: 'leaderboard', timeTab: 'timer' };
    default:
      return DEFAULT_ROUTE;
  }
}

export function hashFor(section: Section, timeTab: TimeTab = 'timer'): string {
  if (section === 'time') return timeTab === 'sessions' ? '#/time/sessions' : '#/time';
  return `#/${section}`;
}

const readHash = () => (typeof location === 'undefined' ? '' : location.hash);

/** Current route plus a setter that writes through the address bar. */
export function useRoute() {
  const [route, setRoute] = useState<Route>(() => parseHash(readHash()));

  useEffect(() => {
    const sync = () => setRoute(parseHash(readHash()));
    window.addEventListener('hashchange', sync);
    return () => window.removeEventListener('hashchange', sync);
  }, []);

  const navigate = useCallback((section: Section, timeTab: TimeTab = 'timer') => {
    const next = hashFor(section, timeTab);
    if (readHash() === next) return;
    // `hashchange` does the state update, keeping one source of truth.
    location.hash = next;
    setRoute(parseHash(next));
  }, []);

  return { route, navigate };
}
