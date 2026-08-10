import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createMemoryStorage } from '../storage/monthlyStorage';
import { createTimerStorage, TIMER_STORAGE_KEY } from '../storage/timerStorage';
import { useActiveTimer } from './useActiveTimer';

const AUGUST = '2026-08';
const START = new Date(2026, 7, 9, 10, 0, 0, 0);

describe('useActiveTimer', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(START);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('starts idle', () => {
    const { result } = renderHook(() => useActiveTimer(createTimerStorage(createMemoryStorage())));
    expect(result.current.isRunning).toBe(false);
    expect(result.current.elapsed).toBe(0);
  });

  it('counts up in seconds while running', () => {
    const { result } = renderHook(() => useActiveTimer(createTimerStorage(createMemoryStorage())));

    act(() => result.current.start('gym', AUGUST));
    expect(result.current.isRunning).toBe(true);

    act(() => void vi.advanceTimersByTime(65_000));
    expect(result.current.elapsed).toBe(65);
  });

  it('records the elapsed interval as a session on stop', () => {
    const { result } = renderHook(() => useActiveTimer(createTimerStorage(createMemoryStorage())));

    act(() => result.current.start('gym', AUGUST));
    act(() => void vi.advanceTimersByTime(90 * 60_000));

    let stopped: ReturnType<typeof result.current.stop> | undefined;
    act(() => {
      stopped = result.current.stop();
    });

    expect(stopped?.status).toBe('saved');
    if (stopped?.status !== 'saved') return;
    expect(stopped.session.taskId).toBe('gym');
    expect(stopped.session.durationSeconds).toBe(5400);
    expect(stopped.month).toBe(AUGUST);
    expect(result.current.isRunning).toBe(false);
  });

  it('drops a session under a second', () => {
    const { result } = renderHook(() => useActiveTimer(createTimerStorage(createMemoryStorage())));

    act(() => result.current.start('gym', AUGUST));
    let stopped: ReturnType<typeof result.current.stop> | undefined;
    act(() => {
      stopped = result.current.stop();
    });

    expect(stopped?.status).toBe('too-short');
  });

  it('clamps a timer left running for days to a single day', () => {
    const { result } = renderHook(() => useActiveTimer(createTimerStorage(createMemoryStorage())));

    act(() => result.current.start('gym', AUGUST));
    act(() => void vi.advanceTimersByTime(3 * 24 * 3600 * 1000));

    let stopped: ReturnType<typeof result.current.stop> | undefined;
    act(() => {
      stopped = result.current.stop();
    });

    if (stopped?.status !== 'saved') throw new Error('expected a saved session');
    expect(stopped.session.durationSeconds).toBe(24 * 3600);
  });

  it('discards without producing a session', () => {
    const backing = createMemoryStorage();
    const { result } = renderHook(() => useActiveTimer(createTimerStorage(backing)));

    act(() => result.current.start('gym', AUGUST));
    act(() => result.current.discard());

    expect(result.current.isRunning).toBe(false);
    expect(backing.getItem(TIMER_STORAGE_KEY)).toBeNull();
    expect(result.current.stop().status).toBe('idle');
  });

  it('resumes a running timer after a reload, elapsed from the stored start', () => {
    const backing = createMemoryStorage();
    const first = renderHook(() => useActiveTimer(createTimerStorage(backing)));

    act(() => first.result.current.start('gym', AUGUST));
    first.unmount();

    // Time passes while the app is closed.
    vi.setSystemTime(new Date(START.getTime() + 10 * 60_000));

    const second = renderHook(() => useActiveTimer(createTimerStorage(backing)));
    expect(second.result.current.isRunning).toBe(true);
    expect(second.result.current.elapsed).toBe(600);
  });

  it('assigns the session to the month the clock started in', () => {
    vi.setSystemTime(new Date(2026, 8, 1, 0, 30, 0, 0));
    const { result } = renderHook(() => useActiveTimer(createTimerStorage(createMemoryStorage())));

    // The user is still looking at August when they start the clock.
    act(() => result.current.start('gym', AUGUST));
    act(() => void vi.advanceTimersByTime(60_000));

    let stopped: ReturnType<typeof result.current.stop> | undefined;
    act(() => {
      stopped = result.current.stop();
    });

    if (stopped?.status !== 'saved') throw new Error('expected a saved session');
    expect(stopped.month).toBe('2026-09');
  });
});
