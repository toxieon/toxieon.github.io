/* Node test harness for nd-auth.js (zero deps, fake GIS/clock/storage).
 * Run:  node shared/nd-auth.test.js
 */
const A = require("./nd-auth.js");

let pass = 0, fail = 0;
function ok(cond, name) {
  if (cond) { pass++; console.log("  PASS  " + name); }
  else      { fail++; console.log("  FAIL  " + name); }
}

/* ---------- fake environment ---------------------------------------- */
function makeEnv(opts) {
  opts = opts || {};
  let nowMs = opts.now || 1000000000;
  const store = {};
  if (opts.storedToken) store[A.STORAGE_KEY] = JSON.stringify(opts.storedToken);
  const timers = [];
  const requests = [];   // prompts passed to requestAccessToken
  let tcCallback = null, tcError = null;
  let visible = true;
  let visibilityCb = null, storageCb = null;
  const env = {
    deps: {
      now: () => nowMs,
      storage: {
        get: k => (k in store ? store[k] : null),
        set: (k, v) => { store[k] = v; },
        remove: k => { delete store[k]; }
      },
      setTimer: (fn, ms) => { const id = timers.length; timers.push({ fn, at: nowMs + ms, fired: false }); return id; },
      clearTimer: id => { if (timers[id]) timers[id].fired = true; },
      createTokenClient: o => {
        tcCallback = o.callback; tcError = o.error_callback;
        return { requestAccessToken: r => requests.push(r.prompt) };
      },
      revoke: () => { env.revoked = true; },
      fetchProfile: () => Promise.resolve(opts.profile === undefined ? { email: "b@x.com", name: "B" } : opts.profile),
      isVisible: () => visible,
      onVisibility: cb => { visibilityCb = cb; },
      onStorage: cb => { storageCb = cb; }
    },
    store, requests, revoked: false,
    advance: ms => {
      nowMs += ms;
      timers.forEach(t => { if (!t.fired && t.at <= nowMs) { t.fired = true; t.fn(); } });
    },
    respond: resp => tcCallback(resp),
    gisError: err => tcError(err),
    setVisible: v => { visible = v; if (v && visibilityCb) visibilityCb(); },
    externalWrite: tok => { store[A.STORAGE_KEY] = JSON.stringify(tok); if (storageCb) storageCb(store[A.STORAGE_KEY]); },
    now: () => nowMs
  };
  return env;
}
const CFG = { clientId: "id.apps.googleusercontent.com", scopes: ["a", "b"] };
const tick = () => new Promise(r => setImmediate(r));

/* ---------- pure helpers --------------------------------------------- */
console.log("pure helpers");
const t0 = 1000000000;
const tok = (exp) => ({ access_token: "T", expiry: exp, scopes: ["a"] });
ok(A.isValid(tok(t0 + 60000), t0), "valid token");
ok(!A.isValid(tok(t0 + 10000), t0), "token inside 30s skew = invalid");
ok(!A.isValid(null, t0), "null token invalid");
ok(A.needsProactiveRefresh(tok(t0 + 4 * 60000), t0), "refresh due <5min before expiry");
ok(!A.needsProactiveRefresh(tok(t0 + 10 * 60000), t0), "no refresh >5min out");
ok(A.scopesCover(["a", "b", "c"], ["a", "b"]), "scopesCover true");
ok(!A.scopesCover(["a"], ["a", "b"]), "scopesCover false");
ok(A.parseStored('{"access_token":"T","expiry":123}') !== null, "parseStored ok");
ok(A.parseStored("garbage") === null, "parseStored rejects garbage");

/* ---------- async test chain ------------------------------------------ */
(async function () {

  console.log("stored-token resume");
  {
    const env = makeEnv({ storedToken: { access_token: "S", expiry: 1000000000 + 3600000, scopes: ["a"], email: "b@x.com" } });
    const auth = A.createAuth(env.deps);
    const events = [];
    auth.onAuthChange(e => events.push(e.type));
    auth.init(CFG);
    ok(events.join(",") === "signin", "init with valid stored token emits signin");
    ok(auth.isSignedIn(), "signed in from storage");
    const t = await auth.ensureToken();
    ok(t === "S", "ensureToken resolves stored token with zero requests");
    ok(env.requests.length === 0, "no token request made");
  }

  console.log("silent renewal on expired stored token");
  {
    const env = makeEnv({ storedToken: { access_token: "OLD", expiry: 1000000000 - 1000, scopes: ["a"] } });
    const auth = A.createAuth(env.deps);
    const events = [];
    auth.onAuthChange(e => events.push(e.type));
    auth.init(CFG);
    ok(events.length === 0, "no signin for expired stored token");
    const p = auth.ensureToken();               // non-interactive
    ok(env.requests.join(",") === "", "silent renewal uses prompt:''");
    env.respond({ access_token: "NEW", expires_in: 3600 });
    await tick(); await tick();
    ok((await p) === "NEW", "ensureToken resolves renewed token");
    ok(events.indexOf("signin") !== -1, "first token of session emits signin");
    ok(JSON.parse(env.store[A.STORAGE_KEY]).access_token === "NEW", "renewed token persisted");
  }

  console.log("silent fails -> consent only when interactive");
  {
    const env = makeEnv({});
    const auth = A.createAuth(env.deps).init(CFG);
    const p = auth.ensureToken({ interactive: true });
    ok(env.requests[0] === "", "tries silent first even when interactive");
    env.respond({ error: "interaction_required" });
    await tick();
    ok(env.requests[1] === "consent", "falls back to consent popup");
    env.respond({ access_token: "C", expires_in: 3600 });
    await tick(); await tick();
    ok((await p) === "C", "consent flow resolves");
  }
  {
    const env = makeEnv({});
    const auth = A.createAuth(env.deps).init(CFG);
    const p = auth.ensureToken();               // NOT interactive
    env.respond({ error: "interaction_required" });
    let rejected = false;
    await p.catch(() => { rejected = true; });
    ok(rejected, "non-interactive silent failure rejects (no popup)");
    ok(env.requests.length === 1, "no consent attempt without user gesture");
  }

  console.log("proactive refresh timer");
  {
    const env = makeEnv({ storedToken: { access_token: "S", expiry: 1000000000 + 3600000, scopes: ["a"] } });
    const auth = A.createAuth(env.deps).init(CFG);
    const events = [];
    auth.onAuthChange(e => events.push(e.type));
    env.advance(3600000 - A.REFRESH_LEAD_MS + 1000);   // cross the refresh threshold
    ok(env.requests.join(",") === "", "timer fires a silent renewal");
    env.respond({ access_token: "S2", expires_in: 3600 });
    await tick(); await tick();
    ok(events.indexOf("refresh") !== -1, "renewal emits refresh (not signin)");
    ok(auth.getToken() === "S2", "token rotated");
  }

  console.log("visibilitychange renewal (backgrounded PWA)");
  {
    const env = makeEnv({ storedToken: { access_token: "S", expiry: 1000000000 + 3600000, scopes: ["a"] } });
    const auth = A.createAuth(env.deps).init(CFG);
    env.setVisible(false);
    env.advance(4 * 3600000);                  // token long dead while hidden
    const before = env.requests.length;
    env.setVisible(true);                      // return to app
    ok(env.requests.length === before + 1 && env.requests[env.requests.length - 1] === "", "silent renewal on becoming visible");
    env.respond({ access_token: "V", expires_in: 3600 });
    await tick(); await tick();
    ok(auth.getToken() === "V", "renewed after visibility return");
  }

  console.log("cross-tab token adoption");
  {
    const env = makeEnv({});
    const auth = A.createAuth(env.deps).init(CFG);
    const events = [];
    auth.onAuthChange(e => events.push(e.type));
    env.externalWrite({ access_token: "X", expiry: env.now() + 3600000, scopes: ["a"], email: "b@x.com" });
    ok(events.join(",") === "signin", "token from another tab signs this tab in");
    ok(auth.getToken() === "X", "adopted external token");
  }

  console.log("signOut");
  {
    const env = makeEnv({ storedToken: { access_token: "S", expiry: 1000000000 + 3600000, scopes: ["a"] } });
    const auth = A.createAuth(env.deps).init(CFG);
    const events = [];
    auth.onAuthChange(e => events.push(e.type));
    auth.signOut();
    ok(!auth.isSignedIn(), "signed out");
    ok(env.revoked, "token revoked");
    ok(!(A.STORAGE_KEY in env.store), "storage cleared");
    ok(events.indexOf("signout") !== -1, "signout event");
  }

  console.log("profile fetch");
  {
    const env = makeEnv({});
    const auth = A.createAuth(env.deps).init(CFG);
    const p = auth.ensureToken({ interactive: true });
    env.respond({ access_token: "P", expires_in: 3600 });
    await p;
    ok(auth.getProfile() && auth.getProfile().email === "b@x.com", "profile fetched + exposed");
    ok(auth.getEmail() === "b@x.com", "email cached on token");
    ok(JSON.parse(env.store[A.STORAGE_KEY]).email === "b@x.com", "email persisted for next boot");
  }

  console.log("\n" + pass + " passed, " + fail + " failed");
  process.exit(fail ? 1 : 0);
})();
