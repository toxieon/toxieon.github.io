const test = require("node:test");
const assert = require("node:assert/strict");
const { loadPlannerSource, section, context } = require("./test-utils.cjs");

test("Move mode is off by default and is never persisted", () => {
  const src = loadPlannerSource();
  assert.match(src, /function freshState\(\)[\s\S]*?moveMode: false/);
  assert.match(src, /\.\.\.state, moveMode: false, modal: null/, "persist() always saves it off");
  assert.match(src, /\.\.\.saved, moveMode: false, modal: null/, "loadState() always restores it off");
  assert.match(src, /state\.selectedProjectId !== _moveProjectId[\s\S]{0,120}state\.moveMode = false/, "render() turns it off on a project change");
  assert.match(src, /data-action="toggle-move"/);
  assert.match(src, /Moving: tap to lock/);
});

function markerHarness(moveMode) {
  const handlers = {};
  const el = { dataset: { node: "n1" }, addEventListener: (type, fn) => { handlers[type] = fn; }, setPointerCapture() {}, releasePointerCapture() {}, style: { setProperty() {} } };
  const calls = { stop: 0 };
  const ctx = context(section("function bindMarkerDrag()", "function pointerToPlanPosition") + "\nbindMarkerDrag();\nthis.__drag = () => nodeDragState;", {
    document: { querySelectorAll: () => [el], querySelector: () => null },
    state: { moveMode, nodes: [{ id: "n1", type: "marker", position: { x: 10, y: 10 } }] },
    nodeDragState: null
  });
  const down = { shiftKey: false, pointerId: 1, clientX: 5, clientY: 5, stopPropagation: () => { calls.stop++; } };
  handlers.pointerdown(down);
  return { drag: ctx.__drag(), calls };
}

test("locked by default: pointerdown on a node does not start a drag and lets the canvas pan", () => {
  const locked = markerHarness(false);
  assert.equal(locked.drag, null);
  assert.equal(locked.calls.stop, 0, "event is not swallowed, so the canvas can pan or pinch");
});

test("Move on: pointerdown on a node starts a drag", () => {
  const moving = markerHarness(true);
  assert.equal(moving.drag.nodeId, "n1");
  assert.equal(moving.calls.stop, 1);
});

test("canvas pointerdown ignores markers only while Move is on", () => {
  const src = require("node:fs").readFileSync(require("node:path").join(__dirname, "js/events.js"), "utf8");
  assert.match(src, /closest\("\.node-marker"\) && state\.moveMode\) return;/);
});
