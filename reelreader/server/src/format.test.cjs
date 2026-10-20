"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { formatSize } = require("./format.cjs");
const mediaTools = require("./media-tools.cjs");

test("formatSize keeps one decimal under 10 MB and none above", () => {
  assert.equal(formatSize(5 * 1024 * 1024), "5.0 MB");
  assert.equal(formatSize(1.25 * 1024 * 1024), "1.3 MB");
  assert.equal(formatSize(200 * 1024 * 1024), "200 MB");
});

test("media-tools still re-exports the shared formatSize", () => {
  assert.equal(mediaTools.formatSize, formatSize);
});
