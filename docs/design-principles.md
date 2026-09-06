# Design principles

These come from two constraints that are easy to forget while developing, because
neither one is visible on the machine you build on.

## Constraint 1: the output is a compressed video stream

Nobody sees your rendered page. They see a heavily compressed, relatively
low-bitrate video capture of it, re-encoded by Teams or Discord. Teams is
noticeably rougher than Discord's Go Live. This is not a normal web design
target, and the usual instincts are mostly wrong.

- **Type big and heavy.** Thin weights and small text turn to mush. Treat ~24px
  at 1080p as the absolute floor and design like signage.
- **Flat fills over gradients.** Gradients band badly under compression. Flat
  color survives almost perfectly.
- **High contrast, but not pure `#000` on `#fff`.** Maximum contrast shimmers
  under compression. Off-black on off-white, or the dark palette in
  `src/style.css`.
- **Avoid continuous motion.** Particles, ambient loops, and video backgrounds
  consume the entire bitrate budget and blur everything else on screen. Static
  compositions with occasional deliberate transitions look dramatically better.
- **Grids of large flat shapes and numbers are the best-compressing thing you
  can show.** This is a real argument in favour of board-style games.

The display is deliberately loud, and none of that conflicts with the above —
the drama is built entirely from things compression likes. Enormous type, large
flat color fields, hard edges, thick rules, and high-contrast inversion
(advanced entries flip to paper-on-ink; the champion screen is a full-bleed
color field). What it avoids is the usual maximalist toolkit: gradients, glows,
blur, texture and ambient motion, all of which fall apart in a video stream.
Transitions fire on an event and then stop.

## Constraint 2: viewers are 0.5-2s behind, by varying amounts

- **No speed or buzzer games.** Different viewers see the same frame at
  different times, so first-to-answer is genuinely unfair and the group will
  argue about it. Every game must be turn-based.
- **Never depend on audio.** Discord shares application audio via Go Live;
  Teams only shares system sound if the host ticks "include computer sound."
  Every audio cue needs a visual equivalent.

  The display does synthesize sound — a thunk on a placement, a whoosh on a
  move, a chord at the end — but it is decoration on top of a visual that
  already says the same thing, and it is **off by default**. It has to stay
  that way: at least some of the room will never hear it, and they should not
  be able to tell.

## Constraint 3: the meeting format

The target meeting is a standup. People raise their hands in Teams and the host
calls on whoever is next, so **turn order is emergent, not scheduled**, and
**attendance varies significantly day to day**.

The person taking their turn is simultaneously composing a work update, so:

- **A turn must be answerable in one breath with no preparation.** Anything
  requiring real thought while on the spot will make people quietly start
  dreading standup.
- **No group deliberation.** There is no time to argue. This rules out an
  entire genre of otherwise-excellent party games (Wavelength, Codenames,
  Connections as normally played).
- **No elimination.** Nobody should spend the rest of the meeting watching.

## The resulting game shape

Every game in this project should be:

> A persistent board that fills in one pick at a time, order-agnostic,
> pausable at any point, and resumable on a later day.

Order-agnostic and pausable is what makes variable attendance a non-issue. If
the board also persists across days, variable attendance stops being a problem
to work around and becomes the reason multi-day games work at all.
