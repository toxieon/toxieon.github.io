/* ============================================================ UNIFIED INBOX
 * Slice 2 #16 + #17 — "Create job from upload" banner (v1.0 §4.3) and the
 * "To be sorted" tray (v1.0 §4.4) with auto-create-node tidy stack (§2.1.3).
 * Reads/writes the master Inbox tab via nd-inbox; all writes keyed (§0.4).
 * ======================================================================= */

let _inboxRecords = [];
let _inboxLoading = false;
let _plannerInboxApi = null;
const _bannerNotNow = {};                       // session-only dismissals
const INBOX_NEVER_KEY = "np-inbox-never-v1";    // "Never for this address"

function getPlannerInboxApi() {
  if (_plannerInboxApi) return _plannerInboxApi;
  if (!window.NDInbox || !window.ND?.sheetsKit || !state.drive.masterSheetId) return null;
  const sheets = ND.sheetsKit.create({ gateway: ND.sheetsKit.gapiGateway() });
  _plannerInboxApi = NDInbox.createInboxApi({ sheets, spreadsheetId: state.drive.masterSheetId });
  return _plannerInboxApi;
}

function inboxNeverList() {
  try { return JSON.parse(localStorage.getItem(INBOX_NEVER_KEY)) || {}; } catch (e) { return {}; }
}
function addInboxNeverAddress(key) {
  const list = inboxNeverList(); list[key] = true;
  try { localStorage.setItem(INBOX_NEVER_KEY, JSON.stringify(list)); } catch (e) {}
}

async function refreshInbox(opts = {}) {
  const api = getPlannerInboxApi();
  if (!api || _inboxLoading || !isTokenValid()) return;
  _inboxLoading = true;
  try {
    _inboxRecords = await api.list();
    if (state.activeView === "projects" || state.modal?.mode === "sort-tray") render();
  } catch (e) {
    if (!opts.silent) toast("Inbox refresh failed: " + describeError(e));
    else console.warn("Inbox refresh failed", e);
  } finally { _inboxLoading = false; }
}

function unfiledInboxGroups() {
  if (!window.NDInbox || !window.NDMatch) return [];
  const never = inboxNeverList();
  const projectKeys = new Set(state.projects.map((p) => NDMatch.addressKey(p.address || "")).filter(Boolean));
  return NDInbox.groupUnfiled(_inboxRecords).filter((g) =>
    g.addressKey !== "(no address)" && !projectKeys.has(g.addressKey) && !never[g.addressKey] && !_bannerNotNow[g.addressKey]);
}

function renderInboxBanners() {
  const groups = unfiledInboxGroups().slice(0, 3);
  if (!groups.length) return "";
  return groups.map((g) => `
    <div class="inbox-banner" data-inbox-group="${escapeHtml(g.addressKey)}">
      <div class="inbox-banner-text">
        <strong>\u{1F4E5} ${escapeHtml(g.label)}</strong>
        <span>${g.count} photo${g.count === 1 ? "" : "s"} uploaded, no job yet.${g.floorPlan ? " Floor plan tagged." : ""}</span>
      </div>
      <div class="inbox-banner-actions">
        <button class="primary-button" data-inbox-create="${escapeHtml(g.addressKey)}">${icon("plus")}Create job</button>
        <button class="ghost-button" data-inbox-later="${escapeHtml(g.addressKey)}">Not now</button>
        <button class="ghost-button" data-inbox-never="${escapeHtml(g.addressKey)}" title="Stop suggesting this address">Never</button>
      </div>
    </div>`).join("");
}

function renderToSortChip() {
  const proj = project();
  if (!proj) return "";
  const n = _inboxRecords.filter((r) => r.status === NDInbox?.STATUS?.FILED_TO_PROJECT && r.projectId === proj.id).length;
  if (!n) return "";
  return `<button class="to-sort-chip" data-inbox-tray="${proj.id}" title="Photos waiting to be sorted onto nodes">To sort (${n})</button>`;
}

function suggestProjectName(address) {
  const street = String(address || "").split(",")[0].trim();
  return street || "New job";
}

async function ensureBatchFolderId() {
  if (state.drive.batchFolderId) return state.drive.batchFolderId;
  if (!state.drive.rootFolderId) return null;
  const id = await findOrCreateChildFolder(BATCH_FOLDER_NAME_ND, state.drive.rootFolderId);
  state.drive.batchFolderId = id;
  persist({ skipSync: true });
  return id;
}
const BATCH_FOLDER_NAME_ND = "Batch";

/* v1.0 §4.3 — pre-seed everything we already know. */
async function createJobFromInboxGroup(addressKey) {
  const group = unfiledInboxGroups().find((g) => g.addressKey === addressKey);
  const api = getPlannerInboxApi();
  if (!group || !api) return;
  toast(`Creating job for ${group.label}...`);
  const floor = { id: uid("floor"), name: "Ground floor", order: 0, createdAt: nowStamp() };
  const proj = {
    id: uid("prj"), name: suggestProjectName(group.address), address: group.address,
    description: `Created from ${group.count} uploaded photo${group.count === 1 ? "" : "s"}`,
    folderId: null, floors: [floor], team: [],
    createdBy: state.googleAuth.profile?.name || state.googleAuth.profile?.email || "owner",
    createdAt: nowStamp(), updatedAt: nowStamp()
  };
  state.projects.push(proj);
  state.selectedProjectId = proj.id;
  state.selectedFloorId = floor.id;
  persist(); render();
  try {
    const projFolderId = await ensureProjectDriveFolder(proj);
    await ensureFloorDriveFolder(proj, floor);
    const batchId = await ensureBatchFolderId();
    // §4.3.3: tagged plan goes straight onto the ground floor — no re-upload
    if (group.floorPlan) {
      floor.planDriveFileId = group.floorPlan.driveFileId;
      floor.planFileName = group.floorPlan.name || "";
      try {
        const url = await fetchDriveFileAsDataUrl(group.floorPlan.driveFileId);
        if (url) {
          await cacheFloorPlan(floor.id, url, { planDriveFileId: group.floorPlan.driveFileId });
          floor.planAspectRatio = await readImageAspectRatio(state.floorPlans[floor.id]) || 1.6;
          await ensurePlanPng(proj, floor, true);
        }
      } catch (e) { console.warn("Plan fetch failed (still linked)", e); }
    }
    // §4.3.4: photos move into the project's inbox (Drive folder + status)
    for (const rec of group.records) {
      try {
        if (projFolderId) await moveDriveFileToFolder(rec.driveFileId, projFolderId, batchId || "");
        const updated = await api.setStatus(rec, NDInbox.STATUS.FILED_TO_PROJECT, { projectId: proj.id, floorId: floor.id });
        const local = _inboxRecords.find((r) => r.driveFileId === rec.driveFileId);
        if (local) Object.assign(local, updated);
      } catch (e) { console.warn("Inbox file move failed", rec.driveFileId, e); }
    }
    persist(); 
    logAudit("Job Created From Upload", { projectId: proj.id, details: `${group.label}: ${group.count} photo(s)${group.floorPlan ? " + plan" : ""}` });
    toast(`Job created: ${proj.name}`);
    state.modal = { mode: "sort-tray", projectId: proj.id };   // §4.3.5
    render();
  } catch (e) {
    toast("Job created locally; Drive setup incomplete: " + describeError(e));
    render();
  }
}

function trayRecords(projectId) {
  // Whitelist by the project's address (read from the master Inbox), so photos
  // uploaded for this job show up as batch nodes without a manual "file" step —
  // both those already filed to it AND unfiled ones whose address matches.
  const proj = projectById(projectId);
  const projKey = (proj && window.NDMatch) ? NDMatch.addressKey(proj.address || "") : "";
  return _inboxRecords.filter((r) => {
    if (r.isFloorPlan) return false;
    if (r.status === NDInbox.STATUS.FILED_TO_PROJECT && r.projectId === projectId) return true;
    if (projKey && (r.status === NDInbox.STATUS.UNFILED || r.status === NDInbox.STATUS.UPLOADED)) {
      const rk = r.addressKey || (window.NDMatch ? NDMatch.addressKey(r.address || "") : "");
      return rk === projKey;
    }
    return false;
  });
}

/* §26/§32 Batch nodes: premade nodes from the uploader (photos filed to this
 * project but not yet placed), grouped by room per floor. Drag a chip onto the
 * plan to create the node there and attach its photo(s). "Location" from the
 * uploader is treated as the node's floor; blank = "Undefined floor". */
let _batchGroups = {};
function batchNodeGroups(proj) {
  if (!proj) return [];
  const recs = trayRecords(proj.id);
  const groups = {};
  recs.forEach((r) => {
    const floorId = r.floorId || "";
    const room = String(r.room || r.location || "Unsorted").trim() || "Unsorted";
    const key = (floorId || "none") + "|" + room.toLowerCase();
    if (!groups[key]) groups[key] = { key, floorId, room, records: [] };
    groups[key].records.push(r);
  });
  return Object.values(groups);
}
function renderBatchNodesPanel(proj) {
  if (!proj) return "";
  _batchGroups = {};
  const groups = batchNodeGroups(proj);
  groups.forEach((g) => { _batchGroups[g.key] = g; });
  const n = groups.length;
  const collapsed = state.ui.batchCollapsed != null ? state.ui.batchCollapsed : (n === 0);
  const floors = proj.floors || [];
  const floorName = (id) => (id && floors.find((f) => f.id === id)?.name) || "Undefined floor";
  const byFloor = {};
  groups.forEach((g) => { const k = g.floorId || "__none"; (byFloor[k] = byFloor[k] || []).push(g); });
  const body = n === 0
    ? `<div class="empty-state" style="padding:14px;font-size:12px">No batch nodes waiting. Upload a batch and file it to this job.</div>`
    : Object.keys(byFloor).map((fk) => {
        const fname = fk === "__none" ? "Undefined floor" : floorName(fk);
        return `<div class="batch-floor"><div class="batch-floor-name">${icon("layers")}${escapeHtml(fname)}</div>${byFloor[fk].map((g) => `<div class="batch-chip" draggable="true" data-batch-key="${escapeHtml(g.key)}" title="Drag onto the plan to place"><span class="batch-chip-main"><strong>${escapeHtml(g.room)}</strong><span class="batch-sub">${escapeHtml(fname)} &middot; ${g.records.length} photo${g.records.length === 1 ? "" : "s"}</span></span>${icon("map")}</div>`).join("")}</div>`;
      }).join("");
  return `<div class="batch-panel">
    <div class="batch-head-row">
      <button class="collapsible-heading batch-head" data-action="toggle-batch"><h3 class="section-title">Batch nodes${n ? ` (${n})` : ""}</h3><span class="compact-toggle">${collapsed ? "Show" : "Hide"}</span></button>
      <button class="icon-button batch-mini" data-action="refresh-batch" title="Refresh batch nodes">${icon("refresh")}</button>
      <button class="icon-button batch-mini" data-action="open-batch-folder" title="Open the Batch folder in Drive">${icon("folder")}</button>
    </div>
    ${collapsed ? "" : `<p class="summary-hint">Drag a node onto the plan to place it.</p><div class="batch-list">${body}</div>`}
  </div>`;
}
async function placeBatchNode(key, pos) {
  const g = _batchGroups[key], proj = project(), fl = currentFloor();
  if (!g || !proj || !fl) return;
  const node = {
    id: uid("node"), projectId: proj.id, floorId: fl.id, type: "marker",
    customTitle: g.room, category: "", lineItem: "", status: "Not Started", assignedTo: "", tags: [],
    description: `Placed from batch (${g.records.length} photo${g.records.length === 1 ? "" : "s"})`,
    position: pos, createdBy: state.googleAuth.profile?.name || state.googleAuth.profile?.email || "owner",
    createdAt: nowStamp(), updatedAt: nowStamp(), imageRefs: [], comments: [], roomId: resolveInitialRoomId(pos) || null, linkedRoomId: null
  };
  state.nodes.push(node); persist(); render();
  logAudit("Node Placed From Batch", { nodeId: node.id, details: g.room });
  for (const rec of g.records) { try { await fileInboxToNode(rec.driveFileId, node.id); } catch (e) { console.warn("batch file failed", e); } }
  render();
  toast(`Placed ${g.room}`);
}

function renderSortTrayModal(m) {
  const proj = state.projects.find((p) => p.id === m.projectId);
  if (!proj) { state.modal = null; return ""; }
  const recs = trayRecords(proj.id);
  const nodes = state.nodes.filter((n) => n.projectId === proj.id && n.type !== "portal");
  const labelled = recs.filter((r) => (r.room || r.location));
  const nodeOptions = nodes.map((n) => `<option value="${n.id}">${escapeHtml(nodeDisplayTitle(n))}</option>`).join("");
  return `
    <div class="modal-backdrop" data-tray-close></div>
    <section class="nd-tray" role="dialog" aria-modal="true" aria-label="To be sorted">
      <div class="nd-tray-head">
        <div><h3>To be sorted \u00b7 ${escapeHtml(proj.name)}</h3><p>${recs.length} photo${recs.length === 1 ? "" : "s"} waiting</p></div>
        <div class="button-row">
          ${labelled.length ? `<button class="ghost-button" data-tray-autoall="${proj.id}">Auto-create nodes for ${labelled.length} labelled</button>` : ""}
          <button class="icon-button" data-tray-close aria-label="Close">${icon("close")}</button>
        </div>
      </div>
      <div class="nd-tray-grid">
        ${recs.length ? recs.map((r) => `
          <div class="nd-tray-card">
            ${(r.thumbnailLink || r.driveFileId) ? `<img ${r.driveFileId ? `data-fileid="${escapeHtml(r.driveFileId)}"` : ""} src="${escapeHtml(r.thumbnailLink || "")}" alt="" loading="lazy" />` : `<div class="nd-tray-noimg">${icon("map")}</div>`}
            <div class="nd-tray-meta">
              <strong title="${escapeHtml(r.name)}">${escapeHtml(r.name)}</strong>
              ${(r.room || r.location) ? `<span class="mini-chip">${escapeHtml(r.room || r.location)}</span>` : ""}
            </div>
            ${(r.room || r.location) ? `<button class="ghost-button nd-tray-btn" data-tray-autonode="${escapeHtml(r.driveFileId)}">${icon("plus")}Auto-create "${escapeHtml(r.room || r.location)}"</button>` : ""}
            <div class="nd-tray-sortrow">
              <select data-tray-select="${escapeHtml(r.driveFileId)}" aria-label="Choose node"><option value="">Choose node\u2026</option>${nodeOptions}</select>
              <button class="primary-button nd-tray-btn" data-tray-sort="${escapeHtml(r.driveFileId)}">Sort</button>
            </div>
            <button class="ghost-button nd-tray-btn" data-tray-dismiss="${escapeHtml(r.driveFileId)}">Back to batch</button>
          </div>`).join("") : `<div class="empty-state" style="padding:28px;text-align:center">All sorted \u2705</div>`}
      </div>
    </section>`;
}

/* §2.1.3 — tidy stack: {x:50,y:8}, +6% x, wrap past 80% to the next row. */
function nextAutoNodePosition(floorId) {
  const i = state.nodes.filter((n) => n.floorId === floorId && n.autoPlaced).length;
  const col = i % 6, row = Math.floor(i / 6);
  return { x: 50 + col * 6, y: 8 + row * 6 };
}

async function fileInboxToNode(driveFileId, nodeId) {
  const api = getPlannerInboxApi();
  const rec = _inboxRecords.find((r) => r.driveFileId === driveFileId);
  const node = state.nodes.find((n) => n.id === nodeId);
  if (!api || !rec || !node) { toast("Pick a node first"); return; }
  try {
    const nodeFolderId = await ensureNodeDriveFolder(node);
    if (nodeFolderId) {
      const projFolderId = state.drive.projectFolderMap[node.projectId] || "";
      await moveDriveFileToFolder(rec.driveFileId, nodeFolderId, projFolderId);
    }
    node.imageRefs = node.imageRefs || [];
    if (!node.imageRefs.some((img) => img.driveFileId === rec.driveFileId)) {
      node.imageRefs.push({
        id: rec.photoId || rec.driveFileId, driveFileId: rec.driveFileId, name: rec.name,
        webViewLink: rec.webViewLink, thumbnailLink: rec.thumbnailLink, mimeType: rec.mimeType,
        uploader: rec.uploader || "", uploadedAt: rec.uploadedAt || nowStamp()
      });
    }
    const updated = await api.setStatus(rec, NDInbox.STATUS.FILED_TO_NODE, { projectId: node.projectId, nodeId: node.id, floorId: node.floorId });
    Object.assign(rec, updated);
    persist();   // delta sync writes the Photos/Nodes rows
    logAudit("Photo Sorted", { nodeId: node.id, details: rec.name });
    render();
  } catch (e) { toast("Sort failed: " + describeError(e)); }
}

async function autoCreateNodeFromRecord(driveFileId) {
  const rec = _inboxRecords.find((r) => r.driveFileId === driveFileId);
  if (!rec) return;
  const proj = state.projects.find((p) => p.id === rec.projectId);
  const floorId = rec.floorId || proj?.floors?.[0]?.id;
  if (!proj || !floorId) { toast("No floor to place the node on"); return; }
  const label = rec.room || rec.location;
  const node = {
    id: uid("node"), projectId: proj.id, floorId, type: "marker",
    customTitle: label, category: "", lineItem: "", status: "Not Started",
    assignedTo: "", tags: [], description: `Auto-created from photo "${rec.name}"`,
    position: nextAutoNodePosition(floorId), autoPlaced: true,
    createdBy: state.googleAuth.profile?.name || state.googleAuth.profile?.email || "owner",
    createdAt: nowStamp(), updatedAt: nowStamp(), imageRefs: [], comments: [],
    roomId: null, linkedRoomId: null
  };
  state.nodes.push(node);
  persist();
  logAudit("Node Auto-Created", { nodeId: node.id, details: label });
  await fileInboxToNode(driveFileId, node.id);
}

async function dismissInboxToBatch(driveFileId) {
  const api = getPlannerInboxApi();
  const rec = _inboxRecords.find((r) => r.driveFileId === driveFileId);
  if (!api || !rec) return;
  try {
    const batchId = await ensureBatchFolderId();
    const projFolderId = state.drive.projectFolderMap[rec.projectId] || "";
    if (batchId) await moveDriveFileToFolder(rec.driveFileId, batchId, projFolderId);
    const updated = await api.setStatus(rec, NDInbox.STATUS.UNFILED);   // clears project fields
    Object.assign(rec, updated);
    toast("Sent back to batch");
    render();
  } catch (e) { toast("Dismiss failed: " + describeError(e)); }
}
