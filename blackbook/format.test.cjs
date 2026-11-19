"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const F = require("./format.js");

test("esc escapes the five HTML characters and tolerates null", () => {
  assert.equal(F.esc(`<a href="x">'&'</a>`), "&lt;a href=&quot;x&quot;&gt;&#39;&amp;&#39;&lt;/a&gt;");
  assert.equal(F.esc(null), "");
  assert.equal(F.highlight("A <b> Name", "<b>"), "A <mark>&lt;b&gt;</mark> Name");
});

test("prices are AUD decimal; blank and non-positive show nothing", () => {
  assert.equal(F.fmtPrice(4.2), "$4.20");
  assert.equal(F.fmtPrice("3"), "$3.00");
  assert.equal(F.fmtPrice(null), "");
  assert.equal(F.fmtPrice(0), "");
});

test("price input accepts a decimal price from 1.01 to 1001 with at most 2 places", () => {
  const p = (v) => JSON.parse(JSON.stringify(F.priceInput(v)));
  assert.deepEqual(p("$4.20"), { ok: true, value: 4.2 });
  assert.deepEqual(p(""), { ok: true, value: null });
  assert.equal(p("abc").ok, false);
  assert.equal(p("0.5").ok, false);
  assert.equal(p("1.005").ok, false);
  assert.equal(p("1002").ok, false);
});

test("result chips: ordinals, Won, Placed, unplaced", () => {
  assert.equal(F.resultText({ position: 2, field_size: 11 }), "2nd of 11");
  assert.equal(F.resultText({ position: 11 }), "11th");
  assert.equal(F.resultText({}), "");
  assert.equal(F.resultClass({ position: 1 }), "won");
  assert.equal(F.resultClass({ position: 3 }), "placed");
  assert.equal(F.resultClass({ position: 7 }), "");
});

test("initials, priority and coming-soon helpers", () => {
  assert.equal(F.initials("Demo Runner One"), "DO");
  assert.equal(F.initials("Sample (NZ)"), "SA");
  assert.equal(F.initials(""), "?");
  assert.equal(F.prioOf({ priority: "high" }), "high");
  assert.equal(F.prioOf({ priority: "weird" }), "low");
  assert.equal(F.isComingSoon({ status: "coming_soon" }), true);
  assert.equal(F.isComingSoon(undefined), true);
  assert.equal(F.isComingSoon({ value: 1 }), false);
});

test("disclaimer, helpline and tier defaults (Ray's 18 Nov numbers)", () => {
  assert.equal(F.DISCLAIMER, "Model estimate. Not betting advice.");
  assert.equal(F.HELPLINE, "Gambling help (AU): 1800 858 858");
  const rows = Object.fromEntries(F.TIER_DEFAULTS.map((r) => [r[0], r.slice(1)]));
  assert.deepEqual(rows["Price move"], ["", "±15%", "±10%"]);
  assert.deepEqual(rows["Jump soon"], ["", "", "15 min"]);
  assert.deepEqual(rows["Discord DM"], ["", "", "on"]);
});
