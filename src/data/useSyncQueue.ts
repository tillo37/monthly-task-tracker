import { useCallback, useEffect, useRef, useState } from 'react';
import type { TrackerData } from '../types';
import { describeOp, type TrackerOp, type TrackerPersistence } from './ops';

export interface SyncState {
  /** Changes written locally but not yet accepted by the backend. */
  pending: number;
  /** Set when a write failed; the queue holds its place until it succeeds. */
  error: string | null;
}

export interface SyncQueue extends SyncState {
  enqueue(op: TrackerOp, next: TrackerData): void;
  retry(): void;
}

interface Entry {
  op: TrackerOp;
  next: TrackerData;
}

/**
 * Serialises writes to the backend.
 *
 * Ops are applied in the order the user made them, one at a time — two edits to
 * the same task must not race. A failed write stays at the head of the queue
 * rather than being dropped, so a session recorded while the connection was
 * down is sent as soon as it returns instead of vanishing.
 */
export function useSyncQueue(persistence: TrackerPersistence): SyncQueue {
  const queue = useRef<Entry[]>([]);
  const draining = useRef(false);
  const [state, setState] = useState<SyncState>({ pending: 0, error: null });

  const drain = useCallback(async () => {
    if (draining.current) return;
    draining.current = true;

    try {
      while (queue.current.length > 0) {
        const entry = queue.current[0];
        try {
          await persistence.commit(entry.op, entry.next);
        } catch (error) {
          setState({
            pending: queue.current.length,
            error: `Sync failed while ${describeOp(entry.op)}: ${
              error instanceof Error ? error.message : 'unknown error'
            }`,
          });
          return;
        }
        queue.current.shift();
        setState({ pending: queue.current.length, error: null });
      }
    } finally {
      draining.current = false;
    }
  }, [persistence]);

  const enqueue = useCallback(
    (op: TrackerOp, next: TrackerData) => {
      queue.current.push({ op, next });
      setState((current) => ({ ...current, pending: queue.current.length }));
      void drain();
    },
    [drain],
  );

  const retry = useCallback(() => {
    setState((current) => ({ ...current, error: null }));
    void drain();
  }, [drain]);

  // Coming back online is the common case for a stalled queue.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const onOnline = () => void drain();
    window.addEventListener('online', onOnline);
    return () => window.removeEventListener('online', onOnline);
  }, [drain]);

  return { ...state, enqueue, retry };
}
