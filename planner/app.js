/* =========================================================================
 *  NeillPlanner v0.8.0
 *  Centralised Drive: all files live in primaryOwnerEmail's Drive.
 *  Other users (added via Settings -> Team Access) share the folder.
 *  Login is mandatory.
 *  Multi-floor projects. Drag-to-move. Bulk-select. Print/PDF export.
 *  Categories sheet, audit sheet, portal nodes, mass-create mode, etc.
 *  v0.8.0: Switchboard & Sub-board node types. SWB deep-link integration.
 * ========================================================================= */

const STORAGE_KEY = "neillplanner-state-v4";
const APP_VERSION = "0.8.0";
const SWB_APP_URL = "https://neilldata.com/swb";

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
  Floors:   ["Floor ID", "Project ID", "Project Name", "Floor Name", "Order", "Plan Drive File ID", "Drive Folder ID", "Node Count", "Created At", "Plan Aspect Ratio"],
  Nodes:    ["Node ID", "Project ID", "Project Name", "Floor ID", "Floor Name", "Type", "Title", "Custom Title", "Category", "Line Item", "Status", "Assigned To", "Tags", "Position X", "Position Y", "Size", "Description", "Image Count", "Comment Count", "Created By", "Created At", "Updated At", "Drive Folder ID", "Linked Project ID", "Linked Floor ID", "Linked Node ID", "Photo IDs", "Room ID", "Room Name", "Linked Room ID", "Circuit", "Cable Run (m)", "Board Label", "Phase Config", "Main Breaker (A)", "SWB Project ID", "SWB Schema Version"],
  Photos:   ["Photo ID", "Drive File ID", "Name", "Node ID", "Node Name", "Floor ID", "Floor Name", "Project ID", "Project Name", "Uploader", "Uploaded At", "Mime Type", "Web View Link", "Thumbnail Link"],
  Folders:  ["Folder ID", "Name", "Color", "Project Count", "Drive Folder ID"],
  Rooms:    ["Room ID", "Project ID", "Floor ID", "Name", "Created At", "Updated At", "Sort Order"]
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
    googleAuth: { librariesReady: false, signedIn: false, accessToken: null, expiresAt: null, profile: null, bootstrapped: false, bootstrapping: false, lastError: null },
    drive: { rootFolderId: null, adminFolderId: null, projectsFolderId: null, unfiledFolderId: null, bulkPhotosFolderId: null, sortedPhotosFolderId: null, auditSheetId: null, categoriesSheetId: null, masterSheetId: null, usersSheetId: null, photoAllocationSheetId: null, projectFolderMap: {}, nodeFolderMap: {}, floorFolderMap: {}, sortedPhotoFolderMap: {} },
    users: [],
    myRole: null,
    categoriesData: {}, categoriesLoadedAt: null,
    teamAccess: { permissions: [], loadedAt: null },
    ui: { nodesCollapsed: null, settingsSections: {}, categoryEditorTab: "", imageRepairRunning: false },
    auditQueue: [],
    auditView: { loaded: false, loading: false, rows: [], lastFetchedAt: null,
      filters: { from: "", to: "", user: "All", action: "All", projectId: "All", nodeQuery: "", detailsQuery: "", query: "" } },
    massMode: { active: false, category: null, lineItem: null, status: "Not Started", count: 0 }
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
      const merged = { ...fresh, ...saved, modal: null, lightbox: null, toast: "", massMode: fresh.massMode, bulkSelection: [] };
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
}

function persist(opts = {}) {
  const saveable = {
    ...state, modal: null, lightbox: null, toast: "",
    massMode: { active: false, category: null, lineItem: null, status: "Not Started", count: 0 },
    bulkSelection: [],
    googleAuth: { bootstrapped: state.googleAuth.bootstrapped, profile: state.googleAuth.profile },
    auditView: { ...freshState().auditView, filters: state.auditView.filters }
  };
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(saveable)); }
  catch (e) { console.warn("Persist failed", e); }
  if (!opts.skipSync) scheduleMasterSync();
}

/* ============================================================ HELPERS */

function uid(prefix) { return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`; }
function icon(name) { return `<svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round">${iconPaths[name] || ""}</svg>`; }
function escapeHtml(value) { return String(value ?? "").replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll('"',"&quot;").replaceAll("'","&#039;"); }
function statusStyle(status) { return `--status:${statusMeta[status]?.color || "#2563eb"}`; }
function statusPill(status) { return `<span class="status-pill" style="${statusStyle(status)}">${escapeHtml(status)}</span>`; }
function initials(name) { if (!name) return "?"; return name.trim().split(/\s+/).map((p) => p[0]).join("").slice(0, 2).toUpperCase(); }
function nowStamp() { return new Date().toISOString().slice(0, 16).replace("T", " "); }
function parseBool(value) { return /^(true|yes|y|1|protected)$/i.test(String(value || "").trim()); }
function detectDevice() { return /Mobi|Android|iPhone/i.test(navigator.userAgent) ? "Mobile" : "Desktop"; }
function isPhoneLayout() {
  return window.matchMedia?.("(max-width: 820px)")?.matches || detectDevice() === "Mobile";
}
function project() { return state.projects.find((p) => p.id === state.selectedProjectId) || state.projects[0] || null; }
function projectById(id) { return state.projects.find((p) => p.id === id) || null; }
function projectFolder(item = project()) { if (!item || !item.folderId) return null; return state.projectFolders.find((f) => f.id === item.folderId) || null; }
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
function nodeShorthand(node) {
  if (!node || !node.category) return "";
  const tab = state.categoriesData?.[node.category];
  if (!tab || !node.lineItem) return "";
  const it = tab.items?.find((i) => i.item === node.lineItem);
  return it?.shorthand || "";
}
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
  const list = nodes || projectNodes();
  const total = list.length;
  const complete = list.filter((n) => n.status === "Complete").length;
  const progress = list.filter((n) => n.status === "In Progress").length;
  const issue = list.filter((n) => n.status === "Issue").length;
  return { total, complete, progress, issue, notStarted: list.length - complete - progress - issue, completePercent: total ? Math.round((complete / total) * 100) : 0 };
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

/* ============================================================ GOOGLE AUTH (shared nd-auth) */
let _gapiReady = false, _gisReady = false;

async function bootGoogle() {
  if (!hasGoogleApiKey || !hasGoogleClientId) return;
  const waitFor = (n, t = 12000) => new Promise((r, j) => { const s = Date.now(); const tick = () => { if (window[n]) return r(window[n]); if (Date.now() - s > t) return j(new Error(n + " did not load")); setTimeout(tick, 80); }; tick(); });
  try {
    await waitFor("gapi");
    await new Promise((r, j) => gapi.load("client", { callback: r, onerror: j }));
    await gapi.client.init({ apiKey: googleConfig.googleApiKey });
    await gapi.client.load("https://www.googleapis.com/discovery/v1/apis/drive/v3/rest");
    await gapi.client.load("https://sheets.googleapis.com/$discovery/rest?version=v4");
    _gapiReady = true;
  } catch (e) { state.googleAuth.lastError = "Google API client: " + (e.message || e); render(); return; }
  try {
    await waitFor("google");
    NDAuth.onAuthChange(handleAuthEvent);
    NDAuth.init({ clientId: googleConfig.googleClientId, scopes: googleConfig.scopes || googleScopes.split(" ") });
    _gisReady = true;
  } catch (e) { state.googleAuth.lastError = "GIS: " + (e.message || e); render(); return; }
  state.googleAuth.librariesReady = true;
  // Silent resume: shared suite token from localStorage, else silent GIS renewal.
  // Never pops consent on its own - that only happens from the Sign in button.
  if (!NDAuth.isSignedIn()) {
    state.googleAuth.bootstrapping = true;
    NDAuth.ensureToken().catch(() => { state.googleAuth.bootstrapping = false; render(); });
  }
  render();
}

function handleAuthEvent(ev) {
  if (ev.type === "signin" || ev.type === "refresh" || ev.type === "external") {
    state.googleAuth.accessToken = NDAuth.getToken();
    state.googleAuth.expiresAt = NDAuth.getExpiry();
    state.googleAuth.signedIn = true;
    state.googleAuth.lastError = null;
    if (ev.profile) state.googleAuth.profile = ev.profile;
    if (window.gapi?.client) gapi.client.setToken({ access_token: state.googleAuth.accessToken });
    if (ev.type !== "signin") { render(); return; }   // silent renewals never re-bootstrap
    bootstrapDrive();
  } else if (ev.type === "signout") {
    if (window.gapi?.client) gapi.client.setToken(null);
    stopMasterPhotoImportLoop();
    state.googleAuth = { ...freshState().googleAuth, librariesReady: state.googleAuth.librariesReady };
    state.drive = freshState().drive;
    persist(); render(); toast("Signed out");
  } else if (ev.type === "error") {
    state.googleAuth.lastError = ev.error || "Google sign-in failed";
    state.googleAuth.bootstrapping = false;
    render();
  }
}

function signIn() {
  if (!_gisReady || !window.NDAuth) { toast("Google libraries still loading"); return; }
  state.googleAuth.bootstrapping = true; render();
  NDAuth.ensureToken({ interactive: true }).catch((e) => { state.googleAuth.lastError = e?.message || "Sign-in failed"; state.googleAuth.bootstrapping = false; render(); });
}
function signOut() { NDAuth.signOut(); }
function isTokenValid() { return state.googleAuth.signedIn && state.googleAuth.accessToken && state.googleAuth.expiresAt && Date.now() < state.googleAuth.expiresAt - 30000; }
function requireAuth(label) { if (isTokenValid()) return true; toast(`Sign in to Google first (${label})`); return false; }

/* ============================================================ DRIVE / SHEETS */

async function bootstrapDrive() {
  state.googleAuth.bootstrapping = true; render();
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
    const tasks = [flushAuditQueue(), refreshCategories(), refreshBulkPhotos({ silent: true })];
    if (isPrimaryOwner()) tasks.push(refreshTeamAccess());
    await Promise.all(tasks);
    // Heal any missing project/floor folders silently in background
    syncAllDriveFolders({ silent: true }).catch((e) => console.warn("Background folder sync failed", e));
    await refreshUsers();
    await hydrateFromMasterSheet({ silent: true, preferCloud: true });
    await importMasterPhotos({ silent: true, renderOnChange: false });
    hydrateFromHash();
    maybeFetchPlanForCurrentFloor();
    startMasterPhotoImportLoop();
    syncMasterSheet({ silent: true }).catch((e) => console.warn("Initial master sync failed", e));
    toast(isPrimaryOwner() ? "Connected. Drive ready." : `Connected. Using ${PRIMARY_OWNER_EMAIL}'s NeillPlanner.`);
    render();
  } catch (e) {
    console.error("Bootstrap failed", e);
    state.googleAuth.lastError = "Drive setup failed: " + describeError(e);
    state.googleAuth.bootstrapping = false;
    persist(); render();
  }
}

function describeError(e) { if (!e) return "unknown"; if (e.result?.error?.message) return e.result.error.message; if (e.message) return e.message; return String(e); }
function sleep(ms) { return new Promise((resolve) => window.setTimeout(resolve, ms)); }
function isRetryableGoogleError(e) {
  const status = Number(e?.status || e?.result?.error?.code || 0);
  const message = describeError(e).toLowerCase();
  return status === 429 || status === 500 || status === 502 || status === 503 || status === 504 || (status === 403 && /rate|quota|user.?limit|backend/i.test(message));
}
async function googleCall(fn, attempts = 4) {
  let lastError = null;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try { return await fn(); }
    catch (e) {
      lastError = e;
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

async function findOrCreateChildFolder(name, parentId) {
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
    const r = await gapi.client.drive.files.get({ fileId, fields: "id,trashed" });
    return Boolean(r.result.id && !r.result.trashed);
  } catch (e) {
    return false;
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
  if (!missing.length) return;
  const addReqs = missing.map((tab) => ({ addSheet: { properties: { title: tab } } }));
  const result = await gapi.client.sheets.spreadsheets.batchUpdate({
    spreadsheetId: state.drive.masterSheetId,
    resource: { requests: addReqs }
  });
  const headerWrites = missing.map((tab) => ({ range: `${tab}!A1`, values: [MASTER_TABS[tab]] }));
  await gapi.client.sheets.spreadsheets.values.batchUpdate({
    spreadsheetId: state.drive.masterSheetId,
    resource: { valueInputOption: "RAW", data: headerWrites }
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
  if (!requireAuth("upload bulk photos") || !requirePlannerDrive("upload bulk photos")) return;
  if (!state.drive.bulkPhotosFolderId || !state.drive.photoAllocationSheetId) { toast("Bulk photo folders are not bootstrapped yet"); return; }
  const input = document.createElement("input");
  input.type = "file"; input.accept = "image/*"; input.multiple = true;
  input.onchange = async () => {
    const files = Array.from(input.files || []); if (!files.length) return;
    toast(`Uploading ${files.length} bulk photo${files.length === 1 ? "" : "s"}...`);
    const rows = [];
    for (const file of files) {
      try {
        const uploaded = await uploadFileToDrive(file, state.drive.bulkPhotosFolderId);
        rows.push({
          id: uid("bulk-photo"), driveFileId: uploaded.id, name: uploaded.name, status: "Inbox",
          uploader: state.googleAuth.profile?.name || state.googleAuth.profile?.email || "owner",
          uploadedAt: nowStamp(), mimeType: uploaded.mimeType || file.type || "",
          webViewLink: uploaded.webViewLink || "", thumbnailLink: uploaded.thumbnailLink || "",
          suggestedNodeId: "", allocatedNodeId: "", allocatedNodeName: "", projectId: "", floorId: "", roomId: "", notes: ""
        });
      } catch (e) {
        console.warn("Bulk photo upload failed", file.name, e);
      }
    }
    if (rows.length) {
      state.bulkPhotos = [...rows, ...state.bulkPhotos];
      await appendPhotoAllocationRows(rows);
      persist({ skipSync: true }); render();
      logAudit("Bulk Photos Uploaded", { details: `${rows.length} file(s)` });
      toast(`Uploaded ${rows.length} bulk photo${rows.length === 1 ? "" : "s"}`);
    } else toast("No photos uploaded");
  };
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
  if (!confirm("Remove " + email + " from users sheet?")) return;
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

let _masterPhotoImportTimer = null;
function startMasterPhotoImportLoop() {
  if (_masterPhotoImportTimer) window.clearInterval(_masterPhotoImportTimer);
  _masterPhotoImportTimer = null;
  if (!isTokenValid() || !state.drive.masterSheetId) return;
  _masterPhotoImportTimer = window.setInterval(() => {
    if (document.hidden) return;
    importMasterPhotos({ silent: true }).catch((e) => console.warn("Auto photo import failed", e));
  }, MASTER_PHOTO_IMPORT_INTERVAL_MS);
}

function stopMasterPhotoImportLoop() {
  if (_masterPhotoImportTimer) window.clearInterval(_masterPhotoImportTimer);
  _masterPhotoImportTimer = null;
}

async function hydrateFromMasterSheet(opts = {}) {
  const silent = opts.silent || false;
  if (!isTokenValid() || !state.drive.masterSheetId) return;
  try {
    if (!silent) toast("Loading from cloud...");
    const resp = await googleCall(() => gapi.client.sheets.spreadsheets.values.batchGet({
      spreadsheetId: state.drive.masterSheetId,
      ranges: ["Projects!A2:Z", "Floors!A2:Z", "Nodes!A2:AD", "Photos!A2:Z", "Folders!A2:Z", "Rooms!A2:Z"]
    }));
    const vrs = resp.result.valueRanges || [];
    const projRows = (vrs[0] && vrs[0].values) || [];
    const floorRows = (vrs[1] && vrs[1].values) || [];
    const nodeRows = (vrs[2] && vrs[2].values) || [];
    const photoRows = (vrs[3] && vrs[3].values) || [];
    const folderRows = (vrs[4] && vrs[4].values) || [];
    const roomRows = (vrs[5] && vrs[5].values) || [];
    if (!projRows.length) {
      if (opts.preferCloud) {
        state.projectFolders = [];
        state.projects = [];
        state.rooms = [];
        state.nodes = [];
        state.floorPlans = {};
        state.selectedProjectId = null;
        state.selectedFloorId = null;
        state.selectedRoomId = "all";
        state.selectedNodeId = null;
        state.drawerOpen = false;
        persist({ skipSync: true });
        render();
      }
      if (!silent) toast("No projects in cloud yet");
      return;
    }
    state.drive.projectFolderMap = {};
    state.drive.floorFolderMap = {};
    state.drive.nodeFolderMap = {};
    state.projectFolders = folderRows.map((r) => ({
      id: r[0], name: r[1], color: r[2] || "#0ea5e9", driveFolderId: r[4] || null
    }));
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
    for (const r of floorRows) {
      if (!r[0]) continue;
      const proj = projectMap[r[1]]; if (!proj) continue;
      const fl = {
        id: r[0], name: r[3] || "Floor", order: Number(r[4]) || 0,
        planDriveFileId: r[5] || null, planMimeType: null, planWebViewLink: null, planFileName: null,
        createdAt: r[8] || nowStamp(), planAspectRatio: Number(r[9]) || null
      };
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
      order: Number(r[6]) || 0
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
    if (state.projects.length && (!state.selectedProjectId || !state.projects.some((p) => p.id === state.selectedProjectId))) {
      state.selectedProjectId = state.projects[0].id;
      state.selectedFloorId = state.projects[0].floors[0] ? state.projects[0].floors[0].id : null;
    }
    const selectedProject = project();
    if (selectedProject && (!state.selectedFloorId || !selectedProject.floors.some((f) => f.id === state.selectedFloorId))) state.selectedFloorId = selectedProject.floors[0]?.id || null;
    if (state.selectedRoomId !== "all" && !state.rooms.some((r) => r.id === state.selectedRoomId)) state.selectedRoomId = "all";
    persist({ skipSync: true });
    render();
    if (!silent) toast("Loaded " + state.projects.length + " projects, " + state.nodes.length + " nodes from cloud");
  } catch (e) {
    console.warn("Hydrate failed", e);
    if (!silent) toast("Cloud reload failed: " + describeError(e));
  }
}

let _masterSyncTimer = null;
let _masterSyncing = false;
let _masterSyncQueued = false;
function scheduleMasterSync() {
  if (!state.drive.masterSheetId || !isTokenValid()) return;
  if (_masterSyncing) { _masterSyncQueued = true; return; }
  clearTimeout(_masterSyncTimer);
  _masterSyncTimer = setTimeout(() => { syncMasterSheet({ silent: true }).catch((e) => console.warn("auto master sync", e)); }, 3000);
}

async function syncMasterSheet(opts = {}) {
  const { silent = false } = opts;
  if (!isTokenValid()) { if (!silent) toast("Sign in first"); return; }
  if (!state.drive.masterSheetId) { if (!silent) toast("Master sheet not bootstrapped"); return; }
  if (_masterSyncing) { if (!silent) toast("Sync already running"); return; }
  _masterSyncing = true;
  if (!silent) toast("Syncing master sheet...");
  try {
    await ensureMasterTabsExist();
    await importMasterPhotos({ silent: true, renderOnChange: false, scheduleSync: false });
    const projectRows = state.projects.map((p) => {
      const nodes = state.nodes.filter((n) => n.projectId === p.id);
      return [p.id, p.name, projectFolder(p)?.name || DRIVE_UNFILED_FOLDER, p.address || "", p.description || "", p.createdBy || "", p.createdAt || "", state.drive.projectFolderMap[p.id] || "", (p.floors || []).length, nodes.length, p.protected ? "TRUE" : ""];
    });
    const floorRows = [];
    state.projects.forEach((p) => {
      (p.floors || []).forEach((f) => {
        const count = state.nodes.filter((n) => n.floorId === f.id).length;
        floorRows.push([f.id, p.id, p.name, f.name, f.order || 0, f.planDriveFileId || "", state.drive.floorFolderMap[f.id] || "", count, f.createdAt || "", f.planAspectRatio || ""]);
      });
    });
    const nodeRows = state.nodes.map((n) => {
      const proj = projectById(n.projectId);
      const floor = proj?.floors?.find((f) => f.id === n.floorId);
      const photoIds = (n.imageRefs || []).map((img) => img.driveFileId || img.id).filter(Boolean).join(", ");
      return [n.id, n.projectId, proj?.name || "", n.floorId || "", floor?.name || "", n.type || "marker", nodeDisplayTitle(n), n.customTitle || "", n.category || "", n.lineItem || "", n.status || "", n.assignedTo || "", (n.tags || []).join(", "), n.position?.x ?? "", n.position?.y ?? "", n.size ?? 1, n.description || "", (n.imageRefs || []).length, (n.comments || []).length, n.createdBy || "", n.createdAt || "", n.updatedAt || "", state.drive.nodeFolderMap[n.id] || "", n.linkedProjectId || "", n.linkedFloorId || "", n.linkedNodeId || "", photoIds, n.roomId || "", roomName(n.roomId), n.linkedRoomId || "", n.circuit || "", n.cableRunM ?? "", n.boardLabel || "", n.phaseConfig || "", n.mainBreakerA ?? "", n.swbProjectId || "", n.swbSchemaVersion || ""];
    });
    const photoRows = [];
    state.nodes.forEach((n) => {
      const proj = projectById(n.projectId);
      const floor = proj?.floors?.find((f) => f.id === n.floorId);
      (n.imageRefs || []).forEach((img) => {
        photoRows.push([
          img.id || img.driveFileId || "",
          img.driveFileId || "",
          img.name || "",
          n.id,
          nodeDisplayTitle(n),
          n.floorId || "",
          floor?.name || "",
          n.projectId,
          proj?.name || "",
          img.uploader || "",
          img.uploadedAt || "",
          img.mimeType || "",
          img.webViewLink || "",
          img.thumbnailLink || ""
        ]);
      });
    });
    const folderRows = state.projectFolders.map((f) => [f.id, f.name, f.color || "", state.projects.filter((p) => p.folderId === f.id).length, f.driveFolderId || ""]);
    const roomRows = state.rooms.map((r) => [r.id, r.projectId || "", r.floorId || "", r.name || "", r.createdAt || "", r.updatedAt || "", r.order || 0]);
    await googleCall(() => gapi.client.sheets.spreadsheets.values.batchClear({
      spreadsheetId: state.drive.masterSheetId,
      resource: { ranges: Object.keys(MASTER_TABS).map((t) => t === "Nodes" ? "Nodes!A2:AK" : `${t}!A2:AD`) }
    }));
    const data = [];
    if (projectRows.length) data.push({ range: "Projects!A2", values: projectRows });
    if (floorRows.length) data.push({ range: "Floors!A2", values: floorRows });
    if (nodeRows.length) data.push({ range: "Nodes!A2", values: nodeRows });
    if (photoRows.length) data.push({ range: "Photos!A2", values: photoRows });
    if (folderRows.length) data.push({ range: "Folders!A2", values: folderRows });
    if (roomRows.length) data.push({ range: "Rooms!A2", values: roomRows });
    if (data.length) {
      await googleCall(() => gapi.client.sheets.spreadsheets.values.batchUpdate({
        spreadsheetId: state.drive.masterSheetId,
        resource: { valueInputOption: "RAW", data }
      }));
    }
    if (!silent) toast(`Master sheet synced: ${projectRows.length} projects / ${floorRows.length} floors / ${nodeRows.length} nodes / ${photoRows.length} photos / ${roomRows.length} rooms`);
  } catch (e) {
    console.warn("Master sync failed", e);
    if (!silent) toast("Master sync failed: " + describeError(e));
  } finally {
    _masterSyncing = false;
    if (_masterSyncQueued) { _masterSyncQueued = false; scheduleMasterSync(); }
  }
}

async function refreshCategories() {
  if (!isTokenValid() || !state.drive.categoriesSheetId) return;
  try {
    const meta = await gapi.client.sheets.spreadsheets.get({ spreadsheetId: state.drive.categoriesSheetId, fields: "sheets.properties.title,sheets.properties.sheetId,sheets.properties.tabColor" });
    const sheetProps = (meta.result.sheets || []).map((s) => s.properties);
    const tabs = sheetProps.map((s) => s.title);
    if (!tabs.length) return;
    const vr = await gapi.client.sheets.spreadsheets.values.batchGet({ spreadsheetId: state.drive.categoriesSheetId, ranges: tabs.map((t) => `${t}!A2:E`) });
    const data = {};
    (vr.result.valueRanges || []).forEach((v, idx) => {
      const tabName = tabs[idx];
      const tabHex = rgbColorToHex(sheetProps[idx]?.tabColor);
      const rows = (v.values || []).filter((r) => r && r[0] && r[0].trim());
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
  if (!confirm(`Revoke access for ${email}?`)) return;
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

async function ensureNodeDriveFolder(node) {
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

async function uploadFileToDrive(file, parentFolderId, overrideName) {
  if (!parentFolderId) throw new Error("No parent folder");
  const base64 = arrayBufferToBase64(await file.arrayBuffer());
  const boundary = "neillp-" + Math.random().toString(36).slice(2);
  const metadata = { name: overrideName || file.name, parents: [parentFolderId] };
  const body = `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n--${boundary}\r\nContent-Type: ${file.type || "application/octet-stream"}\r\nContent-Transfer-Encoding: base64\r\n\r\n${base64}\r\n--${boundary}--`;
  const resp = await gapi.client.request({
    path: "/upload/drive/v3/files", method: "POST",
    params: { uploadType: "multipart", fields: "id,name,webViewLink,thumbnailLink,mimeType,iconLink" },
    headers: { "Content-Type": `multipart/related; boundary="${boundary}"` },
    body
  });
  return resp.result;
}

async function updateFileBytes(fileId, file) {
  const arr = new Uint8Array(await file.arrayBuffer());
  const resp = await gapi.client.request({
    path: `/upload/drive/v3/files/${fileId}`, method: "PATCH",
    params: { uploadType: "media", fields: "id,name,webViewLink,thumbnailLink,mimeType" },
    headers: { "Content-Type": file.type || "application/octet-stream" },
    body: arr
  });
  return resp.result;
}

async function fetchDriveFileAsDataUrl(fileId) {
  if (!isTokenValid()) return null;
  let meta;
  try { meta = await gapi.client.drive.files.get({ fileId, fields: "mimeType,name" }); }
  catch (e) { meta = { result: { mimeType: "application/octet-stream" } }; }
  const mime = meta.result.mimeType || "application/octet-stream";
  const resp = await gapi.client.request({ path: `/drive/v3/files/${fileId}`, method: "GET", params: { alt: "media" } });
  const bin = resp.body;
  const arr = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i) & 0xff;
  return `data:${mime};base64,${arrayBufferToBase64(arr.buffer)}`;
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
  const a = document.createElement("a"); a.href = url; a.download = `NeillPlanner-Audit-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(a); a.click(); a.remove();
  URL.revokeObjectURL(url);
  toast(`CSV downloaded (${rows.length} rows)`);
}

/* ============================================================ RENDER */

function render() {
  const app = document.getElementById("app"); if (!app) return;
  // Returning user — silent re-auth in flight, show reconnecting screen
  if (state.googleAuth.bootstrapped && !state.googleAuth.signedIn && state.googleAuth.bootstrapping) {
    app.innerHTML = `<div class="login-gate"><div class="brand" style="justify-content:center;margin-bottom:18px"><div class="brand-mark">NP</div></div><div class="login-spinner-row" style="justify-content:center;margin-top:24px"><span class="app-spinner"></span><span style="margin-left:10px">Reconnecting&hellip;</span></div></div>`; return;
  }
  // Mandatory login gate: render only the sign-in screen until signed in
  if (!state.googleAuth.signedIn) { app.innerHTML = renderLoginGate(); bindLoginEvents(); return; }
  app.innerHTML = `
    <div class="app-shell ${state.massMode.active ? "is-mass-mode" : ""}">
      ${renderSidebar()}
      <main class="main">${renderTopbar()}<div class="content">${renderView()}</div></main>
      ${renderBottomNav()}
    </div>
    ${state.massMode.active ? renderMassBanner() : ""}
    ${state.bulkSelection.length ? renderBulkBar() : ""}
    ${state.drawerOpen && selectedNode() ? renderDrawer(selectedNode()) : ""}
    ${state.modal ? renderModal() : ""}
    ${state.lightbox ? renderLightbox() : ""}
    ${state.googleAuth.bootstrapping ? renderLoadingOverlay("Loading planner data...") : ""}
    ${state.toast ? `<div class="toast" role="status">${escapeHtml(state.toast)}</div>` : ""}
  `;
  bindEvents();
  applyCanvasTransform();
}

function renderLoginGate() {
  const auth = state.googleAuth;
  return `
    <div class="login-gate">
      <div class="login-card">
        <div class="brand" style="justify-content:center;margin-bottom:18px"><div class="brand-mark">NP</div><div><h1>NeillPlanner</h1><p>Neill Data &amp; Security</p></div></div>
        <h2>Sign in to continue</h2>
        <p>This is an internal app. Only invited Google accounts can access it.</p>
        <button class="primary-button login-button" data-action="google-sign-in" ${!hasGoogleClientId || !auth.librariesReady ? "disabled" : ""}>${icon("google")}Sign in with Google</button>
        ${auth.bootstrapping ? `<div class="login-spinner-row"><span class="app-spinner"></span><span>Signing in and loading planner data...</span></div>` : ""}
        ${auth.lastError ? `<p class="login-error">${escapeHtml(auth.lastError)}</p>` : ""}
        ${!auth.librariesReady ? `<p class="login-status">Loading Google libraries...</p>` : ""}
        <p class="login-footnote">If you can't sign in, ask your administrator to invite your Google email.</p>
      </div>
    </div>`;
}

function renderLoadingOverlay(message = "Loading...") {
  return `<div class="loading-overlay" role="status"><div class="loading-card"><span class="app-spinner"></span><strong>${escapeHtml(message)}</strong></div></div>`;
}

function bindLoginEvents() {
  document.querySelectorAll("[data-action]").forEach((b) => b.addEventListener("click", (e) => {
    const action = b.dataset.action;
    if (action === "google-sign-in") signIn();
  }));
}

function renderSidebar() {
  return `
    <aside class="sidebar">
      <div class="brand"><div class="brand-mark">NP</div><div><h1>NeillPlanner</h1><p>Neill Data &amp; Security</p></div></div>
      <nav class="nav-list" aria-label="Primary">${navItems().map((i) => `<button class="nav-button ${state.activeView === i.id ? "is-active" : ""}" data-view="${i.id}">${icon(i.icon)}<span>${i.label}</span></button>`).join("")}</nav>
      <div class="sidebar-section-title">Folders</div>
      <div class="folder-list">${renderFolderButton({ id: "all", name: "All Projects", color: "#94a3b8" }, true)}${state.projectFolders.map((f) => renderFolderButton(f)).join("")}${renderFolderButton({ id: "unfiled", name: "Unfiled", color: "#64748b" })}</div>
      <div class="sidebar-section-title">Projects</div>
      <div class="project-list">${state.projects.length === 0 ? '<div class="empty-state" style="font-size:12px;padding:14px">No projects yet</div>' : groupedProjectButtons()}</div>
    </aside>`;
}

function groupedProjectButtons() {
  const groups = [];
  state.projectFolders.forEach((folder) => {
    const projects = state.projects.filter((p) => p.folderId === folder.id);
    if (!projects.length) return;
    groups.push(`<div class="project-folder-group"><div class="folder-heading" style="--folder:${folder.color}"><span class="folder-dot"></span><span>${escapeHtml(folder.name)}</span></div>${projects.map(renderProjectButton).join("")}</div>`);
  });
  const unfiled = state.projects.filter((p) => !p.folderId);
  if (unfiled.length) groups.push(`<div class="project-folder-group"><div class="folder-heading" style="--folder:#64748b"><span class="folder-dot"></span><span>${DRIVE_UNFILED_FOLDER}</span></div>${unfiled.map(renderProjectButton).join("")}</div>`);
  return groups.join("");
}

function renderFolderButton(folder, isAll = false) {
  const id = isAll ? "all" : folder.id;
  const s = folderStats(id);
  return `<button class="folder-button ${state.selectedFolderId === id ? "is-active" : ""}" data-folder="${id}" style="--folder:${folder.color}"><span class="folder-dot"></span><span><strong>${escapeHtml(folder.name)}</strong><span>${s.projects} builds / ${s.nodes} nodes</span></span></button>`;
}

function renderProjectButton(item) {
  const nodes = state.nodes.filter((n) => n.projectId === item.id);
  const s = stats(nodes);
  const folder = projectFolder(item);
  const color = folder?.color || "#64748b";
  const linkedCount = nodes.filter((n) => n.type === "portal").length;
  return `<button class="project-button ${item.id === state.selectedProjectId ? "is-active" : ""}" data-project="${item.id}" style="--folder:${color}"><span class="status-dot" style="--status:${s.issue ? "var(--red)" : "var(--teal)"}"></span><span><strong>${escapeHtml(item.name)}</strong><span class="project-meta"><span>${s.total} nodes</span><span>${s.completePercent}%</span><span title="Floors">${icon("layers")}${item.floors?.length || 1}</span>${linkedCount ? `<span title="Linked">${icon("link")}${linkedCount}</span>` : ""}</span></span></button>`;
}

function renderTopbar() {
  const proj = project();
  const folder = projectFolder(proj);
  const folderName = folder?.name || (proj && !proj.folderId ? DRIVE_UNFILED_FOLDER : "");
  const folderColor = folder?.color || "#64748b";
  const auth = state.googleAuth;
  return `<header class="topbar"><div class="topbar-title"><h2>${proj ? escapeHtml(proj.name) : "NeillPlanner"}</h2><p>${proj ? `<span class="inline-folder" style="--folder:${folderColor}">${escapeHtml(folderName)}</span> / ${escapeHtml(proj.address || "No address")}` : "Welcome"}</p></div><div class="topbar-actions"><button class="user-pill" data-action="${isAdmin() ? "go-settings" : "google-sign-out"}" title="${escapeHtml(isAdmin() ? "Settings" : "Sign out")}"><span class="avatar">${initials(auth.profile?.name || auth.profile?.email || "?")}</span><span class="hide-mobile">${escapeHtml(auth.profile?.name || auth.profile?.email || "Signed in")}${isPrimaryOwner() ? " (owner)" : ""}</span></button></div></header>`;
}

function renderBottomNav() { return `<nav class="bottom-nav" aria-label="Primary">${navItems().map((i) => `<button class="${state.activeView === i.id ? "is-active" : ""}" data-view="${i.id}">${icon(i.icon)}<span>${i.label}</span></button>`).join("")}</nav>`; }

function renderMassBanner() {
  const m = state.massMode;
  return `<div class="mass-banner" role="status">${icon("mass")}<span>Mass placing: <strong>${escapeHtml(m.category)} / ${escapeHtml(m.lineItem)}</strong> &middot; ${m.count} placed</span><span class="hint">Click the plan to drop. <kbd>Esc</kbd> to stop.</span><button class="ghost-button" data-action="mass-stop">${icon("close")}Stop</button></div>`;
}

function renderBulkBar() {
  const count = state.bulkSelection.length;
  return `<div class="bulk-bar" role="status">
    <strong>${count} selected</strong>
    <label>Status <select data-bulk-status><option value="">—</option>${Object.keys(statusMeta).map((s) => `<option value="${escapeHtml(s)}">${escapeHtml(s)}</option>`).join("")}</select></label>
    <label>Category <select data-bulk-category><option value="">—</option>${categoryNames().map((c) => `<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`).join("")}</select></label>
    <button class="danger-button" data-action="bulk-delete">${icon("trash")}Delete</button>
    <button class="ghost-button" data-action="bulk-clear">${icon("close")}Clear</button>
  </div>`;
}

function renderView() {
  switch (state.activeView) {
    case "projects": return renderProjectsView();
    case "progress": return renderProgressView();
    case "audit": return renderAuditView();
    case "settings": return renderSettingsViewMobile();
    default: return renderMapView();
  }
}

function renderProjectsView() {
  const visible = folderProjects();
  const activeName = state.selectedFolderId === "all" ? "All Projects" : state.selectedFolderId === "unfiled" ? DRIVE_UNFILED_FOLDER : (state.projectFolders.find((f) => f.id === state.selectedFolderId)?.name || "All Projects");
  return `
    <section class="view-panel">
      <div class="panel-header"><h3 class="section-title">Project Dashboard</h3><div class="button-row"><button class="ghost-button" data-action="new-folder">${icon("folder")}Folder</button><button class="primary-button" data-action="new-project">${icon("plus")}New project</button></div></div>
      <div class="folder-strip">${renderFolderButton({ id: "all", name: "All Projects", color: "#94a3b8" }, true)}${state.projectFolders.map((f) => renderFolderButton(f)).join("")}${renderFolderButton({ id: "unfiled", name: "Unfiled", color: "#64748b" })}</div>
      ${state.projectFolders.length ? `<div class="folder-manager"><div><h3 class="section-title">Folder Colours</h3><p>Folders are for towers, apartment blocks, stages, or buildings inside one large job.</p></div><div class="folder-color-grid">${state.projectFolders.map(renderFolderColourRow).join("")}</div></div>` : ""}
      <div class="projects-grid">${visible.length ? visible.map(renderProjectCard).join("") : `<div class="empty-state" style="grid-column:1/-1;padding:36px;text-align:center"><p style="margin-bottom:12px">No projects in <strong>${escapeHtml(activeName)}</strong>.</p><button class="primary-button" data-action="new-project">${icon("plus")}Create your first project</button></div>`}</div>
    </section>`;
}

function renderProjectCard(item) {
  const nodes = state.nodes.filter((n) => n.projectId === item.id);
  const s = stats(nodes);
  const folder = projectFolder(item);
  const folderName = folder?.name || DRIVE_UNFILED_FOLDER;
  const folderColor = folder?.color || "#64748b";
  const links = state.nodes.filter((n) => n.projectId === item.id && n.type === "portal").length;
  return `<article class="project-card" style="--folder:${folderColor}"><div class="project-card-map"></div><div class="project-card-body"><div class="compact-row" style="margin-bottom:10px"><span class="mini-chip folder-label" style="--folder:${folderColor}">${icon("folder")}${escapeHtml(folderName)}</span><span class="mini-chip">${icon("layers")}${item.floors?.length || 1} floor(s)</span>${links ? `<span class="mini-chip">${icon("link")}${links} linked</span>` : ""}</div><h3>${escapeHtml(item.name)}</h3><p>${escapeHtml(item.description || "No description")}</p><div class="compact-row" style="margin-top:12px">${statusPill(`${s.completePercent}% complete`)}<span class="mini-chip">${s.total} nodes</span><span class="mini-chip">${s.issue} issues</span></div><div class="project-card-controls"><label><span>Folder</span><select data-project-folder="${item.id}" aria-label="Folder for ${escapeHtml(item.name)}"><option value="">${DRIVE_UNFILED_FOLDER}</option>${state.projectFolders.map((f) => `<option value="${f.id}" ${f.id === item.folderId ? "selected" : ""}>${escapeHtml(f.name)}</option>`).join("")}</select></label></div><div class="button-row" style="margin-top:14px"><button class="primary-button" data-project-open="${item.id}">${icon("map")}Open</button><button class="ghost-button" data-project-delete="${item.id}">${icon("trash")}Delete</button></div></div></article>`;
}

function renderFolderColourRow(folder) {
  const s = folderStats(folder.id);
  return `<div class="folder-colour-row" style="--folder:${folder.color}"><span class="folder-dot"></span><span><strong>${escapeHtml(folder.name)}</strong><span>${s.projects} builds / ${s.nodes} nodes</span></span><input type="color" value="${escapeHtml(folder.color)}" data-folder-color="${folder.id}" aria-label="Colour" /><button class="icon-button" data-folder-rename="${folder.id}" aria-label="Rename">${icon("edit")}</button><button class="icon-button" data-folder-delete="${folder.id}" aria-label="Delete">${icon("trash")}</button></div>`;
}

function renderMapView() {
  const proj = project();
  if (!proj) return `<section class="view-panel"><div class="empty-state empty-state--big">${icon("map")}<h3 class="section-title">No project selected</h3><p>Create a project first to start dropping nodes on a plan.</p><button class="primary-button" data-action="new-project">${icon("plus")}Create a project</button></div></section>`;
  const floor = currentFloor();
  if (!floor) return `<section class="view-panel"><div class="empty-state empty-state--big"><h3 class="section-title">Project has no floors</h3><button class="primary-button" data-action="add-floor">${icon("plus")}Add floor</button></div></section>`;
  const hasPlan = Boolean(state.floorPlans[floor.id] || floor.planDriveFileId);
  const allFloorNodes = floorNodes();
  const rooms = floorRooms(floor.id);
  const nodes = selectedRoomNodes(allFloorNodes);
  const matched = nodes.filter(matchesNode);
  const cats = ["All", ...categoryNames()];
  const catsLoaded = Object.keys(state.categoriesData).length > 0;
  const planAspect = Number(floor.planAspectRatio) || 1.6;
  const nodesCollapsed = state.ui.nodesCollapsed ?? isPhoneLayout();
  return `
    <section class="map-layout">
      <div class="map-panel">
        <div class="floor-tabs">
          ${proj.floors.sort((a, b) => (a.order || 0) - (b.order || 0)).map((f) => `<button class="floor-tab ${f.id === state.selectedFloorId ? "is-active" : ""}" data-floor="${f.id}" data-floor-tab="${f.id}" draggable="true">${escapeHtml(f.name)}</button>`).join("")}
          <button class="floor-tab floor-tab--add" data-action="add-floor" title="Add floor">${icon("plus")}</button>
          <button class="floor-tab floor-tab--add" data-action="rename-floor" title="Rename current floor">${icon("edit")}</button>
          <button class="floor-tab floor-tab--add" data-action="delete-floor" title="Delete current floor">${icon("trash")}</button><button class="floor-tab floor-tab--add floor-tab--help" data-action="show-help" title="Help / Legend">${icon("question")}</button>
        </div>
        <div class="room-strip" aria-label="Rooms">
          <button class="room-chip ${state.selectedRoomId === "all" ? "is-active" : ""}" data-room="all">All rooms <span>${allFloorNodes.length}</span></button>
          ${rooms.map((r) => `<button class="room-chip ${state.selectedRoomId === r.id ? "is-active" : ""}" data-room="${r.id}">${escapeHtml(r.name)} <span>${state.nodes.filter((n) => n.roomId === r.id).length}</span></button>`).join("")}
          <button class="room-chip room-chip--add" data-action="new-room">${icon("plus")}Room</button>
          ${state.selectedRoomId !== "all" ? `<button class="room-chip" data-action="rename-room">${icon("edit")}Rename</button><button class="room-chip room-chip--danger" data-action="delete-room">${icon("trash")}Delete</button>` : ""}
        </div>
        <div class="map-toolbar">
          <div class="search-wrap">${icon("search")}<input data-filter="query" value="${escapeHtml(state.filters.query)}" placeholder="Search nodes, tags, users" aria-label="Search" /></div>
          <div class="filter-row">${renderSelect("status", ["All", ...Object.keys(statusMeta)], state.filters.status)}${renderSelect("category", cats, state.filters.category)}${renderSelect("assignee", ["All", ...teamNames()], state.filters.assignee)}</div>
          <div class="button-row">
            <button class="ghost-button" data-action="upload-plan">${icon("upload")}<span>Plan</span></button>
            <button class="primary-button" data-action="create-node" ${!hasPlan || !catsLoaded ? "disabled" : ""}>${icon("plus")}<span>Node</span></button>
            <button class="ghost-button" data-action="mass-start" ${!hasPlan || !catsLoaded ? "disabled" : ""}>${icon("mass")}<span>Mass</span></button>
            <button class="ghost-button" data-action="add-portal" ${!hasPlan ? "disabled" : ""}>${icon("portal")}<span>Door</span></button>
            <button class="ghost-button" data-action="print-report">${icon("printer")}<span>Print</span></button>
          </div>
        </div>
        <div class="canvas-shell">
          <div class="canvas-viewport ${state.massMode.active ? "is-placing" : ""}" id="canvasViewport">
            <div class="plan-stage" id="planStage" style="--plan-ar:${planAspect}">
              ${hasPlan ? `<img class="floor-plan" src="${escapeHtml(state.floorPlans[floor.id] || "")}" alt="Floor plan" draggable="false" />` : renderEmptyPlanArea()}
              <div class="node-layer">${nodes.map(renderMarker).join("")}</div>
            </div>
          </div>
          <div class="canvas-tools" aria-label="Canvas tools"><button class="icon-button" data-action="zoom-in" title="Zoom in">${icon("zoomIn")}</button><button class="icon-button" data-action="zoom-out" title="Zoom out">${icon("zoomOut")}</button><button class="icon-button" data-action="reset-view" title="Recenter">${icon("target")}</button></div>
          <div class="scale-readout"><span class="scale-bar"></span><span>${Math.round(state.canvas.zoom * 100)}%</span></div>
        </div>
        
      </div>
      <aside class="summary-panel ${nodesCollapsed ? "is-collapsed" : ""}">
        <div class="summary-grid"><div class="metric"><span>${state.selectedRoomId === "all" ? "Floor nodes" : "Room nodes"}</span><strong>${nodes.length}</strong></div><div class="metric"><span>Shown</span><strong>${matched.length}</strong></div><div class="metric"><span>Complete</span><strong>${stats(nodes).completePercent}%</strong></div><div class="metric"><span>Issues</span><strong>${stats(nodes).issue}</strong></div></div>
        <div class="collapsible-heading"><h3 class="section-title">Nodes (${state.selectedRoomId === "all" ? "this floor" : escapeHtml(roomLabel(state.selectedRoomId))})</h3><button class="ghost-button compact-toggle" data-action="toggle-node-list">${nodesCollapsed ? "Show" : "Hide"}</button></div>
        <p class="summary-hint">Shift-click markers to multi-select.</p>
        <div class="node-list">${matched.length ? matched.map(renderNodeSummary).join("") : `<div class="empty-state">${nodes.length ? "No matching nodes" : (hasPlan ? "No nodes on this floor yet." : "Upload a plan to start.")}</div>`}</div>
      </aside>
    </section>`;
}

function renderEmptyPlanArea() {
  return `<div class="empty-plan"><div class="empty-plan-inner"><div class="empty-plan-icon">${icon("map")}</div><h3>No floor plan yet</h3><p>Upload a building plan image (PNG, JPG, or SVG). It will sync to Drive automatically.</p><button class="primary-button" type="button" data-action="upload-plan">${icon("upload")}Upload plan image</button></div></div>`;
}

function renderSelect(name, options, value) { return `<select data-filter="${name}" aria-label="${name}">${options.map((o) => `<option value="${escapeHtml(o)}" ${o === value ? "selected" : ""}>${escapeHtml(o)}</option>`).join("")}</select>`; }

function renderMarker(node) {
  const isSelected = node.id === state.selectedNodeId;
  const isBulk = state.bulkSelection.includes(node.id);
  const isDim = !matchesNode(node);
  const isPortal = node.type === "portal";
  const isSwitchboard = node.type === "switchboard";
  const isSubboard = node.type === "subboard";
  const catColor = nodeColor(node);
  const extraClass = isPortal ? "is-portal" : isSwitchboard ? "is-switchboard" : isSubboard ? "is-subboard" : "";
  const innerIcon = isPortal ? icon("portal") : isSwitchboard ? icon("switchboard") : isSubboard ? icon("subboard") : "";
  const swbBadge = (isSwitchboard || isSubboard) && node.swbProjectId
    ? `<span class="swb-linked-dot" title="Linked to SWB project"></span>` : "";
  return `<button class="node-marker ${extraClass} ${isSelected ? "is-selected" : ""} ${isBulk ? "is-bulk" : ""} ${isDim ? "is-dim" : ""}" style="--x:${node.position.x};--y:${node.position.y};--cat:${catColor};--size:${node.size || 1};${statusStyle(node.status)}" data-node="${node.id}" aria-label="${escapeHtml(nodeDisplayTitle(node))}">${innerIcon}${node.comments?.length ? `<span class="comment-count">${node.comments.length}</span>` : ""}${swbBadge}</button>`;
}

function renderNodeSummary(node) {
  const isPortal = node.type === "portal";
  const catColor = nodeColor(node);
  const linkedTarget = isPortal ? projectById(node.linkedProjectId)?.name : null;
  const isBulk = state.bulkSelection.includes(node.id);
  return `<button class="node-summary ${node.id === state.selectedNodeId ? "is-selected" : ""} ${isBulk ? "is-bulk" : ""}" data-node="${node.id}"><span class="status-dot" style="${statusStyle(node.status)}"></span><span class="category-dot" style="--cat:${catColor}"></span><span><strong>${escapeHtml(nodeDisplayTitle(node))}</strong><span>${isPortal ? `${icon("portal")} -> ${escapeHtml(linkedTarget || roomLabel(node.linkedRoomId) || "(unlinked)")}` : `${escapeHtml(node.category || "-")} / ${escapeHtml(roomLabel(node.roomId))} / ${escapeHtml(node.assignedTo || "Unassigned")}`}</span></span></button>`;
}

function renderProgressView() {
  const proj = project();
  if (!proj) return `<section class="view-panel"><div class="empty-state" style="padding:36px">No project selected.</div></section>`;
  const nodes = projectNodes();
  const s = stats(nodes);
  const total = Math.max(s.total, 1);
  const completeDeg = (s.complete / total) * 100;
  const progressDeg = completeDeg + (s.progress / total) * 100;
  const issueDeg = progressDeg + (s.issue / total) * 100;
  const cats = categoryNames().map((c) => { const count = nodes.filter((n) => n.category === c).length; return { category: c, count, value: Math.round((count / total) * 100) }; }).filter((c) => c.count > 0);
  const floorRows = (proj.floors || []).map((f) => { const fn = nodes.filter((n) => n.floorId === f.id); return { name: f.name, total: fn.length, percent: stats(fn).completePercent, issues: stats(fn).issue }; });
  return `
    <section class="view-panel">
      <div class="panel-header"><h3 class="section-title">Progress Dashboard</h3><div class="button-row"><button class="ghost-button" data-action="print-report">${icon("printer")}Print</button></div></div>
      <div class="metrics-grid"><div class="metric"><span>Total nodes</span><strong>${s.total}</strong></div><div class="metric"><span>Complete</span><strong>${s.completePercent}%</strong></div><div class="metric"><span>In progress</span><strong>${s.progress}</strong></div><div class="metric"><span>Issues</span><strong>${s.issue}</strong></div></div>
    </section>
    <section class="view-panel">
      <div class="charts-grid">
        <div><h3 class="section-title">Status</h3><div class="donut-wrap"><div class="donut" style="--complete:${completeDeg}%;--progress:${progressDeg}%;--issue:${issueDeg}%"><div class="donut-label"><strong>${s.completePercent}%</strong><span>Complete</span></div></div></div></div>
        <div><h3 class="section-title">Category Load</h3><div class="bar-list">${cats.length ? cats.map((item) => `<div class="bar-row"><span><span class="category-dot" style="--cat:${categoryColor(item.category)}"></span>${escapeHtml(item.category)}</span><span class="bar-track"><span class="bar-fill" style="--value:${item.value}%;--cat:${categoryColor(item.category)}"></span></span><span>${item.count}</span></div>`).join("") : `<div class="empty-state">No nodes yet</div>`}</div></div>
      </div>
    </section>
    <section class="view-panel">
      <h3 class="section-title">By Floor</h3>
      <div class="bar-list">${floorRows.length ? floorRows.map((f) => `<div class="bar-row"><span>${escapeHtml(f.name)}</span><span class="bar-track"><span class="bar-fill" style="--value:${f.percent}%"></span></span><span>${f.percent}% &middot; ${f.total} nodes &middot; ${f.issues} issues</span></div>`).join("") : `<div class="empty-state">No floors</div>`}</div>
    </section>`;
}

function renderAuditView() {
  if (!isAdmin()) return `<section class="view-panel"><div class="empty-state empty-state--big">${icon("audit")}<h3>Admin only</h3><p>The audit log is restricted to ${escapeHtml(PRIMARY_OWNER_EMAIL)}.</p></div></section>`;
  const av = state.auditView;
  const filtered = av.loaded ? filteredAuditRows() : [];
  const distinctUsers = [...new Set(av.rows.map((r) => r.user).filter(Boolean))].sort();
  const distinctActions = [...new Set(av.rows.map((r) => r.action).filter(Boolean))].sort();
  const distinctProjects = [...new Set(av.rows.map((r) => ({ id: r.projectId, name: r.projectName })).filter((p) => p.id))].reduce((acc, p) => { if (!acc.some((x) => x.id === p.id)) acc.push(p); return acc; }, []);
  return `
    <section class="view-panel">
      <div class="panel-header"><h3 class="section-title">Audit Log</h3><div class="button-row"><span class="sync-chip" style="opacity:.8">${av.loaded ? `${av.rows.length} rows / fetched ${escapeHtml(av.lastFetchedAt || "")}` : "Not loaded"}</span><button class="ghost-button" data-action="audit-load">${icon("refresh")}${av.loading ? "Loading..." : av.loaded ? "Refresh" : "Load from Sheet"}</button><button class="primary-button" data-action="audit-download" ${!av.loaded || filtered.length === 0 ? "disabled" : ""}>${icon("download")}Download CSV (${filtered.length})</button></div></div>
      ${av.loaded ? `
        <div class="audit-filters">
          <label><span>From</span><input type="date" data-audit-filter="from" value="${escapeHtml(av.filters.from)}" /></label>
          <label><span>To</span><input type="date" data-audit-filter="to" value="${escapeHtml(av.filters.to)}" /></label>
          <label><span>User</span><select data-audit-filter="user"><option value="All">All</option>${distinctUsers.map((u) => `<option value="${escapeHtml(u)}" ${av.filters.user === u ? "selected" : ""}>${escapeHtml(u)}</option>`).join("")}</select></label>
          <label><span>Action</span><select data-audit-filter="action"><option value="All">All</option>${distinctActions.map((a) => `<option value="${escapeHtml(a)}" ${av.filters.action === a ? "selected" : ""}>${escapeHtml(a)}</option>`).join("")}</select></label>
          <label><span>Project</span><select data-audit-filter="projectId"><option value="All">All</option>${distinctProjects.map((p) => `<option value="${escapeHtml(p.id)}" ${av.filters.projectId === p.id ? "selected" : ""}>${escapeHtml(p.name || p.id)}</option>`).join("")}</select></label>
          <label><span>Node title</span><input data-audit-filter="nodeQuery" value="${escapeHtml(av.filters.nodeQuery)}" placeholder="contains..." /></label>
          <label><span>Details</span><input data-audit-filter="detailsQuery" value="${escapeHtml(av.filters.detailsQuery)}" placeholder="contains..." /></label>
          <label><span>Anywhere</span><input data-audit-filter="query" value="${escapeHtml(av.filters.query)}" placeholder="free-text" /></label>
          <button class="ghost-button" data-action="audit-clear-filters">Clear</button>
        </div>
        <div class="audit-table-wrap"><table class="audit-table"><thead><tr><th>Timestamp</th><th>User</th><th>Action</th><th>Project</th><th>Folder</th><th>Floor</th><th>Node ID</th><th>Node Title</th><th>Category</th><th>Status</th><th>Details</th><th>Device</th></tr></thead><tbody>${filtered.length ? filtered.map((r) => `<tr><td>${escapeHtml(r.timestamp)}</td><td>${escapeHtml(r.user)}</td><td>${escapeHtml(r.action)}</td><td>${escapeHtml(r.projectName || r.projectId)}</td><td>${escapeHtml(r.folderName)}</td><td>${escapeHtml(r.floorName)}</td><td>${escapeHtml(r.nodeId)}</td><td>${escapeHtml(r.nodeTitle)}</td><td>${escapeHtml(r.category)}</td><td>${escapeHtml(r.status)}</td><td>${escapeHtml(r.details)}</td><td>${escapeHtml(r.device)}</td></tr>`).join("") : `<tr><td colspan="12" style="text-align:center;padding:24px;color:rgba(255,255,255,.6)">No rows match</td></tr>`}</tbody></table></div>
      ` : `<div class="empty-state empty-state--big">${icon("audit")}<h3>Audit log is not loaded</h3><p>Lives in <code>${DRIVE_ROOT_NAME}/${DRIVE_ADMIN_FOLDER}/${AUDIT_SHEET_NAME}</code>. Fetched on demand.</p><button class="primary-button" data-action="audit-load">${icon("refresh")}Load from Sheet</button></div>`}
      ${state.auditQueue.length ? `<p style="margin-top:12px;color:#f59e0b">${state.auditQueue.length} audit row(s) queued locally.</p>` : ""}
    </section>`;
}

function renderStaffSettingsView() {
  const auth = state.googleAuth;
  return `
    <section class="settings-grid">
      <div class="view-panel">
        <div class="panel-header"><h3 class="section-title">Account</h3><span class="sync-chip"><span class="sync-dot"></span>${escapeHtml(state.myRole || "staff")}</span></div>
        <div class="integration-list">
          <div class="integration-row"><span><strong>Email</strong><span>${escapeHtml(auth.profile?.email || "")}</span></span>${statusPill("Complete")}</div>
          <div class="integration-row"><span><strong>Name</strong><span>${escapeHtml(auth.profile?.name || "")}</span></span>${statusPill("Complete")}</div>
          <div class="integration-row"><span><strong>Role</strong><span>${escapeHtml(state.myRole || "staff")}</span></span>${statusPill("Complete")}</div>
        </div>
        <div class="button-row" style="margin-top:14px">
          <button class="ghost-button" data-action="google-sign-out">${icon("signOut")}Sign out</button>
          <button class="ghost-button" data-action="hydrate-cloud">${icon("refresh")}Reload from cloud</button>
        </div>
        <p style="margin-top:14px;color:rgba(255,255,255,.55)">Admin-only settings are hidden. Contact the owner to request admin access.</p>
      </div>
    </section>
  `;
}

function renderSettingsView() {
  if (!isAdmin()) return `<section class="view-panel"><div class="empty-state empty-state--big">${icon("settings")}<h3>Admin only</h3><p>Settings are restricted to ${escapeHtml(PRIMARY_OWNER_EMAIL)}.</p><button class="ghost-button" data-action="google-sign-out">${icon("signOut")}Sign out</button></div></section>`;
  const auth = state.googleAuth;
  const proj = project();
  const driveOk = Boolean(state.drive.rootFolderId);
  const sheetOk = Boolean(state.drive.auditSheetId);
  const catsOk = Boolean(state.drive.categoriesSheetId);
  const catTabs = Object.entries(state.categoriesData);
  const owner = isPrimaryOwner();
  return `
    <section class="settings-grid">
      <div class="view-panel">
        <div class="panel-header"><h3 class="section-title">Account</h3><span class="sync-chip"><span class="sync-dot"></span>${owner ? "Signed in (owner)" : "Signed in"}</span></div>
        <div class="integration-list">
          <div class="integration-row"><span><strong>Email</strong><span>${escapeHtml(auth.profile?.email || "(unknown)")}</span></span>${statusPill("Complete")}</div>
          <div class="integration-row"><span><strong>Name</strong><span>${escapeHtml(auth.profile?.name || "(unknown)")}</span></span>${statusPill("Complete")}</div>
          <div class="integration-row"><span><strong>Token expires</strong><span>${auth.expiresAt ? new Date(auth.expiresAt).toLocaleTimeString() : "-"}</span></span>${statusPill(isTokenValid() ? "Complete" : "Issue")}</div>
          <div class="integration-row"><span><strong>Data owner</strong><span>${escapeHtml(PRIMARY_OWNER_EMAIL)}</span></span>${statusPill(owner ? "You" : "Shared")}</div>
        </div>
        <div class="button-row" style="margin-top:14px"><button class="ghost-button" data-action="google-sign-out">${icon("signOut")}Sign out</button><button class="ghost-button" data-action="google-bootstrap">${icon("refresh")}Re-sync Drive</button><button class="ghost-button" data-action="sync-all-folders">${icon("folder")}Sync all folders</button><button class="ghost-button" data-action="sync-master-sheet">${icon("refresh")}Sync master sheet</button><button class="ghost-button" data-action="refresh-categories">${icon("refresh")}Refresh categories</button><button class="ghost-button" data-action="hydrate-cloud">${icon("download")}Reload from cloud</button><button class="ghost-button" data-action="import-master-photos">${icon("download")}Import photos</button><button class="ghost-button" data-action="refresh-users">${icon("refresh")}Refresh users</button><button class="danger-button" data-action="format-planner">${icon("trash")}Format data</button></div>
      </div>
      <div class="view-panel">
        <div class="panel-header"><h3 class="section-title">Team Access</h3>${owner ? `<button class="ghost-button" data-action="refresh-team">${icon("refresh")}Refresh</button>` : ""}</div>
        ${owner ? `
          <p style="margin-bottom:12px;color:rgba(255,255,255,.6)">Add users by Google email. They'll receive an invite and can sign in to NeillPlanner. Files live in your Drive; their writes go into the shared folder.</p>
          <div class="team-add-row">
            <input id="newTeamEmail" type="email" placeholder="user@gmail.com" />
            <select id="newTeamRole"><option value="writer">Editor (read/write)</option><option value="reader">Viewer (read only)</option></select>
            <button class="primary-button" data-action="team-add">${icon("plus")}Invite</button>
          </div>
          <div class="integration-list" style="margin-top:12px">
            ${(state.teamAccess.permissions || []).filter((p) => p.type === "user").map((p) => `<div class="integration-row"><span><strong>${escapeHtml(p.displayName || p.emailAddress)}</strong><span>${escapeHtml(p.emailAddress || "")} &middot; ${escapeHtml(p.role)}</span></span>${p.role === "owner" ? statusPill("Owner") : `<button class="icon-button" data-team-remove="${p.id}" data-team-email="${escapeHtml(p.emailAddress)}" title="Revoke">${icon("trash")}</button>`}</div>`).join("")}
          </div>
          <p style="margin-top:12px;color:rgba(255,255,255,.55)">Also add each new user under <strong>Google Cloud → OAuth consent screen → Test users</strong>, or your app will refuse their sign-in.</p>
        ` : `
          <p>Access is managed by ${escapeHtml(PRIMARY_OWNER_EMAIL)}. To request access, ask them to add you in their Settings → Team Access.</p>
          <div class="integration-list" style="margin-top:12px">${(state.teamAccess.permissions || []).filter((p) => p.type === "user").map((p) => `<div class="integration-row"><span><strong>${escapeHtml(p.displayName || p.emailAddress)}</strong><span>${escapeHtml(p.emailAddress || "")} &middot; ${escapeHtml(p.role)}</span></span></div>`).join("")}</div>
        `}
      </div>
      <div class="view-panel">
        <div class="panel-header"><h3 class="section-title">Google Services</h3><span class="sync-chip"><span class="sync-dot"></span>${hasGoogleApiKey && hasGoogleClientId ? "Configured" : "Config needed"}</span></div>
        <div class="integration-list">
          <div class="integration-row"><span><strong>Browser API Key</strong><span>${hasGoogleApiKey ? "Loaded from index.html" : "Missing"}</span></span>${statusPill(hasGoogleApiKey ? "Complete" : "Not Started")}</div>
          <div class="integration-row"><span><strong>OAuth Client ID</strong><span>${hasGoogleClientId ? "Loaded from index.html" : "Missing"}</span></span>${statusPill(hasGoogleClientId ? "Complete" : "Not Started")}</div>
          <div class="integration-row"><span><strong>OAuth Scopes</strong><span>${escapeHtml(googleScopes)}</span></span>${statusPill("Complete")}</div>
          <div class="integration-row"><span><strong>Drive Root</strong><span>${driveOk ? `/${DRIVE_ROOT_NAME}/ (in ${escapeHtml(PRIMARY_OWNER_EMAIL)})` : "Pending sign-in"}</span></span>${statusPill(driveOk ? "Complete" : "Not Started")}</div>
          <div class="integration-row"><span><strong>Audit Sheet</strong><span>${sheetOk ? AUDIT_SHEET_NAME : "Pending"}</span></span>${statusPill(sheetOk ? "Complete" : "Not Started")}</div>
          <div class="integration-row"><span><strong>Categories Sheet</strong><span>${catsOk ? CATEGORIES_SHEET_NAME : "Pending"}</span></span>${statusPill(catsOk ? "Complete" : "Not Started")}</div>
          <div class="integration-row"><span><strong>Master Sheet</strong><span>${state.drive.masterSheetId ? MASTER_SHEET_NAME + " (auto-syncs)" : "Pending"}</span></span>${statusPill(state.drive.masterSheetId ? "Complete" : "Not Started")}</div>
          <div class="integration-row"><span><strong>Users Sheet</strong><span>${state.drive.usersSheetId ? USERS_SHEET_NAME + " (" + state.users.length + " loaded)" : "Pending"}</span></span>${statusPill(state.drive.usersSheetId ? "Complete" : "Not Started")}</div>
          <div class="integration-row"><span><strong>Bulk Photos</strong><span>${state.drive.bulkPhotosFolderId && state.drive.sortedPhotosFolderId ? `${DRIVE_BULK_PHOTOS_FOLDER} / ${DRIVE_SORTED_PHOTOS_FOLDER}` : "Pending"}</span></span>${statusPill(state.drive.bulkPhotosFolderId && state.drive.sortedPhotosFolderId ? "Complete" : "Not Started")}</div>
          <div class="integration-row"><span><strong>Photo Allocation</strong><span>${state.drive.photoAllocationSheetId ? PHOTO_ALLOCATION_SHEET_NAME + " (" + state.bulkPhotos.length + " rows)" : "Pending"}</span></span>${statusPill(state.drive.photoAllocationSheetId ? "Complete" : "Not Started")}</div>
        </div>
      </div>
      <div class="view-panel">
        <div class="panel-header"><h3 class="section-title">Bulk Photos</h3><div class="button-row"><button class="ghost-button" data-action="refresh-bulk-photos">${icon("refresh")}Refresh</button><button class="primary-button" data-action="upload-bulk-photos">${icon("upload")}Upload batch</button></div></div>
        <div class="integration-list">
          <div class="integration-row"><span><strong>Inbox</strong><span>${state.bulkPhotos.filter((p) => (p.status || "Inbox") !== "Allocated").length} unallocated photo(s)</span></span>${statusPill("In Progress")}</div>
          <div class="integration-row"><span><strong>Allocated</strong><span>${state.bulkPhotos.filter((p) => p.status === "Allocated").length} mapped photo(s)</span></span>${statusPill("Complete")}</div>
        </div>
      </div>
      <div class="view-panel">
        <div class="panel-header"><h3 class="section-title">Categories (from Sheet)</h3><div class="button-row"><button class="ghost-button" data-action="refresh-categories">${icon("refresh")}Refresh</button></div></div>
        ${catTabs.length ? `<div class="integration-list">${catTabs.map(([tab, data]) => `<div class="integration-row"><span><strong><span class="category-dot" style="--cat:${data.color}"></span>${escapeHtml(tab)}</strong><span>${data.items.length} line items${data.items.length ? ": " + data.items.slice(0, 6).map((i) => escapeHtml(i.item)).join(", ") + (data.items.length > 6 ? "..." : "") : ""}</span></span>${statusPill(data.items.length ? "Complete" : "In Progress")}</div>`).join("")}</div><p style="margin-top:10px;color:rgba(255,255,255,.55)">Edit ${CATEGORIES_SHEET_NAME} to add tabs / line items. Hit Refresh when done. Last loaded: ${escapeHtml(state.categoriesLoadedAt || "never")}.</p>` : `<div class="empty-state" style="padding:18px"><p>Categories not loaded yet. Hit Refresh after signing in.</p></div>`}
      </div>
      ${proj ? `
        <div class="view-panel">
          <div class="panel-header"><h3 class="section-title">Current Project</h3><span class="sync-chip">${icon("folder")}${escapeHtml(proj.name)}</span></div>
          <div class="integration-list">
            <div class="integration-row"><span><strong>Drive path</strong><span>/${DRIVE_ROOT_NAME}/${DRIVE_PROJECTS_FOLDER}/${escapeHtml(projectFolder(proj)?.name || DRIVE_UNFILED_FOLDER)}/${escapeHtml(proj.name)}/</span></span>${statusPill(state.drive.projectFolderMap[proj.id] ? "Complete" : "Not Started")}</div>
            ${(proj.floors || []).map((f) => `<div class="integration-row"><span><strong>Floor: ${escapeHtml(f.name)}</strong><span>${state.drive.floorFolderMap[f.id] ? `/${escapeHtml(proj.name)}/${escapeHtml(f.name)}/ (synced)` : "Not synced to Drive yet"}</span></span>${statusPill(state.drive.floorFolderMap[f.id] ? "Complete" : "Not Started")}</div>`).join("")}
          </div>
          <div class="button-row" style="margin-top:14px"><button class="ghost-button" data-action="edit-project">${icon("edit")}Edit project</button></div>
        </div>
      ` : ""}
      <div class="view-panel">
        <div class="panel-header"><h3 class="section-title">About</h3><span class="sync-chip">v${APP_VERSION}</span></div>
        <div class="integration-list">
          <div class="integration-row"><span><strong>Login</strong><span>Mandatory Google sign-in</span></span>${statusPill("Complete")}</div>
          <div class="integration-row"><span><strong>Data location</strong><span>${escapeHtml(PRIMARY_OWNER_EMAIL)}'s Drive only</span></span>${statusPill("Complete")}</div>
          <div class="integration-row"><span><strong>Audit log</strong><span>${AUDIT_SHEET_NAME}. Fetched on demand.</span></span>${statusPill(sheetOk ? "Complete" : "In Progress")}</div>
        </div>
        <div class="button-row" style="margin-top:14px"><button class="ghost-button" data-action="wipe-local">${icon("trash")}Wipe local cache</button></div>
      </div>
    </section>`;
}

function settingsSection(title, body, open = false) {
  return `<details class="settings-section view-panel" ${open ? "open" : ""}><summary><h3 class="section-title">${escapeHtml(title)}</h3><span>${icon("arrowRight")}</span></summary><div class="settings-section-body">${body}</div></details>`;
}

function renderSettingsViewMobile() {
  if (!isAdmin()) return renderStaffSettingsView();
  const auth = state.googleAuth;
  const owner = isPrimaryOwner();
  const proj = project();
  const driveReady = Boolean(state.drive.rootFolderId);
  const accountBody = `
    <div class="integration-list">
      <div class="integration-row"><span><strong>Email</strong><span>${escapeHtml(auth.profile?.email || "(unknown)")}</span></span>${statusPill("Complete")}</div>
      <div class="integration-row"><span><strong>Name</strong><span>${escapeHtml(auth.profile?.name || "(unknown)")}</span></span>${statusPill("Complete")}</div>
      <div class="integration-row"><span><strong>Drive</strong><span>${driveReady ? `${DRIVE_ROOT_NAME} ready in ${escapeHtml(PRIMARY_OWNER_EMAIL)}` : "Pending sign-in"}</span></span>${statusPill(driveReady ? "Complete" : "Not Started")}</div>
      <div class="integration-row"><span><strong>Token expires</strong><span>${auth.expiresAt ? new Date(auth.expiresAt).toLocaleTimeString() : "-"}</span></span>${statusPill(isTokenValid() ? "Complete" : "Issue")}</div>
    </div>
    <div class="settings-action-strip">
      <button class="primary-button" data-action="refresh-all">${icon("refresh")}Refresh all</button>
      <button class="ghost-button" data-action="google-bootstrap">${icon("refresh")}Re-sync Drive</button>
      <button class="ghost-button" data-action="sync-all-folders">${icon("folder")}Sync folders</button>
      <button class="ghost-button" data-action="sync-master-sheet">${icon("refresh")}Sync master</button>
      <button class="ghost-button" data-action="hydrate-cloud">${icon("download")}Reload cloud</button>
      <button class="ghost-button" data-action="import-master-photos">${icon("download")}Import photos</button>
      <button class="ghost-button" data-action="repair-search-images">${icon("search")}Find moved images</button>
      <button class="ghost-button" data-action="refresh-users">${icon("refresh")}Refresh users</button>
      <button class="ghost-button" data-action="google-sign-out">${icon("signOut")}Sign out</button>
      <button class="danger-button" data-action="format-planner">${icon("trash")}Format data</button>
    </div>
  `;

  const teamBody = owner ? `
    <p class="muted-copy">Add users by Google email. Uploaded-image users are also available as assignees automatically.</p>
    <div class="team-add-row">
      <input id="newTeamEmail" type="email" placeholder="user@gmail.com" />
      <select id="newTeamRole"><option value="writer">Editor (read/write)</option><option value="reader">Viewer (read only)</option></select>
      <button class="primary-button" data-action="team-add">${icon("plus")}Invite</button>
    </div>
    <div class="integration-list" style="margin-top:12px">
      ${(state.teamAccess.permissions || []).filter((p) => p.type === "user").map((p) => `<div class="integration-row"><span><strong>${escapeHtml(p.displayName || p.emailAddress)}</strong><span>${escapeHtml(p.emailAddress || "")} / ${escapeHtml(p.role)}</span></span>${p.role === "owner" ? statusPill("Owner") : `<button class="icon-button" data-team-remove="${p.id}" data-team-email="${escapeHtml(p.emailAddress)}" title="Revoke">${icon("trash")}</button>`}</div>`).join("")}
    </div>
  ` : `<p>Access is managed by ${escapeHtml(PRIMARY_OWNER_EMAIL)}.</p>`;

  const servicesBody = `
    <div class="integration-list">
      <div class="integration-row"><span><strong>Browser API Key</strong><span>${hasGoogleApiKey ? "Loaded from index.html" : "Missing"}</span></span>${statusPill(hasGoogleApiKey ? "Complete" : "Not Started")}</div>
      <div class="integration-row"><span><strong>OAuth Client ID</strong><span>${hasGoogleClientId ? "Loaded from index.html" : "Missing"}</span></span>${statusPill(hasGoogleClientId ? "Complete" : "Not Started")}</div>
      <div class="integration-row"><span><strong>Master Sheet</strong><span>${state.drive.masterSheetId ? MASTER_SHEET_NAME : "Pending"}</span></span>${statusPill(state.drive.masterSheetId ? "Complete" : "Not Started")}</div>
      <div class="integration-row"><span><strong>Users Sheet</strong><span>${state.drive.usersSheetId ? `${USERS_SHEET_NAME} (${state.users.length} loaded)` : "Pending"}</span></span>${statusPill(state.drive.usersSheetId ? "Complete" : "Not Started")}</div>
      <div class="integration-row"><span><strong>Bulk Photos</strong><span>${state.drive.bulkPhotosFolderId && state.drive.sortedPhotosFolderId ? `${DRIVE_BULK_PHOTOS_FOLDER} / ${DRIVE_SORTED_PHOTOS_FOLDER}` : "Pending"}</span></span>${statusPill(state.drive.bulkPhotosFolderId && state.drive.sortedPhotosFolderId ? "Complete" : "Not Started")}</div>
    </div>
  `;

  const bulkBody = `
    <div class="settings-action-strip">
      <button class="ghost-button" data-action="refresh-bulk-photos">${icon("refresh")}Refresh</button>
      <button class="primary-button" data-action="upload-bulk-photos">${icon("upload")}Upload batch</button>
      <button class="ghost-button" data-action="repair-search-images">${icon("search")}Find moved images</button>
    </div>
    <div class="integration-list">
      <div class="integration-row"><span><strong>Inbox</strong><span>${state.bulkPhotos.filter((p) => (p.status || "Inbox") !== "Allocated").length} unallocated photo(s)</span></span>${statusPill("In Progress")}</div>
      <div class="integration-row"><span><strong>Allocated</strong><span>${state.bulkPhotos.filter((p) => p.status === "Allocated").length} mapped photo(s)</span></span>${statusPill("Complete")}</div>
    </div>
  `;

  const projectBody = proj ? `
    <div class="integration-list">
      <div class="integration-row"><span><strong>Current project</strong><span>${escapeHtml(proj.name)}</span></span>${statusPill(proj.protected ? "Protected" : "Editable")}</div>
      <div class="integration-row"><span><strong>Drive path</strong><span>/${DRIVE_ROOT_NAME}/${DRIVE_PROJECTS_FOLDER}/${escapeHtml(projectFolder(proj)?.name || DRIVE_UNFILED_FOLDER)}/${escapeHtml(proj.name)}/</span></span>${statusPill(state.drive.projectFolderMap[proj.id] ? "Complete" : "Not Started")}</div>
      ${(proj.floors || []).map((f) => `<div class="integration-row"><span><strong>Floor: ${escapeHtml(f.name)}</strong><span>${state.drive.floorFolderMap[f.id] ? "Synced to Drive" : "Not synced to Drive yet"}</span></span>${statusPill(state.drive.floorFolderMap[f.id] ? "Complete" : "Not Started")}</div>`).join("")}
    </div>
    <div class="settings-action-strip"><button class="ghost-button" data-action="edit-project">${icon("edit")}Edit project</button></div>
  ` : `<div class="empty-state">No current project selected.</div>`;

  return `
    <section class="settings-stack">
      ${settingsSection("Account", accountBody, true)}
      ${settingsSection("Team Access", teamBody)}
      ${settingsSection("Google Services", servicesBody)}
      ${settingsSection("Bulk Photos", bulkBody)}
      ${settingsSection("Categories From Sheet", renderCategoryEditor(), true)}
      ${settingsSection("Audit", renderAuditSettingsBody())}
      ${settingsSection("Current Project", projectBody)}
      ${settingsSection("About", `<div class="integration-list"><div class="integration-row"><span><strong>Version</strong><span>v${APP_VERSION}</span></span>${statusPill("Complete")}</div><div class="integration-row"><span><strong>Data owner</strong><span>${escapeHtml(PRIMARY_OWNER_EMAIL)}</span></span>${statusPill(owner ? "You" : "Shared")}</div></div><div class="settings-action-strip"><button class="ghost-button" data-action="wipe-local">${icon("trash")}Wipe local cache</button></div>`)}
    </section>`;
}

function renderAuditSettingsBody() {
  const av = state.auditView;
  const filtered = av.loaded ? filteredAuditRows() : [];
  return `
    <div class="settings-action-strip">
      <button class="ghost-button" data-action="audit-load">${icon("refresh")}${av.loading ? "Loading..." : av.loaded ? "Refresh audit" : "Load audit"}</button>
      <button class="primary-button" data-action="audit-download" ${!av.loaded || !filtered.length ? "disabled" : ""}>${icon("download")}Download CSV (${filtered.length})</button>
    </div>
    ${av.loaded ? `<div class="audit-table-wrap settings-audit-table"><table class="audit-table"><thead><tr><th>Timestamp</th><th>User</th><th>Action</th><th>Project</th><th>Details</th></tr></thead><tbody>${filtered.slice(0, 80).map((r) => `<tr><td>${escapeHtml(r.timestamp)}</td><td>${escapeHtml(r.user)}</td><td>${escapeHtml(r.action)}</td><td>${escapeHtml(r.projectName || r.projectId)}</td><td>${escapeHtml(r.details)}</td></tr>`).join("")}</tbody></table></div>` : `<div class="empty-state">Audit is fetched on demand.</div>`}
  `;
}

function renderCategoryEditor() {
  const tabs = Object.keys(state.categoriesData || {});
  const current = state.ui.categoryEditorTab && state.categoriesData[state.ui.categoryEditorTab] ? state.ui.categoryEditorTab : tabs[0] || "";
  const data = current ? state.categoriesData[current] : { color: "#0ea5e9", items: [] };
  const csv = categoryDataToCsv(data.items || []);
  return `
    <div class="settings-action-strip">
      <button class="ghost-button" data-action="refresh-categories">${icon("refresh")}Refresh</button>
      <button class="primary-button" data-action="save-category-csv">${icon("save")}Save category CSV</button>
    </div>
    <div class="category-editor-grid">
      <label class="field"><span>Category tab</span><select data-category-editor-tab>${tabs.length ? tabs.map((tab) => `<option value="${escapeHtml(tab)}" ${tab === current ? "selected" : ""}>${escapeHtml(tab)}</option>`).join("") : `<option value="">New category</option>`}</select></label>
      <label class="field"><span>New / rename category</span><input id="categoryEditorName" value="${escapeHtml(current)}" placeholder="Electrical" /></label>
      <label class="field"><span>Tab colour</span><input id="categoryEditorColor" type="color" value="${escapeHtml(data.color || "#0ea5e9")}" /></label>
      <label class="field full"><span>CSV rows</span><textarea id="categoryEditorCsv" class="category-csv-editor" spellcheck="false">${escapeHtml(csv)}</textarea></label>
    </div>
  `;
}

function categoryDataToCsv(items) {
  const rows = [["Item", "Code", "Description", "Color", "Shorthand"], ...(items || []).map((i) => [i.item || "", i.code || "", i.description || "", i.color || "", i.shorthand || ""])];
  return rows.map((row) => row.map(csvEscape).join(",")).join("\n");
}

function csvEscape(value) {
  const text = String(value ?? "");
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function parseCsvLine(line) {
  const out = [];
  let cur = "";
  let quoted = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (ch === '"' && quoted && line[i + 1] === '"') { cur += '"'; i += 1; continue; }
    if (ch === '"') { quoted = !quoted; continue; }
    if (ch === "," && !quoted) { out.push(cur); cur = ""; continue; }
    cur += ch;
  }
  out.push(cur);
  return out.map((v) => v.trim());
}

function parseCategoryCsv(text) {
  const lines = String(text || "").split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  if (!lines.length) return [];
  const first = parseCsvLine(lines[0]).map((h) => h.toLowerCase());
  const hasHeader = first.includes("item");
  return lines.slice(hasHeader ? 1 : 0).map((line) => {
    const [item, code, description, color, shorthand] = parseCsvLine(line);
    return { item: item || "", code: code || "", description: description || "", color: color || "", shorthand: (shorthand || "").slice(0, 4) };
  }).filter((row) => row.item);
}

function hexToRgbColor(hex) {
  const clean = String(hex || "").replace("#", "");
  const full = clean.length === 3 ? clean.split("").map((c) => c + c).join("") : clean;
  const num = Number.parseInt(full || "0ea5e9", 16);
  return {
    red: ((num >> 16) & 255) / 255,
    green: ((num >> 8) & 255) / 255,
    blue: (num & 255) / 255
  };
}

async function refreshAllPlannerData() {
  if (!isTokenValid()) { toast("Sign in first"); return; }
  try {
    state.googleAuth.bootstrapping = true;
    render();
    await Promise.all([
      refreshCategories(),
      refreshUsers(),
      refreshBulkPhotos({ silent: true }),
      importMasterPhotos({ silent: true })
    ]);
    await syncAllDriveFolders({ silent: true });
    await hydrateFromMasterSheet({ silent: true, preferCloud: true });
    toast("Planner refreshed");
  } catch (e) {
    toast("Refresh failed: " + describeError(e));
  } finally {
    state.googleAuth.bootstrapping = false;
    render();
  }
}

async function saveCategoryCsvFromSettings() {
  if (!isTokenValid() || !state.drive.categoriesSheetId) { toast("Categories sheet is not ready"); return; }
  const selectedTab = document.querySelector("[data-category-editor-tab]")?.value || "";
  const tabName = (document.getElementById("categoryEditorName")?.value || selectedTab || "New Category").trim();
  const color = document.getElementById("categoryEditorColor")?.value || "#0ea5e9";
  const rows = parseCategoryCsv(document.getElementById("categoryEditorCsv")?.value || "");
  if (!tabName) { toast("Name the category tab first"); return; }
  try {
    const meta = await gapi.client.sheets.spreadsheets.get({
      spreadsheetId: state.drive.categoriesSheetId,
      fields: "sheets.properties.title,sheets.properties.sheetId"
    });
    let sheet = (meta.result.sheets || []).find((s) => s.properties.title === selectedTab || s.properties.title === tabName);
    if (!sheet) {
      const created = await gapi.client.sheets.spreadsheets.batchUpdate({
        spreadsheetId: state.drive.categoriesSheetId,
        resource: { requests: [{ addSheet: { properties: { title: tabName, tabColor: hexToRgbColor(color) } } }] }
      });
      const sheetId = created.result.replies?.[0]?.addSheet?.properties?.sheetId;
      sheet = { properties: { title: tabName, sheetId } };
    } else {
      await gapi.client.sheets.spreadsheets.batchUpdate({
        spreadsheetId: state.drive.categoriesSheetId,
        resource: { requests: [{ updateSheetProperties: { properties: { sheetId: sheet.properties.sheetId, title: tabName, tabColor: hexToRgbColor(color) }, fields: "title,tabColor" } }] }
      });
    }
    await gapi.client.sheets.spreadsheets.values.clear({
      spreadsheetId: state.drive.categoriesSheetId,
      range: `${tabName}!A:E`
    });
    await gapi.client.sheets.spreadsheets.values.update({
      spreadsheetId: state.drive.categoriesSheetId,
      range: `${tabName}!A1:E${rows.length + 1}`,
      valueInputOption: "RAW",
      resource: { values: [CATEGORIES_HEADER, ...rows.map((r) => [r.item, r.code, r.description, r.color, r.shorthand])] }
    });
    state.ui.categoryEditorTab = tabName;
    await refreshCategories();
    toast(`${tabName} saved`);
  } catch (e) {
    toast("Category save failed: " + describeError(e));
  }
}

async function repairMovedSearchImages() {
  if (!isTokenValid()) { toast("Sign in first"); return; }
  state.ui.imageRepairRunning = true;
  render();
  try {
    const nodesById = new Map(state.nodes.map((node) => [node.id, node]));
    let pageToken = null;
    let added = 0;
    do {
      const resp = await gapi.client.drive.files.list({
        q: "appProperties has { key='source' and value='Search' } and trashed=false",
        fields: "nextPageToken,files(id,name,mimeType,thumbnailLink,webViewLink,createdTime,appProperties)",
        pageToken,
        pageSize: 100
      });
      pageToken = resp.result.nextPageToken || null;
      (resp.result.files || []).forEach((file) => {
        const nodeId = file.appProperties?.nodeId || "";
        const node = nodesById.get(nodeId);
        if (!node) return;
        node.imageRefs = Array.isArray(node.imageRefs) ? node.imageRefs : [];
        if (node.imageRefs.some((image) => (image.driveFileId || image.id) === file.id)) return;
        node.imageRefs.push({
          id: `photo-${file.id}`,
          driveFileId: file.id,
          name: file.name || "",
          uploader: file.appProperties?.uploadedBy || file.appProperties?.uploader || "Neill Search",
          uploadedAt: file.createdTime || nowStamp(),
          mimeType: file.mimeType || "",
          webViewLink: file.webViewLink || "",
          thumbnailLink: file.thumbnailLink || ""
        });
        node.updatedAt = nowStamp();
        added += 1;
      });
    } while (pageToken);
    if (added) {
      persist({ skipSync: true });
      await syncMasterSheet({ silent: true });
      render();
    }
    toast(added ? `Recovered ${added} moved image${added === 1 ? "" : "s"}` : "No missing Search images found");
  } catch (e) {
    toast("Image search failed: " + describeError(e));
  } finally {
    state.ui.imageRepairRunning = false;
    render();
  }
}

function renderDrawer(node) {
  const isPortal = node.type === "portal";
  const isSwitchboard = node.type === "switchboard" || node.type === "subboard";
  const linkedProject = isPortal ? projectById(node.linkedProjectId) : null;
  const linkedFloor = linkedProject ? floorById(linkedProject, node.linkedFloorId) : null;
  const linkedLabel = [linkedProject?.name, linkedFloor?.name, roomName(node.linkedRoomId)].filter(Boolean).join(" / ");
  const catColor = nodeColor(node);
  const swbUrl = isSwitchboard && node.swbProjectId ? `${SWB_APP_URL}?project=${node.swbProjectId}` : SWB_APP_URL;
  const swbLinked = isSwitchboard && Boolean(node.swbProjectId);
  return `
    <div class="drawer-backdrop" data-action="close-drawer"></div>
    <aside class="drawer" role="dialog" aria-label="${escapeHtml(nodeDisplayTitle(node))}">
      <div class="drawer-header"><div class="drawer-title"><h3>${isPortal ? icon("portal") : isSwitchboard ? icon("switchboard") : ""}${escapeHtml(nodeDisplayTitle(node))}</h3><p>${isPortal ? `Door / link to ${linkedLabel ? `<strong>${escapeHtml(linkedLabel)}</strong>` : "(unlinked)"}` : isSwitchboard ? `${escapeHtml(node.boardLabel || node.type)} · ${escapeHtml(node.phaseConfig || "")}${node.mainBreakerA ? ` · ${node.mainBreakerA}A` : ""}` : `<span class="category-dot" style="--cat:${catColor}"></span>${escapeHtml(node.category || "-")} / ${escapeHtml(roomLabel(node.roomId))} / ${escapeHtml(node.assignedTo || "Unassigned")}`}</p></div><button class="icon-button" data-action="close-drawer" aria-label="Close">${icon("close")}</button></div>
      ${isSwitchboard ? `<div class="swb-link-strip${swbLinked ? " is-linked" : ""}"><div class="swb-link-strip-inner">${icon("swb")}<div><strong>${swbLinked ? "Linked to SWB" : "Not linked to SWB"}</strong><span>${swbLinked ? `Project: ${escapeHtml(node.swbProjectId)}` : "Open SWB to link this board"}</span></div></div><a href="${escapeHtml(swbUrl)}" target="_blank" rel="noopener" class="primary-button swb-open-btn">${icon("swb")} Open in SWB ↗</a></div>` : ""}
      <div class="drawer-body">
        <div class="drawer-actions">${statusPill(node.status)}${isPortal && linkedProject ? `<button class="primary-button" data-action="follow-portal">${icon("arrowRight")}Walk to ${escapeHtml(linkedLabel || linkedProject.name)}</button>` : ""}<button class="icon-button" data-action="share-node" title="Share">${icon("share")}</button><button class="icon-button" data-action="edit-node" title="Edit">${icon("edit")}</button>${!isPortal ? `<button class="icon-button" data-action="clone-node" title="Duplicate">${icon("copy")}</button>` : ""}<button class="icon-button" data-action="delete-node" title="Delete">${icon("trash")}</button></div>
        ${!isPortal ? `
        <div class="quick-edit">${renderSelect("quick-status", Object.keys(statusMeta), node.status).replace('data-filter="quick-status"', 'data-quick-status="true"')}<label class="ghost-button" style="cursor:pointer">${icon("upload")}<span>Upload photos</span><input type="file" accept="image/*" multiple data-photo-upload="${node.id}" style="display:none" /></label>${isAdmin() ? `<button class="ghost-button" data-action="bulk-photo-picker">${icon("folder")}Pick bulk photo</button>` : ""}</div>
        <div class="size-control"><label>Marker size: <strong>${Math.round((node.size || 1) * 100)}%</strong></label><input type="range" min="0.5" max="3" step="0.1" value="${node.size || 1}" data-node-size="${node.id}" aria-label="Marker size" /></div>
        <div class="info-grid"><div class="info-box"><span>Images</span><strong>${node.imageRefs.length}</strong></div><div class="info-box"><span>Room</span><strong>${escapeHtml(roomLabel(node.roomId))}</strong></div><div class="info-box"><span>Category</span><strong>${escapeHtml(node.category || "-")}</strong></div><div class="info-box"><span>Updated</span><strong>${escapeHtml(node.updatedAt)}</strong></div></div>
        <div><h3 class="section-title">Notes</h3><textarea data-notes="${node.id}" aria-label="Node notes">${escapeHtml(node.description || "")}</textarea></div>
        <div><h3 class="section-title">Gallery</h3>${node.imageRefs.length ? `<div class="gallery-grid">${node.imageRefs.map((image, index) => `<button class="image-tile" style="--thumb:linear-gradient(135deg,#1e293b,#334155)" data-lightbox="${index}" aria-label="${escapeHtml(image.name)}">${image.thumbnailLink ? `<img src="${escapeHtml(image.thumbnailLink)}" alt="${escapeHtml(image.name)}" loading="lazy" referrerpolicy="no-referrer" style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover" />` : ""}<span>${escapeHtml(image.name)}</span></button>`).join("")}</div>` : `<div class="empty-state">No images. Use "Upload photos" above.</div>`}</div>
        <div><h3 class="section-title">Comments</h3><div class="comments-list">${node.comments.length ? node.comments.map((c) => `<article class="comment"><span class="comment-meta">${escapeHtml(c.author)} / ${escapeHtml(c.time)}</span><p>${escapeHtml(c.text)}</p></article>`).join("") : `<div class="empty-state">No comments</div>`}</div><div class="comment-input" style="margin-top:10px"><input data-comment-input="${node.id}" placeholder="@mention or comment" aria-label="Add comment" /><button class="icon-button" data-action="send-comment" aria-label="Send">${icon("arrowRight")}</button></div></div>
        ` : `<div class="info-grid"><div class="info-box"><span>Linked destination</span><strong>${escapeHtml(linkedLabel || "(missing)")}</strong></div><div class="info-box"><span>Current room</span><strong>${escapeHtml(roomLabel(node.roomId))}</strong></div><div class="info-box"><span>Updated</span><strong>${escapeHtml(node.updatedAt)}</strong></div></div><p style="margin-top:14px;color:rgba(255,255,255,.7)">This is a door / stairs / link node. Walk through to the linked floor or room. Both sides have a matching portal that updates together.</p>`}
      </div>
    </aside>`;
}

function renderModal() {
  const m = state.modal;
  if (m.mode === "new-folder" || m.mode === "rename-folder") return renderFolderModal(m.folderId);
  if (m.mode === "new-project" || m.mode === "edit-project") return renderProjectModal(m.mode === "edit-project");
  if (m.mode === "create" || m.mode === "edit") return renderNodeModal();
  if (m.mode === "mass-pick") return renderMassPickModal();
  if (m.mode === "portal-create") return renderPortalCreateModal();
  if (m.mode === "add-floor" || m.mode === "rename-floor") return renderFloorModal();
  if (m.mode === "new-room" || m.mode === "rename-room") return renderRoomModal();
  if (m.mode === "bulk-photo-picker") return renderBulkPhotoPickerModal();
  if (m.mode === "help") return renderHelpModal();
  if (m.mode === "print-preview") return renderPrintPreviewModal();
  return "";
}

function renderFolderModal(folderId = null) {
  const existing = folderId ? state.projectFolders.find((f) => f.id === folderId) : null;
  const defaultColor = DEFAULT_FOLDER_COLORS[state.projectFolders.length % DEFAULT_FOLDER_COLORS.length];
  return `<div class="modal-backdrop" data-action="close-modal"></div><form class="modal" id="folderForm" role="dialog"><div class="modal-header"><div><h3>${existing ? "Edit folder" : "New folder"}</h3><p>Group projects (e.g. "Tower A", "Apartments")</p></div><button type="button" class="icon-button" data-action="close-modal">${icon("close")}</button></div><div class="modal-body"><div class="form-grid"><div class="field full"><label for="folderName">Name</label><input id="folderName" name="name" required value="${escapeHtml(existing?.name || "")}" placeholder="Apartments" /></div><div class="field"><label for="folderColor">Colour</label><input id="folderColor" name="color" type="color" value="${escapeHtml(existing?.color || defaultColor)}" /></div></div>${existing ? `<input type="hidden" name="folderId" value="${escapeHtml(existing.id)}" />` : ""}</div><div class="modal-actions"><button type="button" class="ghost-button" data-action="close-modal">Cancel</button><button class="primary-button" type="submit">${icon("check")}Save</button></div></form>`;
}

function renderProjectModal(isEdit) {
  const existing = isEdit ? project() : null;
  return `<div class="modal-backdrop" data-action="close-modal"></div><form class="modal" id="projectForm" role="dialog"><div class="modal-header"><div><h3>${isEdit ? "Edit project" : "New project"}</h3><p>Drive folder will be created at /${DRIVE_ROOT_NAME}/${DRIVE_PROJECTS_FOLDER}/&lt;folder&gt;/&lt;project&gt;/</p></div><button type="button" class="icon-button" data-action="close-modal">${icon("close")}</button></div><div class="modal-body"><div class="form-grid"><div class="field full"><label for="projectName">Name</label><input id="projectName" name="name" required value="${escapeHtml(existing?.name || "")}" placeholder="Tower A Stage 1" /></div><div class="field"><label for="projectFolder">Folder</label><select id="projectFolder" name="folderId"><option value="">${DRIVE_UNFILED_FOLDER}</option>${state.projectFolders.map((f) => `<option value="${f.id}" ${f.id === existing?.folderId ? "selected" : ""}>${escapeHtml(f.name)}</option>`).join("")}</select></div><div class="field"><label for="projectFirstFloor">First floor name</label><input id="projectFirstFloor" name="firstFloor" value="${escapeHtml(existing?.floors?.[0]?.name || "Ground floor")}" placeholder="Ground floor" /></div><div class="field full"><label for="projectAddress">Address</label><input id="projectAddress" name="address" value="${escapeHtml(existing?.address || "")}" placeholder="25 Watts Parade, Mount Eliza VIC" autocomplete="off" data-project-address /></div><label class="check-row full"><input type="checkbox" name="protected" ${existing?.protected ? "checked" : ""} /><span><strong>Protect this job from format</strong><small>Keeps this project when Format data is run.</small></span></label><div class="field full"><label for="projectDescription">Description</label><textarea id="projectDescription" name="description">${escapeHtml(existing?.description || "")}</textarea></div></div></div><div class="modal-actions">${isEdit ? `<button type="button" class="danger-button" data-action="delete-project">${icon("trash")}Delete project</button>` : ""}<button type="button" class="ghost-button" data-action="close-modal">Cancel</button><button class="primary-button" type="submit">${icon("check")}Save</button></div></form>`;
}

function renderFloorModal() {
  const isRename = state.modal.mode === "rename-floor";
  const existing = isRename ? currentFloor() : null;
  return `<div class="modal-backdrop" data-action="close-modal"></div><form class="modal" id="floorForm" role="dialog"><div class="modal-header"><div><h3>${isRename ? "Rename floor" : "Add floor"}</h3><p>${escapeHtml(project()?.name || "")}</p></div><button type="button" class="icon-button" data-action="close-modal">${icon("close")}</button></div><div class="modal-body"><div class="form-grid"><div class="field full"><label for="floorName">Floor name</label><input id="floorName" name="name" required value="${escapeHtml(existing?.name || "")}" placeholder="Level 1" /></div></div></div><div class="modal-actions"><button type="button" class="ghost-button" data-action="close-modal">Cancel</button><button class="primary-button" type="submit">${icon("check")}Save</button></div></form>`;
}

function renderRoomModal() {
  const isRename = state.modal.mode === "rename-room";
  const existing = isRename ? roomById(state.modal.roomId) : null;
  return `<div class="modal-backdrop" data-action="close-modal"></div><form class="modal" id="roomForm" role="dialog"><div class="modal-header"><div><h3>${isRename ? "Rename room" : "Add room"}</h3><p>${escapeHtml(currentFloor()?.name || "")}</p></div><button type="button" class="icon-button" data-action="close-modal">${icon("close")}</button></div><div class="modal-body"><div class="form-grid"><div class="field full"><label for="roomName">Room name</label><input id="roomName" name="name" required value="${escapeHtml(existing?.name || "")}" placeholder="Comms room" /></div>${existing ? `<input type="hidden" name="roomId" value="${escapeHtml(existing.id)}" />` : ""}</div></div><div class="modal-actions"><button type="button" class="ghost-button" data-action="close-modal">Cancel</button><button class="primary-button" type="submit">${icon("check")}Save</button></div></form>`;
}

function renderNodeModal() {
  const proj = project(); if (!proj) return "";
  const isEdit = state.modal.mode === "edit";
  const node = isEdit ? selectedNode() : null;
  const nodeType = state.modal.nodeType || node?.type || "marker";
  const isSwitchboard = nodeType === "switchboard" || nodeType === "subboard";
  const cats = categoryNames();
  if (!cats.length && !isSwitchboard) {
    return `<div class="modal-backdrop" data-action="close-modal"></div><div class="modal" role="dialog"><div class="modal-header"><div><h3>No categories yet</h3></div><button type="button" class="icon-button" data-action="close-modal">${icon("close")}</button></div><div class="modal-body"><p>Add line items to the ${CATEGORIES_SHEET_NAME} sheet (under Admin Files), then hit Refresh categories in Settings.</p></div><div class="modal-actions"><button class="ghost-button" data-action="close-modal">Close</button></div></div>`;
  }
  const initialCategory = node?.category || cats[0] || "";
  const items = categoryItems(initialCategory);
  const initialItem = node?.lineItem || items[0]?.item || "";
  const assignees = teamNames();
  const rooms = floorRooms();
  const initialRoom = node?.roomId || (state.selectedRoomId !== "all" ? state.selectedRoomId : "");
  const nodeTypeOptions = [
    ["marker","Marker (default)"],
    ["portal","Door / Portal"],
    ["switchboard","Switchboard (MSB)"],
    ["subboard","Sub-board (SSB)"],
  ];
  const swbSection = isSwitchboard ? `
    <div class="field"><label for="nodeBoardLabel">Board label</label><input id="nodeBoardLabel" name="boardLabel" value="${escapeHtml(node?.boardLabel || (nodeType==="switchboard"?"Main Switchboard":"Sub-board"))}" placeholder="MSB / SSB-Kitchen" /></div>
    <div class="field"><label for="nodePhaseConfig">Phase config</label><select id="nodePhaseConfig" name="phaseConfig"><option value="" ${!node?.phaseConfig?"selected":""}>—</option><option value="single" ${node?.phaseConfig==="single"?"selected":""}>Single phase</option><option value="3ph" ${node?.phaseConfig==="3ph"?"selected":""}>Three phase</option></select></div>
    <div class="field"><label for="nodeMainBreakerA">Main breaker (A)</label><input id="nodeMainBreakerA" name="mainBreakerA" type="number" min="6" max="400" value="${escapeHtml(String(node?.mainBreakerA||"63"))}" /></div>
    <div class="field"><label for="nodeSwbProjectId">SWB Project ID <span class="form-note">(auto-filled by SWB)</span></label><input id="nodeSwbProjectId" name="swbProjectId" value="${escapeHtml(node?.swbProjectId||"")}" placeholder="Leave blank — SWB will set this" /></div>` : `
    <div class="field"><label for="nodeCircuit">Circuit</label><input id="nodeCircuit" name="circuit" value="${escapeHtml(node?.circuit||"")}" placeholder="e.g. L1-7" /></div>
    <div class="field"><label for="nodeCableRunM">Cable run (m)</label><input id="nodeCableRunM" name="cableRunM" type="number" step="0.5" min="0" value="${escapeHtml(String(node?.cableRunM||""))}" placeholder="0" /></div>`;
  return `<div class="modal-backdrop" data-action="close-modal"></div><form class="modal" id="nodeForm" role="dialog">
    <div class="modal-header"><div><h3>${isEdit ? "Edit Node" : "Create Node"}</h3><p>${escapeHtml(currentFloor()?.name || "")}</p></div><button type="button" class="icon-button" data-action="close-modal">${icon("close")}</button></div>
    <div class="modal-body"><div class="form-grid">
      <div class="field"><label for="nodeType">Node type</label><select id="nodeType" name="nodeType">${nodeTypeOptions.map(([v,l])=>`<option value="${v}" ${nodeType===v?"selected":""}>${l}</option>`).join("")}</select></div>
      ${isSwitchboard ? "" : `<div class="field"><label for="nodeCategory">Category</label><select id="nodeCategory" name="category" data-node-category>${cats.map((c) => `<option value="${escapeHtml(c)}" ${initialCategory === c ? "selected" : ""}>${escapeHtml(c)}</option>`).join("")}</select></div>`}
      ${isSwitchboard ? "" : `<div class="field"><label for="nodeItem">Line item</label><select id="nodeItem" name="lineItem" data-node-item>${items.length ? items.map((i) => `<option value="${escapeHtml(i.item)}" ${initialItem === i.item ? "selected" : ""}>${escapeHtml(i.item)}${i.code ? ` (${escapeHtml(i.code)})` : ""}</option>`).join("") : `<option value="">No line items in this tab</option>`}</select></div>`}
      <div class="field"><label for="nodeStatus">Status</label><select id="nodeStatus" name="status">${Object.keys(statusMeta).map((s) => `<option value="${escapeHtml(s)}" ${(node?.status || "Not Started") === s ? "selected" : ""}>${escapeHtml(s)}</option>`).join("")}</select></div>
      <div class="field"><label for="nodeRoom">Room</label><select id="nodeRoom" name="roomId"><option value="">No room</option>${rooms.map((r) => `<option value="${escapeHtml(r.id)}" ${initialRoom === r.id ? "selected" : ""}>${escapeHtml(r.name)}</option>`).join("")}</select></div>
      <div class="field"><label for="nodeAssigned">Assigned to</label><select id="nodeAssigned" name="assignedTo"><option value="">Unassigned</option>${assignees.map((u) => `<option value="${escapeHtml(u)}" ${node?.assignedTo === u ? "selected" : ""}>${escapeHtml(u)}</option>`).join("")}</select></div>
      <div class="field full"><label for="nodeCustomTitle">Name</label><input id="nodeCustomTitle" name="customTitle" value="${escapeHtml(node?.customTitle || (isEdit ? "" : autoSuggestName(initialItem)))}" placeholder="e.g. GPO 7, MSB Level 1" /><span class="form-note">Leave blank to use the line item as the title.</span></div>
      ${swbSection}
      <div class="field"><label for="nodeTags">Tags</label><input id="nodeTags" name="tags" value="${escapeHtml(node?.tags?.join(", ") || "")}" placeholder="entry, urgent" /></div>
      <div class="field full"><label for="nodeDescription">Notes</label><textarea id="nodeDescription" name="description">${escapeHtml(node?.description || "")}</textarea></div>
      <div class="field full"><label for="nodeImages">Initial photos (optional)</label><input id="nodeImages" name="images" type="file" accept="image/*" multiple /></div>
    </div></div>
    <div class="modal-actions">${isEdit ? `<button type="button" class="danger-button" data-action="delete-node">${icon("trash")}Delete</button>` : ""}<button type="button" class="ghost-button" data-action="close-modal">Cancel</button><button class="primary-button" type="submit">${icon("check")}Save</button></div>
  </form>`;
}

function renderMassPickModal() {
  const cats = categoryNames();
  const initialCategory = state.modal.category || cats[0];
  const items = categoryItems(initialCategory);
  return `<div class="modal-backdrop" data-action="close-modal"></div><form class="modal" id="massForm" role="dialog"><div class="modal-header"><div><h3>Mass place nodes</h3><p>Pick what to drop. Click the plan to place. ESC to stop.</p></div><button type="button" class="icon-button" data-action="close-modal">${icon("close")}</button></div><div class="modal-body"><div class="form-grid"><div class="field"><label for="massCategory">Category</label><select id="massCategory" name="category" data-node-category>${cats.map((c) => `<option value="${escapeHtml(c)}" ${initialCategory === c ? "selected" : ""}>${escapeHtml(c)}</option>`).join("")}</select></div><div class="field"><label for="massItem">Line item</label><select id="massItem" name="lineItem" data-node-item>${items.length ? items.map((i) => `<option value="${escapeHtml(i.item)}">${escapeHtml(i.item)}${i.code ? ` (${escapeHtml(i.code)})` : ""}</option>`).join("") : `<option value="">No line items in this tab</option>`}</select></div><div class="field"><label for="massStatus">Status</label><select id="massStatus" name="status">${Object.keys(statusMeta).map((s) => `<option value="${escapeHtml(s)}" ${s === "Not Started" ? "selected" : ""}>${escapeHtml(s)}</option>`).join("")}</select></div></div></div><div class="modal-actions"><button type="button" class="ghost-button" data-action="close-modal">Cancel</button><button class="primary-button" type="submit">${icon("mass")}Start placing</button></div></form>`;
}

function renderPortalCreateModal() {
  const proj = project();
  const others = state.projects;
  const currentRooms = floorRooms();
  const initialTarget = others[0];
  const initialTargetFloor = initialTarget?.floors?.[0] || null;
  const initialTargetRooms = initialTargetFloor ? floorRooms(initialTargetFloor.id) : [];
  return `<div class="modal-backdrop" data-action="close-modal"></div><form class="modal" id="portalForm" role="dialog"><div class="modal-header"><div><h3>Add door / stairs</h3><p>Link floors or rooms. A matching return door is created automatically.</p></div><button type="button" class="icon-button" data-action="close-modal">${icon("close")}</button></div><div class="modal-body"><div class="form-grid"><div class="field full"><label for="portalLabel">Label</label><input id="portalLabel" name="label" required placeholder="Door to Store Room" /></div><div class="field"><label for="portalSourceRoom">From room</label><select id="portalSourceRoom" name="sourceRoomId"><option value="">No room</option>${currentRooms.map((r) => `<option value="${escapeHtml(r.id)}" ${state.selectedRoomId === r.id ? "selected" : ""}>${escapeHtml(r.name)}</option>`).join("")}</select></div><div class="field"><label for="portalTarget">Links to project</label><select id="portalTarget" name="targetProjectId" required data-portal-target>${others.length ? others.map((p) => `<option value="${p.id}">${escapeHtml(p.name)}</option>`).join("") : `<option value="">No projects exist yet</option>`}</select></div><div class="field"><label for="portalFloor">Target floor</label><select id="portalFloor" name="targetFloorId" data-portal-floor>${initialTarget ? (initialTarget.floors || []).map((f) => `<option value="${f.id}">${escapeHtml(f.name)}</option>`).join("") : `<option value="">No floors</option>`}</select></div><div class="field"><label for="portalTargetRoom">Target room</label><select id="portalTargetRoom" name="targetRoomId"><option value="">No room</option>${initialTargetRooms.map((r) => `<option value="${escapeHtml(r.id)}">${escapeHtml(r.name)}</option>`).join("")}</select></div><div class="field full"><label for="portalReturn">Return door label</label><input id="portalReturn" name="returnLabel" placeholder="Door back" /></div></div></div><div class="modal-actions"><button type="button" class="ghost-button" data-action="close-modal">Cancel</button><button class="primary-button" type="submit" ${state.projects.length ? "" : "disabled"}>${icon("check")}Create door</button></div></form>`;
}

function renderPrintPreviewModal() {
  const proj = project(); if (!proj) return "";
  const floor = currentFloor();
  const nodes = floor ? floorNodes(floor.id) : [];
  const planUrl = floor ? state.floorPlans[floor.id] : null;
  const planAspect = Number(floor?.planAspectRatio) || 1.6;
  return `
    <div class="modal-backdrop" data-action="close-modal"></div>
    <div class="modal print-modal" role="dialog">
      <div class="modal-header"><div><h3>Print / PDF preview</h3><p>${escapeHtml(proj.name)} / ${escapeHtml(floor?.name || "")}</p></div><button type="button" class="icon-button" data-action="close-modal">${icon("close")}</button></div>
      <div class="modal-body">
        <div class="print-page" id="printPage">
          <header class="print-header">
            <h1>${escapeHtml(proj.name)}</h1>
            <p>${escapeHtml(proj.address || "")} &middot; Floor: ${escapeHtml(floor?.name || "-")} &middot; Generated ${escapeHtml(nowStamp())}</p>
            <p>Owner: ${escapeHtml(PRIMARY_OWNER_EMAIL)} &middot; Total nodes (this floor): ${nodes.length}</p>
          </header>
          ${planUrl ? `<div class="print-plan" style="--plan-ar:${planAspect}"><img src="${escapeHtml(planUrl)}" alt="Floor plan" /><div class="print-marker-layer">${nodes.map((n) => { const sh = nodeShorthand(n) || nodeDisplayTitle(n).slice(0, 4); return `<span class="print-marker" data-len="${sh.length}" style="--x:${n.position.x};--y:${n.position.y};--cat:${nodeColor(n)};${statusStyle(n.status)}">${escapeHtml(sh)}</span>`; }).join("")}</div></div>` : "<p>(No floor plan uploaded.)</p>"}
          <h2>Node Schedule</h2>
          <table class="print-table">
            <thead><tr><th>#</th><th>Title</th><th>Category</th><th>Line item</th><th>Status</th><th>Assignee</th><th>Tags</th><th>Updated</th></tr></thead>
            <tbody>${nodes.map((n, i) => `<tr><td>${i + 1}</td><td>${escapeHtml(nodeDisplayTitle(n))}</td><td>${escapeHtml(n.category || "")}</td><td>${escapeHtml(n.lineItem || "")}</td><td>${escapeHtml(n.status)}</td><td>${escapeHtml(n.assignedTo || "-")}</td><td>${escapeHtml((n.tags || []).join(", "))}</td><td>${escapeHtml(n.updatedAt || "")}</td></tr>`).join("")}</tbody>
          </table>
        </div>
      </div>
      <div class="modal-actions"><button type="button" class="ghost-button" data-action="close-modal">Close</button><button class="primary-button" data-action="print-now">${icon("printer")}Print / Save as PDF</button></div>
    </div>`;
}

function renderHelpModal() {
  const statuses = Object.keys(statusMeta);
  const cats = categoryNames();
  return `
    <div class="modal-backdrop" data-action="close-modal"></div>
    <div class="modal help-modal" role="dialog">
      <div class="modal-header"><div><h3>Help &amp; Legend</h3><p>Quick reference</p></div><button type="button" class="icon-button" data-action="close-modal">${icon("close")}</button></div>
      <div class="modal-body">
        <h4 class="help-h">Status (marker ring)</h4>
        <div class="help-legend">${statuses.map((n) => `<span class="legend-item"><span class="status-dot" style="${statusStyle(n)}"></span>${escapeHtml(n)}</span>`).join("")}</div>
        <h4 class="help-h">Categories (marker fill)${cats.length ? "" : " - none yet, add tabs to your Categories sheet"}</h4>
        <div class="help-legend">${cats.map((c) => `<span class="legend-item"><span class="category-dot" style="--cat:${categoryColor(c)}"></span>${escapeHtml(c)}</span>`).join("")}</div>
        <h4 class="help-h">Tips</h4>
        <ul class="help-tips">
          <li>Click anywhere on the plan to drop a new node.</li>
          <li>Drag a marker to move it. Shift-click to multi-select.</li>
          <li>Use the marker size slider in the drawer to resize a node.</li>
          <li>The <strong>Mass</strong> button lets you drop many of the same item in a row.</li>
          <li>The <strong>Door</strong> button creates a portal linking this floor to another project / floor.</li>
          <li><kbd>Esc</kbd> closes the active modal / drawer / mass mode.</li>
          <li>Categories &amp; line items live in <code>NeillPlanner-Categories</code> on Drive - edit there, then hit Refresh in Settings.</li>
        </ul>
      </div>
      <div class="modal-actions"><button class="ghost-button" data-action="close-modal">Close</button></div>
    </div>
  `;
}

function renderLightbox() {
  const node = selectedNode(); if (!node) return "";
  const image = node.imageRefs[state.lightbox.index]; if (!image) return "";
  return `<div class="lightbox-backdrop" data-action="close-lightbox"></div><div class="lightbox" role="dialog"><div class="lightbox-header"><div><h3>${escapeHtml(image.name)}</h3><p>${escapeHtml(image.uploader || "")} / ${escapeHtml(image.uploadedAt || "")}</p></div><div class="lightbox-actions">${image.webViewLink ? `<a class="icon-button" href="${escapeHtml(image.webViewLink)}" target="_blank" rel="noopener" aria-label="Open in Drive">${icon("link")}</a>` : ""}<button class="icon-button" data-action="prev-image" aria-label="Previous">${icon("arrowLeft")}</button><button class="icon-button" data-action="next-image" aria-label="Next">${icon("arrowRight")}</button><button class="icon-button" data-action="close-lightbox" aria-label="Close">${icon("close")}</button></div></div><div class="lightbox-stage">${image.thumbnailLink ? `<img src="${escapeHtml(image.thumbnailLink.replace(/=s\d+(-c)?$/, "=s1600"))}" alt="${escapeHtml(image.name)}" referrerpolicy="no-referrer" style="max-width:100%;max-height:100%;object-fit:contain;border-radius:8px" />` : `<div class="lightbox-image" style="--thumb:linear-gradient(135deg,#1e293b,#334155)"></div>`}</div></div>`;
}

function renderBulkPhotoPickerModal() {
  const node = selectedNode(); if (!node) return "";
  const available = state.bulkPhotos.filter((p) => (p.status || "Inbox") !== "Allocated");
  return `<div class="modal-backdrop" data-action="close-modal"></div><div class="modal bulk-photo-modal" role="dialog"><div class="modal-header"><div><h3>Pick bulk photo</h3><p>Allocate an inbox photo to ${escapeHtml(nodeDisplayTitle(node))}</p></div><button type="button" class="icon-button" data-action="close-modal">${icon("close")}</button></div><div class="modal-body">${available.length ? `<div class="bulk-photo-grid">${available.map((p) => `<button class="bulk-photo-tile" data-bulk-photo-assign="${escapeHtml(p.id)}">${p.thumbnailLink ? `<img src="${escapeHtml(p.thumbnailLink)}" alt="${escapeHtml(p.name)}" referrerpolicy="no-referrer" loading="lazy" />` : `<span class="bulk-photo-empty">${icon("upload")}</span>`}<strong>${escapeHtml(p.name || p.driveFileId)}</strong><span>${escapeHtml(p.uploadedAt || "")}</span></button>`).join("")}</div>` : `<div class="empty-state">No unallocated bulk photos. Upload a batch from Settings.</div>`}</div><div class="modal-actions"><button type="button" class="ghost-button" data-action="refresh-bulk-photos">${icon("refresh")}Refresh</button><button type="button" class="ghost-button" data-action="close-modal">Close</button></div></div>`;
}

/* ============================================================ EVENTS */

function bindEvents() {
  document.querySelectorAll("[data-view]").forEach((b) => b.addEventListener("click", () => { state.activeView = b.dataset.view; state.drawerOpen = state.activeView === "map" && Boolean(selectedNode()); persist(); render(); }));
  document.querySelectorAll("[data-project]").forEach((b) => b.addEventListener("click", () => selectProject(b.dataset.project)));
  document.querySelectorAll("[data-project-open]").forEach((b) => b.addEventListener("click", () => { selectProject(b.dataset.projectOpen); state.activeView = "map"; render(); }));
  document.querySelectorAll("[data-project-delete]").forEach((b) => b.addEventListener("click", (e) => { e.stopPropagation(); deleteProject(b.dataset.projectDelete); }));
  document.querySelectorAll("[data-folder]").forEach((b) => b.addEventListener("click", () => { state.selectedFolderId = b.dataset.folder; state.activeView = "projects"; state.drawerOpen = false; persist(); render(); }));
  document.querySelectorAll("[data-room]").forEach((b) => b.addEventListener("click", () => { state.selectedRoomId = b.dataset.room || "all"; state.selectedNodeId = null; state.drawerOpen = false; persist(); render(); }));
  document.querySelectorAll("[data-folder-color]").forEach((input) => input.addEventListener("change", () => {
    const folder = state.projectFolders.find((f) => f.id === input.dataset.folderColor); if (!folder) return;
    folder.color = input.value; persist(); render(); toast(`${folder.name} colour updated`);
    logAudit("Folder Edited", { details: `Colour set to ${input.value} for ${folder.name}` });
  }));
  document.querySelectorAll("[data-folder-rename]").forEach((b) => b.addEventListener("click", () => { state.modal = { mode: "rename-folder", folderId: b.dataset.folderRename }; render(); }));
  document.querySelectorAll("[data-folder-delete]").forEach((b) => b.addEventListener("click", () => deleteFolder(b.dataset.folderDelete)));
  document.querySelectorAll("[data-project-folder]").forEach((sel) => sel.addEventListener("change", () => {
    const item = projectById(sel.dataset.projectFolder); if (!item) return;
    const previousFolderId = item.folderId || null;
    item.folderId = sel.value || null;
    persist(); render(); toast(`${item.name} moved`);
    logAudit("Project Moved", { projectId: item.id, details: `Folder set to ${item.folderId ? state.projectFolders.find((f) => f.id === item.folderId)?.name : DRIVE_UNFILED_FOLDER}` });
    if (isTokenValid()) moveProjectDriveFolder(item, previousFolderId).catch((e) => console.warn(e));
  }));
  document.querySelectorAll("[data-floor]").forEach((b) => b.addEventListener("click", () => { if (b.dataset.dragged === "true") { b.dataset.dragged = ""; return; } state.selectedFloorId = b.dataset.floor; state.selectedRoomId = "all"; state.selectedNodeId = null; state.drawerOpen = false; persist(); render(); maybeFetchPlanForCurrentFloor(); }));
  bindFloorReorder();
  document.querySelectorAll("[data-node]").forEach((b) => b.addEventListener("click", (e) => {
    e.stopPropagation();
    if (e.shiftKey) return toggleBulkSelect(b.dataset.node);
    openNode(b.dataset.node);
  }));
  document.querySelectorAll("[data-filter]").forEach((input) => { const en = input.tagName === "INPUT" ? "input" : "change"; input.addEventListener(en, () => { state.filters[input.dataset.filter] = input.value; persist(); render(); }); });
  document.querySelectorAll("[data-audit-filter]").forEach((input) => { const en = input.tagName === "INPUT" ? "input" : "change"; input.addEventListener(en, () => { state.auditView.filters[input.dataset.auditFilter] = input.value; persist(); render(); }); });
  document.querySelectorAll("[data-action]").forEach((b) => b.addEventListener("click", handleAction));
  const quickStatus = document.querySelector("[data-quick-status]");
  if (quickStatus) quickStatus.addEventListener("change", () => updateNodeStatus(quickStatus.value));
  document.querySelectorAll("[data-notes]").forEach((textarea) => textarea.addEventListener("change", () => {
    const node = state.nodes.find((n) => n.id === textarea.dataset.notes); if (!node) return;
    node.description = textarea.value; node.updatedAt = nowStamp(); persist(); toast("Notes saved");
    logAudit("Notes Updated", { nodeId: node.id, details: "Notes edited" });
  }));
  document.querySelectorAll("[data-lightbox]").forEach((b) => b.addEventListener("click", () => { state.lightbox = { index: Number(b.dataset.lightbox) }; render(); }));
  document.querySelectorAll("[data-bulk-photo-assign]").forEach((b) => b.addEventListener("click", () => assignBulkPhotoToNode(b.dataset.bulkPhotoAssign)));
  document.querySelectorAll("[data-photo-upload]").forEach((input) => input.addEventListener("change", (e) => { const files = Array.from(e.target.files || []); if (files.length) uploadPhotosToNode(input.dataset.photoUpload, files); }));
  document.querySelectorAll("[data-node-size]").forEach((input) => {
    input.addEventListener("input", () => {
      const node = state.nodes.find((n) => n.id === input.dataset.nodeSize);
      if (!node) return;
      node.size = Number(input.value);
      node.updatedAt = nowStamp();
      const el = document.querySelector(`.node-marker[data-node="${node.id}"]`);
      if (el) el.style.setProperty("--size", node.size);
      const label = input.parentElement?.querySelector("label strong");
      if (label) label.textContent = Math.round(node.size * 100) + "%";
    });
    input.addEventListener("change", () => {
      const node = state.nodes.find((n) => n.id === input.dataset.nodeSize);
      if (!node) return;
      persist();
      logAudit("Marker Resized", { nodeId: node.id, details: `Size ${Math.round(node.size * 100)}%` });
    });
  });
  document.querySelectorAll("[data-node-category]").forEach((sel) => sel.addEventListener("change", () => {
    const itemSel = sel.form.querySelector("[data-node-item]"); if (!itemSel) return;
    const items = categoryItems(sel.value);
    itemSel.innerHTML = items.length ? items.map((i) => `<option value="${escapeHtml(i.item)}">${escapeHtml(i.item)}${i.code ? ` (${escapeHtml(i.code)})` : ""}</option>`).join("") : `<option value="">No line items in this tab</option>`;
    const nameInput = sel.form.querySelector('input[name="customTitle"]');
    if (nameInput && !nameInput.dataset.userEdited) {
      nameInput.value = autoSuggestName(items[0]?.item || "");
    }
  }));
  document.querySelectorAll("[data-node-item]").forEach((sel) => sel.addEventListener("change", () => {
    const nameInput = sel.form.querySelector('input[name="customTitle"]');
    if (nameInput && !nameInput.dataset.userEdited) {
      nameInput.value = autoSuggestName(sel.value);
    }
  }));
  document.querySelectorAll('input[name="customTitle"]').forEach((inp) => inp.addEventListener("input", () => { inp.dataset.userEdited = "1"; }));
  document.querySelectorAll("[data-portal-target]").forEach((sel) => sel.addEventListener("change", () => {
    const floorSel = sel.form.querySelector("#portalFloor"); if (!floorSel) return;
    const target = projectById(sel.value);
    const fs = target?.floors || [];
    floorSel.innerHTML = fs.length ? fs.map((f) => `<option value="${f.id}">${escapeHtml(f.name)}</option>`).join("") : `<option value="">No floors</option>`;
    updatePortalRoomOptions(sel.form);
  }));
  document.querySelectorAll("[data-portal-floor]").forEach((sel) => sel.addEventListener("change", () => updatePortalRoomOptions(sel.form)));
  document.querySelectorAll("[data-team-remove]").forEach((b) => b.addEventListener("click", () => removeTeamMember(b.dataset.teamRemove, b.dataset.teamEmail)));
  document.querySelectorAll("[data-category-editor-tab]").forEach((sel) => sel.addEventListener("change", () => {
    state.ui.categoryEditorTab = sel.value;
    persist({ skipSync: true });
    render();
  }));
  const bulkStatus = document.querySelector("[data-bulk-status]");
  if (bulkStatus) bulkStatus.addEventListener("change", (e) => { if (e.target.value) bulkSetStatus(e.target.value); });
  const bulkCategory = document.querySelector("[data-bulk-category]");
  if (bulkCategory) bulkCategory.addEventListener("change", (e) => { if (e.target.value) bulkSetCategory(e.target.value); });
  const nodeForm = document.getElementById("nodeForm"); if (nodeForm) nodeForm.addEventListener("submit", handleNodeForm);
  const folderForm = document.getElementById("folderForm"); if (folderForm) folderForm.addEventListener("submit", handleFolderForm);
  const projectForm = document.getElementById("projectForm"); if (projectForm) { projectForm.addEventListener("submit", handleProjectForm); initProjectAddressAutocomplete(); }
  const massForm = document.getElementById("massForm"); if (massForm) massForm.addEventListener("submit", handleMassForm);
  const portalForm = document.getElementById("portalForm"); if (portalForm) portalForm.addEventListener("submit", handlePortalForm);
  const floorForm = document.getElementById("floorForm"); if (floorForm) floorForm.addEventListener("submit", handleFloorForm);
  const roomForm = document.getElementById("roomForm"); if (roomForm) roomForm.addEventListener("submit", handleRoomForm);
  bindCanvasEvents();
  bindMarkerDrag();
}

function loadPlannerPlacesLibrary() {
  if (!hasGoogleApiKey) return Promise.reject(new Error("Google Maps API key is missing"));
  if (window.google?.maps?.places) return Promise.resolve();
  if (plannerPlacesPromise) return plannerPlacesPromise;
  plannerPlacesPromise = new Promise((resolve, reject) => {
    const callbackName = `initPlannerPlaces_${Date.now()}`;
    window[callbackName] = () => {
      delete window[callbackName];
      resolve();
    };
    const script = document.createElement("script");
    script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(googleConfig.googleApiKey)}&libraries=places&callback=${callbackName}`;
    script.async = true;
    script.defer = true;
    script.onerror = () => {
      plannerPlacesPromise = null;
      delete window[callbackName];
      reject(new Error("Address search could not load"));
    };
    document.head.appendChild(script);
  });
  return plannerPlacesPromise;
}

async function initProjectAddressAutocomplete() {
  const input = document.querySelector("[data-project-address]");
  if (!input || input.dataset.autocompleteBound) return;
  input.dataset.autocompleteBound = "pending";
  try {
    await loadPlannerPlacesLibrary();
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
    autocomplete.addListener("place_changed", () => {
      const place = autocomplete.getPlace();
      if (!isVictorianPlace(place)) {
        input.setCustomValidity("Select a street address in Victoria, Australia");
        toast("Select a street address in Victoria, Australia");
        return;
      }
      input.value = place.formatted_address || input.value;
      input.setCustomValidity("");
      input.dispatchEvent(new Event("input", { bubbles: true }));
      input.dispatchEvent(new Event("change", { bubbles: true }));
    });
    input.addEventListener("input", () => input.setCustomValidity(""));
    input.dataset.autocompleteBound = "true";
  } catch (e) {
    input.dataset.autocompleteBound = "";
    console.warn("Address autocomplete failed", e);
  }
}

function isVictorianPlace(place) {
  const components = place?.address_components || [];
  return components.some((component) =>
    component.types?.includes("administrative_area_level_1") &&
    (component.short_name === "VIC" || component.long_name === "Victoria")
  );
}

function bindFloorReorder() {
  let draggedId = null;
  document.querySelectorAll("[data-floor-tab]").forEach((tab) => {
    tab.addEventListener("dragstart", (e) => {
      draggedId = tab.dataset.floorTab;
      e.dataTransfer.effectAllowed = "move";
      e.dataTransfer.setData("text/plain", draggedId);
    });
    tab.addEventListener("dragover", (e) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = "move";
    });
    tab.addEventListener("drop", (e) => {
      e.preventDefault();
      const sourceId = draggedId || e.dataTransfer.getData("text/plain");
      const targetId = tab.dataset.floorTab;
      tab.dataset.dragged = "true";
      reorderFloor(sourceId, targetId);
    });
  });
}

function updatePortalRoomOptions(form) {
  const floorId = form.querySelector("#portalFloor")?.value || "";
  const roomSel = form.querySelector("#portalTargetRoom"); if (!roomSel) return;
  const rooms = floorRooms(floorId);
  roomSel.innerHTML = `<option value="">No room</option>${rooms.map((r) => `<option value="${escapeHtml(r.id)}">${escapeHtml(r.name)}</option>`).join("")}`;
}

function handleAction(event) {
  const action = event.currentTarget.dataset.action;
  if (["close-drawer", "close-modal", "close-lightbox"].includes(action)) event.preventDefault();
  switch (action) {
    case "google-sign-in": return signIn();
    case "google-sign-out": return signOut();
    case "google-bootstrap": return bootstrapDrive();
    case "sync-all-folders": return syncAllDriveFolders();
    case "refresh-all": return refreshAllPlannerData();
    case "sync-master-sheet": return syncMasterSheet();
    case "hydrate-cloud": return hydrateFromMasterSheet();
    case "import-master-photos": return importMasterPhotos();
    case "repair-search-images": return repairMovedSearchImages();
    case "refresh-users": return refreshUsers();
    case "refresh-bulk-photos": return refreshBulkPhotos();
    case "upload-bulk-photos": return uploadBulkPhotos();
    case "show-help": state.modal = { mode: "help" }; return render();
    case "refresh-categories": return refreshCategories();
    case "save-category-csv": return saveCategoryCsvFromSettings();
    case "refresh-team": return refreshTeamAccess();
    case "team-add": {
      const email = document.getElementById("newTeamEmail")?.value.trim();
      const role = document.getElementById("newTeamRole")?.value || "writer";
      if (email) addTeamMember(email, role);
      return;
    }
    case "go-settings": state.activeView = "settings"; persist(); return render();
    case "toggle-node-list": {
      const current = state.ui.nodesCollapsed ?? isPhoneLayout();
      state.ui.nodesCollapsed = !current;
      persist();
      return render();
    }
    case "create-node": return openCreateModal({ x: 50, y: 50 });
    case "new-project": state.modal = { mode: "new-project" }; return render();
    case "edit-project": state.modal = { mode: "edit-project" }; return render();
    case "delete-project": return deleteProject(state.selectedProjectId);
    case "new-folder": state.modal = { mode: "new-folder" }; return render();
    case "add-floor": state.modal = { mode: "add-floor" }; return render();
    case "new-room": state.modal = { mode: "new-room" }; return render();
    case "rename-room": if (state.selectedRoomId === "all") return; state.modal = { mode: "rename-room", roomId: state.selectedRoomId }; return render();
    case "delete-room": return deleteSelectedRoom();
    case "rename-floor": if (!currentFloor()) return; state.modal = { mode: "rename-floor" }; return render();
    case "delete-floor": return deleteCurrentFloor();
    case "upload-plan": return uploadFloorPlan();
    case "mass-start":
      if (!categoryNames().length) { toast("No categories - hit Refresh categories in Settings"); state.activeView = "settings"; return render(); }
      state.modal = { mode: "mass-pick", category: categoryNames()[0] }; return render();
    case "mass-stop": return stopMassMode();
    case "add-portal": state.modal = { mode: "portal-create" }; return render();
    case "follow-portal": return followPortal();
    case "zoom-in": return setZoom(state.canvas.zoom + 0.15);
    case "zoom-out": return setZoom(state.canvas.zoom - 0.15);
    case "reset-view": state.canvas = { zoom: 1, panX: 0, panY: 0 }; persist(); return render();
    case "close-drawer": state.drawerOpen = false; persist(); return render();
    case "close-modal": state.modal = null; return render();
    case "close-lightbox": state.lightbox = null; return render();
    case "edit-node": state.modal = { mode: "edit" }; return render();
    case "bulk-photo-picker": state.modal = { mode: "bulk-photo-picker" }; return render();
    case "clone-node": return cloneSelectedNode();
    case "delete-node": return deleteSelectedNode();
    case "share-node": return shareSelectedNode();
    case "send-comment": return sendComment();
    case "prev-image": return stepImage(-1);
    case "next-image": return stepImage(1);
    case "audit-load": return fetchAuditRows();
    case "audit-download": return downloadAuditCsv(filteredAuditRows());
    case "audit-clear-filters": state.auditView.filters = freshState().auditView.filters; persist(); return render();
    case "print-report": state.modal = { mode: "print-preview" }; return render();
    case "print-now": return window.print();
    case "bulk-delete": return bulkDelete();
    case "bulk-clear": state.bulkSelection = []; return render();
    case "wipe-local":
      if (!confirm("Wipe all local cache? Files in Drive are not touched, just the browser copy.")) return;
      localStorage.removeItem(STORAGE_KEY); location.reload(); return;
    case "format-planner": return formatPlannerData();
  }
}

function bindCanvasEvents() {
  const viewport = document.getElementById("canvasViewport"); if (!viewport) return;
  viewport.addEventListener("wheel", (e) => { e.preventDefault(); setZoom(state.canvas.zoom + (e.deltaY < 0 ? 0.08 : -0.08), false); }, { passive: false });
  viewport.addEventListener("pointerdown", (e) => {
    if (e.target.closest(".node-marker")) return;
    if (e.target.closest(".empty-plan")) return;
    if (e.target.closest("button")) return;
    viewport.setPointerCapture(e.pointerId);
    canvasPointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (canvasPointers.size >= 2) {
      const points = [...canvasPointers.values()].slice(0, 2);
      pinchState = { distance: pointerDistance(points[0], points[1]), zoom: state.canvas.zoom };
      dragState = null;
      viewport.classList.add("is-dragging");
      return;
    }
    dragState = { pointerId: e.pointerId, startX: e.clientX, startY: e.clientY, panX: state.canvas.panX, panY: state.canvas.panY, moved: false };
  });
  viewport.addEventListener("pointermove", (e) => {
    if (canvasPointers.has(e.pointerId)) canvasPointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pinchState && canvasPointers.size >= 2) {
      const points = [...canvasPointers.values()].slice(0, 2);
      const distance = pointerDistance(points[0], points[1]);
      if (pinchState.distance > 0) setZoom(pinchState.zoom * (distance / pinchState.distance), false);
      return;
    }
    if (!dragState || dragState.pointerId !== e.pointerId) return;
    const dx = e.clientX - dragState.startX, dy = e.clientY - dragState.startY;
    if (Math.abs(dx) + Math.abs(dy) > 5) {
      dragState.moved = true;
      viewport.classList.add("is-dragging");
      state.canvas.panX = dragState.panX + dx; state.canvas.panY = dragState.panY + dy;
      applyCanvasTransform();
    }
  });
  viewport.addEventListener("pointerup", (e) => {
    const wasPinching = Boolean(pinchState) || canvasPointers.size > 1;
    canvasPointers.delete(e.pointerId);
    if (wasPinching) {
      if (canvasPointers.size < 2) {
        pinchState = null;
        lastPinchEndedAt = Date.now();
        persist();
      }
      dragState = null;
      viewport.classList.remove("is-dragging");
      try { viewport.releasePointerCapture(e.pointerId); } catch (err) {}
      return;
    }
    if (!dragState || dragState.pointerId !== e.pointerId) return;
    viewport.releasePointerCapture(e.pointerId);
    viewport.classList.remove("is-dragging");
    const wasMoved = dragState.moved;
    dragState = null;
    persist();
    if (!wasMoved && Date.now() - lastPinchEndedAt > 350 && !e.target.closest(".node-marker") && !e.target.closest(".empty-plan") && !e.target.closest("button")) {
      const pos = pointerToPlanPosition(e); if (!pos) return;
      if (state.massMode.active) return placeMassNode(pos);
      const proj = project();
      const fl = currentFloor();
      if (proj && fl && (state.floorPlans[fl.id] || fl.planDriveFileId)) openCreateModal(pos);
    }
  });
  viewport.addEventListener("pointercancel", (e) => {
    canvasPointers.delete(e.pointerId);
    pinchState = null;
    dragState = null;
    viewport.classList.remove("is-dragging");
  });
}

function pointerDistance(a, b) {
  return Math.hypot((a?.x || 0) - (b?.x || 0), (a?.y || 0) - (b?.y || 0));
}

function bindMarkerDrag() {
  document.querySelectorAll(".node-marker").forEach((el) => {
    el.addEventListener("pointerdown", (e) => {
      if (e.shiftKey) return; // shift = multi-select, not drag
      const nodeId = el.dataset.node;
      const node = state.nodes.find((n) => n.id === nodeId); if (!node) return;
      e.stopPropagation();
      el.setPointerCapture(e.pointerId);
      nodeDragState = { pointerId: e.pointerId, nodeId, startX: e.clientX, startY: e.clientY, originX: node.position.x, originY: node.position.y, moved: false };
    });
    el.addEventListener("pointermove", (e) => {
      if (!nodeDragState || nodeDragState.pointerId !== e.pointerId) return;
      const plan = document.querySelector(".floor-plan"); if (!plan) return;
      const rect = plan.getBoundingClientRect();
      const x = ((e.clientX - rect.left) / rect.width) * 100;
      const y = ((e.clientY - rect.top) / rect.height) * 100;
      const node = state.nodes.find((n) => n.id === nodeDragState.nodeId); if (!node) return;
      node.position.x = Math.max(0, Math.min(100, x));
      node.position.y = Math.max(0, Math.min(100, y));
      nodeDragState.moved = true;
      el.style.setProperty("--x", node.position.x);
      el.style.setProperty("--y", node.position.y);
    });
    el.addEventListener("pointerup", (e) => {
      if (!nodeDragState || nodeDragState.pointerId !== e.pointerId) return;
      el.releasePointerCapture(e.pointerId);
      const moved = nodeDragState.moved;
      const nodeId = nodeDragState.nodeId;
      nodeDragState = null;
      if (moved) {
        const node = state.nodes.find((n) => n.id === nodeId);
        if (node) {
          node.position.x = Number(node.position.x.toFixed(1));
          node.position.y = Number(node.position.y.toFixed(1));
          node.updatedAt = nowStamp();
          persist();
          logAudit("Node Moved", { nodeId: node.id, details: `to ${node.position.x},${node.position.y}` });
        }
      }
    });
  });
}

function pointerToPlanPosition(event) {
  const plan = document.querySelector(".floor-plan"); if (!plan) return null;
  const rect = plan.getBoundingClientRect();
  const x = ((event.clientX - rect.left) / rect.width) * 100;
  const y = ((event.clientY - rect.top) / rect.height) * 100;
  if (x < 0 || x > 100 || y < 0 || y > 100) return null;
  return { x: Number(Math.max(0, Math.min(100, x)).toFixed(1)), y: Number(Math.max(0, Math.min(100, y)).toFixed(1)) };
}

function applyCanvasTransform() { const stage = document.getElementById("planStage"); if (!stage) return; stage.style.transform = `translate(calc(-50% + ${state.canvas.panX}px), calc(-50% + ${state.canvas.panY}px)) scale(${state.canvas.zoom})`; }
function setZoom(value, rerender = true) { state.canvas.zoom = Math.max(0.55, Math.min(2.4, Number(value.toFixed(2)))); persist(); if (rerender) render(); else applyCanvasTransform(); }

/* ============================================================ MUTATIONS */

function selectProject(projectId) {
  state.selectedProjectId = projectId;
  const proj = project();
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

function maybeFetchPlanForCurrentFloor() {
  const fl = currentFloor(); if (!fl) return;
  if (!state.floorPlans[fl.id] && fl.planDriveFileId && isTokenValid()) {
    fetchDriveFileAsDataUrl(fl.planDriveFileId).then(async (url) => { if (url) { state.floorPlans[fl.id] = url; fl.planAspectRatio = fl.planAspectRatio || await readImageAspectRatio(url) || null; persist(); render(); } }).catch((e) => console.warn(e));
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
  if (!confirm(`Delete ${state.bulkSelection.length} node(s)?`)) return;
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

function handleMassForm(event) {
  event.preventDefault();
  const form = new FormData(event.currentTarget);
  const category = (form.get("category") || "").toString();
  const lineItem = (form.get("lineItem") || "").toString();
  const status = (form.get("status") || "Not Started").toString();
  if (!category || !lineItem) { toast("Pick a category and line item"); return; }
  state.massMode = { active: true, category, lineItem, status, count: 0 };
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
    status: m.status || "Not Started",
    roomId: state.selectedRoomId !== "all" ? state.selectedRoomId : null,
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
    const room = { id: uid("room"), projectId: proj.id, floorId: floor.id, name, createdAt: nowStamp(), updatedAt: nowStamp(), order };
    state.rooms.push(room);
    state.selectedRoomId = room.id;
    logAudit("Room Created", { projectId: proj.id, floorId: floor.id, details: name });
  }
  state.modal = null; persist(); render();
}

function deleteSelectedRoom() {
  if (state.selectedRoomId === "all") return;
  const room = roomById(state.selectedRoomId); if (!room) return;
  if (!confirm(`Delete room "${room.name}"? Nodes stay on the floor and become "No room".`)) return;
  state.nodes.forEach((n) => {
    if (n.roomId === room.id) n.roomId = null;
    if (n.linkedRoomId === room.id) n.linkedRoomId = null;
  });
  state.rooms = state.rooms.filter((r) => r.id !== room.id);
  state.selectedRoomId = "all";
  persist(); render();
  logAudit("Room Deleted", { projectId: room.projectId, floorId: room.floorId, details: room.name });
}

async function deleteCurrentFloor() {
  const proj = project(); if (!proj) return;
  const fl = currentFloor(); if (!fl) return;
  if (proj.floors.length === 1) { toast("Cannot delete the only floor"); return; }
  if (!confirm(`Delete floor "${fl.name}" and all its nodes? The Drive folder will be moved to Trash.`)) return;
  const driveId_Fl = state.drive.floorFolderMap[fl.id];
  const nodeDriveIds = state.nodes.filter((n) => n.floorId === fl.id).map((n) => state.drive.nodeFolderMap[n.id]).filter(Boolean);
  proj.floors = proj.floors.filter((f) => f.id !== fl.id);
  state.nodes = state.nodes.filter((n) => n.floorId !== fl.id);
  state.rooms = state.rooms.filter((r) => r.floorId !== fl.id);
  delete state.floorPlans[fl.id];
  delete state.drive.floorFolderMap[fl.id];
  nodeDriveIds.forEach((id) => {
    const entry = Object.entries(state.drive.nodeFolderMap).find(([, folderId]) => folderId === id);
    if (entry) delete state.drive.nodeFolderMap[entry[0]];
  });
  state.selectedFloorId = proj.floors[0]?.id || null;
  state.selectedRoomId = "all";
  persist(); render();
  const trashed = driveId_Fl ? await trashDriveFolder(driveId_Fl) : await trashDriveFolders(nodeDriveIds);
  logAudit("Floor Deleted", { projectId: proj.id, details: `${fl.name}; Drive trashed: ${trashed ? "yes" : "no"}` });
  toast(`Floor "${fl.name}" deleted`);
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
  state.selectedRoomId = linkedRoomId || "all";
  if (linkedNodeId) { state.selectedNodeId = linkedNodeId; state.drawerOpen = true; state.activeView = "map"; }
  persist(); render();
  maybeFetchPlanForCurrentFloor();
}

async function deleteFolder(folderId) {
  const folder = state.projectFolders.find((f) => f.id === folderId); if (!folder) return;
  if (!confirm(`Delete folder "${folder.name}"? Projects inside move to ${DRIVE_UNFILED_FOLDER}. The Drive folder group will be moved to Trash.`)) return;
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
  if (!confirm(`Delete project "${proj.name}" and all its nodes? The Drive folder (and everything inside) will be moved to Trash.`)) return;
  const driveId_P = state.drive.projectFolderMap[projectId];
  const nodeDriveIds = state.nodes.filter((n) => n.projectId === projectId).map((n) => state.drive.nodeFolderMap[n.id]).filter(Boolean);
  const linkedReturns = state.nodes.filter((n) => n.type === "portal" && n.linkedProjectId === projectId);
  linkedReturns.forEach((n) => { if (state.drive.nodeFolderMap[n.id]) nodeDriveIds.push(state.drive.nodeFolderMap[n.id]); state.nodes = state.nodes.filter((x) => x.id !== n.id); delete state.drive.nodeFolderMap[n.id]; });
  state.projects = state.projects.filter((p) => p.id !== projectId);
  state.nodes = state.nodes.filter((n) => n.projectId !== projectId);
  state.rooms = state.rooms.filter((r) => r.projectId !== projectId);
  (proj.floors || []).forEach((f) => { delete state.floorPlans[f.id]; delete state.drive.floorFolderMap[f.id]; });
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
  if (!confirm(`Format NeillPlanner data? This trashes unprotected project data, Bulk Photos, and Sorted Photos, clears matching master/photo allocation rows, and keeps Admin Files + Audit.${protectedProjects.length ? ` ${protectedProjects.length} protected job(s) will be kept.` : ""}`)) return;
  if (!confirm("Last check: this is destructive. Continue?")) return;
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
    state.floorPlans = Object.fromEntries(Object.entries(state.floorPlans || {}).filter(([floorId]) => protectedFloorIds.has(floorId)));
    state.bulkPhotos = [];
    state.selectedProjectId = state.projects[0]?.id || null;
    state.selectedFloorId = state.projects[0]?.floors?.[0]?.id || null;
    state.selectedRoomId = "all";
    state.selectedNodeId = null;
    state.drawerOpen = false;
    persist({ skipSync: true });
    if (state.projects.length && state.drive.masterSheetId) await syncMasterSheet({ silent: true });
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
  if (!confirm(`Delete node "${nodeDisplayTitle(node)}"? Drive folder will be moved to Trash.`)) return;
  const driveId_N = state.drive.nodeFolderMap[node.id];
  const linkedDriveId = node.linkedNodeId ? state.drive.nodeFolderMap[node.linkedNodeId] : null;
  if (node.type === "portal" && node.linkedNodeId) {
    state.nodes = state.nodes.filter((n) => n.id !== node.linkedNodeId);
    delete state.drive.nodeFolderMap[node.linkedNodeId];
  }
  state.nodes = state.nodes.filter((n) => n.id !== node.id);
  delete state.drive.nodeFolderMap[node.id];
  const trashed = await trashDriveFolders([driveId_N, linkedDriveId]);
  logAudit("Node Deleted", { nodeId: node.id, nodeTitle: nodeDisplayTitle(node), details: `${trashed} Drive folder(s) trashed` });
  state.selectedNodeId = floorNodes()[0]?.id || null;
  state.drawerOpen = Boolean(state.selectedNodeId);
  state.modal = null; persist(); render();
  toast("Node deleted");
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

function uploadFloorPlan() {
  const proj = project(); if (!proj) { toast("Create a project first"); return; }
  const floor = currentFloor(); if (!floor) { toast("Add a floor first"); return; }
  if (!requireAuth("upload a floor plan") || !requirePlannerDrive("upload floor plans")) return;
  const input = document.createElement("input");
  input.type = "file"; input.accept = "image/png,image/jpeg,image/svg+xml,image/webp";
  input.onchange = async () => {
    const file = input.files?.[0]; if (!file) return;
    const reader = new FileReader();
    reader.onload = async () => {
      state.floorPlans[floor.id] = reader.result;
      floor.planFileName = file.name;
      floor.planAspectRatio = await readImageAspectRatio(reader.result) || floor.planAspectRatio || 1.6;
      persist(); render();
      toast(`Plan uploaded for ${floor.name}`);
      logAudit("Plan Uploaded", { projectId: proj.id, floorId: floor.id, details: `${floor.name}: ${file.name}` });
      if (isTokenValid()) {
        try {
          const floorFolderId = await ensureFloorDriveFolder(proj, floor);
          if (!floorFolderId) { toast("Floor folder not found"); return; }
          let result;
          if (floor.planDriveFileId) {
            try { result = await updateFileBytes(floor.planDriveFileId, file); }
            catch (e) { result = await uploadFileToDrive(file, floorFolderId, `floor-plan-${file.name}`); }
          } else {
            result = await uploadFileToDrive(file, floorFolderId, `floor-plan-${file.name}`);
          }
          floor.planDriveFileId = result.id;
          floor.planMimeType = result.mimeType;
          floor.planWebViewLink = result.webViewLink;
          persist(); render();
          toast(`Plan synced to Drive`);
        } catch (e) { console.warn(e); toast("Drive sync failed: " + describeError(e)); }
      }
    };
    reader.readAsDataURL(file);
  };
  input.click();
}

async function uploadPhotosToNode(nodeId, files) {
  const node = state.nodes.find((n) => n.id === nodeId); if (!node) return;
  if (!requireAuth("upload photos")) return;
  if (!requirePlannerDrive("upload photos")) return;
  toast(`Uploading ${files.length} photo${files.length === 1 ? "" : "s"}...`);
  try {
    const nodeFolderId = await ensureNodeDriveFolder(node);
    if (!nodeFolderId) { toast("Could not find/create node folder"); return; }
    const uploaderName = state.googleAuth.profile?.name || state.googleAuth.profile?.email || "local";
    for (const file of files) {
      try {
        const result = await uploadFileToDrive(file, nodeFolderId);
        node.imageRefs.push({ id: result.id, name: result.name, driveFileId: result.id, webViewLink: result.webViewLink, thumbnailLink: result.thumbnailLink, mimeType: result.mimeType, uploader: uploaderName, uploadedAt: nowStamp() });
      } catch (e) { console.error(e); toast(`Failed: ${file.name}`); }
    }
    node.updatedAt = nowStamp();
    persist(); render();
    toast(`Uploaded ${files.length}`);
    logAudit("Photos Uploaded", { nodeId: node.id, details: `${files.length} file(s)` });
  } catch (e) { console.error(e); toast("Upload failed: " + describeError(e)); }
}

function toast(message) {
  state.toast = message;
  window.clearTimeout(toast.timer);
  toast.timer = window.setTimeout(() => { state.toast = ""; render(); }, 2800);
}

/* BOOT */

function hydrateFromHash() {
  const match = location.hash.match(/node=([^&]+)/); if (!match) return;
  const node = state.nodes.find((n) => n.id === decodeURIComponent(match[1])); if (!node) return;
  state.selectedProjectId = node.projectId;
  state.selectedFloorId = node.floorId;
  state.selectedNodeId = node.id;
  state.drawerOpen = true;
  state.activeView = "map";
}

document.addEventListener("keydown", e => {
  if (e.key === "Escape") {
    if (state.modal) { state.modal = null; render(); }
    else if (state.drawerOpen) { state.drawerOpen = false; render(); }
  }
  if ((e.key === "Delete" || e.key === "Backspace") && state.selectedNodeId && !e.target.closest("input,textarea,select,[contenteditable]")) {
    e.preventDefault();
    deleteNode(state.selectedNodeId);
  }
});

hydrateFromHash();
render();
bootGoogle();
