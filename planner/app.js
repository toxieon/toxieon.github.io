/* =========================================================================
 *  NeillPlanner — main app
 *  - No seed data. Empty on first run.
 *  - Google sign-in via Google Identity Services (token model).
 *  - Drive: ensures NeillPlanner / Admin Files / Projects / Unfiled Projects.
 *  - Sheets: appends every audit event to a single NeillPlanner-Audit sheet.
 *  - Photos: multipart upload to the matching node folder, drive.file scope.
 *  - Audit view: on-demand fetch + comprehensive filtering + CSV download.
 * ========================================================================= */

const STORAGE_KEY = "neillplanner-state-v2";
const APP_VERSION = "0.2.0";

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
const AUDIT_HEADER = [
  "Timestamp", "User", "Action", "Project ID", "Project Name",
  "Folder", "Node ID", "Node Title", "Category", "Status", "Details", "Device"
];

const DEFAULT_FOLDER_COLORS = ["#0ea5e9", "#14b8a6", "#f59e0b", "#a855f7", "#ef4444", "#22c55e", "#6366f1"];
const DEFAULT_CATEGORIES = ["CCTV", "Data Point", "Access", "Electrical", "Safety"];

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
  filter: '<path d="M4 5h16"/><path d="M7 12h10"/><path d="M10 19h4"/>',
  zoomIn: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/><path d="M11 8v6"/><path d="M8 11h6"/>',
  zoomOut: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/><path d="M8 11h6"/>',
  target: '<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="3"/><path d="M12 2v3"/><path d="M12 19v3"/><path d="M2 12h3"/><path d="M19 12h3"/>',
  close: '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>',
  share: '<path d="M4 12v7a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-7"/><path d="M16 6 12 2 8 6"/><path d="M12 2v14"/>',
  qr: '<path d="M4 4h6v6H4Z"/><path d="M14 4h6v6h-6Z"/><path d="M4 14h6v6H4Z"/><path d="M14 14h2"/><path d="M18 14h2v2"/><path d="M14 18h2v2"/><path d="M20 18v2h-2"/>',
  image: '<rect x="3" y="5" width="18" height="14" rx="2"/><circle cx="8" cy="10" r="2"/><path d="m21 15-5-5L5 19"/>',
  printer: '<path d="M7 9V3h10v6"/><path d="M7 18H5a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><path d="M7 14h10v7H7Z"/>',
  check: '<path d="m20 6-11 11-5-5"/>',
  trash: '<path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="M19 6l-1 15H6L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/>',
  edit: '<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/>',
  folder: '<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z"/>',
  link: '<path d="M10 13a5 5 0 0 0 7.07 0l2.12-2.12a5 5 0 0 0-7.07-7.07L11 4.93"/><path d="M14 11a5 5 0 0 0-7.07 0L4.81 13.1a5 5 0 0 0 7.07 7.07L13 19.07"/>',
  arrowLeft: '<path d="m15 18-6-6 6-6"/>',
  arrowRight: '<path d="m9 18 6-6-6-6"/>',
  google: '<path d="M21.35 11.1H12v3.2h5.35c-.49 2.3-2.43 3.78-5.35 3.78-3.2 0-5.78-2.6-5.78-5.78s2.58-5.78 5.78-5.78c1.46 0 2.77.53 3.78 1.4l2.42-2.4A8.85 8.85 0 0 0 12 3.2a8.8 8.8 0 1 0 0 17.6c5.1 0 8.45-3.55 8.45-8.55 0-.6-.05-1.15-.1-1.15Z"/>',
  refresh: '<path d="M21 12a9 9 0 1 1-3-6.7"/><path d="M21 3v6h-6"/>',
  signOut: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="m16 17 5-5-5-5"/><path d="M21 12H9"/>'
};

/* ------------------------------------------------------------------ state */

function freshState() {
  return {
    activeView: "projects",
    selectedProjectId: null,
    selectedNodeId: null,
    drawerOpen: false,
    modal: null,
    lightbox: null,
    toast: "",
    selectedFolderId: "all",
    filters: {
      query: "",
      status: "All",
      category: "All",
      assignee: "All",
      layer: "All"
    },
    canvas: { zoom: 1, panX: 0, panY: 0 },
    projectFolders: [],
    projects: [],
    nodes: [],
    floorPlans: {}, // { [projectId]: dataUrl }
    googleAuth: {
      librariesReady: false,
      signedIn: false,
      accessToken: null,
      expiresAt: null,
      profile: null,
      bootstrapped: false,
      bootstrapping: false,
      lastError: null
    },
    drive: {
      rootFolderId: null,
      adminFolderId: null,
      projectsFolderId: null,
      unfiledFolderId: null,
      auditSheetId: null,
      projectFolderMap: {}, // { [projectId]: driveFolderId }
      nodeFolderMap: {}     // { [nodeId]: driveFolderId }
    },
    auditQueue: [],
    auditView: {
      loaded: false,
      loading: false,
      rows: [],
      lastFetchedAt: null,
      filters: {
        from: "",
        to: "",
        user: "All",
        action: "All",
        projectId: "All",
        nodeQuery: "",
        detailsQuery: "",
        query: ""
      }
    }
  };
}

let state = loadState();
let dragState = null;

function loadState() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (saved && typeof saved === "object") {
      const merged = {
        ...freshState(),
        ...saved,
        modal: null,
        lightbox: null,
        toast: ""
      };
      // Always reset transient sign-in flags; user must re-sign-in each session for security.
      merged.googleAuth = {
        ...freshState().googleAuth,
        bootstrapped: saved.googleAuth?.bootstrapped || false,
        profile: saved.googleAuth?.profile || null
      };
      merged.drive = { ...freshState().drive, ...(saved.drive || {}) };
      merged.auditView = { ...freshState().auditView, filters: { ...freshState().auditView.filters, ...(saved.auditView?.filters || {}) } };
      // Pick a sensible selected project if it disappeared
      if (merged.selectedProjectId && !merged.projects.some((p) => p.id === merged.selectedProjectId)) {
        merged.selectedProjectId = merged.projects[0]?.id || null;
      }
      return merged;
    }
  } catch (e) {
    console.warn("Saved state could not be loaded", e);
  }
  return freshState();
}

function persist() {
  const saveable = {
    ...state,
    modal: null,
    lightbox: null,
    toast: "",
    googleAuth: {
      bootstrapped: state.googleAuth.bootstrapped,
      profile: state.googleAuth.profile
    },
    auditView: {
      ...freshState().auditView,
      filters: state.auditView.filters
    }
  };
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(saveable));
  } catch (e) {
    console.warn("Persist failed (storage quota?)", e);
  }
}

/* --------------------------------------------------------------- helpers */

function uid(prefix) {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}

function icon(name) {
  return `<svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round">${iconPaths[name] || ""}</svg>`;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function statusStyle(status) {
  return `--status:${statusMeta[status]?.color || "#2563eb"}`;
}

function statusPill(status) {
  return `<span class="status-pill" style="${statusStyle(status)}">${escapeHtml(status)}</span>`;
}

function initials(name) {
  if (!name) return "?";
  return name.trim().split(/\s+/).map((part) => part[0]).join("").slice(0, 2).toUpperCase();
}

function nowStamp() {
  return new Date().toISOString().slice(0, 16).replace("T", " ");
}

function detectDevice() {
  return /Mobi|Android|iPhone/i.test(navigator.userAgent) ? "Mobile" : "Desktop";
}

function project() {
  return state.projects.find((p) => p.id === state.selectedProjectId) || state.projects[0] || null;
}

function projectFolder(item = project()) {
  if (!item || !item.folderId) return null;
  return state.projectFolders.find((f) => f.id === item.folderId) || null;
}

function folderProjects(folderId = state.selectedFolderId) {
  if (folderId === "all") return state.projects;
  if (folderId === "unfiled") return state.projects.filter((p) => !p.folderId);
  return state.projects.filter((p) => p.folderId === folderId);
}

function projectNodes(projectId = state.selectedProjectId) {
  if (!projectId) return [];
  return state.nodes.filter((n) => n.projectId === projectId);
}

function selectedNode() {
  return state.nodes.find((n) => n.id === state.selectedNodeId) || null;
}

function teamNames() {
  const proj = project();
  if (!proj) return [];
  return proj.team.map((u) => u.name);
}

function stats(nodes) {
  const list = nodes || projectNodes();
  const total = list.length;
  const complete = list.filter((n) => n.status === "Complete").length;
  const progress = list.filter((n) => n.status === "In Progress").length;
  const issue = list.filter((n) => n.status === "Issue").length;
  const notStarted = list.filter((n) => n.status === "Not Started").length;
  return {
    total, complete, progress, issue, notStarted,
    completePercent: total ? Math.round((complete / total) * 100) : 0
  };
}

function folderStats(folderId) {
  const projects = folderProjects(folderId);
  const projectIds = projects.map((p) => p.id);
  const nodes = state.nodes.filter((n) => projectIds.includes(n.projectId));
  const s = stats(nodes);
  return { projects: projects.length, nodes: nodes.length, completePercent: s.completePercent, issues: s.issue };
}

function matchesNode(node) {
  const filters = state.filters;
  const query = filters.query.trim().toLowerCase();
  const inQuery = !query || [node.title, node.category, node.status, node.assignedTo, node.description, ...(node.tags || [])]
    .join(" ").toLowerCase().includes(query);
  const inStatus = filters.status === "All" || node.status === filters.status;
  const inCategory = filters.category === "All" || node.category === filters.category;
  const inAssignee = filters.assignee === "All" || node.assignedTo === filters.assignee;
  const inLayer = filters.layer === "All" || node.category === filters.layer;
  return inQuery && inStatus && inCategory && inAssignee && inLayer;
}

function navItems() {
  return [
    { id: "projects", label: "Projects", icon: "projects" },
    { id: "map", label: "Map", icon: "map" },
    { id: "progress", label: "Progress", icon: "chart" },
    { id: "audit", label: "Audit", icon: "audit" },
    { id: "settings", label: "Settings", icon: "settings" }
  ];
}

/* ============================================================
 * GOOGLE LIBRARIES + AUTH
 * ============================================================ */

let _gapiReady = false;
let _gisReady = false;
let _tokenClient = null;

async function bootGoogle() {
  if (!hasGoogleApiKey || !hasGoogleClientId) {
    console.warn("Google config missing. Sign-in disabled.");
    return;
  }
  const waitForGlobal = (name, timeoutMs = 12000) => new Promise((resolve, reject) => {
    const start = Date.now();
    const tick = () => {
      if (window[name]) return resolve(window[name]);
      if (Date.now() - start > timeoutMs) return reject(new Error(`${name} did not load`));
      setTimeout(tick, 80);
    };
    tick();
  });

  try {
    await waitForGlobal("gapi");
    await new Promise((resolve, reject) => gapi.load("client", { callback: resolve, onerror: reject }));
    await gapi.client.init({ apiKey: googleConfig.googleApiKey });
    await gapi.client.load("https://www.googleapis.com/discovery/v1/apis/drive/v3/rest");
    await gapi.client.load("https://sheets.googleapis.com/$discovery/rest?version=v4");
    _gapiReady = true;
  } catch (e) {
    state.googleAuth.lastError = `Google API client failed to load: ${e.message || e}`;
    render();
    return;
  }

  try {
    await waitForGlobal("google");
    _tokenClient = google.accounts.oauth2.initTokenClient({
      client_id: googleConfig.googleClientId,
      scope: googleScopes,
      callback: handleTokenResponse,
      error_callback: (err) => {
        console.error("OAuth error", err);
        state.googleAuth.lastError = err?.message || err?.type || "OAuth failed";
        state.googleAuth.bootstrapping = false;
        render();
      }
    });
    _gisReady = true;
  } catch (e) {
    state.googleAuth.lastError = `Google Identity Services failed to load: ${e.message || e}`;
    render();
    return;
  }

  state.googleAuth.librariesReady = true;
  render();
}

function handleTokenResponse(resp) {
  if (resp.error) {
    state.googleAuth.lastError = resp.error_description || resp.error;
    state.googleAuth.bootstrapping = false;
    render();
    return;
  }
  state.googleAuth.accessToken = resp.access_token;
  state.googleAuth.expiresAt = Date.now() + ((resp.expires_in || 3600) * 1000);
  state.googleAuth.signedIn = true;
  state.googleAuth.lastError = null;
  gapi.client.setToken({ access_token: resp.access_token });
  fetchProfile().then(() => bootstrapDrive());
}

async function fetchProfile() {
  try {
    const r = await fetch("https://openidconnect.googleapis.com/v1/userinfo", {
      headers: { Authorization: `Bearer ${state.googleAuth.accessToken}` }
    });
    if (r.ok) state.googleAuth.profile = await r.json();
  } catch (e) {
    console.warn("Profile fetch failed", e);
  }
}

function signIn() {
  if (!_tokenClient) {
    toast("Google libraries still loading - try again in a moment");
    return;
  }
  state.googleAuth.bootstrapping = true;
  render();
  _tokenClient.requestAccessToken({ prompt: state.googleAuth.bootstrapped ? "" : "consent" });
}

function signOut() {
  if (state.googleAuth.accessToken && window.google?.accounts?.oauth2) {
    try { google.accounts.oauth2.revoke(state.googleAuth.accessToken, () => {}); } catch (e) {}
  }
  if (window.gapi?.client) gapi.client.setToken(null);
  state.googleAuth = {
    ...freshState().googleAuth,
    librariesReady: state.googleAuth.librariesReady
  };
  persist();
  render();
  toast("Signed out");
}

function isTokenValid() {
  return state.googleAuth.signedIn
    && state.googleAuth.accessToken
    && state.googleAuth.expiresAt
    && Date.now() < state.googleAuth.expiresAt - 30000;
}

function requireAuth(label) {
  if (isTokenValid()) return true;
  toast(`Sign in to Google first (${label})`);
  return false;
}

/* ============================================================
 * DRIVE / SHEETS HELPERS
 * ============================================================ */

async function bootstrapDrive() {
  if (state.googleAuth.bootstrapping === false) state.googleAuth.bootstrapping = true;
  render();
  try {
    const rootId = await ensureFolder(DRIVE_ROOT_NAME, "root");
    const [adminId, projectsId, unfiledId] = await Promise.all([
      ensureFolder(DRIVE_ADMIN_FOLDER, rootId),
      ensureFolder(DRIVE_PROJECTS_FOLDER, rootId),
      ensureFolder(DRIVE_UNFILED_FOLDER, rootId)
    ]);
    const auditSheetId = await ensureAuditSheet(adminId);

    state.drive.rootFolderId = rootId;
    state.drive.adminFolderId = adminId;
    state.drive.projectsFolderId = projectsId;
    state.drive.unfiledFolderId = unfiledId;
    state.drive.auditSheetId = auditSheetId;
    state.googleAuth.bootstrapped = true;
    state.googleAuth.bootstrapping = false;
    persist();
    flushAuditQueue();
    toast("Connected. Drive structure ready.");
    render();
  } catch (e) {
    console.error("Bootstrap failed", e);
    state.googleAuth.lastError = `Drive setup failed: ${describeError(e)}`;
    state.googleAuth.bootstrapping = false;
    persist();
    render();
  }
}

function describeError(e) {
  if (!e) return "unknown error";
  if (e.result?.error?.message) return e.result.error.message;
  if (e.message) return e.message;
  return String(e);
}

function escapeDriveQuery(value) {
  return String(value).replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}

async function ensureFolder(name, parentId) {
  const q = `name='${escapeDriveQuery(name)}' and mimeType='application/vnd.google-apps.folder' and '${parentId}' in parents and trashed=false`;
  const list = await gapi.client.drive.files.list({ q, fields: "files(id,name)", spaces: "drive", pageSize: 5 });
  if (list.result.files && list.result.files.length > 0) return list.result.files[0].id;
  const create = await gapi.client.drive.files.create({
    resource: { name, mimeType: "application/vnd.google-apps.folder", parents: [parentId] },
    fields: "id"
  });
  return create.result.id;
}

async function ensureAuditSheet(adminId) {
  const q = `name='${escapeDriveQuery(AUDIT_SHEET_NAME)}' and mimeType='application/vnd.google-apps.spreadsheet' and '${adminId}' in parents and trashed=false`;
  const list = await gapi.client.drive.files.list({ q, fields: "files(id,name)", pageSize: 5 });
  if (list.result.files && list.result.files.length > 0) return list.result.files[0].id;
  const created = await gapi.client.sheets.spreadsheets.create({
    resource: {
      properties: { title: AUDIT_SHEET_NAME },
      sheets: [{ properties: { title: AUDIT_TAB } }]
    },
    fields: "spreadsheetId"
  });
  const sheetId = created.result.spreadsheetId;
  // Move into Admin Files
  const meta = await gapi.client.drive.files.get({ fileId: sheetId, fields: "parents" });
  const prevParents = (meta.result.parents || []).join(",");
  await gapi.client.drive.files.update({
    fileId: sheetId,
    addParents: adminId,
    removeParents: prevParents,
    fields: "id, parents"
  });
  // Write header
  await gapi.client.sheets.spreadsheets.values.update({
    spreadsheetId: sheetId,
    range: `${AUDIT_TAB}!A1`,
    valueInputOption: "RAW",
    resource: { values: [AUDIT_HEADER] }
  });
  // Bold the header row
  await gapi.client.sheets.spreadsheets.batchUpdate({
    spreadsheetId: sheetId,
    resource: {
      requests: [{
        repeatCell: {
          range: { startRowIndex: 0, endRowIndex: 1 },
          cell: { userEnteredFormat: { textFormat: { bold: true } } },
          fields: "userEnteredFormat.textFormat.bold"
        }
      }, {
        updateSheetProperties: {
          properties: { gridProperties: { frozenRowCount: 1 } },
          fields: "gridProperties.frozenRowCount"
        }
      }]
    }
  });
  return sheetId;
}

async function ensureProjectDriveFolder(projectItem) {
  if (!isTokenValid() || !state.drive.projectsFolderId) return null;
  const existing = state.drive.projectFolderMap[projectItem.id];
  if (existing) return existing;
  let parentId;
  if (projectItem.folderId) {
    const folder = state.projectFolders.find((f) => f.id === projectItem.folderId);
    if (!folder) return null;
    // Ensure the colour-folder exists inside Projects/
    if (!folder.driveFolderId) {
      folder.driveFolderId = await ensureFolder(folder.name, state.drive.projectsFolderId);
    }
    parentId = folder.driveFolderId;
  } else {
    parentId = state.drive.unfiledFolderId;
  }
  const projectFolderId = await ensureFolder(projectItem.name, parentId);
  state.drive.projectFolderMap[projectItem.id] = projectFolderId;
  persist();
  return projectFolderId;
}

async function ensureNodeDriveFolder(nodeItem) {
  if (!isTokenValid()) return null;
  const existing = state.drive.nodeFolderMap[nodeItem.id];
  if (existing) return existing;
  const proj = state.projects.find((p) => p.id === nodeItem.projectId);
  if (!proj) return null;
  const projectFolderId = await ensureProjectDriveFolder(proj);
  if (!projectFolderId) return null;
  const nodeFolderId = await ensureFolder(nodeItem.title, projectFolderId);
  state.drive.nodeFolderMap[nodeItem.id] = nodeFolderId;
  persist();
  return nodeFolderId;
}

/* --------- multipart upload ---------- */

function arrayBufferToBase64(buffer) {
  let binary = "";
  const bytes = new Uint8Array(buffer);
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

async function uploadFileToDrive(file, parentFolderId) {
  if (!parentFolderId) throw new Error("No parent folder");
  const buffer = await file.arrayBuffer();
  const base64 = arrayBufferToBase64(buffer);
  const boundary = "neillp-" + Math.random().toString(36).slice(2);
  const metadata = { name: file.name, parents: [parentFolderId] };
  const body =
    `--${boundary}\r\n` +
    `Content-Type: application/json; charset=UTF-8\r\n\r\n` +
    JSON.stringify(metadata) + "\r\n" +
    `--${boundary}\r\n` +
    `Content-Type: ${file.type || "application/octet-stream"}\r\n` +
    `Content-Transfer-Encoding: base64\r\n\r\n` +
    base64 + "\r\n" +
    `--${boundary}--`;
  const resp = await gapi.client.request({
    path: "/upload/drive/v3/files",
    method: "POST",
    params: { uploadType: "multipart", fields: "id,name,webViewLink,thumbnailLink,mimeType,iconLink" },
    headers: { "Content-Type": `multipart/related; boundary="${boundary}"` },
    body
  });
  return resp.result;
}

/* --------- audit logging via Sheets ---------- */

async function flushAuditQueue() {
  if (!isTokenValid() || !state.drive.auditSheetId) return;
  if (!state.auditQueue.length) return;
  const queue = state.auditQueue.slice();
  state.auditQueue = [];
  persist();
  try {
    await gapi.client.sheets.spreadsheets.values.append({
      spreadsheetId: state.drive.auditSheetId,
      range: `${AUDIT_TAB}!A:L`,
      valueInputOption: "USER_ENTERED",
      insertDataOption: "INSERT_ROWS",
      resource: { values: queue.map(auditRowToValues) }
    });
  } catch (e) {
    console.warn("Audit flush failed; re-queueing", e);
    state.auditQueue = [...queue, ...state.auditQueue];
    persist();
  }
}

function auditRowToValues(row) {
  return [
    row.timestamp || nowStamp(),
    row.user || "",
    row.action || "",
    row.projectId || "",
    row.projectName || "",
    row.folderName || "",
    row.nodeId || "",
    row.nodeTitle || "",
    row.category || "",
    row.status || "",
    row.details || "",
    row.device || detectDevice()
  ];
}

async function logAudit(action, opts = {}) {
  const proj = opts.projectId ? state.projects.find((p) => p.id === opts.projectId) : project();
  const folder = proj ? state.projectFolders.find((f) => f.id === proj.folderId) : null;
  const node = opts.nodeId ? state.nodes.find((n) => n.id === opts.nodeId) : null;
  const row = {
    timestamp: nowStamp(),
    user: state.googleAuth.profile?.email || "anonymous",
    action,
    projectId: proj?.id || "",
    projectName: proj?.name || "",
    folderName: folder?.name || (proj && !proj.folderId ? DRIVE_UNFILED_FOLDER : ""),
    nodeId: node?.id || opts.nodeId || "",
    nodeTitle: node?.title || opts.nodeTitle || "",
    category: node?.category || opts.category || "",
    status: opts.status ?? node?.status ?? "",
    details: opts.details || "",
    device: detectDevice()
  };
  if (!isTokenValid() || !state.drive.auditSheetId) {
    state.auditQueue.push(row);
    persist();
    return;
  }
  try {
    await gapi.client.sheets.spreadsheets.values.append({
      spreadsheetId: state.drive.auditSheetId,
      range: `${AUDIT_TAB}!A:L`,
      valueInputOption: "USER_ENTERED",
      insertDataOption: "INSERT_ROWS",
      resource: { values: [auditRowToValues(row)] }
    });
  } catch (e) {
    console.warn("Audit append failed; queueing", e);
    state.auditQueue.push(row);
    persist();
  }
}

/* --------- audit fetch / filter / download ---------- */

async function fetchAuditRows() {
  if (!requireAuth("view audit log")) return;
  if (!state.drive.auditSheetId) {
    toast("No audit sheet yet - sign in to bootstrap");
    return;
  }
  state.auditView.loading = true;
  render();
  try {
    const resp = await gapi.client.sheets.spreadsheets.values.get({
      spreadsheetId: state.drive.auditSheetId,
      range: `${AUDIT_TAB}!A2:L`
    });
    const rows = (resp.result.values || []).map((r) => ({
      timestamp: r[0] || "",
      user: r[1] || "",
      action: r[2] || "",
      projectId: r[3] || "",
      projectName: r[4] || "",
      folderName: r[5] || "",
      nodeId: r[6] || "",
      nodeTitle: r[7] || "",
      category: r[8] || "",
      status: r[9] || "",
      details: r[10] || "",
      device: r[11] || ""
    }));
    state.auditView.rows = rows.reverse(); // newest first
    state.auditView.loaded = true;
    state.auditView.loading = false;
    state.auditView.lastFetchedAt = nowStamp();
  } catch (e) {
    console.error("Audit fetch failed", e);
    toast("Audit fetch failed: " + describeError(e));
    state.auditView.loading = false;
  }
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
    if (q) {
      const hay = [r.timestamp, r.user, r.action, r.projectName, r.folderName, r.nodeId, r.nodeTitle, r.category, r.status, r.details, r.device].join(" ").toLowerCase();
      if (!hay.includes(q)) return false;
    }
    if (from || to) {
      const t = Date.parse(r.timestamp.replace(" ", "T"));
      if (!isNaN(t)) {
        if (from && t < from) return false;
        if (to && t > to) return false;
      }
    }
    return true;
  });
}

function downloadAuditCsv(rows) {
  const escape = (v) => {
    const s = String(v ?? "");
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [AUDIT_HEADER.join(",")];
  for (const r of rows) {
    lines.push([r.timestamp, r.user, r.action, r.projectId, r.projectName, r.folderName, r.nodeId, r.nodeTitle, r.category, r.status, r.details, r.device].map(escape).join(","));
  }
  const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `NeillPlanner-Audit-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
  toast(`CSV downloaded (${rows.length} rows)`);
}

/* ============================================================
 * RENDERING
 * ============================================================ */

function render() {
  const app = document.getElementById("app");
  if (!app) return;
  app.innerHTML = `
    <div class="app-shell">
      ${renderSidebar()}
      <main class="main">
        ${renderTopbar()}
        <div class="content">${renderView()}</div>
      </main>
      ${renderBottomNav()}
    </div>
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
      <div class="brand">
        <div class="brand-mark">NP</div>
        <div>
          <h1>NeillPlanner</h1>
          <p>Neill Data &amp; Security</p>
        </div>
      </div>
      <nav class="nav-list" aria-label="Primary">
        ${navItems().map((item) => `
          <button class="nav-button ${state.activeView === item.id ? "is-active" : ""}" data-view="${item.id}">
            ${icon(item.icon)}<span>${item.label}</span>
          </button>
        `).join("")}
      </nav>
      <div class="sidebar-section-title">Folders</div>
      <div class="folder-list">
        ${renderFolderButton({ id: "all", name: "All Projects", color: "#94a3b8" }, true)}
        ${state.projectFolders.map((folder) => renderFolderButton(folder)).join("")}
        ${renderFolderButton({ id: "unfiled", name: "Unfiled", color: "#64748b" })}
      </div>
      <div class="sidebar-section-title">Projects</div>
      <div class="project-list">
        ${state.projects.length === 0 ? '<div class="empty-state" style="font-size:12px;padding:14px">No projects yet</div>' : groupedProjectButtons()}
      </div>
    </aside>
  `;
}

function groupedProjectButtons() {
  const groups = [];
  state.projectFolders.forEach((folder) => {
    const projects = state.projects.filter((p) => p.folderId === folder.id);
    if (!projects.length) return;
    groups.push(`
      <div class="project-folder-group">
        <div class="folder-heading" style="--folder:${folder.color}">
          <span class="folder-dot"></span>
          <span>${escapeHtml(folder.name)}</span>
        </div>
        ${projects.map(renderProjectButton).join("")}
      </div>
    `);
  });
  const unfiled = state.projects.filter((p) => !p.folderId);
  if (unfiled.length) {
    groups.push(`
      <div class="project-folder-group">
        <div class="folder-heading" style="--folder:#64748b">
          <span class="folder-dot"></span>
          <span>${DRIVE_UNFILED_FOLDER}</span>
        </div>
        ${unfiled.map(renderProjectButton).join("")}
      </div>
    `);
  }
  return groups.join("");
}

function renderFolderButton(folder, isAll = false) {
  const id = isAll ? "all" : folder.id;
  const s = folderStats(id);
  return `
    <button class="folder-button ${state.selectedFolderId === id ? "is-active" : ""}" data-folder="${id}" style="--folder:${folder.color}">
      <span class="folder-dot"></span>
      <span>
        <strong>${escapeHtml(folder.name)}</strong>
        <span>${s.projects} builds / ${s.nodes} nodes</span>
      </span>
    </button>
  `;
}

function renderProjectButton(item) {
  const nodes = state.nodes.filter((n) => n.projectId === item.id);
  const s = stats(nodes);
  const folder = projectFolder(item);
  const color = folder?.color || "#64748b";
  return `
    <button class="project-button ${item.id === state.selectedProjectId ? "is-active" : ""}" data-project="${item.id}" style="--folder:${color}">
      <span class="status-dot" style="--status:${s.issue ? "var(--red)" : "var(--teal)"}"></span>
      <span>
        <strong>${escapeHtml(item.name)}</strong>
        <span class="project-meta">
          <span>${s.total} nodes</span>
          <span>${s.completePercent}% complete</span>
        </span>
      </span>
    </button>
  `;
}

function renderTopbar() {
  const proj = project();
  const folder = projectFolder(proj);
  const folderName = folder?.name || (proj && !proj.folderId ? DRIVE_UNFILED_FOLDER : "");
  const folderColor = folder?.color || "#64748b";
  const auth = state.googleAuth;
  return `
    <header class="topbar">
      <div class="topbar-title">
        <h2>${proj ? escapeHtml(proj.name) : "NeillPlanner"}</h2>
        <p>${proj ? `<span class="inline-folder" style="--folder:${folderColor}">${escapeHtml(folderName)}</span> / ${escapeHtml(proj.address || "No address")} / ${escapeHtml(proj.planName || "No plan")}` : "Sign in to start"}</p>
      </div>
      <div class="topbar-actions">
        ${auth.signedIn ? `<span class="sync-chip"><span class="sync-dot"></span>${auth.bootstrapping ? "Syncing" : "Drive ready"}</span>` : `<span class="sync-chip" style="opacity:.7">Offline</span>`}
        ${auth.signedIn ? `
          <button class="user-pill" data-action="go-settings" title="${escapeHtml(auth.profile?.email || "")}">
            <span class="avatar">${initials(auth.profile?.name || auth.profile?.email || "?")}</span>
            <span class="hide-mobile">${escapeHtml(auth.profile?.name || auth.profile?.email || "Signed in")}</span>
          </button>
        ` : `
          <button class="primary-button" data-action="google-sign-in" ${!hasGoogleClientId ? "disabled" : ""}>${icon("google")}Sign in</button>
        `}
      </div>
    </header>
  `;
}

function renderBottomNav() {
  return `
    <nav class="bottom-nav" aria-label="Primary">
      ${navItems().map((item) => `
        <button class="${state.activeView === item.id ? "is-active" : ""}" data-view="${item.id}">
          ${icon(item.icon)}<span>${item.label}</span>
        </button>
      `).join("")}
    </nav>
  `;
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

/* ----- projects view ----- */

function renderProjectsView() {
  const visible = folderProjects();
  const activeFolderName = state.selectedFolderId === "all"
    ? "All Projects"
    : state.selectedFolderId === "unfiled"
      ? DRIVE_UNFILED_FOLDER
      : (state.projectFolders.find((f) => f.id === state.selectedFolderId)?.name || "All Projects");
  return `
    <section class="view-panel">
      <div class="panel-header">
        <h3 class="section-title">Project Dashboard</h3>
        <div class="button-row">
          <button class="ghost-button" data-action="new-folder">${icon("folder")}Folder</button>
          <button class="primary-button" data-action="new-project">${icon("plus")}New project</button>
        </div>
      </div>
      <div class="folder-strip">
        ${renderFolderButton({ id: "all", name: "All Projects", color: "#94a3b8" }, true)}
        ${state.projectFolders.map((folder) => renderFolderButton(folder)).join("")}
        ${renderFolderButton({ id: "unfiled", name: "Unfiled", color: "#64748b" })}
      </div>
      ${state.projectFolders.length ? `
        <div class="folder-manager">
          <div>
            <h3 class="section-title">Folder Colours</h3>
            <p>Folders are for towers, apartment blocks, stages, or buildings inside one large job.</p>
          </div>
          <div class="folder-color-grid">
            ${state.projectFolders.map((folder) => renderFolderColourRow(folder)).join("")}
          </div>
        </div>
      ` : ""}
      <div class="projects-grid">
        ${visible.length ? visible.map(renderProjectCard).join("") : `
          <div class="empty-state" style="grid-column:1/-1;padding:36px;text-align:center">
            <p style="margin-bottom:12px">No projects in <strong>${escapeHtml(activeFolderName)}</strong>.</p>
            <button class="primary-button" data-action="new-project">${icon("plus")}Create your first project</button>
          </div>
        `}
      </div>
    </section>
  `;
}

function renderProjectCard(item) {
  const nodes = state.nodes.filter((n) => n.projectId === item.id);
  const s = stats(nodes);
  const folder = projectFolder(item);
  const folderName = folder?.name || DRIVE_UNFILED_FOLDER;
  const folderColor = folder?.color || "#64748b";
  return `
    <article class="project-card" style="--folder:${folderColor}">
      <div class="project-card-map"></div>
      <div class="project-card-body">
        <div class="compact-row" style="margin-bottom:10px">
          <span class="mini-chip folder-label" style="--folder:${folderColor}">${icon("folder")}${escapeHtml(folderName)}</span>
        </div>
        <h3>${escapeHtml(item.name)}</h3>
        <p>${escapeHtml(item.description || "No description")}</p>
        <div class="compact-row" style="margin-top:12px">
          ${statusPill(`${s.completePercent}% complete`)}
          <span class="mini-chip">${s.total} nodes</span>
          <span class="mini-chip">${s.issue} issues</span>
        </div>
        <div class="project-card-controls">
          <label>
            <span>Folder</span>
            <select data-project-folder="${item.id}" aria-label="Folder for ${escapeHtml(item.name)}">
              <option value="">${DRIVE_UNFILED_FOLDER}</option>
              ${state.projectFolders.map((f) => `<option value="${f.id}" ${f.id === item.folderId ? "selected" : ""}>${escapeHtml(f.name)}</option>`).join("")}
            </select>
          </label>
        </div>
        <div class="button-row" style="margin-top:14px">
          <button class="primary-button" data-project-open="${item.id}">${icon("map")}Open</button>
          <button class="ghost-button" data-project-delete="${item.id}">${icon("trash")}Delete</button>
        </div>
      </div>
    </article>
  `;
}

function renderFolderColourRow(folder) {
  const s = folderStats(folder.id);
  return `
    <div class="folder-colour-row" style="--folder:${folder.color}">
      <span class="folder-dot"></span>
      <span>
        <strong>${escapeHtml(folder.name)}</strong>
        <span>${s.projects} builds / ${s.nodes} nodes</span>
      </span>
      <input type="color" value="${escapeHtml(folder.color)}" data-folder-color="${folder.id}" aria-label="Colour for ${escapeHtml(folder.name)}" />
      <button class="icon-button" data-folder-rename="${folder.id}" aria-label="Rename folder">${icon("edit")}</button>
      <button class="icon-button" data-folder-delete="${folder.id}" aria-label="Delete folder">${icon("trash")}</button>
    </div>
  `;
}

/* ----- map view ----- */

function renderMapView() {
  const proj = project();
  if (!proj) {
    return `
      <section class="view-panel">
        <div class="empty-state" style="padding:48px;text-align:center">
          <h3 class="section-title">No project selected</h3>
          <p style="margin:8px 0 18px">Create a project first to start dropping nodes on a plan.</p>
          <button class="primary-button" data-action="new-project">${icon("plus")}Create a project</button>
        </div>
      </section>
    `;
  }
  const planDataUrl = state.floorPlans[proj.id];
  const nodes = projectNodes();
  const matched = nodes.filter(matchesNode);
  return `
    <section class="map-layout">
      <div class="map-panel">
        <div class="map-toolbar">
          <div class="search-wrap">
            ${icon("search")}
            <input data-filter="query" value="${escapeHtml(state.filters.query)}" placeholder="Search nodes, tags, users" aria-label="Search nodes" />
          </div>
          <div class="filter-row">
            ${renderSelect("status", ["All", ...Object.keys(statusMeta)], state.filters.status)}
            ${renderSelect("category", ["All", ...(proj.categories || [])], state.filters.category)}
            ${renderSelect("assignee", ["All", ...teamNames()], state.filters.assignee)}
            ${renderSelect("layer", ["All", ...(proj.categories || [])], state.filters.layer)}
          </div>
          <div class="button-row">
            <button class="ghost-button" data-action="upload-plan">${icon("upload")}<span>Plan</span></button>
            <button class="primary-button" data-action="create-node" ${!planDataUrl ? "disabled" : ""}>${icon("plus")}<span>Node</span></button>
          </div>
        </div>
        <div class="canvas-shell">
          <div class="canvas-viewport" id="canvasViewport">
            <div class="plan-stage" id="planStage">
              ${planDataUrl
                ? `<img class="floor-plan" src="${escapeHtml(planDataUrl)}" alt="Floor plan" draggable="false" />`
                : `<div class="floor-plan" style="display:flex;align-items:center;justify-content:center;background:rgba(255,255,255,.03);min-width:600px;min-height:400px;border:1px dashed rgba(255,255,255,.15);border-radius:12px;color:rgba(255,255,255,.6);text-align:center;padding:40px"><div><p style="margin-bottom:12px">No floor plan uploaded for this project.</p><button class="primary-button" data-action="upload-plan">${icon("upload")}Upload plan image</button></div></div>`}
              <div class="node-layer">
                ${nodes.map(renderMarker).join("")}
              </div>
            </div>
          </div>
          <div class="canvas-tools" aria-label="Canvas tools">
            <button class="icon-button" data-action="zoom-in" title="Zoom in" aria-label="Zoom in">${icon("zoomIn")}</button>
            <button class="icon-button" data-action="zoom-out" title="Zoom out" aria-label="Zoom out">${icon("zoomOut")}</button>
            <button class="icon-button" data-action="reset-view" title="Recenter" aria-label="Recenter">${icon("target")}</button>
          </div>
          <div class="scale-readout"><span class="scale-bar"></span><span>${Math.round(state.canvas.zoom * 100)}%</span></div>
        </div>
        <div class="legend">
          ${Object.keys(statusMeta).map((name) => `<span class="legend-item"><span class="status-dot" style="${statusStyle(name)}"></span>${name}</span>`).join("")}
        </div>
      </div>
      <aside class="summary-panel">
        <div class="summary-grid">
          <div class="metric"><span>Total nodes</span><strong>${nodes.length}</strong></div>
          <div class="metric"><span>Shown</span><strong>${matched.length}</strong></div>
          <div class="metric"><span>Complete</span><strong>${stats(nodes).completePercent}%</strong></div>
          <div class="metric"><span>Issues</span><strong>${stats(nodes).issue}</strong></div>
        </div>
        <h3 class="section-title">Nodes</h3>
        <div class="node-list">
          ${matched.length ? matched.map(renderNodeSummary).join("") : `<div class="empty-state">${nodes.length ? "No matching nodes" : "No nodes yet. Click the plan to add."}</div>`}
        </div>
      </aside>
    </section>
  `;
}

function renderSelect(name, options, value) {
  return `
    <select data-filter="${name}" aria-label="${name}">
      ${options.map((o) => `<option value="${escapeHtml(o)}" ${o === value ? "selected" : ""}>${escapeHtml(o)}</option>`).join("")}
    </select>
  `;
}

function renderMarker(node) {
  const isSelected = node.id === state.selectedNodeId;
  const isDim = !matchesNode(node);
  return `
    <button class="node-marker ${isSelected ? "is-selected" : ""} ${isDim ? "is-dim" : ""}"
      style="--x:${node.position.x};--y:${node.position.y};${statusStyle(node.status)}"
      data-node="${node.id}"
      aria-label="${escapeHtml(node.title)}">
      ${node.comments?.length ? `<span class="comment-count">${node.comments.length}</span>` : ""}
    </button>
  `;
}

function renderNodeSummary(node) {
  return `
    <button class="node-summary ${node.id === state.selectedNodeId ? "is-selected" : ""}" data-node="${node.id}">
      <span class="status-dot" style="${statusStyle(node.status)}"></span>
      <span>
        <strong>${escapeHtml(node.title)}</strong>
        <span>${escapeHtml(node.category)} / ${escapeHtml(node.assignedTo || "Unassigned")}</span>
      </span>
    </button>
  `;
}

/* ----- progress view ----- */

function renderProgressView() {
  const proj = project();
  if (!proj) return `<section class="view-panel"><div class="empty-state" style="padding:36px">No project selected.</div></section>`;
  const nodes = projectNodes();
  const projectStats = stats(nodes);
  const total = Math.max(projectStats.total, 1);
  const completeDeg = (projectStats.complete / total) * 100;
  const progressDeg = completeDeg + (projectStats.progress / total) * 100;
  const issueDeg = progressDeg + (projectStats.issue / total) * 100;
  const categories = (proj.categories || []).map((category) => {
    const count = nodes.filter((n) => n.category === category).length;
    return { category, count, value: Math.round((count / total) * 100) };
  });
  return `
    <section class="view-panel">
      <div class="panel-header">
        <h3 class="section-title">Progress Dashboard</h3>
        <button class="ghost-button" data-action="print-report">${icon("printer")}Export</button>
      </div>
      <div class="metrics-grid">
        <div class="metric"><span>Total nodes</span><strong>${projectStats.total}</strong></div>
        <div class="metric"><span>Complete</span><strong>${projectStats.completePercent}%</strong></div>
        <div class="metric"><span>In progress</span><strong>${projectStats.progress}</strong></div>
        <div class="metric"><span>Issues</span><strong>${projectStats.issue}</strong></div>
      </div>
    </section>
    <section class="view-panel">
      <div class="charts-grid">
        <div>
          <h3 class="section-title">Status</h3>
          <div class="donut-wrap">
            <div class="donut" style="--complete:${completeDeg}%;--progress:${progressDeg}%;--issue:${issueDeg}%">
              <div class="donut-label"><strong>${projectStats.completePercent}%</strong><span>Complete</span></div>
            </div>
          </div>
        </div>
        <div>
          <h3 class="section-title">Category Load</h3>
          <div class="bar-list">
            ${categories.length ? categories.map((item) => `
              <div class="bar-row">
                <span>${escapeHtml(item.category)}</span>
                <span class="bar-track"><span class="bar-fill" style="--value:${item.value}%"></span></span>
                <span>${item.count}</span>
              </div>
            `).join("") : `<div class="empty-state">No categories yet</div>`}
          </div>
        </div>
      </div>
    </section>
  `;
}

/* ----- audit view ----- */

function renderAuditView() {
  const av = state.auditView;
  const filtered = av.loaded ? filteredAuditRows() : [];
  const distinctUsers = [...new Set(av.rows.map((r) => r.user).filter(Boolean))].sort();
  const distinctActions = [...new Set(av.rows.map((r) => r.action).filter(Boolean))].sort();
  const distinctProjects = [...new Set(av.rows.map((r) => ({ id: r.projectId, name: r.projectName })).filter((p) => p.id))]
    .reduce((acc, p) => { if (!acc.some((x) => x.id === p.id)) acc.push(p); return acc; }, []);
  return `
    <section class="view-panel">
      <div class="panel-header">
        <h3 class="section-title">Audit Log</h3>
        <div class="button-row">
          <span class="sync-chip" style="opacity:.8">${av.loaded ? `${av.rows.length} rows / fetched ${escapeHtml(av.lastFetchedAt || "")}` : "Not loaded"}</span>
          <button class="ghost-button" data-action="audit-load">${icon("refresh")}${av.loading ? "Loading..." : av.loaded ? "Refresh" : "Load from Sheet"}</button>
          <button class="primary-button" data-action="audit-download" ${!av.loaded || filtered.length === 0 ? "disabled" : ""}>${icon("download")}Download CSV (${filtered.length})</button>
        </div>
      </div>
      ${av.loaded ? `
        <div class="audit-filters">
          <label><span>From</span><input type="date" data-audit-filter="from" value="${escapeHtml(av.filters.from)}" /></label>
          <label><span>To</span><input type="date" data-audit-filter="to" value="${escapeHtml(av.filters.to)}" /></label>
          <label><span>User</span>
            <select data-audit-filter="user">
              <option value="All">All</option>
              ${distinctUsers.map((u) => `<option value="${escapeHtml(u)}" ${av.filters.user === u ? "selected" : ""}>${escapeHtml(u)}</option>`).join("")}
            </select>
          </label>
          <label><span>Action</span>
            <select data-audit-filter="action">
              <option value="All">All</option>
              ${distinctActions.map((a) => `<option value="${escapeHtml(a)}" ${av.filters.action === a ? "selected" : ""}>${escapeHtml(a)}</option>`).join("")}
            </select>
          </label>
          <label><span>Project</span>
            <select data-audit-filter="projectId">
              <option value="All">All</option>
              ${distinctProjects.map((p) => `<option value="${escapeHtml(p.id)}" ${av.filters.projectId === p.id ? "selected" : ""}>${escapeHtml(p.name || p.id)}</option>`).join("")}
            </select>
          </label>
          <label><span>Node title</span><input data-audit-filter="nodeQuery" value="${escapeHtml(av.filters.nodeQuery)}" placeholder="contains..." /></label>
          <label><span>Details</span><input data-audit-filter="detailsQuery" value="${escapeHtml(av.filters.detailsQuery)}" placeholder="contains..." /></label>
          <label><span>Anywhere</span><input data-audit-filter="query" value="${escapeHtml(av.filters.query)}" placeholder="free-text" /></label>
          <button class="ghost-button" data-action="audit-clear-filters">Clear</button>
        </div>
        <div class="audit-table-wrap">
          <table class="audit-table">
            <thead>
              <tr>
                <th>Timestamp</th>
                <th>User</th>
                <th>Action</th>
                <th>Project</th>
                <th>Folder</th>
                <th>Node ID</th>
                <th>Node Title</th>
                <th>Category</th>
                <th>Status</th>
                <th>Details</th>
                <th>Device</th>
              </tr>
            </thead>
            <tbody>
              ${filtered.length ? filtered.map((r) => `
                <tr>
                  <td>${escapeHtml(r.timestamp)}</td>
                  <td>${escapeHtml(r.user)}</td>
                  <td>${escapeHtml(r.action)}</td>
                  <td>${escapeHtml(r.projectName || r.projectId)}</td>
                  <td>${escapeHtml(r.folderName)}</td>
                  <td>${escapeHtml(r.nodeId)}</td>
                  <td>${escapeHtml(r.nodeTitle)}</td>
                  <td>${escapeHtml(r.category)}</td>
                  <td>${escapeHtml(r.status)}</td>
                  <td>${escapeHtml(r.details)}</td>
                  <td>${escapeHtml(r.device)}</td>
                </tr>
              `).join("") : `<tr><td colspan="11" style="text-align:center;padding:24px;color:rgba(255,255,255,.6)">No rows match your filters</td></tr>`}
            </tbody>
          </table>
        </div>
      ` : `
        <div class="empty-state" style="padding:36px;text-align:center">
          <p style="margin-bottom:12px">Audit log is not loaded.</p>
          <p style="margin-bottom:18px;color:rgba(255,255,255,.55)">The log lives in your Google Sheet under <code>${DRIVE_ROOT_NAME}/${DRIVE_ADMIN_FOLDER}/${AUDIT_SHEET_NAME}</code>. It is fetched on demand so it does not load every time you open the app.</p>
          <button class="primary-button" data-action="audit-load" ${!state.googleAuth.signedIn ? "disabled" : ""}>${icon("refresh")}Load from Sheet</button>
          ${!state.googleAuth.signedIn ? `<p style="margin-top:14px;color:rgba(255,255,255,.55)">Sign in to Google to enable.</p>` : ""}
        </div>
      `}
      ${state.auditQueue.length ? `<p style="margin-top:12px;color:#f59e0b">${state.auditQueue.length} audit row(s) queued locally and will sync next time you sign in.</p>` : ""}
    </section>
  `;
}

/* ----- settings view ----- */

function renderSettingsView() {
  const auth = state.googleAuth;
  const proj = project();
  const driveOk = Boolean(state.drive.rootFolderId);
  const sheetOk = Boolean(state.drive.auditSheetId);
  return `
    <section class="settings-grid">
      <div class="view-panel">
        <div class="panel-header">
          <h3 class="section-title">Account</h3>
          <span class="sync-chip"><span class="sync-dot"></span>${auth.signedIn ? "Signed in" : "Signed out"}</span>
        </div>
        ${auth.signedIn ? `
          <div class="integration-list">
            <div class="integration-row"><span><strong>Email</strong><span>${escapeHtml(auth.profile?.email || "(unknown)")}</span></span>${statusPill("Complete")}</div>
            <div class="integration-row"><span><strong>Name</strong><span>${escapeHtml(auth.profile?.name || "(unknown)")}</span></span>${statusPill("Complete")}</div>
            <div class="integration-row"><span><strong>Token expires</strong><span>${auth.expiresAt ? new Date(auth.expiresAt).toLocaleTimeString() : "-"}</span></span>${statusPill(isTokenValid() ? "Complete" : "Issue")}</div>
          </div>
          <div class="button-row" style="margin-top:14px">
            <button class="ghost-button" data-action="google-sign-out">${icon("signOut")}Sign out</button>
            <button class="ghost-button" data-action="google-bootstrap">${icon("refresh")}Re-sync Drive</button>
          </div>
        ` : `
          <div class="empty-state" style="padding:18px">
            <p style="margin-bottom:12px">Sign in with Google to create your Drive folder structure, upload photos, and write the audit log.</p>
            <button class="primary-button" data-action="google-sign-in" ${!hasGoogleClientId || !auth.librariesReady ? "disabled" : ""}>${icon("google")}Sign in with Google</button>
            ${auth.lastError ? `<p style="margin-top:12px;color:#ef4444">${escapeHtml(auth.lastError)}</p>` : ""}
            ${!auth.librariesReady ? `<p style="margin-top:12px;color:rgba(255,255,255,.55)">Loading Google libraries...</p>` : ""}
          </div>
        `}
      </div>

      <div class="view-panel">
        <div class="panel-header">
          <h3 class="section-title">Google Services</h3>
          <span class="sync-chip"><span class="sync-dot"></span>${hasGoogleApiKey && hasGoogleClientId ? "Configured" : "Config needed"}</span>
        </div>
        <div class="integration-list">
          <div class="integration-row"><span><strong>Browser API Key</strong><span>${hasGoogleApiKey ? "Loaded from index.html (inline config)" : "Missing"}</span></span>${statusPill(hasGoogleApiKey ? "Complete" : "Not Started")}</div>
          <div class="integration-row"><span><strong>OAuth Client ID</strong><span>${hasGoogleClientId ? "Loaded from index.html (inline config)" : "Missing"}</span></span>${statusPill(hasGoogleClientId ? "Complete" : "Not Started")}</div>
          <div class="integration-row"><span><strong>OAuth Scopes</strong><span>${escapeHtml(googleScopes)}</span></span>${statusPill(auth.signedIn ? "Complete" : "In Progress")}</div>
          <div class="integration-row"><span><strong>Drive Root</strong><span>${driveOk ? `/${DRIVE_ROOT_NAME}/ (id: ${escapeHtml(state.drive.rootFolderId)})` : `Will be created at /${DRIVE_ROOT_NAME}/ on sign-in`}</span></span>${statusPill(driveOk ? "Complete" : "Not Started")}</div>
          <div class="integration-row"><span><strong>Admin Folder</strong><span>${state.drive.adminFolderId ? `/${DRIVE_ROOT_NAME}/${DRIVE_ADMIN_FOLDER}/` : "Pending sign-in"}</span></span>${statusPill(state.drive.adminFolderId ? "Complete" : "Not Started")}</div>
          <div class="integration-row"><span><strong>Projects Folder</strong><span>${state.drive.projectsFolderId ? `/${DRIVE_ROOT_NAME}/${DRIVE_PROJECTS_FOLDER}/` : "Pending sign-in"}</span></span>${statusPill(state.drive.projectsFolderId ? "Complete" : "Not Started")}</div>
          <div class="integration-row"><span><strong>Unfiled Folder</strong><span>${state.drive.unfiledFolderId ? `/${DRIVE_ROOT_NAME}/${DRIVE_UNFILED_FOLDER}/` : "Pending sign-in"}</span></span>${statusPill(state.drive.unfiledFolderId ? "Complete" : "Not Started")}</div>
          <div class="integration-row"><span><strong>Audit Sheet</strong><span>${sheetOk ? AUDIT_SHEET_NAME : "Will be created on sign-in"}</span></span>${statusPill(sheetOk ? "Complete" : "Not Started")}</div>
        </div>
      </div>

      ${proj ? `
        <div class="view-panel">
          <div class="panel-header">
            <h3 class="section-title">Current Project Folder</h3>
            <span class="sync-chip">${icon("folder")}${escapeHtml(proj.name)}</span>
          </div>
          <div class="integration-list">
            <div class="integration-row"><span><strong>Drive path</strong><span>/${DRIVE_ROOT_NAME}/${DRIVE_PROJECTS_FOLDER}/${escapeHtml(projectFolder(proj)?.name || DRIVE_UNFILED_FOLDER)}/${escapeHtml(proj.name)}/</span></span>${statusPill(state.drive.projectFolderMap[proj.id] ? "Complete" : "Not Started")}</div>
            <div class="integration-row"><span><strong>Categories</strong><span>${(proj.categories || []).join(", ") || "None"}</span></span>${statusPill("Complete")}</div>
            <div class="integration-row"><span><strong>Team members</strong><span>${(proj.team || []).length}</span></span>${statusPill("Complete")}</div>
          </div>
          <div class="button-row" style="margin-top:14px">
            <button class="ghost-button" data-action="edit-project">${icon("edit")}Edit project</button>
            <button class="ghost-button" data-action="add-category">${icon("plus")}Add category</button>
            <button class="ghost-button" data-action="invite-user">${icon("plus")}Add team member</button>
          </div>
        </div>
      ` : ""}

      <div class="view-panel">
        <div class="panel-header">
          <h3 class="section-title">About</h3>
          <span class="sync-chip">v${APP_VERSION}</span>
        </div>
        <div class="integration-list">
          <div class="integration-row"><span><strong>Storage</strong><span>Local browser storage + Google Drive + Google Sheets</span></span>${statusPill("Complete")}</div>
          <div class="integration-row"><span><strong>Audit log</strong><span>Written to ${AUDIT_SHEET_NAME} in Admin Files. Fetched on demand.</span></span>${statusPill(sheetOk ? "Complete" : "In Progress")}</div>
          <div class="integration-row"><span><strong>Photo scope</strong><span>drive.file (the app can only see files it created)</span></span>${statusPill("Complete")}</div>
        </div>
        <div class="button-row" style="margin-top:14px">
          <button class="ghost-button" data-action="wipe-local">${icon("trash")}Wipe local data</button>
        </div>
      </div>
    </section>
  `;
}

/* ----- drawer / modals / lightbox ----- */

function renderDrawer(node) {
  const checklistDone = node.checklist.filter((c) => c.done).length;
  return `
    <div class="drawer-backdrop" data-action="close-drawer"></div>
    <aside class="drawer" role="dialog" aria-label="${escapeHtml(node.title)}">
      <div class="drawer-header">
        <div class="drawer-title">
          <h3>${escapeHtml(node.title)}</h3>
          <p>${escapeHtml(node.category)} / ${escapeHtml(node.assignedTo || "Unassigned")}</p>
        </div>
        <button class="icon-button" data-action="close-drawer" aria-label="Close">${icon("close")}</button>
      </div>
      <div class="drawer-body">
        <div class="drawer-actions">
          ${statusPill(node.status)}
          <button class="icon-button" data-action="share-node" title="Share" aria-label="Share">${icon("share")}</button>
          <button class="icon-button" data-action="edit-node" title="Edit" aria-label="Edit">${icon("edit")}</button>
        </div>
        <div class="quick-edit">
          ${renderSelect("quick-status", Object.keys(statusMeta), node.status).replace('data-filter="quick-status"', 'data-quick-status="true"')}
          <label class="ghost-button" style="cursor:pointer">${icon("upload")}<span>Upload photos</span><input type="file" accept="image/*" multiple data-photo-upload="${node.id}" style="display:none" /></label>
        </div>
        <div class="info-grid">
          <div class="info-box"><span>Checklist</span><strong>${checklistDone}/${node.checklist.length}</strong></div>
          <div class="info-box"><span>Images</span><strong>${node.imageRefs.length}</strong></div>
          <div class="info-box"><span>Tags</span><strong>${(node.tags || []).map(escapeHtml).join(", ") || "-"}</strong></div>
          <div class="info-box"><span>Updated</span><strong>${escapeHtml(node.updatedAt)}</strong></div>
        </div>
        <div>
          <h3 class="section-title">Notes</h3>
          <textarea data-notes="${node.id}" aria-label="Node notes">${escapeHtml(node.description || "")}</textarea>
        </div>
        <div>
          <h3 class="section-title">Gallery</h3>
          ${node.imageRefs.length ? `
            <div class="gallery-grid">
              ${node.imageRefs.map((image, index) => `
                <button class="image-tile" style="--thumb:linear-gradient(135deg,#1e293b,#334155)" data-lightbox="${index}" aria-label="${escapeHtml(image.name)}">
                  ${image.thumbnailLink ? `<img src="${escapeHtml(image.thumbnailLink)}" alt="${escapeHtml(image.name)}" loading="lazy" referrerpolicy="no-referrer" style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover" />` : ""}
                  <span>${escapeHtml(image.name)}</span>
                </button>
              `).join("")}
            </div>
          ` : `<div class="empty-state">No images. Use "Upload photos" above.</div>`}
        </div>
        <div>
          <h3 class="section-title">Comments</h3>
          <div class="comments-list">
            ${node.comments.length ? node.comments.map((comment) => `
              <article class="comment">
                <span class="comment-meta">${escapeHtml(comment.author)} / ${escapeHtml(comment.time)}</span>
                <p>${escapeHtml(comment.text)}</p>
              </article>
            `).join("") : `<div class="empty-state">No comments</div>`}
          </div>
          <div class="comment-input" style="margin-top:10px">
            <input data-comment-input="${node.id}" placeholder="@mention or comment" aria-label="Add comment" />
            <button class="icon-button" data-action="send-comment" aria-label="Send comment">${icon("arrowRight")}</button>
          </div>
        </div>
      </div>
    </aside>
  `;
}

function renderModal() {
  const m = state.modal;
  if (m.mode === "new-folder") return renderFolderModal();
  if (m.mode === "rename-folder") return renderFolderModal(m.folderId);
  if (m.mode === "new-project" || m.mode === "edit-project") return renderProjectModal(m.mode === "edit-project");
  if (m.mode === "add-category") return renderCategoryModal();
  if (m.mode === "invite-user") return renderInviteModal();
  if (m.mode === "create" || m.mode === "edit") return renderNodeModal();
  return "";
}

function renderFolderModal(folderId = null) {
  const existing = folderId ? state.projectFolders.find((f) => f.id === folderId) : null;
  const defaultColor = DEFAULT_FOLDER_COLORS[state.projectFolders.length % DEFAULT_FOLDER_COLORS.length];
  return `
    <div class="modal-backdrop" data-action="close-modal"></div>
    <form class="modal" id="folderForm" role="dialog" aria-label="${existing ? "Rename folder" : "New folder"}">
      <div class="modal-header"><div><h3>${existing ? "Edit folder" : "New folder"}</h3><p>Folder for grouping projects (e.g. "Tower A", "Apartments")</p></div><button type="button" class="icon-button" data-action="close-modal">${icon("close")}</button></div>
      <div class="modal-body">
        <div class="form-grid">
          <div class="field full"><label for="folderName">Name</label><input id="folderName" name="name" required value="${escapeHtml(existing?.name || "")}" placeholder="Apartments" /></div>
          <div class="field"><label for="folderColor">Colour</label><input id="folderColor" name="color" type="color" value="${escapeHtml(existing?.color || defaultColor)}" /></div>
        </div>
        ${existing ? `<input type="hidden" name="folderId" value="${escapeHtml(existing.id)}" />` : ""}
      </div>
      <div class="modal-actions">
        <button type="button" class="ghost-button" data-action="close-modal">Cancel</button>
        <button class="primary-button" type="submit">${icon("check")}Save</button>
      </div>
    </form>
  `;
}

function renderProjectModal(isEdit) {
  const existing = isEdit ? project() : null;
  return `
    <div class="modal-backdrop" data-action="close-modal"></div>
    <form class="modal" id="projectForm" role="dialog" aria-label="${isEdit ? "Edit project" : "New project"}">
      <div class="modal-header"><div><h3>${isEdit ? "Edit project" : "New project"}</h3><p>Drive folder will be created at /${DRIVE_ROOT_NAME}/${DRIVE_PROJECTS_FOLDER}/&lt;folder&gt;/&lt;project&gt;/</p></div><button type="button" class="icon-button" data-action="close-modal">${icon("close")}</button></div>
      <div class="modal-body">
        <div class="form-grid">
          <div class="field full"><label for="projectName">Name</label><input id="projectName" name="name" required value="${escapeHtml(existing?.name || "")}" placeholder="Tower A Stage 1" /></div>
          <div class="field"><label for="projectFolder">Folder</label>
            <select id="projectFolder" name="folderId">
              <option value="">${DRIVE_UNFILED_FOLDER}</option>
              ${state.projectFolders.map((f) => `<option value="${f.id}" ${f.id === existing?.folderId ? "selected" : ""}>${escapeHtml(f.name)}</option>`).join("")}
            </select>
          </div>
          <div class="field"><label for="projectPlan">Plan name</label><input id="projectPlan" name="planName" value="${escapeHtml(existing?.planName || "Ground floor")}" placeholder="Ground floor" /></div>
          <div class="field full"><label for="projectAddress">Address</label><input id="projectAddress" name="address" value="${escapeHtml(existing?.address || "")}" placeholder="42 Bourke Street, Sydney" /></div>
          <div class="field full"><label for="projectDescription">Description</label><textarea id="projectDescription" name="description">${escapeHtml(existing?.description || "")}</textarea></div>
          <div class="field full"><label for="projectCategories">Categories (comma separated)</label><input id="projectCategories" name="categories" value="${escapeHtml((existing?.categories || DEFAULT_CATEGORIES).join(", "))}" placeholder="CCTV, Data Point, Access" /></div>
        </div>
      </div>
      <div class="modal-actions">
        ${isEdit ? `<button type="button" class="danger-button" data-action="delete-project">${icon("trash")}Delete project</button>` : ""}
        <button type="button" class="ghost-button" data-action="close-modal">Cancel</button>
        <button class="primary-button" type="submit">${icon("check")}Save</button>
      </div>
    </form>
  `;
}

function renderCategoryModal() {
  return `
    <div class="modal-backdrop" data-action="close-modal"></div>
    <form class="modal" id="categoryForm" role="dialog" aria-label="Add category">
      <div class="modal-header"><div><h3>Add category</h3><p>Filter / layer label, e.g. "Fire Safety"</p></div><button type="button" class="icon-button" data-action="close-modal">${icon("close")}</button></div>
      <div class="modal-body">
        <div class="form-grid"><div class="field full"><label for="categoryName">Name</label><input id="categoryName" name="name" required placeholder="Fire Safety" /></div></div>
      </div>
      <div class="modal-actions">
        <button type="button" class="ghost-button" data-action="close-modal">Cancel</button>
        <button class="primary-button" type="submit">${icon("check")}Add</button>
      </div>
    </form>
  `;
}

function renderInviteModal() {
  return `
    <div class="modal-backdrop" data-action="close-modal"></div>
    <form class="modal" id="inviteForm" role="dialog" aria-label="Add team member">
      <div class="modal-header"><div><h3>Add team member</h3><p>Used for the "Assigned to" dropdown on nodes</p></div><button type="button" class="icon-button" data-action="close-modal">${icon("close")}</button></div>
      <div class="modal-body">
        <div class="form-grid">
          <div class="field"><label for="memberName">Name</label><input id="memberName" name="name" required placeholder="Sam Carter" /></div>
          <div class="field"><label for="memberEmail">Email</label><input id="memberEmail" name="email" type="email" placeholder="sam@neilldata.com.au" /></div>
          <div class="field"><label for="memberRole">Role</label>
            <select id="memberRole" name="role">
              <option value="admin">admin</option>
              <option value="editor" selected>editor</option>
              <option value="viewer">viewer</option>
            </select>
          </div>
        </div>
      </div>
      <div class="modal-actions">
        <button type="button" class="ghost-button" data-action="close-modal">Cancel</button>
        <button class="primary-button" type="submit">${icon("check")}Add</button>
      </div>
    </form>
  `;
}

function renderNodeModal() {
  const proj = project();
  const isEdit = state.modal.mode === "edit";
  const node = isEdit ? selectedNode() : null;
  if (!proj) return "";
  const categories = proj.categories || DEFAULT_CATEGORIES;
  const assignees = teamNames();
  return `
    <div class="modal-backdrop" data-action="close-modal"></div>
    <form class="modal" id="nodeForm" role="dialog" aria-label="${isEdit ? "Edit node" : "Create node"}">
      <div class="modal-header">
        <div><h3>${isEdit ? "Edit Node" : "Create Node"}</h3><p>${escapeHtml(proj.planName || "Plan")}</p></div>
        <button type="button" class="icon-button" data-action="close-modal">${icon("close")}</button>
      </div>
      <div class="modal-body">
        <div class="form-grid">
          <div class="field full"><label for="nodeTitle">Title</label><input id="nodeTitle" name="title" required value="${escapeHtml(node?.title || "")}" placeholder="Server Room Door" /></div>
          <div class="field"><label for="nodeCategory">Category</label>
            <select id="nodeCategory" name="category">
              ${categories.map((c) => `<option value="${escapeHtml(c)}" ${node?.category === c ? "selected" : ""}>${escapeHtml(c)}</option>`).join("")}
            </select>
          </div>
          <div class="field"><label for="nodeStatus">Status</label>
            <select id="nodeStatus" name="status">
              ${Object.keys(statusMeta).map((s) => `<option value="${escapeHtml(s)}" ${node?.status === s ? "selected" : (!node && s === "Not Started" ? "selected" : "")}>${escapeHtml(s)}</option>`).join("")}
            </select>
          </div>
          <div class="field"><label for="nodeAssigned">Assigned to</label>
            <select id="nodeAssigned" name="assignedTo">
              <option value="">Unassigned</option>
              ${assignees.map((u) => `<option value="${escapeHtml(u)}" ${node?.assignedTo === u ? "selected" : ""}>${escapeHtml(u)}</option>`).join("")}
            </select>
          </div>
          <div class="field"><label for="nodeTags">Tags</label><input id="nodeTags" name="tags" value="${escapeHtml(node?.tags?.join(", ") || "")}" placeholder="cctv, entry" /></div>
          <div class="field full"><label for="nodeDescription">Notes</label><textarea id="nodeDescription" name="description">${escapeHtml(node?.description || "")}</textarea></div>
          <div class="field full"><label for="nodeImages">Initial photos (optional)</label>
            <input id="nodeImages" name="images" type="file" accept="image/*" multiple />
            <span class="form-note">Photos upload to /${DRIVE_ROOT_NAME}/${DRIVE_PROJECTS_FOLDER}/.../${escapeHtml(proj.name)}/&lt;node title&gt;/</span>
          </div>
        </div>
      </div>
      <div class="modal-actions">
        ${isEdit ? `<button type="button" class="danger-button" data-action="delete-node">${icon("trash")}Delete</button>` : ""}
        <button type="button" class="ghost-button" data-action="close-modal">Cancel</button>
        <button class="primary-button" type="submit">${icon("check")}Save</button>
      </div>
    </form>
  `;
}

function renderLightbox() {
  const node = selectedNode();
  if (!node) return "";
  const image = node.imageRefs[state.lightbox.index];
  if (!image) return "";
  return `
    <div class="lightbox-backdrop" data-action="close-lightbox"></div>
    <div class="lightbox" role="dialog" aria-label="${escapeHtml(image.name)}">
      <div class="lightbox-header">
        <div><h3>${escapeHtml(image.name)}</h3><p>${escapeHtml(image.uploader || "")} / ${escapeHtml(image.uploadedAt || "")}</p></div>
        <div class="lightbox-actions">
          ${image.webViewLink ? `<a class="icon-button" href="${escapeHtml(image.webViewLink)}" target="_blank" rel="noopener" aria-label="Open in Drive">${icon("link")}</a>` : ""}
          <button class="icon-button" data-action="prev-image" aria-label="Previous">${icon("arrowLeft")}</button>
          <button class="icon-button" data-action="next-image" aria-label="Next">${icon("arrowRight")}</button>
          <button class="icon-button" data-action="close-lightbox" aria-label="Close">${icon("close")}</button>
        </div>
      </div>
      <div class="lightbox-stage">
        ${image.thumbnailLink
          ? `<img src="${escapeHtml(image.thumbnailLink.replace(/=s\d+(-c)?$/, "=s1600"))}" alt="${escapeHtml(image.name)}" referrerpolicy="no-referrer" style="max-width:100%;max-height:100%;object-fit:contain;border-radius:8px" />`
          : `<div class="lightbox-image" style="--thumb:linear-gradient(135deg,#1e293b,#334155)"></div>`}
      </div>
    </div>
  `;
}

/* ============================================================
 * EVENTS
 * ============================================================ */

function bindEvents() {
  document.querySelectorAll("[data-view]").forEach((b) => b.addEventListener("click", () => {
    state.activeView = b.dataset.view;
    state.drawerOpen = state.activeView === "map" && Boolean(selectedNode());
    persist();
    render();
  }));

  document.querySelectorAll("[data-project]").forEach((b) => b.addEventListener("click", () => selectProject(b.dataset.project)));

  document.querySelectorAll("[data-project-open]").forEach((b) => b.addEventListener("click", () => {
    selectProject(b.dataset.projectOpen);
    state.activeView = "map";
    render();
  }));

  document.querySelectorAll("[data-project-delete]").forEach((b) => b.addEventListener("click", (e) => {
    e.stopPropagation();
    deleteProject(b.dataset.projectDelete);
  }));

  document.querySelectorAll("[data-folder]").forEach((b) => b.addEventListener("click", () => {
    state.selectedFolderId = b.dataset.folder;
    state.activeView = "projects";
    state.drawerOpen = false;
    persist();
    render();
  }));

  document.querySelectorAll("[data-folder-color]").forEach((input) => input.addEventListener("change", () => {
    const folder = state.projectFolders.find((f) => f.id === input.dataset.folderColor);
    if (!folder) return;
    folder.color = input.value;
    persist();
    render();
    toast(`${folder.name} colour updated`);
    logAudit("Folder Edited", { details: `Colour set to ${input.value} for ${folder.name}` });
  }));

  document.querySelectorAll("[data-folder-rename]").forEach((b) => b.addEventListener("click", () => {
    state.modal = { mode: "rename-folder", folderId: b.dataset.folderRename };
    render();
  }));

  document.querySelectorAll("[data-folder-delete]").forEach((b) => b.addEventListener("click", () => deleteFolder(b.dataset.folderDelete)));

  document.querySelectorAll("[data-project-folder]").forEach((sel) => sel.addEventListener("change", () => {
    const item = state.projects.find((p) => p.id === sel.dataset.projectFolder);
    if (!item) return;
    item.folderId = sel.value || null;
    delete state.drive.projectFolderMap[item.id]; // force re-create under new parent next sync
    persist();
    render();
    toast(`${item.name} moved`);
    logAudit("Project Moved", { projectId: item.id, details: `Folder set to ${item.folderId ? (state.projectFolders.find((f) => f.id === item.folderId)?.name) : DRIVE_UNFILED_FOLDER}` });
    if (isTokenValid()) ensureProjectDriveFolder(item).catch((e) => console.warn("Drive re-parent failed", e));
  }));

  document.querySelectorAll("[data-node]").forEach((b) => b.addEventListener("click", (e) => {
    e.stopPropagation();
    openNode(b.dataset.node);
  }));

  document.querySelectorAll("[data-filter]").forEach((input) => {
    const eventName = input.tagName === "INPUT" ? "input" : "change";
    input.addEventListener(eventName, () => {
      state.filters[input.dataset.filter] = input.value;
      persist();
      render();
    });
  });

  document.querySelectorAll("[data-audit-filter]").forEach((input) => {
    const eventName = input.tagName === "INPUT" ? "input" : "change";
    input.addEventListener(eventName, () => {
      state.auditView.filters[input.dataset.auditFilter] = input.value;
      persist();
      render();
    });
  });

  document.querySelectorAll("[data-action]").forEach((b) => b.addEventListener("click", handleAction));

  const quickStatus = document.querySelector("[data-quick-status]");
  if (quickStatus) quickStatus.addEventListener("change", () => updateNodeStatus(quickStatus.value));

  document.querySelectorAll("[data-notes]").forEach((textarea) => textarea.addEventListener("change", () => {
    const node = state.nodes.find((n) => n.id === textarea.dataset.notes);
    if (!node) return;
    node.description = textarea.value;
    node.updatedAt = nowStamp();
    persist();
    toast("Notes saved");
    logAudit("Notes Updated", { nodeId: node.id, details: "Notes edited" });
  }));

  document.querySelectorAll("[data-lightbox]").forEach((b) => b.addEventListener("click", () => {
    state.lightbox = { index: Number(b.dataset.lightbox) };
    render();
  }));

  document.querySelectorAll("[data-photo-upload]").forEach((input) => input.addEventListener("change", (e) => {
    const nodeId = input.dataset.photoUpload;
    const files = Array.from(e.target.files || []);
    if (files.length) uploadPhotosToNode(nodeId, files);
  }));

  const nodeForm = document.getElementById("nodeForm");
  if (nodeForm) nodeForm.addEventListener("submit", handleNodeForm);
  const folderForm = document.getElementById("folderForm");
  if (folderForm) folderForm.addEventListener("submit", handleFolderForm);
  const projectForm = document.getElementById("projectForm");
  if (projectForm) projectForm.addEventListener("submit", handleProjectForm);
  const categoryForm = document.getElementById("categoryForm");
  if (categoryForm) categoryForm.addEventListener("submit", handleCategoryForm);
  const inviteForm = document.getElementById("inviteForm");
  if (inviteForm) inviteForm.addEventListener("submit", handleInviteForm);

  bindCanvasEvents();
}

function handleAction(event) {
  const action = event.currentTarget.dataset.action;
  if (["close-drawer", "close-modal", "close-lightbox"].includes(action)) event.preventDefault();
  switch (action) {
    case "google-sign-in": return signIn();
    case "google-sign-out": return signOut();
    case "google-bootstrap": return bootstrapDrive();
    case "go-settings": state.activeView = "settings"; persist(); return render();
    case "create-node": return openCreateModal({ x: 50, y: 50 });
    case "new-project": state.modal = { mode: "new-project" }; return render();
    case "edit-project": state.modal = { mode: "edit-project" }; return render();
    case "delete-project": return deleteProject(state.selectedProjectId);
    case "new-folder": state.modal = { mode: "new-folder" }; return render();
    case "add-category": state.modal = { mode: "add-category" }; return render();
    case "invite-user": state.modal = { mode: "invite-user" }; return render();
    case "upload-plan": return uploadFloorPlan();
    case "zoom-in": return setZoom(state.canvas.zoom + 0.15);
    case "zoom-out": return setZoom(state.canvas.zoom - 0.15);
    case "reset-view": state.canvas = { zoom: 1, panX: 0, panY: 0 }; persist(); return render();
    case "close-drawer": state.drawerOpen = false; persist(); return render();
    case "close-modal": state.modal = null; return render();
    case "close-lightbox": state.lightbox = null; return render();
    case "edit-node": state.modal = { mode: "edit" }; return render();
    case "delete-node": return deleteSelectedNode();
    case "share-node": return shareSelectedNode();
    case "send-comment": return sendComment();
    case "prev-image": return stepImage(-1);
    case "next-image": return stepImage(1);
    case "print-report": toast("Opening print report"); return setTimeout(() => window.print(), 160);
    case "audit-load": return fetchAuditRows();
    case "audit-download": return downloadAuditCsv(filteredAuditRows());
    case "audit-clear-filters":
      state.auditView.filters = freshState().auditView.filters;
      persist();
      return render();
    case "wipe-local":
      if (!confirm("Wipe all local NeillPlanner data? (Drive files are not touched.)")) return;
      localStorage.removeItem(STORAGE_KEY);
      location.reload();
      return;
  }
}

/* ----- canvas pan/zoom ----- */

function bindCanvasEvents() {
  const viewport = document.getElementById("canvasViewport");
  if (!viewport) return;
  viewport.addEventListener("wheel", (e) => {
    e.preventDefault();
    setZoom(state.canvas.zoom + (e.deltaY < 0 ? 0.08 : -0.08), false);
  }, { passive: false });
  viewport.addEventListener("pointerdown", (e) => {
    if (e.target.closest(".node-marker")) return;
    viewport.setPointerCapture(e.pointerId);
    dragState = {
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      panX: state.canvas.panX,
      panY: state.canvas.panY,
      moved: false
    };
  });
  viewport.addEventListener("pointermove", (e) => {
    if (!dragState || dragState.pointerId !== e.pointerId) return;
    const dx = e.clientX - dragState.startX;
    const dy = e.clientY - dragState.startY;
    if (Math.abs(dx) + Math.abs(dy) > 5) {
      dragState.moved = true;
      viewport.classList.add("is-dragging");
      state.canvas.panX = dragState.panX + dx;
      state.canvas.panY = dragState.panY + dy;
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
    if (!wasMoved && !e.target.closest(".node-marker") && state.floorPlans[state.selectedProjectId]) {
      const pos = pointerToPlanPosition(e);
      if (pos) openCreateModal(pos);
    }
  });
}

function pointerToPlanPosition(event) {
  const plan = document.querySelector(".floor-plan");
  if (!plan) return null;
  const rect = plan.getBoundingClientRect();
  const x = ((event.clientX - rect.left) / rect.width) * 100;
  const y = ((event.clientY - rect.top) / rect.height) * 100;
  if (x < 0 || x > 100 || y < 0 || y > 100) return null;
  return {
    x: Number(Math.max(0, Math.min(100, x)).toFixed(1)),
    y: Number(Math.max(0, Math.min(100, y)).toFixed(1))
  };
}

function applyCanvasTransform() {
  const stage = document.getElementById("planStage");
  if (!stage) return;
  stage.style.transform = `translate(calc(-50% + ${state.canvas.panX}px), calc(-50% + ${state.canvas.panY}px)) scale(${state.canvas.zoom})`;
}

function setZoom(value, rerender = true) {
  state.canvas.zoom = Math.max(0.55, Math.min(2.4, Number(value.toFixed(2))));
  persist();
  if (rerender) render();
  else applyCanvasTransform();
}

/* ============================================================
 * MUTATIONS / HANDLERS
 * ============================================================ */

function selectProject(projectId) {
  state.selectedProjectId = projectId;
  const proj = project();
  state.selectedFolderId = proj?.folderId || (proj && !proj.folderId ? "unfiled" : "all");
  const firstNode = projectNodes()[0];
  state.selectedNodeId = firstNode?.id || null;
  state.drawerOpen = false;
  state.filters = { query: "", status: "All", category: "All", assignee: "All", layer: "All" };
  persist();
  render();
}

function openNode(nodeId) {
  state.selectedNodeId = nodeId;
  state.drawerOpen = true;
  state.activeView = "map";
  const node = selectedNode();
  if (node) history.replaceState(null, "", `#node=${encodeURIComponent(node.id)}`);
  persist();
  render();
}

function openCreateModal(position) {
  if (!project()) {
    toast("Create a project first");
    return;
  }
  state.modal = { mode: "create", position };
  render();
}

async function handleNodeForm(event) {
  event.preventDefault();
  const proj = project();
  if (!proj) return;
  const form = new FormData(event.currentTarget);
  const files = Array.from(document.getElementById("nodeImages")?.files || []);
  const title = (form.get("title") || "").toString().trim();
  if (!title) return;
  const payload = {
    title,
    category: form.get("category") || (proj.categories?.[0] || "Uncategorised"),
    status: form.get("status") || "Not Started",
    assignedTo: form.get("assignedTo") || "",
    tags: (form.get("tags") || "").toString().split(",").map((t) => t.trim()).filter(Boolean),
    description: (form.get("description") || "").toString().trim()
  };
  if (state.modal.mode === "edit") {
    const node = selectedNode();
    if (!node) return;
    const previousStatus = node.status;
    const previousTitle = node.title;
    Object.assign(node, payload, { updatedAt: nowStamp() });
    state.modal = null;
    persist();
    render();
    if (previousStatus !== node.status) {
      logAudit("Status Changed", { nodeId: node.id, details: `${previousStatus} -> ${node.status}`, status: node.status });
    } else if (previousTitle !== node.title) {
      logAudit("Node Renamed", { nodeId: node.id, details: `${previousTitle} -> ${node.title}` });
    } else {
      logAudit("Node Edited", { nodeId: node.id, details: "Fields updated" });
    }
    if (files.length) await uploadPhotosToNode(node.id, files);
    toast("Node updated");
  } else {
    const node = {
      id: uid("node"),
      projectId: proj.id,
      ...payload,
      position: state.modal.position || { x: 50, y: 50 },
      createdBy: state.googleAuth.profile?.name || state.googleAuth.profile?.email || "local",
      createdAt: nowStamp(),
      updatedAt: nowStamp(),
      checklist: [],
      imageRefs: [],
      comments: []
    };
    state.nodes.push(node);
    state.selectedNodeId = node.id;
    state.drawerOpen = true;
    state.modal = null;
    persist();
    render();
    logAudit("Node Created", { nodeId: node.id, details: `Status ${node.status}, category ${node.category}` });
    if (isTokenValid()) ensureNodeDriveFolder(node).catch((e) => console.warn("Node folder create failed", e));
    if (files.length) await uploadPhotosToNode(node.id, files);
    toast("Node created");
  }
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
    if (f) {
      const oldName = f.name;
      f.name = name;
      f.color = color;
      logAudit("Folder Renamed", { details: `${oldName} -> ${name}` });
    }
  } else {
    state.projectFolders.push({ id: uid("fld"), name, color, driveFolderId: null });
    logAudit("Folder Created", { details: `${name} (${color})` });
  }
  state.modal = null;
  persist();
  render();
}

async function handleProjectForm(event) {
  event.preventDefault();
  const form = new FormData(event.currentTarget);
  const name = (form.get("name") || "").toString().trim();
  if (!name) return;
  const folderId = (form.get("folderId") || "").toString() || null;
  const payload = {
    name,
    folderId,
    address: (form.get("address") || "").toString(),
    description: (form.get("description") || "").toString(),
    planName: (form.get("planName") || "Ground floor").toString(),
    categories: (form.get("categories") || "").toString().split(",").map((c) => c.trim()).filter(Boolean)
  };
  if (state.modal.mode === "edit-project") {
    const proj = project();
    if (!proj) return;
    const folderChanged = proj.folderId !== folderId;
    const nameChanged = proj.name !== name;
    Object.assign(proj, payload, { updatedAt: nowStamp() });
    if (folderChanged) delete state.drive.projectFolderMap[proj.id];
    if (nameChanged) delete state.drive.projectFolderMap[proj.id];
    state.modal = null;
    persist();
    render();
    logAudit("Project Edited", { projectId: proj.id, details: nameChanged ? `Renamed to ${name}` : "Fields updated" });
    if (isTokenValid()) ensureProjectDriveFolder(proj).catch((e) => console.warn("Drive sync failed", e));
    toast("Project updated");
  } else {
    const proj = {
      id: uid("prj"),
      ...payload,
      team: [],
      createdAt: nowStamp(),
      updatedAt: nowStamp()
    };
    state.projects.push(proj);
    state.selectedProjectId = proj.id;
    state.selectedFolderId = proj.folderId || "unfiled";
    state.modal = null;
    persist();
    render();
    logAudit("Project Created", { projectId: proj.id, details: `Folder ${folderId || DRIVE_UNFILED_FOLDER}` });
    if (isTokenValid()) ensureProjectDriveFolder(proj).catch((e) => console.warn("Drive create failed", e));
    toast(`Project ${proj.name} created`);
  }
}

function handleCategoryForm(event) {
  event.preventDefault();
  const proj = project();
  if (!proj) return;
  const form = new FormData(event.currentTarget);
  const name = (form.get("name") || "").toString().trim();
  if (!name) return;
  proj.categories = proj.categories || [];
  if (!proj.categories.includes(name)) proj.categories.push(name);
  state.modal = null;
  persist();
  render();
  logAudit("Category Added", { projectId: proj.id, details: name });
  toast("Category added");
}

function handleInviteForm(event) {
  event.preventDefault();
  const proj = project();
  if (!proj) return;
  const form = new FormData(event.currentTarget);
  const name = (form.get("name") || "").toString().trim();
  if (!name) return;
  proj.team = proj.team || [];
  proj.team.push({
    id: uid("usr"),
    name,
    email: (form.get("email") || "").toString().trim(),
    role: (form.get("role") || "editor").toString()
  });
  state.modal = null;
  persist();
  render();
  logAudit("Team Member Added", { projectId: proj.id, details: `${name}` });
  toast("Team member added");
}

function deleteFolder(folderId) {
  const folder = state.projectFolders.find((f) => f.id === folderId);
  if (!folder) return;
  if (!confirm(`Delete folder "${folder.name}"? Projects inside will be moved to ${DRIVE_UNFILED_FOLDER}.`)) return;
  state.projects.forEach((p) => { if (p.folderId === folderId) p.folderId = null; });
  state.projectFolders = state.projectFolders.filter((f) => f.id !== folderId);
  if (state.selectedFolderId === folderId) state.selectedFolderId = "all";
  persist();
  render();
  logAudit("Folder Deleted", { details: folder.name });
  toast(`Folder "${folder.name}" deleted`);
}

function deleteProject(projectId) {
  const proj = state.projects.find((p) => p.id === projectId);
  if (!proj) return;
  if (!confirm(`Delete project "${proj.name}" and all its nodes? (Drive files are NOT deleted.)`)) return;
  state.projects = state.projects.filter((p) => p.id !== projectId);
  state.nodes = state.nodes.filter((n) => n.projectId !== projectId);
  delete state.floorPlans[projectId];
  delete state.drive.projectFolderMap[projectId];
  if (state.selectedProjectId === projectId) state.selectedProjectId = state.projects[0]?.id || null;
  persist();
  render();
  logAudit("Project Deleted", { details: proj.name });
  toast(`Project "${proj.name}" deleted`);
}

function deleteSelectedNode() {
  const node = selectedNode();
  if (!node) return;
  if (!confirm(`Delete node "${node.title}"?`)) return;
  state.nodes = state.nodes.filter((n) => n.id !== node.id);
  delete state.drive.nodeFolderMap[node.id];
  logAudit("Node Deleted", { nodeId: node.id, nodeTitle: node.title });
  state.selectedNodeId = projectNodes()[0]?.id || null;
  state.drawerOpen = Boolean(state.selectedNodeId);
  state.modal = null;
  persist();
  render();
  toast("Node deleted");
}

function updateNodeStatus(status) {
  const node = selectedNode();
  if (!node || node.status === status) return;
  const previous = node.status;
  node.status = status;
  node.updatedAt = nowStamp();
  persist();
  render();
  logAudit("Status Changed", { nodeId: node.id, status, details: `${previous} -> ${status}` });
  toast("Status saved");
}

function sendComment() {
  const node = selectedNode();
  if (!node) return;
  const input = document.querySelector(`[data-comment-input="${node.id}"]`);
  if (!input || !input.value.trim()) return;
  const text = input.value.trim();
  node.comments.push({
    author: state.googleAuth.profile?.name || state.googleAuth.profile?.email || "local",
    time: nowStamp(),
    text
  });
  node.updatedAt = nowStamp();
  persist();
  render();
  logAudit("Comment Added", { nodeId: node.id, details: text.length > 80 ? text.slice(0, 77) + "..." : text });
  toast(text.includes("@") ? "Mention saved" : "Comment saved");
}

async function shareSelectedNode() {
  const node = selectedNode();
  if (!node) return;
  const url = `${location.origin}${location.pathname}#node=${encodeURIComponent(node.id)}`;
  try {
    await navigator.clipboard.writeText(url);
    toast("Node link copied");
  } catch {
    toast(url);
  }
}

function stepImage(direction) {
  const node = selectedNode();
  if (!node || !state.lightbox) return;
  const count = node.imageRefs.length;
  if (!count) return;
  state.lightbox.index = (state.lightbox.index + direction + count) % count;
  render();
}

/* ----- floor plan upload (local data url) ----- */

function uploadFloorPlan() {
  const proj = project();
  if (!proj) {
    toast("Create a project first");
    return;
  }
  const input = document.createElement("input");
  input.type = "file";
  input.accept = "image/*,image/svg+xml";
  input.onchange = () => {
    const file = input.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      state.floorPlans[proj.id] = reader.result;
      proj.planName = proj.planName || file.name.replace(/\.[^.]+$/, "");
      persist();
      render();
      toast(`Plan uploaded for ${proj.name}`);
      logAudit("Plan Uploaded", { projectId: proj.id, details: file.name });
    };
    reader.readAsDataURL(file);
  };
  input.click();
}

/* ----- photo upload ----- */

async function uploadPhotosToNode(nodeId, files) {
  const node = state.nodes.find((n) => n.id === nodeId);
  if (!node) return;
  if (!requireAuth("upload photos to Drive")) return;
  toast(`Uploading ${files.length} photo${files.length === 1 ? "" : "s"}...`);
  try {
    const nodeFolderId = await ensureNodeDriveFolder(node);
    if (!nodeFolderId) { toast("Could not find/create node folder"); return; }
    const uploaderName = state.googleAuth.profile?.name || state.googleAuth.profile?.email || "local";
    for (const file of files) {
      try {
        const result = await uploadFileToDrive(file, nodeFolderId);
        node.imageRefs.push({
          id: result.id,
          name: result.name,
          driveFileId: result.id,
          webViewLink: result.webViewLink,
          thumbnailLink: result.thumbnailLink,
          mimeType: result.mimeType,
          uploader: uploaderName,
          uploadedAt: nowStamp()
        });
      } catch (e) {
        console.error("Upload failed for", file.name, e);
        toast(`Failed: ${file.name}`);
      }
    }
    node.updatedAt = nowStamp();
    persist();
    render();
    toast(`Uploaded ${files.length} photo${files.length === 1 ? "" : "s"}`);
    logAudit("Photos Uploaded", { nodeId: node.id, details: `${files.length} file(s)` });
  } catch (e) {
    console.error("Photo upload batch failed", e);
    toast("Upload failed: " + describeError(e));
  }
}

/* ----- toast ----- */

function toast(message) {
  state.toast = message;
  window.clearTimeout(toast.timer);
  toast.timer = window.setTimeout(() => {
    state.toast = "";
    render();
  }, 2800);
}

/* ============================================================
 * BOOT
 * ============================================================ */

function hydrateFromHash() {
  const match = location.hash.match(/node=([^&]+)/);
  if (!match) return;
  const node = state.nodes.find((n) => n.id === decodeURIComponent(match[1]));
  if (!node) return;
  state.selectedProjectId = node.projectId;
  state.selectedNodeId = node.id;
  state.drawerOpen = true;
  state.activeView = "map";
}

hydrateFromHash();
render();
bootGoogle();
