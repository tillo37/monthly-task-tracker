# Running the tracker in the background

`monthly-task-tracker.service` is a systemd **user** service that serves the production build so the
app is always available at http://localhost:4173 — no terminal, no `npm run dev`.

## Install

```bash
npm install
npm run build

cp deploy/monthly-task-tracker.service ~/.config/systemd/user/
systemctl --user daemon-reload
systemctl --user enable --now monthly-task-tracker
```

Two lines in the unit are machine-specific and must match your setup:

- `WorkingDirectory` — where this repository is checked out.
- `ExecStart` — an **absolute** path to the Node binary. If you use a version manager such as fnm or
  nvm, the `node` on your `PATH` is a per-shell symlink (e.g. under `/run/user/1000/...`) that does
  not exist for a systemd service. Use the real install path:

  ```bash
  readlink -f "$(which node)"
  ```

  Re-point this line after upgrading Node, or the service will fail to start.

## Start at boot instead of at login

A user service normally starts when you log in. To run it from boot, and keep it running after you
log out, enable lingering:

```bash
loginctl enable-linger        # falls back to: sudo loginctl enable-linger "$USER"
loginctl show-user "$USER" -p Linger   # expect Linger=yes
```

## Day to day

```bash
npm run build && systemctl --user restart monthly-task-tracker   # after code changes
systemctl --user status monthly-task-tracker
journalctl --user -u monthly-task-tracker -f
systemctl --user disable --now monthly-task-tracker              # uninstall
loginctl disable-linger                                          # stop running at boot
```

## Do not change the port

Tracker data lives in `localStorage`, which is scoped per origin. `localhost:4173` and
`localhost:5173` are different origins with **separate** databases, so changing the port makes
existing data appear to vanish. Pick one port and keep it. If you must move, export your data first
(Data → Export all data) and import it on the new port.
