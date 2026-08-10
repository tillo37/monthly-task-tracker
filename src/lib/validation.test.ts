import { describe, expect, it } from 'vitest';
import { createDemoData } from './demoData';
import { buildBackup } from './backup';
import { parseTrackerData, summarise } from './validation';

const valid = {
  version: 1,
  months: {
    '2026-08': {
      tasks: [
        {
          id: 'a',
          name: 'Gym',
          target: 20,
          color: '#6366f1',
          icon: 'dumbbell',
          completedDates: ['2026-08-01'],
          createdAt: '2026-08-01T00:00:00.000Z',
        },
      ],
    },
  },
};

describe('parseTrackerData', () => {
  it('accepts well-formed data', () => {
    const result = parseTrackerData(valid);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.months['2026-08'].tasks[0].name).toBe('Gym');
    expect(result.warnings).toEqual([]);
  });

  it('round-trips an export', () => {
    const exported = JSON.parse(JSON.stringify(buildBackup(createDemoData('2026-08'))));
    const result = parseTrackerData(exported);
    expect(result.ok).toBe(true);
    if (result.ok) expect(summarise(result.data).tasks).toBe(4);
  });

  it.each([
    ['a string', 'nope'],
    ['null', null],
    ['an array', []],
    ['an object with no months', { version: 1 }],
    ['months that are not an object', { months: 'x' }],
    ['only unusable months', { months: { 'bad-key': { tasks: [] } } }],
  ])('rejects %s', (_label, input) => {
    expect(parseTrackerData(input).ok).toBe(false);
  });

  it('skips tasks with no name or a bad target, keeping the rest', () => {
    const result = parseTrackerData({
      months: {
        '2026-08': {
          tasks: [
            { name: '', target: 5 },
            { name: 'Bad target', target: -1 },
            { name: 'Not a task' },
            'garbage',
            { name: 'Gym', target: 20 },
          ],
        },
      },
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.months['2026-08'].tasks.map((task) => task.name)).toEqual(['Gym']);
    expect(result.warnings.length).toBe(4);
  });

  it('drops invalid and out-of-month completion dates', () => {
    const result = parseTrackerData({
      months: {
        '2026-08': {
          tasks: [
            {
              name: 'Gym',
              target: 20,
              completedDates: ['2026-08-01', '2026-08-01', '2026-09-01', '2026-02-30', 'oops', 42],
            },
          ],
        },
      },
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.months['2026-08'].tasks[0].completedDates).toEqual(['2026-08-01']);
    expect(result.warnings.length).toBeGreaterThan(0);
  });

  it('repairs unknown icons and colours instead of failing', () => {
    const result = parseTrackerData({
      months: { '2026-08': { tasks: [{ name: 'Gym', target: 20, icon: 'skull', color: 'red' }] }},
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const task = result.data.months['2026-08'].tasks[0];
    expect(task.icon).toBe('target');
    expect(task.color).toMatch(/^#[0-9a-f]{6}$/i);
  });

  it('clamps oversized targets and de-duplicates ids', () => {
    const result = parseTrackerData({
      months: {
        '2026-08': {
          tasks: [
            { id: 'same', name: 'Gym', target: 100000 },
            { id: 'same', name: 'Korean', target: 15 },
          ],
        },
      },
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const tasks = result.data.months['2026-08'].tasks;
    expect(tasks[0].target).toBe(999);
    expect(tasks[0].id).not.toBe(tasks[1].id);
  });

  it('ignores months whose keys are not YYYY-MM', () => {
    const result = parseTrackerData({
      months: { '2026-13': { tasks: [{ name: 'Gym', target: 1 }] }, ...valid.months },
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(Object.keys(result.data.months)).toEqual(['2026-08']);
  });
});

describe('summarise', () => {
  it('counts months, tasks and completions', () => {
    const result = parseTrackerData(valid);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(summarise(result.data)).toEqual({
      months: 1,
      tasks: 1,
      completions: 1,
      sessions: 0,
      trackedSeconds: 0,
    });
  });
});

describe('buildBackup', () => {
  it('exports everything by default', () => {
    const data = createDemoData('2026-08');
    expect(Object.keys(buildBackup(data).months)).toEqual(['2026-08']);
  });

  it('exports only the requested months', () => {
    const data = createDemoData('2026-08');
    data.months['2026-09'] = { tasks: [], sessions: [] };
    expect(Object.keys(buildBackup(data, ['2026-09']).months)).toEqual(['2026-09']);
    expect(Object.keys(buildBackup(data, ['2030-01']).months)).toEqual([]);
  });
});
