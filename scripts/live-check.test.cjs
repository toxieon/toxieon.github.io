"use strict";
// live-check.cjs against a local fixture site: a temp "repo" (a few real app folders plus a fake
// private app) and a separate "live" copy served over HTTP that each test breaks in one way.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const http = require("node:http");
const { execFile } = require("node:child_process");

const REPO = path.join(__dirname, "..");
const SCRIPT = path.join(__dirname, "live-check.cjs");
const PRIVATE_DIR = "zz-private-fixture-7q3";

function copyApp(dest, folder, files) {
  fs.mkdirSync(path.join(dest, folder), { recursive: true });
  for (const f of files) fs.copyFileSync(path.join(REPO, folder, f), path.join(dest, folder, f));
}

function buildRepo() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "live-check-repo-"));
  copyApp(root, "planner", ["index.html", "sw.js", "VERSION"]);
  copyApp(root, "quote", ["index.html", "sw.js", "VERSION"]);
  copyApp(root, "company", ["index.html", "sw.js", "VERSION"]); // version only in its SW cache name
  fs.writeFileSync(path.join(root, "index.html"), "<!doctype html><html><head><title>Home Fixture</title></head><body>hi</body></html>");
  const priv = path.join(root, PRIVATE_DIR);
  fs.mkdirSync(priv);
  fs.writeFileSync(path.join(priv, ".nd-private"), "");
  fs.writeFileSync(path.join(priv, "VERSION"), "0.0.9\n");
  fs.writeFileSync(path.join(priv, "index.html"), '<!doctype html><html><head><meta name="robots" content="noindex,nofollow"><title>Secret Tool</title><script src="app.js?v=0.0.9"></script></head><body></body></html>');
  fs.writeFileSync(path.join(priv, "sw.js"), "const CACHE_VERSION = 'zz-0.0.9';");
  fs.mkdirSync(path.join(root, "hub"));
  fs.writeFileSync(path.join(root, "hub/apps.json"), JSON.stringify({ apps: [
    { id: "planner", name: "Planner", path: "/planner/" },
    { id: "quote", name: "Quote", path: "/quote/" },
    { id: "company", name: "Company", path: "/company/" },
    { id: "site", name: "Website", path: "/", hidden: true },
  ] }));
  fs.writeFileSync(path.join(root, "robots.txt"), "User-agent: *\nAllow: /\n");
  fs.writeFileSync(path.join(root, "sitemap.xml"), '<?xml version="1.0"?><urlset><url><loc>https://example.test/</loc></url></urlset>');
  return root;
}

function cloneDir(src) {
  const dest = fs.mkdtempSync(path.join(os.tmpdir(), "live-check-live-"));
  fs.cpSync(src, dest, { recursive: true });
  return dest;
}

function serve(dir) {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      let p = decodeURIComponent(new URL(req.url, "http://x").pathname);
      if (p.endsWith("/")) p += "index.html";
      const fp = path.join(dir, p);
      if (!fp.startsWith(dir) || !fs.existsSync(fp) || fs.statSync(fp).isDirectory()) { res.writeHead(404); return res.end("nope"); }
      res.writeHead(200);
      res.end(fs.readFileSync(fp));
    });
    server.listen(0, "127.0.0.1", () => resolve({ server, base: "http://127.0.0.1:" + server.address().port }));
  });
}

function run(args) {
  return new Promise((resolve) => {
    execFile(process.execPath, [SCRIPT, ...args], { env: { ...process.env, LIVE_CHECK_PLAYWRIGHT_MODULE: "no-such-module-live-check-test" }, timeout: 60000 },
      (err, stdout, stderr) => resolve({ code: err ? err.code : 0, stdout, stderr }));
  });
}

const repo = buildRepo();
test.after(() => fs.rmSync(repo, { recursive: true, force: true }));

/** Serve a fresh live copy, let `mutate` break it, run the check. */
async function check(mutate, args = []) {
  const live = cloneDir(repo);
  if (mutate) mutate(live);
  const { server, base } = await serve(live);
  try { return await run(["--root", repo, "--base", base, ...args]); }
  finally { server.close(); fs.rmSync(live, { recursive: true, force: true }); }
}

const row = (out, label) => out.stdout.split("\n").find((l) => l.startsWith(label)) || "";
const edit = (file, fn) => fs.writeFileSync(file, fn(fs.readFileSync(file, "utf8")));

test("a matching site passes, the browser step is skipped, and private paths stay hidden", async () => {
  const out = await check(null);
  assert.equal(out.code, 0, out.stdout + out.stderr);
  for (const label of ["Home /", "Planner /planner/", "Quote /quote/", "Company /company/", "private app #1"]) assert.ok(row(out, label), "row " + label);
  assert.match(row(out, "Company /company/"), /ok 0\.1\.1 \(sw\)/, "version falls back to the SW cache name");
  assert.match(row(out, "private app #1"), /ok noindex/);
  assert.match(out.stdout, /browser step skipped/);
  assert.ok(!out.stdout.includes(PRIVATE_DIR), "private path printed");
  assert.ok(!out.stdout.includes("Secret Tool"), "private app name printed");
});

test("status: a missing page fails", async () => {
  const out = await check((live) => fs.rmSync(path.join(live, "quote/index.html")));
  assert.equal(out.code, 1);
  assert.match(row(out, "Quote /quote/"), /FAIL 404/);
});

test("title: the repo title must be on the live page", async () => {
  const out = await check((live) => edit(path.join(live, "planner/index.html"), (s) => s.replace(/<title>[^<]*<\/title>/, "<title>Something Else</title>")));
  assert.equal(out.code, 1);
  assert.match(row(out, "Planner /planner/"), /FAIL expected title not found/);
});

test("version: a stale page warns, and fails with --expect-repo-versions", async () => {
  const stale = (live) => edit(path.join(live, "quote/index.html"), (s) => s.replace(/\?v=\d+\.\d+\.\d+/g, "?v=0.0.1").replace(/APP_VERSION\s*=\s*"[^"]*"/, 'APP_VERSION = "0.0.1"'));
  const warn = await check(stale);
  assert.equal(warn.code, 0, warn.stdout);
  assert.match(row(warn, "Quote /quote/"), /warn 0\.0\.1 \(repo \d+\.\d+\.\d+\)/);
  const strict = await check(stale, ["--expect-repo-versions"]);
  assert.equal(strict.code, 1);
  assert.match(row(strict, "Quote /quote/"), /FAIL 0\.0\.1 \(repo/);
});

test("robots: noindex must be live where the repo has it, and only there", async () => {
  const missing = await check((live) => edit(path.join(live, "planner/index.html"), (s) => s.replace(/<meta name="robots"[^>]*>/i, "")));
  assert.equal(missing.code, 1);
  assert.match(row(missing, "Planner /planner/"), /FAIL noindex missing/);

  const extra = await check((live) => edit(path.join(live, "company/index.html"), (s) => s.replace(/<head>/i, '<head><meta name="robots" content="noindex">')));
  assert.equal(extra.code, 1);
  assert.match(row(extra, "Company /company/"), /FAIL unexpected noindex/);

  const priv = await check((live) => edit(path.join(live, PRIVATE_DIR, "index.html"), (s) => s.replace(/<meta name="robots"[^>]*>/, "")));
  assert.equal(priv.code, 1);
  assert.match(row(priv, "private app #1"), /FAIL noindex missing/);
  assert.ok(!priv.stdout.includes(PRIVATE_DIR));
});

test("sitemap and robots.txt must not list a private app (and the failure doesn't print it)", async () => {
  const sm = await check((live) => edit(path.join(live, "sitemap.xml"), (s) => s.replace("</urlset>", "<url><loc>https://example.test/" + PRIVATE_DIR + "/</loc></url></urlset>")));
  assert.equal(sm.code, 1);
  assert.match(sm.stdout, /\/sitemap\.xml FAIL 1 private app path\(s\) listed/);
  assert.ok(!sm.stdout.includes(PRIVATE_DIR));

  const rb = await check((live) => fs.appendFileSync(path.join(live, "robots.txt"), "Disallow: /" + PRIVATE_DIR + "/\n"));
  assert.equal(rb.code, 1);
  assert.match(rb.stdout, /\/robots\.txt\s+FAIL 1 private app path/);
  assert.ok(!rb.stdout.includes(PRIVATE_DIR));
});

test("service worker: a missing sw.js fails", async () => {
  const out = await check((live) => fs.rmSync(path.join(live, "company/sw.js")));
  assert.equal(out.code, 1);
  assert.match(row(out, "Company /company/"), /FAIL 404\s*$/);
});

test("--json: machine output, private paths masked unless --show-private", async () => {
  const out = await check(null, ["--json"]);
  assert.equal(out.code, 0);
  const report = JSON.parse(out.stdout);
  assert.equal(report.ok, true);
  assert.equal(report.browser, "skipped");
  const priv = report.results.find((r) => r.private);
  assert.equal(priv.app, "private app #1");
  assert.equal(priv.url, null);
  assert.ok(!out.stdout.includes(PRIVATE_DIR));
  assert.deepEqual(Object.keys(report.results[0].checks), ["status", "title", "version", "robots", "sw"]);

  const shown = await check(null, ["--json", "--show-private"]);
  assert.ok(shown.stdout.includes(PRIVATE_DIR), "--show-private reveals the path");
});

test("--only narrows the list; an unknown name is an error", async () => {
  const out = await check(null, ["--only", "planner,quote"]);
  assert.equal(out.code, 0);
  assert.ok(row(out, "Planner /planner/") && row(out, "Quote /quote/"));
  assert.equal(row(out, "Company /company/"), "");
  const bad = await check(null, ["--only", "nothing-here"]);
  assert.equal(bad.code, 2);
  assert.match(bad.stderr, /--only matched no apps/);
});

test("versionsIn and isNoindex helpers", () => {
  const { versionsIn, isNoindex } = require("./live-check.cjs");
  assert.deepEqual(versionsIn('<script src="app.js?v=1.2.3"></script><link href="../shared/x.css?v=9.9.9"><script src="https://cdn.x/y.js?v=4.4.4"></script><script>const APP_VERSION = "1.2.3";</script>'), ["1.2.3"]);
  assert.equal(isNoindex('<meta name="robots" content="noindex, nofollow">'), true);
  assert.equal(isNoindex('<meta content="noindex" name="robots">'), true);
  assert.equal(isNoindex('<meta name="description" content="noindex is a word">'), false);
});
