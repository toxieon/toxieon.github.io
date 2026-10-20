"use strict";
// ship.cjs against a temp git repo with a bare "origin", gh stubbed through a PATH shim, and a
// local HTTP server standing in for the live site. Dry runs must call no gh and write nothing.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const http = require("node:http");
const { execFile, execFileSync } = require("node:child_process");

const SHIP = path.join(__dirname, "ship.cjs");

function sh(cwd, cmd, args) { return execFileSync(cmd, args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim(); }
const git = (cwd, ...args) => sh(cwd, "git", args);

function makeRepo() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "ship-test-"));
  const origin = path.join(tmp, "origin.git");
  const work = path.join(tmp, "work");
  git(tmp, "init", "-q", "--bare", "-b", "main", origin);
  git(tmp, "clone", "-q", origin, work);
  git(work, "config", "user.email", "test@example.test");
  git(work, "config", "user.name", "Ship Test");
  git(work, "config", "commit.gpgsign", "false");
  git(work, "checkout", "-q", "-b", "main");
  const w = (f, s) => { fs.mkdirSync(path.dirname(path.join(work, f)), { recursive: true }); fs.writeFileSync(path.join(work, f), s); };
  w("package.json", JSON.stringify({ private: true, scripts: {
    test: "node -e \"process.exit(process.env.SHIP_TEST_FAIL ? 1 : 0)\"",
    "icons:check": "node -e \"console.log('icons ok')\"",
  } }));
  w("scripts/lint-release.cjs", "console.log('lint-release OK');\n");
  w("index.html", "<!doctype html><title>Home</title>");
  w("demo/index.html", '<!doctype html><html><head><title>Demo App</title><script src="app.js?v=0.1.0"></script></head></html>');
  w("demo/VERSION", "0.1.0\n");
  w("demo/sw.js", "const CACHE_VERSION = 'demo-0.1.0';\n");
  w("board/index.html", "<!doctype html><title>Board</title>");
  w("board/sw.js", "const CACHE_VERSION = 'board-v3';\n");
  w("hub/apps.json", JSON.stringify({ apps: [{ id: "demo", name: "Demo App", path: "/demo/" }, { id: "board", name: "Board", path: "/board/" }] }));
  w("robots.txt", "User-agent: *\n");
  git(work, "add", "-A");
  git(work, "commit", "-q", "-m", "base");
  git(work, "push", "-q", "-u", "origin", "main");
  git(work, "checkout", "-q", "-b", "feature/x");
  return { tmp, origin, work, w };
}

/** gh stub: logs every call; answers the few commands ship.cjs uses. */
function ghShim(tmp) {
  const bin = path.join(tmp, "bin");
  fs.mkdirSync(bin);
  const log = path.join(tmp, "gh.log");
  fs.writeFileSync(log, "");
  fs.writeFileSync(path.join(bin, "gh"), `#!/usr/bin/env node
const fs = require("fs"); const a = process.argv.slice(2);
fs.appendFileSync(${JSON.stringify(log)}, a.join(" ") + "\\n");
const is = (...p) => p.every((x, i) => a[i] === x);
if (is("pr", "list")) { process.stdout.write("[]"); process.exit(0); }
if (is("pr", "create")) { process.stdout.write("https://github.example/o/r/pull/7\\n"); process.exit(0); }
if (is("pr", "view")) { process.stdout.write(JSON.stringify({ number: 7, url: "https://github.example/o/r/pull/7", mergeCommit: { oid: "abc1234" } })); process.exit(0); }
if (is("pr", "checks") || is("pr", "merge")) process.exit(0);
process.stderr.write("unexpected gh call: " + a.join(" ")); process.exit(9);
`, { mode: 0o755 });
  return { bin, log, calls: () => fs.readFileSync(log, "utf8").split("\n").filter(Boolean) };
}

function ship(cwd, args, env = {}, ghBin) {
  return new Promise((resolve) => {
    execFile(process.execPath, [SHIP, ...args], {
      cwd, timeout: 120000,
      env: { ...process.env, PATH: ghBin + path.delimiter + process.env.PATH, LIVE_CHECK_PLAYWRIGHT_MODULE: "no-such-module-ship-test", SHIP_POLL_MS: "200", ...env },
    }, (err, stdout, stderr) => resolve({ code: err ? err.code : 0, out: stdout + stderr }));
  });
}

function bumpDemo(r, to = "0.2.0") {
  r.w("demo/index.html", `<!doctype html><html><head><title>Demo App</title><script src="app.js?v=${to}"></script></head></html>`);
  r.w("demo/VERSION", to + "\n");
  r.w("demo/sw.js", `const CACHE_VERSION = 'demo-${to}';\n`);
  git(r.work, "commit", "-qam", "demo " + to);
}

const ARGS = ["--branch", "feature/x", "--slug", "demo-fix"];
const dated = () => { const d = new Date(); return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0"); };

test("refuses a dirty tree, and the wrong branch", async () => {
  const r = makeRepo(); const gh = ghShim(r.tmp);
  try {
    bumpDemo(r);
    fs.writeFileSync(path.join(r.work, "scratch.txt"), "x");
    const dirty = await ship(r.work, ARGS, {}, gh.bin);
    assert.equal(dirty.code, 1);
    assert.match(dirty.out, /refusing to ship: working tree is not clean[\s\S]*scratch\.txt/);
    fs.rmSync(path.join(r.work, "scratch.txt"));
    const wrong = await ship(r.work, ["--branch", "other", "--slug", "demo-fix"], {}, gh.bin);
    assert.equal(wrong.code, 1);
    assert.match(wrong.out, /on branch "feature\/x", not "other"/);
    assert.deepEqual(gh.calls(), []);
  } finally { fs.rmSync(r.tmp, { recursive: true, force: true }); }
});

test("refuses a changed app without a version bump (VERSION apps and SW-cache apps)", async () => {
  const r = makeRepo(); const gh = ghShim(r.tmp);
  try {
    r.w("demo/index.html", "<!doctype html><title>Demo App</title><p>changed");
    r.w("demo/notes.md", "docs don't count");
    r.w("board/board.js", "// changed");
    git(r.work, "add", "-A"); git(r.work, "commit", "-qm", "change apps, no bumps");
    const out = await ship(r.work, ARGS, {}, gh.bin);
    assert.equal(out.code, 1);
    assert.match(out.out, /version not bumped/);
    assert.match(out.out, /demo: VERSION is still 0\.1\.0 \(changed: demo\/index\.html\)/);
    assert.match(out.out, /board: SW cache is still v3/);
    assert.doesNotMatch(out.out, /3\. Tests/, "refused before running tests");
    assert.deepEqual(gh.calls(), []);
  } finally { fs.rmSync(r.tmp, { recursive: true, force: true }); }
});

test("refuses when the tests fail", async () => {
  const r = makeRepo(); const gh = ghShim(r.tmp);
  try {
    bumpDemo(r);
    const out = await ship(r.work, ARGS, { SHIP_TEST_FAIL: "1" }, gh.bin);
    assert.equal(out.code, 1);
    assert.match(out.out, /refusing to ship: npm test failed/);
    assert.deepEqual(gh.calls(), []);
  } finally { fs.rmSync(r.tmp, { recursive: true, force: true }); }
});

test("dry run prints the whole plan and the rollback, calls no gh and writes nothing", async () => {
  const r = makeRepo(); const gh = ghShim(r.tmp);
  try {
    bumpDemo(r);
    r.w("demo/app.test.cjs", "// a test-only change never needs a bump"); git(r.work, "add", "-A"); git(r.work, "commit", "-qm", "test");
    const headBefore = git(r.work, "rev-parse", "HEAD");
    const out = await ship(r.work, ARGS, {}, gh.bin);
    assert.equal(out.code, 0, out.out);
    const tag = "checkpoint-pre-demo-fix-" + dated();
    for (const want of [
      "dry run", "ok  on feature/x, working tree clean", "ok  demo: VERSION 0.1.0 -> 0.2.0",
      "$ npm test", "$ npm run icons:check", "$ node scripts/lint-release.cjs --base origin/main",
      "$ git tag " + tag + " origin/main", "$ git push origin refs/tags/" + tag,
      "$ git push -u origin feature/x", "$ gh pr create --base main --head feature/x --fill",
      "$ gh pr checks <pr> --watch --fail-fast", "$ gh pr merge <pr> --squash",
      "until demo serves 0.2.0", "--only demo --expect-repo-versions",
      "Rollback", "git revert --no-edit", "git push origin :refs/tags/" + tag,
      "Dry run complete",
    ]) assert.ok(out.out.includes(want), "missing from plan: " + want + "\n" + out.out);
    assert.deepEqual(gh.calls(), [], "no gh in a dry run");
    assert.equal(git(r.work, "tag", "--list"), "", "no local tag");
    assert.equal(git(r.origin, "tag", "--list"), "", "no tag pushed");
    assert.equal(git(r.origin, "branch", "--list", "feature/x"), "", "branch not pushed");
    assert.equal(git(r.work, "rev-parse", "HEAD"), headBefore);
    assert.equal(git(r.work, "status", "--porcelain"), "");
  } finally { fs.rmSync(r.tmp, { recursive: true, force: true }); }
});

test("--execute runs every step against the fake origin, gh stub and a local live site", async () => {
  const r = makeRepo(); const gh = ghShim(r.tmp);
  bumpDemo(r);
  const server = http.createServer((req, res) => {
    let p = decodeURIComponent(new URL(req.url, "http://x").pathname);
    if (p.endsWith("/")) p += "index.html";
    const fp = path.join(r.work, p);
    if (!fp.startsWith(r.work) || !fs.existsSync(fp) || fs.statSync(fp).isDirectory()) { res.writeHead(404); return res.end(); }
    res.writeHead(200); res.end(fs.readFileSync(fp));
  });
  await new Promise((ok) => server.listen(0, "127.0.0.1", ok));
  try {
    const site = "http://127.0.0.1:" + server.address().port;
    const baseSha = git(r.work, "rev-parse", "origin/main");
    const out = await ship(r.work, [...ARGS, "--execute", "--site", site], {}, gh.bin);
    assert.equal(out.code, 0, out.out);
    const tag = "checkpoint-pre-demo-fix-" + dated();
    assert.equal(git(r.origin, "rev-list", "-n", "1", tag), baseSha, "checkpoint tag pushed on origin/main");
    assert.equal(git(r.origin, "rev-parse", "feature/x"), git(r.work, "rev-parse", "HEAD"), "branch pushed");
    assert.deepEqual(gh.calls(), [
      "pr list --head feature/x --state open --json number,url",
      "pr create --base main --head feature/x --fill",
      "pr view feature/x --json number,url",
      "pr checks 7 --watch --fail-fast",
      "pr merge 7 --squash",
      "pr view 7 --json mergeCommit",
    ]);
    assert.match(out.out, /ok  demo is live at 0\.2\.0/);
    assert.match(out.out, /git revert --no-edit abc1234/);
    assert.match(out.out, /Shipped: PR #7 merged and live/);
  } finally { server.close(); fs.rmSync(r.tmp, { recursive: true, force: true }); }
});

test("argument checks", () => {
  const { parseArgs } = require("./ship.cjs");
  assert.throws(() => parseArgs(["--slug", "x"]), /--branch is required/);
  assert.throws(() => parseArgs(["--branch", "b", "--slug", "Bad Slug"]), /--slug/);
  assert.throws(() => parseArgs(["--branch", "-x", "--slug", "ok"]), /unexpected characters/);
  assert.equal(parseArgs(["--branch", "b", "--slug", "ok"]).execute, false, "dry run by default");
});
