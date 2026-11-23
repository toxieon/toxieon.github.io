"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const D = require("./demo.js");
const N = require("./normalise.js");
const F = require("./format.js");

const FAKE_TRACKS = new Set(["Demo Park", "Sample Oval", "Fake Track West"]);
const FAKE_HORSES = new Set(["Demo Runner One", "Fake Horse Alpha", "Sample Steed", "Test Nag Four"]);

function assertFakeNames(stats) {
  for (const id of ["with_price", "without_price", "agree"]) {
    for (const r of stats.models[id].recent) {
      assert.ok(FAKE_TRACKS.has(r.track), "unexpected track " + r.track);
      assert.ok(FAKE_HORSES.has(r.horse), "unexpected horse " + r.horse);
    }
  }
}

test("demo headline data starts on 6 Nov and has no reconstructed keys by default", () => {
  const s = D.generateDemoStats("all", "2026-11-18");
  assert.equal(s.range.from, "2026-11-06");
  assert.equal(s.meta.data_since, "2026-11-06");
  assert.equal(s.meta.reconstructed_available, undefined);
  assert.equal(s.summary, undefined);
  for (const id of ["with_price", "without_price", "agree"]) {
    const days = s.models[id].daily;
    assert.ok(days.length);
    assert.equal(days[0].date, "2026-11-06");
    assert.ok(days.every((d) => !d.reconstructed));
    assert.ok(s.models[id].recent.every((r) => !r.reconstructed));
    assert.equal(s.models[id].reconstructed, undefined);
    assert.ok(s.models[id].hyp);
    assert.equal(s.models[id].hyp.bets, s.models[id].summary.hyp.bets);
    assert.ok("picks" in s.models[id].summary);
    for (const d of days) {
      if (d.date < "2026-11-12") assert.equal(d.bets, d.picks);
      if (d.date >= "2026-11-12") assert.ok(d.picks > d.bets);
    }
    assert.deepEqual(s.models[id].by_price_band.map((r) => r.label), ["$1-2", "$2-3", "$3-5", "$5-8", "$8-15", "$15+"]);
    assert.deepEqual(s.models[id].by_stake_bracket.map((r) => r.label), ["2u", "1u", "0.5u", "no bet"]);
    assert.ok(s.models[id].by_weekday[0].hyp);
  }
  assertFakeNames(s);
});

test("Without has 25 staked picks from 12 Nov through 18 Nov", () => {
  const s = D.generateDemoStats("all", "2026-11-18");
  const since = s.models.without_price.daily
    .filter((d) => d.date >= "2026-11-12")
    .reduce((n, d) => n + d.bets, 0);
  assert.equal(since, 25);
  const staked = D.generateStakedDemoStats("2026-11-18");
  assert.equal(staked.models.without_price.summary.bets, 25);
  assert.ok(staked.models.without_price.daily.every((d) => !d.reconstructed));
});

test("reconstructed rows appear only when includeReconstructed is set", () => {
  const off = D.generateDemoStats("all", "2026-11-18");
  assert.ok(!off.models.with_price.daily.some((d) => d.date < "2026-11-06"));
  const on = D.generateDemoStats("all", "2026-11-18", { includeReconstructed: true });
  assert.equal(on.meta.reconstructed_available, true);
  assert.equal(on.meta.reconstructed.from, "2026-10-13");
  const rec = on.models.without_price.daily.filter((d) => d.reconstructed);
  const live = on.models.without_price.daily.filter((d) => !d.reconstructed);
  assert.equal(rec[0].date, "2026-10-13");
  assert.equal(rec[rec.length - 1].date, "2026-11-05");
  assert.equal(live[0].date, "2026-11-06");
  assert.ok(on.models.with_price.recent.some((r) => r.reconstructed));
  assert.ok(on.head_to_head.days.some((d) => d.reconstructed));
  assert.ok(on.models.with_price.reconstructed.summary.picks > 0);
  assert.ok(F.reconstructedToggleVisible(on.meta, on.models));
  assertFakeNames(on);
});

test("frozen totals are unchanged by reconstructed data", () => {
  const off = D.generateDemoStats("all", "2026-11-18");
  const on = D.generateDemoStats("all", "2026-11-18", { includeReconstructed: true });
  for (const id of ["with_price", "without_price", "agree"]) {
    assert.deepEqual(on.models[id].summary, off.models[id].summary);
    assert.deepEqual(on.models[id].hyp, off.models[id].hyp);
    assert.deepEqual(on.models[id].by_weekday, off.models[id].by_weekday);
    const offFrozen = off.models[id].daily.filter((d) => !d.reconstructed);
    const onFrozen = on.models[id].daily.filter((d) => !d.reconstructed);
    assert.deepEqual(onFrozen, offFrozen);
    assert.equal(onFrozen[onFrozen.length - 1].cum_units, offFrozen[offFrozen.length - 1].cum_units);
  }
  assert.equal(on.meta.picks, off.meta.picks);
  assert.equal(on.meta.staked_picks, off.meta.staked_picks);
});

test("demo variant with reconstructed_available false hides the toggle", () => {
  const s = D.generateDemoStats("all", "2026-11-18", {
    includeReconstructed: true,
    reconstructedAvailable: false,
  });
  assert.equal(s.meta.reconstructed_available, false);
  assert.equal(s.models.with_price.reconstructed.summary.picks, 0);
  assert.ok(!s.models.with_price.daily.some((d) => d.reconstructed));
  assert.equal(F.reconstructedToggleVisible(s.meta, s.models), false);
  const normalised = N.normalizeStatsPayload(s);
  assert.equal(F.reconstructedToggleVisible(normalised.meta, normalised.models), false);
});

test("staked-only demo does not change when reconstructed would be on", () => {
  const a = D.generateStakedDemoStats("2026-11-18");
  const b = D.generateDemoStats("2026-11-12", "2026-11-18", { includeReconstructed: true });
  assert.equal(a.range.from, "2026-11-12");
  assert.ok(a.models.without_price.daily.every((d) => d.date >= "2026-11-12"));
  assert.ok(!b.models.without_price.daily.some((d) => d.reconstructed));
});

test("demo payload carries the 0.98.0 additions: scope, calendar, by_threshold, by_min_threshold, daily losses/hyp", () => {
  const D = require("./demo.js");
  const raw = D.generateDemoStats("all", "2026-11-20");
  assert.equal(raw.scope, "server");
  assert.ok(raw.calendar.length > 0);
  assert.ok(raw.calendar.every((d) => d.with_price && d.without_price && d.agree));
  const m = raw.models.with_price;
  assert.deepEqual(m.by_threshold.map((r) => r.label), D.THRESHOLDS);
  assert.equal(m.by_threshold[0].bets, 0);
  assert.deepEqual(m.by_min_threshold.map((r) => r.min_pct), D.MIN_THRESHOLDS);
  assert.ok(["losses", "hyp_bets", "hyp_wins"].every((k) => k in m.daily[0]));
});
