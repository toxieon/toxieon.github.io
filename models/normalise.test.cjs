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
      picks: 0,
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
    { label: "$15+", bets: 1 },
    { label: "$1-2", bets: 2 },
    { label: "$5-8", bets: 3 },
    { label: "$2-3", bets: 4 },
  ].map(N.normBreakdownRow);
  const sorted = N.sortPriceBands(rows);
  assert.deepEqual(sorted.map((r) => r.label), ["$1-2", "$2-3", "$5-8", "$15+"]);
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

test("staked-only partial payload: models with summary and daily only", () => {
  const out = N.normalizeStatsPayload({
    range: { from: "2026-11-12", to: "2026-11-18" },
    models: {
      without_price: {
        summary: { bets: 12, wins: 4, strike_pct: 33.3, staked_units: 20, pl_units: 3.5, roi_pct: 17.5 },
        daily: [{ date: "2026-11-12", bets: 2, wins: 1, pl_units: 1, cum_units: 1 }],
      },
    },
  });
  assert.equal(out.models.without_price.summary.bets, 12);
  assert.equal(out.models.without_price.daily.length, 1);
  assert.equal(out.models.with_price.summary.bets, 0);
  assert.deepEqual(out.models.agree.by_track, []);
  assert.deepEqual(out.head_to_head.days, []);
});

test("demo daily rows emit cum_units and hyp_cum_units (not legacy cum keys)", () => {
  const D = require("./demo.js");
  const stats = D.generateDemoStats("2026-11-01", "2026-11-07");
  for (const id of ["with_price", "without_price", "agree"]) {
    const day = stats.models[id].daily[0];
    assert.ok(Object.prototype.hasOwnProperty.call(day, "cum_units"));
    assert.ok(Object.prototype.hasOwnProperty.call(day, "hyp_cum_units"));
    assert.equal(Object.prototype.hasOwnProperty.call(day, "cum"), false);
    assert.equal(Object.prototype.hasOwnProperty.call(day, "hyp_cum"), false);
  }
  const staked = D.generateStakedDemoStats("2026-11-18");
  const stakedDay = staked.models.without_price.daily[0];
  assert.ok(Object.prototype.hasOwnProperty.call(stakedDay, "hyp_cum_units"));
});

test("absent hyp meta and by_weekday tolerated", () => {
  const out = N.normalizeStatsPayload({
    models: { with_price: { summary: { bets: 2, pl_units: 1 }, daily: [] } },
  });
  assert.equal(out.models.with_price.summary.hyp, undefined);
  assert.equal(out.models.with_price.meta, undefined);
  assert.deepEqual(out.models.with_price.by_weekday, []);
  assert.equal(out.meta, undefined);
});

test("hyp meta and by_weekday normalise when present", () => {
  const out = N.normalizeStatsPayload({
    meta: { data_since: "2026-10-03", picks: 100, staked_picks: 40 },
    models: {
      with_price: {
        summary: { bets: 1, hyp: { pl_units: 2, roi_pct: 10, bets: 1 } },
        by_weekday: [{ label: "Wed", picks: 5, hyp_pl_units: 1, hyp_roi_pct: 5 }],
      },
    },
  });
  assert.equal(out.meta.picks, 100);
  assert.equal(out.models.with_price.summary.hyp.pl_units, 2);
  assert.equal(out.models.with_price.by_weekday[0].label, "Wed");
  assert.equal(N.normRecent({ hyp_pl_units: -1 }).hyp_pl_units, -1);
});

test("demo from=all and extended fields", () => {
  const D = require("./demo.js");
  const s = D.generateDemoStats("all", "2026-11-07");
  assert.equal(s.range.from, "2026-11-06");
  assert.ok(s.meta && s.meta.picks);
  assert.equal(s.models.with_price.by_weekday.length, 7);
  assert.ok(s.models.with_price.summary.hyp);
});

test("normDaily prefers cum_units and hyp_cum_units over legacy cum keys", () => {
  assert.equal(N.normDaily({ cum_units: 3, cum: 99 }).cum_units, 3);
  assert.equal(N.normDaily({ cum: 2 }).cum_units, 2);
  assert.equal(N.normDaily({ hyp_cum_units: 5, hyp_cum: 1 }).hyp_cum_units, 5);
  assert.equal(N.normDaily({ hyp_cum: 4 }).hyp_cum_units, 4);
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
test("normDaily and normRecent keep reconstructed flag only when set", () => {
  assert.equal(N.normDaily({ date: "2026-10-13", reconstructed: true }).reconstructed, true);
  assert.equal(N.normDaily({ date: "2026-11-06" }).reconstructed, false);
  assert.equal(N.normRecent({ reconstructed: true }).reconstructed, true);
  assert.equal(N.normRecent({}).reconstructed, undefined);
});

test("filterReconstructed drops flagged rows when include is off", () => {
  const raw = N.normalizeStatsPayload({
    models: {
      with_price: {
        daily: [
          { date: "2026-10-13", bets: 1, reconstructed: true },
          { date: "2026-11-06", bets: 2 },
        ],
        recent: [
          { date: "2026-10-14", horse: "Demo Runner One", reconstructed: true },
          { date: "2026-11-07", horse: "Fake Horse Alpha" },
        ],
      },
    },
    head_to_head: {
      days: [
        { date: "2026-10-13", with_price: 1, reconstructed: true },
        { date: "2026-11-06", with_price: 2 },
      ],
    },
  });
  const hidden = N.filterReconstructed(raw, false);
  assert.deepEqual(hidden.models.with_price.daily.map((d) => d.date), ["2026-11-06"]);
  assert.deepEqual(hidden.models.with_price.recent.map((d) => d.date), ["2026-11-07"]);
  assert.deepEqual(hidden.head_to_head.days.map((d) => d.date), ["2026-11-06"]);
  const shown = N.filterReconstructed(raw, true);
  assert.equal(shown.models.with_price.daily.length, 2);
  assert.equal(shown.models.with_price.daily[0].reconstructed, true);
});

test("normalizeStatsPayload ignores top-level summary, daily and by_* keys", () => {
  const out = N.normalizeStatsPayload({
    summary: { bets: 999, pl_units: 99, picks: 99 },
    daily: [{ date: "2026-11-06", pl_units: 99, cum_units: 99 }],
    by_weekday: [{ label: "Wed", bets: 99 }],
    meta: {
      data_since: "2026-11-06",
      picks: 3,
      staked_picks: 2,
      with_price: { data_since: "2026-11-06", picks: 3, staked_picks: 2 },
    },
    models: {
      with_price: { summary: { picks: 3, bets: 2, pl_units: 1, hyp: { bets: 3, pl_units: 2 } } },
    },
  });
  assert.equal(out.summary, undefined);
  assert.equal(out.daily, undefined);
  assert.equal(out.by_weekday, undefined);
  assert.equal(out.models.with_price.summary.picks, 3);
  assert.equal(out.models.with_price.summary.bets, 2);
  assert.equal(out.models.with_price.hyp.bets, 3);
  assert.equal(out.models.with_price.meta.picks, 3);
  assert.equal(out.meta.picks, 3);
});

test("model reconstructed block normalises and is stripped when the toggle is off", () => {
  const raw = N.normalizeStatsPayload({
    meta: { data_since: "2026-10-13", picks: 2, staked_picks: 2, reconstructed_available: true },
    models: {
      with_price: {
        summary: { picks: 2, bets: 2, pl_units: 1 },
        daily: [
          { date: "2026-10-20", reconstructed: true, picks: 1, pl_units: 0.5, cum_units: 0.5 },
          { date: "2026-11-06", reconstructed: false, picks: 2, pl_units: 1, cum_units: 1 },
        ],
        reconstructed: {
          summary: { picks: 4, bets: 4, pl_units: 0.5, hyp: { bets: 4, pl_units: 0.5 } },
          hyp: { bets: 4, pl_units: 0.5 },
          by_weekday: [{ label: "Tue", picks: 1, hyp: { bets: 1 } }],
        },
      },
    },
  });
  assert.equal(raw.models.with_price.reconstructed.summary.picks, 4);
  assert.equal(raw.models.with_price.reconstructed.hyp.bets, 4);
  assert.equal(raw.meta.reconstructed_available, true);
  const hidden = N.filterReconstructed(raw, false);
  assert.equal(hidden.models.with_price.reconstructed, undefined);
  assert.deepEqual(hidden.models.with_price.daily.map((d) => d.date), ["2026-11-06"]);
  assert.equal(hidden.models.with_price.summary.pl_units, 1);
  assert.equal(hidden.models.with_price.daily[0].cum_units, 1);
});

test("weekday rows keep a hyp block with hyp.bets", () => {
  const row = N.normWeekdayRow({
    label: "Sat", picks: 10, bets: 4, hyp_pl_units: 2, hyp_roi_pct: 20, hyp: { bets: 8, pl_units: 2, roi_pct: 25 },
  });
  assert.equal(row.hyp.bets, 8);
  assert.equal(row.bets, 4);
});
