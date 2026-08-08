import { describe, expect, it } from 'vitest';
import { taskStats } from './calculations';
import {
  addTask,
  copyTaskDefinitions,
  createTask,
  deleteTask,
  emptyMonth,
  pruneToMonth,
  resetProgress,
  toggleCompletion,
  updateTask,
  validateTaskInput,
} from './tasks';

const month = () => addTask(emptyMonth(), createTask({ name: 'Gym', target: 20 }));

describe('validateTaskInput', () => {
  it('accepts a sensible task', () => {
    expect(validateTaskInput({ name: 'Gym', target: 20 })).toEqual({});
  });

  it('rejects empty names', () => {
    expect(validateTaskInput({ name: '   ', target: 20 }).name).toBeDefined();
  });

  it('rejects non-positive, fractional and missing targets', () => {
    expect(validateTaskInput({ name: 'Gym', target: 0 }).target).toBeDefined();
    expect(validateTaskInput({ name: 'Gym', target: -3 }).target).toBeDefined();
    expect(validateTaskInput({ name: 'Gym', target: 2.5 }).target).toBeDefined();
    expect(validateTaskInput({ name: 'Gym', target: '' }).target).toBeDefined();
    expect(validateTaskInput({ name: 'Gym', target: 'many' }).target).toBeDefined();
    expect(validateTaskInput({ name: 'Gym', target: 1000 }).target).toBeDefined();
  });
});

describe('createTask', () => {
  it('trims the name, truncates the target and starts with no history', () => {
    const task = createTask({ name: '  Korean  ', target: 15 });
    expect(task.name).toBe('Korean');
    expect(task.target).toBe(15);
    expect(task.completedDates).toEqual([]);
    expect(task.id).toBeTruthy();
    expect(Number.isNaN(Date.parse(task.createdAt))).toBe(false);
  });

  it('gives every task a distinct id', () => {
    const ids = new Set(
      Array.from({ length: 50 }, () => createTask({ name: 'Gym', target: 1 }).id),
    );
    expect(ids.size).toBe(50);
  });
});

describe('task CRUD', () => {
  it('adds tasks without mutating the previous month data', () => {
    const before = emptyMonth();
    const after = addTask(before, createTask({ name: 'Gym', target: 20 }));
    expect(before.tasks).toHaveLength(0);
    expect(after.tasks).toHaveLength(1);
  });

  it('edits name, target, colour and icon', () => {
    const data = month();
    const id = data.tasks[0].id;
    const updated = updateTask(data, id, {
      name: '  Weights ',
      target: 24,
      color: '#ef4444',
      icon: 'dumbbell',
    });

    expect(updated.tasks[0]).toMatchObject({
      name: 'Weights',
      target: 24,
      color: '#ef4444',
      icon: 'dumbbell',
    });
  });

  it('keeps completion history when the target changes', () => {
    let data = month();
    const id = data.tasks[0].id;
    data = toggleCompletion(data, id, '2026-08-01');
    data = toggleCompletion(data, id, '2026-08-02');

    const retargeted = updateTask(data, id, { target: 10 });
    expect(retargeted.tasks[0].completedDates).toEqual(['2026-08-01', '2026-08-02']);
    expect(taskStats(retargeted.tasks[0], '2026-08').percentage).toBe(20);
  });

  it('leaves other tasks untouched when editing', () => {
    let data = month();
    data = addTask(data, createTask({ name: 'Korean', target: 15 }));
    const updated = updateTask(data, data.tasks[0].id, { target: 5 });
    expect(updated.tasks[1]).toEqual(data.tasks[1]);
  });

  it('deletes only the requested task', () => {
    let data = month();
    data = addTask(data, createTask({ name: 'Korean', target: 15 }));
    const deleted = deleteTask(data, data.tasks[0].id);
    expect(deleted.tasks).toHaveLength(1);
    expect(deleted.tasks[0].name).toBe('Korean');
  });
});

describe('toggleCompletion', () => {
  it('marks and unmarks a day', () => {
    const data = month();
    const id = data.tasks[0].id;

    const marked = toggleCompletion(data, id, '2026-08-09');
    expect(marked.tasks[0].completedDates).toEqual(['2026-08-09']);

    const unmarked = toggleCompletion(marked, id, '2026-08-09');
    expect(unmarked.tasks[0].completedDates).toEqual([]);
  });

  it('keeps dates sorted and unique', () => {
    let data = month();
    const id = data.tasks[0].id;
    for (const date of ['2026-08-10', '2026-08-02', '2026-08-31', '2026-08-02']) {
      data = toggleCompletion(data, id, date);
    }
    // 2026-08-02 was toggled twice, so it cancels out.
    expect(data.tasks[0].completedDates).toEqual(['2026-08-10', '2026-08-31']);
  });

  it('allows marking future dates', () => {
    const data = month();
    const marked = toggleCompletion(data, data.tasks[0].id, '2099-01-01');
    expect(marked.tasks[0].completedDates).toContain('2099-01-01');
  });

  it('ignores unknown task ids', () => {
    const data = month();
    expect(toggleCompletion(data, 'missing', '2026-08-09')).toEqual(data);
  });
});

describe('resetProgress', () => {
  it('clears completions but keeps the task definitions', () => {
    let data = month();
    data = addTask(data, createTask({ name: 'Korean', target: 15 }));
    data = toggleCompletion(data, data.tasks[0].id, '2026-08-01');
    data = toggleCompletion(data, data.tasks[1].id, '2026-08-02');

    const reset = resetProgress(data);
    expect(reset.tasks).toHaveLength(2);
    expect(reset.tasks.every((task) => task.completedDates.length === 0)).toBe(true);
    expect(reset.tasks.map((task) => task.target)).toEqual([20, 15]);
  });
});

describe('copyTaskDefinitions', () => {
  it('copies names, targets and appearance but no history', () => {
    let source = month();
    source = addTask(source, createTask({ name: 'Korean', target: 15, color: '#14b8a6' }));
    source = toggleCompletion(source, source.tasks[0].id, '2026-08-01');

    const copied = copyTaskDefinitions(source);
    expect(copied.tasks.map((task) => [task.name, task.target])).toEqual([
      ['Gym', 20],
      ['Korean', 15],
    ]);
    expect(copied.tasks.every((task) => task.completedDates.length === 0)).toBe(true);
    expect(copied.tasks[1].color).toBe('#14b8a6');
  });

  it('gives copies fresh ids so the months stay independent', () => {
    const source = month();
    const copied = copyTaskDefinitions(source);
    expect(copied.tasks[0].id).not.toBe(source.tasks[0].id);
    expect(source.tasks[0].completedDates).toEqual([]);
  });
});

describe('pruneToMonth', () => {
  it('drops completions belonging to other months', () => {
    let data = month();
    const id = data.tasks[0].id;
    data = toggleCompletion(data, id, '2026-08-05');
    data = toggleCompletion(data, id, '2026-09-05');

    expect(pruneToMonth(data, '2026-08').tasks[0].completedDates).toEqual(['2026-08-05']);
  });
});
