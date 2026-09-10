# remote-games

Party games designed to be **screenshared** into a remote work meeting — Teams,
Discord, Zoom, Slack huddles. They render as a local web page; the host shares
the window, and everyone plays by talking and by typing in the meeting chat.

No install for anyone, no accounts, no phones.

> **Status: three games playable.** Bracket, Tier List and Draft, all end to end —
> shared display, private host controls, 28 shared sets, undo, and state that
> survives restarts so a game can span several days of standups.

## Why this is not just "a web game"

Two constraints shape everything, and neither is visible on the machine you
build on:

1. **Nobody sees your page — they see a compressed video capture of it.** Thin
   type, gradients, and ambient motion all fall apart. Flat color, heavy type,
   and static compositions look dramatically better.
2. **Viewers are 0.5–2s behind by varying amounts.** Buzzer and reaction games
   are genuinely unfair over a screenshare, so everything here is turn-based.

The target meeting is a standup where people raise their hands and the host
calls on whoever's next — so turn order is emergent and attendance changes daily.
Every game is therefore built to one shape: *a persistent board that fills in one
pick at a time, order-agnostic, pausable, and resumable on a later day.*

[docs/design-principles.md](docs/design-principles.md) has the full reasoning.

## Quick start

```bash
nvm use && corepack enable
npm ci
npm run dev
```

Then open **`http://127.0.0.1:5173`** — the menu launches both windows, shows
whether a game is already in progress, and has the setup steps. Share the
display window, never your whole screen.

Dependencies install into the project directory only — nothing touches your
global environment. [docs/development.md](docs/development.md) covers the
isolation guarantees in detail, including how they map onto a Python `venv`.

## Draft

Pick a topic — "zombie apocalypse squad", "your ideal team lunch" — and everyone
drafts to their own bench. **There is no list to choose from:** people say
whatever they think of and you type it in. Each person gets a column that fills
up as they pick.

Nothing is restricted. If two people draft the same thing you get a warning and
can go ahead anyway. Since turn order is emergent, the host view shows who has
the fewest picks rather than enforcing a snake order — which is the fairness the
snake was for. Someone leaving mid-draft keeps their column and their picks.

## Tier List

Rank sixteen things from S down to F, in either of two modes — **one at a
time**, where you place whatever the queue hands you, or **choose any**, where
the whole unsorted tray is on screen and you pick what to sort.On your turn you place one item — or **move one somebody else already
placed**, which is where the arguing starts.
Placements and moves get distinct animations, and the finished board is the
artifact: the band collapses and the rows grow so it's worth screenshotting.

## Bracket

Sixteen things enter, one thing leaves. Each person decides **one matchup** on
their turn — no group voting, no deliberation — so it fits a standup where turn
order is whoever raises their hand next and attendance changes daily.

- **Shared display** — the full board, with the live matchup called out at 56px
  along the bottom and a full-screen champion reveal at the end.
- **Host window** — live roster, one-click winner selection, keyboard shortcuts,
  undo, and a bracket-set editor.
- **Any number of entries** from 2 up. Non-powers-of-two get byes automatically.
- **Nothing is lost on a restart**, so a bracket can run across several days.

Bracket and Tier List share the same sets, so a set can be run as a bracket one
week and a tier list the next — comparing the two results is half the fun. Items can carry
**emoji, a color swatch or an image** — uploaded, dropped or pasted from the
web, or found for you from Wikimedia Commons with an approve/reject pass — and a **pack** bundles sets plus
their images into one file you can share or keep as a backup.

Thirty-three sets ship in [data/sets/](data/sets/); add your own in the host
view or by dropping a JSON file next to them. There's a ready-made prompt for
generating new ones with any AI in
[docs/generating-bracket-sets.md](docs/generating-bracket-sets.md).

Five of them — dog breeds, pasta shapes, instruments, sea creatures, footwear —
have a photograph on every entry. The images themselves are gitignored, but
they ship inside [packs/photo-packs.pack.json](packs/photo-packs.pack.json) and
the server restores them on start, so a fresh clone gets the pictures with no
extra step.

## Docs

| | |
| --- | --- |
| [Design principles](docs/design-principles.md) | The constraints, and what they rule in and out |
| [Architecture](docs/architecture.md) | Display/host/player roles, state, persistence |
| [Development](docs/development.md) | Environment setup and running a session |
| [Generating bracket sets](docs/generating-bracket-sets.md) | Copy-paste prompt for inventing new sets |

## License

**[PolyForm Noncommercial License 1.0.0](LICENSE)** — Copyright 2026 Chase Choi.

Use it, modify it, share it, run it at your own workplace, build on it. Just not
commercially. In plain terms:

**Allowed:** personal and hobby use, playing it with your team at work, forking
and modifying it, redistributing it, and use by schools, charities, government,
and public research bodies.

**Not allowed without permission:** selling it, charging for access to it,
bundling it into a paid product or service, or running it as a commercial
offering.

### Clarification: playing it at work is fine

PolyForm Noncommercial permits "any noncommercial purpose," but its examples
enumerate personal use and noncommercial organizations, which leaves internal
use at a for-profit company ambiguous. That ambiguity would cover this project's
main use case, so to be explicit:

**As copyright holder I grant permission for internal, non-revenue-generating
use at any organization, for-profit included** — running these games in your own
team's meetings. That is exactly what this is for.

What still requires a separate license is *profiting* from it: selling it,
charging for access, bundling it into a paid product or service, or offering it
commercially to others.

This is a *source-available* license, not an OSI-approved open source one, and
that's deliberate. If you want to use this commercially, ask — see
[COMMERCIAL.md](COMMERCIAL.md).
