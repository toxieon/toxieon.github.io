"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const L = require("./logic.js");

const NOW = new Date(2026, 10, 13); // 13 Nov 2026

function alarm(over) {
  return Object.assign({
    location: "Hallway", storey: "Ground", type: "Photoelectric",
    power: "240V with 10-yr lithium backup", interconnected: "yes",
    dateKind: "manufacture", dateValue: "2022-06-01",
    mounting: "yes", as3786: "yes", testButton: "pass", secure: "yes",
    cleaned: "yes", hush: "yes", result: "Pass",
    photo: "data:image/jpeg;base64,xx"
  }, over);
}

function base(over) {
  return Object.assign({
    reportNo: "NI-20261113-0900",
    job: {
      address: "12 Example Street, Melbourne VIC", inspectedAt: "2026-11-13T09:00",
      buildEra: "post-2014", storeys: "1", renterInfo: "yes"
    },
    inspector: { techName: "Alex Example", supName: "Sam Example", supRec: "REC1", supLic: "A1", supBusiness: "Example Electrical" },
    property: { everyStorey: "yes", sleeping: "yes" },
    alarms: [alarm()],
    switchboard: { location: "Garage", protection: "rcbo", minStandard: "yes", rcdFitted: "yes", rcdTests: [{ circuit: "Power", result: "pass" }] },
    sign: { printedName: "Alex Example", signature: "data:image/png;base64,xx", date: "2026-11-13", nextDue: "2027-11-13", nextElectrical: "2028-11-13", onBehalf: false, preparer: "Neill Data", contractor: {} },
    extraDefects: []
  }, over);
}

test("manufacture more than 10 years ago is an immediate replace defect and action required", () => {
  const s = base({ alarms: [alarm({ dateKind: "manufacture", dateValue: "2016-11-13", result: "Pass" })] });
  assert.equal(L.isExpired(s.alarms[0], NOW), true);
  assert.equal(L.displayResult(s.alarms[0], NOW), "Replace (expired / >10 yrs)");
  const defs = L.collectDefects(s, NOW);
  assert.ok(defs.some((d) => d.priority === "Urgent" && /exceeds 10-year service life, replace/.test(d.text) && /Hallway/.test(d.text)));
  assert.equal(L.propertyCompliant(s, NOW), false);
  assert.equal(L.overall(s, NOW), "FAIL");
  assert.notEqual(L.overall(s, NOW), "PASS WITH ACTIONS");
});

test("a manufacture date under 10 years is not expired", () => {
  const a = alarm({ dateKind: "manufacture", dateValue: "2016-11-14" });
  assert.equal(L.isExpired(a, NOW), false);
});

test("expiry on or before today is expired; a future expiry is not", () => {
  assert.equal(L.isExpired(alarm({ dateKind: "expiry", dateValue: "2026-11-13" }), NOW), true);
  assert.equal(L.isExpired(alarm({ dateKind: "expiry", dateValue: "2026-11-14" }), NOW), false);
});

test("post-1997 dwelling with a 9V battery alarm is an immediate defect", () => {
  const s = base({
    job: Object.assign(base().job, { buildEra: "1997-2014" }),
    alarms: [alarm({ power: "9V battery", interconnected: "na" })]
  });
  const defs = L.collectDefects(s, NOW);
  assert.ok(defs.some((d) => d.text === "Post-1997 dwelling requires 240V mains-powered alarm with backup" && d.priority === "Urgent"));
  assert.equal(L.overall(s, NOW), "FAIL");
});

test("pre-1997 9V battery does not raise the post-1997 mains defect", () => {
  const s = base({
    job: Object.assign(base().job, { buildEra: "pre-1997" }),
    alarms: [alarm({ power: "9V battery" })]
  });
  assert.equal(L.collectDefects(s, NOW).some((d) => /Post-1997/.test(d.text)), false);
});

test("alarms that are not interconnected are an advisory and do not fail a clean report", () => {
  const s = base({ alarms: [alarm(), alarm({ location: "Bedroom 1", interconnected: "no" })] });
  const defs = L.collectDefects(s, NOW);
  const hit = defs.find((d) => /not all interconnected/.test(d.text));
  assert.ok(hit);
  assert.equal(hit.priority, "Routine");
  assert.equal(L.propertyCompliant(s, NOW), true);
  assert.equal(L.overall(s, NOW), "PASS");
});

test("rewireable fuses or an unprotected circuit fail the rental minimum standard", () => {
  assert.equal(L.switchboardResult(base({ switchboard: { location: "Hall", protection: "rewireable", minStandard: "yes", rcdFitted: "yes" } })), "Does not meet rental minimum standard");
  assert.equal(L.switchboardResult(base({ switchboard: { location: "Hall", protection: "breakers", minStandard: "no", rcdFitted: "yes" } })), "Does not meet rental minimum standard");
  const s = base({ switchboard: { location: "Hall", protection: "mixed-fuses", minStandard: "no", rcdFitted: "no" } });
  assert.equal(L.overall(s, NOW), "FAIL");
});

test("pdf is blocked until each alarm has location, photo and date, named in the message", () => {
  const s = base({ alarms: [alarm({ location: "", photo: "", dateValue: "" })] });
  const blockers = L.pdfBlockers(s, NOW);
  assert.ok(blockers.some((line) => /Alarm 1/.test(line) && /location/.test(line) && /photo/.test(line) && /date/.test(line)));
});

test("a mains alarm does not block the PDF unless a licensed electrician is signing off", () => {
  const s = base();
  s.inspector = { techName: "Alex Example" };
  s.sign.elecSignoff = false;
  assert.equal(L.pdfBlockers(s, NOW).some((line) => /electrician sign-off/.test(line)), false);
  s.sign.elecSignoff = true;
  assert.ok(L.pdfBlockers(s, NOW).some((line) => /Licensed electrician sign-off/.test(line)));
});

test("N/A is not a fail and is left out of the switchboard rows", () => {
  const s = base();
  s.alarms[0].as3786 = "na";
  s.alarms[0].hush = "na";
  s.job.renterInfo = "na";
  s.property.everyStorey = "na";
  s.switchboard.diy = "na";
  s.switchboard.earth = "na";
  assert.equal(L.collectDefects(s, NOW).some((d) => /AS 3786|Hush|written information|DIY|Main earth/.test(d.text)), false);
  assert.equal(L.propertyCompliant(s, NOW), true);
  assert.equal(L.switchboardRows(s).some((r) => /DIY|earthing/i.test(r.item)), false);
});

test("an unticked smoke scope does not demand alarms", () => {
  const s = base({ scope: { smoke: false, switchboard: true }, alarms: [] });
  assert.equal(L.pdfBlockers(s, NOW).some((line) => /smoke alarm/i.test(line)), false);
});

test("a complete example has no pdf blockers and is compliant", () => {
  const s = base();
  assert.deepEqual(L.pdfBlockers(s, NOW), []);
  assert.equal(L.propertyCompliant(s, NOW), true);
  assert.equal(L.overall(s, NOW), "PASS");
  assert.equal(L.switchboardResult(s), "Satisfactory");
});

test("audio and pdf file names", () => {
  const s = base();
  assert.equal(L.audioFilename(s, s.alarms[0], 0), "NI-20261113-0900_alarm1_hallway.m4a");
  assert.equal(L.audioFilename(s, Object.assign({}, s.alarms[0], { audio: { mime: "audio/webm" } }), 0), "NI-20261113-0900_alarm1_hallway.webm");
  assert.equal(L.pdfFilename(s), "NI-20261113-0900_12-Example-Street-Melbourne-VIC.pdf");
});

test("pre-1990 board is a CHECK item and the badge is not a pass", () => {
  const s = base({ switchboard: { location: "Kitchen", protection: "breakers", minStandard: "yes", rcdFitted: "yes", pre1990: "yes", mainSwitch: "yes", labelling: "yes", earth: "yes" } });
  assert.ok(L.collectDefects(s, NOW).some((d) => d.text === "Suspected asbestos backing, do not drill or disturb" && d.priority === "High"));
  const row = L.switchboardRows(s).find((r) => /asbestos/i.test(r.item));
  assert.equal(row.result, "CHECK");
  assert.equal(L.propertyCompliant(s, NOW), true);
  assert.equal(L.overall(s, NOW), "ACTION REQUIRED");
  assert.notEqual(L.overall(s, NOW), "PASS WITH ACTIONS");
});
