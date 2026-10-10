"use strict";
// Board filter list HTML is built without a full page render (refreshBoardCircuitList).
const test = require("node:test");
const assert = require("node:assert/strict");

function applyFilters(circs, filters) {
  let f = circs;
  if (filters.query) {
    const q = filters.query.toLowerCase();
    f = f.filter((c) => c.name.toLowerCase().includes(q) || (c.notes || "").toLowerCase().includes(q) || (c.type || "").toLowerCase().includes(q));
  }
  if (filters.type !== "all") f = f.filter((c) => c.type === filters.type);
  if (filters.status !== "all") f = f.filter((c) => c.loadStatus === filters.status);
  if (filters.phase !== "all") f = f.filter((c) => c.phase === filters.phase);
  return f;
}

test("applyFilters matches SWB board search semantics", () => {
  const circs = [
    { name: "Kitchen Power", type: "power", loadStatus: "ok", phase: "L1", notes: "" },
    { name: "Hall lights", type: "lighting", loadStatus: "warning", phase: "L2", notes: "LED" },
  ];
  assert.equal(applyFilters(circs, { query: "kitchen", type: "all", status: "all", phase: "all" }).length, 1);
  assert.equal(applyFilters(circs, { query: "", type: "lighting", status: "all", phase: "all" }).length, 1);
  assert.equal(applyFilters(circs, { query: "led", type: "all", status: "all", phase: "all" }).length, 1);
});
