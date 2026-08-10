import { ChevronLeft, ChevronRight, CalendarRange } from 'lucide-react';
import { todayKey, type DateKey } from '../../lib/date';
import {
  PRESET_LABELS,
  PRESET_ORDER,
  getReportRange,
  periodForPreset,
  presetOf,
  rangeLabel,
  shiftPeriod,
  stepLabel,
  type ReportPeriod,
  type ReportPreset,
} from '../../lib/reportRange';

interface ReportPeriodPickerProps {
  period: ReportPeriod;
  onChange: (period: ReportPeriod) => void;
  today?: DateKey;
}

/**
 * Period selector with previous/next stepping.
 *
 * Stepping moves by one unit of whatever is selected — a day, a calendar week, a
 * month, a year, or the length of a custom range — and is independent of the
 * tracker's month navigation, so browsing reports never moves the task grid.
 */
export function ReportPeriodPicker({
  period,
  onChange,
  today = todayKey(),
}: ReportPeriodPickerProps) {
  const range = getReportRange(period);
  const preset = presetOf(period, today);
  // Once stepped off a named preset, the dropdown must say where we actually are.
  const stepped = preset === null;

  const selectPreset = (value: string) => {
    if (value === 'stepped') return;
    onChange(periodForPreset(value as ReportPreset, today, period.custom));
  };

  const setCustomEnd = (which: 'start' | 'end', value: DateKey) => {
    if (!value) return;
    onChange({
      kind: 'custom',
      anchor: period.anchor,
      custom: { ...(period.custom ?? range), [which]: value },
    });
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="flex items-center gap-1">
        <button
          type="button"
          className="btn btn-icon btn-subtle"
          aria-label="Previous period"
          onClick={() => onChange(shiftPeriod(period, -1))}
        >
          <ChevronLeft className="h-4 w-4" aria-hidden="true" />
        </button>
        <button
          type="button"
          className="btn btn-icon btn-subtle"
          aria-label="Next period"
          onClick={() => onChange(shiftPeriod(period, 1))}
        >
          <ChevronRight className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>

      <label className="sr-only" htmlFor="report-period">
        Report period
      </label>
      <select
        id="report-period"
        className="field h-9 w-auto py-0 font-medium"
        value={stepped ? 'stepped' : preset}
        onChange={(event) => selectPreset(event.target.value)}
      >
        {stepped && <option value="stepped">{stepLabel(period)}</option>}
        {PRESET_ORDER.map((value) => (
          <option key={value} value={value}>
            {PRESET_LABELS[value]}
          </option>
        ))}
      </select>

      {preset !== 'thisWeek' && preset !== 'thisMonth' && (
        <button
          type="button"
          className="btn btn-md btn-subtle"
          onClick={() => onChange(periodForPreset('thisWeek', today))}
          aria-label="Jump to the current week"
        >
          <CalendarRange className="h-4 w-4" aria-hidden="true" />
          This week
        </button>
      )}

      {period.kind === 'custom' && (
        <div className="flex items-center gap-1.5">
          <label className="sr-only" htmlFor="report-from">
            From
          </label>
          <input
            id="report-from"
            type="date"
            className="field h-9 w-auto py-0"
            value={range.start}
            onChange={(event) => setCustomEnd('start', event.target.value)}
          />
          <span aria-hidden="true" className="text-slate-400 dark:text-slate-500">
            →
          </span>
          <label className="sr-only" htmlFor="report-to">
            To
          </label>
          <input
            id="report-to"
            type="date"
            className="field h-9 w-auto py-0"
            value={range.end}
            onChange={(event) => setCustomEnd('end', event.target.value)}
          />
        </div>
      )}

      <p className="text-sm font-medium text-slate-600 tabular-nums dark:text-slate-300">
        {rangeLabel(range)}
      </p>
    </div>
  );
}
