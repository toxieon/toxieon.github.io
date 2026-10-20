/* §2.2: the 3-minute polling loop is gone. Photos are imported on
 * focus/visibility return (the moment you'd actually look for them),
 * immediately after this app's own uploads, and via the manual
 * "Import photos" button. Throttled so tab-flapping doesn't spam. */
let _photoImportBound = false;
let _lastPhotoImportAt = 0;
const PHOTO_IMPORT_MIN_GAP_MS = 15000;

function maybeImportMasterPhotos() {
  if (!isTokenValid() || !state.drive.masterSheetId) return;
  const now = Date.now();
  if (now - _lastPhotoImportAt < PHOTO_IMPORT_MIN_GAP_MS) return;
  _lastPhotoImportAt = now;
  importMasterPhotos({ silent: true }).catch((e) => console.warn("Auto photo import failed", e));
  refreshInbox({ silent: true }).catch((e) => console.warn("Inbox refresh failed", e));
}

function startMasterPhotoImportLoop() {   // name kept for existing call sites
  if (_photoImportBound) return;
  _photoImportBound = true;
  document.addEventListener("visibilitychange", () => { if (!document.hidden) maybeImportMasterPhotos(); });
  window.addEventListener("focus", () => maybeImportMasterPhotos());
}

function stopMasterPhotoImportLoop() { /* listeners self-guard via isTokenValid */ }

// 0.18.5: floors whose plan file ids exist only on this device (row differs from the last
// synced snapshot, or there is no snapshot yet). Read-only.
function localUnsyncedPlanLinks() {
  const out = {};
  let snapFloors = null, rows;
  try { snapFloors = (loadSnapshot() || {}).Floors || null; rows = buildMasterRows().Floors; } catch (e) { return out; }
  (state.projects || []).forEach((p) => (p.floors || []).forEach((f) => {
    if (!f.planDriveFileId && !f.planPngFileId && !f.planPendingUpload) return;
    const row = rows.get(f.id);
    if (!f.planPendingUpload && snapFloors && row && snapFloors[f.id] === rowHash(row)) return;   // already synced as-is: cloud is authoritative
    out[f.id] = { planDriveFileId: f.planDriveFileId || null, planPngFileId: f.planPngFileId || null, planFileName: f.planFileName || null, planAspectRatio: f.planAspectRatio || null, planPendingUpload: !!f.planPendingUpload };
  }));
  return out;
}
function liveFloorById(id) {
  for (const p of state.projects || []) { const f = (p.floors || []).find((x) => x.id === id); if (f) return f; }
  return null;
}

// Capture originals which have not reached Drive/the sheet yet, including a floor or
// project created on this device. Checking keys avoids loading every large PDF into RAM.
async function pendingDevicePlans() {
  const links = localUnsyncedPlanLinks();
  const keys = new Set(window.NDCache ? await NDCache.keys().catch(() => []) : []);
  const plans = [];
  for (const proj of state.projects || []) for (const floor of proj.floors || []) {
    const deviceOnly = !floor.planDriveFileId && (state.floorPlans[floor.id] || _planPdfSrc[floor.id] || keys.has(PLAN_PDF_CACHE_PREFIX + floor.id) || keys.has(PLAN_CACHE_PREFIX + floor.id));
    if (!links[floor.id] && !deviceOnly && !floor.planPendingUpload) continue;
    plans.push({ project: { ...proj }, floor: { ...floor },
      folder: state.projectFolders.find(item => item.id === proj.folderId),
      projectFolderId: state.drive.projectFolderMap[proj.id], floorFolderId: state.drive.floorFolderMap[floor.id],
      nodeFolders: Object.fromEntries(state.nodes.filter(node => node.floorId === floor.id && state.drive.nodeFolderMap[node.id]).map(node => [node.id, state.drive.nodeFolderMap[node.id]])),
      nodes: state.nodes.filter((node) => node.floorId === floor.id), rooms: state.rooms.filter((room) => room.floorId === floor.id) });
  }
  return plans;
}

function restorePendingDevicePlans(plans) {
  for (const saved of plans) {
    if (saved.folder && !state.projectFolders.some(item => item.id === saved.folder.id)) state.projectFolders.push(saved.folder);
    let proj = state.projects.find((item) => item.id === saved.project.id);
    if (!proj) { proj = { ...saved.project, floors: [] }; state.projects.push(proj); }
    let floor = (proj.floors || []).find((item) => item.id === saved.floor.id);
    if (!floor) { floor = { ...saved.floor }; proj.floors.push(floor); }
    else {
      // Keep an unfinished replacement as a coherent original/render pair. A link which
      // merely missed the sheet is still gap-filled, retaining 0.18.5's cloud precedence.
      if (saved.floor.planPendingUpload) Object.assign(floor, saved.floor);
      else {
        if (!floor.planDriveFileId) floor.planDriveFileId = saved.floor.planDriveFileId || null;
        if (!floor.planPngFileId) floor.planPngFileId = saved.floor.planPngFileId || null;
        if (!floor.planFileName) floor.planFileName = saved.floor.planFileName || null;
      }
    }
    if (!state.drive.projectFolderMap[proj.id] && saved.projectFolderId) state.drive.projectFolderMap[proj.id] = saved.projectFolderId;
    if (!state.drive.floorFolderMap[floor.id] && saved.floorFolderId) state.drive.floorFolderMap[floor.id] = saved.floorFolderId;
    Object.entries(saved.nodeFolders || {}).forEach(([id, folder]) => { if (!state.drive.nodeFolderMap[id]) state.drive.nodeFolderMap[id] = folder; });
    for (const node of saved.nodes) if (!state.nodes.some((item) => item.id === node.id)) state.nodes.push(node);
    for (const room of saved.rooms) if (!state.rooms.some((item) => item.id === room.id)) state.rooms.push(room);
  }
}

async function hydrateFromMasterSheet(opts = {}) {
  const silent = opts.silent || false;
  if (!isTokenValid() || !state.drive.masterSheetId) return false;
  state.googleAuth.hydrating = true;
  render();
  try {
    let devicePlans = opts.foreignLocal ? [] : await pendingDevicePlans();   // 0.19.1: never carry another account's plans over
    const floorPreferences = new Map(state.projects.flatMap(p => (p.floors || []).map(f => [f.id, { planOpacity: f.planOpacity, planBrightness: f.planBrightness, planGrid: f.planGrid, planRecoveryDisabled: f.planRecoveryDisabled }])));
    if (!silent) toast("Loading from cloud...");
    const resp = await googleCall(() => gapi.client.sheets.spreadsheets.values.batchGet({
      spreadsheetId: state.drive.masterSheetId,
      ranges: ["Projects!A2:Z", "Floors!A2:Z", "Nodes!A2:AD", "Photos!A2:Z", "Folders!A2:Z", "Rooms!A2:Z"]
    }));
    // An upload can finish while Sheets is in flight (for example during token renewal).
    // Capture again before replacing objects so its new association cannot be dropped.
    if (!opts.foreignLocal) devicePlans = Array.from(new Map([...devicePlans, ...await pendingDevicePlans()].map(item => [item.floor.id,item])).values());
    const vrs = resp.result.valueRanges || [];
    const projRows = (vrs[0] && vrs[0].values) || [];
    const floorRows = (vrs[1] && vrs[1].values) || [];
    const nodeRows = (vrs[2] && vrs[2].values) || [];
    const photoRows = (vrs[3] && vrs[3].values) || [];
    const folderRows = (vrs[4] && vrs[4].values) || [];
    const roomRows = (vrs[5] && vrs[5].values) || [];
    // 0.19.1: records this device changed but the sheet doesn't have yet (push failed or still pending)
    const cloudIds = { Projects: new Set(), Floors: new Set(), Nodes: new Set(), Photos: new Set(), Folders: new Set(), Rooms: new Set() };
    [["Projects", projRows], ["Floors", floorRows], ["Nodes", nodeRows], ["Photos", photoRows], ["Folders", folderRows], ["Rooms", roomRows]].forEach(([tab, rows]) => rows.forEach((r) => { if (r && r[0]) cloudIds[tab].add(String(r[0])); }));
    const cloudStamps = { Projects: new Map(projRows.map((r) => [String(r[0] || ""), r[7] || ""])), Nodes: new Map(nodeRows.map((r) => [String(r[0] || ""), r[21] || ""])), Rooms: new Map(roomRows.map((r) => [String(r[0] || ""), r[5] || ""])) };
    const localDirty = opts.foreignLocal ? null : collectLocalDirty(cloudIds);
    if (!projRows.length && !(opts.preferCloud && localDirty)) {
      if (opts.preferCloud) {
        state.projectFolders = [];
        state.projects = [];
        state.rooms = [];
        state.nodes = [];
        state.selectedProjectId = null;
        state.selectedFloorId = null;
        state.selectedRoomId = "all";
        state.selectedNodeId = null;
        state.drawerOpen = false;
        restorePendingDevicePlans(devicePlans);
        persist({ skipSync: true });
        snapshotAfterHydrate(null, cloudIds, !!opts.foreignLocal);   // 0.19.1: this device now matches the (empty) sheet
        render();
      }
      if (!silent) toast("No projects in cloud yet");
      return true;
    }
    // 0.18.5: plan links this device has but the sheet doesn't yet (never pushed) survive the rebuild;
    // the bootstrap hydrate runs BEFORE its flush, so they used to be wiped and never reach other devices.
    // (computed before the folder maps below are reset, so row hashes match the snapshot)
    const unsyncedPlans = localUnsyncedPlanLinks();
    let keptPlans = 0;
    state.drive.projectFolderMap = {};
    state.drive.floorFolderMap = {};
    state.drive.nodeFolderMap = {};
    state.projectFolders = folderRows.map((r) => ({
      id: r[0], name: r[1], color: r[2] || "#0ea5e9", driveFolderId: r[4] || null
    }));
    // Preserve device-local project fields (colour / completed / rooms toggle)
    // across a cloud rebuild — they're not columns in the sheet (yet).
    const localExtras = {};
    (state.projects || []).forEach((p) => { localExtras[p.id] = { color: p.color, completed: p.completed, showRooms: p.showRooms }; });
    const projectMap = {};
    for (const r of projRows) {
      if (!r[0]) continue;
      const folderGroupName = r[2] || "";
      const folderId = folderGroupName && folderGroupName !== DRIVE_UNFILED_FOLDER
        ? (state.projectFolders.find((f) => f.name === folderGroupName) || {}).id || null
        : null;
      const p = {
        id: r[0], name: r[1] || "Untitled", folderId,
        address: r[3] || "", description: r[4] || "",
        createdBy: r[5] || "", createdAt: r[6] || nowStamp(), updatedAt: r[7] || nowStamp(),
        floors: [], team: [], protected: parseBool(r[11])
      };
      if (r[8]) state.drive.projectFolderMap[p.id] = r[8];
      projectMap[p.id] = p;
    }
    state.projects = Object.values(projectMap);
    state.projects.forEach((p) => {
      const e = localExtras[p.id]; if (!e) return;
      if (e.color != null) p.color = e.color;
      if (typeof e.completed === "boolean") p.completed = e.completed;
      if (e.showRooms != null) p.showRooms = e.showRooms;
    });
    for (const r of floorRows) {
      if (!r[0]) continue;
      const proj = projectMap[r[1]]; if (!proj) continue;
      const fl = {
        id: r[0], name: r[3] || "Floor", order: Number(r[4]) || 0,
        planDriveFileId: r[5] || null, planMimeType: null, planWebViewLink: null, planFileName: null,
        createdAt: r[8] || nowStamp(), planAspectRatio: Number(r[9]) || null,
        planPngFileId: r[10] || null
      };
      Object.assign(fl, floorPreferences.get(fl.id) || {});
      const keep = unsyncedPlans[fl.id];   // gap-fill only: a non-empty cloud value always wins
      if (keep) {
        if (!fl.planDriveFileId && keep.planDriveFileId) { fl.planDriveFileId = keep.planDriveFileId; fl.planFileName = keep.planFileName; keptPlans++; }
        if (!fl.planPngFileId && keep.planPngFileId) { fl.planPngFileId = keep.planPngFileId; keptPlans++; }
        if (!fl.planAspectRatio && keep.planAspectRatio) fl.planAspectRatio = keep.planAspectRatio;
      }
      if (r[6]) state.drive.floorFolderMap[fl.id] = r[6];
      proj.floors.push(fl);
    }
    state.projects.forEach((p) => p.floors.sort((a, b) => (a.order || 0) - (b.order || 0)));
    state.rooms = roomRows.filter((r) => r[0] && r[1] && r[2]).map((r) => ({
      id: r[0],
      projectId: r[1],
      floorId: r[2],
      name: r[3] || "Room",
      createdAt: r[4] || nowStamp(),
      updatedAt: r[5] || r[4] || nowStamp(),
      order: Number(r[6]) || 0,
      shape: parseRoomShape(r[7]) || null
    }));
    const photoMap = buildMasterPhotoMap(photoRows);
    state.nodes = nodeRows.filter((r) => r[0] && r[1]).map((r) => {
      const node = {
        id: r[0], projectId: r[1], floorId: r[3] || null,
        type: r[5] || "marker",
        customTitle: r[7] || "",
        category: r[8] || "", lineItem: r[9] || "",
        status: r[10] || "Not Started", assignedTo: r[11] || "",
        tags: (r[12] || "").split(",").map((t) => t.trim()).filter(Boolean),
        position: { x: Number(r[13]) || 50, y: Number(r[14]) || 50 },
        size: Number(r[15]) || 1, description: r[16] || "",
        createdBy: r[19] || "", createdAt: r[20] || nowStamp(), updatedAt: r[21] || nowStamp(),
        imageRefs: photoMap[r[0]] || [], comments: [],
        linkedProjectId: r[23] || null, linkedFloorId: r[24] || null, linkedNodeId: r[25] || null,
        roomId: r[27] || null, linkedRoomId: r[29] || null,
        // SWB integration fields (cols 30-36)
        circuit: r[30] || "", cableRunM: r[31] ? Number(r[31]) : null,
        boardLabel: r[32] || "", phaseConfig: r[33] || "",
        mainBreakerA: r[34] ? Number(r[34]) : null,
        swbProjectId: r[35] || null, swbSchemaVersion: r[36] || null
      };
      if (r[22]) state.drive.nodeFolderMap[node.id] = r[22];
      return node;
    });
    restorePendingDevicePlans(devicePlans);
    const keptLocal = mergeLocalDirty(localDirty, cloudStamps);
    if (state.projects.length && (!state.selectedProjectId || !state.projects.some((p) => p.id === state.selectedProjectId))) {
      state.selectedProjectId = state.projects[0].id;
      state.selectedFloorId = state.projects[0].floors[0] ? state.projects[0].floors[0].id : null;
    }
    const selectedProject = project();
    if (selectedProject && (!state.selectedFloorId || !selectedProject.floors.some((f) => f.id === state.selectedFloorId))) state.selectedFloorId = selectedProject.floors[0]?.id || null;
    if (state.selectedRoomId !== "all" && !state.rooms.some((r) => r.id === state.selectedRoomId)) state.selectedRoomId = "all";
    persist({ skipSync: true });
    if (keptPlans) { console.info("Kept " + keptPlans + " unsynced plan link(s) from this device; pushing them"); scheduleMasterSync(); }
    snapshotAfterHydrate(localDirty, cloudIds, !!opts.foreignLocal);
    if (keptLocal) { console.info("Kept " + keptLocal + " unsynced local record(s) through the cloud reload; pushing them"); scheduleMasterSync(); }
    render();
    if (!silent) toast("Loaded " + state.projects.length + " projects, " + state.nodes.length + " nodes from cloud");
    return true;
  } catch (e) {
    console.warn("Hydrate failed", e);
    if (!silent) toast("Cloud reload failed: " + describeError(e));
    return false;
  } finally {
    state.googleAuth.hydrating = false;
    render();
  }
}

/* Master reload: Sheets describes a plan, Drive contains its actual files. A reload
 * must visit both; a same-ID replacement otherwise leaves another device's cache stale.
 * Discovery is read-only and scoped to the known project/floor hierarchy. */
async function existingFloorPlanFolder(proj, floor) {
  if (state.drive.floorFolderMap[floor.id]) return state.drive.floorFolderMap[floor.id];
  let parent = state.drive.projectFolderMap[proj.id];
  if (!parent) {
    const group = state.projectFolders.find((item) => item.id === proj.folderId);
    const root = group ? (group.driveFolderId || (state.drive.projectsFolderId && await findChildFolder(group.name, state.drive.projectsFolderId))) : state.drive.unfiledFolderId;
    if (root) parent = await findChildFolder(proj.name, root);
  }
  if (!parent) return null;
  const id = await findChildFolder(floor.name, parent);
  if (id) { state.drive.projectFolderMap[proj.id] = parent; state.drive.floorFolderMap[floor.id] = id; }
  return id;
}

async function listFloorPlanFiles(folderId) {
  if (!folderId) return [];
  const files = [];
  let pageToken;
  do {
    const response = await googleCall(() => gapi.client.drive.files.list({
      q: `'${escapeDriveQuery(folderId)}' in parents and trashed=false and mimeType!='application/vnd.google-apps.folder'`,
      fields: "nextPageToken,files(id,name,mimeType,modifiedTime,webViewLink,md5Checksum)",
      pageSize: 1000, ...(pageToken ? { pageToken } : {})
    }));
    files.push(...(response.result.files || []));
    pageToken = response.result.nextPageToken;
  } while (pageToken);
  return files;
}

function resolveFloorPlanFiles(floor, files) {
  const supported = (file) => file.mimeType === "application/pdf" || /^image\//.test(file.mimeType || "") || /\.(pdf|png|jpe?g|webp|svg)$/i.test(file.name || "");
  const renderFile = (file) => /^floor-plan-render\.png$/i.test(file.name || "");
  const knownOriginal = (file) => /^floor-plan-/i.test(file.name || "") && !renderFile(file) && supported(file);
  const recent = (a, b) => String(b.modifiedTime || "").localeCompare(String(a.modifiedTime || ""));
  const candidates = files.filter(knownOriginal).sort(recent);
  const linked = files.find((file) => file.id === floor.planDriveFileId);
  let original = linked || null;
  let ambiguous = false;
  if (candidates.length) {
    const newer = !linked || (candidates[0].modifiedTime && candidates[0].modifiedTime > (linked.modifiedTime || ""));
    const tied = candidates.length > 1 && (candidates[0].modifiedTime || "") === (candidates[1].modifiedTime || "");
    if (newer && !tied) original = candidates[0];
    else if (!linked && tied) ambiguous = true;
  }
  const renders = files.filter(renderFile).sort(recent);
  const png = renders[0] || files.find((file) => file.id === floor.planPngFileId) || null;
  return { original, png, ambiguous };
}

async function replaceFloorPlanCache(floor, source, meta = {}) {
  source = normalizePdfDataUrl(source);
  const pdf = typeof source === "string" && source.startsWith("data:application/pdf");
  // Prepare first: a download or PDF-render failure must leave the working device copy intact.
  const display = pdf ? await pdfFirstPageToPng(source) : source;
  if (typeof display !== "string" || !display.startsWith("data:image/")) throw new Error("Drive file is not a displayable plan");
  const working = await downscaleDataUrl(display);
  await Promise.allSettled([_planPdfLoading[floor.id], _planKindLoading[floor.id]].filter(Boolean));
  delete _planPdfSrc[floor.id]; delete _planPdfStatus[floor.id]; delete _planKind[floor.id];
  if (_planImage[floor.id]) { URL.revokeObjectURL(_planImage[floor.id].url); delete _planImage[floor.id]; }
  if (_osd && _osd.floorId === floor.id) destroyOsd();
  if (_planPdfDoc && _planPdfDoc.floorId === floor.id) releasePlanPdfDoc();
  if (_hires && _hires.floorId === floor.id) dropHiresCanvas();
  if (window.NDCache) {
    // A different PDF can have the same byte count: the embedded-image cache must go too.
    await NDCache.remove(PLAN_IMAGE_PREFIX + floor.id).catch(() => {});
    if (pdf) await NDCache.put(PLAN_PDF_CACHE_PREFIX + floor.id, source, meta).catch(() => {});
    else await NDCache.remove(PLAN_PDF_CACHE_PREFIX + floor.id).catch(() => {});
    await NDCache.put(PLAN_CACHE_PREFIX + floor.id, working, meta).catch((e) => console.warn("plan cache put failed", e));
  }
  if (pdf) { _planPdfSrc[floor.id] = source; setPlanPdfStatus(floor.id, "pdf", "refreshed from Drive"); }
  else if (!meta.renderFallback) setPlanPdfStatus(floor.id, "image", "refreshed from Drive");
  state.floorPlans[floor.id] = working;
  floor.planAspectRatio = await readImageAspectRatio(working) || floor.planAspectRatio;
  delete _planFetchError[floor.id];
}

async function refreshFloorPlansFromDrive(options = {}) {
  const protectedIds = new Set((options.pendingPlans || []).map((item) => item.floor.id));
  const result = { refreshed: 0, recovered: 0, preserved: 0, failed: 0, warnings: [] };
  for (const proj of state.projects) for (const floor of proj.floors || []) {
    if (protectedIds.has(floor.id) || floor.planPendingUpload || _planLinking[floor.id]) { result.preserved++; continue; }
    if (floor.planRecoveryDisabled && !floor.planDriveFileId && !floor.planPngFileId) continue;
    try {
      let files = [], listingError = null;
      try { files = await listFloorPlanFiles(await existingFloorPlanFolder(proj, floor)); }
      catch (e) { listingError = e; }
      const resolved = resolveFloorPlanFiles(floor, files);
      if (resolved.ambiguous && !floor.planDriveFileId) throw new Error("Several plan originals have the same date; choose the correct file in Drive");
      const originalId = resolved.original?.id || floor.planDriveFileId;
      const pngId = resolved.png?.id || floor.planPngFileId;
      if (!originalId && !pngId) {
        if (listingError) throw listingError;
        continue;
      }
      let loaded = false, error = listingError, usedRender = false;
      for (const [fileId, fallback] of [[originalId, false], [pngId, true]]) {
        if (!fileId || (fallback && fileId === originalId)) continue;
        try {
          const source = await fetchDriveFileAsDataUrl(fileId, { fresh: true });
          if (!source) throw new Error("Sign in to download this plan");
          await replaceFloorPlanCache(floor, source, { planDriveFileId: originalId || null, planPngFileId: pngId || null, renderFallback: fallback });
          loaded = true; usedRender = fallback; break;
        } catch (e) { error = e; }
      }
      if (!loaded) throw error || new Error("Plan download failed");
      if (originalId !== floor.planDriveFileId || pngId !== floor.planPngFileId) result.recovered++;
      floor.planDriveFileId = originalId || null;
      floor.planPngFileId = pngId || null;
      if (resolved.original) { floor.planFileName = resolved.original.name; floor.planMimeType = resolved.original.mimeType; floor.planWebViewLink = resolved.original.webViewLink || null; }
      result.refreshed++;
      if (usedRender && originalId) { _planFetchError[floor.id] = "Using the rendered preview; the original could not be downloaded or rendered."; result.warnings.push(`${proj.name} / ${floor.name}: loaded render; original unavailable`); }
      if (listingError) result.warnings.push(`${proj.name} / ${floor.name}: loaded linked file; folder scan unavailable`);
    } catch (e) {
      result.failed++; _planFetchError[floor.id] = describeError(e);
      result.warnings.push(`${proj.name} / ${floor.name}: ${describeError(e)}`);
    }
  }
  persist({ skipSync: true });
  return result;
}

async function reloadMasterData(options = {}) {
  if (_masterReloading) return;
  if (state.planUpload) { toast("Finish the plan upload before reloading"); return; }
  if (_masterSyncing || _planHealRunning || Object.keys(_planLinking).length) { toast("Plan or master sync is still running. Retry reload when it finishes."); return; }
  if (!isTokenValid() || !state.drive.masterSheetId) { toast("Sign in and connect Drive before reloading"); return; }
  if (navigator.onLine === false) { toast("You're offline. Keeping the plans saved on this device."); return; }
  await flushMasterDeltas({ silent: true, prePull: true });   // 0.19.1: push local edits before reloading
  if (_masterReloading) return;
  _masterReloading = true;
  clearTimeout(_masterSyncTimer);
  clearTimeout(_hiresTimer);
  render();
  try {
    if (!options.silent) toast("Reloading master data and floor plans from Drive…");
    await Promise.allSettled(Object.values(_planFetches));
    const pendingPlans = await pendingDevicePlans();
    const hydrated = await hydrateFromMasterSheet({ silent: true, preferCloud: true });
    if (!hydrated) throw new Error("Master sheet could not be loaded; device plans were kept");
    const result = await refreshFloorPlansFromDrive({ pendingPlans });
    await importMasterPhotos({ silent: true, renderOnChange: false, scheduleSync: false });
    if (window.NDDriveImage) NDDriveImage.clearCache();
    const notes = [result.refreshed + " plan" + (result.refreshed === 1 ? "" : "s") + " refreshed"];
    if (result.recovered) notes.push(result.recovered + " link" + (result.recovered === 1 ? "" : "s") + " recovered from Drive");
    if (result.preserved) notes.push(result.preserved + " pending device plan" + (result.preserved === 1 ? "" : "s") + " kept");
    if (result.failed) notes.push(result.failed + " could not load (saved copies kept)");
    else if (result.warnings.length) notes.push(result.warnings.length + " used a fallback; check plan details");
    if (result.warnings.length) console.warn("Master reload plan details:", result.warnings);
    toast(notes.join(" · "));
    return result;
  } catch (e) { toast("Master reload failed: " + describeError(e)); return null; }
  finally { _masterReloading = false; render(); }
}

let _masterSyncTimer = null;
let _bootSyncing = false;   // 0.19.1

/* 0.19.1 push-before-reload helpers. The snapshot (id -> row hash of what this device last
 * wrote or saw in the sheet) is the dirty marker: a local row whose hash differs from it is
 * an unsynced local edit; an id in it that is gone locally is an unsynced local delete. */
function sheetSnapshot() {
  const s = loadSnapshot();
  if (!s || (s.__sheet && s.__sheet !== state.drive.masterSheetId)) return null;
  return s;
}
function backupForeignLocalState(sheetId) {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw && (state.projects || []).length) localStorage.setItem("neillplanner-backup-" + sheetId, raw);
    console.warn("Local data belongs to another master sheet; kept a backup and loading this account's cloud data");
  } catch (e) { console.warn("foreign-state backup failed", e); }
}
function collectLocalDirty(cloudIds) {
  const snap = sheetSnapshot();
  const hashMode = !!(snap && !snap.__seeded);
  const rows = buildMasterRows();
  const dirty = {}, deleted = {};
  let count = 0;
  Object.keys(MASTER_TABS).forEach((tab) => {
    dirty[tab] = new Set(); deleted[tab] = new Set();
    const snapTab = (snap && snap[tab]) || {};
    rows[tab].forEach((row, id) => { if (hashMode ? snapTab[id] !== rowHash(row) : !cloudIds[tab].has(id)) { dirty[tab].add(id); count++; } });
    if (hashMode) Object.keys(snapTab).forEach((id) => { if (!rows[tab].has(id)) { deleted[tab].add(id); count++; } });
  });
  rows.Photos.forEach((row, id) => { if (dirty.Photos.has(id) && row[3]) dirty.Nodes.add(String(row[3])); });   // photo metadata lives on its node
  if (!count) return null;
  const floors = new Map();
  (state.projects || []).forEach((p) => (p.floors || []).forEach((f) => floors.set(f.id, { floor: f, projectId: p.id })));
  return {
    dirty, deleted, count, floors,
    projects: new Map((state.projects || []).map((p) => [p.id, p])),
    nodes: new Map((state.nodes || []).map((n) => [n.id, n])),
    rooms: new Map((state.rooms || []).map((r) => [r.id, r])),
    folders: new Map((state.projectFolders || []).map((f) => [f.id, f])),
    maps: { project: { ...state.drive.projectFolderMap }, floor: { ...state.drive.floorFolderMap }, node: { ...state.drive.nodeFolderMap } }
  };
}
function mergeLocalDirty(ld, cloudStamps) {
  if (!ld) return 0;
  let kept = 0;
  // Last-writer-wins by Updated At where the sheet has one; a tie or missing stamp keeps the local edit.
  const localWins = (tab, id, rec) => { const c = cloudStamps[tab]?.get(id); return !c || !rec?.updatedAt || String(rec.updatedAt) >= String(c); };
  const upsert = (arr, rec) => { const i = arr.findIndex((x) => x.id === rec.id); if (i >= 0) arr[i] = rec; else arr.push(rec); };
  const projectFor = (pid) => {
    let cp = state.projects.find((p) => p.id === pid);
    if (!cp && ld.projects.has(pid)) { cp = { ...ld.projects.get(pid), floors: [] }; state.projects.push(cp); }
    return cp;
  };
  ld.dirty.Folders.forEach((id) => { const f = ld.folders.get(id); if (f) { upsert(state.projectFolders, f); kept++; } });
  ld.dirty.Projects.forEach((id) => {
    const lp = ld.projects.get(id);
    if (!lp || !localWins("Projects", id, lp)) { ld.dirty.Projects.delete(id); return; }
    const cp = state.projects.find((p) => p.id === id);
    if (cp) Object.assign(cp, { ...lp, floors: cp.floors }); else state.projects.push({ ...lp, floors: [] });
    if (!state.drive.projectFolderMap[id] && ld.maps.project[id]) state.drive.projectFolderMap[id] = ld.maps.project[id];
    kept++;
  });
  ld.dirty.Floors.forEach((id) => {
    const e = ld.floors.get(id); if (!e) return;
    const cp = projectFor(e.projectId); if (!cp) return;
    cp.floors = cp.floors || [];
    const i = cp.floors.findIndex((f) => f.id === id);
    if (i >= 0) {
      const cf = cp.floors[i], lf = e.floor;
      // 0.18.5 rule kept: a non-empty cloud plan id wins unless this device has a pending replacement
      const pick = (a, b) => lf.planPendingUpload ? (a || b || null) : (b || a || null);
      cp.floors[i] = { ...cf, ...lf, planDriveFileId: pick(lf.planDriveFileId, cf.planDriveFileId), planPngFileId: pick(lf.planPngFileId, cf.planPngFileId), planAspectRatio: lf.planAspectRatio || cf.planAspectRatio || null };
    } else cp.floors.push(e.floor);
    cp.floors.sort((a, b) => (a.order || 0) - (b.order || 0));
    if (!state.drive.floorFolderMap[id] && ld.maps.floor[id]) state.drive.floorFolderMap[id] = ld.maps.floor[id];
    kept++;
  });
  ld.dirty.Nodes.forEach((id) => {
    const n = ld.nodes.get(id);
    if (!n || !localWins("Nodes", id, n)) { ld.dirty.Nodes.delete(id); return; }
    upsert(state.nodes, n);
    if (!state.drive.nodeFolderMap[id] && ld.maps.node[id]) state.drive.nodeFolderMap[id] = ld.maps.node[id];
    kept++;
  });
  ld.dirty.Rooms.forEach((id) => {
    const r = ld.rooms.get(id);
    if (!r || !localWins("Rooms", id, r)) { ld.dirty.Rooms.delete(id); return; }
    upsert(state.rooms, r); kept++;
  });
  // Deletes made on this device that haven't reached the sheet stay deleted.
  const del = ld.deleted;
  if (del.Projects.size) state.projects = state.projects.filter((p) => !del.Projects.has(p.id));
  if (del.Floors.size) state.projects.forEach((p) => { p.floors = (p.floors || []).filter((f) => !del.Floors.has(f.id)); });
  if (del.Nodes.size) state.nodes = state.nodes.filter((n) => !del.Nodes.has(n.id));
  if (del.Rooms.size) state.rooms = state.rooms.filter((r) => !del.Rooms.has(r.id));
  if (del.Folders.size) state.projectFolders = state.projectFolders.filter((f) => !del.Folders.has(f.id));
  Object.values(del).forEach((set) => { kept += set.size; });
  return kept;
}
// After a reload the snapshot describes the sheet as just read, except for the local edits still
// to push (they keep their old hash, so the next flush sends them).
function snapshotAfterHydrate(ld, cloudIds, foreign) {
  const prev = foreign ? null : sheetSnapshot();
  const rows = buildMasterRows();
  const snap = { __sheet: state.drive.masterSheetId };
  Object.keys(MASTER_TABS).forEach((tab) => {
    snap[tab] = {};
    const prevTab = (prev && !prev.__seeded && prev[tab]) || {};
    rows[tab].forEach((row, id) => {
      if (ld && ld.dirty[tab].has(id)) { if (prevTab[id] && cloudIds[tab].has(id)) snap[tab][id] = prevTab[id]; return; }
      if (cloudIds[tab].has(id)) snap[tab][id] = rowHash(row);
    });
    if (ld) ld.deleted[tab].forEach((id) => { if (cloudIds[tab].has(id) && prevTab[id]) snap[tab][id] = prevTab[id]; });
  });
  saveSnapshot(snap);
}
// Before a reload: don't push a row whose Updated At in the sheet is newer (another device's edit).
const MASTER_STAMP_COL = { Projects: 7, Nodes: 21, Rooms: 5 };
async function dropCloudNewer(deltas) {
  const tabs = Object.keys(MASTER_STAMP_COL).filter((t) => deltas[t] && deltas[t].upserts.size);
  if (!tabs.length) return 0;
  const r = await googleCall(() => gapi.client.sheets.spreadsheets.values.batchGet({
    spreadsheetId: state.drive.masterSheetId,
    ranges: tabs.map((t) => `${t}!A2:${ND.sheetsKit.colLetter(MASTER_STAMP_COL[t])}`)
  }));
  let dropped = 0;
  tabs.forEach((tab, i) => {
    const c = MASTER_STAMP_COL[tab];
    ((r.result.valueRanges?.[i]?.values) || []).forEach((raw) => {
      const id = String(raw[0] || ""), row = deltas[tab].upserts.get(id);
      if (!row) return;
      const cloud = String(raw[c] || ""), local = String(row[c] || "");
      if (cloud && local && cloud > local) { deltas[tab].upserts.delete(id); dropped++; }
    });
  });
  if (dropped) console.info("Skipped " + dropped + " local row(s) older than the sheet's copy");
  return dropped;
}
if (typeof window !== "undefined") window.addEventListener("online", () => { if (state.drive.masterSheetId && isTokenValid()) scheduleMasterSync(); });   // 0.19.1: reconnect pushes pending edits

let _masterSyncing = false;
let _masterSyncQueued = false;
