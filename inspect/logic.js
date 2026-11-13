/* Neill Inspect — pure report rules. No DOM. Used by the page and by logic.test.cjs. */
(function (root, factory) {
  "use strict";
  const api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.NILogic = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const LIMITATIONS = "This is a smoke alarm safety check (RTA 1997 s68AA) and a visual switchboard inspection. It is not an Electrical Safety Check under RTR 2021 Sch 3 cl 1 / AS/NZS 3019.";
  const REFERENCES = "RTA 1997 s68AA; RTR 2021 Sch 3 cl 1 and 3, Sch 4 cl 9; AS 3786; NCC Housing Provisions Part 9.5; AS/NZS 3000.";
  const TITLE = "Smoke Alarm Safety Check & Switchboard Inspection Report";

  const ERA_LABEL = {
    unknown: "Build date unknown",
    "pre-1997": "Before 1 August 1997",
    "1997-2014": "1 August 1997 – 30 April 2014",
    "post-2014": "On or after 1 May 2014"
  };

  const LOCATIONS = ["Bedroom 1", "Bedroom 2", "Bedroom 3", "Hallway", "Living", "Kitchen-adjacent", "Each storey", "Other"];
  const POWERS = ["240V hardwired", "240V with 10-yr lithium backup", "9V battery", "10-yr sealed lithium"];
  const TYPES = ["Photoelectric", "Ionisation", "Unknown"];

  function parseDate(value) {
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(value || ""));
    if (!m) return null;
    const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
    return isNaN(d.getTime()) ? null : d;
  }

  function startOfDay(d) {
    return new Date(d.getFullYear(), d.getMonth(), d.getDate());
  }

  function fmtDate(value) {
    const d = parseDate(value);
    if (!d) return value ? String(value) : "—";
    const months = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
    return d.getDate() + " " + months[d.getMonth()] + " " + d.getFullYear();
  }

  function fmtWhen(value) {
    const date = fmtDate(value);
    const tm = /T(\d{2}):(\d{2})/.exec(String(value || ""));
    if (!tm || date === "—") return date;
    let hh = Number(tm[1]);
    const am = hh >= 12 ? "pm" : "am";
    hh = ((hh + 11) % 12) + 1;
    return date + ", " + hh + ":" + tm[2] + " " + am;
  }

  function plusMonths(value, months) {
    const d = parseDate(value) || new Date();
    const out = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    out.setMonth(out.getMonth() + months);
    const p = (n) => String(n).padStart(2, "0");
    return out.getFullYear() + "-" + p(out.getMonth() + 1) + "-" + p(out.getDate());
  }

  function reportNoFrom(date) {
    const d = date instanceof Date ? date : new Date();
    const p = (n) => String(n).padStart(2, "0");
    return "NI-" + d.getFullYear() + p(d.getMonth() + 1) + p(d.getDate()) + "-" + p(d.getHours()) + p(d.getMinutes());
  }

  function isMains(alarm) {
    return !!alarm && (alarm.power === "240V hardwired" || alarm.power === "240V with 10-yr lithium backup");
  }

  function inScope(state, key) {
    if (!state || !state.scope) return true;
    return !!state.scope[key];
  }

  function isNA(v) { return v === "na"; }

  const VISUAL_NOTE = "Visual inspection by the technician. This report is not an Electrical Safety Check. Mains, hardwired alarms and switchboard items are not certified. Items that need a licensed electrician are recommended for follow-up.";

  function is9v(alarm) {
    return !!alarm && alarm.power === "9V battery";
  }

  function post1997(era) {
    return era === "1997-2014" || era === "post-2014";
  }

  /* Manufacture date on or before today-minus-10-years has reached the 10-year service life.
     An expiry on or before today is past. */
  function isExpired(alarm, now) {
    if (!alarm) return false;
    const d = parseDate(alarm.dateValue);
    if (!d) return false;
    const today = startOfDay(now instanceof Date ? now : new Date());
    if (alarm.dateKind === "manufacture") {
      const limit = new Date(today.getFullYear() - 10, today.getMonth(), today.getDate());
      return d.getTime() <= limit.getTime();
    }
    return d.getTime() <= today.getTime();
  }

  function locationText(alarm, index) {
    const loc = alarm && alarm.location === "Other"
      ? ((alarm.locationDetail || "").trim() || "Other")
      : ((alarm && alarm.location) || ("Alarm " + (index + 1)));
    const detail = alarm && alarm.location && alarm.location !== "Other" && (alarm.locationDetail || "").trim()
      ? " — " + alarm.locationDetail.trim() : "";
    const storey = alarm && (alarm.storey || "").trim() ? ", " + alarm.storey.trim() : "";
    return loc + detail + storey;
  }

  function alarmMissing(alarm) {
    const miss = [];
    if (!alarm || !alarm.location) miss.push("location");
    if (!alarm || String(alarm.photo || "").indexOf("data:image/") !== 0) miss.push("a photo");
    if (!alarm || !alarm.dateValue) miss.push("a manufacture or expiry date");
    return miss;
  }

  function audioExt(alarm) {
    const mime = alarm && alarm.audio && alarm.audio.mime || "";
    return /webm/i.test(mime) ? "webm" : "m4a";
  }

  function audioFilename(state, alarm, index) {
    const raw = (alarm && alarm.location) || "alarm";
    const loc = String(raw).toLowerCase().replace(/[^a-z0-9]+/g, "").slice(0, 24) || "alarm";
    return (state.reportNo || "NI") + "_alarm" + (index + 1) + "_" + loc + "." + audioExt(alarm);
  }

  function pdfFilename(state) {
    const addr = String((state.job && state.job.address) || "property")
      .replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "").slice(0, 60) || "property";
    return (state.reportNo || "NI") + "_" + addr + ".pdf";
  }

  function push(out, item) { out.push(item); }

function recommendation(text) {
  const t = String(text || "");
  if (/10-year service life/.test(t)) return "Replace the alarm with a photoelectric alarm compliant with AS 3786.";
  if (/did not sound/.test(t)) return "Replace the alarm, or have a licensed electrician repair it, then retest.";
  if (/Post-1997/.test(t)) return "Install a 240V mains-powered alarm with integral backup.";
  if (/asbestos/i.test(t)) return "Do not drill or disturb. Arrange sampling by a licensed assessor before any board work.";
  if (/minimum standard|Rewireable|circuit breakers and RCDs/.test(t)) return "Have a licensed electrician protect every power and lighting circuit with a circuit breaker and an RCD.";
  if (/RCD push-button/.test(t)) return "Have a licensed electrician test and repair the RCD before the circuit is relied on.";
  if (/overheating|Exposed live|DIY/.test(t)) return "Isolate as needed and have a licensed electrician repair the switchboard.";
  if (/not labelled|labelling/.test(t)) return "Label the circuits.";
  if (/not interconnected/.test(t)) return "Interconnect the alarms where the installation allows.";
  if (/every storey/.test(t)) return "Install a smoke alarm on each storey.";
  if (/hallway serving bedrooms/.test(t)) return "Install an alarm in each hallway serving bedrooms, or between the bedrooms and the rest of the dwelling.";
  if (/mounting|compliant position/.test(t)) return "Remount the alarm on the ceiling at least 300 mm from a wall, or on the wall at least 300 mm below the ceiling.";
  if (/written information/.test(t)) return "Give the renter the written smoke alarm information and note the date it was provided.";
  if (/ionisation/.test(t)) return "Replace with a photoelectric alarm when the alarm is next changed.";
  if (/Main earth/.test(t)) return "Have a licensed electrician confirm the main earth and MEN connection.";
  return "Rectify and recheck at the next visit.";
}

  function collectDefects(state, now) {
    const out = [];
    const job = state.job || {};
    const prop = state.property || {};
    const sb = state.switchboard || {};
    const alarms = inScope(state, "smoke") ? (state.alarms || []) : [];
    const boardOn = inScope(state, "switchboard");

    alarms.forEach(function (a, i) {
      const where = locationText(a, i);
      if (isExpired(a, now)) {
        push(out, { id: "exp-" + i, auto: true, priority: "Urgent", source: "Smoke alarm",
          text: "Smoke alarm at " + where + " exceeds 10-year service life, replace" });
      }
      if (a.testButton === "fail") {
        push(out, { id: "test-" + i, auto: true, priority: "Urgent", source: "Smoke alarm",
          text: "Smoke alarm at " + where + " did not sound when the test button was operated" });
      }
      if (a.result === "Fail" && a.testButton !== "fail") {
        push(out, { id: "fail-" + i, auto: true, priority: "Urgent", source: "Smoke alarm",
          text: "Smoke alarm at " + where + " recorded as Fail" });
      }
      if (a.result === "Requires electrician") {
        push(out, { id: "elec-" + i, auto: true, priority: "Urgent", source: "Smoke alarm",
          text: "Smoke alarm at " + where + " requires a licensed electrician" });
      }
      if (a.mounting === "no") {
        push(out, { id: "mount-" + i, auto: true, priority: "High", source: "Smoke alarm",
          text: "Smoke alarm at " + where + " is not in a compliant position (ceiling at least 300 mm from a wall, or wall at least 300 mm below the ceiling)" });
      }
      if (a.secure === "no") {
        push(out, { id: "sec-" + i, auto: true, priority: "High", source: "Smoke alarm",
          text: "Smoke alarm at " + where + " is not securely fixed, or is damaged, painted or covered" });
      }
      if (a.as3786 === "no") {
        push(out, { id: "as-" + i, auto: true, priority: "Routine", source: "Smoke alarm",
          text: "No AS 3786 compliance label was visible on the smoke alarm at " + where });
      }
      if (a.hush === "no") {
        push(out, { id: "hush-" + i, auto: true, priority: "Routine", source: "Smoke alarm",
          text: "Hush function did not work on the smoke alarm at " + where });
      }
      if (a.cleaned === "no") {
        push(out, { id: "dust-" + i, auto: true, priority: "Routine", source: "Smoke alarm",
          text: "Smoke alarm at " + where + " is not clean and dust-free" });
      }
      if (job.buildEra === "post-2014" && a.type === "Ionisation") {
        push(out, { id: "ion-" + i, auto: true, priority: "Routine", source: "Smoke alarm",
          text: "Smoke alarm at " + where + " is an ionisation alarm. Dwellings built or approved on or after 1 May 2014 are generally expected to have photoelectric alarms" });
      }
    });

    if (post1997(job.buildEra) && alarms.some(is9v)) {
      push(out, { id: "post1997-9v", auto: true, priority: "Urgent", source: "Smoke alarm",
        text: "Post-1997 dwelling requires 240V mains-powered alarm with backup" });
    }
    if (alarms.length > 1 && alarms.some(function (a) { return a.interconnected === "no"; })) {
      push(out, { id: "interconnect", auto: true, priority: "Routine", source: "Smoke alarm",
        text: "More than one smoke alarm is installed and they are not all interconnected" });
    }
    if (prop.everyStorey === "no") {
      push(out, { id: "storey", auto: true, priority: "Urgent", source: "Property",
        text: "A smoke alarm is not installed on every storey" });
    }
    if (prop.sleeping === "no") {
      push(out, { id: "sleep", auto: true, priority: "Urgent", source: "Property",
        text: "A smoke alarm is not installed in each hallway serving bedrooms, or between the bedrooms and the rest of the dwelling" });
    }
    if (job.renterInfo === "no") {
      push(out, { id: "renter", auto: true, priority: "High", source: "Property",
        text: "Renter was not provided with written information on smoke alarm operation and testing (RTR 2021 Sch 3 cl 3(3))" });
    }

    const minFail = boardOn && (sb.protection === "rewireable" || sb.protection === "mixed-fuses" || sb.minStandard === "no" || sb.rcdFitted === "no");
    if (minFail) {
      push(out, { id: "minstd", auto: true, priority: "Urgent", source: "Switchboard",
        text: "Switchboard does not meet the rental minimum standard. Every power outlet and lighting circuit must be protected by switchboard circuit breakers and RCDs (RTR 2021 Sch 4 cl 9)" });
    }
    if (boardOn) (sb.rcdTests || []).forEach(function (t, i) {
      if (t && t.result === "fail") {
        push(out, { id: "rcd-" + i, auto: true, priority: "Urgent", source: "Switchboard",
          text: "RCD push-button test failed" + (t.circuit ? " (" + t.circuit + ")" : "") + ". A timed trip test requires a licensed electrician" });
      }
    });
    if (boardOn && sb.overheating === "yes") push(out, { id: "heat", auto: true, priority: "Urgent", source: "Switchboard", text: "Switchboard shows signs of overheating, scorching or a burning smell" });
    if (boardOn && sb.exposed === "yes") push(out, { id: "live", auto: true, priority: "Urgent", source: "Switchboard", text: "Exposed live parts were observed at the switchboard" });
    if (boardOn && sb.diy === "yes") push(out, { id: "diy", auto: true, priority: "Urgent", source: "Switchboard", text: "Signs of DIY or non-compliant work at the switchboard. Requires a licensed electrician" });
    if (boardOn && (sb.pre1990 === "yes" || sb.asbestos === "yes")) push(out, { id: "asb", auto: true, priority: "High", source: "Switchboard", text: "Suspected asbestos backing, do not drill or disturb" });
    if (boardOn && sb.mainSwitch === "no") push(out, { id: "mainsw", auto: true, priority: "Urgent", source: "Switchboard", text: "Main switch is missing or not labelled" });
    if (boardOn && (sb.enclosure === "no" || sb.secure === "no" || sb.damage === "yes" || sb.door === "no")) push(out, { id: "enc", auto: true, priority: "High", source: "Switchboard", text: "Switchboard enclosure is damaged or insecure, or the door does not close" });
    if (boardOn && sb.labelling === "no") push(out, { id: "labels", auto: true, priority: "High", source: "Switchboard", text: "Circuit labelling is not legible and complete" });
    if (boardOn && sb.blanks === "no") push(out, { id: "blanks", auto: true, priority: "High", source: "Switchboard", text: "Switchboard has missing blanks" });
    if (boardOn && (sb.dry === "no" || sb.waterVermin === "yes")) push(out, { id: "wet", auto: true, priority: "High", source: "Switchboard", text: "Switchboard is not dry, or shows water or vermin" });
    if (boardOn && sb.earth === "no") push(out, { id: "earth", auto: true, priority: "High", source: "Switchboard", text: "Main earth / MEN was not visible where the switchboard was accessible" });

    (state.extraDefects || []).forEach(function (d, i) {
      const pri = d && (d.priority === "Urgent" || d.priority === "High" || d.priority === "Routine") ? d.priority : "Routine";
      if (d && String(d.text || "").trim()) {
        push(out, { id: "extra-" + i, auto: false, priority: pri, source: "Noted on site", text: String(d.text).trim(), action: d.action || "" });
      }
    });
    out.forEach(function (d) { if (!d.action) d.action = recommendation(d.text); });
    return out;
  }

  function propertyCompliant(state, now) {
    const alarms = state.alarms || [];
    const prop = state.property || {};
    if (!alarms.length) return false;
    if (alarms.some(function (a) { return isExpired(a, now); })) return false;
    if (alarms.some(function (a) { return a.result === "Fail" || a.result === "Requires electrician" || a.testButton === "fail" || a.mounting === "no"; })) return false;
    if (prop.everyStorey === "no" || prop.sleeping === "no") return false;
    if (post1997((state.job || {}).buildEra) && alarms.some(is9v)) return false;
    return true;
  }

  function switchboardResult(state) {
    const sb = state.switchboard || {};
    if (!sb.location && !sb.protection && !sb.minStandard && !sb.mainSwitch) return "Not recorded";
    if (sb.protection === "rewireable" || sb.protection === "mixed-fuses" || sb.minStandard === "no" || sb.rcdFitted === "no") {
      return "Does not meet rental minimum standard";
    }
    const rcdFail = (sb.rcdTests || []).some(function (t) { return t && t.result === "fail"; });
    if (rcdFail || sb.overheating === "yes" || sb.exposed === "yes" || sb.diy === "yes") return "Requires licensed electrician";
    if (sb.mainSwitch === "no" || sb.labelling === "no" || sb.enclosure === "no" || sb.secure === "no" || sb.damage === "yes" || sb.door === "no" || sb.blanks === "no" || sb.dry === "no" || sb.waterVermin === "yes" || sb.mains === "no") {
      return "Defects found";
    }
    if (sb.pre1990 === "yes" || sb.asbestos === "yes" || sb.earth === "no") return "Check required";
    return "Satisfactory";
  }

  function smokeHardFail(state, now) {
    const alarms = state.alarms || [];
    if (alarms.some(function (a) {
      return isExpired(a, now) || a.testButton === "fail" || a.result === "Fail" || a.result === "Requires electrician";
    })) return true;
    if (post1997((state.job || {}).buildEra) && alarms.some(is9v)) return true;
    return false;
  }

  /* PASS, FAIL, or ACTION REQUIRED. Smoke compliance NO never produces a pass badge. */
  function overall(state, now) {
    const defs = collectDefects(state, now);
    if (inScope(state, "smoke")) {
      const smokeNo = !propertyCompliant(state, now);
      if (smokeNo && smokeHardFail(state, now)) return "FAIL";
      if (smokeNo) return "ACTION REQUIRED";
    }
    if (inScope(state, "switchboard")) {
      const sb = switchboardResult(state);
      if (sb === "Does not meet rental minimum standard" || sb === "Requires licensed electrician") return "FAIL";
      if (sb === "Defects found" || sb === "Check required") return "ACTION REQUIRED";
    }
    if (defs.some(function (d) { return d.priority === "Urgent" || d.priority === "High"; })) return "ACTION REQUIRED";
    return "PASS";
  }

  function displayResult(alarm, now) {
    if (isExpired(alarm, now)) return "Replace (expired / >10 yrs)";
    return (alarm && alarm.result) || "—";
  }

  function pdfBlockers(state, now) {
    const b = [];
    const job = state.job || {};
    const ins = state.inspector || {};
    const prop = state.property || {};
    const sb = state.switchboard || {};
    const sign = state.sign || {};
    const alarms = state.alarms || [];
    const smoke = inScope(state, "smoke");
    const board = inScope(state, "switchboard");
    if (state.scope && !smoke && !board) b.push("Tick at least one part of the inspection");
    if (!job.address) b.push("Property address is required");
    if (!job.inspectedAt) b.push("Inspection date is required");
    if (!ins.techName) b.push("Technician name is required");
    if (smoke) {
      if (!job.buildEra) b.push("Build date / era is required");
      if (!job.storeys) b.push("Number of storeys is required");
      if (!job.renterInfo) b.push("Answer whether the renter was given written smoke alarm information");
      if (!alarms.length) b.push("Add at least one smoke alarm");
      alarms.forEach(function (a, i) {
        const miss = alarmMissing(a);
        if (miss.length) b.push("Alarm " + (i + 1) + " (" + locationText(a, i) + "): add " + miss.join(", "));
      });
      if (!prop.everyStorey) b.push("Answer whether an alarm is installed on every storey");
      if (!prop.sleeping) b.push("Answer whether each hallway serving bedrooms is covered");
    }
    if (board) {
      if (!sb.location) b.push("Switchboard location is required");
      if (!sb.protection) b.push("Circuit protection type is required");
      if (!sb.minStandard) b.push("Answer whether every power and lighting circuit has a breaker and an RCD");
    }
    if (!sign.printedName) b.push("Printed name on the declaration is required");
    if (!sign.signature) b.push("Inspector signature is required");
    if (!sign.date) b.push("Sign-off date is required");
    if (!sign.nextDue) b.push("Next smoke alarm check due date is required");
    if (!sign.nextElectrical) b.push("Next electrical check due date is required");
    if (sign.elecSignoff && (!ins.supName || !ins.supRec || !ins.supLic || !ins.supBusiness)) {
      b.push("Licensed electrician sign-off needs the name, REC number, licence number and business name");
    }
    if (sign.onBehalf) {
      const c = sign.contractor || {};
      if (!sign.preparer) b.push("Report-preparer business name is required");
      if (!c.name || !c.rec || !c.electrician || !c.licence) {
        b.push("Contractor authorisation needs the business name, REC number, authorising electrician name and licence number");
      }
      if (!sign.elecSignature) b.push("Authorising electrician signature is required");
    }
    return b;
  }

  function yn(v, yesText, noText) {
    if (v === "yes") return yesText || "Yes";
    if (v === "no") return noText || "No";
    if (v === "na") return "Not accessible";
    return "—";
  }

  function mark(v, pass, fail) {
    if (v === "yes") return pass || "PASS";
    if (v === "no") return fail || "FAIL";
    return "N/A";
  }

  function obs(note, fallback) {
    const n = String(note || "").trim();
    return n || fallback;
  }

  function part(label, v, yesText, noText) {
    if (!v || isNA(v)) return "";
    return label + ": " + yn(v, yesText, noText);
  }

  function switchboardRows(state) {
    const sb = state.switchboard || {};
    const tests = (sb.rcdTests || []).filter(function (t) { return t && t.result !== "na" && (t.circuit || t.result || t.trip); });
    const rcdFail = tests.some(function (t) { return t.result === "fail"; });
    const rcdPass = tests.length > 0 && tests.every(function (t) { return t.result === "pass"; });
    const circuits = { all: "power and lighting", power: "power", lighting: "lighting", some: "some circuits", none: "no circuits" };
    const rcdObs = obs(sb.rcdNote, tests.length
      ? (sb.rcdCount && !isNA(sb.rcdFitted) ? sb.rcdCount + " RCD" + (String(sb.rcdCount) === "1" ? "" : "s") + " tested" : tests.length + " RCD test" + (tests.length === 1 ? "" : "s"))
        + (sb.rcdCircuits && !isNA(sb.rcdCircuits) ? " — " + (circuits[sb.rcdCircuits] || sb.rcdCircuits) : "")
        + ". " + tests.map(function (t) {
          return (t.circuit || "RCD") + " " + (t.result === "pass" ? "pass" : t.result === "fail" ? "fail" : "not recorded") + (t.trip ? " (instrument " + t.trip + ")" : "");
        }).join("; ")
      : "Push-button test not recorded");
    const fuse = sb.protection === "rewireable" || sb.protection === "mixed-fuses";
    const heat = sb.overheating === "yes" || sb.exposed === "yes";
    const asbestos = !isNA(sb.pre1990) && (sb.pre1990 === "yes" || sb.asbestos === "yes");
    const encParts = [
      part("Secure", sb.secure),
      part("Damage", sb.damage, "Yes", "None seen"),
      part("Door closes", sb.door),
      part("Blanks fitted", sb.blanks),
      part("Dry", sb.dry),
      part("Water or vermin", sb.waterVermin, "Present", "None seen")
    ].filter(Boolean);
    const encNA = [sb.secure, sb.damage, sb.door, sb.blanks, sb.dry, sb.waterVermin].every(isNA);
    const rows = [
      { item: "Switchboard location", observation: sb.location || "—", result: sb.location ? "PASS" : "N/A", omit: !sb.location },
      { item: "Main switch", observation: obs(sb.mainSwitchNote, sb.mainSwitch === "yes" ? "Present and labelled" : "Missing or not labelled"), result: mark(sb.mainSwitch), omit: isNA(sb.mainSwitch) || !sb.mainSwitch },
      { item: "RCD push-button test", observation: rcdObs, result: rcdFail ? "FAIL" : rcdPass ? "PASS" : "N/A", omit: isNA(sb.rcdFitted) && !tests.length },
      { item: "Circuit labelling", observation: obs(sb.labelNote, sb.labelling === "yes" ? "Legible and complete" : "Not legible or not complete"), result: mark(sb.labelling), omit: isNA(sb.labelling) || !sb.labelling },
      { item: "Signs of heat / damage", observation: obs(sb.heatNote, heat ? "Overheating, scorching, burning smell or exposed live parts observed" : "No discolouration, arcing or burning observed"), result: heat ? "FAIL" : "PASS", omit: (isNA(sb.overheating) || !sb.overheating) && (isNA(sb.exposed) || !sb.exposed) },
      { item: "Rewireable fuses", observation: obs(sb.fuseNote, fuse ? "Rewireable fuses present — does not meet the rental minimum standard" : (sb.protection === "rcbo" ? "Not present — RCBOs" : "Not present — all circuit breakers")), result: fuse ? "FAIL" : "N/A", omit: isNA(sb.protection) || !sb.protection },
      { item: "Power and lighting protected", observation: obs(sb.minNote, (sb.minStandard === "no" || sb.rcdFitted === "no" || fuse) ? "Not every power outlet and lighting circuit is on a circuit breaker and an RCD (RTR 2021 Sch 4 cl 9)" : "Every power outlet and lighting circuit is on a circuit breaker and an RCD"), result: (sb.minStandard === "no" || sb.rcdFitted === "no" || fuse) ? "FAIL" : "PASS", omit: isNA(sb.minStandard) && !fuse && sb.rcdFitted !== "no" },
      { item: "Enclosure, blanks, moisture", observation: obs(sb.enclosureNote, encParts.join(". ")), result: (sb.enclosure === "no" || sb.blanks === "no" || sb.dry === "no" || sb.waterVermin === "yes" || sb.secure === "no" || sb.damage === "yes" || sb.door === "no") ? "FAIL" : "PASS", omit: encNA || (!encParts.length && !String(sb.enclosureNote || "").trim()) },
      { item: "Possible asbestos (switchboard backing)", observation: obs(sb.asbestosNote, asbestos ? "Suspected asbestos backing, do not drill or disturb" : "Not indicated"), result: asbestos ? "CHECK" : "PASS", omit: isNA(sb.pre1990) || (!sb.pre1990 && !sb.asbestos) },
      { item: "Main earthing", observation: obs(sb.earthNote, sb.earth === "yes" ? "Main earth / MEN visible where accessible" : "Main earth / MEN not visible where the board was accessible"), result: sb.earth === "no" ? "CHECK" : "PASS", omit: isNA(sb.earth) || !sb.earth },
      { item: "Consumer mains / meter enclosure", observation: obs(sb.mainsNote, sb.mains === "yes" ? "No visible damage" : "Damage observed"), result: mark(sb.mains), omit: isNA(sb.mains) || !sb.mains },
      { item: "DIY or non-compliant work", observation: obs(sb.diyNote, sb.diy === "yes" ? "Signs of DIY or non-compliant work" : "None seen"), result: sb.diy === "yes" ? "FAIL" : "PASS", omit: isNA(sb.diy) || !sb.diy }
    ];
    return rows.filter(function (r) { return !r.omit; });
  }

  return {
    LIMITATIONS: LIMITATIONS,
    REFERENCES: REFERENCES,
    TITLE: TITLE,
    VISUAL_NOTE: VISUAL_NOTE,
    ERA_LABEL: ERA_LABEL,
    LOCATIONS: LOCATIONS,
    POWERS: POWERS,
    TYPES: TYPES,
    parseDate: parseDate,
    fmtDate: fmtDate,
    fmtWhen: fmtWhen,
    plusMonths: plusMonths,
    reportNoFrom: reportNoFrom,
    isMains: isMains,
    inScope: inScope,
    isNA: isNA,
    is9v: is9v,
    post1997: post1997,
    isExpired: isExpired,
    locationText: locationText,
    alarmMissing: alarmMissing,
    audioFilename: audioFilename,
    pdfFilename: pdfFilename,
    collectDefects: collectDefects,
    propertyCompliant: propertyCompliant,
    switchboardResult: switchboardResult,
    overall: overall,
    displayResult: displayResult,
    pdfBlockers: pdfBlockers,
    switchboardRows: switchboardRows,
    recommendation: recommendation
  };
});
