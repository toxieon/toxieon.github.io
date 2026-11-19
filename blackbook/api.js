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

  return { API_BASE: API_BASE, TOKEN_KEY: TOKEN_KEY, FALLBACK_TOKEN_KEYS: FALLBACK_TOKEN_KEYS, BASE: BASE,
    readToken: readToken, saveToken: saveToken, clearToken: clearToken, paths: paths, classify: classify, request: request };
});
