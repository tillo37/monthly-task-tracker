import { describe, expect, it } from 'vitest';
import type { MonthData, Task } from '../types';
import {
  completionPercentage,
  countCompleted,
  formatPercentage,
  monthStats,
  taskStats,
} from './calculations';

function task(overrides: Partial<Task> & { name: string; target: number }): Task {
  return {
    id: overrides.id ?? overrides.name,
    color: '#6366f1',
    icon: 'target',
    completedDates: [],
    createdAt: '2026-08-01T00:00:00.000Z',
    ...overrides,
  };
}

/** `count` days of the given month, starting from the 1st. */
function days(month: string, count: number): string[] {
  return Array.from({ length: count }, (_, index) => `${month}-${String(index + 1).padStart(2, '0')}`);
}

describe('completionPercentage', () => {
  it.each([
    [15, 20, 75],
    [20, 20, 100],
    [25, 20, 125],
    [0, 20, 0],
    [12, 15, 80],
    [5, 6, (5 / 6) * 100],
  ])('%i of %i is %f%%', (completed, target, expected) => {
    expect(completionPercentage(completed, target)).toBeCloseTo(expected, 10);
  });

  it('does not divide by zero', () => {
    expect(completionPercentage(3, 0)).toBe(0);
    expect(completionPercentage(0, 0)).toBe(0);
  });

  it('is not capped at 100', () => {
    expect(completionPercentage(40, 20)).toBe(200);
  });
});

describe('taskStats', () => {
  it('derives completed, percentage and the exceeded flag', () => {
    const stats = taskStats(task({ name: 'Gym', target: 20, completedDates: days('2026-08', 15) }));
    expect(stats).toMatchObject({ completed: 15, target: 20, percentage: 75, exceeded: false });
  });

  it('marks exceeding the target', () => {
    const stats = taskStats(task({ name: 'Korean', target: 15, completedDates: days('2026-08', 18) }));
    expect(stats.percentage).toBe(120);
    expect(stats.exceeded).toBe(true);
  });

  it('ignores completions outside the month being counted', () => {
    const gym = task({
      name: 'Gym',
      target: 20,
      completedDates: [...days('2026-08', 10), '2026-07-30', '2026-09-02'],
    });
    expect(countCompleted(gym)).toBe(12);
    expect(countCompleted(gym, '2026-08')).toBe(10);
    expect(taskStats(gym, '2026-08').percentage).toBe(50);
  });
});

describe('monthStats', () => {
  it('weights the overall percentage by target rather than averaging', () => {
    const data: MonthData = {
      tasks: [
        task({ name: 'A', target: 20, completedDates: days('2026-08', 10) }),
        task({ name: 'B', target: 5, completedDates: days('2026-08', 5) }),
      ],
      sessions: [],
    };

    const stats = monthStats(data, '2026-08');
    expect(stats.totalCompleted).toBe(15);
    expect(stats.totalTarget).toBe(25);
    expect(stats.percentage).toBe(60);
    // The naive average of 50% and 100% would be 75%.
    expect(stats.percentage).not.toBe(75);
  });

  it('matches the three-task worked example', () => {
    const data: MonthData = {
      tasks: [
        task({ name: 'A', target: 20, completedDates: days('2026-08', 15) }),
        task({ name: 'B', target: 10, completedDates: days('2026-08', 8) }),
        task({ name: 'C', target: 5, completedDates: days('2026-08', 5) }),
      ],
      sessions: [],
    };

    const stats = monthStats(data, '2026-08');
    expect(stats.totalCompleted).toBe(28);
    expect(stats.totalTarget).toBe(35);
    expect(stats.percentage).toBe(80);
  });

  it('reports best and worst performers', () => {
    const data: MonthData = {
      tasks: [
        task({ name: 'Korean', target: 10, completedDates: days('2026-08', 12) }),
        task({ name: 'Gym', target: 20, completedDates: days('2026-08', 15) }),
        task({ name: 'Reading', target: 12, completedDates: days('2026-08', 5) }),
      ],
      sessions: [],
    };

    const stats = monthStats(data, '2026-08');
    expect(stats.best?.task.name).toBe('Korean');
    expect(stats.worst?.task.name).toBe('Reading');
    expect(stats.taskCount).toBe(3);
  });

  it('omits best/worst when there is nothing to compare', () => {
    const single = monthStats({ tasks: [task({ name: 'Gym', target: 20 })], sessions: [] }, '2026-08');
    expect(single.best).toBeNull();
    expect(single.worst).toBeNull();
  });

  it('handles an empty month', () => {
    const stats = monthStats({ tasks: [], sessions: [] }, '2026-08');
    expect(stats).toMatchObject({
      taskCount: 0,
      totalCompleted: 0,
      totalTarget: 0,
      percentage: 0,
      best: null,
      worst: null,
    });
  });
});

describe('formatPercentage', () => {
  it.each([
    [75, '75%'],
    [100, '100%'],
    [125, '125%'],
    [0, '0%'],
    [(5 / 6) * 100, '83.3%'],
    [75.24, '75.2%'],
    [99.99, '100%'],
  ])('%f -> %s', (value, expected) => {
    expect(formatPercentage(value)).toBe(expected);
  });
});
