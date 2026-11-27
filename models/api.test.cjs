"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const A = require("./api.js");

test("buildModelStatsUrl includes staked_only and fixed from for staked fetch", () => {
  const url = A.buildModelStatsUrl("https://afl-tipster-bot.onrender.com", "2026-11-12", "2026-11-19", {
    stakedOnly: true,
  });
  assert.match(url, /^https:\/\/afl-tipster-bot\.onrender\.com\/api\/model-stats\?/);
  assert.doesNotMatch(url, /\/api\/owner\//);
  const q = new URL(url).searchParams;
  assert.equal(q.get("from"), "2026-11-12");
  assert.equal(q.get("to"), "2026-11-19");
  assert.equal(q.get("staked_only"), "1");
});

test("buildModelStatsUrl omits staked_only by default", () => {
  const url = A.buildModelStatsUrl("https://example.com/", "2026-01-01", "2026-01-31");
  const q = new URL(url).searchParams;
  assert.equal(q.get("staked_only"), null);
});

test("buildModelStatsUrl passes from=all for all-time range", () => {
  const url = A.buildModelStatsUrl("https://example.com", "all", "2026-11-19");
  assert.equal(new URL(url).searchParams.get("from"), "all");
  assert.equal(new URL(url).searchParams.get("to"), "2026-11-19");
  assert.equal(new URL(url).searchParams.get("staked_only"), null);
});
test("buildModelStatsUrl adds include_reconstructed only when requested", () => {
  const off = A.buildModelStatsUrl("https://example.com", "all", "2026-11-18");
  assert.equal(new URL(off).searchParams.get("include_reconstructed"), null);
  const on = A.buildModelStatsUrl("https://example.com", "all", "2026-11-18", {
    includeReconstructed: true,
  });
  assert.equal(new URL(on).searchParams.get("include_reconstructed"), "1");
  const staked = A.buildModelStatsUrl("https://example.com", "2026-11-12", "2026-11-18", {
    stakedOnly: true,
    includeReconstructed: true,
  });
  const q = new URL(staked).searchParams;
  assert.equal(q.get("staked_only"), "1");
  assert.equal(q.get("include_reconstructed"), "1");
});

test("boolean flags are sent as 1 and omitted when off", () => {
  const off = new URL(A.buildModelStatsUrl("https://example.com", "all", "2026-11-18")).searchParams;
  assert.equal(off.get("staked_only"), null);
  assert.equal(off.get("include_reconstructed"), null);
  const on = new URL(A.buildModelStatsUrl("https://example.com", "all", "2026-11-18", {
    stakedOnly: true,
    includeReconstructed: true,
  })).searchParams;
  assert.equal(on.get("staked_only"), "1");
  assert.equal(on.get("include_reconstructed"), "1");
  assert.notEqual(on.get("staked_only"), "true");
  assert.notEqual(on.get("include_reconstructed"), "true");
});

test("describeApiError explains a 400 bad_flag body", () => {
  const msg = A.describeApiError(400, { ok: false, error: "bad_flag" });
  assert.match(msg, /bad_flag/);
  assert.match(msg, /only sends 1/);
  assert.match(A.describeApiError(400, { ok: false, error: "bad_date" }), /bad_date/);
  assert.match(A.describeApiError(404, {}), /404/);
});

test("loginUrl sends the owner to TipBot /auth/login with an allowlisted return_to", () => {
  const canon = "https://www.neilldata.com/models/";
  assert.equal(A.returnToUrl(), canon);
  assert.equal(A.returnToUrl("https://evil.example"), canon);
  assert.equal(A.returnToUrl("https://www.neilldata.com"), canon);
  assert.equal(A.returnToUrl("https://www.neilldata.com/"), canon);
  assert.equal(A.returnToUrl("https://neilldata.com"), "https://neilldata.com/models/");
  assert.equal(A.returnToUrl("https://toxieon.github.io"), canon);
  assert.equal(A.loginUrl("https://www.neilldata.com"),
    "https://afl-tipster-bot.onrender.com/auth/login?return_to=" + encodeURIComponent(canon));
  assert.equal(A.API_BASE, "https://afl-tipster-bot.onrender.com");
});

const mkStore = (d) => ({ d, getItem(k) { return this.d[k]; }, setItem(k, v) { this.d[k] = v; }, removeItem(k) { delete this.d[k]; } });

test("exchangeAndStore POSTs {code} with credentials omitted and stores a 200 token under nd_models_owner_token", async () => {
  const TOKEN = "a".repeat(32);
  const CODE = "c".repeat(24);
  const calls = [];
  const s1 = mkStore({});
  const r1 = await A.exchangeAndStore(CODE, s1, { fetch: async (url, opts) => { calls.push({ url, opts }); return { status: 200, json: async () => ({ token: TOKEN }) }; } });
  assert.deepEqual(r1, { ok: true, status: 200 });
  assert.deepEqual(s1.d, { nd_models_owner_token: TOKEN });
  assert.equal(calls[0].url, "https://afl-tipster-bot.onrender.com/api/auth/exchange");
  assert.equal(calls[0].opts.method, "POST");
  assert.equal(calls[0].opts.credentials, "omit");
  assert.equal(calls[0].opts.body, JSON.stringify({ code: CODE }));
  assert.ok(!("Authorization" in calls[0].opts.headers));

  for (const status of [400, 401]) {
    const s = mkStore({});
    const r = await A.exchangeAndStore(CODE, s, { fetch: async () => ({ status, json: async () => ({ error: "invalid_code" }) }) });
    assert.deepEqual(r, { ok: false, status });
    assert.deepEqual(s.d, {});
  }
  const s3 = mkStore({});
  assert.deepEqual(await A.exchangeAndStore(CODE, s3, { fetch: async () => ({ status: 200, json: async () => ({}) }) }), { ok: false, status: 200 });
  assert.deepEqual(s3.d, {});
  const s4 = mkStore({});
  assert.deepEqual(await A.exchangeAndStore(CODE, s4, { fetch: async () => { throw new Error("offline"); } }), { ok: false, status: 0 });
});

test("readToken prefers the Models key, falls back to the shared TipBot key; clearToken clears both", () => {
  assert.equal(A.readToken(mkStore({ nd_models_owner_token: "m", nd_owner_token: "b" })), "m");
  assert.equal(A.readToken(mkStore({ nd_owner_token: "b" })), "b");
  assert.equal(A.readToken(mkStore({})), "");
  const s = mkStore({ nd_models_owner_token: "m", nd_owner_token: "b", other: "x" });
  A.clearToken(s);
  assert.deepEqual(s.d, { other: "x" });
  const w = mkStore({});
  A.saveToken(w, "t".repeat(20));
  assert.deepEqual(w.d, { nd_models_owner_token: "t".repeat(20) });
});

test("describeAuthError maps TipBot #error= codes", () => {
  assert.match(A.describeAuthError("not_authorised"), /isn't allowed/);
  assert.match(A.describeAuthError("rate_limited"), /Too many/);
  assert.match(A.describeAuthError("region_declined"), /region/);
  for (const c of ["bad_state", "login_failed", "whatever"]) assert.equal(A.describeAuthError(c), "Sign-in did not complete. Try again.");
  assert.equal(A.describeAuthError(""), "");
});

test("stats go to the horse-server route /api/model-stats, not the owner route", () => {
  assert.equal(A.STATS_PATH, "/api/model-stats");
  const u = new URL(A.buildModelStatsUrl(A.API_BASE, "all", "2026-11-22"));
  assert.equal(u.origin + u.pathname, "https://afl-tipster-bot.onrender.com/api/model-stats");
});

test("classifyStats separates 401, 403, 503 not_configured, 503 unavailable, 404, 429 and 400", () => {
  const c = A.classifyStats;
  assert.equal(c(200, {}), "ok");
  assert.equal(c(401, { ok: false, error: "unauthorised" }), "signin");
  assert.equal(c(403, { ok: false, error: "forbidden" }), "forbidden");
  assert.equal(c(503, { ok: false, error: "not_configured" }), "not_configured");
  assert.equal(c(503, { ok: false, error: "unavailable" }), "unavailable");
  assert.equal(c(502, {}), "unavailable");
  assert.equal(c(404, { error: "not_found" }), "not_live");
  assert.equal(c(429, { error: "rate_limited" }), "rate_limited");
  assert.equal(c(400, { ok: false, error: "bad_flag" }), "bad_request");
  assert.equal(c(500, {}), "error");
});

function fakeFetch(seq) {
  const calls = [];
  const f = async (url, opts) => {
    calls.push({ url, opts });
    const next = seq[Math.min(calls.length - 1, seq.length - 1)];
    return { status: next.status, json: async () => next.body };
  };
  f.calls = calls;
  return f;
}
const noSleep = async () => {};

test("requestModelStats sends Bearer only with credentials omitted and caches a 200 for 2 minutes", async () => {
  A.clearStatsCache();
  const f = fakeFetch([{ status: 200, body: { scope: "server", models: {} } }]);
  let t = 1000;
  const now = () => t;
  const url = A.buildModelStatsUrl(A.API_BASE, "all", "2026-11-22");
  const r1 = await A.requestModelStats(url, "tok-1234567890abcdef", { fetch: f, sleep: noSleep, now });
  assert.equal(r1.kind, "ok");
  assert.equal(r1.cached, false);
  assert.equal(f.calls[0].opts.method, "GET");
  assert.equal(f.calls[0].opts.credentials, "omit");
  assert.deepEqual(f.calls[0].opts.headers, { Authorization: "Bearer tok-1234567890abcdef" });
  t += 60000;
  const r2 = await A.requestModelStats(url, "tok-1234567890abcdef", { fetch: f, sleep: noSleep, now });
  assert.equal(r2.cached, true);
  assert.equal(f.calls.length, 1, "no second request inside 2 minutes");
  t += A.CACHE_TTL_MS;
  await A.requestModelStats(url, "tok-1234567890abcdef", { fetch: f, sleep: noSleep, now });
  assert.equal(f.calls.length, 2, "refetch after 2 minutes");
  assert.ok(A.CACHE_TTL_MS >= 120000);
});

test("requestModelStats does not cache errors; 401/403/503 not_configured are returned once without retry", async () => {
  for (const [status, error, kind] of [[401, "unauthorised", "signin"], [403, "forbidden", "forbidden"], [503, "not_configured", "not_configured"]]) {
    A.clearStatsCache();
    const f = fakeFetch([{ status, body: { ok: false, error } }]);
    const r = await A.requestModelStats("https://x.invalid/api/model-stats?from=all&to=2026-11-22", "t".repeat(20), { fetch: f, sleep: noSleep });
    assert.equal(r.kind, kind);
    assert.equal(f.calls.length, 1);
    await A.requestModelStats("https://x.invalid/api/model-stats?from=all&to=2026-11-22", "t".repeat(20), { fetch: f, sleep: noSleep });
    assert.equal(f.calls.length, 2, "errors are not cached");
  }
});

test("requestModelStats retries once on 503 unavailable, then reports it", async () => {
  A.clearStatsCache();
  const f = fakeFetch([{ status: 503, body: { ok: false, error: "unavailable" } }, { status: 503, body: { ok: false, error: "unavailable" } }]);
  const r = await A.requestModelStats("https://x.invalid/a", "t".repeat(20), { fetch: f, sleep: noSleep });
  assert.equal(r.kind, "unavailable");
  assert.equal(f.calls.length, 2);
  A.clearStatsCache();
  const g = fakeFetch([{ status: 503, body: { ok: false, error: "unavailable" } }, { status: 200, body: {} }]);
  assert.equal((await A.requestModelStats("https://x.invalid/b", "t".repeat(20), { fetch: g, sleep: noSleep })).kind, "ok");
});

test("clearPrimaryToken drops only the Models key (403 sign-in-again keeps a shared Black Book token)", () => {
  const s = mkStore({ nd_models_owner_token: "m", nd_owner_token: "b" });
  A.clearPrimaryToken(s);
  assert.deepEqual(s.d, { nd_owner_token: "b" });
});

test("503 db_busy waits retry_after seconds (capped at 15) before the one retry; other 503s keep 1.5 s", async () => {
  const waits = [];
  const sleep = async (ms) => { waits.push(ms); };
  for (const [body, want] of [
    [{ ok: false, error: "db_busy", retry_after: 3 }, 3000],
    [{ ok: false, error: "db_busy", retry_after: 90 }, 15000],
    [{ ok: false, error: "db_busy" }, 1500],
    [{ ok: false, error: "unavailable", retry_after: 5 }, 1500],
  ]) {
    A.clearStatsCache();
    waits.length = 0;
    const f = fakeFetch([{ status: 503, body }, { status: 200, body: {} }]);
    const r = await A.requestModelStats("https://x.invalid/c", "t".repeat(20), { fetch: f, sleep });
    assert.equal(r.kind, "ok");
    assert.equal(f.calls.length, 2);
    assert.deepEqual(waits, [want]);
  }
  assert.equal(A.classifyStats(503, { ok: false, error: "db_busy", retry_after: 3 }), "unavailable");
});

test("buildBestPicksUrl hits /api/model-stats/best-picks with from and to only", () => {
  assert.equal(
    A.buildBestPicksUrl("https://afl-tipster-bot.onrender.com/", "2026-11-04", "2026-11-26"),
    "https://afl-tipster-bot.onrender.com/api/model-stats/best-picks?from=2026-11-04&to=2026-11-26"
  );
});

test("buildHybridPicksUrl hits /api/model-stats/hybrid-picks; omitted from means all history; never sends include=all", () => {
  assert.equal(
    A.buildHybridPicksUrl("https://afl-tipster-bot.onrender.com/", "2026-11-03", "2026-11-27"),
    "https://afl-tipster-bot.onrender.com/api/model-stats/hybrid-picks?from=2026-11-03&to=2026-11-27"
  );
  assert.equal(
    A.buildHybridPicksUrl("https://afl-tipster-bot.onrender.com/", "", "2026-11-27"),
    "https://afl-tipster-bot.onrender.com/api/model-stats/hybrid-picks?to=2026-11-27"
  );
  assert.equal(
    A.buildHybridPicksUrl("https://afl-tipster-bot.onrender.com/"),
    "https://afl-tipster-bot.onrender.com/api/model-stats/hybrid-picks"
  );
  assert.equal(A.HYBRID_PICKS_PATH, "/api/model-stats/hybrid-picks");
  const u = A.buildHybridPicksUrl(A.API_BASE, "2026-11-03", "2026-11-27");
  assert.equal(new URL(u).searchParams.get("include"), null);
});
