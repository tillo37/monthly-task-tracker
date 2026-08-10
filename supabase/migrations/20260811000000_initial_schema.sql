-- Monthly Task Tracker — cloud schema.
--
-- The client keeps the same in-memory document it always had (months → tasks →
-- completions/sessions); this schema is its relational form. Tasks are scoped to
-- a month because the app has always treated a month's task list as its own set
-- of definitions, copied forward rather than shared.
--
-- Ownership is enforced here, never in the client: every private table carries
-- `user_id`, has RLS enabled, and its policies compare that column to
-- `auth.uid()`. The leaderboard is the single deliberate exception, and it is
-- exposed only through aggregate-returning functions.

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
-- profiles
-- ---------------------------------------------------------------------------

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null,
  email text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint profiles_display_name_length check (
    char_length(btrim(display_name)) between 1 and 40
  )
);

comment on table public.profiles is
  'Public-facing identity. Only display_name is ever exposed to other users.';

-- ---------------------------------------------------------------------------
-- tasks
-- ---------------------------------------------------------------------------

create table public.tasks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  -- `YYYY-MM`; a task belongs to exactly one month, as in the local app.
  month text not null,
  name text not null,
  target integer not null default 1,
  color text not null default '#6366f1',
  icon text not null default 'target',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint tasks_month_format check (month ~ '^\d{4}-(0[1-9]|1[0-2])$'),
  constraint tasks_name_length check (char_length(btrim(name)) between 1 and 60),
  constraint tasks_target_range check (target between 1 and 999),
  constraint tasks_color_format check (color ~* '^#[0-9a-f]{6}$')
);

create index tasks_user_id_idx on public.tasks (user_id);
create index tasks_user_month_idx on public.tasks (user_id, month);

-- ---------------------------------------------------------------------------
-- task_completions
-- ---------------------------------------------------------------------------

create table public.task_completions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  task_id uuid not null references public.tasks (id) on delete cascade,
  date date not null,
  created_at timestamptz not null default now(),
  -- Ticking the same day twice is a toggle in the UI, never a second row.
  constraint task_completions_unique unique (task_id, date)
);

create index task_completions_user_id_idx on public.task_completions (user_id);
create index task_completions_task_id_idx on public.task_completions (task_id);
create index task_completions_user_date_idx on public.task_completions (user_id, date);

-- ---------------------------------------------------------------------------
-- time_sessions
-- ---------------------------------------------------------------------------

create table public.time_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  task_id uuid not null references public.tasks (id) on delete cascade,
  start_time timestamptz not null,
  end_time timestamptz not null,
  -- Derived by the database, never accepted from the client: this is what makes
  -- the leaderboard impossible to inflate by posting a total.
  duration_seconds integer not null generated always as (
    floor(extract(epoch from (end_time - start_time)))::integer
  ) stored,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint time_sessions_ordered check (end_time >= start_time),
  -- A single session cannot exceed a day; mirrors MAX_SESSION_SECONDS.
  constraint time_sessions_max_length check (end_time - start_time <= interval '24 hours')
);

create index time_sessions_user_id_idx on public.time_sessions (user_id);
create index time_sessions_task_id_idx on public.time_sessions (task_id);
create index time_sessions_start_time_idx on public.time_sessions (start_time);
create index time_sessions_end_time_idx on public.time_sessions (end_time);
create index time_sessions_user_start_idx on public.time_sessions (user_id, start_time);

-- ---------------------------------------------------------------------------
-- active_timers
-- ---------------------------------------------------------------------------

-- One row per user is the whole point: the primary key is the user, so a second
-- running timer cannot exist even if a second device tries to start one.
create table public.active_timers (
  user_id uuid primary key references auth.users (id) on delete cascade,
  task_id uuid not null references public.tasks (id) on delete cascade,
  start_time timestamptz not null,
  month text not null,
  created_at timestamptz not null default now(),
  constraint active_timers_month_format check (month ~ '^\d{4}-(0[1-9]|1[0-2])$')
);

create index active_timers_task_id_idx on public.active_timers (task_id);
create index active_timers_start_time_idx on public.active_timers (start_time);

-- ---------------------------------------------------------------------------
-- updated_at maintenance
-- ---------------------------------------------------------------------------

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger profiles_touch_updated_at
  before update on public.profiles
  for each row execute function public.touch_updated_at();

create trigger tasks_touch_updated_at
  before update on public.tasks
  for each row execute function public.touch_updated_at();

create trigger time_sessions_touch_updated_at
  before update on public.time_sessions
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- Ownership integrity
-- ---------------------------------------------------------------------------

-- RLS stops a user writing a row owned by someone else. This stops the subtler
-- case: writing a row you *do* own that points at another user's task.
create or replace function public.assert_task_owned_by_row_user()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  owner uuid;
begin
  select user_id into owner from public.tasks where id = new.task_id;
  if owner is null then
    raise exception 'task % does not exist', new.task_id;
  end if;
  if owner <> new.user_id then
    raise exception 'task % belongs to a different user', new.task_id;
  end if;
  return new;
end;
$$;

create trigger task_completions_task_ownership
  before insert or update on public.task_completions
  for each row execute function public.assert_task_owned_by_row_user();

create trigger time_sessions_task_ownership
  before insert or update on public.time_sessions
  for each row execute function public.assert_task_owned_by_row_user();

create trigger active_timers_task_ownership
  before insert or update on public.active_timers
  for each row execute function public.assert_task_owned_by_row_user();

-- ---------------------------------------------------------------------------
-- Profile provisioning
-- ---------------------------------------------------------------------------

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  candidate text;
begin
  candidate := btrim(coalesce(new.raw_user_meta_data ->> 'display_name', ''));
  if candidate = '' then
    -- Local part of the email is a reasonable first guess and never exposes the
    -- domain; the user can change it from the profile menu.
    candidate := split_part(coalesce(new.email, 'user'), '@', 1);
  end if;
  candidate := left(candidate, 40);
  if btrim(candidate) = '' then
    candidate := 'User';
  end if;

  insert into public.profiles (id, display_name, email)
  values (new.id, candidate, coalesce(new.email, ''))
  on conflict (id) do nothing;

  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------

alter table public.profiles enable row level security;
alter table public.tasks enable row level security;
alter table public.task_completions enable row level security;
alter table public.time_sessions enable row level security;
alter table public.active_timers enable row level security;

-- A profile is readable only by its owner. Other users see display names solely
-- through the leaderboard functions, which return no other column.
create policy "profiles are readable by their owner"
  on public.profiles for select
  to authenticated
  using (auth.uid() = id);

create policy "profiles are insertable by their owner"
  on public.profiles for insert
  to authenticated
  with check (auth.uid() = id);

create policy "profiles are updatable by their owner"
  on public.profiles for update
  to authenticated
  using (auth.uid() = id)
  with check (auth.uid() = id);

create policy "tasks are readable by their owner"
  on public.tasks for select to authenticated using (auth.uid() = user_id);
create policy "tasks are insertable by their owner"
  on public.tasks for insert to authenticated with check (auth.uid() = user_id);
create policy "tasks are updatable by their owner"
  on public.tasks for update to authenticated
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "tasks are deletable by their owner"
  on public.tasks for delete to authenticated using (auth.uid() = user_id);

create policy "completions are readable by their owner"
  on public.task_completions for select to authenticated using (auth.uid() = user_id);
create policy "completions are insertable by their owner"
  on public.task_completions for insert to authenticated with check (auth.uid() = user_id);
create policy "completions are updatable by their owner"
  on public.task_completions for update to authenticated
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "completions are deletable by their owner"
  on public.task_completions for delete to authenticated using (auth.uid() = user_id);

create policy "sessions are readable by their owner"
  on public.time_sessions for select to authenticated using (auth.uid() = user_id);
create policy "sessions are insertable by their owner"
  on public.time_sessions for insert to authenticated with check (auth.uid() = user_id);
create policy "sessions are updatable by their owner"
  on public.time_sessions for update to authenticated
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "sessions are deletable by their owner"
  on public.time_sessions for delete to authenticated using (auth.uid() = user_id);

create policy "active timers are readable by their owner"
  on public.active_timers for select to authenticated using (auth.uid() = user_id);
create policy "active timers are insertable by their owner"
  on public.active_timers for insert to authenticated with check (auth.uid() = user_id);
create policy "active timers are updatable by their owner"
  on public.active_timers for update to authenticated
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "active timers are deletable by their owner"
  on public.active_timers for delete to authenticated using (auth.uid() = user_id);

-- Nothing is reachable without going through a policy or a function below.
revoke all on public.profiles from anon, authenticated;
revoke all on public.tasks from anon, authenticated;
revoke all on public.task_completions from anon, authenticated;
revoke all on public.time_sessions from anon, authenticated;
revoke all on public.active_timers from anon, authenticated;

grant select, insert, update on public.profiles to authenticated;
grant select, insert, update, delete on public.tasks to authenticated;
grant select, insert, update, delete on public.task_completions to authenticated;
grant select, insert, update, delete on public.time_sessions to authenticated;
grant select, insert, update, delete on public.active_timers to authenticated;

-- ---------------------------------------------------------------------------
-- Leaderboard
-- ---------------------------------------------------------------------------

-- Both functions are SECURITY DEFINER so they can read across users, and both
-- return only aggregates keyed by display name. They take a month key rather
-- than a free date range so a caller cannot slice the data finely enough to
-- reconstruct someone's schedule.

create or replace function public.month_bounds(p_month text)
returns table (start_date date, end_date date)
language sql
immutable
as $$
  select
    to_date(p_month || '-01', 'YYYY-MM-DD'),
    (to_date(p_month || '-01', 'YYYY-MM-DD') + interval '1 month')::date;
$$;

create or replace function public.leaderboard_time(p_month text)
returns table (
  rank bigint,
  user_id uuid,
  display_name text,
  total_seconds bigint,
  session_count bigint
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  with bounds as (
    select * from public.month_bounds(
      case when p_month ~ '^\d{4}-(0[1-9]|1[0-2])$' then p_month
           else to_char(now(), 'YYYY-MM') end
    )
  ),
  totals as (
    select
      s.user_id,
      sum(s.duration_seconds)::bigint as total_seconds,
      count(*)::bigint as session_count
    from public.time_sessions s, bounds b
    where s.start_time >= b.start_date
      and s.start_time < b.end_date
    group by s.user_id
    having sum(s.duration_seconds) > 0
  )
  select
    rank() over (order by t.total_seconds desc),
    t.user_id,
    p.display_name,
    t.total_seconds,
    t.session_count
  from totals t
  join public.profiles p on p.id = t.user_id
  -- Only authenticated users may see the board at all.
  where (select auth.uid()) is not null
  order by t.total_seconds desc, p.display_name asc;
$$;

create or replace function public.leaderboard_completions(p_month text)
returns table (
  rank bigint,
  user_id uuid,
  display_name text,
  completion_count bigint
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  with bounds as (
    select * from public.month_bounds(
      case when p_month ~ '^\d{4}-(0[1-9]|1[0-2])$' then p_month
           else to_char(now(), 'YYYY-MM') end
    )
  ),
  totals as (
    select c.user_id, count(*)::bigint as completion_count
    from public.task_completions c, bounds b
    where c.date >= b.start_date
      and c.date < b.end_date
    group by c.user_id
  )
  select
    rank() over (order by t.completion_count desc),
    t.user_id,
    p.display_name,
    t.completion_count
  from totals t
  join public.profiles p on p.id = t.user_id
  where (select auth.uid()) is not null
  order by t.completion_count desc, p.display_name asc;
$$;

revoke all on function public.leaderboard_time(text) from public, anon;
revoke all on function public.leaderboard_completions(text) from public, anon;
grant execute on function public.leaderboard_time(text) to authenticated;
grant execute on function public.leaderboard_completions(text) to authenticated;

-- ---------------------------------------------------------------------------
-- Timer handover
-- ---------------------------------------------------------------------------

-- Starting a timer is a single statement so two devices racing cannot end up
-- with two rows or a lost start.
create or replace function public.start_timer(p_task_id uuid, p_month text)
returns public.active_timers
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  result public.active_timers;
begin
  insert into public.active_timers (user_id, task_id, start_time, month)
  values (auth.uid(), p_task_id, now(), p_month)
  on conflict (user_id) do update
    set task_id = excluded.task_id,
        start_time = excluded.start_time,
        month = excluded.month
  returning * into result;

  return result;
end;
$$;

revoke all on function public.start_timer(uuid, text) from public, anon;
grant execute on function public.start_timer(uuid, text) to authenticated;

-- ---------------------------------------------------------------------------
-- Realtime
-- ---------------------------------------------------------------------------

-- Only the running timer is replicated. Realtime respects RLS, so a subscriber
-- receives their own row and nothing else. Tasks, completions, sessions and
-- reports deliberately stay on ordinary queries: they change in response to the
-- user's own clicks, and streaming them would be traffic for no benefit.
alter publication supabase_realtime add table public.active_timers;
