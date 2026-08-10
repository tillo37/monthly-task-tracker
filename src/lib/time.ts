/**
 * Duration arithmetic and formatting for the time tracker.
 *
 * Sessions are persisted as ISO instants; everything here works in whole
 * seconds derived from them so a rounding choice is made once, in one place.
 */

/** Longest single session we accept — anything larger is a mistake, not a day. */
export const MAX_SESSION_SECONDS = 24 * 60 * 60;

/** Shortest session worth recording. */
export const MIN_SESSION_SECONDS = 1;

const HOUR = 3600;
const MINUTE = 60;

const pad2 = (value: number) => String(value).padStart(2, '0');

/** Whole seconds between two ISO instants, or `null` when either is unusable. */
export function durationBetween(startTime: string, endTime: string): number | null {
  const start = Date.parse(startTime);
  const end = Date.parse(endTime);
  if (Number.isNaN(start) || Number.isNaN(end)) return null;
  return Math.round((end - start) / 1000);
}

/** Shifts an ISO instant by whole seconds, keeping ISO output. */
export function addSeconds(iso: string, seconds: number): string {
  return new Date(Date.parse(iso) + seconds * 1000).toISOString();
}

/**
 * Human duration: `14h 35m`, `35m`, `45s`. Hours and minutes are shown
 * together; seconds only appear under a minute, where they are the whole story.
 */
export function formatDuration(seconds: number): string {
  const total = Math.max(0, Math.floor(seconds));
  if (total < MINUTE) return `${total}s`;

  const hours = Math.floor(total / HOUR);
  const minutes = Math.floor((total % HOUR) / MINUTE);
  if (hours === 0) return `${minutes}m`;
  return `${hours}h ${minutes}m`;
}

/** Like `formatDuration` but renders an explicit dash for nothing tracked. */
export function formatDurationOrDash(seconds: number): string {
  return seconds > 0 ? formatDuration(seconds) : '—';
}

/** Running-timer readout: `00:12:34`, counting hours without wrapping. */
export function formatClock(seconds: number): string {
  const total = Math.max(0, Math.floor(seconds));
  const hours = Math.floor(total / HOUR);
  const minutes = Math.floor((total % HOUR) / MINUTE);
  return `${pad2(hours)}:${pad2(minutes)}:${pad2(total % MINUTE)}`;
}

/** Spoken form for screen readers, e.g. `2 hours 5 minutes`. */
export function describeDuration(seconds: number): string {
  const total = Math.max(0, Math.floor(seconds));
  if (total < MINUTE) return `${total} second${total === 1 ? '' : 's'}`;

  const hours = Math.floor(total / HOUR);
  const minutes = Math.floor((total % HOUR) / MINUTE);
  const parts: string[] = [];
  if (hours > 0) parts.push(`${hours} hour${hours === 1 ? '' : 's'}`);
  if (minutes > 0) parts.push(`${minutes} minute${minutes === 1 ? '' : 's'}`);
  return parts.join(' ');
}

/** Local wall-clock time of an ISO instant, e.g. `14:35`. */
export function formatTimeOfDay(iso: string): string {
  const value = new Date(iso);
  if (Number.isNaN(value.getTime())) return '--:--';
  return `${pad2(value.getHours())}:${pad2(value.getMinutes())}`;
}

/** `14:35 → 16:10`, the range a session covers in local time. */
export function formatTimeRange(startTime: string, endTime: string): string {
  return `${formatTimeOfDay(startTime)} – ${formatTimeOfDay(endTime)}`;
}

/**
 * Builds an ISO instant from the local date/time pair used by the manual entry
 * form. Returns `null` for anything the calendar does not contain.
 */
export function localInstant(date: string, time: string): string | null {
  const dateMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  const timeMatch = /^(\d{1,2}):(\d{2})$/.exec(time);
  if (!dateMatch || !timeMatch) return null;

  const [year, month, day] = dateMatch.slice(1).map(Number);
  const [hours, minutes] = timeMatch.slice(1).map(Number);
  if (hours > 23 || minutes > 59) return null;

  const value = new Date(year, month - 1, day, hours, minutes, 0, 0);
  if (Number.isNaN(value.getTime())) return null;
  // Guard against a rolled-over date such as 31 February.
  if (value.getDate() !== day || value.getMonth() !== month - 1) return null;
  return value.toISOString();
}

/** Local `HH:MM` for an instant, in the shape `<input type="time">` expects. */
export function toTimeInputValue(iso: string): string {
  return formatTimeOfDay(iso);
}

/** Splits `2h 30m`-style user input into seconds. Accepts `90`, `1:30`, `1h30`. */
export function parseDurationInput(value: string): number | null {
  const text = value.trim().toLowerCase();
  if (!text) return null;

  const clock = /^(\d+):([0-5]\d)$/.exec(text);
  if (clock) return Number(clock[1]) * HOUR + Number(clock[2]) * MINUTE;

  const composite = /^(?:(\d+)\s*h)?\s*(?:(\d+)\s*m)?$/.exec(text);
  if (composite && (composite[1] || composite[2])) {
    return Number(composite[1] ?? 0) * HOUR + Number(composite[2] ?? 0) * MINUTE;
  }

  // A bare number is read as minutes, which is how people say it out loud.
  if (/^\d+$/.test(text)) return Number(text) * MINUTE;
  return null;
}
