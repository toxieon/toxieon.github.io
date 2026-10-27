// live-check.cjs --lines against a tiny local server: JSON lines, summary counts, exit code.
"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { execFile } = require("node:child_process");
const SCRIPT = path.join(__dirname, "live-check.cjs");

function serve() {
  const pages = {
    "/": "<html><body>CCTV installs</body></html>",
    "/hidden/": '<html><head><meta name="robots" content="noindex"></head></html>',
    "/hdr/": "<html></html>",
  };
  const server = http.createServer((req, res) => {
    const body = pages[req.url];
    if (!body) { res.writeHead(404); return res.end("nope"); }
    const h = { "content-type": "text/html" };
    if (req.url === "/hdr/") h["x-robots-tag"] = "noindex";
    res.writeHead(200, h); res.end(body);
  });
  return new Promise((r) => server.listen(0, "127.0.0.1", () => r(server)));
}

function run(args) {
  return new Promise((resolve) => execFile(process.execPath, [SCRIPT, ...args],
    { env: { ...process.env, LIVE_CHECK_PLAYWRIGHT_MODULE: "no-such-module-live-check-test" }, timeout: 30000 },
    (err, stdout) => resolve({ code: err ? err.code : 0, lines: stdout.trim().split("\n").map((l) => JSON.parse(l)) })));
}

test("--lines prints one JSON line per check, skips console without a browser, and exits by failures", async () => {
  const server = await serve();
  const base = "http://127.0.0.1:" + server.address().port;
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "lc-lines-"));
  try {
    const ok = path.join(dir, "ok.json");
    fs.writeFileSync(ok, JSON.stringify([
      { path: "/", status: 200, text: "CCTV", console: true },
      { path: "/hidden/", noindex: true },
      { path: "/hdr/", noindex: true },
    ]));
    const a = await run(["--base", base, "--checks", ok]);
    assert.equal(a.code, 0);
    const checks = a.lines.filter((l) => !l.summary);
    assert.deepEqual(checks.map((l) => l.check), ["status", "text", "console", "status", "noindex", "status", "noindex"]);
    for (const l of checks) { assert.equal(l.target, "pages"); assert.equal(typeof l.url, "string"); assert.equal(l.ok, true); assert.equal(typeof l.detail, "string"); }
    const con = checks.find((l) => l.check === "console");
    assert.equal(con.skipped, true); assert.match(con.detail, /skipped/);
    assert.deepEqual(a.lines.at(-1), { summary: true, passed: 6, failed: 0, skipped: 1 });

    const bad = path.join(dir, "bad.json");
    fs.writeFileSync(bad, JSON.stringify([{ path: "/missing/" }, { path: "/", text: "Nope", noindex: true }]));
    const b = await run(["--base", base, "--checks", bad]);
    assert.equal(b.code, 1);
    assert.deepEqual(b.lines.at(-1), { summary: true, passed: 1, failed: 3, skipped: 0 });
  } finally { server.close(); fs.rmSync(dir, { recursive: true, force: true }); }
});
