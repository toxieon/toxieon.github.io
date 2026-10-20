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
    // Stable login (server-side refresh) is picked by nd-auth from shared/nd-backend.js (plannerOAuth + endpoint); else the GIS token client as before.
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
    if (ev.type !== "signin") { render(); if (state.drive.masterSheetId && _syncStatus !== "synced") scheduleMasterSync(); return; }   // silent renewals never re-bootstrap; 0.19.1: but they do push pending edits
    bootstrapDrive();
  } else if (ev.type === "signout") {
    if (_downloadPdf) { URL.revokeObjectURL(_downloadPdf.url); _downloadPdf = null; }
    if (window.gapi?.client) gapi.client.setToken(null);
    if (window.NDDriveImage) NDDriveImage.clearCache();   // don't leak one account's photos to the next
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
async function signOut() {
  try {
    const r = await NDAuth.signOut();
    if (r && r.serverDone === false) toast("Signed out on this device. The sign-in server will be told when you are back online.");
  } catch (e) { toast("Sign-out failed: " + describeError(e)); }
}
function isTokenValid() { return state.googleAuth.signedIn && state.googleAuth.accessToken && state.googleAuth.expiresAt && Date.now() < state.googleAuth.expiresAt - 30000; }
function requireAuth(label) { if (isTokenValid()) return true; toast(`Sign in to Google first (${label})`); return false; }
