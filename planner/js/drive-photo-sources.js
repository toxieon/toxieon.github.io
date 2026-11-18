/* Linked Drive photo sources: list folders recursively, group by level/apt,
 * drag onto the plan to create nodes (reference only — no Drive copy). */

const PROJECTS_PHOTO_SOURCES_COL = "Photo Source Folder IDs";
const PHOTO_SOURCE_MIME_PREFIX = "image/";
const PHOTO_SOURCE_DRAG_TYPE = "application/x-np-drive-photo";
const PHOTO_THUMB_CACHE_PREFIX = "np-photo-thumb:";
const PHOTO_SOURCE_LONG_PRESS_MS = 420;

let photoPanelDragState = null;

function parseDriveFolderIdFromPaste(text) {
  const t = String(text || "").trim();
  if (!t) return "";
  const fromUrl = t.match(/\/folders\/([a-zA-Z0-9_-]+)/) || t.match(/[?&]id=([a-zA-Z0-9_-]+)/);
  if (fromUrl) return fromUrl[1];
  if (/^[a-zA-Z0-9_-]{10,}$/.test(t)) return t;
  return "";
}

function parsePhotoSourceFolderIdsField(raw) {
  return String(raw || "")
    .split(/[,;\n]+/)
    .map((part) => parseDriveFolderIdFromPaste(part) || part.trim())
    .filter((id) => id && /^[a-zA-Z0-9_-]+$/.test(id));
}

function formatPhotoSourceFolderIdsField(ids) {
  return (ids || []).filter(Boolean).join(", ");
}

function normalizeLevelFolderName(name) {
  const n = String(name || "").trim();
  const m = n.match(/^level\s+(.+)$/i);
  return m ? m[1].trim() : n;
}

function isLevelFolderName(name) {
  return /^level\s+/i.test(String(name || "").trim());
}

function apartmentLabelFromFolderName(name) {
  const n = String(name || "").trim();
  if (!n) return "";
  if (isLevelFolderName(n)) return "";
  return n;
}

function inferLevelAndAptFromPath(pathNames) {
  const names = (pathNames || []).map((x) => String(x || "").trim()).filter(Boolean);
  let level = "";
  let apt = "";
  for (let i = 0; i < names.length; i++) {
    if (isLevelFolderName(names[i])) {
      level = normalizeLevelFolderName(names[i]);
      if (names[i + 1]) apt = apartmentLabelFromFolderName(names[i + 1]);
      else apt = "";
      break;
    }
  }
  if (!level && names.length >= 2) {
    level = names[0];
    apt = names[1];
  } else if (!apt && names.length) {
    apt = apartmentLabelFromFolderName(names[names.length - 1]);
  }
  return { level: level || "Other", apt: apt || "Unsorted" };
}

async function fetchProjectsColumnIndex() {
  const fallbackTabs = () => {
    const colMap = {};
    MASTER_TABS.Projects.forEach((h, i) => { colMap[h] = i; });
    return { colMap, sheetHeaders: new Set(MASTER_TABS.Projects) };
  };
  if (!state.drive.masterSheetId || !isTokenValid()) return fallbackTabs();
  try {
    const r = await googleCall(() => gapi.client.sheets.spreadsheets.values.get({
      spreadsheetId: state.drive.masterSheetId,
      range: "Projects!1:1"
    }));
    const headerRow = (r.result.values && r.result.values[0]) || [];
    const colMap = {};
    const sheetHeaders = new Set();
    headerRow.forEach((h, i) => {
      const name = String(h || "").trim();
      if (!name) return;
      colMap[name] = i;
      sheetHeaders.add(name);
    });
    MASTER_TABS.Projects.forEach((h, i) => { if (colMap[h] === undefined) colMap[h] = i; });
    return { colMap, sheetHeaders };
  } catch (e) {
    return fallbackTabs();
  }
}

function projectRowValue(row, colMap, header, fallbackIndex) {
  const i = colMap[header];
  if (i !== undefined && row[i] !== undefined) return row[i];
  if (fallbackIndex !== undefined) return row[fallbackIndex];
  return "";
}

function photoSourcesFresh() {
  if (!state.photoSources) state.photoSources = { loading: false, error: "", groups: [], refreshedAt: null };
  return state.photoSources;
}

function demoPhotoSourceGroups() {
  const mk = (id, name, level, apt) => ({
    id, name, mimeType: "image/jpeg",
    thumbnailLink: driveThumb(id, 220),
    webViewLink: `https://drive.google.com/file/d/${id}/view`,
    modifiedTime: "2026-11-01T10:00:00.000Z",
    folderLevel: level,
    folderApt: apt,
    pathNames: [level, apt]
  });
  return [
    {
      level: "B",
      apartments: [{
        apt: "B.11A",
        files: [mk("demo-b-11a-1", "Kitchen-GPO.jpg", "Level B", "B.11A"), mk("demo-b-11a-2", "Entry-data.jpg", "Level B", "B.11A")]
      }]
    },
    {
      level: "1",
      apartments: [{
        apt: "1.01",
        files: [mk("demo-1-01-1", "Comms-rack.jpg", "Level 1", "1.01")]
      }, {
        apt: "1.02",
        files: [mk("demo-1-02-1", "MDF-patch.jpg", "Level 1", "1.02")]
      }]
    }
  ];
}

function photoPanelUsesDemo() {
  if (typeof location !== "undefined" && /(?:\?|&)demoPhotoPanel=1/.test(location.search || "")) return true;
  try { return localStorage.getItem("np-demo-photo-panel") === "1"; } catch (e) { return false; }
}

async function listDriveFolderChildren(folderId, pageToken) {
  const q = `'${folderId}' in parents and trashed=false`;
  const response = await googleCall(() => gapi.client.drive.files.list({
    q,
    pageSize: 200,
    pageToken: pageToken || "",
  orderBy: "folder,name",
    fields: "nextPageToken,files(id,name,mimeType,thumbnailLink,webViewLink,modifiedTime,imageMediaMetadata,createdTime)"
  }));
  return response.result || {};
}

async function walkPhotoSourceFolder(folderId, pathNames, out) {
  let pageToken = "";
  do {
    const batch = await listDriveFolderChildren(folderId, pageToken);
    const files = batch.files || [];
    for (const f of files) {
      const mime = f.mimeType || "";
      if (mime === "application/vnd.google-apps.folder") {
        await walkPhotoSourceFolder(f.id, pathNames.concat(f.name || ""), out);
      } else if (mime.startsWith(PHOTO_SOURCE_MIME_PREFIX)) {
        const hints = inferLevelAndAptFromPath(pathNames.concat());
        out.push({
          id: f.id,
          name: f.name || "Photo",
          mimeType: mime,
          thumbnailLink: f.thumbnailLink || "",
          webViewLink: f.webViewLink || "",
          modifiedTime: f.modifiedTime || f.createdTime || "",
          imageMediaMetadata: f.imageMediaMetadata || null,
          folderLevel: hints.level,
          folderApt: hints.apt,
          pathNames: pathNames.slice()
        });
      }
    }
    pageToken = batch.nextPageToken || "";
  } while (pageToken);
}

function buildPhotoSourceGroups(files) {
  const byLevel = new Map();
  (files || []).forEach((file) => {
    const level = file.folderLevel || "Other";
    const apt = file.folderApt || "Unsorted";
    if (!byLevel.has(level)) byLevel.set(level, new Map());
    const aptMap = byLevel.get(level);
    if (!aptMap.has(apt)) aptMap.set(apt, []);
    aptMap.get(apt).push(file);
  });
  const levelSort = (a, b) => {
    const na = Number(a), nb = Number(b);
    if (!Number.isNaN(na) && !Number.isNaN(nb)) return na - nb;
    return String(a).localeCompare(String(b), undefined, { numeric: true });
  };
  return [...byLevel.keys()].sort(levelSort).map((level) => ({
    level,
    apartments: [...byLevel.get(level).keys()].sort((a, b) => String(a).localeCompare(String(b), undefined, { numeric: true }))
      .map((apt) => ({
        apt,
        files: byLevel.get(level).get(apt).sort((x, y) => String(x.name).localeCompare(String(y.name)))
      }))
  }));
}

async function cachePhotoThumbnail(fileId, thumbnailLink) {
  const url = thumbnailLink || driveThumb(fileId, 220);
  if (!fileId || !window.NDCache) return url;
  const key = PHOTO_THUMB_CACHE_PREFIX + fileId;
  try {
    const hit = await NDCache.get(key);
    if (hit) return hit;
    await NDCache.put(key, url, null);
  } catch (e) {
    console.warn("thumb cache", fileId, e);
  }
  return url;
}

async function refreshProjectPhotoSources(opts = {}) {
  const proj = project();
  const panel = photoSourcesFresh();
  if (!proj) {
    panel.groups = [];
    panel.error = "";
    panel.refreshedAt = null;
    return render();
  }
  if (photoPanelUsesDemo()) {
    panel.loading = false;
    panel.error = "";
    panel.groups = demoPhotoSourceGroups();
    panel.refreshedAt = Date.now();
    render();
    return;
  }
  const ids = Array.isArray(proj.photoSourceFolderIds) ? proj.photoSourceFolderIds.filter(Boolean) : [];
  if (!ids.length) {
    panel.loading = false;
    panel.groups = [];
    panel.error = "";
    panel.refreshedAt = null;
    render();
    return;
  }
  if (!isTokenValid()) {
    panel.error = "Sign in to load linked photo folders.";
    panel.loading = false;
    render();
    return;
  }
  panel.loading = true;
  panel.error = "";
  render();
  try {
    const collected = [];
    for (const rootId of ids) {
      await walkPhotoSourceFolder(rootId, [], collected);
    }
    for (const file of collected) {
      file.cachedThumb = await cachePhotoThumbnail(file.id, file.thumbnailLink);
    }
    panel.groups = buildPhotoSourceGroups(collected);
    panel.refreshedAt = Date.now();
    panel.error = "";
  } catch (e) {
    console.warn("Photo source refresh failed", e);
    panel.error = describeError(e);
  } finally {
    panel.loading = false;
    render();
  }
}

function photoSourceDragPayload(file) {
  return JSON.stringify({
    driveFileId: file.id,
    name: file.name,
    mimeType: file.mimeType || "image/jpeg",
    thumbnailLink: file.thumbnailLink || "",
    webViewLink: file.webViewLink || "",
    modifiedTime: file.modifiedTime || "",
    folderLevel: file.folderLevel || "",
    folderApt: file.folderApt || ""
  });
}

function parsePhotoSourceDragPayload(raw) {
  if (!raw) return null;
  try {
    const data = JSON.parse(raw);
    if (data && data.driveFileId) return data;
  } catch (e) {}
  return null;
}

function attachDrivePhotoToNode(node, photo) {
  if (!node || !photo?.driveFileId) return false;
  node.imageRefs = node.imageRefs || [];
  if (node.imageRefs.some((img) => (img.driveFileId || img.id) === photo.driveFileId)) return false;
  node.imageRefs.push({
    id: photo.driveFileId,
    driveFileId: photo.driveFileId,
    name: photo.name || "Photo",
    webViewLink: photo.webViewLink || "",
    thumbnailLink: photo.thumbnailLink || driveThumb(photo.driveFileId, 400),
    mimeType: photo.mimeType || "image/jpeg",
    uploader: state.googleAuth.profile?.email || "",
    uploadedAt: photo.modifiedTime || nowStamp(),
    photoDate: photo.modifiedTime || "",
    sourceFolderApt: photo.folderApt || ""
  });
  node.updatedAt = nowStamp();
  return true;
}

function floorIdMatchingPhotoLevel(proj, levelHint) {
  const hint = String(levelHint || "").trim().toLowerCase();
  if (!proj || !hint) return null;
  const floors = proj.floors || [];
  const exact = floors.find((f) => String(f.name || "").trim().toLowerCase() === `level ${hint}` || String(f.name).trim().toLowerCase() === hint);
  if (exact) return exact.id;
  const partial = floors.find((f) => String(f.name || "").toLowerCase().includes(hint));
  return partial ? partial.id : null;
}

async function placePhotoSourceOnPlan(photo, position) {
  const proj = project();
  const floor = currentFloor();
  if (!proj || !floor || !photo) return;
  const roomId = resolveInitialRoomId(position) || null;
  const room = roomId ? roomById(roomId) : null;
  let title = photo.folderApt || "Site photo";
  let description = "";
  if (room && photo.folderApt && room.name && room.name !== photo.folderApt) {
    description = `Folder apt hint: ${photo.folderApt}`;
    title = room.name;
  } else if (room) {
    title = room.name;
  }
  const matchedFloorId = floorIdMatchingPhotoLevel(proj, photo.folderLevel) || floor.id;
  if (matchedFloorId !== state.selectedFloorId) state.selectedFloorId = matchedFloorId;
  const node = {
    id: uid("node"),
    projectId: proj.id,
    floorId: matchedFloorId,
    type: "marker",
    category: categoryNames()[0] || "",
    lineItem: "",
    customTitle: title,
    status: "Not Started",
    assignedTo: "",
    tags: photo.folderApt ? [`apt:${photo.folderApt}`] : [],
    description,
    position,
    size: 1,
    roomId,
    linkedRoomId: null,
    createdBy: state.googleAuth.profile?.name || state.googleAuth.profile?.email || "local",
    createdAt: nowStamp(),
    updatedAt: nowStamp(),
    imageRefs: [],
    comments: []
  };
  attachDrivePhotoToNode(node, photo);
  state.nodes.push(node);
  state.selectedNodeId = node.id;
  state.drawerOpen = true;
  persist();
  render();
  logAudit("Node Created", { nodeId: node.id, details: `From Drive photo ${photo.name || photo.driveFileId}` });
  if (isTokenValid()) ensureNodeDriveFolder(node).catch((e) => console.warn(e));
  toast(room ? `Photo node in ${roomName(room.id)}` : `Photo node (${title})`);
}

function bindPhotoSourcePanel() {
  document.querySelectorAll("[data-photo-source-refresh]").forEach((btn) => {
    btn.addEventListener("click", () => refreshProjectPhotoSources({ manual: true }));
  });
  document.querySelectorAll(".photo-source-tile").forEach((tile) => {
    tile.addEventListener("dragstart", (e) => {
      const payload = tile.dataset.photoPayload;
      if (!payload || !e.dataTransfer) return;
      e.dataTransfer.setData(PHOTO_SOURCE_DRAG_TYPE, payload);
      e.dataTransfer.setData("text/plain", payload);
      e.dataTransfer.effectAllowed = "copy";
    });
    let pressTimer = null;
    let pointerId = null;
    let startX = 0;
    let startY = 0;
    const clearPress = () => { clearTimeout(pressTimer); pressTimer = null; };
    tile.addEventListener("pointerdown", (e) => {
      if (e.pointerType === "mouse" && e.button !== 0) return;
      pointerId = e.pointerId;
      startX = e.clientX;
      startY = e.clientY;
      clearPress();
      pressTimer = setTimeout(() => {
        const payload = tile.dataset.photoPayload;
        const parsed = parsePhotoSourceDragPayload(payload);
        if (!parsed) return;
        photoPanelDragState = {
          pointerId,
          payload: parsed,
          startX,
          startY,
          ghost: null,
          active: true
        };
        tile.classList.add("is-dragging");
        try { tile.setPointerCapture(pointerId); } catch (err) {}
      }, PHOTO_SOURCE_LONG_PRESS_MS);
    });
    tile.addEventListener("pointermove", (e) => {
      if (e.pointerId !== pointerId) return;
      if (!photoPanelDragState?.active) {
        if (Math.hypot(e.clientX - startX, e.clientY - startY) > 12) clearPress();
        return;
      }
      e.preventDefault();
      if (!photoPanelDragState.ghost) {
        const ghost = document.createElement("h4");
        ghost.className = "photo-drag-ghost";
        ghost.textContent = photoPanelDragState.payload.name || "Photo";
        document.body.appendChild(ghost);
        photoPanelDragState.ghost = ghost;
      }
      photoPanelDragState.ghost.style.transform = `translate(${e.clientX + 8}px, ${e.clientY + 8}px)`;
    });
    const endPointer = async (e) => {
      if (e.pointerId !== pointerId) return;
      clearPress();
      const drag = photoPanelDragState;
      if (drag?.active && drag.pointerId === e.pointerId) {
        photoPanelDragState = null;
        tile.classList.remove("is-dragging");
        if (drag.ghost) drag.ghost.remove();
        const viewport = document.getElementById("canvasViewport");
        const plan = document.querySelector(".floor-plan");
        if (viewport && plan) {
          const rect = plan.getBoundingClientRect();
          const inside = e.clientX >= rect.left && e.clientX <= rect.right && e.clientY >= rect.top && e.clientY <= rect.bottom;
          if (inside) {
            const pos = {
              x: Number(Math.max(0, Math.min(100, ((e.clientX - rect.left) / rect.width) * 100)).toFixed(1)),
              y: Number(Math.max(0, Math.min(100, ((e.clientY - rect.top) / rect.height) * 100)).toFixed(1))
            };
            await placePhotoSourceOnPlan(drag.payload, pos);
          }
        }
      }
      pointerId = null;
    };
    tile.addEventListener("pointerup", endPointer);
    tile.addEventListener("pointercancel", endPointer);
  });
}

function renderPhotoSourcesPanel(proj) {
  const panel = photoSourcesFresh();
  const ids = proj?.photoSourceFolderIds || [];
  const header = `
    <div class="photo-source-head">
      <h3 class="section-title">Drive photos</h3>
      <button type="button" class="icon-button" data-photo-source-refresh title="Refresh from Drive">${icon("refresh")}</button>
    </div>
    <p class="summary-hint">Live listing from linked folders. Drag onto the plan (long-press on touch).</p>`;
  if (!ids.length) {
    return `${header}<div class="empty-state">No photo source folders linked. Add them in Settings → Edit project.</div>`;
  }
  if (panel.loading) return `${header}<p class="summary-hint">Loading photos…</p>`;
  if (panel.error) return `${header}<p class="summary-hint" role="alert">${escapeHtml(panel.error)}</p>`;
  if (!panel.groups?.length) {
    return `${header}<div class="empty-state">No images found in linked folders yet.</div>`;
  }
  const body = panel.groups.map((lvl) => `
    <details class="photo-source-level" open>
      <summary>Level ${escapeHtml(lvl.level)}</summary>
      ${lvl.apartments.map((apt) => `
        <div class="photo-source-apt">
          <div class="photo-source-apt-title">${escapeHtml(apt.apt)}</div>
          <div class="photo-source-grid">
            ${apt.files.map((file) => {
              const payload = escapeHtml(photoSourceDragPayload(file));
              const thumb = file.cachedThumb || file.thumbnailLink || driveThumb(file.id, 220);
              return `<button type="button" class="photo-source-tile" draggable="true" data-photo-payload="${payload}" aria-label="${escapeHtml(file.name)}">
                <img src="${escapeHtml(thumb)}" alt="" loading="lazy" referrerpolicy="no-referrer" draggable="false" />
                <span>${escapeHtml(file.name)}</span>
              </button>`;
            }).join("")}
          </div>
        </div>
      `).join("")}
    </details>
  `).join("");
  const stamp = panel.refreshedAt ? `<p class="summary-hint">Updated ${escapeHtml(sydneyFromStored(new Date(panel.refreshedAt).toISOString()))}</p>` : "";
  return `${header}${body}${stamp}`;
}