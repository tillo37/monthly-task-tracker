/**
 * The report engine.
 *
 * One pipeline serves every period — daily, weekly, monthly, yearly, custom —
 * because every report is just an inclusive day range. Nothing here knows about
 * React, and nothing here re-derives a date boundary that `reportRange` already
 * owns.
 *
 * The atomic unit is a *day slice*: the portion of one session that falls on one
 * calendar day. A session running 23:30 → 01:30 becomes 30 minutes on the first
 * day and 60 on the next, so a weekly report attributes each portion to the
 * correct day even when the crossing lands on the week boundary.
 */

import type { MonthData, Task, TimeSession, TrackerData } from '../types';
import {
  addDays,
  compactDayLabel,
  datesBetween,
  daysBetween,
  monthKeyOfDate,
  monthKeysBetween,
  monthLabel,
  startOfDay,
  todayKey,
  weekdayShortName,
  type DateKey,
  type MonthKey,
} from './date';
import {
  getStartOfWeek,
  rangeDayCount,
  type DateRange,
} from './reportRange';

/** The part of one session that belongs to one calendar day. */
export interface DaySlice {
  date: DateKey;
  seconds: number;
  sessionId: string;
  taskId: string;
  /** Month the session is stored under, so the task can be resolved. */
  month: MonthKey;
}

/** A task as it appears in a report, merged across the months in range. */
export interface ReportTaskRow {
  /** Stable across months: tasks are matched by name. */
  key: string;
  name: string;
  color: string;
  icon: string;
  /** Sum of the monthly targets of the months this task appears in. */
  monthlyTarget: number;
  /** How many months contributed a target, so the label can stay honest. */
  targetMonths: number;
  /** Completions ticked inside the selected range — never the whole month. */
  doneInPeriod: number;
  /** `doneInPeriod / monthlyTarget * 100`. */
  periodCompletion: number;
  totalSeconds: number;
  sessionCount: number;
  averageSeconds: number;
  /** Time per completion inside the period. */
  secondsPerCompletion: number;
}

/** One bar of the activity chart. */
export interface ReportBucket {
  key: string;
  /** Primary axis label, e.g. `Mon` or `Aug`. */
  label: string;
  /** Secondary axis label, e.g. `10`. */
  sublabel?: string;
  /** Full description for tooltips and the screen-reader table. */
  title: string;
  seconds: number;
  isToday: boolean;
  isWeekend: boolean;
}

export type BucketUnit = 'day' | 'week' | 'month';

export interface Report {
  range: DateRange;
  dayCount: number;
  totalSeconds: number;
  sessionCount: number;
  /** Total divided by every calendar day in the range, including empty ones. */
  averageSecondsPerDay: number;
  averageSessionSeconds: number;
  /** All days tied for the highest total; empty when nothing was tracked. */
  busiestDays: { date: DateKey; seconds: number }[];
  /** Ranked by time spent, descending. */
  tasks: ReportTaskRow[];
  buckets: ReportBucket[];
  bucketUnit: BucketUnit;
  /** Seconds per day for the whole range, zero-filled. */
  byDay: Record<DateKey, number>;
  totals: { monthlyTarget: number; doneInPeriod: number; periodCompletion: number };
  /** Months the range touches. */
  monthCount: number;
  /** Most months any one task drew a target from; 1 keeps the label monthly. */
  targetMonthSpan: number;
  /** Sessions in range whose task no longer exists. */
  orphanSessionCount: number;
}

/** Groups tasks across months by name; the display name keeps its original case. */
export function taskKey(name: string): string {
  return name.trim().toLowerCase();
}

/**
 * Splits one session into per-day portions. Uses local midnights, because the
 * day a session belongs to is the day the user lived through.
 */
export function splitSessionByDay(session: TimeSession): DaySlice[] {
  const start = Date.parse(session.startTime);
  const end = Date.parse(session.endTime);
  if (Number.isNaN(start) || Number.isNaN(end) || end <= start) {
    // A zero-length or unreadable session still belongs to its start day.
    const date = Number.isNaN(start) ? null : todayKey(new Date(start));
    return date
      ? [
          {
            date,
            seconds: Math.max(0, Math.round(session.durationSeconds)),
            sessionId: session.id,
            taskId: session.taskId,
            month: monthKeyOfDate(date),
          },
        ]
      : [];
  }

  const slices: DaySlice[] = [];
  let day = todayKey(new Date(start));
  let cursor = start;

  // Sessions are capped at 24 hours, so this runs at most twice; the guard is
  // there so malformed data can never spin.
  for (let guard = 0; guard < 32 && cursor < end; guard += 1) {
    const nextMidnight = startOfDay(addDays(day, 1)).getTime();
    const sliceEnd = Math.min(end, nextMidnight);
    const seconds = Math.round((sliceEnd - cursor) / 1000);
    if (seconds > 0) {
      slices.push({
        date: day,
        seconds,
        sessionId: session.id,
        taskId: session.taskId,
        month: monthKeyOfDate(day),
      });
    }
    cursor = sliceEnd;
    day = addDays(day, 1);
  }

  return slices;
}

/** Sessions that overlap the range at all, from every month the range touches. */
export function getSessionsInRange(sessions: TimeSession[], range: DateRange): TimeSession[] {
  return sessions.filter((session) =>
    splitSessionByDay(session).some((slice) => slice.date >= range.start && slice.date <= range.end),
  );
}

/** Day slices that fall inside the range, from the months given. */
export function getSlicesInRange(sessions: TimeSession[], range: DateRange): DaySlice[] {
  return sessions
    .flatMap(splitSessionByDay)
    .filter((slice) => slice.date >= range.start && slice.date <= range.end);
}

export function getTotalDuration(slices: DaySlice[]): number {
  return slices.reduce((total, slice) => total + slice.seconds, 0);
}

/** Seconds per `taskId` (still per-month ids; callers merge by task key). */
export function getTimeByTask(slices: DaySlice[]): Map<string, number> {
  const totals = new Map<string, number>();
  for (const slice of slices) {
    totals.set(slice.taskId, (totals.get(slice.taskId) ?? 0) + slice.seconds);
  }
  return totals;
}

/** Seconds per day across the whole range, zero-filled so no day is missing. */
export function getTimeByDay(slices: DaySlice[], range: DateRange): Record<DateKey, number> {
  const byDay: Record<DateKey, number> = {};
  for (const date of datesBetween(range.start, range.end)) byDay[date] = 0;
  for (const slice of slices) {
    if (slice.date in byDay) byDay[slice.date] += slice.seconds;
  }
  return byDay;
}

/** Seconds per calendar week, keyed by the week's Monday. Zero-filled. */
export function getTimeByWeek(slices: DaySlice[], range: DateRange): Record<DateKey, number> {
  const byWeek: Record<DateKey, number> = {};
  for (let monday = getStartOfWeek(range.start); monday <= range.end; monday = addDays(monday, 7)) {
    byWeek[monday] = 0;
  }
  for (const slice of slices) {
    const monday = getStartOfWeek(slice.date);
    if (monday in byWeek) byWeek[monday] += slice.seconds;
  }
  return byWeek;
}

/** Seconds per calendar month, keyed by `YYYY-MM`. Zero-filled. */
export function getTimeByMonth(slices: DaySlice[], range: DateRange): Record<MonthKey, number> {
  const byMonth: Record<MonthKey, number> = {};
  for (const month of monthKeysBetween(range.start, range.end)) byMonth[month] = 0;
  for (const slice of slices) {
    const month = monthKeyOfDate(slice.date);
    if (month in byMonth) byMonth[month] += slice.seconds;
  }
  return byMonth;
}

/** Completions ticked inside the range, counted per task id. */
export function getCompletionInRange(tasks: Task[], range: DateRange): Map<string, number> {
  const counts = new Map<string, number>();
  for (const task of tasks) {
    const inRange = task.completedDates.filter((date) => date >= range.start && date <= range.end);
    counts.set(task.id, inRange.length);
  }
  return counts;
}

/**
 * Chart granularity. Days stay readable up to about two months; past that the
 * bars would be hairlines, so the range is grouped into weeks and then months.
 */
export function bucketUnitFor(range: DateRange): BucketUnit {
  const days = rangeDayCount(range);
  if (days <= 62) return 'day';
  if (days <= 120) return 'week';
  return 'month';
}

function dayBuckets(
  byDay: Record<DateKey, number>,
  range: DateRange,
  today: DateKey,
): ReportBucket[] {
  const dates = datesBetween(range.start, range.end);
  // A week of bars has room for the weekday name; a month of bars does not.
  const dense = dates.length > 14;

  return dates.map((date) => {
    const weekday = weekdayShortName(date);
    const dayNumber = Number(date.slice(8, 10));
    return {
      key: date,
      label: dense ? String(dayNumber) : weekday,
      sublabel: dense ? undefined : String(dayNumber),
      title: `${weekday} ${compactDayLabel(date)}`,
      seconds: byDay[date] ?? 0,
      isToday: date === today,
      isWeekend: weekday === 'Sat' || weekday === 'Sun',
    };
  });
}

/** The months a report's sessions can live in: a slice may come from the day before. */
function monthsToScan(range: DateRange): MonthKey[] {
  return monthKeysBetween(addDays(range.start, -1), range.end);
}

const emptyMonth = (): MonthData => ({ tasks: [], sessions: [] });

/**
 * Builds a complete report for a range.
 *
 * Tasks are per-month in this app, so a range spanning months merges them by
 * name: one row per task, with the monthly targets of the covered months summed.
 * The target therefore stays a *monthly* figure while `doneInPeriod` counts only
 * the selected range — the two must never be conflated.
 */
export function buildReport(
  data: TrackerData,
  range: DateRange,
  today: DateKey = todayKey(),
): Report {
  const months = monthKeysBetween(range.start, range.end);
  const scanned = monthsToScan(range);

  // Sessions of a month can spill one day into the next, so scan a month early.
  const sessions = scanned.flatMap((month) => (data.months[month] ?? emptyMonth()).sessions);
  const allSlices = getSlicesInRange(sessions, range);

  // Rows are keyed by task name so the same habit tracked in two months is one
  // row, and so a slice spilling in from the previous month still finds its task.
  const rows = new Map<string, ReportTaskRow>();
  for (const month of months) {
    const monthData = data.months[month] ?? emptyMonth();
    const completions = getCompletionInRange(monthData.tasks, range);

    for (const task of monthData.tasks) {
      const key = taskKey(task.name);
      const row: ReportTaskRow = rows.get(key) ?? {
        key,
        name: task.name,
        color: task.color,
        icon: task.icon,
        monthlyTarget: 0,
        targetMonths: 0,
        doneInPeriod: 0,
        periodCompletion: 0,
        totalSeconds: 0,
        sessionCount: 0,
        averageSeconds: 0,
        secondsPerCompletion: 0,
      };

      // The later month wins for appearance, so a recoloured task looks current.
      row.name = task.name;
      row.color = task.color;
      row.icon = task.icon;
      row.monthlyTarget += task.target;
      row.targetMonths += 1;
      row.doneInPeriod += completions.get(task.id) ?? 0;
      rows.set(key, row);
    }
  }

  // Task ids are per-month, so resolve every id seen in the scanned window.
  const keyByTaskId = new Map<string, string>();
  for (const month of scanned) {
    for (const task of (data.months[month] ?? emptyMonth()).tasks) {
      keyByTaskId.set(task.id, taskKey(task.name));
    }
  }

  // A slice counts only if its task still exists in the report; anything else is
  // an orphan and is kept out of every total.
  const slices: DaySlice[] = [];
  const orphanSlices: DaySlice[] = [];
  const sessionIdsByRow = new Map<string, Set<string>>();

  for (const slice of allSlices) {
    const key = keyByTaskId.get(slice.taskId);
    const row = key ? rows.get(key) : undefined;
    if (!row || !key) {
      orphanSlices.push(slice);
      continue;
    }

    slices.push(slice);
    row.totalSeconds += slice.seconds;
    const seen = sessionIdsByRow.get(key) ?? new Set<string>();
    seen.add(slice.sessionId);
    sessionIdsByRow.set(key, seen);
  }

  for (const row of rows.values()) {
    row.sessionCount = sessionIdsByRow.get(row.key)?.size ?? 0;
    row.periodCompletion =
      row.monthlyTarget > 0 ? (row.doneInPeriod / row.monthlyTarget) * 100 : 0;
    row.averageSeconds =
      row.sessionCount > 0 ? Math.round(row.totalSeconds / row.sessionCount) : 0;
    row.secondsPerCompletion =
      row.doneInPeriod > 0 ? Math.round(row.totalSeconds / row.doneInPeriod) : 0;
  }

  const totalSeconds = getTotalDuration(slices);
  const orphanSessionCount = new Set(orphanSlices.map((slice) => slice.sessionId)).size;

  const byDay = getTimeByDay(slices, range);
  const bucketUnit = bucketUnitFor(range);
  const buckets =
    bucketUnit === 'day'
      ? dayBuckets(byDay, range, today)
      : bucketUnit === 'week'
        ? Object.entries(getTimeByWeek(slices, range)).map(([monday, seconds]) => ({
            key: monday,
            label: compactDayLabel(monday),
            title: `Week of ${compactDayLabel(monday)}`,
            seconds,
            isToday: getStartOfWeek(today) === monday,
            isWeekend: false,
          }))
        : Object.entries(getTimeByMonth(slices, range)).map(([month, seconds]) => ({
            key: month,
            label: monthLabel(month).slice(0, 3),
            sublabel: month.slice(2, 4),
            title: monthLabel(month),
            seconds,
            isToday: monthKeyOfDate(today) === month,
            isWeekend: false,
          }));

  let busiestSeconds = 0;
  for (const seconds of Object.values(byDay)) busiestSeconds = Math.max(busiestSeconds, seconds);
  const busiestDays =
    busiestSeconds > 0
      ? Object.entries(byDay)
          .filter(([, seconds]) => seconds === busiestSeconds)
          .map(([date, seconds]) => ({ date, seconds }))
          .sort((a, b) => (a.date < b.date ? -1 : 1))
      : [];

  const sessionCount = new Set(slices.map((slice) => slice.sessionId)).size;
  const dayCount = daysBetween(range.start, range.end) + 1;
  const tasks = [...rows.values()].sort((a, b) => b.totalSeconds - a.totalSeconds);

  return {
    range,
    dayCount,
    totalSeconds,
    sessionCount,
    averageSecondsPerDay: dayCount > 0 ? Math.round(totalSeconds / dayCount) : 0,
    averageSessionSeconds: sessionCount > 0 ? Math.round(totalSeconds / sessionCount) : 0,
    busiestDays,
    tasks,
    buckets,
    bucketUnit,
    byDay,
    totals: {
      monthlyTarget: tasks.reduce((sum, row) => sum + row.monthlyTarget, 0),
      doneInPeriod: tasks.reduce((sum, row) => sum + row.doneInPeriod, 0),
      periodCompletion: (() => {
        const target = tasks.reduce((sum, row) => sum + row.monthlyTarget, 0);
        const done = tasks.reduce((sum, row) => sum + row.doneInPeriod, 0);
        return target > 0 ? (done / target) * 100 : 0;
      })(),
    },
    monthCount: months.length,
    targetMonthSpan: tasks.reduce((most, row) => Math.max(most, row.targetMonths), 1),
    orphanSessionCount,
  };
}
