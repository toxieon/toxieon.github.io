/* ============================================================ MASTER SYNC
 * Slice 2 §2.2 — dirty-set delta model (kills the clobber).
 * Every flush: rebuild rows in memory, diff against the last-synced
 * snapshot (id -> row hash), write ONLY changed rows (upsert by ID),
 * delete ONLY rows we previously wrote that no longer exist locally.
 * Full rewrite survives ONLY as rebuildMasterSheet() (danger-zone
 * recovery). Neither path ever touches the Inbox tab (§0.4).
 * ======================================================================= */

const MASTER_SNAPSHOT_KEY = "np-master-snapshot-v1";
const MASTER_SYNC_DEBOUNCE_MS = 1500;   // Quote-feel (§2.2)




let _masterSheetMeta = null;            // tab title -> sheetId (for row deletes)
let _syncStatus = "synced";             // synced | pending | flushing | failed
let _syncStatusListeners = [];
let _pendingSummary = [];               // [{kind, key, lastError}] for the chip panel
let _lastSyncError = null;

function setSyncStatus(s) {
  if (s === _syncStatus) return;
  _syncStatus = s;
  _syncStatusListeners.forEach((cb) => { try { cb(s); } catch (e) {} });
  const chip = document.querySelector("[data-sync-chip]");
  if (chip && window.NDUI) {
    chip.dataset.sync = s;
    chip.textContent = NDUI.syncChipLabel(s, _pendingSummary.length);
  }
}

/* §1.6 facade — quacks like nd-queue so NDUI.syncChip + future consumers work */
window.NDQueue = {
  status: () => _syncStatus,
  size: () => _pendingSummary.length,
  pending: () => _pendingSummary.map((x) => ({ ...x })),
  onStatus: (cb) => { _syncStatusListeners.push(cb); return () => { _syncStatusListeners = _syncStatusListeners.filter((l) => l !== cb); }; },
  flush: () => flushMasterDeltas({ manual: true })
};

function rowHash(row) {
  const s = JSON.stringify(row.map((v) => String(v ?? "")));
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return (h >>> 0).toString(36);
}

function loadSnapshot() {
  try { return JSON.parse(localStorage.getItem(MASTER_SNAPSHOT_KEY)) || null; } catch (e) { return null; }
}
function saveSnapshot(snap) {
  try { localStorage.setItem(MASTER_SNAPSHOT_KEY, JSON.stringify(snap)); } catch (e) { console.warn("snapshot persist failed", e); }
}

/* One place that knows how to turn local state into master-sheet rows —
 * shared by the delta flush AND the danger-zone rebuild. Column order is
 * MASTER_TABS; column A is always the row ID. */
function buildMasterRows() {
  const out = { Projects: new Map(), Floors: new Map(), Nodes: new Map(), Photos: new Map(), Folders: new Map(), Rooms: new Map() };
  state.projects.forEach((p) => {
    const nodes = state.nodes.filter((n) => n.projectId === p.id);
    out.Projects.set(p.id, [p.id, p.name, projectFolder(p)?.name || DRIVE_UNFILED_FOLDER, p.address || "", p.description || "", p.createdBy || "", p.createdAt || "", p.updatedAt || "", state.drive.projectFolderMap[p.id] || "", (p.floors || []).length, nodes.length, p.protected ? "TRUE" : ""]);
    (p.floors || []).forEach((f) => {
      const count = state.nodes.filter((n) => n.floorId === f.id).length;
      out.Floors.set(f.id, [f.id, p.id, p.name, f.name, f.order || 0, f.planDriveFileId || "", state.drive.floorFolderMap[f.id] || "", count, f.createdAt || "", f.planAspectRatio || "", f.planPngFileId || ""]);
    });
  });
  state.nodes.forEach((n) => {
    const proj = projectById(n.projectId);
    const floor = proj?.floors?.find((f) => f.id === n.floorId);
    const photoIds = (n.imageRefs || []).map((img) => img.driveFileId || img.id).filter(Boolean).join(", ");
    out.Nodes.set(n.id, [n.id, n.projectId, proj?.name || "", n.floorId || "", floor?.name || "", n.type || "marker", nodeDisplayTitle(n), n.customTitle || "", n.category || "", n.lineItem || "", n.status || "", n.assignedTo || "", (n.tags || []).join(", "), n.position?.x ?? "", n.position?.y ?? "", n.size ?? 1, n.description || "", (n.imageRefs || []).length, (n.comments || []).length, n.createdBy || "", n.createdAt || "", n.updatedAt || "", state.drive.nodeFolderMap[n.id] || "", n.linkedProjectId || "", n.linkedFloorId || "", n.linkedNodeId || "", photoIds, n.roomId || "", roomName(n.roomId), n.linkedRoomId || "", n.circuit || "", n.cableRunM ?? "", n.boardLabel || "", n.phaseConfig || "", n.mainBreakerA ?? "", n.swbProjectId || "", n.swbSchemaVersion || ""]);
    (n.imageRefs || []).forEach((img) => {
      const pid = img.id || img.driveFileId || "";
      if (!pid) return;
      out.Photos.set(pid, [pid, img.driveFileId || "", img.name || "", n.id, nodeDisplayTitle(n), n.floorId || "", floor?.name || "", n.projectId, proj?.name || "", img.uploader || "", img.uploadedAt || "", img.mimeType || "", img.webViewLink || "", img.thumbnailLink || ""]);
    });
  });
  state.projectFolders.forEach((f) => out.Folders.set(f.id, [f.id, f.name, f.color || "", state.projects.filter((p) => p.folderId === f.id).length, f.driveFolderId || ""]));
  state.rooms.forEach((r) => out.Rooms.set(r.id, [r.id, r.projectId || "", r.floorId || "", r.name || "", r.createdAt || "", r.updatedAt || "", r.order || 0, serializeRoomShape(r.shape)]));
  return out;
}

function computeDeltas(rows, snapshot, addOnly = false) {
  const deltas = {};
  let count = 0;
  const summary = [];
  Object.keys(MASTER_TABS).forEach((tab) => {
    const snapTab = (snapshot && snapshot[tab]) || {};
    const upserts = new Map();
    const deletes = [];
    rows[tab].forEach((row, id) => {
      const h = rowHash(row);
      if (addOnly ? !(id in snapTab) : snapTab[id] !== h) upserts.set(id, row);
    });
    if (!addOnly) Object.keys(snapTab).forEach((id) => { if (!rows[tab].has(id)) deletes.push(id); });
    if (upserts.size || deletes.length) {
      deltas[tab] = { upserts, deletes };
      count += upserts.size + deletes.length;
      upserts.forEach((_, id) => summary.push({ kind: tab, key: id, op: "upsert", lastError: _lastSyncError }));
      deletes.forEach((id) => summary.push({ kind: tab, key: id, op: "delete", lastError: _lastSyncError }));
    }
  });
  return { deltas, count, summary };
}

function scheduleMasterSync() {
  if (!state.drive.masterSheetId) return;
  setSyncStatus("pending");   // 0.18.5: also while signed out, so the chip never says "synced" over unsent edits
  if (!isTokenValid()) return;
  if (_masterSyncing) { _masterSyncQueued = true; return; }
  clearTimeout(_masterSyncTimer);
  _masterSyncTimer = setTimeout(() => { flushMasterDeltas({ silent: true }).catch((e) => console.warn("auto master sync", e)); }, MASTER_SYNC_DEBOUNCE_MS);
}

async function masterSheetIdFor(tab) {
  if (!_masterSheetMeta) {
    const r = await googleCall(() => gapi.client.sheets.spreadsheets.get({ spreadsheetId: state.drive.masterSheetId, fields: "sheets.properties" }));
    _masterSheetMeta = {};
    (r.result.sheets || []).forEach((s) => { _masterSheetMeta[s.properties.title] = s.properties.sheetId; });
  }
  return _masterSheetMeta[tab];
}

/* Seed the snapshot from what's already IN the sheet, so migrating to the
 * delta model doesn't mass-rewrite (or mass-delete) anything. */
async function seedSnapshotFromSheet() {
  const tabs = Object.keys(MASTER_TABS);
  const r = await googleCall(() => gapi.client.sheets.spreadsheets.values.batchGet({
    spreadsheetId: state.drive.masterSheetId,
    ranges: tabs.map((t) => `${t}!A2:AK`)
  }));
  const snap = {};
  tabs.forEach((tab, i) => {
    snap[tab] = {};
    const width = MASTER_TABS[tab].length;
    ((r.result.valueRanges?.[i]?.values) || []).forEach((raw) => {
      const id = String(raw[0] || "");
      if (!id) return;
      const row = Array.from({ length: width }, (_, c) => raw[c] === undefined ? "" : raw[c]);
      snap[tab][id] = rowHash(row);
    });
  });
  return snap;
}

async function applyTabDelta(tab, delta) {
  const width = MASTER_TABS[tab].length;
  const endCol = ND.sheetsKit.colLetter(width - 1);
  const colA = await googleCall(() => gapi.client.sheets.spreadsheets.values.get({
    spreadsheetId: state.drive.masterSheetId, range: `${tab}!A:A`
  }));
  const idToRow = {};
  ((colA.result.values) || []).forEach((cells, i) => { if (i > 0 && cells[0]) idToRow[String(cells[0])] = i + 1; });

  const updates = [];
  const appends = [];
  delta.upserts.forEach((row, id) => {
    const rowNumber = idToRow[id];
    if (rowNumber) updates.push({ range: `${tab}!A${rowNumber}:${endCol}${rowNumber}`, values: [row] });
    else appends.push(row);
  });
  if (updates.length) {
    await googleCall(() => gapi.client.sheets.spreadsheets.values.batchUpdate({
      spreadsheetId: state.drive.masterSheetId,
      resource: { valueInputOption: "RAW", data: updates }
    }));
  }
  if (appends.length) {
    await googleCall(() => gapi.client.sheets.spreadsheets.values.append({
      spreadsheetId: state.drive.masterSheetId, range: `${tab}!A1`,
      valueInputOption: "RAW", insertDataOption: "INSERT_ROWS"
    }, { values: appends }));
  }
  const deleteRowNumbers = delta.deletes.map((id) => idToRow[id]).filter(Boolean).sort((a, b) => b - a);
  if (deleteRowNumbers.length) {
    const sheetId = await masterSheetIdFor(tab);
    if (sheetId !== undefined) {
      await googleCall(() => gapi.client.sheets.spreadsheets.batchUpdate({ spreadsheetId: state.drive.masterSheetId }, {
        requests: deleteRowNumbers.map((n) => ({ deleteDimension: { range: { sheetId, dimension: "ROWS", startIndex: n - 1, endIndex: n } } }))
      }));
    }
  }
}

async function flushMasterDeltas(opts = {}) {
  const { silent = false, manual = false } = opts;
  if (_bootSyncing && !opts.prePull) { setSyncStatus("pending"); return; }   // 0.19.1: sign-in pushes first, then reloads
  if (_masterReloading || state.googleAuth.hydrating) { _masterSyncQueued = true; return; }
  if (!isTokenValid()) { if (manual) toast("Sign in first"); return; }
  if (!state.drive.masterSheetId) { if (manual) toast("Master sheet not bootstrapped"); return; }
  if (_masterSyncing) { _masterSyncQueued = true; return; }
  _masterSyncing = true;
  setSyncStatus("flushing");
  try {
    await ensureMasterTabsExist();
    // 0.19.1: with no snapshot for THIS sheet (never synced here), seed from the sheet and only add
    // records the sheet doesn't have: never overwrite or delete cloud rows from unproven local state.
    let snapshot = sheetSnapshot();
    if (!snapshot) { snapshot = await seedSnapshotFromSheet(); snapshot.__seeded = true; snapshot.__sheet = state.drive.masterSheetId; saveSnapshot(snapshot); }
    else if (!snapshot.__sheet) snapshot.__sheet = state.drive.masterSheetId;
    const rows = buildMasterRows();
    const { deltas } = computeDeltas(rows, snapshot, !!snapshot.__seeded);
    if (opts.prePull) await dropCloudNewer(deltas);   // another device's newer edit wins; the reload brings it in
    let count = 0; const summary = [];
    Object.keys(deltas).forEach((tab) => {
      const d = deltas[tab];
      if (!d.upserts.size && !d.deletes.length) { delete deltas[tab]; return; }
      count += d.upserts.size + d.deletes.length;
      d.upserts.forEach((_, id) => summary.push({ kind: tab, key: id, op: "upsert", lastError: _lastSyncError }));
      d.deletes.forEach((id) => summary.push({ kind: tab, key: id, op: "delete", lastError: _lastSyncError }));
    });
    _pendingSummary = summary;
    if (!count) {
      _lastSyncError = null;
      setSyncStatus("synced");
      if (manual) toast("Master sheet already up to date");
      return;
    }
    for (const tab of Object.keys(deltas)) {
      await applyTabDelta(tab, deltas[tab]);
      // commit this tab's snapshot only after its writes landed (0.19.1: only the rows written)
      snapshot[tab] = snapshot[tab] || {};
      deltas[tab].upserts.forEach((row, id) => { snapshot[tab][id] = rowHash(row); });
      deltas[tab].deletes.forEach((id) => { delete snapshot[tab][id]; });
      saveSnapshot(snapshot);
    }
    _pendingSummary = [];
    _lastSyncError = null;
    setSyncStatus("synced");
    if (!silent || manual) toast(`Synced ${count} change${count === 1 ? "" : "s"}`);
  } catch (e) {
    console.warn("Delta sync failed", e);
    _lastSyncError = describeError(e);
    _pendingSummary = _pendingSummary.map((x) => ({ ...x, lastError: _lastSyncError }));
    setSyncStatus("failed");
    if (manual) toast("Sync failed: " + _lastSyncError);
  } finally {
    _masterSyncing = false;
    if (_masterSyncQueued) { _masterSyncQueued = false; scheduleMasterSync(); }
  }
}

/* Danger-zone recovery ONLY (§2.2/§2.6): full clobber-and-rewrite of the
 * six MASTER_TABS. Never touches Inbox — it isn't in MASTER_TABS (§0.4). */
async function confirmRebuildMasterSheet() {
  const go = window.NDUI
    ? await NDUI.confirm({
        title: "Rebuild master sheet",
        message: "Recovery tool: wipes and rewrites the Projects/Floors/Nodes/Photos/Folders/Rooms tabs from this device's data. The Inbox tab is never touched. Only use this if the sheet is corrupted.",
        confirmLabel: "Rebuild", danger: true, typeToConfirm: "REBUILD"
      })
    : window.confirm("Full rebuild of the master sheet from local data?");
  if (go) return rebuildMasterSheet();
}

async function rebuildMasterSheet(opts = {}) {
  const { silent = false } = opts;
  if (!isTokenValid()) { if (!silent) toast("Sign in first"); return; }
  if (!state.drive.masterSheetId) { if (!silent) toast("Master sheet not bootstrapped"); return; }
  if (_masterSyncing) { if (!silent) toast("Sync already running"); return; }
  _masterSyncing = true;
  setSyncStatus("flushing");
  if (!silent) toast("Rebuilding master sheet...");
  try {
    await ensureMasterTabsExist();
    await importMasterPhotos({ silent: true, renderOnChange: false, scheduleSync: false });
    const rows = buildMasterRows();
    await googleCall(() => gapi.client.sheets.spreadsheets.values.batchClear({
      spreadsheetId: state.drive.masterSheetId,
      resource: { ranges: Object.keys(MASTER_TABS).map((t) => t === "Nodes" ? "Nodes!A2:AK" : `${t}!A2:AD`) }
    }));
    const data = [];
    Object.keys(MASTER_TABS).forEach((tab) => {
      const values = Array.from(rows[tab].values());
      if (values.length) data.push({ range: `${tab}!A2`, values });
    });
    if (data.length) {
      await googleCall(() => gapi.client.sheets.spreadsheets.values.batchUpdate({
        spreadsheetId: state.drive.masterSheetId,
        resource: { valueInputOption: "RAW", data }
      }));
    }
    const snapshot = {};
    Object.keys(MASTER_TABS).forEach((tab) => {
      snapshot[tab] = {};
      rows[tab].forEach((row, id) => { snapshot[tab][id] = rowHash(row); });
    });
    saveSnapshot(snapshot);
    _pendingSummary = [];
    _lastSyncError = null;
    setSyncStatus("synced");
    if (!silent) toast(`Master sheet rebuilt: ${rows.Projects.size} projects / ${rows.Floors.size} floors / ${rows.Nodes.size} nodes / ${rows.Photos.size} photos / ${rows.Rooms.size} rooms`);
  } catch (e) {
    console.warn("Master rebuild failed", e);
    setSyncStatus("failed");
    if (!silent) toast("Master rebuild failed: " + describeError(e));
  } finally {
    _masterSyncing = false;
  }
}

async function refreshCategories() {
  if (!isTokenValid() || !state.drive.categoriesSheetId) return;
  try {
    const meta = await gapi.client.sheets.spreadsheets.get({ spreadsheetId: state.drive.categoriesSheetId, fields: "sheets.properties.title,sheets.properties.sheetId,sheets.properties.tabColor" });
    const sheetProps = (meta.result.sheets || []).map((s) => s.properties);
    const tabs = sheetProps.map((s) => s.title);
    if (!tabs.length) return;
    const vr = await gapi.client.sheets.spreadsheets.values.batchGet({ spreadsheetId: state.drive.categoriesSheetId, ranges: tabs.map((t) => categorySheetRange(t, "A2:E")) });
    const data = {};
    (vr.result.valueRanges || []).forEach((v, idx) => {
      const tabName = tabs[idx];
      const tabHex = rgbColorToHex(sheetProps[idx]?.tabColor);
      const rows = (v.values || []).filter((r) => r && r[0] != null && String(r[0]).trim());
      const items = rows.map((r) => ({ item: (r[0]||"").toString().trim(), code: (r[1]||"").toString().trim(), description: (r[2]||"").toString().trim(), color: (r[3]||"").toString().trim() || null, shorthand: (r[4]||"").toString().trim().slice(0, 4) }));
      const tabColor = tabHex || DEFAULT_CATEGORY_TABS.find((t) => t.name === tabName)?.color || items.find((i) => i.color)?.color || hashColor(tabName);
      data[tabName] = { color: tabColor, items };
    });
    state.categoriesData = data;
    state.categoriesLoadedAt = nowStamp();
    persist(); render();
  } catch (e) { console.warn("Categories refresh failed", e); toast("Failed to refresh categories: " + describeError(e)); }
}

async function refreshTeamAccess() {
  if (!isPrimaryOwner() || !state.drive.rootFolderId) return;
  try {
    const r = await gapi.client.drive.permissions.list({ fileId: state.drive.rootFolderId, fields: "permissions(id,emailAddress,role,type,displayName)" });
    state.teamAccess = { permissions: r.result.permissions || [], loadedAt: nowStamp() };
    persist(); render();
  } catch (e) { console.warn("Team access refresh failed", e); }
}

async function addTeamMember(email, role = "writer") {
  if (!isPrimaryOwner()) return;
  if (!email.includes("@")) { toast("Invalid email"); return; }
  try {
    await gapi.client.drive.permissions.create({ fileId: state.drive.rootFolderId, resource: { type: "user", role, emailAddress: email }, sendNotificationEmail: true });
    toast(`${email} added (${role})`);
    logAudit("Team Member Added", { details: `${email} (${role})` });
    await refreshTeamAccess();
  } catch (e) { toast("Add failed: " + describeError(e)); }
}

async function removeTeamMember(permissionId, email) {
  if (!isPrimaryOwner()) return;
  if (!(await ndConfirm({ title: "Revoke access", message: `Revoke access for ${email}?`, confirmLabel: "Revoke", danger: true }))) return;
  try {
    await gapi.client.drive.permissions.delete({ fileId: state.drive.rootFolderId, permissionId });
    toast(`${email} access revoked`);
    logAudit("Team Member Removed", { details: email });
    await refreshTeamAccess();
  } catch (e) { toast("Remove failed: " + describeError(e)); }
}

async function ensureProjectDriveFolder(p) {
  if (!isTokenValid() || !state.drive.projectsFolderId) return null;
  if (state.drive.projectFolderMap[p.id]) {
    if (await driveFileExists(state.drive.projectFolderMap[p.id])) return state.drive.projectFolderMap[p.id];
    delete state.drive.projectFolderMap[p.id];
  }
  let parentId;
  if (p.folderId) {
    const folder = state.projectFolders.find((f) => f.id === p.folderId);
    if (!folder) return null;
    if (folder.driveFolderId && !(await driveFileExists(folder.driveFolderId))) folder.driveFolderId = null;
    if (!folder.driveFolderId) folder.driveFolderId = await ensureFolder(folder.name, state.drive.projectsFolderId);
    parentId = folder.driveFolderId;
  } else parentId = state.drive.unfiledFolderId;
  const id = await ensureFolder(p.name, parentId);
  state.drive.projectFolderMap[p.id] = id;
  persist();
  return id;
}

async function parentFolderIdForProjectFolder(folderId) {
  if (!folderId) return state.drive.unfiledFolderId;
  const folder = state.projectFolders.find((f) => f.id === folderId);
  if (!folder) return state.drive.unfiledFolderId;
  if (folder.driveFolderId && !(await driveFileExists(folder.driveFolderId))) folder.driveFolderId = null;
  if (!folder.driveFolderId) folder.driveFolderId = await ensureFolder(folder.name, state.drive.projectsFolderId);
  return folder.driveFolderId;
}

async function moveProjectDriveFolder(p, previousFolderId) {
  if (!isTokenValid()) return null;
  const projectFolderId = state.drive.projectFolderMap[p.id];
  if (!projectFolderId || !(await driveFileExists(projectFolderId))) return ensureProjectDriveFolder(p);
  const oldParentId = await parentFolderIdForProjectFolder(previousFolderId);
  const newParentId = await parentFolderIdForProjectFolder(p.folderId || null);
  if (newParentId && oldParentId !== newParentId) await moveDriveFileToFolder(projectFolderId, newParentId, oldParentId);
  persist();
  return projectFolderId;
}

async function ensureFloorDriveFolder(projectItem, floor) {
  if (!isTokenValid()) return null;
  if (state.drive.floorFolderMap[floor.id]) {
    if (await driveFileExists(state.drive.floorFolderMap[floor.id])) return state.drive.floorFolderMap[floor.id];
    delete state.drive.floorFolderMap[floor.id];
  }
  const projectFolderId = await ensureProjectDriveFolder(projectItem); if (!projectFolderId) return null;
  const id = await ensureFolder(floor.name, projectFolderId);
  state.drive.floorFolderMap[floor.id] = id;
  persist();
  return id;
}

async function syncAllDriveFolders(opts = {}) {
  const { silent = false } = opts;
  if (!isTokenValid()) { if (!silent) toast("Sign in first"); return; }
  let createdProjects = 0, createdFloors = 0, errors = 0;
  if (!silent) toast("Syncing Drive folders...");
  for (const proj of state.projects) {
    try {
      const wasSet = Boolean(state.drive.projectFolderMap[proj.id]);
      await ensureProjectDriveFolder(proj);
      if (!wasSet && state.drive.projectFolderMap[proj.id]) createdProjects++;
    } catch (e) { errors++; console.warn("Project sync failed", proj.name, e); continue; }
    for (const floor of (proj.floors || [])) {
      try {
        const wasFlSet = Boolean(state.drive.floorFolderMap[floor.id]);
        await ensureFloorDriveFolder(proj, floor);
        if (!wasFlSet && state.drive.floorFolderMap[floor.id]) createdFloors++;
      } catch (e) { errors++; console.warn("Floor sync failed", proj.name, floor.name, e); }
    }
  }
  persist();
  if (!silent) {
    const parts = [];
    if (createdProjects) parts.push(`${createdProjects} project folder(s)`);
    if (createdFloors) parts.push(`${createdFloors} floor folder(s)`);
    if (!parts.length) toast(errors ? `Sync done. ${errors} error(s) - see console.` : "All folders already present.");
    else toast(`Created ${parts.join(" + ")}${errors ? ` (${errors} errors)` : ""}`);
  }
  if (createdProjects || createdFloors) logAudit("Drive Sync", { details: `Created ${createdProjects} project(s) + ${createdFloors} floor(s)` });
  render();
}

const nodeFolderRequests = new Map();
function ensureNodeDriveFolder(node) {
  if (!nodeFolderRequests.has(node.id)) nodeFolderRequests.set(node.id, ensureNodeDriveFolderOnce(node).finally(() => nodeFolderRequests.delete(node.id)));
  return nodeFolderRequests.get(node.id);
}
async function ensureNodeDriveFolderOnce(node) {
  if (!isTokenValid()) return null;
  if (state.drive.nodeFolderMap[node.id]) {
    if (await driveFileExists(state.drive.nodeFolderMap[node.id])) return state.drive.nodeFolderMap[node.id];
    delete state.drive.nodeFolderMap[node.id];
  }
  const proj = projectById(node.projectId); if (!proj) return null;
  const floor = floorById(proj, node.floorId) || proj.floors[0]; if (!floor) return null;
  const floorFolderId = await ensureFloorDriveFolder(proj, floor); if (!floorFolderId) return null;
  const id = await ensureFolder(nodeDisplayTitle(node) || node.id, floorFolderId);
  state.drive.nodeFolderMap[node.id] = id;
  persist();
  return id;
}

function arrayBufferToBase64(buffer) {
  let binary = ""; const bytes = new Uint8Array(buffer); const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
  return btoa(binary);
}

const uploadFileIds = new WeakMap();
async function uploadFileToDrive(file, parentFolderId, overrideName) {
  if (!parentFolderId) throw new Error("No parent folder");
  await NDAuth.ensureToken();
  if (!uploadFileIds.has(file)) {
    const ids = await googleCall(() => gapi.client.drive.files.generateIds({count:1, space:'drive'}));
    uploadFileIds.set(file, ids.result.ids[0]);
  }
  const id = uploadFileIds.get(file), boundary = 'neillp-' + id;
  const metadata = {id, name: overrideName || file.name, parents:[parentFolderId]};
  const body = new Blob(['--'+boundary+'\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n'+JSON.stringify(metadata)+'\r\n--'+boundary+'\r\nContent-Type: '+(file.type || 'application/octet-stream')+'\r\n\r\n', file, '\r\n--'+boundary+'--\r\n'], {type:'multipart/related; boundary='+boundary});
  const fields = 'id,name,webViewLink,thumbnailLink,mimeType,iconLink';
  return googleCall(async () => {
    const token = await NDAuth.ensureToken();
    const response = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields='+encodeURIComponent(fields), {method:'POST', headers:{Authorization:'Bearer '+token}, body});
    if (response.status === 409) return (await gapi.client.drive.files.get({fileId:id, fields})).result;
    const data = await response.json();
    if (!response.ok) { const error = new Error(data.error?.message || 'Drive upload failed'); error.status = response.status; throw error; }
    return data;
  });
}

async function updateFileBytes(fileId, file) {
  // 0.15.3 — send the File itself; gapi.client.request would serialise a Uint8Array body as JSON.
  const token = await NDAuth.ensureToken();
  const r = await fetch(`https://www.googleapis.com/upload/drive/v3/files/${encodeURIComponent(fileId)}?uploadType=media&fields=id,name,webViewLink,thumbnailLink,mimeType`, {
    method: "PATCH", headers: { Authorization: "Bearer " + token, "Content-Type": file.type || "application/octet-stream" }, body: file
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) { const err = new Error(data.error?.message || "Drive update failed"); err.status = r.status; throw err; }
  return data;
}

async function fetchDriveFileAsDataUrl(fileId, options = {}) {
  if (!isTokenValid()) return null;
  let firstErr = null;
  // 0.15.3 — raw bytes via fetch: gapi.client.request returns the body as decoded text, which can
  // mangle binary (PDF) bytes. Falls back to the old path if fetch fails.
  try {
    const token = await NDAuth.ensureToken();
    const r = await fetch(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?alt=media`, { cache: options.fresh ? "no-store" : "default", headers: { Authorization: "Bearer " + token } });
    if (!r.ok) throw new Error("Drive download " + r.status);
    const blob = await r.blob();
    const url = await new Promise((res, rej) => { const fr = new FileReader(); fr.onload = () => res(fr.result); fr.onerror = () => rej(fr.error); fr.readAsDataURL(blob); });
    return normalizePdfDataUrl(url);
  } catch (e) { console.warn("Drive fetch download failed, trying gapi", e); firstErr = e; }
  try {   // 0.18.5: if the fallback also fails, report the real Drive error (e.g. 403/404), not the fallback's
  let meta;
  try { meta = await gapi.client.drive.files.get({ fileId, fields: "mimeType,name" }); }
  catch (e) { meta = { result: { mimeType: "application/octet-stream" } }; }
  const mime = meta.result.mimeType || "application/octet-stream";
  const resp = await gapi.client.request({ path: `/drive/v3/files/${encodeURIComponent(fileId)}`, method: "GET", params: { alt: "media" }, ...(options.fresh ? { headers: { "Cache-Control": "no-cache" } } : {}) });
  const bin = resp.body;
  const arr = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i) & 0xff;
  return normalizePdfDataUrl(`data:${mime};base64,${arrayBufferToBase64(arr.buffer)}`);
  } catch (e) { throw firstErr || e; }
}

// #37 — Drive thumbnail URLs need Google session cookies this app doesn't have,
// so photo tiles 403. Fetch the bytes with our OAuth token and swap them in.
// Shared across the suite via assets/drive-image.js (#34).
function hydrateDriveImages() {
  if (!isTokenValid() || !window.NDDriveImage) return;
  return NDDriveImage.hydrate({ getToken: () => state.googleAuth.accessToken });
}

function auditRowToValues(r) {
  return [r.timestamp || nowStamp(), r.user || "", r.action || "", r.projectId || "", r.projectName || "", r.folderName || "", r.floorName || "", r.nodeId || "", r.nodeTitle || "", r.category || "", r.status || "", r.details || "", r.device || detectDevice()];
}

async function flushAuditQueue() {
  if (!isTokenValid() || !state.drive.auditSheetId || !state.auditQueue.length) return;
  const queue = state.auditQueue.slice(); state.auditQueue = []; persist();
  try {
    await gapi.client.sheets.spreadsheets.values.append({
      spreadsheetId: state.drive.auditSheetId, range: `${AUDIT_TAB}!A:M`,
      valueInputOption: "USER_ENTERED", insertDataOption: "INSERT_ROWS",
      resource: { values: queue.map(auditRowToValues) }
    });
  } catch (e) { state.auditQueue = [...queue, ...state.auditQueue]; persist(); }
}

async function logAudit(action, opts = {}) {
  const proj = opts.projectId ? projectById(opts.projectId) : project();
  const folder = proj ? state.projectFolders.find((f) => f.id === proj.folderId) : null;
  const node = opts.nodeId ? state.nodes.find((n) => n.id === opts.nodeId) : null;
  const floor = node ? floorById(proj, node.floorId) : (opts.floorId && proj ? floorById(proj, opts.floorId) : currentFloor());
  const row = {
    timestamp: nowStamp(), user: state.googleAuth.profile?.email || "anonymous", action,
    projectId: proj?.id || "", projectName: proj?.name || "",
    folderName: folder?.name || (proj && !proj.folderId ? DRIVE_UNFILED_FOLDER : ""),
    floorName: floor?.name || "",
    nodeId: node?.id || opts.nodeId || "", nodeTitle: node ? nodeDisplayTitle(node) : (opts.nodeTitle || ""),
    category: node?.category || opts.category || "", status: opts.status ?? node?.status ?? "",
    details: opts.details || "", device: detectDevice()
  };
  if (!isTokenValid() || !state.drive.auditSheetId) { state.auditQueue.push(row); persist(); return; }
  try {
    await gapi.client.sheets.spreadsheets.values.append({
      spreadsheetId: state.drive.auditSheetId, range: `${AUDIT_TAB}!A:M`,
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
    const resp = await gapi.client.sheets.spreadsheets.values.get({ spreadsheetId: state.drive.auditSheetId, range: `${AUDIT_TAB}!A2:M` });
    const rows = (resp.result.values || []).map((r) => ({ timestamp: r[0]||"", user: r[1]||"", action: r[2]||"", projectId: r[3]||"", projectName: r[4]||"", folderName: r[5]||"", floorName: r[6]||"", nodeId: r[7]||"", nodeTitle: r[8]||"", category: r[9]||"", status: r[10]||"", details: r[11]||"", device: r[12]||"" }));
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
    if (q) { const hay = [r.timestamp,r.user,r.action,r.projectName,r.folderName,r.floorName,r.nodeId,r.nodeTitle,r.category,r.status,r.details,r.device].join(" ").toLowerCase(); if (!hay.includes(q)) return false; }
    if (from || to) { const t = Date.parse(r.timestamp.replace(" ", "T")); if (!isNaN(t)) { if (from && t < from) return false; if (to && t > to) return false; } }
    return true;
  });
}

function downloadAuditCsv(rows) {
  const esc = (v) => { const s = String(v ?? ""); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  const lines = [AUDIT_HEADER.join(",")];
  for (const r of rows) lines.push([r.timestamp,r.user,r.action,r.projectId,r.projectName,r.folderName,r.floorName,r.nodeId,r.nodeTitle,r.category,r.status,r.details,r.device].map(esc).join(","));
  const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a"); a.href = url; a.download = `NeillPlanner-Audit-${localDateStr(new Date())}.csv`;
  document.body.appendChild(a); a.click(); a.remove();
  URL.revokeObjectURL(url);
  toast(`CSV downloaded (${rows.length} rows)`);
}
