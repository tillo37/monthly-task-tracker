import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { DEFAULT_ROUTE, hashFor, parseHash, useRoute } from './useRoute';

afterEach(() => {
  location.hash = '';
});

/** A route with the defaults filled in, so cases only state what they change. */
const route = (overrides: Partial<typeof DEFAULT_ROUTE>) => ({ ...DEFAULT_ROUTE, ...overrides });

describe('parseHash', () => {
  it.each([
    ['', DEFAULT_ROUTE],
    ['#', DEFAULT_ROUTE],
    ['#/tasks', route({ section: 'tasks' })],
    ['#/time', route({ section: 'time' })],
    ['#/time/sessions', route({ section: 'time', timeTab: 'sessions' })],
    ['#/time/nonsense', route({ section: 'time' })],
    ['#/reports', route({ section: 'reports' })],
    ['#/unknown', DEFAULT_ROUTE],
    ['#tracker', DEFAULT_ROUTE],
  ])('reads %s', (hash, expected) => {
    expect(parseHash(hash)).toEqual(expected);
  });

  it('ignores a query string', () => {
    expect(parseHash('#/time/sessions?x=1')).toEqual(route({ section: 'time', timeTab: 'sessions' }));
  });

  it.each([
    ['#/admin', route({ section: 'admin', adminTab: 'overview' })],
    ['#/admin/users', route({ section: 'admin', adminTab: 'users' })],
    ['#/admin/audit', route({ section: 'admin', adminTab: 'audit' })],
    // An unknown sub-tab falls back rather than rendering nothing.
    ['#/admin/nonsense', route({ section: 'admin', adminTab: 'overview' })],
  ])('reads the admin route %s', (hash, expected) => {
    expect(parseHash(hash)).toEqual(expected);
  });

  it('parses /admin for everyone — the route is not the permission', () => {
    // Hiding the route from the parser would be obscurity; the role check lives
    // in the view and, decisively, in the database.
    expect(parseHash('#/admin').section).toBe('admin');
  });
});

describe('hashFor', () => {
  it('round-trips every route', () => {
    expect(parseHash(hashFor('tasks'))).toEqual(route({ section: 'tasks' }));
    expect(parseHash(hashFor('time'))).toEqual(route({ section: 'time' }));
    expect(parseHash(hashFor('time', 'sessions'))).toEqual(
      route({ section: 'time', timeTab: 'sessions' }),
    );
    expect(parseHash(hashFor('reports'))).toEqual(route({ section: 'reports' }));
    expect(parseHash(hashFor('admin'))).toEqual(route({ section: 'admin' }));
    expect(parseHash(hashFor('admin', 'settings'))).toEqual(
      route({ section: 'admin', adminTab: 'settings' }),
    );
  });

  it('leaves the default admin tab out of the hash', () => {
    expect(hashFor('admin', 'overview')).toBe('#/admin');
  });
});

describe('useRoute', () => {
  it('starts on the tasks section', () => {
    const { result } = renderHook(() => useRoute());
    expect(result.current.route.section).toBe('tasks');
  });

  it('navigates and writes the hash', () => {
    const { result } = renderHook(() => useRoute());

    act(() => result.current.navigate('reports'));
    expect(result.current.route.section).toBe('reports');
    expect(location.hash).toBe('#/reports');
  });

  it('navigates between admin tabs', () => {
    const { result } = renderHook(() => useRoute());

    act(() => result.current.navigate('admin', 'users'));
    expect(result.current.route).toEqual(route({ section: 'admin', adminTab: 'users' }));
    expect(location.hash).toBe('#/admin/users');
  });

  it('follows an external hash change', () => {
    const { result } = renderHook(() => useRoute());

    act(() => {
      location.hash = '#/time/sessions';
      window.dispatchEvent(new HashChangeEvent('hashchange'));
    });

    expect(result.current.route).toEqual(route({ section: 'time', timeTab: 'sessions' }));
  });

  it('reads the initial hash on mount', () => {
    location.hash = '#/time';
    const { result } = renderHook(() => useRoute());
    expect(result.current.route.section).toBe('time');
  });
});
