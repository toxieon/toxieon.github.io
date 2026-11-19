/* Fake Black Book backend for localhost ?demo=1 only. Every name, race and number is obviously synthetic.
 * Nothing here is real racing data and nothing is fetched. */
(function (root, factory) {
  "use strict";
  var api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.BBDemo = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  var HORSES = ["Demo Runner One", "Fake Horse Alpha", "Sample Steed", "Test Nag Four", "Mock Gallop Five", "Pretend Pony Six"];
  var MEETINGS = ["Demo Park", "Sample Oval", "Fake Track West"];
  var CATALOG = ["Demo Runner One", "Fake Horse Alpha", "Sample Steed", "Test Nag Four", "Mock Gallop Five", "Pretend Pony Six", "Placeholder Pal", "Stub Stallion"];
  var PRIO = ["high", "med", "low"];
  var LEVEL = { low: 1, med: 2, high: 3 };

  function isDemoHost(hostname) { return /^(localhost|127\.0\.0\.1|\[::1\])$/.test(hostname || ""); }
  function isDemoMode(hostname, search) {
    if (!isDemoHost(hostname)) return false;
    try { return new URLSearchParams(search || "").get("demo") === "1"; } catch (e) { return false; }
  }
  function iso(ms) { return new Date(ms).toISOString().replace(/\.\d+Z$/, "Z"); }

  /** In-memory fake API. request(method, path, body) -> {status, data, auth}. */
  function createBackend(nowMs) {
    var t0 = nowMs == null ? Date.now() : nowMs;
    var nextId = 100;
    var entries = HORSES.map(function (name, i) {
      var jumpAt = i === 5 ? null : t0 + (i === 0 ? 11 : 40 + i * 55) * 60000;
      return {
        id: 1 + i, token: "demo-token-" + (i + 1), horse_name: name, horse_name_norm: name.toLowerCase().replace(/[^a-z0-9]/g, ""),
        horse_id: "demo-h" + (i + 1), sire: "Sample Sire " + (i + 1), dam: "Sample Dam " + (i + 1),
        note: i % 2 ? "" : "Fake note for " + name + ".", priority: PRIO[i % 3], priority_level: LEVEL[PRIO[i % 3]],
        dms_enabled: i === 0, jump_soon: i === 0, archived_at: i === 4 ? iso(t0 - 5 * 86400000) : null,
        created_at: iso(t0 - 20 * 86400000), updated_at: iso(t0 - 86400000), last_activity_at: iso(t0 - 86400000),
        bet_price: i === 1 ? 4.2 : null,
        next: jumpAt ? { state: "upcoming", meeting: MEETINGS[i % 3], race_no: 2 + i, jump_at: iso(jumpAt), event_id: "demo-ev-" + (i + 1), runner_no: 3 + i, barrier: 1 + i, field_size: 10, distance_m: 1200 + i * 200, track: "Good 4" } : null,
        last_result: { race_date: "2026-11-08", meeting: MEETINGS[(i + 1) % 3], position: (i % 4) + 1, field_size: 9 },
        price: { status: "coming_soon" }, model: { status: "coming_soon" }, model_sees_more: { status: "coming_soon" }
      };
    });
    function active() { return entries.filter(function (e) { return !e.archived_at; }); }
    function byId(id) { return entries.filter(function (e) { return String(e.id) === String(id); })[0]; }
    function clone(o) { return JSON.parse(JSON.stringify(o)); }
    function ok(data) { return { status: 200, data: Object.assign({ ok: true, serverNow: iso(Date.now()) }, data), auth: "" }; }
    function jumpKey(e) { return e.next ? [0, e.next.jump_at] : [1, ""]; }
    function sorted(rows, sort) {
      return rows.slice().sort(function (a, b) {
        if (sort === "priority") return b.priority_level - a.priority_level || a.horse_name.localeCompare(b.horse_name);
        var ka = jumpKey(a), kb = jumpKey(b);
        return ka[0] - kb[0] || (ka[1] < kb[1] ? -1 : ka[1] > kb[1] ? 1 : 0);
      });
    }

    function request(method, path, body) {
      var u = new URL(path, "https://demo.invalid");
      var p = u.pathname;
      var q = u.searchParams;
      var m;
      if (p === "/api/owner/blackbook" && method === "GET") {
        var rows = q.get("filter") === "archived" ? entries.filter(function (e) { return e.archived_at; }) : active();
        if (q.get("filter") === "today") rows = rows.filter(function (e) { return e.next; });
        if (/^(firming|drifting|model_sees_more)$/.test(q.get("filter") || "")) rows = [];
        if (/^(low|med|high)$/.test(q.get("priority") || "")) rows = rows.filter(function (e) { return e.priority === q.get("priority"); });
        var act = active();
        return ok({
          entries: clone(sorted(rows, q.get("sort"))),
          counts: { horses: act.length, runningToday: act.filter(function (e) { return e.next; }).length, archived: entries.length - act.length,
            byPriority: { low: act.filter(function (e) { return e.priority === "low"; }).length, med: act.filter(function (e) { return e.priority === "med"; }).length, high: act.filter(function (e) { return e.priority === "high"; }).length } },
          archived_count: entries.length - act.length, sort: q.get("sort") || "nextJump", coming_soon: ["firming", "drifting", "modelSeesMore", "priceMove"]
        });
      }
      if (p === "/api/owner/blackbook/upcoming" && method === "GET") {
        var a2 = active();
        return ok({ entries: clone(sorted(a2.filter(function (e) { return e.next; }), "nextJump")), noUpcoming: clone(a2.filter(function (e) { return !e.next; })) });
      }
      if (p === "/api/owner/blackbook/archived" && method === "GET") return ok({ entries: clone(entries.filter(function (e) { return e.archived_at; })) });
      if (p === "/api/owner/blackbook/search" && method === "GET") {
        var text = (q.get("q") || "").trim().toLowerCase();
        if (text.length < 3) return ok({ code: "short", min: 3, q: text, hits: [] });
        return ok({ code: "ok", q: text, hits: CATALOG.filter(function (n) { return n.toLowerCase().indexOf(text) >= 0; }).map(function (n, i) {
          var held = entries.filter(function (e) { return e.horse_name === n; })[0];
          return { token: "demo-cat-" + i, horse_name: n, horse_id: "demo-c" + i, sire: "Sample Sire", dam: "Sample Dam", last_start: "Demo Park, 1 Nov", inBlackBook: held ? (held.archived_at ? "archived" : held.priority) : null, entry_id: held ? held.id : null };
        }) });
      }
      if (p === "/api/owner/horse/races" && method === "GET") {
        return ok({ races: [1, 2, 3].map(function (n) { return { id: "demo-race-" + n, meeting: MEETINGS[n - 1], race_number: n, start_time: iso(t0 + n * 3600000) }; }) });
      }
      if (p === "/api/owner/blackbook/race-card" && method === "GET") {
        return ok({ race: { event_id: q.get("event_id"), meeting: "Demo Park", race_no: 4, name: "Fake Handicap", distance_m: 1400, track: "Good 4", jump_at: iso(t0 + 3600000) },
          runners: CATALOG.slice(0, 6).map(function (n, i) { var held = entries.filter(function (e) { return e.horse_name === n; })[0];
            return { no: i + 1, horseId: "demo-r" + i, horseName: n, barrier: i + 1, inBlackBook: held ? held.priority : null, entry_id: held ? held.id : null, trainerName: "Fake Trainer", price: 3 + i }; }) });
      }
      if (p === "/api/owner/blackbook/entries" && method === "POST") {
        var b = body || {};
        var name = String(b.display || b.query || "Demo Added Horse").trim();
        var pr = /^(low|med|high)$/.test(b.priority) ? b.priority : "low";
        var e = { id: nextId++, token: "demo-new-" + nextId, horse_name: name, horse_name_norm: name.toLowerCase(), horse_id: null, sire: null, dam: null, note: b.note || "",
          priority: pr, priority_level: LEVEL[pr], dms_enabled: !!b.dms_enabled, jump_soon: !!b.jump_soon, archived_at: null, created_at: iso(Date.now()), updated_at: iso(Date.now()), last_activity_at: iso(Date.now()),
          bet_price: b.betPrice || null, next: null, last_result: null, price: { status: "coming_soon" }, model: { status: "coming_soon" }, model_sees_more: { status: "coming_soon" } };
        entries.push(e);
        return { status: 200, data: { ok: true, code: "ok", entry: clone(e) }, auth: "" };
      }
      if ((m = /^\/api\/owner\/blackbook\/entries\/(\d+)(\/restore)?$/.exec(p))) {
        var en = byId(m[1]);
        if (!en) return { status: 404, data: { ok: false, code: "missing" }, auth: "" };
        if (m[2] && method === "POST") { en.archived_at = null; return ok({ entry: clone(en) }); }
        if (method === "GET") return ok({ entry: clone(en), recentRuns: [{ race_date: "2026-11-08", meeting: "Demo Park", distance_m: 1200, track: "Good 4", position: 2, field_size: 9, margin: "0.5L" }],
          alerts: { dms_enabled: en.dms_enabled, jump_soon: en.jump_soon, jump_soon_minutes: 15, tier_defaults: { status: "coming_soon" } } });
        if (method === "PATCH") {
          var d = body || {};
          if (d.priority) { en.priority = d.priority; en.priority_level = LEVEL[d.priority]; }
          if (typeof d.note === "string") en.note = d.note;
          if (d.betPrice != null) en.bet_price = d.betPrice;
          if (typeof d.dms_enabled === "boolean") en.dms_enabled = d.dms_enabled;
          if (typeof d.jump_soon === "boolean") en.jump_soon = d.jump_soon;
          return ok({ entry: clone(en) });
        }
        if (method === "DELETE") { entries.splice(entries.indexOf(en), 1); return ok({}); }
      }
      return { status: 404, data: { ok: false, error: "not_found" }, auth: "denied" };
    }
    return { request: request };
  }

  return { HORSES: HORSES, MEETINGS: MEETINGS, CATALOG: CATALOG, isDemoHost: isDemoHost, isDemoMode: isDemoMode, createBackend: createBackend };
});
