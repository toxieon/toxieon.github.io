/* Neill Data Backend — the ONE endpoint shared by Quote, Timesheet (Quote
 * bridge), Checklist login and Timesheet Live.
 *
 * endpoint: the /exec URL of the single "Neill Data Backend" Apps Script web
 * app (source + deploy steps: apps-script/neill-data-backend/README.md).
 *
 * Feature switch:
 *   ''  (empty)  → Quote / Timesheet / Checklist keep using the legacy Quote
 *                  backend exactly as before; Timesheet Live shows
 *                  "not connected yet".
 *   '<url>'      → everything uses the new backend: passcode checked
 *                  server-side, session tokens, prices from the public price sheet.
 */
window.ND_BACKEND = Object.freeze({
  endpoint: '',
  // Stable Google login (one sign-in, silent server-side refresh) for every app that
  // signs in with Google (shared/nd-auth.js). Turn on ONLY after the setup checklist in
  // apps-script/neill-data-backend/README.md ("Stable Google login") is done and
  // <endpoint>?action=planner_oauth_status shows "configured":true.
  plannerOAuth: false
});
