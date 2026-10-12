// 0.3.1 — timeline lanes, rule skip dates, and the text export golden.
process.env.TZ = "Australia/Sydney";
const test = require("node:test");
const assert = require("node:assert/strict");
const T = require("./ts-time.js");
const { loadApp } = require("./ts-harness.cjs");

const M = (hhmm) => T.toMin(hhmm);
const opts = { axisStart: M("07:00"), axisEnd: M("17:00"), minDur: 15 };

test("lanes: Brandon's Thursday (overlap + zero-length) stacks on lanes", () => {
  // Frankston 10:30-15:30, Wheelers Hill 14:30-15:30, Mornington 15:30-15:30
  const e = [{ on: M("10:30"), off: M("15:30") }, { on: M("14:30"), off: M("15:30") }, { on: M("15:30"), off: M("15:30") }];
  const L = T.assignLanes(e);
  assert.equal(L.lanes[0], 0);
  assert.equal(L.lanes[1], 1, "overlap goes to lane 2");
  assert.ok(L.lanes[2] >= 0 && L.lanes[2] !== L.lanes[0] && L.lanes[2] !== L.lanes[1], "zero-length touching both gets its own lane");
  assert.equal(L.count, 3);
});

test("lanes: touching entries share a lane, overlaps don't, greedy reuses lanes", () => {
  const e = [{ on: M("07:30"), off: M("10:00") }, { on: M("10:00"), off: M("12:00") }, { on: M("09:00"), off: M("11:00") }, { on: M("11:00"), off: M("13:00") }];
  const L = T.assignLanes(e);
  assert.deepEqual(L.lanes, [0, 0, 1, 1]);
  assert.equal(L.count, 2);
  assert.equal(T.assignLanes([{ on: 60, off: 120 }, { on: 120, off: 180 }]).count, 1, "normal days stay one lane");
  assert.equal(T.assignLanes([]).count, 1);
});

test("lanes: zero-length entry gets a point marker that pulls out either way", () => {
  const e = [{ on: M("15:30"), off: M("15:30") }];
  const h = T.timelineHandles(e, opts);
  assert.equal(h.length, 1);
  assert.equal(h[0].kind, "point"); assert.equal(h[0].key, "p0");
  const left = T.timelineApply([{ ...e[0] }], h[0], M("15:00"));
  assert.deepEqual([left[0].on, left[0].off], [M("15:00"), M("15:30")]);
  const right = T.timelineApply([{ ...e[0] }], h[0], M("16:15"));
  assert.deepEqual([right[0].on, right[0].off], [M("15:30"), M("16:15")]);
});

test("linked drag only on the same lane", () => {
  // A 7:30-10:00 and B 10:00-12:00 touch on lane 0 -> one shared handle.
  // C 9:00-10:00 overlaps A (lane 1) and ALSO ends at 10:00, but is not linked.
  const e = [{ on: M("07:30"), off: M("10:00") }, { on: M("10:00"), off: M("12:00") }, { on: M("09:00"), off: M("10:00") }];
  const L = T.assignLanes(e); e.forEach((x, i) => { x.lane = L.lanes[i]; });
  const h = T.timelineHandles(e, opts);
  const shared = h.filter((x) => x.targets.length > 1);
  assert.equal(shared.length, 1);
  assert.deepEqual(shared[0].targets.map((t) => t.i).sort(), [0, 1]);
  const cEnd = h.find((x) => x.key === "e2");
  assert.ok(cEnd && cEnd.targets.length === 1 && cEnd.lane === 1);
  assert.equal(cEnd.max, opts.axisEnd, "lane-2 entry isn't bounded by lane-1 neighbours");
  const work = T.timelineApply(e.map((x) => ({ ...x })), shared[0], M("10:30"));
  assert.equal(work[0].off, M("10:30")); assert.equal(work[1].on, M("10:30"));
  assert.equal(work[2].off, M("10:00"), "other lane untouched");
  // the zero-length marker is never linked to a touching neighbour
  const z = [{ on: M("14:30"), off: M("15:30") }, { on: M("15:30"), off: M("15:30") }];
  assert.ok(T.timelineHandles(z, opts).every((x) => x.targets.length === 1 || x.kind === "point"));
});

test("locked entries: handles disabled (incl. shared boundary and markers)", () => {
  const e = [{ on: M("08:00"), off: M("10:00"), locked: true }, { on: M("10:00"), off: M("12:00") }, { on: M("12:00"), off: M("12:00"), locked: true }];
  const h = T.timelineHandles(e, opts);
  assert.ok(h.find((x) => x.key === "s0").disabled);
  assert.ok(h.find((x) => x.key === "b1").disabled);
  assert.ok(h.find((x) => x.key === "p2").disabled);
  assert.ok(!h.find((x) => x.key === "e1").disabled);
});

const school = () => ({ id: "tpl1", name: "School pickup", type: "School Day", days: ["Monday", "Thursday"], clock_on: "15:00", clock_off: "15:30", location: "Sch", active: true });
const week = [["2026-10-05", "Monday"], ["2026-10-08", "Thursday"], ["2026-10-12", "Monday"], ["2026-10-15", "Thursday"], ["2026-10-19", "Monday"]].map(([iso, dow]) => ({ iso, dow }));

test("rule skips: generator honours skip dates and ranges", () => {
  const r = school();
  assert.equal(T.staticDaysFor([r], week).length, 5);
  assert.ok(T.addRuleSkip(r, "2026-10-08"));
  assert.ok(T.addRuleSkip(r, "2026-10-15", "2026-10-12"), "reversed range is normalised");
  const got = T.staticDaysFor([r], week).map((x) => x.date);
  assert.deepEqual(got, ["2026-10-05", "2026-10-19"]);
  assert.ok(T.isRuleSkipped(r, "2026-10-13"));
  assert.ok(!T.isRuleSkipped(r, "2026-10-19"));
  assert.equal(T.addRuleSkip(r, ""), false);
  T.removeRuleSkip(r, "2026-10-08");
  T.removeRuleSkip(r, "2026-10-12", "2026-10-15");
  assert.equal(T.staticDaysFor([r], week).length, 5);
  assert.equal(r.skips, "");
});

test("rule skips: the rule itself is kept intact and round-trips via the sheet column", () => {
  const r = school(), before = JSON.stringify(school());
  T.addRuleSkip(r, "2026-10-08"); T.addRuleSkip(r, "2026-10-12", "2026-10-16");
  const { skipDates, skipRanges, skips, ...rest } = r;
  assert.equal(JSON.stringify(rest), before, "name/type/days/times/location/active unchanged");
  assert.deepEqual(skipDates, ["2026-10-08"]);
  assert.deepEqual(skipRanges, [{ from: "2026-10-12", to: "2026-10-16" }]);
  const fromSheet = T.normaliseRuleSkips({ ...rest, skips });   // a sheet row only has the JSON column
  assert.deepEqual(fromSheet.skipDates, skipDates);
  assert.deepEqual(fromSheet.skipRanges, skipRanges);
  assert.deepEqual(T.normaliseRuleSkips({ ...rest, skips: "not json" }).skipDates, []);
  r.active = false; assert.equal(T.staticDaysFor([r], week).length, 0, "inactive still wins");
});

const EXPORT_JOBS = [
  { job_id: "jf", job_name: "Frankston", lat: -38.142, lng: 145.122 },
  { job_id: "jw", job_name: "Wheelers Hill", lat: -37.898, lng: 145.182 },
  { job_id: "jm", job_name: "Mornington", lat: -38.217, lng: 145.039 },
];
const S = (id, date, onR, offR, hrs, extra) => Object.assign({ session_id: id, date, job_id: "", job_name: "Job " + id, address_confirmed: "", time_on: onR, time_off: offR, time_on_rounded: onR, time_off_rounded: offR, break_minutes: 0, total_hours: hrs, overtime_hours: 0, job_type: "employer" }, extra || {});
const seed = (tplPatch) => ({
  version: 1, jobs: EXPORT_JOBS, payPeriods: [], currentSession: null, lastClosedSession: null,
  settings: { use24hr: true, firstDayOfWeek: "Monday", employerName: "Neill Data & Security", payslip: { employee: "Neill, Brandon" }, fuelLPer100km: 8.5, fuelPricePerLitre: 1.90, includeCommute: false },
  staticDays: [Object.assign({ id: "tpl1", name: "School pickup", type: "School Day", days: ["Thursday"], clock_on: "15:00", clock_off: "15:30", location: "", active: true }, tplPatch || {})],
  sessions: [
    S("Frankston", "2026-10-08", "10:30", "15:30", 5, { job_id: "jf", job_name: "Frankston" }),
    S("WH", "2026-10-08", "14:30", "15:30", 1, { job_id: "jw", job_name: "Wheelers Hill" }),
    S("M", "2026-10-08", "15:30", "15:30", 0, { job_id: "jm", job_name: "Mornington" }),
  ],
});

/** Prime the History travel cache (Copy timesheet reads cached legs synchronously). */
function primeExportTravelCache(app) {
  const iso = "2026-10-08";
  const sessions = app.getState().sessions.filter((s) => s.date === iso);
  const mkLeg = (from, to, km) => ({ from: { name: from }, to: { name: to }, km, skipped: false, method: "haversine", commute: null });
  const legs = [mkLeg("Frankston", "Wheelers Hill", 27.6), mkLeg("Wheelers Hill", "Mornington", 37.6)];
  const eff = 8.5;
  const price = 1.9;
  const totalKm = 65.2;
  const cost = totalKm * (eff / 100) * price;
  app.TsTravel.rememberDayTravel(iso, sessions, app.getState(), {
    legs, totalKm, cost, eff, price, usableCount: 2, needsHome: false, includeCommute: false,
  });
}

// 0.4.3 — weekly copy adds per-leg km/cost (from cached History travel) + weekly travel total.
const GOLDEN_PREVIEW = "TIMESHEET — Brandon Neill\nWeek: Mon 5 Oct – Sun 11 Oct 2026\nEmployer: Neill Data & Security\n────────────────────────────\n\nTHU 8 OCT\n  10:30–15:30  ·  Frankston  ·  5 hrs\n  14:30–15:30  ·  Wheelers Hill  ·  1 hr\n  15:30–15:30  ·  Mornington  ·  0 hrs\n  15:00–15:30  ·  School pickup (School Day)  ·  0.5 hrs\n  Travel\n    Frankston → Wheelers Hill  ·  27.6 km  ·  $4.46\n    Wheelers Hill → Mornington  ·  37.6 km  ·  $6.07\n  Day travel total: 65.2 km  ·  $10.53\n  Day total: 6.5 hrs\n\n────────────────────────────\nWEEKLY SUMMARY — HOURS BY SITE\n\n  Frankston — 5 hrs\n  Wheelers Hill — 1 hr\n  School pickup (School Day) — 0.5 hrs\n  Mornington — 0 hrs\n────────────────────────────\nWEEKLY TRAVEL COST\n\n  65.2 km  ·  $10.53\n────────────────────────────\nTOTAL: 6.5 hrs  ·  1 day";
const GOLDEN_SUBJECT = "Timesheet — Brandon Neill — w/c Mon 5 Oct 2026";
const GOLDEN_BODY = "Hi there,\n\nPlease find my timesheet for the week of Mon 5 Oct – Sun 11 Oct 2026 below.\n\nTIMESHEET — Brandon Neill\nWeek: Mon 5 Oct – Sun 11 Oct 2026\nEmployer: Neill Data & Security\n────────────────────────────\n\nTHU 8 OCT\n  10:30–15:30  ·  Frankston  ·  5 hrs\n  14:30–15:30  ·  Wheelers Hill  ·  1 hr\n  15:30–15:30  ·  Mornington  ·  0 hrs\n  15:00–15:30  ·  School pickup (School Day)  ·  0.5 hrs\n  Travel\n    Frankston → Wheelers Hill  ·  27.6 km  ·  $4.46\n    Wheelers Hill → Mornington  ·  37.6 km  ·  $6.07\n  Day travel total: 65.2 km  ·  $10.53\n  Day total: 6.5 hrs\n\n────────────────────────────\nWEEKLY SUMMARY — HOURS BY SITE\n\n  Frankston — 5 hrs\n  Wheelers Hill — 1 hr\n  School pickup (School Day) — 0.5 hrs\n  Mornington — 0 hrs\n────────────────────────────\nWEEKLY TRAVEL COST\n\n  65.2 km  ·  $10.53\n────────────────────────────\nTOTAL: 6.5 hrs  ·  1 day\n\nThanks,\nBrandon Neill";

test("text export output is unchanged for a sample day (Thu 8 Oct 2026)", () => {
  const app = loadApp(seed());
  primeExportTravelCache(app);
  const wk = new Date(2026, 9, 8, 12);
  assert.equal(app.TsExport.formatWeekPreview(wk), GOLDEN_PREVIEW);
  const t = app.TsExport.buildTimesheetText(wk);
  assert.equal(t.subject, GOLDEN_SUBJECT);
  assert.equal(t.body, GOLDEN_BODY);
});

test("text export: a skipped rule date just drops that rule's line (format unchanged)", () => {
  const app = loadApp(seed({ skipDates: ["2026-10-08"], skipRanges: [] }));
  const out = app.TsExport.formatWeekPreview(new Date(2026, 9, 8, 12));
  const travelBlock = /  Travel\n(?:    .+\n)+  Day travel total: .+\n/;
  const expected = GOLDEN_PREVIEW.split("\n").filter((l) => !l.includes("School pickup")).join("\n")
    .replace(/6\.5 hrs/g, "6 hrs")
    .replace(travelBlock, "  Travel: km/cost omitted (distances unavailable for this day).\n")
    .replace("────────────────────────────\nWEEKLY TRAVEL COST\n\n  65.2 km  ·  $10.53\n", "");
  assert.equal(out, expected);
});

test("text export: without cached travel, shifts still export with an omission note", () => {
  const app = loadApp(seed());
  const out = app.TsExport.formatWeekPreview(new Date(2026, 9, 8, 12));
  assert.ok(out.includes("Travel: km/cost omitted"));
  assert.ok(!out.includes("WEEKLY TRAVEL COST"));
});

test("0.4.3 background travel: every day of the week is computed and cached without expanding, Distance Matrix not repeated", async () => {
  const app = loadApp(seed());
  // Two working days, two legs each.
  const st = app.getState();
  st.sessions.push(
    S("F2", "2026-10-06", "07:30", "11:00", 3.5, { job_id: "jf", job_name: "Frankston" }),
    S("M2", "2026-10-06", "11:30", "15:30", 4, { job_id: "jm", job_name: "Mornington" })
  );
  let dmCalls = 0;
  app.window.google = { maps: {
    Geocoder: function () {},
    TravelMode: { DRIVING: "DRIVING" }, UnitSystem: { METRIC: 0 },
    DistanceMatrixService: function () { this.getDistanceMatrix = (req, cb) => {
      dmCalls++;
      const rows = req.origins.map((o, i) => ({ elements: req.destinations.map((d, j) => ({ status: "OK", distance: { value: i === j ? 30000 + 1000 * i : 0 } })) }));
      cb({ rows }, "OK");
    }; }
  } };
  const week = new Date(2026, 9, 8, 12);
  const before = app.TsExport.formatWeekPreview(week);
  assert.ok(before.includes("Travel: km/cost omitted"), "nothing cached yet");
  const sessions = st.sessions.filter((s) => s.date >= "2026-10-05" && s.date <= "2026-10-11");
  const n = await app.TsTravel.prefetchWeek(sessions, st, { gapMs: 0 });
  assert.equal(n, 2, "both days computed in the background");
  const out = app.TsExport.formatWeekPreview(week);
  assert.ok(!out.includes("omitted"), out);
  assert.equal((out.match(/Day travel total:/g) || []).length, 2);
  assert.match(out, /WEEKLY TRAVEL COST\n\n  \d+(\.\d)? km  ·  \$\d+\.\d\d/);
  const calls = dmCalls;
  assert.equal(await app.TsTravel.prefetchWeek(sessions, st, { gapMs: 0 }), 0, "cached days are skipped");
  assert.equal(dmCalls, calls, "no repeat Distance Matrix requests");
});
