"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const A = require("./api.js");

test("buildModelStatsUrl includes staked_only and fixed from for staked fetch", () => {
  const url = A.buildModelStatsUrl("https://afl-tipster-bot.onrender.com", "2026-11-12", "2026-11-19", {
    stakedOnly: true,
  });
  assert.match(url, /^https:\/\/afl-tipster-bot\.onrender\.com\/api\/owner\/model-stats\?/);
  const q = new URL(url).searchParams;
  assert.equal(q.get("from"), "2026-11-12");
  assert.equal(q.get("to"), "2026-11-19");
  assert.equal(q.get("staked_only"), "1");
});

test("buildModelStatsUrl omits staked_only by default", () => {
  const url = A.buildModelStatsUrl("https://example.com/", "2026-01-01", "2026-01-31");
  const q = new URL(url).searchParams;
  assert.equal(q.get("staked_only"), null);
});

test("buildModelStatsUrl passes from=all for all-time range", () => {
  const url = A.buildModelStatsUrl("https://example.com", "all", "2026-11-19");
  assert.equal(new URL(url).searchParams.get("from"), "all");
  assert.equal(new URL(url).searchParams.get("to"), "2026-11-19");
  assert.equal(new URL(url).searchParams.get("staked_only"), null);
});
test("buildModelStatsUrl adds include_reconstructed only when requested", () => {
  const off = A.buildModelStatsUrl("https://example.com", "all", "2026-11-18");
  assert.equal(new URL(off).searchParams.get("include_reconstructed"), null);
  const on = A.buildModelStatsUrl("https://example.com", "all", "2026-11-18", {
    includeReconstructed: true,
  });
  assert.equal(new URL(on).searchParams.get("include_reconstructed"), "1");
  const staked = A.buildModelStatsUrl("https://example.com", "2026-11-12", "2026-11-18", {
    stakedOnly: true,
    includeReconstructed: true,
  });
  const q = new URL(staked).searchParams;
  assert.equal(q.get("staked_only"), "1");
  assert.equal(q.get("include_reconstructed"), "1");
});
