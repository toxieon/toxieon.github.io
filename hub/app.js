/* Hub v0.6.4 — registry, not crawler (§5.1). See hub/VERSION.
 * Apps come from apps.json, generated at build time by hub/build-apps.cjs from
 * each top-level folder's index.html (nd:* meta tags); search is nd-match fuzzy;
 * "Continue where you left off" reads the shared recents feed. */
const grid = document.getElementById("grid");
const statusEl = document.getElementById("status");
const visibleCount = document.getElementById("visibleCount");
const searchInput = document.getElementById("searchInput");
const recentsRow = document.getElementById("recentsRow");
const recentsList = document.getElementById("recentsList");
const cardTemplate = document.getElementById("cardTemplate");

let apps = [];

let lastLoad = 0;
async function loadHub() {
  lastLoad = Date.now();
  try {
    const r = await fetch("./apps.json", { cache: "no-cache" });
    const payload = await r.json();
    apps = (payload.apps || []).filter((a) => !a.hidden).sort((a, b) => (a.order || 99) - (b.order || 99));
    statusEl.textContent = "Neill Data suite";
  } catch (e) {
    statusEl.textContent = "Could not load apps.json";
    apps = [];
  }
  renderGrid();
  renderRecents();
}

function filteredApps() {
  const q = (searchInput.value || "").trim();
  if (!q || !window.NDMatch) return apps;
  return NDMatch.fuzzyFilter(q, apps, (a) => [a.name, a.id, a.path]);
}

function renderGrid() {
  const visible = filteredApps();
  grid.innerHTML = "";
  visible.forEach((app) => {
    const node = cardTemplate.content.cloneNode(true);
    const link = node.querySelector(".app-link");
    link.href = app.path;
    link.removeAttribute("target");
    const img = node.querySelector("img");
    img.src = app.icon;
    img.onerror = () => { img.hidden = true; node.querySelector(".fallback-icon")?.removeAttribute("hidden"); };
    node.querySelector(".app-title").textContent = app.name;
    node.querySelector(".app-path").textContent = app.path.replace(/\//g, "");
    const card = node.querySelector(".app-card");
    if (app.color) card.style.setProperty("--app-color", app.color);
    grid.appendChild(node);
  });
  visibleCount.textContent = String(visible.length);
}

async function renderRecents() {
  if (!window.NDUI || !NDUI.recentVisits) return;
  const recents = await NDUI.recentVisits(4);
  if (!recents.length) { recentsRow.hidden = true; return; }
  recentsList.innerHTML = "";
  recents.forEach((r) => {
    const app = apps.find((a) => a.id === r.app);
    const link = document.createElement("a");
    link.className = "recent-chip";
    link.href = r.url || (app ? app.path : "/");
    link.innerHTML = `<img src="${app ? app.icon : "/favicon.svg"}" alt="" width="20" height="20" />` +
      `<span><strong>${escapeHtml(r.label)}</strong><small>${escapeHtml(app ? app.name : r.app)} · ${timeAgo(r.ts)}</small></span>`;
    recentsList.appendChild(link);
  });
  recentsRow.hidden = false;
}

function escapeHtml(v) {
  return String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

function timeAgo(ts) {
  const m = Math.round((Date.now() - ts) / 60000);
  if (m < 1) return "now";
  if (m < 60) return m + "m ago";
  const h = Math.round(m / 60);
  if (h < 24) return h + "h ago";
  return Math.round(h / 24) + "d ago";
}

searchInput.addEventListener("input", renderGrid);
// An installed hub resumed from the background never reloads the page, so refresh
// the app list when it becomes visible again (at most once a minute) and when a
// new service worker takes over, so newly deployed tiles show without a reload.
document.addEventListener("visibilitychange", () => {
  if (document.hidden) return;
  if (Date.now() - lastLoad > 60000) loadHub(); else renderRecents();
});
if ("serviceWorker" in navigator) navigator.serviceWorker.addEventListener("controllerchange", () => loadHub());
loadHub();

/* §1.6 suite-wide water-fill sync tube (shared). The hub is a launcher with no
 * write queue, so the tube reflects connection state to stay visually consistent. */
if (window.NDUI && NDUI.syncTube) {
  NDUI.syncTube(null, { labels: { synced: "Online", pending: "Offline" } });
}
