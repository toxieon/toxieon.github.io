const test = require("node:test");
const assert = require("node:assert/strict");
const PF = require("./photo-folders.js");
const JS = require("./job-status.js");

const folder = (id, name) => ({ id, name, mimeType: PF.FOLDER_MIME });
const photo = (id, name) => ({ id, name: name || id + ".jpg", mimeType: "image/jpeg" });

/* Fake job: Level 1 > 1.01 (Rough-in, Fit-off folders + a flat photo), 1.02 (flat only); Level G > G.01;
 * plus the job-level Excel Files, Floor Plans and Watermarked folders and a Plans status sheet. */
const root = [
  folder("fx-l1", "Level 1"), folder("fx-lg", "Level G"),
  folder("fx-xl", "Excel Files"), folder("fx-fp", "Floor Plans"), folder("fx-wm", "Watermarked"),
  { id: "fx-ps", name: "Plans status", mimeType: "application/vnd.google-apps.spreadsheet" },
  photo("fx-loose")
];
const kids = {
  "fx-l1": [folder("fx-a101", "1.01"), folder("fx-a102", "1.02")],
  "fx-lg": [folder("fx-ag01", "G.01")],
  "fx-a101": [folder("fx-r", "Rough in"), folder("fx-f", "Fitoff"), photo("p-flat")],
  "fx-a102": [photo("p-102a", "IMG_1 fit off.jpg"), photo("p-102b", "IMG_2.jpg")],
  "fx-ag01": [folder("fx-gr", "Rough-In")],
  "fx-r": [photo("p-r1"), photo("p-r2", "Fit-off named but in the rough folder.jpg")],
  "fx-f": [photo("p-f1")],
  "fx-gr": [photo("p-g1")]
};

test("stage folder wins over a conflicting file name; file name is only the backup", () => {
  assert.equal(PF.stageForPhoto({ folderName: "Rough in", fileName: "x fit off.jpg" }), "rough-in");
  assert.equal(PF.stageForPhoto({ folderName: "Fit off", fileName: "x.jpg" }), "fit-off");
  assert.equal(PF.stageForPhoto({ folderName: "Other", fileName: "front Rough-In.jpg" }), "rough-in");
  assert.equal(PF.stageForPhoto({ fileName: "wall_fitoff_2.png" }), "fit-off");
  assert.equal(PF.stageForPhoto({ fileName: "rough in and fit off.jpg" }), "unsorted");
  assert.equal(PF.stageForPhoto({ fileName: "roughly.jpg" }), "unsorted");
  assert.equal(PF.stageForPhoto({}), "unsorted");
});

test("grouping: stage subfolders set the stage, flat photos use the file-name backup, job folders are not levels", () => {
  const tree = PF.groupPhotoFiles(root, kids);
  assert.deepEqual(tree.levels.map((l) => l.name), ["Level G", "Level 1"]);
  const a101 = tree.levels[1].apartments.find((a) => a.name === "1.01");
  const stageOf = (id) => a101.photos.find((p) => p.id === id).stage;
  assert.equal(stageOf("p-r1"), "rough-in");
  assert.equal(stageOf("p-r2"), "rough-in", "folder beats the name");
  assert.equal(stageOf("p-f1"), "fit-off");
  assert.equal(stageOf("p-flat"), "unsorted", "old flat layout stays Unsorted without a hint");
  const a102 = tree.levels[1].apartments.find((a) => a.name === "1.02");
  assert.equal(a102.photos.find((p) => p.id === "p-102a").stage, "fit-off", "file-name backup");
  assert.equal(a102.photos.find((p) => p.id === "p-102b").stage, "unsorted");
  assert.equal(tree.loose.length, 1);
  assert.equal(tree.levels[0].apartments[0].photos[0].stage, "rough-in", "Rough-In spelling");
});

test("job specials and reserved folder names", () => {
  assert.deepEqual(PF.jobSpecials(root), { excelFolderId: "fx-xl", plansFolderId: "fx-fp", plansStatusFileId: "fx-ps" });
  assert.deepEqual(PF.jobSpecials([folder("a", "Level 1")]), { excelFolderId: "", plansFolderId: "", plansStatusFileId: "" });
  assert.equal(PF.reservedFolderKind("excel-files"), "excel");
  assert.equal(PF.reservedFolderKind("FLOOR PLANS"), "plans");
  assert.equal(PF.reservedFolderKind("Level 1"), "");
});

test("Plans status sheet: present and MISSING per level and apartment, links and stage", () => {
  const rows = [
    ["Level", "Apartment", "Plan", "Link", "Stage"],
    ["Level 1", "1.01", "present", "https://example.test/p101", "Rough-in"],
    ["Level 1", "1.02", "MISSING", "", "Rough in"],
    ["Level G", "G.01", "Present", "https://example.test/pg01", "Fit-off"],
    ["", "", "", "", ""]
  ];
  const out = JS.parsePlansStatus(rows);
  assert.equal(out.length, 3);
  assert.deepEqual(out.map((r) => [r.levelKey, r.aptKey, r.plan, r.stage]), [["1", "1.01", "present", "rough-in"], ["1", "1.02", "missing", "rough-in"], ["g", "g.01", "present", "fit-off"]]);
  assert.equal(out[0].link, "https://example.test/p101");
  assert.deepEqual(JS.parsePlansStatus([["nothing useful"]]), []);
});

test("Floor Plans folder fallback: apartment code or level name covers apartments", () => {
  const apts = [{ levelKey: "1", key: "1.01", label: "1.01" }, { levelKey: "1", key: "1.02", label: "1.02" }, { levelKey: "g", key: "g.01", label: "G.01" }];
  const out = JS.plansFromFiles([{ name: "Plan 1.01 rev B.pdf", webViewLink: "https://example.test/a" }, { name: "Level G.pdf", webViewLink: "https://example.test/g" }], apts);
  const by = Object.fromEntries(out.map((r) => [r.aptKey, r.plan]));
  assert.deepEqual(by, { "1.01": "present", "1.02": "missing", "g.01": "present" });
  assert.equal(out.find((r) => r.aptKey === "g.01").link, "https://example.test/g");
});

test("thermostat tracker discovery and parsing", () => {
  const files = [{ name: "Notes.xlsx", mimeType: "x" }, { name: "Thermostat tracker.xlsx", mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", id: "x1" }, { name: "Thermostat log", mimeType: "application/vnd.google-apps.spreadsheet", id: "s1" }, folder("fx", "Thermostats")];
  assert.equal(JS.findThermostatTracker(files).id, "s1", "Google Sheet first");
  assert.equal(JS.findThermostatTracker([{ name: "Thermostat photo.jpg", mimeType: "image/jpeg" }]), null);
  assert.equal(JS.findThermostatTracker([{ name: "Costs.xlsx" }]), null);
  const rows = [["Job tracker"], ["Apartment", "Thermostat 1", "Thermostat 2", "Notes"], ["1.01", "Done", "Done", ""], ["1.02", "done", "", ""], ["G.01", "No", "No", "x"], ["Total", "", "", ""]];
  const t = JS.parseThermostatTracker(rows);
  assert.equal(t.found, true);
  assert.deepEqual(t.apartments.map((a) => [a.aptKey, a.done, a.total]), [["1.01", 2, 2], ["1.02", 1, 2], ["g.01", 0, 2]]);
  const single = JS.parseThermostatTracker([["Unit", "Status"], ["1.01", "Installed"], ["1.02", "pending"]]);
  assert.deepEqual(single.apartments.map((a) => [a.done, a.total]), [[1, 1], [0, 1]]);
  assert.equal(JS.parseThermostatTracker([["Foo", "Bar"], ["1", "2"]]).found, false);
  assert.equal(JS.parseThermostatTracker([["Apartment", "Colour"], ["1.01", "red"]]).found, false);
});

test("status aggregation: plans, stage photo counts and thermostats per level and apartment", () => {
  const tree = PF.groupPhotoFiles(root, kids);
  const plans = JS.parsePlansStatus([["Level", "Apartment", "Plan", "Stage"], ["Level 1", "1.01", "present", ""], ["Level 1", "1.02", "MISSING", ""], ["Level G", "G.01", "present", ""], ["Level G", "G.02", "MISSING", "Rough-in"]]);
  const thermostat = JS.parseThermostatTracker([["Apartment", "Thermostat"], ["1.01", "Done"], ["1.02", "No"]]);
  const status = JS.buildJobStatus({ tree, plans, thermostat });
  assert.deepEqual(status.levels.map((l) => l.name), ["Level G", "Level 1"]);
  const g = status.levels[0], one = status.levels[1];
  assert.deepEqual(g.apartments.map((a) => a.label), ["G.01", "G.02"], "an apartment only in the plan sheet still appears");
  assert.equal(g.apartments[1].plan, "missing");
  assert.equal(g.apartments[1].stage, "rough-in", "sheet stage when there are no photos");
  const a101 = one.apartments.find((a) => a.label === "1.01");
  assert.deepEqual(a101.counts, { "rough-in": 2, "fit-off": 1, unsorted: 1 });
  assert.equal(a101.stage, "fit-off");
  assert.deepEqual(a101.thermostat, { done: 1, total: 1 });
  assert.equal(one.plansMissing, 1);
  assert.equal(one.plansPresent, 1);
  assert.equal(g.apartments[0].thermostat, null);
  assert.equal(status.totals.apartments, 4);
  assert.equal(status.totals.plansPresent, 2);
  assert.equal(status.totals.plansMissing, 2);
  assert.equal(status.totals.counts["rough-in"], 3);
  assert.equal(status.totals.aptsRough, 2);
  assert.equal(status.totals.aptsFit, 2);
  assert.equal(status.totals.thermoDone, 1);
  assert.equal(status.totals.thermoTotal, 2);
  assert.equal(status.hasPlanData, true);
  assert.equal(status.hasThermostat, true);
});

test("status with no plan data or tracker leaves plans unknown, not missing", () => {
  const status = JS.buildJobStatus({ tree: PF.groupPhotoFiles(root, kids), plans: [], thermostat: null });
  assert.equal(status.hasPlanData, false);
  assert.equal(status.hasThermostat, false);
  assert.ok(status.levels.every((l) => l.apartments.every((a) => a.plan === "unknown")));
  assert.equal(status.totals.plansMissing, 0);
});

test("manual node stage overrides the folder stage in the counts", () => {
  const tree = PF.groupPhotoFiles(root, kids);
  const status = JS.buildJobStatus({ tree, overrides: { "p-r1": "fit-off" } });
  const a101 = status.levels.find((l) => l.levelKey === "1").apartments.find((a) => a.label === "1.01");
  assert.deepEqual(a101.counts, { "rough-in": 1, "fit-off": 2, unsorted: 1 });
});

test("the Job status view renders per level and apartment, with MISSING and thermostat cells", () => {
  const fs = require("node:fs"), path = require("node:path");
  const { context } = require("./test-utils.cjs");
  const esc = (v) => String(v).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const ctx = context(fs.readFileSync(path.join(__dirname, "js/job-status.js"), "utf8") + "\nthis.__s = () => jobStatusState; this.__set = (v) => { jobStatusState = v; };", {
    window: { NDJobStatus: JS, NDPhotoFolders: PF }, escapeHtml: esc, icon: (n) => `<svg data-i="${n}"></svg>`, project: () => ({ name: "Fake job" })
  });
  const tree = PF.groupPhotoFiles(root, kids);
  const data = JS.buildJobStatus({ tree, plans: JS.parsePlansStatus([["Level", "Apartment", "Plan"], ["Level 1", "1.01", "present"], ["Level 1", "1.02", "MISSING"]]), thermostat: JS.parseThermostatTracker([["Apartment", "Thermostat"], ["1.01", "Done"]]) });
  ctx.__set({ folderId: "fx", busy: false, error: "", data, fetchedAt: 0, notes: ["No Excel Files folder in this job yet."] });
  const html = ctx.renderJobStatusBody();
  assert.match(html, /MISSING/);
  assert.match(html, /js-level/);
  assert.match(html, /1\/1/);
  assert.match(html, /No Excel Files folder/);
  assert.match(ctx.renderJobStatusModal(), /Fake job/);
  ctx.__set({ folderId: "fx", busy: false, error: "boom", data: null, fetchedAt: 0, notes: [] });
  assert.match(ctx.renderJobStatusBody(), /boom/);
});
