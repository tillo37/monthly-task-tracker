import { describe, expect, it } from 'vitest';
import type { MonthData, Task, TimeSession } from '../types';
import { monthTimeStats, taskTimeStats } from './calculations';
import { todayKey } from './date';

const AUGUST = '2026-08';

function task(name: string, target: number, completed: string[] = []): Task {
  return {
    id: name,
    name,
    target,
    color: '#6366f1',
    icon: 'target',
    completedDates: completed,
    createdAt: '2026-08-01T00:00:00.000Z',
  };
}

/** Local-time session so the reported day matches the machine's calendar. */
function session(taskId: string, day: number, hour: number, minutes: number): TimeSession {
  const start = new Date(2026, 7, day, hour, 0, 0, 0);
  const end = new Date(start.getTime() + minutes * 60_000);
  return {
    id: `${taskId}-${day}-${hour}`,
    taskId,
    startTime: start.toISOString(),
    endTime: end.toISOString(),
    durationSeconds: minutes * 60,
    createdAt: end.toISOString(),
  };
}

const dayKey = (day: number) => todayKey(new Date(2026, 7, day));

describe('monthTimeStats', () => {
  it('matches the worked example from the product brief', () => {
    const data: MonthData = {
      tasks: [
        task('Gym', 20, ['2026-08-01', '2026-08-02']),
        task('Korean', 20, ['2026-08-01']),
      ],
      // 14h 35m for Gym, 21h 10m for Korean, split across two sessions each.
      sessions: [
            session('Gym', 3, 7, 8 * 60),
            session('Gym', 4, 7, 6 * 60 + 35),
            session('Korean', 3, 19, 11 * 60),
            session('Korean', 4, 19, 10 * 60 + 10),
      ],
    };

    const stats = monthTimeStats(data, AUGUST);
    expect(stats.byTask.Gym.totalSeconds).toBe(14 * 3600 + 35 * 60);
    expect(stats.byTask.Korean.totalSeconds).toBe(21 * 3600 + 10 * 60);
    expect(stats.totalSeconds).toBe(35 * 3600 + 45 * 60);
    expect(stats.sessionCount).toBe(4);
  });

  it('gives every task an entry even with no sessions', () => {
    const stats = monthTimeStats({ tasks: [task('Gym', 20)], sessions: [] }, AUGUST);
    expect(stats.byTask.Gym).toMatchObject({
      totalSeconds: 0,
      sessionCount: 0,
      lastSessionAt: null,
      averageSeconds: 0,
      secondsPerCompletion: 0,
    });
    expect(stats.totalSeconds).toBe(0);
    expect(stats.busiestDay).toBeNull();
  });

  it('averages per session and per completion', () => {
    const data: MonthData = {
      tasks: [task('Gym', 20, ['2026-08-03', '2026-08-04'])],
      sessions: [session('Gym', 3, 7, 60), session('Gym', 4, 7, 30)],
    };

    const stats = monthTimeStats(data, AUGUST);
    expect(stats.byTask.Gym.averageSeconds).toBe(45 * 60);
    expect(stats.byTask.Gym.secondsPerCompletion).toBe(45 * 60);
    expect(stats.averageSeconds).toBe(45 * 60);
  });

  it('tracks the last session and the busiest day', () => {
    const data: MonthData = {
      tasks: [task('Gym', 20)],
      sessions: [session('Gym', 3, 7, 30), session('Gym', 5, 7, 90), session('Gym', 5, 18, 30)],
    };

    const stats = monthTimeStats(data, AUGUST);
    expect(stats.byTask.Gym.lastSessionAt).toBe(session('Gym', 5, 18, 30).startTime);
    expect(stats.busiestDay).toEqual({ date: dayKey(5), seconds: 120 * 60 });
    expect(stats.byDay[dayKey(3)]).toBe(30 * 60);
  });

  it('ranks tasks by time spent, descending', () => {
    const data: MonthData = {
      tasks: [task('Gym', 20), task('Korean', 20), task('Reading', 12)],
      sessions: [session('Korean', 3, 19, 120), session('Gym', 3, 7, 45)],
    };

    expect(monthTimeStats(data, AUGUST).ranked.map((entry) => entry.task.name)).toEqual([
      'Korean',
      'Gym',
      'Reading',
    ]);
  });

  it('counts sessions for missing tasks as orphans without adding them to totals', () => {
    const data: MonthData = {
      tasks: [task('Gym', 20)],
      sessions: [session('Gym', 3, 7, 60), session('Deleted', 3, 9, 60)],
    };

    const stats = monthTimeStats(data, AUGUST);
    expect(stats.orphanSessionCount).toBe(1);
    expect(stats.sessionCount).toBe(1);
    expect(stats.totalSeconds).toBe(3600);
  });
});

describe('taskTimeStats', () => {
  it('reads one task out of the month totals', () => {
    const data: MonthData = {
      tasks: [task('Gym', 20)],
      sessions: [session('Gym', 3, 7, 90)],
    };

    expect(taskTimeStats(data, 'Gym', AUGUST).totalSeconds).toBe(90 * 60);
    expect(taskTimeStats(data, 'nobody', AUGUST).totalSeconds).toBe(0);
  });
});
