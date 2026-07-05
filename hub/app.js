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
  setStatus(shouldUseStaticDiscovery() ? "Scanning GitHub repo..." : "Scanning neilldata...");
  renderGrid();

  try {
    const payload = shouldUseStaticDiscovery() ? await discoverStaticHub() : await discoverApiHub();
    applyPayload(payload);
  } catch (error) {
    try {
      const payload = await discoverStaticHub();
      applyPayload(payload);
    } catch {
      state.items = [];
      populateBranchFilter();
      setStatus("Could not scan the GitHub repo or local scraper.");
    }
  } finally {
    state.loading = false;
    applyFilters();
  }
}

async function discoverApiHub() {
  const response = await fetch(`${apiBase()}/api/discover?target=${encodeURIComponent(state.target)}&repo=${encodeURIComponent(state.repo)}&depth=1&limit=700`);
  const payload = await response.json();

  if (!response.ok) {
    throw new Error(payload.detail || payload.error || "Could not scan the site.");
  }

  return payload;
}

async function discoverStaticHub() {
  const started = performance.now();
  const target = normalizeTarget(state.target);
  const routes = await discoverGitHubRoutes(state.repo, target);
  const items = routes
    .map((route) => toHubItem(route, target))
    .sort((a, b) => a.path.localeCompare(b.path, undefined, { sensitivity: "base" }));

  return {
    target,
    favicon: `${target}/favicon.svg`,
    count: items.length,
    generatedAt: new Date().toISOString(),
    elapsedMs: Math.round(performance.now() - started),
    notes: [`Found ${items.length} routes in ${state.repo}.`],
    items
  };
}

function applyPayload(payload) {
  state.items = Array.isArray(payload.items) ? payload.items : [];
  state.target = payload.target || state.target;
  els.targetInput.value = state.target;
  populateBranchFilter();
  setStatus(buildStatusText(payload));
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

async function discoverGitHubRoutes(repoSlug, target) {
  const repo = parseGithubRepo(repoSlug);
  if (!repo) throw new Error("Invalid GitHub repo.");

  const repoMeta = await fetchJson(`https://api.github.com/repos/${repo.owner}/${repo.repo}`);
  const branch = repo.branch || repoMeta.default_branch || "main";
  const treePayload = await fetchJson(`https://api.github.com/repos/${repo.owner}/${repo.repo}/git/trees/${encodeURIComponent(branch)}?recursive=1`);
  const entries = Array.isArray(treePayload.tree) ? treePayload.tree : [];
  const paths = new Set(entries.map((entry) => entry.path));
  const routes = [];
  const seenRoutes = new Set();

  for (const entry of entries) {
    if (entry.type !== "blob") continue;
    const routePath = routeFromRepoPath(entry.path);
    if (!routePath || seenRoutes.has(routePath)) continue;

    seenRoutes.add(routePath);
    routes.push({
      routePath,
      repoPath: entry.path,
      rawUrl: githubRawUrl(repo.owner, repo.repo, branch, entry.path),
      label: routeLabel(routePath),
      icon: iconFromRepoPath(routePath, paths, target)
    });
  }

  return mapLimit(routes, 8, async (route) => hydrateGitHubRoute(route, target));
}

async function hydrateGitHubRoute(route, target) {
  const html = await fetchText(route.rawUrl).catch(() => "");
  const baseUrl = routeBaseUrl(route, target);
  const title = html ? extractTitle(html) || route.label : route.label;
  const headings = html ? extractHeadings(html) : [];
  const icon = html ? extractFavicon(html, baseUrl) || route.icon || `${target}/favicon.svg` : route.icon;

  return {
    routePath: route.routePath,
    repoPath: route.repoPath,
    label: route.label,
    title,
    headings,
    icon,
    source: "github"
  };
}

function routeBaseUrl(route, target) {
  if (route.repoPath && route.repoPath.toLowerCase().endsWith("/index.html")) {
    return route.routePath === "/" ? `${target}/` : `${target}${route.routePath}/`;
  }

  return `${target}/`;
}

function toHubItem(route, target) {
  const url = normalizeUrl(new URL(route.routePath, `${target}/`).href, siteKey(new URL(target).hostname));
  const parsed = new URL(url);
  const path = parsed.pathname === "/" ? "/" : parsed.pathname.replace(/\/$/, "");
  const label = route.title || route.label || routeLabel(path);

  return {
    url,
    host: parsed.host,
    path,
    branch: path === "/" ? "home" : path.split("/").filter(Boolean)[0] || "home",
    title: cleanTitle(label),
    headings: route.headings || [],
    icon: route.icon || `${target}/favicon.svg`,
    letter: getInitial(label || parsed.hostname),
    repoPath: route.repoPath || null,
    source: route.source || "github"
  };
}

async function fetchJson(url) {
  const response = await fetch(url, { headers: { Accept: "application/vnd.github+json" } });
  if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
  return response.json();
}

async function fetchText(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
  return response.text();
}

async function mapLimit(items, limit, mapper) {
  const results = new Array(items.length);
  let nextIndex = 0;

  async function worker() {
    while (nextIndex < items.length) {
      const currentIndex = nextIndex;
      nextIndex += 1;
      results[currentIndex] = await mapper(items[currentIndex], currentIndex);
    }
  }

  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

function parseGithubRepo(repoSlug) {
  const match = String(repoSlug || "").trim().match(/^([^/\s#]+)\/([^/\s#]+)(?:#(.+))?$/);
  if (!match) return null;

  return {
    owner: match[1],
    repo: match[2],
    branch: match[3] || ""
  };
}

function routeFromRepoPath(path) {
  const cleanPath = String(path || "").replace(/\\/g, "/");
  const lower = cleanPath.toLowerCase();
  const fileName = lower.split("/").pop() || "";
  if (!lower.endsWith(".html")) return "";
  if (fileName.includes("old") || fileName.includes("test")) return "";

  if (lower === "index.html") return "/";
  if (lower.endsWith("/index.html")) return `/${cleanPath.slice(0, -"/index.html".length)}`;
  if (lower.startsWith("areas/") && !cleanPath.slice("areas/".length).includes("/")) {
    return `/${cleanPath.slice("areas/".length, -".html".length)}`;
  }
  if (!cleanPath.includes("/")) return `/${cleanPath.slice(0, -".html".length)}`;

  return `/${cleanPath.slice(0, -".html".length)}`;
}

function routeLabel(routePath) {
  if (!routePath || routePath === "/") return "Home";
  const parts = routePath.split("/").filter(Boolean);
  const last = parts[parts.length - 1] || "App";
  return titleCase(last.replace(/[-_]+/g, " "));
}

function iconFromRepoPath(routePath, paths, target) {
  const parts = routePath.split("/").filter(Boolean);
  const dir = parts.length ? parts.join("/") : "";
  const candidates = [
    dir ? `${dir}/favicon.svg` : "favicon.svg",
    dir ? `${dir}/favicon.ico` : "favicon.ico"
  ];
  const found = candidates.find((path) => paths.has(path));
  return found ? new URL(found, `${target}/`).href : "";
}

function githubRawUrl(owner, repo, branch, path) {
  const cleanPath = String(path || "")
    .split("/")
    .map((part) => encodeURIComponent(part))
    .join("/");
  return `https://raw.githubusercontent.com/${owner}/${repo}/${encodeURIComponent(branch)}/${cleanPath}`;
}

function extractTitle(html) {
  const match = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  return match ? cleanText(stripTags(match[1])) : "";
}

function extractHeadings(html) {
  const headings = [];
  const pattern = /<h([1-3])\b[^>]*>([\s\S]*?)<\/h\1>/gi;

  for (const match of html.matchAll(pattern)) {
    const text = cleanText(stripTags(match[2]));
    if (text && !headings.includes(text)) headings.push(text);
    if (headings.length >= 8) break;
  }

  return headings;
}

function extractFavicon(html, baseUrl) {
  const linkTags = html.match(/<link\b[^>]*>/gi) || [];
  const icons = [];

  for (const tag of linkTags) {
    const rel = getAttribute(tag, "rel");
    const href = getAttribute(tag, "href");
    if (!href || !/(^|\s)(icon|shortcut icon|apple-touch-icon)(\s|$)/i.test(rel)) continue;

    try {
      icons.push(new URL(decodeHtml(href), baseUrl).href);
    } catch {
      // Ignore malformed icon links.
    }
  }

  return icons.find((icon) => /\.svg(?:[?#]|$)/i.test(icon)) || icons[0] || "";
}

function getAttribute(tag, name) {
  const pattern = new RegExp(`${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, "i");
  const match = tag.match(pattern);
  return match ? match[1] || match[2] || match[3] || "" : "";
}

function stripTags(value) {
  return String(value)
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<[^>]+>/g, " ");
}

function cleanTitle(title) {
  return cleanText(title)
    .replace(/\s+\|\s+Neilldata.*$/i, "")
    .replace(/\s+\|\s+Neill Data.*$/i, "")
    .replace(/\s+-\s+Neilldata.*$/i, "")
    .replace(/\s+-\s+Neill Data.*$/i, "")
    .replace(/^Neilldata\s*[-|]\s*/i, "")
    .replace(/^Neill Data\s*[-|]\s*/i, "");
}

function cleanText(value) {
  return decodeHtml(String(value || ""))
    .replace(/\s+/g, " ")
    .trim();
}

function decodeHtml(value) {
  return String(value)
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCodePoint(Number.parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec) => String.fromCodePoint(Number.parseInt(dec, 10)));
}

function normalizeTarget(input) {
  const withProtocol = /^https?:\/\//i.test(input) ? input : `https://${input}`;
  const url = new URL(withProtocol);
  url.hostname = siteKey(url.hostname);
  return url.origin;
}

function normalizeUrl(input, siteHost = "") {
  const url = new URL(input);
  url.hash = "";
  if (siteHost && siteKey(url.hostname) === siteKey(siteHost)) {
    url.hostname = siteKey(siteHost);
  }
  if (url.pathname !== "/") url.pathname = url.pathname.replace(/\/+$/, "");
  return url.href;
}

function siteKey(hostname) {
  return String(hostname || "").toLowerCase().replace(/^www\./, "");
}

function apiBase() {
  return window.location.protocol === "file:" ? "http://localhost:4173" : "";
}

function shouldUseStaticDiscovery() {
  return window.location.protocol === "file:";
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
