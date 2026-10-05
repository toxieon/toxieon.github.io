'use strict';
/* Stable login end to end: the real nd-auth.js facade talking to the real Apps Script
 * backend (Config/Auth/PlannerOAuth/Main .gs in a vm) through a mocked endpoint, with
 * Google's token/userinfo/revoke endpoints mocked. Plus the flag-off path. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const crypto = require('node:crypto');
const kit = require('./nd-auth.js');

const EXEC = 'https://script.google.com/macros/s/AKfyTEST123/exec';
const SCOPES = ['https://www.googleapis.com/auth/drive', 'https://www.googleapis.com/auth/spreadsheets', 'openid', 'email', 'profile'];
const tick = () => new Promise(r => setImmediate(r));

function backend({ configured = true } = {}) {
  const g = { now: 1e12, codes: 0, refreshes: 0, revoked: new Set(), revokeCalls: [], secretSeenBy: new Set(), userinfoSub: 'user-1' };
  const props = new Map();
  if (configured) {
    props.set('PLANNER_OAUTH_CLIENT_ID', 'cid.apps.googleusercontent.com');
    props.set('PLANNER_OAUTH_CLIENT_SECRET', 'TOP-SECRET');
    props.set('PLANNER_OAUTH_REDIRECT_URI', EXEC);
  }
  const P = { getProperty: k => props.has(k) ? props.get(k) : null, setProperty: (k, v) => props.set(k, String(v)), deleteProperty: k => props.delete(k), getProperties: () => Object.fromEntries(props) };
  const reply = (code, data) => ({ getResponseCode: () => code, getContentText: () => JSON.stringify(data) });
  const ctx = vm.createContext({
    console, JSON, Math, Object, String, Number, Array, Date: { now: () => g.now },
    PropertiesService: { getScriptProperties: () => P },
    LockService: { getScriptLock: () => ({ waitLock() {}, releaseLock() {} }) },
    CacheService: { getScriptCache: () => ({ get: () => null, put() {}, remove() {} }) },
    HtmlService: { createHtmlOutput: s => s },
    ContentService: { createTextOutput: s => ({ setMimeType: () => s }), MimeType: { JSON: 'json' } },
    Utilities: { DigestAlgorithm: { SHA_256: 'sha256' }, Charset: { UTF_8: 'utf8' }, getUuid: () => crypto.randomUUID(),
      computeDigest: (_, s) => Array.from(crypto.createHash('sha256').update(s).digest()),
      computeHmacSha256Signature: (s, k) => Array.from(crypto.createHmac('sha256', k).update(s).digest()) },
    UrlFetchApp: { fetch(url, opts = {}) {
      const p = opts.payload || {};
      if (p.client_secret) g.secretSeenBy.add(url);
      if (url === 'https://oauth2.googleapis.com/token') {
        if (p.grant_type === 'authorization_code') {
          g.codes++;
          return reply(200, { access_token: 'access-code-' + g.codes, expires_in: 3599, refresh_token: 'refresh-' + g.codes, scope: SCOPES.join(' '), token_type: 'Bearer' });
        }
        g.refreshes++;
        if (g.revoked.has(p.refresh_token)) return reply(400, { error: 'invalid_grant' });
        return reply(200, { access_token: 'access-refresh-' + g.refreshes, expires_in: 3599, scope: SCOPES.join(' ') });
      }
      if (url.startsWith('https://openidconnect.googleapis.com/v1/userinfo')) return reply(200, { sub: g.userinfoSub, email: 'brandon@example.com', email_verified: true, name: 'Brandon' });
      if (url === 'https://oauth2.googleapis.com/revoke') { g.revokeCalls.push(p.token); g.revoked.add(p.token); return reply(200, {}); }
      throw new Error('unexpected fetch ' + url);
    } }
  });
  const dir = path.join(__dirname, '../apps-script/neill-data-backend');
  for (const f of ['Config.gs', 'Auth.gs', 'PlannerOAuth.gs', 'Main.gs']) vm.runInContext(fs.readFileSync(path.join(dir, f), 'utf8'), ctx, { filename: f });
  g.ctx = ctx; g.props = props;
  return g;
}

/* Browser side: deps for nd-auth with storage, a fake popup, and Google's consent
 * screen simulated by calling the backend's doGet callback with a code. */
function device(g, opts = {}) {
  const store = opts.store || new Map();
  const log = { posts: [], opened: 0, navigated: [], tokenClientRequests: [], revokedAccess: [], order: [] };
  let consent = opts.consent || 'allow';
  const deps = {
    now: () => g.now,
    storage: { get: k => store.has(k) ? store.get(k) : null, set: (k, v) => { store.set(k, v); return true; }, remove: k => store.delete(k) },
    setTimer: (fn, ms) => { if (ms <= 2500) setImmediate(fn); return 1; }, clearTimer() {},
    isVisible: () => true,
    serverPost: async (endpoint, body) => {
      assert.equal(endpoint, EXEC);
      log.posts.push(body.action); log.order.push('post:' + body.action);
      await tick();
      if (opts.offline) throw new Error('Failed to fetch');
      // JSON round trip, like the real text/plain POST to /exec.
      return JSON.parse(JSON.stringify(g.ctx.route_(JSON.parse(JSON.stringify(body)))));
    },
    randomSecret: () => crypto.randomBytes(32).toString('hex'),
    digest: async v => crypto.createHash('sha256').update(v).digest('hex'),
    returnTo: () => 'https://www.neilldata.com/planner/',
    openAuth: () => { log.opened++; log.order.push('openAuth'); return { closed: false, close() { this.closed = true; } }; },
    navigateAuth: (popup, url) => {
      log.navigated.push(url);
      const q = new URL(url).searchParams;
      assert.equal(q.get('access_type'), 'offline');
      assert.equal(q.get('redirect_uri'), EXEC);
      setImmediate(() => {   // user finishes on Google; Google redirects to /exec?state&code
        log.callbackHtml = g.ctx.doGet({ parameter: consent === 'allow' ? { state: q.get('state'), code: 'code-xyz', scope: SCOPES.join(' ') } : { state: q.get('state'), error: 'access_denied' } });
      });
    },
    createTokenClient: o => ({ requestAccessToken: ({ prompt }) => { log.tokenClientRequests.push(prompt); setImmediate(() => o.callback({ access_token: 'gis-token-' + log.tokenClientRequests.length, expires_in: 3599, scope: o.scope })); } }),
    revoke: t => log.revokedAccess.push(t),
    fetchProfile: async () => ({ email: 'brandon@example.com' })
  };
  const backendCfg = opts.backend === undefined ? { endpoint: EXEC, plannerOAuth: true } : opts.backend;
  const auth = kit.createNDAuth(deps, () => backendCfg);
  const events = [];
  auth.onAuthChange(e => events.push(e.type + (e.code ? ':' + e.code : '')));
  auth.init({ clientId: 'cid.apps.googleusercontent.com', scopes: opts.scopes || SCOPES });
  return { auth, store, log, events, setConsent: c => { consent = c; } };
}
const allStorage = d => JSON.stringify([...d.store.entries()]);

test('endpoint selection: only plannerOAuth:true + a real /exec URL + covered scopes', () => {
  assert.equal(kit.serverEndpointFor({ endpoint: '', plannerOAuth: false }, SCOPES), '');
  assert.equal(kit.serverEndpointFor({ endpoint: EXEC, plannerOAuth: false }, SCOPES), '');
  assert.equal(kit.serverEndpointFor({ endpoint: '', plannerOAuth: true }, SCOPES), '');
  assert.equal(kit.serverEndpointFor({ endpoint: 'https://evil.example/exec', plannerOAuth: true }, SCOPES), '');
  assert.equal(kit.serverEndpointFor({ endpoint: EXEC, plannerOAuth: 'true' }, SCOPES), '');
  assert.equal(kit.serverEndpointFor(null, SCOPES), '');
  assert.equal(kit.serverEndpointFor({ endpoint: EXEC, plannerOAuth: true }, SCOPES), EXEC);
  assert.equal(kit.serverEndpointFor({ endpoint: EXEC, plannerOAuth: true }, ['https://www.googleapis.com/auth/drive.file', 'openid']), EXEC);
  assert.equal(kit.serverEndpointFor({ endpoint: EXEC, plannerOAuth: true }, ['https://www.googleapis.com/auth/calendar']), '');
  assert.equal(kit.serverEndpointFor({ endpoint: 'https://script.google.com/a/macros/neilldata.com/s/AKfy/exec', plannerOAuth: true }, SCOPES), 'https://script.google.com/a/macros/neilldata.com/s/AKfy/exec');
});

test('client and backend agree on the scope set (minimal: same as nd-config today)', () => {
  const gs = fs.readFileSync(path.join(__dirname, '../apps-script/neill-data-backend/PlannerOAuth.gs'), 'utf8');
  const backendScopes = /const PLANNER_SCOPES = '([^']+)'/.exec(gs)[1].split(' ').sort();
  assert.deepEqual(backendScopes, kit.SERVER_SCOPES.slice().sort());
  assert.deepEqual(require('./nd-config.js').forApp('planner').scopes.slice().sort(), backendScopes);
});

test('flag off: GIS token client exactly as before, zero backend calls', async () => {
  for (const backendCfg of [{ endpoint: '', plannerOAuth: false }, { endpoint: EXEC, plannerOAuth: false }, { endpoint: '', plannerOAuth: true }, null]) {
    const g = backend();
    const d = device(g, { backend: backendCfg });
    assert.equal(d.auth.mode(), 'gis');
    const tok = await d.auth.ensureToken({ interactive: true });
    assert.equal(tok, 'gis-token-1');
    assert.deepEqual(d.log.tokenClientRequests, ['']);
    assert.ok(d.store.get(kit.STORAGE_KEY).includes('gis-token-1'));
    d.auth.signOut();
    assert.deepEqual(d.log.revokedAccess, ['gis-token-1']);
    assert.deepEqual(d.log.posts, []);
    assert.equal(d.log.opened, 0);
    assert.deepEqual(d.events, ['signin', 'signout']);
  }
  // Same event sequence as the raw GIS engine used before the facade existed.
  const store = new Map(), log = [];
  const raw = kit.createAuth({ now: () => 1e12, storage: { get: k => store.get(k) || null, set: (k, v) => store.set(k, v), remove: k => store.delete(k) }, setTimer: () => 1, clearTimer() {},
    createTokenClient: o => ({ requestAccessToken: () => setImmediate(() => o.callback({ access_token: 'gis-token-1', expires_in: 3599 })) }), revoke() {}, fetchProfile: async () => ({ email: 'brandon@example.com' }) });
  raw.onAuthChange(e => log.push(e.type)); raw.init({ clientId: 'x', scopes: SCOPES });
  await raw.ensureToken({ interactive: true }); raw.signOut();
  assert.deepEqual(log, ['signin', 'signout']);
});

test('code exchange: one tap -> popup first, server exchange, session id only on the device', async () => {
  const g = backend();
  const d = device(g);
  assert.equal(d.auth.mode(), 'server');
  await d.auth.whenReady();
  assert.equal(d.auth.mode(), 'server');
  d.log.order.length = 0;
  const tok = await d.auth.ensureToken({ interactive: true });
  assert.equal(tok, 'access-code-1');
  assert.equal(d.log.order[0], 'openAuth', 'popup opens synchronously inside the tap, before any network call');
  assert.deepEqual(d.log.posts.filter(a => a !== 'planner_oauth_claim' && a !== 'planner_oauth_status'), ['planner_oauth_start', 'planner_oauth_token']);
  assert.equal(g.codes, 1);
  assert.match(d.store.get(kit.SESSION_KEY), /^[0-9a-f]{64}$/);
  assert.equal(d.store.has('nd.auth.planner.login.v1'), false);
  assert.doesNotMatch(allStorage(d), /refresh-1|TOP-SECRET/);
  assert.deepEqual([...g.secretSeenBy], ['https://oauth2.googleapis.com/token']);
  assert.match(d.log.callbackHtml, /href="https:\/\/www\.neilldata\.com\/planner\/"/);
  assert.equal(d.auth.isSignedIn(), true);
  assert.equal(d.auth.getEmail(), 'brandon@example.com');
  assert.deepEqual(d.events, ['signin']);
  assert.deepEqual(d.log.tokenClientRequests, []);
});

test('reopen days later: silent resume, refresh on expiry, no popup', async () => {
  const g = backend();
  const first = device(g);
  await first.auth.ensureToken({ interactive: true });
  g.now += 3 * 86400e3;   // app closed for 3 days
  const d = device(g, { store: first.store });
  assert.equal(d.auth.mode(), 'server');
  const tok = await d.auth.ensureToken();   // boot, non-interactive
  assert.equal(tok, 'access-refresh-1');
  assert.equal(g.refreshes, 1);
  assert.equal(d.log.opened, 0);
  assert.deepEqual(d.events, ['signin']);
  // within the hour: served from memory, no backend call
  const posts = d.log.posts.length;
  assert.equal(await d.auth.ensureToken(), tok);
  assert.equal(d.log.posts.length, posts);
  // past expiry: refreshed server-side
  g.now += 3600e3;
  assert.equal(await d.auth.ensureToken(), 'access-refresh-2');
  assert.deepEqual(d.events, ['signin', 'refresh']);
});

test('401 from Google mid-session: force renew once and retry the call', async () => {
  const g = backend();
  const d = device(g);
  await d.auth.ensureToken({ interactive: true });
  let calls = 0;
  const googleApi = async token => { calls++; if (token === 'access-code-1') { const e = new Error('Invalid Credentials'); e.status = 401; throw e; } return 'ok:' + token; };
  async function googleCall() {   // the pattern Planner's googleCall() uses
    try { return await googleApi(await d.auth.ensureToken()); }
    catch (e) { if (e.status !== 401) throw e; return googleApi(await d.auth.ensureToken({ force: true })); }
  }
  assert.equal(await googleCall(), 'ok:access-refresh-1');
  assert.equal(calls, 2);
  assert.equal(g.refreshes, 1);
});

test('sign-out: this device only by default; everywhere revokes the Google grant', async () => {
  const g = backend();
  const phone = device(g), laptop = device(g);
  await phone.auth.ensureToken({ interactive: true });
  await laptop.auth.ensureToken({ interactive: true });
  const phoneSession = phone.store.get(kit.SESSION_KEY);
  assert.deepEqual(await phone.auth.signOut(), { serverDone: true });
  assert.equal(phone.store.size, 0);
  assert.equal(g.ctx.plannerOAuthToken_({ session: phoneSession }).error, 'session_expired');
  assert.deepEqual(g.revokeCalls, []);
  assert.equal(await laptop.auth.ensureToken({ force: true }), 'access-refresh-1');   // other device unaffected
  // everywhere
  const phone2 = device(g);
  await phone2.auth.ensureToken({ interactive: true });
  const laptopSession = laptop.store.get(kit.SESSION_KEY);
  assert.equal((await phone2.auth.signOut({ everywhere: true })).serverDone, true);
  assert.equal(g.revokeCalls.length, 1);
  assert.match(g.revokeCalls[0], /^refresh-\d$/);
  assert.equal(g.ctx.plannerOAuthToken_({ session: laptopSession }).error, 'session_expired');
  assert.deepEqual(phone2.events.slice(-1), ['signout']);
});

test('offline sign-out: signed out on the device at once, server delete retried on next start', async () => {
  const g = backend();
  const d = device(g);
  await d.auth.ensureToken({ interactive: true });
  const session = d.store.get(kit.SESSION_KEY);
  const off = device(g, { store: d.store, offline: true });
  await tick();
  const r = await off.auth.signOut();
  assert.equal(r.serverDone, false);
  assert.equal(off.store.has(kit.SESSION_KEY), false);
  assert.equal(off.store.has(kit.STORAGE_KEY), false);
  assert.ok(g.ctx.getSession_('planner', session), 'still on the server while offline');
  device(g, { store: d.store });   // next start, online
  for (let i = 0; i < 5; i++) await tick();
  assert.equal(g.ctx.getSession_('planner', session), null);
  assert.equal(d.store.has('nd.auth.planner.logout.v1'), false);
});

test('refresh fails for good (grant revoked): silent check errors, a tap signs in again', async () => {
  const g = backend();
  const d = device(g);
  await d.auth.ensureToken({ interactive: true });
  for (const v of g.props.values()) if (/"refresh":"(refresh-\d)"/.test(v)) g.revoked.add(/"refresh":"(refresh-\d)"/.exec(v)[1]);
  g.now += 3600e3;
  await assert.rejects(d.auth.ensureToken(), e => e.code === 'session_expired');
  assert.equal(d.store.has(kit.SESSION_KEY), false);
  assert.ok(d.events.includes('error:session_expired'));
  const opened = d.log.opened;
  assert.equal(await d.auth.ensureToken({ interactive: true }), 'access-code-2');
  assert.equal(d.log.opened, opened + 1);
  // and if the session dies while the user taps (session still stored), the same tap falls through to sign-in
  for (const v of g.props.values()) if (/"refresh":"(refresh-\d)"/.test(v)) g.revoked.add(/"refresh":"(refresh-\d)"/.exec(v)[1]);
  assert.equal(await d.auth.ensureToken({ interactive: true, force: true }), 'access-code-3');
});

test('declined consent: clear error, nothing stored, next tap works', async () => {
  const g = backend();
  const d = device(g, { consent: 'deny' });
  await assert.rejects(d.auth.ensureToken({ interactive: true }), e => e.code === 'sign_in_failed');
  assert.equal(d.store.has(kit.SESSION_KEY), false);
  assert.equal(d.store.has('nd.auth.planner.login.v1'), false);
  d.setConsent('allow');
  assert.equal(await d.auth.ensureToken({ interactive: true }), 'access-code-1');
});

test('flag on but backend not configured (or unreachable): falls back to GIS', async () => {
  for (const opts of [{}, { offline: true }]) {
    const g = backend({ configured: false });
    const d = device(g, opts);
    assert.equal(d.auth.mode(), 'server');
    await d.auth.whenReady();
    assert.equal(d.auth.mode(), 'gis-fallback');
    assert.equal(await d.auth.ensureToken({ interactive: true }), 'gis-token-1');
    assert.deepEqual(d.log.posts, ['planner_oauth_status']);
    assert.deepEqual(d.events, ['signin']);
  }
  assert.equal(backend({ configured: false }).ctx.plannerOAuthStart_({ challenge: 'a'.repeat(64) }).error, 'not_configured');
});

test('backend probe and return link never leak secrets or allow other origins', () => {
  const g = backend();
  const status = g.ctx.route_({ action: 'planner_oauth_status' });
  assert.equal(status.configured, true);
  assert.doesNotMatch(JSON.stringify(status), /TOP-SECRET|cid\.apps/);
  assert.equal(JSON.parse(g.ctx.doGet({ parameter: { action: 'planner_oauth_status' } })).configured, true);   // browser setup check
  assert.equal(JSON.parse(backend({ configured: false }).ctx.doGet({ parameter: { action: 'planner_oauth_status' } })).configured, false);
  assert.equal(g.ctx.plannerReturnTo_('https://evil.example/'), 'https://www.neilldata.com/hub/');
  assert.equal(g.ctx.plannerReturnTo_('https://www.neilldata.com.evil.example/'), 'https://www.neilldata.com/hub/');
  assert.equal(g.ctx.plannerReturnTo_('https://www.neilldata.com/quote/"><script>'), 'https://www.neilldata.com/hub/');
  assert.equal(g.ctx.plannerReturnTo_('https://www.neilldata.com/timesheet/'), 'https://www.neilldata.com/timesheet/');
});
