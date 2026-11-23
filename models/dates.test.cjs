"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const D = require("./dates.js");

test("melbourneDateIso: late UTC evening is next calendar day in Melbourne", () => {
  const iso = D.melbourneDateIso(new Date("2026-11-18T22:30:00Z"));
  assert.equal(iso, "2026-11-19");
});

test("addCalendarDays shifts ISO dates without timezone drift", () => {
  assert.equal(D.addCalendarDays("2026-11-19", -29), "2026-10-21");
  assert.equal(D.addCalendarDays("2026-11-19", 0), "2026-11-19");
});

test("todayMelbourneIso accepts a fixed instant", () => {
  assert.equal(D.todayMelbourneIso(new Date("2026-11-18T22:30:00Z")), "2026-11-19");
});