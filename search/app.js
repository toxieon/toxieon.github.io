const CONFIG = window.SEARCH_CONFIG || {};
const DRIVE_ROOT_NAME = CONFIG.driveRootFolderName || "NeillPlanner";
const ADMIN_FOLDER_NAME = CONFIG.adminFolderName || "Admin Files";
const BATCH_FOLDER_NAME = CONFIG.batchFolderName || "Batch";
const PROJECTS_ROOT_NAME = CONFIG.projectsRootFolderName || "NeillPlanner Projects";
const UNFILED_ROOT_NAME = CONFIG.unfiledRootFolderName || "Unfiled Projects";
const UPLOAD_SHEET_NAME = CONFIG.uploadSheetName || "Upload Log";
const MASTER_SPREADSHEET_ID = String(CONFIG.masterSpreadsheetId || "").trim();
const MASTER_SPREADSHEET_NAME = CONFIG.masterSpreadsheetName || "NeillPlanner-Master";
const JOB_SHEET_NAME = CONFIG.jobSheetName || "Job Index";
const ADMIN_EMAIL = (CONFIG.adminEmail || "brandon.j.neill@gmail.com").toLowerCase();
const GOOGLE_SCOPES = (CONFIG.scopes || ["https://www.googleapis.com/auth/drive", "https://www.googleapis.com/auth/spreadsheets"]).join(" ");
const UPLOAD_TAB_NAME = "Uploads";
const PHOTOS_TAB_NAME = "Photos";
const SEARCH_AUDIT_TAB_NAME = "Search Audit";
const PHOTOS_HEADER = [
  "Photo ID",
  "Drive File ID",
  "Name",
  "Node ID",
  "Node Name",
  "Floor ID",
  "Floor Name",
  "Project ID",
  "Project Name",
  "Uploader",
  "Uploaded At",
  "Mime Type",
  "Web View Link",
  "Thumbnail Link"
];
const SEARCH_AUDIT_HEADER = [
  "Timestamp",
  "Action",
  "Drive File ID",
  "File Name",
  "Node ID",
  "Node Name",
  "Floor ID",
  "Floor Name",
  "Project ID",
  "Project Name",
  "Moved By",
  "Destination Folder ID",
  "Photos Upsert"
];

const iconPaths = {
  search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
  google: '<path d="M21.35 11.1H12v3.2h5.35c-.49 2.3-2.43 3.78-5.35 3.78-3.2 0-5.78-2.6-5.78-5.78s2.58-5.78 5.78-5.78c1.46 0 2.77.53 3.78 1.4l2.42-2.4A8.85 8.85 0 0 0 12 3.2a8.8 8.8 0 1 0 0 17.6c5.1 0 8.45-3.55 8.45-8.55 0-.6-.05-1.15-.1-1.15Z"/>',
  refresh: '<path d="M21 12a9 9 0 1 1-3-6.7"/><path d="M21 3v6h-6"/>',
  folder: '<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z"/>',
  file: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z"/><path d="M14 2v6h6"/><path d="M9 15h6"/><path d="M9 18h4"/>',
  check: '<path d="m20 6-11 11-5-5"/>',
  copy: '<rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>',
  close: '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>',
  move: '<path d="M5 12h14"/><path d="m13 5 7 7-7 7"/>',
  save: '<path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2Z"/><path d="M17 21v-8H7v8"/><path d="M7 3v5h8"/>'
};

const state = {
  googleAuth: {
    librariesReady: false,
    signedIn: false,
    accessToken: null,
    expiresAt: null,
    profile: null,
    bootstrapping: false,
    lastError: null
  },
  accessDenied: false,
  loading: false,
  toast: "",
  lightbox: null,
  filters: { query: "", status: "all", type: "all", project: "all" },
  drive: { rootFolderId: null, batchFolderId: null, uploadSheetId: null, jobSheetId: null, projectsRootFolderId: null, unfiledRootFolderId: null, searchAuditReady: false, photosSheetReady: false },
  files: [],
  uploadRows: [],
  jobs: [],
  projects: [],
  floors: [],
  nodes: [],
  folders: [],
  rooms: [],
  photos: [],
  projectNames: []
};

let tokenClient = null;

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

function clean(value) {
  return String(value || "").trim();
}

function normalize(value) {
  return clean(value)
    .toLowerCase()
    .replace(/\b(victoria|vic|australia|au)\b/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeRoom(value) {
  return clean(value).toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function normalizeCompact(value) {
  return normalize(value).replace(/\s+/g, "");
}

function appPropertyValue(value) {
  return clean(value).slice(0, 120);
}

function nowIso() {
  return new Date().toISOString();
}

function describeError(error) {
  if (!error) return "Unknown error";
  if (error.result?.error?.message) return error.result.error.message;
  if (error.message) return error.message;
  return String(error);
}

function sleep(ms) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function isRetryableGoogleError(error) {
  const status = Number(error?.status || error?.result?.error?.code || error?.body?.error?.code || 0);
  const message = describeError(error).toLowerCase();
  return status === 429 ||
    status === 500 ||
    status === 502 ||
    status === 503 ||
    status === 504 ||
    (status === 403 && /rate|quota|user.?limit|backend/i.test(message));
}

async function googleCall(requestFactory, options = {}) {
  const attempts = options.attempts || 4;
  let lastError = null;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      return await requestFactory();
    } catch (error) {
      lastError = error;
      if (!isRetryableGoogleError(error) || attempt === attempts - 1) break;
      const delay = Math.min(12000, 600 * (2 ** attempt)) + Math.floor(Math.random() * 300);
      await sleep(delay);
    }
  }
  throw lastError;
}

function isTokenValid() {
  return state.googleAuth.signedIn && state.googleAuth.accessToken && state.googleAuth.expiresAt && Date.now() < state.googleAuth.expiresAt - 30000;
}

function isAdmin() {
  return state.googleAuth.profile?.email?.toLowerCase() === ADMIN_EMAIL;
}

function sheetRange(tabName, range) {
  return `'${String(tabName).replaceAll("'", "''")}'!${range}`;
}

function isMissingSheetError(error, tabName) {
  const message = describeError(error).toLowerCase();
  const tab = String(tabName || "").toLowerCase();
  return message.includes("unable to parse range") || message.includes("range") && message.includes(tab) || message.includes("not found") && message.includes(tab);
}

function escapeDriveQuery(value) {
  return String(value).replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}

function render() {
  document.getElementById("app").innerHTML = `
    <main class="search-shell">
      <div class="search-frame">
        ${renderTopbar()}
        ${renderContent()}
      </div>
      <footer class="creator-footnote">Created by Brandon Neill 🇦🇺</footer>
      ${state.lightbox ? renderLightbox() : ""}
      ${state.toast ? `<div class="toast">${escapeHtml(state.toast)}</div>` : ""}
    </main>
  `;
  bindEvents();
}

function renderTopbar() {
  return `
    <header class="topbar">
      <div class="brand">
        <div class="brand-mark">NS</div>
        <div>
          <h1>Neill Search</h1>
          <p>Batch review and filing</p>
        </div>
      </div>
      <div class="topbar-actions">
        ${
          isTokenValid()
            ? `<button type="button" class="ghost-button" data-action="refresh">${icon("refresh")}Refresh</button><button type="button" class="ghost-button" data-action="sign-out">Switch account</button>`
            : `<button type="button" class="ghost-button" data-action="sign-in" ${state.googleAuth.librariesReady ? "" : "disabled"}>${icon("google")}Sign In</button>`
        }
      </div>
    </header>
  `;
}

function renderContent() {
  if (!isTokenValid()) return renderLogin();
  if (state.accessDenied) return renderDenied();
  return renderDashboard();
}

function renderLogin() {
  return `
    <section class="hero">
      <div class="hero-card">
        <div class="hero-badge">${icon("search")}</div>
        <h2>Search Files</h2>
        <p>Sign in to review uploaded batch files, match project destinations, edit details, and file images into project folders.</p>
        <button type="button" class="primary-button" data-action="sign-in" ${state.googleAuth.librariesReady ? "" : "disabled"}>${icon("google")}Sign In</button>
        ${state.googleAuth.lastError ? `<div class="status-error">${escapeHtml(state.googleAuth.lastError)}</div>` : ""}
      </div>
    </section>
  `;
}

function renderDenied() {
  return `
    <section class="hero">
      <div class="hero-card">
        <div class="hero-badge">${icon("close")}</div>
        <h2>Access restricted</h2>
        <p>This page is only available to ${escapeHtml(ADMIN_EMAIL)}.</p>
        <button type="button" class="ghost-button" data-action="sign-out">Switch account</button>
      </div>
    </section>
  `;
}

function renderDashboard() {
  const files = filteredFiles();
  const metrics = getMetrics();
  return `
    <section class="view-panel">
      <div class="panel-header">
        <div class="panel-title">
          <h2>Batch search</h2>
          <p>${state.loading ? "Loading Drive and Sheets..." : `${files.length} visible of ${state.files.length} batch files`}</p>
        </div>
        <div class="button-row">
          <button type="button" class="ghost-button" data-action="open-job-sheet">${icon("file")}Master Sheet</button>
          <button type="button" class="primary-button" data-action="refresh">${icon("refresh")}Scan Batch</button>
        </div>
      </div>
      <div class="metrics-grid">
        <div class="metric"><span>Total</span><strong>${metrics.total}</strong></div>
        <div class="metric"><span>Matched</span><strong>${metrics.matched}</strong></div>
        <div class="metric"><span>Unmatched</span><strong>${metrics.unmatched}</strong></div>
        <div class="metric"><span>Moved</span><strong>${metrics.moved}</strong></div>
      </div>
      <div class="filter-panel">
        <div class="filters">
          <div class="search-wrap"><input data-filter="query" value="${escapeHtml(state.filters.query)}" placeholder="Search file, address, room, project, floor, device..." /></div>
          <select data-filter="status">
            ${filterOption("all", "All statuses", state.filters.status)}
            ${filterOption("matched", "Matched destinations", state.filters.status)}
            ${filterOption("unmatched", "Unmatched", state.filters.status)}
            ${filterOption("moved", "Moved", state.filters.status)}
          </select>
          <select data-filter="type">
            ${filterOption("all", "All device types", state.filters.type)}
            ${uniqueTypes().map((type) => filterOption(type, type, state.filters.type)).join("")}
          </select>
          <select data-filter="project">
            ${filterOption("all", "All projects", state.filters.project)}
            ${state.projectNames.map((project) => filterOption(project, project, state.filters.project)).join("")}
          </select>
        </div>
      </div>
      ${state.loading ? renderEmpty("Scanning...", "Reading the batch folder and master sheet.") : (files.length ? `<div class="file-grid">${files.map(renderFileCard).join("")}</div>` : renderEmpty("No files found", "Try a different search, or upload files into the batch folder first."))}
    </section>
  `;
}

function renderEmpty(title, body) {
  return `<div class="empty-state"><h2>${escapeHtml(title)}</h2><p>${escapeHtml(body)}</p></div>`;
}

function filterOption(value, label, current) {
  return `<option value="${escapeHtml(value)}" ${current === value ? "selected" : ""}>${escapeHtml(label)}</option>`;
}

function renderFileCard(file) {
  const match = file.match;
  const isMoved = file.status === "moved";
  return `
    <article class="file-card ${match ? "is-matched" : ""} ${isMoved ? "is-moved" : ""}" data-file="${escapeHtml(file.id)}">
      <button type="button" class="thumb-button" data-preview="${escapeHtml(file.id)}">
        ${file.thumbnailLink ? `<img src="${escapeHtml(file.thumbnailLink)}" alt="" />` : `<div class="thumb-fallback">${icon("file")}</div>`}
      </button>
      <div class="file-body">
        <div class="file-title">
          <strong>${escapeHtml(file.name)}</strong>
          <span class="status-pill ${isMoved ? "is-moved" : match ? "is-match" : ""}">${escapeHtml(isMoved ? "Moved" : match ? "Matched" : "Plain")}</span>
        </div>
        <div class="file-meta">${escapeHtml(file.mimeType || "file")} ${file.size ? `- ${escapeHtml(file.size)} bytes` : ""}</div>
        <div class="edit-grid">
          ${renderField(file, "type", "Device Type", "Thermostat")}
          ${renderField(file, "room", "Room", "101")}
          ${renderField(file, "location", "Location", "Level 1")}
          ${renderField(file, "address", "Address", "Street address", "full")}
          <div class="field">
            <label>Project</label>
            <select data-file-field="projectId" data-id="${escapeHtml(file.id)}">
              ${filterOption("", "Choose project", file.projectId)}
              ${state.projects.map((project) => filterOption(project.projectId, project.name, file.projectId)).join("")}
            </select>
          </div>
          <div class="field">
            <label>Floor</label>
            <select data-file-field="floorId" data-id="${escapeHtml(file.id)}">
              ${filterOption("", "Choose floor", file.floorId)}
              ${floorOptions(file).map((floor) => filterOption(floor.floorId, floor.floorName, file.floorId)).join("")}
            </select>
          </div>
          <div class="field full">
            <label>Node / Item</label>
            <select data-file-field="nodeId" data-id="${escapeHtml(file.id)}">
              ${filterOption("", "Choose node or item", file.nodeId)}
              ${destinationOptions(file).map((destination) => filterOption(destination.nodeId, destination.label, file.nodeId)).join("")}
            </select>
          </div>
        </div>
        ${renderMatchBox(file)}
        <div class="card-actions">
          <button type="button" class="ghost-button" data-action-file="save" data-id="${escapeHtml(file.id)}">${icon("save")}Save</button>
          <div class="button-row">
            <button type="button" class="ghost-button" data-action-file="open" data-id="${escapeHtml(file.id)}">Open</button>
            <button type="button" class="primary-button" data-action-file="move" data-id="${escapeHtml(file.id)}" ${canMoveFile(file) ? "" : "disabled"}>${icon("move")}Move</button>
          </div>
        </div>
      </div>
    </article>
  `;
}

function renderField(file, field, label, placeholder, extraClass = "") {
  return `
    <div class="field ${extraClass}">
      <label>${escapeHtml(label)}</label>
      <input data-file-field="${escapeHtml(field)}" data-id="${escapeHtml(file.id)}" value="${escapeHtml(file[field])}" placeholder="${escapeHtml(placeholder)}" />
    </div>
  `;
}

function floorOptions(file) {
  if (file.projectId) return state.floors.filter((floor) => floor.projectId === file.projectId);
  if (file.projectName) return state.floors.filter((floor) => normalize(floor.projectName) === normalize(file.projectName));
  return state.floors;
}

function destinationOptions(file) {
  return state.jobs.filter((destination) => {
    const projectMatches = !file.projectId || destination.projectId === file.projectId;
    const floorMatches = !file.floorId || destination.floorId === file.floorId;
    return projectMatches && floorMatches;
  });
}

function canMoveFile(file) {
  return Boolean((file.projectId || file.projectName || file.match) && (file.nodeId || file.nodeName || file.type || file.floorId || file.floorName));
}

function updateFileField(file, field, value) {
  file[field] = value;
  if (field === "projectId") {
    const project = state.projects.find((entry) => entry.projectId === value);
    if (project) applyProject(file, project);
    if (!project) {
      file.projectName = "";
      file.folderGroup = "";
    }
    file.floorId = "";
    file.floorName = "";
    file.nodeId = "";
    file.nodeName = "";
    file.category = "";
    file.lineItem = "";
  }
  if (field === "floorId") {
    const floor = state.floors.find((entry) => entry.floorId === value);
    if (floor) applyFloor(file, floor);
    if (!floor) file.floorName = "";
    file.nodeId = "";
    file.nodeName = "";
    file.category = "";
    file.lineItem = "";
  }
  if (field === "nodeId") {
    const destination = state.jobs.find((entry) => entry.nodeId === value);
    if (destination) applyDestination(file, destination);
    if (!destination) {
      file.nodeName = "";
      file.category = "";
      file.lineItem = "";
    }
  }
}

function applyProject(file, project) {
  if (!project) return;
  file.projectId = project.projectId;
  file.projectName = project.name;
  file.folderGroup = project.folderGroup;
  if (!file.address) file.address = project.address;
}

function applyFloor(file, floor) {
  if (!floor) return;
  file.floorId = floor.floorId;
  file.floorName = floor.floorName;
  if (!file.projectId) {
    const project = state.projects.find((entry) => entry.projectId === floor.projectId);
    applyProject(file, project);
  }
}

function applyDestination(file, destination) {
  if (!destination) return;
  file.projectId = destination.projectId;
  file.projectName = destination.projectName;
  file.folderGroup = destination.folderGroup;
  file.floorId = destination.floorId;
  file.floorName = destination.floorName;
  file.nodeId = destination.nodeId;
  file.nodeName = destination.nodeName;
  file.category = destination.category;
  file.lineItem = destination.lineItem;
  if (destination.address) file.address = destination.address;
  if (destination.deviceType) file.type = destination.deviceType;
}

function renderMatchBox(file) {
  if (!file.match) {
    const selectedParts = [file.folderGroup, file.projectName, file.floorName, file.nodeName || file.type].filter(Boolean);
    if (selectedParts.length) {
      return `
        <div class="match-box">
          <strong>Selected destination</strong>
          <span class="card-subtle">${escapeHtml(selectedParts.join(" / "))}</span>
        </div>
      `;
    }
    return `<div class="match-box"><span class="card-subtle">No master index destination found for this file yet.</span></div>`;
  }
  const parts = [file.match.folderGroup, file.match.projectName, file.match.floorName, file.match.nodeName || file.match.deviceType].filter(Boolean);
  return `
    <div class="match-box is-good">
      <strong>${escapeHtml(file.match.projectName)} destination</strong>
      <span class="card-subtle">${escapeHtml(parts.join(" / "))}</span>
      <button type="button" class="copy-button" data-action-file="copy-destination" data-id="${escapeHtml(file.id)}">${icon("copy")}Copy destination across</button>
    </div>
  `;
}

function renderLightbox() {
  const file = state.files.find((entry) => entry.id === state.lightbox);
  if (!file) return "";
  return `
    <div class="lightbox-backdrop" data-action="close-lightbox"></div>
    <section class="lightbox" role="dialog" aria-modal="true">
      <div class="lightbox-header">
        <strong>${escapeHtml(file.name)}</strong>
        <button type="button" class="icon-button" data-action="close-lightbox" aria-label="Close">${icon("close")}</button>
      </div>
      ${file.thumbnailLink ? `<img src="${escapeHtml(file.thumbnailLink.replace(/=s\\d+$/, "=s1600"))}" alt="" />` : `<div class="thumb-fallback">${icon("file")}</div>`}
    </section>
  `;
}

function bindEvents() {
  document.querySelectorAll("[data-action]").forEach((button) => button.addEventListener("click", () => handleAction(button.dataset.action)));
  document.querySelectorAll("[data-action-file]").forEach((button) => button.addEventListener("click", () => handleFileAction(button.dataset.actionFile, button.dataset.id)));
  document.querySelectorAll("[data-preview]").forEach((button) => button.addEventListener("click", () => { state.lightbox = button.dataset.preview; render(); }));
  document.querySelectorAll("[data-filter]").forEach((input) => {
    const eventName = input.tagName === "INPUT" ? "input" : "change";
    input.addEventListener(eventName, () => {
      state.filters[input.dataset.filter] = input.value;
      render();
    });
  });
  document.querySelectorAll("[data-file-field]").forEach((input) => {
    const eventName = input.tagName === "SELECT" ? "change" : "input";
    input.addEventListener(eventName, () => {
      const file = state.files.find((entry) => entry.id === input.dataset.id);
      if (!file) return;
      updateFileField(file, input.dataset.fileField, input.value);
      matchFile(file);
      if (input.tagName === "SELECT") render();
    });
  });
}

function handleAction(action) {
  if (action === "sign-in") return signIn();
  if (action === "sign-out") return signOut();
  if (action === "refresh") return refreshAll();
  if (action === "close-lightbox") { state.lightbox = null; render(); return; }
  if (action === "open-job-sheet") return openJobSheet();
}

function handleFileAction(action, id) {
  const file = state.files.find((entry) => entry.id === id);
  if (!file) return;
  if (action === "open") return window.open(file.webViewLink, "_blank", "noopener");
  if (action === "save") return saveFileMetadata(file);
  if (action === "move") return moveFileToJob(file);
  if (action === "copy-destination") return copyDestinationAcross(file);
}

async function bootGoogle() {
  if (!CONFIG.googleApiKey || !CONFIG.googleClientId) {
    state.googleAuth.lastError = "Google configuration is missing";
    render();
    return;
  }
  const waitFor = (name, timeout = 12000) => new Promise((resolve, reject) => {
    const started = Date.now();
    const tick = () => {
      if (window[name]) return resolve(window[name]);
      if (Date.now() - started > timeout) return reject(new Error(`${name} did not load`));
      window.setTimeout(tick, 80);
    };
    tick();
  });
  try {
    await waitFor("gapi");
    await new Promise((resolve, reject) => gapi.load("client", { callback: resolve, onerror: reject }));
    await gapi.client.init({ apiKey: CONFIG.googleApiKey });
    await gapi.client.load("https://www.googleapis.com/discovery/v1/apis/drive/v3/rest");
    await gapi.client.load("https://sheets.googleapis.com/$discovery/rest?version=v4");
    await waitFor("google");
    tokenClient = google.accounts.oauth2.initTokenClient({
      client_id: CONFIG.googleClientId,
      scope: GOOGLE_SCOPES,
      callback: handleTokenResponse,
      error_callback: (error) => {
        state.googleAuth.lastError = error?.message || error?.type || "Google sign-in failed";
        state.googleAuth.bootstrapping = false;
        render();
      }
    });
    state.googleAuth.librariesReady = true;
  } catch (error) {
    state.googleAuth.lastError = `Google setup failed: ${describeError(error)}`;
  }
  render();
}

function signIn() {
  if (!tokenClient) {
    toast("Google is still loading");
    return;
  }
  state.googleAuth.bootstrapping = true;
  state.googleAuth.lastError = null;
  render();
  tokenClient.requestAccessToken({ prompt: state.googleAuth.accessToken ? "" : "consent" });
}

function signOut() {
  if (state.googleAuth.accessToken && window.google?.accounts?.oauth2) {
    try {
      google.accounts.oauth2.revoke(state.googleAuth.accessToken, () => {});
    } catch (error) {}
  }
  if (window.gapi?.client) gapi.client.setToken(null);
  state.googleAuth = {
    librariesReady: state.googleAuth.librariesReady,
    signedIn: false,
    accessToken: null,
    expiresAt: null,
    profile: null,
    bootstrapping: false,
    lastError: null
  };
  state.accessDenied = false;
  state.files = [];
  state.drive = { rootFolderId: null, batchFolderId: null, uploadSheetId: null, jobSheetId: null, projectsRootFolderId: null, unfiledRootFolderId: null, searchAuditReady: false, photosSheetReady: false };
  render();
}

async function handleTokenResponse(response) {
  if (response.error) {
    state.googleAuth.lastError = response.error_description || response.error;
    state.googleAuth.bootstrapping = false;
    render();
    return;
  }
  state.googleAuth.accessToken = response.access_token;
  state.googleAuth.expiresAt = Date.now() + ((response.expires_in || 3600) * 1000);
  state.googleAuth.signedIn = true;
  state.googleAuth.lastError = null;
  gapi.client.setToken({ access_token: response.access_token });
  await fetchProfile();
  state.accessDenied = !isAdmin();
  state.googleAuth.bootstrapping = false;
  render();
  if (!state.accessDenied) refreshAll();
}

async function fetchProfile() {
  try {
    const response = await fetch("https://openidconnect.googleapis.com/v1/userinfo", {
      headers: { Authorization: `Bearer ${state.googleAuth.accessToken}` }
    });
    if (response.ok) state.googleAuth.profile = await response.json();
  } catch (error) {}
}

async function refreshAll() {
  if (!isTokenValid()) return signIn();
  if (!isAdmin()) {
    state.accessDenied = true;
    render();
    return;
  }
  state.loading = true;
  render();
  try {
    await ensureDriveReady();
    const [uploadRows, masterIndex, files] = await Promise.all([
      loadUploadRows(),
      loadMasterIndex(),
      loadBatchFiles()
    ]);
    state.uploadRows = uploadRows;
    state.projects = masterIndex.projects;
    state.floors = masterIndex.floors;
    state.nodes = masterIndex.nodes;
    state.folders = masterIndex.folders;
    state.rooms = masterIndex.rooms;
    state.photos = masterIndex.photos;
    state.jobs = masterIndex.destinations;
    state.projectNames = [...new Set(state.projects.map((project) => project.name).filter(Boolean))].sort((a, b) => a.localeCompare(b));
    state.files = files.map((file) => enrichFile(file));
    state.files.forEach(matchFile);
    toast("Batch scanned");
  } catch (error) {
    state.googleAuth.lastError = describeError(error);
    toast("Scan failed");
  }
  state.loading = false;
  render();
}

async function ensureDriveReady() {
  state.drive.rootFolderId = state.drive.rootFolderId || await findRootFolder();
  state.drive.batchFolderId = state.drive.batchFolderId || await findOrCreateChildFolder(BATCH_FOLDER_NAME, state.drive.rootFolderId);
  state.drive.uploadSheetId = state.drive.uploadSheetId || await findSheetInFolder(UPLOAD_SHEET_NAME, state.drive.batchFolderId);
  state.drive.jobSheetId = state.drive.jobSheetId || await resolveJobIndexSheet(state.drive.rootFolderId);
}

async function resolveJobIndexSheet(parentId) {
  if (MASTER_SPREADSHEET_ID) return MASTER_SPREADSHEET_ID;
  const adminFolderId = await findChildFolder(ADMIN_FOLDER_NAME, parentId);
  if (adminFolderId) {
    const masterSheet = await findSheetInFolder(MASTER_SPREADSHEET_NAME, adminFolderId);
    if (masterSheet) return masterSheet;
  }
  const existing = await findSheetInFolder(JOB_SHEET_NAME, parentId);
  if (existing) return existing;
  throw new Error(`No ${MASTER_SPREADSHEET_NAME} spreadsheet configured or found in ${ADMIN_FOLDER_NAME}.`);
}

async function findRootFolder() {
  const q = `name='${escapeDriveQuery(DRIVE_ROOT_NAME)}' and mimeType='application/vnd.google-apps.folder' and '${escapeDriveQuery(ADMIN_EMAIL)}' in owners and trashed=false`;
  const list = await googleCall(() => gapi.client.drive.files.list({ q, fields: "files(id,name)", pageSize: 5 }));
  if (list.result.files?.length) return list.result.files[0].id;
  const create = await googleCall(() => gapi.client.drive.files.create({
    resource: { name: DRIVE_ROOT_NAME, mimeType: "application/vnd.google-apps.folder" },
    fields: "id"
  }));
  return create.result.id;
}

async function findChildFolder(name, parentId) {
  const q = `name='${escapeDriveQuery(name)}' and mimeType='application/vnd.google-apps.folder' and '${parentId}' in parents and trashed=false`;
  const list = await googleCall(() => gapi.client.drive.files.list({ q, fields: "files(id,name)", pageSize: 5 }));
  return list.result.files?.[0]?.id || null;
}

async function findOrCreateChildFolder(name, parentId) {
  const existing = await findChildFolder(name, parentId);
  if (existing) return existing;
  const create = await googleCall(() => gapi.client.drive.files.create({
    resource: { name, mimeType: "application/vnd.google-apps.folder", parents: [parentId] },
    fields: "id"
  }));
  return create.result.id;
}

async function findSheetInFolder(name, parentId) {
  const q = `name='${escapeDriveQuery(name)}' and mimeType='application/vnd.google-apps.spreadsheet' and '${parentId}' in parents and trashed=false`;
  const list = await googleCall(() => gapi.client.drive.files.list({ q, fields: "files(id,name,webViewLink)", pageSize: 5 }));
  return list.result.files?.[0]?.id || null;
}

async function loadUploadRows() {
  if (!state.drive.uploadSheetId) return [];
  try {
    const response = await googleCall(() => gapi.client.sheets.spreadsheets.values.get({
      spreadsheetId: state.drive.uploadSheetId,
      range: sheetRange(UPLOAD_TAB_NAME, "A1:R")
    }));
    return rowsToObjects(response.result.values || []);
  } catch (error) {
    return [];
  }
}

async function loadMasterIndex() {
  try {
    const [projectRows, floorRows, nodeRows, folderRows, roomRows, photoRows] = await Promise.all([
      loadSheetRows("Projects", "A1:K"),
      loadSheetRows("Floors", "A1:I"),
      loadSheetRows("Nodes", "A1:AA"),
      loadSheetRows("Folders", "A1:E"),
      loadSheetRows("Rooms", "A1:E"),
      loadOptionalSheetRows(PHOTOS_TAB_NAME, "A1:N")
    ]);
    const projects = projectRows.map(projectFromRow).filter((project) => project.projectId || project.name);
    const floors = floorRows.map(floorFromRow).filter((floor) => floor.floorId || floor.floorName);
    const nodes = nodeRows.map(nodeFromRow).filter((node) => node.nodeId || node.nodeName || node.lineItem);
    const folders = folderRows.map(folderFromRow).filter((folder) => folder.folderId || folder.name);
    const rooms = roomRows.map(roomFromRow).filter((room) => room.roomId || room.name);
    const photos = photoRows.map(photoFromRow).filter((photo) => photo.driveFileId);
    return {
      projects,
      floors,
      nodes,
      folders,
      rooms,
      photos,
      destinations: buildDestinations(projects, floors, nodes, rooms, folders)
    };
  } catch (error) {
    throw new Error(`Could not read ${MASTER_SPREADSHEET_NAME}: ${describeError(error)}`);
  }
}

async function loadSheetRows(tabName, range) {
  const response = await googleCall(() => gapi.client.sheets.spreadsheets.values.get({
    spreadsheetId: state.drive.jobSheetId,
    range: sheetRange(tabName, range)
  }));
  return rowsToObjects(response.result.values || []);
}

async function loadOptionalSheetRows(tabName, range) {
  try {
    return await loadSheetRows(tabName, range);
  } catch (error) {
    if (isMissingSheetError(error, tabName)) return [];
    throw error;
  }
}

function projectFromRow(row) {
  return {
    projectId: clean(row["Project ID"]),
    name: clean(row.Name),
    folderGroup: clean(row["Folder Group"]) || UNFILED_ROOT_NAME,
    address: clean(row.Address),
    description: clean(row.Description),
    createdBy: clean(row["Created By"]),
    createdAt: clean(row["Created At"]),
    updatedAt: clean(row["Updated At"]),
    driveFolderId: clean(row["Drive Folder ID"]),
    floorCount: clean(row["Floor Count"]),
    nodeCount: clean(row["Node Count"]),
    addressKey: normalize(row.Address)
  };
}

function floorFromRow(row) {
  return {
    floorId: clean(row["Floor ID"]),
    projectId: clean(row["Project ID"]),
    projectName: clean(row["Project Name"]),
    floorName: clean(row["Floor Name"]),
    order: clean(row.Order),
    planDriveFileId: clean(row["Plan Drive File ID"]),
    driveFolderId: clean(row["Drive Folder ID"]),
    nodeCount: clean(row["Node Count"]),
    createdAt: clean(row["Created At"]),
    floorKey: normalize(row["Floor Name"])
  };
}

function nodeFromRow(row) {
  const customTitle = clean(row["Custom Title"]);
  const title = clean(row.Title);
  const lineItem = clean(row["Line Item"]);
  const category = clean(row.Category);
  return {
    nodeId: clean(row["Node ID"]),
    projectId: clean(row["Project ID"]),
    projectName: clean(row["Project Name"]),
    floorId: clean(row["Floor ID"]),
    floorName: clean(row["Floor Name"]),
    type: clean(row.Type),
    title,
    customTitle,
    nodeName: customTitle || title || lineItem || category,
    category,
    lineItem,
    status: clean(row.Status),
    assignedTo: clean(row["Assigned To"]),
    tags: clean(row.Tags),
    description: clean(row.Description),
    driveFolderId: clean(row["Drive Folder ID"]),
    deviceType: lineItem || category || customTitle || title,
    deviceKey: normalize([lineItem, category, customTitle, title].join(" "))
  };
}

function folderFromRow(row) {
  return {
    folderId: clean(row["Folder ID"]),
    name: clean(row.Name),
    color: clean(row.Color),
    projectCount: clean(row["Project Count"]),
    driveFolderId: clean(row["Drive Folder ID"])
  };
}

function roomFromRow(row) {
  return {
    roomId: clean(row["Room ID"]),
    projectId: clean(row["Project ID"]),
    floorId: clean(row["Floor ID"]),
    name: clean(row.Name),
    createdAt: clean(row["Created At"]),
    roomKey: normalizeRoom(row.Name)
  };
}

function photoFromRow(row) {
  return {
    photoId: clean(row["Photo ID"]),
    driveFileId: clean(row["Drive File ID"]),
    name: clean(row.Name),
    nodeId: clean(row["Node ID"]),
    nodeName: clean(row["Node Name"]),
    floorId: clean(row["Floor ID"]),
    floorName: clean(row["Floor Name"]),
    projectId: clean(row["Project ID"]),
    projectName: clean(row["Project Name"]),
    uploader: clean(row.Uploader),
    uploadedAt: clean(row["Uploaded At"]),
    mimeType: clean(row["Mime Type"]),
    webViewLink: clean(row["Web View Link"]),
    thumbnailLink: clean(row["Thumbnail Link"])
  };
}

function buildDestinations(projects, floors, nodes, rooms, folders) {
  const projectsById = new Map(projects.map((project) => [project.projectId, project]));
  const projectsByName = new Map(projects.map((project) => [normalize(project.name), project]));
  const floorsById = new Map(floors.map((floor) => [floor.floorId, floor]));
  const foldersByName = new Map(folders.map((folder) => [normalize(folder.name), folder]));
  const roomsByProjectFloor = new Map();
  rooms.forEach((room) => {
    const key = `${room.projectId}::${room.floorId}`;
    roomsByProjectFloor.set(key, [...(roomsByProjectFloor.get(key) || []), room]);
  });

  return nodes.map((node) => {
    const project = projectsById.get(node.projectId) || projectsByName.get(normalize(node.projectName)) || {};
    const floor = floorsById.get(node.floorId) || {};
    const folderGroup = project.folderGroup || UNFILED_ROOT_NAME;
    const folder = foldersByName.get(normalize(folderGroup)) || {};
    const floorName = floor.floorName || node.floorName;
    const roomList = roomsByProjectFloor.get(`${project.projectId || node.projectId}::${floor.floorId || node.floorId}`) || [];
    const deviceType = node.deviceType || node.lineItem || node.category || node.nodeName || "Unsorted Device";
    const label = [project.name || node.projectName, floorName, deviceType, node.nodeName].filter(Boolean).join(" / ");
    return {
      id: node.nodeId || `${project.projectId || node.projectId}:${floor.floorId || node.floorId}:${deviceType}`,
      label,
      projectId: project.projectId || node.projectId,
      projectName: project.name || node.projectName,
      projectDriveFolderId: project.driveFolderId || "",
      folderGroup,
      folderDriveFolderId: folder.driveFolderId || "",
      address: project.address || "",
      addressKey: normalize(project.address),
      floorId: floor.floorId || node.floorId,
      floorName,
      floorDriveFolderId: floor.driveFolderId || "",
      nodeId: node.nodeId,
      nodeName: node.nodeName,
      nodeDriveFolderId: node.driveFolderId,
      category: node.category,
      lineItem: node.lineItem,
      deviceType,
      deviceKey: normalize(deviceType),
      roomKeys: roomList.map((room) => room.roomKey).filter(Boolean)
    };
  }).filter((destination) => destination.projectName || destination.nodeId);
}

function getFirst(row, labels) {
  const entries = Object.entries(row);
  for (const label of labels) {
    const exact = clean(row[label]);
    if (exact) return exact;
    const normalizedLabel = normalizeHeader(label);
    const fuzzy = entries.find(([key, value]) => normalizeHeader(key) === normalizedLabel && clean(value));
    if (fuzzy) return clean(fuzzy[1]);
  }
  return "";
}

function normalizeHeader(value) {
  return clean(value).toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function rowsToObjects(values) {
  const [header, ...rows] = values;
  if (!header) return [];
  return rows.map((row) => Object.fromEntries(header.map((key, index) => [clean(key), row[index] ?? ""]).filter(([key]) => key)));
}

async function loadBatchFiles() {
  const files = [];
  let pageToken = null;
  do {
    const response = await googleCall(() => gapi.client.drive.files.list({
      q: `'${state.drive.batchFolderId}' in parents and trashed=false and mimeType!='application/vnd.google-apps.folder' and mimeType!='application/vnd.google-apps.spreadsheet'`,
      fields: "nextPageToken,files(id,name,mimeType,thumbnailLink,webViewLink,createdTime,modifiedTime,description,appProperties,parents,size,iconLink)",
      pageSize: 100,
      pageToken
    }));
    files.push(...(response.result.files || []));
    pageToken = response.result.nextPageToken || null;
  } while (pageToken);
  return files;
}

function enrichFile(file) {
  const upload = state.uploadRows.find((row) => row["Drive File ID"] === file.id) || {};
  const photo = state.photos.find((row) => row.driveFileId === file.id) || {};
  return {
    id: file.id,
    name: file.name,
    mimeType: file.mimeType,
    thumbnailLink: file.thumbnailLink || "",
    webViewLink: file.webViewLink || "",
    size: file.size || "",
    parents: file.parents || [],
    createdTime: file.createdTime || "",
    status: file.parents?.includes(state.drive.batchFolderId) ? "batch" : "moved",
    type: clean(file.appProperties?.fileType || upload["File Type"]),
    address: clean(file.appProperties?.address || upload.Address),
    room: clean(file.appProperties?.room || upload.Room),
    location: clean(file.appProperties?.location || upload.Location),
    projectId: clean(file.appProperties?.projectId || photo.projectId),
    projectName: clean(file.appProperties?.projectName || photo.projectName),
    folderGroup: clean(file.appProperties?.folderGroup),
    floorId: clean(file.appProperties?.floorId || photo.floorId),
    floorName: clean(file.appProperties?.floorName || photo.floorName),
    nodeId: clean(file.appProperties?.nodeId || photo.nodeId),
    nodeName: clean(file.appProperties?.nodeName || photo.nodeName),
    category: clean(file.appProperties?.category),
    lineItem: clean(file.appProperties?.lineItem),
    uploadedByEmail: clean(upload["Uploaded By Email"] || photo.uploader),
    uploadedByName: clean(upload["Uploaded By Name"]),
    uploadedAt: clean(upload.Timestamp || photo.uploadedAt || file.createdTime),
    photoId: clean(photo.photoId),
    match: null
  };
}

function matchFile(file) {
  const addressKey = normalize(file.address);
  const roomKey = normalizeRoom(file.room);
  const typeKey = normalize(file.type);
  const typeCompact = normalizeCompact(file.type);
  const locationKey = normalize(file.location);
  const projectKey = normalize(file.projectName);
  let best = null;
  let bestScore = 0;
  state.jobs.forEach((destination) => {
    let score = 0;
    if (file.nodeId && destination.nodeId === file.nodeId) score += 100;
    if (file.projectId && destination.projectId === file.projectId) score += 40;
    if (projectKey && normalize(destination.projectName) === projectKey) score += 30;
    if (addressKey && destination.addressKey === addressKey) score += 45;
    if (roomKey && destination.roomKeys.includes(roomKey)) score += 35;
    if (locationKey && normalize(destination.floorName) === locationKey) score += 15;
    const destinationDeviceCompact = normalizeCompact(destination.deviceType);
    if (typeKey && (destination.deviceKey.includes(typeKey) || typeKey.includes(destination.deviceKey) || destinationDeviceCompact.includes(typeCompact) || typeCompact.includes(destinationDeviceCompact))) score += 25;
    if (score > bestScore) {
      best = destination;
      bestScore = score;
    }
  });
  file.match = bestScore >= 45 ? best : null;
  if (file.match && (!file.projectId || !file.nodeId)) applyDestination(file, file.match);
  return file.match;
}

function filteredFiles() {
  const query = normalize(state.filters.query);
  return state.files.filter((file) => {
    const text = normalize([file.name, file.type, file.address, file.room, file.location, file.projectName, file.floorName, file.nodeName, file.category, file.lineItem].join(" "));
    const inQuery = !query || text.includes(query);
    const inStatus =
      state.filters.status === "all" ||
      (state.filters.status === "matched" && file.match) ||
      (state.filters.status === "unmatched" && !file.match && file.status !== "moved") ||
      (state.filters.status === "moved" && file.status === "moved");
    const inType = state.filters.type === "all" || file.type === state.filters.type;
    const inProject = state.filters.project === "all" || file.projectName === state.filters.project;
    return inQuery && inStatus && inType && inProject;
  });
}

function uniqueTypes() {
  return [...new Set([...state.files.map((file) => file.type), ...state.jobs.map((job) => job.deviceType)].filter(Boolean))].sort((a, b) => a.localeCompare(b));
}

function getMetrics() {
  const total = state.files.length;
  const moved = state.files.filter((file) => file.status === "moved").length;
  const matched = state.files.filter((file) => file.match).length;
  const unmatched = state.files.filter((file) => !file.match && file.status !== "moved").length;
  return { total, moved, matched, unmatched };
}

async function saveFileMetadata(file) {
  try {
    await updateFileMetadata(file);
    toast("Details saved");
  } catch (error) {
    toast(`Save failed: ${describeError(error)}`);
  }
}

async function updateFileMetadata(file) {
  matchFile(file);
  const existingAppProperties = Object.fromEntries(
    Object.entries(file.appProperties || {}).map(([key, value]) => [key, appPropertyValue(value)])
  );
  return googleCall(() => gapi.client.drive.files.update({
    fileId: file.id,
    resource: {
      description: fileDescription(file),
      appProperties: {
        ...existingAppProperties,
        source: "Search",
        fileType: appPropertyValue(file.type),
        address: appPropertyValue(file.address),
        room: appPropertyValue(file.room),
        location: appPropertyValue(file.location),
        projectId: appPropertyValue(file.projectId),
        projectName: appPropertyValue(file.projectName),
        folderGroup: appPropertyValue(file.folderGroup),
        floorId: appPropertyValue(file.floorId),
        floorName: appPropertyValue(file.floorName),
        nodeId: appPropertyValue(file.nodeId),
        nodeName: appPropertyValue(file.nodeName),
        category: appPropertyValue(file.category),
        lineItem: appPropertyValue(file.lineItem),
        lastEditedAt: nowIso()
      }
    },
    fields: "id,description,appProperties"
  }));
}

function fileDescription(file) {
  return [
    `Device Type: ${file.type}`,
    `Address: ${file.address}`,
    `Room: ${file.room}`,
    `Location: ${file.location}`,
    `Project: ${file.projectName}`,
    `Folder Group: ${file.folderGroup}`,
    `Floor: ${file.floorName}`,
    `Node: ${file.nodeName}`,
    `Category: ${file.category}`,
    `Line Item: ${file.lineItem}`,
    `Edited: ${nowIso()}`
  ].join("\n");
}

async function moveFileToJob(file) {
  matchFile(file);
  if (file.match) applyDestination(file, file.match);
  if (!file.projectId && !file.projectName) {
    toast("Choose a project before moving");
    return;
  }
  if (!file.floorId) {
    toast("Choose a floor before moving");
    return;
  }
  if (!file.nodeId) {
    toast("Choose a node before moving");
    return;
  }
  try {
    await updateFileMetadata(file);
    const destination = await ensureDestinationFolder(file);
    const staged = await googleCall(() => gapi.client.drive.files.update({
      fileId: file.id,
      addParents: destination,
      fields: "id,name,mimeType,webViewLink,thumbnailLink,parents"
    }));
    applyMovedDriveResult(file, staged.result);
    const photosStatus = await upsertPhotoRow(file, staged.result);
    const response = await googleCall(() => gapi.client.drive.files.update({
      fileId: file.id,
      removeParents: state.drive.batchFolderId,
      fields: "id,parents"
    }));
    file.parents = response.result.parents || [];
    file.status = "moved";
    await appendSearchAudit(file, destination, photosStatus).catch(() => {});
    toast(`File moved; Photos ${photosStatus}`);
    render();
  } catch (error) {
    toast(`Move failed: ${describeError(error)}`);
  }
}

function applyMovedDriveResult(file, driveFile) {
  if (!driveFile) return;
  file.name = driveFile.name || file.name;
  file.mimeType = driveFile.mimeType || file.mimeType;
  file.webViewLink = driveFile.webViewLink || file.webViewLink;
  file.thumbnailLink = driveFile.thumbnailLink || file.thumbnailLink;
  file.parents = driveFile.parents || file.parents;
}

async function upsertPhotoRow(file, driveFile) {
  await ensurePhotosSheet();
  const response = await googleCall(() => gapi.client.sheets.spreadsheets.values.get({
    spreadsheetId: state.drive.jobSheetId,
    range: sheetRange(PHOTOS_TAB_NAME, "A1:N")
  }));
  const values = response.result.values || [];
  const header = values[0] || PHOTOS_HEADER;
  const rows = values.slice(1);
  const driveFileIdColumn = Math.max(header.findIndex((name) => normalizeHeader(name) === normalizeHeader("Drive File ID")), 1);
  const existingIndex = rows.findIndex((row) => clean(row[driveFileIdColumn]) === file.id);
  const existingRow = existingIndex >= 0 ? rows[existingIndex] : null;
  const row = photoRowForFile(file, driveFile, existingRow);

  if (existingIndex >= 0) {
    const rowNumber = existingIndex + 2;
    await googleCall(() => gapi.client.sheets.spreadsheets.values.update({
      spreadsheetId: state.drive.jobSheetId,
      range: sheetRange(PHOTOS_TAB_NAME, `A${rowNumber}:N${rowNumber}`),
      valueInputOption: "RAW",
      resource: { values: [row] }
    }));
    updateLocalPhoto(row);
    return "updated";
  }

  await googleCall(() => gapi.client.sheets.spreadsheets.values.append({
    spreadsheetId: state.drive.jobSheetId,
    range: sheetRange(PHOTOS_TAB_NAME, "A1"),
    valueInputOption: "RAW",
    insertDataOption: "INSERT_ROWS",
    resource: { values: [row] }
  }));
  updateLocalPhoto(row);
  return "created";
}

async function ensurePhotosSheet() {
  if (state.drive.photosSheetReady || !state.drive.jobSheetId) return;
  const spreadsheet = await googleCall(() => gapi.client.sheets.spreadsheets.get({
    spreadsheetId: state.drive.jobSheetId,
    fields: "sheets(properties(title))"
  }));
  const tabNames = new Set((spreadsheet.result.sheets || []).map((sheet) => sheet.properties?.title));
  if (!tabNames.has(PHOTOS_TAB_NAME)) {
    await googleCall(() => gapi.client.sheets.spreadsheets.batchUpdate({
      spreadsheetId: state.drive.jobSheetId,
      resource: { requests: [{ addSheet: { properties: { title: PHOTOS_TAB_NAME } } }] }
    }));
  }
  await googleCall(() => gapi.client.sheets.spreadsheets.values.update({
    spreadsheetId: state.drive.jobSheetId,
    range: sheetRange(PHOTOS_TAB_NAME, "A1:N1"),
    valueInputOption: "RAW",
    resource: { values: [PHOTOS_HEADER] }
  }));
  state.drive.photosSheetReady = true;
}

function photoRowForFile(file, driveFile, existingRow = null) {
  const destination = file.match || state.jobs.find((entry) => entry.nodeId && entry.nodeId === file.nodeId) || {};
  const uploadedAt = file.uploadedAt || file.createdTime || nowIso();
  return [
    clean(existingRow?.[0]) || file.photoId || `photo-${file.id}`,
    file.id,
    driveFile?.name || file.name,
    file.nodeId || destination.nodeId,
    file.nodeName || destination.nodeName,
    file.floorId || destination.floorId,
    file.floorName || destination.floorName,
    file.projectId || destination.projectId,
    file.projectName || destination.projectName,
    file.uploadedByEmail || state.googleAuth.profile?.email || "",
    uploadedAt,
    driveFile?.mimeType || file.mimeType || "",
    driveFile?.webViewLink || file.webViewLink || "",
    driveFile?.thumbnailLink || file.thumbnailLink || ""
  ];
}

function updateLocalPhoto(row) {
  const photo = photoFromRow(Object.fromEntries(PHOTOS_HEADER.map((key, index) => [key, row[index] || ""])));
  const index = state.photos.findIndex((entry) => entry.driveFileId === photo.driveFileId);
  if (index >= 0) {
    state.photos[index] = photo;
  } else {
    state.photos.push(photo);
  }
}

async function appendSearchAudit(file, destinationFolderId, photosStatus) {
  if (!state.drive.uploadSheetId) return;
  await ensureSearchAuditSheet();
  await googleCall(() => gapi.client.sheets.spreadsheets.values.append({
    spreadsheetId: state.drive.uploadSheetId,
    range: sheetRange(SEARCH_AUDIT_TAB_NAME, "A1"),
    valueInputOption: "RAW",
    insertDataOption: "INSERT_ROWS",
    resource: {
      values: [[
        nowIso(),
        "Move confirmed",
        file.id,
        file.name,
        file.nodeId,
        file.nodeName,
        file.floorId,
        file.floorName,
        file.projectId,
        file.projectName,
        state.googleAuth.profile?.email || "",
        destinationFolderId,
        photosStatus
      ]]
    }
  }));
}

async function ensureSearchAuditSheet() {
  if (state.drive.searchAuditReady || !state.drive.uploadSheetId) return;
  const spreadsheet = await googleCall(() => gapi.client.sheets.spreadsheets.get({
    spreadsheetId: state.drive.uploadSheetId,
    fields: "sheets(properties(title))"
  }));
  const tabNames = new Set((spreadsheet.result.sheets || []).map((sheet) => sheet.properties?.title));
  if (!tabNames.has(SEARCH_AUDIT_TAB_NAME)) {
    await googleCall(() => gapi.client.sheets.spreadsheets.batchUpdate({
      spreadsheetId: state.drive.uploadSheetId,
      resource: { requests: [{ addSheet: { properties: { title: SEARCH_AUDIT_TAB_NAME } } }] }
    }));
  }
  await googleCall(() => gapi.client.sheets.spreadsheets.values.update({
    spreadsheetId: state.drive.uploadSheetId,
    range: sheetRange(SEARCH_AUDIT_TAB_NAME, "A1"),
    valueInputOption: "RAW",
    resource: { values: [SEARCH_AUDIT_HEADER] }
  }));
  state.drive.searchAuditReady = true;
}

async function ensureDestinationFolder(file) {
  const destination = file.match || state.jobs.find((entry) => entry.nodeId && entry.nodeId === file.nodeId) || {};
  const node = state.nodes.find((entry) => entry.nodeId && entry.nodeId === file.nodeId);
  const folderId = destination.nodeDriveFolderId || node?.driveFolderId || "";
  if (folderId) return folderId;
  throw new Error("Selected node does not have a Planner Drive folder ID yet. Open Planner, run Sync all folders, then reload Search.");
}

async function resolveProjectFolderId(project, file, destination) {
  const existingProjectFolderId = project?.driveFolderId || destination.projectDriveFolderId || "";
  if (existingProjectFolderId) return existingProjectFolderId;

  const isUnfiled = normalize(project?.folderGroup || file.folderGroup).includes("unfiled");
  const rootName = isUnfiled ? UNFILED_ROOT_NAME : PROJECTS_ROOT_NAME;
  const rootKey = isUnfiled ? "unfiledRootFolderId" : "projectsRootFolderId";
  state.drive[rootKey] = state.drive[rootKey] || await findOrCreateChildFolder(rootName, state.drive.rootFolderId);
  const rootId = state.drive[rootKey];
  const projectFolderName = folderNamePart(project?.name || file.projectName || "Unfiled Project");

  if (isUnfiled) {
    return findOrCreateChildFolder(projectFolderName, rootId);
  }

  const folderGroupName = folderNamePart(project?.folderGroup || file.folderGroup || "Projects");
  const folderRow = state.folders.find((folder) => normalize(folder.name) === normalize(folderGroupName));
  const folderGroupId = folderRow?.driveFolderId || await findOrCreateChildFolder(folderGroupName, rootId);
  return findOrCreateChildFolder(projectFolderName, folderGroupId);
}

function selectedProject(file) {
  return state.projects.find((project) => project.projectId === file.projectId) ||
    state.projects.find((project) => normalize(project.name) === normalize(file.projectName)) ||
    null;
}

function folderNamePart(value) {
  return clean(value).replace(/[\\/:*?"<>|]+/g, "-").replace(/\s+/g, " ").trim() || "Unfiled";
}

function copyDestinationAcross(source) {
  if (source.match) applyDestination(source, source.match);
  if (!source.projectId && !source.projectName) {
    toast("No destination to copy");
    return;
  }
  const addressKey = normalize(source.address);
  const typeKey = normalize(source.type);
  let count = 0;
  state.files.forEach((file) => {
    if (file.id === source.id) return;
    const sameAddress = normalize(file.address) === addressKey;
    const sameType = !typeKey || normalize(file.type) === typeKey;
    if (sameAddress && sameType) {
      file.projectId = source.projectId;
      file.projectName = source.projectName;
      file.folderGroup = source.folderGroup;
      file.floorId = source.floorId;
      file.floorName = source.floorName;
      file.nodeId = source.nodeId;
      file.nodeName = source.nodeName;
      file.category = source.category;
      file.lineItem = source.lineItem;
      matchFile(file);
      count += 1;
    }
  });
  toast(`Copied destination to ${count} file${count === 1 ? "" : "s"}`);
  render();
}

function openJobSheet() {
  if (!state.drive.jobSheetId) {
    toast(`${MASTER_SPREADSHEET_NAME} is still loading`);
    return;
  }
  window.open(`https://docs.google.com/spreadsheets/d/${state.drive.jobSheetId}/edit`, "_blank", "noopener");
}

function toast(message) {
  state.toast = message;
  window.clearTimeout(toast.timer);
  toast.timer = window.setTimeout(() => {
    state.toast = "";
    render();
  }, 2800);
}

render();
bootGoogle();
