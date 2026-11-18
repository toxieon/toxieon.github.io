"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const C = require("./calendar.js");

test("joinDailyByDate merges three models on the same date", () => {
  const joined = C.joinDailyByDate({
    with_price: { daily: [{ date: "2026-11-02", bets: 2, wins: 1, pl_units: 1.2 }] },
    without_price: { daily: [{ date: "2026-11-02", bets: 3, wins: 0, pl_units: -2 }] },
    agree: { daily: [] },
  });
  assert.equal(joined.length, 1);
  assert.equal(joined[0].date, "2026-11-02");
  assert.equal(joined[0].with_price.pl_units, 1.2);
  assert.equal(joined[0].without_price.bets, 3);
  assert.equal(joined[0].agree, null);
});

test("buildMonthGrid is Mon-first with correct padding", () => {
  const nov = C.buildMonthGrid("2026-11");
  assert.equal(nov[6], "2026-11-01");
  assert.equal(nov[nov.length - 1], "2026-11-30");
});

test("monthOverlapsRange respects selected range", () => {
  assert.equal(C.monthOverlapsRange("2026-11", "2026-11-05", "2026-11-20"), true);
  assert.equal(C.monthOverlapsRange("2026-10", "2026-11-05", "2026-11-20"), false);
});

test("isRacingWeekdayHighlight marks Wed and Sat", () => {
  assert.equal(C.isRacingWeekdayHighlight("Wed"), true);
  assert.equal(C.isRacingWeekdayHighlight("Wednesday"), true);
  assert.equal(C.isRacingWeekdayHighlight("Sat"), true);
  assert.equal(C.isRacingWeekdayHighlight("Mon"), false);
});

test("monthOverlapsRange with from=all", () => {
  assert.equal(C.monthOverlapsRange("2026-11", "all", "2026-11-30"), true);
});

test("normDailySlice prefers cum_units and hyp_cum_units", () => {
  const row = C.normDailySlice({
    bets: 1,
    cum_units: 2,
    cum: 9,
    hyp_cum_units: 3,
    hyp_cum: 8,
  });
  assert.equal(row.cum_units, 2);
  assert.equal(row.hyp_cum_units, 3);
  const legacy = C.normDailySlice({ cum: 4, hyp_cum: 5 });
  assert.equal(legacy.cum_units, 4);
  assert.equal(legacy.hyp_cum_units, 5);
});

test("plTone uses bets and sign", () => {
  assert.equal(C.plTone(2, 1), "pos");
  assert.equal(C.plTone(-1, 2), "neg");
  assert.equal(C.plTone(0, 0), "neutral");
});