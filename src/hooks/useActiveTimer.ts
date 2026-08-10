import { useCallback, useEffect, useRef, useState } from 'react';
import type { ActiveTimer, TimeSession } from '../types';
import { monthKeyOfInstant, type MonthKey } from '../lib/date';
import { createSession } from '../lib/sessions';
import { MAX_SESSION_SECONDS, MIN_SESSION_SECONDS } from '../lib/time';
import { timerStorage as defaultTimerStorage, type TimerStorage } from '../storage/timerStorage';

/** What stopping a timer produced, so the caller can report it accurately. */
export type StopResult =
  | { status: 'saved'; session: TimeSession; month: MonthKey }
  | { status: 'too-short' }
  | { status: 'idle' };

const elapsedSince = (startTime: string, now: number) =>
  Math.max(0, Math.floor((now - Date.parse(startTime)) / 1000));

/**
 * Owns the single running timer. The elapsed time is always recomputed from the
 * stored start instant rather than accumulated, so a backgrounded tab, a paused
 * interval or a full reload all still report the true duration.
 */
export function useActiveTimer(storage: TimerStorage = defaultTimerStorage) {
  const [timer, setTimer] = useState<ActiveTimer | null>(() => storage.load());
  const [elapsed, setElapsed] = useState(() => {
    const restored = storage.load();
    return restored ? elapsedSince(restored.startTime, Date.now()) : 0;
  });

  // Read inside callbacks so a stop/discard always sees the current timer
  // without those callbacks changing identity on every tick.
  const timerRef = useRef(timer);
  timerRef.current = timer;

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
      storage.save(next);
      setTimer(next);
      setElapsed(0);
    },
    [storage],
  );

  const discard = useCallback(() => {
    storage.clear();
    setTimer(null);
  }, [storage]);

  /**
   * Ends the run and returns the session to persist. Sessions shorter than a
   * second are dropped instead of littering the history with empty rows.
   */
  const stop = useCallback(
    (now: Date = new Date()): StopResult => {
      const current = timerRef.current;
      if (!current) return { status: 'idle' };

      storage.clear();
      setTimer(null);

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
    [storage],
  );

  return { timer, elapsed, start, stop, discard, isRunning: timer !== null };
}

export type ActiveTimerController = ReturnType<typeof useActiveTimer>;
