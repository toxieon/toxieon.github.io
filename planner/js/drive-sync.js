/* Drive-first project data (0.25.1). Plans load live from the job's Floor Plans folder; floors, rooms and nodes
 * are kept in '<job>/Planner data/<projectId>.json' with conflict-safe writes. The pure engine is NDDriveState.
 * Sign-in is Planner's existing token (scope: full Drive), so folders other people or bots create are readable.
 * Writes: the Planner data folder and its JSON file only. Plans, photos and Excel files are never modified. */

const DRIVE_SYNC_DEBOUNCE_MS = 2500;
const driveSync = { projectId: "", jobFolderId: "", status: "idle", unsynced: false, message: "", ready: false, busy: false, timer: 0, applying: false, engine: null, plansFor: "" };

function driveSyncDeviceId() {
  let id = "";
  try { id = localStorage.getItem("np-device-id") || ""; if (!id) { id = uid("dev"); localStorage.setItem("np-device-id", id); } } catch (e) { id = id || "dev-session"; }
  return id;
}

function driveSyncOffline() { return typeof navigator !== "undefined" && navigator.onLine === false; }
function driveSyncOfflineError() { const e = new Error("offline"); e.offline = true; return e; }

function driveSyncAdapter() {
  const guard = () => { if (driveSyncOffline()) throw driveSyncOfflineError(); };
  const q = (parent, extra) => "'" + escapeDriveQuery(parent) + "' in parents and trashed=false" + extra;
  const list = async (query) => { guard(); const r = await googleCall(() => gapi.client.drive.files.list({ q: query, fields: "files(id,name,mimeType)", pageSize: 5, supportsAllDrives: true, includeItemsFromAllDrives: true })); return (r.result.files || [])[0] || null; };
  const rev = (r) => r.headRevisionId || String(r.version || "");
  const multipart = (meta, text) => {
    const b = "ndstate" + Math.random().toString(36).slice(2);
    return { type: "multipart/related; boundary=" + b, body: `--${b}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(meta)}\r\n--${b}\r\nContent-Type: application/json\r\n\r\n${text}\r\n--${b}--` };
  };
  return {
    findFolder: (parent, name) => list(q(parent, " and mimeType='" + PHOTO_FOLDER_MIME + "' and name='" + escapeDriveQuery(name) + "'")),
    createFolder: async (parent, name) => { guard(); const r = await googleCall(() => gapi.client.drive.files.create({ resource: { name: name, mimeType: PHOTO_FOLDER_MIME, parents: [parent] }, fields: "id,name", supportsAllDrives: true })); return r.result; },
    findFile: (folder, name) => list(q(folder, " and name='" + escapeDriveQuery(name) + "' and mimeType!='" + PHOTO_FOLDER_MIME + "'")),
    getMeta: async (id) => { guard(); const r = await googleCall(() => gapi.client.drive.files.get({ fileId: id, fields: "headRevisionId,version", supportsAllDrives: true })); return { rev: rev(r.result) }; },
    download: async (id) => { guard(); const r = await googleCall(() => gapi.client.request({ path: "/drive/v3/files/" + encodeURIComponent(id), method: "GET", params: { alt: "media", supportsAllDrives: true }, headers: { "Cache-Control": "no-cache" } })); return typeof r.body === "string" ? r.body : JSON.stringify(r.result); },
    createFile: async (folder, name, text) => { guard(); const m = multipart({ name: name, parents: [folder], mimeType: "application/json" }, text); const r = await googleCall(() => gapi.client.request({ path: "/upload/drive/v3/files", method: "POST", params: { uploadType: "multipart", fields: "id,headRevisionId,version", supportsAllDrives: true }, headers: { "Content-Type": m.type }, body: m.body })); return { id: r.result.id, rev: rev(r.result) }; },
    updateFile: async (id, text) => { guard(); const r = await googleCall(() => gapi.client.request({ path: "/upload/drive/v3/files/" + encodeURIComponent(id), method: "PATCH", params: { uploadType: "media", fields: "headRevisionId,version", supportsAllDrives: true }, headers: { "Content-Type": "application/json" }, body: text })); return { rev: rev(r.result) }; }
  };
}

function driveSyncEngine() {
  if (!driveSync.engine && window.NDDriveState) {
    const cache = window.NDCache ? { get: (k) => NDCache.get(k).then((v) => v || null), put: (k, v) => NDCache.put(k, v), remove: (k) => NDCache.remove(k) } : { get: async () => null, put: async () => {}, remove: async () => {} };
    driveSync.engine = NDDriveState.createEngine({ drive: driveSyncAdapter(), cache: cache, deviceId: driveSyncDeviceId() });
  }
  return driveSync.engine;
}

function driveSyncSet(status, message, unsynced) {
  driveSync.status = status; driveSync.message = message || "";
  if (unsynced != null) driveSync.unsynced = unsynced;
  render();
}

async function driveSyncResolveJobFolder(proj) {
  if (proj.photoFolderId) return proj.photoFolderId;
  const rootId = state.ui.jobsRootFolderId;
  if (!rootId || driveSyncOffline() || !isTokenValid()) return "";
  const kids = await listDriveChildren(rootId);
  const hit = NDDriveState.discoverJobFolder(proj.name, kids);
  if (hit) { proj.photoFolderId = hit.id; persist(); toast("Linked " + proj.name + " to its job folder"); return hit.id; }
  return "";
}

/* Floors take their plan from the Floor Plans folder. The folder is the source of truth: the file id and its
 * modified time are checked on every open, and a changed file drops the device copy so it reloads live. */
async function driveSyncApplyPlans(proj, jobFolderId) {
  const specials = photoApi().jobSpecials(await listDriveChildren(jobFolderId));
  if (!specials.plansFolderId) return 0;
  const files = await listPlanFiles(specials.plansFolderId);
  const matched = NDDriveState.matchPlanFiles(proj.floors || [], files, photoApi().levelFromName);
  let changed = 0;
  (proj.floors || []).forEach((floor) => {
    const file = matched[floor.id];
    if (!file) return;
    if (floor.planDriveFileId === file.id && floor.planSourceModified === file.modifiedTime && floor.planFromJobFolder) return;
    const replaced = floor.planDriveFileId !== file.id || (floor.planSourceModified && floor.planSourceModified !== file.modifiedTime);
    Object.assign(floor, { planDriveFileId: file.id, planFromJobFolder: true, planSourceModified: file.modifiedTime || "", planWebViewLink: file.webViewLink || floor.planWebViewLink || null, planFileName: file.name, planMimeType: file.mimeType || null, planPendingUpload: false });
    if (replaced) { floor.planPngFileId = null; evictFloorPlan(floor.id); }
    changed++;
  });
  if (changed) { persist({ skipDriveSync: true }); maybeFetchPlanForCurrentFloor(); }
  return changed;
}

function driveSyncApplyDoc(doc) {
  driveSync.applying = true;
  try {
    NDDriveState.applyToState(state, doc);
    const proj = project();
    if (proj && !(proj.floors || []).some((f) => f.id === state.selectedFloorId)) state.selectedFloorId = proj.floors?.[0]?.id || null;
    if (state.selectedNodeId && !state.nodes.some((n) => n.id === state.selectedNodeId)) state.selectedNodeId = null;
    persist({ skipDriveSync: true });
  } finally { driveSync.applying = false; }
}

function driveSyncLocalDoc(proj) { return NDDriveState.extractProject(state, proj.id, driveSyncDeviceId(), Date.now()); }

/* Called from render(): starts once per project, after sign-in (or straight away when offline, from the cache). */
function driveSyncMaybeOpen() {
  const proj = project();
  if (!proj || driveSync.busy || !window.NDDriveState || !window.NDPhotoFolders) return;
  if (!driveSyncOffline() && !isTokenValid()) return;
  if (!proj.photoFolderId && !state.ui.jobsRootFolderId) return;
  const sig = [proj.photoFolderId || "", state.ui.jobsRootFolderId || "", driveSyncOffline(), isTokenValid()].join("|");
  if (driveSync.projectId === proj.id && (driveSync.status !== "no-job" && driveSync.status !== "offline" || driveSync.sig === sig)) return;   // once per project, again when the link, network or sign-in changes
  driveSync.sig = sig;
  driveSyncOpen(proj).catch((e) => { driveSync.busy = false; driveSyncSet("error", describeError(e)); });
}

async function driveSyncOpen(proj) {
  driveSync.busy = true; driveSync.ready = false; driveSync.projectId = proj.id; driveSync.unsynced = false;
  clearTimeout(driveSync.timer);
  const offline = driveSyncOffline();
  driveSyncSet("loading", "");
  try {
    const jobFolderId = offline ? proj.photoFolderId : await driveSyncResolveJobFolder(proj);
    driveSync.jobFolderId = jobFolderId || "";
    if (!jobFolderId) { driveSync.busy = false; driveSyncSet("no-job", "No job folder linked"); return; }
    const engine = driveSyncEngine();
    const job = { jobFolderId: jobFolderId, projectId: proj.id };
    if (!offline) { try { await driveSyncApplyPlans(proj, jobFolderId); } catch (e) { if (!NDDriveState.isOfflineError(e)) console.warn("Floor Plans folder not read", e); } }
    const res = await engine.load(job);
    if (state.selectedProjectId !== proj.id) { driveSync.busy = false; return; }   // user moved on
    if (res.status === "no-drive-json") { driveSync.ready = false; driveSync.busy = false; driveSyncSet("no-drive-json", "", res.unsynced); return; }
    if (res.doc) {
      if (res.status === "loaded") {
        const merged = NDDriveState.merge(NDDriveState.legacyStamp(driveSyncLocalDoc(proj)), res.doc);
        driveSyncApplyDoc(merged);
        driveSync.ready = true; driveSync.busy = false;
        driveSyncSet("synced", "", false);
        scheduleDriveSave(true);
        return;
      }
      driveSyncApplyDoc(res.doc);
    }
    driveSync.ready = res.status !== "offline" || !!res.cached;
    driveSync.busy = false;
    if (res.status === "offline") driveSyncSet("offline", "", !!res.unsynced); else driveSyncSet("synced", "", false);
  } catch (e) { driveSync.busy = false; driveSyncSet("error", describeError(e)); }
}

function scheduleDriveSave(immediate) {
  if (driveSync.applying || !driveSync.ready || !project() || project().id !== driveSync.projectId) return;
  clearTimeout(driveSync.timer);
  driveSync.timer = setTimeout(() => { driveSyncSave().catch((e) => console.warn("Drive save", e)); }, immediate ? 50 : DRIVE_SYNC_DEBOUNCE_MS);
}

async function driveSyncSave() {
  const proj = project();
  if (!proj || proj.id !== driveSync.projectId || !driveSync.ready || driveSync.busy) return;
  driveSync.busy = true;
  try {
    const job = { jobFolderId: driveSync.jobFolderId, projectId: proj.id };
    const res = await driveSyncEngine().save(job, driveSyncLocalDoc(proj));
    driveSync.busy = false;
    if (res.status === "merged" && state.selectedProjectId === proj.id) { driveSyncApplyDoc(res.doc); toast("Merged changes from another device"); }
    if (res.status === "queued") driveSyncSet("offline", "", true);
    else if (res.status !== "no-remote") driveSyncSet("synced", "", false);
  } catch (e) { driveSync.busy = false; driveSyncSet("error", describeError(e), true); }
}

async function driveSyncMigrate() {
  const proj = project();
  if (!proj || !driveSync.jobFolderId) return;
  driveSync.busy = true; driveSyncSet("saving", "");
  try {
    const res = await driveSyncEngine().migrate({ jobFolderId: driveSync.jobFolderId, projectId: proj.id }, driveSyncLocalDoc(proj));
    driveSync.busy = false;
    if (res.status === "exists") { driveSync.projectId = ""; toast("This project already has Drive data. Loading it instead."); return render(); }
    driveSync.ready = true;
    driveSyncSet("synced", "", false);
    toast("Project saved to Drive");
  } catch (e) { driveSync.busy = false; driveSyncSet("error", describeError(e)); }
}

function driveSyncFlush() {
  const proj = project();
  if (!proj || proj.id !== driveSync.projectId || !driveSync.jobFolderId || driveSync.busy) return;
  driveSync.busy = true;
  driveSyncEngine().flush({ jobFolderId: driveSync.jobFolderId, projectId: proj.id }).then((res) => {
    driveSync.busy = false;
    if (res.doc && (res.status === "merged" || res.status === "loaded")) driveSyncApplyDoc(res.doc);
    driveSync.ready = res.status !== "offline" && res.status !== "no-drive-json" ? true : driveSync.ready;
    if (res.status === "queued" || res.status === "offline") driveSyncSet("offline", "", true); else driveSyncSet("synced", "", false);
  }).catch((e) => { driveSync.busy = false; driveSyncSet("error", describeError(e), true); });
}

if (typeof window !== "undefined") {
  window.addEventListener("online", () => { driveSyncFlush(); });
  window.addEventListener("offline", () => { if (driveSync.projectId) driveSyncSet("offline", "", driveSync.unsynced); });
}

function renderDriveSyncBadge() {
  const proj = project();
  if (!proj || driveSync.projectId !== proj.id || driveSync.status === "idle" || driveSync.status === "no-job") return "";
  const s = driveSync.status;
  const label = s === "loading" ? "Drive: loading\u2026" : s === "saving" ? "Drive: saving\u2026"
    : s === "synced" ? "Drive: synced" : s === "offline" ? (driveSync.unsynced ? "Offline \u00b7 unsynced" : "Offline \u00b7 saved copy")
    : s === "no-drive-json" ? "Not saved to Drive" : "Drive: " + (driveSync.message || "error");
  const tone = s === "synced" ? "ok" : s === "loading" || s === "saving" ? "wait" : "warn";
  const button = s === "no-drive-json" && NDDriveState.hasContent(driveSyncLocalDoc(proj)) ? `<button class="ghost-button" type="button" data-action="drive-migrate">${icon("upload")}<span>Save this project to Drive</span></button>` : "";
  const retry = s === "error" ? `<button class="ghost-button" type="button" data-action="drive-retry">${icon("refresh")}<span>Retry</span></button>` : "";
  return `<div class="drive-sync-row"><span class="drive-sync-badge is-${tone}" role="status">${escapeHtml(label)}</span>${button}${retry}</div>`;
}

function linkJobsRoot(input) {
  const id = photoApi().parseDriveFolderId(input);
  if (!id) { toast("Paste the link to the jobs folder"); return; }
  state.ui.jobsRootFolderId = id;
  driveSync.projectId = "";
  persist({ skipDriveSync: true });
  toast("Jobs folder saved. Projects with a matching job folder link automatically.");
  render();
}
