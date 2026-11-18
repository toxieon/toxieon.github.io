"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const D = require("./demo.js");

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

test("demo headline data starts on 6 Nov and has no reconstructed rows by default", () => {
  const s = D.generateDemoStats("all", "2026-11-18");
  assert.equal(s.meta.data_since, "2026-11-06");
  for (const id of ["with_price", "without_price", "agree"]) {
    const days = s.models[id].daily;
    assert.ok(days.length);
    assert.equal(days[0].date, "2026-11-06");
    assert.ok(days.every((d) => !d.reconstructed));
    assert.ok(s.models[id].recent.every((r) => !r.reconstructed));
    for (const d of days) {
      if (d.date < "2026-11-12") assert.equal(d.bets, d.picks);
      if (d.date >= "2026-11-12") assert.ok(d.picks > d.bets);
    }
  }
  assert.ok(s.head_to_head.days.every((d) => !d.reconstructed));
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
  assert.equal(on.meta.data_since, "2026-10-13");
  const rec = on.models.without_price.daily.filter((d) => d.reconstructed);
  const live = on.models.without_price.daily.filter((d) => !d.reconstructed);
  assert.equal(rec[0].date, "2026-10-13");
  assert.equal(rec[rec.length - 1].date, "2026-11-05");
  assert.equal(live[0].date, "2026-11-06");
  assert.ok(on.models.with_price.recent.some((r) => r.reconstructed));
  assert.ok(on.head_to_head.days.some((d) => d.reconstructed));
  assertFakeNames(on);
});

test("staked-only demo does not change when reconstructed would be on", () => {
  const a = D.generateStakedDemoStats("2026-11-18");
  const b = D.generateDemoStats("2026-11-12", "2026-11-18", { includeReconstructed: true });
  assert.equal(a.range.from, "2026-11-12");
  assert.ok(a.models.without_price.daily.every((d) => d.date >= "2026-11-12"));
  assert.ok(!b.models.without_price.daily.some((d) => d.reconstructed));
});
