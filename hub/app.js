const state = {
  target: "https://neilldata.com",
  repo: "toxieon/toxieon.github.io",
  items: [],
  filtered: [],
  blacklist: loadBlacklist(),
  search: "",
  branch: "all",
  bulkMode: false,
  selected: new Set(),
  loading: false
};

const els = {
  tabs: document.querySelectorAll(".tab"),
  appsView: document.querySelector("#appsView"),
  settingsView: document.querySelector("#settingsView"),
  targetInput: document.querySelector("#targetInput"),
  refreshBtn: document.querySelector("#refreshBtn"),
  searchInput: document.querySelector("#searchInput"),
  branchFilter: document.querySelector("#branchFilter"),
  status: document.querySelector("#status"),
  grid: document.querySelector("#grid"),
  visibleCount: document.querySelector("#visibleCount"),
  cardTemplate: document.querySelector("#cardTemplate"),
  blacklistForm: document.querySelector("#blacklistForm"),
  blacklistInput: document.querySelector("#blacklistInput"),
  blacklistList: document.querySelector("#blacklistList"),
  clearBlacklistBtn: document.querySelector("#clearBlacklistBtn"),
  bulkModeBtn: document.querySelector("#bulkModeBtn"),
  applyBulkBlacklistBtn: document.querySelector("#applyBulkBlacklistBtn"),
  cancelBulkBtn: document.querySelector("#cancelBulkBtn"),
  selectedCount: document.querySelector("#selectedCount"),
  presetButtons: document.querySelectorAll(".chip-button")
};

els.tabs.forEach((tab) => {
  tab.addEventListener("click", () => switchView(tab.dataset.view));
});

els.refreshBtn.addEventListener("click", () => {
  state.target = els.targetInput.value.trim() || "https://neilldata.com";
  loadHub();
});

els.targetInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    state.target = els.targetInput.value.trim() || "https://neilldata.com";
    loadHub();
  }
});

els.searchInput.addEventListener("input", () => {
  state.search = els.searchInput.value.trim().toLowerCase();
  applyFilters();
});

els.branchFilter.addEventListener("change", () => {
  state.branch = els.branchFilter.value;
  applyFilters();
});

els.bulkModeBtn.addEventListener("click", () => {
  setBulkMode(!state.bulkMode);
});

els.applyBulkBlacklistBtn.addEventListener("click", () => {
  applyBulkBlacklist();
});

els.cancelBulkBtn.addEventListener("click", () => {
  setBulkMode(false);
});

els.blacklistForm.addEventListener("submit", (event) => {
  event.preventDefault();
  addBlacklistPattern(els.blacklistInput.value);
  els.blacklistInput.value = "";
});

els.clearBlacklistBtn.addEventListener("click", () => {
  state.blacklist = [];
  persistBlacklist();
  renderBlacklist();
  applyFilters();
});

els.presetButtons.forEach((button) => {
  button.addEventListener("click", () => addBlacklistPattern(button.dataset.pattern));
});

renderBlacklist();
renderBulkControls();
loadHub();

async function loadHub() {
  state.loading = true;
  setStatus("Scanning neilldata...");
  renderGrid();

  try {
    const response = await fetch(`${apiBase()}/api/discover?target=${encodeURIComponent(state.target)}&repo=${encodeURIComponent(state.repo)}&depth=1&limit=700`);
    const payload = await response.json();

    if (!response.ok) {
      throw new Error(payload.detail || payload.error || "Could not scan the site.");
    }

    state.items = Array.isArray(payload.items) ? payload.items : [];
    state.target = payload.target || state.target;
    els.targetInput.value = state.target;
    populateBranchFilter();
    setStatus(buildStatusText(payload));
  } catch (error) {
    state.items = [];
    populateBranchFilter();
    setStatus("Live scraper offline. Start Hub locally to scan pages.");
  } finally {
    state.loading = false;
    applyFilters();
  }
}

function applyFilters() {
  const rules = state.blacklist.map(compilePattern).filter(Boolean);

  state.filtered = state.items.filter((item) => {
    const haystack = `${item.title} ${item.path} ${item.url} ${item.headings?.join(" ") || ""}`.toLowerCase();
    const matchesSearch = !state.search || haystack.includes(state.search);
    const matchesBranch = state.branch === "all" || item.branch === state.branch;
    const blocked = rules.some((rule) => rule(item.url));
    return matchesSearch && matchesBranch && !blocked;
  });

  syncSelectedItems();
  renderBulkControls();
  renderGrid();
}

function renderGrid() {
  els.visibleCount.textContent = state.filtered.length;
  els.grid.replaceChildren();

  if (state.loading) return;

  if (!state.filtered.length) {
    const empty = document.createElement("div");
    empty.className = "empty-state";

    const title = document.createElement("h2");
    title.textContent = state.items.length ? "All matching apps are hidden" : "No apps loaded";

    const message = document.createElement("p");
    message.textContent = state.items.length
      ? "Change the search, branch filter, or blacklist rules."
      : "Start Hub locally, then refresh to scan GitHub and live neilldata pages.";

    empty.append(title, message);
    els.grid.append(empty);
    return;
  }

  const fragment = document.createDocumentFragment();

  state.filtered.forEach((item, index) => {
    const card = els.cardTemplate.content.firstElementChild.cloneNode(true);
    const link = card.querySelector(".app-link");
    const image = card.querySelector("img");
    const fallback = card.querySelector(".fallback-icon");
    const title = card.querySelector(".app-title");
    const path = card.querySelector(".app-path");
    const label = appLabel(item);
    const selected = state.selected.has(item.url);

    card.classList.toggle("is-selected", selected);

    link.href = item.url;
    link.title = item.headings?.length ? item.headings.join(" | ") : item.title;
    link.setAttribute("aria-label", state.bulkMode ? `Select ${label}` : `Open ${label}`);
    link.setAttribute("aria-pressed", state.bulkMode ? String(selected) : "false");
    link.addEventListener("click", (event) => {
      if (!state.bulkMode) return;
      event.preventDefault();
      toggleSelected(item.url);
    });
    image.src = item.icon;
    image.addEventListener("error", () => image.classList.add("is-hidden"), { once: true });
    fallback.textContent = item.letter || getInitial(label);
    fallback.style.background = cardGradient(index);
    title.textContent = label;
    path.textContent = displayPath(item);

    fragment.append(card);
  });

  els.grid.append(fragment);
}

function renderBlacklist() {
  els.blacklistList.replaceChildren();

  if (!state.blacklist.length) {
    const empty = document.createElement("div");
    empty.className = "empty-rules";
    empty.textContent = "No blacklist rules yet.";
    els.blacklistList.append(empty);
    return;
  }

  state.blacklist.forEach((pattern) => {
    const row = document.createElement("div");
    row.className = "rule-item";

    const label = document.createElement("span");
    label.textContent = pattern;

    const remove = document.createElement("button");
    remove.className = "remove-rule";
    remove.type = "button";
    remove.textContent = "x";
    remove.title = `Remove ${pattern}`;
    remove.setAttribute("aria-label", `Remove ${pattern}`);
    remove.addEventListener("click", () => {
      state.blacklist = state.blacklist.filter((item) => item !== pattern);
      persistBlacklist();
      renderBlacklist();
      applyFilters();
    });

    row.append(label, remove);
    els.blacklistList.append(row);
  });
}

function populateBranchFilter() {
  const current = state.branch;
  const branches = [...new Set(state.items.map((item) => item.branch).filter(Boolean))]
    .sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }));

  els.branchFilter.replaceChildren(new Option("All branches", "all"));

  branches.forEach((branch) => {
    const label = branch === "home" ? "Home" : titleCase(branch.replace(/[-_]+/g, " "));
    els.branchFilter.append(new Option(label, branch));
  });

  state.branch = branches.includes(current) ? current : "all";
  els.branchFilter.value = state.branch;
}

function addBlacklistPattern(value) {
  const pattern = normalizePattern(value);
  if (!pattern || state.blacklist.includes(pattern)) return;

  state.blacklist = [...state.blacklist, pattern];
  persistBlacklist();
  renderBlacklist();
  applyFilters();
}

function addBlacklistPatterns(values) {
  const patterns = values.map(normalizePattern).filter(Boolean);
  const merged = new Set(state.blacklist);

  patterns.forEach((pattern) => merged.add(pattern));
  state.blacklist = [...merged];
  persistBlacklist();
  renderBlacklist();
  applyFilters();
}

function setBulkMode(enabled) {
  state.bulkMode = enabled;
  state.selected.clear();
  renderBulkControls();
  renderGrid();
}

function toggleSelected(url) {
  if (state.selected.has(url)) {
    state.selected.delete(url);
  } else {
    state.selected.add(url);
  }

  renderBulkControls();
  renderGrid();
}

function applyBulkBlacklist() {
  if (!state.selected.size) return;

  const selectedItems = state.items.filter((item) => state.selected.has(item.url));
  const patterns = selectedItems.map((item) => blacklistPatternForItem(item));
  state.bulkMode = false;
  state.selected.clear();
  addBlacklistPatterns(patterns);
}

function renderBulkControls() {
  els.bulkModeBtn.textContent = state.bulkMode ? "Selecting" : "Bulk blacklist";
  els.bulkModeBtn.classList.toggle("is-active", state.bulkMode);
  els.cancelBulkBtn.hidden = !state.bulkMode;
  els.applyBulkBlacklistBtn.disabled = state.selected.size === 0;
  els.selectedCount.textContent = `${state.selected.size} selected`;
}

function syncSelectedItems() {
  const visibleUrls = new Set(state.filtered.map((item) => item.url));
  for (const url of [...state.selected]) {
    if (!visibleUrls.has(url)) state.selected.delete(url);
  }
}

function blacklistPatternForItem(item) {
  return comparableUrl(item.url);
}

function compilePattern(pattern) {
  const normalized = normalizePattern(pattern);
  if (!normalized) return null;

  const startsWith = normalized.endsWith("*");
  const base = startsWith ? normalized.slice(0, -1) : normalized;

  return (rawUrl) => {
    const comparable = comparableUrl(rawUrl);
    return startsWith ? comparable.startsWith(base) : comparable === base;
  };
}

function normalizePattern(value) {
  return String(value || "")
    .trim()
    .replace(/^https?:\/\//i, "")
    .replace(/^www\./i, "")
    .replace(/\/+(\*)?$/, "$1")
    .toLowerCase();
}

function comparableUrl(rawUrl) {
  try {
    const url = new URL(rawUrl);
    const host = url.host.replace(/^www\./i, "");
    const path = url.pathname === "/" ? "" : url.pathname.replace(/\/+$/, "");
    return `${host}${path}`.toLowerCase();
  } catch {
    return String(rawUrl || "").replace(/^https?:\/\//i, "").replace(/^www\./i, "").toLowerCase();
  }
}

function displayPath(item) {
  if (item.path === "/") return item.host;
  return `${item.host}${item.path}`;
}

function appLabel(item) {
  if (!item.path || item.path === "/") return "Home";
  const parts = item.path.split("/").filter(Boolean);
  const last = parts[parts.length - 1] || item.title || "App";
  return titleCase(last.replace(/\.(html?|php|aspx?)$/i, "").replace(/[-_]+/g, " "));
}

function apiBase() {
  return window.location.protocol === "file:" ? "http://localhost:4173" : "";
}

function setStatus(message) {
  els.status.textContent = message || "";
}

function buildStatusText(payload) {
  const bits = [`Found ${payload.count || 0} branches in ${payload.elapsedMs || 0}ms.`];
  if (payload.notes?.length) bits.push(payload.notes[0]);
  return bits.join(" ");
}

function switchView(view) {
  if (view !== "apps" && state.bulkMode) {
    state.bulkMode = false;
    state.selected.clear();
    renderBulkControls();
  }

  els.tabs.forEach((tab) => tab.classList.toggle("is-active", tab.dataset.view === view));
  els.appsView.classList.toggle("is-active", view === "apps");
  els.settingsView.classList.toggle("is-active", view === "settings");
}

function loadBlacklist() {
  try {
    const saved = JSON.parse(localStorage.getItem("hub.blacklist") || "[]");
    return Array.isArray(saved) ? saved.map(normalizePattern).filter(Boolean) : [];
  } catch {
    return [];
  }
}

function persistBlacklist() {
  localStorage.setItem("hub.blacklist", JSON.stringify(state.blacklist));
}

function cardGradient(index) {
  const gradients = [
    "linear-gradient(135deg, #18746a, #377ec8)",
    "linear-gradient(135deg, #cf5f7c, #18746a)",
    "linear-gradient(135deg, #2d6a4f, #f0c14b)",
    "linear-gradient(135deg, #364f6b, #cf5f7c)",
    "linear-gradient(135deg, #8a5a44, #377ec8)"
  ];
  return gradients[index % gradients.length];
}

function getInitial(value) {
  const match = String(value || "").match(/[a-z0-9]/i);
  return match ? match[0].toUpperCase() : "H";
}

function titleCase(value) {
  return value.replace(/\b\w/g, (char) => char.toUpperCase());
}
