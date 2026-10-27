/* =========================================================================
 *  NeillPlanner v0.9.4
 *  Centralised Drive: all files live in primaryOwnerEmail's Drive.
 *  Other users (added via Settings -> Team Access) share the folder.
 *  Login is mandatory.
 *  Multi-floor projects. Drag-to-move. Bulk-select. Print/PDF export.
 *  Categories sheet, audit sheet, portal nodes, mass-create mode, etc.
 *  v0.8.0: Switchboard & Sub-board node types. SWB deep-link integration.
 *  v0.9.0: Room plan overlays, full project report, floor layers, mobile polish.
 *  v0.9.1: Projects master row Updated At column alignment.
 *  v0.9.2: Lean Drive PDF export for Full report / Overview (html2canvas+jsPDF; vendored since 0.18.3).
 * ========================================================================= */

const STORAGE_KEY = "neillplanner-state-v4";
const APP_VERSION = "0.21.5";
const SWB_APP_URL = "https://neilldata.com/swb";

/* Lean Drive PDF export caps (v0.9.2) — keep browser Print for full fidelity. */
const DRIVE_PDF_MAX_PHOTOS_PER_NODE = 3;
const DRIVE_PDF_MAX_IMAGES_TOTAL = 48;
const DRIVE_PDF_MAX_PAGES = 40;
const DRIVE_PDF_MAX_BLOB_BYTES = 18 * 1024 * 1024;
const DRIVE_PDF_EXPORTS_FOLDER = "Exports";
const DRIVE_PDF_HTML2CANVAS_SRC = "../shared/vendor/html2canvas-pro/html2canvas-pro.min.js"; // html2canvas-pro 2.5.0, MIT
const DRIVE_PDF_JSPDF_SRC = "../shared/vendor/jspdf/jspdf.umd.min.js"; // jsPDF 2.5.1, MIT
// Tesseract.js OCR — Apache-2.0, loaded only when Auto rooms runs with OCR on (see vendor/tesseract/LICENSE.txt).
const PLANNER_TESSERACT_SRC = "https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js";
const PLANNER_TESSERACT_SRI = "sha384-GJqSu7vueQ9qN0E9yLPb3Wtpd7OrgK8KmYzC8T1IysG1bcvxvIO4qtYR/D3A991F";
const PLANNER_TESSERACT_PATHS = {
  workerPath: "https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/worker.min.js",
  corePath: "https://cdn.jsdelivr.net/npm/tesseract.js-core@5.1.1",
  langPath: "https://tessdata.projectnaptha.com/4.0.0"
};
const PLANNER_OCR_TIMEOUT_MS = 90000;
let _drivePdfBusy = false;
let _downloadPdf = null;

const statusMeta = {
  "Not Started": { color: "#2563eb", key: "not-started" },
  "In Progress": { color: "#f59e0b", key: "in-progress" },
  Complete: { color: "#22c55e", key: "complete" },
  Issue: { color: "#ef4444", key: "issue" }
};

const DRIVE_ROOT_NAME = "NeillPlanner";
const DRIVE_ADMIN_FOLDER = "Admin Files";
const DRIVE_PROJECTS_FOLDER = "Projects";
const DRIVE_UNFILED_FOLDER = "Unfiled Projects";
const DRIVE_BULK_PHOTOS_FOLDER = "Bulk Photos";
const DRIVE_SORTED_PHOTOS_FOLDER = "Sorted Photos";
const AUDIT_SHEET_NAME = "NeillPlanner-Audit";
const AUDIT_TAB = "Audit";
const AUDIT_HEADER = ["Timestamp","User","Action","Project ID","Project Name","Folder","Floor","Node ID","Node Title","Category","Status","Details","Device"];
const PHOTO_ALLOCATION_SHEET_NAME = "NeillPlanner-Photo-Allocation";
const PHOTO_ALLOCATION_TAB = "Allocations";
const PHOTO_ALLOCATION_HEADER = ["Photo ID", "Drive File ID", "Name", "Status", "Suggested Node ID", "Allocated Node ID", "Allocated Node Name", "Project ID", "Floor ID", "Room ID", "Uploader", "Uploaded At", "Mime Type", "Web View Link", "Thumbnail Link", "Notes"];
const MASTER_PHOTO_IMPORT_INTERVAL_MS = 180000;
const CATEGORIES_SHEET_NAME = "NeillPlanner-Categories";
const DEFAULT_CATEGORY_TABS = [
  { name: "Electrical", color: "#f59e0b" },
  { name: "Data",       color: "#0ea5e9" },
  { name: "AC",         color: "#14b8a6" }
];
const CATEGORIES_HEADER = ["Item", "Code", "Description", "Color", "Shorthand"];
const MASTER_SHEET_NAME = "NeillPlanner-Master";
const MASTER_TABS = {
  Projects: ["Project ID", "Name", "Folder Group", "Address", "Description", "Created By", "Created At", "Updated At", "Drive Folder ID", "Floor Count", "Node Count", "Protected"],
  Floors:   ["Floor ID", "Project ID", "Project Name", "Floor Name", "Order", "Plan Drive File ID", "Drive Folder ID", "Node Count", "Created At", "Plan Aspect Ratio", "Plan PNG File ID"],
  Nodes:    ["Node ID", "Project ID", "Project Name", "Floor ID", "Floor Name", "Type", "Title", "Custom Title", "Category", "Line Item", "Status", "Assigned To", "Tags", "Position X", "Position Y", "Size", "Description", "Image Count", "Comment Count", "Created By", "Created At", "Updated At", "Drive Folder ID", "Linked Project ID", "Linked Floor ID", "Linked Node ID", "Photo IDs", "Room ID", "Room Name", "Linked Room ID", "Circuit", "Cable Run (m)", "Board Label", "Phase Config", "Main Breaker (A)", "SWB Project ID", "SWB Schema Version"],
  Photos:   ["Photo ID", "Drive File ID", "Name", "Node ID", "Node Name", "Floor ID", "Floor Name", "Project ID", "Project Name", "Uploader", "Uploaded At", "Mime Type", "Web View Link", "Thumbnail Link"],
  Folders:  ["Folder ID", "Name", "Color", "Project Count", "Drive Folder ID"],
  Rooms:    ["Room ID", "Project ID", "Floor ID", "Name", "Created At", "Updated At", "Sort Order", "Shape"]
};
const USERS_SHEET_NAME = "NeillPlanner-Users";
const USERS_TAB = "Users";
const USERS_HEADER = ["Email", "Role", "Display Name", "Added At", "Added By"];

const DEFAULT_FOLDER_COLORS = ["#0ea5e9","#14b8a6","#f59e0b","#a855f7","#ef4444","#22c55e","#6366f1"];

const googleConfig = window.NEILL_PLANNER_CONFIG || {};
const hasGoogleApiKey = Boolean(googleConfig.googleApiKey && !googleConfig.googleApiKey.includes("PASTE_"));
const hasGoogleClientId = Boolean(googleConfig.googleClientId && !googleConfig.googleClientId.includes("PASTE_"));
const googleScopes = (googleConfig.scopes || ["https://www.googleapis.com/auth/drive"]).join(" ");
const PRIMARY_OWNER_EMAIL = (googleConfig.primaryOwnerEmail || "").toLowerCase();
const ADDRESS_COUNTRY = googleConfig.addressCountry || "au";
const VICTORIA_ADDRESS_BOUNDS = {
  north: -33.9806,
  south: -39.2247,
  east: 150.067,
  west: 140.9617
};
let plannerPlacesPromise = null;

const iconPaths = {
  projects: '<path d="M3 7.5 12 3l9 4.5-9 4.5L3 7.5Z"/><path d="m3 12 9 4.5L21 12"/><path d="m3 16.5 9 4.5 9-4.5"/>',
  map: '<path d="M9 18 3 21V6l6-3 6 3 6-3v15l-6 3-6-3Z"/><path d="M9 3v15"/><path d="M15 6v15"/>',
  chart: '<path d="M4 19V5"/><path d="M4 19h16"/><path d="M8 15v-4"/><path d="M12 15V8"/><path d="M16 15v-6"/>',
  audit: '<path d="M8 6h13"/><path d="M8 12h13"/><path d="M8 18h13"/><path d="M3 6h.01"/><path d="M3 12h.01"/><path d="M3 18h.01"/>',
  settings: '<path d="M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Z"/><path d="M19.4 15a1.8 1.8 0 0 0 .36 1.98l.04.04a2.1 2.1 0 0 1-2.97 2.97l-.04-.04a1.8 1.8 0 0 0-1.98-.36 1.8 1.8 0 0 0-1.09 1.65V21a2.1 2.1 0 0 1-4.2 0v-.06a1.8 1.8 0 0 0-1.08-1.65 1.8 1.8 0 0 0-1.99.36l-.04.04a2.1 2.1 0 0 1-2.97-2.97l.04-.04A1.8 1.8 0 0 0 4.6 15a1.8 1.8 0 0 0-1.65-1.09H3a2.1 2.1 0 0 1 0-4.2h.06A1.8 1.8 0 0 0 4.7 8.63a1.8 1.8 0 0 0-.36-1.99l-.04-.04a2.1 2.1 0 1 1 2.97-2.97l.04.04A1.8 1.8 0 0 0 9.3 4.04 1.8 1.8 0 0 0 10.38 2.4V2a2.1 2.1 0 0 1 4.2 0v.06a1.8 1.8 0 0 0 1.09 1.65 1.8 1.8 0 0 0 1.98-.36l.04-.04a2.1 2.1 0 1 1 2.97 2.97l-.04.04a1.8 1.8 0 0 0-.36 1.99 1.8 1.8 0 0 0 1.65 1.08H21a2.1 2.1 0 0 1 0 4.2h-.06A1.8 1.8 0 0 0 19.4 15Z"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
  plus: '<path d="M12 5v14"/><path d="M5 12h14"/>',
  upload: '<path d="M12 16V4"/><path d="m7 9 5-5 5 5"/><path d="M20 16v4H4v-4"/>',
  camera: '<path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h3l2-3h8l2 3h3a2 2 0 0 1 2 2Z"/><circle cx="12" cy="13" r="4"/>',
  lock: '<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>',
  unlock: '<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 7.5-2"/>',
  download: '<path d="M12 4v12"/><path d="m17 11-5 5-5-5"/><path d="M20 20H4"/>',
  zoomIn: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/><path d="M11 8v6"/><path d="M8 11h6"/>',
  zoomOut: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/><path d="M8 11h6"/>',
  target: '<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="3"/><path d="M12 2v3"/><path d="M12 19v3"/><path d="M2 12h3"/><path d="M19 12h3"/>',
  close: '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>',
  share: '<path d="M4 12v7a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-7"/><path d="M16 6 12 2 8 6"/><path d="M12 2v14"/>',
  check: '<path d="m20 6-11 11-5-5"/>',
  trash: '<path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="M19 6l-1 15H6L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/>',
  edit: '<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/>',
  folder: '<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z"/>',
  link: '<path d="M10 13a5 5 0 0 0 7.07 0l2.12-2.12a5 5 0 0 0-7.07-7.07L11 4.93"/><path d="M14 11a5 5 0 0 0-7.07 0L4.81 13.1a5 5 0 0 0 7.07 7.07L13 19.07"/>',
  arrowLeft: '<path d="m15 18-6-6 6-6"/>',
  arrowRight: '<path d="m9 18 6-6-6-6"/>',
  google: '<path d="M21.35 11.1H12v3.2h5.35c-.49 2.3-2.43 3.78-5.35 3.78-3.2 0-5.78-2.6-5.78-5.78s2.58-5.78 5.78-5.78c1.46 0 2.77.53 3.78 1.4l2.42-2.4A8.85 8.85 0 0 0 12 3.2a8.8 8.8 0 1 0 0 17.6c5.1 0 8.45-3.55 8.45-8.55 0-.6-.05-1.15-.1-1.15Z"/>',
  refresh: '<path d="M21 12a9 9 0 1 1-3-6.7"/><path d="M21 3v6h-6"/>',
  signOut: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="m16 17 5-5-5-5"/><path d="M21 12H9"/>',
  copy: '<rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>',
  save: '<path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2Z"/><path d="M17 21v-8H7v8"/><path d="M7 3v5h8"/>',
  portal: '<path d="M3 21V8a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4v13"/><path d="M3 21h18"/><path d="M14 12h2"/>',
  mass: '<circle cx="6" cy="6" r="2"/><circle cx="18" cy="6" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="6" cy="18" r="2"/><circle cx="18" cy="18" r="2"/>',
  printer: '<path d="M7 9V3h10v6"/><path d="M7 18H5a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><path d="M7 14h10v7H7Z"/>',
  stairs: '<path d="M3 21V17h4v-4h4v-4h4V5h6"/>',
  layers: '<path d="M12 2 2 7l10 5 10-5-10-5Z"/><path d="m2 17 10 5 10-5"/><path d="m2 12 10 5 10-5"/>',
  question: '<circle cx="12" cy="12" r="9"/><path d="M9.5 9a2.5 2.5 0 1 1 5 0c0 2-2.5 2-2.5 4"/><path d="M12 17h.01"/>',
  switchboard: '<rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8"/><path d="M12 17v4"/><path d="M7 9h2"/><path d="M7 12h2"/><path d="M11 9h6"/><path d="M11 12h6"/>',
  subboard: '<rect x="4" y="5" width="16" height="12" rx="1.5"/><path d="M9 21h6"/><path d="M12 17v4"/><path d="M8 9h2"/><path d="M12 9h4"/><path d="M8 12h2"/><path d="M12 12h4"/>',
  swb: '<polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>'
};

/* ============================================================ STATE */

function freshState() {
  return {
    activeView: "projects",
    selectedProjectId: null,
    selectedFloorId: null,
    selectedRoomId: "all",
    selectedNodeId: null,
    drawerOpen: false, modal: null, lightbox: null, toast: "",
    selectedFolderId: "all",
    filters: { query: "", status: "All", category: "All", assignee: "All" },
    canvas: { zoom: 1, panX: 0, panY: 0 },
    projectFolders: [], projects: [], rooms: [], nodes: [], floorPlans: {}, bulkPhotos: [],
    bulkSelection: [],
    googleAuth: { librariesReady: false, signedIn: false, accessToken: null, expiresAt: null, profile: null, bootstrapped: false, bootstrapping: false, hydrating: false, lastError: null },
    drive: { rootFolderId: null, adminFolderId: null, projectsFolderId: null, unfiledFolderId: null, bulkPhotosFolderId: null, sortedPhotosFolderId: null, auditSheetId: null, categoriesSheetId: null, masterSheetId: null, usersSheetId: null, photoAllocationSheetId: null, projectFolderMap: {}, nodeFolderMap: {}, floorFolderMap: {}, sortedPhotoFolderMap: {} },
    users: [],
    myRole: null,
    categoriesData: {}, categoriesLoadedAt: null,
    teamAccess: { permissions: [], loadedAt: null },
    ui: { nodesCollapsed: null, settingsSections: {}, categoryEditorTab: "", imageRepairRunning: false, rightTab: "nodes" },
    auditQueue: [],
    auditView: { loaded: false, loading: false, rows: [], lastFetchedAt: null,
      filters: { from: "", to: "", user: "All", action: "All", projectId: "All", nodeQuery: "", detailsQuery: "", query: "" } },
    massMode: { active: false, category: null, lineItem: null, status: "Not Started", count: 0 },
    roomDraw: { mode: null, points: [], roomId: null }
  };
}

let state = loadState();
let dragState = null;
let nodeDragState = null;
let canvasPointers = new Map();
let pinchState = null;
let lastPinchEndedAt = 0;
const photoPlacementCache = new Map();

function loadState() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY)) || JSON.parse(localStorage.getItem("neillplanner-state-v3"));
    if (saved && typeof saved === "object") {
      const fresh = freshState();
      const merged = { ...fresh, ...saved, modal: null, lightbox: null, toast: "", massMode: fresh.massMode, bulkSelection: [], roomDraw: fresh.roomDraw };
      merged.googleAuth = { ...fresh.googleAuth, bootstrapped: saved.googleAuth?.bootstrapped || false, profile: saved.googleAuth?.profile || null };
      merged.drive = { ...fresh.drive, ...(saved.drive || {}) };
      merged.auditView = { ...fresh.auditView, filters: { ...fresh.auditView.filters, ...(saved.auditView?.filters || {}) } };
      merged.categoriesData = saved.categoriesData || {};
      merged.categoriesLoadedAt = saved.categoriesLoadedAt || null;
      merged.teamAccess = saved.teamAccess || fresh.teamAccess;
      merged.ui = { ...fresh.ui, ...(saved.ui || {}) };
      merged.users = saved.users || [];
      merged.myRole = saved.myRole || null;
      merged.rooms = Array.isArray(saved.rooms) ? saved.rooms : [];
      merged.bulkPhotos = Array.isArray(saved.bulkPhotos) ? saved.bulkPhotos : [];
      merged.selectedRoomId = saved.selectedRoomId || "all";
      migrateState(merged);
      if (merged.selectedProjectId && !merged.projects.some((p) => p.id === merged.selectedProjectId)) merged.selectedProjectId = merged.projects[0]?.id || null;
      return merged;
    }
  } catch (e) { console.warn("Saved state could not be loaded", e); }
  return freshState();
}

function migrateState(s) {
  if (!Array.isArray(s.rooms)) s.rooms = [];
  if (!Array.isArray(s.bulkPhotos)) s.bulkPhotos = [];
  if (!s.drive.sortedPhotoFolderMap) s.drive.sortedPhotoFolderMap = {};
  // v3 -> v4: convert projects to multi-floor
  s.projects.forEach((p) => {
    if (!p.floors || !Array.isArray(p.floors) || p.floors.length === 0) {
      const floor = {
        id: `flr-${p.id}-1`,
        name: p.planName || "Ground floor",
        order: 0,
        planDriveFileId: p.planDriveFileId || null,
        planMimeType: p.planMimeType || null,
        planWebViewLink: p.planWebViewLink || null,
        planFileName: null,
        planAspectRatio: Number(p.planAspectRatio) || null,
        createdAt: p.createdAt || nowStamp()
      };
      p.floors = [floor];
      // Move floor plan cache to new floor id
      if (s.floorPlans[p.id]) { s.floorPlans[floor.id] = s.floorPlans[p.id]; delete s.floorPlans[p.id]; }
      delete p.planDriveFileId; delete p.planMimeType; delete p.planWebViewLink;
    }
  });
  // Migrate nodes: ensure floorId
  s.nodes.forEach((n) => {
    if (!n.floorId) {
      const proj = s.projects.find((p) => p.id === n.projectId);
      if (proj?.floors?.[0]) n.floorId = proj.floors[0].id;
    }
    if (!("roomId" in n)) n.roomId = null;
    if (!("linkedRoomId" in n)) n.linkedRoomId = null;
  });
  if (s.selectedRoomId && s.selectedRoomId !== "all" && !s.rooms.some((r) => r.id === s.selectedRoomId)) s.selectedRoomId = "all";
  (s.rooms || []).forEach((r) => { if (!("shape" in r)) r.shape = null; });
  if (!s.roomDraw) s.roomDraw = { mode: null, points: [], roomId: null };
}

function persist(opts = {}) {
  const saveable = {
    ...state, modal: null, lightbox: null, toast: "", planUpload: null, titlePlacing: false,
    massMode: { active: false, category: null, lineItem: null, status: "Not Started", count: 0 },
    roomDraw: { mode: null, points: [], roomId: null },
    bulkSelection: [],
    googleAuth: { bootstrapped: state.googleAuth.bootstrapped, profile: state.googleAuth.profile },
    auditView: { ...freshState().auditView, filters: state.auditView.filters },
    floorPlans: {}   // §2.3: plan images live in IndexedDB (nd-cache), not localStorage
  };
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(saveable)); }
  catch (e) { console.warn("Persist failed", e); }
  if (!opts.skipSync) scheduleMasterSync();
}

/* ── §2.3 floor-plan store: IndexedDB via nd-cache ──────────────────────
 * localStorage keeps only the reference (floor.planDriveFileId); the
 * working image (long edge <= 2000px) lives in nd-cache. Drive keeps the
 * full-res original. */
const PLAN_CACHE_PREFIX = "plan:";
const PLAN_MAX_EDGE = 3200;   // higher-res so PDF/plan detail stays legible when zoomed in
/* 0.15.2 sharp PDF zoom state (see updateHiresPlan). */
const MAX_ZOOM = 8;
const HIRES_MAX_SIDE = 4096;
const HIRES_MAX_PIXELS = 16000000;
const PLAN_PDF_CACHE_PREFIX = "planpdf:";
const _planPdfSrc = {};        // floorId -> PDF data URL
const _planPdfStatus = {};     // floorId -> { kind: pdf|png|image|unknown, reason, retryAt? }
const _planPdfLoading = {};    // floorId -> in-flight source promise
let _planPdfDoc = null;        // { floorId, src, promise }
/* 0.17.2 single-image PDF state (see analyzePlanPdf). */
const PLAN_IMAGE_PREFIX = "planimage:";   // 0.18.1: full-size embedded image for OpenSeadragon
const _planKind = {};     // floorId -> { kind: "vector"|"raster"|"mixed", w, h, srcLen }
const _planImage = {};    // floorId -> { url, w, h, rx, ry, rw, rh }
const _planKindLoading = {};
let _osd = null;          // { floorId, viewer, el, aspect, ready }
const _planLinkStatus = {};
let _masterReloading = false;
const _planFetches = {};
const PLAN_PENDING_CACHE_PREFIX = "planpending:";
const _pendingPlanSources = {};
let _hires = null;             // { floorId, key, canvas }
let _hiresTimer = null, _hiresTask = null, _hiresSeq = 0, _hiresInflightKey = null;
let _hiresDebug = null;        // last re-render status for the on-device debug line

function downscaleDataUrl(dataUrl, maxEdge = PLAN_MAX_EDGE) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const long = Math.max(img.naturalWidth, img.naturalHeight);
      if (!long || long <= maxEdge) return resolve(dataUrl);
      const scale = maxEdge / long;
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(img.naturalWidth * scale);
      canvas.height = Math.round(img.naturalHeight * scale);
      canvas.getContext("2d").drawImage(img, 0, 0, canvas.width, canvas.height);
      const url = canvas.toDataURL("image/jpeg", 0.88);
      releaseCanvas(canvas);
      img.src = "";
      resolve(url);
    };
    img.onerror = () => resolve(dataUrl);
    img.src = dataUrl;
  });
}

/* ── PDF floor plans ────────────────────────────────────────────────────
 * <img> can't render a PDF, so we rasterise page 1 to a PNG via pdf.js the
 * moment a plan URL is set (upload, cache hydration, or Drive fetch — all
 * funnel through cacheFloorPlan). The original PDF still lives in Drive. */
// 0.18.3: vendored pdf.js 6.3.289 via shared/nd-pdf.js (no CDN).
function loadPdfJs() {
  if (!window.NDPdf) return Promise.reject(new Error("pdf.js loader (nd-pdf.js) missing"));
  return NDPdf.load();
}
async function pdfFirstPageToPng(dataUrl, maxEdge = PLAN_MAX_EDGE) {
  const pdfjsLib = await loadPdfJs();
  const bytes = Uint8Array.from(atob(dataUrl.split(",")[1]), (c) => c.charCodeAt(0));
  const task = pdfjsLib.getDocument(NDPdf.docOptions({ data: bytes, isOffscreenCanvasSupported: false, isEvalSupported: false }));
  const pdf = await task.promise;
  const page = await pdf.getPage(1);
  const base = page.getViewport({ scale: 1 });
  const scale = Math.max(0.01, Math.min(maxEdge / base.width, maxEdge / base.height));
  const viewport = page.getViewport({ scale });
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(viewport.width);
  canvas.height = Math.round(viewport.height);
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#ffffff"; ctx.fillRect(0, 0, canvas.width, canvas.height);
  try {
    await page.render({ canvasContext: ctx, viewport }).promise;
    return canvas.toDataURL("image/png");
  } finally { releaseCanvas(canvas); try { await task.destroy(); } catch (e) {} }   // pdf.js 6: the loading task owns destroy()
}
async function planDisplayUrl(dataUrl) {
  if (typeof dataUrl !== "string" || !dataUrl.startsWith("data:application/pdf")) return dataUrl;
  try { return await pdfFirstPageToPng(dataUrl); } catch (e) { console.warn("PDF render failed", e); return dataUrl; }
}

async function cacheFloorPlan(floorId, dataUrl, meta) {
  dataUrl = normalizePdfDataUrl(dataUrl);
  rememberPlanPdf(floorId, dataUrl);   // 0.15.2 — keep the vector PDF for sharp zoom re-renders
  dataUrl = await planDisplayUrl(dataUrl);   // PDF → PNG so <img> can show it
  const working = await downscaleDataUrl(dataUrl);
  state.floorPlans[floorId] = working;
  if (window.NDCache) NDCache.put(PLAN_CACHE_PREFIX + floorId, working, meta || null).catch((e) => console.warn("plan cache put failed", e));
  return working;
}

function evictFloorPlan(floorId) {
  delete state.floorPlans[floorId];
  delete _planPdfSrc[floorId]; delete _planPdfStatus[floorId];
  if (_hires && _hires.floorId === floorId) dropHiresCanvas();
  if (window.NDCache) NDCache.remove(PLAN_PDF_CACHE_PREFIX + floorId).catch(() => {});
  if (window.NDCache) NDCache.remove(PLAN_CACHE_PREFIX + floorId).catch(() => {});
}

/* One-time migration + boot hydration: pull any plans a previous version
 * left in localStorage into IndexedDB, then hydrate memory from the cache. */
async function hydrateFloorPlansFromCache() {
  if (!window.NDCache) return;
  const legacy = Object.entries(state.floorPlans || {}).filter(([, v]) => typeof v === "string" && v.startsWith("data:"));
  for (const [floorId, dataUrl] of legacy) {
    try { await cacheFloorPlan(floorId, dataUrl); } catch (e) {}
  }
  if (legacy.length) { persist({ skipSync: true }); console.info(`Migrated ${legacy.length} floor plan(s) from localStorage to IndexedDB`); }
  const floorIds = [];
  state.projects.forEach((p) => (p.floors || []).forEach((f) => floorIds.push(f.id)));
  let hydrated = 0;
  for (const id of floorIds) {
    if (state.floorPlans[id]) continue;
    try {
      const cached = await NDCache.get(PLAN_CACHE_PREFIX + id);
      if (cached) {
        if (typeof cached === "string" && cached.startsWith("data:application/pdf")) { await cacheFloorPlan(id, cached); }
        else { state.floorPlans[id] = cached; }
        hydrated++;
      }
    } catch (e) {}
  }
  if (hydrated) render();
}

/* §2.4 — soft-delete with action-toast undo. Local state is removed
 * immediately (delta sync mirrors it); the IRREVERSIBLE part (Drive trash)
 * is deferred until the undo window expires. Undo restores state and the
 * next delta flush upserts the rows straight back. */
function undoableDelete(message, { undo, commit }) {
  if (window.NDUI) {
    NDUI.toast(message, {
      action: "Undo",
      onAction: () => { try { undo(); persist(); render(); toast("Restored"); } catch (e) { console.warn("undo failed", e); } },
      onExpire: () => { if (commit) Promise.resolve(commit()).catch((e) => console.warn("deferred delete", e)); }
    });
  } else {
    toast(message);
    if (commit) Promise.resolve(commit()).catch((e) => console.warn(e));
  }
}

async function confirmWipeLocal() {
  if (!(await ndConfirm({ title: "Wipe local cache", message: "Wipe all local cache? Files in Drive are not touched, just the browser copy.", confirmLabel: "Wipe", danger: true, typeToConfirm: "WIPE" }))) return;
  localStorage.removeItem(STORAGE_KEY); location.reload();
}

async function ndConfirm(opts) {
  return window.NDUI ? NDUI.confirm(opts) : Promise.resolve(window.confirm(opts.message || opts.title || "Are you sure?"));
}

function nowStamp() { return new Date().toISOString().slice(0, 16).replace("T", " "); }
