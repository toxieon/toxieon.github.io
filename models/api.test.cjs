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