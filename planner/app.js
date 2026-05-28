/* =========================================================================
 *  NeillPlanner v0.3
 *  - No seed data. Empty on first run.
 *  - Google sign-in (GIS token model).
 *  - Drive: NeillPlanner / Admin Files / Projects / Unfiled Projects /
 *           NeillPlanner-Audit (Sheet), NeillPlanner-Categories (Sheet).
 *  - Categories are tabs in NeillPlanner-Categories. Item|Code|Description|Color.
 *  - Node creation: category -> line item (from sheet) -> auto title (custom optional).
 *  - Mass-create mode (cursor becomes a node).
 *  - Markers colour-coded by category + ring by status.
 *  - Clone / duplicate node from the drawer.
 *  - Per-project floor plans synced to Drive (fetched back on demand).
 *  - Portal nodes (door / stairs / warp) link two projects bidirectionally.
 * ========================================================================= */

const STORAGE_KEY = "neillplanner-state-v3";
const APP_VERSION = "0.3.0";

const statusMeta = {
  "Not Started": { color: "#2563eb", key: "not-started" },
  "In Progress": { color: "#f59e0b", key: "in-progress" },
  Complete: { color: "#22c55e", key: "complete" },
  Issue: { color: "#ef4444", key: "issue" }
};

const DRIVE_ROOT_NAME = "NeillPlanner";
const DRIVE_ADMIN_FOLDER = "Admin Files";
const DRIVE_PROJECTS_FOLDER = "Projects";
const DRIVE_UNFILED_FOLDER = "Unfiled Projects";
const AUDIT_SHEET_NAME = "NeillPlanner-Audit";
const AUDIT_TAB = "Audit";
const AUDIT_HEADER = ["Timestamp","User","Action","Project ID","Project Name","Folder","Node ID","Node Title","Category","Status","Details","Device"];
const CATEGORIES_SHEET_NAME = "NeillPlanner-Categories";
const DEFAULT_CATEGORY_TABS = [
  { name: "Electrical", color: "#f59e0b" },
  { name: "Data",       color: "#0ea5e9" },
  { name: "AC",         color: "#14b8a6" }
];
const CATEGORIES_HEADER = ["Item", "Code", "Description", "Color"];
const DEFAULT_FOLDER_COLORS = ["#0ea5e9","#14b8a6","#f59e0b","#a855f7","#ef4444","#22c55e","#6366f1"];

const googleConfig = window.NEILL_PLANNER_CONFIG || {};
const hasGoogleApiKey = Boolean(googleConfig.googleApiKey && !googleConfig.googleApiKey.includes("PASTE_"));
const hasGoogleClientId = Boolean(googleConfig.googleClientId && !googleConfig.googleClientId.includes("PASTE_"));
const googleScopes = (googleConfig.scopes || ["https://www.googleapis.com/auth/drive.file"]).join(" ");

const iconPaths = {
  projects: '<path d="M3 7.5 12 3l9 4.5-9 4.5L3 7.5Z"/><path d="m3 12 9 4.5L21 12"/><path d="m3 16.5 9 4.5 9-4.5"/>',
  map: '<path d="M9 18 3 21V6l6-3 6 3 6-3v15l-6 3-6-3Z"/><path d="M9 3v15"/><path d="M15 6v15"/>',
  chart: '<path d="M4 19V5"/><path d="M4 19h16"/><path d="M8 15v-4"/><path d="M12 15V8"/><path d="M16 15v-6"/>',
  audit: '<path d="M8 6h13"/><path d="M8 12h13"/><path d="M8 18h13"/><path d="M3 6h.01"/><path d="M3 12h.01"/><path d="M3 18h.01"/>',
  settings: '<path d="M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Z"/><path d="M19.4 15a1.8 1.8 0 0 0 .36 1.98l.04.04a2.1 2.1 0 0 1-2.97 2.97l-.04-.04a1.8 1.8 0 0 0-1.98-.36 1.8 1.8 0 0 0-1.09 1.65V21a2.1 2.1 0 0 1-4.2 0v-.06a1.8 1.8 0 0 0-1.08-1.65 1.8 1.8 0 0 0-1.99.36l-.04.04a2.1 2.1 0 0 1-2.97-2.97l.04-.04A1.8 1.8 0 0 0 4.6 15a1.8 1.8 0 0 0-1.65-1.09H3a2.1 2.1 0 0 1 0-4.2h.06A1.8 1.8 0 0 0 4.7 8.63a1.8 1.8 0 0 0-.36-1.99l-.04-.04a2.1 2.1 0 1 1 2.97-2.97l.04.04A1.8 1.8 0 0 0 9.3 4.04 1.8 1.8 0 0 0 10.38 2.4V2a2.1 2.1 0 0 1 4.2 0v.06a1.8 1.8 0 0 0 1.09 1.65 1.8 1.8 0 0 0 1.98-.36l.04-.04a2.1 2.1 0 1 1 2.97 2.97l-.04.04a1.8 1.8 0 0 0-.36 1.99 1.8 1.8 0 0 0 1.65 1.08H21a2.1 2.1 0 0 1 0 4.2h-.06A1.8 1.8 0 0 0 19.4 15Z"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
  plus: '<path d="M12 5v14"/><path d="M5 12h14"/>',
  upload: '<path d="M12 16V4"/><path d="m7 9 5-5 5 5"/><path d="M20 16v4H4v-4"/>',
  download: '<path d="M12 4v12"/><path d="m17 11-5 5-5-5"/><path d="M20 20H4"/>',
  zoomIn: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/><path d="M11 8v6"/><path d="M8 11h6"/>',
  zoomOut: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/><path d="M8 11h6"/>',
  target: '<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="3"/><path d="M12 2v3"/><path d="M12 19v3"/><path d="M2 12h3"/><path d="M19 12h3"/>',
  close: '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>',
  share: '<path d="M4 12v7a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-7"/><path d="M16 6 12 2 8 6"/><path d="M12 2v14"/>',
  check: '<path d="m20 6-11 11-5-5"/>',
  trash: '<path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="M19 6l-1 15H6L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/>',
  edit: '<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/>',
  folder: '<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z"/>',
  link: '<path d="M10 13a5 5 0 0 0 7.07 0l2.12-2.12a5 5 0 0 0-7.07-7.07L11 4.93"/><path d="M14 11a5 5 0 0 0-7.07 0L4.81 13.1a5 5 0 0 0 7.07 7.07L13 19.07"/>',
  arrowLeft: '<path d="m15 18-6-6 6-6"/>',
  arrowRight: '<path d="m9 18 6-6-6-6"/>',
  google: '<path d="M21.35 11.1H12v3.2h5.35c-.49 2.3-2.43 3.78-5.35 3.78-3.2 0-5.78-2.6-5.78-5.78s2.58-5.78 5.78-5.78c1.46 0 2.77.53 3.78 1.4l2.42-2.4A8.85 8.85 0 0 0 12 3.2a8.8 8.8 0 1 0 0 17.6c5.1 0 8.45-3.55 8.45-8.55 0-.6-.05-1.15-.1-1.15Z"/>',
  refresh: '<path d="M21 12a9 9 0 1 1-3-6.7"/><path d="M21 3v6h-6"/>',
  signOut: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="m16 17 5-5-5-5"/><path d="M21 12H9"/>',
  copy: '<rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>',
  portal: '<path d="M3 21V8a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4v13"/><path d="M3 21h18"/><path d="M14 12h2"/>',
  mass: '<circle cx="6" cy="6" r="2"/><circle cx="18" cy="6" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="6" cy="18" r="2"/><circle cx="18" cy="18" r="2"/>'
};

function freshState() {
  return {
    activeView: "projects", selectedProjectId: null, selectedNodeId: null,
    drawerOpen: false, modal: null, lightbox: null, toast: "",
    selectedFolderId: "all",
    filters: { query: "", status: "All", category: "All", assignee: "All", layer: "All" },
    canvas: { zoom: 1, panX: 0, panY: 0 },
    projectFolders: [], projects: [], nodes: [], floorPlans: {},
    googleAuth: { librariesReady: false, signedIn: false, accessToken: null, expiresAt: null, profile: null, bootstrapped: false, bootstrapping: false, lastError: null },
    drive: { rootFolderId: null, adminFolderId: null, projectsFolderId: null, unfiledFolderId: null, auditSheetId: null, categoriesSheetId: null, projectFolderMap: {}, nodeFolderMap: {} },
    categoriesData: {}, categoriesLoadedAt: null,
    auditQueue: [],
    auditView: { loaded: false, loading: false, rows: [], lastFetchedAt: null,
      filters: { from: "", to: "", user: "All", action: "All", projectId: "All", nodeQuery: "", detailsQuery: "", query: "" } },
    massMode: { active: false, category: null, lineItem: null, status: "Not Started", count: 0 }
  };
}

let state = loadState();
let dragState = null;

function loadState() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (saved && typeof saved === "object") {
      const fresh = freshState();
      const merged = { ...fresh, ...saved, modal: null, lightbox: null, toast: "", massMode: fresh.massMode };
      merged.googleAuth = { ...fresh.googleAuth, bootstrapped: saved.googleAuth?.bootstrapped || false, profile: saved.googleAuth?.profile || null };
      merged.drive = { ...fresh.drive, ...(saved.drive || {}) };
      merged.auditView = { ...fresh.auditView, filters: { ...fresh.auditView.filters, ...(saved.auditView?.filters || {}) } };
      merged.categoriesData = saved.categoriesData || {};
      merged.categoriesLoadedAt = saved.categoriesLoadedAt || null;
      if (merged.selectedProjectId && !merged.projects.some((p) => p.id === merged.selectedProjectId)) merged.selectedProjectId = merged.projects[0]?.id || null;
      return merged;
    }
  } catch (e) { console.warn("Saved state could not be loaded", e); }
  return freshState();
}

function persist() {
  const saveable = {
    ...state, modal: null, lightbox: null, toast: "",
    massMode: { active: false, category: null, lineItem: null, status: "Not Started", count: 0 },
    googleAuth: { bootstrapped: state.googleAuth.bootstrapped, profile: state.googleAuth.profile },
    auditView: { ...freshState().auditView, filters: state.auditView.filters }
  };
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(saveable)); }
  catch (e) { console.warn("Persist failed", e); }
}

function uid(prefix) { return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`; }
function icon(name) { return `<svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round">${iconPaths[name] || ""}</svg>`; }
function escapeHtml(value) { return String(value ?? "").replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll('"',"&quot;").replaceAll("'","&#039;"); }
function statusStyle(status) { return `--status:${statusMeta[status]?.color || "#2563eb"}`; }
function statusPill(status) { return `<span class="status-pill" style="${statusStyle(status)}">${escapeHtml(status)}</span>`; }
function initials(name) { if (!name) return "?"; return name.trim().split(/\s+/).map((p) => p[0]).join("").slice(0, 2).toUpperCase(); }
function nowStamp() { return new Date().toISOString().slice(0, 16).replace("T", " "); }
function detectDevice() { return /Mobi|Android|iPhone/i.test(navigator.userAgent) ? "Mobile" : "Desktop"; }
function project() { return state.projects.find((p) => p.id === state.selectedProjectId) || state.projects[0] || null; }
function projectById(id) { return state.projects.find((p) => p.id === id) || null; }
function projectFolder(item = project()) { if (!item || !item.folderId) return null; return state.projectFolders.find((f) => f.id === item.folderId) || null; }
function folderProjects(folderId = state.selectedFolderId) {
  if (folderId === "all") return state.projects;
  if (folderId === "unfiled") return state.projects.filter((p) => !p.folderId);
  return state.projects.filter((p) => p.folderId === folderId);
}
function projectNodes(projectId = state.selectedProjectId) { if (!projectId) return []; return state.nodes.filter((n) => n.projectId === projectId); }
function selectedNode() { return state.nodes.find((n) => n.id === state.selectedNodeId) || null; }
function teamNames() { const p = project(); if (!p) return []; return (p.team || []).map((u) => u.name); }
function categoryNames() { return Object.keys(state.categoriesData || {}); }
function categoryColor(name) { return state.categoriesData?.[name]?.color || hashColor(name); }
function categoryItems(name) { return state.categoriesData?.[name]?.items || []; }
function hashColor(str) { if (!str) return "#64748b"; let h = 0; for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) >>> 0; return `hsl(${h % 360},60%,55%)`; }
function nodeDisplayTitle(node) { if (!node) return ""; if (node.customTitle && node.customTitle.trim()) return node.customTitle; if (node.lineItem) return node.lineItem; return node.title || "(untitled)"; }

function stats(nodes) {
  const list = nodes || projectNodes();
  const total = list.length;
  const complete = list.filter((n) => n.status === "Complete").length;
  const progress = list.filter((n) => n.status === "In Progress").length;
  const issue = list.filter((n) => n.status === "Issue").length;
  return { total, complete, progress, issue, notStarted: list.length - complete - progress - issue, completePercent: total ? Math.round((complete / total) * 100) : 0 };
}
function folderStats(folderId) {
  const projects = folderProjects(folderId);
  const ids = projects.map((p) => p.id);
  const nodes = state.nodes.filter((n) => ids.includes(n.projectId));
  const s = stats(nodes);
  return { projects: projects.length, nodes: nodes.length, completePercent: s.completePercent, issues: s.issue };
}
function matchesNode(node) {
  const f = state.filters;
  const q = f.query.trim().toLowerCase();
  const title = nodeDisplayTitle(node);
  const inQuery = !q || [title, node.category, node.status, node.assignedTo, node.description, ...(node.tags || [])].join(" ").toLowerCase().includes(q);
  return inQuery && (f.status === "All" || node.status === f.status) && (f.category === "All" || node.category === f.category) && (f.assignee === "All" || node.assignedTo === f.assignee) && (f.layer === "All" || node.category === f.layer);
}
function navItems() { return [{id:"projects",label:"Projects",icon:"projects"},{id:"map",label:"Map",icon:"map"},{id:"progress",label:"Progress",icon:"chart"},{id:"audit",label:"Audit",icon:"audit"},{id:"settings",label:"Settings",icon:"settings"}]; }

/* GOOGLE AUTH */
let _gapiReady = false, _gisReady = false, _tokenClient = null;

async function bootGoogle() {
  if (!hasGoogleApiKey || !hasGoogleClientId) return;
  const waitFor = (n, t = 12000) => new Promise((r, j) => { const s = Date.now(); const tick = () => { if (window[n]) return r(window[n]); if (Date.now() - s > t) return j(new Error(n + " did not load")); setTimeout(tick, 80); }; tick(); });
  try {
    await waitFor("gapi");
    await new Promise((r, j) => gapi.load("client", { callback: r, onerror: j }));
    await gapi.client.init({ apiKey: googleConfig.googleApiKey });
    await gapi.client.load("https://www.googleapis.com/discovery/v1/apis/drive/v3/rest");
    await gapi.client.load("https://sheets.googleapis.com/$discovery/rest?version=v4");
    _gapiReady = true;
  } catch (e) { state.googleAuth.lastError = "Google API client: " + (e.message || e); render(); return; }
  try {
    await waitFor("google");
    _tokenClient = google.accounts.oauth2.initTokenClient({
      client_id: googleConfig.googleClientId, scope: googleScopes, callback: handleTokenResponse,
      error_callback: (err) => { state.googleAuth.lastError = err?.message || err?.type || "OAuth failed"; state.googleAuth.bootstrapping = false; render(); }
    });
    _gisReady = true;
  } catch (e) { state.googleAuth.lastError = "GIS: " + (e.message || e); render(); return; }
  state.googleAuth.librariesReady = true;
  render();
}

function handleTokenResponse(resp) {
  if (resp.error) { state.googleAuth.lastError = resp.error_description || resp.error; state.googleAuth.bootstrapping = false; render(); return; }
  state.googleAuth.accessToken = resp.access_token;
  state.googleAuth.expiresAt = Date.now() + ((resp.expires_in || 3600) * 1000);
  state.googleAuth.signedIn = true;
  state.googleAuth.lastError = null;
  gapi.client.setToken({ access_token: resp.access_token });
  fetchProfile().then(() => bootstrapDrive());
}

async function fetchProfile() {
  try { const r = await fetch("https://openidconnect.googleapis.com/v1/userinfo", { headers: { Authorization: `Bearer ${state.googleAuth.accessToken}` } }); if (r.ok) state.googleAuth.profile = await r.json(); } catch (e) {}
}

function signIn() { if (!_tokenClient) { toast("Google libraries still loading"); return; } state.googleAuth.bootstrapping = true; render(); _tokenClient.requestAccessToken({ prompt: state.googleAuth.bootstrapped ? "" : "consent" }); }
function signOut() {
  if (state.googleAuth.accessToken && window.google?.accounts?.oauth2) { try { google.accounts.oauth2.revoke(state.googleAuth.accessToken, () => {}); } catch (e) {} }
  if (window.gapi?.client) gapi.client.setToken(null);
  state.googleAuth = { ...freshState().googleAuth, librariesReady: state.googleAuth.librariesReady };
  persist(); render(); toast("Signed out");
}
function isTokenValid() { return state.googleAuth.signedIn && state.googleAuth.accessToken && state.googleAuth.expiresAt && Date.now() < state.googleAuth.expiresAt - 30000; }
function requireAuth(label) { if (isTokenValid()) return true; toast(`Sign in to Google first (${label})`); return false; }

/* DRIVE / SHEETS */
async function bootstrapDrive() {
  state.googleAuth.bootstrapping = true; render();
  try {
    const rootId = await ensureFolder(DRIVE_ROOT_NAME, "root");
    const [adminId, projectsId, unfiledId] = await Promise.all([
      ensureFolder(DRIVE_ADMIN_FOLDER, rootId),
      ensureFolder(DRIVE_PROJECTS_FOLDER, rootId),
      ensureFolder(DRIVE_UNFILED_FOLDER, rootId)
    ]);
    const [auditSheetId, categoriesSheetId] = await Promise.all([ ensureAuditSheet(adminId), ensureCategoriesSheet(adminId) ]);
    Object.assign(state.drive, { rootFolderId: rootId, adminFolderId: adminId, projectsFolderId: projectsId, unfiledFolderId: unfiledId, auditSheetId, categoriesSheetId });
    state.googleAuth.bootstrapped = true;
    state.googleAuth.bootstrapping = false;
    persist();
    await Promise.all([flushAuditQueue(), refreshCategories()]);
    toast("Connected. Drive structure ready.");
    render();
  } catch (e) {
    console.error("Bootstrap failed", e);
    state.googleAuth.lastError = "Drive setup failed: " + describeError(e);
    state.googleAuth.bootstrapping = false;
    persist(); render();
  }
}

function describeError(e) { if (!e) return "unknown"; if (e.result?.error?.message) return e.result.error.message; if (e.message) return e.message; return String(e); }
function escapeDriveQuery(v) { return String(v).replace(/\\/g, "\\\\").replace(/'/g, "\\'"); }

async function ensureFolder(name, parentId) {
  const q = `name='${escapeDriveQuery(name)}' and mimeType='application/vnd.google-apps.folder' and '${parentId}' in parents and trashed=false`;
  const list = await gapi.client.drive.files.list({ q, fields: "files(id,name)", spaces: "drive", pageSize: 5 });
  if (list.result.files?.length) return list.result.files[0].id;
  const create = await gapi.client.drive.files.create({ resource: { name, mimeType: "application/vnd.google-apps.folder", parents: [parentId] }, fields: "id" });
  return create.result.id;
}

async function ensureAuditSheet(adminId) {
  const q = `name='${escapeDriveQuery(AUDIT_SHEET_NAME)}' and mimeType='application/vnd.google-apps.spreadsheet' and '${adminId}' in parents and trashed=false`;
  const list = await gapi.client.drive.files.list({ q, fields: "files(id,name)", pageSize: 5 });
  if (list.result.files?.length) return list.result.files[0].id;
  const created = await gapi.client.sheets.spreadsheets.create({ resource: { properties: { title: AUDIT_SHEET_NAME }, sheets: [{ properties: { title: AUDIT_TAB } }] }, fields: "spreadsheetId" });
  const sheetId = created.result.spreadsheetId;
  const meta = await gapi.client.drive.files.get({ fileId: sheetId, fields: "parents" });
  await gapi.client.drive.files.update({ fileId: sheetId, addParents: adminId, removeParents: (meta.result.parents || []).join(","), fields: "id, parents" });
  await gapi.client.sheets.spreadsheets.values.update({ spreadsheetId: sheetId, range: `${AUDIT_TAB}!A1`, valueInputOption: "RAW", resource: { values: [AUDIT_HEADER] } });
  await gapi.client.sheets.spreadsheets.batchUpdate({ spreadsheetId: sheetId, resource: { requests: [
    { repeatCell: { range: { startRowIndex: 0, endRowIndex: 1 }, cell: { userEnteredFormat: { textFormat: { bold: true } } }, fields: "userEnteredFormat.textFormat.bold" } },
    { updateSheetProperties: { properties: { gridProperties: { frozenRowCount: 1 } }, fields: "gridProperties.frozenRowCount" } }
  ] } });
  return sheetId;
}

async function ensureCategoriesSheet(adminId) {
  const q = `name='${escapeDriveQuery(CATEGORIES_SHEET_NAME)}' and mimeType='application/vnd.google-apps.spreadsheet' and '${adminId}' in parents and trashed=false`;
  const list = await gapi.client.drive.files.list({ q, fields: "files(id,name)", pageSize: 5 });
  if (list.result.files?.length) return list.result.files[0].id;
  const created = await gapi.client.sheets.spreadsheets.create({
    resource: { properties: { title: CATEGORIES_SHEET_NAME }, sheets: DEFAULT_CATEGORY_TABS.map((t) => ({ properties: { title: t.name } })) },
    fields: "spreadsheetId,sheets.properties"
  });
  const sheetId = created.result.spreadsheetId;
  const meta = await gapi.client.drive.files.get({ fileId: sheetId, fields: "parents" });
  await gapi.client.drive.files.update({ fileId: sheetId, addParents: adminId, removeParents: (meta.result.parents || []).join(","), fields: "id, parents" });
  const writes = DEFAULT_CATEGORY_TABS.map((tab) => ({
    range: `${tab.name}!A1:D2`,
    values: [CATEGORIES_HEADER, ["", "", "Add line items below. Color column is optional (e.g. #f59e0b).", tab.color]]
  }));
  await gapi.client.sheets.spreadsheets.values.batchUpdate({ spreadsheetId: sheetId, resource: { valueInputOption: "USER_ENTERED", data: writes } });
  const reqs = [];
  for (const s of created.result.sheets) {
    reqs.push({ repeatCell: { range: { sheetId: s.properties.sheetId, startRowIndex: 0, endRowIndex: 1 }, cell: { userEnteredFormat: { textFormat: { bold: true } } }, fields: "userEnteredFormat.textFormat.bold" } });
    reqs.push({ updateSheetProperties: { properties: { sheetId: s.properties.sheetId, gridProperties: { frozenRowCount: 1 } }, fields: "gridProperties.frozenRowCount" } });
  }
  await gapi.client.sheets.spreadsheets.batchUpdate({ spreadsheetId: sheetId, resource: { requests: reqs } });
  return sheetId;
}

async function refreshCategories() {
  if (!isTokenValid() || !state.drive.categoriesSheetId) return;
  try {
    const meta = await gapi.client.sheets.spreadsheets.get({ spreadsheetId: state.drive.categoriesSheetId, fields: "sheets.properties.title,sheets.properties.sheetId" });
    const tabs = (meta.result.sheets || []).map((s) => s.properties.title);
    if (!tabs.length) return;
    const vr = await gapi.client.sheets.spreadsheets.values.batchGet({ spreadsheetId: state.drive.categoriesSheetId, ranges: tabs.map((t) => `${t}!A2:D`) });
    const data = {};
    (vr.result.valueRanges || []).forEach((v, idx) => {
      const tabName = tabs[idx];
      const rows = (v.values || []).filter((r) => r && r[0] && r[0].trim());
      const items = rows.map((r) => ({ item: (r[0]||"").toString().trim(), code: (r[1]||"").toString().trim(), description: (r[2]||"").toString().trim(), color: (r[3]||"").toString().trim() || null }));
      const tabColor = DEFAULT_CATEGORY_TABS.find((t) => t.name === tabName)?.color || items.find((i) => i.color)?.color || hashColor(tabName);
      data[tabName] = { color: tabColor, items };
    });
    state.categoriesData = data;
    state.categoriesLoadedAt = nowStamp();
    persist(); render();
  } catch (e) { console.warn("Categories refresh failed", e); toast("Failed to refresh categories: " + describeError(e)); }
}

async function ensureProjectDriveFolder(p) {
  if (!isTokenValid() || !state.drive.projectsFolderId) return null;
  if (state.drive.projectFolderMap[p.id]) return state.drive.projectFolderMap[p.id];
  let parentId;
  if (p.folderId) {
    const folder = state.projectFolders.find((f) => f.id === p.folderId);
    if (!folder) return null;
    if (!folder.driveFolderId) folder.driveFolderId = await ensureFolder(folder.name, state.drive.projectsFolderId);
    parentId = folder.driveFolderId;
  } else parentId = state.drive.unfiledFolderId;
  const id = await ensureFolder(p.name, parentId);
  state.drive.projectFolderMap[p.id] = id;
  persist();
  return id;
}

async function ensureNodeDriveFolder(node) {
  if (!isTokenValid()) return null;
  if (state.drive.nodeFolderMap[node.id]) return state.drive.nodeFolderMap[node.id];
  const proj = projectById(node.projectId); if (!proj) return null;
  const projectFolderId = await ensureProjectDriveFolder(proj); if (!projectFolderId) return null;
  const id = await ensureFolder(nodeDisplayTitle(node) || node.id, projectFolderId);
  state.drive.nodeFolderMap[node.id] = id;
  persist();
  return id;
}

function arrayBufferToBase64(buffer) {
  let binary = ""; const bytes = new Uint8Array(buffer); const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
  return btoa(binary);
}

async function uploadFileToDrive(file, parentFolderId, overrideName) {
  if (!parentFolderId) throw new Error("No parent folder");
  const base64 = arrayBufferToBase64(await file.arrayBuffer());
  const boundary = "neillp-" + Math.random().toString(36).slice(2);
  const metadata = { name: overrideName || file.name, parents: [parentFolderId] };
  const body = `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n--${boundary}\r\nContent-Type: ${file.type || "application/octet-stream"}\r\nContent-Transfer-Encoding: base64\r\n\r\n${base64}\r\n--${boundary}--`;
  const resp = await gapi.client.request({
    path: "/upload/drive/v3/files", method: "POST",
    params: { uploadType: "multipart", fields: "id,name,webViewLink,thumbnailLink,mimeType,iconLink" },
    headers: { "Content-Type": `multipart/related; boundary="${boundary}"` },
    body
  });
  return resp.result;
}

async function updateFileBytes(fileId, file) {
  const arr = new Uint8Array(await file.arrayBuffer());
  const resp = await gapi.client.request({
    path: `/upload/drive/v3/files/${fileId}`, method: "PATCH",
    params: { uploadType: "media", fields: "id,name,webViewLink,thumbnailLink,mimeType" },
    headers: { "Content-Type": file.type || "application/octet-stream" },
    body: arr
  });
  return resp.result;
}

async function fetchDriveFileAsDataUrl(fileId) {
  if (!isTokenValid()) return null;
  let meta;
  try { meta = await gapi.client.drive.files.get({ fileId, fields: "mimeType,name" }); }
  catch (e) { meta = { result: { mimeType: "application/octet-stream" } }; }
  const mime = meta.result.mimeType || "application/octet-stream";
  const resp = await gapi.client.request({ path: `/drive/v3/files/${fileId}`, method: "GET", params: { alt: "media" } });
  const bin = resp.body;
  const arr = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i) & 0xff;
  return `data:${mime};base64,${arrayBufferToBase64(arr.buffer)}`;
}

function auditRowToValues(r) {
  return [r.timestamp || nowStamp(), r.user || "", r.action || "", r.projectId || "", r.projectName || "", r.folderName || "", r.nodeId || "", r.nodeTitle || "", r.category || "", r.status || "", r.details || "", r.device || detectDevice()];
}

async function flushAuditQueue() {
  if (!isTokenValid() || !state.drive.auditSheetId || !state.auditQueue.length) return;
  const queue = state.auditQueue.slice();
  state.auditQueue = []; persist();
  try {
    await gapi.client.sheets.spreadsheets.values.append({
      spreadsheetId: state.drive.auditSheetId, range: `${AUDIT_TAB}!A:L`,
      valueInputOption: "USER_ENTERED", insertDataOption: "INSERT_ROWS",
      resource: { values: queue.map(auditRowToValues) }
    });
  } catch (e) { state.auditQueue = [...queue, ...state.auditQueue]; persist(); }
}

async function logAudit(action, opts = {}) {
  const proj = opts.projectId ? projectById(opts.projectId) : project();
  const folder = proj ? state.projectFolders.find((f) => f.id === proj.folderId) : null;
  const node = opts.nodeId ? state.nodes.find((n) => n.id === opts.nodeId) : null;
  const row = {
    timestamp: nowStamp(), user: state.googleAuth.profile?.email || "anonymous", action,
    projectId: proj?.id || "", projectName: proj?.name || "",
    folderName: folder?.name || (proj && !proj.folderId ? DRIVE_UNFILED_FOLDER : ""),
    nodeId: node?.id || opts.nodeId || "", nodeTitle: node ? nodeDisplayTitle(node) : (opts.nodeTitle || ""),
    category: node?.category || opts.category || "", status: opts.status ?? node?.status ?? "",
    details: opts.details || "", device: detectDevice()
  };
  if (!isTokenValid() || !state.drive.auditSheetId) { state.auditQueue.push(row); persist(); return; }
  try {
    await gapi.client.sheets.spreadsheets.values.append({
      spreadsheetId: state.drive.auditSheetId, range: `${AUDIT_TAB}!A:L`,
      valueInputOption: "USER_ENTERED", insertDataOption: "INSERT_ROWS",
      resource: { values: [auditRowToValues(row)] }
    });
  } catch (e) { state.auditQueue.push(row); persist(); }
}

async function fetchAuditRows() {
  if (!requireAuth("view audit log")) return;
  if (!state.drive.auditSheetId) { toast("No audit sheet yet"); return; }
  state.auditView.loading = true; render();
  try {
    const resp = await gapi.client.sheets.spreadsheets.values.get({ spreadsheetId: state.drive.auditSheetId, range: `${AUDIT_TAB}!A2:L` });
    const rows = (resp.result.values || []).map((r) => ({ timestamp: r[0]||"", user: r[1]||"", action: r[2]||"", projectId: r[3]||"", projectName: r[4]||"", folderName: r[5]||"", nodeId: r[6]||"", nodeTitle: r[7]||"", category: r[8]||"", status: r[9]||"", details: r[10]||"", device: r[11]||"" }));
    state.auditView.rows = rows.reverse();
    state.auditView.loaded = true;
    state.auditView.loading = false;
    state.auditView.lastFetchedAt = nowStamp();
  } catch (e) { toast("Audit fetch failed: " + describeError(e)); state.auditView.loading = false; }
  render();
}

function filteredAuditRows() {
  const f = state.auditView.filters;
  const q = f.query.trim().toLowerCase();
  const nq = f.nodeQuery.trim().toLowerCase();
  const dq = f.detailsQuery.trim().toLowerCase();
  const from = f.from ? new Date(f.from + "T00:00").getTime() : null;
  const to = f.to ? new Date(f.to + "T23:59").getTime() : null;
  return state.auditView.rows.filter((r) => {
    if (f.user !== "All" && r.user !== f.user) return false;
    if (f.action !== "All" && r.action !== f.action) return false;
    if (f.projectId !== "All" && r.projectId !== f.projectId) return false;
    if (nq && !r.nodeTitle.toLowerCase().includes(nq)) return false;
    if (dq && !r.details.toLowerCase().includes(dq)) return false;
    if (q) { const hay = [r.timestamp,r.user,r.action,r.projectName,r.folderName,r.nodeId,r.nodeTitle,r.category,r.status,r.details,r.device].join(" ").toLowerCase(); if (!hay.includes(q)) return false; }
    if (from || to) { const t = Date.parse(r.timestamp.replace(" ", "T")); if (!isNaN(t)) { if (from && t < from) return false; if (to && t > to) return false; } }
    return true;
  });
}

function downloadAuditCsv(rows) {
  const esc = (v) => { const s = String(v ?? ""); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  const lines = [AUDIT_HEADER.join(",")];
  for (const r of rows) lines.push([r.timestamp,r.user,r.action,r.projectId,r.projectName,r.folderName,r.nodeId,r.nodeTitle,r.category,r.status,r.details,r.device].map(esc).join(","));
  const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a"); a.href = url; a.download = `NeillPlanner-Audit-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(a); a.click(); a.remove();
  URL.revokeObjectURL(url);
  toast(`CSV downloaded (${rows.length} rows)`);
}

/* RENDER */
function render() {
  const app = document.getElementById("app"); if (!app) return;
  app.innerHTML = `
    <div class="app-shell ${state.massMode.active ? "is-mass-mode" : ""}">
      ${renderSidebar()}
      <main class="main">${renderTopbar()}<div class="content">${renderView()}</div></main>
      ${renderBottomNav()}
    </div>
    ${state.massMode.active ? renderMassBanner() : ""}
    ${state.drawerOpen && selectedNode() ? renderDrawer(selectedNode()) : ""}
    ${state.modal ? renderModal() : ""}
    ${state.lightbox ? renderLightbox() : ""}
    ${state.toast ? `<div class="toast" role="status">${escapeHtml(state.toast)}</div>` : ""}
  `;
  bindEvents();
  applyCanvasTransform();
}

function renderSidebar() {
  return `
    <aside class="sidebar">
      <div class="brand"><div class="brand-mark">NP</div><div><h1>NeillPlanner</h1><p>Neill Data &amp; Security</p></div></div>
      <nav class="nav-list" aria-label="Primary">${navItems().map((i) => `<button class="nav-button ${state.activeView === i.id ? "is-active" : ""}" data-view="${i.id}">${icon(i.icon)}<span>${i.label}</span></button>`).join("")}</nav>
      <div class="sidebar-section-title">Folders</div>
      <div class="folder-list">${renderFolderButton({ id: "all", name: "All Projects", color: "#94a3b8" }, true)}${state.projectFolders.map((f) => renderFolderButton(f)).join("")}${renderFolderButton({ id: "unfiled", name: "Unfiled", color: "#64748b" })}</div>
      <div class="sidebar-section-title">Projects</div>
      <div class="project-list">${state.projects.length === 0 ? '<div class="empty-state" style="font-size:12px;padding:14px">No projects yet</div>' : groupedProjectButtons()}</div>
    </aside>`;
}

function groupedProjectButtons() {
  const groups = [];
  state.projectFolders.forEach((folder) => {
    const projects = state.projects.filter((p) => p.folderId === folder.id);
    if (!projects.length) return;
    groups.push(`<div class="project-folder-group"><div class="folder-heading" style="--folder:${folder.color}"><span class="folder-dot"></span><span>${escapeHtml(folder.name)}</span></div>${projects.map(renderProjectButton).join("")}</div>`);
  });
  const unfiled = state.projects.filter((p) => !p.folderId);
  if (unfiled.length) groups.push(`<div class="project-folder-group"><div class="folder-heading" style="--folder:#64748b"><span class="folder-dot"></span><span>${DRIVE_UNFILED_FOLDER}</span></div>${unfiled.map(renderProjectButton).join("")}</div>`);
  return groups.join("");
}

function renderFolderButton(folder, isAll = false) {
  const id = isAll ? "all" : folder.id;
  const s = folderStats(id);
  return `<button class="folder-button ${state.selectedFolderId === id ? "is-active" : ""}" data-folder="${id}" style="--folder:${folder.color}"><span class="folder-dot"></span><span><strong>${escapeHtml(folder.name)}</strong><span>${s.projects} builds / ${s.nodes} nodes</span></span></button>`;
}

function renderProjectButton(item) {
  const nodes = state.nodes.filter((n) => n.projectId === item.id);
  const s = stats(nodes);
  const folder = projectFolder(item);
  const color = folder?.color || "#64748b";
  const linkedCount = nodes.filter((n) => n.type === "portal").length;
  return `<button class="project-button ${item.id === state.selectedProjectId ? "is-active" : ""}" data-project="${item.id}" style="--folder:${color}"><span class="status-dot" style="--status:${s.issue ? "var(--red)" : "var(--teal)"}"></span><span><strong>${escapeHtml(item.name)}</strong><span class="project-meta"><span>${s.total} nodes</span><span>${s.completePercent}%</span>${linkedCount ? `<span title="Linked projects">${icon("link")}${linkedCount}</span>` : ""}</span></span></button>`;
}

function renderTopbar() {
  const proj = project();
  const folder = projectFolder(proj);
  const folderName = folder?.name || (proj && !proj.folderId ? DRIVE_UNFILED_FOLDER : "");
  const folderColor = folder?.color || "#64748b";
  const auth = state.googleAuth;
  return `<header class="topbar"><div class="topbar-title"><h2>${proj ? escapeHtml(proj.name) : "NeillPlanner"}</h2><p>${proj ? `<span class="inline-folder" style="--folder:${folderColor}">${escapeHtml(folderName)}</span> / ${escapeHtml(proj.address || "No address")} / ${escapeHtml(proj.planName || "No plan")}` : "Sign in to start"}</p></div><div class="topbar-actions">${auth.signedIn ? `<span class="sync-chip"><span class="sync-dot"></span>${auth.bootstrapping ? "Syncing" : "Drive ready"}</span>` : `<span class="sync-chip" style="opacity:.7">Offline</span>`}${auth.signedIn ? `<button class="user-pill" data-action="go-settings" title="${escapeHtml(auth.profile?.email || "")}"><span class="avatar">${initials(auth.profile?.name || auth.profile?.email || "?")}</span><span class="hide-mobile">${escapeHtml(auth.profile?.name || auth.profile?.email || "Signed in")}</span></button>` : `<button class="primary-button" data-action="google-sign-in" ${!hasGoogleClientId ? "disabled" : ""}>${icon("google")}Sign in</button>`}</div></header>`;
}

function renderBottomNav() { return `<nav class="bottom-nav" aria-label="Primary">${navItems().map((i) => `<button class="${state.activeView === i.id ? "is-active" : ""}" data-view="${i.id}">${icon(i.icon)}<span>${i.label}</span></button>`).join("")}</nav>`; }

function renderMassBanner() {
  const m = state.massMode;
  return `<div class="mass-banner" role="status">${icon("mass")}<span>Mass placing: <strong>${escapeHtml(m.category)} / ${escapeHtml(m.lineItem)}</strong> &middot; ${m.count} placed</span><span class="hint">Click the plan to drop. Press <kbd>Esc</kbd> to stop.</span><button class="ghost-button" data-action="mass-stop">${icon("close")}Stop</button></div>`;
}

function renderView() {
  switch (state.activeView) {
    case "projects": return renderProjectsView();
    case "progress": return renderProgressView();
    case "audit": return renderAuditView();
    case "settings": return renderSettingsView();
    default: return renderMapView();
  }
}

function renderProjectsView() {
  const visible = folderProjects();
  const activeName = state.selectedFolderId === "all" ? "All Projects" : state.selectedFolderId === "unfiled" ? DRIVE_UNFILED_FOLDER : (state.projectFolders.find((f) => f.id === state.selectedFolderId)?.name || "All Projects");
  return `
    <section class="view-panel">
      <div class="panel-header"><h3 class="section-title">Project Dashboard</h3><div class="button-row"><button class="ghost-button" data-action="new-folder">${icon("folder")}Folder</button><button class="primary-button" data-action="new-project">${icon("plus")}New project</button></div></div>
      <div class="folder-strip">${renderFolderButton({ id: "all", name: "All Projects", color: "#94a3b8" }, true)}${state.projectFolders.map((f) => renderFolderButton(f)).join("")}${renderFolderButton({ id: "unfiled", name: "Unfiled", color: "#64748b" })}</div>
      ${state.projectFolders.length ? `<div class="folder-manager"><div><h3 class="section-title">Folder Colours</h3><p>Folders are for towers, apartment blocks, stages, or buildings inside one large job.</p></div><div class="folder-color-grid">${state.projectFolders.map(renderFolderColourRow).join("")}</div></div>` : ""}
      <div class="projects-grid">${visible.length ? visible.map(renderProjectCard).join("") : `<div class="empty-state" style="grid-column:1/-1;padding:36px;text-align:center"><p style="margin-bottom:12px">No projects in <strong>${escapeHtml(activeName)}</strong>.</p><button class="primary-button" data-action="new-project">${icon("plus")}Create your first project</button></div>`}</div>
    </section>`;
}

function renderProjectCard(item) {
  const nodes = state.nodes.filter((n) => n.projectId === item.id);
  const s = stats(nodes);
  const folder = projectFolder(item);
  const folderName = folder?.name || DRIVE_UNFILED_FOLDER;
  const folderColor = folder?.color || "#64748b";
  const links = state.nodes.filter((n) => n.projectId === item.id && n.type === "portal").length;
  return `<article class="project-card" style="--folder:${folderColor}"><div class="project-card-map"></div><div class="project-card-body"><div class="compact-row" style="margin-bottom:10px"><span class="mini-chip folder-label" style="--folder:${folderColor}">${icon("folder")}${escapeHtml(folderName)}</span>${links ? `<span class="mini-chip">${icon("link")}${links} linked</span>` : ""}</div><h3>${escapeHtml(item.name)}</h3><p>${escapeHtml(item.description || "No description")}</p><div class="compact-row" style="margin-top:12px">${statusPill(`${s.completePercent}% complete`)}<span class="mini-chip">${s.total} nodes</span><span class="mini-chip">${s.issue} issues</span></div><div class="project-card-controls"><label><span>Folder</span><select data-project-folder="${item.id}" aria-label="Folder for ${escapeHtml(item.name)}"><option value="">${DRIVE_UNFILED_FOLDER}</option>${state.projectFolders.map((f) => `<option value="${f.id}" ${f.id === item.folderId ? "selected" : ""}>${escapeHtml(f.name)}</option>`).join("")}</select></label></div><div class="button-row" style="margin-top:14px"><button class="primary-button" data-project-open="${item.id}">${icon("map")}Open</button><button class="ghost-button" data-project-delete="${item.id}">${icon("trash")}Delete</button></div></div></article>`;
}

function renderFolderColourRow(folder) {
  const s = folderStats(folder.id);
  return `<div class="folder-colour-row" style="--folder:${folder.color}"><span class="folder-dot"></span><span><strong>${escapeHtml(folder.name)}</strong><span>${s.projects} builds / ${s.nodes} nodes</span></span><input type="color" value="${escapeHtml(folder.color)}" data-folder-color="${folder.id}" aria-label="Colour" /><button class="icon-button" data-folder-rename="${folder.id}" aria-label="Rename">${icon("edit")}</button><button class="icon-button" data-folder-delete="${folder.id}" aria-label="Delete">${icon("trash")}</button></div>`;
}

function renderMapView() {
  const proj = project();
  if (!proj) return `<section class="view-panel"><div class="empty-state empty-state--big">${icon("map")}<h3 class="section-title">No project selected</h3><p>Create a project first to start dropping nodes on a plan.</p><button class="primary-button" data-action="new-project">${icon("plus")}Create a project</button></div></section>`;
  const hasPlan = Boolean(state.floorPlans[proj.id] || proj.planDriveFileId);
  const nodes = projectNodes();
  const matched = nodes.filter(matchesNode);
  const cats = ["All", ...categoryNames()];
  const catsLoaded = Object.keys(state.categoriesData).length > 0;
  return `
    <section class="map-layout">
      <div class="map-panel">
        <div class="map-toolbar">
          <div class="search-wrap">${icon("search")}<input data-filter="query" value="${escapeHtml(state.filters.query)}" placeholder="Search nodes, tags, users" aria-label="Search" /></div>
          <div class="filter-row">${renderSelect("status", ["All", ...Object.keys(statusMeta)], state.filters.status)}${renderSelect("category", cats, state.filters.category)}${renderSelect("assignee", ["All", ...teamNames()], state.filters.assignee)}</div>
          <div class="button-row">
            <button class="ghost-button" data-action="upload-plan">${icon("upload")}<span>Plan</span></button>
            <button class="primary-button" data-action="create-node" ${!hasPlan || !catsLoaded ? "disabled" : ""} title="${!catsLoaded ? "Categories not loaded - sign in" : ""}">${icon("plus")}<span>Node</span></button>
            <button class="ghost-button" data-action="mass-start" ${!hasPlan || !catsLoaded ? "disabled" : ""}>${icon("mass")}<span>Mass</span></button>
            <button class="ghost-button" data-action="add-portal" ${!hasPlan ? "disabled" : ""}>${icon("portal")}<span>Door</span></button>
          </div>
        </div>
        <div class="canvas-shell">
          <div class="canvas-viewport ${state.massMode.active ? "is-placing" : ""}" id="canvasViewport">
            <div class="plan-stage" id="planStage">
              ${hasPlan ? `<img class="floor-plan" src="${escapeHtml(state.floorPlans[proj.id] || "")}" alt="Floor plan" draggable="false" />` : renderEmptyPlanArea()}
              <div class="node-layer">${nodes.map(renderMarker).join("")}</div>
            </div>
          </div>
          <div class="canvas-tools" aria-label="Canvas tools"><button class="icon-button" data-action="zoom-in" title="Zoom in">${icon("zoomIn")}</button><button class="icon-button" data-action="zoom-out" title="Zoom out">${icon("zoomOut")}</button><button class="icon-button" data-action="reset-view" title="Recenter">${icon("target")}</button></div>
          <div class="scale-readout"><span class="scale-bar"></span><span>${Math.round(state.canvas.zoom * 100)}%</span></div>
        </div>
        <div class="legend">${Object.keys(statusMeta).map((n) => `<span class="legend-item"><span class="status-dot" style="${statusStyle(n)}"></span>${n}</span>`).join("")}${categoryNames().map((c) => `<span class="legend-item"><span class="category-dot" style="--cat:${categoryColor(c)}"></span>${escapeHtml(c)}</span>`).join("")}</div>
      </div>
      <aside class="summary-panel">
        <div class="summary-grid"><div class="metric"><span>Total nodes</span><strong>${nodes.length}</strong></div><div class="metric"><span>Shown</span><strong>${matched.length}</strong></div><div class="metric"><span>Complete</span><strong>${stats(nodes).completePercent}%</strong></div><div class="metric"><span>Issues</span><strong>${stats(nodes).issue}</strong></div></div>
        <h3 class="section-title">Nodes</h3>
        <div class="node-list">${matched.length ? matched.map(renderNodeSummary).join("") : `<div class="empty-state">${nodes.length ? "No matching nodes" : (hasPlan ? "No nodes yet. Click the plan to add." : "Upload a plan to start.")}</div>`}</div>
      </aside>
    </section>`;
}

function renderEmptyPlanArea() {
  return `<div class="empty-plan"><div class="empty-plan-inner"><div class="empty-plan-icon">${icon("map")}</div><h3>No floor plan yet</h3><p>Upload a building plan image (PNG, JPG, or SVG). Once signed in, plans sync to Drive automatically.</p><button class="primary-button" type="button" data-action="upload-plan">${icon("upload")}Upload plan image</button></div></div>`;
}

function renderSelect(name, options, value) { return `<select data-filter="${name}" aria-label="${name}">${options.map((o) => `<option value="${escapeHtml(o)}" ${o === value ? "selected" : ""}>${escapeHtml(o)}</option>`).join("")}</select>`; }

function renderMarker(node) {
  const isSelected = node.id === state.selectedNodeId;
  const isDim = !matchesNode(node);
  const isPortal = node.type === "portal";
  const catColor = node.category ? categoryColor(node.category) : "#64748b";
  return `<button class="node-marker ${isPortal ? "is-portal" : ""} ${isSelected ? "is-selected" : ""} ${isDim ? "is-dim" : ""}" style="--x:${node.position.x};--y:${node.position.y};--cat:${catColor};${statusStyle(node.status)}" data-node="${node.id}" aria-label="${escapeHtml(nodeDisplayTitle(node))}">${isPortal ? icon("portal") : ""}${node.comments?.length ? `<span class="comment-count">${node.comments.length}</span>` : ""}</button>`;
}

function renderNodeSummary(node) {
  const isPortal = node.type === "portal";
  const catColor = node.category ? categoryColor(node.category) : "#64748b";
  const linkedTarget = isPortal ? projectById(node.linkedProjectId)?.name : null;
  return `<button class="node-summary ${node.id === state.selectedNodeId ? "is-selected" : ""}" data-node="${node.id}"><span class="status-dot" style="${statusStyle(node.status)}"></span><span class="category-dot" style="--cat:${catColor}"></span><span><strong>${escapeHtml(nodeDisplayTitle(node))}</strong><span>${isPortal ? `${icon("portal")} -> ${escapeHtml(linkedTarget || "(unlinked)")}` : `${escapeHtml(node.category || "-")} / ${escapeHtml(node.assignedTo || "Unassigned")}`}</span></span></button>`;
}

function renderProgressView() {
  const proj = project();
  if (!proj) return `<section class="view-panel"><div class="empty-state" style="padding:36px">No project selected.</div></section>`;
  const nodes = projectNodes();
  const s = stats(nodes);
  const total = Math.max(s.total, 1);
  const completeDeg = (s.complete / total) * 100;
  const progressDeg = completeDeg + (s.progress / total) * 100;
  const issueDeg = progressDeg + (s.issue / total) * 100;
  const cats = categoryNames().map((c) => { const count = nodes.filter((n) => n.category === c).length; return { category: c, count, value: Math.round((count / total) * 100) }; }).filter((c) => c.count > 0);
  return `
    <section class="view-panel">
      <div class="panel-header"><h3 class="section-title">Progress Dashboard</h3></div>
      <div class="metrics-grid"><div class="metric"><span>Total nodes</span><strong>${s.total}</strong></div><div class="metric"><span>Complete</span><strong>${s.completePercent}%</strong></div><div class="metric"><span>In progress</span><strong>${s.progress}</strong></div><div class="metric"><span>Issues</span><strong>${s.issue}</strong></div></div>
    </section>
    <section class="view-panel">
      <div class="charts-grid">
        <div><h3 class="section-title">Status</h3><div class="donut-wrap"><div class="donut" style="--complete:${completeDeg}%;--progress:${progressDeg}%;--issue:${issueDeg}%"><div class="donut-label"><strong>${s.completePercent}%</strong><span>Complete</span></div></div></div></div>
        <div><h3 class="section-title">Category Load</h3><div class="bar-list">${cats.length ? cats.map((item) => `<div class="bar-row"><span><span class="category-dot" style="--cat:${categoryColor(item.category)}"></span>${escapeHtml(item.category)}</span><span class="bar-track"><span class="bar-fill" style="--value:${item.value}%;--cat:${categoryColor(item.category)}"></span></span><span>${item.count}</span></div>`).join("") : `<div class="empty-state">No nodes yet</div>`}</div></div>
      </div>
    </section>`;
}

function renderAuditView() {
  const av = state.auditView;
  const filtered = av.loaded ? filteredAuditRows() : [];
  const distinctUsers = [...new Set(av.rows.map((r) => r.user).filter(Boolean))].sort();
  const distinctActions = [...new Set(av.rows.map((r) => r.action).filter(Boolean))].sort();
  const distinctProjects = [...new Set(av.rows.map((r) => ({ id: r.projectId, name: r.projectName })).filter((p) => p.id))].reduce((acc, p) => { if (!acc.some((x) => x.id === p.id)) acc.push(p); return acc; }, []);
  return `
    <section class="view-panel">
      <div class="panel-header"><h3 class="section-title">Audit Log</h3><div class="button-row"><span class="sync-chip" style="opacity:.8">${av.loaded ? `${av.rows.length} rows / fetched ${escapeHtml(av.lastFetchedAt || "")}` : "Not loaded"}</span><button class="ghost-button" data-action="audit-load">${icon("refresh")}${av.loading ? "Loading..." : av.loaded ? "Refresh" : "Load from Sheet"}</button><button class="primary-button" data-action="audit-download" ${!av.loaded || filtered.length === 0 ? "disabled" : ""}>${icon("download")}Download CSV (${filtered.length})</button></div></div>
      ${av.loaded ? `
        <div class="audit-filters">
          <label><span>From</span><input type="date" data-audit-filter="from" value="${escapeHtml(av.filters.from)}" /></label>
          <label><span>To</span><input type="date" data-audit-filter="to" value="${escapeHtml(av.filters.to)}" /></label>
          <label><span>User</span><select data-audit-filter="user"><option value="All">All</option>${distinctUsers.map((u) => `<option value="${escapeHtml(u)}" ${av.filters.user === u ? "selected" : ""}>${escapeHtml(u)}</option>`).join("")}</select></label>
          <label><span>Action</span><select data-audit-filter="action"><option value="All">All</option>${distinctActions.map((a) => `<option value="${escapeHtml(a)}" ${av.filters.action === a ? "selected" : ""}>${escapeHtml(a)}</option>`).join("")}</select></label>
          <label><span>Project</span><select data-audit-filter="projectId"><option value="All">All</option>${distinctProjects.map((p) => `<option value="${escapeHtml(p.id)}" ${av.filters.projectId === p.id ? "selected" : ""}>${escapeHtml(p.name || p.id)}</option>`).join("")}</select></label>
          <label><span>Node title</span><input data-audit-filter="nodeQuery" value="${escapeHtml(av.filters.nodeQuery)}" placeholder="contains..." /></label>
          <label><span>Details</span><input data-audit-filter="detailsQuery" value="${escapeHtml(av.filters.detailsQuery)}" placeholder="contains..." /></label>
          <label><span>Anywhere</span><input data-audit-filter="query" value="${escapeHtml(av.filters.query)}" placeholder="free-text" /></label>
          <button class="ghost-button" data-action="audit-clear-filters">Clear</button>
        </div>
        <div class="audit-table-wrap"><table class="audit-table"><thead><tr><th>Timestamp</th><th>User</th><th>Action</th><th>Project</th><th>Folder</th><th>Node ID</th><th>Node Title</th><th>Category</th><th>Status</th><th>Details</th><th>Device</th></tr></thead><tbody>${filtered.length ? filtered.map((r) => `<tr><td>${escapeHtml(r.timestamp)}</td><td>${escapeHtml(r.user)}</td><td>${escapeHtml(r.action)}</td><td>${escapeHtml(r.projectName || r.projectId)}</td><td>${escapeHtml(r.folderName)}</td><td>${escapeHtml(r.nodeId)}</td><td>${escapeHtml(r.nodeTitle)}</td><td>${escapeHtml(r.category)}</td><td>${escapeHtml(r.status)}</td><td>${escapeHtml(r.details)}</td><td>${escapeHtml(r.device)}</td></tr>`).join("") : `<tr><td colspan="11" style="text-align:center;padding:24px;color:rgba(255,255,255,.6)">No rows match your filters</td></tr>`}</tbody></table></div>
      ` : `<div class="empty-state empty-state--big">${icon("audit")}<h3>Audit log is not loaded</h3><p>The log lives in <code>${DRIVE_ROOT_NAME}/${DRIVE_ADMIN_FOLDER}/${AUDIT_SHEET_NAME}</code>. Fetched on demand.</p><button class="primary-button" data-action="audit-load" ${!state.googleAuth.signedIn ? "disabled" : ""}>${icon("refresh")}Load from Sheet</button>${!state.googleAuth.signedIn ? `<p style="margin-top:14px;color:rgba(255,255,255,.55)">Sign in to enable.</p>` : ""}</div>`}
      ${state.auditQueue.length ? `<p style="margin-top:12px;color:#f59e0b">${state.auditQueue.length} audit row(s) queued locally and will sync next time you sign in.</p>` : ""}
    </section>`;
}

function renderSettingsView() {
  const auth = state.googleAuth;
  const proj = project();
  const driveOk = Boolean(state.drive.rootFolderId);
  const sheetOk = Boolean(state.drive.auditSheetId);
  const catsOk = Boolean(state.drive.categoriesSheetId);
  const catTabs = Object.entries(state.categoriesData);
  return `
    <section class="settings-grid">
      <div class="view-panel">
        <div class="panel-header"><h3 class="section-title">Account</h3><span class="sync-chip"><span class="sync-dot"></span>${auth.signedIn ? "Signed in" : "Signed out"}</span></div>
        ${auth.signedIn ? `
          <div class="integration-list">
            <div class="integration-row"><span><strong>Email</strong><span>${escapeHtml(auth.profile?.email || "(unknown)")}</span></span>${statusPill("Complete")}</div>
            <div class="integration-row"><span><strong>Name</strong><span>${escapeHtml(auth.profile?.name || "(unknown)")}</span></span>${statusPill("Complete")}</div>
            <div class="integration-row"><span><strong>Token expires</strong><span>${auth.expiresAt ? new Date(auth.expiresAt).toLocaleTimeString() : "-"}</span></span>${statusPill(isTokenValid() ? "Complete" : "Issue")}</div>
          </div>
          <div class="button-row" style="margin-top:14px"><button class="ghost-button" data-action="google-sign-out">${icon("signOut")}Sign out</button><button class="ghost-button" data-action="google-bootstrap">${icon("refresh")}Re-sync Drive</button><button class="ghost-button" data-action="refresh-categories">${icon("refresh")}Refresh categories</button></div>
        ` : `<div class="empty-state" style="padding:18px"><p style="margin-bottom:12px">Sign in to create your Drive folder structure, upload photos, and write the audit log.</p><button class="primary-button" data-action="google-sign-in" ${!hasGoogleClientId || !auth.librariesReady ? "disabled" : ""}>${icon("google")}Sign in with Google</button>${auth.lastError ? `<p style="margin-top:12px;color:#ef4444">${escapeHtml(auth.lastError)}</p>` : ""}${!auth.librariesReady ? `<p style="margin-top:12px;color:rgba(255,255,255,.55)">Loading Google libraries...</p>` : ""}</div>`}
      </div>
      <div class="view-panel">
        <div class="panel-header"><h3 class="section-title">Google Services</h3><span class="sync-chip"><span class="sync-dot"></span>${hasGoogleApiKey && hasGoogleClientId ? "Configured" : "Config needed"}</span></div>
        <div class="integration-list">
          <div class="integration-row"><span><strong>Browser API Key</strong><span>${hasGoogleApiKey ? "Loaded from index.html" : "Missing"}</span></span>${statusPill(hasGoogleApiKey ? "Complete" : "Not Started")}</div>
          <div class="integration-row"><span><strong>OAuth Client ID</strong><span>${hasGoogleClientId ? "Loaded from index.html" : "Missing"}</span></span>${statusPill(hasGoogleClientId ? "Complete" : "Not Started")}</div>
          <div class="integration-row"><span><strong>OAuth Scopes</strong><span>${escapeHtml(googleScopes)}</span></span>${statusPill(auth.signedIn ? "Complete" : "In Progress")}</div>
          <div class="integration-row"><span><strong>Drive Root</strong><span>${driveOk ? `/${DRIVE_ROOT_NAME}/` : `Will be created on sign-in`}</span></span>${statusPill(driveOk ? "Complete" : "Not Started")}</div>
          <div class="integration-row"><span><strong>Admin Folder</strong><span>${state.drive.adminFolderId ? `/${DRIVE_ROOT_NAME}/${DRIVE_ADMIN_FOLDER}/` : "Pending sign-in"}</span></span>${statusPill(state.drive.adminFolderId ? "Complete" : "Not Started")}</div>
          <div class="integration-row"><span><strong>Projects Folder</strong><span>${state.drive.projectsFolderId ? `/${DRIVE_ROOT_NAME}/${DRIVE_PROJECTS_FOLDER}/` : "Pending sign-in"}</span></span>${statusPill(state.drive.projectsFolderId ? "Complete" : "Not Started")}</div>
          <div class="integration-row"><span><strong>Unfiled Folder</strong><span>${state.drive.unfiledFolderId ? `/${DRIVE_ROOT_NAME}/${DRIVE_UNFILED_FOLDER}/` : "Pending sign-in"}</span></span>${statusPill(state.drive.unfiledFolderId ? "Complete" : "Not Started")}</div>
          <div class="integration-row"><span><strong>Audit Sheet</strong><span>${sheetOk ? AUDIT_SHEET_NAME : "Will be created on sign-in"}</span></span>${statusPill(sheetOk ? "Complete" : "Not Started")}</div>
          <div class="integration-row"><span><strong>Categories Sheet</strong><span>${catsOk ? CATEGORIES_SHEET_NAME : "Will be created on sign-in"}</span></span>${statusPill(catsOk ? "Complete" : "Not Started")}</div>
        </div>
      </div>
      <div class="view-panel">
        <div class="panel-header"><h3 class="section-title">Categories (from Sheet)</h3><div class="button-row"><button class="ghost-button" data-action="refresh-categories" ${!auth.signedIn ? "disabled" : ""}>${icon("refresh")}Refresh</button></div></div>
        ${catTabs.length ? `<div class="integration-list">${catTabs.map(([tab, data]) => `<div class="integration-row"><span><strong><span class="category-dot" style="--cat:${data.color}"></span>${escapeHtml(tab)}</strong><span>${data.items.length} line items${data.items.length ? ": " + data.items.slice(0, 6).map((i) => escapeHtml(i.item)).join(", ") + (data.items.length > 6 ? "..." : "") : ""}</span></span>${statusPill(data.items.length ? "Complete" : "In Progress")}</div>`).join("")}</div><p style="margin-top:10px;color:rgba(255,255,255,.55)">Edit ${CATEGORIES_SHEET_NAME} in Google Sheets to add tabs / line items. Hit Refresh when done. Last loaded: ${escapeHtml(state.categoriesLoadedAt || "never")}.</p>` : `<div class="empty-state" style="padding:18px"><p>${auth.signedIn ? "Categories sheet exists but has no line items yet. Open it in Google Sheets and add some." : "Sign in to load categories."}</p></div>`}
      </div>
      ${proj ? `<div class="view-panel"><div class="panel-header"><h3 class="section-title">Current Project</h3><span class="sync-chip">${icon("folder")}${escapeHtml(proj.name)}</span></div><div class="integration-list"><div class="integration-row"><span><strong>Drive path</strong><span>/${DRIVE_ROOT_NAME}/${DRIVE_PROJECTS_FOLDER}/${escapeHtml(projectFolder(proj)?.name || DRIVE_UNFILED_FOLDER)}/${escapeHtml(proj.name)}/</span></span>${statusPill(state.drive.projectFolderMap[proj.id] ? "Complete" : "Not Started")}</div><div class="integration-row"><span><strong>Floor plan</strong><span>${proj.planDriveFileId ? `Synced to Drive` : (state.floorPlans[proj.id] ? "Local only (sign in to sync)" : "No plan uploaded")}</span></span>${statusPill(proj.planDriveFileId ? "Complete" : (state.floorPlans[proj.id] ? "In Progress" : "Not Started"))}</div><div class="integration-row"><span><strong>Team members</strong><span>${(proj.team || []).length}</span></span>${statusPill("Complete")}</div></div><div class="button-row" style="margin-top:14px"><button class="ghost-button" data-action="edit-project">${icon("edit")}Edit project</button><button class="ghost-button" data-action="invite-user">${icon("plus")}Add team member</button></div></div>` : ""}
      <div class="view-panel">
        <div class="panel-header"><h3 class="section-title">About</h3><span class="sync-chip">v${APP_VERSION}</span></div>
        <div class="integration-list"><div class="integration-row"><span><strong>Storage</strong><span>Local browser + Google Drive + Google Sheets</span></span>${statusPill("Complete")}</div><div class="integration-row"><span><strong>Audit log</strong><span>${AUDIT_SHEET_NAME}. Fetched on demand.</span></span>${statusPill(sheetOk ? "Complete" : "In Progress")}</div><div class="integration-row"><span><strong>Photo scope</strong><span>drive.file (app only sees files it created)</span></span>${statusPill("Complete")}</div></div>
        <div class="button-row" style="margin-top:14px"><button class="ghost-button" data-action="wipe-local">${icon("trash")}Wipe local data</button></div>
      </div>
    </section>`;
}

function renderDrawer(node) {
  const isPortal = node.type === "portal";
  const linkedProject = isPortal ? projectById(node.linkedProjectId) : null;
  const catColor = node.category ? categoryColor(node.category) : "#64748b";
  return `
    <div class="drawer-backdrop" data-action="close-drawer"></div>
    <aside class="drawer" role="dialog" aria-label="${escapeHtml(nodeDisplayTitle(node))}">
      <div class="drawer-header"><div class="drawer-title"><h3>${isPortal ? icon("portal") : ""}${escapeHtml(nodeDisplayTitle(node))}</h3><p>${isPortal ? `Door / link to ${linkedProject ? `<strong>${escapeHtml(linkedProject.name)}</strong>` : "(unlinked)"}` : `<span class="category-dot" style="--cat:${catColor}"></span>${escapeHtml(node.category || "-")} / ${escapeHtml(node.assignedTo || "Unassigned")}`}</p></div><button class="icon-button" data-action="close-drawer" aria-label="Close">${icon("close")}</button></div>
      <div class="drawer-body">
        <div class="drawer-actions">${statusPill(node.status)}${isPortal && linkedProject ? `<button class="primary-button" data-action="follow-portal">${icon("arrowRight")}Walk to ${escapeHtml(linkedProject.name)}</button>` : ""}<button class="icon-button" data-action="share-node" title="Share">${icon("share")}</button><button class="icon-button" data-action="edit-node" title="Edit">${icon("edit")}</button>${!isPortal ? `<button class="icon-button" data-action="clone-node" title="Duplicate">${icon("copy")}</button>` : ""}<button class="icon-button" data-action="delete-node" title="Delete">${icon("trash")}</button></div>
        ${!isPortal ? `
        <div class="quick-edit">${renderSelect("quick-status", Object.keys(statusMeta), node.status).replace('data-filter="quick-status"', 'data-quick-status="true"')}<label class="ghost-button" style="cursor:pointer">${icon("upload")}<span>Upload photos</span><input type="file" accept="image/*" multiple data-photo-upload="${node.id}" style="display:none" /></label></div>
        <div class="info-grid"><div class="info-box"><span>Images</span><strong>${node.imageRefs.length}</strong></div><div class="info-box"><span>Tags</span><strong>${(node.tags || []).map(escapeHtml).join(", ") || "-"}</strong></div><div class="info-box"><span>Category</span><strong>${escapeHtml(node.category || "-")}</strong></div><div class="info-box"><span>Updated</span><strong>${escapeHtml(node.updatedAt)}</strong></div></div>
        <div><h3 class="section-title">Notes</h3><textarea data-notes="${node.id}" aria-label="Node notes">${escapeHtml(node.description || "")}</textarea></div>
        <div><h3 class="section-title">Gallery</h3>${node.imageRefs.length ? `<div class="gallery-grid">${node.imageRefs.map((image, index) => `<button class="image-tile" style="--thumb:linear-gradient(135deg,#1e293b,#334155)" data-lightbox="${index}" aria-label="${escapeHtml(image.name)}">${image.thumbnailLink ? `<img src="${escapeHtml(image.thumbnailLink)}" alt="${escapeHtml(image.name)}" loading="lazy" referrerpolicy="no-referrer" style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover" />` : ""}<span>${escapeHtml(image.name)}</span></button>`).join("")}</div>` : `<div class="empty-state">No images. Use "Upload photos" above.</div>`}</div>
        <div><h3 class="section-title">Comments</h3><div class="comments-list">${node.comments.length ? node.comments.map((c) => `<article class="comment"><span class="comment-meta">${escapeHtml(c.author)} / ${escapeHtml(c.time)}</span><p>${escapeHtml(c.text)}</p></article>`).join("") : `<div class="empty-state">No comments</div>`}</div><div class="comment-input" style="margin-top:10px"><input data-comment-input="${node.id}" placeholder="@mention or comment" aria-label="Add comment" /><button class="icon-button" data-action="send-comment" aria-label="Send">${icon("arrowRight")}</button></div></div>
        ` : `<div class="info-grid"><div class="info-box"><span>Linked project</span><strong>${escapeHtml(linkedProject?.name || "(missing)")}</strong></div><div class="info-box"><span>Updated</span><strong>${escapeHtml(node.updatedAt)}</strong></div></div><p style="margin-top:14px;color:rgba(255,255,255,.7)">This is a door / stairs / link node. Walking through takes you to the linked project. Both projects have a matching portal that updates together.</p>`}
      </div>
    </aside>`;
}

function renderModal() {
  const m = state.modal;
  if (m.mode === "new-folder" || m.mode === "rename-folder") return renderFolderModal(m.folderId);
  if (m.mode === "new-project" || m.mode === "edit-project") return renderProjectModal(m.mode === "edit-project");
  if (m.mode === "invite-user") return renderInviteModal();
  if (m.mode === "create" || m.mode === "edit") return renderNodeModal();
  if (m.mode === "mass-pick") return renderMassPickModal();
  if (m.mode === "portal-create") return renderPortalCreateModal();
  return "";
}

function renderFolderModal(folderId = null) {
  const existing = folderId ? state.projectFolders.find((f) => f.id === folderId) : null;
  const defaultColor = DEFAULT_FOLDER_COLORS[state.projectFolders.length % DEFAULT_FOLDER_COLORS.length];
  return `<div class="modal-backdrop" data-action="close-modal"></div><form class="modal" id="folderForm" role="dialog"><div class="modal-header"><div><h3>${existing ? "Edit folder" : "New folder"}</h3><p>Group projects (e.g. "Tower A", "Apartments")</p></div><button type="button" class="icon-button" data-action="close-modal">${icon("close")}</button></div><div class="modal-body"><div class="form-grid"><div class="field full"><label for="folderName">Name</label><input id="folderName" name="name" required value="${escapeHtml(existing?.name || "")}" placeholder="Apartments" /></div><div class="field"><label for="folderColor">Colour</label><input id="folderColor" name="color" type="color" value="${escapeHtml(existing?.color || defaultColor)}" /></div></div>${existing ? `<input type="hidden" name="folderId" value="${escapeHtml(existing.id)}" />` : ""}</div><div class="modal-actions"><button type="button" class="ghost-button" data-action="close-modal">Cancel</button><button class="primary-button" type="submit">${icon("check")}Save</button></div></form>`;
}

function renderProjectModal(isEdit) {
  const existing = isEdit ? project() : null;
  return `<div class="modal-backdrop" data-action="close-modal"></div><form class="modal" id="projectForm" role="dialog"><div class="modal-header"><div><h3>${isEdit ? "Edit project" : "New project"}</h3><p>Drive folder will be created at /${DRIVE_ROOT_NAME}/${DRIVE_PROJECTS_FOLDER}/&lt;folder&gt;/&lt;project&gt;/</p></div><button type="button" class="icon-button" data-action="close-modal">${icon("close")}</button></div><div class="modal-body"><div class="form-grid"><div class="field full"><label for="projectName">Name</label><input id="projectName" name="name" required value="${escapeHtml(existing?.name || "")}" placeholder="Tower A Stage 1" /></div><div class="field"><label for="projectFolder">Folder</label><select id="projectFolder" name="folderId"><option value="">${DRIVE_UNFILED_FOLDER}</option>${state.projectFolders.map((f) => `<option value="${f.id}" ${f.id === existing?.folderId ? "selected" : ""}>${escapeHtml(f.name)}</option>`).join("")}</select></div><div class="field"><label for="projectPlan">Plan name</label><input id="projectPlan" name="planName" value="${escapeHtml(existing?.planName || "Ground floor")}" placeholder="Ground floor" /></div><div class="field full"><label for="projectAddress">Address</label><input id="projectAddress" name="address" value="${escapeHtml(existing?.address || "")}" placeholder="42 Bourke Street, Sydney" /></div><div class="field full"><label for="projectDescription">Description</label><textarea id="projectDescription" name="description">${escapeHtml(existing?.description || "")}</textarea></div></div></div><div class="modal-actions">${isEdit ? `<button type="button" class="danger-button" data-action="delete-project">${icon("trash")}Delete project</button>` : ""}<button type="button" class="ghost-button" data-action="close-modal">Cancel</button><button class="primary-button" type="submit">${icon("check")}Save</button></div></form>`;
}

function renderInviteModal() {
  return `<div class="modal-backdrop" data-action="close-modal"></div><form class="modal" id="inviteForm" role="dialog"><div class="modal-header"><div><h3>Add team member</h3><p>Used for the "Assigned to" dropdown on nodes</p></div><button type="button" class="icon-button" data-action="close-modal">${icon("close")}</button></div><div class="modal-body"><div class="form-grid"><div class="field"><label for="memberName">Name</label><input id="memberName" name="name" required placeholder="Name" /></div><div class="field"><label for="memberEmail">Email</label><input id="memberEmail" name="email" type="email" placeholder="email@example.com" /></div><div class="field"><label for="memberRole">Role</label><select id="memberRole" name="role"><option value="admin">admin</option><option value="editor" selected>editor</option><option value="viewer">viewer</option></select></div></div></div><div class="modal-actions"><button type="button" class="ghost-button" data-action="close-modal">Cancel</button><button class="primary-button" type="submit">${icon("check")}Add</button></div></form>`;
}

function renderNodeModal() {
  const proj = project(); if (!proj) return "";
  const isEdit = state.modal.mode === "edit";
  const node = isEdit ? selectedNode() : null;
  const cats = categoryNames();
  if (!cats.length) {
    return `<div class="modal-backdrop" data-action="close-modal"></div><div class="modal" role="dialog"><div class="modal-header"><div><h3>No categories yet</h3><p>Categories live in your Google Sheet</p></div><button type="button" class="icon-button" data-action="close-modal">${icon("close")}</button></div><div class="modal-body"><p>You need to sign in so the Categories sheet can be created. Then add line items to each tab in the sheet.</p></div><div class="modal-actions"><button class="ghost-button" data-action="close-modal">Close</button><button class="primary-button" data-action="google-sign-in" ${!hasGoogleClientId ? "disabled" : ""}>${icon("google")}Sign in</button></div></div>`;
  }
  const initialCategory = node?.category || cats[0];
  const items = categoryItems(initialCategory);
  const initialItem = node?.lineItem || items[0]?.item || "";
  const isCustom = Boolean(node?.customTitle);
  const assignees = teamNames();
  return `<div class="modal-backdrop" data-action="close-modal"></div><form class="modal" id="nodeForm" role="dialog"><div class="modal-header"><div><h3>${isEdit ? "Edit Node" : "Create Node"}</h3><p>${escapeHtml(proj.planName || "Plan")}</p></div><button type="button" class="icon-button" data-action="close-modal">${icon("close")}</button></div><div class="modal-body"><div class="form-grid"><div class="field"><label for="nodeCategory">Category</label><select id="nodeCategory" name="category" data-node-category>${cats.map((c) => `<option value="${escapeHtml(c)}" ${initialCategory === c ? "selected" : ""}>${escapeHtml(c)}</option>`).join("")}</select></div><div class="field"><label for="nodeItem">Line item</label><select id="nodeItem" name="lineItem" data-node-item>${items.length ? items.map((i) => `<option value="${escapeHtml(i.item)}" ${initialItem === i.item ? "selected" : ""}>${escapeHtml(i.item)}${i.code ? ` (${escapeHtml(i.code)})` : ""}</option>`).join("") : `<option value="">No line items in this tab</option>`}</select></div><div class="field"><label for="nodeStatus">Status</label><select id="nodeStatus" name="status">${Object.keys(statusMeta).map((s) => `<option value="${escapeHtml(s)}" ${(node?.status || "Not Started") === s ? "selected" : ""}>${escapeHtml(s)}</option>`).join("")}</select></div><div class="field"><label for="nodeAssigned">Assigned to</label><select id="nodeAssigned" name="assignedTo"><option value="">Unassigned</option>${assignees.map((u) => `<option value="${escapeHtml(u)}" ${node?.assignedTo === u ? "selected" : ""}>${escapeHtml(u)}</option>`).join("")}</select></div><div class="field full"><label style="display:flex;gap:8px;align-items:center;font-weight:500;cursor:pointer"><input type="checkbox" name="useCustomTitle" data-toggle-custom ${isCustom ? "checked" : ""} />Use a custom title instead of the line item name</label><input id="nodeCustomTitle" name="customTitle" value="${escapeHtml(node?.customTitle || "")}" placeholder="Optional custom title (e.g. 'Server room west wall')" ${isCustom ? "" : "disabled"} style="margin-top:8px" /></div><div class="field"><label for="nodeTags">Tags</label><input id="nodeTags" name="tags" value="${escapeHtml(node?.tags?.join(", ") || "")}" placeholder="entry, urgent" /></div><div class="field full"><label for="nodeDescription">Notes</label><textarea id="nodeDescription" name="description">${escapeHtml(node?.description || "")}</textarea></div><div class="field full"><label for="nodeImages">Initial photos (optional)</label><input id="nodeImages" name="images" type="file" accept="image/*" multiple /></div></div></div><div class="modal-actions">${isEdit ? `<button type="button" class="danger-button" data-action="delete-node">${icon("trash")}Delete</button>` : ""}<button type="button" class="ghost-button" data-action="close-modal">Cancel</button><button class="primary-button" type="submit">${icon("check")}Save</button></div></form>`;
}

function renderMassPickModal() {
  const cats = categoryNames();
  const initialCategory = state.modal.category || cats[0];
  const items = categoryItems(initialCategory);
  return `<div class="modal-backdrop" data-action="close-modal"></div><form class="modal" id="massForm" role="dialog"><div class="modal-header"><div><h3>Mass place nodes</h3><p>Pick what you're dropping. Then click the plan to place them.</p></div><button type="button" class="icon-button" data-action="close-modal">${icon("close")}</button></div><div class="modal-body"><div class="form-grid"><div class="field"><label for="massCategory">Category</label><select id="massCategory" name="category" data-node-category>${cats.map((c) => `<option value="${escapeHtml(c)}" ${initialCategory === c ? "selected" : ""}>${escapeHtml(c)}</option>`).join("")}</select></div><div class="field"><label for="massItem">Line item</label><select id="massItem" name="lineItem" data-node-item>${items.length ? items.map((i) => `<option value="${escapeHtml(i.item)}">${escapeHtml(i.item)}${i.code ? ` (${escapeHtml(i.code)})` : ""}</option>`).join("") : `<option value="">No line items in this tab</option>`}</select></div><div class="field"><label for="massStatus">Status</label><select id="massStatus" name="status">${Object.keys(statusMeta).map((s) => `<option value="${escapeHtml(s)}" ${s === "Not Started" ? "selected" : ""}>${escapeHtml(s)}</option>`).join("")}</select></div></div><p style="margin-top:12px;color:rgba(255,255,255,.6)">After clicking Start, your cursor turns into a node. Click anywhere on the plan to drop. Press <kbd>Esc</kbd> or the Stop button to exit.</p></div><div class="modal-actions"><button type="button" class="ghost-button" data-action="close-modal">Cancel</button><button class="primary-button" type="submit">${icon("mass")}Start placing</button></div></form>`;
}

function renderPortalCreateModal() {
  const proj = project();
  const otherProjects = state.projects.filter((p) => p.id !== proj?.id);
  return `<div class="modal-backdrop" data-action="close-modal"></div><form class="modal" id="portalForm" role="dialog"><div class="modal-header"><div><h3>Add door / stairs</h3><p>Link this project to another. A matching return door appears in the other project automatically.</p></div><button type="button" class="icon-button" data-action="close-modal">${icon("close")}</button></div><div class="modal-body"><div class="form-grid"><div class="field full"><label for="portalLabel">Label</label><input id="portalLabel" name="label" required placeholder="Stairs to Level 2" /></div><div class="field full"><label for="portalTarget">Links to project</label><select id="portalTarget" name="targetProjectId" required>${otherProjects.length ? otherProjects.map((p) => `<option value="${p.id}">${escapeHtml(p.name)}</option>`).join("") : `<option value="">No other projects exist yet</option>`}</select></div><div class="field full"><label for="portalReturn">Return door label (in the other project)</label><input id="portalReturn" name="returnLabel" placeholder="Stairs to Level 1" /></div></div><p style="margin-top:12px;color:rgba(255,255,255,.6)">Tip: drag each door to its true position on the plan after.</p></div><div class="modal-actions"><button type="button" class="ghost-button" data-action="close-modal">Cancel</button><button class="primary-button" type="submit" ${otherProjects.length ? "" : "disabled"}>${icon("check")}Create door</button></div></form>`;
}

function renderLightbox() {
  const node = selectedNode(); if (!node) return "";
  const image = node.imageRefs[state.lightbox.index]; if (!image) return "";
  return `<div class="lightbox-backdrop" data-action="close-lightbox"></div><div class="lightbox" role="dialog"><div class="lightbox-header"><div><h3>${escapeHtml(image.name)}</h3><p>${escapeHtml(image.uploader || "")} / ${escapeHtml(image.uploadedAt || "")}</p></div><div class="lightbox-actions">${image.webViewLink ? `<a class="icon-button" href="${escapeHtml(image.webViewLink)}" target="_blank" rel="noopener" aria-label="Open in Drive">${icon("link")}</a>` : ""}<button class="icon-button" data-action="prev-image" aria-label="Previous">${icon("arrowLeft")}</button><button class="icon-button" data-action="next-image" aria-label="Next">${icon("arrowRight")}</button><button class="icon-button" data-action="close-lightbox" aria-label="Close">${icon("close")}</button></div></div><div class="lightbox-stage">${image.thumbnailLink ? `<img src="${escapeHtml(image.thumbnailLink.replace(/=s\d+(-c)?$/, "=s1600"))}" alt="${escapeHtml(image.name)}" referrerpolicy="no-referrer" style="max-width:100%;max-height:100%;object-fit:contain;border-radius:8px" />` : `<div class="lightbox-image" style="--thumb:linear-gradient(135deg,#1e293b,#334155)"></div>`}</div></div>`;
}

/* EVENTS */
function bindEvents() {
  document.querySelectorAll("[data-view]").forEach((b) => b.addEventListener("click", () => { state.activeView = b.dataset.view; state.drawerOpen = state.activeView === "map" && Boolean(selectedNode()); persist(); render(); }));
  document.querySelectorAll("[data-project]").forEach((b) => b.addEventListener("click", () => selectProject(b.dataset.project)));
  document.querySelectorAll("[data-project-open]").forEach((b) => b.addEventListener("click", () => { selectProject(b.dataset.projectOpen); state.activeView = "map"; render(); }));
  document.querySelectorAll("[data-project-delete]").forEach((b) => b.addEventListener("click", (e) => { e.stopPropagation(); deleteProject(b.dataset.projectDelete); }));
  document.querySelectorAll("[data-folder]").forEach((b) => b.addEventListener("click", () => { state.selectedFolderId = b.dataset.folder; state.activeView = "projects"; state.drawerOpen = false; persist(); render(); }));
  document.querySelectorAll("[data-folder-color]").forEach((input) => input.addEventListener("change", () => {
    const folder = state.projectFolders.find((f) => f.id === input.dataset.folderColor);
    if (!folder) return;
    folder.color = input.value; persist(); render(); toast(`${folder.name} colour updated`);
    logAudit("Folder Edited", { details: `Colour set to ${input.value} for ${folder.name}` });
  }));
  document.querySelectorAll("[data-folder-rename]").forEach((b) => b.addEventListener("click", () => { state.modal = { mode: "rename-folder", folderId: b.dataset.folderRename }; render(); }));
  document.querySelectorAll("[data-folder-delete]").forEach((b) => b.addEventListener("click", () => deleteFolder(b.dataset.folderDelete)));
  document.querySelectorAll("[data-project-folder]").forEach((sel) => sel.addEventListener("change", () => {
    const item = projectById(sel.dataset.projectFolder); if (!item) return;
    item.folderId = sel.value || null;
    delete state.drive.projectFolderMap[item.id];
    persist(); render(); toast(`${item.name} moved`);
    logAudit("Project Moved", { projectId: item.id, details: `Folder set to ${item.folderId ? state.projectFolders.find((f) => f.id === item.folderId)?.name : DRIVE_UNFILED_FOLDER}` });
    if (isTokenValid()) ensureProjectDriveFolder(item).catch((e) => console.warn(e));
  }));
  document.querySelectorAll("[data-node]").forEach((b) => b.addEventListener("click", (e) => { e.stopPropagation(); openNode(b.dataset.node); }));
  document.querySelectorAll("[data-filter]").forEach((input) => { const en = input.tagName === "INPUT" ? "input" : "change"; input.addEventListener(en, () => { state.filters[input.dataset.filter] = input.value; persist(); render(); }); });
  document.querySelectorAll("[data-audit-filter]").forEach((input) => { const en = input.tagName === "INPUT" ? "input" : "change"; input.addEventListener(en, () => { state.auditView.filters[input.dataset.auditFilter] = input.value; persist(); render(); }); });
  document.querySelectorAll("[data-action]").forEach((b) => b.addEventListener("click", handleAction));
  const quickStatus = document.querySelector("[data-quick-status]");
  if (quickStatus) quickStatus.addEventListener("change", () => updateNodeStatus(quickStatus.value));
  document.querySelectorAll("[data-notes]").forEach((textarea) => textarea.addEventListener("change", () => {
    const node = state.nodes.find((n) => n.id === textarea.dataset.notes); if (!node) return;
    node.description = textarea.value; node.updatedAt = nowStamp(); persist(); toast("Notes saved");
    logAudit("Notes Updated", { nodeId: node.id, details: "Notes edited" });
  }));
  document.querySelectorAll("[data-lightbox]").forEach((b) => b.addEventListener("click", () => { state.lightbox = { index: Number(b.dataset.lightbox) }; render(); }));
  document.querySelectorAll("[data-photo-upload]").forEach((input) => input.addEventListener("change", (e) => { const files = Array.from(e.target.files || []); if (files.length) uploadPhotosToNode(input.dataset.photoUpload, files); }));
  document.querySelectorAll("[data-node-category]").forEach((sel) => sel.addEventListener("change", () => {
    const itemSel = sel.form.querySelector("[data-node-item]"); if (!itemSel) return;
    const items = categoryItems(sel.value);
    itemSel.innerHTML = items.length ? items.map((i) => `<option value="${escapeHtml(i.item)}">${escapeHtml(i.item)}${i.code ? ` (${escapeHtml(i.code)})` : ""}</option>`).join("") : `<option value="">No line items in this tab</option>`;
  }));
  document.querySelectorAll("[data-toggle-custom]").forEach((cb) => cb.addEventListener("change", () => { const input = cb.form.querySelector('input[name="customTitle"]'); if (input) input.disabled = !cb.checked; }));
  const nodeForm = document.getElementById("nodeForm"); if (nodeForm) nodeForm.addEventListener("submit", handleNodeForm);
  const folderForm = document.getElementById("folderForm"); if (folderForm) folderForm.addEventListener("submit", handleFolderForm);
  const projectForm = document.getElementById("projectForm"); if (projectForm) projectForm.addEventListener("submit", handleProjectForm);
  const inviteForm = document.getElementById("inviteForm"); if (inviteForm) inviteForm.addEventListener("submit", handleInviteForm);
  const massForm = document.getElementById("massForm"); if (massForm) massForm.addEventListener("submit", handleMassForm);
  const portalForm = document.getElementById("portalForm"); if (portalForm) portalForm.addEventListener("submit", handlePortalForm);
  bindCanvasEvents();
}

function handleAction(event) {
  const action = event.currentTarget.dataset.action;
  if (["close-drawer", "close-modal", "close-lightbox"].includes(action)) event.preventDefault();
  switch (action) {
    case "google-sign-in": return signIn();
    case "google-sign-out": return signOut();
    case "google-bootstrap": return bootstrapDrive();
    case "refresh-categories": return refreshCategories();
    case "go-settings": state.activeView = "settings"; persist(); return render();
    case "create-node": return openCreateModal({ x: 50, y: 50 });
    case "new-project": state.modal = { mode: "new-project" }; return render();
    case "edit-project": state.modal = { mode: "edit-project" }; return render();
    case "delete-project": return deleteProject(state.selectedProjectId);
    case "new-folder": state.modal = { mode: "new-folder" }; return render();
    case "invite-user": state.modal = { mode: "invite-user" }; return render();
    case "upload-plan": return uploadFloorPlan();
    case "mass-start":
      if (!categoryNames().length) { toast("Sign in - categories live in your Sheet"); state.activeView = "settings"; return render(); }
      state.modal = { mode: "mass-pick", category: categoryNames()[0] }; return render();
    case "mass-stop": return stopMassMode();
    case "add-portal": state.modal = { mode: "portal-create" }; return render();
    case "follow-portal": return followPortal();
    case "zoom-in": return setZoom(state.canvas.zoom + 0.15);
    case "zoom-out": return setZoom(state.canvas.zoom - 0.15);
    case "reset-view": state.canvas = { zoom: 1, panX: 0, panY: 0 }; persist(); return render();
    case "close-drawer": state.drawerOpen = false; persist(); return render();
    case "close-modal": state.modal = null; return render();
    case "close-lightbox": state.lightbox = null; return render();
    case "edit-node": state.modal = { mode: "edit" }; return render();
    case "clone-node": return cloneSelectedNode();
    case "delete-node": return deleteSelectedNode();
    case "share-node": return shareSelectedNode();
    case "send-comment": return sendComment();
    case "prev-image": return stepImage(-1);
    case "next-image": return stepImage(1);
    case "audit-load": return fetchAuditRows();
    case "audit-download": return downloadAuditCsv(filteredAuditRows());
    case "audit-clear-filters": state.auditView.filters = freshState().auditView.filters; persist(); return render();
    case "wipe-local":
      if (!confirm("Wipe all local NeillPlanner data? (Drive files are not touched.)")) return;
      localStorage.removeItem(STORAGE_KEY); location.reload(); return;
  }
}

function bindCanvasEvents() {
  const viewport = document.getElementById("canvasViewport"); if (!viewport) return;
  viewport.addEventListener("wheel", (e) => { e.preventDefault(); setZoom(state.canvas.zoom + (e.deltaY < 0 ? 0.08 : -0.08), false); }, { passive: false });
  viewport.addEventListener("pointerdown", (e) => {
    if (e.target.closest(".node-marker")) return;
    if (e.target.closest(".empty-plan")) return;
    if (e.target.closest("button")) return;
    viewport.setPointerCapture(e.pointerId);
    dragState = { pointerId: e.pointerId, startX: e.clientX, startY: e.clientY, panX: state.canvas.panX, panY: state.canvas.panY, moved: false };
  });
  viewport.addEventListener("pointermove", (e) => {
    if (!dragState || dragState.pointerId !== e.pointerId) return;
    const dx = e.clientX - dragState.startX, dy = e.clientY - dragState.startY;
    if (Math.abs(dx) + Math.abs(dy) > 5) {
      dragState.moved = true;
      viewport.classList.add("is-dragging");
      state.canvas.panX = dragState.panX + dx; state.canvas.panY = dragState.panY + dy;
      applyCanvasTransform();
    }
  });
  viewport.addEventListener("pointerup", (e) => {
    if (!dragState || dragState.pointerId !== e.pointerId) return;
    viewport.releasePointerCapture(e.pointerId);
    viewport.classList.remove("is-dragging");
    const wasMoved = dragState.moved;
    dragState = null;
    persist();
    if (!wasMoved && !e.target.closest(".node-marker") && !e.target.closest(".empty-plan") && !e.target.closest("button")) {
      const pos = pointerToPlanPosition(e); if (!pos) return;
      if (state.massMode.active) return placeMassNode(pos);
      const proj = project();
      if (proj && (state.floorPlans[proj.id] || proj.planDriveFileId)) openCreateModal(pos);
    }
  });
}

function pointerToPlanPosition(event) {
  const plan = document.querySelector(".floor-plan"); if (!plan) return null;
  const rect = plan.getBoundingClientRect();
  const x = ((event.clientX - rect.left) / rect.width) * 100;
  const y = ((event.clientY - rect.top) / rect.height) * 100;
  if (x < 0 || x > 100 || y < 0 || y > 100) return null;
  return { x: Number(Math.max(0, Math.min(100, x)).toFixed(1)), y: Number(Math.max(0, Math.min(100, y)).toFixed(1)) };
}

function applyCanvasTransform() { const stage = document.getElementById("planStage"); if (!stage) return; stage.style.transform = `translate(calc(-50% + ${state.canvas.panX}px), calc(-50% + ${state.canvas.panY}px)) scale(${state.canvas.zoom})`; }
function setZoom(value, rerender = true) { state.canvas.zoom = Math.max(0.55, Math.min(2.4, Number(value.toFixed(2)))); persist(); if (rerender) render(); else applyCanvasTransform(); }

/* MUTATIONS */
function selectProject(projectId) {
  state.selectedProjectId = projectId;
  const proj = project();
  state.selectedFolderId = proj?.folderId || (proj && !proj.folderId ? "unfiled" : "all");
  const firstNode = projectNodes()[0];
  state.selectedNodeId = firstNode?.id || null;
  state.drawerOpen = false;
  state.filters = { query: "", status: "All", category: "All", assignee: "All", layer: "All" };
  persist(); render();
  if (proj && !state.floorPlans[proj.id] && proj.planDriveFileId && isTokenValid()) {
    fetchDriveFileAsDataUrl(proj.planDriveFileId).then((url) => { if (url) { state.floorPlans[proj.id] = url; persist(); render(); } }).catch((e) => console.warn(e));
  }
}

function openNode(nodeId) {
  const node = state.nodes.find((n) => n.id === nodeId); if (!node) return;
  state.selectedNodeId = nodeId; state.drawerOpen = true; state.activeView = "map";
  history.replaceState(null, "", `#node=${encodeURIComponent(node.id)}`);
  persist(); render();
}

function openCreateModal(position) {
  if (!project()) { toast("Create a project first"); return; }
  if (!categoryNames().length) { toast("Sign in first - categories live in your Sheet"); state.activeView = "settings"; render(); return; }
  state.modal = { mode: "create", position }; render();
}

async function handleNodeForm(event) {
  event.preventDefault();
  const proj = project(); if (!proj) return;
  const form = new FormData(event.currentTarget);
  const files = Array.from(document.getElementById("nodeImages")?.files || []);
  const category = (form.get("category") || "").toString();
  const lineItem = (form.get("lineItem") || "").toString();
  const useCustom = form.get("useCustomTitle") === "on";
  const customTitle = (form.get("customTitle") || "").toString().trim();
  if (!lineItem && !customTitle) { toast("Pick a line item or enter a custom title"); return; }
  const payload = {
    category, lineItem, customTitle: useCustom ? customTitle : "",
    status: (form.get("status") || "Not Started").toString(),
    assignedTo: (form.get("assignedTo") || "").toString(),
    tags: (form.get("tags") || "").toString().split(",").map((t) => t.trim()).filter(Boolean),
    description: (form.get("description") || "").toString().trim()
  };
  if (state.modal.mode === "edit") {
    const node = selectedNode(); if (!node) return;
    const previousStatus = node.status, previousTitle = nodeDisplayTitle(node);
    Object.assign(node, payload, { updatedAt: nowStamp() });
    state.modal = null; persist(); render();
    const newTitle = nodeDisplayTitle(node);
    if (previousStatus !== node.status) logAudit("Status Changed", { nodeId: node.id, details: `${previousStatus} -> ${node.status}`, status: node.status });
    else if (previousTitle !== newTitle) logAudit("Node Renamed", { nodeId: node.id, details: `${previousTitle} -> ${newTitle}` });
    else logAudit("Node Edited", { nodeId: node.id, details: "Fields updated" });
    if (files.length) await uploadPhotosToNode(node.id, files);
    toast("Node updated");
  } else {
    const node = {
      id: uid("node"), projectId: proj.id, type: "marker", ...payload,
      position: state.modal.position || { x: 50, y: 50 },
      createdBy: state.googleAuth.profile?.name || state.googleAuth.profile?.email || "local",
      createdAt: nowStamp(), updatedAt: nowStamp(),
      imageRefs: [], comments: []
    };
    state.nodes.push(node);
    state.selectedNodeId = node.id; state.drawerOpen = true; state.modal = null;
    persist(); render();
    logAudit("Node Created", { nodeId: node.id, details: `${node.category} / ${node.lineItem || node.customTitle}` });
    if (isTokenValid()) ensureNodeDriveFolder(node).catch((e) => console.warn(e));
    if (files.length) await uploadPhotosToNode(node.id, files);
    toast("Node created");
  }
}

function handleMassForm(event) {
  event.preventDefault();
  const form = new FormData(event.currentTarget);
  const category = (form.get("category") || "").toString();
  const lineItem = (form.get("lineItem") || "").toString();
  const status = (form.get("status") || "Not Started").toString();
  if (!category || !lineItem) { toast("Pick a category and line item"); return; }
  state.massMode = { active: true, category, lineItem, status, count: 0 };
  state.modal = null; render();
  toast(`Mass placing ${category} / ${lineItem}. ESC to stop.`);
}

function placeMassNode(position) {
  const proj = project(); if (!proj) return;
  const m = state.massMode;
  const node = {
    id: uid("node"), projectId: proj.id, type: "marker",
    category: m.category, lineItem: m.lineItem, customTitle: "",
    status: m.status || "Not Started",
    assignedTo: "", tags: [], description: "", position,
    createdBy: state.googleAuth.profile?.name || state.googleAuth.profile?.email || "local",
    createdAt: nowStamp(), updatedAt: nowStamp(),
    imageRefs: [], comments: []
  };
  state.nodes.push(node);
  state.massMode.count += 1;
  persist(); render();
  logAudit("Node Created (mass)", { nodeId: node.id, details: `${m.category} / ${m.lineItem}` });
  if (isTokenValid()) ensureNodeDriveFolder(node).catch((e) => console.warn(e));
}

function stopMassMode() {
  const placed = state.massMode.count;
  state.massMode = { active: false, category: null, lineItem: null, status: "Not Started", count: 0 };
  persist(); render();
  if (placed) toast(`Mass-place complete: ${placed} node${placed === 1 ? "" : "s"} placed`);
}

function handleFolderForm(event) {
  event.preventDefault();
  const form = new FormData(event.currentTarget);
  const id = form.get("folderId");
  const name = (form.get("name") || "").toString().trim();
  const color = (form.get("color") || "#0ea5e9").toString();
  if (!name) return;
  if (id) {
    const f = state.projectFolders.find((x) => x.id === id);
    if (f) { const old = f.name; f.name = name; f.color = color; logAudit("Folder Renamed", { details: `${old} -> ${name}` }); }
  } else {
    state.projectFolders.push({ id: uid("fld"), name, color, driveFolderId: null });
    logAudit("Folder Created", { details: `${name} (${color})` });
  }
  state.modal = null; persist(); render();
}

async function handleProjectForm(event) {
  event.preventDefault();
  const form = new FormData(event.currentTarget);
  const name = (form.get("name") || "").toString().trim(); if (!name) return;
  const folderId = (form.get("folderId") || "").toString() || null;
  const payload = { name, folderId, address: (form.get("address") || "").toString(), description: (form.get("description") || "").toString(), planName: (form.get("planName") || "Ground floor").toString() };
  if (state.modal.mode === "edit-project") {
    const proj = project(); if (!proj) return;
    const folderChanged = proj.folderId !== folderId, nameChanged = proj.name !== name;
    Object.assign(proj, payload, { updatedAt: nowStamp() });
    if (folderChanged || nameChanged) delete state.drive.projectFolderMap[proj.id];
    state.modal = null; persist(); render();
    logAudit("Project Edited", { projectId: proj.id, details: nameChanged ? `Renamed to ${name}` : "Fields updated" });
    if (isTokenValid()) ensureProjectDriveFolder(proj).catch((e) => console.warn(e));
    toast("Project updated");
  } else {
    const proj = { id: uid("prj"), ...payload, team: [], createdAt: nowStamp(), updatedAt: nowStamp() };
    state.projects.push(proj);
    state.selectedProjectId = proj.id;
    state.selectedFolderId = proj.folderId || "unfiled";
    state.modal = null; persist(); render();
    logAudit("Project Created", { projectId: proj.id, details: `Folder ${folderId || DRIVE_UNFILED_FOLDER}` });
    if (isTokenValid()) ensureProjectDriveFolder(proj).catch((e) => console.warn(e));
    toast(`Project ${proj.name} created`);
  }
}

function handleInviteForm(event) {
  event.preventDefault();
  const proj = project(); if (!proj) return;
  const form = new FormData(event.currentTarget);
  const name = (form.get("name") || "").toString().trim(); if (!name) return;
  proj.team = proj.team || [];
  proj.team.push({ id: uid("usr"), name, email: (form.get("email") || "").toString().trim(), role: (form.get("role") || "editor").toString() });
  state.modal = null; persist(); render();
  logAudit("Team Member Added", { projectId: proj.id, details: name });
  toast("Team member added");
}

function handlePortalForm(event) {
  event.preventDefault();
  const proj = project(); if (!proj) return;
  const form = new FormData(event.currentTarget);
  const label = (form.get("label") || "").toString().trim();
  const targetProjectId = (form.get("targetProjectId") || "").toString();
  const returnLabel = (form.get("returnLabel") || "").toString().trim() || `Door to ${proj.name}`;
  if (!label || !targetProjectId) return;
  const target = projectById(targetProjectId); if (!target) return;
  const portalA = {
    id: uid("node"), projectId: proj.id, type: "portal",
    customTitle: label, lineItem: "", category: "",
    status: "Complete", assignedTo: "", tags: [],
    description: `Door / link to ${target.name}`,
    position: { x: 10, y: 50 },
    createdBy: state.googleAuth.profile?.name || "local",
    createdAt: nowStamp(), updatedAt: nowStamp(),
    imageRefs: [], comments: [],
    linkedProjectId: target.id, linkedNodeId: null
  };
  const portalB = {
    id: uid("node"), projectId: target.id, type: "portal",
    customTitle: returnLabel, lineItem: "", category: "",
    status: "Complete", assignedTo: "", tags: [],
    description: `Door / link back to ${proj.name}`,
    position: { x: 90, y: 50 },
    createdBy: state.googleAuth.profile?.name || "local",
    createdAt: nowStamp(), updatedAt: nowStamp(),
    imageRefs: [], comments: [],
    linkedProjectId: proj.id, linkedNodeId: portalA.id
  };
  portalA.linkedNodeId = portalB.id;
  state.nodes.push(portalA, portalB);
  state.selectedNodeId = portalA.id; state.drawerOpen = true; state.modal = null;
  persist(); render();
  logAudit("Door Created", { projectId: proj.id, nodeId: portalA.id, details: `Linked to ${target.name}` });
  logAudit("Door Created (return)", { projectId: target.id, nodeId: portalB.id, details: `Linked back to ${proj.name}` });
  toast(`Door created: ${proj.name} <-> ${target.name}`);
}

function followPortal() {
  const node = selectedNode(); if (!node || node.type !== "portal" || !node.linkedProjectId) return;
  const target = projectById(node.linkedProjectId);
  if (!target) { toast("Linked project no longer exists"); return; }
  const linkedNodeId = node.linkedNodeId;
  selectProject(target.id);
  if (linkedNodeId) { state.selectedNodeId = linkedNodeId; state.drawerOpen = true; state.activeView = "map"; persist(); render(); }
}

function deleteFolder(folderId) {
  const folder = state.projectFolders.find((f) => f.id === folderId); if (!folder) return;
  if (!confirm(`Delete folder "${folder.name}"? Projects inside move to ${DRIVE_UNFILED_FOLDER}.`)) return;
  state.projects.forEach((p) => { if (p.folderId === folderId) p.folderId = null; });
  state.projectFolders = state.projectFolders.filter((f) => f.id !== folderId);
  if (state.selectedFolderId === folderId) state.selectedFolderId = "all";
  persist(); render();
  logAudit("Folder Deleted", { details: folder.name });
  toast(`Folder "${folder.name}" deleted`);
}

function deleteProject(projectId) {
  const proj = projectById(projectId); if (!proj) return;
  if (!confirm(`Delete project "${proj.name}" and all its nodes? (Drive files are NOT deleted.)`)) return;
  const linkedReturns = state.nodes.filter((n) => n.type === "portal" && n.linkedProjectId === projectId);
  linkedReturns.forEach((n) => { state.nodes = state.nodes.filter((x) => x.id !== n.id); });
  state.projects = state.projects.filter((p) => p.id !== projectId);
  state.nodes = state.nodes.filter((n) => n.projectId !== projectId);
  delete state.floorPlans[projectId];
  delete state.drive.projectFolderMap[projectId];
  if (state.selectedProjectId === projectId) state.selectedProjectId = state.projects[0]?.id || null;
  persist(); render();
  logAudit("Project Deleted", { details: proj.name });
  toast(`Project "${proj.name}" deleted`);
}

function deleteSelectedNode() {
  const node = selectedNode(); if (!node) return;
  if (!confirm(`Delete node "${nodeDisplayTitle(node)}"?`)) return;
  if (node.type === "portal" && node.linkedNodeId) state.nodes = state.nodes.filter((n) => n.id !== node.linkedNodeId);
  state.nodes = state.nodes.filter((n) => n.id !== node.id);
  delete state.drive.nodeFolderMap[node.id];
  logAudit("Node Deleted", { nodeId: node.id, nodeTitle: nodeDisplayTitle(node) });
  state.selectedNodeId = projectNodes()[0]?.id || null;
  state.drawerOpen = Boolean(state.selectedNodeId);
  state.modal = null; persist(); render();
  toast("Node deleted");
}

function cloneSelectedNode() {
  const node = selectedNode(); if (!node) return;
  if (node.type === "portal") { toast("Portals can't be duplicated"); return; }
  const copy = { ...node, id: uid("node"), position: { x: Math.min(99, node.position.x + 3), y: Math.min(99, node.position.y + 3) }, imageRefs: [], comments: [], createdAt: nowStamp(), updatedAt: nowStamp() };
  state.nodes.push(copy);
  state.selectedNodeId = copy.id;
  persist(); render();
  logAudit("Node Cloned", { nodeId: copy.id, details: `from ${node.id}` });
  if (isTokenValid()) ensureNodeDriveFolder(copy).catch((e) => console.warn(e));
  toast("Node duplicated");
}

function updateNodeStatus(status) {
  const node = selectedNode(); if (!node || node.status === status) return;
  const previous = node.status;
  node.status = status; node.updatedAt = nowStamp();
  persist(); render();
  logAudit("Status Changed", { nodeId: node.id, status, details: `${previous} -> ${status}` });
  toast("Status saved");
}

function sendComment() {
  const node = selectedNode(); if (!node) return;
  const input = document.querySelector(`[data-comment-input="${node.id}"]`);
  if (!input || !input.value.trim()) return;
  const text = input.value.trim();
  node.comments.push({ author: state.googleAuth.profile?.name || state.googleAuth.profile?.email || "local", time: nowStamp(), text });
  node.updatedAt = nowStamp();
  persist(); render();
  logAudit("Comment Added", { nodeId: node.id, details: text.length > 80 ? text.slice(0, 77) + "..." : text });
  toast(text.includes("@") ? "Mention saved" : "Comment saved");
}

async function shareSelectedNode() {
  const node = selectedNode(); if (!node) return;
  const url = `${location.origin}${location.pathname}#node=${encodeURIComponent(node.id)}`;
  try { await navigator.clipboard.writeText(url); toast("Node link copied"); } catch { toast(url); }
}

function stepImage(direction) {
  const node = selectedNode(); if (!node || !state.lightbox) return;
  const count = node.imageRefs.length; if (!count) return;
  state.lightbox.index = (state.lightbox.index + direction + count) % count;
  render();
}

function uploadFloorPlan() {
  const proj = project(); if (!proj) { toast("Create a project first"); return; }
  const input = document.createElement("input");
  input.type = "file";
  input.accept = "image/png,image/jpeg,image/svg+xml,image/webp";
  input.onchange = async () => {
    const file = input.files?.[0]; if (!file) return;
    const reader = new FileReader();
    reader.onload = async () => {
      state.floorPlans[proj.id] = reader.result;
      proj.planName = proj.planName || file.name.replace(/\.[^.]+$/, "");
      persist(); render();
      toast(`Plan uploaded for ${proj.name}`);
      logAudit("Plan Uploaded", { projectId: proj.id, details: file.name });
      if (isTokenValid()) {
        try {
          const projectFolderId = await ensureProjectDriveFolder(proj);
          if (!projectFolderId) { toast("Project folder not found"); return; }
          let result;
          if (proj.planDriveFileId) {
            try { result = await updateFileBytes(proj.planDriveFileId, file); }
            catch (e) { result = await uploadFileToDrive(file, projectFolderId, `floor-plan-${file.name}`); }
          } else {
            result = await uploadFileToDrive(file, projectFolderId, `floor-plan-${file.name}`);
          }
          proj.planDriveFileId = result.id;
          proj.planMimeType = result.mimeType;
          proj.planWebViewLink = result.webViewLink;
          persist(); render();
          toast(`Plan synced to Drive`);
        } catch (e) { console.warn(e); toast("Drive sync failed: " + describeError(e)); }
      }
    };
    reader.readAsDataURL(file);
  };
  input.click();
}

async function uploadPhotosToNode(nodeId, files) {
  const node = state.nodes.find((n) => n.id === nodeId); if (!node) return;
  if (!requireAuth("upload photos to Drive")) return;
  toast(`Uploading ${files.length} photo${files.length === 1 ? "" : "s"}...`);
  try {
    const nodeFolderId = await ensureNodeDriveFolder(node);
    if (!nodeFolderId) { toast("Could not find/create node folder"); return; }
    const uploaderName = state.googleAuth.profile?.name || state.googleAuth.profile?.email || "local";
    for (const file of files) {
      try {
        const result = await uploadFileToDrive(file, nodeFolderId);
        node.imageRefs.push({ id: result.id, name: result.name, driveFileId: result.id, webViewLink: result.webViewLink, thumbnailLink: result.thumbnailLink, mimeType: result.mimeType, uploader: uploaderName, uploadedAt: nowStamp() });
      } catch (e) { console.error(e); toast(`Failed: ${file.name}`); }
    }
    node.updatedAt = nowStamp();
    persist(); render();
    toast(`Uploaded ${files.length} photo${files.length === 1 ? "" : "s"}`);
    logAudit("Photos Uploaded", { nodeId: node.id, details: `${files.length} file(s)` });
  } catch (e) { console.error(e); toast("Upload failed: " + describeError(e)); }
}

function toast(message) {
  state.toast = message;
  window.clearTimeout(toast.timer);
  toast.timer = window.setTimeout(() => { state.toast = ""; render(); }, 2800);
}

function hydrateFromHash() {
  const match = location.hash.match(/node=([^&]+)/); if (!match) return;
  const node = state.nodes.find((n) => n.id === decodeURIComponent(match[1])); if (!node) return;
  state.selectedProjectId = node.projectId;
  state.selectedNodeId = node.id;
  state.drawerOpen = true;
  state.activeView = "map";
}

document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") {
    if (state.massMode.active) { stopMassMode(); return; }
    if (state.lightbox) { state.lightbox = null; render(); return; }
    if (state.modal) { state.modal = null; render(); return; }
    if (state.drawerOpen) { state.drawerOpen = false; persist(); render(); return; }
  }
});

hydrateFromHash();
render();
bootGoogle();
