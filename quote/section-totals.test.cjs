"use strict";

// Quote: the image/preview rows (customerDocRows) and the PDF export both
// use one sectionTotals() helper. These checks pin it to the loop both paths
// used before the trim, on three sample quotes, to the cent.

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const html = fs.readFileSync(path.join(__dirname, "index.html"), "utf8");

// Pull one top-level `function name(...) { ... }` out of the inline script.
function extractFunction(name) {
  const start = html.indexOf("\nfunction " + name + "(");
  assert.ok(start >= 0, "function " + name + " not found in quote/index.html");
  const open = html.indexOf("{", html.indexOf(")", start));
  let depth = 0;
  for (let i = open; i < html.length; i++) {
    const ch = html[i];
    if (ch === "{") depth++;
    else if (ch === "}") {
      depth--;
      if (depth === 0) return html.slice(start + 1, i + 1);
    }
  }
  throw new Error("unbalanced braces in " + name);
}

const NAMES = ["fmt", "migrateCustomLine", "customLineFinal", "customLineTotal", "findItem", "effectiveCap", "sectionTotals", "customerDocRows"];

function makeContext(settings, currentQuote) {
  const ctx = vm.createContext({ settings, currentQuote, Math, Number, Object, String });
  vm.runInContext(NAMES.map(extractFunction).join("\n"), ctx);
  return ctx;
}

// The section loop exactly as it was duplicated in customerDocRows and the
// PDF export before the trim (quote/index.html on main ffcc156).
function legacySectionRows(ctx, quote, d) {
  const rows = [];
  const sectionOrder = ["cameras", ...Object.keys(ctx.settings.extras).sort()];
  sectionOrder.forEach(sec => {
    let raw = 0, net = 0, anyCapped = false, totalQty = 0;
    Object.entries(quote.itemQty).forEach(([key, qty]) => {
      const [section] = key.split(":");
      if (section !== sec) return;
      const item = ctx.findItem(key); if (!item || !qty) return;
      const r = (Number(item.price) || 0) * Number(qty);
      const cap = ctx.effectiveCap(sec, item);
      const eff = Math.min(d, cap);
      raw += r; net += r * (1 - eff / 100);
      totalQty += Number(qty);
      if (cap < d && d > 0) anyCapped = true;
    });
    if (raw > 0) {
      const label = sec.charAt(0).toUpperCase() + sec.slice(1);
      rows.push({ label, qty: totalQty || null, net, original: anyCapped ? null : raw });
    }
  });
  return rows;
}

const SETTINGS = {
  cameras: [
    { type: "Dome 4MP", price: 189.5 },
    { type: "Bullet 8MP", price: 249.99, discountCap: 5 },
    { type: "PTZ", price: 899 }
  ],
  extras: {
    nvr: [{ type: "8ch NVR", price: 420 }, { type: "16ch NVR", price: 640.25, discountCap: "" }],
    cabling: [{ type: "Cat6 per m", price: 2.15 }],
    alarm: [{ type: "Panel", price: 310, discountCap: 0 }]
  },
  discountCaps: { cameras: 15, nvr: 10, cabling: 100, alarm: 20, travel: 30 },
  hourlyRate: 95, dayRate: 680, gstPct: 10
};

const QUOTES = [
  {
    name: "no discount, two sections",
    d: 0,
    quote: { itemQty: { "cameras:Dome 4MP": 4, "nvr:8ch NVR": 1, "cabling:Cat6 per m": 0 }, customLines: [] }
  },
  {
    name: "12.5% discount with capped items",
    d: 12.5,
    quote: { itemQty: { "cameras:Dome 4MP": 3, "cameras:Bullet 8MP": 2, "nvr:16ch NVR": 1, "cabling:Cat6 per m": 137, "alarm:Panel": 1 }, customLines: [] }
  },
  {
    name: "40% discount, fractional qty, unknown item ignored",
    d: 40,
    quote: { itemQty: { "cameras:PTZ": 1, "cameras:Gone model": 2, "cabling:Cat6 per m": 22.5, "alarm:Panel": 2 }, customLines: [] }
  }
];

const cents = n => Math.round(n * 100);

for (const sample of QUOTES) {
  test("sectionTotals matches the pre-trim loop: " + sample.name, () => {
    const ctx = makeContext(SETTINGS, sample.quote);
    const legacy = legacySectionRows(ctx, sample.quote, sample.d);
    const now = ctx.sectionTotals(sample.quote, SETTINGS, sample.d).map(t => ({
      label: t.label, qty: t.totalQty || null, net: t.net, original: t.anyCapped ? null : t.raw
    }));
    assert.equal(now.length, legacy.length);
    now.forEach((row, i) => {
      assert.equal(row.label, legacy[i].label);
      assert.equal(row.qty, legacy[i].qty);
      assert.equal(cents(row.net), cents(legacy[i].net));
      assert.equal(row.original == null ? null : cents(row.original), legacy[i].original == null ? null : cents(legacy[i].original));
    });
  });

  test("image/preview rows equal the PDF rows: " + sample.name, () => {
    const ctx = makeContext(SETTINGS, sample.quote);
    const c = { d: sample.d, travelRaw: 0, travelNet: 0 };
    const preview = ctx.customerDocRows(c, false).filter(r => r.label !== "Labour" && !r.label.startsWith("Travel"));
    // The PDF lineOut maps sectionTotals the same way; rebuild its strings.
    const pdf = ctx.sectionTotals(sample.quote, SETTINGS, sample.d).map(t => {
      const original = t.anyCapped ? null : t.raw;
      return {
        label: t.label,
        qty: t.totalQty ? String(t.totalQty) : "",
        unit: "",
        total: ctx.fmt(t.net),
        original: original != null && Math.abs(original - t.net) > 0.001 ? ctx.fmt(original) : ""
      };
    });
    assert.deepEqual(preview.map(r => ({ ...r })), pdf);
  });
}

test("both document paths call sectionTotals and the duplicate loop is gone", () => {
  const calls = html.match(/sectionTotals\(currentQuote, settings, c\.d\)/g) || [];
  assert.equal(calls.length, 2, "customerDocRows and the PDF export should both use sectionTotals");
  const dupes = html.match(/let raw = 0, net = 0, anyCapped = false, totalQty = 0;/g) || [];
  assert.equal(dupes.length, 1, "only sectionTotals itself should hold the per-section loop");
});
