/* ============================================================ DRIVE / SHEETS */

async function bootstrapDrive() {
  state.googleAuth.bootstrapping = true; render();
  const prevSheetId = state.drive.masterSheetId || null;   // 0.19.1: which sheet this device's data belongs to
  _bootSyncing = true;   // 0.19.1: no background flush may run between the push and the reload below
  try {
    const rootId = await findOrCreateRootFolder();
    const [adminId, projectsId, unfiledId, bulkPhotosFolderId, sortedPhotosFolderId] = await Promise.all([
      findOrCreateChildFolder(DRIVE_ADMIN_FOLDER, rootId),
      findOrCreateChildFolder(DRIVE_PROJECTS_FOLDER, rootId),
      findOrCreateChildFolder(DRIVE_UNFILED_FOLDER, rootId),
      findOrCreateChildFolder(DRIVE_BULK_PHOTOS_FOLDER, rootId),
      findOrCreateChildFolder(DRIVE_SORTED_PHOTOS_FOLDER, rootId)
    ]);
    const [auditSheetId, categoriesSheetId, masterSheetId, usersSheetId, photoAllocationSheetId] = await Promise.all([
      isPrimaryOwner() ? ensureAuditSheet(adminId) : findSheetInFolder(AUDIT_SHEET_NAME, adminId),
      isPrimaryOwner() ? ensureCategoriesSheet(adminId) : findSheetInFolder(CATEGORIES_SHEET_NAME, adminId),
      isPrimaryOwner() ? ensureMasterSheet(adminId) : findSheetInFolder(MASTER_SHEET_NAME, adminId),
      isPrimaryOwner() ? ensureUsersSheet(adminId) : findSheetInFolder(USERS_SHEET_NAME, adminId),
      isPrimaryOwner() ? ensurePhotoAllocationSheet(adminId) : findSheetInFolder(PHOTO_ALLOCATION_SHEET_NAME, adminId)
    ]);
    Object.assign(state.drive, { rootFolderId: rootId, adminFolderId: adminId, projectsFolderId: projectsId, unfiledFolderId: unfiledId, bulkPhotosFolderId, sortedPhotosFolderId, auditSheetId, categoriesSheetId, masterSheetId, usersSheetId, photoAllocationSheetId });
    state.googleAuth.bootstrapped = true;
    state.googleAuth.bootstrapping = false;
    persist({ skipSync: true });
    // Slice 2 (§6.1): make sure the unified Inbox tab exists — idempotent,
    // header-guarded, and NEVER rewrites an existing tab (§0.4).
    if (state.drive.masterSheetId && window.NDInbox) {
      NDInbox.ensureInboxTab(ND.sheetsKit.gapiGateway(), state.drive.masterSheetId)
        .then((created) => { if (created) console.info("Inbox tab created in master sheet"); })
        .catch((e) => console.warn("Inbox tab ensure failed", e));
    }

    const tasks = [flushAuditQueue(), refreshCategories(), refreshBulkPhotos({ silent: true })];
    if (isPrimaryOwner()) tasks.push(refreshTeamAccess());
    await Promise.all(tasks);
    // Heal any missing project/floor folders silently in background
    syncAllDriveFolders({ silent: true }).catch((e) => console.warn("Background folder sync failed", e));
    await refreshUsers();
    // 0.19.1: PUSH this device's unsynced edits BEFORE the cloud reload replaces local state
    // (offline site work used to be wiped here). Data from a different master sheet/account is
    // never pushed into this one; it is backed up instead.
    const lastSheet = (loadSnapshot() || {}).__sheet || prevSheetId;
    const foreignLocal = !!(lastSheet && masterSheetId && lastSheet !== masterSheetId);
    if (foreignLocal) backupForeignLocalState(lastSheet);
    else await flushMasterDeltas({ silent: true, prePull: true });
    await hydrateFromMasterSheet({ silent: true, preferCloud: true, foreignLocal });
    _bootSyncing = false;
    await importMasterPhotos({ silent: true, renderOnChange: false });
    hydrateFromHash();
    maybeFetchPlanForCurrentFloor();
    healUnlinkedPlans().catch((e) => console.warn("plan heal failed", e));   // 0.18.5
    startMasterPhotoImportLoop();
    refreshInbox({ silent: true }).then(() => migrateLegacyBulkPhotos()).catch((e) => console.warn("Initial inbox refresh failed", e));
    flushMasterDeltas({ silent: true }).catch((e) => console.warn("Initial master sync failed", e));
    toast(isPrimaryOwner() ? "Connected. Drive ready." : `Connected. Using ${PRIMARY_OWNER_EMAIL}'s NeillPlanner.`);
    render();
  } catch (e) {
    console.error("Bootstrap failed", e);
    state.googleAuth.lastError = "Drive setup failed: " + describeError(e);
    state.googleAuth.bootstrapping = false;
    persist(); render();
  } finally { _bootSyncing = false; }
}

function describeError(e) { if (!e) return "unknown"; if (e.result?.error?.message) return e.result.error.message; if (e.message) return e.message; return String(e); }
function sleep(ms) { return new Promise((resolve) => window.setTimeout(resolve, ms)); }
function isRetryableGoogleError(e) {
  const status = Number(e?.status || e?.result?.error?.code || 0);
  const message = describeError(e).toLowerCase();
  return (e instanceof TypeError) || status === 429 || status === 500 || status === 502 || status === 503 || status === 504 || (status === 403 && /rate|quota|user.?limit|backend/i.test(message));
}
function isUnauthorizedGoogleError(e) {
  const status = Number(e?.status || e?.result?.error?.code || 0);
  if (status === 401) return true;
  const message = describeError(e).toLowerCase();
  return /invalid.?credentials|unauthenticated|auth(entication|orization)?.?(required|failed)|access.?token/i.test(message) && (status === 401 || status === 403 || status === 0);
}
async function googleCall(fn, attempts = 4) {
  let lastError = null;
  let did401Renew = false;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try { return await fn(); }
    catch (e) {
      lastError = e;
      // Mid-session expiry: renew once via NDAuth, then retry the same call.
      if (!did401Renew && isUnauthorizedGoogleError(e) && window.NDAuth) {
        did401Renew = true;
        try {
          await NDAuth.ensureToken({ force: true });
          continue;
        } catch (renewErr) {
          lastError = renewErr;
          break;
        }
      }
      if (!isRetryableGoogleError(e) || attempt === attempts - 1) break;
      await sleep(Math.min(12000, 600 * (2 ** attempt)) + Math.floor(Math.random() * 300));
    }
  }
  throw lastError;
}
function escapeDriveQuery(v) { return String(v).replace(/\\/g, "\\\\").replace(/'/g, "\\'"); }

async function findOrCreateRootFolder() {
  // Primary owner: find a folder named NeillPlanner owned by me, create if absent
  // Other user: find a folder named NeillPlanner owned by primaryOwnerEmail, error if absent
  const ownerClause = isPrimaryOwner() ? "'me' in owners" : `'${escapeDriveQuery(PRIMARY_OWNER_EMAIL)}' in owners`;
  const q = `name='${escapeDriveQuery(DRIVE_ROOT_NAME)}' and mimeType='application/vnd.google-apps.folder' and ${ownerClause} and trashed=false`;
  const list = await gapi.client.drive.files.list({ q, fields: "files(id,name,owners)", pageSize: 5 });
  if (list.result.files?.length) return list.result.files[0].id;
  if (!isPrimaryOwner()) {
    throw new Error(`No NeillPlanner folder shared with you yet. Ask ${PRIMARY_OWNER_EMAIL} to add you in Settings -> Team Access.`);
  }
  // Primary creates in root of own Drive
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

const folderRequests = new Map();
function findOrCreateChildFolder(name, parentId) {
  const key = JSON.stringify([parentId, name]);
  if (!folderRequests.has(key)) folderRequests.set(key, findOrCreateChildFolderOnce(name, parentId).finally(() => folderRequests.delete(key)));
  return folderRequests.get(key);
}
async function findOrCreateChildFolderOnce(name, parentId) {
  const existing = await findChildFolder(name, parentId);
  if (existing) return existing;
  const create = await gapi.client.drive.files.create({
    resource: { name, mimeType: "application/vnd.google-apps.folder", parents: [parentId] }, fields: "id"
  });
  return create.result.id;
}

// Alias for backward-compatibility throughout the rest of the file:
const ensureFolder = findOrCreateChildFolder;

async function findSheetInFolder(name, parentId) {
  const q = `name='${escapeDriveQuery(name)}' and mimeType='application/vnd.google-apps.spreadsheet' and '${parentId}' in parents and trashed=false`;
  const list = await gapi.client.drive.files.list({ q, fields: "files(id,name)", pageSize: 5 });
  return list.result.files?.[0]?.id || null;
}

async function driveFileExists(fileId) {
  if (!fileId || !isTokenValid()) return false;
  try {
    const r = await googleCall(() => gapi.client.drive.files.get({ fileId, fields: "id,trashed" }));
    return Boolean(r.result.id && !r.result.trashed);
  } catch (e) {
    if (Number(e?.status || e?.result?.error?.code) === 404) return false;
    throw e; // Transient auth/network errors must not discard the existing folder map.
  }
}

async function ensureAuditSheet(adminId) {
  const existing = await findSheetInFolder(AUDIT_SHEET_NAME, adminId);
  if (existing) return existing;
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
  const existing = await findSheetInFolder(CATEGORIES_SHEET_NAME, adminId);
  if (existing) return existing;
  const created = await gapi.client.sheets.spreadsheets.create({
    resource: { properties: { title: CATEGORIES_SHEET_NAME }, sheets: DEFAULT_CATEGORY_TABS.map((t) => ({ properties: { title: t.name } })) },
    fields: "spreadsheetId,sheets.properties"
  });
  const sheetId = created.result.spreadsheetId;
  const meta = await gapi.client.drive.files.get({ fileId: sheetId, fields: "parents" });
  await gapi.client.drive.files.update({ fileId: sheetId, addParents: adminId, removeParents: (meta.result.parents || []).join(","), fields: "id, parents" });
  const writes = DEFAULT_CATEGORY_TABS.map((tab) => ({
    range: `${tab.name}!A1:E2`,
    values: [CATEGORIES_HEADER, ["", "", "Add line items below. Color column optional. Shorthand <=4 chars.", tab.color, ""]]
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

async function ensureMasterSheet(adminId) {
  const existing = await findSheetInFolder(MASTER_SHEET_NAME, adminId);
  if (existing) return existing;
  if (!isPrimaryOwner()) throw new Error(`${MASTER_SHEET_NAME} missing inside Admin Files. Ask ${PRIMARY_OWNER_EMAIL} to sign in once to seed it.`);
  const tabNames = Object.keys(MASTER_TABS);
  const created = await gapi.client.sheets.spreadsheets.create({
    resource: { properties: { title: MASTER_SHEET_NAME }, sheets: tabNames.map((t) => ({ properties: { title: t } })) },
    fields: "spreadsheetId,sheets.properties"
  });
  const sheetId = created.result.spreadsheetId;
  const meta = await gapi.client.drive.files.get({ fileId: sheetId, fields: "parents" });
  await gapi.client.drive.files.update({ fileId: sheetId, addParents: adminId, removeParents: (meta.result.parents || []).join(","), fields: "id,parents" });
  const headerWrites = tabNames.map((tab) => ({ range: `${tab}!A1`, values: [MASTER_TABS[tab]] }));
  await gapi.client.sheets.spreadsheets.values.batchUpdate({ spreadsheetId: sheetId, resource: { valueInputOption: "RAW", data: headerWrites } });
  const reqs = [];
  for (const ss of created.result.sheets) {
    reqs.push({ repeatCell: { range: { sheetId: ss.properties.sheetId, startRowIndex: 0, endRowIndex: 1 }, cell: { userEnteredFormat: { textFormat: { bold: true } } }, fields: "userEnteredFormat.textFormat.bold" } });
    reqs.push({ updateSheetProperties: { properties: { sheetId: ss.properties.sheetId, gridProperties: { frozenRowCount: 1 } }, fields: "gridProperties.frozenRowCount" } });
  }
  await gapi.client.sheets.spreadsheets.batchUpdate({ spreadsheetId: sheetId, resource: { requests: reqs } });
  return sheetId;
}

async function ensureMasterTabsExist() {
  if (!state.drive.masterSheetId || !isTokenValid()) return;
  const meta = await gapi.client.sheets.spreadsheets.get({
    spreadsheetId: state.drive.masterSheetId,
    fields: "sheets.properties.title,sheets.properties.sheetId"
  });
  const existing = new Set((meta.result.sheets || []).map((sh) => sh.properties.title));
  const needed = Object.keys(MASTER_TABS);
  const missing = needed.filter((t) => !existing.has(t));
  let result = null;
  if (missing.length) {
    const addReqs = missing.map((tab) => ({ addSheet: { properties: { title: tab } } }));
    result = await gapi.client.sheets.spreadsheets.batchUpdate({
      spreadsheetId: state.drive.masterSheetId,
      resource: { requests: addReqs }
    });
    const fmtReqs = [];
    for (const reply of (result.result.replies || [])) {
      const sid = reply.addSheet?.properties?.sheetId;
      if (sid == null) continue;
      fmtReqs.push({ repeatCell: { range: { sheetId: sid, startRowIndex: 0, endRowIndex: 1 }, cell: { userEnteredFormat: { textFormat: { bold: true } } }, fields: "userEnteredFormat.textFormat.bold" } });
      fmtReqs.push({ updateSheetProperties: { properties: { sheetId: sid, gridProperties: { frozenRowCount: 1 } }, fields: "gridProperties.frozenRowCount" } });
    }
    if (fmtReqs.length) await gapi.client.sheets.spreadsheets.batchUpdate({ spreadsheetId: state.drive.masterSheetId, resource: { requests: fmtReqs } });
    console.log("Added missing master sheet tabs:", missing);
  }
  // Always rewrite MASTER_TABS headers so new columns (e.g. Rooms.Shape) land.
  const headerWrites = needed.map((tab) => ({ range: `${tab}!A1`, values: [MASTER_TABS[tab]] }));
  await gapi.client.sheets.spreadsheets.values.batchUpdate({
    spreadsheetId: state.drive.masterSheetId,
    resource: { valueInputOption: "RAW", data: headerWrites }
  });
}

async function ensureUsersSheet(adminId) {
  const existing = await findSheetInFolder(USERS_SHEET_NAME, adminId);
  if (existing) return existing;
  if (!isPrimaryOwner()) throw new Error(USERS_SHEET_NAME + " missing. Ask " + PRIMARY_OWNER_EMAIL + " to sign in once to seed it.");
  const created = await gapi.client.sheets.spreadsheets.create({
    resource: { properties: { title: USERS_SHEET_NAME }, sheets: [{ properties: { title: USERS_TAB } }] },
    fields: "spreadsheetId"
  });
  const sheetId = created.result.spreadsheetId;
  const meta = await gapi.client.drive.files.get({ fileId: sheetId, fields: "parents" });
  await gapi.client.drive.files.update({ fileId: sheetId, addParents: adminId, removeParents: (meta.result.parents || []).join(","), fields: "id,parents" });
  await gapi.client.sheets.spreadsheets.values.update({
    spreadsheetId: sheetId, range: USERS_TAB + "!A1", valueInputOption: "RAW",
    resource: { values: [USERS_HEADER, [PRIMARY_OWNER_EMAIL, "admin", state.googleAuth.profile?.name || "Owner", nowStamp(), "system"]] }
  });
  await gapi.client.sheets.spreadsheets.batchUpdate({
    spreadsheetId: sheetId,
    resource: { requests: [
      { repeatCell: { range: { startRowIndex: 0, endRowIndex: 1 }, cell: { userEnteredFormat: { textFormat: { bold: true } } }, fields: "userEnteredFormat.textFormat.bold" } },
      { updateSheetProperties: { properties: { gridProperties: { frozenRowCount: 1 } }, fields: "gridProperties.frozenRowCount" } }
    ] }
  });
  return sheetId;
}

async function ensurePhotoAllocationSheet(adminId) {
  const existing = await findSheetInFolder(PHOTO_ALLOCATION_SHEET_NAME, adminId);
  if (existing) return existing;
  if (!isPrimaryOwner()) throw new Error(PHOTO_ALLOCATION_SHEET_NAME + " missing. Ask " + PRIMARY_OWNER_EMAIL + " to sign in once to seed it.");
  const created = await gapi.client.sheets.spreadsheets.create({
    resource: { properties: { title: PHOTO_ALLOCATION_SHEET_NAME }, sheets: [{ properties: { title: PHOTO_ALLOCATION_TAB } }] },
    fields: "spreadsheetId"
  });
  const sheetId = created.result.spreadsheetId;
  const meta = await gapi.client.drive.files.get({ fileId: sheetId, fields: "parents" });
  await gapi.client.drive.files.update({ fileId: sheetId, addParents: adminId, removeParents: (meta.result.parents || []).join(","), fields: "id,parents" });
  await gapi.client.sheets.spreadsheets.values.update({
    spreadsheetId: sheetId, range: PHOTO_ALLOCATION_TAB + "!A1", valueInputOption: "RAW",
    resource: { values: [PHOTO_ALLOCATION_HEADER] }
  });
  await gapi.client.sheets.spreadsheets.batchUpdate({
    spreadsheetId: sheetId,
    resource: { requests: [
      { repeatCell: { range: { startRowIndex: 0, endRowIndex: 1 }, cell: { userEnteredFormat: { textFormat: { bold: true } } }, fields: "userEnteredFormat.textFormat.bold" } },
      { updateSheetProperties: { properties: { gridProperties: { frozenRowCount: 1 } }, fields: "gridProperties.frozenRowCount" } }
    ] }
  });
  return sheetId;
}

async function refreshUsers() {
  if (!isTokenValid() || !state.drive.usersSheetId) return;
  try {
    const resp = await gapi.client.sheets.spreadsheets.values.get({
      spreadsheetId: state.drive.usersSheetId, range: USERS_TAB + "!A2:E"
    });
    const rows = resp.result.values || [];
    state.users = rows.filter((r) => r[0]).map((r) => ({
      email: (r[0] || "").toLowerCase(),
      role: (r[1] || "staff").toLowerCase(),
      name: r[2] || "",
      addedAt: r[3] || "",
      addedBy: r[4] || ""
    }));
    const myEmail = state.googleAuth.profile?.email?.toLowerCase();
    const me = state.users.find((u) => u.email === myEmail);
    state.myRole = me?.role || (isPrimaryOwner() ? "admin" : null);
    persist();
    render();
  } catch (e) { console.warn("User refresh failed", e); }
}

function allocationRowToPhoto(r) {
  return {
    id: r[0] || r[1] || uid("bulk-photo"),
    driveFileId: r[1] || "",
    name: r[2] || "",
    status: r[3] || "Inbox",
    suggestedNodeId: r[4] || "",
    allocatedNodeId: r[5] || "",
    allocatedNodeName: r[6] || "",
    projectId: r[7] || "",
    floorId: r[8] || "",
    roomId: r[9] || "",
    uploader: r[10] || "",
    uploadedAt: r[11] || "",
    mimeType: r[12] || "",
    webViewLink: r[13] || "",
    thumbnailLink: r[14] || "",
    notes: r[15] || ""
  };
}

function photoToAllocationValues(photo) {
  return [
    photo.id || photo.driveFileId || "",
    photo.driveFileId || "",
    photo.name || "",
    photo.status || "Inbox",
    photo.suggestedNodeId || "",
    photo.allocatedNodeId || "",
    photo.allocatedNodeName || "",
    photo.projectId || "",
    photo.floorId || "",
    photo.roomId || "",
    photo.uploader || "",
    photo.uploadedAt || "",
    photo.mimeType || "",
    photo.webViewLink || "",
    photo.thumbnailLink || "",
    photo.notes || ""
  ];
}

async function refreshBulkPhotos(opts = {}) {
  const silent = opts.silent || false;
  if (!isTokenValid() || !state.drive.photoAllocationSheetId) return;
  try {
    const resp = await gapi.client.sheets.spreadsheets.values.get({
      spreadsheetId: state.drive.photoAllocationSheetId,
      range: PHOTO_ALLOCATION_TAB + "!A2:P"
    });
    state.bulkPhotos = (resp.result.values || []).filter((r) => r[0] || r[1]).map(allocationRowToPhoto);
    persist({ skipSync: true });
    render();
    if (!silent) toast(`Loaded ${state.bulkPhotos.length} bulk photo row(s)`);
  } catch (e) {
    console.warn("Bulk photo refresh failed", e);
    if (!silent) toast("Bulk photo refresh failed: " + describeError(e));
  }
}

async function appendPhotoAllocationRows(photos) {
  if (!photos.length || !state.drive.photoAllocationSheetId) return;
  await gapi.client.sheets.spreadsheets.values.append({
    spreadsheetId: state.drive.photoAllocationSheetId,
    range: PHOTO_ALLOCATION_TAB + "!A:P",
    valueInputOption: "USER_ENTERED",
    insertDataOption: "INSERT_ROWS",
    resource: { values: photos.map(photoToAllocationValues) }
  });
}

async function updatePhotoAllocationRow(photo) {
  if (!state.drive.photoAllocationSheetId) return;
  const vals = await gapi.client.sheets.spreadsheets.values.get({
    spreadsheetId: state.drive.photoAllocationSheetId,
    range: PHOTO_ALLOCATION_TAB + "!A2:P"
  });
  const rows = vals.result.values || [];
  const idx = rows.findIndex((r) => (r[0] && r[0] === photo.id) || (r[1] && r[1] === photo.driveFileId));
  if (idx < 0) {
    await appendPhotoAllocationRows([photo]);
    return;
  }
  await gapi.client.sheets.spreadsheets.values.update({
    spreadsheetId: state.drive.photoAllocationSheetId,
    range: `${PHOTO_ALLOCATION_TAB}!A${idx + 2}:P${idx + 2}`,
    valueInputOption: "USER_ENTERED",
    resource: { values: [photoToAllocationValues(photo)] }
  });
}

async function ensureSortedPhotoFolderForNode(node) {
  if (!isTokenValid() || !state.drive.sortedPhotosFolderId) return null;
  if (state.drive.sortedPhotoFolderMap[node.id] && await driveFileExists(state.drive.sortedPhotoFolderMap[node.id])) return state.drive.sortedPhotoFolderMap[node.id];
  const proj = projectById(node.projectId); if (!proj) return null;
  const floor = floorById(proj, node.floorId) || proj.floors?.[0];
  const projectFolderId = await ensureFolder(proj.name, state.drive.sortedPhotosFolderId);
  const floorFolderId = await ensureFolder(floor?.name || "Floor", projectFolderId);
  const nodeFolderId = await ensureFolder(nodeDisplayTitle(node) || node.id, floorFolderId);
  state.drive.sortedPhotoFolderMap[node.id] = nodeFolderId;
  persist();
  return nodeFolderId;
}

async function moveDriveFileToFolder(fileId, newParentId, oldParentId = "") {
  const request = { fileId, fields: "id,name,webViewLink,thumbnailLink,mimeType" };
  if (newParentId) request.addParents = newParentId;
  if (oldParentId) request.removeParents = oldParentId;
  const resp = await gapi.client.drive.files.update(request);
  return resp.result;
}

async function renameDriveFile(fileId, name) {
  if (!fileId || !name || !isTokenValid()) return;
  try { await gapi.client.drive.files.update({ fileId, resource: { name }, fields: "id,name" }); }
  catch (e) { console.warn("Drive rename failed", fileId, e); }
}

function uploadBulkPhotos() {
  if (!requireAuth("upload photos") || !requirePlannerDrive("upload photos")) return;
  const proj = project();
  if (!proj) { toast("Select a job first so photos include its name."); return; }
  const input = document.createElement("input");
  input.type = "file"; input.accept = "image/*,.heic,.heif"; input.multiple = true;
  input.onchange = () => enqueuePlannerPhotos(Array.from(input.files || []), {projectId: proj.id});
  input.click();
}

async function assignBulkPhotoToNode(photoId, nodeId = state.selectedNodeId) {
  if (!requireAuth("allocate bulk photo") || !requirePlannerDrive("allocate bulk photos")) return;
  const photo = state.bulkPhotos.find((p) => p.id === photoId || p.driveFileId === photoId);
  const node = state.nodes.find((n) => n.id === nodeId);
  if (!photo || !node) return;
  try {
    const sortedFolderId = await ensureSortedPhotoFolderForNode(node);
    if (!sortedFolderId) { toast("Sorted folder missing"); return; }
    const moved = await moveDriveFileToFolder(photo.driveFileId, sortedFolderId, state.drive.bulkPhotosFolderId);
    const existing = (node.imageRefs || []).some((img) => img.driveFileId === photo.driveFileId);
    if (!existing) {
      node.imageRefs = node.imageRefs || [];
      node.imageRefs.push({
        id: photo.driveFileId, driveFileId: photo.driveFileId, name: moved.name || photo.name,
        webViewLink: moved.webViewLink || photo.webViewLink, thumbnailLink: moved.thumbnailLink || photo.thumbnailLink,
        mimeType: moved.mimeType || photo.mimeType, uploader: photo.uploader || "", uploadedAt: photo.uploadedAt || nowStamp()
      });
    }
    Object.assign(photo, {
      status: "Allocated",
      allocatedNodeId: node.id,
      allocatedNodeName: nodeDisplayTitle(node),
      projectId: node.projectId,
      floorId: node.floorId,
      roomId: node.roomId || ""
    });
    node.updatedAt = nowStamp();
    await updatePhotoAllocationRow(photo);
    persist(); render();
    logAudit("Bulk Photo Allocated", { nodeId: node.id, details: photo.name || photo.driveFileId });
    toast(`Photo allocated to ${nodeDisplayTitle(node)}`);
  } catch (e) {
    console.warn("Bulk photo allocation failed", e);
    toast("Allocation failed: " + describeError(e));
  }
}

async function addUserRow(email, role) {
  if (!isAdmin() || !state.drive.usersSheetId) return;
  const lower = email.trim().toLowerCase();
  if (!lower.includes("@")) { toast("Invalid email"); return; }
  if (state.users.some((u) => u.email === lower)) { toast("User already in list"); return; }
  try {
    await gapi.client.sheets.spreadsheets.values.append({
      spreadsheetId: state.drive.usersSheetId, range: USERS_TAB + "!A:E",
      valueInputOption: "USER_ENTERED", insertDataOption: "INSERT_ROWS",
      resource: { values: [[lower, role, "", nowStamp(), state.googleAuth.profile?.email || ""]] }
    });
    logAudit("User Added", { details: lower + " (" + role + ")" });
    await refreshUsers();
    toast(lower + " added as " + role);
  } catch (e) { toast("Add failed: " + describeError(e)); }
}

async function removeUserRow(email) {
  if (!isAdmin() || !state.drive.usersSheetId) return;
  if (email.toLowerCase() === PRIMARY_OWNER_EMAIL) { toast("Cannot remove the owner"); return; }
  if (!(await ndConfirm({ title: "Remove user", message: "Remove " + email + " from the users sheet?", confirmLabel: "Remove", danger: true }))) return;
  try {
    const meta = await gapi.client.sheets.spreadsheets.get({
      spreadsheetId: state.drive.usersSheetId,
      fields: "sheets.properties.sheetId,sheets.properties.title"
    });
    const tab = (meta.result.sheets || []).find((sh) => sh.properties.title === USERS_TAB);
    if (!tab) return;
    const vals = await gapi.client.sheets.spreadsheets.values.get({
      spreadsheetId: state.drive.usersSheetId, range: USERS_TAB + "!A2:E"
    });
    const idx = (vals.result.values || []).findIndex((r) => (r[0] || "").toLowerCase() === email.toLowerCase());
    if (idx < 0) { toast("Not found in sheet"); return; }
    await gapi.client.sheets.spreadsheets.batchUpdate({
      spreadsheetId: state.drive.usersSheetId,
      resource: { requests: [{ deleteRange: { range: { sheetId: tab.properties.sheetId, startRowIndex: idx + 1, endRowIndex: idx + 2 }, shiftDimension: "ROWS" } }] }
    });
    logAudit("User Removed", { details: email });
    await refreshUsers();
    toast(email + " removed");
  } catch (e) { toast("Remove failed: " + describeError(e)); }
}

async function trashDriveFolder(folderId) {
  if (!folderId || !isTokenValid()) return;
  try {
    await gapi.client.drive.files.update({ fileId: folderId, resource: { trashed: true } });
    return true;
  } catch (e) { console.warn("Drive folder trash failed", folderId, e); return false; }
}

async function trashDriveFolders(folderIds) {
  const unique = [...new Set((folderIds || []).filter(Boolean))];
  const results = await Promise.all(unique.map((id) => trashDriveFolder(id)));
  return results.filter(Boolean).length;
}

function masterPhotoFromRow(row) {
  const driveFileId = String(row[1] || row[0] || "").trim();
  const nodeId = String(row[3] || "").trim();
  if (!driveFileId || !nodeId) return null;
  return {
    nodeId,
    image: {
      id: row[0] || driveFileId,
      driveFileId,
      name: row[2] || "Photo",
      uploader: row[9] || "",
      uploadedAt: row[10] || "",
      mimeType: row[11] || "",
      webViewLink: row[12] || "",
      thumbnailLink: row[13] || ""
    }
  };
}

function buildMasterPhotoMap(photoRows) {
  const photoMap = {};
  (photoRows || []).forEach((row) => {
    const mapped = masterPhotoFromRow(row);
    if (!mapped) return;
    if (!photoMap[mapped.nodeId]) photoMap[mapped.nodeId] = [];
    photoMap[mapped.nodeId].push(mapped.image);
  });
  return photoMap;
}

function mergeMasterPhotoRowsIntoNodes(photoRows) {
  const nodesById = new Map(state.nodes.map((node) => [node.id, node]));
  let added = 0;
  (photoRows || []).forEach((row) => {
    const mapped = masterPhotoFromRow(row);
    if (!mapped) return;
    const node = nodesById.get(mapped.nodeId);
    if (!node) return;
    node.imageRefs = Array.isArray(node.imageRefs) ? node.imageRefs : [];
    const exists = node.imageRefs.some((img) => {
      const existingId = img.driveFileId || img.id;
      return existingId && existingId === mapped.image.driveFileId;
    });
    if (exists) return;
    node.imageRefs.push(mapped.image);
    node.updatedAt = nowStamp();
    added += 1;
  });
  return added;
}

function nodeIdByFolderIdMap() {
  const map = new Map();
  Object.entries(state.drive.nodeFolderMap || {}).forEach(([nodeId, folderId]) => {
    if (nodeId && folderId) map.set(folderId, nodeId);
  });
  return map;
}

async function resolvePhotoNodeIdFromDrive(mapped, nodesById, folderToNodeId) {
  const driveFileId = mapped?.image?.driveFileId;
  if (!driveFileId) return mapped?.nodeId || "";
  let meta = photoPlacementCache.get(driveFileId);
  if (!meta) {
    try {
      const response = await googleCall(() => gapi.client.drive.files.get({
        fileId: driveFileId,
        fields: "id,parents,appProperties"
      }));
      meta = {
        parents: response.result.parents || [],
        appProperties: response.result.appProperties || {}
      };
      photoPlacementCache.set(driveFileId, meta);
    } catch (e) {
      console.warn("Photo placement lookup failed", driveFileId, e);
      return mapped.nodeId;
    }
  }
  const parentNodeId = (meta.parents || []).map((folderId) => folderToNodeId.get(folderId)).find(Boolean);
  if (parentNodeId && nodesById.has(parentNodeId)) return parentNodeId;
  const appNodeId = meta.appProperties?.nodeId || "";
  if (appNodeId && nodesById.has(appNodeId)) return appNodeId;
  return mapped.nodeId;
}

async function mergeMasterPhotoRowsIntoNodesWithDrive(photoRows) {
  const nodesById = new Map(state.nodes.map((node) => [node.id, node]));
  const folderToNodeId = nodeIdByFolderIdMap();
  let added = 0;
  let moved = 0;
  for (const row of (photoRows || [])) {
    const mapped = masterPhotoFromRow(row);
    if (!mapped) continue;
    const resolvedNodeId = await resolvePhotoNodeIdFromDrive(mapped, nodesById, folderToNodeId);
    const node = nodesById.get(resolvedNodeId);
    if (!node) continue;
    const driveFileId = mapped.image.driveFileId;
    state.nodes.forEach((candidate) => {
      if (candidate.id === node.id || !Array.isArray(candidate.imageRefs)) return;
      const before = candidate.imageRefs.length;
      candidate.imageRefs = candidate.imageRefs.filter((img) => (img.driveFileId || img.id) !== driveFileId);
      if (candidate.imageRefs.length !== before) {
        candidate.updatedAt = nowStamp();
        moved += 1;
      }
    });
    node.imageRefs = Array.isArray(node.imageRefs) ? node.imageRefs : [];
    const exists = node.imageRefs.some((img) => {
      const existingId = img.driveFileId || img.id;
      return existingId && existingId === driveFileId;
    });
    if (exists) continue;
    node.imageRefs.push(mapped.image);
    node.updatedAt = nowStamp();
    added += 1;
  }
  return { added, moved };
}

async function importMasterPhotos(opts = {}) {
  const silent = opts.silent || false;
  const renderOnChange = opts.renderOnChange !== false;
  const scheduleSync = opts.scheduleSync !== false;
  if (document.hidden && silent) return 0;
  if (!isTokenValid() || !state.drive.masterSheetId) {
    if (!silent) toast("Master sheet is not ready yet");
    return 0;
  }
  try {
    const resp = await googleCall(() => gapi.client.sheets.spreadsheets.values.get({
      spreadsheetId: state.drive.masterSheetId,
      range: "Photos!A2:Z"
    }));
    const result = await mergeMasterPhotoRowsIntoNodesWithDrive(resp.result.values || []);
    const changed = result.added + result.moved;
    if (changed) {
      persist({ skipSync: true });
      if (scheduleSync) scheduleMasterSync();
      if (renderOnChange) render();
      if (!silent) toast(`Imported ${result.added} photo${result.added === 1 ? "" : "s"}${result.moved ? ` and corrected ${result.moved}` : ""}`);
    } else if (!silent) {
      toast("No new master photos to import");
    }
    return changed;
  } catch (e) {
    console.warn("Master photo import failed", e);
    if (!silent) toast("Photo import failed: " + describeError(e));
    return 0;
  }
}
