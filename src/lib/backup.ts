import type { TrackerData } from '../types';
import type { MonthKey } from './date';
import { DATA_VERSION } from './validation';

/** The exported document shape — plain JSON, no app-internal fields. */
export function buildBackup(data: TrackerData, months?: MonthKey[]): TrackerData {
  if (!months) return { version: DATA_VERSION, months: data.months };

  const selected: TrackerData['months'] = {};
  for (const key of months) {
    if (data.months[key]) selected[key] = data.months[key];
  }
  return { version: DATA_VERSION, months: selected };
}

export function backupFilename(month?: MonthKey): string {
  const stamp = new Date().toISOString().slice(0, 10);
  return month
    ? `monthly-task-tracker-${month}-${stamp}.json`
    : `monthly-task-tracker-all-${stamp}.json`;
}

/** Triggers a browser download of the given data as pretty-printed JSON. */
export function downloadJson(filename: string, data: unknown): void {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
