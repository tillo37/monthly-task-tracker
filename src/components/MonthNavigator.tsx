import { CalendarDays, ChevronLeft, ChevronRight } from 'lucide-react';
import {
  currentMonthKey,
  monthKey,
  monthLabel,
  monthNames,
  parseMonthKey,
  type MonthKey,
} from '../lib/date';

interface MonthNavigatorProps {
  month: MonthKey;
  onPrevious: () => void;
  onNext: () => void;
  onToday: () => void;
  onSelect: (month: MonthKey) => void;
}

const YEAR_SPAN = 5;

export function MonthNavigator({
  month,
  onPrevious,
  onNext,
  onToday,
  onSelect,
}: MonthNavigatorProps) {
  const { year, month: monthNumber } = parseMonthKey(month);
  const isCurrent = month === currentMonthKey();

  const thisYear = parseMonthKey(currentMonthKey()).year;
  const years = Array.from(
    new Set([
      ...Array.from({ length: YEAR_SPAN * 2 + 1 }, (_, index) => thisYear - YEAR_SPAN + index),
      year,
    ]),
  ).sort((a, b) => a - b);

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={onPrevious}
          className="btn btn-icon btn-subtle"
          aria-label="Previous month"
        >
          <ChevronLeft className="h-4 w-4" aria-hidden="true" />
        </button>
        <button
          type="button"
          onClick={onNext}
          className="btn btn-icon btn-subtle"
          aria-label="Next month"
        >
          <ChevronRight className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>

      <h1 className="min-w-0 text-xl font-semibold tracking-tight sm:text-2xl" aria-live="polite">
        {monthLabel(month)}
      </h1>

      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={onToday}
          disabled={isCurrent}
          className="btn btn-md btn-subtle"
          aria-label="Go to the current month"
        >
          <CalendarDays className="h-4 w-4" aria-hidden="true" />
          Today
        </button>

        <label className="sr-only" htmlFor="month-select">
          Month
        </label>
        <select
          id="month-select"
          className="field h-9 w-auto py-0"
          value={monthNumber}
          onChange={(event) => onSelect(monthKey(year, Number(event.target.value)))}
        >
          {monthNames().map((name, index) => (
            <option key={name} value={index + 1}>
              {name}
            </option>
          ))}
        </select>

        <label className="sr-only" htmlFor="year-select">
          Year
        </label>
        <select
          id="year-select"
          className="field h-9 w-auto py-0"
          value={year}
          onChange={(event) => onSelect(monthKey(Number(event.target.value), monthNumber))}
        >
          {years.map((value) => (
            <option key={value} value={value}>
              {value}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}
