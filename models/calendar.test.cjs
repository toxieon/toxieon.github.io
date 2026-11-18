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

test("plTone uses bets and sign", () => {
  assert.equal(C.plTone(2, 1), "pos");
  assert.equal(C.plTone(-1, 2), "neg");
  assert.equal(C.plTone(0, 0), "neutral");
});