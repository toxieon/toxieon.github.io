"use strict";
// S-02: user-entered text (circuit, project, board and device names) must be HTML-escaped before it goes into a template.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const SRC = fs.readFileSync(path.join(__dirname, "app.js"), "utf8");

function fn(name) {
  const m = SRC.match(new RegExp(`^function ${name}\\b[\\s\\S]*?^}`, "m")) || SRC.match(new RegExp(`^function ${name}\\b.*$`, "m"));
  assert.ok(m, `${name} not found in swb/app.js`);
  return m[0];
}

const ctx = vm.createContext({ I: { warn: "<svg></svg>" } });
vm.runInContext(`${fn("escHtml")}\n${fn("renderOverloadBanner")}`, ctx);
const XSS = `<img src=x onerror="alert(1)">`;

test("escHtml escapes markup, quotes and keeps 0", () => {
  assert.equal(ctx.escHtml(XSS), "&lt;img src=x onerror=&quot;alert(1)&quot;&gt;");
  assert.equal(ctx.escHtml("it's & ok"), "it&#39;s &amp; ok");
  assert.equal(ctx.escHtml(0), "0");
  assert.equal(ctx.escHtml(null), "");
  assert.equal(ctx.escHtml(undefined), "");
});

test("overload banner escapes circuit names", () => {
  const html = ctx.renderOverloadBanner([{ name: XSS }, { name: "Oven & hob" }]);
  assert.ok(!html.includes("<img"), html);
  assert.ok(html.includes("&lt;img src=x onerror=&quot;alert(1)&quot;&gt;, Oven &amp; hob"), html);
  assert.ok(html.includes("2 overloaded circuits"));
});

test("no template in swb/app.js interpolates a name/label/notes/address/email field without escHtml", () => {
  const allowed = [/CSS\.escape\(snap\.name\)/, /<span>\$\{n\.label\}<\/span>/, /title: `\$\{project\.name\}_SWB`/, /toast\(/, /confirm\(/, /const devChips=/];
  const bad = [];
  SRC.split("\n").forEach((line, i) => {
    if (!/\$\{[^}]*\.(name|label|notes|address|email|picture|suggestion)\b[^}]*\}/.test(line)) return;
    if (/escHtml\(/.test(line) || allowed.some((re) => re.test(line))) return;
    bad.push(`${i + 1}: ${line.trim().slice(0, 120)}`);
  });
  assert.deepEqual(bad, []);
});
