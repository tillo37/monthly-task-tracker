import type { MonthData, TimeSession, TrackerData } from '../types';
import { currentMonthKey, dateKey, daysInMonth, parseMonthKey, type MonthKey } from './date';
import { DATA_VERSION } from './validation';

interface DemoTaskSpec {
  name: string;
  target: number;
  color: string;
  icon: string;
  /** Fraction of the target actually completed, used to spread demo ticks. */
  fill: number;
  /** Typical session length in minutes, varied slightly per day. */
  sessionMinutes: number;
  /** Local hour of day the demo sessions start at. */
  startHour: number;
}

const DEMO_TASKS: DemoTaskSpec[] = [
  { name: 'Gym', target: 20, color: '#6366f1', icon: 'dumbbell', fill: 0.75, sessionMinutes: 65, startHour: 7 },
  { name: 'Study', target: 22, color: '#0ea5e9', icon: 'brain', fill: 0.6, sessionMinutes: 90, startHour: 19 },
  { name: 'Korean', target: 15, color: '#14b8a6', icon: 'languages', fill: 1.2, sessionMinutes: 45, startHour: 21 },
  { name: 'Reading', target: 12, color: '#f97316', icon: 'bookOpen', fill: 0.42, sessionMinutes: 35, startHour: 22 },
];

/**
 * Deterministic fixture used by the demo mode and by tests. It is never written
 * to the user's real storage unless they explicitly load it.
 */
export function createDemoMonth(month: MonthKey): MonthData {
  const { year, month: monthNumber } = parseMonthKey(month);
  const total = daysInMonth(year, monthNumber);

  const sessions: TimeSession[] = [];

  const tasks = DEMO_TASKS.map((spec, taskIndex) => {
      const completions = Math.min(Math.round(spec.target * spec.fill), total);
      const step = total / Math.max(completions, 1);
      const completedDates = Array.from({ length: completions }, (_, index) => {
        const day = Math.min(total, Math.max(1, Math.round(index * step) + 1));
        return dateKey(year, monthNumber, day);
      });

      const id = `demo-${month}-${taskIndex}`;
      const uniqueDates = Array.from(new Set(completedDates)).sort();

      // Most completed days also carry a timed session, so the demo shows the
      // time tracker with believable data rather than an empty month.
      uniqueDates.forEach((date, index) => {
        if (index % 4 === 3) return;
        const day = Number(date.slice(8, 10));
        const minutes = spec.sessionMinutes + ((index * 7) % 25) - 12;
        const start = new Date(year, monthNumber - 1, day, spec.startHour, (index * 5) % 60, 0, 0);
        const end = new Date(start.getTime() + minutes * 60_000);

        sessions.push({
          id: `demo-session-${month}-${taskIndex}-${index}`,
          taskId: id,
          startTime: start.toISOString(),
          endTime: end.toISOString(),
          durationSeconds: minutes * 60,
          createdAt: end.toISOString(),
        });
      });

      return {
        id,
        name: spec.name,
        target: spec.target,
        color: spec.color,
        icon: spec.icon,
        completedDates: uniqueDates,
        createdAt: new Date(Date.UTC(year, monthNumber - 1, 1)).toISOString(),
      };
    });

  return {
    tasks,
    sessions: sessions.sort((a, b) => (a.startTime < b.startTime ? -1 : 1)),
  };
}

export function createDemoData(month: MonthKey = currentMonthKey()): TrackerData {
  return { version: DATA_VERSION, months: { [month]: createDemoMonth(month) } };
}
