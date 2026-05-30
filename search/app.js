const CONFIG = window.SEARCH_CONFIG || {};
const DRIVE_ROOT_NAME = CONFIG.driveRootFolderName || "NeillPlanner";
const BATCH_FOLDER_NAME = CONFIG.batchFolderName || "Batch";
const FILED_FOLDER_NAME = CONFIG.filedFolderName || "Filed Jobs";
const UPLOAD_SHEET_NAME = CONFIG.uploadSheetName || "Upload Log";
const JOB_SHEET_NAME = CONFIG.jobSheetName || "Job Index";
const ADMIN_EMAIL = (CONFIG.adminEmail || "brandon.j.neill@gmail.com").toLowerCase();
const GOOGLE_SCOPES = (CONFIG.scopes || ["https://www.googleapis.com/auth/drive", "https://www.googleapis.com/auth/spreadsheets"]).join(" ");
const UPLOAD_TAB_NAME = "Uploads";
const JOB_EXAMPLE_TAB = "Example Job";
const JOB_HEADER = ["Address", "Room Number", "Confirmed Room Number", "Location", "Area", "Floor", "Job Folder Name", "Notes"];

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
  filters: { query: "", status: "all", type: "all", job: "all" },
  drive: { rootFolderId: null, batchFolderId: null, filedFolderId: null, uploadSheetId: null, jobSheetId: null },
  files: [],
  uploadRows: [],
  jobs: [],
  jobTabs: []
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

function isTokenValid() {
  return state.googleAuth.signedIn && state.googleAuth.accessToken && state.googleAuth.expiresAt && Date.now() < state.googleAuth.expiresAt - 30000;
}

function isAdmin() {
  return state.googleAuth.profile?.email?.toLowerCase() === ADMIN_EMAIL;
}

function sheetRange(tabName, range) {
  return `'${String(tabName).replaceAll("'", "''")}'!${range}`;
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
        <p>Sign in to review uploaded batch files, match rooms, edit details, and file images into job folders.</p>
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
          <button type="button" class="ghost-button" data-action="open-job-sheet">${icon("file")}Job Sheet</button>
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
          <div class="search-wrap"><input data-filter="query" value="${escapeHtml(state.filters.query)}" placeholder="Search file, address, room, location, type..." /></div>
          <select data-filter="status">
            ${filterOption("all", "All statuses", state.filters.status)}
            ${filterOption("matched", "Matched rooms", state.filters.status)}
            ${filterOption("unmatched", "Unmatched", state.filters.status)}
            ${filterOption("moved", "Moved", state.filters.status)}
          </select>
          <select data-filter="type">
            ${filterOption("all", "All types", state.filters.type)}
            ${uniqueTypes().map((type) => filterOption(type, type, state.filters.type)).join("")}
          </select>
          <select data-filter="job">
            ${filterOption("all", "All jobs", state.filters.job)}
            ${state.jobTabs.map((job) => filterOption(job, job, state.filters.job)).join("")}
          </select>
        </div>
      </div>
      ${state.loading ? renderEmpty("Scanning...", "Reading the batch folder and job sheet.") : (files.length ? `<div class="file-grid">${files.map(renderFileCard).join("")}</div>` : renderEmpty("No files found", "Try a different search, or upload files into the batch folder first."))}
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
          ${renderField(file, "type", "Type", "Thermostat")}
          ${renderField(file, "room", "Room", "101")}
          ${renderField(file, "confirmedRoom", "Confirmed Room", "101")}
          ${renderField(file, "location", "Location", "Level 1")}
          ${renderField(file, "address", "Address", "Street address", "full")}
          <div class="field">
            <label>Job</label>
            <select data-file-field="jobName" data-id="${escapeHtml(file.id)}">
              ${filterOption("", "Choose job", file.jobName)}
              ${state.jobTabs.map((job) => filterOption(job, job, file.jobName)).join("")}
            </select>
          </div>
        </div>
        ${renderMatchBox(file)}
        <div class="card-actions">
          <button type="button" class="ghost-button" data-action-file="save" data-id="${escapeHtml(file.id)}">${icon("save")}Save</button>
          <div class="button-row">
            <button type="button" class="ghost-button" data-action-file="open" data-id="${escapeHtml(file.id)}">Open</button>
            <button type="button" class="primary-button" data-action-file="move" data-id="${escapeHtml(file.id)}" ${file.jobName ? "" : "disabled"}>${icon("move")}Move</button>
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

function renderMatchBox(file) {
  if (!file.match) {
    return `<div class="match-box"><span class="card-subtle">No identical room match found for this address yet.</span></div>`;
  }
  return `
    <div class="match-box is-good">
      <strong>${escapeHtml(file.match.jobName)} match</strong>
      <span class="card-subtle">${escapeHtml(file.match.address)} - room ${escapeHtml(file.match.roomNumber)}${file.match.confirmedRoom ? ` - confirmed ${escapeHtml(file.match.confirmedRoom)}` : ""}</span>
      <button type="button" class="copy-button" data-action-file="copy-confirmed" data-id="${escapeHtml(file.id)}">${icon("copy")}Copy confirmed across</button>
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
      file[input.dataset.fileField] = input.value;
      matchFile(file);
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
  if (action === "copy-confirmed") return copyConfirmedAcross(file);
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
    const [uploadRows, jobs, files] = await Promise.all([
      loadUploadRows(),
      loadJobs(),
      loadBatchFiles()
    ]);
    state.uploadRows = uploadRows;
    state.jobs = jobs;
    state.jobTabs = [...new Set(jobs.map((job) => job.jobName))].sort((a, b) => a.localeCompare(b));
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
  state.drive.filedFolderId = state.drive.filedFolderId || await findOrCreateChildFolder(FILED_FOLDER_NAME, state.drive.rootFolderId);
  state.drive.uploadSheetId = state.drive.uploadSheetId || await findSheetInFolder(UPLOAD_SHEET_NAME, state.drive.batchFolderId);
  state.drive.jobSheetId = state.drive.jobSheetId || await ensureJobSheet(state.drive.rootFolderId);
}

async function findRootFolder() {
  const q = `name='${escapeDriveQuery(DRIVE_ROOT_NAME)}' and mimeType='application/vnd.google-apps.folder' and '${escapeDriveQuery(ADMIN_EMAIL)}' in owners and trashed=false`;
  const list = await gapi.client.drive.files.list({ q, fields: "files(id,name)", pageSize: 5 });
  if (list.result.files?.length) return list.result.files[0].id;
  const create = await gapi.client.drive.files.create({
    resource: { name: DRIVE_ROOT_NAME, mimeType: "application/vnd.google-apps.folder" },
    fields: "id"
  });
  return create.result.id;
}

async function findChildFolder(name, parentId) {
  const q = `name='${escapeDriveQuery(name)}' and mimeType='application/vnd.google-apps.folder' and '${parentId}' in parents and trashed=false`;
  const list = await gapi.client.drive.files.list({ q, fields: "files(id,name)", pageSize: 5 });
  return list.result.files?.[0]?.id || null;
}

async function findOrCreateChildFolder(name, parentId) {
  const existing = await findChildFolder(name, parentId);
  if (existing) return existing;
  const create = await gapi.client.drive.files.create({
    resource: { name, mimeType: "application/vnd.google-apps.folder", parents: [parentId] },
    fields: "id"
  });
  return create.result.id;
}

async function findSheetInFolder(name, parentId) {
  const q = `name='${escapeDriveQuery(name)}' and mimeType='application/vnd.google-apps.spreadsheet' and '${parentId}' in parents and trashed=false`;
  const list = await gapi.client.drive.files.list({ q, fields: "files(id,name,webViewLink)", pageSize: 5 });
  return list.result.files?.[0]?.id || null;
}

async function ensureJobSheet(parentId) {
  const existing = await findSheetInFolder(JOB_SHEET_NAME, parentId);
  if (existing) {
    await ensureJobSheetStructure(existing);
    return existing;
  }
  const created = await gapi.client.sheets.spreadsheets.create({
    resource: {
      properties: { title: JOB_SHEET_NAME },
      sheets: [{ properties: { title: JOB_EXAMPLE_TAB } }]
    },
    fields: "spreadsheetId"
  });
  const sheetId = created.result.spreadsheetId;
  const meta = await gapi.client.drive.files.get({ fileId: sheetId, fields: "parents" });
  await gapi.client.drive.files.update({
    fileId: sheetId,
    addParents: parentId,
    removeParents: (meta.result.parents || []).join(","),
    fields: "id,parents"
  });
  await ensureJobSheetStructure(sheetId);
  return sheetId;
}

async function ensureJobSheetStructure(spreadsheetId) {
  const spreadsheet = await gapi.client.sheets.spreadsheets.get({
    spreadsheetId,
    fields: "sheets(properties(title))"
  });
  const tabNames = new Set((spreadsheet.result.sheets || []).map((sheet) => sheet.properties?.title));
  if (!tabNames.has(JOB_EXAMPLE_TAB)) {
    await gapi.client.sheets.spreadsheets.batchUpdate({
      spreadsheetId,
      resource: { requests: [{ addSheet: { properties: { title: JOB_EXAMPLE_TAB } } }] }
    });
  }
  const current = await gapi.client.sheets.spreadsheets.values.get({
    spreadsheetId,
    range: sheetRange(JOB_EXAMPLE_TAB, "A1:H4")
  });
  if (!current.result.values?.length) {
    await gapi.client.sheets.spreadsheets.values.update({
      spreadsheetId,
      range: sheetRange(JOB_EXAMPLE_TAB, "A1"),
      valueInputOption: "RAW",
      resource: {
        values: [
          JOB_HEADER,
          ["1 Example Street, Melbourne VIC", "101", "101", "North side", "Apartments", "Level 1", "Example Job", "Replace this tab with a real job name"],
          ["1 Example Street, Melbourne VIC", "102", "102", "South side", "Apartments", "Level 1", "Example Job", "Add one row per room"],
          ["25 Sample Road, Geelong VIC", "A-01", "A-01", "Main entry", "Townhouses", "Ground", "Example Job", "Confirmed Room Number is used for green matches"]
        ]
      }
    });
  }
}

async function loadUploadRows() {
  if (!state.drive.uploadSheetId) return [];
  try {
    const response = await gapi.client.sheets.spreadsheets.values.get({
      spreadsheetId: state.drive.uploadSheetId,
      range: sheetRange(UPLOAD_TAB_NAME, "A1:R")
    });
    return rowsToObjects(response.result.values || []);
  } catch (error) {
    return [];
  }
}

async function loadJobs() {
  const spreadsheet = await gapi.client.sheets.spreadsheets.get({
    spreadsheetId: state.drive.jobSheetId,
    fields: "sheets(properties(title))"
  });
  const tabs = (spreadsheet.result.sheets || []).map((sheet) => sheet.properties?.title).filter(Boolean);
  const jobs = [];
  for (const tab of tabs) {
    const response = await gapi.client.sheets.spreadsheets.values.get({
      spreadsheetId: state.drive.jobSheetId,
      range: sheetRange(tab, "A1:H")
    });
    const rows = rowsToObjects(response.result.values || []);
    rows.forEach((row) => {
      const address = clean(row.Address);
      const roomNumber = clean(row["Room Number"]);
      const confirmedRoom = clean(row["Confirmed Room Number"]);
      if (!address || (!roomNumber && !confirmedRoom)) return;
      jobs.push({
        jobName: tab,
        address,
        roomNumber,
        confirmedRoom,
        location: clean(row.Location),
        area: clean(row.Area),
        floor: clean(row.Floor),
        folderName: clean(row["Job Folder Name"]) || tab,
        notes: clean(row.Notes),
        addressKey: normalize(address),
        roomKey: normalizeRoom(confirmedRoom || roomNumber)
      });
    });
  }
  return jobs;
}

function rowsToObjects(values) {
  const [header, ...rows] = values;
  if (!header) return [];
  return rows.map((row) => Object.fromEntries(header.map((key, index) => [key, row[index] ?? ""])));
}

async function loadBatchFiles() {
  const files = [];
  let pageToken = null;
  do {
    const response = await gapi.client.drive.files.list({
      q: `'${state.drive.batchFolderId}' in parents and trashed=false and mimeType!='application/vnd.google-apps.folder' and mimeType!='application/vnd.google-apps.spreadsheet'`,
      fields: "nextPageToken,files(id,name,mimeType,thumbnailLink,webViewLink,createdTime,modifiedTime,description,appProperties,parents,size,iconLink)",
      pageSize: 100,
      pageToken
    });
    files.push(...(response.result.files || []));
    pageToken = response.result.nextPageToken || null;
  } while (pageToken);
  return files;
}

function enrichFile(file) {
  const upload = state.uploadRows.find((row) => row["Drive File ID"] === file.id) || {};
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
    confirmedRoom: clean(file.appProperties?.confirmedRoom || upload["Confirmed Room Number"] || upload.Room),
    location: clean(file.appProperties?.location || upload.Location),
    jobName: clean(file.appProperties?.jobName),
    match: null
  };
}

function matchFile(file) {
  const addressKey = normalize(file.address);
  const roomKey = normalizeRoom(file.confirmedRoom || file.room);
  file.match = state.jobs.find((job) => job.addressKey === addressKey && job.roomKey === roomKey) || null;
  if (file.match && !file.jobName) file.jobName = file.match.jobName;
  if (file.match && !file.confirmedRoom) file.confirmedRoom = file.match.confirmedRoom || file.match.roomNumber;
  return file.match;
}

function filteredFiles() {
  const query = normalize(state.filters.query);
  return state.files.filter((file) => {
    const text = normalize([file.name, file.type, file.address, file.room, file.confirmedRoom, file.location, file.jobName].join(" "));
    const inQuery = !query || text.includes(query);
    const inStatus =
      state.filters.status === "all" ||
      (state.filters.status === "matched" && file.match) ||
      (state.filters.status === "unmatched" && !file.match && file.status !== "moved") ||
      (state.filters.status === "moved" && file.status === "moved");
    const inType = state.filters.type === "all" || file.type === state.filters.type;
    const inJob = state.filters.job === "all" || file.jobName === state.filters.job;
    return inQuery && inStatus && inType && inJob;
  });
}

function uniqueTypes() {
  return [...new Set(state.files.map((file) => file.type).filter(Boolean))].sort((a, b) => a.localeCompare(b));
}

function getMetrics() {
  const total = state.files.length;
  const moved = state.files.filter((file) => file.status === "moved").length;
  const matched = state.files.filter((file) => file.match).length;
  return { total, moved, matched, unmatched: total - matched - moved };
}

async function saveFileMetadata(file) {
  matchFile(file);
  try {
    await gapi.client.drive.files.update({
      fileId: file.id,
      resource: {
        description: fileDescription(file),
        appProperties: {
          source: "Search",
          fileType: appPropertyValue(file.type),
          address: appPropertyValue(file.address),
          room: appPropertyValue(file.room),
          confirmedRoom: appPropertyValue(file.confirmedRoom),
          location: appPropertyValue(file.location),
          jobName: appPropertyValue(file.jobName),
          lastEditedAt: nowIso()
        }
      },
      fields: "id,description,appProperties"
    });
    toast("Details saved");
  } catch (error) {
    toast(`Save failed: ${describeError(error)}`);
  }
}

function fileDescription(file) {
  return [
    `Type: ${file.type}`,
    `Address: ${file.address}`,
    `Room: ${file.room}`,
    `Confirmed Room: ${file.confirmedRoom}`,
    `Location: ${file.location}`,
    `Job: ${file.jobName}`,
    `Edited: ${nowIso()}`
  ].join("\n");
}

async function moveFileToJob(file) {
  matchFile(file);
  if (!file.jobName) {
    toast("Choose a job before moving");
    return;
  }
  try {
    await saveFileMetadata(file);
    const destination = await ensureDestinationFolder(file);
    const response = await gapi.client.drive.files.update({
      fileId: file.id,
      addParents: destination,
      removeParents: state.drive.batchFolderId,
      fields: "id,parents"
    });
    file.parents = response.result.parents || [];
    file.status = "moved";
    toast("File moved");
    render();
  } catch (error) {
    toast(`Move failed: ${describeError(error)}`);
  }
}

async function ensureDestinationFolder(file) {
  const job = file.match || state.jobs.find((entry) => entry.jobName === file.jobName);
  const jobFolderName = clean(job?.folderName || file.jobName || "Unfiled Job");
  const addressFolderName = clean(file.address) || "No Address";
  const roomFolderName = clean(file.confirmedRoom || file.room) || "No Room";
  const jobRoot = await findOrCreateChildFolder(jobFolderName, state.drive.filedFolderId);
  const addressFolder = await findOrCreateChildFolder(addressFolderName, jobRoot);
  return findOrCreateChildFolder(roomFolderName, addressFolder);
}

function copyConfirmedAcross(source) {
  const value = clean(source.confirmedRoom || source.match?.confirmedRoom || source.match?.roomNumber);
  if (!value) {
    toast("No confirmed room to copy");
    return;
  }
  const addressKey = normalize(source.address);
  const roomKey = normalizeRoom(source.room);
  let count = 0;
  state.files.forEach((file) => {
    if (file.id === source.id) return;
    const sameAddress = normalize(file.address) === addressKey;
    const sameRoom = normalizeRoom(file.room) === roomKey || !file.confirmedRoom;
    if (sameAddress && sameRoom) {
      file.confirmedRoom = value;
      matchFile(file);
      count += 1;
    }
  });
  toast(`Copied confirmed room to ${count} file${count === 1 ? "" : "s"}`);
  render();
}

function openJobSheet() {
  if (!state.drive.jobSheetId) {
    toast("Job sheet is still loading");
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
