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

test("HorsePicks AI Hybrid is a lazy signed-in tab and does not change existing sections", () => {
  assert.match(HTML, /data-page-tab="models"/);
  assert.match(HTML, /data-page-tab="hybrid"[^>]*>HorsePicks AI Hybrid</);
  assert.match(HTML, /id="hybrid-view"/);
  assert.match(HTML, /id="models-view"/);
  assert.match(HTML, /<script src="hybrid.js\?v=/);
  const app = read("app.js");
  assert.match(app, /API\.buildHybridPicksUrl/);
  assert.match(app, /HY\.adaptHybridPayload/);
  assert.match(app, /HY\.computeHybridTotals/);
  assert.match(app, /HorsePicks AI Hybrid not available yet/);
  const start = /function startSignedIn\(\) \{[\s\S]*?\n  \}/.exec(app)[0];
  assert.match(start, /loadBestPicks\(\)/);
  assert.match(start, /applyAllTime\(\)/);
  assert.doesNotMatch(start, /loadHybridPicks\(\)/, "hybrid is not fetched on page load");
  assert.match(app, /function setPageTab\(/);
  assert.match(app, /function loadHybridPicks\(/);
  const setTab = /function setPageTab\([\s\S]*?\n  \}/.exec(app)[0];
  assert.match(setTab, /loadHybridPicks\(\)/);
  assert.match(read("sw.js"), /hybrid\.js\?v=/);
  assert.match(HTML, /id="bestpick-section"/);
  assert.match(HTML, /id="ladder-section"/);
});

test("hybrid range starts 3 Nov 2026; include=all is only for HorsePicks AI comparison; tip price is labelled", () => {
  assert.match(read("config.js"), /HYBRID_PICKS_FROM:\s*"2026-11-03"/);
  const app = read("app.js");
  assert.match(app, /CFG\.HYBRID_PICKS_FROM/);
  const load = /async function loadHybridPicks\(\) \{[\s\S]*?\n  \}/.exec(app)[0];
  assert.doesNotMatch(load, /includeAll/);
  const compare = /async function loadHybridCompare\(\) \{[\s\S]*?\n  \}/.exec(app)[0];
  assert.match(compare, /includeAll:\s*true/);
  assert.match(compare, /API\.requestHybridPicks/);
  assert.match(read("bestpick.js"), /tip price/);
  assert.match(read("bestpick.js"), /\^tip\$/);
});

test("hybrid load uses requestHybridPicks, always clears the spinner, and shows Retry plus specific errors", () => {
  const app = read("app.js");
  const load = /async function loadHybridPicks\(\) \{[\s\S]*?\n  \}/.exec(app)[0];
  assert.match(load, /API\.requestHybridPicks/);
  assert.doesNotMatch(load, /API\.requestModelStats/);
  assert.match(load, /try \{/);
  assert.match(load, /catch \(err\)/);
  assert.match(load, /finally/);
  assert.match(load, /state\.hy\.loading = false/);
  assert.match(load, /API\.describeHybridError/);
  assert.doesNotMatch(app + read("api.js"), /AbortSignal\.timeout\s*\(/);
  assert.match(HTML, /id="hy-retry"/);
  assert.match(HTML, />Retry</);
  assert.match(HTML, /id="hy-signin"/);
  assert.match(app, /Server busy, try again in a minute|describeHybridError/);
});

test("hybrid compare dropdown persists in localStorage and shows comparison totals", () => {
  const html = HTML;
  assert.match(html, /id="hy-compare"/);
  assert.match(html, /<option value="none" selected>None</);
  assert.match(html, /<option value="with_price">With</);
  assert.match(html, /<option value="without_price">Without</);
  assert.match(html, /<option value="agree">Agree</);
  assert.match(html, /<option value="horsepicks">HorsePicks AI</);
  const app = read("app.js");
  assert.match(app, /HY\.readCompareChoice\(localStorage\)/);
  assert.match(app, /HY\.writeCompareChoice\(localStorage/);
  assert.match(app, /function loadHybridCompare\(/);
  assert.match(app, /HY\.adaptModelStatsCompare/);
  assert.match(app, /includeOmitted:\s*true/);
  assert.match(app, /hy-cmp-pl/);
  assert.match(app, /hy-totals-groups/);
  const compare = /async function loadHybridCompare\(\) \{[\s\S]*?\n  \}/.exec(app)[0];
  assert.match(compare, /API\.buildModelStatsUrl/);
  assert.match(compare, /API\.requestHybridPicks/);
  assert.match(compare, /try \{/);
  assert.match(compare, /finally/);
  const load = /async function loadHybridPicks\(\) \{[\s\S]*?\n  \}/.exec(app)[0];
  assert.match(load, /await loadHybridCompare\(\)/);
});

test("main model-stats calendar still stacks With, Without and Agree per day", () => {
  const app = read("app.js");
  const cal = /function renderCalendar\(\) \{[\s\S]*?\n  \}/.exec(app)[0];
  assert.match(cal, /cal-models/);
  assert.match(cal, /CFG\.MODELS\.forEach/);
  assert.match(cal, /cal-mini/);
  assert.doesNotMatch(cal, /hy-cmp-pl/);
  const bp = /function renderBpCalendar\(\) \{[\s\S]*?\n  \}/.exec(app)[0];
  assert.match(bp, /bp-horse/);
  assert.doesNotMatch(bp, /hy-cmp-pl/);
});
test("stacked calendar sits after the summary and before best-pick, and renders a cal-mini row per model", () => {
  const modelsView = /id="models-view"[\s\S]*?id="hybrid-view"/.exec(HTML)[0];
  const staked = modelsView.indexOf('id="staked-section"');
  const dash = modelsView.indexOf('id="dashboard"');
  const summary = modelsView.indexOf('id="summary-cards"');
  const cal = modelsView.indexOf('id="cal-grid"');
  const bpSec = modelsView.indexOf('id="bestpick-section"');
  const bp = modelsView.indexOf('id="bp-grid"');
  const ladder = modelsView.indexOf('id="ladder-section"');
  const rest = modelsView.indexOf('id="dashboard-rest"');
  assert.ok(staked > -1 && dash > staked, "dashboard follows the staked section");
  assert.ok(summary > dash && cal > summary, "stacked calendar follows the summary cards");
  assert.ok(bpSec > cal && bp > bpSec, "best-pick calendar stays its own section after the stacked calendar");
  assert.ok(ladder > bp && rest > ladder, "ladder stays after best-pick; remaining stats follow");
  assert.match(HTML, /aria-label="Daily model comparison"/);
  const app = read("app.js");
  const fn = /function renderCalendar\(\) \{[\s\S]*?\n  \}/.exec(app)[0];
  assert.match(fn, /models\.className = "cal-models"/);
  assert.match(fn, /CFG\.MODELS\.forEach\(\(id\) => \{/);
  assert.match(fn, /row\.className = "cal-mini"/);
  assert.match(read("config.js"), /MODELS:\s*\["with_price",\s*"without_price",\s*"agree"\]/);
});
