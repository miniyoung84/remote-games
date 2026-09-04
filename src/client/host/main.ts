import { bracketSize, roundName } from "../../shared/bracket.js";
import type { BracketSet, HostState, Match } from "../../shared/types.js";
import { connect } from "../connection.js";

const el = <T extends HTMLElement>(id: string): T => {
  const node = document.getElementById(id);
  if (!node) throw new Error(`#${id} missing`);
  return node as T;
};

const now = el("now");
const roster = el("roster");
const rosterCount = el("roster-count");
const rosterForm = el<HTMLFormElement>("roster-form");
const rosterName = el<HTMLInputElement>("roster-name");
const setsList = el("sets");
const editor = el<HTMLFormElement>("editor");
const editorTitle = el("editor-title");
const setTitle = el<HTMLInputElement>("set-title");
const setSubtitle = el<HTMLInputElement>("set-subtitle");
const setItems = el<HTMLTextAreaElement>("set-items");
const setPreview = el("set-preview");
const setDelete = el<HTMLButtonElement>("set-delete");
const board = el("board");
const toast = el("toast");

let state: HostState | null = null;
/** id of the set loaded in the editor; null means "new set". */
let editingId: string | null = null;

const text = (tag: string, className: string, value = ""): HTMLElement => {
  const node = document.createElement(tag);
  node.className = className;
  node.textContent = value;
  return node;
};

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

/* ---------- on the clock ---------- */

function findMatch(state: HostState, id: string | null): Match | null {
  if (!state.bracket || !id) return null;
  return state.bracket.rounds.flat().find((m) => m.id === id) ?? null;
}

function renderNow(state: HostState): void {
  now.replaceChildren();

  if (!state.bracket) {
    now.append(text("p", "empty", "No bracket running. Pick a set below and hit Start."));
    return;
  }

  if (state.phase === "complete") {
    now.append(text("div", "champion-note", `Champion: ${state.bracket.champion?.label ?? ""}`));
  }

  const match = findMatch(state, state.currentMatchId);
  if (match) {
    const picker = state.roster.find((p) => p.id === state.currentPickerId);
    const line = text("div", picker ? "picker-line" : "picker-line none");
    line.append(text("span", "round", roundName(match.round, state.bracket.rounds.length)));
    line.append(
      document.createTextNode(
        picker ? `${picker.name} is picking` : "Nobody on the clock — tap a name below",
      ),
    );
    now.append(line);

    const choices = text("div", "choices");
    for (const side of ["a", "b"] as const) {
      const entrant = side === "a" ? match.a : match.b;
      const button = document.createElement("button");
      button.className = "choice";
      button.append(text("span", "key", side === "a" ? "A  ←" : "B  →"));
      button.append(document.createTextNode(entrant?.label ?? "—"));
      button.onclick = () => send({ type: "game/decide", matchId: match.id, winner: side });
      choices.append(button);
    }
    now.append(choices);
  } else if (state.phase !== "complete") {
    now.append(text("p", "empty", "No matchup ready."));
  }

  const actions = text("div", "row");

  const undo = document.createElement("button");
  undo.textContent = "Undo last pick  (U)";
  undo.disabled = !state.canUndo;
  undo.onclick = () => send({ type: "game/undo" });
  actions.append(undo);

  if (state.remaining > 1) {
    const skip = document.createElement("button");
    skip.className = "ghost";
    skip.textContent = "Different matchup";
    skip.onclick = () => {
      const ready = state.bracket!.rounds.flat().filter((m) => m.a && m.b && !m.winner);
      const index = ready.findIndex((m) => m.id === state.currentMatchId);
      send({ type: "game/selectMatch", matchId: ready[(index + 1) % ready.length]?.id ?? null });
    };
    actions.append(skip);
  }

  const reset = document.createElement("button");
  reset.className = "danger";
  reset.textContent = "End bracket";
  reset.onclick = () => {
    if (confirm("End this bracket and clear the board?")) send({ type: "game/reset" });
  };
  actions.append(reset);

  now.append(actions);
}

/* ---------- roster ---------- */

function renderRoster(state: HostState): void {
  const present = state.roster.filter((p) => p.present).length;
  rosterCount.textContent = state.roster.length ? `${present} of ${state.roster.length} here` : "";

  roster.replaceChildren();
  if (state.roster.length === 0) {
    roster.append(text("p", "empty", "Add whoever's in the meeting. The roster is remembered between sessions."));
    return;
  }

  for (const person of state.roster) {
    const chip = text("div", "person");
    if (person.id === state.currentPickerId) chip.classList.add("current");
    if (!person.present) chip.classList.add("away");

    const name = text("span", "name", person.name);
    name.title = "Put on the clock";
    name.onclick = () => {
      if (!person.present) send({ type: "roster/setPresent", id: person.id, present: true });
      send({ type: "roster/setCurrent", id: person.id === state.currentPickerId ? null : person.id });
    };

    // Shows current status, not the action — an "away" label on someone who is
    // present reads as a status and gets misclicked.
    const away = document.createElement("button");
    away.className = person.present ? "mini state here" : "mini state away";
    away.textContent = person.present ? "here" : "away";
    away.title = person.present ? "Mark away" : "Mark here";
    away.onclick = () => send({ type: "roster/setPresent", id: person.id, present: !person.present });

    const remove = document.createElement("button");
    remove.className = "mini";
    remove.textContent = "✕";
    remove.title = "Remove from roster";
    remove.onclick = () => {
      if (confirm(`Remove ${person.name} from the roster?`)) send({ type: "roster/remove", id: person.id });
    };

    chip.append(name, away, remove);
    roster.append(chip);
  }
}

rosterForm.onsubmit = (event) => {
  event.preventDefault();
  const name = rosterName.value.trim();
  if (!name) return;
  send({ type: "roster/add", name });
  rosterName.value = "";
};

/* ---------- sets ---------- */

function loadEditor(set: BracketSet | null): void {
  editingId = set?.id ?? null;
  editorTitle.textContent = set ? `Editing “${set.title}”` : "New set";
  setTitle.value = set?.title ?? "";
  setSubtitle.value = set?.subtitle ?? "";
  setItems.value = set?.items.join("\n") ?? "";
  setDelete.disabled = !set;
  updatePreview();
  if (state) renderSets(state);
}

function updatePreview(): void {
  const count = setItems.value.split("\n").map((s) => s.trim()).filter(Boolean).length;
  if (count < 2) {
    setPreview.textContent = "At least 2 entries needed.";
    return;
  }
  const size = bracketSize(count);
  const byes = size - count;
  setPreview.textContent =
    `${count} entries → ${size}-slot bracket, ${count - 1} matchups` +
    (byes ? `, ${byes} ${byes === 1 ? "bye" : "byes"} (top seeds skip round 1)` : ", no byes") +
    (size > 16 ? " — over 16 gets cramped on the display" : "");
}

setItems.oninput = updatePreview;

editor.onsubmit = (event) => {
  event.preventDefault();
  send({
    type: "sets/save",
    set: {
      id: editingId ?? "",
      title: setTitle.value,
      subtitle: setSubtitle.value,
      items: setItems.value.split("\n"),
      updatedAt: Date.now(),
    },
  });
};

el("set-new").onclick = () => loadEditor(null);

setDelete.onclick = () => {
  const set = state?.sets.find((s) => s.id === editingId);
  if (!set) return;
  if (confirm(`Delete “${set.title}”? This cannot be undone.`)) {
    send({ type: "sets/delete", id: set.id });
    loadEditor(null);
  }
};

function renderSets(state: HostState): void {
  setsList.replaceChildren();
  if (state.sets.length === 0) {
    setsList.append(text("p", "empty", "No sets yet — build one below."));
    return;
  }

  for (const set of state.sets) {
    const row = text("div", "set");
    if (set.id === editingId) row.classList.add("editing");

    const meta = text("div", "meta");
    meta.append(text("strong", "", set.title));
    meta.append(text("span", "", `${set.items.length} entries${set.subtitle ? ` · ${set.subtitle}` : ""}`));
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

    const start = document.createElement("button");
    start.className = "primary";
    start.textContent = "Start";
    start.onclick = () => {
      if (state.bracket && state.phase === "playing" && !confirm("A bracket is already running. Replace it?")) return;
      send({ type: "game/start", setId: set.id, shuffle: shuffle.checked });
    };

    actions.append(shuffleLabel, start);
    row.append(meta, actions);
    setsList.append(row);
  }
}

/* ---------- board overview ---------- */

function renderBoard(state: HostState): void {
  board.replaceChildren();
  if (!state.bracket) return;

  state.bracket.rounds.forEach((matches, round) => {
    const column = text("div", "h-round");
    column.append(text("div", "h-round-name", roundName(round, state.bracket!.rounds.length)));
    const list = text("div", "h-round-matches");

    for (const match of matches) {
      const node = text("div", "h-match");
      if (match.bye) node.classList.add("bye");
      if (match.id === state.currentMatchId) node.classList.add("current");

      const ready = Boolean(match.a && match.b && !match.winner);
      if (ready) {
        node.classList.add("ready");
        node.title = "Jump to this matchup";
        node.onclick = () => send({ type: "game/selectMatch", matchId: match.id });
      }

      for (const side of ["a", "b"] as const) {
        const entrant = side === "a" ? match.a : match.b;
        const slot = text("div", "h-slot", entrant?.label ?? "—");
        if (entrant) slot.classList.add("filled");
        if (match.winner === side) slot.classList.add("winner");
        else if (match.winner) slot.classList.add("loser");
        node.append(slot);
      }
      list.append(node);
    }
    column.append(list);
    board.append(column);
  });
}

/* ---------- keyboard ---------- */

document.addEventListener("keydown", (event) => {
  const target = event.target as HTMLElement | null;
  if (target && /^(INPUT|TEXTAREA)$/.test(target.tagName)) return;
  if (event.metaKey || event.ctrlKey || event.altKey) return;
  if (!state?.bracket) return;

  const key = event.key.toLowerCase();
  if (key === "u") {
    event.preventDefault();
    return send({ type: "game/undo" });
  }

  const side = key === "a" || key === "arrowleft" ? "a" : key === "b" || key === "arrowright" ? "b" : null;
  if (side && state.currentMatchId) {
    event.preventDefault();
    send({ type: "game/decide", matchId: state.currentMatchId, winner: side });
  }
});

/* ---------- render ---------- */

function render(state: HostState): void {
  renderNow(state);
  renderRoster(state);
  renderSets(state);
  renderBoard(state);
  // The editor is deliberately not repopulated here — a state push mid-typing
  // would wipe what the operator is writing.
  if (editingId && !state.sets.some((s) => s.id === editingId)) loadEditor(null);
}

loadEditor(null);
