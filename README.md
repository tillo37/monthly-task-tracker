# Monthly Task Tracker

A local-first monthly habit and to-do completion tracker, inspired by the spreadsheet trackers where
every task has a monthly target and each day gets ticked off.

Set a target for each task ("Gym, 20 times this month"), tick the days you actually did it, and the
per-task and weighted overall percentages update instantly. Everything lives in your browser — no
account, no server, no network.

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

### Demo mode

Append `?demo` to the URL (e.g. http://localhost:5173/?demo) to load example tasks — Gym, Study,
Korean and Reading — into a throwaway in-memory store. Demo data is **never** written to your real
saved data, and the same fixture is used by the tests.

## Project structure

```text
src/
  components/       UI components (tracker table, dialogs, summary, controls)
    ui/             generic building blocks (modal, confirm, progress ring/bar)
  hooks/            useTracker (all state + mutations), useTheme
  lib/              domain logic: dates, calculations, task operations,
                    validation, backup, appearance, demo fixture
  storage/          monthlyStorage — the only module that touches localStorage
  types/            shared TypeScript types
  test/             test setup
```

UI, domain logic and storage are kept separate: components never compute percentages or read
storage, and the domain functions are pure and independently tested.

## How data is stored

All data is kept in your browser's `localStorage` under the key `monthly-task-tracker:v1` (the theme
preference lives under `monthly-task-tracker:theme`). Nothing is uploaded anywhere.

The document is keyed by month:

```json
{
  "version": 1,
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
      ]
    }
  }
}
```

Dates are plain `YYYY-MM-DD` strings, so nothing shifts when your timezone does. Writes happen
automatically on every change — there is nothing to save manually.

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

- **Export \<month\>** — downloads just the month you are viewing.
- **Export all data** — downloads every month.
- **Import data…** — pick a previously exported `.json` file.

Import is validated before anything is replaced: malformed months, nameless tasks, non-positive
targets and dates that do not belong to their month are dropped, unknown icons and colours fall back
to defaults, and you get a preview of what the file holds versus what you have now. Importing
replaces all existing data, so export a backup first — the confirmation dialog says so explicitly.

## Accessibility

Semantic table markup with row/column headers, labelled buttons, `aria-pressed` day toggles, arrow
key navigation across the grid, focus-trapped dialogs with Escape to close, a skip link, a visible
focus ring, and reduced-motion support.

## Testing

```bash
npm run test
```

The suite covers percentage maths (including exceeding the target and the weighted overall figure),
calendar handling (28/29/30/31-day months, leap years, month arithmetic), task CRUD and toggling,
copying a previous month, storage round-trips and recovery from corrupt data, import validation, and
an end-to-end pass over the UI (create, mark, unmark, edit, delete, reset, navigate months, persist
across a reload).

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
