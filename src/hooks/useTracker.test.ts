import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { createMemoryStorage, createMonthlyStorage } from '../storage/monthlyStorage';
import { currentMonthKey } from '../lib/date';
import { useTracker } from './useTracker';

function setup() {
  const backing = createMemoryStorage();
  const storage = createMonthlyStorage(backing);
  const view = renderHook(() => useTracker(storage));
  return { ...view, backing, storage };
}

const AUGUST = '2026-08';
const SEPTEMBER = '2026-09';

describe('useTracker', () => {
  beforeEach(() => localStorage.clear());

  it('starts on the current month with no tasks', () => {
    const { result } = setup();
    expect(result.current.month).toBe(currentMonthKey());
    expect(result.current.monthData.tasks).toEqual([]);
    expect(result.current.stats.percentage).toBe(0);
  });

  it('adds a task and recomputes stats as days are toggled', () => {
    const { result } = setup();

    act(() => result.current.goToMonth(AUGUST));
    act(() => result.current.addTask({ name: 'Gym', target: 20 }));

    const id = result.current.monthData.tasks[0].id;
    act(() => result.current.toggleCompletion(id, '2026-08-01'));
    act(() => result.current.toggleCompletion(id, '2026-08-02'));

    expect(result.current.stats).toMatchObject({
      taskCount: 1,
      totalCompleted: 2,
      totalTarget: 20,
      percentage: 10,
    });

    act(() => result.current.toggleCompletion(id, '2026-08-02'));
    expect(result.current.stats.totalCompleted).toBe(1);
  });

  it('weights overall progress by target across tasks', () => {
    const { result } = setup();
    act(() => result.current.goToMonth(AUGUST));
    act(() => result.current.addTask({ name: 'A', target: 20 }));
    act(() => result.current.addTask({ name: 'B', target: 5 }));

    const [a, b] = result.current.monthData.tasks;
    act(() => {
      for (let day = 1; day <= 10; day += 1) {
        result.current.toggleCompletion(a.id, `2026-08-${String(day).padStart(2, '0')}`);
      }
    });
    act(() => {
      for (let day = 1; day <= 5; day += 1) {
        result.current.toggleCompletion(b.id, `2026-08-${String(day).padStart(2, '0')}`);
      }
    });

    expect(result.current.stats.percentage).toBe(60);
  });

  it('keeps months independent', () => {
    const { result } = setup();

    act(() => result.current.goToMonth(AUGUST));
    act(() => result.current.addTask({ name: 'Gym', target: 20 }));
    act(() => result.current.toggleCompletion(result.current.monthData.tasks[0].id, '2026-08-01'));

    act(() => result.current.goToMonth(SEPTEMBER));
    expect(result.current.monthData.tasks).toEqual([]);

    act(() => result.current.addTask({ name: 'Gym', target: 18 }));
    expect(result.current.monthData.tasks[0].target).toBe(18);

    act(() => result.current.goToMonth(AUGUST));
    expect(result.current.monthData.tasks[0].target).toBe(20);
    expect(result.current.monthData.tasks[0].completedDates).toEqual(['2026-08-01']);
  });

  it('copies the previous month without its completion history', () => {
    const { result } = setup();

    act(() => result.current.goToMonth(AUGUST));
    act(() => result.current.addTask({ name: 'Gym', target: 20 }));
    act(() => result.current.addTask({ name: 'Korean', target: 15 }));
    act(() => result.current.toggleCompletion(result.current.monthData.tasks[0].id, '2026-08-01'));

    act(() => result.current.goToMonth(SEPTEMBER));
    expect(result.current.previousMonthTaskCount).toBe(2);
    act(() => result.current.copyPreviousMonth());

    expect(result.current.monthData.tasks.map((task) => [task.name, task.target])).toEqual([
      ['Gym', 20],
      ['Korean', 15],
    ]);
    expect(result.current.stats.totalCompleted).toBe(0);

    // August is untouched.
    act(() => result.current.goToMonth(AUGUST));
    expect(result.current.stats.totalCompleted).toBe(1);
  });

  it('edits and deletes tasks', () => {
    const { result } = setup();
    act(() => result.current.goToMonth(AUGUST));
    act(() => result.current.addTask({ name: 'Gym', target: 20 }));

    const id = result.current.monthData.tasks[0].id;
    act(() => result.current.toggleCompletion(id, '2026-08-01'));
    act(() => result.current.updateTask(id, { name: 'Weights', target: 10 }));

    expect(result.current.monthData.tasks[0].name).toBe('Weights');
    expect(result.current.stats.percentage).toBe(10);
    expect(result.current.monthData.tasks[0].completedDates).toEqual(['2026-08-01']);

    act(() => result.current.deleteTask(id));
    expect(result.current.monthData.tasks).toEqual([]);
  });

  it('resets only the current month', () => {
    const { result } = setup();

    act(() => result.current.goToMonth(AUGUST));
    act(() => result.current.addTask({ name: 'Gym', target: 20 }));
    act(() => result.current.toggleCompletion(result.current.monthData.tasks[0].id, '2026-08-04'));

    act(() => result.current.goToMonth(SEPTEMBER));
    act(() => result.current.addTask({ name: 'Gym', target: 20 }));
    act(() => result.current.toggleCompletion(result.current.monthData.tasks[0].id, '2026-09-04'));
    act(() => result.current.resetMonth());

    expect(result.current.monthData.tasks).toHaveLength(1);
    expect(result.current.stats.totalCompleted).toBe(0);

    act(() => result.current.goToMonth(AUGUST));
    expect(result.current.stats.totalCompleted).toBe(1);
  });

  it('navigates months forwards, backwards and back to today', () => {
    const { result } = setup();

    act(() => result.current.goToMonth('2026-12'));
    act(() => result.current.goToNextMonth());
    expect(result.current.month).toBe('2027-01');

    act(() => result.current.goToPreviousMonth());
    act(() => result.current.goToPreviousMonth());
    expect(result.current.month).toBe('2026-11');

    act(() => result.current.goToCurrentMonth());
    expect(result.current.month).toBe(currentMonthKey());
  });

  it('persists changes and reloads them from storage', () => {
    const backing = createMemoryStorage();
    const first = renderHook(() => useTracker(createMonthlyStorage(backing)));

    act(() => first.result.current.goToMonth(AUGUST));
    act(() => first.result.current.addTask({ name: 'Gym', target: 20 }));
    act(() =>
      first.result.current.toggleCompletion(
        first.result.current.monthData.tasks[0].id,
        '2026-08-09',
      ),
    );
    first.unmount();

    const second = renderHook(() => useTracker(createMonthlyStorage(backing)));
    act(() => second.result.current.goToMonth(AUGUST));

    expect(second.result.current.monthData.tasks[0]).toMatchObject({
      name: 'Gym',
      target: 20,
      completedDates: ['2026-08-09'],
    });
  });

  it('replaces all data on import', () => {
    const { result } = setup();
    act(() => result.current.goToMonth(AUGUST));
    act(() => result.current.addTask({ name: 'Gym', target: 20 }));

    act(() =>
      result.current.replaceData({
        version: 1,
        months: { [AUGUST]: { tasks: [], sessions: [] }, [SEPTEMBER]: { tasks: [], sessions: [] } },
      }),
    );

    expect(result.current.monthData.tasks).toEqual([]);
    expect(Object.keys(result.current.data.months)).toEqual([AUGUST, SEPTEMBER]);
  });
});
