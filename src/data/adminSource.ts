import type { TrackerClient } from '../lib/supabase';
import type { AdminAuditLogRow, Database, UserRole } from '../types/database';

/** The admin RPCs that change something rather than reading it. */
type MutatingFunction =
  | 'admin_set_display_name'
  | 'admin_set_role'
  | 'admin_set_disabled'
  | 'admin_delete_user'
  | 'admin_set_registration_enabled';

/**
 * Reading and writing as an administrator.
 *
 * Every call here is a single RPC that aggregates in Postgres. Nothing in this
 * file downloads a user's sessions in order to add them up, and nothing in it
 * decides whether the caller is allowed to ask: each function's first statement
 * in SQL is `require_admin()`, so a normal user calling the same RPC — with the
 * same anon key, from the same console — gets an error rather than a row.
 */

export interface AdminStats {
  totalUsers: number;
  adminCount: number;
  disabledUsers: number;
  activeToday: number;
  activeThisMonth: number;
  totalSeconds: number;
  totalSessions: number;
  totalCompletions: number;
  totalTasks: number;
}

export interface AdminActivityEntry {
  at: string;
  userId: string;
  displayName: string;
  action: string;
  detail: string;
}

export interface AdminUserSummary {
  userId: string;
  displayName: string;
  email: string;
  role: UserRole;
  createdAt: string;
  lastActiveAt: string | null;
  disabledAt: string | null;
  totalSeconds: number;
  sessionCount: number;
  completionCount: number;
  taskCount: number;
}

export interface AdminUserPage {
  users: AdminUserSummary[];
  /** Matching users before the page limit, for the "showing x of y" line. */
  total: number;
}

export interface AdminUserDetail extends AdminUserSummary {
  firstActiveAt: string | null;
  activeMonths: number;
}

export interface AdminUserMonth {
  month: string;
  trackedSeconds: number;
  sessionCount: number;
  completionCount: number;
  taskCount: number;
}

export interface AuditEntry {
  id: string;
  adminEmail: string | null;
  action: string;
  targetEmail: string | null;
  metadata: Record<string, unknown>;
  createdAt: string;
}

export interface AdminSource {
  stats(): Promise<AdminStats>;
  recentActivity(limit?: number): Promise<AdminActivityEntry[]>;
  listUsers(options: { search?: string; limit?: number; offset?: number }): Promise<AdminUserPage>;
  userDetail(userId: string): Promise<AdminUserDetail | null>;
  userActivity(userId: string, months?: number): Promise<AdminUserMonth[]>;
  setDisplayName(userId: string, displayName: string): Promise<void>;
  setRole(userId: string, role: UserRole): Promise<void>;
  setDisabled(userId: string, disabled: boolean): Promise<void>;
  deleteUser(userId: string): Promise<void>;
  registrationEnabled(): Promise<boolean>;
  setRegistrationEnabled(enabled: boolean): Promise<void>;
  auditLog(limit?: number): Promise<AuditEntry[]>;
  /** Records that an administrator opened the panel. Best effort. */
  noteSession(): Promise<void>;
}

/**
 * Postgres speaks in error codes; the panel should not. The refusals worth
 * naming are the safeguards an administrator can actually run into.
 */
export function describeAdminError(error: { message: string } | null, fallback: string): string {
  if (!error) return fallback;
  const message = error.message;
  if (/administrator privileges required/i.test(message)) {
    return 'That action needs administrator privileges.';
  }
  if (/authentication required/i.test(message)) return 'Your session has expired. Sign in again.';
  if (/last administrator/i.test(message)) {
    return message.replace(/^.*?(the last administrator)/i, 'The last administrator');
  }
  if (/your own account/i.test(message)) return message;
  if (/no such user/i.test(message)) return 'That account no longer exists.';
  return message;
}

function unwrap<T>(result: { data: T | null; error: { message: string } | null }, context: string): T {
  if (result.error) throw new Error(describeAdminError(result.error, context));
  if (result.data === null) throw new Error(context);
  return result.data;
}

export function createSupabaseAdminSource(client: TrackerClient): AdminSource {
  /**
   * The mutating RPCs all look the same from here: they return nothing and
   * either succeed or refuse. `rpc` is called through a narrowed signature
   * because the union of every function's argument type is not much use to it.
   */
  type MutatingCall = <K extends MutatingFunction>(
    fn: K,
    args: Database['public']['Functions'][K]['Args'],
    context: string,
  ) => Promise<void>;

  const call: MutatingCall = async (fn, args, context) => {
    const rpc = client.rpc as unknown as (
      name: string,
      params: Record<string, unknown>,
    ) => Promise<{ error: { message: string } | null }>;
    const { error } = await rpc(fn, args as Record<string, unknown>);
    if (error) throw new Error(describeAdminError(error, context));
  };

  return {
    async stats() {
      const rows = unwrap(await client.rpc('admin_stats'), 'Could not load the statistics.');
      const row = rows[0];
      return {
        totalUsers: Number(row?.total_users ?? 0),
        adminCount: Number(row?.admin_count ?? 0),
        disabledUsers: Number(row?.disabled_users ?? 0),
        activeToday: Number(row?.active_today ?? 0),
        activeThisMonth: Number(row?.active_this_month ?? 0),
        totalSeconds: Number(row?.total_seconds ?? 0),
        totalSessions: Number(row?.total_sessions ?? 0),
        totalCompletions: Number(row?.total_completions ?? 0),
        totalTasks: Number(row?.total_tasks ?? 0),
      };
    },

    async recentActivity(limit = 12) {
      const rows = unwrap(
        await client.rpc('admin_recent_activity', { p_limit: limit }),
        'Could not load recent activity.',
      );
      return rows.map((row) => ({
        at: row.at,
        userId: row.user_id,
        displayName: row.display_name,
        action: row.action,
        detail: row.detail,
      }));
    },

    async listUsers({ search, limit = 25, offset = 0 }) {
      const rows = unwrap(
        await client.rpc('admin_list_users', {
          p_search: search?.trim() ? search.trim() : null,
          p_limit: limit,
          p_offset: offset,
        }),
        'Could not load the users.',
      );
      return {
        total: Number(rows[0]?.total_count ?? 0),
        users: rows.map((row) => ({
          userId: row.user_id,
          displayName: row.display_name,
          email: row.email,
          role: row.role,
          createdAt: row.created_at,
          lastActiveAt: row.last_active_at,
          disabledAt: row.disabled_at,
          totalSeconds: Number(row.total_seconds),
          sessionCount: Number(row.session_count),
          completionCount: Number(row.completion_count),
          taskCount: Number(row.task_count),
        })),
      };
    },

    async userDetail(userId) {
      const rows = unwrap(
        await client.rpc('admin_user_detail', { p_user_id: userId }),
        'Could not load that user.',
      );
      const row = rows[0];
      if (!row) return null;
      return {
        userId: row.user_id,
        displayName: row.display_name,
        email: row.email,
        role: row.role,
        createdAt: row.created_at,
        lastActiveAt: row.last_active_at,
        firstActiveAt: row.first_active_at,
        disabledAt: row.disabled_at,
        totalSeconds: Number(row.total_seconds),
        sessionCount: Number(row.session_count),
        completionCount: Number(row.completion_count),
        taskCount: Number(row.task_count),
        activeMonths: Number(row.active_months),
      };
    },

    async userActivity(userId, months = 6) {
      const rows = unwrap(
        await client.rpc('admin_user_activity', { p_user_id: userId, p_months: months }),
        'Could not load that user’s activity.',
      );
      return rows.map((row) => ({
        month: row.month,
        trackedSeconds: Number(row.tracked_seconds),
        sessionCount: Number(row.session_count),
        completionCount: Number(row.completion_count),
        taskCount: Number(row.task_count),
      }));
    },

    setDisplayName(userId, displayName) {
      return call(
        'admin_set_display_name',
        { p_user_id: userId, p_display_name: displayName },
        'Could not rename that user.',
      );
    },

    setRole(userId, role) {
      return call('admin_set_role', { p_user_id: userId, p_role: role }, 'Could not change the role.');
    },

    setDisabled(userId, disabled) {
      return call(
        'admin_set_disabled',
        { p_user_id: userId, p_disabled: disabled },
        'Could not change the account status.',
      );
    },

    deleteUser(userId) {
      return call('admin_delete_user', { p_user_id: userId }, 'Could not delete that account.');
    },

    async registrationEnabled() {
      const { data, error } = await client.rpc('registration_enabled');
      if (error) throw new Error(describeAdminError(error, 'Could not read the settings.'));
      return data !== false;
    },

    setRegistrationEnabled(enabled) {
      return call(
        'admin_set_registration_enabled',
        { p_enabled: enabled },
        'Could not save the setting.',
      );
    },

    async auditLog(limit = 50) {
      // A plain select: the log's only policy is `is_admin()`, so this returns
      // nothing at all for anybody else.
      const { data, error } = await client
        .from('admin_audit_log')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(limit);
      if (error) throw new Error(describeAdminError(error, 'Could not load the audit log.'));
      return (data ?? []).map((row: AdminAuditLogRow) => ({
        id: row.id,
        adminEmail: row.admin_email,
        action: row.action,
        targetEmail: row.target_email,
        metadata: row.metadata ?? {},
        createdAt: row.created_at,
      }));
    },

    async noteSession() {
      // Failure here must never keep an administrator out of the panel.
      await client.rpc('admin_note_session');
    },
  };
}
