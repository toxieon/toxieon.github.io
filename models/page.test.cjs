"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const dir = __dirname;
const root = path.join(dir, "..");
const read = (f) => fs.readFileSync(path.join(dir, f), "utf8");
const HTML = read("index.html");
const VERSION = read("VERSION").trim();
const esc = (v) => v.replace(/\./g, "\\.");

test("versions agree: VERSION, APP_VERSION, every ?v= query, sw cache, newest changelog entry", () => {
  assert.match(VERSION, /^\d+\.\d+\.\d+$/);
  assert.match(read("app.js"), new RegExp('const APP_VERSION = "' + esc(VERSION) + '"'));
  const queries = [...HTML.matchAll(/\?v=([\d.]+)/g)].map((m) => m[1]);
  assert.ok(queries.length >= 9);
  assert.ok(queries.every((q) => q === VERSION), queries.join());
  assert.match(read("sw.js"), new RegExp('CACHE_VERSION = "models-' + esc(VERSION) + '"'));
  const swQueries = [...read("sw.js").matchAll(/\?v=([\d.]+)/g)].map((m) => m[1]);
  assert.ok(swQueries.every((q) => q === VERSION), swQueries.join());
  const firstEntry = /^## (\d+\.\d+\.\d+) · /m.exec(read("CHANGELOG.md"));
  assert.equal(firstEntry[1], VERSION);
});

test("private page: noindex, CSP connect-src only the TipBot host, robots Disallow, not in sitemap or apps.json, .nd-private", () => {
  assert.match(HTML, /<meta name="robots" content="noindex,nofollow" \/>/);
  const csp = /Content-Security-Policy" content="([^"]+)"/.exec(HTML)[1];
  assert.match(csp, /connect-src 'self' https:\/\/afl-tipster-bot\.onrender\.com;/);
  assert.match(csp, /script-src 'self';/);
  assert.doesNotMatch(csp, /unsafe-eval|script-src[^;]*unsafe-inline/);
  assert.match(fs.readFileSync(path.join(root, "robots.txt"), "utf8"), /^Disallow: \/models\/$/m);
  assert.doesNotMatch(fs.readFileSync(path.join(root, "sitemap.xml"), "utf8"), /\/models\//i);
  assert.ok(fs.existsSync(path.join(dir, ".nd-private")));
  assert.doesNotMatch(fs.readFileSync(path.join(root, "hub/apps.json"), "utf8"), /\/models\/|tipbot-models/i);
});

test("handoff.js is the first script in <head>", () => {
  const scripts = [...HTML.matchAll(/<script src="([^"?]+)/g)].map((m) => m[1]);
  assert.equal(scripts[0], "handoff.js");
});

test("signed-out gate is Discord only: no paste-a-token form, the button goes to TipBot /auth/login", () => {
  assert.doesNotMatch(HTML, /<input[^>]*token|<form|Paste|Bearer token|Save token/i);
  const gate = /<section id="auth-gate"[\s\S]*?<\/section>/.exec(HTML)[0];
  assert.match(gate, /Sign in with Discord/);
  assert.match(gate, /href="https:\/\/afl-tipster-bot\.onrender\.com\/auth\/login\?return_to=https%3A%2F%2Fwww\.neilldata\.com%2Fmodels%2F"/);
  assert.doesNotMatch(gate, /<svg|<table|chart|skeleton|\d+\.\d+ ?u/i);
  assert.match(HTML, /<main id="app-main" hidden>/);
  assert.doesNotMatch(read("app.js"), /saveTokenFromGate|token-input|auth-form/);
});

test("the code is exchanged once via api.js; fetches omit credentials; demo is localhost-only and never stored", () => {
  const app = read("app.js");
  assert.match(app, /takePendingCode\(\)/);
  assert.match(app, /API\.exchangeAndStore\(code, localStorage\)/);
  assert.doesNotMatch(read("handoff.js"), /\bfetch\s*\(|XMLHttpRequest/);
  for (const f of ["app.js", "api.js"]) assert.doesNotMatch(read(f), /credentials:\s*["']include["']/);
  assert.match(read("api.js"), /credentials: "omit"/);
  assert.doesNotMatch(app, /\bfetch\s*\(/, "app.js fetches only through api.js");
  assert.doesNotMatch(app, /setToken\("demo-local"\)/);
  assert.doesNotMatch(app + read("api.js") + read("handoff.js"), /document\.cookie|sessionStorage/);
  const demo = read("demo.js");
  assert.match(demo, /localhost/);
  assert.doesNotMatch(demo, /neilldata\.com|github\.io/);
});

test("threshold tab is live: by_threshold bands plus by_min_threshold; Stake size stays on by_stake_bracket", () => {
  assert.match(HTML, /data-break-tab="stake_bracket"[^>]*>Stake size</);
  assert.match(HTML, /data-break-tab="threshold"[^>]*>Threshold</);
  assert.match(HTML, /data-thresh-mode="bands"/);
  assert.match(HTML, /data-thresh-mode="min"/);
  assert.doesNotMatch(HTML, /Threshold · soon|tab-pending|disabled aria-disabled/);
  assert.doesNotMatch(read("config.js"), /THRESHOLD_BREAKDOWN_FIELD/);
  const app = read("app.js");
  assert.match(app, /"by_threshold"/);
  assert.match(app, /"by_min_threshold"/);
  assert.match(app, /"by_stake_bracket"/);
});

test("calendar uses the top-level calendar[] with a daily join fallback", () => {
  assert.match(read("app.js"), /CAL\.calendarDays\(state\.data\)/);
});

test("401 bounces through Discord (guarded), 403 keeps the token, 503 not_configured keeps the session; no /api/auth/refresh", () => {
  const app = read("app.js");
  assert.doesNotMatch(app + read("api.js"), /auth\/refresh/);
  assert.match(app, /case "signin":\s*handleUnauthorised\(\)/);
  assert.match(app, /case "forbidden":\s*handleForbidden\(\)/);
  assert.match(app, /case "not_configured":\s*return \{ ok: false, notConfigured: true \}/);
  const forbidden = /function handleForbidden\(\) \{[\s\S]*?\n  \}/.exec(app)[0];
  assert.doesNotMatch(forbidden, /setToken|clearToken|location/);
  const unauth = /function handleUnauthorised\(\) \{[\s\S]*?\n  \}/.exec(app)[0];
  assert.match(unauth, /REAUTH_GAP_MS/);
  assert.match(unauth, /location\.assign\(API\.loginUrl/);
});

test("copy is for horse-server members, never shows server ids or names, and recent picks are not owner-gated", () => {
  assert.doesNotMatch(HTML, /owner only/i);
  assert.match(HTML, /horse server/);
  assert.doesNotMatch(read("app.js"), /\.scope\b/);
  assert.match(HTML, /id="recent-model"/);
});
