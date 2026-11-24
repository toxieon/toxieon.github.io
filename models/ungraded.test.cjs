"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const N = require("./normalise.js");
const F = require("./format.js");

// Shaped like GET /api/model-stats when TipBot has frozen picks but only void
// (abandoned) races have a stored result: picks counted, nothing graded.
// Synthetic names and ids only.
function zeroSummary(picks) {
  return {
    picks, bets: 0, wins: 0, losses: 0, strike_pct: 0, staked_units: 0, pl_units: 0, roi_pct: 0,
    hyp: { bets: 0, wins: 0, strike_pct: 0, pl_units: 0, roi_pct: 0 },
  };
}
function voidPick(name, price) {
  return {
    day: "2026-11-11", event_id: "ev-" + name, runner_id: "rn-" + name, name, number: 3,
    track: "Sample Park", race_number: 4, start_at: "2026-11-11T06:35:00+00:00", bet_type: "win",
    stake: 1.0, price, p_win: 0.5, result: "void", counts: false, pl_units: 0, hyp_pl_units: 0,
  };
}
function liveShaped() {
  const block = (picks, recent) => ({
    summary: zeroSummary(picks),
    daily: [{ date: "2026-11-11", picks, bets: 0, wins: 0, losses: 0, pl_units: 0, cum_units: 0, hyp_bets: 0, hyp_wins: 0, hyp_pl_units: 0, hyp_cum_units: 0 }],
    by_track: [], by_price_band: [], by_stake_bracket: [], by_bet_type: [], by_weekday: [],
    by_threshold: [], by_min_threshold: [], recent,
  });
  return {
    generated_at: "2026-11-24T03:00:00+00:00",
    range: { from: "2026-10-26", to: "2026-11-24" },
    scope: "members",
    meta: { data_since: "2026-11-06", reconstructed_available: false },
    calendar: [{ date: "2026-11-11", picks: 3, bets: 0, wins: 0, losses: 0, pl_units: 0 }],
    models: {
      with_price: block(3, [voidPick("Sample Alpha", 3.6), voidPick("Sample Beta", 2.4), voidPick("Sample Gamma", 1.6)]),
      without_price: block(3, [voidPick("Sample Delta", 20)]),
      agree: block(0, []),
    },
  };
}

test("live-shaped payload with picks but nothing graded is flagged", () => {
  const data = N.normalizeStatsPayload(liveShaped());
  assert.equal(data.models.with_price.summary.picks, 3);
  assert.equal(data.models.with_price.summary.bets, 0);
  assert.equal(data.models.with_price.recent.length, 3);
  assert.equal(F.ungradedPicks(data.models), 3);
  assert.match(F.UNGRADED_MSG, /no graded results/);
});

test("any graded bet (staked or flat 1u) clears the ungraded notice", () => {
  const raw = liveShaped();
  raw.models.agree.summary.bets = 1;
  assert.equal(F.ungradedPicks(N.normalizeStatsPayload(raw).models), 0);
  const raw2 = liveShaped();
  raw2.models.without_price.summary.hyp.bets = 2;
  raw2.models.without_price.summary.hyp.wins = 1;
  assert.equal(F.ungradedPicks(N.normalizeStatsPayload(raw2).models), 0);
});

test("no picks at all is not the ungraded case", () => {
  const raw = liveShaped();
  for (const id of Object.keys(raw.models)) raw.models[id].summary.picks = 0;
  assert.equal(F.ungradedPicks(N.normalizeStatsPayload(raw).models), 0);
  assert.equal(F.ungradedPicks(null), 0);
});

test("page wires the notice and the staked empty copy", () => {
  const app = fs.readFileSync(path.join(__dirname, "app.js"), "utf8");
  const html = fs.readFileSync(path.join(__dirname, "index.html"), "utf8");
  assert.match(app, /FMT\.ungradedPicks\(state\.data\.models\)/);
  assert.match(app, /FMT\.STAKED_UNGRADED_MSG/);
  assert.ok(html.includes(">" + F.STAKED_EMPTY_MSG + "<"));
});
