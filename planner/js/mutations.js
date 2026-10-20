/* ============================================================ MUTATIONS */

/* Hub "Recent jobs" (shared/nd-recent-jobs.js): one entry per project, deep-linked. */
function recordRecentProject(proj) {
  if (!proj || !window.NDRecentJobs) return;
  NDRecentJobs.record({ app: "planner", id: proj.id, label: NDRecentJobs.label(proj.name, proj.address), url: "/planner/#project=" + encodeURIComponent(proj.id) });
}

function selectProject(projectId) {
  state.selectedProjectId = projectId;
  const proj = project();
  recordRecentProject(proj);
  state.selectedFolderId = proj?.folderId || (proj && !proj.folderId ? "unfiled" : "all");
  state.selectedFloorId = proj?.floors?.[0]?.id || null;
  state.selectedRoomId = "all";
  const firstNode = floorNodes()[0];
  state.selectedNodeId = firstNode?.id || null;
  state.drawerOpen = false;
  state.filters = { query: "", status: "All", category: "All", assignee: "All" };
  state.bulkSelection = [];
  persist(); render();
  maybeFetchPlanForCurrentFloor();
}

// 0.17.2 — a PDF plan stored on this device but never linked to Drive (upload happened while
// signed out / offline): upload the original now so the floor gets its planDriveFileId.
const _planLinking = {};
// 0.18.1: the auto-link never fired because it only ran when the PDF was already in memory
// (it's loaded lazily from IndexedDB) and the token was valid at that exact moment. Now it
// reads the device copy itself, retries after sign-in, and reports its status in the debug line.
async function publishPlanLinks(floorId) {
  // Await the actual sheet write before calling a mobile upload synced.
  for (let attempt = 0; _masterSyncing && attempt < 100; attempt++) await sleep(100);
  if (_masterSyncing || _masterReloading || state.googleAuth.hydrating) { scheduleMasterSync(); return false; }
  clearTimeout(_masterSyncTimer);
  await flushMasterDeltas({ silent: true });
  const row = buildMasterRows().Floors.get(floorId);
  return !!row && loadSnapshot()?.Floors?.[floorId] === rowHash(row);
}

async function linkLocalPlanOriginal(proj, fl) {
  if (!fl || !proj || _masterReloading || _planLinking[fl.id] || (fl.planDriveFileId && !fl.planPendingUpload)) return null;
  if (!isTokenValid()) { _planLinkStatus[fl.id] = "waiting for sign-in"; refreshPlanDebug(); return null; }
  _planLinking[fl.id] = true;
  try {
    let saved = _pendingPlanSources[fl.id] || (window.NDCache ? await NDCache.get(PLAN_PENDING_CACHE_PREFIX + fl.id).catch(() => null) : null);
    if (!saved) {
      const pdf = _planPdfSrc[fl.id] || (window.NDCache ? await NDCache.get(PLAN_PDF_CACHE_PREFIX + fl.id).catch(() => null) : null);
      if (typeof pdf === "string" && pdf.startsWith("data:application/pdf")) saved = { dataUrl: pdf, name: fl.planFileName || "plan.pdf", mimeType: "application/pdf" };
    }
    if (!saved?.dataUrl) { _planLinkStatus[fl.id] = "original unavailable on this device"; return null; }
    _planLinkStatus[fl.id] = "uploading"; refreshPlanDebug();
    const folderId = await ensureFloorDriveFolder(proj, fl);
    if (!folderId) throw new Error("Floor folder unavailable");
    const live = liveFloorById(fl.id); if (!live) return null;
    fl = live;
    if (fl.planDriveFileId && !fl.planPendingUpload) return null;
    const blob = await (await fetch(saved.dataUrl)).blob();
    const file = new File([blob], saved.name || "plan.pdf", { type: saved.mimeType || blob.type });
    let result;
    if (fl.planDriveFileId) {
      try { result = await updateFileBytes(fl.planDriveFileId, file); } catch (e) { if (Number(e.status) !== 404) throw e; }
    }
    if (!result || (file.type === "application/pdf" && result.mimeType && result.mimeType !== file.type)) result = await uploadFileToDrive(file, folderId, "floor-plan-" + file.name);
    const latest = liveFloorById(fl.id); if (!latest) return null;
    Object.assign(latest, { planDriveFileId: result.id, planMimeType: result.mimeType || file.type, planWebViewLink: result.webViewLink, planFileName: file.name, planPendingUpload: false, planRecoveryDisabled: false, updatedAt: nowStamp() });
    persist();
    // Publish the original before the optional rendered sidecar; the phone can suspend at any point.
    let published = await publishPlanLinks(fl.id);
    const rendered = await ensurePlanPng(proj, latest, true);
    if (rendered) published = await publishPlanLinks(fl.id);
    delete _pendingPlanSources[fl.id];
    if (window.NDCache) await NDCache.remove(PLAN_PENDING_CACHE_PREFIX + fl.id).catch(() => {});
    _planLinkStatus[fl.id] = published ? "ok" : "original in Drive; master sync pending";
    persist({ skipSync: true });
    if (!published) scheduleMasterSync();
    logAudit("Plan Linked", { projectId: proj.id, floorId: fl.id, details: fl.name + ": original uploaded" });
    return { uploaded: true, published, rendered: !!rendered };
  } catch (e) {
    _planLinkStatus[fl.id] = "error: " + describeError(e); console.warn("plan original link failed", e);
    return { uploaded: false, published: false, error: describeError(e) };
  } finally { delete _planLinking[fl.id]; refreshPlanDebug(); }
}

// 0.18.5: on sign-in, link EVERY plan PDF stored only on this device (IndexedDB planpdf:) with no
// Drive file id, not just the open floor, so other devices can load it. Never deletes the device copy.
let _planHealRunning = false;
async function healUnlinkedPlans() {
  if (_planHealRunning || _masterReloading || state.planUpload || !window.NDCache || !isTokenValid()) return;
  _planHealRunning = true;
  try {
    const keys = new Set(await NDCache.keys());
    const todo = [];
    for (const p of state.projects || []) for (const f of p.floors || []) {
      if (f.planRecoveryDisabled || (f.planDriveFileId && !f.planPendingUpload)) continue;
      if (_pendingPlanSources[f.id] || keys.has(PLAN_PENDING_CACHE_PREFIX + f.id) || keys.has(PLAN_PDF_CACHE_PREFIX + f.id)) todo.push([p,f]);
    }
    if (!todo.length) return;
    toast("Syncing " + todo.length + " plan(s) saved on this device…");
    let synced = 0;
    for (const [p,f] of todo) { const result = await linkLocalPlanOriginal(p,f); if (result?.published) synced++; }
    toast(synced === todo.length ? synced + " plan(s) linked in the master sheet. Other devices can reload them." : synced + " of " + todo.length + " plans linked. Keep Planner open and check Sync for pending changes.");
  } finally { _planHealRunning = false; }
}

const _planFetchError = {};
function maybeFetchPlanForCurrentFloor() {
  const fl = currentFloor(); if (!fl || _masterReloading || state.planUpload) return;
  const proj = project();
  if ((!fl.planDriveFileId || fl.planPendingUpload) && !fl.planRecoveryDisabled) linkLocalPlanOriginal(proj, fl);
  if (!state.floorPlans[fl.id] && (fl.planDriveFileId || fl.planPngFileId) && isTokenValid() && !_planFetches[fl.id] && !fl.planPendingUpload) {
    const originalId = fl.planDriveFileId, pngId = fl.planPngFileId;
    const task = (async () => {
      let error;
      for (const [id,fallback] of [[originalId,false],[pngId,true]]) {
        if (!id) continue;
        try {
          const source = await fetchDriveFileAsDataUrl(id);
          if (!source) throw new Error("Plan download unavailable");
          const live = liveFloorById(fl.id);
          if (!live || live.planPendingUpload || live.planDriveFileId !== originalId || state.planUpload) return;
          await replaceFloorPlanCache(live, source, { planDriveFileId: originalId, renderFallback: fallback });
          persist({ skipSync: true }); render(); return;
        } catch (e) { error = e; }
      }
      _planFetchError[fl.id] = describeError(error); render();
    })().finally(() => { delete _planFetches[fl.id]; });
    _planFetches[fl.id] = task;
    return task;
  }
}

function openNode(nodeId) {
  const node = state.nodes.find((n) => n.id === nodeId); if (!node) return;
  if (node.floorId && node.floorId !== state.selectedFloorId) state.selectedFloorId = node.floorId;
  state.selectedNodeId = nodeId; state.drawerOpen = true; state.activeView = "map";
  history.replaceState(null, "", `#node=${encodeURIComponent(node.id)}`);
  persist(); render();
  if (isTokenValid()) importMasterPhotos({ silent: true }).catch((e) => console.warn("Node photo import failed", e));
}

function openCreateModal(position) {
  if (!project()) { toast("Create a project first"); return; }
  if (!currentFloor()) { toast("Add a floor first"); return; }
  if (!categoryNames().length) { toast("No categories yet - sign in or refresh"); state.activeView = "settings"; render(); return; }
  state.modal = { mode: "create", position }; render();
}

function toggleBulkSelect(nodeId) {
  const i = state.bulkSelection.indexOf(nodeId);
  if (i === -1) state.bulkSelection.push(nodeId); else state.bulkSelection.splice(i, 1);
  render();
}

function bulkSetStatus(status) {
  state.bulkSelection.forEach((id) => {
    const n = state.nodes.find((x) => x.id === id); if (!n) return;
    const prev = n.status; n.status = status; n.updatedAt = nowStamp();
    logAudit("Status Changed (bulk)", { nodeId: n.id, status, details: `${prev} -> ${status}` });
  });
  persist(); render();
  toast(`Updated ${state.bulkSelection.length} node(s)`);
}
function bulkSetCategory(category) {
  state.bulkSelection.forEach((id) => {
    const n = state.nodes.find((x) => x.id === id); if (!n) return;
    n.category = category; n.updatedAt = nowStamp();
    logAudit("Category Changed (bulk)", { nodeId: n.id, details: `to ${category}` });
  });
  persist(); render();
  toast(`Updated ${state.bulkSelection.length} node(s)`);
}
async function bulkDelete() {
  if (!state.bulkSelection.length) return;
  if (!(await ndConfirm({ title: "Delete nodes", message: `Delete ${state.bulkSelection.length} node(s)? Their Drive folders move to Trash.`, confirmLabel: "Delete", danger: true }))) return;
  const ids = state.bulkSelection.slice();
  const driveIds = [];
  ids.forEach((id) => {
    const n = state.nodes.find((x) => x.id === id);
    if (state.drive.nodeFolderMap[id]) driveIds.push(state.drive.nodeFolderMap[id]);
    if (n?.type === "portal" && n.linkedNodeId) {
      if (state.drive.nodeFolderMap[n.linkedNodeId]) driveIds.push(state.drive.nodeFolderMap[n.linkedNodeId]);
      state.nodes = state.nodes.filter((x) => x.id !== n.linkedNodeId);
      delete state.drive.nodeFolderMap[n.linkedNodeId];
    }
  });
  state.nodes = state.nodes.filter((n) => !ids.includes(n.id));
  ids.forEach((id) => { delete state.drive.nodeFolderMap[id]; });
  state.bulkSelection = [];
  state.selectedNodeId = null; state.drawerOpen = false;
  persist(); render();
  const trashed = await trashDriveFolders(driveIds);
  toast(`Deleted ${ids.length} node(s)`);
  logAudit("Bulk Delete", { details: `${ids.length} nodes, ${trashed} Drive folder(s) trashed` });
}

async function handleNodeForm(event) {
  event.preventDefault();
  const proj = project(); if (!proj) return;
  const floor = currentFloor(); if (!floor) return;
  const form = new FormData(event.currentTarget);
  const files = Array.from(document.getElementById("nodeImages")?.files || []);
  const nodeType = (form.get("nodeType") || "marker").toString();
  if (nodeType === "title") return saveTitlePin(proj, floor, (form.get("customTitle") || "").toString().trim());
  const isSwitchboard = nodeType === "switchboard" || nodeType === "subboard";
  const category = (form.get("category") || "").toString();
  const lineItem = (form.get("lineItem") || "").toString();
  const customTitle = (form.get("customTitle") || "").toString().trim();
  if (!lineItem && !customTitle && !isSwitchboard) { toast("Pick a line item or enter a name"); return; }
  const payload = {
    type: nodeType,
    category: isSwitchboard ? "Electrical" : category,
    lineItem: isSwitchboard ? (nodeType === "switchboard" ? "Main Switchboard" : "Sub-board") : lineItem,
    customTitle,
    status: (form.get("status") || "Not Started").toString(),
    roomId: (form.get("roomId") || "").toString() || null,
    assignedTo: (form.get("assignedTo") || "").toString(),
    tags: (form.get("tags") || "").toString().split(",").map((t) => t.trim()).filter(Boolean),
    description: (form.get("description") || "").toString().trim(),
    // SWB / circuit fields
    circuit: (form.get("circuit") || "").toString().trim(),
    cableRunM: form.get("cableRunM") ? Number(form.get("cableRunM")) : null,
    boardLabel: (form.get("boardLabel") || "").toString().trim(),
    phaseConfig: (form.get("phaseConfig") || "").toString(),
    mainBreakerA: form.get("mainBreakerA") ? Number(form.get("mainBreakerA")) : null,
    swbProjectId: (form.get("swbProjectId") || "").toString().trim() || null,
    swbSchemaVersion: isSwitchboard ? "1.1" : null,
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
    if (previousTitle !== newTitle && isTokenValid() && state.drive.nodeFolderMap[node.id]) renameDriveFile(state.drive.nodeFolderMap[node.id], newTitle);
    if (files.length) await uploadPhotosToNode(node.id, files);
    toast("Node updated");
  } else {
    const node = {
      id: uid("node"), projectId: proj.id, floorId: floor.id, ...payload,
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

// 0.16.1 room title pin: a node of type "title" (same store, sync and offline path as other nodes).
function saveTitlePin(proj, floor, name) {
  if (!name) { toast("Enter a room name"); return; }
  if (state.modal.mode === "edit") {
    const node = selectedNode(); if (!node) return;
    const prev = nodeDisplayTitle(node);
    node.customTitle = name; node.updatedAt = nowStamp();
    const room = roomById(node.linkedRoomId);   // 0.17.1: nodes show roomName(roomId), so this renames it everywhere
    if (room && room.name !== name) { room.name = name; room.updatedAt = nowStamp(); }
    state.modal = null; persist(); render();
    if (prev !== name) logAudit("Node Renamed", { nodeId: node.id, details: `${prev} -> ${name}` });
    toast("Room title updated");
    return;
  }
  const position = state.modal.position || { x: 50, y: 50 };
  const node = {
    id: uid("node"), projectId: proj.id, floorId: floor.id, type: "title",
    category: "", lineItem: "", customTitle: name, status: "Complete",
    roomId: resolveInitialRoomId(position) || null, assignedTo: "", tags: [], description: "",
    position, size: 1,
    createdBy: state.googleAuth.profile?.name || state.googleAuth.profile?.email || "local",
    createdAt: nowStamp(), updatedAt: nowStamp(), imageRefs: [], comments: []
  };
  state.nodes.push(node);
  state.selectedNodeId = node.id; state.drawerOpen = false; state.modal = null;
  persist(); render();
  logAudit("Node Created", { nodeId: node.id, details: `Room title / ${name}` });
  toast(`Placed "${name}"`);
}

function handleMassForm(event) {
  event.preventDefault();
  const form = new FormData(event.currentTarget);
  const category = (form.get("category") || "").toString();
  const lineItem = (form.get("lineItem") || "").toString();
  const status = (form.get("status") || "Not Started").toString();
  if (!category || !lineItem) { toast("Pick a category and line item"); return; }
  const size = Number(form.get("size")) / 100;
  if (!Number.isFinite(size) || size < 0.05 || size > 3) { toast("Choose a size from 5% to 300%"); return; }
  state.massMode = { active: true, category, lineItem, status, size, count: 0 };
  state.modal = null; render();
  toast(`Mass placing ${category} / ${lineItem}. ESC to stop.`);
}

function placeMassNode(position) {
  const proj = project(); if (!proj) return;
  const floor = currentFloor(); if (!floor) return;
  const m = state.massMode;
  const autoName = autoSuggestName(m.lineItem, floor.id);
  const node = {
    id: uid("node"), projectId: proj.id, floorId: floor.id, type: "marker",
    category: m.category, lineItem: m.lineItem, customTitle: autoName,
    status: m.status || "Not Started", size: m.size ?? 1,
    roomId: resolveInitialRoomId(position) || null,
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
  if (placed) toast(`Mass-place complete: ${placed} placed`);
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
    if (f) { const old = f.name; f.name = name; f.color = color; if (isTokenValid() && f.driveFolderId) renameDriveFile(f.driveFolderId, name); logAudit("Folder Renamed", { details: `${old} -> ${name}` }); }
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
  const firstFloor = (form.get("firstFloor") || "Ground floor").toString().trim() || "Ground floor";
  const payload = { name, folderId, address: (form.get("address") || "").toString(), description: (form.get("description") || "").toString(), protected: form.get("protected") === "on" };
  if (state.modal.mode === "edit-project") {
    const proj = project(); if (!proj) return;
    const folderChanged = proj.folderId !== folderId, nameChanged = proj.name !== name;
    const previousFolderId = proj.folderId || null;
    Object.assign(proj, payload, { updatedAt: nowStamp() });
    state.modal = null; persist(); render();
    logAudit("Project Edited", { projectId: proj.id, details: nameChanged ? `Renamed to ${name}` : "Fields updated" });
    if (isTokenValid()) {
      moveProjectDriveFolder(proj, previousFolderId)
        .then(() => { if (nameChanged) return renameDriveFile(state.drive.projectFolderMap[proj.id], proj.name); })
        .catch((e) => console.warn(e));
    }
    toast("Project updated");
  } else {
    const firstFloorObj = { id: uid("flr"), name: firstFloor, order: 0, planDriveFileId: null, planMimeType: null, planWebViewLink: null, planFileName: null, planAspectRatio: null, createdAt: nowStamp() };
    const proj = { id: uid("prj"), ...payload, floors: [firstFloorObj], team: [], createdAt: nowStamp(), updatedAt: nowStamp() };
    state.projects.push(proj);
    state.selectedProjectId = proj.id;
    state.selectedFloorId = firstFloorObj.id;
    state.selectedFolderId = proj.folderId || "unfiled";
    state.modal = null; persist(); render();
    recordRecentProject(proj);
    logAudit("Project Created", { projectId: proj.id, details: `Folder ${folderId || DRIVE_UNFILED_FOLDER}, floor ${firstFloor}` });
    if (isTokenValid()) ensureProjectDriveFolder(proj).then(() => ensureFloorDriveFolder(proj, firstFloorObj)).catch((e) => console.warn(e));
    toast(`Project ${proj.name} created`);
  }
}

function handleFloorForm(event) {
  event.preventDefault();
  const proj = project(); if (!proj) return;
  const form = new FormData(event.currentTarget);
  const name = (form.get("name") || "").toString().trim(); if (!name) return;
  if (state.modal.mode === "rename-floor") {
    const fl = currentFloor(); if (!fl) return;
    const old = fl.name; fl.name = name;
    state.modal = null; persist(); render();
    logAudit("Floor Renamed", { projectId: proj.id, details: `${old} -> ${name}` });
    if (isTokenValid() && state.drive.floorFolderMap[fl.id]) renameDriveFile(state.drive.floorFolderMap[fl.id], name);
    toast("Floor renamed");
  } else {
    const order = (proj.floors || []).reduce((m, f) => Math.max(m, f.order || 0), -1) + 1;
    const floor = { id: uid("flr"), name, order, planDriveFileId: null, planMimeType: null, planWebViewLink: null, planFileName: null, planAspectRatio: null, createdAt: nowStamp() };
    proj.floors = proj.floors || [];
    proj.floors.push(floor);
    state.selectedFloorId = floor.id;
    state.modal = null; persist(); render();
    logAudit("Floor Added", { projectId: proj.id, details: name });
    if (isTokenValid()) ensureFloorDriveFolder(proj, floor).catch((e) => console.warn(e));
    toast(`Floor "${name}" added`);
  }
}

function reorderFloor(sourceId, targetId) {
  const proj = project(); if (!proj || !sourceId || !targetId || sourceId === targetId) return;
  const floors = [...(proj.floors || [])].sort((a, b) => (a.order || 0) - (b.order || 0));
  const from = floors.findIndex((f) => f.id === sourceId);
  const to = floors.findIndex((f) => f.id === targetId);
  if (from < 0 || to < 0) return;
  const [moved] = floors.splice(from, 1);
  floors.splice(to, 0, moved);
  floors.forEach((f, idx) => { f.order = idx; });
  proj.floors = floors;
  proj.updatedAt = nowStamp();
  persist(); render();
  logAudit("Floor Reordered", { projectId: proj.id, details: floors.map((f) => f.name).join(" > ") });
}

function handleRoomForm(event) {
  event.preventDefault();
  const proj = project(); if (!proj) return;
  const floor = currentFloor(); if (!floor) return;
  const form = new FormData(event.currentTarget);
  const name = (form.get("name") || "").toString().trim(); if (!name) return;
  const roomId = (form.get("roomId") || "").toString();
  if (roomId) {
    const room = roomById(roomId); if (!room) return;
    const old = room.name;
    room.name = name; room.updatedAt = nowStamp();
    logAudit("Room Renamed", { projectId: proj.id, floorId: floor.id, details: `${old} -> ${name}` });
  } else {
    const order = floorRooms(floor.id).reduce((m, r) => Math.max(m, r.order || 0), -1) + 1;
    const pending = parseRoomShape(state.roomDraw?.pendingShape) || parseRoomShape({ type: "poly", pts: state.roomDraw?.points || [] });
    const room = { id: uid("room"), projectId: proj.id, floorId: floor.id, name, createdAt: nowStamp(), updatedAt: nowStamp(), order, shape: pending || null };
    state.rooms.push(room);
    state.selectedRoomId = room.id;
    logAudit("Room Created", { projectId: proj.id, floorId: floor.id, details: pending ? `${name} (with shape)` : name });
  }
  state.modal = null;
  clearRoomDraw();
  persist(); render();
}

function deleteSelectedRoom() {
  if (state.selectedRoomId === "all") return;
  const room = roomById(state.selectedRoomId); if (!room) return;
  const roomNodeIds = state.nodes.filter((n) => n.roomId === room.id).map((n) => n.id);
  const linkedNodeIds = state.nodes.filter((n) => n.linkedRoomId === room.id).map((n) => n.id);
  state.nodes.forEach((n) => {
    if (n.roomId === room.id) n.roomId = null;
    if (n.linkedRoomId === room.id) n.linkedRoomId = null;
  });
  state.rooms = state.rooms.filter((r) => r.id !== room.id);
  state.selectedRoomId = "all";
  persist(); render();
  undoableDelete(`Room "${room.name}" deleted`, {
    undo: () => {
      state.rooms.push(room);
      state.nodes.forEach((n) => {
        if (roomNodeIds.includes(n.id)) n.roomId = room.id;
        if (linkedNodeIds.includes(n.id)) n.linkedRoomId = room.id;
      });
      state.selectedRoomId = room.id;
    },
    commit: () => logAudit("Room Deleted", { projectId: room.projectId, floorId: room.floorId, details: room.name })
  });
}

async function deleteCurrentFloor() {
  const proj = project(); if (!proj) return;
  const fl = currentFloor(); if (!fl) return;
  if (proj.floors.length === 1) { toast("Cannot delete the only floor"); return; }
  const floorIndex = proj.floors.findIndex((f) => f.id === fl.id);
  const removedNodes = state.nodes.filter((n) => n.floorId === fl.id);
  const removedRooms = state.rooms.filter((r) => r.floorId === fl.id);
  const savedPlan = state.floorPlans[fl.id] || null;
  const savedFloorFolderId = state.drive.floorFolderMap[fl.id];
  const savedNodeFolderEntries = removedNodes.map((n) => [n.id, state.drive.nodeFolderMap[n.id]]).filter(([, v]) => v);
  const driveId_Fl = state.drive.floorFolderMap[fl.id];
  const nodeDriveIds = state.nodes.filter((n) => n.floorId === fl.id).map((n) => state.drive.nodeFolderMap[n.id]).filter(Boolean);
  proj.floors = proj.floors.filter((f) => f.id !== fl.id);
  state.nodes = state.nodes.filter((n) => n.floorId !== fl.id);
  state.rooms = state.rooms.filter((r) => r.floorId !== fl.id);
  evictFloorPlan(fl.id);
  delete state.drive.floorFolderMap[fl.id];
  nodeDriveIds.forEach((id) => {
    const entry = Object.entries(state.drive.nodeFolderMap).find(([, folderId]) => folderId === id);
    if (entry) delete state.drive.nodeFolderMap[entry[0]];
  });
  state.selectedFloorId = proj.floors[0]?.id || null;
  state.selectedRoomId = "all";
  persist(); render();
  undoableDelete(`Floor "${fl.name}" deleted`, {
    undo: () => {
      proj.floors.splice(Math.max(0, floorIndex), 0, fl);
      state.nodes.push(...removedNodes);
      state.rooms.push(...removedRooms);
      if (savedFloorFolderId) state.drive.floorFolderMap[fl.id] = savedFloorFolderId;
      savedNodeFolderEntries.forEach(([nodeId, folderId]) => { state.drive.nodeFolderMap[nodeId] = folderId; });
      if (savedPlan) cacheFloorPlan(fl.id, savedPlan).catch(() => {});
      state.selectedFloorId = fl.id;
    },
    commit: async () => {
      const trashed = driveId_Fl ? await trashDriveFolder(driveId_Fl) : await trashDriveFolders(nodeDriveIds);
      logAudit("Floor Deleted", { projectId: proj.id, details: `${fl.name}; Drive trashed: ${trashed ? "yes" : "no"}` });
    }
  });
}

function handlePortalForm(event) {
  event.preventDefault();
  const proj = project(); if (!proj) return;
  const floor = currentFloor(); if (!floor) return;
  const form = new FormData(event.currentTarget);
  const label = (form.get("label") || "").toString().trim();
  const sourceRoomId = (form.get("sourceRoomId") || "").toString() || null;
  const targetProjectId = (form.get("targetProjectId") || "").toString();
  const targetFloorId = (form.get("targetFloorId") || "").toString();
  const targetRoomId = (form.get("targetRoomId") || "").toString() || null;
  const returnLabel = (form.get("returnLabel") || "").toString().trim() || `Door to ${proj.name}`;
  if (!label || !targetProjectId) return;
  const target = projectById(targetProjectId); if (!target) return;
  const targetFloor = floorById(target, targetFloorId) || target.floors[0]; if (!targetFloor) return;
  if (target.id === proj.id && targetFloor.id === floor.id && (targetRoomId || "") === (sourceRoomId || "")) { toast("Pick a different floor or room"); return; }
  const targetRoom = roomById(targetRoomId);
  const sourceRoom = roomById(sourceRoomId);
  const portalA = {
    id: uid("node"), projectId: proj.id, floorId: floor.id, type: "portal",
    customTitle: label, lineItem: "", category: "",
    status: "Complete", assignedTo: "", tags: [],
    description: `Door / link to ${target.name} / ${targetFloor.name}${targetRoom ? " / " + targetRoom.name : ""}`,
    position: { x: 10, y: 50 },
    createdBy: state.googleAuth.profile?.name || "local",
    createdAt: nowStamp(), updatedAt: nowStamp(),
    imageRefs: [], comments: [],
    roomId: sourceRoomId,
    linkedProjectId: target.id, linkedFloorId: targetFloor.id, linkedRoomId: targetRoomId, linkedNodeId: null
  };
  const portalB = {
    id: uid("node"), projectId: target.id, floorId: targetFloor.id, type: "portal",
    customTitle: returnLabel, lineItem: "", category: "",
    status: "Complete", assignedTo: "", tags: [],
    description: `Door / link back to ${proj.name} / ${floor.name}${sourceRoom ? " / " + sourceRoom.name : ""}`,
    position: { x: 90, y: 50 },
    createdBy: state.googleAuth.profile?.name || "local",
    createdAt: nowStamp(), updatedAt: nowStamp(),
    imageRefs: [], comments: [],
    roomId: targetRoomId,
    linkedProjectId: proj.id, linkedFloorId: floor.id, linkedRoomId: sourceRoomId, linkedNodeId: portalA.id
  };
  portalA.linkedNodeId = portalB.id;
  state.nodes.push(portalA, portalB);
  state.selectedNodeId = portalA.id; state.drawerOpen = true; state.modal = null;
  persist(); render();
  logAudit("Door Created", { projectId: proj.id, nodeId: portalA.id, details: `Linked to ${target.name}/${targetFloor.name}` });
  toast(`Door created: ${proj.name} <-> ${target.name}`);
}

function followPortal() {
  const node = selectedNode(); if (!node || node.type !== "portal" || !node.linkedProjectId) return;
  const target = projectById(node.linkedProjectId);
  if (!target) { toast("Linked project no longer exists"); return; }
  const linkedNodeId = node.linkedNodeId;
  const linkedFloorId = node.linkedFloorId;
  const linkedRoomId = node.linkedRoomId;
  selectProject(target.id);
  if (linkedFloorId) state.selectedFloorId = linkedFloorId;
  // P0-3 / P1: honour linkedRoomId when following a portal (don't force All).
  state.selectedRoomId = linkedRoomId || "all";
  if (linkedNodeId) { state.selectedNodeId = linkedNodeId; state.drawerOpen = true; state.activeView = "map"; }
  else { state.selectedNodeId = null; state.drawerOpen = false; state.activeView = "map"; }
  persist(); render();
  maybeFetchPlanForCurrentFloor();
  toast(`Switched to ${target.name}${linkedFloorId ? " / " + (floorById(target, linkedFloorId)?.name || "floor") : ""}`);
}

async function deleteFolder(folderId) {
  const folder = state.projectFolders.find((f) => f.id === folderId); if (!folder) return;
  if (!(await ndConfirm({ title: "Delete folder", message: `Delete folder "${folder.name}"? Projects inside move to ${DRIVE_UNFILED_FOLDER}. The Drive folder group will be moved to Trash.`, confirmLabel: "Delete", danger: true }))) return;
  const driveId_F = folder.driveFolderId;
  const movedProjects = state.projects.filter((p) => p.folderId === folderId);
  let moveErrors = 0;
  if (isTokenValid() && driveId_F && state.drive.unfiledFolderId) {
    for (const p of movedProjects) {
      const projectFolderId = state.drive.projectFolderMap[p.id];
      if (projectFolderId) {
        try { await moveDriveFileToFolder(projectFolderId, state.drive.unfiledFolderId, driveId_F); }
        catch (e) { moveErrors++; console.warn("Project folder move failed", p.name, e); }
      }
    }
  }
  movedProjects.forEach((p) => { p.folderId = null; });
  state.projectFolders = state.projectFolders.filter((f) => f.id !== folderId);
  if (state.selectedFolderId === folderId) state.selectedFolderId = "all";
  persist(); render();
  if (driveId_F && !moveErrors) await trashDriveFolder(driveId_F);
  logAudit("Folder Deleted", { details: `${folder.name}; moved ${movedProjects.length} project(s); ${moveErrors} move error(s)` });
  toast(`Folder "${folder.name}" deleted${moveErrors ? " (some Drive folders were left in place)" : ""}`);
}

async function deleteProject(projectId) {
  const proj = projectById(projectId); if (!proj) return;
  if (!(await ndConfirm({ title: "Delete project", message: `Delete project "${proj.name}" and all its nodes? The Drive folder (and everything inside) will be moved to Trash.`, confirmLabel: "Delete project", danger: true }))) return;
  const driveId_P = state.drive.projectFolderMap[projectId];
  const nodeDriveIds = state.nodes.filter((n) => n.projectId === projectId).map((n) => state.drive.nodeFolderMap[n.id]).filter(Boolean);
  const linkedReturns = state.nodes.filter((n) => n.type === "portal" && n.linkedProjectId === projectId);
  linkedReturns.forEach((n) => { if (state.drive.nodeFolderMap[n.id]) nodeDriveIds.push(state.drive.nodeFolderMap[n.id]); state.nodes = state.nodes.filter((x) => x.id !== n.id); delete state.drive.nodeFolderMap[n.id]; });
  state.projects = state.projects.filter((p) => p.id !== projectId);
  state.nodes = state.nodes.filter((n) => n.projectId !== projectId);
  state.rooms = state.rooms.filter((r) => r.projectId !== projectId);
  (proj.floors || []).forEach((f) => { evictFloorPlan(f.id); delete state.drive.floorFolderMap[f.id]; });
  Object.keys(state.drive.nodeFolderMap).forEach((nodeId) => { if (!state.nodes.some((n) => n.id === nodeId)) delete state.drive.nodeFolderMap[nodeId]; });
  delete state.drive.projectFolderMap[projectId];
  if (state.selectedProjectId === projectId) { state.selectedProjectId = state.projects[0]?.id || null; state.selectedFloorId = project()?.floors?.[0]?.id || null; }
  state.selectedRoomId = "all";
  persist(); render();
  const trashed = driveId_P ? await trashDriveFolder(driveId_P) : await trashDriveFolders(nodeDriveIds);
  logAudit("Project Deleted", { details: `${proj.name}; Drive trashed: ${trashed ? "yes" : "no"}` });
  toast(`Project "${proj.name}" deleted`);
}

async function formatPlannerData() {
  if (!isAdmin()) { toast("Admin only"); return; }
  const protectedProjects = state.projects.filter((p) => p.protected);
  const protectedProjectIds = new Set(protectedProjects.map((p) => p.id));
  const protectedFloorIds = new Set(protectedProjects.flatMap((p) => (p.floors || []).map((f) => f.id)));
  const protectedNodeIds = new Set(state.nodes.filter((n) => protectedProjectIds.has(n.projectId)).map((n) => n.id));
  const goFormat = await ndConfirm({
    title: "Format planner data",
    message: `Trashes unprotected project data, Bulk Photos, and Sorted Photos, clears matching master/photo allocation rows, and keeps Admin Files + Audit.${protectedProjects.length ? ` ${protectedProjects.length} protected job(s) will be kept.` : ""}`,
    confirmLabel: "Format", danger: true, typeToConfirm: "FORMAT"
  });
  if (!goFormat) return;
  try {
    toast("Formatting planner data...");
    if (protectedProjects.length) {
      const unprotectedProjectFolderIds = state.projects
        .filter((p) => !protectedProjectIds.has(p.id))
        .map((p) => state.drive.projectFolderMap[p.id])
        .filter(Boolean);
      await trashDriveFolders([...unprotectedProjectFolderIds, state.drive.bulkPhotosFolderId, state.drive.sortedPhotosFolderId]);
    } else {
      await trashDriveFolders([state.drive.projectsFolderId, state.drive.unfiledFolderId, state.drive.bulkPhotosFolderId, state.drive.sortedPhotosFolderId]);
    }
    const [projectsId, unfiledId, bulkPhotosId, sortedPhotosId] = await Promise.all([
      findOrCreateChildFolder(DRIVE_PROJECTS_FOLDER, state.drive.rootFolderId),
      findOrCreateChildFolder(DRIVE_UNFILED_FOLDER, state.drive.rootFolderId),
      findOrCreateChildFolder(DRIVE_BULK_PHOTOS_FOLDER, state.drive.rootFolderId),
      findOrCreateChildFolder(DRIVE_SORTED_PHOTOS_FOLDER, state.drive.rootFolderId)
    ]);
    Object.assign(state.drive, {
      projectsFolderId: projectsId,
      unfiledFolderId: unfiledId,
      bulkPhotosFolderId: bulkPhotosId,
      sortedPhotosFolderId: sortedPhotosId,
      projectFolderMap: Object.fromEntries(Object.entries(state.drive.projectFolderMap || {}).filter(([id]) => protectedProjectIds.has(id))),
      nodeFolderMap: Object.fromEntries(Object.entries(state.drive.nodeFolderMap || {}).filter(([id]) => protectedNodeIds.has(id))),
      floorFolderMap: Object.fromEntries(Object.entries(state.drive.floorFolderMap || {}).filter(([id]) => protectedFloorIds.has(id))),
      sortedPhotoFolderMap: {}
    });
    if (state.drive.masterSheetId) {
      await ensureMasterTabsExist();
      await gapi.client.sheets.spreadsheets.values.batchClear({
        spreadsheetId: state.drive.masterSheetId,
        resource: { ranges: Object.keys(MASTER_TABS).map((t) => `${t}!A2:AD`) }
      });
    }
    if (state.drive.photoAllocationSheetId) {
      await gapi.client.sheets.spreadsheets.values.clear({
        spreadsheetId: state.drive.photoAllocationSheetId,
        range: `${PHOTO_ALLOCATION_TAB}!A2:P`
      });
    }
    const protectedFolderIds = new Set(protectedProjects.map((p) => p.folderId).filter(Boolean));
    state.projectFolders = state.projectFolders.filter((folder) => protectedFolderIds.has(folder.id));
    state.projects = protectedProjects;
    state.rooms = state.rooms.filter((room) => protectedProjectIds.has(room.projectId));
    state.nodes = state.nodes.filter((node) => protectedProjectIds.has(node.projectId));
    Object.keys(state.floorPlans || {}).forEach((floorId) => { if (!protectedFloorIds.has(floorId)) evictFloorPlan(floorId); });
    state.bulkPhotos = [];
    state.selectedProjectId = state.projects[0]?.id || null;
    state.selectedFloorId = state.projects[0]?.floors?.[0]?.id || null;
    state.selectedRoomId = "all";
    state.selectedNodeId = null;
    state.drawerOpen = false;
    persist({ skipSync: true });
    if (state.projects.length && state.drive.masterSheetId) await rebuildMasterSheet({ silent: true });
    await logAudit("Planner Formatted", { details: protectedProjects.length ? `Unprotected data cleared; ${protectedProjects.length} protected job(s) kept` : "Projects, folders, rooms, nodes, photos cleared; Audit/Admin kept" });
    render();
    toast(protectedProjects.length ? "Planner formatted. Protected jobs kept." : "Planner data formatted. Audit and Admin Files kept.");
  } catch (e) {
    console.warn("Format failed", e);
    toast("Format failed: " + describeError(e));
  }
}

async function deleteSelectedNode() {
  const node = selectedNode(); if (!node) return;
  const titleRoom = node.type === "title" ? roomById(node.linkedRoomId) : null;
  if (titleRoom) {   // 0.17.1: deleting a room's title pin deletes the room too
    if (!window.confirm(`Delete "${nodeDisplayTitle(node)}" and its room? Nodes inside keep their place but lose the room.`)) return;
    state.nodes.forEach((n) => { if (n.roomId === titleRoom.id) { n.roomId = null; n.updatedAt = nowStamp(); } if (n.linkedRoomId === titleRoom.id && n.id !== node.id) n.linkedRoomId = null; });
    state.rooms = state.rooms.filter((r) => r.id !== titleRoom.id);
    if (state.selectedRoomId === titleRoom.id) state.selectedRoomId = "all";
    logAudit("Room Deleted", { projectId: titleRoom.projectId, floorId: titleRoom.floorId, details: `${titleRoom.name} (with title pin)` });
  }
  const driveId_N = state.drive.nodeFolderMap[node.id];
  const linkedDriveId = node.linkedNodeId ? state.drive.nodeFolderMap[node.linkedNodeId] : null;
  const linkedNode = (node.type === "portal" && node.linkedNodeId) ? state.nodes.find((n) => n.id === node.linkedNodeId) : null;
  if (linkedNode) {
    state.nodes = state.nodes.filter((n) => n.id !== linkedNode.id);
    delete state.drive.nodeFolderMap[linkedNode.id];
  }
  state.nodes = state.nodes.filter((n) => n.id !== node.id);
  delete state.drive.nodeFolderMap[node.id];
  state.selectedNodeId = floorNodes()[0]?.id || null;
  state.drawerOpen = Boolean(state.selectedNodeId);
  state.modal = null; persist(); render();
  undoableDelete(`Node "${nodeDisplayTitle(node)}" deleted`, {
    undo: () => {
      state.nodes.push(node);
      if (driveId_N) state.drive.nodeFolderMap[node.id] = driveId_N;
      if (linkedNode) { state.nodes.push(linkedNode); if (linkedDriveId) state.drive.nodeFolderMap[linkedNode.id] = linkedDriveId; }
      state.selectedNodeId = node.id;
    },
    commit: async () => {
      const trashed = await trashDriveFolders([driveId_N, linkedDriveId]);
      logAudit("Node Deleted", { nodeId: node.id, nodeTitle: nodeDisplayTitle(node), details: `${trashed} Drive folder(s) trashed` });
    }
  });
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

function readImageAspectRatio(src) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img.naturalWidth && img.naturalHeight ? Number((img.naturalWidth / img.naturalHeight).toFixed(4)) : null);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

// Upload the rasterised PNG of a plan to Drive so consumers (fit-off) can load
// a plain image instead of re-parsing the PDF on-device. Idempotent unless
// force is set (a fresh plan upload updates the existing PNG).
async function ensurePlanPng(proj, floor, force) {
  try {
    if (!isTokenValid() || !proj || !floor) return;
    if (floor.planPngFileId && !force) return;
    const png = state.floorPlans[floor.id];
    if (!png || typeof png !== "string" || png.indexOf("data:image") !== 0) return;  // need a rasterised image
    const folderId = await ensureFloorDriveFolder(proj, floor);
    if (!folderId) return;
    const blob = await (await fetch(png)).blob();
    const file = new File([blob], "floor-plan-render.png", { type: "image/png" });
    let result;
    if (floor.planPngFileId) {
      try { result = await updateFileBytes(floor.planPngFileId, file); }
      catch (e) { result = await uploadFileToDrive(file, folderId, "floor-plan-render.png"); }
    } else {
      result = await uploadFileToDrive(file, folderId, "floor-plan-render.png");
    }
    floor.planPngFileId = result.id;
    const liveFloor = liveFloorById(floor.id); if (liveFloor && liveFloor !== floor) liveFloor.planPngFileId = result.id;   // 0.18.5
    persist();
    return result;
  } catch (e) { console.warn("plan png sync failed", e); return null; }
}

function uploadFloorPlan() {
  const proj = project(); if (!proj) { toast("Create a project first"); return; }
  const floor = currentFloor(); if (!floor) { toast("Add a floor first"); return; }
  if (_masterReloading || state.planUpload || _planLinking[floor.id]) { toast("Wait for the current plan operation to finish"); return; }
  if (!requireAuth("upload a floor plan") || !requirePlannerDrive("upload floor plans")) return;
  const input = document.createElement("input");
  input.type = "file"; input.accept = "image/png,image/jpeg,image/svg+xml,image/webp,application/pdf,.pdf";
  input.onchange = async () => {
    let file = input.files?.[0]; if (!file) return;
    if (_masterReloading || state.planUpload || _planLinking[floor.id]) { toast("Wait for the current plan operation to finish"); return; }
    const isPdf = file.type === "application/pdf" || /\.pdf$/i.test(file.name);
    if (isPdf && file.type !== "application/pdf") file = new File([file], file.name, { type: "application/pdf" });
    const step = (label,pct) => { state.planUpload = label ? { step: label, pct } : null; render(); };
    const prevAspect = floor.planAspectRatio;
    step("Reading file…",5);
    try {
      await Promise.allSettled([_planFetches[floor.id]].filter(Boolean));
      const dataUrl = await new Promise((resolve,reject) => { const reader = new FileReader(); reader.onload = () => resolve(reader.result); reader.onerror = () => reject(reader.error || new Error("Could not read file")); reader.readAsDataURL(file); });
      step(isPdf ? "Rendering PDF…" : "Preparing image…",25);
      const live = liveFloorById(floor.id); if (!live) throw new Error("This floor was removed. Reopen the project first.");
      await replaceFloorPlanCache(live,dataUrl,{ planFileName: file.name });
      const saved = { dataUrl, name: file.name, mimeType: file.type };
      _pendingPlanSources[floor.id] = saved;
      live.planPendingUpload = true; live.planFileName = file.name; live.planRecoveryDisabled = false;
      persist({ skipSync: true });
      let durable = false;
      if (window.NDCache) { try { await NDCache.put(PLAN_PENDING_CACHE_PREFIX + floor.id,saved); durable = true; } catch (e) { console.warn("Pending original could not be cached",e); } }
      if (prevAspect && Math.abs(live.planAspectRatio / prevAspect - 1) > .02) setTimeout(() => toast("New plan has a different shape: check marker positions"),3000);
      let canSync = isTokenValid();
      if (!canSync && window.NDAuth?.ensureToken) { try { await NDAuth.ensureToken(); canSync = isTokenValid(); } catch (e) {} }
      if (!canSync || navigator.onLine === false) { toast(durable ? "Plan saved on this device. Keep Planner open and sign in online to finish syncing." : "Plan is only in memory. Keep this page open and reconnect to upload it."); return; }
      step("Uploading original and linking master…",55);
      const result = await linkLocalPlanOriginal(projectById(proj.id) || proj, liveFloorById(floor.id) || live);
      if (result?.published) toast(result.rendered ? "Plan and render linked in the master sheet. Other devices can reload them." : "Original plan linked. The preview copy could not upload; other devices will use the PDF.");
      else if (result?.uploaded) toast("Original saved in Drive; master sync is pending. Keep Planner open and tap Sync.");
      else toast("Plan kept on this device. Upload pending: " + (result?.error || "sign in and retry"));
    } catch (e) { console.warn("Plan upload failed",e); toast("Plan upload failed: " + describeError(e)); }
    finally { step(null); }
  };
  input.click();
}

async function uploadPhotosToNode(nodeId, files, options = {}) {
  const node = state.nodes.find(n => n.id === nodeId); if (!node) return;
  if (!requireAuth("upload photos") || !requirePlannerDrive("upload photos")) return;
  enqueuePlannerPhotos(files, {nodeId, projectId: node.projectId, ...options});
}
