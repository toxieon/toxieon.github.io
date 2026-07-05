/* =========================================================================
 *  nd-auth.js — Neill Data Suite shared Google auth (handoff §1.1)
 *
 *  Sign in once, stay signed in, suite-wide:
 *  - Wraps the GIS token client. Persists {access_token, expiry, scopes,
 *    email, profile} in localStorage under ONE shared key — all apps are
 *    same-origin on neilldata.com, so one login serves all.
 *  - On boot: stored token valid -> use it (no popup). Expired -> silent
 *    renewal (prompt:''); consent popup only if silent fails AND the call
 *    was interactive (a user tap).
 *  - Proactive refresh ~5 min before expiry while visible; re-check on
 *    visibilitychange (returning to a backgrounded PWA).
 *  - Multi-tab: a token refreshed in one tab reaches the others via the
 *    'storage' event.
 *
 *  API (browser): NDAuth.init(cfg) · NDAuth.ensureToken({interactive}) ·
 *  NDAuth.onAuthChange(cb) · NDAuth.signOut() · NDAuth.getToken() ·
 *  NDAuth.getExpiry() · NDAuth.getProfile() · NDAuth.isSignedIn()
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

  /* ── core factory (all browser APIs injected via deps) ────────────────
   * deps: now(), storage{get,set,remove}, setTimer(fn,ms), clearTimer(id),
   *       createTokenClient({clientId,scope,callback,error_callback})
   *         -> {requestAccessToken({prompt})},
   *       revoke(token), fetchProfile(token)->Promise<obj|null>,
   *       isVisible()->bool, onVisibility(cb), onStorage(cb(newValue))
   */
  function createAuth(deps) {
    let cfg = null, tokenClient = null;
    let token = null;                 // {access_token, expiry, scopes[], email, profile}
    let listeners = [];
    let refreshTimer = null;
    let pending = null;               // in-flight token request {resolve, reject, fallbackConsent, isConsent}
    let everSignedInThisSession = false;

    function emit(type, extra) {
      const ev = Object.assign({
        type: type,
        token: token ? token.access_token : null,
        profile: token ? (token.profile || null) : null,
        signedIn: isSignedIn()
      }, extra || {});
      listeners.forEach(cb => { try { cb(ev); } catch (e) { /* listener errors are theirs */ } });
    }

    function store() {
      if (token) deps.storage.set(STORAGE_KEY, JSON.stringify(token));
      else deps.storage.remove(STORAGE_KEY);
    }

    function isSignedIn() { return isValid(token, deps.now()); }

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
      const prevEmail = token ? token.email : null;
      const prevProfile = token ? token.profile : null;
      token = {
        access_token: resp.access_token,
        expiry: deps.now() + ((resp.expires_in || 3600) * 1000),
        scopes: (resp.scope ? resp.scope.split(" ") : (cfg.scopes || []).slice()),
        email: prevEmail,
        profile: prevProfile
      };
      store();
      scheduleProactiveRefresh();
      const finish = function () {
        const first = !wasSignedIn && !everSignedInThisSession;
        everSignedInThisSession = true;
        emit(first ? "signin" : "refresh");
        if (p) p.resolve(token.access_token);
      };
      if (deps.fetchProfile && (!token.profile)) {
        deps.fetchProfile(token.access_token)
          .then(function (pr) { if (pr) { token.profile = pr; token.email = pr.email || null; store(); } })
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

    /* ── public API ─────────────────────────────────────────────────── */
    const api = {};

    api.init = function (config) {
      cfg = config;
      token = parseStored(deps.storage.get(STORAGE_KEY));
      tokenClient = deps.createTokenClient({
        clientId: cfg.clientId,
        scope: (cfg.scopes || []).join(" "),
        callback: handleTokenResponse,
        error_callback: handleTokenError
      });
      if (deps.onVisibility) deps.onVisibility(function () {
        if (!token) return;
        if (!isSignedIn()) silentRenew();
        else scheduleProactiveRefresh();
      });
      if (deps.onStorage) deps.onStorage(function (newValue) {
        const incoming = parseStored(newValue);
        if (!incoming) return;                    // ignore removals; explicit signOut is per-tab
        const wasSignedIn = isSignedIn();
        token = incoming;
        scheduleProactiveRefresh();
        everSignedInThisSession = true;
        emit(wasSignedIn ? "external" : "signin");
      });
      if (isSignedIn()) {
        everSignedInThisSession = true;
        scheduleProactiveRefresh();
        emit("signin");                           // stored-token resume
      }
      return api;
    };

    api.ensureToken = function (opts) {
      const interactive = !!(opts && opts.interactive);
      if (!cfg) return Promise.reject(new Error("nd-auth: init() first"));
      const now = deps.now();
      if (isValid(token, now)) {
        if (needsProactiveRefresh(token, now)) silentRenew(); // top up in background
        return Promise.resolve(token.access_token);
      }
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
    api.getProfile = function () { return token ? (token.profile || null) : null; };
    api.getEmail   = function () { return token ? (token.email || null) : null; };
    api.isSignedIn = isSignedIn;
    api.pendingRequest = function () { return !!pending; };

    api.signOut = function () {
      if (token && token.access_token && deps.revoke) { try { deps.revoke(token.access_token); } catch (e) {} }
      token = null;
      store();
      if (refreshTimer !== null) { deps.clearTimer(refreshTimer); refreshTimer = null; }
      everSignedInThisSession = false;
      emit("signout");
    };

    return api;
  }

  /* ── browser wiring ───────────────────────────────────────────────── */
  function browserDeps() {
    return {
      now: function () { return Date.now(); },
      storage: {
        get: function (k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
        set: function (k, v) { try { localStorage.setItem(k, v); } catch (e) {} },
        remove: function (k) { try { localStorage.removeItem(k); } catch (e) {} }
      },
      setTimer: function (fn, ms) { return setTimeout(fn, ms); },
      clearTimer: function (id) { clearTimeout(id); },
      createTokenClient: function (opts) {
        return google.accounts.oauth2.initTokenClient({
          client_id: opts.clientId, scope: opts.scope,
          callback: opts.callback, error_callback: opts.error_callback
        });
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
    STORAGE_KEY, REFRESH_LEAD_MS, VALIDITY_SKEW_MS,
    isValid, needsProactiveRefresh, scopesCover, parseStored,
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
