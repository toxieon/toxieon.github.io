/* =========================================================================
 *  SWB — Switchboard Planner v1.0.0
 *  Neill Data & Security  |  neilldata.com/swb
 *  Companion to NeillPlanner (neilldata.com/planner)
 *  Standards: AS/NZS 3000:2018 Amendments 1–3
 * ========================================================================= */

const SWB_VERSION        = "1.0.0";
const SWB_SCHEMA_VERSION = "1.1";
const STORAGE_KEY        = "neillswb-state-v1";
const PLANNER_URL        = "https://neilldata.com/planner";
const SWB_URL            = "https://neilldata.com/swb";

const DRIVE_ROOT_NAME        = "NeillPlanner";
const DRIVE_PROJECTS_FOLDER  = "Projects";
const REFERENCE_SHEET_NAME   = "ND_SWB_Reference";
const DEFAULT_WARNING_PCT    = 10; // warn when within 10% of limit

const googleConfig   = window.NEILL_PLANNER_CONFIG || {};
const googleScopes   = (googleConfig.scopes || ["https://www.googleapis.com/auth/drive"]).join(" ");
const PRIMARY_EMAIL  = (googleConfig.primaryOwnerEmail || "").toLowerCase();

/* ── Icons ───────────────────────────────────────────────────────────────── */
const I = {
  zap:      '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>',
  board:    '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8"/><path d="M12 17v4"/></svg>',
  device:   '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2H2v10h10V2Z"/><path d="M22 12h-4v4h4v-4Z"/><path d="M14 14h-4v6h4v-6Z"/><path d="M22 18h-4"/><path d="M12 14H2"/></svg>',
  export:   '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 16V4"/><path d="m17 11-5 5-5-5"/><path d="M20 20H4"/></svg>',
  settings: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Z"/><path d="M19.4 15a1.8 1.8 0 0 0 .36 1.98l.04.04a2.1 2.1 0 0 1-2.97 2.97l-.04-.04a1.8 1.8 0 0 0-1.98-.36 1.8 1.8 0 0 0-1.09 1.65V21a2.1 2.1 0 0 1-4.2 0v-.06a1.8 1.8 0 0 0-1.08-1.65 1.8 1.8 0 0 0-1.99.36l-.04.04a2.1 2.1 0 0 1-2.97-2.97l.04-.04A1.8 1.8 0 0 0 4.6 15a1.8 1.8 0 0 0-1.65-1.09H3a2.1 2.1 0 0 1 0-4.2h.06A1.8 1.8 0 0 0 4.7 8.63a1.8 1.8 0 0 0-.36-1.99l-.04-.04a2.1 2.1 0 1 1 2.97-2.97l.04.04A1.8 1.8 0 0 0 9.3 4.04 1.8 1.8 0 0 0 10.38 2.4V2a2.1 2.1 0 0 1 4.2 0v.06a1.8 1.8 0 0 0 1.09 1.65 1.8 1.8 0 0 0 1.98-.36l.04-.04a2.1 2.1 0 1 1 2.97 2.97l-.04.04a1.8 1.8 0 0 0-.36 1.99 1.8 1.8 0 0 0 1.65 1.08H21a2.1 2.1 0 0 1 0 4.2h-.06A1.8 1.8 0 0 0 19.4 15Z"/></svg>',
  plus:     '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 5v14"/><path d="M5 12h14"/></svg>',
  close:    '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>',
  edit:     '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>',
  trash:    '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="M19 6l-1 15H6L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/></svg>',
  check:    '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m20 6-11 11-5-5"/></svg>',
  search:   '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>',
  link:     '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 13a5 5 0 0 0 7.07 0l2.12-2.12a5 5 0 0 0-7.07-7.07L11 4.93"/><path d="M14 11a5 5 0 0 0-7.07 0L4.81 13.1a5 5 0 0 0 7.07 7.07L13 19.07"/></svg>',
  warn:     '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><path d="M12 9v4"/><path d="M12 17h.01"/></svg>',
  google:   '<svg width="18" height="18" viewBox="0 0 24 24"><path fill="#4285F4" d="M21.35 11.1H12v3.2h5.35c-.49 2.3-2.43 3.78-5.35 3.78-3.2 0-5.78-2.6-5.78-5.78s2.58-5.78 5.78-5.78c1.46 0 2.77.53 3.78 1.4l2.42-2.4A8.85 8.85 0 0 0 12 3.2a8.8 8.8 0 1 0 0 17.6c5.1 0 8.45-3.55 8.45-8.55 0-.6-.05-1.15-.1-1.15Z"/></svg>',
  signout:  '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="m16 17 5-5-5-5"/><path d="M21 12H9"/></svg>',
  refresh:  '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 1 1-3-6.7"/><path d="M21 3v6h-6"/></svg>',
  planner:  '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18 3 21V6l6-3 6 3 6-3v7"/><path d="M9 3v15"/><path d="M15 6v5"/><circle cx="18" cy="18" r="3"/><path d="m21 21-1.5-1.5"/></svg>',
  pdf:      '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/><polyline points="14 2 14 8 20 8"/><path d="M10 12a1 1 0 0 0-1 1v3"/><path d="M14 12h-1a1 1 0 0 0-1 1v1a1 1 0 0 0 1 1h1"/><path d="M17 12h-1v4"/><path d="M17 14h-1"/></svg>',
  chevron:  '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m9 18 6-6-6-6"/></svg>',
};

/* ── Built-in C9 table (fallback if no Google Sheet) ─────────────────────── */
// [csa_mm2, breaker_a, lighting_a, nondom10_a, dom10_a, s15_a, s20_a, range_w, np_nondom, np_dom, np_15, np_20, np_range]
const C9_BUILTIN = [
  [1,6,0.5,null,null,null,null,null,true,true,true,true,true],
  [1,8,0.5,null,null,null,null,null,true,true,true,true,true],
  [1,10,0.5,null,null,null,null,null,true,true,true,true,true],
  [1,13,0.5,null,null,null,null,null,true,true,true,true,true],
  [1,16,0.5,null,null,null,null,null,true,true,true,true,true],
  [1.5,8,0.5,null,null,null,null,null,true,true,true,true,true],
  [1.5,10,0.5,null,null,null,null,null,true,true,true,true,true],
  [1.5,13,0.5,null,null,null,null,null,true,true,true,true,true],
  [1.5,16,0.5,null,null,null,null,null,true,true,true,true,true],
  [1.5,20,0.5,null,null,null,null,5000,true,true,true,true,false],
  [2.5,10,0.5,null,null,null,null,null,true,true,true,true,true],
  [2.5,13,0.5,2,1,null,null,null,false,false,true,true,true],
  [2.5,16,0.5,2,1,15,null,5000,false,false,false,true,false],
  [2.5,20,0.5,2,1,12,20,8000,false,false,false,false,false],
  [2.5,25,0.5,2,1,10,18,8000,false,false,false,false,false],
  [2.5,32,0.5,2,1,8,16,10000,false,false,false,false,false],
  [4,16,0.5,2,1,15,null,5000,false,false,false,true,false],
  [4,20,0.5,2,1,12,20,8000,false,false,false,false,false],
  [4,25,0.5,2,1,10,18,10000,false,false,false,false,false],
  [4,32,0.5,2,1,8,16,10000,false,false,false,false,false],
  [6,20,0.5,2,1,12,20,10000,false,false,false,false,false],
  [6,25,0.5,2,1,10,18,10000,false,false,false,false,false],
  [6,32,0.5,2,1,8,16,13000,false,false,false,false,false],
  [10,32,0.5,2,1,8,16,13000,false,false,false,false,false],
  [10,40,0.5,2,1,8,16,999999,false,false,false,false,false],
];

function buildC9Map(rows) {
  const m = {};
  rows.forEach(r => {
    m[`${r[0]}_${r[1]}`] = { csa:r[0], breaker:r[1], lightingA:r[2], nondom10A:r[3], dom10A:r[4], s15A:r[5], s20A:r[6], rangeW:r[7], npNondom:r[8], npDom:r[9], np15:r[10], np20:r[11], npRange:r[12] };
  });
  return m;
}

/* ── Default device library ──────────────────────────────────────────────── */
const DEFAULT_DEVICES = [
  { id:"dl_lp",   name:"Lighting point",              cat:"Lighting",    amp:0.5,  ded:false, defBreaker:null, std:"AS/NZS 3000:2018 Cl. C5.2 Table C9", fav:true  },
  { id:"dl_dl",   name:"Downlight",                   cat:"Lighting",    amp:0.5,  ded:false, defBreaker:null, std:"AS/NZS 3000:2018 Cl. C5.2 Table C9", fav:true  },
  { id:"dl_ef",   name:"Exhaust fan point",            cat:"Lighting",    amp:0.5,  ded:false, defBreaker:null, std:"AS/NZS 3000:2018 Cl. C5.2 Table C9", fav:false },
  { id:"dl_el",   name:"Emergency light",             cat:"Lighting",    amp:0.5,  ded:false, defBreaker:null, std:"AS/NZS 3000:2018",                    fav:false },
  { id:"dl_xl",   name:"Exit light",                  cat:"Lighting",    amp:0.5,  ded:false, defBreaker:null, std:"AS/NZS 3000:2018",                    fav:false },
  { id:"dp_g1",   name:"Single GPO (10A)",            cat:"Power",       amp:1.0,  ded:false, defBreaker:null, std:"AS/NZS 3000:2018 Cl. C5.2 Table C9", fav:true  },
  { id:"dp_g2",   name:"Double GPO (10A)",            cat:"Power",       amp:1.0,  ded:false, defBreaker:null, std:"AS/NZS 3000:2018 Cl. C5.2 Table C9", fav:true  },
  { id:"dp_wp",   name:"Weatherproof GPO (10A)",      cat:"Power",       amp:1.0,  ded:false, defBreaker:null, std:"AS/NZS 3000:2018 Cl. C5.2 Table C9", fav:false },
  { id:"dp_usb",  name:"USB GPO (10A)",               cat:"Power",       amp:1.0,  ded:false, defBreaker:null, std:"AS/NZS 3000:2018 Cl. C5.2 Table C9", fav:false },
  { id:"dd_hws",  name:"Hot water service 3.6kW",     cat:"Dedicated",   amp:15,   ded:true,  defBreaker:16,   std:"AS/NZS 3000:2018 Cl. 4.4",            fav:false },
  { id:"dd_hwsi", name:"HWS instantaneous",           cat:"Dedicated",   amp:20,   ded:true,  defBreaker:20,   std:"AS/NZS 3000:2018 Cl. 4.4",            fav:false },
  { id:"dd_oven", name:"Electric oven",               cat:"Dedicated",   amp:20,   ded:true,  defBreaker:20,   std:"AS/NZS 3000:2018 Cl. 4.4",            fav:false },
  { id:"dd_ck",   name:"Cooktop",                     cat:"Dedicated",   amp:20,   ded:true,  defBreaker:20,   std:"AS/NZS 3000:2018 Cl. 4.4",            fav:false },
  { id:"dd_dw",   name:"Dishwasher",                  cat:"Dedicated",   amp:10,   ded:true,  defBreaker:10,   std:"AS/NZS 3000:2018 Cl. 4.4",            fav:false },
  { id:"dd_mw",   name:"Microwave (built-in)",        cat:"Dedicated",   amp:10,   ded:true,  defBreaker:10,   std:"AS/NZS 3000:2018 Cl. 4.4",            fav:false },
  { id:"dd_rh",   name:"Rangehood",                   cat:"Dedicated",   amp:10,   ded:true,  defBreaker:10,   std:"AS/NZS 3000:2018 Cl. 4.4",            fav:false },
  { id:"dc_ss10", name:"Split system AC (10A)",       cat:"Climate",     amp:10,   ded:true,  defBreaker:10,   std:"AS/NZS 3000:2018 Cl. 4.4",            fav:false },
  { id:"dc_ss20", name:"Split system AC (20A)",       cat:"Climate",     amp:20,   ded:true,  defBreaker:20,   std:"AS/NZS 3000:2018 Cl. 4.4",            fav:false },
  { id:"dc_dac",  name:"Ducted AC",                   cat:"Climate",     amp:20,   ded:true,  defBreaker:null, std:"AS/NZS 3000:2018 Cl. 4.4",            fav:false },
  { id:"dev_ev",  name:"EV charger",                  cat:"EV / Solar",  amp:32,   ded:true,  defBreaker:32,   std:"AS/NZS 3000:2018",                    fav:false },
  { id:"dev_sol", name:"Solar inverter",              cat:"EV / Solar",  amp:0,    ded:true,  defBreaker:null, std:"AS/NZS 3000:2018",                    fav:false },
  { id:"dev_dp",  name:"Data point",                  cat:"Data / Comms",amp:0,    ded:false, defBreaker:null, std:"AS/NZS 3000:2018",                    fav:false },
];

/* ── State ───────────────────────────────────────────────────────────────── */
function freshState() {
  return {
    googleAuth: { accessToken: null, expiresAt: null, signedIn: false, bootstrapped: false, bootstrapping: false, profile: null, librariesReady: false, authFailed: false },
    activeView: "projects",   // projects | board | devices | export | settings
    showPanelMockup: false,
    projects: [],
    selectedProjectId: null,
    selectedBoardId: null,
    selectedCircuitId: null,
    modal: null,              // { mode, ...payload }
    toast: "",
    filters: { query: "", type: "all", status: "all", phase: "all" },
    deviceSearch: "",
    drive: {
      rootFolderId: null,
      referenceSheetId: null,
      projectFolderMap: {},
      breakerBrands: ["Clipsal","Voltex"],
    },
    c9Map: buildC9Map(C9_BUILTIN),
    c9Source: "built-in",
    config: { warning_threshold_percent: DEFAULT_WARNING_PCT },
    loading: false,
    loadingMsg: "Loading…",
    // Deep-link params read from URL on boot
    deepLink: { projectId: null, boardId: null },
  };
}

let state = freshState();
let _tokenClient = null;
let _savingTimer = null;

/* ── Persistence ─────────────────────────────────────────────────────────── */
function persist() {
  try {
    const s = {
      activeView: state.activeView,
      selectedProjectId: state.selectedProjectId,
      selectedBoardId: state.selectedBoardId,
      projects: state.projects,
      drive: state.drive,
      // Never persist token — just the bootstrapped flag and profile
      googleAuth: { bootstrapped: state.googleAuth.bootstrapped, profile: state.googleAuth.profile },
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
  } catch(e) { /* storage full */ }
}

function restore() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const s = JSON.parse(raw);
    state.activeView        = s.activeView || "projects";
    state.selectedProjectId = s.selectedProjectId || null;
    state.selectedBoardId   = s.selectedBoardId   || null;
    state.projects          = s.projects           || [];
    state.drive             = Object.assign(state.drive, s.drive || {});
    if (s.googleAuth) {
      state.googleAuth.bootstrapped = s.googleAuth.bootstrapped || false;
      state.googleAuth.profile      = s.googleAuth.profile || null;
    }
  } catch(e) { /* ignore */ }
}

/* ── Helpers ─────────────────────────────────────────────────────────────── */
let _uid = 0;
function uid(prefix="id") { return `${prefix}_${Date.now()}_${++_uid}`; }
function nowStamp() { return new Date().toLocaleString("en-AU"); }
function escHtml(s) { return String(s||"").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;"); }
function parseNum(v,def=0) { const n=parseFloat(v); return isNaN(n)?def:n; }
function project(id=state.selectedProjectId) { return state.projects.find(p=>p.id===id)||null; }
function boards(projectId=state.selectedProjectId) { const p=project(projectId); return p?.boards||[]; }
function board(boardId=state.selectedBoardId, projectId=state.selectedProjectId) {
  return boards(projectId).find(b=>b.id===boardId)||null;
}
function circuits(boardId=state.selectedBoardId, projectId=state.selectedProjectId) {
  const p=project(projectId); if (!p) return [];
  const bid = boardId || (p.boards[0]?.id);
  return (p.circuits||[]).filter(c=>c.boardId===bid).sort((a,b)=>(a.slot||999)-(b.slot||999));
}
function allCircuits(projectId=state.selectedProjectId) { const p=project(projectId); return p?.circuits||[]; }
function projectDevices(projectId=state.selectedProjectId) { const p=project(projectId); return p?.devices||DEFAULT_DEVICES; }
function findDevice(devId, projectId=state.selectedProjectId) { return projectDevices(projectId).find(d=>d.id===devId)||null; }
function isTokenValid() { return !!(state.googleAuth.signedIn && state.googleAuth.accessToken && Date.now() < (state.googleAuth.expiresAt || 0)); }

/* ── Google Auth ─────────────────────────────────────────────────────────── */
async function bootGoogle() {
  // waitFor: poll window[name] until it exists or timeout
  const waitFor = (n, t=12000) => new Promise((res,rej) => {
    const s=Date.now();
    const tick = () => { if (window[n]) return res(window[n]); if (Date.now()-s>t) return rej(new Error(n+" did not load")); setTimeout(tick,80); };
    tick();
  });
  try {
    await waitFor("gapi");
    await new Promise((r,j) => gapi.load("client", { callback:r, onerror:j }));
    await gapi.client.init({ apiKey: googleConfig.googleApiKey });
    await gapi.client.load("https://www.googleapis.com/discovery/v1/apis/drive/v3/rest");
    await gapi.client.load("https://sheets.googleapis.com/$discovery/rest?version=v4");
  } catch(e) { toast("Google API failed to load — check your connection"); return; }
  try {
    await waitFor("google");
    _tokenClient = google.accounts.oauth2.initTokenClient({
      client_id: googleConfig.googleClientId,
      scope: googleScopes,
      callback: handleTokenResponse,
      error_callback: (err) => {
        state.googleAuth.bootstrapping = false;
        state.googleAuth.authFailed = true;
        toast("Sign-in error: " + (err?.message || err?.type || "Unknown"));
        render();
      }
    });
  } catch(e) { toast("Google Sign-In failed to load"); return; }
  state.googleAuth.librariesReady = true;
  // Auto-reconnect silently if user previously signed in — no tap required
  if (state.googleAuth.bootstrapped) {
    _tokenClient.requestAccessToken({ prompt: "" });
  } else {
    render();
  }
}

function handleTokenResponse(resp) {
  state.googleAuth.bootstrapping = false;
  state.googleAuth.authFailed    = false;
  if (resp.error) { toast("Sign-in failed: " + (resp.error_description || resp.error)); render(); return; }
  state.googleAuth.accessToken = resp.access_token;
  state.googleAuth.expiresAt   = Date.now() + ((resp.expires_in || 3600) * 1000);
  state.googleAuth.signedIn    = true;
  gapi.client.setToken({ access_token: resp.access_token });
  // Schedule silent re-auth 5 min before expiry
  const msUntilRefresh = ((resp.expires_in || 3600) - 300) * 1000;
  setTimeout(() => { if (_tokenClient && state.googleAuth.signedIn) _tokenClient.requestAccessToken({ prompt: "" }); }, msUntilRefresh);
  if (!state.googleAuth.bootstrapped) {
    state.googleAuth.bootstrapped = true;
    bootstrapDrive().then(() => { applyDeepLink(); persist(); render(); });
  } else {
    // Silent re-auth on return visit — reload from Drive if we have no projects in memory
    fetchUserInfo().then(() => {
      if (!state.projects.length && state.drive.rootFolderId) {
        loadProjectsFromDrive().finally(() => { applyDeepLink(); persist(); render(); });
      } else {
        applyDeepLink(); persist(); render();
      }
    });
  }
}

function signIn() {
  if (!_tokenClient) { toast("Google libraries still loading…"); return; }
  state.googleAuth.bootstrapping = true; state.googleAuth.authFailed = false; render();
  _tokenClient.requestAccessToken({ prompt: state.googleAuth.bootstrapped ? "" : "consent" });
}

function signOut() {
  if (state.googleAuth.accessToken && window.google?.accounts?.oauth2) {
    try { google.accounts.oauth2.revoke(state.googleAuth.accessToken, ()=>{}); } catch(e) {}
  }
  if (window.gapi?.client) gapi.client.setToken(null);
  state.googleAuth.accessToken = null; state.googleAuth.expiresAt = null;
  state.googleAuth.signedIn = false; state.googleAuth.profile = null;
  state.googleAuth.bootstrapped = false; state.googleAuth.authFailed = false;
  state.projects = []; state.selectedProjectId = null; state.activeView = "projects";
  localStorage.removeItem(STORAGE_KEY);
  render();
}

async function fetchUserInfo() {
  if (!state.googleAuth.accessToken) return;
  try {
    const r = await fetch("https://openidconnect.googleapis.com/v1/userinfo", { headers: { Authorization: "Bearer " + state.googleAuth.accessToken } });
    if (r.ok) state.googleAuth.profile = await r.json();
  } catch(e) {}
}

/* ── Drive helpers ───────────────────────────────────────────────────────── */
async function googleCall(fn) {
  if (!isTokenValid() && state.googleAuth.bootstrapped) {
    // Token expired — silently refresh before making the call
    await new Promise((res, rej) => {
      if (!_tokenClient) return rej(new Error("tokenClient not ready"));
      const prev = _tokenClient.callback;
      _tokenClient.callback = r => {
        _tokenClient.callback = prev;
        if (r.error) return rej(r.error);
        state.googleAuth.accessToken = r.access_token;
        state.googleAuth.expiresAt   = Date.now() + ((r.expires_in || 3600) - 60) * 1000;
        state.googleAuth.signedIn    = true;
        gapi.client.setToken({ access_token: r.access_token });
        res();
      };
      _tokenClient.requestAccessToken({ prompt: "" });
    });
  }
  return fn();
}

async function findOrCreateFolder(name, parentId=null) {
  const q = [`name='${name}'`, `mimeType='application/vnd.google-apps.folder'`, `trashed=false`, parentId ? `'${parentId}' in parents` : null].filter(Boolean).join(" and ");
  const r = await googleCall(()=>gapi.client.drive.files.list({ q, fields:"files(id,name)", spaces:"drive" }));
  if (r.result.files.length) return r.result.files[0].id;
  const c = await googleCall(()=>gapi.client.drive.files.create({ resource:{ name, mimeType:"application/vnd.google-apps.folder", parents: parentId?[parentId]:[] }, fields:"id" }));
  return c.result.id;
}

async function findFileInFolder(name, parentId) {
  const q = [`name='${name}'`, `trashed=false`, `'${parentId}' in parents`].join(" and ");
  const r = await googleCall(()=>gapi.client.drive.files.list({ q, fields:"files(id,name)", spaces:"drive" }));
  return r.result.files[0]||null;
}

async function bootstrapDrive() {
  state.loading = true; state.loadingMsg = "Setting up Drive…"; render();
  try {
    await fetchUserInfo();
    state.drive.rootFolderId = await findOrCreateFolder(DRIVE_ROOT_NAME);
    // Try to find ND_SWB_Reference sheet
    const refFile = await findFileInFolder(REFERENCE_SHEET_NAME, state.drive.rootFolderId);
    if (refFile) {
      state.drive.referenceSheetId = refFile.id;
      await loadReferenceSheet();
    }
    // Load projects from Drive
    await loadProjectsFromDrive();
    // Handle deep link
    if (state.deepLink.projectId) {
      const p = state.projects.find(x=>x.id===state.deepLink.projectId);
      if (p) {
        state.selectedProjectId = p.id;
        state.selectedBoardId   = state.deepLink.boardId || p.boards[0]?.id || null;
        state.activeView = "board";
      }
    }
  } catch(e) {
    toast("Drive setup failed: " + e.message);
  } finally {
    state.loading = false; persist(); render();
  }
}

/* ── Reference Sheet (C9 + Config) ──────────────────────────────────────── */
async function loadReferenceSheet() {
  if (!state.drive.referenceSheetId) return;
  try {
    const vr = await googleCall(()=>gapi.client.sheets.spreadsheets.values.batchGet({
      spreadsheetId: state.drive.referenceSheetId,
      ranges: ["c9_table!A2:N", "BreakerBrands!A:A"]
    }));
    const c9Rows = (vr.result.valueRanges[0]?.values||[]).filter(r=>r[0]&&r[1]);
    if (c9Rows.length) {
      const built = c9Rows.map(r=>[
        parseNum(r[0]), parseNum(r[1]), parseNum(r[2]),
        r[3]?parseNum(r[3]):null, r[4]?parseNum(r[4]):null,
        r[5]?parseNum(r[5]):null, r[6]?parseNum(r[6]):null,
        r[8]?parseNum(r[8]):null,
        r[9]&&r[9].includes("10A_NONDOM:TRUE"), r[9]&&r[9].includes("10A_DOM:TRUE"),
        r[9]&&r[9].includes("15A:TRUE"), r[9]&&r[9].includes("20A:TRUE"),
        r[9]&&r[9].includes("RANGE:TRUE"),
      ]);
      state.c9Map = buildC9Map(built);
      state.c9Source = "sheet";
    }
    const brandRows = (vr.result.valueRanges[1]?.values||[]).map(r=>r[0]).filter(Boolean);
    if (brandRows.length) state.drive.breakerBrands = brandRows;
  } catch(e) { /* keep built-in fallback */ }
}

/* ── Project Sheet ops ───────────────────────────────────────────────────── */
const PROJECT_SHEET_TABS = ["Project","Boards","Circuits","Devices","LoadCalc","Log"];

async function createProjectSheet(project, folderId) {
  const ss = await googleCall(()=>gapi.client.sheets.spreadsheets.create({
    resource: {
      properties: { title: `${project.name}_SWB` },
      sheets: PROJECT_SHEET_TABS.map(t=>({ properties:{ title:t } }))
    }
  }));
  const ssId = ss.result.spreadsheetId;
  // Move to job folder
  const f = await googleCall(()=>gapi.client.drive.files.get({ fileId:ssId, fields:"parents" }));
  await googleCall(()=>gapi.client.drive.files.update({
    fileId:ssId, addParents:folderId,
    removeParents:(f.result.parents||[]).join(","), fields:"id,parents"
  }));
  return ssId;
}

async function saveProjectToSheet(proj) {
  const ssId = state.drive.projectFolderMap[proj.id];
  if (!ssId || !isTokenValid()) return;
  const projectRow = [[proj.id,proj.name,proj.address||"",proj.phase||"single",proj.linkedPlannerFileId||"",proj.linkedPlannerProjectId||"",proj.createdAt,proj.updatedAt,SWB_SCHEMA_VERSION]];
  const boardRows  = (proj.boards||[]).map(b=>[b.id,proj.id,b.label,b.phase||"single",b.mainBreakerA||"",b.location||"",b.parentBoardId||"",b.feedCircuitId||"",b.createdAt]);
  const circuitRows= (proj.circuits||[]).map(c=>[
    c.id,c.boardId,proj.id,c.name,c.type||"",c.phase||"",c.breakerType||"",c.breakerRating||"",c.rcdProtected?"TRUE":"FALSE",c.rcdTripMa||"",c.breakerBrand||"",
    c.cableCsa||"",c.cableType||"",c.runLength||"",c.conduit?"TRUE":"FALSE",c.deratingApplied?"TRUE":"FALSE",c.deratingFactor||"",
    JSON.stringify(c.devices||[]),c.totalLoadA||0,c.c9RowKey||"",c.maxPermittedA||"",c.loadStatus||"",
    c.notes||"",c.installStatus||"planned",(c.plannerNodeIds||[]).join(","),c.slot||"",c.createdAt,c.updatedAt
  ]);
  const deviceRows = (proj.devices||[]).map(d=>[d.id,proj.id,d.name,d.cat,d.amp,d.ded?"TRUE":"FALSE",d.defBreaker||"",d.std||"",d.notes||"",d.fav?"TRUE":"FALSE"]);
  const loadRows   = (proj.circuits||[]).map(c=>[c.id,c.name,c.totalLoadA||0,c.maxPermittedA||"",c.deltaA||"",c.loadStatus||"",c.updatedAt]);
  try {
    await googleCall(()=>gapi.client.sheets.spreadsheets.values.batchClear({
      spreadsheetId:ssId, resource:{ ranges:["Project!A2:Z","Boards!A2:Z","Circuits!A2:Z","Devices!A2:Z","LoadCalc!A2:Z"] }
    }));
    const data = [];
    if (projectRow.length) data.push({ range:"Project!A2", values:projectRow });
    if (boardRows.length)   data.push({ range:"Boards!A2",  values:boardRows  });
    if (circuitRows.length) data.push({ range:"Circuits!A2",values:circuitRows});
    if (deviceRows.length)  data.push({ range:"Devices!A2", values:deviceRows });
    if (loadRows.length)    data.push({ range:"LoadCalc!A2",values:loadRows   });
    if (data.length) await googleCall(()=>gapi.client.sheets.spreadsheets.values.batchUpdate({
      spreadsheetId:ssId, resource:{ valueInputOption:"RAW", data }
    }));
  } catch(e) { toast("Sheet save failed: " + e.message); }
}

async function loadProjectFromSheet(ssId) {
  try {
    const vr = await googleCall(()=>gapi.client.sheets.spreadsheets.values.batchGet({
      spreadsheetId:ssId,
      ranges:["Project!A2:J","Boards!A2:J","Circuits!A2:AD","Devices!A2:J"]
    }));
    const [pRows,bRows,cRows,dRows] = vr.result.valueRanges.map(v=>v.values||[]);
    if (!pRows.length) return null;
    const pr = pRows[0];
    const proj = {
      id:pr[0]||uid("prj"), name:pr[1]||"Unnamed", address:pr[2]||"",
      phase:pr[3]||"single", linkedPlannerFileId:pr[4]||"", linkedPlannerProjectId:pr[5]||"",
      createdAt:pr[6]||nowStamp(), updatedAt:pr[7]||nowStamp(),
      boards: bRows.map(r=>({ id:r[0], label:r[2]||"Board", phase:r[3]||"single", mainBreakerA:parseNum(r[4]), location:r[5]||"", parentBoardId:r[6]||null, feedCircuitId:r[7]||null, createdAt:r[8]||nowStamp() })),
      circuits: cRows.map(r=>({ id:r[0], boardId:r[1], name:r[3]||"Circuit", type:r[4]||"power", phase:r[5]||"L1", breakerType:r[6]||"MCB", breakerRating:parseNum(r[7],20), rcdProtected:r[8]==="TRUE", rcdTripMa:parseNum(r[9],30), breakerBrand:r[10]||"", cableCsa:parseNum(r[11],2.5), cableType:r[12]||"TPS", runLength:parseNum(r[13]), conduit:r[14]==="TRUE", deratingApplied:r[15]==="TRUE", deratingFactor:parseNum(r[16],1), devices:tryJson(r[17],[]), totalLoadA:parseNum(r[18]), c9RowKey:r[19]||"", maxPermittedA:parseNum(r[20]), loadStatus:r[21]||"ok", notes:r[22]||"", installStatus:r[23]||"planned", plannerNodeIds:(r[24]||"").split(",").filter(Boolean), slot:parseNum(r[25]), createdAt:r[26]||nowStamp(), updatedAt:r[27]||nowStamp() })),
      devices: dRows.length ? dRows.map(r=>({ id:r[0], name:r[2]||"Device", cat:r[3]||"Custom", amp:parseNum(r[4]), ded:r[5]==="TRUE", defBreaker:r[6]?parseNum(r[6]):null, std:r[7]||"", notes:r[8]||"", fav:r[9]==="TRUE" })) : [...DEFAULT_DEVICES],
    };
    // Recalc all circuits
    proj.circuits = proj.circuits.map(c=>({ ...c, ...calcLoad(c, state.c9Map, proj.devices) }));
    return proj;
  } catch(e) { toast("Load from sheet failed: " + e.message); return null; }
}

function tryJson(s, def) { try { return JSON.parse(s)||def; } catch(e) { return def; } }

/* ── Load Projects from Drive ────────────────────────────────────────────── */
async function loadProjectsFromDrive() {
  if (!state.drive.rootFolderId) return;
  try {
    const projFolderId = await findOrCreateFolder(DRIVE_PROJECTS_FOLDER, state.drive.rootFolderId);
    // Find all sheets in all sub-folders named *_SWB
    const q = `name contains '_SWB' and mimeType='application/vnd.google-apps.spreadsheet' and trashed=false`;
    const r = await googleCall(()=>gapi.client.drive.files.list({ q, fields:"files(id,name)", spaces:"drive", pageSize:100 }));
    const loaded = [];
    for (const f of r.result.files||[]) {
      const proj = await loadProjectFromSheet(f.id);
      if (proj) {
        state.drive.projectFolderMap[proj.id] = f.id;
        loaded.push(proj);
      }
    }
    // Merge with local (prefer cloud)
    loaded.forEach(cloudP => {
      const idx = state.projects.findIndex(p=>p.id===cloudP.id);
      if (idx>=0) state.projects[idx]=cloudP; else state.projects.push(cloudP);
    });
    if (!state.selectedProjectId && state.projects.length) state.selectedProjectId=state.projects[0].id;
    if (!state.selectedBoardId && state.selectedProjectId) {
      const p=project();
      if (p) state.selectedBoardId=p.boards[0]?.id||null;
    }
  } catch(e) { /* offline or no projects */ }
}

/* ── Load Calculation Engine ─────────────────────────────────────────────── */
function calcLoad(circuit, c9Map=state.c9Map, devices=null) {
  const devLib = devices || projectDevices();
  const totalA = (circuit.devices||[]).reduce((sum,d)=>{ const dev=devLib.find(x=>x.id===d.id); return sum+(dev?(dev.amp*(d.qty||1)):0); }, 0);
  const breakerA = circuit.breakerRating || 20;
  const c9Key = `${circuit.cableCsa||2.5}_${breakerA}`;
  const c9Row = c9Map[c9Key]||null;
  const maxA  = breakerA;
  const warnPct = parseNum(state.config.warning_threshold_percent, DEFAULT_WARNING_PCT) / 100;
  const warnThresh = maxA * (1 - warnPct);
  let loadStatus = "ok";
  let npFlag = false;
  if (c9Row) {
    const t = circuit.type||"power";
    if (t==="lighting"   && c9Row.lightingA === null)  npFlag=true;
    if (t==="power"      && c9Row.npDom)               npFlag=true;
    if (t==="power_nd"   && c9Row.npNondom)            npFlag=true;
    if (t==="15a"        && c9Row.np15)                npFlag=true;
    if (t==="20a"        && c9Row.np20)                npFlag=true;
    if (t==="dedicated"  && c9Row.npRange)             npFlag=true;
  }
  if (npFlag) loadStatus="np";
  else if (totalA > maxA) loadStatus="overloaded";
  else if (totalA >= warnThresh && totalA > 0) loadStatus="warning";
  else loadStatus="ok";
  const deltaA = parseFloat((totalA - maxA).toFixed(2));
  // Suggestions for overloaded
  let suggestion = "";
  if (loadStatus==="overloaded") {
    const needed = Math.ceil(totalA / maxA);
    const totalDevices = (circuit.devices||[]).reduce((s,d)=>s+(d.qty||1),0);
    const removeN = Math.ceil(totalDevices*(deltaA/totalA));
    suggestion = `Split into ${needed} circuits — or upgrade cable/breaker`;
    if (removeN>0) suggestion += ` — or reduce point count by ${removeN}`;
  }
  return { totalLoadA: parseFloat(totalA.toFixed(2)), c9RowKey:c9Key, maxPermittedA:maxA, deltaA, loadStatus, suggestion };
}

function recalcAll(proj=project()) {
  if (!proj) return;
  proj.circuits = (proj.circuits||[]).map(c=>({ ...c, ...calcLoad(c, state.c9Map, proj.devices) }));
}

/* ── Project CRUD ────────────────────────────────────────────────────────── */
async function createProject(data) {
  const mainBoardId = uid("brd");
  const proj = {
    id: uid("prj"), name:data.name, address:data.address||"",
    phase: data.phase||"single",
    linkedPlannerFileId: data.linkedPlannerFileId||"",
    linkedPlannerProjectId: data.linkedPlannerProjectId||"",
    createdAt: nowStamp(), updatedAt: nowStamp(),
    boards: [{
      id: mainBoardId, label: data.mainBoardLabel||"Main Switchboard",
      phase: data.phase||"single", mainBreakerA: parseNum(data.mainBreakerA,63),
      location: data.mainBoardLocation||"", parentBoardId: null, feedCircuitId: null,
      createdAt: nowStamp()
    }],
    circuits: [],
    devices: [...DEFAULT_DEVICES],
  };
  state.projects.push(proj);
  state.selectedProjectId = proj.id;
  state.selectedBoardId   = mainBoardId;
  state.activeView = "board";
  persist(); render();
  // Save to Drive
  if (isTokenValid()) {
    toast("Creating project sheet…");
    try {
      const rootId = state.drive.rootFolderId || await findOrCreateFolder(DRIVE_ROOT_NAME);
      const projsFolderId = await findOrCreateFolder(DRIVE_PROJECTS_FOLDER, rootId);
      const jobFolderId   = await findOrCreateFolder(proj.name, projsFolderId);
      const ssId = await createProjectSheet(proj, jobFolderId);
      state.drive.projectFolderMap[proj.id] = ssId;
      await saveProjectToSheet(proj);
      toast("Project created");
    } catch(e) { toast("Sheet create failed — saved locally only"); }
  }
}

function deleteProject(projId) {
  state.projects = state.projects.filter(p=>p.id!==projId);
  if (state.selectedProjectId===projId) { state.selectedProjectId=state.projects[0]?.id||null; state.selectedBoardId=null; state.activeView="projects"; }
  persist(); render();
  toast("Project deleted");
  // Note: Drive sheet not deleted (safety)
}

function scheduleSave() {
  clearTimeout(_savingTimer);
  _savingTimer = setTimeout(()=>{
    const proj=project(); if (proj && isTokenValid()) saveProjectToSheet(proj).catch(()=>{});
  }, 2000);
}

/* ── Board CRUD ──────────────────────────────────────────────────────────── */
function addBoard(data) {
  const proj = project(); if (!proj) return;
  const b = { id:uid("brd"), label:data.label||"Sub-board", phase:data.phase||"single", mainBreakerA:parseNum(data.mainBreakerA,63), location:data.location||"", parentBoardId:data.parentBoardId||proj.boards[0]?.id||null, feedCircuitId:data.feedCircuitId||null, createdAt:nowStamp() };
  proj.boards.push(b);
  proj.updatedAt = nowStamp();
  state.selectedBoardId = b.id;
  persist(); scheduleSave(); render();
}

function updateBoard(boardId, data) {
  const proj=project(); if (!proj) return;
  const b=proj.boards.find(x=>x.id===boardId); if (!b) return;
  Object.assign(b, data);
  proj.updatedAt = nowStamp();
  persist(); scheduleSave(); render();
}

function deleteBoard(boardId) {
  const proj=project(); if (!proj) return;
  if (proj.boards.length<=1) { toast("Cannot delete the only board"); return; }
  proj.boards = proj.boards.filter(b=>b.id!==boardId);
  proj.circuits = proj.circuits.filter(c=>c.boardId!==boardId);
  if (state.selectedBoardId===boardId) state.selectedBoardId=proj.boards[0]?.id||null;
  proj.updatedAt = nowStamp();
  persist(); scheduleSave(); render();
}

/* ── Circuit CRUD ────────────────────────────────────────────────────────── */
function addCircuit(data) {
  const proj=project(); if (!proj) return;
  const circuit = buildCircuit(data, proj);
  proj.circuits.push(circuit);
  proj.updatedAt = nowStamp();
  persist(); scheduleSave(); render();
  return circuit;
}

function buildCircuit(data, proj) {
  const c = {
    id: data.id||uid("cir"),
    boardId: data.boardId||state.selectedBoardId,
    name: data.name||"New Circuit",
    type: data.type||"power",
    phase: data.phase||"L1",
    breakerType: data.breakerType||"MCB",
    breakerRating: parseNum(data.breakerRating,20),
    rcdProtected: data.rcdProtected||false,
    rcdTripMa: parseNum(data.rcdTripMa,30),
    breakerBrand: data.breakerBrand||"",
    cableCsa: parseNum(data.cableCsa,2.5),
    cableType: data.cableType||"TPS",
    runLength: parseNum(data.runLength),
    conduit: data.conduit||false,
    deratingApplied: data.deratingApplied||false,
    deratingFactor: parseNum(data.deratingFactor,1),
    devices: data.devices||[],
    notes: data.notes||"",
    installStatus: data.installStatus||"planned",
    plannerNodeIds: data.plannerNodeIds||[],
    slot: data.slot || ((proj?.circuits?.filter(c => c.boardId === (data.boardId || state.selectedBoardId))?.length || 0) + 1),
    createdAt: data.createdAt||nowStamp(),
    updatedAt: nowStamp(),
  };
  const calc = calcLoad(c, state.c9Map, proj?.devices||DEFAULT_DEVICES);
  return { ...c, ...calc };
}

function updateCircuit(circuitId, data) {
  const proj=project(); if (!proj) return;
  const idx=proj.circuits.findIndex(c=>c.id===circuitId); if (idx<0) return;
  const updated = buildCircuit({ ...proj.circuits[idx], ...data }, proj);
  proj.circuits[idx] = updated;
  proj.updatedAt = nowStamp();
  persist(); scheduleSave(); render();
}

function deleteCircuit(circuitId) {
  const proj=project(); if (!proj) return;
  proj.circuits = proj.circuits.filter(c=>c.id!==circuitId);
  proj.updatedAt = nowStamp();
  if (state.selectedCircuitId===circuitId) state.selectedCircuitId=null;
  persist(); scheduleSave(); render();
}

/* ── Planner Deep-link helpers ───────────────────────────────────────────── */
function openInPlanner(proj=project()) {
  if (!proj) return;
  const url = `${PLANNER_URL}${proj.linkedPlannerProjectId?`#project=${proj.linkedPlannerProjectId}`:""}`;
  window.open(url, "_blank", "noopener");
}

function buildSWBDeepLink(proj=project(), boardId=null) {
  if (!proj) return SWB_URL;
  let url = `${SWB_URL}?project=${proj.id}`;
  if (boardId) url += `&board=${boardId}`;
  return url;
}

function readDeepLinkParams() {
  const p = new URLSearchParams(window.location.search);
  state.deepLink.projectId = p.get("project") || null;
  state.deepLink.boardId   = p.get("board")   || null;
}

function applyDeepLink() {
  const { projectId, boardId } = state.deepLink;
  if (!projectId) return;
  const proj = state.projects.find(p => p.id === projectId);
  if (!proj) return;
  state.selectedProjectId = proj.id;
  state.selectedBoardId   = boardId
    ? (proj.boards.find(b => b.id === boardId)?.id || proj.boards[0]?.id)
    : proj.boards[0]?.id;
  state.activeView = "board";
  state.deepLink = { projectId: null, boardId: null }; // consume once
}

/* ── Toast ───────────────────────────────────────────────────────────────── */
let _toastTimer = null;
function toast(msg) {
  state.toast = msg;
  clearTimeout(_toastTimer);
  _toastTimer = setTimeout(()=>{ state.toast=""; render(); }, 2800);
  render();
}

/* ── Main Render ─────────────────────────────────────────────────────────── */
function render() {
  const app = document.getElementById("app");
  if (!app) return;

  // Gate 1: Never authenticated → show login button
  if (!state.googleAuth.bootstrapped && !state.googleAuth.signedIn) {
    app.innerHTML = renderLoginGate(); bindEvents(); return;
  }
  // Gate 2: Returning user — libraries loading or silent re-auth in flight
  if (state.googleAuth.bootstrapped && !state.googleAuth.signedIn) {
    app.innerHTML = renderLoadingOverlay("Reconnecting…"); return;
  }
  if (state.loading) {
    app.innerHTML = renderLoadingOverlay(state.loadingMsg); return;
  }
  app.innerHTML = `
    <div class="app-shell">
      ${renderTopbar()}
      <main class="main-content">${renderView()}</main>
      ${renderBottomNav()}
      ${state.modal ? renderModal() : ""}
      ${state.toast ? `<div class="toast">${escHtml(state.toast)}</div>` : ""}
    </div>`;
  bindEvents();
}

/* ── Login Gate ──────────────────────────────────────────────────────────── */
function renderLoginGate() {
  const busy   = state.googleAuth.bootstrapping;
  const failed = state.googleAuth.authFailed;
  return `
    <div class="login-gate">
      <div class="login-logo">SWB</div>
      <h1 class="login-heading">Switchboard Planner</h1>
      <p class="login-sub">AS/NZS 3000:2018 compliant circuit planning for electricians</p>
      <div class="login-card">
        ${failed ? `<p style="color:var(--error);margin-bottom:12px;font-size:13px">Sign-in failed. Check your Google account and try again.</p>` : `<p>Sign in with your Neill Data Google account to access your switchboard projects.</p>`}
        <button class="google-btn" data-action="sign-in" ${busy?"disabled":""}>
          ${busy?`<div class="g-spinner"></div>`:I.google}
          ${busy?"Signing in…": failed ? "Try again" : "Sign in with Google"}
        </button>
      </div>
      <p style="margin-top:28px;font-size:12px;color:var(--text-3)">SWB v${SWB_VERSION} · neilldata.com/swb</p>
    </div>`;
}

/* ── Loading Overlay ─────────────────────────────────────────────────────── */
function renderLoadingOverlay(msg="Loading…") {
  return `<div class="loading-overlay"><div class="loading-spinner"></div><p class="loading-text">${escHtml(msg)}</p></div>`;
}

/* ── Topbar ──────────────────────────────────────────────────────────────── */
function renderTopbar() {
  const proj = project();
  const profile = state.googleAuth.profile;
  const initials = profile ? (profile.given_name?.[0]||""+(profile.family_name?.[0]||"")) : "?";
  return `
    <header class="topbar">
      <div class="topbar-brand">
        <div class="topbar-logo"><svg width="18" height="18" viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg"><polygon points="18,3 9,17 16,17 14,29 23,15 16,15" fill="currentColor"/></svg></div>
        <div>
          <div class="topbar-title">SWB</div>
          ${proj && state.activeView==="board" ? `<div class="topbar-sub">${escHtml(proj.name)}</div>` : `<div class="topbar-sub">Switchboard Planner</div>`}
        </div>
      </div>
      <div class="topbar-spacer"></div>
      ${proj && state.activeView==="board" ? `<button class="btn btn-ghost btn-sm btn-planner" data-action="open-planner" title="Open in Planner">${I.planner} Planner</button>` : ""}
      <button class="topbar-user" data-action="view-settings" title="Settings">
        ${profile?.picture?`<img src="${escHtml(profile.picture)}" alt="" referrerpolicy="no-referrer" />`:`<span>${escHtml(initials)}</span>`}
      </button>
    </header>`;
}

/* ── Bottom Nav ──────────────────────────────────────────────────────────── */
function renderBottomNav() {
  const navItems = [
    { id:"projects", icon:I.zap,     label:"Projects" },
    { id:"board",    icon:I.board,   label:"Board",   disabled: !state.selectedProjectId },
    { id:"devices",  icon:I.device,  label:"Devices", disabled: !state.selectedProjectId },
    { id:"export",   icon:I.export,  label:"Export",  disabled: !state.selectedProjectId },
  ];
  return `<nav class="bottom-nav">${navItems.map(n=>`
    <button class="${state.activeView===n.id?"is-active":""} ${n.disabled?"is-disabled":""}" data-view="${n.id}" ${n.disabled?"disabled":""}>
      ${n.icon}<span>${n.label}</span>
    </button>`).join("")}</nav>`;
}

/* ── View Router ─────────────────────────────────────────────────────────── */
function renderView() {
  switch(state.activeView) {
    case "projects": return renderProjectsView();
    case "board":    return renderBoardView();
    case "devices":  return renderDevicesView();
    case "export":   return renderExportView();
    case "settings": return renderSettingsView();
    default:         return renderProjectsView();
  }
}

/* ── Projects View ───────────────────────────────────────────────────────── */
function renderProjectsView() {
  const projs = state.projects;
  return `
    <div class="view-panel">
      <div class="panel-header">
        <h2>Projects</h2>
        <button class="btn btn-primary" data-action="new-project">${I.plus} New project</button>
      </div>
      ${projs.length===0 ? `
        <div class="empty-state">
          ${I.board}
          <h3>No switchboard projects yet</h3>
          <p>Create a new project or import from Planner.</p>
          <button class="btn btn-primary" data-action="new-project">${I.plus} New project</button>
        </div>` : `
        <div class="project-grid">
          ${projs.map((p,i)=>renderProjectCard(p,i)).join("")}
        </div>`}
    </div>`;
}

function renderProjectCard(proj, idx) {
  const cc = (proj.circuits||[]);
  const overloaded = cc.filter(c=>c.loadStatus==="overloaded").length;
  const warnings   = cc.filter(c=>c.loadStatus==="warning").length;
  const style = `animation-delay:${idx*40}ms`;
  return `
    <div class="project-card" data-open-project="${proj.id}" style="${style}">
      <div class="project-card-header">
        <div>
          <div class="project-card-name">${escHtml(proj.name)}</div>
          ${proj.address?`<div class="project-card-addr">${escHtml(proj.address)}</div>`:""}
        </div>
        <div class="project-card-actions" onclick="event.stopPropagation()">
          <button class="btn-icon" data-action="edit-project" data-project-id="${proj.id}" title="Edit">${I.edit}</button>
          <button class="btn-icon" data-action="delete-project" data-project-id="${proj.id}" title="Delete">${I.trash}</button>
        </div>
      </div>
      <div class="project-card-meta">
        <span class="project-card-stat"><strong>${(proj.boards||[]).length}</strong> board${(proj.boards||[]).length!==1?"s":""}</span>
        <span class="project-card-stat"><strong>${cc.length}</strong> circuit${cc.length!==1?"s":""}</span>
        <span class="project-card-stat" style="color:var(--${proj.phase==='3ph'?'phase-3ph':'text-2'})">${proj.phase==="3ph"?"3-phase":"Single-phase"}</span>
        ${overloaded?`<span class="project-card-stat" style="color:var(--err)">${I.warn} ${overloaded} overloaded</span>`:""}
        ${warnings?`<span class="project-card-stat" style="color:var(--warn)">${warnings} warning${warnings!==1?"s":""}</span>`:""}
      </div>
      ${proj.linkedPlannerProjectId?`<div class="project-linked">${I.link} Linked to Planner project</div>`:""}
    </div>`;
}

/* ── Board View ──────────────────────────────────────────────────────────── */
function renderBoardView() {
  const proj = project();
  if (!proj) return `<div class="empty-state"><h3>No project selected</h3><p><button class="btn btn-primary" data-view="projects">Back to projects</button></p></div>`;

  const bs = proj.boards||[];
  const curBoardId = state.selectedBoardId || bs[0]?.id;
  const curBoard   = bs.find(b=>b.id===curBoardId)||bs[0];
  if (!curBoard) return `<div class="view-panel"><p style="color:var(--text-2)">No boards yet.</p></div>`;

  const circs   = circuits(curBoard.id);
  const overloaded = circs.filter(c=>c.loadStatus==="overloaded");
  const totalLoadA = circs.reduce((s,c)=>s+(c.totalLoadA||0),0);
  const maxLoadA   = curBoard.mainBreakerA||0;
  const filtered   = applyFilters(circs);

  return `
    ${proj.linkedPlannerProjectId ? renderPlannerLinkStrip(proj) : ""}
    ${overloaded.length ? renderOverloadBanner(overloaded) : ""}
    <div class="board-tabs-wrap">
      <div class="board-tabs">
        ${bs.map(b=>`<button class="board-tab ${b.id===curBoard.id?"is-active":""}" data-board="${b.id}">${escHtml(b.label)}</button>`).join("")}
        <button class="board-tab-add btn-icon" data-action="new-board" title="Add sub-board">${I.plus}</button>
      </div>
    </div>
    <div class="board-summary">
      <div class="board-stat"><div class="board-stat-val">${circs.length}</div><div class="board-stat-lbl">Circuits</div></div>
      <div class="board-stat"><div class="board-stat-val ${overloaded.length?"err":""}">${overloaded.length}</div><div class="board-stat-lbl">Overloaded</div></div>
      <div class="board-stat"><div class="board-stat-val ${circs.filter(c=>c.loadStatus==="warning").length?"warn":""}">${circs.filter(c=>c.loadStatus==="warning").length}</div><div class="board-stat-lbl">At Limit</div></div>
      <div class="board-stat"><div class="board-stat-val ${totalLoadA>maxLoadA?"err":"ok"}" style="font-family:var(--font-mono)">${totalLoadA.toFixed(1)}A</div><div class="board-stat-lbl">Total load</div></div>
      ${maxLoadA?`<div class="board-stat"><div class="board-stat-val" style="font-family:var(--font-mono)">${maxLoadA}A <button type="button" class="btn-icon btn-inline" data-action="edit-board" data-board="${curBoard.id}" title="Edit board" style="vertical-align:middle;margin-left:2px;opacity:0.6">${I.edit}</button></div><div class="board-stat-lbl">Main breaker</div></div>`:""}
    </div>
    <div class="toolbar">
      <div class="search-wrap">${I.search}<input data-filter="query" placeholder="Search circuits…" value="${escHtml(state.filters.query)}" /></div>
      <button class="btn btn-primary" data-action="new-circuit">${I.plus} Circuit</button>
    </div>
    <div style="padding:0 16px 8px;display:flex;gap:6px;flex-wrap:wrap">
      ${renderFilterPills()}
    </div>
    <div class="circuit-list">
      ${filtered.length===0?`<div class="empty-state" style="padding:32px">${I.zap}<h3>No circuits${state.filters.query||state.filters.type!=="all"||state.filters.status!=="all"||state.filters.phase!=="all"?" matching filters":""}</h3><p>${circs.length===0?"Add your first circuit to this board.":"Try clearing the filters."}</p>${circs.length===0?`<button class="btn btn-primary" data-action="new-circuit">${I.plus} Add circuit</button>`:""}</div>`:filtered.map((c,i)=>renderCircuitCard(c,i)).join("")}
    </div>`;
}

function applyFilters(circs) {
  let f = circs;
  if (state.filters.query) {
    const q=state.filters.query.toLowerCase();
    f=f.filter(c=>c.name.toLowerCase().includes(q)||c.notes?.toLowerCase().includes(q)||c.type?.toLowerCase().includes(q));
  }
  if (state.filters.type!=="all") f=f.filter(c=>c.type===state.filters.type);
  if (state.filters.status!=="all") f=f.filter(c=>c.loadStatus===state.filters.status);
  if (state.filters.phase!=="all") f=f.filter(c=>c.phase===state.filters.phase);
  return f;
}

function renderFilterPills() {
  const proj = project();
  const types = ["all","lighting","power","dedicated","feed","custom"];
  const statuses = [["all","All"],["ok","Good"],["warning","100%"],["overloaded","Over"]];
  const phases = proj?.phase==="single"
    ? [["all","Phase"]]
    : [["all","All phases"],["L1","L1"],["L2","L2"],["L3","L3"],["3ph","3ph"]];
  return [
    ...types.map(t=>`<button class="filter-pill ${state.filters.type===t?"is-active":""}" data-filter-type="${t}">${t==="all"?"All types":t.charAt(0).toUpperCase()+t.slice(1)}</button>`),
    ...statuses.map(([v,l])=>`<button class="filter-pill ${state.filters.status===v?"is-active":""}" data-filter-status="${v}">${l}</button>`),
    ...phases.map(([v,l])=>`<button class="filter-pill ${state.filters.phase===v?"is-active":""}" data-filter-phase="${v}">${l}</button>`),
  ].join("");
}

function renderPlannerLinkStrip(proj) {
  return `
    <div class="planner-link-strip">
      ${I.link}
      <div class="planner-link-strip-text">
        <strong>Linked to Planner</strong>
        <span>Project: ${escHtml(proj.linkedPlannerProjectId||"—")}</span>
      </div>
      <button class="btn btn-ghost btn-sm btn-planner" data-action="open-planner">${I.planner} Open</button>
    </div>`;
}

function renderOverloadBanner(overloaded) {
  return `
    <div class="overload-banner">
      ${I.warn}
      <div class="overload-banner-text">
        <strong>${overloaded.length} overloaded circuit${overloaded.length!==1?"s":""}</strong>
        <span>${overloaded.map(c=>c.name).join(", ")}</span>
      </div>
    </div>`;
}

function renderCircuitCard(c, idx) {
  const phaseDotClass = c.phase==="3ph"?"ph3":(c.phase||"L1").toLowerCase();
  const loadPct   = c.maxPermittedA>0 ? Math.min((c.totalLoadA/c.maxPermittedA)*100, 100) : 0;
  const barClass  = c.loadStatus==="overloaded"?"err":c.loadStatus==="warning"?"edge":"ok";
  const statusLabel = { ok:"GOOD", warning:"100%", overloaded:"OVER", np:"N/P" }[c.loadStatus]||"—";
  const typeColors  = { lighting:"badge-type-lighting", power:"badge-type-power", dedicated:"badge-type-dedicated", feed:"badge-type-feed", custom:"badge-type-custom" };
  const devChips = (c.devices||[]).map(d=>{
    const dev=findDevice(d.id); if(!dev) return "";
    return `<span class="device-chip"><span class="qty">${d.qty||1}×</span>${escHtml(dev.name)}</span>`;
  }).join("");
  const style = `animation-delay:${idx*30}ms`;
  return `
    <div class="circuit-card status-${c.loadStatus}" data-circuit="${c.id}" style="${style}">
      <div class="circuit-card-header">
        <div class="phase-dot ${phaseDotClass}"></div>
        <div style="flex:1">
          <div class="circuit-name">${escHtml(c.name)}</div>
        </div>
        <div class="circuit-num">#${c.slot||"—"}</div>
        <div class="circuit-badges">
          <span class="badge ${typeColors[c.type]||"badge-type-custom"}">${escHtml(c.type||"—")}</span>
          <span class="badge badge-${c.loadStatus==="ok"?"ok":c.loadStatus==="warning"?"edge":"err"}">${statusLabel}</span>
          ${c.installStatus&&c.installStatus!=="planned"?`<span class="badge badge-install-${c.installStatus}">${c.installStatus}</span>`:""}
        </div>
        <div class="circuit-card-drag">⋮⋮</div>
      </div>
      <div class="circuit-meta">
        <span><strong>${c.breakerRating}A</strong> ${escHtml(c.breakerType||"MCB")}${c.rcdProtected?` RCD ${c.rcdTripMa}mA`:""}</span>
        <span><strong>${c.cableCsa}mm²</strong> ${escHtml(c.cableType||"TPS")}</span>
        ${c.runLength?`<span>Est. <strong>${c.runLength}m</strong></span>`:""}
        <span style="color:var(--phase-${phaseDotClass==="ph3"?"3ph":phaseDotClass})">${c.phase||"L1"}</span>
      </div>
      <div class="load-bar-wrap">
        <div class="load-bar-labels">
          <span class="load-current ${barClass}">${c.totalLoadA.toFixed(1)}A</span>
          <span>${c.maxPermittedA}A max &nbsp; ${loadPct.toFixed(0)}%</span>
        </div>
        <div class="load-bar-track">
          <div class="load-bar-fill ${barClass}" style="width:${loadPct}%"></div>
        </div>
      </div>
      ${c.loadStatus==="overloaded"?`
        <div class="overload-alert">
          <strong>${I.warn} Overloaded by ${Math.abs(c.deltaA).toFixed(1)}A</strong>
          ${c.suggestion?`<div class="overload-suggestion">💡 ${escHtml(c.suggestion)}</div>`:""}
        </div>`:""}
      ${devChips?`<div class="circuit-devices">${devChips}</div>`:""}
      <div style="display:flex;gap:6px;margin-top:10px;justify-content:flex-end">
        <button class="btn btn-ghost btn-sm" data-action="edit-circuit" data-circuit-id="${c.id}">${I.edit} Edit</button>
        <button class="btn-icon" data-action="delete-circuit" data-circuit-id="${c.id}" title="Delete">${I.trash}</button>
      </div>
    </div>`;
}

/* ── Devices View ────────────────────────────────────────────────────────── */
function renderDevicesView() {
  const proj = project();
  if (!proj) return `<div class="empty-state"><h3>No project selected</h3></div>`;
  const devs = projectDevices();
  const categories = [...new Set(devs.map(d=>d.cat))];
  return `
    <div class="view-panel">
      <div class="panel-header">
        <h2>Device Library</h2>
        <button class="btn btn-primary" data-action="new-device">${I.plus} Add device</button>
      </div>
      <p style="font-size:13px;color:var(--text-2);margin-bottom:16px">Tap a device to edit it. Changes sync to your project sheet automatically.</p>
    </div>
    <div class="device-library">
      ${categories.map((cat,ci)=>`
        <div class="device-category" style="animation-delay:${ci*40}ms">
          <div class="device-category-title">${escHtml(cat)}</div>
          <table class="device-table">
            <thead><tr><th>Device</th><th>Standard ref</th><th>Default (A)</th><th>Dedicated</th><th></th></tr></thead>
            <tbody>
              ${devs.filter(d=>d.cat===cat).map(d=>`
                <tr>
                  <td>${escHtml(d.name)}</td>
                  <td style="font-size:11px;color:var(--text-2)">${escHtml(d.std||"—")}</td>
                  <td>${d.amp}A</td>
                  <td>${d.ded?`<span class="badge badge-ok">Yes${d.defBreaker?` ${d.defBreaker}A`:""}</span>`:""}</td>
                  <td><button type="button" class="btn-icon" data-action="edit-device" data-device-id="${d.id}" title="Edit">${I.edit}</button></td>
                </tr>`).join("")}
            </tbody>
          </table>
        </div>`).join("")}
    </div>`;
}

/* ── Export View ─────────────────────────────────────────────────────────── */
function renderExportView() {
  const proj = project();
  if (!proj) return `<div class="empty-state"><h3>No project selected</h3></div>`;
  return `
    <div class="export-view">
      <div class="panel-header"><h2>Export</h2></div>
      <div class="export-options">
        <button class="export-option" data-action="export-pdf" style="animation-delay:0ms">
          ${I.pdf}
          <h4>Circuit Schedule PDF</h4>
          <p>Print-ready schedule. All boards, all circuits. AS/NZS 3000:2018 reference footer.</p>
        </button>
        <button class="export-option" data-action="copy-link" style="animation-delay:50ms">
          ${I.link}
          <h4>Copy SWB link</h4>
          <p>Deep link to this project in SWB. Share with your team.</p>
        </button>
        <button class="export-option" data-action="open-sheet" style="animation-delay:100ms">
          ${I.export}
          <h4>Open Google Sheet</h4>
          <p>View and edit raw project data in Google Sheets.</p>
        </button>
        <button class="export-option" data-action="show-panel-mockup" style="animation-delay:150ms">
          ${I.board}
          <h4>Panel Mockup</h4>
          <p>Visual layout of your switchboard with breakers in DIN-rail rows.</p>
        </button>
        ${proj.linkedPlannerProjectId?`
        <button class="export-option btn-planner" data-action="open-planner" style="animation-delay:200ms">
          ${I.planner}
          <h4>Open in Planner</h4>
          <p>Jump back to the linked Planner project.</p>
        </button>`:""}
      </div>
      ${state.showPanelMockup ? renderPanelMockup(proj) : ""}
    </div>`;
}

function renderPanelMockup(proj) {
  const boards = proj.boards||[];
  const SLOT_W = 18; // px per breaker pole width
  const ROW_H  = 72;
  const ROW_W  = 360;
  const POLES_PER_ROW = Math.floor(ROW_W / SLOT_W); // 20 poles per row

  const colors = { lighting:"#f59e0b", power:"#3b82f6", dedicated:"#8b5cf6", feed:"#10b981", custom:"#6b7280" };

  const boardSections = boards.map(board => {
    const circs = circuits(board.id).filter(c=>c.slot);
    circs.sort((a,b)=>(a.slot||0)-(b.slot||0));

    // Lay breakers into rows
    let rows = [[]]; let col = 0;
    circs.forEach(c => {
      const poles = c.breakerPoles||1;
      if (col + poles > POLES_PER_ROW) { rows.push([]); col = 0; }
      rows[rows.length-1].push({...c, poles});
      col += poles;
    });

    const svgH = rows.length * (ROW_H + 12) + 40;
    const svgW = ROW_W + 40;

    const rowSvg = rows.map((row, ri) => {
      let x = 20;
      const y = ri * (ROW_H + 12) + 30;
      const dinRail = `<rect x="20" y="${y+ROW_H/2-2}" width="${ROW_W}" height="4" fill="#666" rx="2"/>`;
      const breakers = row.map(c => {
        const w = c.poles * SLOT_W - 2;
        const col = colors[c.type]||colors.custom;
        const statusColor = c.loadStatus==="overloaded"?"#ef4444":c.loadStatus==="warning"?"#10b981":"#22c55e";
        const bx = x; x += c.poles * SLOT_W;
        const name = (c.name||"").substring(0,8);
        const amp = c.breakerRating?`${c.breakerRating}A`:"";
        return `<g>
          <rect x="${bx}" y="${y-2}" width="${w}" height="${ROW_H}" rx="3" fill="#1e1e1e" stroke="${col}" stroke-width="1.5"/>
          <rect x="${bx+2}" y="${y+ROW_H-14}" width="${w-4}" height="6" rx="2" fill="${statusColor}" opacity="0.9"/>
          <rect x="${bx+w/2-6}" y="${y+10}" width="12" height="24" rx="2" fill="${col}" opacity="0.25"/>
          <rect x="${bx+w/2-5}" y="${y+14}" width="10" height="8" rx="1" fill="${col}" opacity="0.6"/>
          <text x="${bx+w/2}" y="${y+48}" text-anchor="middle" font-size="7" fill="#ccc" font-family="monospace">${escHtml(amp)}</text>
          <text x="${bx+w/2}" y="${y+58}" text-anchor="middle" font-size="6" fill="#888" font-family="sans-serif">${escHtml(name)}</text>
        </g>`;
      }).join("");
      return dinRail + breakers;
    }).join("");

    return `
      <div class="panel-mockup-board">
        <div class="panel-mockup-label">${escHtml(board.label)} · ${board.mainBreakerA||"?"}A Main</div>
        <div class="panel-mockup-svg-wrap" style="overflow-x:auto">
          <svg width="${svgW}" height="${svgH}" viewBox="0 0 ${svgW} ${svgH}" xmlns="http://www.w3.org/2000/svg" style="display:block;background:#111;border-radius:8px;min-width:${svgW}px">
            ${rowSvg}
          </svg>
        </div>
        <div class="panel-mockup-legend">
          ${Object.entries(colors).map(([t,c])=>`<span style="display:inline-flex;align-items:center;gap:4px;margin-right:12px;font-size:11px;color:var(--text-2)"><span style="width:10px;height:10px;border-radius:2px;background:${c};display:inline-block"></span>${t.charAt(0).toUpperCase()+t.slice(1)}</span>`).join("")}
        </div>
      </div>`;
  }).join("");

  return `
    <div class="panel-mockup-wrap">
      <div class="panel-mockup-header">
        <h3>${escHtml(proj.name)} — Switchboard Panel</h3>
        <button class="btn btn-ghost btn-sm" data-action="hide-panel-mockup">Close</button>
      </div>
      ${boardSections}
      <p style="font-size:11px;color:var(--text-3);margin-top:8px;padding:0 4px">Breaker widths are proportional to pole count. Slots assigned in circuit form.</p>
    </div>`;
}

/* ── Settings View ───────────────────────────────────────────────────────── */
function renderSettingsView() {
  const profile = state.googleAuth.profile;
  return `
    <div class="settings-view">
      <div class="panel-header"><h2>Settings</h2></div>
      <div class="settings-section">
        <div class="settings-row">
          <div class="settings-row-icon">${I.google}</div>
          <div class="settings-row-body">
            <strong>${escHtml(profile?.name||"Google Account")}</strong>
            <span>${escHtml(profile?.email||"")}</span>
          </div>
        </div>
        <div class="settings-row">
          <div class="settings-row-icon">${I.refresh}</div>
          <div class="settings-row-body"><strong>Reload from Drive</strong><span>Re-sync all projects from Google Drive</span></div>
          <button class="btn btn-ghost btn-sm settings-row-action" data-action="reload-drive">Reload</button>
        </div>
        <div class="settings-row">
          <div class="settings-row-icon">${I.signout}</div>
          <div class="settings-row-body"><strong>Sign out</strong><span>Clear session and sign out</span></div>
          <button class="btn btn-danger btn-sm settings-row-action" data-action="sign-out">Sign out</button>
        </div>
      </div>
      <div class="settings-section">
        <div class="settings-row">
          <div class="settings-row-icon">${I.zap}</div>
          <div class="settings-row-body">
            <strong>C9 Table source</strong>
            <span>${state.c9Source==="sheet"?"Loaded from ND_SWB_Reference Google Sheet":"Using built-in AS/NZS 3000:2018 data"}</span>
          </div>
        </div>
        <div class="settings-row">
          <div class="settings-row-icon">${I.board}</div>
          <div class="settings-row-body"><strong>Warning threshold</strong><span>Warn when within ${state.config.warning_threshold_percent||DEFAULT_WARNING_PCT}% of circuit limit</span></div>
        </div>
      </div>
      <div class="settings-section">
        <div class="settings-row">
          <div class="settings-row-icon">${I.planner}</div>
          <div class="settings-row-body"><strong>NeillPlanner</strong><span>neilldata.com/planner</span></div>
          <a href="${PLANNER_URL}" target="_blank" rel="noopener" class="btn btn-ghost btn-sm settings-row-action">${I.chevron}</a>
        </div>
      </div>
      <div class="settings-version">SWB v${SWB_VERSION} · Schema ${SWB_SCHEMA_VERSION} · AS/NZS 3000:2018 Amdt 1–3</div>
      <div class="settings-version" style="margin-top:4px">
        ⚠️ TODO: Confirm ND_SWB_Reference sheet ID in Google Drive<br>
        ⚠️ TODO: Add neilldata.com/swb to Google OAuth redirect URIs<br>
        ⚠️ TODO: Transcribe full C9 table from AS 3000 into ND_SWB_Reference sheet
      </div>
    </div>`;
}

/* ── Modals ──────────────────────────────────────────────────────────────── */
function renderModal() {
  const m = state.modal;
  if (!m) return "";
  let inner = "";
  if (m.mode==="new-project"||m.mode==="edit-project") inner=renderProjectModal(m);
  else if (m.mode==="new-board"||m.mode==="edit-board")  inner=renderBoardModal(m);
  else if (m.mode==="new-circuit"||m.mode==="edit-circuit") inner=renderCircuitModal(m);
  else if (m.mode==="edit-device") inner=renderDeviceEditModal(m);
  else if (m.mode==="new-device") inner=renderDeviceModal(m);
  else return "";
  return `<div class="modal-backdrop" data-action="close-modal"></div>${inner}`;
}

/* Project modal */
function renderProjectModal(m) {
  const isEdit = m.mode==="edit-project";
  const proj   = isEdit ? project(m.projectId) : null;
  return `
    <form class="modal" id="projectForm">
      <div class="modal-handle"></div>
      <div class="modal-header">
        <div class="modal-header-text"><h3>${isEdit?"Edit Project":"New Project"}</h3><p>Fill in the job details below.</p></div>
        <button type="button" class="btn-icon" data-action="close-modal">${I.close}</button>
      </div>
      <div class="modal-body">
        <div class="form-grid">
          <div class="field full"><label>Project name *</label><input name="name" required value="${escHtml(proj?.name||"")}" placeholder="e.g. Smith Residence" /></div>
          <div class="field full"><label>Site address</label><input name="address" value="${escHtml(proj?.address||"")}" placeholder="12 Example St, Suburb VIC" /></div>
          <div class="field"><label>Phase configuration</label>
            <select name="phase">
              <option value="single" ${(proj?.phase||"single")==="single"?"selected":""}>Single phase</option>
              <option value="3ph" ${proj?.phase==="3ph"?"selected":""}>Three phase</option>
            </select>
          </div>
          <div class="field"><label>Main breaker size (A)</label><input name="mainBreakerA" type="number" min="20" max="400" value="${proj?.boards?.[0]?.mainBreakerA||63}" /></div>
          <div class="field full"><label>Main board label</label><input name="mainBoardLabel" value="${escHtml(proj?.boards?.[0]?.label||"Main Switchboard")}" /></div>
          <div class="field full"><label>Main board location</label><input name="mainBoardLocation" value="${escHtml(proj?.boards?.[0]?.location||"")}" placeholder="e.g. Garage wall" /></div>
          <hr class="field-separator" />
          <div class="field full"><label>Linked Planner project ID <span style="color:var(--text-3)">(optional)</span></label>
            <input name="linkedPlannerProjectId" value="${escHtml(proj?.linkedPlannerProjectId||"")}" placeholder="From Planner URL or switchboard node" />
            <span class="form-note">Paste the Planner project ID to enable bidirectional links.</span>
          </div>
        </div>
      </div>
      <div class="modal-actions">
        ${isEdit?`<button type="button" class="btn btn-danger" data-action="delete-project" data-project-id="${m.projectId}">${I.trash}</button>`:""}
        <button type="button" class="btn btn-ghost" data-action="close-modal">Cancel</button>
        <button type="submit" class="btn btn-primary">${I.check} ${isEdit?"Save changes":"Create project"}</button>
      </div>
    </form>`;
}

/* Board modal */
function renderBoardModal(m) {
  const isEdit = m.mode==="edit-board";
  const proj   = project();
  const b      = isEdit ? (proj?.boards||[]).find(x=>x.id===m.boardId) : null;
  const mainBoards = (proj?.boards||[]).filter(x=>!x.parentBoardId);
  return `
    <form class="modal" id="boardForm">
      <div class="modal-handle"></div>
      <div class="modal-header">
        <div class="modal-header-text"><h3>${isEdit?"Edit Board":"Add Sub-board"}</h3></div>
        <button type="button" class="btn-icon" data-action="close-modal">${I.close}</button>
      </div>
      <div class="modal-body">
        <div class="form-grid">
          <div class="field full"><label>Board label *</label><input name="label" required value="${escHtml(b?.label||"Sub-board 1")}" /></div>
          <div class="field"><label>Phase</label>
            <select name="phase">
              <option value="single" ${(b?.phase||"single")==="single"?"selected":""}>Single phase</option>
              <option value="3ph" ${b?.phase==="3ph"?"selected":""}>Three phase</option>
            </select>
          </div>
          <div class="field"><label>Main breaker (A)</label><input name="mainBreakerA" type="number" min="6" max="400" value="${b?.mainBreakerA||32}" /></div>
          <div class="field full"><label>Location</label><input name="location" value="${escHtml(b?.location||"")}" placeholder="e.g. Level 2 comms room" /></div>
          <div class="field full"><label>Feed from (main board)</label>
            <select name="parentBoardId">
              ${mainBoards.map(mb=>`<option value="${mb.id}" ${b?.parentBoardId===mb.id||(!b&&mb===mainBoards[0])?"selected":""}>${escHtml(mb.label)}</option>`).join("")}
            </select>
            <span class="form-note">SWB will include this board's load in the main board total.</span>
          </div>
        </div>
      </div>
      <div class="modal-actions">
        ${isEdit?`<button type="button" class="btn btn-danger" data-action="delete-board" data-board-id="${m.boardId}">${I.trash}</button>`:""}
        <button type="button" class="btn btn-ghost" data-action="close-modal">Cancel</button>
        <button type="submit" class="btn btn-primary">${I.check} ${isEdit?"Save":"Add board"}</button>
      </div>
    </form>`;
}

/* Circuit modal */
function renderCircuitModal(m) {
  const isEdit = m.mode==="edit-circuit";
  const proj   = project();
  const c      = isEdit ? (proj?.circuits||[]).find(x=>x.id===m.circuitId) : null;
  const selDevices = c?.devices||m.devices||[];
  const devs   = projectDevices();
  const cats   = [...new Set(devs.map(d=>d.cat))];
  const devSearch = (state.deviceSearch||"").toLowerCase();
  const filtDevs  = devSearch ? devs.filter(d=>d.name.toLowerCase().includes(devSearch)||d.cat.toLowerCase().includes(devSearch)) : devs;

  // Build device rows grouped by category
  const groupedDevs = cats.map(cat=>({
    cat, devs: filtDevs.filter(d=>d.cat===cat)
  })).filter(g=>g.devs.length);

  const selectedRows = selDevices.map(sel=>{
    const dev=devs.find(d=>d.id===sel.id); if (!dev) return "";
    return `<span class="device-chip">
      <span class="qty">${sel.qty||1}×</span>${escHtml(dev.name)} (${dev.amp}A)
      <button type="button" data-remove-device="${sel.id}" style="margin-left:4px;opacity:0.6;font-size:12px">✕</button>
    </span>`;
  }).join("");

  return `
    <form class="modal" id="circuitForm" style="max-width:580px">
      <div class="modal-handle"></div>
      <div class="modal-header">
        <div class="modal-header-text">
          <h3>${isEdit?"Edit Circuit":"New Circuit"}</h3>
          <p>${escHtml(board()?.label||"")}</p>
        </div>
        <button type="button" class="btn-icon" data-action="close-modal">${I.close}</button>
      </div>
      <div class="modal-body">
        <div class="form-grid">
          <div class="form-section"><div class="form-section-title">Identity</div></div>
          <div class="field full"><label>Circuit name *</label><input name="name" required value="${escHtml(c?.name||"")}" placeholder="e.g. Living Room Power" /></div>
          <div class="field"><label>Phase</label>
            <select name="phase">
              ${(proj?.phase==="single" ? [["L1","L1"]] : [["L1","L1"],["L2","L2"],["L3","L3"],["3ph","3-phase"]]).map(([v,l])=>`<option value="${v}" ${(c?.phase||"L1")===v?"selected":""}>${l}</option>`).join("")}
            </select>
          </div>
          <div class="field"><label>Slot #</label><input name="slot" type="number" min="1" value="${c?.slot||((proj?.circuits?.length||0)+1)}" /></div>
          <div class="field"><label>Install status</label>
            <select name="installStatus">
              ${[["planned","Planned"],["roughed","Roughed-in"],["complete","Complete"]].map(([v,l])=>`<option value="${v}" ${(c?.installStatus||"planned")===v?"selected":""}>${l}</option>`).join("")}
            </select>
          </div>
          <hr class="field-separator" />
          <div class="form-section"><div class="form-section-title">Protection</div></div>
          <div class="field"><label>Breaker type</label>
            <select name="breakerType">
              ${[["MCB","MCB"],["RCBO","RCBO"],["RCD+MCB","RCD + MCB"]].map(([v,l])=>`<option value="${v}" ${(c?.breakerType||"MCB")===v?"selected":""}>${l}</option>`).join("")}
            </select>
          </div>
          <div class="field"><label>Breaker rating (A)</label>
            <select name="breakerRating">
              ${[6,10,13,16,20,25,32,40,50,63].map(v=>`<option value="${v}" ${(c?.breakerRating||20)===v?"selected":""}>${v}A</option>`).join("")}
            </select>
          </div>
          <div class="field rcd-field"><label>RCD protected</label>
            <select name="rcdProtected">
              <option value="false" ${!c?.rcdProtected?"selected":""}>No</option>
              <option value="true"  ${c?.rcdProtected?"selected":""}>Yes</option>
            </select>
          </div>
          <div class="field rcd-field"><label>RCD trip (mA)</label>
            <select name="rcdTripMa">
              ${[10,30].map(v=>`<option value="${v}" ${(c?.rcdTripMa||30)===v?"selected":""}>${v}mA</option>`).join("")}
            </select>
          </div>
          <div class="field full"><label>Breaker brand</label>
            <input name="breakerBrand" list="brandList" value="${escHtml(c?.breakerBrand||"")}" placeholder="e.g. Clipsal" autocomplete="off" />
            <datalist id="brandList">${(state.drive.breakerBrands||["Clipsal","Voltex"]).map(b=>`<option value="${escHtml(b)}"></option>`).join("")}</datalist>
          </div>
          <hr class="field-separator" />
          <div class="form-section"><div class="form-section-title">Cable</div></div>
          <div class="field"><label>Cable CSA (mm²)</label>
            <select name="cableCsa">
              ${[1,1.5,2.5,4,6,10,16,25].map(v=>`<option value="${v}" ${(c?.cableCsa||2.5)===v?"selected":""}>${v}mm²</option>`).join("")}
            </select>
          </div>
          <div class="field"><label>Cable type</label>
            <select name="cableType">
              ${[["TPS","TPS"],["singles","Singles"],["flex","Flex"],["other","Other"]].map(([v,l])=>`<option value="${v}" ${(c?.cableType||"TPS")===v?"selected":""}>${l}</option>`).join("")}
            </select>
          </div>
          <div class="field"><label>Est. run length (m)</label><input name="runLength" type="number" min="0" step="0.5" value="${c?.runLength||""}" placeholder="0" /></div>
          <div class="field"><label>In conduit</label>
            <select name="conduit">
              <option value="false" ${!c?.conduit?"selected":""}>No</option>
              <option value="true"  ${c?.conduit?"selected":""}>Yes</option>
            </select>
          </div>
          <hr class="field-separator" />
          <div class="form-section"><div class="form-section-title">Connected devices</div></div>
          ${(()=>{ const r=c?.breakerRating||20; const sug=(r<=10)?["Light Point","Exhaust Fan","Down Light"]:(r<=20)?["10A GPO","Double GPO"]:(r>=20)?["Oven","Cooktop","Air Con","Hot Water System"]:[];  const sugDevs=devs.filter(d=>sug.some(s=>d.name.toLowerCase().includes(s.toLowerCase()))); return sugDevs.length?`<div class="field full" style="margin-bottom:0"><div class="form-section-title" style="margin-bottom:6px">Suggested for ${r}A breaker</div><div style="display:flex;flex-wrap:wrap;gap:6px">${sugDevs.map(d=>`<button type="button" class="btn btn-ghost btn-sm" data-qty-inc="${d.id}" style="font-size:12px">${I.plus}${escHtml(d.name)}</button>`).join("")}</div></div>`:""})()}
          <div class="device-picker field full">
            <div class="device-search-wrap">${I.search}<input id="deviceSearch" placeholder="Search devices…" value="${escHtml(state.deviceSearch||"")}" /></div>
            <div class="device-picker-list">
              ${groupedDevs.map(g=>`
                <div class="device-group-title">${escHtml(g.cat)}</div>
                ${g.devs.map(d=>{
                  const sel=selDevices.find(s=>s.id===d.id); const qty=sel?.qty||0;
                  return `<div class="device-row">
                    <div class="device-row-name">${escHtml(d.name)}</div>
                    <div class="device-row-amp">${d.amp}A</div>
                    <div class="device-qty-ctrl">
                      <button type="button" data-qty-dec="${d.id}">−</button>
                      <span class="device-qty-val" id="qty_${d.id}">${qty}</span>
                      <button type="button" data-qty-inc="${d.id}">+</button>
                    </div>
                  </div>`;
                }).join("")}`).join("")}
            </div>
          </div>
          <div class="circuit-devices-selected field full" id="selectedDevices">${selectedRows||`<span style="color:var(--text-3);font-size:12px">No devices added yet</span>`}</div>
          <hr class="field-separator" />
          <div class="field full"><label>Notes</label><textarea name="notes">${escHtml(c?.notes||"")}</textarea></div>
        </div>
      </div>
      <div class="modal-actions">
        ${isEdit?`<button type="button" class="btn btn-danger" data-action="delete-circuit" data-circuit-id="${m.circuitId}">${I.trash}</button>`:""}
        <button type="button" class="btn btn-ghost" data-action="close-modal">Cancel</button>
        <button type="submit" class="btn btn-primary">${I.check} ${isEdit?"Save":"Add circuit"}</button>
      </div>
    </form>`;
}

/* Device modal */
function renderDeviceEditModal(m) {
  const proj = project();
  const dev = (proj?.devices||[]).find(d=>d.id===m.deviceId);
  if (!dev) return renderModal();
  return `
    <form class="modal" id="deviceEditForm">
      <div class="modal-handle"></div>
      <div class="modal-header">
        <div class="modal-header-text"><h3>Edit Device</h3></div>
        <button type="button" class="btn-icon" data-action="close-modal">${I.close}</button>
      </div>
      <div class="modal-body">
        <div class="form-grid">
          <input type="hidden" name="deviceId" value="${escHtml(dev.id)}" />
          <div class="field full"><label>Device name *</label><input name="name" required value="${escHtml(dev.name)}" /></div>
          <div class="field"><label>Category</label>
            <select name="cat">
              ${["Lighting","Power","Dedicated","Climate","EV/Solar","Data/Comms","Custom"].map(c=>`<option value="${c}" ${dev.cat===c?"selected":""}>${c}</option>`).join("")}
            </select>
          </div>
          <div class="field"><label>Load (A)</label><input name="amp" type="number" step="0.1" min="0" required value="${dev.amp}" /></div>
          <div class="field"><label>Dedicated circuit</label>
            <select name="ded">
              <option value="false" ${!dev.ded?"selected":""}>No</option>
              <option value="true"  ${dev.ded?"selected":""}>Yes</option>
            </select>
          </div>
          <div class="field"><label>Default breaker (A)</label><input name="defBreaker" type="number" step="1" min="0" value="${dev.defBreaker||""}" placeholder="optional" /></div>
          <div class="field"><label>Standard ref</label><input name="std" value="${escHtml(dev.std||"")}" placeholder="e.g. AS/NZS 3000:2018" /></div>
        </div>
      </div>
      <div class="modal-actions">
        <button type="button" class="btn btn-danger btn-sm" data-action="delete-device" data-device-id="${dev.id}">${I.trash}</button>
        <button type="button" class="btn btn-ghost" data-action="close-modal">Cancel</button>
        <button type="submit" class="btn btn-primary">${I.check} Save</button>
      </div>
    </form>`;
}

function renderDeviceModal(m) {
  return `
    <form class="modal" id="deviceForm">
      <div class="modal-handle"></div>
      <div class="modal-header">
        <div class="modal-header-text"><h3>Add Custom Device</h3></div>
        <button type="button" class="btn-icon" data-action="close-modal">${I.close}</button>
      </div>
      <div class="modal-body">
        <div class="form-grid">
          <div class="field full"><label>Device name *</label><input name="name" required placeholder="e.g. Wine fridge" /></div>
          <div class="field"><label>Category</label><input name="cat" placeholder="Custom" /></div>
          <div class="field"><label>Amp contribution (A) *</label><input name="amp" type="number" step="0.1" min="0" required placeholder="1.0" /></div>
          <div class="field"><label>Dedicated circuit?</label>
            <select name="ded"><option value="false">No</option><option value="true">Yes</option></select>
          </div>
          <div class="field"><label>Default breaker (A)</label><input name="defBreaker" type="number" placeholder="" /></div>
          <div class="field full"><label>Standard reference</label><input name="std" placeholder="AS/NZS 3000:2018" /></div>
        </div>
      </div>
      <div class="modal-actions">
        <button type="button" class="btn btn-ghost" data-action="close-modal">Cancel</button>
        <button type="submit" class="btn btn-primary">${I.check} Add device</button>
      </div>
    </form>`;
}

/* ── Event Handlers ──────────────────────────────────────────────────────── */

// Tracks circuit device selections during modal editing
let _modalDevices = [];

function bindEvents() {
  // Bottom nav
  document.querySelectorAll("[data-view]").forEach(b=>b.addEventListener("click",()=>{
    if (b.disabled) return;
    state.activeView=b.dataset.view; persist(); render();
  }));

  // Data actions
  document.querySelectorAll("[data-action]").forEach(el=>el.addEventListener("click", handleAction));

  // Open project card
  document.querySelectorAll("[data-open-project]").forEach(el=>el.addEventListener("click",()=>{
    const id=el.dataset.openProject;
    state.selectedProjectId=id;
    const p=project(id);
    state.selectedBoardId=p?.boards[0]?.id||null;
    state.activeView="board"; persist(); render();
  }));

  // Board tabs
  document.querySelectorAll("[data-board]").forEach(b=>b.addEventListener("click",()=>{
    state.selectedBoardId=b.dataset.board; persist(); render();
  }));

  // Filter pills
  document.querySelectorAll("[data-filter-type]").forEach(b=>b.addEventListener("click",()=>{ state.filters.type=b.dataset.filterType; render(); }));
  document.querySelectorAll("[data-filter-status]").forEach(b=>b.addEventListener("click",()=>{ state.filters.status=b.dataset.filterStatus; render(); }));
  document.querySelectorAll("[data-filter-phase]").forEach(b=>b.addEventListener("click",()=>{ state.filters.phase=b.dataset.filterPhase; render(); }));

  // Search filter — preserve focus/caret so typing doesn't shake the screen
  const qInput = document.querySelector("[data-filter='query']");
  if (qInput) qInput.addEventListener("input", () => {
    state.filters.query = qInput.value;
    const sel = [qInput.selectionStart, qInput.selectionEnd];
    render();
    const el = document.querySelector("[data-filter='query']");
    if (el) { el.focus(); try { el.setSelectionRange(sel[0], sel[1]); } catch(e){} }
  });

  // Device search — same focus-preserve trick
  const dSearch = document.getElementById("deviceSearch");
  if (dSearch) dSearch.addEventListener("input", () => {
    state.deviceSearch = dSearch.value;
    const sel = [dSearch.selectionStart, dSearch.selectionEnd];
    render();
    const el = document.getElementById("deviceSearch");
    if (el) { el.focus(); try { el.setSelectionRange(sel[0], sel[1]); } catch(e){} }
  });

  // Qty controls in circuit modal
  document.querySelectorAll("[data-qty-inc]").forEach(b=>b.addEventListener("click",()=>{
    const devId=b.dataset.qtyInc;
    const entry=_modalDevices.find(d=>d.id===devId);
    if (entry) entry.qty++; else _modalDevices.push({ id:devId, qty:1 });
    updateQtyDisplay();
  }));
  document.querySelectorAll("[data-qty-dec]").forEach(b=>b.addEventListener("click",()=>{
    const devId=b.dataset.qtyDec;
    const entry=_modalDevices.find(d=>d.id===devId);
    if (entry && entry.qty>0) entry.qty--;
    _modalDevices=_modalDevices.filter(d=>d.qty>0);
    updateQtyDisplay();
  }));

  // Remove device chip
  document.querySelectorAll("[data-remove-device]").forEach(b=>b.addEventListener("click",e=>{
    e.stopPropagation();
    const id=b.dataset.removeDevice;
    _modalDevices=_modalDevices.filter(d=>d.id!==id);
    updateQtyDisplay();
  }));

  // Forms
  // RCBO → hide RCD fields
  const brkTypeEl = document.querySelector('[name="breakerType"]');
  const rcdEls = document.querySelectorAll('.rcd-field');
  if (brkTypeEl && rcdEls.length) {
    const toggleRcd = () => { const rcbo = brkTypeEl.value==="RCBO"; rcdEls.forEach(el=>{ el.style.display=rcbo?"none":""; }); };
    brkTypeEl.addEventListener("change", toggleRcd); toggleRcd();
  }
  // Breaker rating → auto-fill cable CSA
  const brkRatingEl = document.querySelector('[name="breakerRating"]');
  const cableCsaEl  = document.querySelector('[name="cableCsa"]');
  if (brkRatingEl && cableCsaEl) {
    const autoCable = () => {
      const r=parseInt(brkRatingEl.value);
      const csa = r<=10?1.5: r<=20?2.5: r<=32?4: r<=40?6: 10;
      cableCsaEl.value = csa;
    };
    brkRatingEl.addEventListener("change", autoCable);
  }

  const projectForm = document.getElementById("projectForm");
  if (projectForm) projectForm.addEventListener("submit", handleProjectForm);
  const boardForm   = document.getElementById("boardForm");
  if (boardForm)   boardForm.addEventListener("submit", handleBoardForm);
  const circuitForm = document.getElementById("circuitForm");
  if (circuitForm) circuitForm.addEventListener("submit", handleCircuitForm);
  const deviceForm  = document.getElementById("deviceForm");
  if (deviceForm)  deviceForm.addEventListener("submit", handleDeviceForm);
  const deviceEditForm = document.getElementById("deviceEditForm");
  if (deviceEditForm) deviceEditForm.addEventListener("submit", handleDeviceEditForm);
}

function updateQtyDisplay() {
  // Update qty numbers without full re-render
  _modalDevices.forEach(d=>{
    const el=document.getElementById(`qty_${d.id}`);
    if (el) el.textContent=d.qty;
  });
  // Also update chip summary
  const wrap=document.getElementById("selectedDevices");
  if (!wrap) return;
  const devs=projectDevices();
  const chips=_modalDevices.filter(d=>d.qty>0).map(d=>{
    const dev=devs.find(x=>x.id===d.id); if (!dev) return "";
    return `<span class="device-chip"><span class="qty">${d.qty}×</span>${escHtml(dev.name)} (${dev.amp}A)<button type="button" data-remove-device="${d.id}" style="margin-left:4px;opacity:0.6;font-size:12px">✕</button></span>`;
  }).join("");
  wrap.innerHTML = chips||`<span style="color:var(--text-3);font-size:12px">No devices added yet</span>`;
  // Re-bind remove buttons
  wrap.querySelectorAll("[data-remove-device]").forEach(b=>b.addEventListener("click",e=>{
    e.stopPropagation();
    _modalDevices=_modalDevices.filter(d=>d.id!==b.dataset.removeDevice);
    updateQtyDisplay();
  }));
}

function handleAction(e) {
  const el=e.currentTarget;
  const action=el.dataset.action;
  e.stopPropagation();
  switch(action) {
    case "sign-in":   signIn(); break;
    case "sign-out":  signOut(); break;
    case "close-modal": state.modal=null; state.deviceSearch=""; _modalDevices=[]; render(); break;
    case "view-settings": state.activeView="settings"; render(); break;
    case "open-planner":  openInPlanner(); break;
    case "show-panel-mockup":
      state.showPanelMockup = true; render(); break;
    case "hide-panel-mockup":
      state.showPanelMockup = false; render(); break;
    case "copy-link":
      navigator.clipboard.writeText(buildSWBDeepLink()).then(()=>toast("Link copied!")).catch(()=>toast("Copy failed"));
      break;
    case "open-sheet": {
      const ssId=state.drive.projectFolderMap[state.selectedProjectId];
      if (ssId) window.open(`https://docs.google.com/spreadsheets/d/${ssId}`, "_blank","noopener");
      else toast("Sheet not found — save online first");
      break;
    }
    case "export-pdf": exportPDF(); break;
    case "reload-drive":
      state.loading=true; state.loadingMsg="Reloading from Drive…"; render();
      loadProjectsFromDrive().finally(()=>{ state.loading=false; persist(); render(); toast("Reloaded"); });
      break;
    case "new-project":
      state.modal={ mode:"new-project" }; render(); break;
    case "edit-project":
      state.modal={ mode:"edit-project", projectId:el.dataset.projectId||state.selectedProjectId }; render(); break;
    case "delete-project": {
      const pid=el.dataset.projectId;
      if (confirm(`Delete project "${project(pid)?.name||"this project"}"? This cannot be undone.`)) deleteProject(pid);
      break;
    }
    case "new-board":
      state.modal={ mode:"new-board" }; render(); break;
    case "edit-board":
      state.modal={ mode:"edit-board", boardId:el.dataset.boardId||state.selectedBoardId }; render(); break;
    case "delete-board": {
      const bid=el.dataset.boardId;
      if (confirm("Delete this sub-board and all its circuits?")) deleteBoard(bid);
      break;
    }
    case "new-circuit": {
      _modalDevices=[];
      state.modal={ mode:"new-circuit", devices:[] }; render(); break;
    }
    case "edit-circuit": {
      const cid=el.dataset.circuitId;
      const proj=project();
      const c=(proj?.circuits||[]).find(x=>x.id===cid);
      if (!c) return;
      _modalDevices=(c.devices||[]).map(d=>({...d}));
      state.modal={ mode:"edit-circuit", circuitId:cid }; render(); break;
    }
    case "delete-circuit": {
      const cid=el.dataset.circuitId;
      if (confirm("Delete this circuit?")) deleteCircuit(cid);
      break;
    }
    case "new-device":
      state.modal={ mode:"new-device" }; render(); break;
    case "edit-device": {
      const devId=el.dataset.deviceId;
      state.modal={ mode:"edit-device", deviceId:devId }; render(); break;
    }
    case "delete-device": {
      const devId=el.dataset.deviceId;
      const proj=project(); if (!proj) return;
      if (confirm("Remove this device from the library?")) {
        proj.devices=proj.devices.filter(d=>d.id!==devId);
        proj.circuits=proj.circuits.map(c=>({...c,...calcLoad(c,state.c9Map,proj.devices)}));
        proj.updatedAt=nowStamp();
        state.modal=null; persist(); scheduleSave(); render(); toast("Device removed");
      }
      break;
    }
  }
}

function handleProjectForm(e) {
  e.preventDefault();
  const fd=new FormData(e.currentTarget);
  const isEdit=state.modal?.mode==="edit-project";
  const data={
    name: fd.get("name"), address: fd.get("address"),
    phase: fd.get("phase"), mainBreakerA: fd.get("mainBreakerA"),
    mainBoardLabel: fd.get("mainBoardLabel"), mainBoardLocation: fd.get("mainBoardLocation"),
    linkedPlannerProjectId: fd.get("linkedPlannerProjectId")||"",
  };
  if (isEdit) {
    const proj=project(state.modal.projectId); if (!proj) return;
    proj.name=data.name; proj.address=data.address; proj.phase=data.phase;
    proj.linkedPlannerProjectId=data.linkedPlannerProjectId;
    if (proj.boards[0]) {
      proj.boards[0].label=data.mainBoardLabel||proj.boards[0].label;
      proj.boards[0].mainBreakerA=parseNum(data.mainBreakerA,proj.boards[0].mainBreakerA);
      proj.boards[0].location=data.mainBoardLocation||proj.boards[0].location;
      proj.boards[0].phase=data.phase;
    }
    proj.updatedAt=nowStamp();
    state.modal=null; persist(); scheduleSave(); render(); toast("Project updated");
  } else {
    state.modal=null; createProject(data);
  }
}

function handleBoardForm(e) {
  e.preventDefault();
  const fd = new FormData(e.currentTarget);
  const isEdit  = state.modal?.mode === "edit-board";
  const boardId = state.modal?.boardId || state.selectedBoardId; // capture BEFORE nulling
  const data = {
    label: fd.get("label"),
    phase: fd.get("phase"),
    mainBreakerA: parseNum(fd.get("mainBreakerA"), 63),
    location: fd.get("location"),
    parentBoardId: fd.get("parentBoardId"),
  };
  state.modal = null;
  if (isEdit) updateBoard(boardId, data);
  else addBoard(data);
  toast(isEdit ? "Board updated" : "Sub-board added");
}

function handleCircuitForm(e) {
  e.preventDefault();
  const fd=new FormData(e.currentTarget);
  const isEdit=state.modal?.mode==="edit-circuit";
  // Auto-determine type from breaker rating
  const br = parseNum(fd.get("breakerRating"),20);
  const autoType = br<=10?"lighting": br>=20&&_modalDevices.length===1&&_modalDevices[0]?.qty===1?"dedicated":"power";
  const data={
    name: fd.get("name"), type: autoType, phase: fd.get("phase"),
    slot: parseNum(fd.get("slot")),
    installStatus: fd.get("installStatus"),
    breakerType: fd.get("breakerType"), breakerRating: parseNum(fd.get("breakerRating"),20),
    rcdProtected: fd.get("rcdProtected")==="true", rcdTripMa: parseNum(fd.get("rcdTripMa"),30),
    breakerBrand: fd.get("breakerBrand"),
    cableCsa: parseNum(fd.get("cableCsa"),2.5), cableType: fd.get("cableType"),
    runLength: parseNum(fd.get("runLength")),
    conduit: fd.get("conduit")==="true",
    deratingApplied: false, deratingFactor: 1,
    devices: _modalDevices.filter(d=>d.qty>0),
    notes: fd.get("notes"),
  };
  const cid=state.modal?.circuitId;
  state.modal=null; state.deviceSearch=""; _modalDevices=[];
  if (isEdit) { updateCircuit(cid, data); toast("Circuit updated"); }
  else { addCircuit(data); toast("Circuit added"); }
}

function handleDeviceEditForm(e) {
  e.preventDefault();
  const fd = new FormData(e.currentTarget);
  const proj = project(); if (!proj) return;
  const devId = fd.get("deviceId");
  const idx = proj.devices.findIndex(d=>d.id===devId);
  if (idx < 0) return;
  proj.devices[idx] = { ...proj.devices[idx],
    name: fd.get("name"), cat: fd.get("cat"),
    amp: parseNum(fd.get("amp"),1), ded: fd.get("ded")==="true",
    defBreaker: fd.get("defBreaker")?parseNum(fd.get("defBreaker")):null,
    std: fd.get("std")||"AS/NZS 3000:2018",
  };
  // Recalculate all circuits using this device
  proj.circuits = proj.circuits.map(c=>({...c,...calcLoad(c,state.c9Map,proj.devices)}));
  proj.updatedAt = nowStamp();
  state.modal=null; persist(); scheduleSave(); render(); toast("Device updated");
}

function handleDeviceForm(e) {
  e.preventDefault();
  const fd=new FormData(e.currentTarget);
  const proj=project(); if (!proj) return;
  const dev={ id:uid("dev"), name:fd.get("name"), cat:fd.get("cat")||"Custom", amp:parseNum(fd.get("amp"),1), ded:fd.get("ded")==="true", defBreaker:fd.get("defBreaker")?parseNum(fd.get("defBreaker")):null, std:fd.get("std")||"AS/NZS 3000:2018", notes:"", fav:false };
  proj.devices.push(dev);
  proj.updatedAt=nowStamp();
  state.modal=null; persist(); scheduleSave(); render(); toast("Device added");
}

/* ── Export PDF ──────────────────────────────────────────────────────────── */
function exportPDF() {
  const proj=project(); if (!proj) return;
  const allBoards=proj.boards||[];
  const rows=allBoards.flatMap(b=>{
    const bCircuits=(proj.circuits||[]).filter(c=>c.boardId===b.id).sort((a,bx)=>((a.slot||999)-(bx.slot||999)));
    return [
      `<tr style="background:#1a1a1a"><td colspan="9" style="padding:10px 12px;font-weight:700;font-size:14px;color:#f5f5f5">${escHtml(b.label)} — ${b.phase==="3ph"?"3-phase":"Single phase"}${b.mainBreakerA?` · Main breaker: ${b.mainBreakerA}A`:""}</td></tr>`,
      ...bCircuits.map(c=>{
        const devChips=(c.devices||[]).map(d=>{ const dev=findDevice(d.id,proj.id); return dev?`${d.qty||1}×${dev.name}`:d.id; }).join(", ");
        const statusColor={ok:"#38a169",warning:"#38a169",overloaded:"#e53e3e",np:"#e53e3e"}[c.loadStatus]||"#888";
        return `<tr>
          <td style="color:${phaseColor(c.phase)}">${escHtml(c.phase||"L1")}</td>
          <td>${escHtml(c.slot||"")}</td>
          <td style="font-weight:600">${escHtml(c.name)}</td>
          <td>${escHtml(c.type||"")}</td>
          <td>${c.breakerRating}A ${escHtml(c.breakerType||"")}${c.rcdProtected?` RCD ${c.rcdTripMa}mA`:""}</td>
          <td>${c.cableCsa}mm² ${escHtml(c.cableType||"")}</td>
          <td>${c.runLength?c.runLength+"m":"—"}</td>
          <td style="font-family:monospace">${c.totalLoadA.toFixed(1)}A / ${c.maxPermittedA}A</td>
          <td style="color:${statusColor};font-weight:700">${{ok:"GOOD",warning:"100%",overloaded:"OVER",np:"N/P"}[c.loadStatus]||"GOOD"}</td>
        </tr>
        ${devChips?`<tr style="background:rgba(255,255,255,0.02)"><td colspan="9" style="padding:3px 12px 8px;font-size:12px;color:#888">${escHtml(devChips)}</td></tr>`:""}`;
      })
    ];
  }).join("");

  const html=`<!DOCTYPE html><html><head><meta charset="utf-8"><title>${escHtml(proj.name)} — Circuit Schedule</title>
  <style>*{box-sizing:border-box;margin:0;padding:0}body{background:#0a0a0a;color:#f5f5f5;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;padding:32px}h1{font-size:22px;font-weight:700;margin-bottom:4px}h2{font-size:14px;color:#888;font-weight:400;margin-bottom:24px}table{width:100%;border-collapse:collapse;font-size:13px}th{text-align:left;padding:8px 12px;background:#111;color:#888;font-size:11px;text-transform:uppercase;letter-spacing:.05em;border-bottom:1px solid rgba(255,255,255,0.1)}td{padding:8px 12px;border-bottom:1px solid rgba(255,255,255,0.06)}footer{margin-top:32px;font-size:11px;color:#444}</style>
  </head><body>
  <h1>${escHtml(proj.name)}</h1>
  <h2>${escHtml(proj.address||"")} &middot; Generated ${nowStamp()} &middot; SWB v${SWB_VERSION}</h2>
  <table><thead><tr><th>Phase</th><th>#</th><th>Circuit</th><th>Type</th><th>Breaker</th><th>Cable</th><th>Run</th><th>Load</th><th>Status</th></tr></thead><tbody>${rows}</tbody></table>
  <footer>AS/NZS 3000:2018 Amendments 1-3 &middot; Neill Data &amp; Security &middot; neilldata.com/swb</footer>
  </body></html>`;

  const win = window.open("", "_blank");
  if (win) { win.document.write(html); win.document.close(); setTimeout(() => win.print(), 400); }
  else toast("Pop-up blocked — allow pop-ups to export PDF");
}

function phaseColor(phase) {
  const m = { L1:"#f59e0b", L2:"#3b82f6", L3:"#8b5cf6", "3ph":"#10b981" };
  return m[phase] || "#888";
}

/* ── Boot ────────────────────────────────────────────────────────────────── */
document.addEventListener("DOMContentLoaded", () => {
  restore();
  readDeepLinkParams();
  state.c9Map = buildC9Map(C9_BUILTIN);
  render();
  bootGoogle();
});

document.addEventListener("keydown", e => {
  if (e.key === "Escape" && state.modal) { state.modal = null; state.deviceSearch = ""; _modalDevices = []; render(); }
});
