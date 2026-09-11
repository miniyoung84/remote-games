# Sounds

Everything the display plays is synthesized in `src/client/display/sound.ts`
except what's in here.

- `draft-pick.ogg` — the sting behind a draft pick announcement. Opus in Ogg,
  about five seconds, three of them loud. Its source and licence are not
  recorded here; confirm them before redistributing.

Swap a file for another Ogg of the same name and the display uses it. The
announcement holds for `PICK_STING_MS` in `sound.ts`, so a much shorter or
longer sting means adjusting that too.
