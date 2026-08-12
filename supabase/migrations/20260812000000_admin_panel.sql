-- Monthly Task Tracker — administration.
--
-- Adds a role system, an audit log, a small settings table and the aggregate
-- functions the Admin Panel runs on. Nothing here is destructive: existing
-- tables gain columns, existing policies are left in place, and every new
-- policy is additive.
--
-- The rule the whole file follows: *the database decides who is an
-- administrator*. The role lives in `public.profiles.role`, it cannot be
-- written through the Data API by anybody (column privileges plus a trigger),
-- and every privileged operation goes through a SECURITY DEFINER function whose
-- first statement is `perform public.require_admin()`. Hiding a button in React
-- is presentation, not permission.

-- ---------------------------------------------------------------------------
-- profiles: role and account status
-- ---------------------------------------------------------------------------

alter table public.profiles
  add column if not exists role text not null default 'user',
  add column if not exists disabled_at timestamptz;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'profiles_role_valid'
  ) then
    alter table public.profiles
      add constraint profiles_role_valid check (role in ('user', 'admin'));
  end if;
end;
$$;

comment on column public.profiles.role is
  'Authoritative role. Never derived from an email address or from client state.';
comment on column public.profiles.disabled_at is
  'When set, the account is locked out by restrictive policies and cannot sign in.';

-- Admins are a handful of rows in a table of many; a partial index keeps
-- `is_admin()` and the "last administrator" check to an index probe.
create index if not exists profiles_admin_idx on public.profiles (id) where role = 'admin';
create index if not exists profiles_created_at_idx on public.profiles (created_at desc);

-- Supports the "last active" column without scanning a user's history.
create index if not exists time_sessions_user_end_idx
  on public.time_sessions (user_id, end_time desc);
create index if not exists task_completions_user_created_idx
  on public.task_completions (user_id, created_at desc);
create index if not exists task_completions_created_at_idx
  on public.task_completions (created_at desc);

-- ---------------------------------------------------------------------------
-- Role helpers
-- ---------------------------------------------------------------------------

-- SECURITY DEFINER, and owned by the table owner, so the lookup does not go
-- back through `profiles`' own policies — which is what would otherwise make
-- every policy that calls it recursive.
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.profiles p
    where p.id = (select auth.uid())
      and p.role = 'admin'
      and p.disabled_at is null
  );
$$;

comment on function public.is_admin() is
  'True when the caller is an enabled administrator. Answers only about the caller.';

-- Deliberately no `is_admin(uuid)`: a normal user has no business asking
-- whether somebody else is an administrator.

-- Latest of the three things a user can do. Each branch is an index-only probe
-- rather than a scan of their history.
create or replace function public.last_active_for(p_user_id uuid)
returns timestamptz
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select nullif(
    greatest(
      coalesce((select max(end_time) from public.time_sessions where user_id = p_user_id),
               '-infinity'::timestamptz),
      coalesce((select max(created_at) from public.task_completions where user_id = p_user_id),
               '-infinity'::timestamptz),
      coalesce((select start_time from public.active_timers where user_id = p_user_id),
               '-infinity'::timestamptz)
    ),
    '-infinity'::timestamptz
  );
$$;

-- Small shared formatter so the activity feed reads like the rest of the app.
create or replace function public.format_seconds(p_seconds integer)
returns text
language sql
immutable
as $$
  select case
    when coalesce(p_seconds, 0) < 60 then p_seconds || 's'
    when p_seconds < 3600 then (p_seconds / 60) || 'm'
    when p_seconds % 3600 = 0 then (p_seconds / 3600) || 'h'
    else (p_seconds / 3600) || 'h ' || ((p_seconds % 3600) / 60) || 'm'
  end;
$$;

create or replace function public.is_account_disabled()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = (select auth.uid()) and p.disabled_at is not null
  );
$$;

-- Raises rather than returns, so a privileged function cannot forget to check
-- the result. Callable only from other functions owned by this role.
create or replace function public.require_admin()
returns void
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  if (select auth.uid()) is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;
  if not public.is_admin() then
    raise exception 'administrator privileges required' using errcode = '42501';
  end if;
end;
$$;

revoke all on function public.is_account_disabled() from public, anon, authenticated;
revoke all on function public.require_admin() from public, anon, authenticated;
revoke all on function public.is_admin() from public, anon;
grant execute on function public.is_admin() to authenticated;
-- Policies are evaluated as the querying role, so these two must be callable by
-- `authenticated` even though no application code invokes them directly.
grant execute on function public.is_account_disabled() to authenticated;

-- ---------------------------------------------------------------------------
-- The role column cannot be written from outside
-- ---------------------------------------------------------------------------

-- Two independent locks, because either one alone is a single point of failure:
--
--   1. Column privileges: `authenticated` may update only `display_name`, so a
--      crafted PATCH that sets `role` is rejected before any policy runs.
--   2. This trigger: even a caller that somehow reaches the column has to be
--      inside one of the admin functions below, which set the flag it looks for.
create or replace function public.guard_profile_privileges()
returns trigger
language plpgsql
as $$
begin
  if new.role is distinct from old.role
    or new.disabled_at is distinct from old.disabled_at
    or new.email is distinct from old.email
    or new.id is distinct from old.id
  then
    if coalesce(current_setting('app.admin_ops', true), '') <> 'on' then
      raise exception 'role, account status and email are managed by the admin panel'
        using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_guard_privileges on public.profiles;
create trigger profiles_guard_privileges
  before update on public.profiles
  for each row execute function public.guard_profile_privileges();

revoke insert, update on public.profiles from authenticated;
grant insert (id, display_name, email) on public.profiles to authenticated;
grant update (display_name) on public.profiles to authenticated;

-- ---------------------------------------------------------------------------
-- Disabled accounts are locked out of their own data
-- ---------------------------------------------------------------------------

-- Restrictive policies AND with everything else, so this does not touch — or
-- risk breaking — any of the ownership policies already in place. `profiles` is
-- deliberately left readable: the client needs to see `disabled_at` in order to
-- explain itself instead of failing silently.
create policy "disabled accounts are locked out"
  on public.tasks as restrictive for all to authenticated
  using (not public.is_account_disabled());
create policy "disabled accounts are locked out"
  on public.task_completions as restrictive for all to authenticated
  using (not public.is_account_disabled());
create policy "disabled accounts are locked out"
  on public.time_sessions as restrictive for all to authenticated
  using (not public.is_account_disabled());
create policy "disabled accounts are locked out"
  on public.active_timers as restrictive for all to authenticated
  using (not public.is_account_disabled());

-- ---------------------------------------------------------------------------
-- Administrator read access, as explicit policies
-- ---------------------------------------------------------------------------

-- Read-only, and SELECT only: an administrator inspects accounts, they do not
-- edit somebody's habits. The write paths that do exist (rename, role, disable,
-- delete) are the audited functions further down, never a bare UPDATE.
create policy "profiles are readable by admins"
  on public.profiles for select to authenticated using (public.is_admin());
create policy "tasks are readable by admins"
  on public.tasks for select to authenticated using (public.is_admin());
create policy "completions are readable by admins"
  on public.task_completions for select to authenticated using (public.is_admin());
create policy "sessions are readable by admins"
  on public.time_sessions for select to authenticated using (public.is_admin());
create policy "active timers are readable by admins"
  on public.active_timers for select to authenticated using (public.is_admin());

-- ---------------------------------------------------------------------------
-- Audit log
-- ---------------------------------------------------------------------------

create table if not exists public.admin_audit_log (
  id uuid primary key default gen_random_uuid(),
  -- The account survives in the log as an email even after it is deleted, so
  -- history never points at a row that is gone.
  admin_user_id uuid references auth.users (id) on delete set null,
  admin_email text,
  action text not null,
  target_user_id uuid references auth.users (id) on delete set null,
  target_email text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

comment on table public.admin_audit_log is
  'Administrative actions. Never contains passwords, tokens or any auth secret.';

create index if not exists admin_audit_log_created_at_idx
  on public.admin_audit_log (created_at desc);
create index if not exists admin_audit_log_target_idx
  on public.admin_audit_log (target_user_id);

alter table public.admin_audit_log enable row level security;

create policy "audit log is readable by admins"
  on public.admin_audit_log for select to authenticated using (public.is_admin());

-- No insert/update/delete grant to anyone: the log is append-only, and only
-- through `record_admin_action`. Not even an administrator can rewrite it.
revoke all on public.admin_audit_log from anon, authenticated;
grant select on public.admin_audit_log to authenticated;

create or replace function public.record_admin_action(
  p_action text,
  p_target uuid default null,
  p_metadata jsonb default '{}'::jsonb
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  insert into public.admin_audit_log (
    admin_user_id, admin_email, action, target_user_id, target_email, metadata
  )
  values (
    (select auth.uid()),
    (select email from public.profiles where id = (select auth.uid())),
    p_action,
    p_target,
    (select email from public.profiles where id = p_target),
    coalesce(p_metadata, '{}'::jsonb)
  );
end;
$$;

revoke all on function public.record_admin_action(text, uuid, jsonb)
  from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- System settings
-- ---------------------------------------------------------------------------

create table if not exists public.app_settings (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users (id) on delete set null
);

insert into public.app_settings (key, value)
values ('registration_enabled', 'true'::jsonb)
on conflict (key) do nothing;

alter table public.app_settings enable row level security;

create policy "settings are readable by admins"
  on public.app_settings for select to authenticated using (public.is_admin());

revoke all on public.app_settings from anon, authenticated;
grant select on public.app_settings to authenticated;

-- The sign-up form needs this one flag before anybody has a session, so it is
-- exposed as a function that returns exactly one boolean and nothing else.
create or replace function public.registration_enabled()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(
    (select (value #>> '{}')::boolean from public.app_settings where key = 'registration_enabled'),
    true
  );
$$;

revoke all on function public.registration_enabled() from public;
grant execute on function public.registration_enabled() to anon, authenticated;

-- Enforcement is at the point of account creation, not in the form: with the
-- setting off, the insert into `auth.users` fails however it was attempted.
create or replace function public.enforce_registration_enabled()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if not public.registration_enabled() then
    raise exception 'registration is currently disabled' using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists before_auth_user_created on auth.users;
create trigger before_auth_user_created
  before insert on auth.users
  for each row execute function public.enforce_registration_enabled();

-- ---------------------------------------------------------------------------
-- Admin statistics
-- ---------------------------------------------------------------------------

-- Every figure the Overview shows is computed here, in one round trip. The
-- browser never sees a session row it does not own.
create or replace function public.admin_stats()
returns table (
  total_users bigint,
  admin_count bigint,
  disabled_users bigint,
  active_today bigint,
  active_this_month bigint,
  total_seconds bigint,
  total_sessions bigint,
  total_completions bigint,
  total_tasks bigint
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  perform public.require_admin();

  return query
  with activity as (
    select s.user_id, s.end_time as at from public.time_sessions s
    union all
    select c.user_id, c.created_at from public.task_completions c
  )
  select
    (select count(*) from public.profiles)::bigint,
    (select count(*) from public.profiles where role = 'admin')::bigint,
    (select count(*) from public.profiles where disabled_at is not null)::bigint,
    (select count(distinct a.user_id) from activity a
      where a.at >= date_trunc('day', now()))::bigint,
    (select count(distinct a.user_id) from activity a
      where a.at >= date_trunc('month', now()))::bigint,
    (select coalesce(sum(duration_seconds), 0) from public.time_sessions)::bigint,
    (select count(*) from public.time_sessions)::bigint,
    (select count(*) from public.task_completions)::bigint,
    (select count(*) from public.tasks)::bigint;
end;
$$;

-- The overview feed. Deliberately says *what* happened and not *what it was
-- about: no task names, no dates, nothing that would turn a moderation tool
-- into a window onto somebody's day.
create or replace function public.admin_recent_activity(p_limit integer default 12)
returns table (
  at timestamptz,
  user_id uuid,
  display_name text,
  action text,
  detail text
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_limit integer := least(greatest(coalesce(p_limit, 12), 1), 100);
begin
  perform public.require_admin();

  return query
  with events as (
    (
      select s.end_time as at, s.user_id, 'Recorded time'::text as action,
             public.format_seconds(s.duration_seconds) as detail
      from public.time_sessions s
      order by s.end_time desc
      limit v_limit
    )
    union all
    (
      select c.created_at, c.user_id, 'Completed task'::text, ''::text
      from public.task_completions c
      order by c.created_at desc
      limit v_limit
    )
    union all
    (
      select t.start_time, t.user_id, 'Started timer'::text, ''::text
      from public.active_timers t
      order by t.start_time desc
      limit v_limit
    )
  )
  select e.at, e.user_id, p.display_name, e.action, e.detail
  from events e
  join public.profiles p on p.id = e.user_id
  order by e.at desc
  limit v_limit;
end;
$$;

-- ---------------------------------------------------------------------------
-- User management
-- ---------------------------------------------------------------------------

create or replace function public.admin_list_users(
  p_search text default null,
  p_limit integer default 25,
  p_offset integer default 0
)
returns table (
  user_id uuid,
  display_name text,
  email text,
  role text,
  created_at timestamptz,
  last_active_at timestamptz,
  disabled_at timestamptz,
  total_seconds bigint,
  session_count bigint,
  completion_count bigint,
  task_count bigint,
  total_count bigint
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_limit integer := least(greatest(coalesce(p_limit, 25), 1), 200);
  v_offset integer := greatest(coalesce(p_offset, 0), 0);
  v_search text := nullif(btrim(coalesce(p_search, '')), '');
begin
  perform public.require_admin();

  return query
  with matched as (
    select p.*, count(*) over () as total_count
    from public.profiles p
    where v_search is null
       or p.display_name ilike '%' || v_search || '%'
       or p.email ilike '%' || v_search || '%'
    order by p.created_at desc
    limit v_limit offset v_offset
  )
  select
    m.id,
    m.display_name,
    m.email,
    m.role,
    m.created_at,
    a.last_active_at,
    m.disabled_at,
    coalesce(s.total_seconds, 0)::bigint,
    coalesce(s.session_count, 0)::bigint,
    coalesce(c.completion_count, 0)::bigint,
    coalesce(t.task_count, 0)::bigint,
    m.total_count
  from matched m
  left join lateral (
    select sum(x.duration_seconds)::bigint as total_seconds, count(*)::bigint as session_count
    from public.time_sessions x where x.user_id = m.id
  ) s on true
  left join lateral (
    select count(*)::bigint as completion_count
    from public.task_completions x where x.user_id = m.id
  ) c on true
  left join lateral (
    select count(*)::bigint as task_count from public.tasks x where x.user_id = m.id
  ) t on true
  left join lateral (
    select public.last_active_for(m.id) as last_active_at
  ) a on true
  order by m.created_at desc;
end;
$$;

create or replace function public.admin_user_detail(p_user_id uuid)
returns table (
  user_id uuid,
  display_name text,
  email text,
  role text,
  created_at timestamptz,
  last_active_at timestamptz,
  first_active_at timestamptz,
  disabled_at timestamptz,
  total_seconds bigint,
  session_count bigint,
  completion_count bigint,
  task_count bigint,
  active_months bigint
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  perform public.require_admin();

  return query
  select
    p.id,
    p.display_name,
    p.email,
    p.role,
    p.created_at,
    public.last_active_for(p.id),
    (select min(s.start_time) from public.time_sessions s where s.user_id = p.id),
    p.disabled_at,
    -- Every column here is qualified: the OUT parameters share their names with
    -- the columns, and an unqualified reference resolves to the wrong one.
    coalesce((select sum(s.duration_seconds) from public.time_sessions s where s.user_id = p.id), 0)::bigint,
    (select count(*) from public.time_sessions s where s.user_id = p.id)::bigint,
    (select count(*) from public.task_completions c where c.user_id = p.id)::bigint,
    (select count(*) from public.tasks t where t.user_id = p.id)::bigint,
    (select count(distinct t.month) from public.tasks t where t.user_id = p.id)::bigint
  from public.profiles p
  where p.id = p_user_id;
end;
$$;

-- Read-only inspection of one account's activity, for support and moderation.
-- Aggregated by month rather than served row by row, so the panel shows shape
-- and volume without becoming a transcript of somebody's week.
create or replace function public.admin_user_activity(p_user_id uuid, p_months integer default 12)
returns table (
  month text,
  tracked_seconds bigint,
  session_count bigint,
  completion_count bigint,
  task_count bigint
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_months integer := least(greatest(coalesce(p_months, 12), 1), 60);
begin
  perform public.require_admin();

  return query
  with months as (
    select to_char(m, 'YYYY-MM') as month
    from generate_series(
      date_trunc('month', now()) - make_interval(months => v_months - 1),
      date_trunc('month', now()),
      interval '1 month'
    ) as m
  )
  select
    mo.month,
    coalesce((
      select sum(duration_seconds) from public.time_sessions s
      where s.user_id = p_user_id and to_char(s.start_time, 'YYYY-MM') = mo.month
    ), 0)::bigint,
    (
      select count(*) from public.time_sessions s
      where s.user_id = p_user_id and to_char(s.start_time, 'YYYY-MM') = mo.month
    )::bigint,
    (
      select count(*) from public.task_completions c
      where c.user_id = p_user_id and to_char(c.date, 'YYYY-MM') = mo.month
    )::bigint,
    (
      select count(*) from public.tasks t
      where t.user_id = p_user_id and t.month = mo.month
    )::bigint
  from months mo
  order by mo.month desc;
end;
$$;

-- ---------------------------------------------------------------------------
-- Privileged mutations
-- ---------------------------------------------------------------------------

create or replace function public.admin_set_display_name(p_user_id uuid, p_display_name text)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_name text := left(btrim(coalesce(p_display_name, '')), 40);
  v_before text;
begin
  perform public.require_admin();

  if v_name = '' then
    raise exception 'a display name is required' using errcode = '22023';
  end if;

  select display_name into v_before from public.profiles where id = p_user_id;
  if v_before is null then
    raise exception 'no such user' using errcode = '42704';
  end if;
  if v_before = v_name then return; end if;

  update public.profiles set display_name = v_name where id = p_user_id;

  perform public.record_admin_action(
    'user.renamed', p_user_id, jsonb_build_object('from', v_before, 'to', v_name)
  );
end;
$$;

create or replace function public.admin_set_role(p_user_id uuid, p_role text)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_current text;
  v_admins integer;
begin
  perform public.require_admin();

  if p_role not in ('user', 'admin') then
    raise exception 'unknown role %', p_role using errcode = '22023';
  end if;

  -- Serialises every role change, so two administrators demoting each other at
  -- the same moment cannot both pass the "is there another admin?" test.
  perform pg_advisory_xact_lock(hashtext('public.admin_role_change'));

  select role into v_current from public.profiles where id = p_user_id;
  if v_current is null then
    raise exception 'no such user' using errcode = '42704';
  end if;
  if v_current = p_role then return; end if;

  if v_current = 'admin' and p_role = 'user' then
    select count(*) into v_admins from public.profiles where role = 'admin';
    if v_admins <= 1 then
      raise exception 'the last administrator cannot be demoted' using errcode = '23514';
    end if;
  end if;

  perform set_config('app.admin_ops', 'on', true);
  update public.profiles set role = p_role where id = p_user_id;
  perform set_config('app.admin_ops', 'off', true);

  perform public.record_admin_action(
    'role.changed', p_user_id, jsonb_build_object('from', v_current, 'to', p_role)
  );
end;
$$;

create or replace function public.admin_set_disabled(p_user_id uuid, p_disabled boolean)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_role text;
  v_disabled_at timestamptz;
  v_admins integer;
  v_banned boolean := true;
begin
  perform public.require_admin();

  if p_user_id = (select auth.uid()) then
    raise exception 'you cannot disable your own account' using errcode = '23514';
  end if;

  perform pg_advisory_xact_lock(hashtext('public.admin_role_change'));

  select role, disabled_at into v_role, v_disabled_at
  from public.profiles where id = p_user_id;
  if v_role is null then
    raise exception 'no such user' using errcode = '42704';
  end if;
  if (v_disabled_at is not null) = p_disabled then return; end if;

  if p_disabled and v_role = 'admin' then
    select count(*) into v_admins from public.profiles where role = 'admin';
    if v_admins <= 1 then
      raise exception 'the last administrator cannot be disabled' using errcode = '23514';
    end if;
  end if;

  -- Postgres is the source of truth for what the account may read (the
  -- restrictive policies above); GoTrue's ban is what stops it signing in
  -- again. If this deployment does not let us touch `auth.users`, the lockout
  -- still holds and the audit entry records that the ban did not apply.
  begin
    update auth.users
      set banned_until = case when p_disabled then now() + interval '100 years' else null end
      where id = p_user_id;
    if p_disabled and to_regclass('auth.sessions') is not null then
      -- Ends refresh immediately rather than at the end of the token's life.
      execute 'delete from auth.sessions where user_id = $1' using p_user_id;
    end if;
  exception
    when insufficient_privilege then v_banned := false;
  end;

  perform set_config('app.admin_ops', 'on', true);
  update public.profiles
    set disabled_at = case when p_disabled then now() else null end
    where id = p_user_id;
  perform set_config('app.admin_ops', 'off', true);

  perform public.record_admin_action(
    case when p_disabled then 'user.disabled' else 'user.enabled' end,
    p_user_id,
    jsonb_build_object('auth_ban_applied', v_banned)
  );
end;
$$;

create or replace function public.admin_delete_user(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_role text;
  v_email text;
  v_name text;
  v_admins integer;
begin
  perform public.require_admin();

  if p_user_id = (select auth.uid()) then
    raise exception 'you cannot delete your own account from the admin panel'
      using errcode = '23514';
  end if;

  perform pg_advisory_xact_lock(hashtext('public.admin_role_change'));

  select role, email, display_name into v_role, v_email, v_name
  from public.profiles where id = p_user_id;
  if v_role is null then
    raise exception 'no such user' using errcode = '42704';
  end if;

  if v_role = 'admin' then
    select count(*) into v_admins from public.profiles where role = 'admin';
    if v_admins <= 1 then
      raise exception 'the last administrator cannot be deleted' using errcode = '23514';
    end if;
  end if;

  -- Logged before the row disappears, and with the identity copied into the
  -- entry, because the foreign key nulls `target_user_id` on the way out.
  perform public.record_admin_action(
    'user.deleted',
    p_user_id,
    jsonb_build_object('user_id', p_user_id, 'email', v_email, 'display_name', v_name)
  );

  -- Profile, tasks, completions, sessions and the running timer all cascade
  -- from this one delete; nothing is left behind pointing at a missing user.
  delete from auth.users where id = p_user_id;
end;
$$;

create or replace function public.admin_set_registration_enabled(p_enabled boolean)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  perform public.require_admin();

  insert into public.app_settings (key, value, updated_at, updated_by)
  values ('registration_enabled', to_jsonb(p_enabled), now(), (select auth.uid()))
  on conflict (key) do update
    set value = excluded.value, updated_at = excluded.updated_at, updated_by = excluded.updated_by;

  perform public.record_admin_action(
    'settings.registration_changed', null, jsonb_build_object('enabled', p_enabled)
  );
end;
$$;

-- Called once when the panel is opened. Rate-limited to one entry an hour so a
-- reload does not bury the entries that matter.
create or replace function public.admin_note_session()
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  perform public.require_admin();

  if exists (
    select 1 from public.admin_audit_log
    where admin_user_id = (select auth.uid())
      and action = 'admin.session_opened'
      and created_at > now() - interval '1 hour'
  ) then
    return;
  end if;

  perform public.record_admin_action('admin.session_opened');
end;
$$;

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------

-- Every one of these checks `require_admin()` before it does anything, so the
-- grant to `authenticated` is a grant to *call and be refused*.
revoke all on function public.admin_stats() from public, anon;
revoke all on function public.admin_recent_activity(integer) from public, anon;
revoke all on function public.admin_list_users(text, integer, integer) from public, anon;
revoke all on function public.admin_user_detail(uuid) from public, anon;
revoke all on function public.admin_user_activity(uuid, integer) from public, anon;
revoke all on function public.admin_set_display_name(uuid, text) from public, anon;
revoke all on function public.admin_set_role(uuid, text) from public, anon;
revoke all on function public.admin_set_disabled(uuid, boolean) from public, anon;
revoke all on function public.admin_delete_user(uuid) from public, anon;
revoke all on function public.admin_set_registration_enabled(boolean) from public, anon;
revoke all on function public.admin_note_session() from public, anon;
revoke all on function public.last_active_for(uuid) from public, anon, authenticated;
revoke all on function public.format_seconds(integer) from public, anon;

grant execute on function public.admin_stats() to authenticated;
grant execute on function public.admin_recent_activity(integer) to authenticated;
grant execute on function public.admin_list_users(text, integer, integer) to authenticated;
grant execute on function public.admin_user_detail(uuid) to authenticated;
grant execute on function public.admin_user_activity(uuid, integer) to authenticated;
grant execute on function public.admin_set_display_name(uuid, text) to authenticated;
grant execute on function public.admin_set_role(uuid, text) to authenticated;
grant execute on function public.admin_set_disabled(uuid, boolean) to authenticated;
grant execute on function public.admin_delete_user(uuid) to authenticated;
grant execute on function public.admin_set_registration_enabled(boolean) to authenticated;
grant execute on function public.admin_note_session() to authenticated;
grant execute on function public.format_seconds(integer) to authenticated;

-- ---------------------------------------------------------------------------
-- Bootstrapping the first administrator
-- ---------------------------------------------------------------------------

-- There is no way to become an administrator from the browser, which leaves the
-- chicken-and-egg problem of the first one. This is the answer: it runs only
-- from a trusted connection (the SQL editor or the service role), never from
-- `anon` or `authenticated`.
create or replace function public.bootstrap_admin(p_email text)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_id uuid;
begin
  select id into v_id from public.profiles where lower(email) = lower(btrim(p_email));
  if v_id is null then
    raise exception 'no account with email %', p_email using errcode = '42704';
  end if;

  perform set_config('app.admin_ops', 'on', true);
  update public.profiles set role = 'admin', disabled_at = null where id = v_id;
  perform set_config('app.admin_ops', 'off', true);

  insert into public.admin_audit_log (admin_email, action, target_user_id, target_email, metadata)
  values ('system', 'role.changed', v_id, p_email, jsonb_build_object(
    'from', 'user', 'to', 'admin', 'via', 'bootstrap_admin'
  ));
end;
$$;

revoke all on function public.bootstrap_admin(text) from public, anon, authenticated;
grant execute on function public.bootstrap_admin(text) to service_role;

-- Production already has accounts, and the owner's is the oldest of them. This
-- promotes that one account, and only when the deployment has no administrator
-- at all — so it is a no-op on a fresh database and a no-op on every subsequent
-- run. Any other choice of owner is a one-line `select public.bootstrap_admin
-- ('owner@example.com');` afterwards.
do $$
declare
  v_id uuid;
  v_email text;
begin
  if exists (select 1 from public.profiles where role = 'admin') then
    return;
  end if;

  select id, email into v_id, v_email
  from public.profiles order by created_at asc, id asc limit 1;

  if v_id is null then
    return;
  end if;

  perform set_config('app.admin_ops', 'on', true);
  update public.profiles set role = 'admin' where id = v_id;
  perform set_config('app.admin_ops', 'off', true);

  insert into public.admin_audit_log (admin_email, action, target_user_id, target_email, metadata)
  values ('system', 'role.changed', v_id, v_email, jsonb_build_object(
    'from', 'user', 'to', 'admin', 'via', 'initial_migration'
  ));

  raise notice 'Promoted % to administrator (oldest account, no admin existed).', v_email;
end;
$$;
