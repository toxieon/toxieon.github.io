"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const F = require("./format.js");

test("formatPctWithN appends sample size and signs ROI", () => {
  assert.equal(F.formatPctWithN(12.4, 26, { signed: true }), "+12.4% (n=26)");
  assert.equal(F.formatPctWithN(-3.5, 12, { signed: true }), "-3.5% (n=12)");
  assert.equal(F.formatPctWithN(0, 4, { signed: true }), "+0.0% (n=4)");
  assert.equal(F.formatPctWithN(32.08, 40), "32.1% (n=40)");
  assert.equal(F.formatPctWithN(NaN, 3), "— (n=3)");
  assert.equal(F.formatPctWithN(10, undefined), "10.0% (n=0)");
});

test("isSmallSample is true below 30 bets", () => {
  assert.equal(F.isSmallSample(26), true);
  assert.equal(F.isSmallSample(0), true);
  assert.equal(F.isSmallSample(29), true);
  assert.equal(F.isSmallSample(30), false);
  assert.equal(F.isSmallSample(100), false);
});

test("hypSampleN prefers hyp.bets and falls back", () => {
  assert.equal(F.hypSampleN({ bets: 80 }, 26), 80);
  assert.equal(F.hypSampleN({}, 26), 26);
  assert.equal(F.hypSampleN(null, 10), 10);
  assert.equal(F.hypSampleN({ bets: 0 }, 10), 0);
});

test("formatDataSince keeps 6 Nov headline and optional reconstructed note", () => {
  assert.equal(
    F.formatDataSince({ data_since: "2026-11-06", picks: 100, staked_picks: 40 }),
    "Data since 6 Nov 2026 · 100 picks (40 staked)"
  );
  assert.equal(
    F.formatDataSince({ data_since: "2026-10-13", picks: 200, staked_picks: 40 }),
    "Data since 6 Nov 2026 · 200 picks (40 staked)"
  );
  assert.equal(
    F.formatDataSince(
      { data_since: "2026-10-13", picks: 200, staked_picks: 40 },
      { includeReconstructed: true }
    ),
    "Data since 6 Nov 2026 · 200 picks (40 staked) (incl. reconstructed from 13 Oct)"
  );
  assert.equal(
    F.formatDataSince(
      { data_since: "2026-11-06", picks: 100, staked_picks: 40 },
      { includeReconstructed: true }
    ),
    "Data since 6 Nov 2026 · 100 picks (40 staked)"
  );
  assert.equal(F.formatDataSince(null), "");
});

test("formatPicksStaked uses pick and staked counts", () => {
  assert.equal(F.formatPicksStaked(100, 40), "100 picks · 40 staked");
  assert.equal(F.formatPicksStaked(0, 0), "0 picks · 0 staked");
});

test("reconstructed toggle is hidden when unavailable or the block is empty", () => {
  assert.equal(F.reconstructedToggleVisible(undefined, {}), false);
  assert.equal(F.reconstructedToggleVisible({ reconstructed_available: false }, {
    with_price: { reconstructed: { summary: { picks: 4 } } },
  }), false);
  assert.equal(F.reconstructedToggleVisible({}, {
    with_price: { reconstructed: { summary: { picks: 4 } } },
  }), false);
  assert.equal(F.reconstructedToggleVisible({ reconstructed_available: true }, {
    with_price: { reconstructed: { summary: { picks: 0 } } },
    without_price: { reconstructed: { summary: { picks: 0 } } },
    agree: { reconstructed: { summary: { picks: 0 } } },
  }), false);
  assert.equal(F.reconstructedToggleVisible({ reconstructed_available: true }, {
    with_price: { reconstructed: { summary: { picks: 2 } } },
  }), true);
});
