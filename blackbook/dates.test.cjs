"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const D = require("./dates.js");

test("times are Australia/Melbourne with the right zone name", () => {
  assert.equal(D.TZ, "Australia/Melbourne");
  assert.equal(D.fmtTime(new Date("2026-11-19T03:05:00Z")), "2:05 pm");
  assert.equal(D.tzName(new Date("2026-11-19T03:05:00Z")), "AEDT");
  assert.equal(D.tzName(new Date("2026-07-01T03:00:00Z")), "AEST");
});

test("dayKey rolls over at Melbourne midnight, not UTC midnight", () => {
  assert.equal(D.dayKey(new Date("2026-11-19T12:59:00Z")), "2026-11-19");
  assert.equal(D.dayKey(new Date("2026-11-19T13:01:00Z")), "2026-11-20");
});

test("a stored YYYY-MM-DD shows on the same calendar day; junk passes through", () => {
  assert.equal(D.fmtIsoDay("2026-11-19"), "Thu 19 Nov");
  assert.equal(D.fmtIsoDay("not a date"), "not a date");
  assert.equal(D.fmtIsoDay(""), "");
});

test("countdown: mm:ss under an hour, jump soon at 15 min, h/m under a day, date tile after, jumped past", () => {
  const t = Date.UTC(2026, 10, 19, 1, 0, 0);
  const a = D.countdown(t + 11 * 60000 + 53000, t);
  assert.deepEqual([a.kind, a.text, a.soon], ["ring", "11:53", true]);
  assert.equal(D.countdown(t + 16 * 60000, t).soon, false);
  assert.equal(D.countdown(t + (2 * 60 + 58) * 60000, t).text, "2h 58m");
  assert.equal(D.countdown(t + 30 * 3600000, t).kind, "date");
  assert.equal(D.countdown(t - 1000, t).kind, "jumped");
  assert.equal(D.JUMP_SOON_MIN, 15);
});

test("relIn reads in and ago", () => {
  assert.equal(D.relIn(5 * 60000), "in 5m");
  assert.equal(D.relIn(-125 * 60000), "2h 05m ago");
  assert.equal(D.toDate("nope"), null);
  assert.equal(D.toDate(""), null);
});
