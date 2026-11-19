"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const dir = __dirname;
const root = path.join(dir, "..");
const read = (f) => fs.readFileSync(path.join(dir, f), "utf8");
const HTML = read("index.html");
const FILES = ["index.html", "app.js", "api.js", "dates.js", "format.js", "demo.js", "handoff.js", "styles.css", "favicon.svg", "CHANGELOG.md", "VERSIONING.md"];
const ALL = FILES.map(read).join("\n");
const VERSION = read("VERSION").trim();

test("versions agree: VERSION, APP_VERSION, data-version, every ?v= query, newest changelog entry", () => {
  assert.match(VERSION, /^\d+\.\d+\.\d+$/);
  assert.match(read("app.js"), new RegExp('var APP_VERSION = "' + VERSION.replace(/\./g, "\\.") + '"'));
  assert.match(HTML, new RegExp('data-version="' + VERSION.replace(/\./g, "\\.") + '"'));
  const queries = [...HTML.matchAll(/\?v=([\d.]+)/g)].map((m) => m[1]);
  assert.ok(queries.length >= 7);
  assert.ok(queries.every((q) => q === VERSION), queries.join());
  assert.match(read("CHANGELOG.md"), new RegExp("^## " + VERSION.replace(/\./g, "\\.") + " · ", "m"));
});

test("private page: noindex, own CSP limited to the TipBot host, robots Disallow, not in the sitemap, .nd-private", () => {
  assert.match(HTML, /<meta name="robots" content="noindex,nofollow">/);
  const csp = /Content-Security-Policy" content="([^"]+)"/.exec(HTML)[1];
  assert.match(csp, /connect-src 'self' https:\/\/afl-tipster-bot\.onrender\.com;/);
  assert.match(csp, /script-src 'self';/);
  assert.match(csp, /img-src 'self' data: https:\/\/cdn\.prod\.pricekinetics\.com;/);
  assert.doesNotMatch(csp, /unsafe-eval|script-src[^;]*unsafe-inline/);
  assert.match(fs.readFileSync(path.join(root, "robots.txt"), "utf8"), /^Disallow: \/blackbook\/$/m);
  assert.doesNotMatch(fs.readFileSync(path.join(root, "sitemap.xml"), "utf8"), /blackbook/i);
  assert.ok(fs.existsSync(path.join(dir, ".nd-private")));
  assert.doesNotMatch(fs.readFileSync(path.join(root, "hub/apps.json"), "utf8"), /blackbook|black-book/i);
});

test("handoff.js loads first so the token fragment is stripped before anything else runs", () => {
  const scripts = [...HTML.matchAll(/<script src="([^"?]+)/g)].map((m) => m[1]);
  assert.equal(scripts[0], "handoff.js");
  assert.deepEqual(scripts.slice().sort(), ["api.js", "app.js", "dates.js", "demo.js", "format.js", "handoff.js"]);
});

test("the only network call is api.js's fetch, to the TipBot host, Bearer only", () => {
  const code = ["app.js", "dates.js", "format.js", "demo.js", "handoff.js"].map(read).join("\n");
  assert.doesNotMatch(code, /\bfetch\s*\(|XMLHttpRequest|sendBeacon|WebSocket|EventSource/);
  assert.doesNotMatch(read("api.js"), /credentials:\s*["']include["']/);
  assert.match(read("api.js"), /credentials: "omit"/);
  const hosts = new Set([...ALL.matchAll(/https?:\/\/([a-z0-9.-]+)/gi)].map((m) => m[1]));
  for (const h of hosts) assert.ok(["afl-tipster-bot.onrender.com", "www.w3.org", "demo.invalid", "cdn.prod.pricekinetics.com"].includes(h), "unexpected host " + h);
});

test("storage: only the owner token keys, in localStorage; no betting data is persisted or cached", () => {
  const code = read("app.js") + read("api.js") + read("handoff.js");
  assert.doesNotMatch(code, /sessionStorage|indexedDB|caches\.|document\.cookie|serviceWorker/);
  assert.deepEqual([...new Set([...code.matchAll(/"(nd_[a-z_]+)"/g)].map((m) => m[1]))].sort(), ["nd_models_owner_token", "nd_owner_token"]);
  assert.ok(!fs.existsSync(path.join(dir, "sw.js")));
  assert.doesNotMatch(read("app.js"), /localStorage\.setItem|root\.localStorage\.setItem/);
});

test("gate: signed out renders the token form and a Back to Hub link, never the shell; 404 says not the owner", () => {
  const app = read("app.js");
  assert.match(app, /if \(S\.auth === "signin"\) \{\s*app\.innerHTML = bare\(gateHtml\(\)\);/);
  assert.match(app, /Not the owner/);
  assert.match(app, /if \(S\.auth === "signin" \|\| S\.auth === "denied"\) \{ render\(\); return; \}/);
  assert.match(app, /href="\/hub\/">Back to Hub/);
  assert.match(app, /A\.clearToken\(root\.localStorage\)/);
  assert.doesNotMatch(app, /auth\/login|Discord sign-in|return_to/);
});

test("demo data is wired only through BBDemo.isDemoMode (localhost + ?demo=1)", () => {
  const app = read("app.js");
  assert.match(app, /var demoMode = DEMO\.isDemoMode\(location\.hostname, location\.search\);/);
  assert.match(app, /var demoBackend = demoMode \? DEMO\.createBackend\(\) : null;/);
  assert.equal((app.match(/demoBackend/g) || []).length, 3);
});

test("unstored values say Coming soon and are never invented", () => {
  const app = read("app.js");
  for (const panel of ["Model sees more", "Price history", "With-price model", "Without-price model"]) assert.ok(app.includes(panel), panel);
  assert.ok((app.match(/Coming soon/g) || []).length >= 8);
  assert.doesNotMatch(app, /\.price\.now|\.winPct|expectedFinish|changePct|starting_price|startingPrice/);
});

test("copy: Model sees more, no banned wording, disclaimer and helpline on every signed-in screen", () => {
  const all = ALL.toLowerCase();
  assert.ok(!all.includes("hidden value") && !all.includes("hidden_value") && !all.includes("example data"));
  assert.ok(!/\bedge\b/.test(all));
  assert.doesNotMatch(read("app.js"), /console\./);
  assert.match(read("app.js"), /legal\(\) \+ "<\/div><\/main><\/div><\/div>"/);
});

test("the routes the page calls (one file lists them all)", () => {
  const api = read("api.js");
  for (const p of ['BASE + "?"', 'BASE + "/upcoming"', 'BASE + "/archived"', 'BASE + "/entries/"', 'BASE + "/entries"', '"/restore"', 'BASE + "/search?q="', 'BASE + "/race-card?event_id="', '"/api/owner/horse/races"']) assert.ok(api.includes(p), p);
  assert.doesNotMatch(read("app.js"), /"\/api\//);
});

test("phone layout: 4-tab bottom bar with safe area, wrapping names, 44px targets, tablet rail, system fonts", () => {
  const css = read("styles.css");
  assert.match(css, /\.bb-tabs\{display:grid;grid-template-columns:repeat\(4,1fr\)[^}]*env\(safe-area-inset-bottom\)/);
  assert.match(css, /\.hname\{[^}]*overflow-wrap:anywhere/);
  assert.match(css, /\.bb-tabs a\{[^}]*min-height:54px/);
  assert.match(css, /@media \(max-width:700px\)/);
  assert.match(css, /--bg:#07090F/);
  assert.doesNotMatch(css, /@font-face|url\(/);
  assert.match(HTML, /name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover"/);
});

test("no names, secrets or betting data in the folder", () => {
  const banned = [new RegExp("Glen" + "\\s+Harvey", "i"), new RegExp("Arch" + "on|Arc" + "on", "i")];
  for (const re of banned) assert.doesNotMatch(ALL, re);
  assert.doesNotMatch(ALL, /ghp_|github_pat_|sk-[A-Za-z0-9]{20}|Bearer [A-Za-z0-9._-]{16,}/);
  assert.doesNotMatch(ALL, /\b1NMI5C|docs\.google\.com|drive\.google\.com/);
  const files = fs.readdirSync(dir).filter((f) => !f.startsWith("."));
  assert.deepEqual(files.filter((f) => /\.(json|csv|xlsx?|pdf|sqlite|db)$/i.test(f)), []);
});

test("pending entries get a tag; empty race cards and next starts say Not entered; silks fall back to the monogram", () => {
  const app = read("app.js");
  assert.ok((app.match(/Pending match/g) || []).length >= 2);
  assert.match(app, /function hasNext\(nx\)/);
  assert.match(app, /<h2>Not entered<\/h2>/);
  assert.match(app, /r\.label \|\|/);
  assert.match(app, /rn\.silks \|\| rn\.silk_url_64x64/);
  assert.match(app, /document\.addEventListener\("error"[\s\S]*?, true\);/);
  assert.doesNotMatch(read("index.html") + read("app.js"), /\bon(error|load|click)=/i);
});
