"use strict";

// Timesheet uses the shared helpers instead of local copies:
// pad2 comes from TsTime, distances from NDSiteMatch, and the old
// assets/job-locator.js script is no longer loaded.

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const TsTime = require("./ts-time.js");

const html = fs.readFileSync(path.join(__dirname, "index.html"), "utf8");

test("TsTime exports pad2 with the same output the local copy gave", () => {
  for (const n of [0, 5, 9, 10, 23, 59, 100, 3600]) {
    assert.equal(TsTime.pad2(n), String(n).padStart(2, "0"));
  }
});

test("index.html no longer defines its own pad2 or distanceMetres", () => {
  assert.doesNotMatch(html, /function pad2\(/);
  assert.match(html, /const pad2 = TsTime\.pad2;/);
  assert.doesNotMatch(html, /function distanceMetres\(/);
  assert.doesNotMatch(html, /(?<![\w.])distanceMetres\(/);
});

test("job-locator.js is not loaded and NDJobLocator is not used", () => {
  assert.doesNotMatch(html, /job-locator\.js/);
  assert.doesNotMatch(html, /NDJobLocator/);
  // ts-time.js must load before the inline app script that aliases pad2.
  assert.ok(html.indexOf('src="ts-time.js') < html.indexOf("const pad2 = TsTime.pad2;"));
});
