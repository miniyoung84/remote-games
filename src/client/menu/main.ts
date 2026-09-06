import { GAMES, type GameEntry } from "../../shared/games.js";
import type { DisplayState } from "../../shared/types.js";
import { connect } from "../connection.js";

const el = <T extends HTMLElement>(id: string): T => {
  const node = document.getElementById(id);
  if (!node) throw new Error(`#${id} missing`);
  return node as T;
};

const games = el("games");
const status = el("status");
const statusText = el("status-text");
const statusAction = el<HTMLButtonElement>("status-action");

const text = (tag: string, className: string, value = ""): HTMLElement => {
  const node = document.createElement(tag);
  node.className = className;
  node.textContent = value;
  return node;
};

/**
 * The display opens as its own named window so it can be fullscreened on the
 * second monitor and shared on its own — sharing a browser tab would expose
 * every other tab you switch to. Reusing the name focuses the existing window
 * instead of piling up new ones.
 */
function openDisplay(path: string): void {
  window.open(path, "remote-games-display", "popup=yes,width=1280,height=720");
}

function renderGames(): void {
  games.replaceChildren();

  for (const game of GAMES) {
    const card = text("div", `game ${game.status}`);
    card.append(text("h3", "", game.title), text("div", "meta", game.players), text("p", "", game.blurb));

    const actions = text("div", "actions");
    if (game.status === "ready" && game.display && game.host) {
      const both = document.createElement("button");
      both.className = "primary";
      both.textContent = "Set up both windows";
      both.title = "Opens the display in its own window, then takes you to the host controls";
      both.onclick = () => {
        openDisplay(game.display!);
        window.location.href = game.host!;
      };

      const displayOnly = document.createElement("button");
      displayOnly.textContent = "Display only";
      displayOnly.onclick = () => openDisplay(game.display!);

      const hostOnly = document.createElement("a");
      hostOnly.className = "button";
      hostOnly.href = game.host;
      hostOnly.textContent = "Host only";

      actions.append(both, displayOnly, hostOnly);
    } else {
      actions.append(text("div", "meta", "Planned"));
    }
    card.append(actions);
    games.append(card);
  }

  // Placeholder so a one-game menu still reads as a menu rather than a mistake.
  const soon = text("div", "game planned");
  soon.append(
    text("h3", "", "More games"),
    text("div", "meta", "not built yet"),
    text(
      "p",
      "",
      "This repo is built to hold several. Add an entry to src/shared/games.ts and it shows up here.",
    ),
  );
  games.append(soon);
}

function describe(state: DisplayState): { text: string; cls: string; action: GameEntry | null } {
  const bracket = GAMES.find((g) => g.id === "bracket") ?? null;
  if (state.phase === "idle" || !state.bracket) {
    return { text: "Nothing running. Pick a game to start.", cls: "", action: null };
  }
  if (state.phase === "complete") {
    return {
      text: `${state.bracket.title} finished — ${state.bracket.champion?.label ?? "champion"} won.`,
      cls: "done",
      action: bracket,
    };
  }
  const all = state.bracket.rounds.flat();
  const decided = all.filter((m) => m.winner && !m.bye).length;
  const total = all.filter((m) => !m.bye).length;
  return {
    text: `${state.bracket.title} in progress — ${decided} of ${total} decided.`,
    cls: "live",
    action: bracket,
  };
}

renderGames();

connect<DisplayState>("display", {
  onState: (state) => {
    const { text: label, cls, action } = describe(state);
    status.className = `status ${cls}`;
    statusText.textContent = label;
    statusAction.hidden = !action;
    if (action?.display && action.host) {
      statusAction.textContent = state.phase === "complete" ? "Reopen" : "Resume";
      statusAction.onclick = () => {
        openDisplay(action.display!);
        window.location.href = action.host!;
      };
    }
  },
  onStatus: (connected) => {
    if (!connected) {
      status.className = "status offline";
      statusText.textContent = "Server not reachable — is it running?";
      statusAction.hidden = true;
    }
  },
});
