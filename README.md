# Monthly Task Tracker

A local-first monthly habit and to-do completion tracker, inspired by the spreadsheet trackers where
every task has a monthly target and each day gets ticked off.

Set a target for each task ("Gym, 20 times this month"), tick the days you actually did it, and the
per-task and weighted overall percentages update instantly. A built-in **time tracker** then records
how long you actually spend on those same tasks, so a month reads as
`Gym · 12 / 20 · 60% · 14h 35m`. Everything lives in your browser — no account, no server, no
network.

The app has three sections, reachable from the header and linkable by URL hash:

| Section          | Hash              | What it does                                        |
| ---------------- | ----------------- | --------------------------------------------------- |
| **Tasks**        | `#/tasks`         | the monthly tracker grid (the original app)          |
| **Time Tracker** | `#/time`          | stopwatch and manual entry, plus `#/time/sessions`   |
| **Reports**      | `#/reports`       | time and completion analytics for any period          |

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
- **Light / dark / system theme**, responsive layout and keyboard-accessible controls.
- **Offline** — after `npm install`, the app never talks to the network.

## Technology

| Concern     | Choice                              |
| ----------- | ----------------------------------- |
| UI          | React 19 + TypeScript (strict)      |
| Build       | Vite                                |
| Styling     | Tailwind CSS v4                     |
| Icons       | lucide-react                        |
| Tests       | Vitest + Testing Library (jsdom)    |
| Persistence | `localStorage` via a storage module |

No backend, no database, no authentication, no Docker.

## Getting started

```bash
npm install
npm run dev
```

Then open the URL Vite prints (http://localhost:5173 by default).

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
```

### Always-on (optional)

To have the tracker permanently available at http://localhost:4173 without starting anything by
hand, install the systemd user service in [`deploy/`](deploy/README.md):

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
  hooks/            useTracker (all state + mutations), useActiveTimer,
                    useRoute, useTheme
  lib/              domain logic: dates, calculations, task operations, time
                    sessions, duration formatting, report ranges and the report
                    engine, validation, backup, appearance, demo fixture
  storage/          monthlyStorage and timerStorage — the only modules that
                    touch localStorage
  types/            shared TypeScript types
  test/             test setup
```

UI, domain logic and storage are kept separate: components never compute percentages or read
storage, and the domain functions are pure and independently tested.

## How data is stored

All data is kept in your browser's `localStorage` under the key `monthly-task-tracker:v1` (the theme
preference lives under `monthly-task-tracker:theme`, and a running timer under
`monthly-task-tracker:timer:v1`). Nothing is uploaded anywhere.

The document is keyed by month:

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
from the two instants on load, so a hand-edited value cannot inflate a total. Writes happen
automatically on every change — there is nothing to save manually.

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
ties, per-period completion), and end-to-end passes over the UI (create, mark, unmark, edit, delete, reset, navigate months, persist
across a reload; and navigate sections, run the timer, add and delete sessions, read the report).

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
