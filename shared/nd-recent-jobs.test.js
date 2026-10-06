/* node --test shared/nd-recent-jobs.test.js */
const test = require("node:test");
const assert = require("node:assert/strict");
const R = require("./nd-recent-jobs.js");

function mem(initial) {
  const m = new Map(initial ? [[R.KEY, initial]] : []);
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k), raw: () => m.get(R.KEY) };
}

test("record stores the entry fields", () => {
  const s = mem();
  const e = R.record({ app: "planner", id: "prj_1", label: "12 Smith St", url: "/planner/#project=prj_1" }, { storage: s, now: 1000 });
  assert.deepEqual(e, { app: "planner", id: "prj_1", label: "12 Smith St", url: "/planner/#project=prj_1", ts: 1000 });
  assert.deepEqual(R.list(5, s), [e]);
});

test("jobId is accepted as the id", () => {
  const s = mem();
  assert.equal(R.record({ app: "swb", jobId: 42, label: "Board" }, { storage: s }).id, "42");
});

test("dedupes by app + id, newest wins and moves to the top", () => {
  const s = mem();
  R.record({ app: "planner", id: "a", label: "A old" }, { storage: s, now: 1 });
  R.record({ app: "quote", id: "a", label: "Quote A" }, { storage: s, now: 2 });
  R.record({ app: "planner", id: "b", label: "B" }, { storage: s, now: 3 });
  R.record({ app: "planner", id: "a", label: "A new" }, { storage: s, now: 4 });
  const l = R.list(10, s);
  assert.deepEqual(l.map((e) => e.app + ":" + e.id), ["planner:a", "planner:b", "quote:a"]);
  assert.equal(l[0].label, "A new");
});

test("caps the store at 20 and shows 5 by default", () => {
  const s = mem();
  for (let i = 0; i < 30; i++) R.record({ app: "planner", id: "p" + i, label: "P" + i }, { storage: s, now: 100 + i });
  assert.equal(JSON.parse(s.raw()).length, R.CAP);
  assert.equal(R.CAP, 20);
  const shown = R.list(undefined, s);
  assert.equal(shown.length, 5);
  assert.deepEqual(shown.map((e) => e.id), ["p29", "p28", "p27", "p26", "p25"]);
  assert.ok(!R.read(s).some((e) => e.id === "p9"), "oldest entries dropped");
});

test("bad JSON reads as empty and is replaced on the next record", () => {
  for (const bad of ["{not json", "null", "42", '"str"', '{"a":1}']) {
    const s = mem(bad);
    assert.deepEqual(R.list(5, s), [], bad);
    R.record({ app: "planner", id: "x", label: "X" }, { storage: s, now: 5 });
    assert.equal(R.list(5, s).length, 1, bad);
  }
});

test("junk rows inside a valid array are dropped", () => {
  const s = mem(JSON.stringify([null, 7, "x", { app: "planner" }, { id: "y" }, { app: "fitoff", id: "p1", label: "Ok", ts: 9 }]));
  assert.deepEqual(R.list(5, s).map((e) => e.id), ["p1"]);
});

test("reads legacy 0.5.0 recents (context field)", () => {
  const s = mem(JSON.stringify([{ app: "timesheet", context: "job_1", label: "Shift: Smith", url: "/timesheet/", ts: 50 }]));
  assert.deepEqual(R.list(5, s), [{ app: "timesheet", id: "job_1", label: "Shift: Smith", url: "/timesheet/", ts: 50 }]);
});

test("only same-origin paths are kept as urls", () => {
  for (const u of ["javascript:alert(1)", "https://evil.example/", "//evil.example/x", "/\\evil", " javascript:x", "data:text/html,x"]) {
    assert.equal(R.record({ app: "planner", id: "u", label: "U", url: u }, { storage: mem() }).url, "", u);
  }
  assert.equal(R.safeUrl("/swb/?project=p1&board=b2"), "/swb/?project=p1&board=b2");
});

test("labels are plain, trimmed text and capped", () => {
  const e = R.record({ app: "quote", id: "q", label: "  <b>Smith</b>\n\t12 Rd  " + "x".repeat(300) }, { storage: mem() });
  assert.ok(e.label.startsWith("<b>Smith</b> 12 Rd"), "markup kept as text (escaped at render), whitespace collapsed");
  assert.equal(e.label.length, 160);
  assert.equal(R.label("Smith Reno", "", "smith reno", "12 Rd"), "Smith Reno · 12 Rd");
});

test("storage failures never throw", () => {
  const broken = { getItem() { throw new Error("denied"); }, setItem() { throw new Error("quota"); }, removeItem() { throw new Error("x"); } };
  assert.deepEqual(R.list(5, broken), []);
  assert.equal(R.record({ app: "planner", id: "z", label: "Z" }, { storage: broken }).id, "z");
  R.clear(broken);
});
