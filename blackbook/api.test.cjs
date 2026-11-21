"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const A = require("./api.js");

function store(init) {
  const d = Object.assign({}, init);
  return { d, getItem: (k) => (k in d ? d[k] : null), setItem: (k, v) => { d[k] = v; }, removeItem: (k) => { delete d[k]; } };
}
function fakeFetch(responses) {
  const calls = [];
  const f = async (url, init) => {
    calls.push({ url, init });
    const r = responses.shift();
    if (r instanceof Error) throw r;
    return { status: r.status, json: async () => { if (r.bad) throw new Error("bad json"); return r.body; } };
  };
  f.calls = calls;
  return f;
}

test("token: nd_owner_token wins, nd_models_owner_token is the fallback, clear removes both", () => {
  assert.equal(A.readToken(store({})), "");
  assert.equal(A.readToken(store({ nd_models_owner_token: "m" })), "m");
  assert.equal(A.readToken(store({ nd_models_owner_token: "m", nd_owner_token: "o" })), "o");
  const s = store({ nd_models_owner_token: "m", nd_owner_token: "o" });
  A.clearToken(s);
  assert.deepEqual(s.d, {});
  A.saveToken(s, "x");
  assert.deepEqual(s.d, { nd_owner_token: "x" });
});

test("the host is the TipBot onrender host and every path is under /api/owner", () => {
  assert.equal(A.API_BASE, "https://afl-tipster-bot.onrender.com");
  const all = [A.paths.list({}), A.paths.upcoming(), A.paths.archived(), A.paths.entry(3), A.paths.entries(), A.paths.restore(3), A.paths.search("ab c"), A.paths.raceCard("e 1"), A.paths.races()];
  for (const p of all) assert.ok(p.startsWith("/api/owner/"), p);
});

test("list path carries priority, filter and sort; 'all' priority is not sent", () => {
  assert.equal(A.paths.list({ priority: "all", sort: "nextJump" }), "/api/owner/blackbook?sort=nextJump");
  assert.equal(A.paths.list({ priority: "high", filter: "today", sort: "priority" }), "/api/owner/blackbook?priority=high&filter=today&sort=priority");
  assert.equal(A.paths.list({ filter: "archived" }), "/api/owner/blackbook?filter=archived&sort=nextJump");
  assert.equal(A.paths.search("a&b"), "/api/owner/blackbook/search?q=a%26b");
  assert.equal(A.paths.raceCard("x/y"), "/api/owner/blackbook/race-card?event_id=x%2Fy");
  assert.equal(A.paths.restore(7), "/api/owner/blackbook/entries/7/restore");
});

test("requests are Bearer only: Authorization header, no credentials, no cookies", async () => {
  const f = fakeFetch([{ status: 200, body: { ok: true } }]);
  const r = await A.request("GET", A.paths.upcoming(), undefined, { token: "tok", fetch: f });
  assert.equal(r.status, 200);
  const c = f.calls[0];
  assert.equal(c.url, "https://afl-tipster-bot.onrender.com/api/owner/blackbook/upcoming");
  assert.deepEqual(c.init.headers, { Authorization: "Bearer tok" });
  assert.equal(c.init.credentials, "omit");
  assert.equal(c.init.body, undefined);
});

test("writes send JSON with Content-Type, using POST, PATCH and DELETE", async () => {
  const f = fakeFetch([{ status: 200, body: {} }, { status: 200, body: {} }, { status: 200, body: {} }]);
  await A.request("POST", A.paths.entries(), { a: 1 }, { token: "t", fetch: f });
  await A.request("PATCH", A.paths.entry(4), { note: "n" }, { token: "t", fetch: f });
  await A.request("DELETE", A.paths.entry(4), undefined, { token: "t", fetch: f });
  assert.deepEqual(f.calls.map((c) => c.init.method), ["POST", "PATCH", "DELETE"]);
  assert.equal(f.calls[0].init.headers["Content-Type"], "application/json");
  assert.equal(f.calls[1].init.body, JSON.stringify({ note: "n" }));
  assert.equal(f.calls[2].init.headers["Content-Type"], undefined);
});

test("401 means sign in, 404 not_found means not the owner, other 404s are neither", async () => {
  assert.equal(A.classify(401, {}), "signin");
  assert.equal(A.classify(404, { ok: false, error: "not_found" }), "denied");
  assert.equal(A.classify(404, { ok: false, code: "missing" }), "");
  assert.equal(A.classify(200, { ok: true }), "");
  const f = fakeFetch([{ status: 401, body: { error: "unauthorised" } }]);
  assert.equal((await A.request("GET", "/x", undefined, { fetch: f })).auth, "signin");
});

test("GET retries once on 503 (cold start); writes never retry; network failure is status 0", async () => {
  const sleeps = [];
  const sleep = async (ms) => sleeps.push(ms);
  const f = fakeFetch([{ status: 503, body: {} }, { status: 200, body: { ok: true } }]);
  const r = await A.request("GET", "/x", undefined, { fetch: f, sleep });
  assert.equal(r.status, 200);
  assert.equal(f.calls.length, 2);
  assert.deepEqual(sleeps, [1200]);
  const f2 = fakeFetch([{ status: 503, body: {} }, { status: 200, body: {} }]);
  assert.equal((await A.request("POST", "/x", {}, { fetch: f2, sleep })).status, 503);
  assert.equal(f2.calls.length, 1);
  const f3 = fakeFetch([new Error("net"), new Error("net")]);
  assert.deepEqual(await A.request("GET", "/x", undefined, { fetch: f3, sleep }), { status: 0, data: {}, auth: "" });
});

test("a non-JSON body yields an empty object, not a throw", async () => {
  const f = fakeFetch([{ status: 500, bad: true }]);
  assert.deepEqual(await A.request("GET", "/x", undefined, { fetch: f }), { status: 500, data: {}, auth: "" });
});

test("add errors: 409 and 400 come back as data (not thrown) and each has its own message", async () => {
  const f = fakeFetch([{ status: 409, body: { ok: false, code: "duplicate" } }, { status: 409, body: { ok: false, code: "cap", limit: 50 } }, { status: 400, body: { ok: false, code: "invalid", field: "betPrice" } }]);
  const r1 = await A.request("POST", A.paths.entries(), {}, { token: "t", fetch: f });
  assert.deepEqual([r1.status, r1.auth, r1.data.code], [409, "", "duplicate"]);
  assert.equal((await A.request("POST", "/x", {}, { fetch: f })).data.limit, 50);
  assert.equal((await A.request("POST", "/x", {}, { fetch: f })).data.field, "betPrice");
  const m = A.describeAddError;
  assert.equal(m(409, { code: "duplicate" }), "This horse is already in your Black Book.");
  assert.equal(m(409, { code: "cap", limit: 50 }), "The Black Book is full (limit 50).");
  assert.equal(m(409, { code: "cap" }), "The Black Book is full.");
  assert.equal(m(200, { ok: false, code: "unconfirmed" }), "That horse could not be matched to a stored start.");
  assert.equal(m(503, { error: "db_busy", retry_after: 3 }), "Database unavailable.");
  assert.equal(m(503, { ok: false, error: "unavailable" }), "Database unavailable.");
  assert.equal(m(503, { error: "warming" }), "Database unavailable.");
  assert.equal(m(400, { code: "invalid", field: "betPrice" }), "Your price should be a decimal price such as 4.20.");
  assert.equal(m(400, { code: "invalid", field: "priority" }), "Pick Low, Med or High priority.");
  assert.equal(m(400, { code: "empty" }), "Enter a horse name first.");
  assert.equal(m(400, { code: "invalid" }), "That request was not valid. Check the fields and try again.");
  assert.equal(m(500, {}), "The horse was not added. Try again.");
  assert.equal(m(0, undefined), "The horse was not added. Try again.");
});

test("edit and restore errors", () => {
  const m = A.describeEditError;
  assert.equal(m(409, { code: "cap" }, "restore"), "The Black Book is full.");
  assert.equal(m(400, { code: "invalid", field: "betPrice" }), "Your price should be a decimal price such as 4.20.");
  assert.equal(m(404, { ok: false, code: "missing" }), "That horse is no longer in your Black Book.");
  assert.equal(m(500, {}, "restore"), "Not restored. Try again.");
  assert.equal(m(500, {}), "Not saved. Try again.");
});

test("loginUrl sends the owner to TipBot /auth/login with an allowlisted return_to", () => {
  const canon = "https://www.neilldata.com/blackbook/";
  assert.equal(A.returnToUrl(), canon);
  assert.equal(A.returnToUrl("https://evil.example"), canon);
  assert.equal(A.returnToUrl("https://www.neilldata.com"), canon);
  assert.equal(A.returnToUrl("https://www.neilldata.com/"), canon);
  assert.equal(A.returnToUrl("https://neilldata.com"), "https://neilldata.com/blackbook/");
  assert.equal(A.returnToUrl("https://toxieon.github.io"), canon);
  const url = A.loginUrl("https://www.neilldata.com");
  assert.equal(url, A.API_BASE + "/auth/login?return_to=" + encodeURIComponent(canon));
  assert.equal(A.API_BASE, "https://afl-tipster-bot.onrender.com");
  assert.doesNotMatch(url, /#t=|#token=|#code=/);
});

test("exchangeAndStore POSTs the one-time code and stores a 200 token; 400/401 store nothing", async () => {
  const TOKEN = "a".repeat(32);
  const CODE = "c".repeat(24);
  const calls = [];
  const store = (d) => ({ d, getItem(k) { return this.d[k]; }, setItem(k, v) { this.d[k] = v; }, removeItem(k) { delete this.d[k]; } });

  const okFetch = async (url, opts) => {
    calls.push({ url, opts });
    return { status: 200, json: async () => ({ token: TOKEN }) };
  };
  const s1 = store({});
  const r1 = await A.exchangeAndStore(CODE, s1, { fetch: okFetch });
  assert.deepEqual(r1, { ok: true, status: 200 });
  assert.equal(s1.d.nd_owner_token, TOKEN);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, A.API_BASE + "/api/auth/exchange");
  assert.equal(calls[0].opts.method, "POST");
  assert.equal(calls[0].opts.credentials, "omit");
  assert.equal(calls[0].opts.headers["Content-Type"], "application/json");
  assert.equal(calls[0].opts.body, JSON.stringify({ code: CODE }));
  assert.ok(!Object.prototype.hasOwnProperty.call(calls[0].opts.headers, "Authorization"));

  for (const status of [400, 401]) {
    const s = store({});
    const f = async () => ({ status, json: async () => ({ error: "unauthorised" }) });
    const r = await A.exchangeAndStore(CODE, s, { fetch: f });
    assert.deepEqual(r, { ok: false, status });
    assert.deepEqual(s.d, {});
  }

  const s3 = store({});
  const f3 = async () => ({ status: 200, json: async () => ({}) });
  const r3 = await A.exchangeAndStore(CODE, s3, { fetch: f3 });
  assert.deepEqual(r3, { ok: false, status: 200 });
  assert.deepEqual(s3.d, {});
});
