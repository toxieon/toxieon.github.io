/* Neill Inspect — on-device smoke alarm and switchboard report. No login. */
const APP_VERSION = "0.1.2";
(function () {
  "use strict";
  const L = window.NILogic;
  const DRAFT_KEY = "nd:inspect:draft:v1";
  const PROFILE_KEY = "nd:inspect:profile:v1";
  const DB_NAME = "nd-inspect";
  const STORE = "reports";
  const MAPS_KEY = "AIzaSyDlf9uWhJl1yXwDq8GU8V4p9DDoC1zNn0w";

  let state = null;
  let alarmOpen = 0;
  let recCtl = null;
  let toastTimer = 0;

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }
  function uid() { return Math.random().toString(36).slice(2, 10); }
  function pad(n) { return String(n).padStart(2, "0"); }
  function nowInput() {
    const d = new Date();
    return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate()) + "T" + pad(d.getHours()) + ":" + pad(d.getMinutes());
  }
  function today() { return nowInput().slice(0, 10); }
  function getPath(obj, path) {
    return String(path).split(".").reduce((o, k) => (o == null ? o : o[k]), obj);
  }
  function setPath(obj, path, value) {
    const parts = String(path).split(".");
    let o = obj;
    for (let i = 0; i < parts.length - 1; i++) {
      if (o[parts[i]] == null) o[parts[i]] = /^\d+$/.test(parts[i + 1]) ? [] : {};
      o = o[parts[i]];
    }
    o[parts[parts.length - 1]] = value;
  }
  function clone(o) { return JSON.parse(JSON.stringify(o)); }
  function toast(msg) {
    const el = document.getElementById("toast");
    el.textContent = msg;
    el.style.display = "block";
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { el.style.display = "none"; }, 4200);
  }

  function blankAlarm() {
    return {
      id: uid(), location: "", locationDetail: "", storey: "", type: "", power: "", interconnected: "",
      dateKind: "manufacture", dateValue: "", mounting: "", as3786: "", testButton: "", interconnectTest: "",
      smokeTest: "", batteryReplaced: "", batteryType: "", cleaned: "", secure: "", hush: "", result: "",
      photo: "", notes: "", audio: null
    };
  }
  function loadProfile() {
    try { return JSON.parse(localStorage.getItem(PROFILE_KEY) || "null"); } catch (e) { return null; }
  }
  function blank() {
    const profile = loadProfile() || {};
    const ins = profile.inspector || {};
    return {
      reportNo: L.reportNoFrom(new Date()),
      example: false,
      step: 0,
      scope: { smoke: false, switchboard: false },
      savedAt: "",
      uploadStatus: "",
      job: {
        inspectedAt: nowInput(), address: "", unit: "", agency: "", pmName: "", pmEmail: "",
        tenantPresent: "", tenantName: "", accessNotes: "", occupancy: "", buildEra: "", storeys: "",
        renterInfo: "", previousCheck: ""
      },
      inspector: {
        techName: ins.techName || "", techPhone: ins.techPhone || "", techEmail: ins.techEmail || "",
        techLic: ins.techLic || "", supName: ins.supName || "", supRec: ins.supRec || "",
        supLic: ins.supLic || "", supBusiness: ins.supBusiness || "", logo: ins.logo || ""
      },
      property: { everyStorey: "", sleeping: "", recommendations: "" },
      alarms: [],
      switchboard: {
        location: "", secure: "", damage: "", door: "", blanks: "", dry: "", waterVermin: "",
        mainSwitch: "", labelling: "", protection: "", rcdFitted: "", rcdCount: "", rcdCircuits: "",
        rcdTests: [], minStandard: "", overheating: "", exposed: "", pre1990: "", earth: "",
        mains: "", diy: "", notes: "", photos: []
      },
      extraDefects: [],
      sign: {
        signature: "", elecSignature: "", supSignature: "", elecSignoff: false, printedName: ins.techName || "", date: today(),
        nextDue: L.plusMonths(today(), 12), nextElectrical: L.plusMonths(today(), 24),
        onBehalf: false, preparer: profile.preparer || "Neill Data",
        contractor: { name: "", rec: "", electrician: "", licence: "", phone: "", email: "", logo: "" }
      }
    };
  }

  function saveProfile() {
    if (!state || state.example) return;
    try {
      localStorage.setItem(PROFILE_KEY, JSON.stringify({
        inspector: state.inspector,
        preparer: state.sign.preparer || "Neill Data"
      }));
    } catch (e) { /* profile is optional */ }
  }
  function saveDraft() {
    if (!state) return;
    const attempts = [state];
    const noAudio = clone(state);
    (noAudio.alarms || []).forEach((a) => { if (a.audio) a.audio = { mime: a.audio.mime, seconds: a.audio.seconds, omitted: true }; });
    attempts.push(noAudio);
    const noMedia = clone(noAudio);
    (noMedia.alarms || []).forEach((a) => { a.photo = a.photo ? "omitted" : ""; });
    if (noMedia.inspector) noMedia.inspector.logo = "";
    if (noMedia.sign && noMedia.sign.contractor) noMedia.sign.contractor.logo = "";
    noMedia.switchboard.photos = [];
    attempts.push(noMedia);
    for (let i = 0; i < attempts.length; i++) {
      try {
        localStorage.setItem(DRAFT_KEY, JSON.stringify(attempts[i]));
        if (i > 0) toast("This device is low on storage. The draft was saved without photos or audio. They stay on screen until you reload.");
        return;
      } catch (e) { /* try a smaller copy */ }
    }
    toast("This device is out of storage, so the latest change could not be saved. Remove a photo or download the PDF.");
  }
  let draftTimer = 0;
  function saveSoon() { clearTimeout(draftTimer); draftTimer = setTimeout(saveDraft, 150); }

  function db() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => {
        const d = req.result;
        if (!d.objectStoreNames.contains(STORE)) d.createObjectStore(STORE, { keyPath: "id" });
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }
  function idbPut(rec) {
    return db().then((d) => new Promise((resolve, reject) => {
      const tx = d.transaction(STORE, "readwrite");
      tx.objectStore(STORE).put(rec);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    }));
  }
  function idbAll() {
    return db().then((d) => new Promise((resolve, reject) => {
      const tx = d.transaction(STORE, "readonly");
      const req = tx.objectStore(STORE).getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => reject(req.error);
    }));
  }
  function idbGet(id) {
    return db().then((d) => new Promise((resolve, reject) => {
      const req = d.transaction(STORE, "readonly").objectStore(STORE).get(id);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => reject(req.error);
    }));
  }

  function field(label, path, type, extra) {
    const v = getPath(state, path);
    return '<label class="field"><span>' + label + '</span><input data-bind="' + esc(path) + '" type="' + (type || "text") + '" value="' + esc(v || "") + '" ' + (extra || "") + '></label>';
  }
  function area(label, path) {
    return '<label class="field"><span>' + label + '</span><textarea data-bind="' + esc(path) + '">' + esc(getPath(state, path) || "") + '</textarea></label>';
  }
  function select(label, path, options) {
    const cur = getPath(state, path) || "";
    const opts = options.map((o) => '<option value="' + esc(o[0]) + '"' + (cur === o[0] ? " selected" : "") + '>' + esc(o[1]) + '</option>').join("");
    return '<label class="field"><span>' + label + '</span><select data-bind="' + esc(path) + '">' + opts + '</select></label>';
  }
  function chips(path, options) {
    const cur = getPath(state, path) || "";
    return '<div class="chips">' + options.map((o) => '<button type="button" class="chip' + (cur === o[0] ? " on" : "") + '" data-chip="' + esc(path) + '" data-val="' + esc(o[0]) + '">' + esc(o[1]) + '</button>').join("") + '</div>';
  }
  const YN = [["yes", "Yes"], ["no", "No"], ["na", "N/A"]];
  const PF = [["pass", "Pass"], ["fail", "Fail"], ["na", "N/A"]];

  function steps() {
    const list = [
      { id: "scope", title: "Scope" },
      { id: "job", title: "Job details" },
      { id: "inspector", title: "Inspector" }
    ];
    if (state.scope && state.scope.smoke) list.push({ id: "alarms", title: "Smoke alarms" });
    if (state.scope && state.scope.switchboard) list.push({ id: "board", title: "Switchboard" });
    list.push({ id: "defects", title: "Defects" });
    list.push({ id: "sign", title: "Sign-off" });
    list.push({ id: "report", title: "Report" });
    return list;
  }
  function scopeHtml() {
    const on = (k) => !!(state.scope && state.scope[k]);
    const box = (k, label, help) => '<button type="button" class="chip' + (on(k) ? " on" : "") + '" data-scope="' + k + '">' + label + '</button><p class="help">' + help + '</p>';
    return '<section class="card"><h2>What is being inspected?</h2><p class="help">Tick at least one. Only the ticked parts are asked later and printed on the PDF.</p>' +
      box("smoke", "Smoke alarms", "Each alarm, where they are fitted, and the written information for the renter.") +
      box("switchboard", "Switchboard (visual)", "A visual look at the switchboard. Not a full electrical safety check.") +
      "</section>";
  }
  function jobHtml() {
    const j = "job";
    return '<section class="card"><h2>When and where</h2>' +
      field("Inspection date and time", j + ".inspectedAt", "datetime-local") +
      '<div class="addr"><label class="field" style="flex:1"><span>Property address</span><input id="job-address" data-bind="job.address" value="' + esc(state.job.address || "") + '" placeholder="Type the address, or use Here"></label>' +
      '<button type="button" class="btn btn-utility" id="use-location-btn" title="Use my current location">Here</button></div>' +
      field("Unit / lot", j + ".unit") +
      "</section><section class=\"card\"><h2>Agency</h2>" +
      field("Agency name", j + ".agency") +
      field("Property manager name", j + ".pmName") +
      field("Property manager email", j + ".pmEmail", "email") +
      "</section><section class=\"card\"><h2>Occupancy</h2><p class=\"lbl\">Tenant present</p>" +
      chips(j + ".tenantPresent", YN) +
      field("Tenant name", j + ".tenantName") +
      '<p class="lbl">Occupancy</p>' + chips(j + ".occupancy", [["tenanted", "Tenanted"], ["vacant", "Vacant"]]) +
      area("Access notes", j + ".accessNotes") +
      field("Previous check", j + ".previousCheck", "text", 'placeholder="Date or Unknown"') +
      "</section>";
  }

  function inspectorHtml() {
    return '<section class="card"><h2>Technician (performed inspection)</h2>' +
      field("Full name", "inspector.techName") +
      field("Phone", "inspector.techPhone", "tel") +
      field("Email", "inspector.techEmail", "email") +
      field("Licence or ID (optional)", "inspector.techLic") +
      "</section><section class=\"card\"><h2>Logo</h2><p class=\"help\">Shown at the top left of the PDF. Remembered on this device.</p>" +
      '<button type="button" class="btn" data-action="pick" data-for="logo-tech">Upload logo</button>' +
      '<input id="logo-tech" type="file" accept="image/*" data-logo="inspector" hidden>' +
      (state.inspector.logo ? '<img class="thumb" alt="Logo preview" src="' + state.inspector.logo + '">' : "") +
      "</section>";
  }

  function alarmCard(a, i) {
    const open = alarmOpen === i;
    const miss = L.alarmMissing(a);
    const head = '<div class="alarm-sum"><div><strong>Alarm ' + (i + 1) + '</strong><div class="muted">' + esc(L.locationText(a, i)) + '</div></div>' +
      '<button type="button" class="btn" data-action="toggle-alarm" data-i="' + i + '">' + (open ? "Close" : "Edit") + '</button></div>';
    if (!open) return head;
    const p = "alarms." + i;
    return head + '<div class="card" style="margin-top:8px">' +
      (miss.length ? '<p class="err">Alarm ' + (i + 1) + " (" + esc(L.locationText(a, i)) + "): add " + esc(miss.join(", ")) + " before this alarm can be finished.</p>" : "") +
      (L.isExpired(a) ? '<p class="badge bad">Replace: over 10 years / expired</p>' : "") +
      select("Location", p + ".location", [["" , "Select location"]].concat(L.LOCATIONS.map((x) => [x, x]))) +
      '<p class="req">Location is required.</p>' +
      field("Location detail (optional)", p + ".locationDetail") +
      field("Storey", p + ".storey", "text", 'placeholder="Ground, 1, 2"') +
      select("Type", p + ".type", [["", "Select"], ["Photoelectric", "Photoelectric"], ["Ionisation", "Ionisation"], ["Unknown", "Unknown"]]) +
      select("Power", p + ".power", [["" , "Select"]].concat(L.POWERS.map((x) => [x, x]))) +
      '<p class="lbl">Interconnected</p>' + chips(p + ".interconnected", YN) +
      '<p class="lbl">Date on the alarm</p>' + chips(p + ".dateKind", [["manufacture", "Manufacture date"], ["expiry", "Expiry date"]]) +
      field("Manufacture or expiry date", p + ".dateValue", "date") +
      '<p class="req">A manufacture date or an expiry date is required. Over 10 years, or past expiry, is flagged for replacement.</p>' +
      '<p class="lbl">Mounting position compliant</p><p class="help">Ceiling, at least 300 mm from walls and corners and away from dead air, or on the wall at least 300 mm below the ceiling. Not within about 300 mm of a light or about 400 mm of an air vent.</p>' +
      chips(p + ".mounting", YN) +
      '<p class="lbl">AS 3786 label present</p>' + chips(p + ".as3786", YN) +
      '<p class="lbl">Test button operated and alarm sounded</p>' + chips(p + ".testButton", PF) +
      '<p class="lbl">Interconnect activated other alarms</p>' + chips(p + ".interconnectTest", YN) +
      '<p class="lbl">Smoke / aerosol test (optional)</p>' + chips(p + ".smokeTest", PF) +
      '<p class="lbl">Battery replaced</p>' + chips(p + ".batteryReplaced", YN) +
      field("Battery type", p + ".batteryType") +
      '<p class="lbl">Clean and dust-free</p>' + chips(p + ".cleaned", YN) +
      '<p class="lbl">Secure, no damage, paint or cover</p>' + chips(p + ".secure", [["yes", "Yes"], ["no", "No"]]) +
      '<p class="lbl">Hush works</p><p class="help">Press hush/silence button; alarm should quieten then re-arm.</p>' + chips(p + ".hush", YN) +
      select("Result", p + ".result", [["", "Select"], ["Pass", "Pass"], ["Fail", "Fail"], ["Replaced", "Replaced"], ["Requires electrician", "Requires electrician"], ["na", "N/A"]]) +
      '<p class="lbl">Photo of this alarm <span class="req">required</span></p>' +
      '<button type="button" class="btn" data-action="pick" data-for="photo-' + i + '">Take photo</button>' +
      '<input id="photo-' + i + '" hidden type="file" accept="image/*" capture="environment" data-photo="' + i + '">' +
      (a.photo && a.photo.indexOf("data:image/") === 0 ? '<img class="thumb" alt="Alarm photo" src="' + a.photo + '">' : '<p class="help">Use the camera. The photo is compressed and stored on this device.</p>') +
      '<p class="lbl">Record alarm sounding (optional, about 8 seconds)</p>' +
      (recCtl && recCtl.i === i ? '<button type="button" class="btn btn-danger" data-action="stop-rec">Stop</button><p class="help">Recording…</p>' :
        '<button type="button" class="btn" data-action="record" data-i="' + i + '">Record alarm sounding</button>') +
      (a.audio && a.audio.dataUrl ? '<audio controls src="' + a.audio.dataUrl + '"></audio><p class="muted">' + esc(L.audioFilename(state, a, i)) + (a.audio.seconds ? " (" + a.audio.seconds + "s)" : "") + '</p><button type="button" class="btn btn-ghost" data-action="clear-audio" data-i="' + i + '">Remove audio</button>' : "") +
      area("Notes", p + ".notes") +
      '<div class="row-actions"><button type="button" class="btn btn-primary" data-action="finish-alarm" data-i="' + i + '">Finish alarm</button>' +
      '<button type="button" class="btn btn-danger" data-action="remove-alarm" data-i="' + i + '">Remove</button></div></div>';
  }

  function alarmsHtml() {
    const list = (state.alarms || []).map(alarmCard).join("") || '<p class="help">No alarms yet.</p>';
    return '<section class="card"><h2>Smoke alarms</h2><p class="help">One alarm at a time. Location, a photo, and a manufacture or expiry date are required.</p>' +
      list + '<button type="button" class="btn" data-action="add-alarm">Add smoke alarm</button></section>' +
      '<section class="card"><h2>Whole property</h2>' +
      select("Build / approval date", "job.buildEra", [["", "Select"], ["unknown", "Unknown"], ["pre-1997", "Before 1 August 1997"], ["1997-2014", "1 August 1997 to 30 April 2014"], ["post-2014", "On or after 1 May 2014"]]) +
      select("Number of storeys", "job.storeys", [["", "Select"], ["1", "1"], ["2", "2"], ["3", "3"], ["4+", "4 or more"]]) +
      '<p class="lbl">Alarm installed on every storey</p>' + chips("property.everyStorey", YN) +
      '<p class="lbl">Alarm in each hallway serving bedrooms, or between the bedrooms and the rest of the dwelling</p>' + chips("property.sleeping", YN) +
      '<p class="lbl">Renter provided with written information on smoke alarm operation and testing (Residential Tenancies Regulations 2021 (Vic))</p>' +
      chips("job.renterInfo", YN) +
      area("Recommendations", "property.recommendations") +
      "</section>";
  }

  function rcdRow(t, i) {
    const p = "switchboard.rcdTests." + i;
    return '<div class="card"><p class="lbl">RCD ' + (i + 1) + '</p>' +
      field("Circuit", p + ".circuit") +
      '<p class="lbl">Push-button test</p>' + chips(p + ".result", PF) +
      field("Trip time if a licensed electrician used an instrument (optional)", p + ".trip") +
      '<button type="button" class="btn btn-ghost" data-action="remove-rcd" data-i="' + i + '">Remove test</button></div>';
  }

  function boardHtml() {
    const sb = state.switchboard;
    return '<section class="card"><h2>Switchboard</h2><p class="help">Visual check only. Push-button RCD test. A timed trip test is for a licensed electrician.</p>' +
      field("Switchboard location", "switchboard.location") +
      '<p class="lbl">Enclosure secure</p>' + chips("switchboard.secure", YN) +
      '<p class="lbl">Visible damage</p>' + chips("switchboard.damage", [["no", "No damage"], ["yes", "Damage"], ["na", "N/A"]]) +
      '<p class="lbl">Door closes / lockable</p>' + chips("switchboard.door", YN) +
      '<p class="lbl">Blanks fitted (no missing blanks)</p>' + chips("switchboard.blanks", YN) +
      '<p class="lbl">Dry</p>' + chips("switchboard.dry", YN) +
      '<p class="lbl">Water or vermin</p>' + chips("switchboard.waterVermin", [["no", "None seen"], ["yes", "Present"], ["na", "N/A"]]) +
      '<p class="lbl">Main switch present and labelled</p>' + chips("switchboard.mainSwitch", YN) +
      field("Main switch note", "switchboard.mainSwitchNote") +
      '<p class="lbl">Circuit labelling legible and complete</p>' + chips("switchboard.labelling", YN) +
      field("Labelling note", "switchboard.labelNote") +
      select("Circuit protection", "switchboard.protection", [["", "Select"], ["breakers", "Circuit breakers"], ["rcbo", "RCBOs"], ["rewireable", "Rewireable fuses"], ["mixed-fuses", "Mixed, includes rewireable fuses"], ["na", "N/A"]]) +
      '<p class="lbl">RCD / safety switch fitted</p>' + chips("switchboard.rcdFitted", YN) +
      field("How many RCDs", "switchboard.rcdCount") +
      select("Circuits protected", "switchboard.rcdCircuits", [["", "Select"], ["all", "Power and lighting"], ["power", "Power only"], ["lighting", "Lighting only"], ["some", "Some circuits"], ["none", "None"]]) +
      '<p class="lbl">Every power outlet and lighting circuit protected by a circuit breaker and an RCD (Residential Tenancies Regulations 2021 (Vic))</p>' +
      chips("switchboard.minStandard", YN) +
      "<h3>RCD push-button tests</h3>" + (sb.rcdTests || []).map(rcdRow).join("") +
      '<button type="button" class="btn" data-action="add-rcd">Add RCD test</button>' +
      '<p class="lbl">Overheating, scorching or burning smell</p>' + chips("switchboard.overheating", [["no", "None seen"], ["yes", "Yes"], ["na", "N/A"]]) +
      '<p class="lbl">Exposed live parts</p>' + chips("switchboard.exposed", [["no", "None seen"], ["yes", "Yes"], ["na", "N/A"]]) +
      '<p class="lbl">Pre-1990 board (suspected asbestos backing — do not drill or disturb)</p>' + chips("switchboard.pre1990", [["no", "No"], ["yes", "Yes — flag CHECK"], ["na", "N/A"]]) +
      '<p class="lbl">Main earth / MEN visible where accessible</p>' + chips("switchboard.earth", YN) +
      '<p class="lbl">Consumer mains / meter enclosure undamaged</p>' + chips("switchboard.mains", [["yes", "No visible damage"], ["no", "Damage"], ["na", "N/A"]]) +
      '<p class="lbl">Signs of DIY or non-compliant work</p>' + chips("switchboard.diy", [["no", "None seen"], ["yes", "Yes"], ["na", "N/A"]]) +
      area("Notes", "switchboard.notes") +
      '<button type="button" class="btn" data-action="pick" data-for="sb-photo">Add switchboard photo</button>' +
      '<input id="sb-photo" hidden type="file" accept="image/*" capture="environment" data-sb-photo="1">' +
      (sb.photos || []).map((p, i) => '<img class="thumb" alt="Switchboard photo" src="' + p.dataUrl + '"><button type="button" class="btn btn-ghost" data-action="remove-sb-photo" data-i="' + i + '">Remove photo</button>').join("") +
      "</section>";
  }

  function defectsHtml() {
    const defs = L.collectDefects(state);
    const rows = defs.filter((d) => d.auto).map((d) => '<div class="alarm-sum"><div><span class="badge ' + (d.priority === "Urgent" ? "bad" : d.priority === "High" ? "warn" : "ok") + '">' + esc(d.priority) + '</span><div>' + esc(d.text) + '</div><div class="muted">' + esc(d.action) + '</div></div></div>').join("") || '<p class="help">No automatic defects yet.</p>';
    const extra = (state.extraDefects || []).map((d, i) => '<div class="card">' + area("Defect", "extraDefects." + i + ".text") + area("Recommended action", "extraDefects." + i + ".action") + '<p class="lbl">Priority</p>' + chips("extraDefects." + i + ".priority", [["Urgent", "Urgent"], ["High", "High"], ["Routine", "Routine"]]) + '<button type="button" class="btn btn-ghost" data-action="remove-defect" data-i="' + i + '">Remove</button></div>').join("");
    return '<section class="card"><h2>From the checks</h2><p class="help">Fails and expired alarms are collected here. Urgent means immediately, High within 7 days, Routine at the next visit.</p>' + rows + '</section>' +
      '<section class="card"><h2>Add a note</h2>' + extra + '<button type="button" class="btn" data-action="add-defect">Add defect</button></section>' +
      '<section class="card"><h2>Overall</h2><p class="badge ' + (L.overall(state) === "PASS" ? "ok" : "bad") + '">' + esc(L.overall(state)) + '</p><p class="help">Property smoke alarms compliant: ' + (L.propertyCompliant(state) ? "YES" : "NO") + '</p></section>';
  }

  function signHtml() {
    ensureDates();
    const c = state.sign.onBehalf;
    return '<section class="card"><h2>Declaration</h2><p class="help">' + esc(L.LIMITATIONS) + '</p>' +
      field("Printed name", "sign.printedName") +
      field("Date", "sign.date", "date") +
      field("Next smoke alarm check due", "sign.nextDue", "date") +
      field("Next electrical check due", "sign.nextElectrical", "date") +
      '<p class="lbl">Technician signature</p><canvas class="sig" data-sign="sign.signature"></canvas>' +
      '<button type="button" class="btn btn-ghost" data-action="clear-sign" data-path="sign.signature">Clear signature</button>' +
      "</section><section class=\"card\"><h2>On behalf of a contractor</h2>" +
      '<p class="lbl">Prepared on behalf of an electrical contractor</p><div class="chips">' +
      '<button type="button" class="chip' + (c ? " on" : "") + '" data-chip="sign.onBehalf" data-val="yes">Yes</button>' +
      '<button type="button" class="chip' + (c ? "" : " on") + '" data-chip="sign.onBehalf" data-val="no">No</button></div>' +
      (c ? field("Report-preparer business name", "sign.preparer") +
        '<p class="help">Entered for this report only. Contractor details are not kept for next time.</p>' +
        field("Contractor business name", "sign.contractor.name") +
        field("REC number", "sign.contractor.rec") +
        field("Authorising electrician name", "sign.contractor.electrician") +
        field("Licence number", "sign.contractor.licence") +
        field("Contractor phone", "sign.contractor.phone", "tel") +
        field("Contractor email", "sign.contractor.email", "email") +
        '<button type="button" class="btn" data-action="pick" data-for="logo-con">Upload contractor logo</button>' +
        '<input id="logo-con" hidden type="file" accept="image/*" data-logo="contractor">' +
        (state.sign.contractor.logo ? '<img class="thumb" alt="Contractor logo" src="' + state.sign.contractor.logo + '">' : "") +
        '<p class="lbl">Authorising electrician signature</p><canvas class="sig" data-sign="sign.elecSignature"></canvas>' +
        '<button type="button" class="btn btn-ghost" data-action="clear-sign" data-path="sign.elecSignature">Clear signature</button>'
        : "") +
      "</section>" + elecHtml();
  }
  function elecHtml() {
    const on = !!state.sign.elecSignoff;
    return '<section class="card"><h2>Licensed electrician sign-off</h2><p class="help">This is the last question. An Electrical Safety Check, and work on mains or hardwired alarms, needs a licensed electrician.</p>' +
      '<p class="lbl">Is a licensed electrician signing this job off?</p><div class="chips">' +
      '<button type="button" class="chip' + (on ? " on" : "") + '" data-chip="sign.elecSignoff" data-val="yes">Yes</button>' +
      '<button type="button" class="chip' + (on ? "" : " on") + '" data-chip="sign.elecSignoff" data-val="no">No</button></div>' +
      (on ? field("Name", "inspector.supName") + field("REC number", "inspector.supRec") + field("Licence number", "inspector.supLic") + field("Business name", "inspector.supBusiness") +
        '<p class="lbl">Supervising electrician signature</p><canvas class="sig" data-sign="sign.supSignature"></canvas>' +
        '<button type="button" class="btn btn-ghost" data-action="clear-sign" data-path="sign.supSignature">Clear signature</button>'
        : '<p class="help">The PDF will be labelled as a visual inspection by the technician. It will not say the mains alarms or the switchboard were certified.</p>') +
      "</section>";
  }

  function reportHtml() {
    const blocks = L.pdfBlockers(state);
    const status = state.uploadStatus === "cloud" ? "Saved to cloud" : (state.uploadStatus === "local" ? "Saved locally only, retry upload" : "");
    return '<section class="card"><h2>Report ' + esc(state.reportNo) + '</h2>' +
      (state.example ? '<p class="badge warn">Example data — not a real inspection</p>' : "") +
      '<p>Overall: <strong>' + esc(L.overall(state)) + '</strong></p>' +
      '<p>Property smoke alarms compliant: <strong>' + (L.propertyCompliant(state) ? "YES" : "NO") + '</strong></p>' +
      (blocks.length ? '<div class="err"><p>The PDF is held until these are done:</p><ul>' + blocks.map((b) => "<li>" + esc(b) + "</li>").join("") + "</ul></div>" : '<p class="help">Ready to generate.</p>') +
      '<div class="row-actions"><button type="button" class="btn" id="btn-preview" data-action="preview">Preview PDF</button>' +
      '<button type="button" class="btn btn-primary" id="btn-download" data-action="download">Download PDF</button>' +
      '<button type="button" class="btn" id="btn-share" data-action="share">Share</button></div>' +
      '<button type="button" class="btn" data-action="audio-files">Download audio files</button>' +
      '<button type="button" class="btn btn-ghost" data-action="new">Start new inspection</button>' +
      (status ? '<p id="save-status"><strong>' + esc(status) + '</strong></p><button type="button" class="btn" data-action="retry">Retry upload</button><p class="muted" id="save-detail">' + esc(state.uploadDetail || "") + '</p>' : '<p id="save-status"></p>') +
      "</section>";
  }

  function render() {
    const root = document.getElementById("app");
    const scroll = document.scrollingElement ? document.scrollingElement.scrollTop : 0;
    const list = steps();
    if (state.step >= list.length) state.step = list.length - 1;
    if (state.step < 0) state.step = 0;
    const id = list[state.step].id;
    const pages = { scope: scopeHtml, job: jobHtml, inspector: inspectorHtml, alarms: alarmsHtml, board: boardHtml, defects: defectsHtml, sign: signHtml, report: reportHtml };
    root.innerHTML = pages[id]();
    document.getElementById("step-label").textContent = "Step " + (state.step + 1) + " of " + list.length + " — " + list[state.step].title;
    document.getElementById("bar").style.width = ((state.step + 1) / list.length * 100) + "%";
    document.getElementById("banner").hidden = !state.example;
    document.getElementById("btn-back").style.display = state.step === 0 ? "none" : "";
    document.getElementById("btn-next").textContent = state.step === list.length - 1 ? "Done" : "Next";
    bindPads();
    wireHere();
    if (document.scrollingElement) document.scrollingElement.scrollTop = scroll;
  }
  function wireHere() {
    const btn = document.getElementById("use-location-btn");
    const input = document.getElementById("job-address");
    if (!btn || !input || !window.NDHere) return;
    NDHere.attachButton(btn, input, {
      region: "au",
      busyLabel: "Locating…",
      notify: toast,
      onResult: function (address) { state.job.address = address; saveSoon(); }
    });
  }
  function loadMaps() {
    if (window.google && window.google.maps) return;
    if (document.getElementById("nd-maps")) return;
    window.__ndMapsReady = function () {};
    const s = document.createElement("script");
    s.id = "nd-maps";
    s.async = true;
    s.src = "https://maps.googleapis.com/maps/api/js?key=" + encodeURIComponent(MAPS_KEY) + "&loading=async&callback=__ndMapsReady";
    document.head.appendChild(s);
  }

  function bindPads() {
    document.querySelectorAll("canvas[data-sign]").forEach((canvas) => {
      const path = canvas.getAttribute("data-sign");
      const ctx = canvas.getContext("2d");
      const ratio = Math.max(window.devicePixelRatio || 1, 1);
      const w = canvas.clientWidth || 320;
      const h = 140;
      canvas.width = Math.round(w * ratio);
      canvas.height = Math.round(h * ratio);
      ctx.scale(ratio, ratio);
      ctx.lineWidth = 2.2;
      ctx.lineCap = "round";
      ctx.strokeStyle = "#14213D";
      const existing = getPath(state, path);
      if (existing && String(existing).indexOf("data:image/") === 0) {
        const img = new Image();
        img.onload = () => ctx.drawImage(img, 0, 0, w, h);
        img.src = existing;
      }
      let drawing = false;
      const pos = (e) => {
        const r = canvas.getBoundingClientRect();
        return { x: e.clientX - r.left, y: e.clientY - r.top };
      };
      canvas.addEventListener("pointerdown", (e) => {
        drawing = true;
        canvas.setPointerCapture(e.pointerId);
        const p = pos(e);
        ctx.beginPath();
        ctx.moveTo(p.x, p.y);
      });
      canvas.addEventListener("pointermove", (e) => {
        if (!drawing) return;
        const p = pos(e);
        ctx.lineTo(p.x, p.y);
        ctx.stroke();
      });
      canvas.addEventListener("pointerup", () => {
        if (!drawing) return;
        drawing = false;
        setPath(state, path, canvas.toDataURL("image/png"));
        saveSoon();
      });
    });
  }

  function ensureDates() {
    const base = (state.job && state.job.inspectedAt) || today();
    if (!state.sign.date) state.sign.date = String(base).slice(0, 10);
    if (!state.sign.nextDue) state.sign.nextDue = L.plusMonths(base, 12);
    if (!state.sign.nextElectrical) state.sign.nextElectrical = L.plusMonths(base, 24);
    if (!state.sign.preparer) state.sign.preparer = "Neill Data";
    if (!state.sign.printedName && state.inspector.techName) state.sign.printedName = state.inspector.techName;
  }

  function compress(file, maxDim, quality) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      const url = URL.createObjectURL(file);
      img.onload = () => {
        let w = img.naturalWidth || img.width, h = img.naturalHeight || img.height;
        const scale = Math.min(1, maxDim / Math.max(w, h, 1));
        w = Math.max(1, Math.round(w * scale));
        h = Math.max(1, Math.round(h * scale));
        const c = document.createElement("canvas");
        c.width = w; c.height = h;
        c.getContext("2d").drawImage(img, 0, 0, w, h);
        URL.revokeObjectURL(url);
        resolve(c.toDataURL("image/jpeg", quality));
      };
      img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("Could not read that photo.")); };
      img.src = url;
    });
  }

  function downloadBlob(blob, name) {
    const a = document.createElement("a");
    const url = URL.createObjectURL(blob);
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
  }
  function dataUrlToBlob(dataUrl) {
    const parts = String(dataUrl).split(",");
    const mime = ((parts[0].match(/data:(.*?);/) || [])[1]) || "application/octet-stream";
    const bin = atob(parts[1] || "");
    const arr = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
    return new Blob([arr], { type: mime });
  }
  function blobToDataUrl(blob) {
    return new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(r.result);
      r.onerror = () => reject(r.error);
      r.readAsDataURL(blob);
    });
  }
  function audioFiles() {
    const out = [];
    (state.alarms || []).forEach((a, i) => {
      if (!a.audio || !a.audio.dataUrl) return;
      const name = L.audioFilename(state, a, i);
      const blob = dataUrlToBlob(a.audio.dataUrl);
      out.push(new File([blob], name, { type: blob.type || "audio/mp4" }));
    });
    return out;
  }

  function cloudReason() {
    return "Saved locally only. Neill Quote stores its records with save_quote on the Neill Data Backend, and that call needs a passcode sign-in. This page does not sign in, so the PDF and the form JSON are kept in Saved reports on this device and the PDF was downloaded. A cloud copy needs a signed-in Inspect action on that backend, then a redeploy of the Apps Script web app.";
  }
  async function persistReport(blob) {
    const json = clone(state);
    (json.alarms || []).forEach((a) => { if (a.audio && a.audio.dataUrl && a.audio.dataUrl.length > 200000) a.audio.dataUrl = ""; });
    const rec = {
      id: state.reportNo,
      reportNo: state.reportNo,
      address: state.job.address || "",
      filename: L.pdfFilename(state),
      savedAt: new Date().toISOString(),
      pdf: blob,
      json: json,
      uploadStatus: "local",
      uploadDetail: cloudReason()
    };
    try {
      await idbPut(rec);
      state.uploadStatus = "local";
      state.uploadDetail = rec.uploadDetail;
    } catch (e) {
      state.uploadStatus = "local";
      state.uploadDetail = "The PDF downloaded, but this device could not store another copy. " + (e && e.name === "QuotaExceededError" ? "Storage is full." : "");
      toast("Saved locally only, retry upload");
    }
    saveDraft();
  }

  async function produce(open) {
    ensureDates();
    const blocks = L.pdfBlockers(state);
    if (blocks.length) {
      toast(blocks[0]);
      if (state.step !== 6) { state.step = 6; }
      render();
      return null;
    }
    let doc;
    try { doc = window.NIPdf.build(state); }
    catch (e) { toast("The PDF could not be built. " + (e && e.message ? e.message : "")); return null; }
    const blob = doc.output("blob");
    const name = L.pdfFilename(state);
    await persistReport(blob);
    downloadBlob(blob, name);
    if (open) {
      const url = URL.createObjectURL(blob);
      window.open(url, "_blank");
    }
    render();
    return { blob: blob, name: name };
  }

  function sampleShot(label) {
    const c = document.createElement("canvas");
    c.width = 640; c.height = 480;
    const g = c.getContext("2d");
    g.fillStyle = "#1e293b"; g.fillRect(0, 0, 640, 480);
    g.strokeStyle = "#94a3b8"; g.strokeRect(180, 80, 280, 200);
    g.fillStyle = "#e2e8f0"; g.font = "bold 28px sans-serif";
    g.fillText("EXAMPLE", 40, 360);
    g.font = "22px sans-serif"; g.fillText(label, 40, 400);
    return c.toDataURL("image/jpeg", 0.7);
  }
  function sampleAudio() {
    const sr = 8000, n = 2400;
    const buf = new ArrayBuffer(44 + n * 2);
    const v = new DataView(buf);
    const set = (o, s) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
    set(0, "RIFF"); v.setUint32(4, 36 + n * 2, true); set(8, "WAVE"); set(12, "fmt ");
    v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
    v.setUint32(24, sr, true); v.setUint32(28, sr * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true);
    set(36, "data"); v.setUint32(40, n * 2, true);
    for (let i = 0; i < n; i++) v.setInt16(44 + i * 2, Math.round(Math.sin(2 * Math.PI * 880 * i / sr) * 6000), true);
    let bin = "";
    const bytes = new Uint8Array(buf);
    for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
    return "data:audio/wav;base64," + btoa(bin);
  }
  function sampleSign() {
    const c = document.createElement("canvas");
    c.width = 500; c.height = 140;
    const g = c.getContext("2d");
    g.strokeStyle = "#14213D"; g.lineWidth = 3; g.beginPath();
    g.moveTo(30, 90); g.bezierCurveTo(80, 20, 160, 120, 240, 60); g.stroke();
    return c.toDataURL("image/png");
  }
  function loadExample(force) {
    if (!force && !confirm("Replace the current inspection with example data? It is marked as an example and is not a real report.")) return;
    const s = blank();
    s.example = true;
    s.scope = { smoke: true, switchboard: true };
    s.reportNo = "NI-20261113-0900";
    s.job = {
      inspectedAt: "2026-11-13T09:00", address: "12 Example Street, Brighton VIC 3186", unit: "",
      agency: "Example Agency", pmName: "Example Manager", pmEmail: "pm@example.test",
      tenantPresent: "yes", tenantName: "Example Tenant", accessNotes: "Key from the agency.",
      occupancy: "tenanted", buildEra: "post-2014", storeys: "2", renterInfo: "yes", previousCheck: "Unknown"
    };
    s.inspector = {
      techName: "Sam Example", techPhone: "0400 000 000", techEmail: "tech@example.test", techLic: "",
      supName: "Alex Sample", supRec: "12345", supLic: "A12345", supBusiness: "Example Electrical", logo: ""
    };
    s.property = { everyStorey: "yes", sleeping: "yes", recommendations: "Replace the living room alarm." };
    s.alarms = [
      Object.assign(blankAlarm(), { location: "Hallway", locationDetail: "bedrooms", storey: "Ground", type: "Photoelectric", power: "240V hardwired", interconnected: "yes", dateKind: "manufacture", dateValue: "2021-03-01", mounting: "yes", as3786: "yes", testButton: "pass", secure: "yes", cleaned: "yes", hush: "yes", result: "Pass", photo: sampleShot("Hallway"), audio: { mime: "audio/wav", dataUrl: sampleAudio(), seconds: 8 }, hush: "na" }),
      Object.assign(blankAlarm(), { location: "Living", storey: "Ground", type: "Ionisation", power: "9V battery", interconnected: "no", dateKind: "manufacture", dateValue: "2014-05-01", mounting: "yes", as3786: "yes", testButton: "fail", secure: "yes", cleaned: "no", hush: "na", result: "Fail", photo: sampleShot("Living") })
    ];
    s.switchboard = {
      location: "Hall cupboard", secure: "yes", damage: "no", door: "yes", blanks: "yes", dry: "yes", waterVermin: "no",
      mainSwitch: "yes", mainSwitchNote: "Present and labelled", labelling: "no", labelNote: "Two lighting circuits are not labelled",
      protection: "breakers", rcdFitted: "yes", rcdCount: "2", rcdCircuits: "all",
      rcdTests: [{ circuit: "Power", result: "pass" }, { circuit: "Lighting", result: "pass" }],
      minStandard: "yes", overheating: "no", exposed: "no", pre1990: "yes", asbestosNote: "Older backing panel — possible asbestos, not disturbed",
      earth: "yes", earthNote: "Main earth / MEN visible where accessible", mains: "yes", diy: "na",
      notes: "", photos: [{ dataUrl: sampleShot("Switchboard"), caption: "Cover closed" }]
    };
    s.extraDefects = [];
    s.sign = {
      signature: sampleSign(), elecSignature: sampleSign(), printedName: "Sam Example", date: "2026-11-13",
      nextDue: "2027-11-13", nextElectrical: "2028-11-13", onBehalf: true, elecSignoff: true, preparer: "Neill Data",
      contractor: { name: "Example Electrical", rec: "12345", electrician: "Alex Sample", licence: "A12345", phone: "0400 000 001", email: "office@example.test", logo: "" }
    };
    state = s;
    alarmOpen = 0;
    saveDraft();
    render();
  }

  function startNew() {
    if (!confirm("Start a new inspection? The current draft on this device will be cleared. Saved reports stay in the list.")) return;
    const keep = loadProfile();
    state = blank();
    if (keep && keep.inspector) state.inspector = Object.assign(state.inspector, keep.inspector);
    if (keep && keep.preparer) state.sign.preparer = keep.preparer;
    alarmOpen = 0;
    saveDraft();
    render();
  }

  async function showSaved() {
    const panel = document.getElementById("saved-panel");
    const sheet = document.getElementById("saved-sheet");
    let rows = [];
    try { rows = await idbAll(); } catch (e) { rows = []; }
    rows.sort((a, b) => String(b.savedAt).localeCompare(String(a.savedAt)));
    sheet.innerHTML = '<h2>Saved reports</h2><p class="help">Stored on this device. Re-open loads the form. Download uses the saved PDF.</p>' +
      (rows.length ? rows.map((r) => '<div class="alarm-sum"><div><strong>' + esc(r.reportNo) + '</strong><div class="muted">' + esc(r.address || "") + '</div><div class="muted">' + (r.uploadStatus === "cloud" ? "Saved to cloud" : "Saved locally only, retry upload") + '</div></div><div class="row-actions"><button type="button" class="btn" data-action="open-report" data-id="' + esc(r.id) + '">Open</button><button type="button" class="btn" data-action="dl-report" data-id="' + esc(r.id) + '">Download</button><button type="button" class="btn" data-action="retry-id" data-id="' + esc(r.id) + '">Retry upload</button></div></div>').join("") : '<p class="help">None yet. Generate a PDF and it will be listed here.</p>') +
      '<button type="button" class="btn" data-action="close-saved">Close</button>';
    panel.classList.add("open");
  }

  function pickMime() {
    if (!window.MediaRecorder) return "";
    const list = ["audio/mp4", "audio/aac", "audio/webm;codecs=opus", "audio/webm"];
    for (let i = 0; i < list.length; i++) if (MediaRecorder.isTypeSupported(list[i])) return list[i];
    return "";
  }
  async function recordAt(i) {
    if (!navigator.mediaDevices || !window.MediaRecorder) { toast("This browser cannot record audio. You can continue without it."); return; }
    let stream;
    try { stream = await navigator.mediaDevices.getUserMedia({ audio: true }); }
    catch (e) { toast("The microphone was not allowed. You can continue without audio."); return; }
    const mime = pickMime();
    let rec;
    try { rec = mime ? new MediaRecorder(stream, { mimeType: mime }) : new MediaRecorder(stream); }
    catch (e) { stream.getTracks().forEach((t) => t.stop()); toast("Recording did not start. You can continue without audio."); return; }
    const chunks = [];
    rec.ondataavailable = (e) => { if (e.data && e.data.size) chunks.push(e.data); };
    const started = Date.now();
    recCtl = { i: i, rec: rec };
    rec.onstop = async () => {
      stream.getTracks().forEach((t) => t.stop());
      const blob = new Blob(chunks, { type: rec.mimeType || mime || "audio/mp4" });
      const seconds = Math.max(1, Math.round((Date.now() - started) / 1000));
      try {
        const dataUrl = await blobToDataUrl(blob);
        state.alarms[i].audio = { mime: blob.type || "audio/mp4", dataUrl: dataUrl, seconds: seconds };
      } catch (err) { toast("The recording could not be stored."); }
      recCtl = null;
      saveDraft();
      render();
    };
    rec.start(1000);
    recCtl.timer = setTimeout(() => stopRec(), 8000);
    render();
  }
  function stopRec() {
    if (!recCtl) return;
    clearTimeout(recCtl.timer);
    try { if (recCtl.rec.state !== "inactive") recCtl.rec.stop(); } catch (e) { recCtl = null; }
  }

  async function onFile(input) {
    const file = input.files && input.files[0];
    input.value = "";
    if (!file) return;
    try {
      if (input.hasAttribute("data-photo")) {
        const i = Number(input.getAttribute("data-photo"));
        state.alarms[i].photo = await compress(file, 1280, 0.7);
      } else if (input.hasAttribute("data-sb-photo")) {
        state.switchboard.photos.push({ dataUrl: await compress(file, 1280, 0.7), caption: "" });
      } else if (input.getAttribute("data-logo") === "inspector") {
        state.inspector.logo = await compress(file, 480, 0.7);
        saveProfile();
      } else if (input.getAttribute("data-logo") === "contractor") {
        state.sign.contractor.logo = await compress(file, 300, 0.7);
      }
      saveDraft();
      render();
    } catch (e) {
      const quota = e && (e.name === "QuotaExceededError" || /quota/i.test(e.message || ""));
      toast(quota ? "This device is out of storage, so the photo was not saved." : "That photo could not be used. Try another one.");
    }
  }

  document.body.addEventListener("input", (e) => {
    const el = e.target;
    if (!el.dataset || !el.dataset.bind) return;
    setPath(state, el.dataset.bind, el.type === "checkbox" ? el.checked : el.value);
    saveSoon();
  });
  document.body.addEventListener("change", (e) => {
    const el = e.target;
    if (el.dataset && el.dataset.bind) {
      setPath(state, el.dataset.bind, el.value);
      if (/^inspector\.|^sign\.preparer$/.test(el.dataset.bind)) saveProfile();
      saveSoon();
      if (el.tagName === "SELECT") render();
    }
    if (el.type === "file") onFile(el);
  });
  document.body.addEventListener("click", async (e) => {
    const t = e.target.closest("[data-action], [data-chip], [data-scope]");
    if (!t) return;
    if (t.hasAttribute("data-chip")) {
      const path = t.getAttribute("data-chip");
      let val = t.getAttribute("data-val");
      if (path === "sign.onBehalf") state.sign.onBehalf = val === "yes";
      else if (path === "sign.elecSignoff") state.sign.elecSignoff = val === "yes";
      else setPath(state, path, val);
      if (/^inspector\.|^sign\.preparer$/.test(path)) saveProfile();
      saveSoon();
      render();
      return;
    }
    const act = t.getAttribute("data-action");
    const i = Number(t.getAttribute("data-i"));
    if (act === "back") { state.step = Math.max(0, state.step - 1); saveSoon(); render(); }
    else if (act === "next") {
      const list = steps();
      if (list[state.step] && list[state.step].id === "scope" && !(state.scope.smoke || state.scope.switchboard)) {
        toast("Tick at least one part of the inspection.");
        return;
      }
      if (state.step < list.length - 1) {
        state.step += 1;
        if (steps()[state.step] && steps()[state.step].id === "sign") ensureDates();
        saveSoon();
        render();
      }
    }
    else if (act === "scope" || t.hasAttribute("data-scope")) {
      const key = t.getAttribute("data-scope");
      if (key && state.scope) { state.scope[key] = !state.scope[key]; saveSoon(); render(); }
    }
    else if (act === "example") loadExample(false);
    else if (act === "new") startNew();
    else if (act === "saved") showSaved();
    else if (act === "close-saved") document.getElementById("saved-panel").classList.remove("open");
    else if (act === "add-alarm") { state.alarms.push(blankAlarm()); alarmOpen = state.alarms.length - 1; saveSoon(); render(); }
    else if (act === "toggle-alarm") { alarmOpen = alarmOpen === i ? -1 : i; render(); }
    else if (act === "remove-alarm") { state.alarms.splice(i, 1); alarmOpen = 0; saveSoon(); render(); }
    else if (act === "finish-alarm") {
      const miss = L.alarmMissing(state.alarms[i]);
      if (miss.length) toast("Alarm " + (i + 1) + " (" + L.locationText(state.alarms[i], i) + "): add " + miss.join(", ") + ".");
      else { toast("Alarm " + (i + 1) + " is complete."); alarmOpen = -1; render(); }
    }
    else if (act === "record") recordAt(i);
    else if (act === "stop-rec") stopRec();
    else if (act === "clear-audio") { state.alarms[i].audio = null; saveSoon(); render(); }
    else if (act === "add-rcd") { state.switchboard.rcdTests.push({ circuit: "", result: "", trip: "" }); saveSoon(); render(); }
    else if (act === "remove-rcd") { state.switchboard.rcdTests.splice(i, 1); saveSoon(); render(); }
    else if (act === "add-defect") { state.extraDefects.push({ text: "", action: "", priority: "Routine" }); saveSoon(); render(); }
    else if (act === "remove-defect") { state.extraDefects.splice(i, 1); saveSoon(); render(); }
    else if (act === "remove-sb-photo") { state.switchboard.photos.splice(i, 1); saveSoon(); render(); }
    else if (act === "pick") { const n = document.getElementById(t.getAttribute("data-for")); if (n) n.click(); }
    else if (act === "clear-sign") { setPath(state, t.getAttribute("data-path"), ""); saveSoon(); render(); }
    else if (act === "preview") produce(true);
    else if (act === "download") produce(false);
    else if (act === "share") shareReport();
    else if (act === "audio-files") {
      const files = audioFiles();
      if (!files.length) toast("No audio recorded.");
      files.forEach((f, n) => setTimeout(() => downloadBlob(f, f.name), n * 400));
    }
    else if (act === "retry" || act === "retry-id") {
      state.uploadStatus = "local";
      state.uploadDetail = cloudReason();
      saveSoon();
      toast("Saved locally only, retry upload");
      if (state.step === 6) render();
      else showSaved();
    }
    else if (act === "open-report") {
      const rec = await idbGet(t.getAttribute("data-id"));
      if (!rec || !rec.json) { toast("That report could not be opened."); return; }
      state = rec.json;
      state.uploadStatus = rec.uploadStatus || "local";
      state.uploadDetail = rec.uploadDetail || cloudReason();
      if (!state.sign.contractor) state.sign.contractor = { name: "", rec: "", electrician: "", licence: "", phone: "", email: "", logo: "" };
      alarmOpen = 0;
      document.getElementById("saved-panel").classList.remove("open");
      saveDraft();
      render();
    }
    else if (act === "dl-report") {
      const rec = await idbGet(t.getAttribute("data-id"));
      if (rec && rec.pdf) downloadBlob(rec.pdf, rec.filename || "report.pdf");
      else toast("No saved PDF for that report.");
    }
  });

  async function shareReport() {
    const made = await produce(false);
    if (!made) return;
    const files = [new File([made.blob], made.name, { type: "application/pdf" })].concat(audioFiles());
    if (navigator.canShare && navigator.canShare({ files: files })) {
      try { await navigator.share({ files: files, title: state.reportNo, text: L.TITLE }); return; }
      catch (e) { if (e && e.name === "AbortError") return; }
    }
    toast("Sharing is not available here. The PDF was downloaded instead.");
  }

  function boot() {
    try {
      const raw = localStorage.getItem(DRAFT_KEY);
      if (raw) {
        const d = JSON.parse(raw);
        if (d && d.reportNo && d.job) {
          state = Object.assign(blank(), d);
          state.job = Object.assign(blank().job, d.job || {});
          state.inspector = Object.assign(blank().inspector, d.inspector || {});
          state.property = Object.assign(blank().property, d.property || {});
          state.switchboard = Object.assign(blank().switchboard, d.switchboard || {});
          state.sign = Object.assign(blank().sign, d.sign || {});
          state.sign.contractor = Object.assign(blank().sign.contractor, (d.sign && d.sign.contractor) || {});
          state.alarms = d.alarms || [];
          state.extraDefects = d.extraDefects || [];
          if (!d.scope) state.scope = { smoke: true, switchboard: true };
        }
      }
    } catch (e) { state = null; }
    if (!state) state = blank();
    ensureDates();
    loadMaps();
    render();
    window.addEventListener("pagehide", saveDraft);
    document.addEventListener("visibilitychange", () => { if (document.visibilityState === "hidden") saveDraft(); });
  }

  window.NI = { loadExample: loadExample, getState: () => state, version: APP_VERSION };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
