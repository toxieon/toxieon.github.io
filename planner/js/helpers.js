/* ============================================================ HELPERS */

function uid(prefix) { return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`; }
function icon(name) { return `<svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round">${iconPaths[name] || ""}</svg>`; }
/* Drive's own thumbnail endpoint — far more reliable than the cached
 * lh3.googleusercontent.com thumbnailLink, which goes stale and shows blank. */
function driveThumb(id, size) { return id ? `https://drive.google.com/thumbnail?id=${encodeURIComponent(id)}&sz=w${size || 400}` : ""; }
function escapeHtml(value) { return NDUI.escapeHtml(value); }  // shared/nd-ui.js
function statusStyle(status) { return `--status:${statusMeta[status]?.color || "#2563eb"}`; }
function statusPill(status) { return `<span class="status-pill" style="${statusStyle(status)}">${escapeHtml(status)}</span>`; }
function initials(name) { if (!name) return "?"; return name.trim().split(/\s+/).map((p) => p[0]).join("").slice(0, 2).toUpperCase(); }
/* Local (device time zone) YYYY-MM-DD. toISOString() is UTC and gives yesterday before 10am in Sydney. */
function localDateStr(d = new Date()) { return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; }
/* Cover "Generated" stamp in Sydney time with a short zone label, e.g. "6 Oct 2026, 10:34 am AEDT" (AEST in winter).
 * Fixed to Australia/Sydney (not the device zone or UTC). nowStamp() stays UTC because it writes stored timestamps. */
const SYDNEY_MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
function sydneyStamp(d = new Date()) {
  try {
    const p = Object.fromEntries(new Intl.DateTimeFormat("en-AU", { timeZone: "Australia/Sydney", year: "numeric", month: "numeric", day: "numeric", hour: "numeric", minute: "2-digit", hour12: true, timeZoneName: "short" }).formatToParts(d).map((x) => [x.type, x.value]));
    return `${Number(p.day)} ${SYDNEY_MONTHS[Number(p.month) - 1] || p.month} ${p.year}, ${Number(p.hour)}:${p.minute} ${String(p.dayPeriod || "").toLowerCase()} ${p.timeZoneName || ""}`.replace(/\s+/g, " ").trim();
  } catch (_) {
    return `${nowStamp()} UTC`;
  }
}
/* Display only: a stored UTC stamp (nowStamp() "YYYY-MM-DD HH:MM", or ISO with Z/offset) shown in Sydney
 * time, e.g. "6 Oct 2026, 10:42 am AEDT". Stored values never change; anything unparseable is shown as-is. */
function sydneyFromStored(value) {
  const raw = String(value ?? "").trim();
  if (!raw) return "";
  const m = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2})(?:\.\d+)?)?(Z|[+-]\d{2}:?\d{2})?$/.exec(raw);
  if (!m) return raw;
  const d = m[7] ? new Date(raw.replace(" ", "T")) : new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +(m[6] || 0)));
  return Number.isNaN(d.getTime()) ? raw : sydneyStamp(d);
}
function parseBool(value) { return /^(true|yes|y|1|protected)$/i.test(String(value || "").trim()); }
function detectDevice() { return /Mobi|Android|iPhone/i.test(navigator.userAgent) ? "Mobile" : "Desktop"; }
function isPhoneLayout() {
  return window.matchMedia?.("(max-width: 820px)")?.matches || detectDevice() === "Mobile";
}
function project() { return state.projects.find((p) => p.id === state.selectedProjectId) || state.projects[0] || null; }
function projectById(id) { return state.projects.find((p) => p.id === id) || null; }
function projectFolder(item = project()) { if (!item || !item.folderId) return null; return state.projectFolders.find((f) => f.id === item.folderId) || null; }

/* ── Project colour + completed status (main-page redesign) ──────────────
 * Colour lives on the project now (p.color), falling back to its folder's
 * colour so existing jobs keep the colour they had. Completed is auto-derived
 * (every node done + photographed) with a manual override (p.completed). */
const PROJECT_COLORS = ["#e07b2a", "#3ab87a", "#5b9ce6", "#e5484d", "#a855f7", "#e3b341", "#14b8a6", "#94a3b8"];
function projectColor(p) { return (p && p.color) || projectFolder(p)?.color || "#94a3b8"; }
function projectAutoComplete(p) { const s = stats(state.nodes.filter((n) => n.projectId === p.id)); return s.total > 0 && s.completePercent === 100 && s.missingPhotos === 0; }
function isProjectComplete(p) { return typeof p.completed === "boolean" ? p.completed : projectAutoComplete(p); }
function partitionProjects(list) {
  const q = (state.projectsQuery || "").trim();
  let items = q && window.NDMatch ? NDMatch.fuzzyFilter(q, list, projectSearchTexts) : list.slice();
  const inProgress = items.filter((p) => !isProjectComplete(p)).sort((a, b) => (b.lastOpenedAt || 0) - (a.lastOpenedAt || 0) || String(a.name).localeCompare(String(b.name)));
  const completed = items.filter((p) => isProjectComplete(p)).sort((a, b) => String(a.name).localeCompare(String(b.name)));
  return { inProgress, completed };
}

function folderProjects(folderId = state.selectedFolderId) {
  if (folderId === "all") return state.projects;
  if (folderId === "unfiled") return state.projects.filter((p) => !p.folderId);
  return state.projects.filter((p) => p.folderId === folderId);
}
function currentFloor() {
  const p = project(); if (!p) return null;
  return p.floors.find((f) => f.id === state.selectedFloorId) || p.floors[0] || null;
}
function floorById(projectItem, floorId) { return projectItem?.floors?.find((f) => f.id === floorId) || null; }
function projectNodes(projectId = state.selectedProjectId) { if (!projectId) return []; return state.nodes.filter((n) => n.projectId === projectId); }
function floorNodes(floorId = state.selectedFloorId) { if (!floorId) return []; return state.nodes.filter((n) => n.floorId === floorId); }
function selectedNode() { return state.nodes.find((n) => n.id === state.selectedNodeId) || null; }
function teamNames() {
  const p = project();
  const names = new Set();
  (p?.team || []).forEach((u) => { if (u.name) names.add(u.name); });
  (state.users || []).forEach((u) => { if (u.displayName) names.add(u.displayName); if (u.email) names.add(u.email); });
  state.nodes.forEach((node) => {
    (node.imageRefs || []).forEach((image) => {
      const uploader = image.uploader || image.uploadedBy || "";
      if (uploader) names.add(uploader);
    });
  });
  return [...names].sort((a, b) => a.localeCompare(b));
}
function roomById(id) { return state.rooms.find((r) => r.id === id) || null; }
function floorRooms(floorId = state.selectedFloorId) { if (!floorId) return []; return state.rooms.filter((r) => r.floorId === floorId).sort((a, b) => (a.order || 0) - (b.order || 0) || a.name.localeCompare(b.name)); }
function roomName(roomId) { return roomById(roomId)?.name || ""; }
function roomLabel(roomId) { return roomName(roomId) || "No room"; }
function selectedRoomNodes(nodes) { return state.selectedRoomId && state.selectedRoomId !== "all" ? nodes.filter((n) => (n.roomId || "") === state.selectedRoomId) : nodes; }

function parseRoomShape(raw) {
  if (!raw) return null;
  let obj = raw;
  if (typeof raw === "string") {
    const s = raw.trim();
    if (!s) return null;
    try { obj = JSON.parse(s); } catch (e) { return null; }
  }
  if (!obj || obj.type !== "poly" || !Array.isArray(obj.pts) || obj.pts.length < 3) return null;
  const pts = obj.pts.map((p) => {
    if (!Array.isArray(p) || p.length < 2) return null;
    const x = Number(p[0]), y = Number(p[1]);
    if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
    return [Math.max(0, Math.min(100, x)), Math.max(0, Math.min(100, y))];
  }).filter(Boolean);
  if (pts.length < 3) return null;
  const opacity = (value, fallback) => Number.isFinite(Number(value)) && value != null ? Math.max(0, Math.min(1, Number(value))) : fallback;
  const appearance = { borderOpacity: opacity(obj.appearance?.borderOpacity, .85), fillOpacity: opacity(obj.appearance?.fillOpacity, .18) };
  return { type: "poly", pts, ...(obj.appearance ? { appearance } : {}) };
}
function serializeRoomShape(shape) {
  const parsed = parseRoomShape(shape);
  if (!parsed) return "";
  const original = typeof shape === "string" ? JSON.parse(shape) : shape;
  return JSON.stringify({ type: "poly", pts: parsed.pts.map(([x, y]) => [Number(x.toFixed(4)), Number(y.toFixed(4))]), ...(original.appearance ? { appearance: parsed.appearance } : {}) });
}
function pointInPolygon(x, y, pts) {
  if (!pts || pts.length < 3) return false;
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const xi = pts[i][0], yi = pts[i][1];
    const xj = pts[j][0], yj = pts[j][1];
    const intersect = ((yi > y) !== (yj > y)) && (x < ((xj - xi) * (y - yi)) / ((yj - yi) || 1e-12) + xi);
    if (intersect) inside = !inside;
  }
  return inside;
}
function polygonArea(pts) {
  if (!pts || pts.length < 3) return 0;
  let a = 0;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) a += pts[j][0] * pts[i][1] - pts[i][0] * pts[j][1];
  return Math.abs(a) / 2;
}
function polygonCentroid(pts) {
  if (!pts || !pts.length) return { x: 50, y: 50 };
  let cx = 0, cy = 0;
  pts.forEach(([x, y]) => { cx += x; cy += y; });
  return { x: cx / pts.length, y: cy / pts.length };
}
function roomAtPlanPoint(x, y, floorId = state.selectedFloorId) {
  const candidates = floorRooms(floorId).map((r) => {
    const shape = parseRoomShape(r.shape);
    if (!shape) return null;
    if (!pointInPolygon(x, y, shape.pts)) return null;
    return { room: r, area: polygonArea(shape.pts) };
  }).filter(Boolean);
  if (!candidates.length) return null;
  candidates.sort((a, b) => a.area - b.area);
  return candidates[0].room;
}
function resolveInitialRoomId(position) {
  if (position && Number.isFinite(position.x) && Number.isFinite(position.y)) {
    const hit = roomAtPlanPoint(position.x, position.y);
    if (hit) return hit.id;
  }
  if (state.selectedRoomId && state.selectedRoomId !== "all") return state.selectedRoomId;
  return "";
}
function clearRoomDraw() {
  state.roomDraw = { mode: null, points: [], roomId: null };
}
/* 0.17.1 Draw room from a title pin: the pin's linkedRoomId points at a normal room
 * (state.rooms, Rooms sheet); nodes keep using roomId. */
function titlePinForRoom(roomId) { return roomId ? state.nodes.find((n) => n.type === "title" && n.linkedRoomId === roomId) || null : null; }
// Re-resolve roomId for this floor's nodes that are inside the room or were assigned to it.
function reassignRoomNodes(room) {
  let changed = 0;
  state.nodes.filter((n) => n.floorId === room.floorId && n.position).forEach((n) => {
    const hit = roomAtPlanPoint(Number(n.position.x), Number(n.position.y), room.floorId);
    const next = hit ? hit.id : null;
    if ((n.roomId === room.id || next === room.id) && (n.roomId || null) !== next) { n.roomId = next; n.updatedAt = nowStamp(); changed++; }
  });
  return changed;
}
function startTitleRoomDraw(edit) {
  const pin = selectedNode(); if (!pin || pin.type !== "title") return;
  const proj = project(); if (proj && !proj.showRooms) proj.showRooms = true;
  const room = edit ? roomById(pin.linkedRoomId) : null;
  state.drawerOpen = false;
  startRoomDraw("poly", room ? room.id : null);
  state.roomDraw.titleNodeId = pin.id;
  state.roomDraw.editHandles = Boolean(room);
  if (room) toast("Drag the corner handles, then Done");
  render();
}

function dismissModal() {
  state.modal = null;
  // P0-1: close-modal / Escape must not wipe in-progress room geometry.
  // Keep pendingShape and restore draw mode so Done reopens the name modal; only
  // clearRoomDraw (Cancel/Discard) or successful save clears it.
  if (state.roomDraw?.pendingShape) {
    const existing = (state.roomDraw.points || []).map((p) => [...p]);
    const fromShape = (parseRoomShape(state.roomDraw.pendingShape)?.pts || []).map((p) => [...p]);
    state.roomDraw = {
      mode: "poly",
      points: existing.length ? existing : fromShape,
      roomId: null,
      pendingShape: state.roomDraw.pendingShape
    };
  }
}
function startRoomDraw(mode, roomId = null) {
  const fl = currentFloor();
  if (!fl || !(state.floorPlans[fl.id] || fl.planDriveFileId)) { toast("Upload a plan first"); return; }
  if (state.massMode.active) stopMassMode();
  state.roomDraw = { mode, points: [], roomId: roomId || null };
  if (roomId) {
    const shape = parseRoomShape(roomById(roomId)?.shape);
    if (shape) state.roomDraw.points = shape.pts.map((p) => [...p]);
  }
  state.modal = null;
  render();
  toast(mode === "rect" ? "Tap two corners of the rectangle" : "Tap vertices on the plan, then Done");
}
function roomDrawGeometry(points, closed = true) {
  if (state.ui.roomSnap === false || !window.NDRoomGeometry) return { points, snappedEdges: 0 };
  const rect = document.querySelector(".floor-plan")?.getBoundingClientRect();
  const neighbours = floorRooms().filter(r => r.id !== state.roomDraw?.roomId).map(r => parseRoomShape(r.shape)?.pts).filter(Boolean);
  return NDRoomGeometry.snapPath(points, neighbours, { width: rect?.width || 0, height: rect?.height || 0, tolerance: 14, closed });
}
function roomAppearance(room) {
  const base = parseRoomShape(room?.shape)?.appearance || { borderOpacity: .85, fillOpacity: .18 };
  const multiplier = Math.max(0, Math.min(1, Number(state.ui.roomOpacity ?? 1)));
  return { ...base, border: base.borderOpacity * multiplier, fill: base.fillOpacity * multiplier };
}
function roomOverlayStyle(room) { const style = roomAppearance(room); return "--room-border:" + style.border + ";--room-fill:" + style.fill; }
function openRoomExport() {
  const pin = selectedNode(), room = roomById(pin?.linkedRoomId), floor = currentFloor(), proj = project();
  if (!room || !parseRoomShape(room.shape) || !floor || !window.NDPlannerRoomExport) { toast("Draw a room outline before exporting"); return; }
  const candidates = floorRooms(floor.id).filter(r => parseRoomShape(r.shape)).map(r => {
    const shape = parseRoomShape(r.shape), labelPin = titlePinForRoom(r.id), opacity = roomAppearance(r);
    return { id: r.id, name: r.name, points: shape.pts, border: opacity.border, fill: opacity.fill, labelPoint: labelPin?.position ? [labelPin.position.x,labelPin.position.y] : null };
  });
  return NDPlannerRoomExport.open({
    rooms: candidates, selectedRoomId: room.id, title: `${proj?.name || "Neill Planner"} · ${floor.name}`,
    filename: `${proj?.name || "Neill"}-${floor.name}-rooms`,
    nodes: floorNodes(floor.id).filter(n => n.type !== "title" && n.position).map(n => ({ x: n.position.x, y: n.position.y, label: nodeShorthand(n) || nodeDisplayTitle(n).slice(0,4), color: nodeColor(n), size: n.size || 1 })),
    loadImage: async () => {
      try { const pdf = await planPdfSource(floor); if (pdf) return await pdfFirstPageToPng(pdf); } catch (e) { console.warn("Using the cached plan for room export",e); }
      if (state.floorPlans[floor.id]?.startsWith("data:image/")) return state.floorPlans[floor.id];
      for (const id of [floor.planDriveFileId,floor.planPngFileId].filter(Boolean)) {
        try { const source = await fetchDriveFileAsDataUrl(id); if (source?.startsWith("data:application/pdf")) return await pdfFirstPageToPng(source); if (source?.startsWith("data:image/")) return source; } catch (e) { console.warn("Room export plan load",e); }
      }
      throw new Error("Reload this floor's plan from Drive, then try again.");
    },
    loadPdf: async () => { if (!window.jspdf?.jsPDF) await loadScriptOnce(DRIVE_PDF_JSPDF_SRC); if (!window.jspdf?.jsPDF) throw new Error("PDF library unavailable"); return window.jspdf.jsPDF; }
  });
}

async function floorPlanImageForAnalysis(floor) {
  if (state.floorPlans[floor.id]?.startsWith("data:image/")) return state.floorPlans[floor.id];
  try {
    const pdf = await planPdfSource(floor);
    if (pdf) return await pdfFirstPageToPng(pdf);
  } catch (e) { console.warn("Auto rooms plan PDF", e); }
  for (const id of [floor.planDriveFileId, floor.planPngFileId].filter(Boolean)) {
    try {
      const source = await fetchDriveFileAsDataUrl(id);
      if (source?.startsWith("data:application/pdf")) return await pdfFirstPageToPng(source);
      if (source?.startsWith("data:image/")) return source;
    } catch (e) { console.warn("Auto rooms Drive fetch", e); }
  }
  throw new Error("Plan image unavailable");
}

/* Detection reads a 720px canvas (NDPlannerRoomAuto maxDim). A fresh decode is capped
 * at 2000px on the long side first so getImageData never sees a 6000×4000 buffer.
 * The on-screen plan image is reused when it is already decoded — OpenSeadragon's
 * full-size copy is not decoded again. */
const PLAN_ANALYSIS_MAX = 2000;
const _releasedPlanBitmaps = new WeakSet();
let _pausePlanViewer = false;
function planDetectMaxDim() {
  return (window.NDPlannerRoomAuto && NDPlannerRoomAuto.DEFAULTS && NDPlannerRoomAuto.DEFAULTS.maxDim) || 720;
}
function releaseCanvas(canvas) {
  if (!canvas) return;
  canvas.width = 0;
  canvas.height = 0;
}
function releasePlanBitmap(bitmap) {
  if (!bitmap || _releasedPlanBitmaps.has(bitmap)) return;
  if (typeof HTMLImageElement !== "undefined" && bitmap instanceof HTMLImageElement && bitmap.isConnected) return;
  _releasedPlanBitmaps.add(bitmap);
  try {
    if (typeof bitmap.close === "function") bitmap.close();
    else if (typeof HTMLCanvasElement !== "undefined" && bitmap instanceof HTMLCanvasElement) releaseCanvas(bitmap);
    else if ("src" in bitmap) bitmap.src = "";
  } catch (e) {}
}
function livePlanImage(floor) {
  const img = document.querySelector("#planStage img.floor-plan");
  if (!img || !img.complete) return null;
  if (!(img.naturalWidth || img.width) || !(img.naturalHeight || img.height)) return null;
  const src = state.floorPlans[floor.id];
  if (!src) return null;
  if (img.currentSrc === src || img.src === src || img.getAttribute("src") === src) return img;
  return null;
}
async function capPlanBitmap(source, maxEdge) {
  const sw = source.naturalWidth || source.width, sh = source.naturalHeight || source.height;
  const long = Math.max(sw || 0, sh || 0);
  if (!long || long <= maxEdge) return source;
  const scale = maxEdge / long;
  const width = Math.max(1, Math.round(sw * scale)), height = Math.max(1, Math.round(sh * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  canvas.getContext("2d").drawImage(source, 0, 0, width, height);
  if (source !== canvas) releasePlanBitmap(source);
  if (typeof createImageBitmap !== "function") return canvas;
  try {
    const capped = await createImageBitmap(canvas);
    releaseCanvas(canvas);
    return capped;
  } catch (e) {
    return canvas;
  }
}
async function decodePlanBitmap(src) {
  if (typeof createImageBitmap === "function") {
    try {
      const blob = await (await fetch(src)).blob();
      return capPlanBitmap(await createImageBitmap(blob), PLAN_ANALYSIS_MAX);
    } catch (e) { console.warn("Plan bitmap decode", e); }
  }
  const img = new Image();
  await new Promise((resolve, reject) => { img.onload = resolve; img.onerror = () => reject(new Error("Plan image failed to decode")); img.src = src; });
  return capPlanBitmap(img, PLAN_ANALYSIS_MAX);
}
function pixelsForDetection(source) {
  const sw = source.naturalWidth || source.width;
  const sh = source.naturalHeight || source.height;
  if (!sw || !sh) throw new Error("Plan image has no size");
  const maxDim = planDetectMaxDim();
  const scale = Math.min(1, maxDim / Math.max(sw, sh));
  const width = scale >= 1 ? sw : Math.max(8, Math.round(sw * scale));
  const height = scale >= 1 ? sh : Math.max(8, Math.round(sh * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  try {
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(source, 0, 0, width, height);
    return { data: ctx.getImageData(0, 0, width, height).data, width, height };
  } finally {
    releaseCanvas(canvas);
  }
}
async function loadPlanImageData(floor) {
  const live = livePlanImage(floor);
  const bitmap = live || await decodePlanBitmap(await floorPlanImageForAnalysis(floor));
  try {
    return { ...pixelsForDetection(bitmap), bitmap, owned: bitmap !== live };
  } catch (e) {
    if (bitmap !== live) releasePlanBitmap(bitmap);
    throw e;
  }
}

/* Whole-page OCR finds nothing on most floor plans: Tesseract's layout pass reads
 * the wall lines as a picture and drops the labels. So each detected room is
 * cropped just inside its walls and read on its own, one worker for all rooms. */
function drawPlanOcrCrop(canvas, img, room) {
  const W = img.naturalWidth || img.width, H = img.naturalHeight || img.height;
  const pts = room?.points || [];
  if (pts.length < 3 || !W || !H) return null;
  const xs = pts.map((p) => (Array.isArray(p) ? p[0] : p.x)), ys = pts.map((p) => (Array.isArray(p) ? p[1] : p.y));
  let x0 = Math.min(...xs) / 100 * W, x1 = Math.max(...xs) / 100 * W, y0 = Math.min(...ys) / 100 * H, y1 = Math.max(...ys) / 100 * H;
  const ix = (x1 - x0) * 0.08, iy = (y1 - y0) * 0.08;
  x0 += ix; x1 -= ix; y0 += iy; y1 -= iy;
  const w = Math.round(x1 - x0), h = Math.round(y1 - y0);
  if (w < 12 || h < 12) return null;
  const scale = Math.min(3, Math.max(1, 240 / Math.min(w, h)));
  const dw = Math.round(w * scale), dh = Math.round(h * scale);
  if (canvas.width !== dw) canvas.width = dw;
  if (canvas.height !== dh) canvas.height = dh;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, dw, dh);
  ctx.drawImage(img, x0, y0, w, h, 0, 0, dw, dh);
  return { x0, y0, scale, W, H };
}

async function runPlanOcr(bitmap, rooms) {
  let worker = null;
  let cancel = false;
  const canvas = document.createElement("canvas");
  const stopWorker = () => { if (worker) { const w = worker; worker = null; w.terminate().catch(() => {}); } };
  const work = (async () => {
    try {
      if (typeof navigator !== "undefined" && navigator.onLine === false) throw new Error("offline");
      if (!window.Tesseract) await loadScriptOnce(PLANNER_TESSERACT_SRC, PLANNER_TESSERACT_SRI);
      if (!window.Tesseract) throw new Error("OCR library unavailable");
      if (cancel) throw new Error("OCR timed out");
      worker = await Tesseract.createWorker("eng", 1, Object.assign({ logger: () => {} }, PLANNER_TESSERACT_PATHS));
      if (cancel) throw new Error("OCR timed out");
      await worker.setParameters({ tessedit_pageseg_mode: "6" });
      const words = [];
      for (const room of (rooms || []).slice(0, 40)) {
        if (cancel) break;
        const crop = drawPlanOcrCrop(canvas, bitmap, room);
        if (!crop) continue;
        const { data } = await worker.recognize(canvas);
        (data.words || []).forEach((w) => {
          const b = w.bbox || {};
          words.push({
            text: w.text,
            x: ((crop.x0 + (b.x0 + b.x1) / 2 / crop.scale) / crop.W) * 100,
            y: ((crop.y0 + (b.y0 + b.y1) / 2 / crop.scale) / crop.H) * 100,
            confidence: w.confidence
          });
        });
      }
      return words;
    } finally {
      releaseCanvas(canvas);
      releasePlanBitmap(bitmap);
      stopWorker();
    }
  })();
  let timer;
  const timeout = new Promise((_, reject) => { timer = setTimeout(() => reject(new Error("OCR timed out")), PLANNER_OCR_TIMEOUT_MS); });
  try {
    const words = await Promise.race([work, timeout]);
    return words.filter((w) => w.text && Number.isFinite(w.x) && (w.confidence ?? 0) >= 35);
  } finally {
    clearTimeout(timer);
    cancel = true;
    stopWorker();
  }
}

/* Only the Auto rooms button reaches this. Opening or uploading a plan must not. */
async function startAutoRooms() {
  const floor = currentFloor();
  const proj = project();
  if (!floor || !proj) return;
  if (!window.NDPlannerRoomAuto) { toast("Auto rooms module missing"); return; }
  if (!(state.floorPlans[floor.id] || floor.planDriveFileId)) { toast("Upload a plan first"); return; }
  if (state.roomDraw?.mode) clearRoomDraw();
  _pausePlanViewer = true;
  dropHiresCanvas();
  releasePlanPdfDoc();
  destroyOsd();
  state.modal = { mode: "auto-rooms", loading: true, candidates: [], useOcr: true, floorId: floor.id };
  render();
  let bitmap = null;
  let ownsBitmap = false;
  try {
    const loaded = await loadPlanImageData(floor);
    bitmap = loaded.bitmap;
    ownsBitmap = loaded.owned;
    const useOcr = state.modal?.useOcr !== false;
    if (!useOcr && ownsBitmap) { releasePlanBitmap(bitmap); bitmap = null; ownsBitmap = false; }
    const existing = floorRooms(floor.id).map((r) => parseRoomShape(r.shape)?.pts).filter(Boolean);
    const detected = NDPlannerRoomAuto.detectRoomsFromRgba(loaded.data, loaded.width, loaded.height, { existingPolygons: existing });
    loaded.data = null;
    let candidates = detected.rooms.map((r, i) => ({
      ...r,
      name: r.name || NDPlannerRoomAuto.defaultRoomName(i),
      selected: true
    }));
    let ocrNote = "OCR off.";
    if (useOcr && bitmap) {
      const mine = bitmap;
      ownsBitmap = false;
      try {
        const words = await runPlanOcr(mine, candidates);
        candidates = NDPlannerRoomAuto.assignOcrLabels(candidates, words);
        const named = candidates.filter((c) => c.name && !/^Room \d+$/i.test(c.name)).length;
        ocrNote = named ? `OCR applied ${named} label(s). Check spelling before saving.` : "OCR did not find reliable room numbers — edit names below.";
      } catch (e) {
        console.warn("Plan OCR", e);
        ocrNote = e && e.message === "offline" ? "OCR needs a connection — edit names below." : "OCR skipped (network or library). Edit names manually.";
      }
    }
    state.modal = {
      mode: "auto-rooms",
      loading: false,
      candidates,
      ocrNote,
      floorId: floor.id,
      meta: detected.meta,
      useOcr
    };
    if (!candidates.length) toast("No closed rooms detected — try a clearer scan or draw rooms manually.");
  } catch (e) {
    console.warn("Auto rooms", e);
    state.modal = null;
    toast("Could not analyse this plan. Reload the plan or upload PNG/PDF.");
  } finally {
    if (ownsBitmap) releasePlanBitmap(bitmap);
    _pausePlanViewer = false;
    render();
  }
}

function renderAutoRoomPreview(candidates) {
  const polys = (candidates || []).filter((c) => c.selected !== false).map((c) => {
    const pts = (c.points || []).map(([x, y]) => `${x},${y}`).join(" ");
    const cx = c.centroid?.[0] ?? 50;
    const cy = c.centroid?.[1] ?? 50;
    return `<g class="room-poly is-auto-preview"><polygon points="${pts}"></polygon><text x="${cx}" y="${cy}" text-anchor="middle" dominant-baseline="middle">${escapeHtml(c.name || "?")}</text></g>`;
  }).join("");
  if (!polys) return "";
  return `<svg class="room-overlay room-overlay--auto-preview" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">${polys}</svg>`;
}

function renderAutoRoomsModal() {
  const m = state.modal;
  if (m.loading) {
    return `<div class="modal-backdrop"></div><div class="modal auto-rooms-modal" role="dialog" aria-busy="true"><div class="modal-header"><div><h3>Auto rooms</h3><p>Analysing floor plan…</p></div></div><div class="modal-body">${renderLoadingOverlay("Detecting walls and spaces")}</div></div>`;
  }
  const count = (m.candidates || []).filter((c) => c.selected !== false).length;
  const rows = (m.candidates || []).map((c, i) => `
    <div class="auto-room-row">
      <label class="auto-room-check"><input type="checkbox" data-auto-room-idx="${i}" ${c.selected !== false ? "checked" : ""}><span>Include</span></label>
      <input type="text" class="auto-room-name" data-auto-room-name="${i}" value="${escapeHtml(c.name || "")}" placeholder="Room name" aria-label="Room ${i + 1} name" />
      <span class="auto-room-area" title="Relative size on plan">${Math.round(c.areaPlan || 0)}</span>
    </div>`).join("");
  return `<div class="modal-backdrop" data-action="auto-rooms-cancel"></div><form class="modal auto-rooms-modal" id="autoRoomsForm" role="dialog">
    <div class="modal-header"><div><h3>Auto rooms preview</h3><p>${escapeHtml(currentFloor()?.name || "")} · ${count} selected · ${escapeHtml(m.ocrNote || "")}</p></div><button type="button" class="icon-button" data-action="auto-rooms-cancel">${icon("close")}</button></div>
    <div class="modal-body auto-rooms-body">
      <p class="summary-hint">Review detected outlines on the plan. Uncheck false positives, fix names, then Add rooms. Accuracy varies with scan quality, open doors and furniture.</p>
      <label class="ps-toggle"><input type="checkbox" name="useOcr" ${m.useOcr !== false ? "checked" : ""} data-auto-rooms-ocr><span>Read room numbers from plan (OCR, first run downloads ~2&nbsp;MB)</span></label>
      ${rows || `<div class="empty-state">No rooms detected on this plan.</div>`}
    </div>
    <div class="modal-actions"><button type="button" class="ghost-button" data-action="auto-rooms-cancel">Cancel</button><button type="submit" class="primary-button" ${count ? "" : "disabled"}>${icon("check")}Add ${count || ""} room${count === 1 ? "" : "s"}</button></div>
  </form>`;
}

function syncAutoRoomsModalFromDom() {
  const m = state.modal;
  if (!m || m.mode !== "auto-rooms" || !m.candidates) return;
  m.candidates.forEach((c, i) => {
    const chk = document.querySelector(`[data-auto-room-idx="${i}"]`);
    const name = document.querySelector(`[data-auto-room-name="${i}"]`);
    if (chk) c.selected = chk.checked;
    if (name) c.name = name.value.trim();
  });
  const ocr = document.querySelector("[data-auto-rooms-ocr]");
  if (ocr) m.useOcr = ocr.checked;
}

function commitAutoRooms(event) {
  event?.preventDefault();
  const m = state.modal;
  if (!m || m.mode !== "auto-rooms") return;
  syncAutoRoomsModalFromDom();
  const floor = currentFloor();
  const proj = project();
  if (!floor || !proj) return;
  const picked = (m.candidates || []).filter((c) => c.selected !== false && c.points?.length >= 3);
  if (!picked.length) { toast("Select at least one detected room"); return; }
  const createdRooms = [];
  const createdPins = [];
  let order = floorRooms(floor.id).reduce((mx, r) => Math.max(mx, r.order || 0), -1) + 1;
  const author = state.googleAuth.profile?.name || state.googleAuth.profile?.email || "local";
  picked.forEach((c, idx) => {
    const name = (c.name || NDPlannerRoomAuto.defaultRoomName(idx)).trim() || NDPlannerRoomAuto.defaultRoomName(idx);
    const room = {
      id: uid("room"), projectId: proj.id, floorId: floor.id, name, order: order++,
      shape: { type: "poly", pts: c.points.map((p) => [...p]) },
      createdAt: nowStamp(), updatedAt: nowStamp()
    };
    state.rooms.push(room);
    createdRooms.push(room);
    const [x, y] = c.centroid || [50, 50];
    const pin = {
      id: uid("node"), projectId: proj.id, floorId: floor.id, type: "title",
      category: "", lineItem: "", customTitle: name, status: "Complete",
      roomId: room.id, linkedRoomId: room.id, assignedTo: "", tags: [], description: "",
      position: { x: Number(x), y: Number(y) }, size: 1,
      createdBy: author, createdAt: nowStamp(), updatedAt: nowStamp(), imageRefs: [], comments: []
    };
    state.nodes.push(pin);
    createdPins.push(pin);
    reassignRoomNodes(room);
  });
  if (proj && !proj.showRooms) proj.showRooms = true;
  state.modal = null;
  persist();
  render();
  toast(`Added ${createdRooms.length} room(s) from plan`);
  const roomIds = createdRooms.map((r) => r.id);
  const pinIds = createdPins.map((n) => n.id);
  undoableDelete(`Added ${createdRooms.length} auto-detected room(s)`, {
    undo: () => {
      state.rooms = state.rooms.filter((r) => !roomIds.includes(r.id));
      state.nodes = state.nodes.filter((n) => !pinIds.includes(n.id));
      createdRooms.forEach((room) => {
        state.nodes.forEach((n) => { if (n.roomId === room.id) n.roomId = null; });
      });
    },
    commit: () => {
      createdRooms.forEach((room) => logAudit("Room Created", { projectId: room.projectId, floorId: room.floorId, details: `${room.name} (auto-detect)` }));
    }
  });
}

function finishRoomDraw() {
  const draw = state.roomDraw || {};
  let pts = (draw.points || []).map((p) => [...p]);
  if (draw.mode === "rect" && pts.length === 2) {
    const [a, b] = pts;
    pts = [[a[0], a[1]], [b[0], a[1]], [b[0], b[1]], [a[0], b[1]]];
  }
  if (pts.length < 3) { toast("Need at least 3 points"); return; }
  const snapped = roomDrawGeometry(pts);
  pts = snapped.points;
  if (window.NDRoomGeometry && !NDRoomGeometry.validPolygon(pts)) { toast("Room edges cross or enclose no area. Adjust the corners before saving."); return; }
  const shape = { type: "poly", pts, appearance: parseRoomShape(roomById(draw.roomId)?.shape)?.appearance };
  if (snapped.snappedEdges) toast("Following " + snapped.snappedEdges + " nearby room boundary segment(s)");
  if (draw.roomId) {
    const room = roomById(draw.roomId);
    if (!room) { clearRoomDraw(); render(); return; }
    room.shape = shape;
    room.updatedAt = nowStamp();
    const moved = reassignRoomNodes(room);   // 0.17.1: recompute who's inside after editing corners
    if (moved) setTimeout(() => { toast(`${moved} node(s) re-assigned`); render(); }, 2900);
    clearRoomDraw();
    persist(); render();
    logAudit("Room Shape Updated", { projectId: room.projectId, floorId: room.floorId, details: room.name });
    toast(`Updated shape for ${room.name}`);
    return;
  }
  const pin = draw.titleNodeId ? state.nodes.find((n) => n.id === draw.titleNodeId) : null;
  if (pin) {   // 0.17.1: room named by its title pin, no name prompt
    const order = floorRooms(pin.floorId).reduce((m, r) => Math.max(m, r.order || 0), -1) + 1;
    const room = { id: uid("room"), projectId: pin.projectId, floorId: pin.floorId, name: nodeDisplayTitle(pin), createdAt: nowStamp(), updatedAt: nowStamp(), order, shape };
    state.rooms.push(room);
    pin.linkedRoomId = room.id; pin.updatedAt = nowStamp();
    const n = reassignRoomNodes(room);
    clearRoomDraw();
    persist(); render();
    logAudit("Room Created", { projectId: room.projectId, floorId: room.floorId, details: `${room.name} (from title pin)` });
    toast(`Room "${room.name}" created · ${n} node(s) assigned`);
    return;
  }
  state.roomDraw = { mode: null, points: pts, roomId: null, pendingShape: shape };
  state.modal = { mode: "new-room" };
  render();
}
function handleRoomDrawPoint(pos) {
  if (!pos || !state.roomDraw?.mode) return;
  const draw = state.roomDraw;
  if (draw.editHandles) return;   // editing corners: drag handles instead of adding points
  if (draw.mode === "poly") {
    draw.points.push([pos.x, pos.y]);
    render();
    return;
  }
  if (draw.mode === "rect") {
    draw.points.push([pos.x, pos.y]);
    if (draw.points.length >= 2) {
      finishRoomDraw();
      return;
    }
    render();
  }
}


function categoryNames() { return Object.keys(state.categoriesData || {}); }
function categoryColor(name) { return state.categoriesData?.[name]?.color || hashColor(name); }
function categoryItems(name) { return state.categoriesData?.[name]?.items || []; }
function nodeColor(node) {
  if (!node || !node.category) return "#64748b";
  const tab = state.categoriesData?.[node.category];
  if (!tab) return hashColor(node.category);
  if (node.lineItem) {
    const it = tab.items?.find((i) => i.item === node.lineItem);
    if (it?.color) return it.color;
  }
  return tab.color || hashColor(node.category);
}
function categoryMatchKey(value) { return String(value || '').trim().replace(/\s+/g, ' ').toLocaleLowerCase('en-AU'); }
function nodeShorthand(node) {
  if (!node?.category || !node.lineItem) return '';
  const categories = state.categoriesData || {};
  let tab = categories[node.category];
  if (!tab) {
    const matches = Object.keys(categories).filter(k => categoryMatchKey(k) === categoryMatchKey(node.category));
    if (matches.length !== 1) return ''; // Never guess between ambiguous categories.
    tab = categories[matches[0]];
  }
  let item = tab.items?.find(i => i.item === node.lineItem);
  if (!item) {
    const matches = (tab.items || []).filter(i => categoryMatchKey(i.item) === categoryMatchKey(node.lineItem));
    if (matches.length !== 1) return '';
    item = matches[0];
  }
  return String(item.shorthand || '').trim().slice(0,4);
}
function categorySheetRange(tab, cells) { return "'" + String(tab).replace(/'/g, "''") + "'!" + cells; }
function autoSuggestName(lineItem, floorId = state.selectedFloorId) {
  if (!lineItem || !floorId) return lineItem || "";
  const escaped = lineItem.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = new RegExp(`^${escaped}(?:\\s+(\\d+))?$`, "i");
  const used = state.nodes
    .filter((n) => n.floorId === floorId && n.lineItem === lineItem)
    .map((n) => {
      const match = (n.customTitle || n.title || "").trim().match(pattern);
      return match ? Number(match[1] || 1) : 0;
    });
  const next = Math.max(0, ...used) + 1;
  return `${lineItem} ${next}`;
}
function hashColor(str) { if (!str) return "#64748b"; let h = 0; for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) >>> 0; return `hsl(${h % 360},60%,55%)`; }
function rgbColorToHex(color) {
  if (!color) return "";
  const toByte = (v) => Math.max(0, Math.min(255, Math.round((v ?? 0) * 255)));
  return `#${[toByte(color.red), toByte(color.green), toByte(color.blue)].map((v) => v.toString(16).padStart(2, "0")).join("")}`;
}
function nodeDisplayTitle(node) { if (!node) return ""; if (node.customTitle && node.customTitle.trim()) return node.customTitle; if (node.lineItem) return node.lineItem; return node.title || "(untitled)"; }
function isPrimaryOwner() { return state.googleAuth.profile?.email?.toLowerCase() === PRIMARY_OWNER_EMAIL; }
function isAdmin() { return isPrimaryOwner(); }
function requirePlannerDrive(label = "upload files") {
  if (state.drive.rootFolderId) return true;
  toast(`Connect to ${PRIMARY_OWNER_EMAIL}'s NeillPlanner folder before you ${label}.`);
  return false;
}

function stats(nodes) {
  const list = (nodes || projectNodes()).filter((n) => n.type !== "title");   // 0.16.1: room title pins aren't work items
  const total = list.length;
  const complete = list.filter((n) => n.status === "Complete").length;
  const progress = list.filter((n) => n.status === "In Progress").length;
  const issue = list.filter((n) => n.status === "Issue").length;
  const missingPhotos = list.filter(nodeMissingPhoto).length;
  return { total, complete, progress, issue, missingPhotos, notStarted: list.length - complete - progress - issue, completePercent: total ? Math.round((complete / total) * 100) : 0 };
}
function folderStats(folderId) {
  const projects = folderProjects(folderId);
  const ids = projects.map((p) => p.id);
  const nodes = state.nodes.filter((n) => ids.includes(n.projectId));
  const s = stats(nodes);
  return { projects: projects.length, nodes: nodes.length, completePercent: s.completePercent, issues: s.issue };
}
function matchesNode(node) {
  const f = state.filters;
  const q = f.query.trim().toLowerCase();
  const title = nodeDisplayTitle(node);
  const inQuery = !q || [title, node.category, node.status, node.assignedTo, node.description, ...(node.tags || [])].join(" ").toLowerCase().includes(q);
  return inQuery && (f.status === "All" || node.status === f.status) && (f.category === "All" || node.category === f.category) && (f.assignee === "All" || node.assignedTo === f.assignee);
}
function navItems() {
  const base = [{id:"projects",label:"Projects",icon:"projects"},{id:"map",label:"Map",icon:"map"},{id:"progress",label:"Progress",icon:"chart"}];
  return base;
}
