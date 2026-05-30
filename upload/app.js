const CONFIG = window.NEILL_UPLOAD_CONFIG || {};
const DRIVE_ROOT_NAME = CONFIG.driveRootFolderName || "NeillPlanner";
const BATCH_FOLDER_NAME = CONFIG.batchFolderName || "Batch";
const PRIMARY_OWNER_EMAIL = (CONFIG.primaryOwnerEmail || "").toLowerCase();
const GOOGLE_SCOPES = (CONFIG.scopes || ["https://www.googleapis.com/auth/drive"]).join(" ");

const iconPaths = {
  upload: '<path d="M12 16V4"/><path d="m7 9 5-5 5 5"/><path d="M20 16v4H4v-4"/>',
  google: '<path d="M21.35 11.1H12v3.2h5.35c-.49 2.3-2.43 3.78-5.35 3.78-3.2 0-5.78-2.6-5.78-5.78s2.58-5.78 5.78-5.78c1.46 0 2.77.53 3.78 1.4l2.42-2.4A8.85 8.85 0 0 0 12 3.2a8.8 8.8 0 1 0 0 17.6c5.1 0 8.45-3.55 8.45-8.55 0-.6-.05-1.15-.1-1.15Z"/>',
  file: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z"/><path d="M14 2v6h6"/><path d="M9 15h6"/><path d="M9 18h4"/>',
  copy: '<rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>',
  check: '<path d="m20 6-11 11-5-5"/>',
  arrowRight: '<path d="M5 12h14"/><path d="m13 5 7 7-7 7"/>',
  refresh: '<path d="M21 12a9 9 0 1 1-3-6.7"/><path d="M21 3v6h-6"/>',
  plus: '<path d="M12 5v14"/><path d="M5 12h14"/>',
  trash: '<path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="M19 6l-1 15H6L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/>'
};

const state = {
  step: "welcome",
  filesChosen: false,
  items: [],
  invalid: {},
  toast: "",
  upload: { batchFolderName: "", completed: 0, total: 0, error: "" },
  googleAuth: {
    librariesReady: false,
    signedIn: false,
    accessToken: null,
    expiresAt: null,
    profile: null,
    bootstrapping: false,
    lastError: null
  },
  drive: { rootFolderId: null, batchFolderId: null, currentBatchFolderId: null }
};

let tokenClient = null;
let fileInput = null;

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

function uid(prefix) {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

function readableSize(bytes) {
  if (!bytes) return "0 KB";
  const units = ["B", "KB", "MB", "GB"];
  let size = bytes;
  let unit = 0;
  while (size >= 1024 && unit < units.length - 1) {
    size /= 1024;
    unit += 1;
  }
  return `${size >= 10 || unit === 0 ? Math.round(size) : size.toFixed(1)} ${units[unit]}`;
}

function nowStamp(date = new Date()) {
  const pad = (n) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}-${pad(date.getMinutes())}`;
}

function isPrimaryOwner() {
  return state.googleAuth.profile?.email?.toLowerCase() === PRIMARY_OWNER_EMAIL;
}

function isTokenValid() {
  return state.googleAuth.signedIn && state.googleAuth.accessToken && state.googleAuth.expiresAt && Date.now() < state.googleAuth.expiresAt - 30000;
}

function describeError(error) {
  if (!error) return "Unknown error";
  if (error.result?.error?.message) return error.result.error.message;
  if (error.message) return error.message;
  return String(error);
}

function authLabel() {
  if (state.googleAuth.bootstrapping) return "Connecting...";
  if (isTokenValid()) return state.googleAuth.profile?.name || state.googleAuth.profile?.email || "Connected";
  if (state.googleAuth.librariesReady) return "Google ready";
  return "Loading Google";
}

function authDotClass() {
  if (isTokenValid()) return "is-ready";
  if (state.googleAuth.lastError) return "is-warn";
  return "";
}

function render() {
  document.getElementById("app").innerHTML = `
    <main class="upload-shell">
      <div class="upload-frame">
        ${renderTopbar()}
        ${renderStep()}
      </div>
      ${state.toast ? `<div class="toast">${escapeHtml(state.toast)}</div>` : ""}
    </main>
  `;
  bindEvents();
}

function renderTopbar() {
  return `
    <header class="topbar">
      <div class="brand">
        <div class="brand-mark">N</div>
        <div>
          <h1>Neill Upload</h1>
          <p>${escapeHtml(DRIVE_ROOT_NAME)} / ${escapeHtml(BATCH_FOLDER_NAME)}</p>
        </div>
      </div>
      <div class="topbar-actions">
        <span class="status-chip"><span class="status-dot ${authDotClass()}"></span>${escapeHtml(authLabel())}</span>
        ${
          isTokenValid()
            ? `<button type="button" class="ghost-button" data-action="sign-out">${icon("refresh")}Switch account</button>`
            : `<button type="button" class="ghost-button" data-action="sign-in" ${state.googleAuth.librariesReady ? "" : "disabled"}>${icon("google")}Connect Google</button>`
        }
      </div>
    </header>
  `;
}

function renderStep() {
  if (state.step === "details") return renderDetails();
  if (state.step === "uploading") return renderUploading();
  if (state.step === "complete") return renderComplete();
  return renderWelcome();
}

function renderWelcome() {
  const selectedCount = state.items.length;
  return `
    <section class="hero">
      <div class="hero-card">
        <div class="hero-badge">${icon("upload")}</div>
        <h2>Upload</h2>
        <p>Send site photos and documents straight into the NeillPlanner batch folder.</p>
        <div class="hero-actions">
          <button type="button" class="primary-button" data-action="pick-files">${icon("upload")}Upload Files</button>
          <input class="hidden-input" type="file" multiple data-file-input />
        </div>
        ${
          selectedCount
            ? `<div class="selected-strip">
                <div>
                  <strong>${selectedCount} file${selectedCount === 1 ? "" : "s"} selected</strong>
                  <span>Ready for type, address, and room details.</span>
                </div>
                <button type="button" class="primary-button" data-action="next">${icon("arrowRight")}Next</button>
              </div>`
            : ""
        }
        ${state.googleAuth.lastError ? `<div class="error-text">${escapeHtml(state.googleAuth.lastError)}</div>` : ""}
      </div>
    </section>
  `;
}

function renderDetails() {
  return `
    <section class="view-panel">
      <div class="panel-header">
        <div class="panel-title">
          <h2>File details</h2>
          <p>${state.items.length} file${state.items.length === 1 ? "" : "s"} selected. Room number is optional.</p>
        </div>
        <div class="topbar-actions">
          <button type="button" class="ghost-button" data-action="pick-files">${icon("plus")}Add files</button>
          <input class="hidden-input" type="file" multiple data-file-input />
        </div>
      </div>
      <div class="details-table">
        <div class="details-head">
          <div>File</div>
          <div class="head-cell">Type <button type="button" class="copy-button" data-copy-field="type">${icon("copy")}Copy to all</button></div>
          <div class="head-cell">Address <button type="button" class="copy-button" data-copy-field="address">${icon("copy")}Copy to all</button></div>
          <div class="head-cell">Room <button type="button" class="copy-button" data-copy-field="room">${icon("copy")}Copy to all</button></div>
        </div>
        <div class="file-list">
          ${state.items.map(renderFileRow).join("")}
        </div>
      </div>
      <div class="batch-note">Uploads are saved in a dated folder inside ${escapeHtml(DRIVE_ROOT_NAME)} / ${escapeHtml(BATCH_FOLDER_NAME)}, with a manifest that records the details entered here.</div>
      <div class="footer-bar">
        <button type="button" class="ghost-button" data-action="back">Back</button>
        <button type="button" class="primary-button" data-action="upload" ${state.items.length ? "" : "disabled"}>${icon("upload")}Upload</button>
      </div>
    </section>
  `;
}

function renderFileRow(item) {
  return `
    <div class="file-row" data-item="${escapeHtml(item.id)}">
      <div class="thumb">
        <div class="thumb-preview">
          ${item.previewUrl ? `<img src="${escapeHtml(item.previewUrl)}" alt="" />` : icon("file")}
        </div>
        <div class="file-name">
          <strong title="${escapeHtml(item.file.name)}">${escapeHtml(item.file.name)}</strong>
          <span>${escapeHtml(readableSize(item.file.size))}</span>
        </div>
      </div>
      ${renderField(item, "type", "Type", "Thermostat")}
      ${renderField(item, "address", "Address", "12 Sample Street")}
      ${renderField(item, "room", "Room", "Apt 4 / Room 2")}
    </div>
  `;
}

function renderField(item, field, label, placeholder) {
  const key = `${item.id}:${field}`;
  return `
    <div class="field">
      <label for="${key}">${escapeHtml(label)}${field === "room" ? "" : " *"}</label>
      <input
        id="${key}"
        data-field="${escapeHtml(field)}"
        data-id="${escapeHtml(item.id)}"
        class="${state.invalid[key] ? "is-invalid" : ""}"
        value="${escapeHtml(item[field])}"
        placeholder="${escapeHtml(placeholder)}"
        ${field === "address" ? 'autocomplete="street-address"' : ""}
      />
    </div>
  `;
}

function renderUploading() {
  return `
    <section class="uploading-wrap">
      <div class="uploading-card">
        <div class="uploading-head">
          ${state.upload.error ? `<div class="done-mark is-error">${icon("refresh")}</div>` : `<div class="spinner"></div>`}
          <h2>${state.upload.error ? "Upload stopped" : "Uploading files"}</h2>
          <p>${state.upload.completed} of ${state.upload.total} complete</p>
        </div>
        <div class="progress-list">
          ${state.items.map(renderProgressItem).join("")}
        </div>
        ${
          state.upload.error
            ? `<div class="error-text">${escapeHtml(state.upload.error)}</div>
               <div class="error-actions">
                 <button type="button" class="ghost-button" data-action="edit-details">Edit details</button>
                 <button type="button" class="primary-button" data-action="retry-upload">${icon("upload")}Try again</button>
               </div>`
            : ""
        }
      </div>
    </section>
  `;
}

function renderProgressItem(item) {
  return `
    <div class="progress-item">
      <div class="progress-top">
        <strong>${escapeHtml(item.file.name)}</strong>
        <span class="progress-meta">${escapeHtml(item.status || "Waiting")}</span>
      </div>
      <div class="progress-track"><div class="progress-fill" style="--value:${Number(item.progress || 0)}%"></div></div>
    </div>
  `;
}

function renderComplete() {
  return `
    <section class="done-wrap">
      <div class="done-card">
        <div class="done-mark">${icon("check")}</div>
        <h2>Upload complete</h2>
        <p>Everything is saved in ${escapeHtml(DRIVE_ROOT_NAME)} / ${escapeHtml(BATCH_FOLDER_NAME)}. You can safely leave this page.</p>
        <button type="button" class="primary-button" data-action="new-batch">${icon("upload")}Upload More Files</button>
      </div>
    </section>
  `;
}

function bindEvents() {
  document.querySelectorAll("[data-action]").forEach((button) => button.addEventListener("click", () => handleAction(button.dataset.action)));
  document.querySelectorAll("[data-field]").forEach((input) => input.addEventListener("input", () => updateField(input)));
  document.querySelectorAll("[data-copy-field]").forEach((button) => button.addEventListener("click", () => copyFieldToAll(button.dataset.copyField)));
  fileInput = document.querySelector("[data-file-input]");
  if (fileInput) fileInput.addEventListener("change", (event) => handleFiles(event.target.files));
}

function handleAction(action) {
  if (action === "pick-files") return fileInput?.click();
  if (action === "next") return goToDetails();
  if (action === "back") { state.step = "welcome"; render(); return; }
  if (action === "upload") return uploadBatch();
  if (action === "retry-upload") return uploadBatch();
  if (action === "edit-details") { state.step = "details"; render(); return; }
  if (action === "new-batch") return resetBatch();
  if (action === "sign-in") return signIn();
  if (action === "sign-out") return signOut();
}

function handleFiles(fileList) {
  const files = Array.from(fileList || []);
  if (!files.length) return;
  const newItems = files.map((file) => ({
    id: uid("file"),
    file,
    previewUrl: file.type.startsWith("image/") ? URL.createObjectURL(file) : "",
    type: "",
    address: "",
    room: "",
    status: "Waiting",
    progress: 0,
    result: null,
    error: ""
  }));
  state.items.push(...newItems);
  state.filesChosen = true;
  state.invalid = {};
  toast(`${files.length} file${files.length === 1 ? "" : "s"} selected`);
  render();
}

function goToDetails() {
  if (!state.items.length) {
    toast("Choose at least one file first");
    return;
  }
  state.step = "details";
  render();
}

function updateField(input) {
  const item = state.items.find((entry) => entry.id === input.dataset.id);
  if (!item) return;
  item[input.dataset.field] = input.value;
  delete state.invalid[`${item.id}:${input.dataset.field}`];
}

function copyFieldToAll(field) {
  const first = state.items.find((item) => String(item[field] || "").trim());
  if (!first) {
    toast(`Fill in a ${field} first`);
    return;
  }
  state.items.forEach((item) => {
    item[field] = first[field];
    delete state.invalid[`${item.id}:${field}`];
  });
  toast(`${field[0].toUpperCase()}${field.slice(1)} copied to all files`);
  render();
}

function validateItems() {
  const invalid = {};
  state.items.forEach((item) => {
    if (!item.type.trim()) invalid[`${item.id}:type`] = true;
    if (!item.address.trim()) invalid[`${item.id}:address`] = true;
  });
  state.invalid = invalid;
  return Object.keys(invalid).length === 0;
}

function resetBatch() {
  state.items.forEach((item) => {
    if (item.previewUrl) URL.revokeObjectURL(item.previewUrl);
  });
  state.step = "welcome";
  state.filesChosen = false;
  state.items = [];
  state.invalid = {};
  state.upload = { batchFolderName: "", completed: 0, total: 0, error: "" };
  state.drive.currentBatchFolderId = null;
  render();
}

function toast(message) {
  state.toast = message;
  window.clearTimeout(toast.timer);
  toast.timer = window.setTimeout(() => {
    state.toast = "";
    render();
  }, 2800);
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
  state.drive = { rootFolderId: null, batchFolderId: null, currentBatchFolderId: null };
  toast("Google account disconnected");
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
  try {
    await ensureDriveReady();
    toast(`Connected to ${DRIVE_ROOT_NAME}`);
  } catch (error) {
    state.googleAuth.lastError = describeError(error);
  }
  state.googleAuth.bootstrapping = false;
  render();
}

async function fetchProfile() {
  try {
    const response = await fetch("https://openidconnect.googleapis.com/v1/userinfo", {
      headers: { Authorization: `Bearer ${state.googleAuth.accessToken}` }
    });
    if (response.ok) state.googleAuth.profile = await response.json();
  } catch (error) {}
}

async function ensureDriveReady() {
  if (!isTokenValid()) throw new Error("Connect Google before uploading");
  if (!state.drive.rootFolderId) state.drive.rootFolderId = await findOrCreateRootFolder();
  if (!state.drive.batchFolderId) state.drive.batchFolderId = await findOrCreateChildFolder(BATCH_FOLDER_NAME, state.drive.rootFolderId);
  return state.drive.batchFolderId;
}

function escapeDriveQuery(value) {
  return String(value).replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}

async function findOrCreateRootFolder() {
  const ownerClause = isPrimaryOwner() ? "'me' in owners" : `'${escapeDriveQuery(PRIMARY_OWNER_EMAIL)}' in owners`;
  const q = `name='${escapeDriveQuery(DRIVE_ROOT_NAME)}' and mimeType='application/vnd.google-apps.folder' and ${ownerClause} and trashed=false`;
  const list = await gapi.client.drive.files.list({ q, fields: "files(id,name,owners)", pageSize: 5 });
  if (list.result.files?.length) return list.result.files[0].id;
  if (!isPrimaryOwner()) throw new Error(`No ${DRIVE_ROOT_NAME} folder shared with this account yet`);
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

function arrayBufferToBase64(buffer) {
  let binary = "";
  const bytes = new Uint8Array(buffer);
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

function safeNamePart(value) {
  return String(value || "")
    .trim()
    .replace(/[\\/:*?"<>|#%{}~&]/g, "-")
    .replace(/\s+/g, " ")
    .slice(0, 80);
}

function appPropertyValue(value) {
  return String(value || "").trim().slice(0, 120);
}

function buildDriveFileName(item, index) {
  const extMatch = item.file.name.match(/(\.[^.]+)$/);
  const ext = extMatch ? extMatch[1] : "";
  const baseName = item.file.name.replace(/(\.[^.]+)$/, "");
  const parts = [
    String(index + 1).padStart(2, "0"),
    safeNamePart(item.type),
    safeNamePart(item.address),
    item.room ? safeNamePart(item.room) : "",
    safeNamePart(baseName)
  ].filter(Boolean);
  return `${parts.join(" - ")}${ext}`;
}

async function uploadFileToDrive(file, parentFolderId, metadata) {
  if (!parentFolderId) throw new Error("No parent folder");
  const base64 = arrayBufferToBase64(await file.arrayBuffer());
  const boundary = "neill-upload-" + Math.random().toString(36).slice(2);
  const body = `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n--${boundary}\r\nContent-Type: ${file.type || "application/octet-stream"}\r\nContent-Transfer-Encoding: base64\r\n\r\n${base64}\r\n--${boundary}--`;
  const response = await gapi.client.request({
    path: "/upload/drive/v3/files",
    method: "POST",
    params: { uploadType: "multipart", fields: "id,name,webViewLink,thumbnailLink,mimeType,iconLink" },
    headers: { "Content-Type": `multipart/related; boundary="${boundary}"` },
    body
  });
  return response.result;
}

function itemDescription(item) {
  return [
    `Type: ${item.type.trim()}`,
    `Address: ${item.address.trim()}`,
    `Room: ${item.room.trim() || "Not provided"}`,
    `Original file: ${item.file.name}`,
    `Uploaded from Neill Upload: ${new Date().toISOString()}`
  ].join("\n");
}

async function uploadBatch() {
  if (!validateItems()) {
    toast("Type and address are required for every file");
    render();
    return;
  }
  if (!isTokenValid()) {
    toast("Connect Google before uploading");
    signIn();
    return;
  }

  state.step = "uploading";
  state.upload = { batchFolderName: nowStamp(), completed: 0, total: state.items.length, error: "" };
  state.items.forEach((item) => {
    item.status = "Waiting";
    item.progress = 0;
    item.error = "";
  });
  render();

  try {
    const batchRootId = await ensureDriveReady();
    const runFolderName = `${state.upload.batchFolderName} Upload`;
    const runFolderId = await findOrCreateChildFolder(runFolderName, batchRootId);
    state.drive.currentBatchFolderId = runFolderId;

    const manifest = {
      batchName: runFolderName,
      uploadedAt: new Date().toISOString(),
      uploadedBy: state.googleAuth.profile?.email || "",
      rootFolderName: DRIVE_ROOT_NAME,
      batchFolderName: BATCH_FOLDER_NAME,
      files: []
    };

    for (const [index, item] of state.items.entries()) {
      item.status = "Preparing";
      item.progress = 18;
      render();

      const fileName = buildDriveFileName(item, index);
      const driveMetadata = {
        name: fileName,
        parents: [runFolderId],
        description: itemDescription(item),
        appProperties: {
          source: "Neill Upload",
          originalName: appPropertyValue(item.file.name),
          type: appPropertyValue(item.type),
          address: appPropertyValue(item.address),
          room: appPropertyValue(item.room),
          batchName: appPropertyValue(runFolderName)
        }
      };

      item.status = "Uploading";
      item.progress = 62;
      render();

      const result = await uploadFileToDrive(item.file, runFolderId, driveMetadata);
      item.result = result;
      item.status = "Done";
      item.progress = 100;
      state.upload.completed += 1;
      manifest.files.push({
        driveFileId: result.id,
        driveName: result.name,
        webViewLink: result.webViewLink || "",
        originalName: item.file.name,
        size: item.file.size,
        mimeType: item.file.type || result.mimeType || "",
        type: item.type.trim(),
        address: item.address.trim(),
        room: item.room.trim()
      });
      render();
    }

    const manifestFile = new File([JSON.stringify(manifest, null, 2)], "_batch-manifest.json", { type: "application/json" });
    await uploadFileToDrive(manifestFile, runFolderId, {
      name: "_batch-manifest.json",
      parents: [runFolderId],
      description: "Neill Upload batch manifest",
      appProperties: { source: "Neill Upload", batchName: appPropertyValue(runFolderName), type: "manifest" }
    });

    state.step = "complete";
    render();
  } catch (error) {
    const active = state.items.find((item) => item.status === "Preparing" || item.status === "Uploading");
    if (active) {
      active.status = "Failed";
      active.error = describeError(error);
    }
    state.upload.error = `Upload failed: ${describeError(error)}`;
    toast("Upload failed");
    render();
  }
}

render();
bootGoogle();
