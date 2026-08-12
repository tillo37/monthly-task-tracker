import { useCallback, useEffect, useState } from 'react';

/** Top-level sections of the app. */
export type Section = 'tasks' | 'time' | 'reports' | 'leaderboard' | 'admin';

/** Sub-pages within the time tracker. */
export type TimeTab = 'timer' | 'sessions';

/** Sections of the Admin Panel. */
export type AdminTab = 'overview' | 'users' | 'activity' | 'leaderboard' | 'settings' | 'audit';

export const ADMIN_TABS: AdminTab[] = [
  'overview',
  'users',
  'activity',
  'leaderboard',
  'settings',
  'audit',
];

export interface Route {
  section: Section;
  timeTab: TimeTab;
  adminTab: AdminTab;
}

export const DEFAULT_ROUTE: Route = { section: 'tasks', timeTab: 'timer', adminTab: 'overview' };

const isAdminTab = (value: string): value is AdminTab =>
  (ADMIN_TABS as string[]).includes(value);

/**
 * Hash routing keeps the app a single static file that works from `file://` and
 * from any subdirectory — the same constraint that makes it local-first.
 *
 * `#/admin` parses like any other route on purpose: a route this hook refused
 * to name would only be security by obscurity. Whether it renders is decided by
 * the session's role, and whether it returns anything is decided by Postgres.
 */
export function parseHash(hash: string): Route {
  const path = hash.replace(/^#\/?/, '').split('?')[0];
  const [section, sub] = path.split('/');

  switch (section) {
    case 'time':
      return { ...DEFAULT_ROUTE, section: 'time', timeTab: sub === 'sessions' ? 'sessions' : 'timer' };
    case 'reports':
      return { ...DEFAULT_ROUTE, section: 'reports' };
    case 'leaderboard':
      return { ...DEFAULT_ROUTE, section: 'leaderboard' };
    case 'admin':
      return {
        ...DEFAULT_ROUTE,
        section: 'admin',
        adminTab: sub && isAdminTab(sub) ? sub : 'overview',
      };
    default:
      return DEFAULT_ROUTE;
  }
}

export function hashFor(section: Section, sub?: TimeTab | AdminTab): string {
  if (section === 'time') return sub === 'sessions' ? '#/time/sessions' : '#/time';
  if (section === 'admin' && sub && sub !== 'overview' && isAdminTab(sub)) {
    return `#/admin/${sub}`;
  }
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

  const navigate = useCallback((section: Section, sub?: TimeTab | AdminTab) => {
    const next = hashFor(section, sub);
    if (readHash() === next) return;
    // `hashchange` does the state update, keeping one source of truth.
    location.hash = next;
    setRoute(parseHash(next));
  }, []);

  return { route, navigate };
}
