/* node --test timesheet/ts-time.test.cjs */
const test = require("node:test");
const assert = require("node:assert/strict");
const T = require("./ts-time.js");

test("parseTypedTime accepts the typed formats", () => {
  const cases = { "7:30": "07:30", "730": "07:30", "0730": "07:30", "7.30": "07:30", "15:30": "15:30", "1530": "15:30",
    "3:30pm": "15:30", "3:30 pm": "15:30", "3pm": "15:00", "7a": "07:00", " 3:30 PM ": "15:30", "12am": "00:00", "12pm": "12:00",
    "12:15am": "00:15", "7": "07:00", "0:00": "00:00", "23:59": "23:59", "07:30": "07:30", "7:30 AM": "07:30" };
  for (const [k, v] of Object.entries(cases)) assert.equal(T.parseTypedTime(k), v, k);
});

test("parseTypedTime rejects invalid input", () => {
  for (const bad of ["", "abc", "24:00", "7:60", "13pm", "0am", "12345", "7:3", ":30", "7::30", "-7", null, undefined]) {
    assert.equal(T.parseTypedTime(bad), null, String(bad));
  }
});

test("snapClock uses the user's standard start/finish (the 8:00 root cause)", () => {
  const old = { roundingMin: 30, standardClockOn: "07:00", standardClockOff: "15:30" };
  const now = { roundingMin: 30, standardClockOn: "07:30", standardClockOff: "15:30" };
  // plain nearest-30 rounding sent a 7:46 clock-on to 8:00
  assert.equal(T.snapClock("07:46", "on", old), "08:00");
  assert.equal(T.snapClock("07:46", "on", now), "07:30");
  assert.equal(T.snapClock("07:59", "on", now), "07:30");
  assert.equal(T.snapClock("08:00", "on", now), "08:00");
  assert.equal(T.snapClock("07:20", "on", now), "07:30");   // nearest step, as before
  assert.equal(T.snapClock("06:50", "on", now), "07:00");
  assert.equal(T.snapClock("15:50", "off", now), "15:30");
  assert.equal(T.snapClock("15:10", "off", now), "15:00");
  assert.equal(T.snapClock("08:20", "on", { roundingMin: 15, standardClockOn: "08:00" }), "08:15");
  assert.equal(T.snapClock("08:10", "on", { roundingMin: 15, standardClockOn: "08:00" }), "08:00");
  assert.equal(T.snapClock("07:46", "on", { roundingMin: 0, standardClockOn: "07:30" }), "07:46");   // no rounding = no snap
});

test("isEntryLocked honours lock/submit/export flags and open shifts", () => {
  assert.equal(T.isEntryLocked({}), false);
  for (const s of [{ locked: true }, { submitted: true }, { exported: true }, { status: "Submitted" }, { status: "locked" }, { _open: true }, { exported: "TRUE" }]) assert.equal(T.isEntryLocked(s), true, JSON.stringify(s));
});

test("timeline: a shared boundary is one handle that moves both entries", () => {
  const e = [{ on: 450, off: 600 }, { on: 600, off: 900 }];
  const hs = T.timelineHandles(e, { axisStart: 360, axisEnd: 1020, minDur: 30 });
  assert.deepEqual(hs.map((h) => h.key), ["s0", "b1", "e1"]);
  const b = hs[1];
  assert.deepEqual(b.targets, [{ i: 0, field: "off" }, { i: 1, field: "on" }]);
  assert.equal(b.min, 480); assert.equal(b.max, 870);
});

test("timeline: handles can't cross a neighbour or the day's edges, and snap to the step", () => {
  const e = [{ on: 450, off: 600 }, { on: 630, off: 900 }];   // 30-min gap
  const hs = T.timelineHandles(e, { axisStart: 360, axisEnd: 1020, minDur: 30 });
  const byKey = Object.fromEntries(hs.map((h) => [h.key, h]));
  assert.equal(byKey.e0.max, 630);      // A's end stops at B's start
  assert.equal(byKey.s1.min, 600);      // B's start stops at A's end
  assert.equal(byKey.s0.min, 360);      // day/axis edge
  assert.equal(byKey.e1.max, 1020);
  assert.equal(T.timelineSnap(700, byKey.e0, 30), 630);
  assert.equal(T.timelineSnap(100, byKey.s0, 30), 360);
  assert.equal(T.timelineSnap(452, byKey.s0, 15), 450);
  const ax = T.timelineAxis([{ on: 20, off: 1430 }], {});
  assert.deepEqual(ax, { axisStart: 0, axisEnd: 1440 });
});

test("timeline: handles touching a locked entry are disabled", () => {
  const hs = T.timelineHandles([{ on: 450, off: 600, locked: true }, { on: 600, off: 900 }], { axisStart: 360, axisEnd: 1020, minDur: 30 });
  assert.deepEqual(hs.map((h) => h.disabled), [true, true, false]);
});

function brandonState(extra) {
  return Object.assign({
    settings: { googleEmail: "brandon.j.neill@gmail.com", standardClockOn: "07:00", standardClockOff: "15:30", roundingMin: 30, otThresholdDay: 8 },
    sessions: [
      { session_id: "a", date: "2026-10-06", time_on: "07:47", time_on_rounded: "08:00", time_off_rounded: "15:30" },
      { session_id: "locked", date: "2026-10-06", time_on: "07:47", time_on_rounded: "08:00", time_off_rounded: "15:30", locked: true },
      { session_id: "submitted", date: "2026-10-07", time_on: "07:50", time_on_rounded: "08:00", time_off_rounded: "15:30", status: "submitted" },
      { session_id: "lastweek", date: "2026-09-30", time_on: "07:47", time_on_rounded: "08:00", time_off_rounded: "15:30" },
      { session_id: "real8", date: "2026-10-07", time_on: "08:05", time_on_rounded: "08:00", time_off_rounded: "15:30" },
    ],
  }, extra);
}
const OPTS = { primaryEmail: "brandon.j.neill@gmail.com", currentWeekStart: "2026-10-05", now: "2026-10-08T05:00:00Z" };

test("migration: sets 7:30/3:30 and re-snaps only pending 8:00 entries; locked/submitted/earlier untouched", () => {
  const st = brandonState();
  const before = JSON.parse(JSON.stringify(st.sessions));
  const recomputed = [];
  const r = T.migrateStartFinish(st, { ...OPTS, recompute: (e) => recomputed.push(e.session_id) });
  assert.equal(r.ran, true);
  assert.equal(st.settings.standardClockOn, "07:30");
  assert.equal(st.settings.standardClockOff, "15:30");
  assert.deepEqual(r.ids, ["a"]);
  assert.deepEqual(recomputed, ["a"]);
  assert.equal(st.sessions[0].time_on_rounded, "07:30");
  for (const i of [1, 2, 3, 4]) assert.deepEqual(st.sessions[i], before[i], before[i].session_id + " untouched");
  assert.equal(r.record.resnapped, 1);
  assert.equal(r.record.skippedLocked, 2);
});

test("migration is idempotent", () => {
  const st = brandonState();
  T.migrateStartFinish(st, OPTS);
  const snap = JSON.stringify(st);
  st.settings.standardClockOn = "07:00";   // even if it looks old again, it never re-runs
  const r2 = T.migrateStartFinish(st, OPTS);
  assert.equal(r2.ran, false); assert.equal(r2.reason, "done");
  st.settings.standardClockOn = "07:30";
  assert.equal(JSON.stringify(st), snap);
});

test("migration leaves user-set times, other users and unknown identity alone", () => {
  const userSet = brandonState(); userSet.settings.standardClockOn = "06:45"; 
  T.migrateStartFinish(userSet, OPTS);
  assert.equal(userSet.settings.standardClockOn, "06:45");
  const flagged = brandonState(); flagged.settings.startFinishSetByUser = true;
  T.migrateStartFinish(flagged, OPTS);
  assert.equal(flagged.settings.standardClockOn, "07:00");
  const worker = brandonState(); worker.settings.googleEmail = "worker@example.com";
  const rw = T.migrateStartFinish(worker, OPTS);
  assert.equal(rw.reason, "not-primary-user"); assert.equal(worker.settings.standardClockOn, "07:00");
  assert.equal(worker.sessions[0].time_on_rounded, "08:00");
  const anon = brandonState(); anon.settings.googleEmail = ""; anon.settings.currentUser = "";
  const ra = T.migrateStartFinish(anon, OPTS);
  assert.equal(ra.reason, "identity-unknown"); assert.equal(anon.migrations[T.MIGRATION_FLAG], undefined);
});
