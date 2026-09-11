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
npm run fit        # check the display is centered at every monitor size
npm run sets       # regenerate the set list in the bracket-set prompt
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
2. Open the menu at **`/`**. It lists the games, shows whether one is already in
   progress, and **Set up both windows** opens the display in its own window and
   takes you to the host controls.
3. Fullscreen the display on your second monitor (F11).
4. In Teams or Discord, share **the display window specifically** — not your
   whole screen. The host view contains the controls and is marked with a pink
   "do not share" banner precisely because this is the mistake to avoid.

During play: tap whoever raised their hand to put them on the clock, then click
the winner of the matchup. Keyboard shortcuts are **A** / **←** for the left
entrant, **B** / **→** for the right, and **U** to undo.

The roster and the bracket both survive a restart, so a bracket can span several
days of standups with different people present each day.

## Running a draft

Pick **Draft** in the host view and the set library hides itself — there's
nothing to choose from. Give it a topic and how many picks each person gets,
then hit Start.

On someone's turn, tap their name to put them on the clock, type what they said,
and press Enter. The clock clears after every pick so the next person has to be
called on deliberately. If the pick duplicates something already taken you're
told who has it, but nothing stops you.

Every pick is announced on the display before it lands: a card with the pick
number (1.01, 1.02… 2.01 — someone's second pick is their round two), who, and
what, with the sting playing if sound is on, and then the board takes it. That
holds the display for about three seconds, so give it a beat before the next
name.

The pick that just went up gets a **find a picture** button right under the
entry field — the same reviewer as everywhere else, a couple of seconds, one
click — and every pick on the host board is clickable for the same thing
later. Pictures go on the running draft only; there's no set to save them to.

## Adding an item mid-game

Someone always remembers one that isn't on the list. The tier list host panel
has an add field: type it, hit Enter, and it joins the back of the queue so it
doesn't jump ahead of what's waiting.

Whatever's on the clock also gets a **find a picture** button, which opens the
usual reviewer scoped to that one item — a couple of seconds, then Use this.
Handy for something you just added, and for anything already on the board that
turned up bare.

Both change the running game only; the set on disk is untouched, so edit the
set if you want them next time.

## Tier list modes

Pick **One at a time** or **Choose any** next to the game selector before
starting. One at a time gives each person the next item off the queue. Choose
any shows the whole unsorted tray and lets them pick — in the host view, click
something under *Up next* (or any chip already on the board, to move it), then
hit a tier.

Tiers run S, A, B, C, D, F.

## Item art

Items may carry optional art, which both games render — big in the on-the-clock
band, small on the board:

```json
{ "label": "Mango", "art": { "emoji": "🥭" } }
{ "label": "Teal",  "art": { "color": "#14b8a6" } }
{ "label": "Bad pun" }
```

Plain strings still work, so sets written before art existed are untouched. The
host editor has an **Art** row per entry: type an emoji, pick a color, or upload
an image.

Four ways to give an entry an image, all ending in the same place: pick a file,
**drop one dragged straight out of a web page**, **paste** a copied image or
image URL, or hit **Find images**.

Find images walks the entries that have no art yet, one at a time, offering
candidates from Wikimedia Commons — use it, skip to the next candidate, skip the
entry, or edit the search. Nothing is applied in bulk: search is good for
concrete things (Otter, Mango, Hot air balloon, even Cheez-It) and useless for
abstract ones (Bad pun), so every image is a deliberate yes.

Commons was chosen over an image-search API because it needs **no API key** —
nothing to configure, nothing to leak — and everything on it is **freely
licensed**, which matters because a pack embeds image bytes. The license and
photographer are shown before you accept and kept alongside the image.

Uploads are resized to 320x320 and re-encoded as WebP **in the browser**, then
named by a SHA-256 of their own bytes and sent over the existing websocket. That
means no image library on the server, identical images dedupe for free, and
every stored image is already the size the display wants. They land in
`data/images/<id>.webp`, which is **gitignored** — they'd bloat the repo, and
republishing sourced images under this project's license isn't ours to do.
Share them with a pack instead.

If a set is deleted, its images become orphans; the Packs panel offers to
remove any image no set references.

One thing to keep in mind about images you drop or paste in yourself: they stay
out of the repo, but **a pack embeds them**, so sharing a pack shares whatever
you pulled. Images from Find images are CC-licensed and carry their license with
them, so those are safe to pass around.

Emoji beat photographs at the ~120px a board chip gets, and colors beat both for
a set like Best Color. About a third of the library is abstract enough that no
art helps, and those sets are deliberately left plain.

## Sound

Off by default. **Sound on/off** in the host view toggles it, and the display
then asks for one click to enable audio — browsers won't start it otherwise.
Click it while you're setting the window up, before you share.

What you'll hear: a thunk when a tier list item is placed, a whoosh when one is
moved, a knock on every bracket pick that climbs in pitch as the bracket
narrows, a short chord when a round finishes, a longer one for a champion or a
finished list, and a sting when a draft pick is announced. The sting is the one
sound that's a file — `public/sounds/draft-pick.ogg`; swap it for another Ogg
and the announcement uses that instead.

For anyone else to hear it you must also share computer audio: Teams has an
"include computer sound" tick on the share dialog, Discord's Go Live picks up
application audio on its own. Assume some of the room won't hear it — nothing
in either game depends on sound.

## Editing sets

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

A set can hold **more than 16** entries. A bracket draws the **top 16 seeds**
and the rest sit out — past that the board stops being readable on a shared
screen. A tier list takes everything, however many there are. The set editor
spells out both counts as you type.

**The order of the entries is the bracket seeding.** Entry 1 is the top seed,
entry 16 the bottom, and standard tournament seeding draws them against each
other — so list them biggest name first. Among fruit that makes Apple the 1
seed and Coconut the 16. Byes fall on the top seeds, which is also why the
order matters.

Because of that, **shuffle is off by default for brackets** and on for tier
lists, where there's no seeding to preserve and a random queue keeps it fresh.
Tick shuffle on a bracket and you get a random draw with meaningless seed
numbers, which is sometimes what you want.

Any number of entries from 2 up works; non-powers-of-two get byes automatically.
Over 16 entries the board gets cramped on the display, and the editor says so.

To invent new sets, [docs/generating-bracket-sets.md](generating-bracket-sets.md)
has a copy-paste prompt that outputs sets in exactly this JSON shape.

## Packs

A pack is a single JSON file holding sets *and* the bytes of every image they
use, so it survives being emailed or dropped in a chat with nothing missing.

- **Export** — name it, then **Export all**, or **Choose sets…** to tick a
  subset. It downloads as `<name>.pack.json`.
- **Import** — drop the file on the Packs panel. Sets whose id already exists
  are **renamed rather than overwritten**, so someone else's pack can never
  quietly replace a set you've edited. The result is reported back: how many
  sets, images, renames and skips.

Packs are also the backup story for `data/images/`, since that directory is
gitignored. Export all before you wipe a machine.

**Getting the shipped images.** The five photo sets reference images that aren't
in the repo. On start, the server restores any image a committed set references
from the packs in `packs/`, so a fresh clone needs no extra step — `npm start`
and they're there. `npm run restore` does it by hand. It only writes ids a set
actually asks for, so a pack can't drop loose files into your tree, and it does
nothing once everything is present.

## Bulk art

`npm run art -- <setId> --hint <word>` fills every entry that has no art from
Wikimedia Commons, using the same path the host UI uses. The hint is appended to
each search and matters a lot — "Penne" alone finds a novel, "Penne pasta" finds
pasta.

Expect to review the result. Bulk search is confidently wrong often enough that
the picker refuses candidates whose title never names the thing, skips drawings
and diagrams in favour of photographs, and filters explicit filenames outright —
Commons is not curated for a workplace audience, and one first-pass result was
plainly unusable. Even so, roughly one entry in ten needs replacing.

For those, `--fixes <file.json>` takes `{ "<setId>": { "<label>": "better
search" } }` and redoes only those entries, trusting your query over the
ranking.

## Checks

```bash
npm test            # unit tests, no server needed
npm run smoke -- 5173   # end-to-end against a running server
npm run fit -- 5173     # display placement across monitor sizes
npm run motion -- 5173  # rendering: sizing, labels, flights, announcements
```

`motion` plays real games through the display and screenshots each stage into
`screenshots/motion/`, so run it against a server nobody is sharing. It's the
check that a chip flies exactly once, that six chips in a row stay full size,
that no label is truncated, and that nothing is still animating once a board
has settled.

## Screenshots

`npm run shot` captures `/display` and `/host` against a running server, so you
can check a visual change without booting a meeting:

```bash
npm start &            # or npm run dev
npm run shot           # writes screenshots/
npm run shot -- out 5199   # custom directory and port
```

`npm run fit -- 5199` uses the same browser to verify the display lands centered
and fully on screen across nine monitor sizes, including the scaled-DPI cases
that are easy to break and impossible to notice on one machine.

Both need a browser Playwright can drive, which is **not** installed by
`npm ci` — run `npx playwright install chromium` once if you want them.
Nothing else in the project depends on it.
