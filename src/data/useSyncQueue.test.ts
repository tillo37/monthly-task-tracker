import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { TrackerData } from '../types';
import { emptyTrackerData } from '../lib/validation';
import type { TrackerOp, TrackerPersistence } from './ops';
import { useSyncQueue } from './useSyncQueue';

const DOC: TrackerData = emptyTrackerData();

const op = (name: string): TrackerOp => ({
  type: 'deleteSession',
  month: '2026-08',
  sessionId: name,
});

/** A backend whose every write can be resolved or rejected by the test. */
function controllable() {
  const calls: TrackerOp[] = [];
  let failures = 0;

  const persistence: TrackerPersistence = {
    load: async () => DOC,
    commit: async (incoming) => {
      if (failures > 0) {
        failures -= 1;
        throw new Error('offline');
      }
      calls.push(incoming);
    },
  };

  return {
    persistence,
    calls,
    failNext: (count: number) => {
      failures = count;
    },
  };
}

describe('useSyncQueue', () => {
  it('writes queued ops in the order they were made', async () => {
    const backend = controllable();
    const { result } = renderHook(() => useSyncQueue(backend.persistence));

    act(() => {
      result.current.enqueue(op('one'), DOC);
      result.current.enqueue(op('two'), DOC);
      result.current.enqueue(op('three'), DOC);
    });

    await waitFor(() => expect(result.current.pending).toBe(0));
    expect(backend.calls.map((entry) => (entry.type === 'deleteSession' ? entry.sessionId : ''))).toEqual([
      'one',
      'two',
      'three',
    ]);
  });

  it('holds a failed op at the head of the queue instead of dropping it', async () => {
    const backend = controllable();
    backend.failNext(1);
    const { result } = renderHook(() => useSyncQueue(backend.persistence));

    act(() => result.current.enqueue(op('recorded-while-offline'), DOC));

    await waitFor(() => expect(result.current.error).toContain('Sync failed'));
    expect(result.current.pending).toBe(1);
    // Nothing reached the backend, so nothing was silently lost.
    expect(backend.calls).toHaveLength(0);
  });

  it('sends the held op once a retry succeeds', async () => {
    const backend = controllable();
    backend.failNext(1);
    const { result } = renderHook(() => useSyncQueue(backend.persistence));

    act(() => result.current.enqueue(op('session'), DOC));
    await waitFor(() => expect(result.current.error).not.toBeNull());

    act(() => result.current.retry());

    await waitFor(() => expect(result.current.pending).toBe(0));
    expect(result.current.error).toBeNull();
    expect(backend.calls).toHaveLength(1);
  });

  it('drains automatically when the connection comes back', async () => {
    const backend = controllable();
    backend.failNext(1);
    const { result } = renderHook(() => useSyncQueue(backend.persistence));

    act(() => result.current.enqueue(op('session'), DOC));
    await waitFor(() => expect(result.current.error).not.toBeNull());

    act(() => void window.dispatchEvent(new Event('online')));

    await waitFor(() => expect(backend.calls).toHaveLength(1));
  });

  it('keeps later ops behind a stalled one', async () => {
    const backend = controllable();
    backend.failNext(1);
    const { result } = renderHook(() => useSyncQueue(backend.persistence));

    act(() => result.current.enqueue(op('first'), DOC));
    await waitFor(() => expect(result.current.error).not.toBeNull());

    act(() => result.current.enqueue(op('second'), DOC));
    act(() => result.current.retry());

    await waitFor(() => expect(result.current.pending).toBe(0));
    // Order is preserved across the failure — a retry must not reorder writes.
    expect(backend.calls.map((entry) => (entry.type === 'deleteSession' ? entry.sessionId : ''))).toEqual([
      'first',
      'second',
    ]);
  });

  it('names the failing change so the banner can be specific', async () => {
    const persistence: TrackerPersistence = {
      load: async () => DOC,
      commit: vi.fn().mockRejectedValue(new Error('network down')),
    };
    const { result } = renderHook(() => useSyncQueue(persistence));

    act(() =>
      result.current.enqueue(
        {
          type: 'addSession',
          month: '2026-08',
          session: {
            id: 's1',
            taskId: 't1',
            startTime: '2026-08-03T09:00:00.000Z',
            endTime: '2026-08-03T10:00:00.000Z',
            durationSeconds: 3600,
            createdAt: '2026-08-03T10:00:00.000Z',
          },
        },
        DOC,
      ),
    );

    await waitFor(() =>
      expect(result.current.error).toBe('Sync failed while saving a session: network down'),
    );
  });
});
