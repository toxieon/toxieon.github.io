// 0.7.1 — workplace / depot route (work km by default) + Excel trip log.
process.env.TZ = "Australia/Sydney";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { loadApp } = require("./ts-harness.cjs");
const TsXlsx = require("./ts-export-xlsx.js");

const JOBS = [
  { job_id: "be", job_name: "Brighton East", lat: -37.918, lng: 145.020 },
  { job_id: "fr", job_name: "Frankston", lat: -38.142, lng: 145.122 },
  { job_id: "mo", job_name: "Mornington", lat: -38.217, lng: 145.039 },
];
const S = (id, date, onR, offR, hrs, extra) => Object.assign({
  session_id: id, date, job_id: "", job_name: "Job " + id, address_confirmed: "",
  time_on: onR, time_off: offR, time_on_rounded: onR, time_off_rounded: offR,
  break_minutes: 0, total_hours: hrs, overtime_hours: 0, job_type: "employer"
}, extra || {});
const J = (id, date, job, on) => S(id, date, on, on, 1, {
  job_id: job, job_name: JOBS.find((j) => j.job_id === job).job_name, lat_on: null, lng_on: null
});

// Home near Brighton East; depot offset from home (not coincident with a job).
const HOME = { homeAddress: "Home", homeLat: -38.160, homeLng: 145.140 };
const DEPOT = { depotAddress: "Workplace", depotLat: -38.150, depotLng: 145.130 };

const baseSettings = () => Object.assign({
  firstDayOfWeek: "Monday", fuelLPer100km: 8.5, fuelPricePerLitre: 1.90,
  includeCommute: false, privateHomeDepotDays: {}
}, HOME, DEPOT);

const daySessions = () => [
  J("a", "2026-10-26", "be", "07:30"),
  J("b", "2026-10-26", "fr", "10:00"),
  J("c", "2026-10-26", "mo", "14:00"),
];

const seed = (sessions, settings) => ({
  version: 1, jobs: JOBS, payPeriods: [], currentSession: null, lastClosedSession: null,
  staticDays: [],
  sessions: sessions || daySessions(),
  settings: Object.assign(baseSettings(), settings || {}),
});

function kinds(est) {
  return Array.from(est.legs || []).filter((l) => !l.skipped).map((l) => l.kind || (l.commute ? "commute" : "job"));
}

test("0.7.1: no depot and commute off is still job-to-job only", () => {
  const st = seed(daySessions(), {
    depotAddress: "", depotLat: null, depotLng: null,
    homeAddress: "", homeLat: null, homeLng: null, includeCommute: false
  });
  const app = loadApp(st);
  const est = app.TsTravel.estimateDayTravel(st.sessions, st);
  assert.equal(est.trips, 2);
  assert.equal(kinds(est).filter((k) => k === "job").length, 2);
  assert.ok(est.totalKm > 20 && est.totalKm < 80, String(est.totalKm));
});

test("0.7.1: include commute without a depot still adds Home → first job and last job → Home", () => {
  const st = seed(daySessions(), {
    depotAddress: "", depotLat: null, depotLng: null, includeCommute: true
  });
  const off = seed(daySessions(), {
    depotAddress: "", depotLat: null, depotLng: null, includeCommute: false
  });
  const app = loadApp(st);
  const on = app.TsTravel.estimateDayTravel(st.sessions, st);
  const base = loadApp(off).TsTravel.estimateDayTravel(off.sessions, off);
  assert.equal(on.trips, base.trips + 2);
  assert.ok(on.totalKm > base.totalKm);
  const k = kinds(on);
  assert.equal(k[0], "commute-out");
  assert.equal(k[k.length - 1], "commute-back");
});

const escapeStub = { NDUI: { escapeHtml: (s) => String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;") } };

test("0.7.1: depot + home auto-route is Home → Depot → jobs → Depot → Home, all work km", () => {
  const st = seed();
  const app = loadApp(st, escapeStub);
  const est = app.TsTravel.estimateDayTravel(st.sessions, st);
  assert.deepEqual(kinds(est), ["home-depot", "depot-out", "job", "job", "depot-back", "depot-home"]);
  assert.equal(est.privateKm, 0);
  assert.equal(est.trips, 6);
  assert.ok(est.totalKm > 30, "work km should include home/depot legs " + est.totalKm);
  const html = app.TsTravel.panelHtml("2026-10-26", app.TsTravel.planDayTravel(st.sessions, st));
  assert.match(html, /All legs count as work travel by default \(bulky tools\)\. Override per day\./);
  assert.match(html, /Treat home ↔ depot as private today/);
  assert.doesNotMatch(html, /tax advice|ATO|deduct|claimable expense/i);
});

test("0.7.1: depot without home starts and ends at the depot", () => {
  const st = seed(daySessions(), { homeAddress: "", homeLat: null, homeLng: null, includeCommute: false });
  const est = loadApp(st).TsTravel.estimateDayTravel(st.sessions, st);
  assert.deepEqual(kinds(est), ["depot-out", "job", "job", "depot-back"]);
  assert.equal(est.privateKm, 0);
});

test("0.7.1: per-day override marks home ↔ depot private and drops those km from work totals", () => {
  const work = seed();
  const priv = seed(daySessions(), { privateHomeDepotDays: { "2026-10-26": true } });
  const on = loadApp(work).TsTravel.estimateDayTravel(work.sessions, work);
  const off = loadApp(priv).TsTravel.estimateDayTravel(priv.sessions, priv);
  assert.equal(off.trips, 4, "two home-depot legs no longer count as work trips");
  assert.ok(off.privateKm > 0);
  assert.ok(off.totalKm < on.totalKm);
  assert.ok(Math.abs((off.totalKm + off.privateKm) - on.totalKm) < 1e-9);
  const privateLegs = off.legs.filter((l) => l.private);
  assert.equal(privateLegs.length, 2);
  assert.deepEqual(Array.from(privateLegs).map((l) => l.kind).sort(), ["depot-home", "home-depot"]);
  const lines = loadApp(priv).TsTravel.travelExportLines(loadApp(priv).TsTravel.planDayTravel(priv.sessions, priv));
  assert.ok(lines.lines.some((l) => /private/.test(l)));
  assert.ok(lines.lines.some((l) => /Private \(overridden\)/.test(l)));
  assert.ok(Math.abs(lines.km - off.totalKm) < 1e-9);
});

test("0.7.1: a depot address without coordinates does not invent 0 km depot legs", () => {
  const st = seed(daySessions(), { depotAddress: "Workplace", depotLat: "", depotLng: null });
  const noDepot = seed(daySessions(), { depotAddress: "", depotLat: null, depotLng: null });
  const a = loadApp(st).TsTravel.estimateDayTravel(st.sessions, st);
  const b = loadApp(noDepot).TsTravel.estimateDayTravel(noDepot.sessions, noDepot);
  assert.equal(a.totalKm, b.totalKm);
  assert.equal(a.trips, b.trips);
});

test("0.7.1: when a depot is set, include commute does not add a second Home → first job pair", () => {
  const off = seed(daySessions(), { includeCommute: false });
  const on = seed(daySessions(), { includeCommute: true });
  const a = loadApp(off).TsTravel.estimateDayTravel(off.sessions, off);
  const b = loadApp(on).TsTravel.estimateDayTravel(on.sessions, on);
  assert.deepEqual(kinds(a), kinds(b));
  assert.ok(Math.abs(a.totalKm - b.totalKm) < 1e-9);
  assert.ok(!kinds(a).includes("commute-out"));
});

test("0.7.1: Excel helper uses one column-definition array and a running total", () => {
  assert.deepEqual(TsXlsx.TRIP_COLUMNS.map((c) => c.header), ["Date", "From", "To", "Purpose/Job", "km", "Running total"]);
  assert.deepEqual(TsXlsx.SITE_COLUMNS.map((c) => c.header), ["Week starting", "Week ending", "Site", "Hours", "Days"]);
  const dayTravels = [{
    iso: "2026-10-26",
    legs: [
      { from: { name: "Home" }, to: { name: "Depot" }, km: 4, skipped: false, private: false, kind: "home-depot" },
      { from: { name: "Depot" }, to: { name: "Frankston" }, km: 10, skipped: false, private: false, kind: "depot-out" },
      { from: { name: "Frankston" }, to: { name: "Depot" }, km: 10, skipped: false, private: false, kind: "depot-back" },
      { from: { name: "Depot" }, to: { name: "Home" }, km: 4, skipped: false, private: true, kind: "depot-home" },
    ]
  }];
  const built = TsXlsx.buildTripRecords(dayTravels);
  assert.equal(built.rows.length, 4);
  assert.equal(built.rows[0].purpose, "Travel to depot");
  assert.equal(built.rows[1].purpose, "Frankston");
  assert.equal(built.rows[2].purpose, "Return to depot");
  assert.equal(built.rows[3].purpose, "Travel home");
  assert.equal(built.rows[3].km, 0, "private leg has 0 work km");
  assert.equal(built.rows[2].runningTotal, 24);
  assert.equal(built.rows[3].runningTotal, 24);
  assert.equal(built.totalWorkKm, 24);
  const sheet = TsXlsx.tripSheetRows(built.rows, built.totalWorkKm);
  assert.deepEqual(sheet[0], ["Date", "From", "To", "Purpose/Job", "km", "Running total"]);
  const total = sheet[sheet.length - 1];
  assert.equal(total[3], "Total work km");
  assert.equal(total[4], 24);
  const remapped = TsXlsx.applyColumns(
    [{ key: "date", header: "Work date" }, { key: "km", header: "Kilometres" }],
    built.rows
  );
  assert.deepEqual(remapped[0], ["Work date", "Kilometres"]);
});

test("0.7.1: Excel model filters a custom range, all-time uses earliest to latest, and writes a valid xlsx", () => {
  const sessions = [
    J("a", "2025-07-01", "be", "07:30"),
    J("b", "2025-07-01", "fr", "12:00"),
    J("c", "2026-06-30", "mo", "08:00"),
    J("d", "2026-07-02", "fr", "09:00"),
  ];
  const st = seed(sessions);
  const app = loadApp(st);
  const fy = app.TsExport.buildExcelModel("2025-07-01", "2026-06-30");
  const dates = fy.trips.rows.map((r) => r.date);
  assert.ok(dates.includes("2025-07-01"));
  assert.ok(dates.includes("2026-06-30"));
  assert.ok(!dates.includes("2026-07-02"), "custom range trips stop at To");
  assert.ok(fy.trips.rows.every((r) => r.date >= "2025-07-01" && r.date <= "2026-06-30"));
  assert.ok(fy.totalWorkKm > 0);
  assert.ok(fy.siteRecords.some((s) => s.site === "Frankston"));
  // Week labels may start the Monday before From, but no week that begins after To.
  assert.ok(fy.siteRecords.every((s) => s.weekStart <= "2026-06-30"), JSON.stringify(fy.siteRecords.map((s) => s.weekStart)));
  assert.ok(fy.siteRecords.every((s) => s.weekEnd >= "2025-07-01"));
  const bounds = app.TsExport.allTimeDateRange();
  assert.equal(bounds && bounds.from, "2025-07-01");
  assert.equal(bounds && bounds.to, "2026-07-02");
  const all = app.TsExport.buildExcelModel(bounds.from, bounds.to);
  assert.ok(all.trips.rows.some((r) => r.date === "2026-07-02"));
  assert.ok(all.totalWorkKm >= fy.totalWorkKm);
  const hours = (model, site) => model.siteRecords.filter((s) => s.site === site).reduce((n, s) => n + s.hours, 0);
  assert.ok(hours(all, "Frankston") > hours(fy, "Frankston"), "all-time site hours include the 2 Jul session that custom range excludes");

  const xlsxPath = path.join(__dirname, "../shared/vendor/sheetjs/xlsx.full.min.js");
  const XLSX = require(xlsxPath);
  const bytes = TsXlsx.workbookArray(XLSX, fy.sheets);
  assert.ok(bytes.byteLength > 100);
  const wb = XLSX.read(bytes, { type: "array" });
  assert.deepEqual(wb.SheetNames, ["Work trips", "Weekly site summary"]);
  const trips = XLSX.utils.sheet_to_json(wb.Sheets["Work trips"], { header: 1 });
  assert.deepEqual(trips[0], ["Date", "From", "To", "Purpose/Job", "km", "Running total"]);
  assert.equal(trips[trips.length - 1][3], "Total work km");
  const sites = XLSX.utils.sheet_to_json(wb.Sheets["Weekly site summary"], { header: 1 });
  assert.deepEqual(sites[0], ["Week starting", "Week ending", "Site", "Hours", "Days"]);
  assert.equal(TsXlsx.filenameForRange("2025-07-01", "2026-06-30", false), "timesheet-2025-07-01-to-2026-06-30.xlsx");
  assert.equal(TsXlsx.filenameForRange("2025-07-01", "2026-07-02", true), "timesheet-all-time-2026-07-02.xlsx");
});

test("0.7.1: text export golden week is unchanged when no depot is set", () => {
  // Reuse the 0.6.1 seed shape so the existing golden stays byte-identical.
  const { loadApp: load } = require("./ts-harness.cjs");
  // The golden lives in ts-travel-avg.test.cjs; just assert a no-depot week still
  // starts the same way and does not mention Depot / private.
  const EXPORT_JOBS = [
    { job_id: "jf", job_name: "Frankston", lat: -38.142, lng: 145.122 },
    { job_id: "jw", job_name: "Wheelers Hill", lat: -37.898, lng: 145.182 },
    { job_id: "jm", job_name: "Mornington", lat: -38.217, lng: 145.039 },
  ];
  const SS = (id, date, onR, offR, hrs, extra) => Object.assign({
    session_id: id, date, job_id: "", job_name: "Job " + id, address_confirmed: "",
    time_on: onR, time_off: offR, time_on_rounded: onR, time_off_rounded: offR,
    break_minutes: 0, total_hours: hrs, overtime_hours: 0, job_type: "employer"
  }, extra || {});
  const st = {
    version: 1, jobs: EXPORT_JOBS, payPeriods: [], currentSession: null, lastClosedSession: null,
    settings: { use24hr: true, firstDayOfWeek: "Monday", employerName: "Neill Data & Security", payslip: { employee: "Neill, Brandon" }, fuelLPer100km: 8.5, fuelPricePerLitre: 1.90, includeCommute: false },
    staticDays: [{ id: "tpl1", name: "School pickup", type: "School Day", days: ["Thursday"], clock_on: "15:00", clock_off: "15:30", location: "", active: true }],
    sessions: [
      SS("Frankston", "2026-10-08", "10:30", "15:30", 5, { job_id: "jf", job_name: "Frankston" }),
      SS("WH", "2026-10-08", "14:30", "15:30", 1, { job_id: "jw", job_name: "Wheelers Hill" }),
      SS("M", "2026-10-08", "15:30", "15:30", 0, { job_id: "jm", job_name: "Mornington" }),
    ],
  };
  const app = load(st);
  const iso = "2026-10-08";
  const sessions = app.getState().sessions.filter((s) => s.date === iso);
  const mkLeg = (from, to, km) => ({ from: { name: from }, to: { name: to }, km, skipped: false, method: "haversine", commute: null });
  const legs = [mkLeg("Frankston", "Wheelers Hill", 27.6), mkLeg("Wheelers Hill", "Mornington", 37.6)];
  const totalKm = 65.2, eff = 8.5, price = 1.9, cost = totalKm * (eff / 100) * price;
  app.TsTravel.rememberDayTravel(iso, sessions, app.getState(), {
    legs, totalKm, cost, eff, price, usableCount: 2, needsHome: false, includeCommute: false, privateKm: 0
  });
  const GOLDEN_PREVIEW = "TIMESHEET — Brandon Neill\nWeek: Mon 5 Oct – Sun 11 Oct 2026\nEmployer: Neill Data & Security\n────────────────────────────\n\nTHU 8 OCT\n  10:30–15:30  ·  Frankston  ·  5 hrs\n  14:30–15:30  ·  Wheelers Hill  ·  1 hr\n  15:30–15:30  ·  Mornington  ·  0 hrs\n  15:00–15:30  ·  School pickup (School Day)  ·  0.5 hrs\n  Travel\n    Frankston → Wheelers Hill  ·  27.6 km  ·  $4.46\n    Wheelers Hill → Mornington  ·  37.6 km  ·  $6.07\n  Day travel total: 65.2 km  ·  $10.53\n  Day total: 6.5 hrs\n\n────────────────────────────\nWEEKLY SUMMARY — HOURS BY SITE\n\n  Frankston — 5 hrs\n  Wheelers Hill — 1 hr\n  School pickup (School Day) — 0.5 hrs\n  Mornington — 0 hrs\n────────────────────────────\nWEEKLY TRAVEL COST\n\n  65.2 km  ·  $10.53\n────────────────────────────\nTOTAL: 6.5 hrs  ·  1 day";
  assert.equal(app.TsExport.formatWeekPreview(new Date(2026, 9, 8, 12)), GOLDEN_PREVIEW);
});
