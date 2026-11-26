const test = require("node:test");
const assert = require("node:assert/strict");
const BP = require("./bestpick.js");

const day = (date, horse, price, result) => ({ date, pick: horse ? { horse, price, result } : null });

test("Brandon's example: $20 at 1.5 makes $30, then at 2.0 makes $60", () => {
  const r = BP.computeLadder([day("2026-12-01", "Fake Flyer", 1.5, "won"), day("2026-12-02", "Demo Dasher", 2, "won")],
    { startDate: "2026-12-01", stake: 20 });
  assert.deepEqual(r.rows.map((x) => [x.stake, x.bankAfter]), [[20, 30], [30, 60]]);
  assert.equal(r.currentBank, 60);
  assert.equal(r.peakBank, 60);
  assert.equal(r.longestWinStreak, 2);
  assert.equal(r.cashIn, 20);
  assert.equal(r.netProfit, 40);
  assert.equal(r.resets, 0);
});

test("reset on loss starts a new ladder at the starting stake on the next pick", () => {
  const days = [
    day("2026-12-01", "Fake Flyer", 1.5, "won"),
    day("2026-12-02", "Demo Dasher", 2, "lost"),
    day("2026-12-03", "Sample Sprinter", 3, "won"),
  ];
  const r = BP.computeLadder(days, { startDate: "2026-12-01", stake: 20, onLoss: "reset" });
  assert.deepEqual(r.rows.map((x) => [x.stake, x.bankAfter, x.ladder]), [[20, 30, 1], [30, 0, 1], [20, 60, 2]]);
  assert.equal(r.resets, 1);
  assert.equal(r.laddersStarted, 2);
  assert.equal(r.cashIn, 40);
  assert.equal(r.currentBank, 60);
  assert.equal(r.netProfit, 20);
  assert.equal(r.peakBank, 60);
  assert.equal(r.longestWinStreak, 1);
});

test("a loss as the last day leaves the bank at 0, awaiting a new ladder, without counting it as cash in", () => {
  const r = BP.computeLadder([day("2026-12-01", "Fake Flyer", 2, "won"), day("2026-12-02", "Demo Dasher", 2, "lost")],
    { stake: 20 });
  assert.equal(r.currentBank, 0);
  assert.equal(r.awaitingNewLadder, true);
  assert.equal(r.cashIn, 20);
  assert.equal(r.netProfit, -20);
  assert.equal(r.peakBank, 40);
});

test("stop on loss busts the ladder and later days are not bet", () => {
  const days = [
    day("2026-12-01", "Fake Flyer", 1.5, "won"),
    day("2026-12-02", "Demo Dasher", 2, "lost"),
    day("2026-12-03", "Sample Sprinter", 3, "won"),
  ];
  const r = BP.computeLadder(days, { startDate: "2026-12-01", stake: 20, onLoss: "stop" });
  assert.equal(r.busted, true);
  assert.equal(r.rows[2].stake, null);
  assert.equal(r.rows[2].note, "stopped");
  assert.equal(r.currentBank, 0);
  assert.equal(r.resets, 0);
  assert.equal(r.cashIn, 20);
  assert.equal(r.netProfit, -20);
  assert.equal(r.peakBank, 30);
});

test("scratched, abandoned and no-pick days carry the bank over with no bet", () => {
  const days = [
    day("2026-12-01", "Fake Flyer", 2, "won"),
    day("2026-12-02", "Demo Dasher", 4, "scratched"),
    day("2026-12-03", null),
    day("2026-12-04", "Mock Meteor", 5, "abandoned"),
    day("2026-12-05", "Test Trotter", 1.5, "won"),
  ];
  const r = BP.computeLadder(days, { stake: 20 });
  assert.deepEqual(r.rows.map((x) => [x.stake, x.bankAfter]), [[20, 40], [null, 40], [null, 40], [null, 40], [40, 60]]);
  assert.equal(r.longestWinStreak, 2, "carry days do not break a streak");
  assert.equal(r.currentBank, 60);
});

test("pending days are shown but not counted", () => {
  const days = [day("2026-12-01", "Fake Flyer", 2, "won"), day("2026-12-02", "Demo Dasher", 3, "pending")];
  const r = BP.computeLadder(days, { stake: 20 });
  assert.equal(r.rows[1].result, "pending");
  assert.equal(r.rows[1].stake, null);
  assert.equal(r.rows[1].bankAfter, 40);
  assert.equal(r.pending, 1);
  assert.equal(r.currentBank, 40);
  assert.equal(r.netProfit, 20);
});

test("start date skips earlier days and defaults to the earliest pick", () => {
  const days = [day("2026-12-01", null), day("2026-12-02", "Fake Flyer", 2, "lost"), day("2026-12-03", "Demo Dasher", 2, "won")];
  assert.equal(BP.computeLadder(days, { stake: 10 }).startDate, "2026-12-02");
  const r = BP.computeLadder(days, { startDate: "2026-12-03", stake: 10 });
  assert.equal(r.rows.length, 1);
  assert.equal(r.currentBank, 20);
});

test("normaliseBestPicks accepts days, best_picks or a bare array, and null horse is no pick", () => {
  const raw = [
    { date: "2026-12-02", horse: "Fake Flyer", track: "Demo Park", race_no: 3, price: 2.2, p_win: 41, result: "Won", pl_units: 1.2 },
    { date: "2026-12-01", horse: null },
    { date: "bad" },
  ];
  for (const payload of [{ days: raw }, { best_picks: raw }, raw]) {
    const out = BP.normaliseBestPicks(payload);
    assert.equal(out.length, 2);
    assert.equal(out[0].date, "2026-12-01");
    assert.equal(out[0].pick, null);
    assert.equal(out[1].pick.result, "won");
    assert.equal(out[1].pick.p_win, 0.41);
  }
  assert.equal(BP.resultCode(null), "pending");
  assert.equal(BP.resultCode("Abandoned"), "abandoned");
  assert.deepEqual(BP.normaliseBestPicks({ ok: false }), []);
});

test("best picks are requested from 4 Nov 2026, the first 7am best-pick lock", () => {
  const cfg = require("node:fs").readFileSync(require("node:path").join(__dirname, "config.js"), "utf8");
  assert.match(cfg, /BEST_PICKS_FROM: "2026-11-04"/);
});
