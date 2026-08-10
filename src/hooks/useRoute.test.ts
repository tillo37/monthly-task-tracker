import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { DEFAULT_ROUTE, hashFor, parseHash, useRoute } from './useRoute';

afterEach(() => {
  location.hash = '';
});

describe('parseHash', () => {
  it.each([
    ['', DEFAULT_ROUTE],
    ['#', DEFAULT_ROUTE],
    ['#/tasks', { section: 'tasks', timeTab: 'timer' }],
    ['#/time', { section: 'time', timeTab: 'timer' }],
    ['#/time/sessions', { section: 'time', timeTab: 'sessions' }],
    ['#/time/nonsense', { section: 'time', timeTab: 'timer' }],
    ['#/reports', { section: 'reports', timeTab: 'timer' }],
    ['#/unknown', DEFAULT_ROUTE],
    ['#tracker', DEFAULT_ROUTE],
  ])('reads %s', (hash, expected) => {
    expect(parseHash(hash)).toEqual(expected);
  });

  it('ignores a query string', () => {
    expect(parseHash('#/time/sessions?x=1')).toEqual({ section: 'time', timeTab: 'sessions' });
  });
});

describe('hashFor', () => {
  it('round-trips every route', () => {
    expect(parseHash(hashFor('tasks'))).toEqual({ section: 'tasks', timeTab: 'timer' });
    expect(parseHash(hashFor('time'))).toEqual({ section: 'time', timeTab: 'timer' });
    expect(parseHash(hashFor('time', 'sessions'))).toEqual({
      section: 'time',
      timeTab: 'sessions',
    });
    expect(parseHash(hashFor('reports'))).toEqual({ section: 'reports', timeTab: 'timer' });
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

  it('follows an external hash change', () => {
    const { result } = renderHook(() => useRoute());

    act(() => {
      location.hash = '#/time/sessions';
      window.dispatchEvent(new HashChangeEvent('hashchange'));
    });

    expect(result.current.route).toEqual({ section: 'time', timeTab: 'sessions' });
  });

  it('reads the initial hash on mount', () => {
    location.hash = '#/time';
    const { result } = renderHook(() => useRoute());
    expect(result.current.route.section).toBe('time');
  });
});
