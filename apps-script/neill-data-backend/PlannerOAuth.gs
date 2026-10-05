/* Suite "stable login" (Planner first; any app whose scopes fit PLANNER_SCOPES).
 * Refresh tokens never leave Script Properties; the browser only holds an opaque
 * session id (localStorage) and short-lived access tokens fetched from here.
 * A browser-generated claim secret binds the initiating device to the callback.
 * Google state is separate; knowing the callback URL cannot claim a session.
 * Flow: planner_oauth_start -> Google consent (redirect_uri = this /exec URL)
 *   -> doGet callback exchanges the code (client secret from Script Properties)
 *   -> planner_oauth_claim (device polls with its verifier) -> session id
 *   -> planner_oauth_token (access token; refreshed server-side when near expiry or force)
 *   -> planner_oauth_logout (this device; everywhere=true also revokes the Google grant)
 * Script Properties: PLANNER_OAUTH_CLIENT_ID, PLANNER_OAUTH_CLIENT_SECRET,
 * PLANNER_OAUTH_REDIRECT_URI (= the /exec URL). Setup: README.md.
 */
const PLANNER_SCOPES = 'openid email profile https://www.googleapis.com/auth/drive https://www.googleapis.com/auth/spreadsheets';
const PLANNER_TTL = 28 * 24 * 3600 * 1000;
// Where the "Return to the app" link on the callback page may point.
const PLANNER_RETURN_ORIGIN = 'https://www.neilldata.com';
const PLANNER_EXEC_RE = /^https:\/\/script\.google\.com\/(a\/macros\/[^/]+|macros)\/s\/[^/]+\/exec$/;
function plannerOAuthConfig_() {
  const p = PropertiesService.getScriptProperties();
  const c = { client_id: p.getProperty('PLANNER_OAUTH_CLIENT_ID'), client_secret: p.getProperty('PLANNER_OAUTH_CLIENT_SECRET'), redirect_uri: p.getProperty('PLANNER_OAUTH_REDIRECT_URI') };
  if (!c.client_id || !c.client_secret || !PLANNER_EXEC_RE.test(c.redirect_uri || '')) throw new Error('Planner OAuth is not configured');
  return c;
}
function plannerOAuthConfigured_() { try { plannerOAuthConfig_(); return true; } catch (e) { return false; } }
/** Public probe: lets the pages fall back to the plain Google sign-in while this isn't set up. No secrets. */
function plannerOAuthStatus_() { return { ok: true, configured: plannerOAuthConfigured_(), scopes: PLANNER_SCOPES.split(' ') }; }
function plannerReturnTo_(value) {
  value = String(value || '');
  return value.indexOf(PLANNER_RETURN_ORIGIN + '/') === 0 && value.length < 300 && !/[\s"'<>]/.test(value) ? value : PLANNER_RETURN_ORIGIN + '/hub/';
}
function plannerHtmlEscape_(s) { return String(s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
function plannerGoogleToken_(fields) {
  const response = UrlFetchApp.fetch('https://oauth2.googleapis.com/token', { method: 'post', payload: Object.assign(plannerOAuthConfig_(), fields), muteHttpExceptions: true });
  const data = JSON.parse(response.getContentText());
  // Never include provider responses (which may contain credentials) in logs/errors.
  if (response.getResponseCode() !== 200 || !data.access_token) return { error: data.error === 'invalid_grant' ? 'session_expired' : 'provider_unavailable' };
  return data;
}
function plannerOAuthStart_(body) {
  if (!/^[0-9a-f]{64}$/.test(String(body.challenge || ''))) return { error: 'bad_challenge' };
  if (!plannerOAuthConfigured_()) return { error: 'not_configured' };
  const config = plannerOAuthConfig_();
  const lock = LockService.getScriptLock(); lock.waitLock(10000);
  try {
    const props = PropertiesService.getScriptProperties();
    let active = 0;
    Object.keys(props.getProperties()).filter(k => k.indexOf('po_') === 0).forEach(k => {
      let value; try { value = JSON.parse(props.getProperty(k)); } catch (e) {}
      if (!value || value.exp < Date.now()) props.deleteProperty(k); else active++;
    });
    if (active >= 100) return { error: 'login_busy' };
    const state = randomHex_(64);
    props.setProperty('po_' + state, JSON.stringify({ challenge: body.challenge, exp: Date.now() + 10 * 60 * 1000, ret: plannerReturnTo_(body.return_to) }));
    const query = { client_id: config.client_id, redirect_uri: config.redirect_uri, response_type: 'code', scope: PLANNER_SCOPES, access_type: 'offline', prompt: 'consent', state: state };
    return { ok: true, state: state, url: 'https://accounts.google.com/o/oauth2/v2/auth?' + Object.keys(query).map(k => encodeURIComponent(k) + '=' + encodeURIComponent(query[k])).join('&') };
  } finally { lock.releaseLock(); }
}
function plannerOAuthCallback_(params) {
  const message = 'Sign-in finished. You can close this page and return to the app. If you declined access, sign in again from the app.';
  const lock = LockService.getScriptLock(); lock.waitLock(10000);
  try {
    const state = String(params.state || '');
    if (!/^[0-9a-f]{64}$/.test(state)) return HtmlService.createHtmlOutput('Invalid sign-in request.');
    const props = PropertiesService.getScriptProperties(), key = 'po_' + state;
    const pending = JSON.parse(props.getProperty(key) || 'null');
    if (!pending || pending.exp < Date.now() || pending.finished) return HtmlService.createHtmlOutput('Sign-in request expired. Return to Planner and try again.');
    pending.finished = true;
    pending.error = 'sign_in_failed';
    if (params.code && !params.error) {
      const tokens = plannerGoogleToken_({ grant_type: 'authorization_code', code: String(params.code) });
      const scopes = String(tokens.scope || '').split(' ');
      if (!tokens.error && tokens.refresh_token && PLANNER_SCOPES.split(' ').filter(s => s.indexOf('https:') === 0).every(s => scopes.indexOf(s) >= 0)) {
        const response = UrlFetchApp.fetch('https://openidconnect.googleapis.com/v1/userinfo', { headers: { Authorization: 'Bearer ' + tokens.access_token }, muteHttpExceptions: true });
        if (response.getResponseCode() === 200) {
          const profile = JSON.parse(response.getContentText());
          if (profile.sub && profile.email_verified) {
            pending.credentials = { refresh: tokens.refresh_token, access: tokens.access_token, expiry: Date.now() + Number(tokens.expires_in || 3600) * 1000, scopes: scopes, profile: { sub: profile.sub, email: profile.email, name: profile.name, picture: profile.picture } };
            delete pending.error;
          }
        }
      }
    }
    props.setProperty(key, JSON.stringify(pending));
    // target=_top: HtmlService output sits in an iframe. Used when iOS opened the
    // sign-in in the app window itself (no popup); the app then claims the session on load.
    const back = plannerReturnTo_(pending.ret);
    return HtmlService.createHtmlOutput('<meta name="viewport" content="width=device-width"><p style="font:16px system-ui">' + message +
      '</p><p><a style="font:600 16px system-ui" target="_top" href="' + plannerHtmlEscape_(back) + '">Return to the app</a></p>');
  } finally { lock.releaseLock(); }
}
function plannerOAuthClaim_(body) {
  if (!/^[0-9a-f]{64}$/.test(String(body.state || '')) || !/^[0-9a-f]{64}$/.test(String(body.verifier || ''))) return { error: 'bad_request' };
  const lock = LockService.getScriptLock(); lock.waitLock(10000);
  try {
    const props = PropertiesService.getScriptProperties(), key = 'po_' + body.state;
    const p = JSON.parse(props.getProperty(key) || 'null');
    if (!p || p.exp < Date.now() || !safeEq_(p.challenge, sha256Hex_(body.verifier))) return { error: 'login_expired' };
    if (!p.finished) return { ok: true, pending: true };
    if (p.error) { props.deleteProperty(key); return { error: p.error }; }
    // Deterministic session lets the device retry a lost claim response safely.
    const session = hmacHex_('planner:' + body.state + ':' + body.verifier, ensurePepper_());
    const skey = sessKey_(session);
    if (!p.claimed) {
      purgeExpiredSessions_();
      props.setProperty(skey, JSON.stringify(Object.assign({ k: 'planner', u: p.credentials.profile.sub, exp: Date.now() + PLANNER_TTL }, p.credentials)));
      delete p.credentials; p.claimed = true; props.setProperty(key, JSON.stringify(p));
    }
    return { ok: true, session: session };
  } finally { lock.releaseLock(); }
}
function plannerOAuthToken_(body) {
  const lock = LockService.getScriptLock(); lock.waitLock(10000);
  try {
    const s = getSession_('planner', body.session);
    if (!s) return { error: 'session_expired' };
    if (body.force || s.expiry < Date.now() + 5 * 60 * 1000) {
      const tokens = plannerGoogleToken_({ grant_type: 'refresh_token', refresh_token: s.refresh });
      if (tokens.error) {
        if (tokens.error === 'session_expired') dropSession_(body.session);
        return { error: tokens.error };
      }
      s.access = tokens.access_token; s.expiry = Date.now() + Number(tokens.expires_in || 3600) * 1000;
      if (tokens.refresh_token) s.refresh = tokens.refresh_token;
    }
    s.exp = Date.now() + PLANNER_TTL;
    const key = s.key; delete s.key;
    PropertiesService.getScriptProperties().setProperty(key, JSON.stringify(s));
    return { ok: true, access_token: s.access, expiry: s.expiry, scopes: s.scopes, profile: s.profile, email: s.profile.email };
  } finally { lock.releaseLock(); }
}
/* Sign-out. Default: this device only (its stored refresh token is deleted here, so
 * the session id is useless). everywhere=true also revokes the Google grant (which
 * ends every device's refresh token for this user) and drops all their sessions. */
function plannerOAuthLogout_(body) {
  const lock = LockService.getScriptLock(); lock.waitLock(10000);
  try {
    const s = getSession_('planner', body.session);
    if (!s) return { ok: true };
    let revoked = false;
    if (body.everywhere) {
      const r = UrlFetchApp.fetch('https://oauth2.googleapis.com/revoke', { method: 'post', payload: { token: s.refresh }, muteHttpExceptions: true });
      revoked = r.getResponseCode() === 200;
      dropSessionsFor_('planner', s.u, null);
    }
    dropSession_(body.session);
    return { ok: true, revoked: revoked };
  } finally { lock.releaseLock(); }
}
