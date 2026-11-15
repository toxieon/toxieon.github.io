"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { execSync } = require("node:child_process");
const { pathToFileURL } = require("node:url");

const ROOT = path.join(__dirname, "..");
require("./logic.js");
const Import = require("./import.js");

function gitFile(rev, file) {
  return execSync("git show " + rev + ":" + file, { cwd: ROOT }).toString();
}

function sandbox() {
  const s = {
    console, setTimeout, clearTimeout,
    TextEncoder, TextDecoder, Uint8Array, ArrayBuffer,
    encodeURIComponent, decodeURIComponent, unescape,
    JSON, Math, Date, Object, Array, String, Number, RegExp, Error, parseInt, isNaN,
    navigator: { userAgent: "node" },
    document: { createElement() { return { style: {} }; } },
    location: { origin: "http://localhost", href: "http://localhost/" },
    XMLHttpRequest: function () {},
    HTMLAnchorElement: function () {},
    atob: globalThis.atob,
    btoa: globalThis.btoa
  };
  s.window = s;
  s.self = s;
  s.globalThis = s;
  s.global = s;
  vm.createContext(s);
  vm.runInContext(fs.readFileSync(path.join(ROOT, "shared/vendor/jspdf/jspdf.umd.min.js"), "utf8"), s, { filename: "jspdf.js" });
  return s;
}

function load(s, source, filename) {
  vm.runInContext(source, s, { filename: filename });
}

function exampleState() {
  return {
    reportNo: "NI-20261113-1718",
    example: true,
    step: 0,
    scope: { smoke: true, switchboard: true },
    job: {
      inspectedAt: "2026-11-13T17:18",
      address: "12 Example Street, Brighton VIC 3186",
      unit: "",
      agency: "Example Agency",
      pmName: "Example Manager",
      pmEmail: "property.manager.longname@example.test",
      tenantPresent: "yes",
      tenantName: "Example Tenant and Co-Tenant",
      accessNotes: "Key from the agency.",
      occupancy: "tenanted",
      buildEra: "post-2014",
      storeys: "2",
      renterInfo: "yes",
      previousCheck: "Unknown"
    },
    inspector: {
      techName: "Sam Example",
      techPhone: "0400 000 000",
      techEmail: "tech@example.test",
      techLic: "",
      supName: "Alex Sample",
      supRec: "",
      supLic: "",
      supBusiness: "Example Electrical",
      logo: ""
    },
    property: {
      everyStorey: "yes",
      sleeping: "yes",
      recommendations: "Replace the living room alarm before the next tenancy. The hallway unit is fine."
    },
    alarms: [
      {
        id: "a1",
        location: "Hallway", locationDetail: "Bedroom", storey: "Ground",
        type: "Photoelectric", power: "9V battery", interconnected: "yes",
        dateKind: "manufacture", dateValue: "2021-03-15",
        mounting: "yes", as3786: "yes", testButton: "pass", secure: "yes",
        cleaned: "yes", hush: "na", result: "Pass",
        batteryReplaced: "yes", batteryType: "Energizer Ultimate Lithium",
        notes: "Mounted in the hallway outside the bedrooms, clear of the vent.",
        photo: "data:image/jpeg;base64,aaaa",
        audio: { mime: "audio/mp4", dataUrl: "data:audio/mp4;base64,AAAA", seconds: 7 }
      },
      {
        id: "a2",
        location: "Living", locationDetail: "", storey: "Ground",
        type: "Ionisation", power: "", interconnected: "no",
        dateKind: "manufacture", dateValue: "2014-05-01",
        mounting: "no", as3786: "no", testButton: "fail", secure: "yes",
        cleaned: "no", hush: "na", result: "Fail",
        batteryReplaced: "no", batteryType: "",
        notes: "",
        photo: "data:image/jpeg;base64,bbbb"
      }
    ],
    switchboard: {
      location: "Hall cupboard",
      secure: "yes", damage: "no", door: "yes", blanks: "yes", dry: "yes", waterVermin: "no",
      mainSwitch: "yes", labelling: "no", labelNote: "Two lighting circuits are not labelled",
      protection: "breakers", rcdFitted: "yes", rcdCount: "2", rcdCircuits: "all",
      rcdTests: [{ circuit: "Power", result: "pass" }, { circuit: "Lighting", result: "pass" }],
      minStandard: "yes", overheating: "no", exposed: "no", pre1990: "yes",
      asbestosNote: "Older backing panel, possible asbestos, not disturbed",
      earth: "yes", mains: "yes", diy: "na",
      notes: "Board is in the hall cupboard.",
      photos: []
    },
    extraDefects: [],
    sign: {
      signature: "data:image/png;base64,c2ln", elecSignature: "data:image/png;base64,ZWxlYw==", supSignature: "",
      printedName: "Sam Example", date: "2026-11-13",
      nextDue: "2027-11-13", nextElectrical: "2028-11-13",
      onBehalf: true, elecSignoff: true, preparer: "Neill Data",
      contractor: {
        name: "Example Electrical", rec: "12345", electrician: "Alex Sample",
        licence: "A12345", phone: "0400 000 001", email: "office@example.test", logo: ""
      }
    }
  };
}

let pdfjsPromise = null;
function pdfjs() {
  if (!pdfjsPromise) {
    pdfjsPromise = import(pathToFileURL(path.join(ROOT, "shared/vendor/pdfjs/pdf.min.mjs")).href).then(function (lib) {
      lib.GlobalWorkerOptions.workerSrc = pathToFileURL(path.join(ROOT, "shared/vendor/pdfjs/pdf.worker.min.mjs")).href;
      return lib;
    });
  }
  return pdfjsPromise;
}

async function textPages(bytes) {
  const lib = await pdfjs();
  const pdf = await lib.getDocument({ data: new Uint8Array(bytes), isEvalSupported: false, verbosity: 0 }).promise;
  const pages = [];
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const tc = await page.getTextContent();
    const view = page.view;
    pages.push({
      width: view[2] - view[0],
      height: view[3] - view[1],
      items: tc.items.filter(function (it) { return it.str; }).map(function (it) {
        return { str: it.str, x: it.transform[4], y: it.transform[5], w: it.width || 0 };
      })
    });
  }
  return { pdf: pdf, pages: pages };
}

function buildPdf(logicSrc, pdfSrc, state, withImport) {
  const s = sandbox();
  load(s, logicSrc, "logic.js");
  if (withImport) load(s, fs.readFileSync(path.join(__dirname, "import.js"), "utf8"), "import.js");
  load(s, pdfSrc, "pdf.js");
  s.NI = { version: "0.2.0" };
  const doc = s.NIPdf.build(state, new Date(2026, 10, 15));
  return Buffer.from(doc.output("arraybuffer"));
}

function has(result, path) {
  return result.missing.some(function (m) { return m.path === path; });
}

test("a two-line location of area — label, then area, level is recovered", () => {
  const loc = Import.parseLocationLines(["Hallway — Bedroom", "Hallway, Ground"], 160);
  assert.equal(loc.location, "Hallway");
  assert.equal(loc.locationDetail, "Bedroom");
  assert.equal(loc.storey, "Ground");
  assert.equal(loc.uncertain, false);
});

test("payload schema 1 keeps the state and notes photos that do not fit", () => {
  const state = exampleState();
  const photo = state.alarms[0].photo;
  const payload = Import.payloadFromState(state, { maxChars: 400, version: "0.2.0" });
  assert.equal(payload.schema, 1);
  assert.equal(payload.app, "neill-inspect");
  assert.equal(payload.version, "0.2.0");
  assert.equal(payload.state.job.address, state.job.address);
  assert.ok(payload.omitted.indexOf("alarms.0.photo") >= 0);
  assert.equal(payload.state.alarms[0].photo, "");
  assert.equal(state.alarms[0].photo, photo);
  const round = Import.fromPayload(payload);
  assert.equal(round.source, "json");
  assert.equal(round.state.job.address, state.job.address);
  assert.ok(has(round, "alarms.0.photo"));
});

test("0.1.1 example PDF text import recovers the main fields and flags the gaps", async () => {
  const bytes = buildPdf(gitFile("cf7bb56", "inspect/logic.js"), gitFile("cf7bb56", "inspect/pdf.js"), exampleState(), false);
  const { pages } = await textPages(bytes);
  const got = Import.fromTextItems(pages);
  assert.equal(got.ok, true);
  assert.equal(got.source, "text");
  const s = got.state;
  assert.equal(s.reportNo, "NI-20261113-1718");
  assert.equal(s.example, true);
  assert.equal(s.job.address, "12 Example Street, Brighton VIC 3186");
  assert.equal(s.job.inspectedAt, "2026-11-13T17:18");
  assert.equal(s.job.agency, "Example Agency");
  assert.equal(s.job.pmName, "Example Manager");
  assert.equal(s.job.pmEmail, "property.manager.longname@example.test");
  assert.equal(s.job.occupancy, "tenanted");
  assert.equal(s.job.tenantPresent, "yes");
  assert.equal(s.job.tenantName, "Example Tenant and Co-Tenant");
  assert.equal(s.job.buildEra, "post-2014");
  assert.equal(s.job.storeys, "2");
  assert.equal(s.job.renterInfo, "yes");
  assert.equal(s.job.previousCheck, "Unknown");
  assert.equal(s.inspector.techName, "Sam Example");
  assert.equal(s.inspector.techPhone, "0400 000 000");
  assert.equal(s.inspector.supName, "Alex Sample");
  assert.equal(s.inspector.supBusiness, "Example Electrical");
  assert.equal(s.inspector.supRec, "");
  assert.equal(s.inspector.supLic, "");
  assert.ok(has(got, "inspector.supRec"));
  assert.ok(has(got, "inspector.supLic"));
  assert.equal(s.alarms.length, 2);
  assert.equal(s.alarms[0].location, "Hallway");
  assert.equal(s.alarms[0].locationDetail, "Bedroom");
  assert.equal(s.alarms[0].storey, "Ground");
  assert.equal(s.alarms[0].type, "Photoelectric");
  assert.equal(s.alarms[0].power, "9V battery");
  assert.equal(s.alarms[0].dateKind, "manufacture");
  assert.equal(s.alarms[0].dateValue, "2021-03-01");
  assert.ok(has(got, "alarms.0.dateValue"));
  assert.equal(s.alarms[0].testButton, "pass");
  assert.equal(s.alarms[0].result, "Pass");
  assert.equal(has(got, "alarms.0.result"), false);
  assert.equal(s.alarms[0].mounting, "yes");
  assert.equal(s.alarms[0].interconnected, "yes");
  assert.equal(s.alarms[0].as3786, "yes");
  assert.equal(s.alarms[0].batteryReplaced, "yes");
  assert.match(s.alarms[0].batteryType, /Energizer Ultimate Lithium/);
  assert.match(s.alarms[0].notes, /outside the bedrooms/);
  assert.equal(s.alarms[1].location, "Living");
  assert.equal(s.alarms[1].storey, "Ground");
  assert.equal(s.alarms[1].type, "Ionisation");
  assert.equal(s.alarms[1].power, "");
  assert.equal(s.alarms[1].dateValue, "2014-05-01");
  assert.equal(s.alarms[1].testButton, "fail");
  assert.equal(s.alarms[1].mounting, "no");
  assert.equal(s.alarms[1].result, "");
  assert.ok(has(got, "alarms.1.result"));
  assert.ok(has(got, "alarms.0.photo"));
  assert.ok(has(got, "alarms.1.photo"));
  assert.equal(s.switchboard.location, "Hall cupboard");
  assert.equal(s.switchboard.mainSwitch, "yes");
  assert.equal(s.switchboard.labelling, "no");
  assert.match(s.switchboard.labelNote, /not labelled/);
  assert.equal(s.switchboard.protection, "breakers");
  assert.equal(s.switchboard.minStandard, "yes");
  assert.equal(s.switchboard.pre1990, "yes");
  assert.equal(s.switchboard.diy || "", "");
  assert.match(s.switchboard.notes, /hall cupboard/);
  assert.equal(s.switchboard.rcdCount, "2");
  assert.equal(s.switchboard.rcdTests.length, 2);
  assert.equal(s.switchboard.rcdTests[0].result, "pass");
  assert.match(s.property.recommendations, /living room alarm/);
  assert.equal(s.sign.printedName, "Sam Example");
  assert.equal(s.sign.date, "2026-11-13");
  assert.equal(s.sign.nextDue, "2027-11-13");
  assert.equal(s.sign.nextElectrical, "2028-11-13");
  assert.equal(s.sign.onBehalf, true);
  assert.equal(s.sign.contractor.name, "Example Electrical");
  assert.equal(s.sign.contractor.rec, "12345");
  assert.equal(s.sign.contractor.electrician, "Alex Sample");
  assert.equal(s.sign.contractor.licence, "A12345");
  assert.ok(has(got, "sign.signature"));
  assert.equal(s.scope.smoke, true);
  assert.equal(s.scope.switchboard, true);
});

test("0.1.3 example PDF text import recovers the same main fields", async () => {
  const bytes = buildPdf(gitFile("2944c7b", "inspect/logic.js"), gitFile("2944c7b", "inspect/pdf.js"), exampleState(), false);
  const { pages } = await textPages(bytes);
  const got = Import.fromTextItems(pages);
  const s = got.state;
  assert.equal(got.ok, true, got.summary);
  assert.equal(s.job.address, "12 Example Street, Brighton VIC 3186");
  assert.equal(s.job.inspectedAt, "2026-11-13T17:18");
  assert.equal(s.job.agency, "Example Agency");
  assert.equal(s.job.pmEmail, "property.manager.longname@example.test");
  assert.equal(s.inspector.techName, "Sam Example");
  assert.equal(s.inspector.supName, "Alex Sample");
  assert.equal(s.alarms[0].location, "Hallway");
  assert.equal(s.alarms[0].locationDetail, "Bedroom");
  assert.equal(s.alarms[0].storey, "Ground");
  assert.equal(s.alarms[0].type, "Photoelectric");
  assert.equal(s.alarms[0].power, "9V battery");
  assert.equal(s.alarms[0].dateValue, "2021-03-01");
  assert.equal(s.alarms[0].testButton, "pass");
  assert.equal(s.alarms[0].result, "Pass");
  assert.ok(has(got, "alarms.0.result"));
  assert.equal(s.alarms[1].location, "Living");
  assert.equal(s.alarms[1].type, "Ionisation");
  assert.equal(s.alarms[1].testButton, "fail");
  assert.equal(s.switchboard.location, "Hall cupboard");
  assert.equal(s.switchboard.protection, "breakers");
  assert.equal(s.switchboard.minStandard, "yes");
  assert.equal(s.switchboard.diy || "", "");
  assert.match(s.switchboard.notes || "", /hall cupboard/);
  assert.match(s.property.recommendations || "", /living room/);
});

test("the contractor name from a BN profile is printed on the PDF", async () => {
  const Logic = require("./logic.js");
  const state = exampleState();
  const profile = {
    phone: "0400 000 000",
    supName: "Example Electrician",
    rec: "12345",
    licence: "L1",
    contractor: "Example Electrical Pty Ltd"
  };
  Logic.applyBnProfile(state, profile);
  state.sign.preparer = "Neill Data";
  const bytes = buildPdf(
    fs.readFileSync(path.join(__dirname, "logic.js"), "utf8"),
    fs.readFileSync(path.join(__dirname, "pdf.js"), "utf8"),
    state,
    false
  );
  const { pages } = await textPages(bytes);
  const joined = pages.map(function (p) { return p.items.map(function (it) { return it.str; }).join(" "); }).join(" ");
  assert.match(joined, /Prepared by Neill Data on behalf of Example Electrical Pty Ltd/);
  assert.match(joined, /on behalf of Example Electrical Pty Ltd, REC 12345/);
  assert.match(joined, /Example Electrician/);
  assert.equal(joined.includes("Example Electrical Pty Ltd"), true);
});

test("a new PDF embeds the report JSON and round-trips the same state", async () => {
  const state = exampleState();
  state.job.address = "12 Example Street — café";
  const before = JSON.parse(JSON.stringify(state));
  const bytes = buildPdf(
    fs.readFileSync(path.join(__dirname, "logic.js"), "utf8"),
    fs.readFileSync(path.join(__dirname, "pdf.js"), "utf8"),
    state,
    true
  );
  assert.deepEqual(state, before);
  const lib = await pdfjs();
  const pdf = await lib.getDocument({ data: new Uint8Array(bytes), isEvalSupported: false, verbosity: 0 }).promise;
  const at = await pdf.getAttachments();
  assert.ok(at instanceof Map && at.has(Import.FILE_NAME));
  const raw = await pdf.getAttachmentContent(Import.FILE_NAME);
  const payload = JSON.parse(new TextDecoder().decode(raw));
  assert.equal(payload.schema, 1);
  assert.deepEqual(payload.state, before);
  assert.deepEqual(payload.omitted, []);
  const back = Import.fromPayload(payload);
  assert.deepEqual(back.state, before);
  const text = await textPages(bytes);
  const joined = text.pages.map(function (p) { return p.items.map(function (it) { return it.str; }).join(" "); }).join(" ");
  const L = require("./logic.js");
  assert.ok(joined.includes("not an Electrical Safety Check"));
  assert.ok(joined.includes(L.REFERENCES));
  assert.ok(joined.includes("Under supervision of"));
  assert.equal(joined.includes("DIY or non-compliant"), false);
});
