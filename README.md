# Monthly Task Tracker

A multi-user monthly habit and to-do completion tracker, inspired by the spreadsheet trackers where
every task has a monthly target and each day gets ticked off.

Set a target for each task ("Gym, 20 times this month"), tick the days you actually did it, and the
per-task and weighted overall percentages update instantly. A built-in **time tracker** records how
long you actually spend on those same tasks, so a month reads as `Gym · 12 / 20 · 60% · 14h 35m`,
and a **leaderboard** ranks everyone by the time and completions they logged that calendar month.

Your tasks, completions and time sessions are private to your account and enforced as such by
Postgres Row Level Security — the leaderboard is the one place data crosses between users, and it
exposes nothing but a display name, a rank and a monthly total.

The app has four sections, reachable from the header and linkable by URL hash:

| Section          | Hash             | What it does                                      |
| ---------------- | ---------------- | ------------------------------------------------- |
| **Tasks**        | `#/tasks`        | the monthly tracker grid (the original app)       |
| **Time Tracker** | `#/time`         | stopwatch and manual entry, plus `#/time/sessions` |
| **Reports**      | `#/reports`      | time and completion analytics for any period      |
| **Leaderboard**  | `#/leaderboard`  | monthly ranking by tracked time or completions    |

Without Supabase credentials the app still builds and runs exactly as it always did: local-only,
no accounts, no leaderboard. See [Running without a backend](#running-without-a-backend).

## Screenshots

<!-- Add screenshots here, e.g.:
![Monthly dashboard](docs/screenshot-light.png)
![Dark mode](docs/screenshot-dark.png)
-->

_Run the app with `npm run dev` and drop screenshots into `docs/` to fill this section._

## Features

- **Monthly tracker grid** — one row per task, one column per day, with the correct number of days
  for every month (28, 29, 30 or 31 — never hard-coded).
- **One-click daily toggling** — click or keyboard-toggle any cell; arrow keys move between cells.
- **Live percentages** — per-task `completed / target` and a **target-weighted** overall percentage
  (not an average of task percentages).
- **Uncapped progress** — exceeding a target shows honestly as `23 / 20 · 115%` and is visually
  distinguished.
- **Independent months** — August and September keep separate tasks, targets and history.
- **Copy previous month** — bring last month's task definitions forward; completion history is not
  copied.
- **Task management** — create, edit and delete with colour and icon, with a confirmation dialog
  before anything destructive.
- **Reset month** — clear a month's completions while keeping the task definitions.
- **Time tracking on the same tasks** — a single stopwatch, one task at a time, recording real
  sessions against the tasks the tracker already has. No separate task list.
- **Survives a reload** — a running timer is restored with the correct elapsed time, computed from
  when it started rather than accumulated, so a backgrounded tab loses nothing.
- **Manual entries** — add time the timer missed (`45`, `1h 30m` or `1:30`), capped at 24 hours per
  session.
- **Session history** — every session grouped by day with per-day totals, deletable individually or
  a whole month at a time.
- **Time reports for any period** — Today, Yesterday, This/Last Week, This/Last Month, This/Last
  Year or a custom range, with previous/next stepping. Weeks are real calendar weeks running
  **Monday → Sunday**, never a rolling seven days, and a weekly report always shows all seven days
  including the empty ones.
- **One report engine** — every preset resolves to a start and end day and goes through the same
  pipeline; the activity chart switches from days to weeks to months as the range grows.
- **Honest weekly completion** — `Done in period` counts only the completions inside the selected
  range, while the target stays the *monthly* target it always was; the columns are labelled
  `Monthly target` / `Done in period` / `Period completion` so the two can never be confused.
- **Sessions split at midnight** — a session running 23:30 → 01:00 counts 30 minutes on the first
  day and an hour on the next, so a week boundary attributes each portion to the right day.
- **Report navigation is independent** — changing the report period never moves the tracker's month.
- **Statistics** — completed, target, task count, overall percentage, best and lowest performing
  task.
- **Today indicator** — highlighted only when you are viewing the current month; past, present and
  future days are visually distinct, and future days remain markable.
- **Import / export** — export the current month or all data as JSON, and restore a backup after a
  validated preview.
- **Accounts** — email and password registration, sign-in, sign-out and password reset. Signed-out
  visitors see a landing page, never the tracker.
- **Private by construction** — every task, completion, session and running timer carries a
  `user_id` and is guarded by a Row Level Security policy. Filtering in the browser is treated as a
  convenience, never as a boundary.
- **Leaderboard** — rank everyone by total tracked time (with session count) or by total
  completions, for this month, last month or any earlier calendar month. Display names only; no
  emails, task names or individual sessions.
- **Totals that cannot be forged** — `duration_seconds` is a generated column derived by Postgres
  from the two instants, so a client cannot post a total. The leaderboard aggregates in SQL and
  returns a handful of rows rather than shipping anyone's history to the browser.
- **A timer that follows you** — the running timer lives on your account, one per user enforced by
  the primary key. Refresh, navigate or open another device and it is still there, still counting
  from when it started.
- **Consented migration** — data left over from the local-only version is offered for import after
  sign-in and uploaded only if you say yes. The local copy is never deleted.
- **Light / dark / system theme**, responsive layout and keyboard-accessible controls.

## Technology

| Concern        | Choice                                             |
| -------------- | -------------------------------------------------- |
| UI             | React 19 + TypeScript (strict)                     |
| Build          | Vite                                               |
| Styling        | Tailwind CSS v4                                    |
| Icons          | lucide-react                                       |
| Hosting        | Cloudflare Pages (static)                          |
| Backend        | Supabase — Postgres, Auth and Realtime             |
| Authorisation  | Postgres Row Level Security                        |
| Tests          | Vitest + Testing Library, plus integration against a real Supabase stack |

There is no custom server. Everything the browser cannot be trusted with — ownership, durations,
leaderboard totals — is enforced by the database itself.

## Getting started

```bash
npm install
cp .env.example .env        # then fill in your Supabase project details
npm run dev
```

Then open the URL Vite prints (http://localhost:5173 by default).

### Connecting to Supabase

Create a project at [supabase.com](https://supabase.com), then set two variables in `.env`:

```bash
VITE_SUPABASE_URL=https://your-project-ref.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-publishable-key
```

Apply the schema to that project:

```bash
npx supabase link --project-ref your-project-ref
npx supabase db push
```

Both variables are safe in a browser bundle: the URL is public, and the anon key only ever grants
what Row Level Security allows. **Never** put a service-role key in a `VITE_` variable — Vite inlines
those into the built JavaScript, and that key bypasses RLS entirely.

### Running a local Supabase stack

For development and for the integration tests, run the whole stack locally with Docker:

```bash
npm run supabase:start     # applies supabase/migrations to a local Postgres
npm run supabase:stop
npm run supabase:reset     # drop and re-apply every migration
```

`supabase start` prints a local API URL and anon key; put those in `.env` to develop against it.

### Running without a backend

Leave `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` unset and the app runs in its original
local-only mode: no sign-in, no leaderboard, everything in `localStorage`. This is what the `?demo`
mode and the unit test suite use, and it is why none of the domain logic knows that a database
exists.

### Scripts

```bash
npm run dev        # start the dev server
npm run build      # type-check and build for production into dist/
npm run preview    # serve the production build locally
npm run test       # run the test suite once
npm run test:watch # run tests in watch mode
npm run coverage   # tests with a coverage report
npm run typecheck  # TypeScript only
npm run lint       # oxlint

npm run supabase:start      # local Postgres + Auth + Realtime (needs Docker)
npm run supabase:stop
npm run supabase:reset      # re-apply every migration from scratch
npm run test:integration    # RLS, leaderboard and repository tests against it
```

### Always-on locally (optional)

To have a local build permanently available at http://localhost:4173 without starting anything by
hand, install the systemd user service in [`deploy/`](deploy/README.md). For anything shared, deploy
to [Cloudflare Pages](#deployment-to-cloudflare-pages) instead:

```bash
npm run build
cp deploy/monthly-task-tracker.service ~/.config/systemd/user/
systemctl --user daemon-reload
systemctl --user enable --now monthly-task-tracker
loginctl enable-linger   # optional: also start at boot, before login
```

Adjust `WorkingDirectory` and the absolute Node path in `ExecStart` first — see
[`deploy/README.md`](deploy/README.md).

### Demo mode

Append `?demo` to the URL (e.g. http://localhost:5173/?demo) to load example tasks — Gym, Study,
Korean and Reading — into a throwaway in-memory store. Demo data is **never** written to your real
saved data, and the same fixture is used by the tests.

## Project structure

```text
src/
  views/            one component per section: Tasks, Time Tracker, Reports
  components/       UI components (tracker table, dialogs, summary, controls)
    time/           timer panel, session list, manual entry, time charts
    ui/             generic building blocks (modal, confirm, progress ring/bar,
                    stat tile)
  auth/             AuthProvider (session + profile) and the auth contract
  data/             the persistence edge: TrackerOp, the local and Supabase
                    repositories, the timer store, the leaderboard source, the
                    write queue and the local-data migration
  hooks/            useTracker (all state + mutations), useActiveTimer,
                    useRoute, useTheme
  lib/              domain logic: dates, calculations, task operations, time
                    sessions, duration formatting, report ranges and the report
                    engine, validation, backup, appearance, demo fixture
  storage/          monthlyStorage and timerStorage — the only modules that
                    touch localStorage
  types/            shared TypeScript types, including the database row shapes
  test/             test setup

supabase/
  migrations/       the schema: tables, indexes, triggers, RLS policies and the
                    leaderboard functions
  tests/            integration tests that run against a real Postgres
```

UI, domain logic and persistence are kept separate: components never compute percentages or talk to
a backend, and the domain functions are pure and independently tested.

### How the cloud port fits the original design

The domain layer was not rewritten. The app still holds one in-memory document keyed by month, and
every mutation is still the same pure function it always was. What changed is only the edge:

```text
component → useTracker → pure function (new document, rendered immediately)
                       ↘ TrackerOp ("tick 2026-08-03 on task X")
                                   → write queue → repository → one SQL statement
```

`TrackerOp` is a small discriminated union naming every possible change. The local repository
ignores it and rewrites the whole `localStorage` document, exactly as before; the Supabase
repository turns it into the narrowest statement that expresses it, so ticking one day writes one
row rather than re-uploading a month. Swapping the two is the entire difference between local-only
mode and the cloud app.

## How data is stored

Signed in, everything lives in Postgres and the browser holds a cache assembled from it. Signed out —
or in a build with no Supabase credentials — the same document is kept in `localStorage` under
`monthly-task-tracker:v1` (the theme preference lives under `monthly-task-tracker:theme`, and a
running timer under `monthly-task-tracker:timer:v1`).

Either way the app thinks in the same month-keyed document:

```json
{
  "version": 2,
  "months": {
    "2026-08": {
      "tasks": [
        {
          "id": "5f3c…",
          "name": "Gym",
          "target": 20,
          "color": "#6366f1",
          "icon": "dumbbell",
          "completedDates": ["2026-08-01", "2026-08-03"],
          "createdAt": "2026-08-01T09:12:00.000Z"
        }
      ],
      "sessions": [
        {
          "id": "9ab1…",
          "taskId": "5f3c…",
          "startTime": "2026-08-03T06:10:00.000Z",
          "endTime": "2026-08-03T07:25:00.000Z",
          "durationSeconds": 4500,
          "createdAt": "2026-08-03T07:25:00.000Z"
        }
      ]
    }
  }
}
```

Version 1 documents — anything exported before the time tracker existed — load unchanged: a missing
`sessions` list simply reads as an empty one.

Completion dates are plain `YYYY-MM-DD` strings, so nothing shifts when your timezone does. Sessions
are ISO instants, because a stopwatch measures real elapsed time; they are reported on the local day
they started, and stored in the month that day belongs to. `durationSeconds` is always re-derived
from the two instants — in the cloud by a generated column, locally on load — so a hand-edited or
hand-posted value cannot inflate a total. Writes happen automatically on every change; there is
nothing to save manually.

### Time figures

```text
task time       = sum of durationSeconds of that task's sessions this month
per session     = task time / number of sessions
per completion  = task time / completions ticked in the grid
```

A session always belongs to exactly one task and one month. Deleting a task deletes its sessions;
sessions whose task has gone missing (from a hand-edited file) are reported separately in Reports and
never counted in the totals.

### Report periods

Reports work from a pair of inclusive day keys; the presets only generate that pair. `lib/reportRange.ts`
owns every boundary (`getStartOfWeek`, `getEndOfWeek`, `getThisWeekRange`, `getLastWeekRange`,
`getReportRange`, `shiftPeriod`) and `lib/reportEngine.ts` owns the aggregation
(`splitSessionByDay`, `getSessionsInRange`, `getTotalDuration`, `getTimeByTask`, `getTimeByDay`,
`getTimeByWeek`, `getTimeByMonth`, `getCompletionInRange`, `buildReport`). No component does date
arithmetic.

```text
average / day  = total tracked time / every calendar day in the range
                 (a week always divides by 7, empty days included)
week           = Monday → Sunday containing the anchor day
```

Because a range can span months, and tasks are defined per month, a report merges tasks by name and
sums the monthly targets of the months that actually define them.

Because the data lives in the browser profile, clearing site data for `localhost` removes it. Export
a backup before doing that.

### Percentages

```text
task percentage    = completed / target * 100
overall percentage = sum(completed across tasks) / sum(targets across tasks) * 100
```

The overall figure is weighted by target. With a 20-target task at 10 completions and a 5-target task
at 5 completions the result is `15 / 25 = 60%` — not the 75% a naive average would report.

### The database

| Table              | Holds                                     | Key columns                                          |
| ------------------ | ----------------------------------------- | ---------------------------------------------------- |
| `profiles`         | display name and email, one row per user  | `id` → `auth.users`, `display_name`, `email`, `created_at` |
| `tasks`            | task definitions, scoped to one month     | `user_id`, `month`, `name`, `target`, `color`, `icon` |
| `task_completions` | one row per ticked day                    | `user_id`, `task_id`, `date`, unique on `(task_id, date)` |
| `time_sessions`    | recorded intervals                        | `user_id`, `task_id`, `start_time`, `end_time`, generated `duration_seconds` |
| `active_timers`    | the running timer, at most one per user   | `user_id` **primary key**, `task_id`, `start_time`, `month` |

Tasks carry a `month` because the app has always treated each month's task list as its own set of
definitions, copied forward rather than shared — the schema mirrors the model rather than fighting
it. Indexes cover `user_id`, `task_id`, `start_time` and `end_time`, plus the composite lookups the
app actually issues (`(user_id, month)`, `(user_id, start_time)`, `(user_id, date)`).

Every foreign key cascades, so deleting a task takes its completions and sessions with it, and
deleting an account takes everything.

## Security

Ownership is enforced by the database, not by the interface:

- **Row Level Security is on for all five tables.** Each has `select` / `insert` / `update` /
  `delete` policies comparing `user_id` (or `id`, for profiles) to `auth.uid()`. A request for
  someone else's row returns an empty result, not a filtered one.
- **`anon` has no table access at all.** Signed-out visitors read nothing and cannot call the
  leaderboard functions.
- **Cross-user references are blocked too.** RLS stops you writing a row you do not own; a trigger
  stops you writing a row you *do* own that points at someone else's task.
- **Durations are generated.** `time_sessions.duration_seconds` is
  `GENERATED ALWAYS AS (floor(extract(epoch from (end_time - start_time))))`, with check constraints
  rejecting a negative interval or anything longer than 24 hours. PostgREST refuses to write it, so
  `total_time = 100000` is not a request the database will accept.
- **The leaderboard is a function, not a table.** `leaderboard_time` and `leaderboard_completions`
  are `SECURITY DEFINER`, take a month key rather than an arbitrary range, require an authenticated
  caller, aggregate with `SUM` / `COUNT … GROUP BY user_id`, and return only
  `rank, user_id, display_name, total`. No email, no task name, no timestamps, and no way to slice
  the data finely enough to reconstruct anyone's schedule.
- **Profiles are private.** A user reads only their own row; other people's display names reach the
  browser solely through the leaderboard functions.
- **Only public keys ship.** The client is built with the project URL and anon key. A service-role
  key must never appear in a `VITE_` variable, in the repository, or in Cloudflare's build
  environment for this project.

The [integration suite](#testing) checks these claims against a real Postgres rather than trusting
them.

## The leaderboard

Two rankings, switchable in the header:

```text
Rank  User     Total Time   Sessions        Rank  User     Completions
1     Alex     42h 18m      31              1     Alex     83
2     Islom    38h 42m      27              2     Islom    71
3     Daniel   34h 15m      29              3     Daniel   64
```

Periods are **whole calendar months** — August is 1 to 31 August, and "last month" is the complete
previous month, never a rolling thirty days. This month, last month, or step back to any earlier
month. Ties share a rank.

Totals are computed by Postgres and only the finished rows travel: a board of ten users is ten rows,
however many thousands of sessions sit behind them.

## Realtime

Realtime is used where it earns its keep and nowhere else:

- **The running timer** is replicated (`postgres_changes` on `active_timers`, filtered to your own
  row and further limited by RLS), so starting a timer on your phone shows it on your laptop.
- **The leaderboard** refreshes when someone records something, via a broadcast message that carries
  no data at all — receiving it only triggers the ordinary authoritative query. Table replication
  would be the wrong tool here, because one user must never receive another's session rows.

Tasks, completions, sessions and reports change in response to your own clicks, so they use ordinary
queries. Streaming them would be traffic for no benefit.

## Offline behaviour

The timer is safe offline by construction: elapsed time is always recomputed from the stored start
instant rather than accumulated, so losing the connection — or the tab, or the whole browser — does
not corrupt a running timer.

Writes go through an in-memory queue that applies them in order, one at a time. A write that fails
stays at the head of the queue instead of being dropped, a banner appears with a **Retry now**
button, and the queue drains itself when the browser fires `online`. A session recorded while
disconnected is therefore sent when the connection returns.

**Known limitations**, stated plainly rather than papered over with unreliable synchronisation:

- The pending queue lives in memory. Closing the tab while a write is still unsent loses that write;
  it is not replayed on the next visit.
- There is no offline read cache for cloud data. Loading the app with no connection shows a load
  error and a **Try again** button rather than a stale copy.
- There is no conflict resolution. The last write wins, which is correct for a single-user document
  edited from one device at a time, but two devices editing the same month simultaneously will not
  merge.

If you need dependable offline use, the local-only mode remains fully offline — that is what it is
for.

## Migrating from the local-only version

If this browser still holds data from before accounts existed, the app offers to import it once per
account after you sign in. Nothing is uploaded until you press the button, the dialog shows exactly
what would be imported and what it would replace, and the local copy is left in place either way —
you can still export it from the Data menu.

Legacy records used a non-UUID id format that Postgres cannot store; those ids are rewritten during
the import, consistently across tasks, completions and sessions, so nothing loses its links.

## Deployment to Cloudflare Pages

The build is a static bundle, so Pages needs no adapter.

| Setting                | Value          |
| ---------------------- | -------------- |
| Build command          | `npm run build` |
| Build output directory | `dist`         |
| Node version           | 20 or newer    |

Add the two variables under **Settings → Environment variables**, for both Production and Preview:

```text
VITE_SUPABASE_URL
VITE_SUPABASE_ANON_KEY
```

They are read at build time, so changing one requires a redeploy. `public/_redirects` sends every
path to `index.html` so a refresh or a direct link never 404s.

Finally, in the Supabase dashboard under **Authentication → URL Configuration**, set the site URL to
your Pages domain and add it to the redirect allow-list — otherwise confirmation and password-reset
links will bounce.

## Import / export

From the **Data** menu in the header:

- **Export \<month\>** — downloads just the month you are viewing, tasks and sessions together.
- **Export all data** — downloads every month.
- **Import data…** — pick a previously exported `.json` file.
- **Reset this month's progress** — clears completions, keeps tasks and tracked time.
- **Clear this month's tracked time** — deletes the month's sessions, keeps tasks and completions.

Import is validated before anything is replaced: malformed months, nameless tasks, non-positive
targets and dates that do not belong to their month are dropped, unknown icons and colours fall back
to defaults, sessions with an unreadable interval or a task that is not in their month are dropped,
sessions longer than 24 hours are clamped, and you get a preview of what the file holds versus what
you have now. Importing
replaces all existing data, so export a backup first — the confirmation dialog says so explicitly.

## Accessibility

Semantic table markup with row/column headers, labelled buttons, `aria-pressed` day toggles, arrow
key navigation across the grid, focus-trapped dialogs with Escape to close, a skip link, a visible
focus ring, and reduced-motion support. The charts never rely on colour alone: every bar is directly
labelled and the same numbers are available as a table, and the daily chart carries a screen-reader
table of its values.

## Testing

```bash
npm run test
```

The suite covers percentage maths (including exceeding the target and the weighted overall figure),
calendar handling (28/29/30/31-day months, leap years, month arithmetic), task CRUD and toggling,
copying a previous month, storage round-trips and recovery from corrupt data, import validation,
duration parsing and formatting, session CRUD, time statistics (including the worked
`14h 35m` / `21h 10m` example), timer start/stop/discard with a fake clock, hash routing, report
periods (Monday-first weeks from every weekday, month and year boundaries, stepping, labels), the
report engine (range filtering, midnight splitting, zero-filled days, seven-day averages, busiest-day
ties, per-period completion), the row-to-document translation and its legacy-id rewriting, the write
queue (ordering, holding a failed write, retrying, draining on reconnect), leaderboard periods, the
leaderboard table, and end-to-end passes over the UI (create, mark, unmark, edit, delete, reset,
navigate months, persist across a reload; and navigate sections, run the timer, add and delete
sessions, read the report).

### Integration tests

Row Level Security, generated columns and SQL aggregation only exist in Postgres, so those are
tested against a real one rather than a mock. Every client in the suite is a genuinely signed-in
user holding a real JWT — never the service role, because a policy that only holds for a privileged
connection is not a policy.

```bash
npm run supabase:start      # needs Docker
npm run test:integration
```

Fifty tests covering:

- **Isolation** — user A cannot read, update or delete user B's tasks, completions, sessions or
  running timer, in both directions; cannot insert a row on someone else's behalf; and cannot attach
  a session or a completion to someone else's task. Signed-out visitors read nothing.
- **Privacy** — a user reads only their own profile row, so emails never cross accounts, and cannot
  rename anyone else.
- **Leaderboard** — ten accounts with ten different totals, ranked correctly by time and by
  completions, identical for every viewer, sharing ranks on a tie, and exposing only name, rank and
  total.
- **Boundaries** — the first and last instants of a month counted, the neighbours excluded, the
  December/January year boundary handled, empty months reported as empty, malformed month keys
  falling back rather than failing.
- **Forgery** — a client-supplied `duration_seconds` rejected, a backwards interval rejected, a
  session over 24 hours rejected, a day counted once however often it is ticked.
- **Repository and timer** — the full round trip through the real schema, cascade on delete, import
  replacing only the importing user's data, legacy ids rewritten, one timer per user under
  concurrent starts, and the start instant stamped by the database rather than the caller.

## GitHub

```bash
# create the repository and push (requires an authenticated gh CLI)
gh repo create monthly-task-tracker --private --source=. --remote=origin --push

# or, with an existing empty repository
git remote add origin git@github.com:<your-username>/monthly-task-tracker.git
git push -u origin main
```

## License

MIT
