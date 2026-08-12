import type { UserRole } from '../types/database';

/**
 * Presentation for the Admin Panel. Pure functions only — nothing here decides
 * what an administrator may do, it only decides how the answer reads.
 */

export const ROLE_LABELS: Record<UserRole, string> = {
  user: 'User',
  admin: 'Admin',
};

/** Audit actions, rendered as sentences rather than as their database keys. */
export const AUDIT_ACTION_LABELS: Record<string, string> = {
  'admin.session_opened': 'Opened the admin panel',
  'role.changed': 'Changed a role',
  'user.renamed': 'Changed a display name',
  'user.disabled': 'Disabled an account',
  'user.enabled': 'Enabled an account',
  'user.deleted': 'Deleted an account',
  'settings.registration_changed': 'Changed the registration setting',
};

export function auditActionLabel(action: string): string {
  return AUDIT_ACTION_LABELS[action] ?? action;
}

/** `2026-08-12T09:31:00Z` → `12 Aug 2026, 09:31`. Absolute, so it is auditable. */
export function formatInstant(iso: string | null): string {
  if (!iso) return '—';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleString(undefined, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function formatDay(iso: string | null): string {
  if (!iso) return '—';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}

export function formatTimeOfDay(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
}

/** "3 days ago" for the last-active column, where recency is what matters. */
export function relativeSince(iso: string | null, now: Date = new Date()): string {
  if (!iso) return 'Never';
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return 'Never';

  const seconds = Math.max(0, Math.round((now.getTime() - then) / 1000));
  if (seconds < 60) return 'Just now';
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days}d ago`;
  const months = Math.round(days / 30);
  if (months < 12) return `${months}mo ago`;
  return `${Math.round(months / 12)}y ago`;
}

/** Whole hours, the unit the overview counts system-wide time in. */
export function formatHours(seconds: number): string {
  const hours = seconds / 3600;
  if (hours >= 100) return `${Math.round(hours).toLocaleString()}h`;
  if (hours >= 10) return `${hours.toFixed(1)}h`;
  if (hours >= 1) return `${hours.toFixed(1)}h`;
  return `${Math.round(seconds / 60)}m`;
}

export function formatCount(value: number): string {
  return value.toLocaleString();
}

/** Renders audit metadata without ever letting an unexpected key through raw. */
export function describeMetadata(metadata: Record<string, unknown>): string {
  const parts: string[] = [];
  for (const [key, value] of Object.entries(metadata)) {
    if (value === null || value === undefined || value === '') continue;
    parts.push(`${key.replace(/_/g, ' ')}: ${String(value)}`);
  }
  return parts.join(' · ');
}
