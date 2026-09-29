# Roadmap and ideas

What's next, what's parked, and a bank of ideas that fit the format. Nothing
here is promised; it's the thinking, written down so it doesn't get re-done.

The format every idea has to fit is in [design-principles.md](design-principles.md):
a standup, turn order emergent from raised hands, attendance that varies from
three to fifteen, one action per person and then the next person, no time for
group deliberation, nobody eliminated, and a display that survives being
re-encoded by Teams.

## Next up: Progressive Reveal

An image starts as a handful of giant blocks. Each person's turn: one guess or
a pass, the host taps ✓ or ✗, and the picture sharpens one step regardless.
Whoever gets it is the hero. If it reaches full clarity unsolved, the answer's
revealed and nobody's the goat. Next image.

Why this one now:

- **The content exists.** Every set with pictures is a reveal deck — dog
  breeds, sea creatures, instruments, fruit, snacks — and the Commons finder
  makes new ones. Zero authoring.
- **It uses what's built:** packs, the finder, the announcement card, the
  sting, and the host-secret projection — the display genuinely must not know
  the answer, which is what `project()` was designed for.
- **It's made for a screenshare.** Pixelated blocks are the most
  compression-proof image there is, and each step is an event.
- **The format fits exactly.** One action per person, any order, no
  deliberation, no elimination, tension rising as the circle goes round — and
  emergent order *matters*: called late, you see more but have fewer chances.
- It still feeds the arguing ("that was obviously a mango").

Design notes: pixelate by default, so the turn has no decision in it; an
optional **tiles** mode where you uncover one square of a 6×4 grid before
guessing ("B3!"). Host sees the answer and taps ✓/✗, no typing. Light "solved
by Chase at step 3" credit per image; a tally only if the room wants one.
Reveal card with the sting on a solve.

## After that

- **Co-op Minesweeper** — zero content, one click per turn, spans days, and a
  grid of giant numbers compresses beautifully. Second because a mine hit pins
  the loss on one person in front of everyone, and it's cooperative — it
  doesn't create the debate this group enjoys. Worth doing with lives rather
  than sudden death.
- **Estimation** ("how many X?") — one number per person, closest wins. The
  most inclusive format on the list: nobody *knows*, so everyone can reason,
  and it doesn't quietly punish people who grew up somewhere else. Needs a
  question-with-answer dataset that doesn't exist yet.
- **Top-10 board** — Family Feud without the head-to-head: the team fills a
  "top 10 most X" list, one guess per turn. Needs survey-style answer lists.

## Cross-game TODOs

- **History.** Nothing is kept once a game is reset. A log of finished games —
  set, date, who played, the result — shown on the menu, is the biggest gap
  across all three games. "What did we draft last week?" has no answer today.
- **State versioning.** `data/state.json` is loaded as-is with no version
  stamp. Every change so far has been additive, so old state loads fine; an
  incompatible one needs a migration hook or the file has to fail loudly.
- **Pictures for the bare sets** that are concrete enough to have them:
  Everyday Object, Playground Classic, Container, Room Upgrade, Nap Spot,
  Useless Talent. The abstract sets stay bare on purpose.
- **Draft trades** ("Priya swaps Mango for Chase's Cold pizza"). Fun, but it's
  deliberation time the format doesn't have and it fights round.slot
  numbering. Only if the room asks.
- **The phone role** — a private per-player input, Jackbox-style. Deferred by
  design (see architecture.md); it unlocks Fibbage-type games and nothing in
  the current set needs it.
- **The draft sting's provenance** isn't recorded — see `public/sounds/`.

## Idea bank

Grouped by what they cost to feed. ✅ marks formats this group has played
before, in some form.

### Zero content — generated, runs forever

- **Co-op Minesweeper** — see above.
- **20 Questions** — host holds the secret, one yes/no question per person, the
  display keeps the history and the counter. Host-secret architecture, no
  content beyond a word list.
- **Mastermind** — one guess per person, feedback pegs fill the board. Later
  players benefit from earlier information, so emergent order adds something.
- **Scattergories grid** — 5×5 of categories × letters; claim one cell per
  turn by naming something valid. Persists, never repeats.
- **Hangman** — one letter per turn. Trivial, works with three or twenty.
- **Shared pixel canvas** — one tile per person per day. Barely a game; the
  team builds an image over weeks and nobody can be bad at it.
- **Word chain** — each word associated with the last; the display grows a
  constellation. Leaves a nice artifact.
- **One-word story** — one word each into a sentence. Cheapest build, reliably
  funny read-back.

### One list of strings

- **Tier list** ✅ (built). Variant: a tier list of things the team nominated
  the day before.
- **Draft** ✅ (built). Variant: draft a squad against a scenario, vote the
  winner next day.
- **Bracket** (built).
- **Timeline placement** — one card into the right spot on a growing
  timeline. Strong visual; being wrong is public but harmless.
- **Higher / Lower** — call higher or lower on the next card; the team builds a
  streak. Answerable by someone half paying attention, which matters. ~200
  items lasts months.
- **Estimation** — see above.
- **Build the perfect X** — each person adds one component to a themed
  assembly. The constructive cousin of the tier list.

### Real content pipeline

- **Progressive reveal** — see above.
- **Jeopardy** ✅ and **Family Feud** ✅ — played before, liked; both need
  authored boards. Top-10 board is the cheaper Feud.
- **Connections, one guess per turn** — ruled out as normally played (it's a
  deliberation game) but fine capped at one grouping guess per person.
  Work-themed puzzles land well.
- **Guess Who** — host holds the character, one yes/no question per turn,
  faces grey out. Team photos only if that reads as fun rather than pointed.
- **Mini crossword** — one clue per turn, grid persists across days. Sourcing
  puzzles is the real work.

### Not a game, worth building

- **Daily temperature check** — one light question, each person answers on
  their turn, the display builds a live tally. Lowest friction of anything
  here and the best at making people who don't know each other feel like a
  team.

## Considered and rejected

Recorded so they don't get re-proposed.

| Idea | Why it doesn't fit |
| --- | --- |
| Wavelength | Group deliberation game. The fun *is* the arguing; there's no time. |
| Codenames (co-op) | Same — a clue implies a group of tiles and needs discussion. |
| Connections *as normally played* | Same. Survives only as one-guess-per-turn. |
| Bracket *as a group vote* | Same. Survives only as one-matchup-per-person. |
| Straight trivia | A cultural-knowledge floor that quietly excludes people, and the same three win every time. Estimation instead. |
| Anything buzzer or speed based | Screenshare latency differs per viewer. Unfair, and the group will argue about it. |
| Anything with elimination | Nobody should spend the rest of standup watching. |
| Fibbage / Balderdash / Just One | Need private per-player input — the deferred phone role. |
| Anonymous superlatives | HR risk that isn't worth the payoff. |

## Asking an AI for more ideas

The constraints are unusual enough that a generic "party game ideas" prompt
returns things that don't fit. This one encodes them. Paste it into GPT,
Gemini, or anything else; swap the roster size and the played-before list for
your own.

```text
I run a short daily standup on Microsoft Teams. Each person, in whatever order
they raise their hand, gives a 30-second update and then takes ONE turn in a
game shown on a screenshared browser window. Then the next person. I'm looking
for game formats that fit this exactly. Give me 15.

Hard constraints — reject any idea that breaks one:
1. One action per person per day, taken in a few seconds, then the next person.
   No group deliberation, no discussion rounds, no voting-as-a-group.
2. Turn order is emergent (whoever raises a hand next), so nothing can depend
   on a fixed order, and being called early or late must not be unfair.
3. Attendance varies from 3 to 15 people, and people join late or leave.
   Nobody's absence should break the game; nobody's arrival should either.
4. Nobody is eliminated. Everyone gets a turn every day until the game ends.
5. No speed, buzzers, or "first to answer" — screenshare latency differs per
   viewer by 0.5–2 seconds.
6. No cultural-knowledge trivia: it excludes people quietly and the same three
   always win. Reasoning, taste, and estimation are fine; recall of facts is not.
7. The only input is the HOST typing or clicking on a private control window.
   Players just say what they want to do out loud. No phones, no per-player
   secret input.
8. It's a work setting: nothing that ranks, exposes, or roasts colleagues, and
   nothing anonymous.
9. The display is a 1920×1080 page being re-encoded by Teams: big flat shapes,
   huge type, little motion. Fine detail and subtle colour are lost.
10. A game may span several days, and must survive a mid-game pause.

What we already have (don't re-propose these; variants are fine if they're
genuinely different):
- Bracket: 16 things, each person decides one matchup on their turn.
- Tier list: each person places one item into S–F, or moves one already placed.
- Free-form draft: a topic; each person drafts anything they like to their own
  bench, one pick per round.
- Progressive reveal (next): a pixelated image sharpens one step per turn;
  one guess or pass each.

Rejected already, with the reason, so don't suggest them:
- Wavelength, Codenames, Connections as normally played: deliberation games.
- Straight trivia / Jeopardy: knowledge floor.
- Anything buzzer-based, anything with elimination.
- Fibbage / Balderdash / Just One: need private per-player input.
- Anonymous superlatives: HR risk.

For each idea give:
- Name and a one-line pitch.
- The turn, concretely: what the person on the clock says out loud, what the
  host clicks or types, and what changes on the shared screen.
- How it ends, and roughly how many turns that is.
- What content it needs (none / a list of strings / images / authored
  puzzles) and how much of it a week of play consumes.
- Why emergent turn order is fine for it — or, better, where it helps.
- Its "argument potential": does it give the room something to disagree about
  for ten seconds without needing a discussion round? (We like that.)
- The single biggest risk that it won't work in this format.

Then score each 1–5 on: fits the constraints, works at 3 people, works at 15,
argument potential, content cost (5 = free). Sort by total. At least five of
the fifteen must need zero content. Prefer ideas whose display is a grid,
a list, or a few enormous words. Be concrete and a little opinionated; skip
anything that's really a discussion game with a timer on it.
```
