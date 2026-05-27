const STORAGE_KEY = "buildingmap-prototype-state-v1";

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

const googleConfig = window.NEILL_PLANNER_CONFIG || {};
const hasGoogleApiKey = Boolean(googleConfig.googleApiKey && !googleConfig.googleApiKey.includes("PASTE_"));
const hasGoogleClientId = Boolean(googleConfig.googleClientId && !googleConfig.googleClientId.includes("PASTE_"));

const iconPaths = {
  projects: '<path d="M3 7.5 12 3l9 4.5-9 4.5L3 7.5Z"/><path d="m3 12 9 4.5L21 12"/><path d="m3 16.5 9 4.5 9-4.5"/>',
  map: '<path d="M9 18 3 21V6l6-3 6 3 6-3v15l-6 3-6-3Z"/><path d="M9 3v15"/><path d="M15 6v15"/>',
  chart: '<path d="M4 19V5"/><path d="M4 19h16"/><path d="M8 15v-4"/><path d="M12 15V8"/><path d="M16 15v-6"/>',
  audit: '<path d="M8 6h13"/><path d="M8 12h13"/><path d="M8 18h13"/><path d="M3 6h.01"/><path d="M3 12h.01"/><path d="M3 18h.01"/>',
  settings: '<path d="M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Z"/><path d="M19.4 15a1.8 1.8 0 0 0 .36 1.98l.04.04a2.1 2.1 0 0 1-2.97 2.97l-.04-.04a1.8 1.8 0 0 0-1.98-.36 1.8 1.8 0 0 0-1.09 1.65V21a2.1 2.1 0 0 1-4.2 0v-.06a1.8 1.8 0 0 0-1.08-1.65 1.8 1.8 0 0 0-1.99.36l-.04.04a2.1 2.1 0 0 1-2.97-2.97l.04-.04A1.8 1.8 0 0 0 4.6 15a1.8 1.8 0 0 0-1.65-1.09H3a2.1 2.1 0 0 1 0-4.2h.06A1.8 1.8 0 0 0 4.7 8.63a1.8 1.8 0 0 0-.36-1.99l-.04-.04a2.1 2.1 0 1 1 2.97-2.97l.04.04A1.8 1.8 0 0 0 9.3 4.04 1.8 1.8 0 0 0 10.38 2.4V2a2.1 2.1 0 0 1 4.2 0v.06a1.8 1.8 0 0 0 1.09 1.65 1.8 1.8 0 0 0 1.98-.36l.04-.04a2.1 2.1 0 1 1 2.97 2.97l-.04.04a1.8 1.8 0 0 0-.36 1.99 1.8 1.8 0 0 0 1.65 1.08H21a2.1 2.1 0 0 1 0 4.2h-.06A1.8 1.8 0 0 0 19.4 15Z"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
  plus: '<path d="M12 5v14"/><path d="M5 12h14"/>',
  upload: '<path d="M12 16V4"/><path d="m7 9 5-5 5 5"/><path d="M20 16v4H4v-4"/>',
  filter: '<path d="M4 5h16"/><path d="M7 12h10"/><path d="M10 19h4"/>',
  zoomIn: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/><path d="M11 8v6"/><path d="M8 11h6"/>',
  zoomOut: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/><path d="M8 11h6"/>',
  target: '<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="3"/><path d="M12 2v3"/><path d="M12 19v3"/><path d="M2 12h3"/><path d="M19 12h3"/>',
  close: '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>',
  share: '<path d="M4 12v7a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-7"/><path d="M16 6 12 2 8 6"/><path d="M12 2v14"/>',
  qr: '<path d="M4 4h6v6H4Z"/><path d="M14 4h6v6h-6Z"/><path d="M4 14h6v6H4Z"/><path d="M14 14h2"/><path d="M18 14h2v2"/><path d="M14 18h2v2"/><path d="M20 18v2h-2"/>',
  image: '<rect x="3" y="5" width="18" height="14" rx="2"/><circle cx="8" cy="10" r="2"/><path d="m21 15-5-5L5 19"/>',
  printer: '<path d="M7 9V3h10v6"/><path d="M7 18H5a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><path d="M7 14h10v7H7Z"/>',
  bell: '<path d="M18 8a6 6 0 1 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9"/><path d="M10 21h4"/>',
  check: '<path d="m20 6-11 11-5-5"/>',
  trash: '<path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="M19 6l-1 15H6L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/>',
  edit: '<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/>',
  folder: '<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z"/>',
  link: '<path d="M10 13a5 5 0 0 0 7.07 0l2.12-2.12a5 5 0 0 0-7.07-7.07L11 4.93"/><path d="M14 11a5 5 0 0 0-7.07 0L4.81 13.1a5 5 0 0 0 7.07 7.07L13 19.07"/>',
  arrowLeft: '<path d="m15 18-6-6 6-6"/>',
  arrowRight: '<path d="m9 18 6-6-6-6"/>'
};

const seed = {
  activeView: "map",
  selectedProjectId: "site-a",
  selectedNodeId: "node-004",
  drawerOpen: true,
  modal: null,
  lightbox: null,
  toast: "",
  selectedFolderId: "all",
  filters: {
    query: "",
    status: "All",
    category: "All",
    assignee: "All",
    layer: "All"
  },
  canvas: {
    zoom: 1,
    panX: 0,
    panY: 0
  },
  currentUser: {
    name: "Sam Carter",
    email: "sam@neilldata.com.au",
    role: "admin"
  },
  projectFolders: [
    { id: "folder-hq", name: "HQ Fit-out", color: "#0ea5e9" },
    { id: "folder-apartments", name: "Apartment Builds", color: "#14b8a6" },
    { id: "folder-service", name: "Service & Maintenance", color: "#f59e0b" }
  ],
  projects: [
    {
      id: "site-a",
      folderId: "folder-hq",
      name: "Neill Data HQ",
      address: "42 Bourke Street, Sydney",
      description: "Security and network fit-out across ground floor work areas.",
      updatedAt: "2026-05-26 10:42",
      planName: "Ground Floor",
      auditSheet: "BM-HQ-Audit",
      driveFolder: "/NeillPlanner/Projects/HQ Fit-out/Neill Data HQ/",
      categories: ["CCTV", "Data Point", "Access", "Electrical", "Safety"],
      team: [
        { id: "u1", name: "Sam Carter", email: "sam@neilldata.com.au", role: "admin" },
        { id: "u2", name: "Mia Jones", email: "mia@neilldata.com.au", role: "editor" },
        { id: "u3", name: "Leo Park", email: "leo@neilldata.com.au", role: "viewer" },
        { id: "u4", name: "Ava Singh", email: "ava@neilldata.com.au", role: "editor" }
      ]
    },
    {
      id: "warehouse",
      folderId: "folder-apartments",
      name: "Western Warehouse",
      address: "8 Distribution Road, Parramatta",
      description: "Camera, access, and data point audit for warehouse upgrade.",
      updatedAt: "2026-05-25 15:18",
      planName: "Warehouse Level",
      auditSheet: "BM-WW-Audit",
      driveFolder: "/NeillPlanner/Projects/Apartment Builds/Western Warehouse/",
      categories: ["CCTV", "Access", "Electrical", "Safety"],
      team: [
        { id: "u1", name: "Sam Carter", email: "sam@neilldata.com.au", role: "admin" },
        { id: "u2", name: "Mia Jones", email: "mia@neilldata.com.au", role: "editor" },
        { id: "u4", name: "Ava Singh", email: "ava@neilldata.com.au", role: "editor" }
      ]
    },
    {
      id: "clinic",
      folderId: "folder-service",
      name: "Northside Clinic",
      address: "19 Miller Lane, Chatswood",
      description: "Maintenance QR anchors and access control node tracking.",
      updatedAt: "2026-05-24 09:30",
      planName: "Level 1",
      auditSheet: "BM-NC-Audit",
      driveFolder: "/NeillPlanner/Projects/Service & Maintenance/Northside Clinic/",
      categories: ["Access", "Data Point", "Safety"],
      team: [
        { id: "u1", name: "Sam Carter", email: "sam@neilldata.com.au", role: "admin" },
        { id: "u3", name: "Leo Park", email: "leo@neilldata.com.au", role: "viewer" }
      ]
    }
  ],
  nodes: [
    {
      id: "node-001",
      projectId: "site-a",
      title: "Reception Camera 1",
      category: "CCTV",
      status: "Complete",
      description: "Ceiling mount aimed toward front entry. Image set confirms cable route and field of view.",
      assignedTo: "Mia Jones",
      tags: ["entry", "camera", "front"],
      position: { x: 18.2, y: 22.4 },
      planId: "ground-floor",
      createdBy: "Sam Carter",
      createdAt: "2026-05-21 08:40",
      updatedAt: "2026-05-25 13:15",
      checklist: [
        { label: "Mount installed", done: true },
        { label: "Patch tested", done: true },
        { label: "Photos uploaded", done: true }
      ],
      imageRefs: [
        makeImage("Field view", "teal"),
        makeImage("Ceiling route", "blue")
      ],
      comments: [
        { author: "Mia Jones", time: "2026-05-25 12:45", text: "Final photo set uploaded to Drive." }
      ]
    },
    {
      id: "node-002",
      projectId: "site-a",
      title: "Comms Rack Door",
      category: "Access",
      status: "In Progress",
      description: "Mag lock installed. Waiting on final access profile from client before close-out.",
      assignedTo: "Ava Singh",
      tags: ["access", "comms", "lock"],
      position: { x: 17.8, y: 47.5 },
      planId: "ground-floor",
      createdBy: "Sam Carter",
      createdAt: "2026-05-22 10:20",
      updatedAt: "2026-05-26 09:55",
      checklist: [
        { label: "Lock installed", done: true },
        { label: "Controller mapped", done: true },
        { label: "Client profile loaded", done: false }
      ],
      imageRefs: [makeImage("Door hardware", "amber")],
      comments: [
        { author: "Ava Singh", time: "2026-05-26 09:55", text: "@Sam waiting on the access group list." },
        { author: "Sam Carter", time: "2026-05-26 10:03", text: "Client is sending the CSV this morning." }
      ]
    },
    {
      id: "node-003",
      projectId: "site-a",
      title: "Office Data Pair",
      category: "Data Point",
      status: "Not Started",
      description: "Two data outlets required on west wall. Use floor box path from existing conduit.",
      assignedTo: "Leo Park",
      tags: ["data", "office-a"],
      position: { x: 35.5, y: 22.8 },
      planId: "ground-floor",
      createdBy: "Mia Jones",
      createdAt: "2026-05-23 11:12",
      updatedAt: "2026-05-23 11:12",
      checklist: [
        { label: "Cable pulled", done: false },
        { label: "Wall plate fitted", done: false },
        { label: "Test result uploaded", done: false }
      ],
      imageRefs: [],
      comments: []
    },
    {
      id: "node-004",
      projectId: "site-a",
      title: "Server Room Sensor",
      category: "Safety",
      status: "Issue",
      description: "Temperature sensor is reading high during load test. Re-check sensor placement near return air path.",
      assignedTo: "Sam Carter",
      tags: ["server", "sensor", "issue"],
      position: { x: 39.6, y: 75.5 },
      planId: "ground-floor",
      createdBy: "Ava Singh",
      createdAt: "2026-05-24 14:04",
      updatedAt: "2026-05-26 10:42",
      checklist: [
        { label: "Sensor paired", done: true },
        { label: "Alert threshold set", done: true },
        { label: "Stable reading confirmed", done: false }
      ],
      imageRefs: [
        makeImage("Sensor position", "red"),
        makeImage("Rack clearance", "violet")
      ],
      comments: [
        { author: "Ava Singh", time: "2026-05-26 10:42", text: "Flagged after the second load test. Reading settled at 31 C." }
      ]
    },
    {
      id: "node-005",
      projectId: "site-a",
      title: "Workshop Camera 4",
      category: "CCTV",
      status: "In Progress",
      description: "Cable is run. Mount bracket needs the shorter arm to avoid clipping the roller door.",
      assignedTo: "Mia Jones",
      tags: ["camera", "workshop"],
      position: { x: 76.8, y: 46.4 },
      planId: "ground-floor",
      createdBy: "Sam Carter",
      createdAt: "2026-05-24 16:22",
      updatedAt: "2026-05-26 08:10",
      checklist: [
        { label: "Cable pulled", done: true },
        { label: "Bracket fitted", done: false },
        { label: "Image uploaded", done: false }
      ],
      imageRefs: [makeImage("Cable route", "blue")],
      comments: [
        { author: "Mia Jones", time: "2026-05-26 08:10", text: "Short arm ordered. Should arrive with the afternoon delivery." }
      ]
    },
    {
      id: "node-006",
      projectId: "site-a",
      title: "Loading Dock QR Anchor",
      category: "Safety",
      status: "Complete",
      description: "QR anchor printed and attached to the inspection panel. Deep link opens this node.",
      assignedTo: "Ava Singh",
      tags: ["qr", "maintenance", "loading"],
      position: { x: 80.4, y: 74.4 },
      planId: "ground-floor",
      createdBy: "Sam Carter",
      createdAt: "2026-05-22 14:09",
      updatedAt: "2026-05-25 17:24",
      checklist: [
        { label: "Code generated", done: true },
        { label: "Label printed", done: true },
        { label: "Scan tested", done: true }
      ],
      imageRefs: [makeImage("QR label", "green")],
      comments: []
    },
    {
      id: "node-007",
      projectId: "warehouse",
      title: "Roller Door Camera",
      category: "CCTV",
      status: "In Progress",
      description: "High bay mount at southern roller door.",
      assignedTo: "Mia Jones",
      tags: ["camera", "warehouse"],
      position: { x: 66.2, y: 36.2 },
      planId: "warehouse-level",
      createdBy: "Sam Carter",
      createdAt: "2026-05-25 12:10",
      updatedAt: "2026-05-25 15:18",
      checklist: [{ label: "Lift booked", done: true }, { label: "Mount installed", done: false }],
      imageRefs: [makeImage("Mount area", "amber")],
      comments: []
    },
    {
      id: "node-008",
      projectId: "clinic",
      title: "Treatment Room Access",
      category: "Access",
      status: "Not Started",
      description: "Door controller to be installed after hours.",
      assignedTo: "Sam Carter",
      tags: ["door", "clinic"],
      position: { x: 42.2, y: 58.2 },
      planId: "level-1",
      createdBy: "Sam Carter",
      createdAt: "2026-05-24 09:30",
      updatedAt: "2026-05-24 09:30",
      checklist: [{ label: "Controller installed", done: false }, { label: "Access profile tested", done: false }],
      imageRefs: [],
      comments: []
    }
  ],
  audit: [
    makeAudit("2026-05-26 10:42", "ava@neilldata.com.au", "Status Changed", "site-a", "node-004", "Server Room Sensor", "Complete to Issue"),
    makeAudit("2026-05-26 10:03", "sam@neilldata.com.au", "Comment Added", "site-a", "node-002", "Comms Rack Door", "Mention replied"),
    makeAudit("2026-05-26 09:55", "ava@neilldata.com.au", "Comment Added", "site-a", "node-002", "Comms Rack Door", "@Sam waiting on CSV"),
    makeAudit("2026-05-26 08:10", "mia@neilldata.com.au", "Node Edited", "site-a", "node-005", "Workshop Camera 4", "Bracket note updated"),
    makeAudit("2026-05-25 17:24", "ava@neilldata.com.au", "QR Generated", "site-a", "node-006", "Loading Dock QR Anchor", "Deep link scan tested"),
    makeAudit("2026-05-25 13:15", "mia@neilldata.com.au", "Image Uploaded", "site-a", "node-001", "Reception Camera 1", "2 Drive files added"),
    makeAudit("2026-05-24 16:22", "sam@neilldata.com.au", "Node Created", "site-a", "node-005", "Workshop Camera 4", "Status: In Progress")
  ]
};

let state = loadState();
let dragState = null;

function makeImage(name, hue) {
  const palettes = {
    teal: ["#0f766e", "#14b8a6", "#99f6e4"],
    blue: ["#1d4ed8", "#0ea5e9", "#dbeafe"],
    amber: ["#92400e", "#f59e0b", "#fef3c7"],
    red: ["#7f1d1d", "#ef4444", "#fee2e2"],
    violet: ["#4c1d95", "#8b5cf6", "#ede9fe"],
    green: ["#14532d", "#22c55e", "#dcfce7"]
  };
  const colors = palettes[hue] || palettes.blue;
  return {
    id: "img-" + Math.random().toString(36).slice(2, 8),
    name,
    uploader: "Sam Carter",
    uploadedAt: "2026-05-26",
    thumb: `linear-gradient(135deg, ${colors[0]}, ${colors[1]} 54%, ${colors[2]})`
  };
}

function makeAudit(timestamp, user, action, projectId, nodeId, nodeTitle, details) {
  return {
    id: "audit-" + Math.random().toString(36).slice(2, 9),
    timestamp,
    user,
    action,
    projectId,
    nodeId,
    nodeTitle,
    details,
    device: "Mobile"
  };
}

function loadState() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (saved && saved.projects && saved.nodes && saved.audit) {
      return normalizeState({
        ...seed,
        ...saved,
        projectFolders: saved.projectFolders || seed.projectFolders,
        drawerOpen: saved.drawerOpen ?? true,
        modal: null,
        lightbox: null,
        toast: ""
      });
    }
  } catch (error) {
    console.warn("Saved prototype state could not be loaded", error);
  }
  return normalizeState(structuredCloneSafe(seed));
}

function structuredCloneSafe(value) {
  return JSON.parse(JSON.stringify(value));
}

function normalizeState(draft) {
  draft.projectFolders = draft.projectFolders?.length ? draft.projectFolders : structuredCloneSafe(seed.projectFolders);
  draft.projects = draft.projects.map((item, index) => ({
    ...item,
    folderId: item.folderId || seed.projects.find((projectItem) => projectItem.id === item.id)?.folderId || draft.projectFolders[index % draft.projectFolders.length].id,
    driveFolder: drivePathForDraftProject(item, draft)
  }));
  const folderIds = ["all", ...draft.projectFolders.map((folder) => folder.id)];
  if (!folderIds.includes(draft.selectedFolderId)) draft.selectedFolderId = "all";
  return draft;
}

function drivePathForDraftProject(item, draft) {
  const folderId = item.folderId || seed.projects.find((projectItem) => projectItem.id === item.id)?.folderId;
  const folder = draft.projectFolders.find((folderItem) => folderItem.id === folderId);
  return `/${DRIVE_ROOT_NAME}/${DRIVE_PROJECTS_FOLDER}/${folder?.name || DRIVE_UNFILED_FOLDER}/${item.name}/`;
}

function persist() {
  const saved = {
    ...state,
    modal: null,
    lightbox: null,
    toast: "",
    canvas: { ...state.canvas }
  };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(saved));
}

function icon(name) {
  return `<svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round">${iconPaths[name] || ""}</svg>`;
}

function project() {
  return state.projects.find((item) => item.id === state.selectedProjectId) || state.projects[0];
}

function projectFolder(item = project()) {
  return state.projectFolders.find((folder) => folder.id === item.folderId) || state.projectFolders[0];
}

function drivePathForProject(item = project()) {
  const folder = item.folderId ? projectFolder(item).name : DRIVE_UNFILED_FOLDER;
  return `/${DRIVE_ROOT_NAME}/${DRIVE_PROJECTS_FOLDER}/${folder}/${item.name}/`;
}

function driveTreeRows() {
  const folderRows = state.projectFolders.map((folder) => {
    const projects = state.projects.filter((item) => item.folderId === folder.id);
    return {
      label: folder.name,
      detail: projects.length ? projects.map((item) => item.name).join(", ") : "No projects yet",
      color: folder.color
    };
  });
  const unfiled = state.projects.filter((item) => !item.folderId);
  return [
    { label: DRIVE_ADMIN_FOLDER, detail: "Audit sheets, exports, templates, future admin files", color: "#94a3b8" },
    ...folderRows,
    { label: DRIVE_UNFILED_FOLDER, detail: unfiled.length ? unfiled.map((item) => item.name).join(", ") : "Projects not assigned to a folder", color: "#64748b" }
  ];
}

function folderProjects(folderId = state.selectedFolderId) {
  if (folderId === "all") return state.projects;
  return state.projects.filter((item) => item.folderId === folderId);
}

function folderStats(folderId) {
  const projects = folderProjects(folderId);
  const projectIds = projects.map((item) => item.id);
  const nodes = state.nodes.filter((node) => projectIds.includes(node.projectId));
  return {
    projects: projects.length,
    nodes: nodes.length,
    completePercent: stats(nodes).completePercent,
    issues: stats(nodes).issue
  };
}

function projectNodes() {
  return state.nodes.filter((node) => node.projectId === state.selectedProjectId);
}

function selectedNode() {
  return state.nodes.find((node) => node.id === state.selectedNodeId);
}

function teamNames() {
  return project().team.map((user) => user.name);
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function statusStyle(status) {
  return `--status:${statusMeta[status]?.color || "#2563eb"}`;
}

function statusPill(status) {
  return `<span class="status-pill" style="${statusStyle(status)}">${escapeHtml(status)}</span>`;
}

function initials(name) {
  return name
    .split(" ")
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

function nowStamp() {
  const now = new Date();
  return now.toISOString().slice(0, 16).replace("T", " ");
}

function stats(nodes = projectNodes()) {
  const total = nodes.length;
  const complete = nodes.filter((node) => node.status === "Complete").length;
  const progress = nodes.filter((node) => node.status === "In Progress").length;
  const issue = nodes.filter((node) => node.status === "Issue").length;
  const notStarted = nodes.filter((node) => node.status === "Not Started").length;
  return {
    total,
    complete,
    progress,
    issue,
    notStarted,
    completePercent: total ? Math.round((complete / total) * 100) : 0
  };
}

function matchesNode(node) {
  const filters = state.filters;
  const query = filters.query.trim().toLowerCase();
  const inQuery = !query || [node.title, node.category, node.status, node.assignedTo, node.description, ...node.tags]
    .join(" ")
    .toLowerCase()
    .includes(query);
  const inStatus = filters.status === "All" || node.status === filters.status;
  const inCategory = filters.category === "All" || node.category === filters.category;
  const inAssignee = filters.assignee === "All" || node.assignedTo === filters.assignee;
  const inLayer = filters.layer === "All" || node.category === filters.layer;
  return inQuery && inStatus && inCategory && inAssignee && inLayer;
}

function navItems() {
  return [
    { id: "projects", label: "Projects", icon: "projects" },
    { id: "map", label: "Map", icon: "map" },
    { id: "progress", label: "Progress", icon: "chart" },
    { id: "audit", label: "Audit", icon: "audit" },
    { id: "settings", label: "Settings", icon: "settings" }
  ];
}

function render() {
  const app = document.getElementById("app");
  app.innerHTML = `
    <div class="app-shell">
      ${renderSidebar()}
      <main class="main">
        ${renderTopbar()}
        <div class="content">${renderView()}</div>
      </main>
      ${renderBottomNav()}
    </div>
    ${state.drawerOpen && selectedNode() ? renderDrawer(selectedNode()) : ""}
    ${state.modal ? renderModal() : ""}
    ${state.lightbox ? renderLightbox() : ""}
    ${state.toast ? `<div class="toast" role="status">${escapeHtml(state.toast)}</div>` : ""}
  `;
  bindEvents();
  applyCanvasTransform();
}

function renderSidebar() {
  return `
    <aside class="sidebar">
      <div class="brand">
        <div class="brand-mark">BM</div>
        <div>
          <h1>NeillPlanner</h1>
          <p>Neill Data & Security</p>
        </div>
      </div>
      <nav class="nav-list" aria-label="Primary">
        ${navItems().map((item) => `
          <button class="nav-button ${state.activeView === item.id ? "is-active" : ""}" data-view="${item.id}">
            ${icon(item.icon)}
            <span>${item.label}</span>
          </button>
        `).join("")}
      </nav>
      <div class="sidebar-section-title">Folders</div>
      <div class="folder-list">
        ${renderFolderButton({ id: "all", name: "All Projects", color: "#94a3b8" }, true)}
        ${state.projectFolders.map((folder) => renderFolderButton(folder)).join("")}
      </div>
      <div class="sidebar-section-title">Projects</div>
      <div class="project-list">
        ${state.projectFolders.map((folder) => {
          const projects = state.projects.filter((item) => item.folderId === folder.id);
          if (!projects.length) return "";
          return `
            <div class="project-folder-group">
              <div class="folder-heading" style="--folder:${folder.color}">
                <span class="folder-dot"></span>
                <span>${escapeHtml(folder.name)}</span>
              </div>
              ${projects.map((item) => renderProjectButton(item)).join("")}
            </div>
          `;
        }).join("")}
      </div>
    </aside>
  `;
}

function renderFolderButton(folder, isAll = false) {
  const itemStats = isAll ? folderStats("all") : folderStats(folder.id);
  return `
    <button class="folder-button ${state.selectedFolderId === folder.id ? "is-active" : ""}" data-folder="${folder.id}" style="--folder:${folder.color}">
      <span class="folder-dot"></span>
      <span>
        <strong>${escapeHtml(folder.name)}</strong>
        <span>${itemStats.projects} builds / ${itemStats.nodes} nodes</span>
      </span>
    </button>
  `;
}

function renderProjectButton(item) {
  const nodes = state.nodes.filter((node) => node.projectId === item.id);
  const projectStats = stats(nodes);
  const folder = projectFolder(item);
  return `
    <button class="project-button ${item.id === state.selectedProjectId ? "is-active" : ""}" data-project="${item.id}" style="--folder:${folder.color}">
      <span class="status-dot" style="--status:${projectStats.issue ? "var(--red)" : "var(--teal)"}"></span>
      <span>
        <strong>${escapeHtml(item.name)}</strong>
        <span class="project-meta">
          <span>${projectStats.total} nodes</span>
          <span>${projectStats.completePercent}% complete</span>
        </span>
      </span>
    </button>
  `;
}

function renderTopbar() {
  const currentProject = project();
  const folder = projectFolder(currentProject);
  return `
    <header class="topbar">
      <div class="topbar-title">
        <h2>${escapeHtml(currentProject.name)}</h2>
        <p><span class="inline-folder" style="--folder:${folder.color}">${escapeHtml(folder.name)}</span> / ${escapeHtml(currentProject.address)} / ${escapeHtml(currentProject.planName)}</p>
      </div>
      <div class="topbar-actions">
        <span class="sync-chip"><span class="sync-dot"></span>All saved</span>
        <span class="sync-chip hide-mobile">${icon("link")} Drive</span>
        <span class="sync-chip hide-mobile">${icon("audit")} Sheets</span>
        <div class="user-pill" title="${escapeHtml(state.currentUser.email)}">
          <span class="avatar">${initials(state.currentUser.name)}</span>
          <span class="hide-mobile">${escapeHtml(state.currentUser.role)}</span>
        </div>
      </div>
    </header>
  `;
}

function renderBottomNav() {
  return `
    <nav class="bottom-nav" aria-label="Primary">
      ${navItems().map((item) => `
        <button class="${state.activeView === item.id ? "is-active" : ""}" data-view="${item.id}">
          ${icon(item.icon)}
          <span>${item.label}</span>
        </button>
      `).join("")}
    </nav>
  `;
}

function renderView() {
  if (state.activeView === "projects") return renderProjectsView();
  if (state.activeView === "progress") return renderProgressView();
  if (state.activeView === "audit") return renderAuditView();
  if (state.activeView === "settings") return renderSettingsView();
  return renderMapView();
}

function renderProjectsView() {
  const visibleProjects = folderProjects();
  const activeFolder = state.selectedFolderId === "all"
    ? { id: "all", name: "All Projects", color: "#94a3b8" }
    : state.projectFolders.find((folder) => folder.id === state.selectedFolderId) || state.projectFolders[0];
  return `
    <section class="view-panel">
      <div class="panel-header">
        <h3 class="section-title">Project Dashboard</h3>
        <div class="button-row">
          <button class="ghost-button" data-action="new-folder">${icon("folder")}Folder</button>
          <button class="primary-button" data-action="new-project">${icon("plus")}New project</button>
        </div>
      </div>
      <div class="folder-strip">
        ${renderFolderButton({ id: "all", name: "All Projects", color: "#94a3b8" }, true)}
        ${state.projectFolders.map((folder) => renderFolderButton(folder)).join("")}
      </div>
      <div class="folder-manager">
        <div>
          <h3 class="section-title">Folder Colours</h3>
          <p>Use folders for towers, apartment blocks, stages, or buildings inside one large job.</p>
        </div>
        <div class="folder-color-grid">
          ${state.projectFolders.map((folder) => renderFolderColourRow(folder)).join("")}
        </div>
      </div>
      <div class="projects-grid">
        ${visibleProjects.length ? visibleProjects.map((item) => {
          const nodes = state.nodes.filter((node) => node.projectId === item.id);
          const itemStats = stats(nodes);
          const folder = projectFolder(item);
          return `
            <article class="project-card" style="--folder:${folder.color}">
              <div class="project-card-map"></div>
              <div class="project-card-body">
                <div class="compact-row" style="margin-bottom:10px">
                  <span class="mini-chip folder-label" style="--folder:${folder.color}">${icon("folder")}${escapeHtml(folder.name)}</span>
                </div>
                <h3>${escapeHtml(item.name)}</h3>
                <p>${escapeHtml(item.description)}</p>
                <div class="compact-row" style="margin-top:12px">
                  ${statusPill(`${itemStats.completePercent}% complete`)}
                  <span class="mini-chip">${itemStats.total} nodes</span>
                  <span class="mini-chip">${itemStats.issue} issues</span>
                </div>
                <div class="project-card-controls">
                  <label>
                    <span>Folder</span>
                    <select data-project-folder="${item.id}" aria-label="Folder for ${escapeHtml(item.name)}">
                      ${state.projectFolders.map((folderOption) => `<option value="${folderOption.id}" ${folderOption.id === item.folderId ? "selected" : ""}>${escapeHtml(folderOption.name)}</option>`).join("")}
                    </select>
                  </label>
                </div>
                <div class="button-row" style="margin-top:14px">
                  <button class="primary-button" data-project-open="${item.id}">${icon("map")}Open</button>
                  <button class="ghost-button" data-project="${item.id}">${icon("settings")}Manage</button>
                </div>
              </div>
            </article>
          `;
        }).join("") : `<div class="empty-state">No projects in ${escapeHtml(activeFolder.name)}</div>`}
      </div>
    </section>
  `;
}

function renderFolderColourRow(folder) {
  const itemStats = folderStats(folder.id);
  return `
    <div class="folder-colour-row" style="--folder:${folder.color}">
      <span class="folder-dot"></span>
      <span>
        <strong>${escapeHtml(folder.name)}</strong>
        <span>${itemStats.projects} builds / ${itemStats.nodes} nodes</span>
      </span>
      <input type="color" value="${escapeHtml(folder.color)}" data-folder-color="${folder.id}" aria-label="Colour for ${escapeHtml(folder.name)}" />
    </div>
  `;
}

function renderMapView() {
  const nodes = projectNodes();
  const matched = nodes.filter(matchesNode);
  return `
    <section class="map-layout">
      <div class="map-panel">
        <div class="map-toolbar">
          <div class="search-wrap">
            ${icon("search")}
            <input data-filter="query" value="${escapeHtml(state.filters.query)}" placeholder="Search nodes, tags, users" aria-label="Search nodes" />
          </div>
          <div class="filter-row">
            ${renderSelect("status", ["All", ...Object.keys(statusMeta)], state.filters.status)}
            ${renderSelect("category", ["All", ...project().categories], state.filters.category)}
            ${renderSelect("assignee", ["All", ...teamNames()], state.filters.assignee)}
            ${renderSelect("layer", ["All", ...project().categories], state.filters.layer)}
          </div>
          <div class="button-row">
            <button class="ghost-button" data-action="upload-plan">${icon("upload")}<span>Plan</span></button>
            <button class="primary-button" data-action="create-node">${icon("plus")}<span>Node</span></button>
          </div>
        </div>
        <div class="canvas-shell">
          <div class="canvas-viewport" id="canvasViewport">
            <div class="plan-stage" id="planStage">
              <img class="floor-plan" src="assets/floorplan.svg" alt="Ground floor plan" draggable="false" />
              <div class="node-layer">
                ${nodes.map((node) => renderMarker(node)).join("")}
              </div>
            </div>
          </div>
          <div class="canvas-tools" aria-label="Canvas tools">
            <button class="icon-button" data-action="zoom-in" title="Zoom in" aria-label="Zoom in">${icon("zoomIn")}</button>
            <button class="icon-button" data-action="zoom-out" title="Zoom out" aria-label="Zoom out">${icon("zoomOut")}</button>
            <button class="icon-button" data-action="reset-view" title="Recenter" aria-label="Recenter">${icon("target")}</button>
          </div>
          <div class="scale-readout"><span class="scale-bar"></span><span>10 m / ${Math.round(state.canvas.zoom * 100)}%</span></div>
        </div>
        <div class="legend">
          ${Object.keys(statusMeta).map((name) => `<span class="legend-item"><span class="status-dot" style="${statusStyle(name)}"></span>${name}</span>`).join("")}
        </div>
      </div>
      <aside class="summary-panel">
        <div class="summary-grid">
          <div class="metric"><span>Total nodes</span><strong>${nodes.length}</strong></div>
          <div class="metric"><span>Shown</span><strong>${matched.length}</strong></div>
          <div class="metric"><span>Complete</span><strong>${stats(nodes).completePercent}%</strong></div>
          <div class="metric"><span>Issues</span><strong>${stats(nodes).issue}</strong></div>
        </div>
        <h3 class="section-title">Nodes</h3>
        <div class="node-list">
          ${matched.length ? matched.map((node) => renderNodeSummary(node)).join("") : `<div class="empty-state">No matching nodes</div>`}
        </div>
      </aside>
    </section>
  `;
}

function renderSelect(name, options, value) {
  return `
    <select data-filter="${name}" aria-label="${name}">
      ${options.map((option) => `<option value="${escapeHtml(option)}" ${option === value ? "selected" : ""}>${escapeHtml(option)}</option>`).join("")}
    </select>
  `;
}

function renderMarker(node) {
  const isSelected = node.id === state.selectedNodeId;
  const isDim = !matchesNode(node);
  return `
    <button class="node-marker ${isSelected ? "is-selected" : ""} ${isDim ? "is-dim" : ""}"
      style="--x:${node.position.x};--y:${node.position.y};${statusStyle(node.status)}"
      data-node="${node.id}"
      aria-label="${escapeHtml(node.title)}">
      ${node.comments.length ? `<span class="comment-count">${node.comments.length}</span>` : ""}
    </button>
  `;
}

function renderNodeSummary(node) {
  return `
    <button class="node-summary ${node.id === state.selectedNodeId ? "is-selected" : ""}" data-node="${node.id}">
      <span class="status-dot" style="${statusStyle(node.status)}"></span>
      <span>
        <strong>${escapeHtml(node.title)}</strong>
        <span>${escapeHtml(node.category)} / ${escapeHtml(node.assignedTo)}</span>
      </span>
    </button>
  `;
}

function renderProgressView() {
  const nodes = projectNodes();
  const projectStats = stats(nodes);
  const total = Math.max(projectStats.total, 1);
  const completeDeg = (projectStats.complete / total) * 100;
  const progressDeg = completeDeg + (projectStats.progress / total) * 100;
  const issueDeg = progressDeg + (projectStats.issue / total) * 100;
  const categories = project().categories.map((category) => {
    const count = nodes.filter((node) => node.category === category).length;
    return { category, count, value: Math.round((count / total) * 100) };
  });

  return `
    <section class="view-panel">
      <div class="panel-header">
        <h3 class="section-title">Progress Dashboard</h3>
        <button class="ghost-button" data-action="print-report">${icon("printer")}Export</button>
      </div>
      <div class="metrics-grid">
        <div class="metric"><span>Total nodes</span><strong>${projectStats.total}</strong></div>
        <div class="metric"><span>Complete</span><strong>${projectStats.completePercent}%</strong></div>
        <div class="metric"><span>In progress</span><strong>${projectStats.progress}</strong></div>
        <div class="metric"><span>Issues</span><strong>${projectStats.issue}</strong></div>
      </div>
    </section>
    <section class="view-panel">
      <div class="charts-grid">
        <div>
          <h3 class="section-title">Status</h3>
          <div class="donut-wrap">
            <div class="donut" style="--complete:${completeDeg}%;--progress:${progressDeg}%;--issue:${issueDeg}%">
              <div class="donut-label"><strong>${projectStats.completePercent}%</strong><span>Complete</span></div>
            </div>
          </div>
        </div>
        <div>
          <h3 class="section-title">Category Load</h3>
          <div class="bar-list">
            ${categories.map((item) => `
              <div class="bar-row">
                <span>${escapeHtml(item.category)}</span>
                <span class="bar-track"><span class="bar-fill" style="--value:${item.value}%"></span></span>
                <span>${item.count}</span>
              </div>
            `).join("")}
          </div>
        </div>
      </div>
    </section>
    <section class="view-panel">
      <h3 class="section-title">Recent Activity</h3>
      <div class="activity-list">
        ${projectAudit().slice(0, 10).map(renderAuditEvent).join("")}
      </div>
    </section>
  `;
}

function renderAuditView() {
  return `
    <section class="view-panel">
      <div class="panel-header">
        <h3 class="section-title">Audit Log</h3>
        <span class="sync-chip">${project().auditSheet}</span>
      </div>
      <div class="audit-table-wrap">
        <table class="audit-table">
          <thead>
            <tr>
              <th>Timestamp</th>
              <th>User</th>
              <th>Action</th>
              <th>Project</th>
              <th>Node ID</th>
              <th>Node Title</th>
              <th>Details</th>
              <th>Device</th>
            </tr>
          </thead>
          <tbody>
            ${projectAudit().map((entry) => `
              <tr>
                <td>${escapeHtml(entry.timestamp)}</td>
                <td>${escapeHtml(entry.user)}</td>
                <td>${escapeHtml(entry.action)}</td>
                <td>${escapeHtml(project().name)}</td>
                <td>${escapeHtml(entry.nodeId || "-")}</td>
                <td>${escapeHtml(entry.nodeTitle || "-")}</td>
                <td>${escapeHtml(entry.details)}</td>
                <td>${escapeHtml(entry.device)}</td>
              </tr>
            `).join("")}
          </tbody>
        </table>
      </div>
    </section>
  `;
}

function projectAudit() {
  return state.audit.filter((entry) => entry.projectId === state.selectedProjectId);
}

function renderAuditEvent(entry) {
  return `
    <article class="audit-event">
      <strong>${escapeHtml(entry.action)} / ${escapeHtml(entry.nodeTitle || project().name)}</strong>
      <span>${escapeHtml(entry.timestamp)} / ${escapeHtml(entry.user)} / ${escapeHtml(entry.details)}</span>
    </article>
  `;
}

function renderSettingsView() {
  return `
    <section class="settings-grid">
      <div class="view-panel">
        <div class="panel-header">
          <h3 class="section-title">Team Access</h3>
          <button class="primary-button" data-action="invite-user">${icon("plus")}Invite</button>
        </div>
        <div class="team-list">
          ${project().team.map((user) => `
            <div class="team-row">
              <span>
                <strong>${escapeHtml(user.name)}</strong>
                <span>${escapeHtml(user.email)}</span>
              </span>
              <select data-role="${user.id}" aria-label="Role for ${escapeHtml(user.name)}">
                ${["admin", "editor", "viewer"].map((role) => `<option value="${role}" ${role === user.role ? "selected" : ""}>${role}</option>`).join("")}
              </select>
            </div>
          `).join("")}
        </div>
      </div>
      <div class="view-panel">
        <div class="panel-header">
          <h3 class="section-title">Google Services</h3>
          <span class="sync-chip"><span class="sync-dot"></span>${hasGoogleApiKey && hasGoogleClientId ? "Configured" : "Config needed"}</span>
        </div>
        <div class="integration-list">
          <div class="integration-row"><span><strong>Browser API Key</strong><span>${hasGoogleApiKey ? "Loaded from config.js" : "Add googleApiKey to config.js"}</span></span>${statusPill(hasGoogleApiKey ? "Complete" : "Not Started")}</div>
          <div class="integration-row"><span><strong>OAuth Client ID</strong><span>${hasGoogleClientId ? "Loaded from config.js" : "Add googleClientId to config.js"}</span></span>${statusPill(hasGoogleClientId ? "Complete" : "Not Started")}</div>
          <div class="integration-row"><span><strong>OAuth Scopes</strong><span>${escapeHtml((googleConfig.scopes || ["https://www.googleapis.com/auth/drive.file"]).join(" "))}</span></span>${statusPill("In Progress")}</div>
          <div class="integration-row"><span><strong>Drive Root</strong><span>/${DRIVE_ROOT_NAME}/</span></span>${statusPill("In Progress")}</div>
          <div class="integration-row"><span><strong>Project Photos</strong><span>${escapeHtml(drivePathForProject())}</span></span>${statusPill("In Progress")}</div>
          <div class="integration-row"><span><strong>Sheets Audit</strong><span>${escapeHtml(project().auditSheet)}</span></span>${statusPill("Complete")}</div>
          <div class="integration-row"><span><strong>Push Notifications</strong><span>Firebase Cloud Messaging</span></span>${statusPill("Not Started")}</div>
        </div>
      </div>
      <div class="view-panel">
        <div class="panel-header">
          <h3 class="section-title">Drive Structure</h3>
          <span class="sync-chip">${icon("folder")}${DRIVE_ROOT_NAME}</span>
        </div>
        <div class="drive-tree">
          <div class="drive-tree-root">${icon("folder")} ${DRIVE_ROOT_NAME}</div>
          ${driveTreeRows().map((row) => `
            <div class="drive-tree-row" style="--folder:${row.color}">
              <span class="folder-dot"></span>
              <span>
                <strong>${escapeHtml(row.label)}</strong>
                <span>${escapeHtml(row.detail)}</span>
              </span>
            </div>
          `).join("")}
        </div>
      </div>
      <div class="view-panel">
        <div class="panel-header">
          <h3 class="section-title">Categories</h3>
          <button class="ghost-button" data-action="add-category">${icon("plus")}Add</button>
        </div>
        <div class="category-list">
          ${project().categories.map((category) => `
            <div class="category-row">
              <span><strong>${escapeHtml(category)}</strong><span>${projectNodes().filter((node) => node.category === category).length} nodes</span></span>
              <span class="role-chip">Layer</span>
            </div>
          `).join("")}
        </div>
      </div>
      <div class="view-panel">
        <div class="panel-header">
          <h3 class="section-title">Offline Queue</h3>
          <span class="sync-chip"><span class="sync-dot"></span>0 pending</span>
        </div>
        <div class="integration-list">
          <div class="integration-row"><span><strong>Plan cache</strong><span>${escapeHtml(project().planName)}</span></span>${statusPill("Complete")}</div>
          <div class="integration-row"><span><strong>Node cache</strong><span>${projectNodes().length} records</span></span>${statusPill("Complete")}</div>
          <div class="integration-row"><span><strong>Image thumbnails</strong><span>Drive metadata cached</span></span>${statusPill("In Progress")}</div>
        </div>
      </div>
    </section>
  `;
}

function renderDrawer(node) {
  const audit = projectAudit().filter((entry) => entry.nodeId === node.id).slice(0, 5);
  const checklistDone = node.checklist.filter((item) => item.done).length;
  return `
    <div class="drawer-backdrop" data-action="close-drawer"></div>
    <aside class="drawer" role="dialog" aria-label="${escapeHtml(node.title)}">
      <div class="drawer-header">
        <div class="drawer-title">
          <h3>${escapeHtml(node.title)}</h3>
          <p>${escapeHtml(node.category)} / ${escapeHtml(node.assignedTo)}</p>
        </div>
        <button class="icon-button" data-action="close-drawer" aria-label="Close">${icon("close")}</button>
      </div>
      <div class="drawer-body">
        <div class="drawer-actions">
          ${statusPill(node.status)}
          <button class="icon-button" data-action="share-node" title="Share" aria-label="Share">${icon("share")}</button>
          <button class="icon-button" data-action="qr-node" title="QR code" aria-label="QR code">${icon("qr")}</button>
          <button class="icon-button" data-action="edit-node" title="Edit" aria-label="Edit">${icon("edit")}</button>
        </div>
        <div class="quick-edit">
          ${renderSelect("quick-status", Object.keys(statusMeta), node.status).replace('data-filter="quick-status"', 'data-quick-status="true"')}
          <button class="ghost-button" data-action="add-drive-image">${icon("image")}Drive image</button>
        </div>
        <div class="info-grid">
          <div class="info-box"><span>Checklist</span><strong>${checklistDone}/${node.checklist.length}</strong></div>
          <div class="info-box"><span>Images</span><strong>${node.imageRefs.length}</strong></div>
          <div class="info-box"><span>Tags</span><strong>${node.tags.map(escapeHtml).join(", ") || "-"}</strong></div>
          <div class="info-box"><span>Updated</span><strong>${escapeHtml(node.updatedAt)}</strong></div>
        </div>
        <div>
          <h3 class="section-title">Notes</h3>
          <textarea data-notes="${node.id}" aria-label="Node notes">${escapeHtml(node.description)}</textarea>
        </div>
        <div>
          <h3 class="section-title">Gallery</h3>
          ${node.imageRefs.length ? `
            <div class="gallery-grid">
              ${node.imageRefs.map((image, index) => `
                <button class="image-tile" style="--thumb:${image.thumb}" data-lightbox="${index}" aria-label="${escapeHtml(image.name)}">
                  <span>${escapeHtml(image.name)}</span>
                </button>
              `).join("")}
            </div>
          ` : `<div class="empty-state">No images</div>`}
        </div>
        <div>
          <h3 class="section-title">Comments</h3>
          <div class="comments-list">
            ${node.comments.length ? node.comments.map((comment) => `
              <article class="comment">
                <span class="comment-meta">${escapeHtml(comment.author)} / ${escapeHtml(comment.time)}</span>
                <p>${escapeHtml(comment.text)}</p>
              </article>
            `).join("") : `<div class="empty-state">No comments</div>`}
          </div>
          <div class="comment-input" style="margin-top:10px">
            <input data-comment-input="${node.id}" placeholder="@mention or comment" aria-label="Add comment" />
            <button class="icon-button" data-action="send-comment" aria-label="Send comment">${icon("arrowRight")}</button>
          </div>
        </div>
        <div>
          <h3 class="section-title">Audit Trail</h3>
          <div class="timeline-list">
            ${audit.length ? audit.map((entry) => `
              <article class="timeline-item">
                <strong>${escapeHtml(entry.action)}</strong>
                <span>${escapeHtml(entry.timestamp)} / ${escapeHtml(entry.details)}</span>
              </article>
            `).join("") : `<div class="empty-state">No node audit events</div>`}
          </div>
        </div>
      </div>
    </aside>
  `;
}

function renderModal() {
  const isEdit = state.modal.mode === "edit";
  const node = isEdit ? selectedNode() : null;
  const categories = project().categories;
  const assignees = teamNames();
  return `
    <div class="modal-backdrop" data-action="close-modal"></div>
    <form class="modal" id="nodeForm" role="dialog" aria-label="${isEdit ? "Edit node" : "Create node"}">
      <div class="modal-header">
        <div>
          <h3>${isEdit ? "Edit Node" : "Create Node"}</h3>
          <p>${escapeHtml(project().planName)}</p>
        </div>
        <button type="button" class="icon-button" data-action="close-modal" aria-label="Close">${icon("close")}</button>
      </div>
      <div class="modal-body">
        <div class="form-grid">
          <div class="field full">
            <label for="nodeTitle">Title</label>
            <input id="nodeTitle" name="title" required value="${escapeHtml(node?.title || "")}" placeholder="Server Room Door" />
          </div>
          <div class="field">
            <label for="nodeCategory">Category</label>
            <select id="nodeCategory" name="category">
              ${categories.map((category) => `<option value="${escapeHtml(category)}" ${node?.category === category ? "selected" : ""}>${escapeHtml(category)}</option>`).join("")}
            </select>
          </div>
          <div class="field">
            <label for="nodeStatus">Status</label>
            <select id="nodeStatus" name="status">
              ${Object.keys(statusMeta).map((status) => `<option value="${escapeHtml(status)}" ${node?.status === status ? "selected" : ""}>${escapeHtml(status)}</option>`).join("")}
            </select>
          </div>
          <div class="field">
            <label for="nodeAssigned">Assigned to</label>
            <select id="nodeAssigned" name="assignedTo">
              ${assignees.map((user) => `<option value="${escapeHtml(user)}" ${node?.assignedTo === user ? "selected" : ""}>${escapeHtml(user)}</option>`).join("")}
            </select>
          </div>
          <div class="field">
            <label for="nodeTags">Tags</label>
            <input id="nodeTags" name="tags" value="${escapeHtml(node?.tags?.join(", ") || "")}" placeholder="cctv, entry" />
          </div>
          <div class="field full">
            <label for="nodeDescription">Notes</label>
            <textarea id="nodeDescription" name="description">${escapeHtml(node?.description || "")}</textarea>
          </div>
          <div class="field full">
            <label for="nodeImages">Images</label>
            <input id="nodeImages" name="images" type="file" accept="image/*" multiple />
            <span class="form-note">Files are staged as Drive uploads in this prototype.</span>
          </div>
        </div>
      </div>
      <div class="modal-actions">
        ${isEdit ? `<button type="button" class="danger-button" data-action="delete-node">${icon("trash")}Delete</button>` : ""}
        <button type="button" class="ghost-button" data-action="close-modal">Cancel</button>
        <button class="primary-button" type="submit">${icon("check")}Save</button>
      </div>
    </form>
  `;
}

function renderLightbox() {
  const node = selectedNode();
  if (!node) return "";
  const image = node.imageRefs[state.lightbox.index];
  if (!image) return "";
  return `
    <div class="lightbox-backdrop" data-action="close-lightbox"></div>
    <div class="lightbox" role="dialog" aria-label="${escapeHtml(image.name)}">
      <div class="lightbox-header">
        <div>
          <h3>${escapeHtml(image.name)}</h3>
          <p>${escapeHtml(image.uploader)} / ${escapeHtml(image.uploadedAt)}</p>
        </div>
        <div class="lightbox-actions">
          <button class="icon-button" data-action="prev-image" aria-label="Previous image">${icon("arrowLeft")}</button>
          <button class="icon-button" data-action="next-image" aria-label="Next image">${icon("arrowRight")}</button>
          <button class="icon-button" data-action="close-lightbox" aria-label="Close">${icon("close")}</button>
        </div>
      </div>
      <div class="lightbox-stage">
        <div class="lightbox-image" style="--thumb:${image.thumb}"></div>
      </div>
    </div>
  `;
}

function bindEvents() {
  document.querySelectorAll("[data-view]").forEach((button) => {
    button.addEventListener("click", () => {
      state.activeView = button.dataset.view;
      state.drawerOpen = state.activeView === "map" && Boolean(selectedNode());
      persist();
      render();
    });
  });

  document.querySelectorAll("[data-project]").forEach((button) => {
    button.addEventListener("click", () => selectProject(button.dataset.project));
  });

  document.querySelectorAll("[data-project-open]").forEach((button) => {
    button.addEventListener("click", () => {
      selectProject(button.dataset.projectOpen);
      state.activeView = "map";
      render();
    });
  });

  document.querySelectorAll("[data-folder]").forEach((button) => {
    button.addEventListener("click", () => {
      state.selectedFolderId = button.dataset.folder;
      state.activeView = "projects";
      state.drawerOpen = false;
      persist();
      render();
    });
  });

  document.querySelectorAll("[data-folder-color]").forEach((input) => {
    input.addEventListener("change", () => {
      const folder = state.projectFolders.find((item) => item.id === input.dataset.folderColor);
      if (!folder) return;
      folder.color = input.value;
      toast(`${folder.name} colour updated`);
      persist();
      render();
    });
  });

  document.querySelectorAll("[data-project-folder]").forEach((select) => {
    select.addEventListener("change", () => {
      const item = state.projects.find((projectItem) => projectItem.id === select.dataset.projectFolder);
      const folder = state.projectFolders.find((folderItem) => folderItem.id === select.value);
      if (!item || !folder) return;
      item.folderId = folder.id;
      item.driveFolder = drivePathForProject(item);
      logAudit("Project Edited", "", item.name, `Moved to ${folder.name}`);
      toast(`${item.name} moved to ${folder.name}`);
      persist();
      render();
    });
  });

  document.querySelectorAll("[data-node]").forEach((button) => {
    button.addEventListener("click", (event) => {
      event.stopPropagation();
      openNode(button.dataset.node);
    });
  });

  document.querySelectorAll("[data-filter]").forEach((input) => {
    const eventName = input.tagName === "INPUT" ? "input" : "change";
    input.addEventListener(eventName, () => {
      state.filters[input.dataset.filter] = input.value;
      persist();
      render();
    });
  });

  document.querySelectorAll("[data-action]").forEach((button) => {
    button.addEventListener("click", handleAction);
  });

  document.querySelectorAll("[data-role]").forEach((select) => {
    select.addEventListener("change", () => {
      const user = project().team.find((member) => member.id === select.dataset.role);
      if (!user) return;
      user.role = select.value;
      logAudit("Role Changed", "", "", `${user.email} set to ${select.value}`);
      toast("Role updated and logged");
      persist();
      render();
    });
  });

  const quickStatus = document.querySelector("[data-quick-status]");
  if (quickStatus) {
    quickStatus.addEventListener("change", () => updateNodeStatus(quickStatus.value));
  }

  document.querySelectorAll("[data-notes]").forEach((textarea) => {
    textarea.addEventListener("change", () => {
      const node = state.nodes.find((item) => item.id === textarea.dataset.notes);
      if (!node) return;
      node.description = textarea.value;
      node.updatedAt = nowStamp();
      logAudit("Node Edited", node.id, node.title, "Notes updated");
      toast("Notes saved");
      persist();
      render();
    });
  });

  document.querySelectorAll("[data-lightbox]").forEach((button) => {
    button.addEventListener("click", () => {
      state.lightbox = { index: Number(button.dataset.lightbox) };
      render();
    });
  });

  const nodeForm = document.getElementById("nodeForm");
  if (nodeForm) {
    nodeForm.addEventListener("submit", handleNodeForm);
  }

  bindCanvasEvents();
}

function selectProject(projectId) {
  state.selectedProjectId = projectId;
  const selected = project();
  state.selectedFolderId = selected?.folderId || state.selectedFolderId;
  const firstNode = projectNodes()[0];
  state.selectedNodeId = firstNode?.id || null;
  state.drawerOpen = state.activeView === "map" && Boolean(firstNode);
  state.filters = { query: "", status: "All", category: "All", assignee: "All", layer: "All" };
  persist();
  render();
}

function openNode(nodeId) {
  state.selectedNodeId = nodeId;
  state.drawerOpen = true;
  state.activeView = "map";
  const node = selectedNode();
  if (node) {
    history.replaceState(null, "", `#node=${encodeURIComponent(node.id)}`);
  }
  persist();
  render();
}

function handleAction(event) {
  const action = event.currentTarget.dataset.action;
  if (["close-drawer", "close-modal", "close-lightbox"].includes(action)) event.preventDefault();
  if (action === "create-node") openCreateModal({ x: 50, y: 50 });
  if (action === "upload-plan") toast("Plan upload queued for Google Drive");
  if (action === "zoom-in") setZoom(state.canvas.zoom + 0.15);
  if (action === "zoom-out") setZoom(state.canvas.zoom - 0.15);
  if (action === "reset-view") {
    state.canvas = { zoom: 1, panX: 0, panY: 0 };
    persist();
    render();
  }
  if (action === "close-drawer") {
    state.drawerOpen = false;
    persist();
    render();
  }
  if (action === "close-modal") {
    state.modal = null;
    render();
  }
  if (action === "close-lightbox") {
    state.lightbox = null;
    render();
  }
  if (action === "edit-node") {
    state.modal = { mode: "edit" };
    render();
  }
  if (action === "delete-node") deleteSelectedNode();
  if (action === "share-node") shareSelectedNode();
  if (action === "qr-node") toast("QR anchor generated for this node");
  if (action === "add-drive-image") addDriveImage();
  if (action === "send-comment") sendComment();
  if (action === "prev-image") stepImage(-1);
  if (action === "next-image") stepImage(1);
  if (action === "print-report") {
    toast("Opening print report");
    setTimeout(() => window.print(), 160);
  }
  if (action === "invite-user") toast("Invite link prepared for Google Sign-In");
  if (action === "add-category") toast("Category editor opened");
  if (action === "new-folder") toast("Folder creation flow opened");
  if (action === "new-project") toast("Project creation flow opened");
}

function bindCanvasEvents() {
  const viewport = document.getElementById("canvasViewport");
  if (!viewport) return;

  viewport.addEventListener("wheel", (event) => {
    event.preventDefault();
    setZoom(state.canvas.zoom + (event.deltaY < 0 ? 0.08 : -0.08), false);
  }, { passive: false });

  viewport.addEventListener("pointerdown", (event) => {
    if (event.target.closest(".node-marker")) return;
    viewport.setPointerCapture(event.pointerId);
    dragState = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      panX: state.canvas.panX,
      panY: state.canvas.panY,
      moved: false
    };
  });

  viewport.addEventListener("pointermove", (event) => {
    if (!dragState || dragState.pointerId !== event.pointerId) return;
    const dx = event.clientX - dragState.startX;
    const dy = event.clientY - dragState.startY;
    if (Math.abs(dx) + Math.abs(dy) > 5) {
      dragState.moved = true;
      viewport.classList.add("is-dragging");
      state.canvas.panX = dragState.panX + dx;
      state.canvas.panY = dragState.panY + dy;
      applyCanvasTransform();
    }
  });

  viewport.addEventListener("pointerup", (event) => {
    if (!dragState || dragState.pointerId !== event.pointerId) return;
    viewport.releasePointerCapture(event.pointerId);
    viewport.classList.remove("is-dragging");
    const wasMoved = dragState.moved;
    dragState = null;
    persist();
    if (!wasMoved && !event.target.closest(".node-marker")) {
      const position = pointerToPlanPosition(event);
      if (position) openCreateModal(position);
    }
  });
}

function pointerToPlanPosition(event) {
  const plan = document.querySelector(".floor-plan");
  if (!plan) return null;
  const rect = plan.getBoundingClientRect();
  const x = ((event.clientX - rect.left) / rect.width) * 100;
  const y = ((event.clientY - rect.top) / rect.height) * 100;
  if (x < 0 || x > 100 || y < 0 || y > 100) return null;
  return {
    x: Number(Math.max(0, Math.min(100, x)).toFixed(1)),
    y: Number(Math.max(0, Math.min(100, y)).toFixed(1))
  };
}

function applyCanvasTransform() {
  const stage = document.getElementById("planStage");
  if (!stage) return;
  stage.style.transform = `translate(calc(-50% + ${state.canvas.panX}px), calc(-50% + ${state.canvas.panY}px)) scale(${state.canvas.zoom})`;
}

function setZoom(value, rerender = true) {
  state.canvas.zoom = Math.max(0.55, Math.min(2.4, Number(value.toFixed(2))));
  persist();
  if (rerender) render();
  else applyCanvasTransform();
}

function openCreateModal(position) {
  state.modal = { mode: "create", position };
  render();
}

function handleNodeForm(event) {
  event.preventDefault();
  const form = new FormData(event.currentTarget);
  const files = Array.from(document.getElementById("nodeImages")?.files || []);
  const payload = {
    title: form.get("title").trim(),
    category: form.get("category"),
    status: form.get("status"),
    assignedTo: form.get("assignedTo"),
    tags: form.get("tags").split(",").map((tag) => tag.trim()).filter(Boolean),
    description: form.get("description").trim()
  };

  if (!payload.title) return;

  if (state.modal.mode === "edit") {
    const node = selectedNode();
    if (!node) return;
    const previousStatus = node.status;
    Object.assign(node, payload, {
      updatedAt: nowStamp(),
      imageRefs: [
        ...node.imageRefs,
        ...files.map((file, index) => makeImage(file.name || `Upload ${index + 1}`, index % 2 ? "teal" : "blue"))
      ]
    });
    const details = previousStatus === node.status ? "Node fields updated" : `${previousStatus} to ${node.status}`;
    logAudit(previousStatus === node.status ? "Node Edited" : "Status Changed", node.id, node.title, details);
    toast("Node updated");
  } else {
    const node = {
      id: "node-" + String(Date.now()).slice(-6),
      projectId: state.selectedProjectId,
      ...payload,
      position: state.modal.position || { x: 50, y: 50 },
      planId: "ground-floor",
      createdBy: state.currentUser.name,
      createdAt: nowStamp(),
      updatedAt: nowStamp(),
      checklist: [
        { label: "Site photo uploaded", done: files.length > 0 },
        { label: "Work completed", done: payload.status === "Complete" }
      ],
      imageRefs: files.map((file, index) => makeImage(file.name || `Upload ${index + 1}`, index % 2 ? "green" : "amber")),
      comments: []
    };
    state.nodes.push(node);
    state.selectedNodeId = node.id;
    state.drawerOpen = true;
    logAudit("Node Created", node.id, node.title, `Status: ${node.status}`);
    toast("Node created");
  }
  state.modal = null;
  persist();
  render();
}

function deleteSelectedNode() {
  const node = selectedNode();
  if (!node) return;
  state.nodes = state.nodes.filter((item) => item.id !== node.id);
  logAudit("Node Deleted", node.id, node.title, "Removed from map");
  state.selectedNodeId = projectNodes()[0]?.id || null;
  state.drawerOpen = Boolean(state.selectedNodeId);
  state.modal = null;
  toast("Node deleted");
  persist();
  render();
}

function updateNodeStatus(status) {
  const node = selectedNode();
  if (!node || node.status === status) return;
  const previous = node.status;
  node.status = status;
  node.updatedAt = nowStamp();
  logAudit("Status Changed", node.id, node.title, `${previous} to ${status}`);
  toast("Status saved");
  persist();
  render();
}

function addDriveImage() {
  const node = selectedNode();
  if (!node) return;
  const hues = ["teal", "blue", "amber", "green", "violet"];
  node.imageRefs.push(makeImage(`Drive file ${node.imageRefs.length + 1}`, hues[node.imageRefs.length % hues.length]));
  node.updatedAt = nowStamp();
  logAudit("Image Uploaded", node.id, node.title, "Drive image linked");
  toast("Drive image linked");
  persist();
  render();
}

function sendComment() {
  const node = selectedNode();
  const input = document.querySelector(`[data-comment-input="${node?.id}"]`);
  if (!node || !input || !input.value.trim()) return;
  node.comments.push({
    author: state.currentUser.name,
    time: nowStamp(),
    text: input.value.trim()
  });
  node.updatedAt = nowStamp();
  logAudit("Comment Added", node.id, node.title, input.value.includes("@") ? "Mention detected" : "Comment saved");
  toast(input.value.includes("@") ? "Mention notification queued" : "Comment saved");
  persist();
  render();
}

async function shareSelectedNode() {
  const node = selectedNode();
  if (!node) return;
  const url = `${location.origin}${location.pathname}#node=${encodeURIComponent(node.id)}`;
  try {
    await navigator.clipboard.writeText(url);
    toast("Node link copied");
  } catch {
    toast(url);
  }
}

function stepImage(direction) {
  const node = selectedNode();
  if (!node || !state.lightbox) return;
  const count = node.imageRefs.length;
  state.lightbox.index = (state.lightbox.index + direction + count) % count;
  render();
}

function logAudit(action, nodeId, nodeTitle, details) {
  state.audit.unshift(makeAudit(nowStamp(), state.currentUser.email, action, state.selectedProjectId, nodeId, nodeTitle, details));
}

function toast(message) {
  state.toast = message;
  window.clearTimeout(toast.timer);
  toast.timer = window.setTimeout(() => {
    state.toast = "";
    render();
  }, 2400);
}

function hydrateFromHash() {
  const match = location.hash.match(/node=([^&]+)/);
  if (!match) return;
  const node = state.nodes.find((item) => item.id === decodeURIComponent(match[1]));
  if (!node) return;
  state.selectedProjectId = node.projectId;
  state.selectedNodeId = node.id;
  state.drawerOpen = true;
  state.activeView = "map";
}

hydrateFromHash();
render();
