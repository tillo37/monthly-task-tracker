import type { MonthData, TrackerData } from '../types';
import { currentMonthKey, dateKey, daysInMonth, parseMonthKey, type MonthKey } from './date';
import { DATA_VERSION } from './validation';

interface DemoTaskSpec {
  name: string;
  target: number;
  color: string;
  icon: string;
  /** Fraction of the target actually completed, used to spread demo ticks. */
  fill: number;
}

const DEMO_TASKS: DemoTaskSpec[] = [
  { name: 'Gym', target: 20, color: '#6366f1', icon: 'dumbbell', fill: 0.75 },
  { name: 'Study', target: 22, color: '#0ea5e9', icon: 'brain', fill: 0.6 },
  { name: 'Korean', target: 15, color: '#14b8a6', icon: 'languages', fill: 1.2 },
  { name: 'Reading', target: 12, color: '#f97316', icon: 'bookOpen', fill: 0.42 },
];

/**
 * Deterministic fixture used by the demo mode and by tests. It is never written
 * to the user's real storage unless they explicitly load it.
 */
export function createDemoMonth(month: MonthKey): MonthData {
  const { year, month: monthNumber } = parseMonthKey(month);
  const total = daysInMonth(year, monthNumber);

  return {
    tasks: DEMO_TASKS.map((spec, taskIndex) => {
      const completions = Math.min(Math.round(spec.target * spec.fill), total);
      const step = total / Math.max(completions, 1);
      const completedDates = Array.from({ length: completions }, (_, index) => {
        const day = Math.min(total, Math.max(1, Math.round(index * step) + 1));
        return dateKey(year, monthNumber, day);
      });

      return {
        id: `demo-${month}-${taskIndex}`,
        name: spec.name,
        target: spec.target,
        color: spec.color,
        icon: spec.icon,
        completedDates: Array.from(new Set(completedDates)).sort(),
        createdAt: new Date(Date.UTC(year, monthNumber - 1, 1)).toISOString(),
      };
    }),
  };
}

export function createDemoData(month: MonthKey = currentMonthKey()): TrackerData {
  return { version: DATA_VERSION, months: { [month]: createDemoMonth(month) } };
}
