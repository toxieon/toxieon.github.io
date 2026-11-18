"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const N = require("./normalise.js");

test("normalizeStatsPayload fills missing models and summary fields", () => {
  const out = N.normalizeStatsPayload({ generated_at: "2026-01-01T00:00:00Z" });
  assert.equal(out.generated_at, "2026-01-01T00:00:00Z");
  assert.deepEqual(out.range, { from: "", to: "" });
  for (const id of N.MODEL_IDS) {
    assert.deepEqual(out.models[id].summary, {
      bets: 0,
      wins: 0,
      strike_pct: 0,
      staked_units: 0,
      pl_units: 0,
      roi_pct: 0,
    });
    assert.deepEqual(out.models[id].daily, []);
    assert.deepEqual(out.models[id].recent, []);
  }
  assert.deepEqual(out.head_to_head.disagree_races, { count: 0, with_wins: 0, without_wins: 0 });
});

test("price bands sort in locked display order, not alphabetically", () => {
  const rows = [
    { label: "15+", bets: 1 },
    { label: "$1-2", bets: 2 },
    { label: "5-8", bets: 3 },
    { label: "2-3", bets: 4 },
  ].map(N.normBreakdownRow);
  const sorted = N.sortPriceBands(rows);
  assert.deepEqual(sorted.map((r) => r.label), ["$1-2", "2-3", "5-8", "15+"]);
});

test("normRecent coerces unknown result to void", () => {
  assert.equal(N.normRecent({ result: "won" }).result, "won");
  assert.equal(N.normRecent({ result: "LOST" }).result, "lost");
  assert.equal(N.normRecent({ result: "nope" }).result, "void");
});

test("empty breakdown arrays stay empty", () => {
  const m = N.normalizeStatsPayload({
    models: { with_price: { by_track: [], by_price_band: null } },
  });
  assert.deepEqual(m.models.with_price.by_track, []);
  assert.deepEqual(m.models.with_price.by_price_band, []);
});

test("head_to_head daily pl units are numeric", () => {
  const h = N.normHeadToHead({
    days: [{ date: "2026-11-01", with_price: "1.5", without_price: null, agree: -2 }],
    disagree_races: { count: "3", with_wins: 2, without_wins: 1 },
  });
  assert.equal(h.days[0].with_price, 1.5);
  assert.equal(h.days[0].without_price, 0);
  assert.equal(h.days[0].agree, -2);
  assert.equal(h.disagree_races.count, 3);
});