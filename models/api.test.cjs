"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const A = require("./api.js");

test("buildModelStatsUrl includes staked_only and fixed from for staked fetch", () => {
  const url = A.buildModelStatsUrl("https://afl-tipster-bot.onrender.com", "2026-11-12", "2026-11-19", {
    stakedOnly: true,
  });
  assert.match(url, /^https:\/\/afl-tipster-bot\.onrender\.com\/api\/owner\/model-stats\?/);
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
  assert.match(A.describeAuthError("not_authorised"), /owner only/);
  assert.match(A.describeAuthError("rate_limited"), /Too many/);
  assert.match(A.describeAuthError("region_declined"), /region/);
  for (const c of ["bad_state", "login_failed", "whatever"]) assert.equal(A.describeAuthError(c), "Sign-in did not complete. Try again.");
  assert.equal(A.describeAuthError(""), "");
});
