import { GAMES } from "../../shared/games.js";
import { readItems } from "../../shared/items.js";
import { bracketSize } from "../../shared/bracket.js";
import type { Action } from "../../shared/protocol.js";
import type { GameKind, HostState, ItemSetView } from "../../shared/types.js";
import { connect } from "../connection.js";
import { mountBracketPanel } from "./bracket.js";
import { button, text, type HostDom, type HostPanel } from "./panel.js";
import { mountTierPanel } from "./tierlist.js";

const el = <T extends HTMLElement>(id: string): T => {
  const node = document.getElementById(id);
  if (!node) throw new Error(`#${id} missing`);
  return node as T;
};

const dom: HostDom = { now: el("now"), board: el("board") };
const gameActions = el("game-actions");
const gamePick = el("game-pick");
const roster = el("roster");
const rosterCount = el("roster-count");
const rosterForm = el<HTMLFormElement>("roster-form");
const rosterName = el<HTMLInputElement>("roster-name");
const setsList = el("sets");
const setsCount = el("sets-count");
const setFilter = el<HTMLInputElement>("set-filter");
const editor = el<HTMLFormElement>("editor");
const editorTitle = el("editor-title");
const setTitle = el<HTMLInputElement>("set-title");
const setSubtitle = el<HTMLInputElement>("set-subtitle");
const setItems = el<HTMLTextAreaElement>("set-items");
const setPreview = el("set-preview");
const setDelete = el<HTMLButtonElement>("set-delete");
const toast = el("toast");

let state: HostState | null = null;
let editingId: string | null = null;
let panel: HostPanel | null = null;
let panelKind: GameKind | null = null;

/** Which game the Start buttons launch. Seeded from the menu's ?game= link. */
const requested = new URLSearchParams(location.search).get("game");
let startKind: GameKind = requested === "tierlist" ? "tierlist" : "bracket";

let toastTimer: ReturnType<typeof setTimeout> | undefined;
function flash(message: string): void {
  toast.textContent = message;
  toast.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (toast.hidden = true), 3200);
}

const send = connect<HostState>("host", {
  onState: (next) => {
    state = next;
    render(next);
  },
  onError: flash,
  onStatus: (connected) => {
    if (!connected) flash("Disconnected — reconnecting…");
  },
});

const act = (action: Action) => send(action);

/* ---------- game panel ---------- */

function ensurePanel(kind: GameKind | null): void {
  if (panelKind === kind) return;
  panel?.unmount();
  panel = null;
  panelKind = kind;
  dom.now.replaceChildren();
  dom.board.replaceChildren();
  if (kind === "bracket") panel = mountBracketPanel(dom, act);
  else if (kind === "tierlist") panel = mountTierPanel(dom, act);
}

function renderGameActions(next: HostState): void {
  gameActions.replaceChildren();
  if (!next.game) return;

  const undo = button("Undo (U)");
  undo.disabled = !next.canUndo;
  undo.onclick = () => act({ type: "game/undo" });
  gameActions.append(undo);

  const reset = button("End game", "danger");
  reset.onclick = () => {
    if (confirm("End this game and clear the board?")) act({ type: "game/reset" });
  };
  gameActions.append(reset);
}

/* ---------- roster ---------- */

function renderRoster(next: HostState): void {
  const present = next.roster.filter((p) => p.present).length;
  rosterCount.textContent = next.roster.length ? `${present} of ${next.roster.length} here` : "";

  roster.replaceChildren();
  if (!next.roster.length) {
    roster.append(text("p", "empty", "Add whoever's in the meeting. The roster is remembered between sessions."));
    return;
  }

  for (const person of next.roster) {
    const chip = text("div", "person");
    if (person.id === next.currentPickerId) chip.classList.add("current");
    if (!person.present) chip.classList.add("away");

    const name = text("span", "name", person.name);
    name.title = "Put on the clock";
    name.onclick = () => {
      if (!person.present) act({ type: "roster/setPresent", id: person.id, present: true });
      act({ type: "roster/setCurrent", id: person.id === next.currentPickerId ? null : person.id });
    };

    // Shows current status, not the action — an "away" label on someone who is
    // present reads as a status and gets misclicked.
    const away = button(person.present ? "here" : "away", person.present ? "mini state here" : "mini state away");
    away.title = person.present ? "Mark away" : "Mark here";
    away.onclick = () => act({ type: "roster/setPresent", id: person.id, present: !person.present });

    const remove = button("✕", "mini");
    remove.title = "Remove from roster";
    remove.onclick = () => {
      if (confirm(`Remove ${person.name} from the roster?`)) act({ type: "roster/remove", id: person.id });
    };

    chip.append(name, away, remove);
    roster.append(chip);
  }
}

rosterForm.onsubmit = (event) => {
  event.preventDefault();
  const name = rosterName.value.trim();
  if (!name) return;
  act({ type: "roster/add", name });
  rosterName.value = "";
};

/* ---------- sets ---------- */

function playedLabel(at?: number): string | null {
  if (!at) return null;
  const days = Math.floor((Date.now() - at) / 86_400_000);
  if (days <= 0) return "played today";
  if (days === 1) return "played yesterday";
  if (days < 7) return `played ${days}d ago`;
  if (days < 28) return `played ${Math.floor(days / 7)}w ago`;
  return `played ${Math.floor(days / 30)}mo ago`;
}

function matchesFilter(set: ItemSetView, query: string): boolean {
  if (!query) return true;
  const haystack = [set.title, set.subtitle, ...readItems(set.items).map((i) => i.label)].join(" ").toLowerCase();
  return query.split(/\s+/).every((word) => haystack.includes(word));
}

function renderGamePick(): void {
  gamePick.replaceChildren();
  for (const game of GAMES.filter((g) => g.status === "ready")) {
    const node = button(game.title, game.id === startKind ? "pick on" : "pick");
    node.onclick = () => {
      startKind = game.id as GameKind;
      if (state) {
        renderGamePick();
        renderSets(state);
      }
    };
    gamePick.append(node);
  }
}

function loadEditor(set: ItemSetView | null): void {
  editingId = set?.id ?? null;
  editorTitle.textContent = set ? `Editing “${set.title}”` : "New set";
  setTitle.value = set?.title ?? "";
  setSubtitle.value = set?.subtitle ?? "";
  setItems.value = set ? readItems(set.items).map((i) => i.label).join("\n") : "";
  setDelete.disabled = !set;
  updatePreview();
  if (state) renderSets(state);
}

function updatePreview(): void {
  const count = setItems.value.split("\n").filter((s) => s.trim()).length;
  if (count < 2) {
    setPreview.textContent = "At least 2 entries needed.";
    return;
  }
  const size = bracketSize(count);
  const byes = size - count;
  setPreview.textContent =
    `${count} entries · bracket: ${size} slots, ${count - 1} matchups` +
    (byes ? `, ${byes} ${byes === 1 ? "bye" : "byes"}` : "") +
    ` · tier list: ${count} turns` +
    (size > 16 ? " — over 16 gets cramped on the display" : "");
}

setItems.oninput = updatePreview;
setFilter.oninput = () => {
  if (state) renderSets(state);
};

editor.onsubmit = (event) => {
  event.preventDefault();
  // Editing through this form writes plain strings; art is added by hand in the
  // set file for now, and is preserved for entries whose label is unchanged.
  const existing = state?.sets.find((s) => s.id === editingId);
  const artByLabel = new Map(readItems(existing?.items ?? []).map((i) => [i.label, i.art]));
  act({
    type: "sets/save",
    set: {
      id: editingId ?? "",
      title: setTitle.value,
      subtitle: setSubtitle.value,
      items: setItems.value
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean)
        .map((label) => {
          const art = artByLabel.get(label);
          return art ? { label, art } : label;
        }),
      updatedAt: Date.now(),
    },
  });
};

el("set-new").onclick = () => loadEditor(null);

setDelete.onclick = () => {
  const set = state?.sets.find((s) => s.id === editingId);
  if (!set) return;
  if (confirm(`Delete “${set.title}”? This cannot be undone.`)) {
    act({ type: "sets/delete", id: set.id });
    loadEditor(null);
  }
};

function renderSets(next: HostState): void {
  setsList.replaceChildren();
  if (!next.sets.length) {
    setsCount.textContent = "";
    setsList.append(text("p", "empty", "No sets yet — build one below."));
    return;
  }

  const query = setFilter.value.trim().toLowerCase();
  const shown = next.sets.filter((s) => matchesFilter(s, query));
  setsCount.textContent = query ? `${shown.length} of ${next.sets.length}` : `${next.sets.length}`;
  if (!shown.length) {
    setsList.append(text("p", "empty", `Nothing matches “${setFilter.value.trim()}”.`));
    return;
  }

  for (const set of shown) {
    const row = text("div", "set");
    if (set.id === editingId) row.classList.add("editing");
    const played = playedLabel(set.lastPlayedAt);
    if (set.lastPlayedAt && Date.now() - set.lastPlayedAt < 14 * 86_400_000) row.classList.add("recent");

    const meta = text("div", "meta");
    meta.append(text("strong", "", set.title));
    const sub = text("span", "");
    sub.append(document.createTextNode(`${readItems(set.items).length} entries${set.subtitle ? ` · ${set.subtitle}` : ""}`));
    if (played) sub.append(text("span", "played", played));
    meta.append(sub);
    meta.title = "Edit this set";
    meta.onclick = () => loadEditor(set);

    const actions = text("div", "set-actions");
    const shuffle = document.createElement("input");
    shuffle.type = "checkbox";
    shuffle.checked = true;
    shuffle.id = `shuffle-${set.id}`;
    const shuffleLabel = document.createElement("label");
    shuffleLabel.htmlFor = shuffle.id;
    shuffleLabel.append(shuffle, document.createTextNode("shuffle"));

    const start = button("Start", "primary");
    start.onclick = () => {
      if (next.game && !confirm("A game is already running. Replace it?")) return;
      act({ type: "game/start", setId: set.id, kind: startKind, shuffle: shuffle.checked });
    };

    actions.append(shuffleLabel, start);
    row.append(meta, actions);
    setsList.append(row);
  }
}

/* ---------- keyboard ---------- */

document.addEventListener("keydown", (event) => {
  const target = event.target as HTMLElement | null;
  if (target && /^(INPUT|TEXTAREA)$/.test(target.tagName)) return;
  if (event.metaKey || event.ctrlKey || event.altKey) return;
  if (!state?.game) return;

  if (event.key.toLowerCase() === "u") {
    event.preventDefault();
    return act({ type: "game/undo" });
  }
  if (panel?.key(event, state, state.game)) event.preventDefault();
});

/* ---------- render ---------- */

function render(next: HostState): void {
  ensurePanel(next.game?.kind ?? null);
  if (next.game) panel?.render(next, next.game);
  else dom.now.replaceChildren(text("p", "empty", "No game running. Pick a set below and hit Start."));
  renderGameActions(next);
  renderRoster(next);
  renderSets(next);
  // The editor is deliberately not repopulated here — a state push mid-typing
  // would wipe what the operator is writing.
  if (editingId && !next.sets.some((s) => s.id === editingId)) loadEditor(null);
}

renderGamePick();
loadEditor(null);
