/* Black Book API client: Bearer token only, no cookies, no credentials. The host is public config, not a secret.
 * Every path is under /api/owner (blackbook routes plus the existing race list used by "Add from a race card"). */
(function (root, factory) {
  "use strict";
  var api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.BBApi = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  var API_BASE = "https://afl-tipster-bot.onrender.com";
  var TOKEN_KEY = "nd_owner_token";
  var FALLBACK_TOKEN_KEYS = ["nd_models_owner_token"];
  var BASE = "/api/owner/blackbook";

  var CANONICAL_RETURN = "https://www.neilldata.com/blackbook/";
  var RETURN_ORIGINS = ["https://www.neilldata.com", "https://neilldata.com"];

  /** Post-login landing URL for TipBot's return_to. Same origin when already on www or apex neilldata.com. */
  function returnToUrl(origin) {
    var o = String(origin || "").replace(/\/$/, "");
    for (var i = 0; i < RETURN_ORIGINS.length; i++) {
      if (o === RETURN_ORIGINS[i]) return o + "/blackbook/";
    }
    return CANONICAL_RETURN;
  }

  /** TipBot Discord OAuth start. Navigation only — no XHR, no cookies. */
  function loginUrl(origin) {
    return API_BASE + "/auth/login?return_to=" + encodeURIComponent(returnToUrl(origin));
  }


  /** POST /api/auth/exchange once. The body is the one-time #code= value, not a session token.
   *  No Authorization header. 200 {token} returns that session token; 400/401 return an empty token. */
  async function exchangeCode(code, opts) {
    var o = opts || {};
    var doFetch = o.fetch || (typeof fetch !== "undefined" ? fetch : null);
    if (!doFetch || typeof code !== "string" || !code) return { status: 0, token: "", data: {} };
    try {
      var r = await doFetch(API_BASE + "/api/auth/exchange", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        cache: "no-store",
        credentials: "omit",
        body: JSON.stringify({ code: code })
      });
      var data = null;
      try { data = await r.json(); } catch (e) { data = null; }
      data = data || {};
      var token = (r.status === 200 && typeof data.token === "string") ? data.token : "";
      return { status: r.status, token: token, data: data };
    } catch (err) {
      return { status: 0, token: "", data: {} };
    }
  }

  function isStoreableToken(token) {
    if (typeof token !== "string") return false;
    if (token.length < 16 || token.length > 4096) return false;
    return !/[\s\u0000-\u001f\u007f]/.test(token);
  }

  /** Exchange the one-time code and, on success, store the session token as nd_owner_token. */
  async function exchangeAndStore(code, storage, opts) {
    var res = await exchangeCode(code, opts);
    if (res.status === 200 && isStoreableToken(res.token)) {
      saveToken(storage, res.token);
      return { ok: true, status: 200 };
    }
    return { ok: false, status: res.status };
  }

  function readToken(storage) {
    try {
      var keys = [TOKEN_KEY].concat(FALLBACK_TOKEN_KEYS);
      for (var i = 0; i < keys.length; i++) {
        var v = storage.getItem(keys[i]);
        if (v) return v;
      }
    } catch (e) {}
    return "";
  }
  function saveToken(storage, token) { try { storage.setItem(TOKEN_KEY, token); } catch (e) {} }
  function clearToken(storage) {
    try { [TOKEN_KEY].concat(FALLBACK_TOKEN_KEYS).forEach(function (k) { storage.removeItem(k); }); } catch (e) {}
  }

  /** Path builders for every call the page makes. */
  var paths = {
    list: function (opts) {
      var q = new URLSearchParams();
      if (opts && opts.priority && opts.priority !== "all") q.set("priority", opts.priority);
      if (opts && opts.filter) q.set("filter", opts.filter);
      q.set("sort", (opts && opts.sort) || "nextJump");
      return BASE + "?" + q.toString();
    },
    upcoming: function () { return BASE + "/upcoming"; },
    archived: function () { return BASE + "/archived"; },
    entry: function (id) { return BASE + "/entries/" + encodeURIComponent(id); },
    entries: function () { return BASE + "/entries"; },
    restore: function (id) { return BASE + "/entries/" + encodeURIComponent(id) + "/restore"; },
    search: function (q) { return BASE + "/search?q=" + encodeURIComponent(q); },
    raceCard: function (eventId) { return BASE + "/race-card?event_id=" + encodeURIComponent(eventId); },
    races: function () { return "/api/owner/horse/races"; }
  };

  /** 401 = signed out or bad token. 404 {error:"not_found"} = signed in but not the owner. */
  function classify(status, data) {
    if (status === 401) return "signin";
    if (status === 404 && data && data.error === "not_found") return "denied";
    return "";
  }

  /**
   * One request. opts: {base, token, fetch, sleep}. Returns {status, data, auth}.
   * status 0 = network failure. GET retries once on 502/503 (Render cold start).
   */
  async function request(method, path, body, opts) {
    var o = opts || {};
    var doFetch = o.fetch || (typeof fetch !== "undefined" ? fetch : null);
    var sleep = o.sleep || function (ms) { return new Promise(function (ok) { setTimeout(ok, ms); }); };
    var headers = {};
    if (o.token) headers.Authorization = "Bearer " + o.token;
    if (body !== undefined) headers["Content-Type"] = "application/json";
    var tries = method === "GET" ? 2 : 1;
    for (var i = 1; i <= tries; i++) {
      try {
        var r = await doFetch((o.base || API_BASE) + path, {
          method: method, headers: headers, cache: "no-store", credentials: "omit",
          body: body !== undefined ? JSON.stringify(body) : undefined
        });
        if ((r.status === 502 || r.status === 503) && i < tries) { await sleep(1200); continue; }
        var data = null;
        try { data = await r.json(); } catch (e) { data = null; }
        return { status: r.status, data: data || {}, auth: classify(r.status, data) };
      } catch (err) {
        if (i >= tries) return { status: 0, data: {}, auth: "" };
      }
    }
    return { status: 0, data: {}, auth: "" };
  }

  var PRICE_MSG = "Your price should be a decimal price such as 4.20.";
  /** User-facing text for a failed add. 409 (duplicate, cap) and 400 (invalid, empty) are normal answers, not crashes. */
  function describeAddError(status, data) {
    var d = data || {};
    if (status === 503 || d.error === "db_busy" || d.error === "warming" || d.error === "unavailable") {
      return "Database unavailable.";
    }
    if (d.code === "duplicate") return "This horse is already in your Black Book.";
    if (d.code === "cap") return d.limit ? "The Black Book is full (limit " + d.limit + ")." : "The Black Book is full.";
    if (d.code === "unconfirmed") return "That horse could not be matched to a stored start.";
    if (d.field === "betPrice") return PRICE_MSG;
    if (d.field === "priority") return "Pick Low, Med or High priority.";
    if (d.code === "empty") return "Enter a horse name first.";
    if (d.code === "invalid" || status === 400) return "That request was not valid. Check the fields and try again.";
    return "The horse was not added. Try again.";
  }
  /** Text for a failed edit or restore. */
  function describeEditError(status, data, kind) {
    var d = data || {};
    if (status === 503 || d.error === "db_busy" || d.error === "warming" || d.error === "unavailable") {
      return "Database unavailable.";
    }
    if (status === 409 && d.code === "cap") return "The Black Book is full.";
    if (d.field === "betPrice") return PRICE_MSG;
    if (d.field === "priority") return "Pick Low, Med or High priority.";
    if (status === 404 || d.code === "missing") return "That horse is no longer in your Black Book.";
    return kind === "restore" ? "Not restored. Try again." : "Not saved. Try again.";
  }

  return { describeAddError: describeAddError, describeEditError: describeEditError, API_BASE: API_BASE, TOKEN_KEY: TOKEN_KEY, FALLBACK_TOKEN_KEYS: FALLBACK_TOKEN_KEYS, BASE: BASE,
    CANONICAL_RETURN: CANONICAL_RETURN, RETURN_ORIGINS: RETURN_ORIGINS, returnToUrl: returnToUrl, loginUrl: loginUrl,
    exchangeCode: exchangeCode, exchangeAndStore: exchangeAndStore,
    readToken: readToken, saveToken: saveToken, clearToken: clearToken, paths: paths, classify: classify, request: request };
});
