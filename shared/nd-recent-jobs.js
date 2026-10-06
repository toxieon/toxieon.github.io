/* nd-recent-jobs.js — suite-wide "Recent jobs" store (Hub quick launch).
 *
 * Every suite app is served from the same origin (www.neilldata.com), so they
 * all share one localStorage key. Apps call NDRecentJobs.record() when a job
 * or plan is opened; the Hub shows the newest few as one-tap links.
 *
 * Entry: { app, id, label, url, ts }
 *   app    suite app id ("planner", "quote", ...)
 *   id     job / project id within that app (deduped by app + id)
 *   label  job name/number + client or address, plain text
 *   url    same-origin path that reopens it ("/planner/#project=prj_1"),
 *          or the app's own path when the app has no deep link
 *   ts     epoch ms
 *
 * Storage: localStorage only, no backend. The key is the one the 0.5.0
 * "Continue where you left off" feed used (nd:recent:v1), so existing entries
 * carry over; their old `context` field is read as `id`. Corrupt JSON reads as
 * an empty list and is replaced on the next record(). Capped at 20 entries.
 *
 * Plain script (window.NDRecentJobs) and CommonJS (tests). No dependencies.
 * Tests: shared/nd-recent-jobs.test.js */
(function (root, factory) {
  var api = factory(root);
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.NDRecentJobs = api;
})(typeof self !== "undefined" ? self : this, function (root) {
  "use strict";
  var KEY = "nd:recent:v1";
  var CAP = 20;
  var SHOW = 5;
  var MAX_LABEL = 160;

  function storageOf(s) {
    if (s) return s;
    try { return (root && root.localStorage) || null; } catch (e) { return null; }
  }

  function clean(v, max) {
    return String(v == null ? "" : v).replace(/[\u0000-\u001f\u007f]+/g, " ").replace(/\s+/g, " ").trim().slice(0, max || 200);
  }

  /* Only same-origin absolute paths may be stored, so a stored entry can never
   * become a javascript: or off-site link in the Hub. */
  function safeUrl(u) {
    var s = String(u == null ? "" : u).trim();
    if (s.charAt(0) !== "/" || s.charAt(1) === "/" || s.charAt(1) === "\\") return "";
    if (/[\u0000-\u001f\s]/.test(s)) return "";
    return s.slice(0, 500);
  }

  function normalize(e) {
    if (!e || typeof e !== "object") return null;
    var app = clean(e.app, 40);
    var id = clean(e.id != null ? e.id : (e.jobId != null ? e.jobId : e.context), 120);
    if (!app || !id) return null;
    var ts = Number(e.ts);
    return {
      app: app,
      id: id,
      label: clean(e.label, MAX_LABEL) || id,
      url: safeUrl(e.url),
      ts: isFinite(ts) && ts > 0 ? ts : 0
    };
  }

  function read(storage) {
    var s = storageOf(storage);
    if (!s) return [];
    var raw;
    try { raw = s.getItem(KEY); } catch (e) { return []; }
    if (!raw) return [];
    var parsed;
    try { parsed = JSON.parse(raw); } catch (e) { return []; }
    if (!Array.isArray(parsed)) return [];
    var seen = {};
    return parsed.map(normalize).filter(Boolean)
      .sort(function (a, b) { return b.ts - a.ts; })
      .filter(function (e) { var k = e.app + "\n" + e.id; if (seen[k]) return false; seen[k] = true; return true; })
      .slice(0, CAP);
  }

  function write(list, storage) {
    var s = storageOf(storage);
    if (!s) return false;
    try { s.setItem(KEY, JSON.stringify(list)); return true; } catch (e) { return false; }
  }

  /* record({ app, id | jobId, label, url }, { storage, now }) -> stored entry or null */
  function record(entry, opts) {
    opts = opts || {};
    var e = normalize(Object.assign({}, entry, { ts: opts.now || Date.now() }));
    if (!e) return null;
    var list = read(opts.storage).filter(function (x) { return !(x.app === e.app && x.id === e.id); });
    list.unshift(e);
    write(list.slice(0, CAP), opts.storage);
    return e;
  }

  /* list(limit = 5, storage) -> newest first */
  function list(limit, storage) {
    return read(storage).slice(0, limit || SHOW);
  }

  function clear(storage) {
    var s = storageOf(storage);
    if (s) { try { s.removeItem(KEY); } catch (e) {} }
  }

  /* Label helper: "Job name · client/address", skipping blanks and repeats. */
  function label() {
    var parts = [];
    for (var i = 0; i < arguments.length; i++) {
      var p = clean(arguments[i], MAX_LABEL);
      if (p && parts.every(function (q) { return q.toLowerCase() !== p.toLowerCase(); })) parts.push(p);
    }
    return parts.join(" · ").slice(0, MAX_LABEL);
  }

  return { KEY: KEY, CAP: CAP, SHOW: SHOW, record: record, list: list, read: read, clear: clear, label: label, safeUrl: safeUrl };
});
