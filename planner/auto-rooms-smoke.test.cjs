/* Planner Auto rooms smoke test (module level, no browser).
 * Covers: generated plan -> detection -> mocked OCR labels -> preview candidates ->
 * commitAutoRooms (real source from js/*.js, run in a vm with Sheets/Drive/UI stubbed)
 * writes rooms + title pins; Auto rooms is reachable only from its button action;
 * heap growth stays bounded. The signed-in UI (modal DOM, OSD viewer, real Drive/Sheets)
 * is not exercised here. */
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const A = require("./room-auto-detect.js");
const APP = require("./test-utils.cjs").loadPlannerSource();

function samplePlan(w, h) {
  const d = new Uint8ClampedArray(w * h * 4).fill(255);
  const wall = (x0, y0, x1, y1) => { for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) { const i = (y * w + x) * 4; d[i] = d[i + 1] = d[i + 2] = 0; } };
  const t = 6;
  wall(20, 20, w - 20, 20 + t); wall(20, h - 20 - t, w - 20, h - 20); wall(20, 20, 20 + t, h - 20); wall(w - 20 - t, 20, w - 20, h - 20);
  wall(Math.round(w / 2), 20, Math.round(w / 2) + t, h - 20); wall(20, Math.round(h / 2), w - 20, Math.round(h / 2) + t);
  return d;
}
function fnSource(name) {
  const i = APP.indexOf("function " + name + "(");
  assert.ok(i >= 0, name + " exists");
  let depth = 0, j = APP.indexOf("{", i);
  for (let k = j; k < APP.length; k++) { if (APP[k] === "{") depth++; else if (APP[k] === "}" && --depth === 0) return APP.slice(i, k + 1); }
  throw new Error("unbalanced " + name);
}

test("smoke: generated plan -> detect -> mocked OCR -> preview -> save writes rooms, bounded heap", () => {
  if (global.gc) global.gc();
  const heap0 = process.memoryUsage().heapUsed;
  const w = 720, h = 480;
  const det = A.detectRoomsFromRgba(samplePlan(w, h), w, h, {});
  assert.equal(det.rooms.length, 4, "four closed rooms");
  let cands = det.rooms.map((r, i) => ({ ...r, name: A.defaultRoomName(i), selected: true }));
  // OCR mocked: one label at each room centroid.
  const words = cands.map((c, i) => ({ text: String(101 + i), x: c.centroid[0], y: c.centroid[1], confidence: 90 }));
  cands = A.assignOcrLabels(cands, words);
  assert.deepEqual(cands.map((c) => c.name).sort(), ["101", "102", "103", "104"]);
  cands.forEach((c) => { assert.ok(c.points.length >= 3); assert.ok(c.points.every(([x, y]) => x >= 0 && x <= 100 && y >= 0 && y <= 100)); });

  // Save path: real commitAutoRooms, every other helper it calls stubbed and recorded.
  const src = fnSource("commitAutoRooms");
  const calls = [];
  const state = { modal: { mode: "auto-rooms", candidates: cands }, rooms: [], nodes: [], googleAuth: { profile: { name: "Test" } } };
  const proj = { id: "p1", showRooms: false }, floor = { id: "f1" };
  const ctx = { state, NDPlannerRoomAuto: A, console, Math, Number, String, Array, Object, JSON, Date, Set, Map };
  let n = 0;
  Object.assign(ctx, { currentFloor: () => floor, project: () => proj, floorRooms: () => [], uid: (p) => p + "-" + (++n), nowStamp: () => "2026-10-13T00:00:00Z" });
  const ids = new Set((src.match(/\b[a-zA-Z_$][\w$]*(?=\s*\()/g) || []));
  for (const id of ids) if (!(id in ctx) && !/^(function|if|for|while|switch|return|catch|filter|map|forEach|reduce|push|trim|max|min|preventDefault|commitAutoRooms)$/.test(id)) ctx[id] = (...a) => { calls.push(id); return undefined; };
  vm.createContext(ctx);
  vm.runInContext(src + "\ncommitAutoRooms({ preventDefault(){} });", ctx);
  assert.equal(state.rooms.length, 4, "rooms written");
  assert.equal(state.nodes.filter((x) => x.type === "title").length, 4, "title pins written");
  assert.deepEqual(state.rooms.map((r) => r.name).sort(), ["101", "102", "103", "104"]);
  assert.ok(state.rooms.every((r) => r.shape.type === "poly" && r.floorId === "f1"));
  assert.equal(state.modal, null);
  assert.ok(calls.length > 0, "persistence/UI helpers invoked: " + [...new Set(calls)].join(","));

  if (global.gc) global.gc();
  const grewMb = (process.memoryUsage().heapUsed - heap0) / 1048576;
  assert.ok(grewMb < 64, "heap growth " + grewMb.toFixed(1) + " MB");
});

test("Auto rooms runs only from its button action, never on plan open/upload", () => {
  const callers = APP.split("\n").filter((l) => /startAutoRooms\(/.test(l) && !/async function startAutoRooms/.test(l));
  assert.equal(callers.length, 1, callers.join("\n"));
  assert.match(callers[0], /case "auto-rooms": return startAutoRooms\(\)/);
  const detectCalls = APP.split("\n").filter((l) => /detectRoomsFromRgba\(|runPlanOcr\(/.test(l) && !/function runPlanOcr/.test(l));
  assert.ok(detectCalls.length >= 1);
  const start = fnSource("startAutoRooms");
  detectCalls.forEach((l) => assert.ok(start.includes(l.trim()), "only inside startAutoRooms: " + l.trim()));
});
