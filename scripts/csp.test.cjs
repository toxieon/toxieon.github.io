"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { APPS, build, apply, inlineScriptHashes } = require("./csp.cjs");
const ROOT = path.join(__dirname, "..");

const policyOf = (html) => (html.match(/<meta http-equiv="Content-Security-Policy" content="([^"]*)"/) || [])[1];
const dir = (policy, name) => ((policy.split(/;\s*/).find((d) => d.startsWith(name + " ")) || "").split(/\s+/).slice(1));

test("every app page carries an up-to-date CSP meta (run: node scripts/csp.cjs)", () => {
  for (const [name, app] of Object.entries(APPS)) {
    const html = fs.readFileSync(path.join(ROOT, app.file), "utf8");
    assert.equal(apply(app, html), html, `${name}: CSP meta is missing or stale`);
    assert.ok(policyOf(html), `${name}: no CSP meta`);
    assert.ok(html.indexOf("Content-Security-Policy") < html.search(/<script\b|<link\b[^>]*stylesheet/i), `${name}: CSP meta must come before any script or stylesheet`);
  }
});

test("script-src has no 'unsafe-inline'/'unsafe-eval' except where documented", () => {
  for (const [name, app] of Object.entries(APPS)) {
    const p = policyOf(fs.readFileSync(path.join(ROOT, app.file), "utf8"));
    const s = dir(p, "script-src");
    assert.equal(s.includes("'unsafe-inline'"), !!app.unsafeInlineScript, `${name}: script-src 'unsafe-inline'`);
    assert.ok(!s.includes("'unsafe-eval'"), `${name}: script-src 'unsafe-eval'`);
    for (const d of ["object-src", "base-uri", "form-action"]) assert.ok(dir(p, d).length, `${name}: ${d} missing`);
    assert.deepEqual(dir(p, "object-src"), ["'none'"]);
    assert.ok(!/\bhttps?:(\s|;|$)|\*(\s|;|$)/.test(p), `${name}: scheme-wide or bare wildcard source`);
  }
});

test("hashed pages have no inline event handlers or javascript: URLs", () => {
  for (const [name, app] of Object.entries(APPS)) {
    if (app.unsafeInlineScript) continue;
    const html = fs.readFileSync(path.join(ROOT, app.file), "utf8").replace(/<script\b[\s\S]*?<\/script>/gi, "");
    assert.ok(!/\son[a-z]+\s*=\s*["']/i.test(html), `${name}: inline on*= handler`);
    assert.ok(!/href\s*=\s*["']\s*javascript:/i.test(html), `${name}: javascript: URL`);
  }
});

test("inline script hashes match the page's scripts", () => {
  const html = '<script>alert(1)</script><script src="a.js"></script><script type="application/json">{}</script><script> </script>';
  const hashes = inlineScriptHashes(html);
  assert.equal(hashes.length, 1);
  assert.match(hashes[0], /^'sha256-[A-Za-z0-9+/]+=*'$/);
  assert.ok(build({ file: "x", features: [] }, html).includes(hashes[0]));
});
