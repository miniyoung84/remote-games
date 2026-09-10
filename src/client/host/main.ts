import { GAMES } from "../../shared/games.js";
import { readItems } from "../../shared/items.js";
import { BRACKET_MAX_ENTRANTS, bracketSize } from "../../shared/bracket.js";
import type { Action } from "../../shared/protocol.js";
import type { Art, GameKind, HostState, ItemSetView, RawItem, TierMode } from "../../shared/types.js";
import { connect } from "../connection.js";
import { mountBracketPanel } from "./bracket.js";
import { button, text, type HostDom, type HostPanel } from "./panel.js";
import { mountDraftPanel } from "./draft.js";
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
const artList = el("art-list");
const packName = el<HTMLInputElement>("pack-name");
const packImport = el<HTMLInputElement>("pack-import");
const packUnused = el("pack-unused");
const draftStart = el("draft-start");
const draftTopic = el<HTMLInputElement>("draft-topic");
const draftSubtitle = el<HTMLInputElement>("draft-subtitle");
const draftRounds = el<HTMLInputElement>("draft-rounds");
const tierMode = el("tier-mode");
const suggest = el("suggest");
const suggestLabel = el("suggest-label");
const suggestPos = el("suggest-pos");
const suggestQuery = el<HTMLInputElement>("suggest-query");
const suggestView = el("suggest-view");
const suggestMeta = el("suggest-meta");

let state: HostState | null = null;
let editingId: string | null = null;
/** Art being edited, keyed by label — the textarea owns the labels. */
let editingArt = new Map<string, Art>();
let selecting = false;
const selected = new Set<string>();
let panel: HostPanel | null = null;
let panelKind: GameKind | null = null;

/** Which game the Start buttons launch. Seeded from the menu's ?game= link. */
const KINDS: GameKind[] = ["bracket", "tierlist", "draft"];
const requested = new URLSearchParams(location.search).get("game") as GameKind | null;
let startKind: GameKind = requested && KINDS.includes(requested) ? requested : "bracket";
/** Only meaningful for the tier list: hand out the next item, or let them choose. */
let startMode: TierMode = "queue";

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
  onNotice: flash,
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
  else if (kind === "draft") panel = mountDraftPanel(dom, act);
}

function renderGameActions(next: HostState): void {
  gameActions.replaceChildren();

  const soundBtn = button(next.soundOn ? "Sound on" : "Sound off", next.soundOn ? "primary" : "ghost");
  soundBtn.title = "Sound plays from the display window, and only if you share computer audio";
  soundBtn.onclick = () => act({ type: "sound/toggle" });
  gameActions.append(soundBtn);

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

/** A draft has no pool, so the set library is irrelevant while it's selected. */
function applyStartKind(): void {
  const drafting = startKind === "draft";
  tierMode.hidden = startKind !== "tierlist";
  draftStart.hidden = !drafting;
  setFilter.hidden = drafting;
  setsList.hidden = drafting;
  editor.hidden = drafting;
  setsCount.hidden = drafting;
}

for (const node of tierMode.querySelectorAll<HTMLButtonElement>("button[data-mode]")) {
  node.onclick = () => {
    startMode = node.dataset.mode === "open" ? "open" : "queue";
    for (const other of tierMode.querySelectorAll("button[data-mode]")) {
      other.classList.toggle("on", other === node);
    }
  };
}

el("draft-go").onclick = () => {
  if (state?.game && !confirm("A game is already running. Replace it?")) return;
  act({
    type: "draft/start",
    topic: draftTopic.value,
    subtitle: draftSubtitle.value,
    rounds: Number(draftRounds.value) || 2,
  });
};

function renderGamePick(): void {
  gamePick.replaceChildren();
  for (const game of GAMES.filter((g) => g.status === "ready")) {
    const node = button(game.title, game.id === startKind ? "pick on" : "pick");
    node.onclick = () => {
      startKind = game.id as GameKind;
      applyStartKind();
      renderGamePick();
      if (state) renderSets(state);
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
  editingArt = new Map(
    readItems(set?.items ?? [])
      .filter((i) => i.art)
      .map((i) => [i.label, i.art as Art]),
  );
  setDelete.disabled = !set;
  updatePreview();
  renderArtList();
  if (state) renderSets(state);
}

function currentLabels(): string[] {
  return setItems.value.split("\n").map((l) => l.trim()).filter(Boolean);
}

/**
 * Downscale to a fixed square, re-encode as WebP, and name the file by a hash
 * of its own bytes. Doing this in the browser means no image library on the
 * server, identical images dedupe for free, and every stored image is already
 * the size the display wants.
 */
async function prepareImage(source: Blob): Promise<string> {
  const SIZE = 320;
  const bitmap = await createImageBitmap(source);
  const canvas = document.createElement("canvas");
  canvas.width = SIZE;
  canvas.height = SIZE;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas unavailable.");

  const scale = Math.min(SIZE / bitmap.width, SIZE / bitmap.height);
  const w = bitmap.width * scale;
  const h = bitmap.height * scale;
  ctx.drawImage(bitmap, (SIZE - w) / 2, (SIZE - h) / 2, w, h);
  bitmap.close?.();

  const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/webp", 0.85));
  if (!blob) throw new Error("Could not encode that image.");
  const bytes = new Uint8Array(await blob.arrayBuffer());

  const digest = await crypto.subtle.digest("SHA-256", bytes);
  const id = [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("").slice(0, 32);

  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  act({ type: "images/put", id, data: btoa(binary) });
  return id;
}

/**
 * The browser can't resize a cross-origin image itself — drawing one to a
 * canvas taints it and `toBlob()` then throws — so the server fetches the bytes
 * and hands them back same-origin.
 */
async function blobFromUrl(url: string): Promise<Blob> {
  const response = await fetch(`/fetch-image?url=${encodeURIComponent(url)}`);
  if (!response.ok) throw new Error((await response.text()) || "Could not fetch that image.");
  return response.blob();
}

/** Pull an image URL out of whatever a drag or paste actually carried. */
function imageUrlFrom(data: DataTransfer | null): string | null {
  if (!data) return null;
  const uri = (data.getData("text/uri-list") || data.getData("text/plain") || "").split("\n")[0].trim();
  if (/^https?:\/\//i.test(uri)) return uri;
  // Dragging an image out of a page hands over its HTML rather than a URL.
  const html = data.getData("text/html");
  const match = html && /<img[^>]+src=["']([^"']+)["']/i.exec(html);
  return match ? match[1] : null;
}

type Suggestion = { title: string; thumb: string; source: string; license: string; artist: string };

/**
 * Walks the entries that have no art, one at a time, offering candidates from
 * Wikimedia Commons. Search is good for concrete things and useless for
 * abstract ones, so every image is accepted or rejected by hand rather than
 * applied in bulk.
 */
const review = { labels: [] as string[], at: 0, options: [] as Suggestion[], pick: 0, busy: false };

async function loadSuggestions(query: string): Promise<void> {
  review.options = [];
  review.pick = 0;
  suggestView.replaceChildren(text("span", "", "Searching…"));
  suggestMeta.textContent = "";
  try {
    const response = await fetch(`/suggest-images?q=${encodeURIComponent(query)}&n=8`);
    if (!response.ok) throw new Error((await response.text()) || "Search failed.");
    review.options = (await response.json()) as Suggestion[];
  } catch (err) {
    suggestView.replaceChildren(text("span", "", err instanceof Error ? err.message : "Search failed."));
    return;
  }
  showCandidate();
}

function showCandidate(): void {
  const option = review.options[review.pick];
  if (!option) {
    suggestView.replaceChildren(text("span", "", "Nothing found — try a different search."));
    suggestMeta.textContent = "";
    return;
  }
  const img = document.createElement("img");
  img.src = option.thumb;
  img.alt = option.title;
  suggestView.replaceChildren(img);

  suggestMeta.replaceChildren(
    document.createTextNode(`${option.license}${option.artist ? ` · ${option.artist}` : ""} · `),
  );
  const link = document.createElement("a");
  link.href = option.source;
  link.target = "_blank";
  link.rel = "noreferrer";
  link.textContent = "Wikimedia Commons";
  suggestMeta.append(link, document.createTextNode(`  (${review.pick + 1} of ${review.options.length})`));
}

function showItem(): void {
  if (review.at >= review.labels.length) return closeReview();
  const label = review.labels[review.at];
  suggestLabel.textContent = label;
  suggestPos.textContent = `${review.at + 1} of ${review.labels.length}`;
  suggestQuery.value = label;
  void loadSuggestions(label);
}

function closeReview(): void {
  suggest.hidden = true;
  review.labels = [];
  renderArtList();
}

el("art-suggest").onclick = () => {
  const pending = currentLabels().filter((l) => !editingArt.has(l));
  if (!pending.length) return flash("Every entry already has art.");
  review.labels = pending;
  review.at = 0;
  suggest.hidden = false;
  showItem();
};

el("suggest-next").onclick = () => {
  if (review.options.length < 2) return;
  review.pick = (review.pick + 1) % review.options.length;
  showCandidate();
};

el("suggest-skip").onclick = () => {
  review.at++;
  showItem();
};

el("suggest-close").onclick = closeReview;

suggestQuery.onkeydown = (event) => {
  if (event.key === "Enter") {
    event.preventDefault();
    void loadSuggestions(suggestQuery.value);
  }
};

const suggestUse = el<HTMLButtonElement>("suggest-use");
suggestUse.onclick = async () => {
  const option = review.options[review.pick];
  const label = review.labels[review.at];
  if (!option || !label || review.busy) return;
  review.busy = true;
  suggestUse.disabled = true;
  try {
    const blob = await blobFromUrl(option.thumb);
    editingArt.set(label, {
      image: await prepareImage(blob),
      source: option.source,
      license: option.license,
    });
    review.at++;
    showItem();
  } catch (err) {
    flash(err instanceof Error ? err.message : "Could not use that image.");
  } finally {
    review.busy = false;
    suggestUse.disabled = false;
  }
};

function artPreview(art: Art | undefined): HTMLElement {
  const node = text("span", "art-preview");
  if (!art) return node;
  if ("emoji" in art) node.textContent = art.emoji;
  else if ("color" in art) node.style.background = art.color;
  else {
    const img = document.createElement("img");
    img.src = `/images/${art.image}.webp`;
    img.alt = "";
    node.append(img);
  }
  return node;
}

function renderArtList(): void {
  artList.replaceChildren();
  const labels = currentLabels();
  if (!labels.length) {
    artList.append(text("p", "hint", "Add entries above first."));
    return;
  }

  for (const label of labels) {
    const art = editingArt.get(label);
    const row = text("div", "art-row");
    row.tabIndex = 0;
    row.title = "Drop or paste an image here";
    const labelCell = text("span", "art-label", label);
    if (art && "image" in art && art.license) {
      labelCell.append(text("span", "art-credit", ` ${art.license}`));
    }
    row.append(artPreview(art), labelCell);

    const useImage = async (get: () => Promise<Blob>) => {
      row.classList.add("busy");
      try {
        editingArt.set(label, { image: await prepareImage(await get()) });
        renderArtList();
      } catch (err) {
        row.classList.remove("busy");
        flash(err instanceof Error ? err.message : "Could not read that image.");
      }
    };

    row.ondragover = (event) => {
      event.preventDefault();
      row.classList.add("dropping");
    };
    row.ondragleave = () => row.classList.remove("dropping");
    row.ondrop = (event) => {
      event.preventDefault();
      row.classList.remove("dropping");
      const dropped = event.dataTransfer?.files?.[0];
      if (dropped?.type.startsWith("image/")) return void useImage(async () => dropped);
      const url = imageUrlFrom(event.dataTransfer);
      if (url) return void useImage(() => blobFromUrl(url));
      flash("That didn't carry an image.");
    };

    row.onpaste = (event) => {
      // Don't hijack a paste meant for the emoji field.
      if ((event.target as HTMLElement)?.tagName === "INPUT") return;
      for (const item of event.clipboardData?.items ?? []) {
        if (item.kind !== "file" || !item.type.startsWith("image/")) continue;
        const pasted = item.getAsFile();
        if (!pasted) continue;
        event.preventDefault();
        return void useImage(async () => pasted);
      }
      const url = imageUrlFrom(event.clipboardData);
      if (url) {
        event.preventDefault();
        void useImage(() => blobFromUrl(url));
      }
    };

    // onchange, not oninput: the list re-renders on edit and would steal focus.
    const emoji = document.createElement("input");
    emoji.className = "art-emoji-input";
    emoji.placeholder = "emoji";
    emoji.maxLength = 8;
    emoji.value = art && "emoji" in art ? art.emoji : "";
    emoji.onchange = () => {
      const value = emoji.value.trim();
      if (value) editingArt.set(label, { emoji: value });
      else editingArt.delete(label);
      renderArtList();
    };

    const color = document.createElement("input");
    color.type = "color";
    color.className = "art-color-input";
    color.title = "Use a color swatch";
    color.value = art && "color" in art ? art.color : "#ffc02e";
    color.onchange = () => {
      editingArt.set(label, { color: color.value });
      renderArtList();
    };

    const file = document.createElement("input");
    file.type = "file";
    file.accept = "image/*";
    file.hidden = true;
    file.onchange = async () => {
      const chosen = file.files?.[0];
      file.value = "";
      if (!chosen) return;
      await useImage(async () => chosen);
    };
    const pick = button("image", "mini");
    pick.title = "Upload an image";
    pick.onclick = () => file.click();

    const clear = button("✕", "mini");
    clear.title = "No art";
    clear.onclick = () => {
      editingArt.delete(label);
      renderArtList();
    };

    row.append(emoji, color, pick, file, clear);
    artList.append(row);
  }
}

function updatePreview(): void {
  const count = setItems.value.split("\n").filter((s) => s.trim()).length;
  if (count < 2) {
    setPreview.textContent = "At least 2 entries needed.";
    return;
  }
  // A bracket only takes the top seeds; a tier list takes the lot.
  const drawn = Math.min(count, BRACKET_MAX_ENTRANTS);
  const size = bracketSize(drawn);
  const byes = size - drawn;
  const bracketPart =
    count > BRACKET_MAX_ENTRANTS
      ? `bracket: top ${BRACKET_MAX_ENTRANTS} seeds, ${drawn - 1} matchups`
      : `bracket: ${size} slots, ${drawn - 1} matchups${byes ? `, ${byes} ${byes === 1 ? "bye" : "byes"}` : ""}`;
  setPreview.textContent = `${count} entries · ${bracketPart} · tier list: all ${count}`;
}

setItems.oninput = () => {
  updatePreview();
  renderArtList();
};
setFilter.oninput = () => {
  if (state) renderSets(state);
};

editor.onsubmit = (event) => {
  event.preventDefault();
  const items: RawItem[] = currentLabels().map((label) => {
    const art = editingArt.get(label);
    return art ? { label, art } : label;
  });
  act({
    type: "sets/save",
    set: { id: editingId ?? "", title: setTitle.value, subtitle: setSubtitle.value, items, updatedAt: Date.now() },
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

    if (selecting) {
      const box = document.createElement("input");
      box.type = "checkbox";
      box.className = "set-select";
      box.checked = selected.has(set.id);
      box.onclick = (event) => {
        event.stopPropagation();
        if (box.checked) selected.add(set.id);
        else selected.delete(set.id);
        renderPackControls();
      };
      row.append(box);
    }

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
    // A set's order is its seeding, so shuffling a bracket throws that away.
    // A tier list has no seeding, and a random queue keeps it fresh.
    shuffle.checked = startKind !== "bracket";
    shuffle.id = `shuffle-${set.id}`;
    const shuffleLabel = document.createElement("label");
    shuffleLabel.htmlFor = shuffle.id;
    shuffleLabel.title =
      startKind === "bracket" ? "Ignore the set's seeding and draw at random" : "Offer items in a random order";
    shuffleLabel.append(shuffle, document.createTextNode("shuffle"));

    const start = button("Start", "primary");
    start.onclick = () => {
      if (next.game && !confirm("A game is already running. Replace it?")) return;
      act({ type: "game/start", setId: set.id, kind: startKind, shuffle: shuffle.checked, mode: startMode });
    };

    actions.append(shuffleLabel, start);
    row.append(meta, actions);
    setsList.append(row);
  }
}

/* ---------- packs ---------- */

function exportPack(ids: string[] | null): void {
  const query = new URLSearchParams();
  const name = packName.value.trim();
  if (name) query.set("name", name);
  if (ids?.length) query.set("sets", ids.join(","));
  // Content-Disposition makes this a download, so the page stays put.
  window.location.href = `/pack.json?${query}`;
}

const packExport = el<HTMLButtonElement>("pack-export");
const packSelect = el<HTMLButtonElement>("pack-select");

packExport.onclick = () => {
  if (selecting) {
    if (!selected.size) return flash("No sets selected.");
    exportPack([...selected]);
    return;
  }
  exportPack(null);
};

packSelect.onclick = () => {
  selecting = !selecting;
  if (!selecting) selected.clear();
  renderPackControls();
  if (state) renderSets(state);
};

function renderPackControls(): void {
  packExport.textContent = selecting ? `Export ${selected.size} selected` : "Export all";
  packExport.className = selecting && selected.size ? "primary" : "";
  packSelect.textContent = selecting ? "Cancel" : "Choose sets…";
}

function renderUnused(next: HostState): void {
  packUnused.replaceChildren();
  if (!next.unusedImages) {
    packUnused.hidden = true;
    return;
  }
  packUnused.hidden = false;
  packUnused.append(
    document.createTextNode(`${next.unusedImages} stored image${next.unusedImages === 1 ? "" : "s"} no set uses. `),
  );
  const prune = button("Remove them", "mini");
  prune.onclick = () => act({ type: "images/prune" });
  packUnused.append(prune);
}

packImport.onchange = async () => {
  const file = packImport.files?.[0];
  packImport.value = "";
  if (!file) return;
  try {
    const pack = JSON.parse(await file.text());
    act({ type: "packs/import", pack });
  } catch {
    flash("That file isn't valid JSON.");
  }
};

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
  renderUnused(next);
  // The editor is deliberately not repopulated here — a state push mid-typing
  // would wipe what the operator is writing.
  if (editingId && !next.sets.some((s) => s.id === editingId)) loadEditor(null);
}

renderGamePick();
applyStartKind();
renderPackControls();
loadEditor(null);
