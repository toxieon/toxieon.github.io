const CONFIG = window.UPLOAD_CONFIG || {};
const DRIVE_ROOT_NAME = CONFIG.driveRootFolderName || "NeillPlanner";
const BATCH_FOLDER_NAME = CONFIG.batchFolderName || "Batch";
const UPLOAD_SHEET_NAME = CONFIG.uploadSheetName || "Upload Log";
const DESTINATION_OWNER_EMAIL = (CONFIG.destinationOwnerEmail || CONFIG.primaryOwnerEmail || "brandon.j.neill@gmail.com").toLowerCase();
const ADDRESS_COUNTRY = CONFIG.addressCountry || "au";
const VICTORIA_ADDRESS_BOUNDS = { south: -39.25, west: 140.85, north: -33.85, east: 150.1 };
const GOOGLE_SCOPES = (CONFIG.scopes || ["https://www.googleapis.com/auth/drive", "https://www.googleapis.com/auth/spreadsheets"]).join(" ");
const SHEET_TAB_NAME = "Uploads";
const TERMS_TAB_NAME = "Terms Acceptance";
const TERMS_VERSION = "2026-05-30-v2";
const TERMS_STORAGE_PREFIX = "upload-terms-accepted:";
const SHEET_HEADER = [
  "Timestamp",
  "Uploaded By Email",
  "Uploaded By Name",
  "Original File Name",
  "Drive File Name",
  "Drive File ID",
  "Drive Web Link",
  "Thumbnail Link",
  "Size Bytes",
  "MIME Type",
  "File Type",
  "Address",
  "Room",
  "Location",
  "Status",
  "Duplicate Match File ID",
  "Duplicate Match Link",
  "Content SHA-256"
];
const TERMS_HEADER = [
  "Timestamp",
  "User Email",
  "User Name",
  "Accepted",
  "Terms Version",
  "User Agent"
];

const iconPaths = {
  upload: '<path d="M12 16V4"/><path d="m7 9 5-5 5 5"/><path d="M20 16v4H4v-4"/>',
  google: '<path d="M21.35 11.1H12v3.2h5.35c-.49 2.3-2.43 3.78-5.35 3.78-3.2 0-5.78-2.6-5.78-5.78s2.58-5.78 5.78-5.78c1.46 0 2.77.53 3.78 1.4l2.42-2.4A8.85 8.85 0 0 0 12 3.2a8.8 8.8 0 1 0 0 17.6c5.1 0 8.45-3.55 8.45-8.55 0-.6-.05-1.15-.1-1.15Z"/>',
  file: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z"/><path d="M14 2v6h6"/><path d="M9 15h6"/><path d="M9 18h4"/>',
  copy: '<rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>',
  check: '<path d="m20 6-11 11-5-5"/>',
  arrowRight: '<path d="M5 12h14"/><path d="m13 5 7 7-7 7"/>',
  refresh: '<path d="M21 12a9 9 0 1 1-3-6.7"/><path d="M21 3v6h-6"/>',
  plus: '<path d="M12 5v14"/><path d="M5 12h14"/>',
  close: '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>',
  trash: '<path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="M19 6l-1 15H6L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/>'
};

const state = {
  step: "welcome",
  filesChosen: false,
  items: [],
  /* v1.0 §4.1A — sticky detail header. apply[field]=true means the header
   * value is the batch default and rows inherit (greyed). Toggling OFF
   * makes that field per-image editable. */
  header: {
    values: { type: "", address: "", room: "", location: "" },
    apply: { type: true, address: true, room: true, location: true },
    detectedAddress: false
  },
  invalid: {},
  lightbox: null,
  toast: "",
  termsRequired: false,
  termsAccepted: false,
  termsExpanded: false,
  termsChecking: false,
  upload: { completed: 0, total: 0, error: "", cancelRequested: false },
  googleAuth: {
    librariesReady: false,
    signedIn: false,
    accessToken: null,
    expiresAt: null,
    profile: null,
    bootstrapping: false,
    lastError: null
  },
  drive: { rootFolderId: null, batchFolderId: null, sheetId: null },
  places: { loading: false, ready: false, error: "" }
};

let fileInput = null;
let placesPromise = null;
let termsCheckPromise = null;

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
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

function isDestinationOwner() {
  return state.googleAuth.profile?.email?.toLowerCase() === DESTINATION_OWNER_EMAIL;
}

function isTokenValid() {
  return state.googleAuth.signedIn && state.googleAuth.accessToken && state.googleAuth.expiresAt && Date.now() < state.googleAuth.expiresAt - 30000;
}

function isDesktopUploader() {
  const hasFinePointer = window.matchMedia?.("(hover: hover) and (pointer: fine)")?.matches;
  const looksMobile = /Mobi|Android|iPhone|iPad|iPod/i.test(navigator.userAgent || "");
  return Boolean(hasFinePointer && !looksMobile);
}

function describeError(error) {
  if (!error) return "Unknown error";
  if (error.result?.error?.message) return error.result.error.message;
  if (error.message) return error.message;
  return String(error);
}

function termsKey(email) {
  return `${TERMS_STORAGE_PREFIX}${String(email || "").toLowerCase()}`;
}

function readTermsAccepted(email) {
  try {
    return localStorage.getItem(termsKey(email)) === "yes";
  } catch (error) {
    return false;
  }
}

function saveTermsAccepted(email) {
  try {
    localStorage.setItem(termsKey(email), "yes");
  } catch (error) {}
}

function render() {
  document.getElementById("app").innerHTML = `
    <main class="upload-shell">
      <div class="upload-frame">
        ${renderTopbar()}
        ${renderStep()}
      </div>
      <footer class="creator-footnote">Created by Brandon Neill 🇦🇺</footer>
      ${state.lightbox ? renderLightbox() : ""}
      ${state.termsRequired ? renderTermsModal() : ""}
      ${state.toast ? `<div class="toast">${escapeHtml(state.toast)}</div>` : ""}
    </main>
  `;
  bindEvents();
}

function renderTopbar() {
  return `
    <header class="topbar">
      <div class="brand">
        <div class="brand-mark">NU</div>
        <div>
          <h1>Neill Uploader</h1>
        </div>
      </div>
      <div class="topbar-actions">
        ${
          isTokenValid()
            ? `<button type="button" class="ghost-button" data-action="sign-out">${icon("refresh")}Switch account</button>`
            : `<button type="button" class="ghost-button" data-action="sign-in" ${state.googleAuth.librariesReady ? "" : "disabled"}>${icon("google")}Sign In</button>`
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
  const desktopDrop = isDesktopUploader();
  return `
    <section class="hero">
      <div class="hero-card">
        <div class="hero-badge">${icon("upload")}</div>
        <h2>Upload Files</h2>
        <p>Add photos or documents, enter the required job details, and submit them in one batch.</p>
        ${
          desktopDrop
            ? `<div class="drop-zone" data-drop-zone>
                <div class="drop-zone-icon">${icon("upload")}</div>
                <strong>Drop files here</strong>
                <span>or select them from your computer</span>
                <button type="button" class="primary-button" data-action="pick-files">${icon("upload")}Select Files</button>
                <input class="hidden-input" type="file" multiple data-file-input />
              </div>`
            : `<div class="hero-actions">
                <button type="button" class="primary-button" data-action="pick-files">${icon("upload")}Upload Files</button>
                <input class="hidden-input" type="file" multiple data-file-input />
              </div>`
        }
        ${
          selectedCount
            ? `<div class="selected-strip">
                <div>
                  <strong>${selectedCount} file${selectedCount === 1 ? "" : "s"} selected</strong>
                  <span>Ready for type, address, room, and location details.</span>
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
  const missing = countMissingRequired();
  return `
    <section class="view-panel">
      <div class="panel-header">
        <div class="panel-title">
          <h2>File details</h2>
          <p>${state.items.length} file${state.items.length === 1 ? "" : "s"} selected. ${missing ? `${missing} required field${missing === 1 ? "" : "s"} still missing.` : "Ready to upload."}</p>
        </div>
        <div class="topbar-actions">
          <button type="button" class="ghost-button" data-action="pick-files">${icon("plus")}Add files</button>
          <input class="hidden-input" type="file" multiple data-file-input />
        </div>
      </div>
      ${renderStickyHeader()}
      ${renderBatchTools()}
      <div class="details-table">
        <div class="details-head">
          <div>File</div>
          <div class="head-cell">Type <button type="button" class="copy-button" data-copy-field="type">${icon("copy")}Copy to all</button></div>
          <div class="head-cell">Address <button type="button" class="copy-button" data-copy-field="address">${icon("copy")}Copy to all</button></div>
          <div class="head-cell">Room <button type="button" class="copy-button" data-copy-field="room">${icon("copy")}Copy to all</button></div>
          <div class="head-cell">Location <button type="button" class="copy-button" data-copy-field="location">${icon("copy")}Copy to all</button></div>
        </div>
        <div class="file-list">
          ${state.items.map(renderFileRow).join("")}
        </div>
      </div>
      <div class="footer-bar">
        <button type="button" class="ghost-button" data-action="back">Back</button>
        <button type="button" class="primary-button" data-action="upload" ${state.items.length ? "" : "disabled"}>${icon("upload")}Upload</button>
      </div>
    </section>
  `;
}

function renderStickyHeader() {
  const h = state.header;
  const fieldDefs = [["address", "Address", "12 Sample Street"], ["type", "Type", "Thermostat"], ["room", "Room", "Apt 4 / Room 2"], ["location", "Location", "Level 3 / North side"]];
  return `
    <div class="sticky-header" data-sticky-header>
      <div class="sticky-header-title">
        <strong>Batch details</strong>
        <span>Applies to every file while a field's toggle is on — toggle off to set it per image.</span>
      </div>
      <div class="sticky-header-grid">
        ${fieldDefs.map(([field, label, ph]) => `
          <div class="sticky-field ${h.apply[field] ? "" : "is-off"}">
            <div class="sticky-field-head">
              <label for="hdr-${field}">${label}</label>
              <button type="button" class="toggle-pill ${h.apply[field] ? "is-on" : ""}" data-header-toggle="${field}"
                aria-pressed="${h.apply[field]}" title="${h.apply[field] ? "Applying to all — tap for per-image" : "Per-image — tap to apply to all"}">
                <span></span>${h.apply[field] ? "All" : "Each"}
              </button>
            </div>
            <input id="hdr-${field}" data-header-field="${field}" ${field === "address" ? 'data-address-field="true"' : ""}
              value="${escapeHtml(h.values[field])}" placeholder="${escapeHtml(ph)}" ${field === "address" ? 'autocomplete="off"' : ""} />
            ${field === "address" && h.detectedAddress && h.values.address ? `<span class="detected-chip">📍 Detected from photos — tap to correct</span>` : ""}
          </div>`).join("")}
      </div>
    </div>
  `;
}

function renderBatchTools() {
  return `
    <div class="batch-tools">
      <div class="batch-tools-title">
        <strong>Batch fill</strong>
        <span>Type, address, room, location</span>
      </div>
      <div class="batch-actions">
        <button type="button" class="copy-button" data-copy-field="type">${icon("copy")}Type to all</button>
        <button type="button" class="copy-button" data-copy-field="address">${icon("copy")}Address to all</button>
        <button type="button" class="copy-button" data-copy-field="room">${icon("copy")}Room to all</button>
        <button type="button" class="copy-button" data-copy-field="location">${icon("copy")}Location to all</button>
        <button type="button" class="ghost-button copy-row-button" data-action="copy-first-row">${icon("copy")}First file to all</button>
      </div>
    </div>
  `;
}

function renderFileRow(item) {
  return `
    <div class="file-row" data-item="${escapeHtml(item.id)}">
      <div class="thumb">
        ${
          item.previewUrl
            ? `<button type="button" class="thumb-preview" data-preview="${escapeHtml(item.id)}" aria-label="Preview ${escapeHtml(item.file.name)}"><img src="${escapeHtml(item.previewUrl)}" alt="" /></button>`
            : `<div class="thumb-preview thumb-ext" aria-hidden="true">${escapeHtml(fileExtLabel(item.file))}</div>`
        }
        ${item.isFloorPlan ? `<span class="floorplan-badge">PLAN</span>` : ""}
        <div class="file-name">
          <strong title="${escapeHtml(item.file.name)}">${escapeHtml(item.file.name)}</strong>
          <span>${escapeHtml(readableSize(item.file.size))}</span>
        </div>
        <button type="button" class="icon-button remove-file-button" data-remove-file="${escapeHtml(item.id)}" aria-label="Remove ${escapeHtml(item.file.name)}">${icon("trash")}</button>
      </div>
      ${renderField(item, "type", "Type", "Thermostat")}
      ${renderField(item, "address", "Address", "12 Sample Street")}
      ${renderField(item, "room", "Room", "Apt 4 / Room 2")}
      ${renderField(item, "location", "Location", "Level 3 / North side")}
      <div class="mobile-file-actions">
        <button type="button" class="floorplan-toggle ${item.isFloorPlan ? "is-on" : ""}" data-floorplan="${escapeHtml(item.id)}" aria-pressed="${item.isFloorPlan}">
          ${item.isFloorPlan ? "✓ This is the floor plan" : "This is the floor plan"}
        </button>
        <button type="button" class="copy-button" data-copy-row="${escapeHtml(item.id)}">${icon("copy")}Copy this file to all</button>
      </div>
    </div>
  `;
}

function renderField(item, field, label, placeholder) {
  const key = `${item.id}:${field}`;
  const requiredForItem = !(field === "room" || field === "location") && !(field === "type" && item.isFloorPlan);
  const inherited = state.header.apply[field] && String(state.header.values[field]).trim();
  if (inherited) {
    return `
      <div class="field is-inherited">
        <label for="${key}">${escapeHtml(label)}</label>
        <input id="${key}" value="${escapeHtml(state.header.values[field])}" disabled title="Set by the batch header — toggle the header field off to edit per image" />
      </div>
    `;
  }
  return `
    <div class="field">
      <label for="${key}">${escapeHtml(label)}${requiredForItem ? " *" : ""}</label>
      <input
        id="${key}"
        data-field="${escapeHtml(field)}"
        data-id="${escapeHtml(item.id)}"
        ${field === "address" ? 'data-address-field="true"' : ""}
        class="${state.invalid[key] ? "is-invalid" : ""}"
        value="${escapeHtml(item[field])}"
        placeholder="${escapeHtml(placeholder)}"
        ${field === "address" ? 'autocomplete="off"' : ""}
      />
      ${field === "address" && item.addressSource === "exif" && item.address ? `<span class="detected-chip">📍 Detected — tap to correct</span>` : ""}
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
          <p>${state.upload.completed} of ${state.upload.total} processed</p>
        </div>
        <div class="progress-list">
          ${state.items.map(renderProgressItem).join("")}
        </div>
        ${
          state.upload.error
            ? `<div class="error-text">${escapeHtml(state.upload.error)}</div>
               <div class="error-actions">
                 <button type="button" class="ghost-button" data-action="cancel-upload">${icon("close")}Cancel and keep files</button>
                 <button type="button" class="ghost-button" data-action="edit-details">Edit details</button>
                 <button type="button" class="primary-button" data-action="retry-upload">${icon("upload")}Try again</button>
               </div>`
            : `<div class="error-actions"><button type="button" class="ghost-button" data-action="cancel-upload">${icon("close")}Cancel and keep files</button></div>`
        }
      </div>
    </section>
  `;
}

function renderProgressItem(item) {
  const status = item.error ? `${item.status}: ${item.error}` : (item.status || "Waiting");
  return `
    <div class="progress-item">
      <div class="progress-top">
        <strong>${escapeHtml(item.file.name)}</strong>
        <span class="progress-meta">${escapeHtml(status)}</span>
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
        <p>Everything has been submitted. You can safely leave this page.</p>
        <button type="button" class="primary-button" data-action="new-batch">${icon("upload")}Upload More Files</button>
      </div>
    </section>
  `;
}

function renderLightbox() {
  const item = state.items.find((entry) => entry.id === state.lightbox);
  if (!item?.previewUrl) return "";
  return `
    <div class="lightbox-backdrop" data-action="close-lightbox"></div>
    <section class="image-lightbox" role="dialog" aria-modal="true" aria-label="Image preview">
      <div class="lightbox-header">
        <strong>${escapeHtml(item.file.name)}</strong>
        <button type="button" class="icon-button" data-action="close-lightbox" aria-label="Close preview">${icon("close")}</button>
      </div>
      <img src="${escapeHtml(item.previewUrl)}" alt="Preview of ${escapeHtml(item.file.name)}" />
    </section>
  `;
}

function renderTermsModal() {
  const expanded = state.termsExpanded;
  return `
    <div class="terms-backdrop"></div>
    <section class="terms-modal" role="dialog" aria-modal="true" aria-labelledby="termsTitle">
      <h2 id="termsTitle">Terms &amp; Conditions</h2>
      <div class="terms-copy">
        <p class="terms-intro">By using this website, you agree that any images, files, or information uploaded through this website may be stored in the connected Google Drive account for the purpose of job documentation, record keeping, and business-related use.</p>
        ${
          expanded
            ? `<div class="terms-scroll">
                <h3>Ownership and Intellectual Property</h3>
                <p>This website, including its layout, design, code, upload system, and general workflow, is the intellectual property of Brandon Neill.</p>
                <p>This website and its associated systems were created independently by Brandon Neill and remain his intellectual property. No ownership, licence, or transfer of rights is granted unless agreed in writing.</p>
                <h3>User Authority and Uploaded Content</h3>
                <p>Users must only upload files, images, documents, addresses, job details, or other information they are authorised to upload. Users are responsible for the accuracy, lawfulness, and suitability of anything they submit.</p>
                <p>The website owner is not responsible for unauthorised, incorrect, misleading, confidential, offensive, inappropriate, unlawful, or otherwise unsuitable content uploaded by users.</p>
                <h3>Storage, Access, and Business Records</h3>
                <p>Uploaded material may be stored, copied, reviewed, organised, renamed, logged, retained, or otherwise processed for job documentation, record keeping, audit, operational, administrative, customer service, and business-related purposes.</p>
                <p>Uploaded material may be visible to the website owner, authorised staff, contractors, service providers, Google account administrators, and other parties who reasonably require access for business operations or legal compliance.</p>
                <p>Deletion requests may be considered, but uploaded material may be retained where reasonably required for business records, dispute handling, backups, accounting, insurance, legal, regulatory, or operational purposes.</p>
                <h3>Third-Party Services</h3>
                <p>This website uses Google services, including Google sign-in, Google Drive, Google Sheets, and address autocomplete. Use of those services may be subject to Google's own terms, privacy policies, technical limits, outages, and account permissions.</p>
                <p>The website owner does not control Google's infrastructure and is not responsible for Google service availability, data handling, account access, authentication issues, quota limits, policy changes, or service interruptions.</p>
                <h3>Security and Acceptable Use</h3>
                <p>Users must not upload viruses, malware, harmful code, illegal material, content they do not have permission to share, or files intended to disrupt, damage, overload, or interfere with the website or connected systems.</p>
                <p>Users must not attempt to bypass access controls, interfere with upload records, impersonate another person, misuse another person's account, or use the website for any purpose unrelated to legitimate job documentation or business use.</p>
                <h3>No Professional Advice</h3>
                <p>Information stored through this website is for documentation and business workflow purposes only. It is not legal, financial, safety, compliance, building, engineering, or professional advice.</p>
                <h3>No Warranty</h3>
                <p>The website is provided on an as-is and as-available basis. To the maximum extent permitted by law, no warranty is given that the website will be uninterrupted, error-free, secure, complete, compatible with every device, or free from data loss.</p>
                <h3>Limitation of Liability</h3>
                <p>To the maximum extent permitted by law, Brandon Neill is not liable for loss, damage, claim, cost, delay, interruption, corruption, deletion, unauthorised access, or any direct or indirect consequence arising from use of this website or uploaded content.</p>
                <p>Nothing in these terms excludes rights or guarantees that cannot lawfully be excluded, including any rights that may apply under Australian consumer law.</p>
                <h3>Indemnity</h3>
                <p>Users agree to take responsibility for claims, losses, costs, damages, or expenses arising from their unauthorised uploads, incorrect information, misuse of the website, breach of these terms, or infringement of another person's rights.</p>
                <h3>Changes to Terms</h3>
                <p>These terms may be updated from time to time. Continued use of this website after the terms are updated confirms acceptance of the updated terms.</p>
                <h3>Governing Law</h3>
                <p>These terms are governed by the laws of Victoria, Australia, unless another written agreement says otherwise.</p>
                <p>Continued use of this website confirms that you understand and accept these terms.</p>
              </div>`
            : `<button type="button" class="read-more-button" data-action="read-terms">Read more</button>`
        }
      </div>
      <div class="terms-actions">
        <button type="button" class="ghost-button" data-action="sign-out">Switch account</button>
        ${
          expanded
            ? `<button type="button" class="primary-button" data-action="accept-terms">${icon("check")}I have read and accept</button>`
            : `<button type="button" class="primary-button" data-action="read-terms">Read more</button>`
        }
      </div>
    </section>
  `;
}

function bindEvents() {
  document.querySelectorAll("[data-action]").forEach((button) => button.addEventListener("click", () => handleAction(button.dataset.action)));
  document.querySelectorAll("[data-field]").forEach((input) => input.addEventListener("input", () => updateField(input)));
  document.querySelectorAll("[data-header-field]").forEach((input) => input.addEventListener("input", () => {
    state.header.values[input.dataset.headerField] = input.value;
    if (input.dataset.headerField === "address") state.header.detectedAddress = false;
  }));
  document.querySelectorAll("[data-header-toggle]").forEach((button) => button.addEventListener("click", () => {
    const field = button.dataset.headerToggle;
    state.header.apply[field] = !state.header.apply[field];
    render();
  }));
  document.querySelectorAll("[data-floorplan]").forEach((button) => button.addEventListener("click", () => {
    const item = state.items.find((i) => i.id === button.dataset.floorplan);
    setFloorPlan(button.dataset.floorplan, !(item && item.isFloorPlan));
  }));
  document.querySelectorAll("[data-copy-field]").forEach((button) => button.addEventListener("click", () => copyFieldToAll(button.dataset.copyField)));
  document.querySelectorAll("[data-copy-row]").forEach((button) => button.addEventListener("click", () => copyItemToAll(button.dataset.copyRow)));
  document.querySelectorAll("[data-preview]").forEach((button) => button.addEventListener("click", () => { state.lightbox = button.dataset.preview; render(); }));
  document.querySelectorAll("[data-remove-file]").forEach((button) => button.addEventListener("click", () => removeFile(button.dataset.removeFile)));
  document.querySelectorAll("[data-drop-zone]").forEach(bindDropZone);
  fileInput = document.querySelector("[data-file-input]");
  if (fileInput) fileInput.addEventListener("change", (event) => handleFiles(event.target.files));
  initAddressAutocomplete();
}

function handleAction(action) {
  const allowedWithTerms = ["accept-terms", "read-terms", "sign-out", "close-lightbox"];
  if (state.termsRequired && !allowedWithTerms.includes(action)) {
    toast("Please accept the terms before continuing");
    return;
  }
  if (action === "pick-files") return fileInput?.click();
  if (action === "next") return goToDetails();
  if (action === "back") { state.step = "welcome"; render(); return; }
  if (action === "copy-first-row") return copyItemToAll(state.items[0]?.id);
  if (action === "upload") return uploadBatch();
  if (action === "retry-upload") return uploadBatch();
  if (action === "cancel-upload") return cancelUpload();
  if (action === "edit-details") { state.step = "details"; render(); return; }
  if (action === "new-batch") return resetBatch();
  if (action === "sign-in") return signIn();
  if (action === "sign-out") return signOut();
  if (action === "read-terms") { state.termsExpanded = true; render(); return; }
  if (action === "accept-terms") return acceptTerms();
  if (action === "close-lightbox") { state.lightbox = null; render(); return; }
}

function isHeicFile(file) {
  return /heic|heif/i.test(file.type) || /\.(heic|heif)$/i.test(file.name);
}

function fileExtLabel(file) {
  const m = file.name.match(/\.([a-z0-9]+)$/i);
  return (m ? m[1] : (file.type.split("/")[1] || "file")).toUpperCase().slice(0, 5);
}

function handleFiles(fileList) {
  const files = Array.from(fileList || []);
  if (!files.length) return;
  const newItems = files.map((file) => ({
    id: uid("file"),
    file,
    // §2.7: browsers can't render HEIC via object URL — preview comes from
    // the EXIF-embedded thumbnail (extractExif), or a typed placeholder.
    previewUrl: file.type.startsWith("image/") && !isHeicFile(file) ? URL.createObjectURL(file) : "",
    type: "",
    address: "",
    room: "",
    location: "",
    hash: "",
    status: "Waiting",
    progress: 0,
    result: null,
    duplicateOf: null,
    error: "",
    /* v1.0 §4.1B/§4.2 */
    lat: null,
    lng: null,
    capturedAt: "",
    addressSource: "manual",
    detectedAddress: "",
    isFloorPlan: false
  }));
  state.items.push(...newItems);
  state.filesChosen = true;
  state.invalid = {};
  toast(`${files.length} file${files.length === 1 ? "" : "s"} selected`);
  render();
  extractExifBatch(newItems);   // best-effort, never blocks (§4.1 hard truths)
}

/* ── EXIF auto-location (v1.0 §4.1B) — best-effort, never blocks ──────── */
async function extractExifBatch(items) {
  if (!window.exifr) return;
  await Promise.all(items.map(async (item) => {
    if (!item.file.type.startsWith("image/") && !isHeicFile(item.file)) return;
    try {
      const gps = await exifr.gps(item.file);
      if (gps && isFinite(gps.latitude) && isFinite(gps.longitude)) {
        item.lat = Math.round(gps.latitude * 1e5) / 1e5;   // 5dp — geocode dedup key
        item.lng = Math.round(gps.longitude * 1e5) / 1e5;
      }
    } catch (e) {}
    try {
      const tags = await exifr.parse(item.file, { pick: ["DateTimeOriginal"] });
      if (tags?.DateTimeOriginal) item.capturedAt = new Date(tags.DateTimeOriginal).toISOString();
    } catch (e) {}
    if (!item.previewUrl && isHeicFile(item.file)) {
      try {
        const thumb = await exifr.thumbnail(item.file);
        if (thumb) item.previewUrl = URL.createObjectURL(new Blob([thumb], { type: "image/jpeg" }));
      } catch (e) {}   // undecodable -> typed placeholder card, never a broken tile
    }
  }));
  render();
  geocodeClusters().catch(() => {});
}

/* One reverse-geocode call per unique 5dp coordinate cluster per batch
 * (v1.0 §4.1 hard truths — a 40-photo site = one call, not 40). */
const _geocodedClusters = {};
async function geocodeClusters() {
  const pending = state.items.filter((i) => i.lat !== null && !i.detectedAddress);
  if (!pending.length) return;
  const clusters = {};
  pending.forEach((i) => { (clusters[i.lat + "," + i.lng] = clusters[i.lat + "," + i.lng] || []).push(i); });
  let resolvedAny = false;
  for (const key of Object.keys(clusters)) {
    if (!(key in _geocodedClusters)) {
      try {
        await loadPlacesLibrary();
        const [lat, lng] = key.split(",").map(Number);
        const res = await new google.maps.Geocoder().geocode({ location: { lat, lng } });
        _geocodedClusters[key] = res?.results?.[0]?.formatted_address || "";
      } catch (e) { _geocodedClusters[key] = ""; }
    }
    const address = _geocodedClusters[key];
    if (!address) continue;
    clusters[key].forEach((item) => {
      item.detectedAddress = address;
      if (!String(item.address).trim()) { item.address = address; item.addressSource = "exif"; }
      resolvedAny = true;
    });
  }
  if (!resolvedAny) return;
  // §4.1B.4: if EVERY located photo agrees, auto-fill the header (toggle stays ON)
  const keys = state.items.filter((i) => i.detectedAddress).map((i) => window.NDMatch.addressKey(i.detectedAddress));
  const uniq = Array.from(new Set(keys));
  if (uniq.length === 1 && !String(state.header.values.address).trim()) {
    state.header.values.address = state.items.find((i) => i.detectedAddress).detectedAddress;
    state.header.detectedAddress = true;
  }
  render();
}

/* Effective value: header wins while its apply-toggle is ON (v1.0 §4.1A). */
function effectiveValue(item, field) {
  const h = state.header;
  if (h.apply[field] && String(h.values[field]).trim()) return h.values[field];
  return item[field];
}

function addressGroupKeyFor(item) {
  return window.NDMatch.addressKey(effectiveValue(item, "address") || "");
}

/* v1.0 §4.2 — at most ONE floor plan per address group. */
function setFloorPlan(id, on) {
  const item = state.items.find((i) => i.id === id);
  if (!item) return;
  if (on) {
    const groupKey = addressGroupKeyFor(item);
    const prev = state.items.find((i) => i.isFloorPlan && i.id !== id && addressGroupKeyFor(i) === groupKey);
    if (prev) {
      prev.isFloorPlan = false;
      toast(`Floor plan set to ${item.file.name} (only one allowed per site)`);
    }
    delete state.invalid[`${item.id}:type`];   // plans skip Type validation
  }
  item.isFloorPlan = on;
  render();
}

function bindDropZone(zone) {
  const stop = (event) => {
    event.preventDefault();
    event.stopPropagation();
  };
  zone.addEventListener("dragenter", (event) => {
    stop(event);
    zone.classList.add("is-dragging");
  });
  zone.addEventListener("dragover", (event) => {
    stop(event);
    zone.classList.add("is-dragging");
  });
  zone.addEventListener("dragleave", (event) => {
    stop(event);
    if (!zone.contains(event.relatedTarget)) zone.classList.remove("is-dragging");
  });
  zone.addEventListener("drop", (event) => {
    stop(event);
    zone.classList.remove("is-dragging");
    handleFiles(event.dataTransfer?.files);
  });
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

function copyItemToAll(id) {
  const source = state.items.find((item) => item.id === id);
  if (!source) {
    toast("Choose a file first");
    return;
  }
  const fields = ["type", "address", "room", "location"];
  if (!fields.some((field) => String(source[field] || "").trim())) {
    toast("Fill in that file first");
    return;
  }
  state.items.forEach((item) => {
    if (item.id === source.id) return;
    fields.forEach((field) => {
      item[field] = source[field];
      delete state.invalid[`${item.id}:${field}`];
    });
  });
  toast("File details copied to all files");
  render();
}

function countMissingRequired() {
  let missing = 0;
  state.items.forEach((item) => {
    if (!String(effectiveValue(item, "address")).trim()) missing += 1;
    if (!item.isFloorPlan && !String(effectiveValue(item, "type")).trim()) missing += 1;   // §4.2: plans skip Type
  });
  return missing;
}

function validateItems() {
  state.invalid = {};
  state.items.forEach((item) => {
    if (!String(effectiveValue(item, "address")).trim()) state.invalid[`${item.id}:address`] = true;
    if (!item.isFloorPlan && !String(effectiveValue(item, "type")).trim()) state.invalid[`${item.id}:type`] = true;
  });
  return !Object.keys(state.invalid).length;
}

function resetBatch() {
  state.items.forEach((item) => {
    if (item.previewUrl) URL.revokeObjectURL(item.previewUrl);
  });
  state.step = "welcome";
  state.filesChosen = false;
  state.items = [];
  state.invalid = {};
  state.lightbox = null;
  state.upload = { completed: 0, total: 0, error: "" };
  render();
}

function removeFile(id) {
  const item = state.items.find((entry) => entry.id === id);
  if (!item) return;
  if (item.previewUrl) URL.revokeObjectURL(item.previewUrl);
  state.items = state.items.filter((entry) => entry.id !== id);
  Object.keys(state.invalid).forEach((key) => {
    if (key.startsWith(`${id}:`)) delete state.invalid[key];
  });
  if (state.lightbox === id) state.lightbox = null;
  if (!state.items.length) {
    state.step = "welcome";
    state.filesChosen = false;
  }
  toast("File removed");
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
    await gapi.client.load("https://sheets.googleapis.com/$discovery/rest?version=v4");
    await waitFor("google");
    NDAuth.onAuthChange(handleAuthEvent);
    NDAuth.init({ clientId: CONFIG.googleClientId, scopes: CONFIG.scopes || GOOGLE_SCOPES.split(" ") });
    state.googleAuth.librariesReady = true;
  } catch (error) {
    state.googleAuth.lastError = `Google setup failed: ${describeError(error)}`;
  }
  // Silent resume: shared suite token, else silent renewal. No popup without a tap.
  if (state.googleAuth.librariesReady && !NDAuth.isSignedIn()) {
    NDAuth.ensureToken().catch(() => {});
  }
  render();
}

function signIn() {
  if (!state.googleAuth.librariesReady || !window.NDAuth) {
    toast("Google is still loading");
    return;
  }
  state.googleAuth.bootstrapping = true;
  state.googleAuth.lastError = null;
  render();
  NDAuth.ensureToken({ interactive: true }).catch((error) => {
    state.googleAuth.lastError = error?.message || "Google sign-in failed";
    state.googleAuth.bootstrapping = false;
    render();
  });
}

function signOut() { NDAuth.signOut(); }

function handleAuthEvent(ev) {
  if (ev.type === "signin" || ev.type === "refresh" || ev.type === "external") {
    state.googleAuth.accessToken = NDAuth.getToken();
    state.googleAuth.expiresAt = NDAuth.getExpiry();
    state.googleAuth.signedIn = true;
    state.googleAuth.lastError = null;
    if (ev.profile) state.googleAuth.profile = ev.profile;
    if (window.gapi?.client) gapi.client.setToken({ access_token: state.googleAuth.accessToken });
    state.googleAuth.bootstrapping = false;
    render();
    if (ev.type === "signin") checkTermsStatusInBackground(state.googleAuth.profile?.email || "");
  } else if (ev.type === "signout") {
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
    state.termsRequired = false;
    state.termsAccepted = false;
    state.termsExpanded = false;
    state.drive = { rootFolderId: null, batchFolderId: null, sheetId: null };
    toast("Google account disconnected");
    render();
  } else if (ev.type === "error") {
    state.googleAuth.lastError = ev.error || "Google sign-in failed";
    state.googleAuth.bootstrapping = false;
    render();
  }
}

async function acceptTerms() {
  const email = state.googleAuth.profile?.email || "";
  try {
    await ensureDriveReady();
    await recordTermsAcceptance();
    saveTermsAccepted(email);
    state.termsAccepted = true;
    state.termsRequired = false;
    state.termsExpanded = false;
    toast("Ready to upload");
  } catch (error) {
    state.googleAuth.lastError = describeError(error);
  }
  render();
}

function checkTermsStatusInBackground(email = state.googleAuth.profile?.email || "") {
  if (!email) return Promise.resolve(false);
  if (termsCheckPromise) return termsCheckPromise;
  state.termsChecking = true;
  state.termsRequired = false;
  render();
  termsCheckPromise = (async () => {
    try {
      await ensureDriveReady();
      const accepted = await hasAcceptedTerms(email);
      state.termsAccepted = accepted;
      state.termsRequired = !accepted;
      state.termsExpanded = false;
      if (accepted) {
        saveTermsAccepted(email);
        toast("Connected");
      }
      return accepted;
    } catch (error) {
      state.googleAuth.lastError = describeError(error);
      state.termsAccepted = false;
      state.termsRequired = true;
      state.termsExpanded = false;
      return false;
    } finally {
      state.termsChecking = false;
      termsCheckPromise = null;
      render();
    }
  })();
  return termsCheckPromise;
}

function cancelUpload() {
  state.upload.cancelRequested = true;
  if (state.upload.error || state.step === "uploading") {
    state.step = "details";
    state.upload.error = "";
    state.items.forEach((item) => {
      if (item.status === "Checking duplicate" || item.status === "Uploading" || item.status === "Waiting") {
        item.status = "Waiting";
        item.progress = 0;
      }
    });
    render();
    toast("Upload cancelled. Your files and details are still here.");
  }
}

async function ensureDriveReady() {
  if (!isTokenValid()) throw new Error("Sign in before uploading");
  if (!state.drive.rootFolderId) state.drive.rootFolderId = await findDestinationRootFolder();
  if (!state.drive.batchFolderId) state.drive.batchFolderId = await findOrCreateDestinationChildFolder(BATCH_FOLDER_NAME, state.drive.rootFolderId);
  if (!state.drive.sheetId) state.drive.sheetId = await ensureUploadSheet(state.drive.batchFolderId);
  return state.drive.batchFolderId;
}

function escapeDriveQuery(value) {
  return String(value).replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}

function sheetRange(tabName, range) {
  return `'${String(tabName).replaceAll("'", "''")}'!${range}`;
}

async function findDestinationRootFolder() {
  const ownerClause = `'${escapeDriveQuery(DESTINATION_OWNER_EMAIL)}' in owners`;
  const q = `name='${escapeDriveQuery(DRIVE_ROOT_NAME)}' and mimeType='application/vnd.google-apps.folder' and ${ownerClause} and trashed=false`;
  const list = await gapi.client.drive.files.list({ q, fields: "files(id,name,owners)", pageSize: 5 });
  if (list.result.files?.length) return list.result.files[0].id;
  if (!isDestinationOwner()) throw new Error("The upload destination has not been shared with this Google account yet");
  const create = await gapi.client.drive.files.create({
    resource: { name: DRIVE_ROOT_NAME, mimeType: "application/vnd.google-apps.folder" },
    fields: "id"
  });
  return create.result.id;
}

async function findDestinationChildFolder(name, parentId) {
  const q = `name='${escapeDriveQuery(name)}' and mimeType='application/vnd.google-apps.folder' and '${parentId}' in parents and '${escapeDriveQuery(DESTINATION_OWNER_EMAIL)}' in owners and trashed=false`;
  const list = await gapi.client.drive.files.list({ q, fields: "files(id,name)", pageSize: 5 });
  return list.result.files?.[0]?.id || null;
}

async function findOrCreateDestinationChildFolder(name, parentId) {
  const existing = await findDestinationChildFolder(name, parentId);
  if (existing) return existing;
  if (!isDestinationOwner()) throw new Error("The upload folder is not ready yet");
  const create = await gapi.client.drive.files.create({
    resource: { name, mimeType: "application/vnd.google-apps.folder", parents: [parentId] },
    fields: "id"
  });
  return create.result.id;
}

async function findSheetInFolder(name, parentId) {
  const q = `name='${escapeDriveQuery(name)}' and mimeType='application/vnd.google-apps.spreadsheet' and '${parentId}' in parents and trashed=false`;
  const list = await gapi.client.drive.files.list({ q, fields: "files(id,name)", pageSize: 5 });
  return list.result.files?.[0]?.id || null;
}

async function ensureUploadSheet(parentId) {
  const existing = await findSheetInFolder(UPLOAD_SHEET_NAME, parentId);
  if (existing) {
    await ensureSheetStructure(existing);
    return existing;
  }
  const created = await gapi.client.sheets.spreadsheets.create({
    resource: {
      properties: { title: UPLOAD_SHEET_NAME },
      sheets: [
        { properties: { title: SHEET_TAB_NAME } },
        { properties: { title: TERMS_TAB_NAME } }
      ]
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
  await ensureSheetStructure(sheetId);
  return sheetId;
}

async function ensureSheetStructure(spreadsheetId) {
  const spreadsheet = await gapi.client.sheets.spreadsheets.get({
    spreadsheetId,
    fields: "sheets(properties(title))"
  });
  const tabNames = new Set((spreadsheet.result.sheets || []).map((sheet) => sheet.properties?.title));
  const missingTabs = [SHEET_TAB_NAME, TERMS_TAB_NAME].filter((name) => !tabNames.has(name));
  if (missingTabs.length) {
    await gapi.client.sheets.spreadsheets.batchUpdate({
      spreadsheetId,
      resource: { requests: missingTabs.map((name) => ({ addSheet: { properties: { title: name } } })) }
    });
  }
  await gapi.client.sheets.spreadsheets.values.batchUpdate({
    spreadsheetId,
    resource: {
      valueInputOption: "RAW",
      data: [
        { range: sheetRange(SHEET_TAB_NAME, "A1"), values: [SHEET_HEADER] },
        { range: sheetRange(TERMS_TAB_NAME, "A1"), values: [TERMS_HEADER] }
      ]
    }
  });
}

async function appendUploadRows(rows) {
  if (!rows.length) return;
  await gapi.client.sheets.spreadsheets.values.append({
    spreadsheetId: state.drive.sheetId,
    range: sheetRange(SHEET_TAB_NAME, "A1"),
    valueInputOption: "RAW",
    insertDataOption: "INSERT_ROWS",
    resource: { values: rows }
  });
}

async function hasAcceptedTerms(email) {
  if (!email || !state.drive.sheetId) return false;
  const response = await gapi.client.sheets.spreadsheets.values.get({
    spreadsheetId: state.drive.sheetId,
    range: sheetRange(TERMS_TAB_NAME, "A2:F")
  });
  const emailLower = email.toLowerCase();
  return (response.result.values || []).some((row) =>
    String(row[1] || "").toLowerCase() === emailLower &&
    String(row[3] || "").toLowerCase() === "yes" &&
    String(row[4] || "") === TERMS_VERSION
  );
}

async function recordTermsAcceptance() {
  const email = state.googleAuth.profile?.email || "";
  if (!email) throw new Error("Could not identify signed-in user");
  if (await hasAcceptedTerms(email)) return;
  await gapi.client.sheets.spreadsheets.values.append({
    spreadsheetId: state.drive.sheetId,
    range: sheetRange(TERMS_TAB_NAME, "A1"),
    valueInputOption: "RAW",
    insertDataOption: "INSERT_ROWS",
    resource: {
      values: [[
        new Date().toISOString(),
        email,
        state.googleAuth.profile?.name || "",
        "Yes",
        TERMS_VERSION,
        navigator.userAgent || ""
      ]]
    }
  });
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
  if (item.isFloorPlan) {
    const address = String(item.address || "site").trim();
    return `FloorPlan - ${address} - ${item.file.name}`;
  }
  const extMatch = item.file.name.match(/(\.[^.]+)$/);
  const ext = extMatch ? extMatch[1] : "";
  const baseName = item.file.name.replace(/(\.[^.]+)$/, "");
  const parts = [
    String(index + 1).padStart(2, "0"),
    safeNamePart(item.type),
    safeNamePart(item.address),
    item.room ? safeNamePart(item.room) : "",
    item.location ? safeNamePart(item.location) : "",
    item.hash ? item.hash.slice(0, 8) : "",
    safeNamePart(baseName)
  ].filter(Boolean);
  return `${parts.join(" - ")}${ext}`;
}

async function hashFile(file) {
  const buffer = await file.arrayBuffer();
  if (window.crypto?.subtle) {
    const digest = await crypto.subtle.digest("SHA-256", buffer);
    return Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, "0")).join("");
  }
  const bytes = new Uint8Array(buffer);
  let h = 2166136261;
  for (const byte of bytes) {
    h ^= byte;
    h = Math.imul(h, 16777619);
  }
  return `fallback-${file.size}-${(h >>> 0).toString(16)}`;
}

async function findExistingDuplicate(hash, parentFolderId) {
  const q = `'${parentFolderId}' in parents and trashed=false and appProperties has { key='contentHash' and value='${escapeDriveQuery(hash)}' }`;
  const list = await gapi.client.drive.files.list({
    q,
    fields: "files(id,name,webViewLink)",
    pageSize: 1
  });
  return list.result.files?.[0] || null;
}

async function uploadFileToDrive(file, parentFolderId, metadata) {
  if (!parentFolderId) throw new Error("No parent folder");
  const base64 = arrayBufferToBase64(await file.arrayBuffer());
  const boundary = "upload-" + Math.random().toString(36).slice(2);
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
    `Location: ${item.location.trim() || "Not provided"}`,
    `Original file: ${item.file.name}`,
    `Uploaded: ${new Date().toISOString()}`
  ].join("\n");
}

function uploadRow(item, status, result = null, duplicate = null) {
  return [
    new Date().toISOString(),
    state.googleAuth.profile?.email || "",
    state.googleAuth.profile?.name || "",
    item.file.name,
    result?.name || "",
    result?.id || "",
    result?.webViewLink || "",
    result?.thumbnailLink || "",
    item.file.size,
    item.file.type || result?.mimeType || "",
    item.type.trim(),
    item.address.trim(),
    item.room.trim(),
    item.location.trim(),
    status,
    duplicate?.id || "",
    duplicate?.webViewLink || "",
    item.hash || ""
  ];
}

/* ── unified Inbox ledger (v1.0 §3.1/§5.1, Slice 2 #13) ─────────────── */
let _inboxApi = null;
function getInboxApi() {
  if (_inboxApi) return _inboxApi;
  if (!window.NDInbox || !window.ND?.sheetsKit || !CONFIG.masterSpreadsheetId) return null;
  const sheets = ND.sheetsKit.create({ gateway: ND.sheetsKit.gapiGateway() });
  _inboxApi = NDInbox.createInboxApi({ sheets, spreadsheetId: CONFIG.masterSpreadsheetId });
  return _inboxApi;
}

function inboxRecordFor(item, result) {
  const address = String(effectiveValue(item, "address")).trim();
  return {
    driveFileId: result.id,
    name: result.name,
    status: NDInbox.STATUS.UNFILED,
    address,
    addressKey: window.NDMatch.addressKey(address),
    addressSource: item.addressSource,
    lat: item.lat === null ? "" : item.lat,
    lng: item.lng === null ? "" : item.lng,
    type: item.isFloorPlan ? "" : String(effectiveValue(item, "type")).trim(),   // §5.1: blank for plans
    room: String(effectiveValue(item, "room")).trim(),
    location: String(effectiveValue(item, "location")).trim(),
    isFloorPlan: item.isFloorPlan,
    uploader: state.googleAuth.profile?.email || "",
    uploadedAt: new Date().toISOString(),
    capturedAt: item.capturedAt || "",
    mimeType: item.file.type || result.mimeType || "",
    webViewLink: result.webViewLink || "",
    thumbnailLink: result.thumbnailLink || "",
    contentHash: item.hash
  };
}

async function uploadBatch() {
  if (!validateItems()) {
    toast("Type and address are required for every file");
    render();
    return;
  }
  if (!isTokenValid()) {
    toast("Sign in before uploading");
    signIn();
    return;
  }
  if (state.termsChecking) {
    toast("Checking terms acceptance...");
    await checkTermsStatusInBackground();
  }
  if (!state.termsAccepted) {
    state.termsRequired = true;
    state.termsExpanded = false;
    render();
    return;
  }

  state.step = "uploading";
  state.upload = { completed: 0, total: state.items.length, error: "", cancelRequested: false };
  state.items.forEach((item) => {
    item.status = "Waiting";
    item.progress = 0;
    item.result = null;
    item.duplicateOf = null;
    item.error = "";
  });
  render();

  try {
    const batchRootId = await ensureDriveReady();
    const seenHashes = new Map();

    // Materialise effective (header-inherited) values onto each item so the
    // rest of the pipeline and the Upload Log see the final fields.
    state.items.forEach((item) => {
      item.type = item.isFloorPlan ? "" : String(effectiveValue(item, "type")).trim();
      item.address = String(effectiveValue(item, "address")).trim();
      item.room = String(effectiveValue(item, "room")).trim();
      item.location = String(effectiveValue(item, "location")).trim();
    });

    // v1.0 §7: dedup must check contentHash across the WHOLE Inbox/Photos
    // set, not just the Batch folder (files move out of Batch when filed).
    const inboxApi = getInboxApi();
    let inboxRecords = [];
    if (inboxApi) {
      try {
        await NDInbox.ensureInboxTab(ND.sheetsKit.gapiGateway(), CONFIG.masterSpreadsheetId);
        inboxRecords = await inboxApi.list();
      } catch (e) { console.warn("Inbox ledger unavailable, continuing with folder-only dedup", e); }
    }

    for (const [index, item] of state.items.entries()) {
      if (state.upload.cancelRequested) throw new Error("Upload cancelled");
      item.status = "Checking duplicate";
      item.progress = 14;
      render();

      item.hash = await hashFile(item.file);
      if (state.upload.cancelRequested) throw new Error("Upload cancelled");
      const localDuplicate = seenHashes.get(item.hash);
      const ledgerDuplicate = localDuplicate ? null : (() => {
        const hit = window.NDInbox ? NDInbox.findByContentHash(inboxRecords, item.hash) : null;
        return hit ? { id: hit.driveFileId, name: hit.name, webViewLink: hit.webViewLink } : null;
      })();
      const driveDuplicate = (localDuplicate || ledgerDuplicate) ? null : await findExistingDuplicate(item.hash, batchRootId);
      const duplicate = localDuplicate || ledgerDuplicate || driveDuplicate;

      if (duplicate) {
        item.status = "Duplicate skipped";
        item.progress = 100;
        item.duplicateOf = duplicate;
        state.upload.completed += 1;
        await appendUploadRows([uploadRow(item, "Duplicate skipped", null, duplicate)]);
        render();
        continue;
      }

      item.status = "Uploading";
      item.progress = 58;
      render();
      if (state.upload.cancelRequested) throw new Error("Upload cancelled");

      const driveMetadata = {
        name: buildDriveFileName(item, index),
        parents: [batchRootId],
        description: itemDescription(item),
        appProperties: Object.assign(
          {
            source: "Upload",
            originalName: appPropertyValue(item.file.name),
            fileType: appPropertyValue(item.type)
          },
          // v1.0 §5.2 — appProperties are the source of truth if a sheet row is lost
          window.NDInbox ? NDInbox.toAppProperties({
            addressKey: window.NDMatch.addressKey(item.address),
            address: item.address,
            addressSource: item.addressSource,
            type: item.type,
            room: item.room,
            location: item.location,
            isFloorPlan: item.isFloorPlan,
            contentHash: item.hash,
            capturedAt: item.capturedAt
          }, "Upload") : {
            address: appPropertyValue(item.address),
            room: appPropertyValue(item.room),
            location: appPropertyValue(item.location),
            contentHash: appPropertyValue(item.hash)
          }
        )
      };

      const result = await uploadFileToDrive(item.file, batchRootId, driveMetadata);
      item.result = result;
      item.status = "Done";
      item.progress = 100;
      state.upload.completed += 1;
      seenHashes.set(item.hash, result);
      await appendUploadRows([uploadRow(item, "Uploaded", result, null)]);
      // One ledger (v1.0 §3.1): every upload lands in the Inbox tab as UNFILED.
      if (inboxApi) {
        try {
          const rec = inboxRecordFor(item, result);
          await inboxApi.upsert(rec);
          inboxRecords.push(rec);
        } catch (e) { console.warn("Inbox row write failed (photo IS in Drive + Upload Log)", e); }
      }
      render();
    }

    state.step = "complete";
    if (window.NDUI?.recordVisit) {
      const addr = state.items[0] ? String(state.items[0].address || "").split(",")[0] : "";
      NDUI.recordVisit("upload", "batch", `${state.upload.completed} photo${state.upload.completed === 1 ? "" : "s"} uploaded${addr ? " — " + addr : ""}`, "/upload/");
    }
    render();
  } catch (error) {
    const active = state.items.find((item) => item.status === "Checking duplicate" || item.status === "Uploading");
    if (active) {
      active.status = "Failed";
      active.error = describeError(error);
    }
    state.upload.error = `Upload failed: ${describeError(error)}`;
    toast("Upload failed");
    render();
  }
}

function loadPlacesLibrary() {
  if (!CONFIG.googleApiKey) return Promise.reject(new Error("Google Maps API key is missing"));
  if (window.google?.maps?.places) {
    state.places.ready = true;
    return Promise.resolve();
  }
  if (placesPromise) return placesPromise;
  state.places.loading = true;
  placesPromise = new Promise((resolve, reject) => {
    const callbackName = `initUploadPlaces_${Date.now()}`;
    window[callbackName] = () => {
      state.places.loading = false;
      state.places.ready = true;
      delete window[callbackName];
      resolve();
    };
    const script = document.createElement("script");
    script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(CONFIG.googleApiKey)}&libraries=places&callback=${callbackName}`;
    script.async = true;
    script.defer = true;
    script.onerror = () => {
      state.places.loading = false;
      state.places.error = "Address autocomplete could not load";
      delete window[callbackName];
      reject(new Error(state.places.error));
    };
    document.head.appendChild(script);
  });
  return placesPromise;
}

async function initAddressAutocomplete() {
  const inputs = Array.from(document.querySelectorAll("[data-address-field]")).filter((input) => !input.dataset.autocompleteBound);
  if (!inputs.length) return;
  try {
    await loadPlacesLibrary();
    inputs.forEach((input) => {
      input.dataset.autocompleteBound = "true";
      const bounds = new google.maps.LatLngBounds(
        new google.maps.LatLng(VICTORIA_ADDRESS_BOUNDS.south, VICTORIA_ADDRESS_BOUNDS.west),
        new google.maps.LatLng(VICTORIA_ADDRESS_BOUNDS.north, VICTORIA_ADDRESS_BOUNDS.east)
      );
      const autocomplete = new google.maps.places.Autocomplete(input, {
        fields: ["formatted_address", "address_components"],
        types: ["address"],
        bounds,
        strictBounds: true,
        componentRestrictions: ADDRESS_COUNTRY ? { country: ADDRESS_COUNTRY } : undefined
      });
      autocomplete.addListener("place_changed", async () => {
        const place = autocomplete.getPlace();
        const address = place.formatted_address || input.value;
        if (!isVictorianPlace(place)) {
          // §2.1.5: keep the VIC lock but make it a visible choice, not a landmine
          const saveAnyway = window.NDUI
            ? await NDUI.confirm({ title: "Outside Victoria", message: `"${address}" looks like it's outside Victoria. Save it anyway?`, confirmLabel: "Save anyway", cancelLabel: "Fix" })
            : window.confirm(`"${address}" looks like it's outside Victoria. Save it anyway?`);
          if (!saveAnyway) {
            if (input.dataset.id) state.invalid[`${input.dataset.id}:address`] = true;
            input.focus();
            render();
            return;
          }
        }
        input.value = address;
        if (input.dataset.headerField) {
          state.header.values.address = address;
          state.header.detectedAddress = false;
        } else {
          updateField(input);
        }
      });
    });
  } catch (error) {
    state.places.error = describeError(error);
  }
}

function isVictorianPlace(place) {
  const components = place?.address_components || [];
  return components.some((component) =>
    component.types?.includes("administrative_area_level_1") &&
    (component.short_name === "VIC" || component.long_name === "Victoria")
  );
}

render();
bootGoogle();
