import { describe, expect, it } from 'vitest';
import type { Task, TimeSession, TrackerData } from '../types';
import {
  buildReport,
  bucketUnitFor,
  getCompletionInRange,
  getSessionsInRange,
  getSlicesInRange,
  getTimeByDay,
  getTimeByMonth,
  getTimeByWeek,
  getTotalDuration,
  splitSessionByDay,
} from './reportEngine';
import { getWeekRange, periodForPreset, getReportRange } from './reportRange';
import { DATA_VERSION } from './validation';

// August 2026: the 10th is a Monday, so this week runs 10 → 16.
const MONDAY = '2026-08-10';
const WEDNESDAY = '2026-08-12';
const SUNDAY = '2026-08-16';
const THIS_WEEK = getWeekRange(MONDAY);
const LAST_WEEK = getWeekRange('2026-08-03');

/** Local wall-clock instant, so slices land on the day a user would expect. */
function at(date: string, hour: number, minute = 0): string {
  const [year, month, day] = date.split('-').map(Number);
  return new Date(year, month - 1, day, hour, minute, 0, 0).toISOString();
}

let sessionSeq = 0;

function session(
  taskId: string,
  date: string,
  hour: number,
  minutes: number,
  startMinute = 0,
): TimeSession {
  const startTime = at(date, hour, startMinute);
  const endTime = new Date(Date.parse(startTime) + minutes * 60_000).toISOString();
  sessionSeq += 1;
  return {
    id: `s${sessionSeq}`,
    taskId,
    startTime,
    endTime,
    durationSeconds: minutes * 60,
    createdAt: endTime,
  };
}

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

function trackerData(months: TrackerData['months']): TrackerData {
  return { version: DATA_VERSION, months };
}

describe('splitSessionByDay', () => {
  it('keeps a session inside one day as a single slice', () => {
    const slices = splitSessionByDay(session('gym', WEDNESDAY, 9, 90));
    expect(slices).toHaveLength(1);
    expect(slices[0]).toMatchObject({ date: WEDNESDAY, seconds: 5400 });
  });

  it('splits a session that crosses midnight across the two days', () => {
    // Sunday 23:30 → Monday 01:00: 30 minutes on Sunday, an hour on Monday.
    const slices = splitSessionByDay(session('gym', '2026-08-09', 23, 90, 30));
    expect(slices.map((slice) => [slice.date, slice.seconds])).toEqual([
      ['2026-08-09', 30 * 60],
      [MONDAY, 60 * 60],
    ]);
  });

  it('conserves the total duration when splitting', () => {
    const one = session('gym', '2026-08-09', 22, 200);
    expect(getTotalDuration(splitSessionByDay(one))).toBe(one.durationSeconds);
  });

  it('attributes a zero-length session to its start day', () => {
    const zero = { ...session('gym', WEDNESDAY, 9, 0), durationSeconds: 0 };
    expect(splitSessionByDay(zero)).toEqual([
      expect.objectContaining({ date: WEDNESDAY, seconds: 0 }),
    ]);
  });
});

describe('range filtering', () => {
  const sessions = [
    session('gym', MONDAY, 7, 60), // first day of the week
    session('gym', SUNDAY, 20, 30), // last day of the week
    session('gym', '2026-08-09', 10, 60), // the Sunday before — outside
    session('gym', '2026-08-17', 10, 60), // the Monday after — outside
  ];

  it('includes a session on the first day of the week', () => {
    expect(getSessionsInRange(sessions, THIS_WEEK).map((s) => s.id)).toContain(sessions[0].id);
  });

  it('includes a session on the last day of the week', () => {
    expect(getSessionsInRange(sessions, THIS_WEEK).map((s) => s.id)).toContain(sessions[1].id);
  });

  it('excludes sessions outside the week on either side', () => {
    const ids = getSessionsInRange(sessions, THIS_WEEK).map((s) => s.id);
    expect(ids).not.toContain(sessions[2].id);
    expect(ids).not.toContain(sessions[3].id);
    expect(ids).toHaveLength(2);
  });

  it('counts only the in-range portion of a session crossing the week boundary', () => {
    // Sunday 23:30 → Monday 01:00, straddling the start of the week.
    const crossing = [session('gym', '2026-08-09', 23, 90, 30)];
    expect(getTotalDuration(getSlicesInRange(crossing, THIS_WEEK))).toBe(60 * 60);
    expect(getTotalDuration(getSlicesInRange(crossing, LAST_WEEK))).toBe(30 * 60);
  });
});

describe('bucketing', () => {
  it('zero-fills every day of the range', () => {
    const byDay = getTimeByDay(getSlicesInRange([session('gym', WEDNESDAY, 9, 60)], THIS_WEEK), THIS_WEEK);

    expect(Object.keys(byDay)).toEqual([
      MONDAY,
      '2026-08-11',
      WEDNESDAY,
      '2026-08-13',
      '2026-08-14',
      '2026-08-15',
      SUNDAY,
    ]);
    expect(byDay[WEDNESDAY]).toBe(3600);
    expect(byDay[MONDAY]).toBe(0);
    expect(byDay[SUNDAY]).toBe(0);
  });

  it('groups by week and by month', () => {
    const range = { start: '2026-08-01', end: '2026-09-30' };
    const slices = getSlicesInRange(
      [session('gym', MONDAY, 9, 60), session('gym', '2026-09-02', 9, 30)],
      range,
    );

    expect(getTimeByWeek(slices, range)[MONDAY]).toBe(3600);
    expect(getTimeByMonth(slices, range)).toEqual({ '2026-08': 3600, '2026-09': 1800 });
  });

  it('picks a granularity that stays readable', () => {
    expect(bucketUnitFor(THIS_WEEK)).toBe('day');
    expect(bucketUnitFor({ start: '2026-08-01', end: '2026-08-31' })).toBe('day');
    expect(bucketUnitFor({ start: '2026-06-01', end: '2026-08-31' })).toBe('week');
    expect(bucketUnitFor({ start: '2026-01-01', end: '2026-12-31' })).toBe('month');
  });
});

describe('getCompletionInRange', () => {
  it('counts only completions inside the range', () => {
    const korean = task({
      name: 'Korean',
      target: 20,
      completedDates: ['2026-08-03', MONDAY, '2026-08-11', WEDNESDAY, SUNDAY, '2026-08-20'],
    });

    expect(getCompletionInRange([korean], THIS_WEEK).get('Korean')).toBe(4);
    expect(getCompletionInRange([korean], LAST_WEEK).get('Korean')).toBe(1);
  });
});

describe('buildReport for a week', () => {
  const data = trackerData({
    '2026-08': {
      tasks: [
        task({
          name: 'Korean',
          target: 20,
          // 15 completions in August, four of them inside this week.
          completedDates: [
            '2026-08-01',
            '2026-08-02',
            '2026-08-03',
            '2026-08-04',
            '2026-08-05',
            '2026-08-06',
            '2026-08-07',
            '2026-08-08',
            '2026-08-09',
            MONDAY,
            '2026-08-11',
            WEDNESDAY,
            SUNDAY,
            '2026-08-20',
            '2026-08-21',
          ],
        }),
        task({ name: 'Gym', target: 12, completedDates: [MONDAY, '2026-08-15'] }),
        task({ name: 'Reading', target: 10 }),
      ],
      sessions: [
        session('Korean', MONDAY, 19, 130), // 2h 10m
        session('Korean', WEDNESDAY, 19, 165), // 2h 45m
        session('Korean', '2026-08-15', 19, 170), // 2h 50m — Saturday
        session('Gym', '2026-08-11', 7, 65), // 1h 05m
        session('Gym', '2026-08-14', 7, 92), // 1h 32m
        session('Korean', SUNDAY, 21, 35), // 35m
        session('Korean', '2026-08-03', 19, 300), // last week — must not count
        session('Gym', '2026-08-20', 7, 60), // after the week — must not count
      ],
    },
  });

  const report = buildReport(data, THIS_WEEK, WEDNESDAY);

  it('reports the selected range and exactly seven days', () => {
    expect(report.range).toEqual({ start: MONDAY, end: SUNDAY });
    expect(report.dayCount).toBe(7);
    expect(report.buckets).toHaveLength(7);
    expect(report.bucketUnit).toBe('day');
  });

  it('labels the seven buckets Monday to Sunday, including empty days', () => {
    expect(report.buckets.map((bucket) => `${bucket.label} ${bucket.sublabel}`)).toEqual([
      'Mon 10',
      'Tue 11',
      'Wed 12',
      'Thu 13',
      'Fri 14',
      'Sat 15',
      'Sun 16',
    ]);
    // Thursday has no sessions but is still a bucket.
    expect(report.buckets[3].seconds).toBe(0);
  });

  it('totals only the sessions inside the week', () => {
    const expected = (130 + 165 + 170 + 65 + 92 + 35) * 60;
    expect(report.totalSeconds).toBe(expected);
    expect(report.sessionCount).toBe(6);
  });

  it('averages over all seven calendar days, not just active ones', () => {
    expect(report.averageSecondsPerDay).toBe(Math.round(report.totalSeconds / 7));
    // Five of the seven days have time; dividing by five would be larger.
    expect(report.averageSecondsPerDay).toBeLessThan(Math.round(report.totalSeconds / 5));
  });

  it('finds the busiest day', () => {
    expect(report.busiestDays).toEqual([{ date: '2026-08-15', seconds: 170 * 60 }]);
  });

  it('breaks time down per task, ranked, for the week only', () => {
    expect(report.tasks.map((row) => [row.name, row.totalSeconds, row.sessionCount])).toEqual([
      ['Korean', (130 + 165 + 170 + 35) * 60, 4],
      ['Gym', (65 + 92) * 60, 2],
      ['Reading', 0, 0],
    ]);
  });

  it('counts completions inside the week, not the whole month', () => {
    const korean = report.tasks.find((row) => row.name === 'Korean');
    expect(korean?.doneInPeriod).toBe(4);
    expect(korean?.monthlyTarget).toBe(20);
    expect(korean?.periodCompletion).toBe(20);
  });

  it('keeps the monthly target unscaled', () => {
    expect(report.tasks.find((row) => row.name === 'Gym')?.monthlyTarget).toBe(12);
    expect(report.totals.monthlyTarget).toBe(42);
    // Korean four, Gym two — completions inside the week only.
    expect(report.totals.doneInPeriod).toBe(6);
  });

  it('marks today among the buckets', () => {
    expect(report.buckets.filter((bucket) => bucket.isToday).map((b) => b.key)).toEqual([
      WEDNESDAY,
    ]);
  });
});

describe('buildReport edge cases', () => {
  it('handles a tie for the busiest day', () => {
    const data = trackerData({
      '2026-08': {
        tasks: [task({ name: 'Gym', target: 10 })],
        sessions: [session('Gym', MONDAY, 7, 60), session('Gym', WEDNESDAY, 7, 60)],
      },
    });

    const report = buildReport(data, THIS_WEEK, WEDNESDAY);
    expect(report.busiestDays).toEqual([
      { date: MONDAY, seconds: 3600 },
      { date: WEDNESDAY, seconds: 3600 },
    ]);
  });

  it('reports an empty week without dividing by zero', () => {
    const data = trackerData({
      '2026-08': { tasks: [task({ name: 'Gym', target: 10 })], sessions: [] },
    });

    const report = buildReport(data, THIS_WEEK, WEDNESDAY);
    expect(report.totalSeconds).toBe(0);
    expect(report.averageSecondsPerDay).toBe(0);
    expect(report.averageSessionSeconds).toBe(0);
    expect(report.busiestDays).toEqual([]);
    expect(report.buckets).toHaveLength(7);
  });

  it('splits a week-boundary session into the right week', () => {
    // Sunday 23:30 → Monday 01:00 sits in last week's data but spans both weeks.
    const data = trackerData({
      '2026-08': {
        tasks: [task({ name: 'Gym', target: 10 })],
        sessions: [session('Gym', '2026-08-09', 23, 90, 30)],
      },
    });

    expect(buildReport(data, THIS_WEEK, WEDNESDAY).totalSeconds).toBe(3600);
    expect(buildReport(data, LAST_WEEK, WEDNESDAY).totalSeconds).toBe(1800);
    expect(buildReport(data, THIS_WEEK, WEDNESDAY).byDay[MONDAY]).toBe(3600);
  });

  it('finds a slice spilling in from the previous month', () => {
    // 31 August 23:00 → 1 September 00:30 is stored under August.
    const data = trackerData({
      '2026-08': {
        tasks: [task({ name: 'Gym', target: 10 })],
        sessions: [session('Gym', '2026-08-31', 23, 90)],
      },
      '2026-09': { tasks: [task({ name: 'Gym', id: 'gym-sep', target: 10 })], sessions: [] },
    });

    const september = buildReport(data, getReportRange(periodForPreset('thisMonth', '2026-09-10')));
    expect(september.totalSeconds).toBe(30 * 60);
  });

  it('merges the same task across months by name', () => {
    const data = trackerData({
      '2026-08': {
        tasks: [task({ name: 'Korean', id: 'aug', target: 20, completedDates: ['2026-08-31'] })],
        sessions: [session('aug', '2026-08-31', 9, 60)],
      },
      '2026-09': {
        tasks: [task({ name: 'Korean', id: 'sep', target: 20, completedDates: ['2026-09-01'] })],
        sessions: [session('sep', '2026-09-01', 9, 30)],
      },
    });

    const report = buildReport(data, { start: '2026-08-01', end: '2026-09-30' }, '2026-09-10');
    expect(report.tasks).toHaveLength(1);
    expect(report.tasks[0]).toMatchObject({
      name: 'Korean',
      totalSeconds: 90 * 60,
      sessionCount: 2,
      doneInPeriod: 2,
      // Two months covered, so two monthly targets.
      monthlyTarget: 40,
    });
    expect(report.monthCount).toBe(2);
  });

  it('excludes sessions whose task is gone and reports them separately', () => {
    const data = trackerData({
      '2026-08': {
        tasks: [task({ name: 'Gym', target: 10 })],
        sessions: [session('Gym', MONDAY, 7, 60), session('deleted', WEDNESDAY, 7, 60)],
      },
    });

    const report = buildReport(data, THIS_WEEK, WEDNESDAY);
    expect(report.totalSeconds).toBe(3600);
    expect(report.sessionCount).toBe(1);
    expect(report.orphanSessionCount).toBe(1);
  });

  it('still produces a correct monthly report', () => {
    const data = trackerData({
      '2026-08': {
        tasks: [task({ name: 'Gym', target: 12, completedDates: [MONDAY, '2026-08-20'] })],
        sessions: [session('Gym', MONDAY, 7, 60), session('Gym', '2026-08-20', 7, 30)],
      },
    });

    const report = buildReport(
      data,
      getReportRange(periodForPreset('thisMonth', WEDNESDAY)),
      WEDNESDAY,
    );
    expect(report.dayCount).toBe(31);
    expect(report.buckets).toHaveLength(31);
    expect(report.totalSeconds).toBe(90 * 60);
    expect(report.tasks[0].doneInPeriod).toBe(2);
    expect(report.averageSecondsPerDay).toBe(Math.round((90 * 60) / 31));
  });

  it('produces a yearly report bucketed by month', () => {
    const data = trackerData({
      '2026-08': {
        tasks: [task({ name: 'Gym', target: 12 })],
        sessions: [session('Gym', MONDAY, 7, 60)],
      },
    });

    const report = buildReport(
      data,
      getReportRange(periodForPreset('thisYear', WEDNESDAY)),
      WEDNESDAY,
    );
    expect(report.bucketUnit).toBe('month');
    expect(report.buckets).toHaveLength(12);
    expect(report.dayCount).toBe(365);
    expect(report.totalSeconds).toBe(3600);
  });

  it('produces a single-day report', () => {
    const data = trackerData({
      '2026-08': {
        tasks: [task({ name: 'Gym', target: 12, completedDates: [WEDNESDAY] })],
        sessions: [session('Gym', WEDNESDAY, 7, 45), session('Gym', MONDAY, 7, 45)],
      },
    });

    const report = buildReport(data, { start: WEDNESDAY, end: WEDNESDAY }, WEDNESDAY);
    expect(report.dayCount).toBe(1);
    expect(report.buckets).toHaveLength(1);
    expect(report.totalSeconds).toBe(45 * 60);
    expect(report.averageSecondsPerDay).toBe(45 * 60);
    expect(report.tasks[0].doneInPeriod).toBe(1);
  });
});
