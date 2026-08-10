import { useCallback, useEffect, useRef, useState } from 'react';
import type { ActiveTimer, TimeSession } from '../types';
import { monthKeyOfInstant, type MonthKey } from '../lib/date';
import { createSession } from '../lib/sessions';
import { MAX_SESSION_SECONDS, MIN_SESSION_SECONDS } from '../lib/time';
import { createLocalTimerStore, type TimerStore } from '../data/timerStore';

/** What stopping a timer produced, so the caller can report it accurately. */
export type StopResult =
  | { status: 'saved'; session: TimeSession; month: MonthKey }
  | { status: 'too-short' }
  | { status: 'idle' };

const elapsedSince = (startTime: string, now: number) =>
  Math.max(0, Math.floor((now - Date.parse(startTime)) / 1000));

const defaultStore = createLocalTimerStore();

/**
 * Owns the single running timer. The elapsed time is always recomputed from the
 * stored start instant rather than accumulated, so a backgrounded tab, a paused
 * interval, a full reload or a dropped connection all still report the true
 * duration.
 */
export function useActiveTimer(store: TimerStore = defaultStore) {
  const [timer, setTimer] = useState<ActiveTimer | null>(() => store.loadSync?.() ?? null);
  const [elapsed, setElapsed] = useState(() => {
    const restored = store.loadSync?.() ?? null;
    return restored ? elapsedSince(restored.startTime, Date.now()) : 0;
  });
  const [error, setError] = useState<string | null>(null);

  // Read inside callbacks so a stop/discard always sees the current timer
  // without those callbacks changing identity on every tick.
  const timerRef = useRef(timer);
  timerRef.current = timer;

  // Restore whatever the backend says is running, then follow it. For the cloud
  // store this is what surfaces a timer started on another device.
  useEffect(() => {
    let cancelled = false;

    void (async () => {
      try {
        const restored = await store.load();
        if (!cancelled) setTimer(restored);
      } catch (failure) {
        if (!cancelled) {
          setError(failure instanceof Error ? failure.message : 'Could not restore the timer.');
        }
      }
    })();

    const unsubscribe = store.subscribe?.((next) => {
      if (!cancelled) setTimer(next);
    });

    return () => {
      cancelled = true;
      unsubscribe?.();
    };
  }, [store]);

  useEffect(() => {
    if (!timer) {
      setElapsed(0);
      return;
    }

    const tick = () => setElapsed(elapsedSince(timer.startTime, Date.now()));
    tick();
    const interval = setInterval(tick, 1000);

    // A hidden tab may throttle the interval; re-sync as soon as it is back.
    const onVisible = () => {
      if (!document.hidden) tick();
    };
    document.addEventListener('visibilitychange', onVisible);

    return () => {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [timer]);

  const start = useCallback(
    (taskId: string, month: MonthKey, now: Date = new Date()) => {
      const startTime = now.toISOString();
      // The session belongs to the month the clock started in, which is not
      // necessarily the month the user happens to be viewing.
      const next: ActiveTimer = {
        taskId,
        startTime,
        month: monthKeyOfInstant(startTime) ?? month,
      };

      // Shown immediately; the backend's answer wins once it arrives, because
      // the cloud stamps the start from the database clock rather than this one.
      setTimer(next);
      setError(null);
      void store
        .save(next)
        .then((authoritative) => setTimer((current) => (current ? authoritative : current)))
        .catch((failure: unknown) => {
          setError(failure instanceof Error ? failure.message : 'Could not start the timer.');
        });
    },
    [store],
  );

  const discard = useCallback(() => {
    setTimer(null);
    void store.clear().catch((failure: unknown) => {
      setError(failure instanceof Error ? failure.message : 'Could not clear the timer.');
    });
  }, [store]);

  /**
   * Ends the run and returns the session to persist. Sessions shorter than a
   * second are dropped instead of littering the history with empty rows.
   *
   * This stays synchronous on purpose: the recorded session goes through the
   * tracker's own write queue, so a stop is never lost to a failed request, and
   * the caller can report the result straight away.
   */
  const stop = useCallback(
    (now: Date = new Date()): StopResult => {
      const current = timerRef.current;
      if (!current) return { status: 'idle' };

      setTimer(null);
      void store.clear().catch((failure: unknown) => {
        setError(failure instanceof Error ? failure.message : 'Could not clear the timer.');
      });

      const seconds = elapsedSince(current.startTime, now.getTime());
      if (seconds < MIN_SESSION_SECONDS) return { status: 'too-short' };

      const session = createSession(
        {
          taskId: current.taskId,
          startTime: current.startTime,
          // Clamped so a timer forgotten for days records at most one day.
          endTime: new Date(
            Date.parse(current.startTime) + Math.min(seconds, MAX_SESSION_SECONDS) * 1000,
          ).toISOString(),
        },
        now,
      );

      return { status: 'saved', session, month: current.month };
    },
    [store],
  );

  return { timer, elapsed, error, start, stop, discard, isRunning: timer !== null };
}

export type ActiveTimerController = ReturnType<typeof useActiveTimer>;
