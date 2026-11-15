/* Read a Neill Inspect PDF back into the editor state.
   New PDFs carry a schema-1 JSON file (neill-inspect.json).
   Older PDFs (0.1.1 layout and the 0.1.3 layout) are rebuilt from pdf.js text items.
   Photos and signatures in an older PDF are flagged, not copied. No DOM. */
(function (root, factory) {
  "use strict";
  const api = factory(root);
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.NIImport = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function (root) {
  "use strict";

  const SCHEMA = 1;
  const FILE_NAME = "neill-inspect.json";
  const MAX_CHARS = 7500000;
  const MONTHS = {
    january: 1, february: 2, march: 3, april: 4, may: 5, june: 6,
    july: 7, august: 8, september: 9, october: 10, november: 11, december: 12
  };

  function L() { return root.NILogic || {}; }

  function pad(n) { return String(n).padStart(2, "0"); }

  function flag(missing, path, label, reason) {
    if (!path || missing.some(function (m) { return m.path === path; })) return;
    missing.push({ path: path, label: label, reason: reason });
  }

  function cleanDash(value) {
    const t = String(value == null ? "" : value).replace(/\s+/g, " ").trim();
    if (!t || t === "—" || t === "–" || t === "-" || t === "N/A" || t === "n/a") return "";
    return t;
  }

  function utf8Binary(str) {
    return unescape(encodeURIComponent(String(str)));
  }

  function clone(o) { return JSON.parse(JSON.stringify(o)); }

  function stripMedia(state, omitted, which) {
    (state.alarms || []).forEach(function (a, i) {
      if (which === "audio" && a.audio && a.audio.dataUrl) {
        omitted.push("alarms." + i + ".audio");
        a.audio = { mime: a.audio.mime, seconds: a.audio.seconds, omitted: true };
      }
      if (which === "alarm-photo" && a.photo) {
        omitted.push("alarms." + i + ".photo");
        a.photo = "";
      }
      if (which === "location-photo" && a.locationPhoto) {
        omitted.push("alarms." + i + ".locationPhoto");
        a.locationPhoto = "";
      }
    });
    if (which === "board-photo" && state.switchboard && (state.switchboard.photos || []).length) {
      state.switchboard.photos.forEach(function (_, i) { omitted.push("switchboard.photos." + i); });
      state.switchboard.photos = [];
    }
    if (which === "logo") {
      if (state.inspector && state.inspector.logo) { omitted.push("inspector.logo"); state.inspector.logo = ""; }
      if (state.sign && state.sign.contractor && state.sign.contractor.logo) {
        omitted.push("sign.contractor.logo");
        state.sign.contractor.logo = "";
      }
    }
    if (which === "signature" && state.sign) {
      ["signature", "elecSignature", "supSignature"].forEach(function (k) {
        if (state.sign[k]) { omitted.push("sign." + k); state.sign[k] = ""; }
      });
    }
  }

  function pack(state, omitted, version) {
    return { schema: SCHEMA, app: "neill-inspect", version: version || "", omitted: omitted.slice(), state: state };
  }

  /* Full editor state, plus a note of anything dropped to stay within a size budget. */
  function payloadFromState(state, opts) {
    opts = opts || {};
    const max = opts.maxChars || MAX_CHARS;
    const copy = clone(state || {});
    delete copy.importReview;
    const omitted = [];
    const steps = ["audio", "location-photo", "alarm-photo", "board-photo", "logo", "signature"];
    let body = pack(copy, omitted, opts.version);
    let json = JSON.stringify(body);
    for (let i = 0; i < steps.length && json.length > max; i++) {
      stripMedia(copy, omitted, steps[i]);
      body = pack(copy, omitted, opts.version);
      json = JSON.stringify(body);
    }
    return body;
  }

  function pdfName(value) {
    return String(value || "").replace(/[()\\]/g, "");
  }

  /* Attach the JSON as a PDF embedded file. Fired when the document is saved, so the page layout is unchanged. */
  function embedInPdf(doc, payload) {
    if (!doc || !doc.internal || !doc.internal.events) return doc;
    const json = JSON.stringify(payload || {});
    const bytes = utf8Binary(json);
    const name = pdfName(FILE_NAME);
    let specId = null;
    doc.internal.events.subscribe("postPutResources", function () {
      const fileId = this.internal.newObject();
      this.internal.out("<< /Type /EmbeddedFile /Subtype /application#2Fjson /Length " + bytes.length + " >>");
      this.internal.out("stream");
      this.internal.out(bytes);
      this.internal.out("endstream");
      this.internal.out("endobj");
      specId = this.internal.newObject();
      this.internal.out("<< /Type /Filespec /F (" + name + ") /UF (" + name + ") /EF << /F " + fileId + " 0 R >> /Desc (Neill Inspect report JSON) >>");
      this.internal.out("endobj");
    });
    doc.internal.events.subscribe("putCatalog", function () {
      if (specId == null) return;
      this.internal.out("/Names << /EmbeddedFiles << /Names [ (" + name + ") " + specId + " 0 R ] >> >>");
    });
    return doc;
  }

  function fromPayload(payload) {
    if (!payload || payload.schema !== SCHEMA || !payload.state || typeof payload.state !== "object") {
      throw new Error("This PDF's saved report could not be read.");
    }
    const state = clone(payload.state);
    delete state.importReview;
    const missing = [];
    (payload.omitted || []).forEach(function (path) {
      flag(missing, path, path, "Left out of the PDF because the report was too large to embed in full.");
    });
    return {
      source: "json",
      ok: true,
      state: state,
      missing: missing,
      summary: summarize(missing, "json")
    };
  }

  function summarize(missing, source) {
    if (!missing.length) {
      return source === "json" ? "" : "";
    }
    const head = source === "json"
      ? "The report loaded from the PDF. Some photos or signatures were too large to embed."
      : "This PDF was read from an older report. Yellow fields were missing or incomplete. Check them before you rely on the report.";
    const bits = missing.slice(0, 6).map(function (m) { return m.label; });
    const more = missing.length > 6 ? " +" + (missing.length - 6) + " more" : "";
    return head + " " + bits.join("; ") + more + ".";
  }

  function textOf(items) {
    const list = (items || []).slice().sort(function (a, b) { return a.x - b.x; });
    let s = "";
    let right = -1;
    list.forEach(function (it) {
      const t = String(it.str || "").trim();
      if (!t) return;
      if (s) s += it.x > right + 1.5 ? " " : "";
      s += t;
      right = it.x + (it.w || 0);
    });
    return s.replace(/[ \t]+/g, " ").trim();
  }

  function groupLines(items) {
    const sorted = items.slice().sort(function (a, b) {
      return a.page - b.page || b.y - a.y || a.x - b.x;
    });
    const lines = [];
    sorted.forEach(function (it) {
      const last = lines[lines.length - 1];
      if (last && last.page === it.page && Math.abs(last.y - it.y) <= 2.4) {
        last.items.push(it);
        if (it.y > last.y) last.y = it.y;
      } else lines.push({ page: it.page, y: it.y, items: [it] });
    });
    return lines;
  }

  function joinParts(parts, colRight) {
    let out = "";
    parts.forEach(function (part, i) {
      const text = String(part.text || "").replace(/\s+/g, " ").trim();
      if (!text) return;
      if (!out) { out = text; return; }
      const prev = parts[i - 1];
      const last = (out.match(/\S+$/) || [""])[0];
      const filled = colRight && prev && prev.right >= colRight - 8;
      const splitWord = /\.[A-Za-z0-9]$/.test(last) || /@$/.test(last);
      const mid = /^[a-z0-9]/.test(text) && /[A-Za-z0-9]$/.test(out) && (splitWord || (filled && (last.length > 12 || /[.@]/.test(last))));
      out += (mid ? "" : " ") + text;
    });
    return out.replace(/[ \t]+/g, " ").trim();
  }

  function columnBounds(headers) {
    const list = headers.slice().sort(function (a, b) { return a.x - b.x; });
    return list.map(function (h, i) {
      const left = i === 0 ? h.x - 12 : (list[i - 1].x + h.x) / 2;
      const right = i === list.length - 1 ? 10000 : (h.x + list[i + 1].x) / 2;
      return { name: h.name, x: h.x, left: left, right: right };
    });
  }

  function columnAt(cols, x) {
    for (let i = 0; i < cols.length; i++) if (x >= cols[i].left && x < cols[i].right) return cols[i];
    return null;
  }

  function cellsFromLines(lines, cols) {
    const rows = [];
    lines.forEach(function (line) {
      const buckets = {};
      line.items.forEach(function (it) {
        const col = columnAt(cols, it.x);
        if (!col) return;
        const t = String(it.str || "").trim();
        if (!t) return;
        if (!buckets[col.name]) buckets[col.name] = [];
        buckets[col.name].push(it);
      });
      const num = textOf(buckets["#"] || []);
      if (/^\d+$/.test(num)) rows.push({ n: Number(num), buckets: {}, parts: {} });
      const row = rows[rows.length - 1];
      if (!row) return;
      Object.keys(buckets).forEach(function (name) {
        const items = buckets[name];
        const text = textOf(items);
        const right = items.reduce(function (m, it) { return Math.max(m, it.x + (it.w || 0)); }, 0);
        if (!row.parts[name]) row.parts[name] = [];
        row.parts[name].push({ text: text, right: right });
      });
    });
    rows.forEach(function (row) {
      Object.keys(row.parts).forEach(function (name) {
        const col = cols.filter(function (c) { return c.name === name; })[0];
        row.buckets[name] = joinParts(row.parts[name], col ? col.right : 0);
      });
    });
    return rows;
  }

    function headerLine(lines, marker, also) {
    for (let i = 0; i < lines.length; i++) {
      const names = lines[i].items.map(function (it) { return String(it.str || "").trim(); });
      if (names.indexOf(marker) < 0) continue;
      if (also && names.indexOf(also) < 0) continue;
      return i;
    }
    return -1;
  }

  function headersOn(line) {
    const known = ["#", "LOCATION", "TYPE", "POWER", "MFD / EXPIRY", "TEST", "PHOTO", "AUDIO", "RESULT", "MOUNTING", "LINKED", "AS 3786", "BATTERY", "NOTES", "ITEM", "OBSERVATION"];
    return line.items.filter(function (it) {
      return known.indexOf(String(it.str || "").trim()) >= 0;
    }).map(function (it) { return { name: String(it.str).trim(), x: it.x }; });
  }

  function parseWhen(text) {
    const m = String(text || "").match(/(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})(?:,\s*(\d{1,2}):(\d{2})\s*(am|pm))?/i);
    if (!m) return null;
    const month = MONTHS[m[2].toLowerCase()];
    if (!month) return null;
    let hh = 0;
    let mm = 0;
    let hasTime = false;
    if (m[4]) {
      hasTime = true;
      hh = Number(m[4]);
      mm = Number(m[5]);
      const ap = m[6].toLowerCase();
      if (ap === "pm" && hh < 12) hh += 12;
      if (ap === "am" && hh === 12) hh = 0;
    }
    const date = m[3] + "-" + pad(month) + "-" + pad(Number(m[1]));
    return { date: date, iso: date + (hasTime ? "T" + pad(hh) + ":" + pad(mm) : ""), hasTime: hasTime };
  }

  function eraFrom(text) {
    const map = L().ERA_LABEL || {};
    const t = String(text || "").replace(/\s+/g, " ").trim();
    const keys = Object.keys(map);
    for (let i = 0; i < keys.length; i++) if (map[keys[i]] === t) return keys[i];
    return "";
  }

  function knownLocations() {
    const list = (L().LOCATIONS || ["Kitchen-adjacent", "Bedroom 1", "Bedroom 2", "Bedroom 3", "Each storey", "Hallway", "Living", "Other"]).slice();
    list.sort(function (a, b) { return b.length - a.length; });
    return list;
  }

  function parseLoc(text) {
    const t = String(text || "").replace(/\s+/g, " ").trim();
    if (!t || t === "—" || t === "-") return { location: "", locationDetail: "", storey: "", uncertain: true };
    const locs = knownLocations();
    let loc = "";
    for (let i = 0; i < locs.length; i++) {
      const name = locs[i];
      if (t === name || t.indexOf(name + " ") === 0 || t.indexOf(name + ",") === 0 || t.indexOf(name + "—") === 0 || t.indexOf(name + " —") === 0 || t.indexOf(name + "-") === 0) {
        loc = name;
        break;
      }
    }
    if (!loc) return { location: "Other", locationDetail: t, storey: "", uncertain: true };
    let rest = t.slice(loc.length).trim();
    if (rest.charAt(0) === "—" || rest.charAt(0) === "–" || rest.charAt(0) === "-") rest = rest.slice(1).trim();
    let detail = "";
    let storey = "";
    if (rest) {
      const comma = rest.lastIndexOf(",");
      if (comma >= 0) {
        detail = rest.slice(0, comma).trim();
        storey = rest.slice(comma + 1).trim();
      } else if (/[—–-]/.test(t.slice(loc.length))) detail = rest;
      else storey = rest.replace(/^,\s*/, "");
    }
    return { location: loc, locationDetail: detail, storey: storey, uncertain: false };
  }

  function parseLocationLines(lineTexts, colRight) {
    const lines = (lineTexts || []).map(function (s) { return String(s || "").replace(/\s+/g, " ").trim(); }).filter(Boolean);
    if (lines.length >= 2) {
      const head = lines[0].replace(/,\s*$/, "");
      const m1 = head.match(/^(.+?)\s+[—–-]\s+(.+)$/);
      const m2 = lines[1].match(/^(.+?),\s*(.+)$/);
      if (m1 && m2 && m1[1].replace(/\s+/g, " ").trim() === m2[1].replace(/\s+/g, " ").trim()) {
        return parseLoc(m1[1].trim() + " — " + m1[2].trim() + ", " + m2[2].trim());
      }
    }
    const parts = lines.map(function (text, i) {
      return { text: text, right: i < lines.length - 1 ? colRight : 0 };
    });
    return parseLoc(joinParts(parts, colRight));
  }

  function powerFrom(text) {
    const t = String(text || "").replace(/\s+/g, " ").trim();
    if (t === "240V + backup") return "240V with 10-yr lithium backup";
    if (t === "10yr lithium") return "10-yr sealed lithium";
    if (t === "240V hardwired" || t === "9V battery") return t;
    if (!cleanDash(t)) return "";
    return t;
  }

  function ynWord(text, yes, no) {
    const t = String(text || "").replace(/\s+/g, " ").trim();
    if (!cleanDash(t)) return "";
    if (t === yes || /^yes$/i.test(t)) return "yes";
    if (t === no || /^no$/i.test(t)) return "no";
    if (/^n\/?a$/i.test(t) || t === "Not accessible") return "na";
    return "";
  }

  function resultFrom(text) {
    const t = String(text || "").replace(/\s+/g, " ").trim();
    if (/expired|>10/.test(t)) return { value: "", expired: true };
    if (t === "Pass" || t === "Fail" || t === "Replaced" || t === "Requires electrician") return { value: t, expired: false };
    if (/^n\/?a$/i.test(t)) return { value: "na", expired: false };
    if (!cleanDash(t)) return { value: "", expired: false, empty: true };
    return { value: "", expired: false, unknown: true };
  }

  function batteryFrom(text) {
    const t = String(text || "").replace(/\s+/g, " ").trim();
    if (!cleanDash(t)) return { batteryReplaced: "", batteryType: "" };
    if (/^Replaced\b/.test(t)) return { batteryReplaced: "yes", batteryType: t.replace(/^Replaced\s*/, "").trim() };
    if (/^Not replaced\b/.test(t)) return { batteryReplaced: "no", batteryType: t.replace(/^Not replaced\s*/, "").trim() };
    return { batteryReplaced: "", batteryType: t };
  }

  function dateFrom(text) {
    const m = String(text || "").match(/\b(Mfd|Exp)\s+(\d{1,2})\/(\d{4})/i);
    if (!m) return null;
    return {
      dateKind: /^exp/i.test(m[1]) ? "expiry" : "manufacture",
      dateValue: m[3] + "-" + pad(Number(m[2])) + "-01"
    };
  }

  function supervisionFrom(text) {
    const m = String(text || "").match(/Under supervision of\s+(.+)$/i);
    if (!m) return null;
    let rest = m[1].replace(/\s+/g, " ").trim();
    let business = "";
    const b = rest.match(/\(([^)]+)\)\s*$/);
    if (b) {
      business = cleanDash(b[1]);
      rest = rest.slice(0, b.index).replace(/[,\s]+$/, "");
    }
    let rec = "";
    let lic = "";
    const recM = rest.match(/,\s*REC\s+(.+)$/i);
    if (recM) {
      const tail = recM[1];
      const licM = tail.match(/^(.*?),\s*Licence\s+(.+)$/i);
      if (licM) {
        rec = cleanDash(licM[1]);
        lic = cleanDash(licM[2]);
      } else rec = cleanDash(tail);
      rest = rest.slice(0, recM.index).trim();
    }
    return { name: cleanDash(rest), rec: rec, lic: lic, business: business };
  }

  function sideText(line, mid) {
    return {
      left: textOf(line.items.filter(function (it) { return it.x < mid; })),
      right: textOf(line.items.filter(function (it) { return it.x >= mid; }))
    };
  }

  function applyDetail(alarm, buckets) {
    if (buckets.MOUNTING) alarm.mounting = ynWord(buckets.MOUNTING, "Compliant", "Not compliant");
    if (buckets.LINKED) alarm.interconnected = ynWord(buckets.LINKED, "Yes", "No");
    if (buckets["AS 3786"]) alarm.as3786 = ynWord(buckets["AS 3786"], "Present", "Not seen");
    if (buckets.BATTERY) {
      const b = batteryFrom(buckets.BATTERY);
      alarm.batteryReplaced = b.batteryReplaced;
      alarm.batteryType = b.batteryType;
    }
    if (buckets.NOTES && cleanDash(buckets.NOTES)) alarm.notes = buckets.NOTES;
    if (buckets.RESULT) alarm._resultText = buckets.RESULT;
  }

  function applyAlarmRow(buckets, cols) {
    const locCol = cols.filter(function (c) { return c.name === "LOCATION"; })[0];
    const locLines = (buckets._locLines || []);
    const loc = parseLocationLines(locLines, locCol ? locCol.right : 0);
    const date = dateFrom(buckets["MFD / EXPIRY"] || "");
    const test = String(buckets.TEST || "").toUpperCase();
    const alarm = {
      location: loc.location,
      locationDetail: loc.locationDetail,
      storey: loc.storey,
      type: cleanDash(buckets.TYPE || ""),
      power: powerFrom(buckets.POWER || ""),
      dateKind: date ? date.dateKind : "manufacture",
      dateValue: date ? date.dateValue : "",
      testButton: test === "PASS" ? "pass" : test === "FAIL" ? "fail" : test === "N/A" ? "na" : "",
      result: "",
      mounting: "",
      interconnected: "",
      as3786: "",
      notes: "",
      batteryReplaced: "",
      batteryType: "",
      photo: "",
      _uncertainLocation: loc.uncertain,
      _datePartial: !!date,
      _expiredNote: /over 10 years/i.test(buckets["MFD / EXPIRY"] || "")
    };
    return alarm;
  }

  function rememberLocLines(row, cols) {
    const col = cols.filter(function (c) { return c.name === "LOCATION"; })[0];
    row._locLines = (row.parts.LOCATION || []).map(function (p) { return p.text; });
    if (col) row._locRight = col.right;
    return row;
  }

  function matchItem(name) {
    const n = String(name || "").replace(/\s+/g, " ").trim();
    const items = [
      ["Switchboard location", "location"],
      ["Main switch", "mainSwitch"],
      ["RCD push-button test", "rcd"],
      ["Circuit labelling", "labelling"],
      ["Signs of heat / damage", "heat"],
      ["Rewireable fuses", "fuses"],
      ["Power and lighting protected", "min"],
      ["Enclosure, blanks, moisture", "enclosure"],
      ["Possible asbestos", "asbestos"],
      ["Main earthing", "earth"],
      ["Consumer mains", "mains"],
      ["DIY or non-compliant", "diy"]
    ];
    for (let i = 0; i < items.length; i++) if (n.indexOf(items[i][0]) === 0) return items[i][1];
    return "";
  }

  function labelled(obs, label) {
    const m = String(obs || "").match(new RegExp(label + ":\\s*([^.]*)", "i"));
    return m ? m[1].replace(/\s+/g, " ").trim() : "";
  }

  function ynLabel(text, yes, no) {
    const t = String(text || "").replace(/\s+/g, " ").trim();
    if (!t) return "";
    if (t === yes || /^yes$/i.test(t)) return "yes";
    if (t === no || /^no$/i.test(t)) return "no";
    if (/not accessible/i.test(t) || /^n\/?a$/i.test(t)) return "na";
    return "";
  }

  function applyBoardRow(sb, key, observation, result, missing) {
    const obs = String(observation || "").replace(/\s+/g, " ").trim();
    const res = String(result || "").trim();
    const recorded = obs !== "Not recorded" && !!cleanDash(obs);
    if (key === "location") {
      if (recorded && obs !== "—") sb.location = obs;
      return;
    }
    if (key === "mainSwitch") {
      if (/Present and labelled/i.test(obs)) sb.mainSwitch = "yes";
      else if (/Missing or not labelled/i.test(obs)) sb.mainSwitch = "no";
      else if (recorded) {
        sb.mainSwitchNote = obs;
        sb.mainSwitch = res === "FAIL" ? "no" : res === "PASS" ? "yes" : "";
        if (!sb.mainSwitch) flag(missing, "switchboard.mainSwitch", "Main switch", "The note was printed but the yes or no was not clear.");
      }
      return;
    }
    if (key === "rcd") {
      const m = obs.match(/^(\d+)\s+RCDs?\s+tested(?:\s+[—–-]\s+([^.]+))?\.\s*(.*)$/i);
      if (m) {
        sb.rcdCount = m[1];
        sb.rcdFitted = "yes";
        const circuits = { "power and lighting": "all", power: "power", lighting: "lighting", "some circuits": "some", "no circuits": "none" };
        const c = String(m[2] || "").trim().toLowerCase();
        if (circuits[c]) sb.rcdCircuits = circuits[c];
        sb.rcdTests = String(m[3] || "").split(/\s*;\s*/).map(function (bit) {
          const t = bit.match(/^(.*?)\s+(pass|fail|not recorded)(?:\s+\(instrument\s+(.+)\))?$/i);
          if (!t) return null;
          return { circuit: t[1].trim(), result: t[2].toLowerCase() === "pass" ? "pass" : t[2].toLowerCase() === "fail" ? "fail" : "", trip: t[3] ? t[3].trim() : "" };
        }).filter(Boolean);
      } else if (/not recorded/i.test(obs)) {
        /* nothing was tested */
      } else if (recorded) {
        sb.rcdNote = obs;
        flag(missing, "switchboard.rcdFitted", "RCD test", "The RCD note could not be split into circuits.");
      }
      return;
    }
    if (key === "labelling") {
      if (/^Legible and complete$/i.test(obs)) sb.labelling = "yes";
      else if (/^Not legible or not complete$/i.test(obs)) sb.labelling = "no";
      else if (recorded) {
        sb.labelNote = obs;
        sb.labelling = res === "FAIL" ? "no" : res === "PASS" ? "yes" : "";
        if (!sb.labelling) flag(missing, "switchboard.labelling", "Circuit labelling", "The note was printed but the yes or no was not clear.");
      }
      return;
    }
    if (key === "heat") {
      if (/No discolouration/i.test(obs)) { sb.overheating = "no"; sb.exposed = "no"; }
      else if (recorded) {
        if (/overheating|scorching|burning/i.test(obs)) sb.overheating = "yes";
        if (/exposed live/i.test(obs)) sb.exposed = "yes";
        sb.heatNote = /No discolouration/i.test(obs) ? "" : obs;
        if (sb.overheating !== "yes" && sb.exposed !== "yes") flag(missing, "switchboard.overheating", "Heat or damage", "The note was printed but it is not clear whether anything was found.");
      }
      return;
    }
    if (key === "fuses") {
      if (/Rewireable fuses present/i.test(obs)) sb.protection = "rewireable";
      else if (/RCBOs/i.test(obs)) sb.protection = "rcbo";
      else if (/circuit breakers/i.test(obs)) sb.protection = "breakers";
      else if (recorded) flag(missing, "switchboard.protection", "Circuit protection", "The fuse note was not a known answer.");
      return;
    }
    if (key === "min") {
      if (/^Every power outlet/i.test(obs)) sb.minStandard = "yes";
      else if (/^Not every power outlet/i.test(obs)) sb.minStandard = "no";
      else if (recorded) {
        sb.minNote = obs;
        sb.minStandard = res === "FAIL" ? "no" : res === "PASS" ? "yes" : "";
        if (!sb.minStandard) flag(missing, "switchboard.minStandard", "Power and lighting protection", "The note was printed but the yes or no was not clear.");
      }
      return;
    }
    if (key === "enclosure") {
      const secure = ynLabel(labelled(obs, "Secure"), "Yes", "No");
      const damage = ynLabel(labelled(obs, "Damage"), "Yes", "None seen");
      const door = ynLabel(labelled(obs, "Door closes"), "Yes", "No");
      const blanks = ynLabel(labelled(obs, "Blanks fitted"), "Yes", "No");
      const dry = ynLabel(labelled(obs, "Dry"), "Yes", "No");
      const wet = ynLabel(labelled(obs, "Water or vermin"), "Present", "None seen");
      if (secure) sb.secure = secure;
      if (damage) sb.damage = damage;
      if (door) sb.door = door;
      if (blanks) sb.blanks = blanks;
      if (dry) sb.dry = dry;
      if (wet) sb.waterVermin = wet;
      if (!secure && !damage && !door && recorded) {
        sb.enclosureNote = obs;
        flag(missing, "switchboard.secure", "Enclosure", "The enclosure note could not be split into the individual answers.");
      }
      return;
    }
    if (key === "asbestos") {
      if (/Not indicated/i.test(obs) && res !== "CHECK") sb.pre1990 = "no";
      else if (/Suspected asbestos|do not drill/i.test(obs) || res === "CHECK") {
        sb.pre1990 = "yes";
        if (!/Suspected asbestos backing, do not drill or disturb/i.test(obs)) sb.asbestosNote = obs;
        else if (obs && !/^Suspected asbestos backing, do not drill or disturb$/i.test(obs)) sb.asbestosNote = obs;
        if (sb.asbestosNote === obs && /Suspected asbestos backing, do not drill or disturb/i.test(obs) && obs.length < 80) sb.asbestosNote = "";
      } else if (recorded) {
        sb.asbestosNote = obs;
        flag(missing, "switchboard.pre1990", "Possible asbestos", "The note was printed but it is not clear whether asbestos was suspected.");
      }
      return;
    }
    if (key === "earth") {
      if (/not visible/i.test(obs)) sb.earth = "no";
      else if (/visible where accessible/i.test(obs)) sb.earth = "yes";
      else if (recorded) {
        sb.earthNote = obs;
        sb.earth = res === "CHECK" ? "no" : res === "PASS" ? "yes" : "";
        if (!sb.earth) flag(missing, "switchboard.earth", "Main earthing", "The note was printed but the yes or no was not clear.");
      }
      return;
    }
    if (key === "mains") {
      if (/No visible damage/i.test(obs)) sb.mains = "yes";
      else if (/Damage observed/i.test(obs)) sb.mains = "no";
      else if (recorded) {
        sb.mainsNote = obs;
        sb.mains = res === "FAIL" ? "no" : res === "PASS" ? "yes" : "";
        if (!sb.mains) flag(missing, "switchboard.mains", "Consumer mains", "The note was printed but the yes or no was not clear.");
      }
      return;
    }
    if (key === "diy") {
      if (/^None seen$/i.test(obs)) sb.diy = "no";
      else if (/Signs of DIY/i.test(obs)) sb.diy = "yes";
      else if (recorded && !/not recorded/i.test(obs)) {
        sb.diyNote = obs;
        sb.diy = res === "FAIL" ? "yes" : res === "PASS" ? "no" : "";
        if (!sb.diy) flag(missing, "switchboard.diy", "DIY work", "The note was printed but the yes or no was not clear.");
      }
    }
  }

  function boardRowsFrom(lines) {
    const headerAt = headerLine(lines, "OBSERVATION", "ITEM");
    if (headerAt < 0) return { rows: [], notes: "", locationLine: "" };
    const cols = columnBounds(headersOn(lines[headerAt]));
    const rows = [];
    let notes = "";
    let locationLine = "";
    let takingNotes = false;
    for (let i = 0; i < lines.length; i++) {
      if (i === headerAt) continue;
      const t = textOf(lines[i].items);
      if (/^Location:\s*/i.test(t)) { locationLine = t.replace(/^Location:\s*/i, "").trim(); continue; }
      if (/^Rewireable fuses, where present/.test(t) || /^Result key:/.test(t) || /^[A-G]\.\s/.test(t)) { takingNotes = false; if (/^[A-G]\.\s/.test(t)) break; continue; }
      if (/^Notes:/.test(t)) { notes = t.replace(/^Notes:\s*/, ""); takingNotes = true; continue; }
      if (takingNotes) { notes = joinParts([{ text: notes, right: 9999 }, { text: t, right: 0 }], 9999); continue; }
      if (i < headerAt) continue;
      const buckets = {};
      lines[i].items.forEach(function (it) {
        const col = columnAt(cols, it.x);
        if (!col) return;
        const bit = String(it.str || "").trim();
        if (!bit) return;
        if (!buckets[col.name]) buckets[col.name] = [];
        buckets[col.name].push(it);
      });
      const itemText = textOf(buckets.ITEM || []);
      const key = matchItem(itemText);
      if (key) rows.push({ key: key, item: [itemText], obs: [], res: textOf(buckets.RESULT || []) });
      const row = rows[rows.length - 1];
      if (!row) continue;
      if (!key && itemText) row.item.push(itemText);
      const obs = textOf(buckets.OBSERVATION || []);
      if (obs) row.obs.push({ text: obs, right: (buckets.OBSERVATION || []).reduce(function (m, it) { return Math.max(m, it.x + (it.w || 0)); }, 0) });
      if (!row.res) row.res = textOf(buckets.RESULT || []);
    }
    const obsCol = cols.filter(function (c) { return c.name === "OBSERVATION"; })[0];
    return {
      locationLine: locationLine,
      notes: notes,
      rows: rows.map(function (row) {
        return { key: row.key, observation: joinParts(row.obs, obsCol ? obsCol.right : 0), result: row.res };
      })
    };
  }

  function linesBetween(lines, startRe, endRe) {
    let on = false;
    const out = [];
    for (let i = 0; i < lines.length; i++) {
      const t = textOf(lines[i].items);
      if (!on && startRe.test(t)) { on = true; continue; }
      if (on && endRe.test(t)) break;
      if (on) out.push(t);
    }
    return out.filter(Boolean);
  }

  function fromTextItems(pages) {
    const missing = [];
    const items = [];
    (pages || []).forEach(function (page, pi) {
      const height = page.height || 842;
      (page.items || []).forEach(function (it) {
        if (!it || !String(it.str || "").trim()) return;
        items.push({
          str: String(it.str),
          x: Number(it.x) || 0,
          y: Number(it.y) || 0,
          w: Number(it.w) || 0,
          page: pi,
          height: height
        });
      });
    });
    const allText = items.map(function (it) { return it.str; }).join("\n");
    const title = /Smoke Alarm Safety Check/.test(allText);
    const body = items.filter(function (it) { return it.y < it.height - 88 && it.y > 32 && it.str !== "EXAMPLE DATA"; });
    const lines = groupLines(body);
    const section = { A: [], B: [], C: [], D: [], F: [], G: [], auth: [] };
    let cur = "";
    lines.forEach(function (line) {
      const t = textOf(line.items);
      const m = t.match(/^([A-G])\.\s/);
      if (m) { cur = m[1]; return; }
      if (/^Report Preparation/.test(t)) { cur = "auth"; return; }
      if (cur && section[cur]) section[cur].push(line);
    });

    const state = {
      reportNo: "",
      example: /\bEXAMPLE DATA\b/.test(allText),
      step: 0,
      scope: { smoke: section.B.length > 0 || lines.some(function (l) { return /^B\.\s/.test(textOf(l.items)); }) , switchboard: false },
      job: {},
      inspector: {},
      property: {},
      alarms: [],
      switchboard: { rcdTests: [], photos: [] },
      extraDefects: [],
      sign: { onBehalf: false, elecSignoff: false, contractor: {} }
    };
    const rn = allText.match(/\bNI-\d{8}-\d{4}\b/);
    if (rn) state.reportNo = rn[0];
    const issued = allText.match(/Issued\s+(\d{1,2}\s+[A-Za-z]+\s+\d{4})/);
    if (issued) {
      const p = parseWhen(issued[1]);
      if (p) state.sign.date = p.date;
    }

    const hasB = lines.some(function (l) { return /^B\.\s+SMOKE/.test(textOf(l.items)); });
    const hasC = lines.some(function (l) { return /^C\.\s+SWITCHBOARD/.test(textOf(l.items)); });
    state.scope.smoke = hasB;
    state.scope.switchboard = hasC;

    parseDetails(section.A, state, missing);
    parseAlarms(section.B, state, missing);
    parseBoard(section.C, state, missing);
    parseSign(lines, state, missing);
    parseBehalf(lines, section.auth, state, missing);
    parseDefectHints(section.D, state);
    finishFlags(state, missing);

    const ok = !!(title || hasB || hasC || state.job.address);
    return { source: "text", ok: ok, state: state, missing: missing, summary: summarize(missing, "text") };
  }

  function parseDetails(secLines, state, missing) {
    if (!secLines.length) return;
    let valueLeft = 150;
    let labelRight = 300;
    let valueRight = 410;
    secLines.forEach(function (line) {
      line.items.forEach(function (it) {
        const t = String(it.str || "").trim();
        if (t === "Property address") {
          const vals = line.items.filter(function (o) { return o.x > it.x + 20 && String(o.str || "").trim(); });
          if (vals.length) valueLeft = Math.min.apply(null, vals.map(function (o) { return o.x; }));
        }
        if (t === "Previous check" || t === "Managing agent" || t === "Occupancy") labelRight = it.x;
      });
    });
    secLines.forEach(function (line) {
      line.items.forEach(function (it) {
        if (it.x > labelRight + 20 && (String(it.str || "").trim() === "Unknown" || /\d/.test(it.str) || /@/.test(it.str) || it.str.length > 2)) {
          if (it.x > labelRight && line.items.some(function (o) { return Math.abs(o.x - labelRight) < 2; })) valueRight = Math.min(valueRight, it.x);
        }
      });
    });
    const rightVals = [];
    secLines.forEach(function (line) {
      line.items.forEach(function (it) {
        const t = String(it.str || "").trim();
        if ((t === "Previous check" || t === "Managing agent" || t === "Occupancy" || t === "Storeys" || t === "Tenant") && it.x > 250) {
          const v = line.items.filter(function (o) { return o.x > it.x + 8 && String(o.str || "").trim(); }).sort(function (a, b) { return a.x - b.x; })[0];
          if (v) rightVals.push(v.x);
        }
      });
    });
    if (rightVals.length) valueRight = Math.min.apply(null, rightVals);

    function zone(x) {
      if (x < valueLeft - 6) return "ll";
      if (x < labelRight - 6) return "lv";
      if (x < valueRight - 6) return "rl";
      return "rv";
    }
    const leftLabels = ["Property address", "Inspection date", "Technician", "Property manager", "Supervision", "Build / approval", "Renter written information", "Overall result"];
    const rows = [];
    secLines.forEach(function (line) {
      const groups = { ll: [], lv: [], rl: [], rv: [] };
      line.items.forEach(function (it) {
        if (!String(it.str || "").trim()) return;
        groups[zone(it.x)].push(it);
      });
      const ll = textOf(groups.ll);
      const starts = leftLabels.some(function (label) { return ll === label || ll.indexOf(label) === 0; });
      if (starts || !rows.length) rows.push({ ll: [], lv: [], rl: [], rv: [] });
      const row = rows[rows.length - 1];
      ["ll", "lv", "rl", "rv"].forEach(function (k) {
        const text = textOf(groups[k]);
        if (!text) return;
        const right = groups[k].reduce(function (m, it) { return Math.max(m, it.x + (it.w || 0)); }, 0);
        row[k].push({ text: text, right: right });
      });
    });
    function cell(parts, edge) { return joinParts(parts, edge); }
    const kv = {};
    rows.forEach(function (row) {
      const ll = cell(row.ll, valueLeft);
      const rl = cell(row.rl, valueRight);
      const lv = cell(row.lv, labelRight);
      const rv = cell(row.rv, 560);
      if (ll) kv[ll.replace(/:\s*$/, "")] = lv;
      if (rl) kv[rl.replace(/:\s*$/, "")] = rv;
    });

    function take(label) {
      const keys = Object.keys(kv);
      for (let i = 0; i < keys.length; i++) if (keys[i] === label || keys[i].indexOf(label) === 0) return kv[keys[i]];
      return "";
    }
    state.job.address = cleanDash(take("Property address"));
    const when = parseWhen(take("Inspection date"));
    if (when) {
      state.job.inspectedAt = when.hasTime ? when.iso : when.date + "T00:00";
      if (!when.hasTime) flag(missing, "job.inspectedAt", "Inspection time", "The PDF showed the date but not the time.");
    }
    const prev = take("Previous check");
    state.job.previousCheck = !cleanDash(prev) || prev === "Not recorded" ? "" : prev;
    state.inspector.techName = cleanDash(take("Technician"));
    state.job.agency = cleanDash(take("Managing agent"));
    const pm = take("Property manager");
    if (cleanDash(pm)) {
      const bits = pm.split(/\s+·\s+|\s+•\s+/);
      state.job.pmName = bits[0] || "";
      state.job.pmEmail = bits.length > 1 ? bits.slice(1).join(" · ") : "";
    }
    const occ = take("Occupancy");
    if (/tenanted/i.test(occ)) state.job.occupancy = "tenanted";
    else if (/vacant/i.test(occ)) state.job.occupancy = "vacant";
    const sup = supervisionFrom(take("Supervision"));
    if (sup && sup.name) {
      state.inspector.supName = sup.name;
      state.inspector.supBusiness = sup.business || "";
      state.inspector.supRec = sup.rec || "";
      state.inspector.supLic = sup.lic || "";
      state.sign.elecSignoff = true;
    }
    state.job.buildEra = eraFrom(take("Build / approval"));
    const storeys = cleanDash(take("Storeys"));
    if (storeys) state.job.storeys = storeys === "4 or more" ? "4+" : storeys;
    const renter = take("Renter written information");
    if (/^Yes\b/i.test(renter)) state.job.renterInfo = "yes";
    else if (/^No\b/i.test(renter)) state.job.renterInfo = "no";
    const tenant = take("Tenant");
    if (/^Present\b/i.test(tenant)) {
      state.job.tenantPresent = "yes";
      const nm = tenant.match(/Present\s+[—–-]\s+(.+)$/);
      state.job.tenantName = nm ? nm[1].trim() : "";
    } else if (/Not present/i.test(tenant)) state.job.tenantPresent = "no";

    let compliant = null;
    secLines.forEach(function (line) {
      line.items.forEach(function (it) {
        const t = String(it.str || "").trim();
        if (it.x > 360 && t === "YES") compliant = true;
        if (it.x > 360 && t === "NO") compliant = false;
        if (/YES:\s*COMPLIANT/i.test(t)) compliant = true;
        if (/NO:\s*NOT COMPLIANT/i.test(t)) compliant = false;
      });
    });
    state._compliant = compliant;
  }

  function parseAlarms(secLines, state, missing) {
    const h1 = headerLine(secLines, "MFD / EXPIRY", "#");
    if (h1 >= 0) {
      const cols = columnBounds(headersOn(secLines[h1]));
      const data = [];
      for (let i = h1 + 1; i < secLines.length; i++) {
        const t = textOf(secLines[i].items);
        if (/^Audio evidence recorded/.test(t) || /^Property notes\b/.test(t) || secLines[i].items.some(function (it) { return String(it.str || "").trim() === "MOUNTING"; })) break;
        data.push(secLines[i]);
      }
      const raw = cellsFromLines(data, cols);
      raw.forEach(function (row) { rememberLocLines(row, cols); });
      state.alarms = raw.map(function (row) {
        const alarm = applyAlarmRow(row.buckets, cols);
        alarm._locLines = row._locLines;
        const locCol = cols.filter(function (c) { return c.name === "LOCATION"; })[0];
        const loc = parseLocationLines(row._locLines, locCol ? locCol.right : 0);
        alarm.location = loc.location;
        alarm.locationDetail = loc.locationDetail;
        alarm.storey = loc.storey;
        alarm._uncertainLocation = loc.uncertain;
        return alarm;
      });
      state._hasResultColumn = false;
    }
    const h2 = headerLine(secLines, "MOUNTING", "#");
    if (h2 >= 0) {
      const cols = columnBounds(headersOn(secLines[h2]));
      const data = [];
      for (let i = h2 + 1; i < secLines.length; i++) {
        const t = textOf(secLines[i].items);
        if (/^Property notes\b/.test(t) || /^[A-G]\.\s/.test(t)) break;
        data.push(secLines[i]);
      }
      state._hasResultColumn = cols.some(function (c) { return c.name === "RESULT"; });
      cellsFromLines(data, cols).forEach(function (row) {
        let alarm = state.alarms.filter(function (a, idx) { return idx + 1 === row.n; })[0];
        if (!alarm) {
          alarm = applyAlarmRow({}, cols);
          while (state.alarms.length < row.n) state.alarms.push(applyAlarmRow({}, cols));
          alarm = state.alarms[row.n - 1];
        }
        applyDetail(alarm, row.buckets);
      });
    }
    const notes = linesBetween(secLines, /^Property notes$/, /^[A-G]\.\s/);
    if (notes.length) state.property.recommendations = joinParts(notes.map(function (t, i) { return { text: t, right: i < notes.length - 1 ? 540 : 0 }; }), 540);

    state.alarms.forEach(function (alarm, i) {
      const n = i + 1;
      const where = "Alarm " + n;
      if (alarm._resultText) {
        const parsed = resultFrom(alarm._resultText);
        alarm.result = parsed.value;
        if (parsed.expired) flag(missing, "alarms." + i + ".result", where + " result", "The PDF says this alarm is over 10 years, which replaces the recorded result. Pick the result again.");
        else if (parsed.unknown || parsed.empty) flag(missing, "alarms." + i + ".result", where + " result", "The result printed on the PDF was not a known answer.");
      } else if (!state._hasResultColumn) {
        if (alarm.testButton === "fail") alarm.result = "Fail";
        else if (alarm.testButton === "pass") alarm.result = "Pass";
        else if (alarm.testButton === "na") alarm.result = "na";
        if (alarm.result) flag(missing, "alarms." + i + ".result", where + " result", "This PDF did not print a separate result, so it was taken from the test column. Change it if that is wrong.");
        else flag(missing, "alarms." + i + ".result", where + " result", "No result was printed for this alarm.");
      }
      if (alarm._uncertainLocation || !alarm.location) flag(missing, "alarms." + i + ".location", where + " location", alarm.location ? "The location text did not match a known place. It was put under Other." : "The location could not be read.");
      if (!alarm.dateValue) flag(missing, "alarms." + i + ".dateValue", where + " date", "No manufacture or expiry date was printed.");
      else if (alarm._datePartial) flag(missing, "alarms." + i + ".dateValue", where + " date", "Only the month and year were printed. The day is the 1st, so correct it if you know the day.");
      flag(missing, "alarms." + i + ".photo", where + " photo", "Photos are not copied out of an older PDF. Take the photo again.");
      if (alarm.type && ["Photoelectric", "Ionisation", "Unknown"].indexOf(alarm.type) < 0) flag(missing, "alarms." + i + ".type", where + " type", "The type printed on the PDF was not a known answer.");
      delete alarm._resultText;
      delete alarm._locLines;
      delete alarm._uncertainLocation;
      delete alarm._datePartial;
      delete alarm._expiredNote;
    });
  }

  function parseBoard(secLines, state, missing) {
    if (!state.scope.switchboard && !secLines.length) return;
    const parsed = boardRowsFrom(secLines);
    if (parsed.locationLine) state.switchboard.location = parsed.locationLine;
    parsed.rows.forEach(function (row) { applyBoardRow(state.switchboard, row.key, row.observation, row.result, missing); });
    if (parsed.notes) state.switchboard.notes = parsed.notes;
  }

  function parseSign(lines, state, missing) {
    const mid = 297;
    lines.forEach(function (line) {
      const side = sideText(line, mid);
      const nameL = side.left.match(/^Name:\s*(.+)$/);
      const nameR = side.right.match(/^Name:\s*(.+)$/);
      const phone = side.left.match(/^Phone:\s*(.+)$/);
      const dateL = side.left.match(/^Date:\s*(.+)$/);
      const sigLine = /Licence/.test(side.right);
      const rec = sigLine ? side.right.match(/REC\s+(\S+)/) : null;
      const lic = sigLine ? side.right.match(/Licence\s+(\S+)/) : null;
      if (nameL && cleanDash(nameL[1])) {
        state.sign.printedName = cleanDash(nameL[1]);
        if (!state.inspector.techName) state.inspector.techName = state.sign.printedName;
      }
      if (nameR && cleanDash(nameR[1])) {
        state.inspector.supName = state.inspector.supName || cleanDash(nameR[1]);
        state.sign.elecSignoff = true;
      }
      if (phone && cleanDash(phone[1])) state.inspector.techPhone = cleanDash(phone[1]);
      if (dateL) {
        const p = parseWhen(dateL[1]);
        if (p) state.sign.date = p.date;
      }
      if (rec) {
        const v = cleanDash(rec[1]);
        if (v) state.inspector.supRec = v;
      }
      if (lic) {
        const v = cleanDash(lic[1]);
        if (v) state.inspector.supLic = v;
      }
      const whole = textOf(line.items);
      const due = whole.match(/Next smoke alarm check due\s+(.+?)\s+Next electrical check due\s+(.+)$/i);
      if (due) {
        const a = parseWhen(due[1]);
        const b = parseWhen(due[2]);
        if (a) state.sign.nextDue = a.date;
        if (b) state.sign.nextElectrical = b.date;
      }
    });
    if (!state.sign.printedName && state.inspector.techName) state.sign.printedName = state.inspector.techName;
    flag(missing, "sign.signature", "Technician signature", "The signature image was not copied. Sign again.");
    if (state.sign.elecSignoff) flag(missing, "sign.supSignature", "Supervising electrician signature", "The signature image was not copied. Sign again.");
  }

  function parseBehalf(lines, authLines, state, missing) {
    const footer = lines.map(function (l) { return textOf(l.items); }).join("\n");
    const foot = footer.match(/Prepared by (.+?) on behalf of (.+)/i);
    const blob = authLines.map(function (l) { return textOf(l.items); }).join(" ");
    const prep = blob.match(/prepared by\s+(.+?)\s+\(technician\s+(.+?)\)\s+on behalf of\s+(.+?),\s*REC\s+([^.]+)\./i);
    const auth = blob.match(/authority of\s+(.+?),\s*licence\s+([^,]+),/i);
    if (prep || foot) {
      state.sign.onBehalf = true;
      state.sign.preparer = prep ? cleanDash(prep[1]) : (foot ? cleanDash(foot[1]) : "Neill Data");
      if (!state.sign.preparer) state.sign.preparer = "Neill Data";
      state.sign.contractor.name = prep ? cleanDash(prep[3]) : (foot ? cleanDash(foot[2]) : "");
      if (prep && cleanDash(prep[4])) state.sign.contractor.rec = cleanDash(prep[4]);
      if (auth) {
        if (cleanDash(auth[1])) state.sign.contractor.electrician = cleanDash(auth[1]);
        if (cleanDash(auth[2])) state.sign.contractor.licence = cleanDash(auth[2]);
      }
      flag(missing, "sign.elecSignature", "Authorising electrician signature", "The signature image was not copied. Sign again.");
    }
  }

  function alarmWhere(alarm) {
    const loc = alarm.location === "Other" ? (alarm.locationDetail || "Other") : (alarm.location || "");
    const detail = alarm.location && alarm.location !== "Other" && alarm.locationDetail ? " — " + alarm.locationDetail : "";
    const storey = alarm.storey ? ", " + alarm.storey : "";
    return (loc + detail + storey).trim();
  }

  function parseDefectHints(secLines, state) {
    const text = secLines.map(function (l) { return textOf(l.items); }).join(" ");
    if (/not installed on every storey/i.test(text)) state.property.everyStorey = "no";
    if (/hallway serving bedrooms/i.test(text)) state.property.sleeping = "no";
    state.alarms.forEach(function (alarm) {
      const where = alarmWhere(alarm);
      if (!where) return;
      if (text.indexOf(where) < 0) return;
      const slice = text.split(where).slice(1).join(where);
      const near = slice.slice(0, 180);
      if (/not clean and dust-free/i.test(near)) alarm.cleaned = "no";
      if (/not securely fixed/i.test(near)) alarm.secure = "no";
      if (/Hush function did not work/i.test(near) || /Hush function did not work[\s\S]{0,80}$/.test(text.slice(Math.max(0, text.indexOf(where) - 80), text.indexOf(where) + where.length + 40))) alarm.hush = "no";
    });
    if (state._compliant === true) {
      if (!state.property.everyStorey) state.property.everyStorey = "yes";
      if (!state.property.sleeping) state.property.sleeping = "yes";
    }
    delete state._compliant;
    delete state._hasResultColumn;
  }

  function finishFlags(state, missing) {
    if (state.scope.smoke) {
      if (!state.job.buildEra) flag(missing, "job.buildEra", "Build date", "The build date was not on the PDF.");
      if (!state.job.storeys) flag(missing, "job.storeys", "Storeys", "The number of storeys was not on the PDF.");
      if (!state.job.renterInfo) flag(missing, "job.renterInfo", "Renter information", "Whether the renter was given written information was not on the PDF.");
      if (!state.property.everyStorey) flag(missing, "property.everyStorey", "Alarm on every storey", "The PDF did not say whether every storey has an alarm.");
      if (!state.property.sleeping) flag(missing, "property.sleeping", "Bedroom hallways", "The PDF did not say whether each bedroom hallway has an alarm.");
      if (!state.alarms.length) flag(missing, "alarms", "Smoke alarms", "No smoke alarms could be read.");
    }
    if (!state.job.address) flag(missing, "job.address", "Property address", "The address could not be read.");
    if (!state.job.inspectedAt) flag(missing, "job.inspectedAt", "Inspection date", "The inspection date could not be read.");
    if (!state.inspector.techName) flag(missing, "inspector.techName", "Technician name", "The technician name could not be read.");
    if (state.scope.switchboard) {
      if (!state.switchboard.location) flag(missing, "switchboard.location", "Switchboard location", "The switchboard location could not be read.");
      if (!state.switchboard.protection) flag(missing, "switchboard.protection", "Circuit protection", "The circuit protection was not on the PDF.");
      if (!state.switchboard.minStandard) flag(missing, "switchboard.minStandard", "Power and lighting protection", "That answer was not on the PDF.");
    }
    if (!state.sign.printedName) flag(missing, "sign.printedName", "Printed name", "The printed name could not be read.");
    if (!state.sign.date) flag(missing, "sign.date", "Sign-off date", "The sign-off date could not be read.");
    if (!state.sign.nextDue) flag(missing, "sign.nextDue", "Next smoke alarm check", "The next smoke alarm check date could not be read.");
    if (!state.sign.nextElectrical) flag(missing, "sign.nextElectrical", "Next electrical check", "The next electrical check date could not be read.");
    if (state.sign.elecSignoff) {
      if (!state.inspector.supName) flag(missing, "inspector.supName", "Supervising electrician", "The supervising electrician name could not be read.");
      if (!state.inspector.supRec) flag(missing, "inspector.supRec", "Supervising REC number", "The PDF showed a dash, or no REC number.");
      if (!state.inspector.supLic) flag(missing, "inspector.supLic", "Supervising licence", "The PDF showed a dash, or no licence number.");
      if (!state.inspector.supBusiness) flag(missing, "inspector.supBusiness", "Supervising business", "The supervising business name could not be read.");
    }
    if (state.sign.onBehalf) {
      const c = state.sign.contractor || {};
      if (!state.sign.preparer) flag(missing, "sign.preparer", "Report preparer", "The preparer name could not be read.");
      if (!c.name) flag(missing, "sign.contractor.name", "Contractor name", "The contractor name could not be read.");
      if (!c.rec) flag(missing, "sign.contractor.rec", "Contractor REC number", "The contractor REC number could not be read.");
      if (!c.electrician) flag(missing, "sign.contractor.electrician", "Authorising electrician", "The authorising electrician could not be read.");
      if (!c.licence) flag(missing, "sign.contractor.licence", "Contractor licence", "The contractor licence could not be read.");
    }
  }

  return {
    SCHEMA: SCHEMA,
    FILE_NAME: FILE_NAME,
    MAX_CHARS: MAX_CHARS,
    payloadFromState: payloadFromState,
    embedInPdf: embedInPdf,
    fromPayload: fromPayload,
    fromTextItems: fromTextItems,
    parseLocationLines: parseLocationLines
  };
});
