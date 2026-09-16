/* =========================================================================
 *  nd-auth.js — Neill Data Suite shared Google auth (handoff §1.1)
 *
 *  Sign in once, stay signed in, suite-wide:
 *  - Wraps the GIS token client. Persists {access_token, expiry, scopes,
 *    email, profile} under ONE shared key — all apps are same-origin on
 *    www.neilldata.com, so one login serves all.
 *  - Primary store: localStorage. Backup: IndexedDB (survives QuotaExceeded
 *    when Planner fills localStorage). Identity (email/profile) is also
 *    mirrored to a tiny `nd.auth.identity.v1` key so "Continue as …" works
 *    even if the access token blob was dropped.
 *  - On boot: stored token valid -> use it (no popup). Expired -> silent
 *    renewal (prompt:''). Consent popup only if silent fails AND the call
 *    was interactive (a user tap). A tap often lets silent renew succeed
 *    when a cold boot silent call was blocked (no user activation).
 *  - Proactive refresh ~5 min before expiry while visible; re-check on
 *    visibilitychange (returning to a backgrounded PWA).
 *  - Multi-tab: a token refreshed in one tab reaches the others via the
 *    'storage' event.
 *
 *  API (browser): NDAuth.init(cfg) · NDAuth.ensureToken({interactive, force}) ·
 *  NDAuth.onAuthChange(cb) · NDAuth.signOut() · NDAuth.getToken() ·
 *  NDAuth.getExpiry() · NDAuth.getProfile() · NDAuth.getEmail() ·
 *  NDAuth.getResumeEmail() · NDAuth.isSignedIn() · NDAuth.hasPriorSession()
 *
 *  Events delivered to onAuthChange callbacks:
 *    {type:'signin'|'refresh'|'external'|'signout'|'error', token, profile}
 *  'signin'  fires once per session start (stored-token resume counts).
 *  'refresh' fires on silent/proactive renewals — update gapi token, do
 *            NOT re-run app bootstrap.
 *  'external' means another tab wrote a token — treat like 'refresh',
 *             or like 'signin' if you weren't signed in yet.
 *
 *  Pure logic (isValid / needsProactiveRefresh / createAuth) is exported
 *  for Node tests: node shared/nd-auth.test.js
 * ========================================================================= */
(function (root) {
  "use strict";

  const STORAGE_KEY      = "nd.auth.token.v1";
  const IDENTITY_KEY     = "nd.auth.identity.v1";
  const IDB_NAME         = "nd-auth";
  const IDB_STORE        = "kv";
  const REFRESH_LEAD_MS  = 5 * 60 * 1000;  // renew this long before expiry
  const VALIDITY_SKEW_MS = 30 * 1000;      // treat as expired this early

  /* ── pure helpers ─────────────────────────────────────────────────── */
  function isValid(tok, nowMs) {
    return !!(tok && tok.access_token && tok.expiry && nowMs < tok.expiry - VALIDITY_SKEW_MS);
  }
  function needsProactiveRefresh(tok, nowMs) {
    return !!(tok && tok.expiry && nowMs >= tok.expiry - REFRESH_LEAD_MS);
  }
  function scopesCover(grantedList, neededList) {
    const g = grantedList || [];
    return (neededList || []).every(s => g.indexOf(s) !== -1);
  }
  function parseStored(raw) {
    if (!raw) return null;
    try {
      const t = JSON.parse(raw);
      return (t && t.access_token && t.expiry) ? t : null;
    } catch (e) { return null; }
  }
  function parseIdentity(raw) {
    if (!raw) return null;
    try {
      const t = JSON.parse(raw);
      return (t && t.email) ? t : null;
    } catch (e) { return null; }
  }

  /* ── core factory (all browser APIs injected via deps) ────────────────
   * deps: now(), storage{get,set,remove}, setTimer(fn,ms), clearTimer(id),
   *       createTokenClient({clientId,scope,callback,error_callback,hint})
   *         -> {requestAccessToken({prompt})},
   *       revoke(token), fetchProfile(token)->Promise<obj|null>,
   *       isVisible()->bool, onVisibility(cb), onStorage(cb(newValue)),
   *       optional: idb{get,set,remove}(key)->Promise
   */
  function createAuth(deps) {
    let cfg = null, tokenClient = null;
    let token = null;                 // {access_token, expiry, scopes[], email, profile}
    let identity = null;              // {email, profile} durable even when access token gone
    let listeners = [];
    let refreshTimer = null;
    let pending = null;               // in-flight token request {resolve, reject, fallbackConsent, isConsent}
    let everSignedInThisSession = false;

    function emit(type, extra) {
      const ev = Object.assign({
        type: type,
        token: token ? token.access_token : null,
        profile: token ? (token.profile || null) : (identity ? identity.profile : null),
        signedIn: isSignedIn()
      }, extra || {});
      listeners.forEach(cb => { try { cb(ev); } catch (e) { /* listener errors are theirs */ } });
    }

    function rememberIdentity() {
      const email = (token && token.email) || (identity && identity.email) || null;
      const profile = (token && token.profile) || (identity && identity.profile) || null;
      if (!email) return;
      identity = { email: email, profile: profile };
      try {
        deps.storage.set(IDENTITY_KEY, JSON.stringify(identity));
      } catch (e) {}
      if (deps.idb && deps.idb.set) {
        deps.idb.set(IDENTITY_KEY, JSON.stringify(identity)).catch(function () {});
      }
    }

    function store() {
      if (token) {
        const raw = JSON.stringify(token);
        const ok = deps.storage.set(STORAGE_KEY, raw);
        if (ok === false) {
          emit("error", { error: "storage_quota", message: "Could not persist auth token to localStorage" });
        }
        if (deps.idb && deps.idb.set) {
          deps.idb.set(STORAGE_KEY, raw).catch(function () {});
        }
        rememberIdentity();
      } else {
        deps.storage.remove(STORAGE_KEY);
        if (deps.idb && deps.idb.remove) {
          deps.idb.remove(STORAGE_KEY).catch(function () {});
        }
      }
    }

    function clearIdentity() {
      identity = null;
      deps.storage.remove(IDENTITY_KEY);
      if (deps.idb && deps.idb.remove) {
        deps.idb.remove(IDENTITY_KEY).catch(function () {});
      }
    }

    function isSignedIn() { return isValid(token, deps.now()); }

    function resumeEmail() {
      return (token && token.email) || (identity && identity.email) || null;
    }

    function buildTokenClient() {
      tokenClient = deps.createTokenClient({
        clientId: cfg.clientId,
        scope: (cfg.scopes || []).join(" "),
        callback: handleTokenResponse,
        error_callback: handleTokenError,
        hint: resumeEmail() || undefined
      });
    }

    function scheduleProactiveRefresh() {
      if (refreshTimer !== null) { deps.clearTimer(refreshTimer); refreshTimer = null; }
      if (!token || !token.expiry) return;
      const delay = Math.max(1000, token.expiry - REFRESH_LEAD_MS - deps.now());
      refreshTimer = deps.setTimer(function () {
        refreshTimer = null;
        // Only renew while visible — a hidden tab renews on visibilitychange instead.
        if (!deps.isVisible || deps.isVisible()) silentRenew();
      }, delay);
    }

    function handleTokenResponse(resp) {
      const p = pending; pending = null;
      if (!resp || resp.error) {
        const msg = resp ? (resp.error_description || resp.error) : "empty token response";
        if (p && p.fallbackConsent && !p.isConsent) { requestToken("consent", p); return; }
        if (p) p.reject(new Error(msg));
        emit("error", { error: msg });
        return;
      }
      const wasSignedIn = isSignedIn();
      const prevEmail = token ? token.email : (identity ? identity.email : null);
      const prevProfile = token ? token.profile : (identity ? identity.profile : null);
      const expiresInSec = Number(resp.expires_in);
      token = {
        access_token: resp.access_token,
        expiry: deps.now() + (((expiresInSec > 0) ? expiresInSec : 3600) * 1000),
        scopes: (resp.scope ? resp.scope.split(" ") : (cfg.scopes || []).slice()),
        email: prevEmail,
        profile: prevProfile
      };
      store();
      // Rebuild client with hint once we know the email (helps later silent renews).
      if (token.email) buildTokenClient();
      scheduleProactiveRefresh();
      const finish = function () {
        const first = !wasSignedIn && !everSignedInThisSession;
        everSignedInThisSession = true;
        emit(first ? "signin" : "refresh");
        if (p) p.resolve(token.access_token);
      };
      if (deps.fetchProfile && (!token.profile)) {
        deps.fetchProfile(token.access_token)
          .then(function (pr) {
            if (pr) {
              token.profile = pr;
              token.email = pr.email || token.email || null;
              store();
              if (token.email) buildTokenClient();
            }
          })
          .catch(function () {})
          .then(finish);
      } else finish();
    }

    function handleTokenError(err) {
      const p = pending; pending = null;
      const msg = (err && (err.message || err.type)) || "OAuth failed";
      if (p && p.fallbackConsent && !p.isConsent) { requestToken("consent", p); return; }
      if (p) p.reject(new Error(msg));
      emit("error", { error: msg });
    }

    function requestToken(promptValue, carry) {
      if (!tokenClient) return Promise.reject(new Error("nd-auth: not initialised"));
      return new Promise(function (resolve, reject) {
        pending = {
          resolve: carry ? function (v) { carry.resolve(v); resolve(v); } : resolve,
          reject:  carry ? function (e) { carry.reject(e);  reject(e); }  : reject,
          fallbackConsent: carry ? carry.fallbackConsent : false,
          isConsent: promptValue === "consent"
        };
        tokenClient.requestAccessToken({ prompt: promptValue });
      });
    }

    function silentRenew() {
      if (pending) return;                       // one in-flight request at a time
      requestToken("").catch(function () {});     // background failure surfaces via 'error' event
    }

    function applyIncomingToken(incoming, source) {
      if (!incoming) return;
      const wasSignedIn = isSignedIn();
      token = incoming;
      if (token.email || (token.profile && token.profile.email)) {
        if (!token.email && token.profile) token.email = token.profile.email;
        rememberIdentity();
      }
      scheduleProactiveRefresh();
      everSignedInThisSession = true;
      if (source === "storage") {
        emit(wasSignedIn ? "external" : "signin");
      } else if (source === "idb" && isSignedIn()) {
        // Mirror IDB hit back to localStorage for cross-tab sync.
        store();
        emit("signin");
      }
    }

    /* ── public API ─────────────────────────────────────────────────── */
    const api = {};

    api.init = function (config) {
      cfg = config;
      token = parseStored(deps.storage.get(STORAGE_KEY));
      identity = parseIdentity(deps.storage.get(IDENTITY_KEY));
      if (token && token.email) rememberIdentity();
      else if (!token && identity && identity.email) {
        // Keep identity for Continue-as / hint even without a live access token.
      }
      buildTokenClient();
      if (deps.onVisibility) deps.onVisibility(function () {
        if (!token) return;
        if (!isSignedIn()) silentRenew();
        else scheduleProactiveRefresh();
      });
      if (deps.onStorage) deps.onStorage(function (newValue) {
        const incoming = parseStored(newValue);
        if (!incoming) return;                    // ignore removals; explicit signOut is per-tab
        applyIncomingToken(incoming, "storage");
      });
      if (isSignedIn()) {
        everSignedInThisSession = true;
        scheduleProactiveRefresh();
        emit("signin");                           // stored-token resume
      } else if (!token && deps.idb && deps.idb.get) {
        // localStorage miss (quota / private mode quirk): try IndexedDB backup.
        deps.idb.get(STORAGE_KEY).then(function (raw) {
          if (isSignedIn() || token) return;      // something else won the race
          const incoming = parseStored(raw);
          if (incoming && isValid(incoming, deps.now())) {
            applyIncomingToken(incoming, "idb");
          } else if (incoming) {
            token = incoming;                     // expired — keep for hint / silent renew
            if (incoming.email) rememberIdentity();
          }
        }).catch(function () {});
        deps.idb.get(IDENTITY_KEY).then(function (raw) {
          if (identity && identity.email) return;
          const id = parseIdentity(raw);
          if (id) identity = id;
        }).catch(function () {});
      }
      return api;
    };

    api.ensureToken = function (opts) {
      const interactive = !!(opts && opts.interactive);
      const force = !!(opts && opts.force);
      if (!cfg) return Promise.reject(new Error("nd-auth: init() first"));
      const now = deps.now();
      // force: mid-session 401 — local expiry may still look valid; renew anyway.
      if (!force && isValid(token, now)) {
        if (needsProactiveRefresh(token, now)) silentRenew(); // top up in background
        return Promise.resolve(token.access_token);
      }
      // Rebuild with hint before interactive renew — improves account match.
      if (interactive && resumeEmail()) buildTokenClient();
      // Expired or absent: silent first; consent fallback only if interactive.
      if (pending) {
        // piggyback on the in-flight request
        return new Promise(function (resolve, reject) {
          const prev = pending;
          pending = {
            resolve: function (v) { prev.resolve(v); resolve(v); },
            reject:  function (e) { prev.reject(e);  reject(e); },
            fallbackConsent: prev.fallbackConsent || interactive,
            isConsent: prev.isConsent
          };
        });
      }
      return requestToken("", { resolve: function () {}, reject: function () {}, fallbackConsent: interactive });
    };

    api.onAuthChange = function (cb) { listeners.push(cb); return function () { listeners = listeners.filter(l => l !== cb); }; };
    api.getToken   = function () { return token ? token.access_token : null; };
    api.getExpiry  = function () { return token ? token.expiry : null; };
    api.getProfile = function () {
      return (token && token.profile) || (identity && identity.profile) || null;
    };
    api.getEmail   = function () { return resumeEmail(); };
    api.getResumeEmail = function () { return resumeEmail(); };
    api.hasPriorSession = function () { return !!resumeEmail() || !!(token && token.access_token); };
    api.isSignedIn = isSignedIn;
    api.pendingRequest = function () { return !!pending; };

    api.signOut = function () {
      if (token && token.access_token && deps.revoke) { try { deps.revoke(token.access_token); } catch (e) {} }
      token = null;
      store();
      clearIdentity();
      if (refreshTimer !== null) { deps.clearTimer(refreshTimer); refreshTimer = null; }
      everSignedInThisSession = false;
      emit("signout");
    };

    return api;
  }

  /* ── IndexedDB tiny kv helper ─────────────────────────────────────── */
  function openIdb() {
    return new Promise(function (resolve, reject) {
      if (typeof indexedDB === "undefined") return reject(new Error("no idb"));
      const req = indexedDB.open(IDB_NAME, 1);
      req.onupgradeneeded = function () {
        const db = req.result;
        if (!db.objectStoreNames.contains(IDB_STORE)) db.createObjectStore(IDB_STORE);
      };
      req.onsuccess = function () { resolve(req.result); };
      req.onerror = function () { reject(req.error); };
    });
  }
  function idbOps() {
    function withStore(mode, fn) {
      return openIdb().then(function (db) {
        return new Promise(function (resolve, reject) {
          const tx = db.transaction(IDB_STORE, mode);
          const store = tx.objectStore(IDB_STORE);
          let req;
          try { req = fn(store); } catch (e) { reject(e); return; }
          tx.oncomplete = function () { resolve(req ? req.result : undefined); };
          tx.onerror = function () { reject(tx.error); };
          tx.onabort = function () { reject(tx.error); };
        });
      });
    }
    return {
      get: function (k) {
        return withStore("readonly", function (s) { return s.get(k); }).catch(function () { return undefined; });
      },
      set: function (k, v) {
        return withStore("readwrite", function (s) { return s.put(v, k); }).catch(function () {});
      },
      remove: function (k) {
        return withStore("readwrite", function (s) { return s.delete(k); }).catch(function () {});
      }
    };
  }

  /* ── browser wiring ───────────────────────────────────────────────── */
  function browserDeps() {
    const idb = idbOps();
    return {
      now: function () { return Date.now(); },
      storage: {
        get: function (k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
        set: function (k, v) {
          try {
            localStorage.setItem(k, v);
            return true;
          } catch (e) {
            // QuotaExceeded: drop our own key and retry once; never throw.
            try {
              localStorage.removeItem(k);
              localStorage.setItem(k, v);
              return true;
            } catch (e2) {
              try { console.warn("nd-auth: localStorage set failed", e2); } catch (e3) {}
              return false;
            }
          }
        },
        remove: function (k) { try { localStorage.removeItem(k); } catch (e) {} }
      },
      idb: idb,
      setTimer: function (fn, ms) { return setTimeout(fn, ms); },
      clearTimer: function (id) { clearTimeout(id); },
      createTokenClient: function (opts) {
        const cfg = {
          client_id: opts.clientId,
          scope: opts.scope,
          callback: opts.callback,
          error_callback: opts.error_callback
        };
        if (opts.hint) cfg.hint = opts.hint;
        return google.accounts.oauth2.initTokenClient(cfg);
      },
      revoke: function (tok) { try { google.accounts.oauth2.revoke(tok, function () {}); } catch (e) {} },
      fetchProfile: function (tok) {
        return fetch("https://openidconnect.googleapis.com/v1/userinfo", {
          headers: { Authorization: "Bearer " + tok }
        }).then(function (r) { return r.ok ? r.json() : null; }).catch(function () { return null; });
      },
      isVisible: function () { return document.visibilityState === "visible"; },
      onVisibility: function (cb) {
        document.addEventListener("visibilitychange", function () {
          if (document.visibilityState === "visible") cb();
        });
      },
      onStorage: function (cb) {
        window.addEventListener("storage", function (e) {
          if (e.key === STORAGE_KEY) cb(e.newValue);
        });
      }
    };
  }

  const API = {
    STORAGE_KEY, IDENTITY_KEY, REFRESH_LEAD_MS, VALIDITY_SKEW_MS,
    isValid, needsProactiveRefresh, scopesCover, parseStored, parseIdentity,
    createAuth, browserDeps
  };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = API;
  } else {
    root.ND = root.ND || {};
    root.ND.authKit = API;
    root.NDAuth = createAuth(browserDeps());   // ready-to-init singleton
  }
})(typeof window !== "undefined" ? window : globalThis);
