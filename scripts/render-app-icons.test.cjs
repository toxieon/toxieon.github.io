"use strict";
// iOS home-screen icons: every app (except Timesheet, which keeps its own) has opaque
// PNG icons rendered from the suite art, and its page links them. See render-app-icons.cjs.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { APPS, SIZES, build, inspect } = require("./render-app-icons.cjs");
const ROOT = path.join(__dirname, "..");

test("app icons are opaque RGB PNGs at 180/192/512 and match the suite art", () => {
  for (const o of build()) {
    const file = path.join(ROOT, o.file);
    assert.ok(fs.existsSync(file), `${o.file} missing: run npm run icons:render`);
    const buf = fs.readFileSync(file);
    assert.deepEqual(inspect(buf, o.size), [], o.file);
    assert.ok(buf.equals(o.png), `${o.file} is stale: run npm run icons:render`);
  }
});

test("each app page links the apple-touch-icon, title and manifest; manifest icons exist", () => {
  for (const app of APPS) {
    const html = fs.readFileSync(path.join(ROOT, app.folder, "index.html"), "utf8");
    assert.match(html, /<link rel="apple-touch-icon" sizes="180x180" href="icons\/icon-180\.png"/, app.folder);
    assert.match(html, new RegExp(`<meta name="apple-mobile-web-app-title" content="${app.title}"`), app.folder);
    assert.match(html, /<link rel="manifest" href="manifest\.json"/, app.folder);
    const m = JSON.parse(fs.readFileSync(path.join(ROOT, app.folder, "manifest.json"), "utf8"));
    const sizes = m.icons.map((i) => i.sizes).sort();
    assert.deepEqual(sizes, ["192x192", "512x512"], app.folder);
    for (const i of m.icons) {
      assert.equal(i.purpose, "any", `${app.folder}: art is not maskable-safe`);
      assert.ok(fs.existsSync(path.join(ROOT, app.folder, i.src)), `${app.folder}/${i.src}`);
    }
  }
  assert.ok(SIZES.includes(180));
});

test("service workers precache the new apple-touch-icon", () => {
  for (const app of APPS) {
    const sw = path.join(ROOT, app.folder, "sw.js");
    if (fs.existsSync(sw)) assert.match(fs.readFileSync(sw, "utf8"), /"\.\/icons\/icon-180\.png"/, app.folder);
  }
});
