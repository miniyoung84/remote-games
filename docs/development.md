# Development

## Environment isolation

This is a Node/TypeScript project, so isolation works differently than a Python
`venv` — but the guarantees are the same, and nothing here installs to or
depends on anything global.

| Python | Here | Effect |
| --- | --- | --- |
| `python -m venv .venv` | `node_modules/` | Dependencies install **into the project directory**, never system-wide. This is Node's default, not something you opt into. |
| `.python-version` / `pyenv` | `.nvmrc` | Pins the Node version (24.13.1). |
| `pip==X` pinned in the venv | `"packageManager"` in `package.json` + Corepack | Pins npm to 11.15.0 so the resolver behaves identically on every machine. |
| `requirements.txt` | `package.json` | Declares dependencies. |
| `pip freeze` / lockfile | `package-lock.json` | Exact transitive versions. Committed. |
| `pip install -r requirements.txt` | `npm ci` | Reproducible install straight from the lockfile. |

There is no activate/deactivate step because there is nothing to activate —
`npm` resolves binaries from `./node_modules/.bin` when run inside the project
directory. Deleting `node_modules/` is the equivalent of deleting a venv, and is
always safe.

## Setup

```bash
nvm use              # or: nvm install, if you don't have 24.13.1 yet
corepack enable      # pins npm to the version in package.json
npm ci               # reproducible install from the lockfile
```

Use `npm ci`, not `npm install`, unless you are deliberately changing
dependencies. `npm ci` installs exactly the lockfile and fails if
`package.json` and the lockfile disagree; `npm install` will quietly update the
lockfile.

## Commands

```bash
npm run dev        # dev server + game server on http://127.0.0.1:5173
npm start          # same, from a production build (run `npm run build` first)
npm run build      # typecheck, then build to dist/
npm test           # bracket logic tests
npm run typecheck  # typecheck only
npm run shot       # screenshot the display and host views (see below)
```

`npm run dev` runs the websocket game server inside Vite, so one command is the
whole app. For a real meeting prefer `npm run build && npm start` — it avoids
hot-reloading the display while people are watching it.

## Verifying isolation

If you want to confirm nothing leaks to the global environment:

```bash
rm -rf node_modules
npm ci
npm run build
```

A clean build from an empty `node_modules/` proves every dependency is declared
and local. `node_modules/` and `dist/` are gitignored.

## Stronger isolation, if you want it

The setup above isolates dependencies but shares your system's Node binary. For
full isolation — a pinned OS-level toolchain that cannot interact with anything
on your machine — add a devcontainer or a `Dockerfile` based on
`node:24.13.1-slim`. Not currently set up, since the local workflow needs a
browser window on your own desktop to screenshare anyway.

## Running a session

You need two windows on two monitors:

1. `npm run build && npm start`
2. Open **`/host`** on your primary monitor. Add whoever is in the meeting to
   the roster, pick a bracket set, and hit **Start**.
3. Open **`/display`** on your second monitor and fullscreen it (F11).
4. In Teams or Discord, share **the display window specifically** — not your
   whole screen. The host view contains the controls and is marked with a pink
   "do not share" banner precisely because this is the mistake to avoid.

During play: tap whoever raised their hand to put them on the clock, then click
the winner of the matchup. Keyboard shortcuts are **A** / **←** for the left
entrant, **B** / **→** for the right, and **U** to undo.

The roster and the bracket both survive a restart, so a bracket can span several
days of standups with different people present each day.

## Editing bracket sets

Two equivalent routes — both write the same files:

- **In the host view.** The bracket sets panel lists every set. Click one to
  load it into the editor, or hit **New**. Entries are one per line. The editor
  previews the bracket shape as you type ("10 entries → 16-slot bracket, 9
  matchups, 6 byes").
- **On disk.** One JSON file per set in `data/sets/`:

  ```json
  {
    "id": "office-snacks",
    "title": "Best Office Snack",
    "subtitle": "Settle it once and for all",
    "items": ["Pretzels", "Cheez-Its", "..."],
    "updatedAt": 0
  }
  ```

  Files are read on demand, so a set added by hand shows up as soon as the host
  view refreshes its state.

Any number of entries from 2 up works; non-powers-of-two get byes automatically.
Over 16 entries the board gets cramped on the display, and the editor says so.

To invent new sets, [docs/generating-bracket-sets.md](generating-bracket-sets.md)
has a copy-paste prompt that outputs sets in exactly this JSON shape.

## Screenshots

`npm run shot` captures `/display` and `/host` against a running server, so you
can check a visual change without booting a meeting:

```bash
npm start &            # or npm run dev
npm run shot           # writes screenshots/
npm run shot -- out 5199   # custom directory and port
```

This needs a browser Playwright can drive, which is **not** installed by
`npm ci` — run `npx playwright install chromium` once if you want screenshots.
Nothing else in the project depends on it.
