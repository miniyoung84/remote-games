# Architecture

## Why a browser page

The game renders as a local web page and the host screenshares the window.

- One implementation works identically on Teams, Discord, Zoom and Slack.
- Web tech gives the best visual result per hour of effort.
- No install for the host, no install for anyone else.
- Fullscreen removes the browser chrome, so the shared window reads as an app.

Native (Electron, Unity, Godot) buys nothing here — the audience sees pixels in
a video stream either way — and costs a build pipeline.

## View roles

There are three roles. Every game declares which subset it uses; they are not
separate architectures.

| Role | Where it runs | Purpose |
| --- | --- | --- |
| `display` | Second monitor, fullscreen, **this is the shared window** | Pure projection of game state. Takes no input. |
| `host` | Primary monitor | Private control surface. Holds secrets, drives the roster, advances turns. |
| `player` | Phone, one per player | Optional. **Deferred — not being built yet.** |

The host machine has multiple monitors, so the host view is a desktop window on
the primary monitor while the display is fullscreened on the secondary one.

**Build the host view responsive anyway.** The same view then works as a page on
a phone with no changes, which is what a single-monitor setup would require and
is also most of the work of the deferred `player` role.

## Roster, not turn order

Turn order is emergent — people raise their hand in the Teams meeting and the
host calls on them. The host view therefore needs a **live roster**, not a
precomputed sequence:

- Add and remove attendees during the meeting as they show up.
- Tap whoever raised their hand to make it their turn.
- Never assume any specific person is present, or that anyone gets an equal
  number of turns.

The display shows whose turn it is. That alone is useful enough that the shell
gets opened every day, which is what keeps the games from becoming a novelty
someone has to remember to run.

## State

State is server-authoritative. The display and host are both clients of it.

It is tempting to use `BroadcastChannel` for the local display↔host case since
both windows are same-origin on one machine, and it is free. Don't: it makes
the eventual `player` role a second transport with a second sync path, and the
two will diverge. One server, one transport, one code path. A server also gives
authoritative state for free — no leader election, no "which window is real."

### Game interface

```
game = {
  id, title,
  initialState,
  reducer(state, action, meta),
  project(state, role, playerId),
  views: { display, host?, player? }
}
```

### Sharing a port with Vite's HMR socket

The game server attaches with `noServer: true` and its own `upgrade` listener
that claims only `/ws`. Do **not** use `new WebSocketServer({ server, path })`:
given a `server`, `ws` claims every upgrade request on it and aborts the ones
whose path doesn't match. In dev that kills Vite's HMR socket, Vite's client
reloads the page trying to recover, and the display ends up reloading dozens of
times a second.

Vite's file watcher also ignores `data/`, because the server writes
`data/state.json` on every pick and a watched write means a full page reload on
the window everyone is looking at.

### `project()` is required, not optional

Never broadcast full state to every role. The display must not receive the
answer before the reveal, and a player must not receive another player's hand.
Make `project()` a mandatory part of the game interface so it cannot be
forgotten — retrofitting it later means auditing every game that exists.

### The server owns every timer

Chrome throttles `setInterval` to 1s in backgrounded tabs, and an occluded
window can be treated as hidden. The display window **will** be unfocused while
the host types in the host window. A display that counts down locally will
drift or stall.

Broadcast an `endsAt` timestamp and let the display render the delta.

### The display takes zero input

No keyboard handlers, no focus requirements. It is a pure projection. Otherwise
an unfocused display window becomes a dead display window.

**One exception, and only one:** browsers refuse to start audio without a user
gesture on that page, so when sound is switched on the display shows a single
"click to enable sound" chip. It is dismissed during setup, before anything is
shared, and never reappears. Without it the `AudioContext` sits suspended and
every sound is silently dropped.

### Persistence

Board state persists across days. This is a shell feature, not a per-game one —
it is what allows a bracket or a minesweeper board to span a week of standups
with different people present each day.

## The fixed 1080p stage

The display renders at a fixed 1920×1080 and CSS-scales to fit the window
(`src/stage.ts`). The shared output then looks identical regardless of how the
host sized the browser, and the layout cannot silently degrade mid-meeting.

## Operational notes

- **Mark the host view unmistakably.** A loud "HOST VIEW — NOT FOR SHARING"
  treatment is cheap insurance for the day the host shares the whole screen
  instead of the window and leaks the answers.
- **Window capture can render black.** On some Windows GPU configurations an
  occluded window captures as black. If that happens, share the monitor rather
  than the window.

## Implementation map

```
src/shared/     types, wire protocol, and the pure bracket logic (shared by
                both sides so the host and display can never disagree)
src/server/     store (disk persistence), reducer (actions -> state),
                project (per-role views), index (websocket server)
src/client/     connection (reconnecting socket), display/, host/
data/sets/      one JSON file per bracket set
data/state.json runtime state — gitignored, survives restarts
```

### Two games, one shell

`AppState.game` is a discriminated union on `kind`. The roster, turn-taking,
persistence and the on-the-clock band are shared; each game contributes a
reducer branch, a projection branch, a display renderer and a host panel. The
display swaps renderers when the running game changes.

Both games read the same `data/sets/` content, so item art added for one shows
up in the other.

### How the draft works

The odd one out: a draft has **no set and no pool**. The topic is typed, and so
is every pick, because the point is that nobody is limited to a list. That makes
it the first game where the *roster* is the board — each person owns a column —
which is why it was worth building third.

Same ordered log as the others, so undo is unchanged. Two consequences of
emergent turn order are handled deliberately: a pick with nobody on the clock is
refused outright (an unattributed pick makes the board a lie), and since a fixed
snake order is impossible, the host view surfaces who has the fewest picks
instead. Columns cover everyone present *plus* anyone who has already drafted,
so leaving the meeting never erases what you picked.

### How the tier list works

Like the bracket, it stores an ordered log rather than a derived board: an
item's tier is simply its most recent placement. **Moving is therefore the same
operation as placing**, undo is "drop the last entry", and the display can tell
the two apart because a replay knows whether that item had a previous tier.

The display animates with FLIP — render the new positions, invert every chip to
where it was, then transition home. One consequence worth knowing: the stage is
CSS-scaled, so a screen-space delta must be divided by that scale before being
used as a local transform, or the scaling is applied twice.

### How the bracket game works

A game is stored as **seeding plus an ordered decision log**, never as a derived
board. `buildBracket()` replays the log to produce the board, so:

- **Undo** is "drop the last decision and rebuild" — it cannot leave the board
  half-updated.
- The board is deterministic; the same log always yields the same bracket.
- Persistence is trivial, because the log is small and complete.

**Byes.** Sets that aren't a power of two are padded up. Standard tournament
seeding guarantees every bye faces a real entrant, so no match is ever empty on
both sides; byes resolve themselves before anyone picks. An n-entrant set always
takes exactly n-1 real picks. This is property-tested for every size from 3 to
64 in `src/shared/bracket.test.ts`.

**Turn attribution.** The host taps whoever raised their hand, then records the
pick. Deciding a matchup clears the current picker, so the host has to call on
the next person rather than silently attributing two picks to one person.

**Stage placement.** The stage is anchored top-left with
`transform-origin: 0 0` and positioned by a computed `translate()`, not centered
by CSS. Centering with a grid and scaling about the element's center looks
correct at 1920x1080 and is wrong everywhere else: once the viewport is smaller
than the stage — browser chrome, or any Windows machine at 125%/150% display
scaling — the browser clamps the overflowing item to the start edge, and
scaling about its own center then pushes the whole display down and right, off
the screen. `npm run fit` checks placement across nine monitor configurations.

**Display sizing.** The board is a progress map, not reading material — a
16-entrant bracket cannot hold 24px type and still fit in 1080p. The band along
the bottom carries the live matchup at 56px, which is what people actually read.
Slot heights are calibrated per bracket size in `display.css`; they are keyed on
**first-round match count** (half the entrant count).

## Sound

Synthesized with the Web Audio API rather than shipped as files: the sounds
needed here are a thunk, a whoosh, a blip and two chords, which is less code
than a loader and carries no licensing surface — the same reason images stay out
of the repo.

`renderSound()` is deliberately split from playback so the identical synthesis
can be rendered into an `OfflineAudioContext` and measured. A sound that has
quietly become silence is otherwise invisible; the checks assert peak, RMS and
duration, and for the escalating sounds, pitch.

Bracket picks take an `intensity` from how deep the round is, lifting the pitch
as the field narrows — roughly 101Hz in the opening round to 217Hz for the
final. Finishing a round adds its own short chord, offset so it doesn't collide
with the pick that caused it.

## Images and packs

Images are **content-addressed**: the id is a hash of the bytes, computed by the
uploading browser. Identical images dedupe, ids can't collide when two packs
meet, nothing has to invent filenames, and the strict `^[a-f0-9]{32}$` id shape
is what stops a crafted id walking out of the directory.

Because the id is derived client-side, upload needs no response — the browser
already knows the id and can reference it immediately. `images/put` is a plain
one-way action like every other.

Images can also come from the web — dropped out of a page, or pasted as a URL.
The browser can't fetch those itself: drawing a cross-origin image to a canvas
taints it, and the resize step needs `toBlob()`. So `/fetch-image` retrieves the
bytes server-side and returns them same-origin, after which the normal
resize-hash-upload path runs unchanged.

That endpoint takes a URL from the user, so it guards against being pointed at
the local network: http/https only, private and link-local addresses refused,
**every redirect hop re-checked** (a public URL can otherwise bounce to a
private one), a size cap and a timeout. IPv6 literals arrive from
`URL.hostname` still wrapped in brackets, which has to be stripped or the
literal check silently misses them.

`/suggest-images` queries Wikimedia Commons. It was picked over an image-search
API for two reasons that both matter here: no API key, so there's nothing to
configure or leak from a public repo, and everything is freely licensed, which
matters because packs embed image bytes. Results are cached for half an hour to
be a polite client. The license travels with the image in `Art`, since a
CC BY-SA photo shouldn't lose its attribution the moment it's stored.

`src/server/http.ts` serves `/images/:id` and `/pack.json`, and is mounted by
both the Vite dev middleware and the production server so the two behave
identically. Pack export is an ordinary HTTP download rather than a websocket
message, which is what makes `Content-Disposition` do the work.

## The menu

`/` lists the games from `src/shared/games.ts` and is the only place that knows
more than one game could exist. It connects read-only to see whether a game is
already running, and launches the display as a **named popup window** rather
than a tab — a tab can't be screenshared without exposing every other tab you
switch to.

Adding a game means adding a registry entry with `status: "ready"` and its two
routes; the card, the launcher and the status line follow from that.

## Deferred

- **Phone controllers (`player` role).** Needs the local server reachable from
  phones — a tunnel (`cloudflared tunnel --url http://localhost:5173`) or a real
  deploy. Not worth building until a game needs it.
- **Discord Activities.** The Embedded App SDK runs a web app inside Discord
  with real multiplayer input and no screensharing at all. Same stack, so it is
  a port rather than a rewrite — but it is Discord-only and does not help Teams,
  which is the actual target.
- **Teams integration.** Reading the raise-hand queue automatically. The host
  drives the roster by hand for now.
- **More games.** The engine is currently bracket-specific. Generalising it
  behind the `game = { initialState, reducer, project, views }` interface is
  worth doing when the second game exists, not before.
