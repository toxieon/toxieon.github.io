"use strict";
// iOS home-screen icons: every app (except Timesheet, which keeps its own) has opaque
// PNG icons rendered from the suite art, and its page links them. See render-app-icons.cjs.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { APPS, SIZES, TOLERANCE, build, inspect, pixelDiff, encodeRGB } = require("./render-app-icons.cjs");
const ROOT = path.join(__dirname, "..");

test("app icons are opaque RGB PNGs at 180/192/512 and match the suite art", () => {
  for (const o of build()) {
    const file = path.join(ROOT, o.file);
    assert.ok(fs.existsSync(file), `${o.file} missing: run npm run icons:render`);
    const buf = fs.readFileSync(file);
    assert.deepEqual(inspect(buf, o.size), [], o.file);
    const r = pixelDiff(buf, o.rgb, o.size);
    assert.ok(r.ok, `${o.file} is stale (max channel delta ${r.maxDelta}, mean ${r.meanDelta.toFixed(3)}): run npm run icons:render`);
  }
});

test("each app page links the apple-touch-icon, title and manifest; manifest icons exist", () => {
  for (const app of APPS) {
    const html = fs.readFileSync(path.join(ROOT, app.folder, "index.html"), "utf8");
    assert.match(html, /<link rel="apple-touch-icon" sizes="180x180" href="icons\/icon-180\.png"/, app.folder);
    assert.match(html, new RegExp(`<meta name="apple-mobile-web-app-title" content="${app.title}"`), app.folder);
    assert.match(html, /<link rel="manifest" href="manifest\.json"/, app.folder);
    const m = JSON.parse(fs.readFileSync(path.join(ROOT, app.folder, "manifest.json"), "utf8"));
    // The Hub also lists dedicated full-bleed maskable PNGs (hub/hub-icons.test.cjs checks them);
    // the rendered suite art itself is only ever purpose "any".
    const extraMaskable = app.folder === "hub" ? (i) => i.purpose === "maskable" && /icons\/maskable-/.test(i.src) : () => false;
    const anyIcons = m.icons.filter((i) => !extraMaskable(i));
    assert.deepEqual(anyIcons.map((i) => i.sizes).sort(), ["192x192", "512x512"], app.folder);
    for (const i of m.icons) assert.ok(fs.existsSync(path.join(ROOT, app.folder, i.src)), `${app.folder}/${i.src}`);
    for (const i of anyIcons) assert.equal(i.purpose, "any", `${app.folder}: art is not maskable-safe`);
  }
  assert.ok(SIZES.includes(180));
});

test("service workers precache the new apple-touch-icon", () => {
  for (const app of APPS) {
    const sw = path.join(ROOT, app.folder, "sw.js");
    if (fs.existsSync(sw)) assert.match(fs.readFileSync(sw, "utf8"), /"\.\/icons\/icon-180\.png"/, app.folder);
  }
});

test("pixel check: tolerant of encoder/rounding noise, catches real art changes", () => {
  const o = build().find((x) => x.size === 180);
  const n = o.rgb.length;
  // same pixels re-encoded -> passes
  assert.ok(pixelDiff(encodeRGB(180, 180, o.rgb), o.rgb, 180).ok);
  // +-1 rounding noise on ~3% of channels -> passes
  const noisy = Buffer.from(o.rgb);
  for (let i = 0; i < n; i += 37) noisy[i] = noisy[i] < 255 ? noisy[i] + 1 : noisy[i] - 1;
  assert.ok(pixelDiff(encodeRGB(180, 180, noisy), o.rgb, 180).ok, "rounding noise should pass");
  // deliberate art change: a 12x12 block recoloured -> fails
  const changed = Buffer.from(o.rgb);
  for (let y = 80; y < 92; y++) for (let x = 80; x < 92; x++) { const i = (y * 180 + x) * 3; changed[i] = 255 - changed[i]; changed[i + 1] = 0; changed[i + 2] = 255; }
  assert.ok(!pixelDiff(encodeRGB(180, 180, changed), o.rgb, 180).ok, "a changed block must fail");
  // one pixel changed beyond the per-channel limit -> fails
  const one = Buffer.from(o.rgb); one[0] = (one[0] + 128) & 255;
  assert.ok(!pixelDiff(encodeRGB(180, 180, one), o.rgb, 180).ok, "one strongly changed pixel must fail");
  // a whole-image tint just within the per-channel limit -> fails on the mean
  const tint = Buffer.from(o.rgb.map((v) => Math.min(255, v + TOLERANCE.maxChannelDelta)));
  assert.ok(!pixelDiff(encodeRGB(180, 180, tint), o.rgb, 180).ok, "a whole-image tint must fail");
  // another app's icon, or the wrong size -> fails
  const other = build().find((x) => x.size === 180 && x.app.folder !== o.app.folder);
  assert.ok(!pixelDiff(other.png, o.rgb, 180).ok);
  assert.ok(!pixelDiff(build().find((x) => x.size === 192 && x.app === o.app).png, o.rgb, 180).ok);
});
