#!/usr/bin/env node
/* Live check for the deployed site (read-only: GET requests only).
 *
 *   node scripts/live-check.cjs [--base https://www.neilldata.com] [--only planner,quote]
 *                               [--expect-repo-versions] [--json] [--show-private] [--no-browser]
 *                               [--root <repo dir>]
 *
 * URLs checked: every app in hub/apps.json, the home page, any private app (folder with .nd-private)
 * and any other top-level folder whose index.html is noindex. For each one:
 *   1. status 200
 *   2. the page carries the repo's <title> (or its nd:app name)
 *   3. version: the page's local ?v=X.Y.Z cache-busters / APP_VERSION vs the folder's VERSION file.
 *      A mismatch is a warning, or a failure with --expect-repo-versions (use after a deploy).
 *   4. robots: noindex live exactly where the repo's index.html is noindex (private apps always);
 *      no private app path in /sitemap.xml or /robots.txt
 *   5. the app's sw.js returns 200 (apps that have one in the repo)
 * Optional browser step: if playwright can be required (a local dev tool, not a dependency), each
 * URL is opened at 390x844; console errors and failed requests fail the check, and a screenshot goes
 * to .live-check/. Otherwise it prints "browser step skipped".
 *
 * Private app paths are never printed (table, JSON, screenshots) unless --show-private is passed;
 * they show as "private app #n". Exit code 1 on any failure. No dependencies (Node built-ins only).
 */
"use strict";
const fs = require("node:fs");
const path = require("node:path");
const { parsePage } = require("../hub/build-apps.cjs");

const DEFAULT_BASE = "https://www.neilldata.com";
const FETCH_TIMEOUT_MS = 20000;
const CONCURRENCY = 4;

// ── args ────────────────────────────────────────────────────────────────────
function parseArgs(argv) {
  const out = { base: DEFAULT_BASE, only: null, expectRepoVersions: false, json: false, showPrivate: false, browser: true, root: path.join(__dirname, "..") };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const val = () => { const v = argv[++i]; if (v === undefined) throw new Error(a + " needs a value"); return v; };
    if (a === "--base") out.base = val().replace(/\/+$/, "");
    else if (a === "--only") out.only = val().split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
    else if (a === "--expect-repo-versions") out.expectRepoVersions = true;
    else if (a === "--json") out.json = true;
    else if (a === "--show-private") out.showPrivate = true;
    else if (a === "--no-browser") out.browser = false;
    else if (a === "--root") out.root = path.resolve(val());
    else if (a === "--help" || a === "-h") out.help = true;
    else throw new Error("unknown option " + a);
  }
  return out;
}

// ── what the repo expects ───────────────────────────────────────────────────
const read = (p) => { try { return fs.readFileSync(p, "utf8"); } catch (e) { return null; } };
const NOINDEX_RE = /<meta\b[^>]*name\s*=\s*["']robots["'][^>]*content\s*=\s*["'][^"']*noindex/i;
const NOINDEX_RE2 = /<meta\b[^>]*content\s*=\s*["'][^"']*noindex[^"']*["'][^>]*name\s*=\s*["']robots["']/i;
const isNoindex = (html) => NOINDEX_RE.test(html || "") || NOINDEX_RE2.test(html || "");

/** Local ?v=X.Y.Z cache-busters (same rule as lint-release: not ../, not http) plus APP_VERSION. */
function versionsIn(html) {
  const found = new Set();
  const re = /["'(](?!\.\.\/)(?!https?:)\.?\/?(\w[\w./-]*)\?v=(\d+\.\d+\.\d+)/g;
  let m;
  while ((m = re.exec(html || ""))) found.add(m[2]);
  const av = /APP_VERSION\s*=\s*['"](\d+\.\d+\.\d+)['"]/.exec(html || "");
  if (av) found.add(av[1]);
  return [...found].sort();
}

/** One target per URL to check, with what the repo says should be live. */
function repoTargets(root) {
  const targets = [];
  const seen = new Set();
  const add = (t) => { if (!seen.has(t.path)) { seen.add(t.path); targets.push(t); } };
  const forFolder = (folder, id, name, extra = {}) => {
    const dir = folder ? path.join(root, folder) : root;
    const html = read(path.join(dir, "index.html")) || "";
    const page = parsePage(html);
    const priv = !!folder && fs.existsSync(path.join(dir, ".nd-private"));
    return Object.assign({
      id, name, folder, path: folder ? "/" + folder + "/" : "/",
      private: priv,
      title: page.title, ndApp: page.meta["nd:app"] || "",
      version: folder ? (read(path.join(dir, "VERSION")) || "").trim() : "",
      noindex: priv || isNoindex(html),
      hasSw: fs.existsSync(path.join(dir, "sw.js")),
    }, extra);
  };

  let apps = [];
  try { apps = JSON.parse(read(path.join(root, "hub/apps.json")) || "{}").apps || []; } catch (e) { throw new Error("hub/apps.json is not valid JSON: " + e.message); }
  add(forFolder("", "home", "Home"));
  for (const a of apps) {
    if (!a.path || !a.path.startsWith("/")) continue;
    const folder = a.path.replace(/^\/|\/$/g, "");
    if (folder.includes("/")) continue;
    if (folder && !fs.existsSync(path.join(root, folder, "index.html"))) continue;
    add(forFolder(folder, a.id, a.name));
  }
  for (const ent of fs.readdirSync(root, { withFileTypes: true })) {
    if (!ent.isDirectory() || ent.name.startsWith(".") || ent.name === "node_modules") continue;
    const dir = path.join(root, ent.name);
    if (!fs.existsSync(path.join(dir, "index.html"))) continue;
    const priv = fs.existsSync(path.join(dir, ".nd-private"));
    if (priv || isNoindex(read(path.join(dir, "index.html")))) add(forFolder(ent.name, ent.name.toLowerCase(), ent.name));
  }
  let n = 0;
  for (const t of targets) if (t.private) t.label = "private app #" + (++n);
  return targets;
}

// ── fetching ────────────────────────────────────────────────────────────────
async function get(url) {
  try {
    const res = await fetch(url, { redirect: "follow", signal: AbortSignal.timeout(FETCH_TIMEOUT_MS), headers: { "user-agent": "neilldata-live-check/1" } });
    const text = await res.text();
    return { status: res.status, text };
  } catch (e) {
    return { status: 0, text: "", error: (e && e.name === "TimeoutError") ? "timed out" : "request failed" };
  }
}

async function pool(items, n, fn) {
  const out = new Array(items.length);
  let i = 0;
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => {
    while (i < items.length) { const k = i++; out[k] = await fn(items[k], k); }
  }));
  return out;
}

/** Runs the HTTP checks for one target. Returns { checks: {name: {ok, warn?, detail}} }. */
async function checkTarget(t, opts) {
  const url = opts.base + t.path;
  const page = await get(url);
  const checks = {};
  checks.status = { ok: page.status === 200, detail: page.status ? String(page.status) : page.error };
  if (page.status !== 200) return { url, checks };

  const live = parsePage(page.text);
  const titleOk = (!!t.title && live.title === t.title) || (!!t.ndApp && live.meta["nd:app"] === t.ndApp) || (!t.title && !t.ndApp);
  checks.title = { ok: titleOk, detail: titleOk ? "match" : "expected title not found" };

  const sw = t.hasSw ? await get(url + "sw.js") : null;
  let liveVersions = versionsIn(page.text);
  let from = "";
  if (!liveVersions.length && sw && sw.status === 200) {
    // Some apps only carry their version in the SW cache name (lint-release keeps it == VERSION).
    const m = /CACHE_VERSION\s*=\s*['"][a-z0-9]+-(\d+\.\d+\.\d+)['"]/i.exec(sw.text);
    if (m) { liveVersions = [m[1]]; from = " (sw)"; }
  }
  if (t.version) {
    const match = liveVersions.length > 0 && liveVersions.every((v) => v === t.version);
    const detail = (liveVersions.length ? liveVersions.join("/") + from : "none") + (match ? "" : " (repo " + t.version + ")");
    checks.version = match ? { ok: true, detail } : { ok: !opts.expectRepoVersions, warn: !opts.expectRepoVersions, detail };
  } else {
    checks.version = { ok: true, detail: liveVersions.length ? liveVersions.join("/") : "n/a" };
  }

  const liveNoindex = isNoindex(page.text);
  checks.robots = liveNoindex === t.noindex
    ? { ok: true, detail: liveNoindex ? "noindex" : "indexable" }
    : { ok: false, detail: t.noindex ? "noindex missing" : "unexpected noindex" };

  checks.sw = sw ? { ok: sw.status === 200, detail: sw.status ? String(sw.status) : sw.error } : { ok: true, detail: "n/a" };
  return { url, checks, liveVersions };
}

/** Private paths must not appear in sitemap.xml or robots.txt. */
async function checkSiteFiles(targets, opts) {
  const privatePaths = targets.filter((t) => t.private).map((t) => t.path);
  const out = [];
  for (const file of ["/sitemap.xml", "/robots.txt"]) {
    const r = await get(opts.base + file);
    if (r.status !== 200) { out.push({ file, ok: r.status === 404, detail: r.status === 404 ? "not found (nothing to leak)" : (r.status ? String(r.status) : r.error) }); continue; }
    const leaks = privatePaths.filter((p) => r.text.includes(p));
    out.push({ file, ok: leaks.length === 0, detail: leaks.length ? leaks.length + " private app path(s) listed" : "no private paths" });
  }
  return out;
}

// ── optional browser step ───────────────────────────────────────────────────
function loadPlaywright() {
  const name = process.env.LIVE_CHECK_PLAYWRIGHT_MODULE || "playwright"; // tests point this at a missing module
  try { return require(name); } catch (e) { return null; }
}

async function browserStep(rows, opts) {
  const pw = opts.browser ? loadPlaywright() : null;
  if (!pw || !pw.chromium) return { skipped: true };
  const outDir = path.join(opts.root, ".live-check");
  fs.mkdirSync(outDir, { recursive: true });
  const launch = {};
  if (process.env.LIVE_CHECK_CHROMIUM) launch.executablePath = process.env.LIVE_CHECK_CHROMIUM;
  const browser = await pw.chromium.launch(launch);
  try {
    for (const row of rows) {
      if (!row.checks.status || !row.checks.status.ok) continue;
      const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
      const page = await ctx.newPage();
      const consoleErrors = [];
      const failed = [];
      page.on("console", (m) => { if (m.type() === "error") consoleErrors.push(m.text()); });
      page.on("pageerror", (e) => consoleErrors.push(String(e)));
      page.on("requestfailed", (r) => failed.push(r.url()));
      try {
        await page.goto(row.url, { waitUntil: "load", timeout: 30000 });
        await page.waitForTimeout(1500);
        const shot = (row.target.private && !opts.showPrivate ? row.target.label.replace(/\W+/g, "-") : row.target.id) + ".png";
        await page.screenshot({ path: path.join(outDir, shot) });
      } catch (e) {
        consoleErrors.push("page did not load: " + (e && e.message ? e.message.split("\n")[0] : e));
      }
      await ctx.close();
      const n = consoleErrors.length + failed.length;
      row.checks.browser = { ok: n === 0, detail: n === 0 ? "clean" : consoleErrors.length + " console error(s), " + failed.length + " failed request(s)" };
      row.browserDetail = { consoleErrors, failedRequests: failed };
    }
  } finally {
    await browser.close();
  }
  return { skipped: false, dir: outDir };
}

// ── report ──────────────────────────────────────────────────────────────────
const COLS = ["status", "title", "version", "robots", "sw", "browser"];

function display(row, opts) {
  const t = row.target;
  return t.private && !opts.showPrivate ? t.label : (t.name + " " + t.path);
}

function cell(c) {
  if (!c) return "-";
  return (c.ok ? (c.warn ? "warn " : "ok ") : "FAIL ") + c.detail;
}

function table(rows, siteFiles, opts, browser) {
  const head = ["URL", ...COLS.filter((k) => k !== "browser" || !browser.skipped)];
  const lines = rows.map((r) => [display(r, opts), ...head.slice(1).map((k) => cell(r.checks[k]))]);
  const widths = head.map((h, i) => Math.max(h.length, ...lines.map((l) => l[i].length)));
  const fmt = (cols) => cols.map((c, i) => c.padEnd(widths[i])).join("  ").trimEnd();
  const out = [fmt(head), fmt(widths.map((w) => "-".repeat(w))), ...lines.map(fmt), ""];
  for (const s of siteFiles) out.push(s.file.padEnd(13) + (s.ok ? "ok   " : "FAIL ") + s.detail);
  out.push(browser.skipped ? "browser step skipped" : "browser step: screenshots in " + path.relative(opts.root, browser.dir) + "/");
  for (const r of rows) {
    const d = browserProblems(r, opts);
    if (d.length) out.push("  " + display(r, opts) + ":\n" + d.slice(0, 4).map((x) => "    - " + x).join("\n") + (d.length > 4 ? "\n    - (+" + (d.length - 4) + " more)" : ""));
  }
  return out.join("\n");
}

/** Console errors and failed requests for one row, with a private app's path masked. */
function browserProblems(row, opts) {
  if (!row.browserDetail) return [];
  const t = row.target;
  const mask = (x) => (t.private && !opts.showPrivate ? String(x).split(t.path).join("/" + t.label.replace(/\W+/g, "-") + "/") : String(x)).slice(0, 200);
  return [...row.browserDetail.consoleErrors.map((e) => "console: " + mask(e)), ...row.browserDetail.failedRequests.map((u) => "failed request: " + mask(u))];
}

function maskUrl(row, opts) { return row.target.private && !opts.showPrivate ? null : row.url; }

async function run(opts) {
  let targets = repoTargets(opts.root);
  if (opts.only) {
    const want = new Set(opts.only);
    targets = targets.filter((t) => want.has(t.id) || want.has((t.folder || "home").toLowerCase()));
    if (!targets.length) throw new Error("--only matched no apps");
  }
  const rows = await pool(targets, CONCURRENCY, async (t) => Object.assign({ target: t }, await checkTarget(t, opts)));
  const siteFiles = await checkSiteFiles(repoTargets(opts.root), opts);
  const browser = await browserStep(rows, opts);
  const failed = rows.some((r) => Object.values(r.checks).some((c) => !c.ok)) || siteFiles.some((s) => !s.ok);
  const report = {
    base: opts.base,
    ok: !failed,
    browser: browser.skipped ? "skipped" : "ran",
    results: rows.map((r) => ({
      app: r.target.private && !opts.showPrivate ? r.target.label : r.target.id,
      url: maskUrl(r, opts),
      private: r.target.private,
      repoVersion: r.target.version || null,
      checks: r.checks,
      browserProblems: browserProblems(r, opts),
    })),
    siteFiles,
  };
  return { report, text: table(rows, siteFiles, opts, browser), failed };
}

/** For ship.cjs: the live ?v= versions of one app path ([] if unreachable). */
async function liveVersions(base, appPath) {
  const r = await get(base.replace(/\/+$/, "") + appPath);
  return r.status === 200 ? versionsIn(r.text) : [];
}

async function main() {
  let opts;
  try { opts = parseArgs(process.argv.slice(2)); } catch (e) { console.error("live-check: " + e.message); process.exit(2); }
  if (opts.help) { console.log(fs.readFileSync(__filename, "utf8").split("*/")[0].replace(/^#!.*\n\/\* ?/, "")); return; }
  try {
    const { report, text, failed } = await run(opts);
    console.log(opts.json ? JSON.stringify(report, null, 2) : text);
    process.exit(failed ? 1 : 0);
  } catch (e) {
    console.error("live-check: " + e.message);
    process.exit(2);
  }
}

if (require.main === module) main();

module.exports = { parseArgs, repoTargets, versionsIn, isNoindex, run, liveVersions };
