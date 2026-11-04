// 0.6.1 — travel average maths + export extras toggles.
process.env.TZ = "Australia/Sydney";
const test = require("node:test");
const assert = require("node:assert/strict");
const { loadApp } = require("./ts-harness.cjs");

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

const WK = new Date(2026, 9, 8, 12);

test("averageTravelCost spreads the total over every calendar day in range", () => {
  const app = loadApp(seed());
  const r = app.TsTravel.averageTravelCost({ "2026-10-01": 14, "2026-10-03": 7, "2026-09-30": 100, "2026-10-08": 50 }, new Date(2026, 9, 1), new Date(2026, 9, 7));
  assert.equal(r.days, 7); assert.equal(r.total, 21); assert.equal(r.perDay, 3); assert.equal(r.perWeek, 21); assert.equal(r.travelDays, 2);
});

test("rangeStart: last N days / months / years are inclusive of today", () => {
  const app = loadApp(seed());
  const iso = (d) => `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
  const today = new Date(2026, 10, 4, 15);
  assert.equal(iso(app.TsTravel.rangeStart(today, 7, "days")), "2026-10-29");
  assert.equal(iso(app.TsTravel.rangeStart(today, 1, "months")), "2026-10-5");
  assert.equal(iso(app.TsTravel.rangeStart(today, 1, "years")), "2025-11-5");
  assert.equal(iso(app.TsTravel.rangeStart(today, 0, "days")), "2026-11-4", "n < 1 clamps to 1");
});

test("travelAverage uses the same cached day cost as History / export", () => {
  const app = loadApp(seed());
  primeExportTravelCache(app);
  const r = app.TsTravel.travelAverage(app.getState(), 7, "days", new Date(2026, 9, 11));
  const dayCost = 65.2 * 0.085 * 1.9;
  assert.ok(Math.abs(r.total - dayCost) < 1e-9);
  assert.ok(Math.abs(r.perDay - dayCost / 7) < 1e-9);
  assert.ok(Math.abs(r.perWeek - dayCost) < 1e-9);
});

test("travelAverage falls back to straight-line km without a cache", () => {
  const app = loadApp(seed());
  const r = app.TsTravel.travelAverage(app.getState(), 1, "days", new Date(2026, 9, 8));
  const est = app.TsTravel.estimateDayTravel(app.getState().sessions, app.getState());
  assert.equal(est.trips, 2);
  assert.ok(est.totalKm > 40 && est.totalKm < 80, String(est.totalKm));
  assert.ok(Math.abs(r.total - est.totalKm * 0.085 * 1.9) < 1e-9);
});

test("export extras: defaults are all off and the text is byte-identical", () => {
  const app = loadApp(seed());
  primeExportTravelCache(app);
  assert.deepEqual({ ...app.TsExport.getExportOpts() }, { travelTime: false, travelCost: false, tripCount: false });
  assert.equal(app.TsExport.formatWeekPreview(WK), GOLDEN_PREVIEW);
  app.TsExport.setExportOpts({ travelTime: true }); app.TsExport.setExportOpts({ travelTime: false });
  assert.equal(app.TsExport.formatWeekPreview(WK), GOLDEN_PREVIEW, "toggled back off restores the golden");
});

const withOpt = (o) => { const app = loadApp(seed()); primeExportTravelCache(app); app.TsExport.setExportOpts(o); return { app, out: app.TsExport.formatWeekPreview(WK) }; };

test("export toggle: travel time adds gaps between shifts only", () => {
  const { out, app } = withOpt({ travelTime: true });
  assert.match(out, /  Extras: travel time 0h 00m\n  Day total/);
  assert.match(out, /WEEKLY EXTRAS\n\n  Travel time: 0h 00m\n/);
  assert.ok(!out.includes("Trips:") && !out.includes("Travel cost:"));
  assert.equal(app.TsExport.dayTravelMinutes([{ time_on: "07:30", time_off: "10:00" }, { time_on: "10:45", time_off: "12:00" }, { time_on: "12:30", time_off: "15:00" }]), 75);
});

test("export toggle: travel cost uses the cached day cost", () => {
  const { out } = withOpt({ travelCost: true });
  assert.match(out, /  Extras: travel cost \$10\.53\n/);
  assert.match(out, /WEEKLY EXTRAS\n\n  Travel cost: \$10\.53\n/);
});

test("export toggle: trip count counts usable legs", () => {
  const { out } = withOpt({ tripCount: true });
  assert.match(out, /  Extras: trips 2\n/);
  assert.match(out, /WEEKLY EXTRAS\n\n  Trips: 2\n────/);
});

test("export toggles persist in localStorage and survive bad JSON", () => {
  const app = loadApp(seed());
  app.TsExport.setExportOpts({ tripCount: true });
  assert.equal(app.TsExport.getExportOpts().tripCount, true);
  assert.match(app.localStorage.getItem("ts_export_opts_v1"), /"tripCount":true/);
  app.localStorage.setItem("ts_export_opts_v1", "{bad");
  assert.equal(app.TsExport.getExportOpts().tripCount, false);
});

// 0.6.2 — blank lat/lng used to read as (0,0) and add ~14,000 km legs.
const MEL_JOBS = [
  { job_id: "be", job_name: "Brighton East", lat: -37.918, lng: 145.020 },
  { job_id: "fr", job_name: "Frankston", lat: -38.142, lng: 145.122 },
  { job_id: "mo", job_name: "Mornington", lat: -38.217, lng: 145.039 },
  { job_id: "wh", job_name: "Wheelers Hill", lat: -37.898, lng: 145.182 },
  { job_id: "nb", job_name: "No coords", lat: null, lng: "" },
  { job_id: "zz", job_name: "Zero", lat: 0, lng: 0 },
];
const melSeed = (sessions, settings) => Object.assign(seed(), {
  jobs: MEL_JOBS, staticDays: [], sessions,
  settings: Object.assign({ firstDayOfWeek: "Monday", fuelLPer100km: 8.5, fuelPricePerLitre: 1.90, includeCommute: false }, settings || {}),
});
const J = (id, date, job, on) => S(id, date, on, on, 1, { job_id: job, job_name: MEL_JOBS.find((j) => j.job_id === job).job_name, lat_on: null, lng_on: null });
// A working week of Melbourne runs (Mon 26 – Fri 30 Oct), each day with one unlocated stop mixed in.
const melWeek = () => {
  const out = [];
  ["2026-10-26", "2026-10-27", "2026-10-28", "2026-10-29", "2026-10-30"].forEach((d, i) => {
    out.push(J("a" + i, d, "be", "07:30"), J("b" + i, d, "nb", "09:00"), J("c" + i, d, "fr", "10:00"), J("d" + i, d, "mo", "12:00"), J("e" + i, d, i % 2 ? "zz" : "wh", "14:00"));
  });
  return out;
};

test("0.6.2: blank, null or 0,0 coords never make a leg", () => {
  const st = melSeed(melWeek());
  const app = loadApp(st);
  const day = st.sessions.filter((s) => s.date === "2026-10-27");
  const est = app.TsTravel.estimateDayTravel(day, st);
  // Brighton East → (no coords) skipped, (no coords) → Frankston skipped, Frankston → Mornington ≈ 11 km, Mornington → Zero skipped.
  assert.equal(est.trips, 1);
  assert.ok(est.totalKm > 8 && est.totalKm < 15, String(est.totalKm));
});

test("0.6.2: Melbourne week gives plausible km and $ per day and week", () => {
  const st = melSeed(melWeek());
  const app = loadApp(st);
  const mon = app.TsTravel.estimateDayTravel(st.sessions.filter((s) => s.date === "2026-10-26"), st);
  // Frankston → Mornington (~11 km) + Mornington → Wheelers Hill (~37 km) straight-line.
  assert.equal(mon.trips, 2);
  assert.ok(mon.totalKm > 40 && mon.totalKm < 60, String(mon.totalKm));
  assert.ok(mon.cost > 6 && mon.cost < 10, String(mon.cost));
  const r = app.TsTravel.travelAverage(st, 7, "days", new Date(2026, 10, 1));
  assert.ok(r.perDay > 1 && r.perDay < 10, "perDay " + r.perDay);
  assert.ok(r.perWeek > 10 && r.perWeek < 60, "perWeek " + r.perWeek);
  const m = app.TsTravel.travelAverage(st, 1, "months", new Date(2026, 10, 4));
  assert.ok(m.perDay < 5 && m.perWeek < 35, JSON.stringify(m));
});

test("0.6.2: commute on with blank home adds nothing; with home it adds two real legs", () => {
  const day = melWeek().filter((s) => s.date === "2026-10-26");
  const off = loadApp(melSeed(day)).TsTravel.estimateDayTravel(day, melSeed(day));
  const blank = melSeed(day, { includeCommute: true, homeLat: "", homeLng: null });
  assert.equal(loadApp(blank).TsTravel.estimateDayTravel(day, blank).totalKm, off.totalKm);
  const home = melSeed(day, { includeCommute: true, homeLat: -37.918, homeLng: 145.020 });
  const on = loadApp(home).TsTravel.estimateDayTravel(day, home);
  assert.equal(on.trips, off.trips + 2);
  assert.ok(on.totalKm - off.totalKm < 60, String(on.totalKm));
});

test("0.6.2: export travel cost toggle uses the same fixed day maths", () => {
  const st = melSeed(melWeek());
  const app = loadApp(st);
  app.TsExport.setExportOpts({ travelCost: true });
  const out = app.TsExport.formatWeekPreview(new Date(2026, 9, 28, 12));
  const week = ["2026-10-26", "2026-10-27", "2026-10-28", "2026-10-29", "2026-10-30"]
    .reduce((s, d) => s + app.TsTravel.estimateDayTravel(st.sessions.filter((x) => x.date === d), st).cost, 0);
  assert.ok(week > 10 && week < 60, String(week));
  assert.ok(out.includes(`Travel cost: $${week.toFixed(2)}`), out);
});
