import { roundName } from "./bracket.js";
import { pickNumber } from "./draft.js";
import type { HostGame } from "./types.js";

/**
 * A game as plain text, for pasting into the meeting chat once it's over.
 * The display is the artifact while the call is on; this is the one that
 * survives the call.
 */
export function summarize(game: HostGame): string {
  if (game.kind === "draft") {
    const b = game.board;
    const lines = [heading(b.topic, b.subtitle)];
    for (const column of b.columns) {
      if (!column.picks.length) continue;
      lines.push(`${column.name}: ${column.picks.map((p) => `${p.label} (${pickNumber(p)})`).join(", ")}`);
    }
    return lines.join("\n");
  }

  if (game.kind === "tierlist") {
    const b = game.board;
    const lines = [heading(b.title, b.subtitle)];
    for (const row of b.rows) {
      if (row.items.length) lines.push(`${row.label}: ${row.items.map((i) => i.label).join(", ")}`);
    }
    if (b.unplaced.length) lines.push(`Unplaced: ${b.unplaced.map((i) => i.label).join(", ")}`);
    return lines.join("\n");
  }

  const br = game.bracket;
  const lines = [heading(br.title, br.subtitle)];
  if (br.champion) lines.push(`Champion: ${br.champion.label}`);
  br.rounds.forEach((matches, round) => {
    const decided = matches.filter((m) => m.winner && !m.bye);
    if (!decided.length) return;
    const results = decided.map((m) => {
      const winner = m.winner === "a" ? m.a : m.b;
      const loser = m.winner === "a" ? m.b : m.a;
      return `${winner?.label} over ${loser?.label}`;
    });
    lines.push(`${roundName(round, br.rounds.length)}: ${results.join(", ")}`);
  });
  return lines.join("\n");
}

function heading(title: string, subtitle: string): string {
  return subtitle ? `${title} — ${subtitle}` : title;
}
