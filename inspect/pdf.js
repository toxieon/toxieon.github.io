/* Option A report. Navy band, lettered sections, logo left, contractor logo right when used. */
(function (root) {
  "use strict";
  const L = function () { return root.NILogic; };
  const NAVY = [20, 33, 61];
  const INK = [30, 41, 59];
  const MUTED = [71, 85, 105];
  const LINE = [100, 116, 139];
  const RULE = [203, 213, 225];
  const WASH = [241, 245, 249];
  const HEADW = [226, 232, 240];
  const RED = [185, 28, 28];
  const GREEN = [22, 101, 52];
  const AMBER = [146, 64, 14];
  const AMBER_B = [180, 83, 9];

  function fmtImg(url) { return /png/i.test(url || "") ? "PNG" : "JPEG"; }

  function build(state, now) {
    const { jsPDF } = root.jspdf;
    const doc = new jsPDF({ unit: "pt", format: "a4", compress: true });
    const W = doc.internal.pageSize.getWidth();
    const H = doc.internal.pageSize.getHeight();
    const M = 32;
    const CW = W - M * 2;
    const bottom = H - 46;
    let y = 0;

    function chrome() {
      const band = 56;
      doc.setFillColor(NAVY[0], NAVY[1], NAVY[2]);
      doc.rect(0, 0, W, band, "F");
      let left = M;
      const logo = state.inspector && state.inspector.logo;
      if (logo && fitImage(logo, M, 11, 110, 34)) left = M + 118;
      else left = wordmark(M);
      const cLogo = state.sign && state.sign.onBehalf && state.sign.contractor && state.sign.contractor.logo;
      let rightLimit = W - M;
      if (cLogo && fitImage(cLogo, W - M - 110, 11, 110, 34)) rightLimit = W - M - 118;
      doc.setTextColor(255);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(13);
      const titleW = Math.min(230, Math.max(140, rightLimit - left - 96));
      const title = doc.splitTextToSize(L().TITLE, titleW).slice(0, 2);
      doc.text(title[0] || "", left, 26);
      if (title[1]) doc.text(title[1], left, 41);
      doc.setFontSize(11);
      const rn = state.reportNo || "";
      doc.text(rn, rightLimit, 26, { align: "right" });
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8);
      doc.setTextColor(210, 218, 230);
      doc.text("Issued " + L().fmtDate(state.sign && state.sign.date || (state.job && state.job.inspectedAt)), rightLimit, 40, { align: "right" });
      doc.setFillColor(HEADW[0], HEADW[1], HEADW[2]);
      doc.rect(0, band, W, 16, "F");
      let pillW = 0;
      if (state.example) {
        doc.setFont("helvetica", "bold");
        doc.setFontSize(7);
        const label = "EXAMPLE DATA";
        pillW = doc.getTextWidth(label) + 10;
        const px = W - M - pillW;
        const py = band + 2.5;
        doc.setFillColor(255, 255, 255);
        doc.setDrawColor(AMBER_B[0], AMBER_B[1], AMBER_B[2]);
        doc.setLineWidth(0.8);
        doc.roundedRect(px, py, pillW, 11, 2, 2, "FD");
        doc.setTextColor(AMBER_B[0], AMBER_B[1], AMBER_B[2]);
        doc.text(label, px + 5, py + 8);
        doc.setLineWidth(0.6);
      }
      doc.setTextColor(51, 65, 85);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(7);
      const subW = W - M * 2 - (pillW ? pillW + 8 : 0);
      const sub = doc.splitTextToSize("Residential Tenancies Regulations 2021  ·  Smoke alarm safety check (RTA 1997 s68AA) and visual switchboard inspection  ·  AS 3786", subW);
      doc.text(sub[0], M, band + 11);
      return band + 16;
    }

    function wordmark(x) {
      doc.setFillColor(224, 123, 42);
      doc.roundedRect(x, 15, 26, 26, 4, 4, "F");
      doc.setTextColor(255);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(9);
      doc.text("ND", x + 13, 32, { align: "center" });
      doc.setFontSize(11);
      doc.text("Neill Data", x + 32, 26);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8);
      doc.setTextColor(203, 213, 225);
      doc.text("Neill Inspect", x + 32, 38);
      return x + 118;
    }

    function need(h) {
      if (y + h > bottom) { doc.addPage(); y = chrome(); }
    }

    function section(title) {
      need(10 + 16 + 4);
      y += 10;
      doc.setFillColor(NAVY[0], NAVY[1], NAVY[2]);
      doc.rect(M, y, CW, 16, "F");
      doc.setTextColor(255);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(9);
      doc.text(title, M + 6, y + 11.5);
      y += 16 + 4;
    }

    function fitImage(src, x, y0, boxW, boxH) {
      if (!src) return false;
      let props;
      try { props = doc.getImageProperties(src); }
      catch (e) { return false; }
      const iw = props.width || 1;
      const ih = props.height || 1;
      const scale = Math.min(boxW / iw, boxH / ih);
      const w = iw * scale;
      const h = ih * scale;
      const dx = x + (boxW - w) / 2;
      const dy = y0 + (boxH - h) / 2;
      doc.setFillColor(WASH[0], WASH[1], WASH[2]);
      doc.rect(x, y0, boxW, boxH, "F");
      try { doc.addImage(src, fmtImg(src), dx, dy, w, h); return true; }
      catch (e) { return false; }
    }

    function linesOf(text, width, size) {
      doc.setFontSize(size);
      const lines = doc.splitTextToSize(String(text == null || text === "" ? "—" : text), Math.max(8, width));
      return lines.length ? lines : ["—"];
    }

    function rowH(cells, size) {
      let h = 16;
      cells.forEach(function (c) {
        const ls = linesOf(c.text, c.w - 8, size);
        h = Math.max(h, ls.length * (size + 2) + 8);
      });
      return h;
    }

    function drawRow(cells, y0, h, header) {
      let x = M;
      cells.forEach(function (c) {
        if (header) doc.setFillColor(HEADW[0], HEADW[1], HEADW[2]);
        else if (c.fill) doc.setFillColor(c.fill[0], c.fill[1], c.fill[2]);
        else doc.setFillColor(255, 255, 255);
        doc.setDrawColor(LINE[0], LINE[1], LINE[2]);
        doc.setLineWidth(0.6);
        doc.rect(x, y0, c.w, h, "FD");
        doc.setTextColor(header ? MUTED[0] : INK[0], header ? MUTED[1] : INK[1], header ? MUTED[2] : INK[2]);
        doc.setFont("helvetica", header || c.bold ? "bold" : "normal");
        const size = header ? 7.5 : (c.size || 8);
        doc.setFontSize(size);
        if (c.text !== "") {
          const ls = linesOf(c.text, c.w - 8, size);
          const block = ls.length * (size + 2);
          const base = c.center ? y0 + (h - block) / 2 + size : y0 + size + 3;
          doc.text(ls, x + 4, base);
        }
        x += c.w;
      });
    }

    function table(headers, rows, widths, opts) {
      opts = opts || {};
      const size = opts.size || 8;
      const headCells = headers.map(function (t, i) { return { text: t, w: widths[i] }; });
      const hh = Math.max(18, rowH(headCells, 7.5));
      need(hh);
      drawRow(headCells, y, hh, true);
      y += hh;
      rows.forEach(function (r) {
        const cells = r.map(function (text, i) { return { text: text, w: widths[i], bold: opts.boldFirst && i === 0 }; });
        const h = rowH(cells, size);
        need(h);
        drawRow(cells, y, h, false);
        y += h;
      });
    }

    function pill(text, kind, x, y0, rowH) {
      const map = {
        PASS: { t: GREEN, b: GREEN, f: [240, 253, 244] },
        FAIL: { t: RED, b: RED, f: [254, 242, 242] },
        CHECK: { t: AMBER, b: AMBER_B, f: [255, 251, 235] },
        "N/A": { t: MUTED, b: [148, 163, 184], f: [255, 255, 255] }
      };
      const c = map[kind] || map["N/A"];
      const h = 12;
      doc.setFont("helvetica", "bold");
      doc.setFontSize(7.5);
      const w = doc.getTextWidth(text) + 10;
      const top = y0 + (rowH - h) / 2;
      const baseline = top + h - 3.5;
      doc.setDrawColor(c.b[0], c.b[1], c.b[2]);
      doc.setFillColor(c.f[0], c.f[1], c.f[2]);
      doc.setLineWidth(0.8);
      doc.roundedRect(x, top, w, h, 2, 2, "FD");
      doc.setTextColor(c.t[0], c.t[1], c.t[2]);
      doc.text(text, x + 5, baseline);
      doc.setLineWidth(0.6);
      return w;
    }

    function solidBadge(text, fill, x, y0, rowH) {
      doc.setFont("helvetica", "bold");
      doc.setFontSize(11);
      const w = doc.getTextWidth(text) + 14;
      const h = 20;
      const top = y0 + (rowH - h) / 2;
      doc.setFillColor(fill[0], fill[1], fill[2]);
      doc.roundedRect(x, top, w, h, 2, 2, "F");
      doc.setTextColor(255, 255, 255);
      doc.text(text, x + 7, top + 14);
      return w;
    }

    function dash(x, y0, rowH, cellW) {
      doc.setFont("helvetica", "normal");
      doc.setFontSize(7.5);
      doc.setTextColor(100, 116, 139);
      const tw = doc.getTextWidth("—");
      doc.text("—", x + Math.max(2, (cellW - tw) / 2), y0 + (rowH + 7.5) / 2 - 1);
    }

    function mic(x, y0) {
      doc.setDrawColor(NAVY[0], NAVY[1], NAVY[2]);
      doc.setLineWidth(0.9);
      doc.roundedRect(x, y0 - 7, 4, 7, 1.5, 1.5, "S");
      doc.line(x - 1.5, y0 - 3, x - 1.5, y0 - 1);
      doc.line(x + 5.5, y0 - 3, x + 5.5, y0 - 1);
      doc.line(x - 1.5, y0 - 1, x + 2, y0 + 1);
      doc.line(x + 5.5, y0 - 1, x + 2, y0 + 1);
      doc.line(x + 2, y0 + 1, x + 2, y0 + 3);
    }

    y = chrome();
    const job = state.job || {};
    const ins = state.inspector || {};
    const sign = state.sign || {};
    const badge = L().overall(state, now);
    const smokeYes = L().propertyCompliant(state, now);

    section("A. INSTALLATION & INSPECTION DETAILS");
    const addr = [job.unit, job.address].filter(Boolean).join(", ") || "—";
    const sup = ins.supName
      ? "Under supervision of " + ins.supName + (ins.supRec ? ", REC " + ins.supRec : "") + (ins.supLic ? ", Licence " + ins.supLic : "") + (ins.supBusiness ? " (" + ins.supBusiness + ")" : "")
      : "—";
    const kv = [
      [{ k: "Property address", v: addr, span: 3 }],
      [{ k: "Inspection date", v: L().fmtWhen(job.inspectedAt) }, { k: "Previous check", v: job.previousCheck ? L().fmtDate(job.previousCheck) : "Not recorded" }],
      [{ k: "Technician", v: ins.techName || "—" }, { k: "Managing agent", v: job.agency || "—" }],
      [{ k: "Property manager", v: [job.pmName, job.pmEmail].filter(Boolean).join(" · ") || "—" }, { k: "Occupancy", v: job.occupancy === "vacant" ? "Vacant" : job.occupancy === "tenanted" ? "Tenanted" : "—" }],
      [{ k: "Supervision", v: sup, span: 3 }],
      [{ k: "Build / approval", v: L().ERA_LABEL[job.buildEra] || "—" }, { k: "Storeys", v: job.storeys || "—" }],
      [{ k: "Renter written information", v: job.renterInfo === "yes" ? "Yes — provided" : job.renterInfo === "no" ? "No" : "—" }, { k: "Tenant", v: job.tenantPresent === "yes" ? ("Present" + (job.tenantName ? " — " + job.tenantName : "")) : job.tenantPresent === "no" ? "Not present" : "—" }]
    ];
    const col = [CW * 0.22, CW * 0.28, CW * 0.22, CW * 0.28];
    kv.forEach(function (pair) {
      const cells = [];
      if (pair.length === 1) {
        cells.push({ text: pair[0].k, w: col[0], bold: true, fill: WASH, size: 8 });
        cells.push({ text: pair[0].v, w: col[1] + col[2] + col[3], size: 8 });
      } else {
        cells.push({ text: pair[0].k, w: col[0], bold: true, fill: WASH, size: 8 });
        cells.push({ text: pair[0].v, w: col[1], size: 8 });
        cells.push({ text: pair[1].k, w: col[2], bold: true, fill: WASH, size: 8 });
        cells.push({ text: pair[1].v, w: col[3], size: 8 });
      }
      const h = rowH(cells, 8);
      need(h);
      drawRow(cells, y, h, false);
      y += h;
    });
    const badgeH = 28;
    need(badgeH);
    drawRow([
      { text: "Overall result", w: col[0], bold: true, fill: WASH, size: 8, center: true },
      { text: "", w: col[1], size: 8 },
      { text: "Property smoke alarms compliant", w: col[2], bold: true, fill: WASH, size: 8, center: true },
      { text: "", w: col[3], size: 8 }
    ], y, badgeH, false);
    const resultFill = badge === "FAIL" ? RED : badge === "PASS" ? [21, 128, 61] : AMBER_B;
    const resultText = badge === "PASS" ? "PASS" : badge === "FAIL" ? "FAIL" : "ACTION REQUIRED";
    solidBadge(resultText, resultFill, M + col[0] + 4, y, badgeH);
    const compText = smokeYes ? "YES: COMPLIANT" : "NO: NOT COMPLIANT";
    const compFill = smokeYes ? [21, 128, 61] : RED;
    solidBadge(compText, compFill, M + col[0] + col[1] + col[2] + 4, y, badgeH);
    y += badgeH;

    section("B. SMOKE ALARMS");
    const widths = [22, 108, 72, 86, 78, 52, 58, 63];
    const sum = widths.reduce(function (a, b) { return a + b; }, 0);
    const scale = CW / sum;
    const sw = widths.map(function (w) { return w * scale; });
    table(["#", "LOCATION", "TYPE", "POWER", "MFD / EXPIRY", "TEST", "PHOTO", "AUDIO"], [], sw);
    (state.alarms || []).forEach(function (a, i) {
      const expired = L().isExpired(a, now);
      const dateLine = (a.dateKind === "expiry" ? "Exp " : "Mfd ") + (function () {
        const d = L().parseDate(a.dateValue);
        if (!d) return "—";
        return String(d.getMonth() + 1).padStart(2, "0") + "/" + d.getFullYear();
      })();
      const power = a.power === "240V with 10-yr lithium backup" ? "240V + backup" : a.power === "10-yr sealed lithium" ? "10yr lithium" : (a.power || "—");
      const h = expired ? 48 : 28;
      need(h);
      const cells = [
        { text: String(i + 1), w: sw[0] },
        { text: L().locationText(a, i), w: sw[1] },
        { text: a.type || "—", w: sw[2] },
        { text: power, w: sw[3] },
        { text: dateLine, w: sw[4] },
        { text: "", w: sw[5] },
        { text: "", w: sw[6] },
        { text: "", w: sw[7] }
      ];
      drawRow(cells, y, h, false);
      let x = M;
      const testKind = a.testButton === "fail" || a.result === "Fail" ? "FAIL" : a.testButton === "pass" ? "PASS" : "N/A";
      const testLabel = testKind === "N/A" ? "N/A" : testKind;
      x = M + sw[0] + sw[1] + sw[2] + sw[3];
      if (expired) {
        doc.setFont("helvetica", "bold");
        doc.setFontSize(7.5);
        const flag = doc.splitTextToSize("Over 10 years: replace", sw[4] - 18);
        const flagTop = y + h - 6 - flag.length * 9;
        doc.setFillColor(RED[0], RED[1], RED[2]);
        doc.triangle(x + 4, flagTop + 1, x + 10, flagTop + 1, x + 7, flagTop - 5, "F");
        doc.setTextColor(RED[0], RED[1], RED[2]);
        doc.text(flag, x + 13, flagTop + 2);
      }
      pill(testLabel, testKind, M + sw[0] + sw[1] + sw[2] + sw[3] + sw[4] + 4, y, h);
      const photoX = M + sw[0] + sw[1] + sw[2] + sw[3] + sw[4] + sw[5];
      if (a.photo && fitImage(a.photo, photoX + 3, y + (h - 22) / 2, 30, 22)) { /* fitted */ }
      else dash(photoX, y, h, sw[6]);
      const ax = photoX + sw[6];
      if (a.audio && a.audio.dataUrl) {
        const mid = y + h / 2;
        mic(ax + 4, mid + 2);
        doc.setFont("helvetica", "bold");
        doc.setFontSize(7.5);
        doc.setTextColor(NAVY[0], NAVY[1], NAVY[2]);
        doc.text("Audio", ax + 14, mid + 3);
      } else dash(ax, y, h, sw[7]);
      y += h;
    });
    const audioNotes = (state.alarms || []).map(function (a, i) {
      if (!a.audio || !a.audio.dataUrl) return "";
      const secs = a.audio.seconds ? " (" + a.audio.seconds + "s)" : "";
      return "Audio evidence recorded: " + L().audioFilename(state, a, i) + secs;
    }).filter(Boolean);
    if (audioNotes.length) {
      y += 4;
      doc.setFont("helvetica", "normal");
      doc.setFontSize(7.5);
      doc.setTextColor(MUTED[0], MUTED[1], MUTED[2]);
      audioNotes.forEach(function (line) { need(11); doc.text(line, M, y + 8); y += 11; });
    }
    y += 6;
    const detail = (state.alarms || []).map(function (a, i) {
      return [
        String(i + 1),
        L().locationText(a, i),
        a.mounting === "yes" ? "Compliant" : a.mounting === "no" ? "Not compliant" : "—",
        a.interconnected === "yes" ? "Yes" : a.interconnected === "no" ? "No" : a.interconnected === "na" ? "N/A" : "—",
        a.as3786 === "yes" ? "Present" : a.as3786 === "no" ? "Not seen" : "—",
        [a.batteryReplaced === "yes" ? "Replaced" : a.batteryReplaced === "no" ? "Not replaced" : "", a.batteryType || ""].filter(Boolean).join(" ") || "—",
        a.notes || "—"
      ];
    });
    if (detail.length) {
      need(14);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(9);
      doc.setTextColor(INK[0], INK[1], INK[2]);
      doc.text("Alarm details", M, y + 11);
      y += 16;
      const rest = [78, 58, 62, 72];
      const notesW = CW - sw[0] - sw[1] - rest.reduce(function (a, b) { return a + b; }, 0);
      table(["#", "LOCATION", "MOUNTING", "LINKED", "AS 3786", "BATTERY", "NOTES"], detail, [sw[0], sw[1]].concat(rest, [notesW]), { size: 8 });
    }
    const prop = state.property || {};
    if (prop.recommendations) {
      y += 6;
      need(24);
      doc.setFont("helvetica", "bold"); doc.setFontSize(8); doc.setTextColor(INK[0], INK[1], INK[2]);
      doc.text("Property notes", M, y + 8); y += 12;
      doc.setFont("helvetica", "normal");
      const rec = doc.splitTextToSize(prop.recommendations, CW);
      need(rec.length * 10);
      doc.text(rec, M, y + 8); y += rec.length * 10 + 4;
    }

    section("C. SWITCHBOARD — SAFETY CHECK (VISUAL INSPECTION & TESTING)");
    if ((state.switchboard || {}).location) {
      need(12);
      doc.setFont("helvetica", "normal"); doc.setFontSize(8); doc.setTextColor(INK[0], INK[1], INK[2]);
      doc.text("Location: " + state.switchboard.location, M, y + 10); y += 14;
    }
    const sRows = L().switchboardRows(state).filter(function (r) { return r.item !== "Switchboard location"; });
    const iw = CW * 0.30, rw = 52, ow = CW - iw - rw;
    need(16);
    drawRow([{ text: "ITEM", w: iw }, { text: "OBSERVATION", w: ow }, { text: "RESULT", w: rw }], y, 16, true);
    y += 16;
    sRows.forEach(function (r) {
      const cells = [{ text: r.item, w: iw, bold: true }, { text: r.observation, w: ow }, { text: "", w: rw }];
      const h = Math.max(rowH(cells, 8), 18);
      need(h);
      drawRow(cells, y, h, false);
      pill(r.result, r.result, M + iw + ow + 4, y, h);
      y += h;
    });
    y += 6;
    doc.setFont("helvetica", "normal"); doc.setFontSize(7.5); doc.setTextColor(MUTED[0], MUTED[1], MUTED[2]);
    const key = doc.splitTextToSize("Rewireable fuses, where present, do not meet the minimum standard and must be recorded as a defect. RCD result is the push-button test only. A timed trip test requires a licensed electrician. Result key: PASS · FAIL · CHECK (further investigation) · N/A.", CW);
    need(key.length * 10);
    doc.text(key, M, y + 8); y += key.length * 10 + 4;
    if ((state.switchboard || {}).notes) {
      const n = doc.splitTextToSize("Notes: " + state.switchboard.notes, CW);
      need(n.length * 10);
      doc.text(n, M, y + 8); y += n.length * 10;
    }

    section("D. DEFECTS & RECOMMENDED ACTIONS");
    const defs = L().collectDefects(state, now);
    const dws = [22, 58, (CW - 80) * 0.55, (CW - 80) * 0.45];
    if (!defs.length) {
      need(18);
      doc.setFont("helvetica", "normal"); doc.setFontSize(8); doc.setTextColor(INK[0], INK[1], INK[2]);
      doc.text("No defects recorded.", M, y + 12); y += 16;
    } else {
      need(16);
      drawRow(dws.map(function (w, i) { return { text: ["#", "PRIORITY", "DEFECT", "RECOMMENDED ACTION"][i], w: w }; }), y, 16, true);
      y += 16;
      defs.forEach(function (d, i) {
        const cells = [
          { text: String(i + 1), w: dws[0] },
          { text: "", w: dws[1] },
          { text: d.text, w: dws[2] },
          { text: d.action || "", w: dws[3] }
        ];
        const h = Math.max(rowH(cells, 8), 16);
        need(h);
        drawRow(cells, y, h, false);
        doc.setFont("helvetica", "bold"); doc.setFontSize(8);
        const pri = String(d.priority || "Routine").toUpperCase();
        const pc = pri === "URGENT" ? RED : pri === "HIGH" ? AMBER : MUTED;
        doc.setTextColor(pc[0], pc[1], pc[2]);
        doc.text(pri, M + dws[0] + 4, y + (h + 8) / 2 - 1);
        y += h;
      });
    }
    y += 4;
    doc.setFont("helvetica", "normal"); doc.setFontSize(7.5); doc.setTextColor(MUTED[0], MUTED[1], MUTED[2]);
    need(12);
    doc.text("Urgent: rectify immediately  ·  High: within 7 days  ·  Routine: next scheduled visit.", M, y + 9);
    y += 14;

    section("E. LIMITATIONS OF THE INSPECTION");
    doc.setFont("helvetica", "normal"); doc.setFontSize(8); doc.setTextColor(INK[0], INK[1], INK[2]);
    const lim = doc.splitTextToSize(L().LIMITATIONS + " Accessible areas only, on the inspection date. No dismantling, no wall or ceiling cavity entry, and no insulation-resistance testing. Smoke alarms are tested with the test button. Asbestos-suspect material is noted visually only and is not confirmed. References: " + L().REFERENCES, CW);
    need(lim.length * 11 + 4);
    doc.text(lim, M, y + 12); y += lim.length * 11 + 6;

    section("F. DECLARATION & SIGNATURES");
    doc.setFont("helvetica", "normal"); doc.setFontSize(8); doc.setTextColor(INK[0], INK[1], INK[2]);
    const dec = doc.splitTextToSize("I confirm that the smoke alarm safety check and the visual switchboard inspection described in this report were carried out at the property on the date shown. Inspected by " + (ins.techName || "—") + ". Under supervision of " + (ins.supName || "—") + ", REC " + (ins.supRec || "—") + ", Licence " + (ins.supLic || "—") + ".", CW);
    need(dec.length * 11 + 70);
    doc.text(dec, M, y + 12); y += dec.length * 11 + 6;
    const half = CW / 2;
    need(78);
    drawRow([{ text: "TECHNICIAN", w: half }, { text: "SUPERVISING LICENSED ELECTRICIAN", w: half }], y, 16, true);
    y += 16;
    doc.setFillColor(255, 255, 255); doc.setDrawColor(LINE[0], LINE[1], LINE[2]);
    doc.rect(M, y, half, 72, "FD"); doc.rect(M + half, y, half, 72, "FD");
    if (sign.signature) fitImage(sign.signature, M + 8, y + 4, 120, 28);
    if (sign.elecSignature) fitImage(sign.elecSignature, M + half + 8, y + 4, 120, 28);
    doc.setFontSize(8); doc.setTextColor(INK[0], INK[1], INK[2]); doc.setFont("helvetica", "normal");
    doc.text("Name: " + (sign.printedName || ins.techName || "—"), M + 8, y + 44);
    doc.text("Phone: " + (ins.techPhone || "—"), M + 8, y + 56);
    doc.text("Date: " + L().fmtDate(sign.date), M + 8, y + 68);
    doc.text("Name: " + (ins.supName || "—"), M + half + 8, y + 44);
    doc.text("REC " + (ins.supRec || "—") + "   Licence " + (ins.supLic || "—"), M + half + 8, y + 56);
    doc.text("Date: " + L().fmtDate(sign.date), M + half + 8, y + 68);
    y += 78;
    const dueCells = [
      { text: "Next smoke alarm check due", w: col[0] + 20, bold: true, fill: WASH, size: 8 },
      { text: L().fmtDate(sign.nextDue), w: col[1] - 10, bold: true, size: 8 },
      { text: "Next electrical check due", w: col[2], bold: true, fill: WASH, size: 8 },
      { text: L().fmtDate(sign.nextElectrical), w: CW - (col[0] + 20) - (col[1] - 10) - col[2], bold: true, size: 8 }
    ];
    const dh = rowH(dueCells, 8);
    need(dh);
    drawRow(dueCells, y, dh, false);
    y += dh;

    const photos = [];
    (state.alarms || []).forEach(function (a, i) {
      if (a.photo) photos.push({ src: a.photo, title: "Alarm " + (i + 1) + " — " + L().locationText(a, i), sub: [a.type, a.power, (a.dateKind === "expiry" ? "Exp " : "Mfd ") + (a.dateValue || "")].filter(Boolean).join(", "), test: a.testButton === "fail" ? "FAIL" : a.testButton === "pass" ? "PASS" : "", audio: a.audio && a.audio.dataUrl ? L().audioFilename(state, a, i) : "", seconds: a.audio && a.audio.seconds });
    });
    ((state.switchboard || {}).photos || []).forEach(function (p, i) {
      photos.push({ src: p.dataUrl || p, title: "Switchboard — photo " + (i + 1), sub: p.caption || (state.switchboard.location || ""), test: "" });
    });
    if (photos.length) {
      const cardW = 254, cardH = 78, gap = 10;
      need(10 + 16 + 4 + cardH);
      section("G. PHOTO RECORD");
      let col = 0;
      let continued = false;
      photos.forEach(function (p) {
        if (col === 0 && y + cardH > bottom) {
          doc.addPage();
          y = chrome();
          section("G. PHOTO RECORD (continued)");
          continued = true;
        }
        const x = M + col * (cardW + gap);
        doc.setDrawColor(LINE[0], LINE[1], LINE[2]);
        doc.setFillColor(255, 255, 255);
        doc.setLineWidth(0.6);
        doc.rect(x, y, cardW, cardH, "FD");
        fitImage(p.src, x + 4, y + 6, 70, 66);
        doc.setFont("helvetica", "bold");
        doc.setFontSize(8);
        doc.setTextColor(INK[0], INK[1], INK[2]);
        const title = doc.splitTextToSize(p.title, cardW - 86);
        doc.text(title, x + 80, y + 16);
        doc.setFont("helvetica", "normal");
        doc.setFontSize(8);
        const sub = doc.splitTextToSize(p.sub || "", cardW - 86);
        doc.text(sub.slice(0, 2), x + 80, y + 30);
        if (p.test) pill(p.test, p.test, x + 80, y + 40, 24);
        if (p.audio) {
          doc.setFontSize(7.5);
          doc.setTextColor(NAVY[0], NAVY[1], NAVY[2]);
          const note = doc.splitTextToSize("Audio evidence recorded: " + p.audio + (p.seconds ? " (" + p.seconds + "s)" : ""), cardW - 86);
          doc.text(note.slice(0, 2), x + 80, y + 66);
        }
        col += 1;
        if (col === 2) { col = 0; y += cardH + gap; }
      });
      if (col === 1) y += cardH;
      if (continued) { /* heading already repeated */ }
    }

    if (sign.onBehalf) {
      doc.addPage();
      y = chrome();
      const c = sign.contractor || {};
      const tagY = y + 12;
      if (c.logo) fitImage(c.logo, W - M - 110, tagY, 110, 34);
      else if (c.name) {
        doc.setFont("helvetica", "bold");
        doc.setFontSize(9);
        const nameLines = doc.splitTextToSize(c.name, 128).slice(0, 2);
        const boxH = Math.min(34, 12 + nameLines.length * 11);
        const boxW = Math.min(140, Math.max(80, doc.getTextWidth(nameLines[0] || "") + 12));
        const bx = W - M - boxW;
        doc.setDrawColor(203, 213, 225);
        doc.setLineWidth(0.8);
        doc.setFillColor(255, 255, 255);
        doc.roundedRect(bx, tagY, boxW, boxH, 2, 2, "S");
        doc.setTextColor(NAVY[0], NAVY[1], NAVY[2]);
        doc.text(nameLines, bx + 6, tagY + 13);
        doc.setLineWidth(0.6);
      }
      doc.setTextColor(NAVY[0], NAVY[1], NAVY[2]);
      doc.setFont("helvetica", "bold"); doc.setFontSize(16);
      doc.text("Report Preparation & Authorisation", M, y + 24);
      doc.setFillColor(NAVY[0], NAVY[1], NAVY[2]);
      doc.rect(M, y + 30, 46, 2.5, "F");
      y += 56;
      doc.setFont("helvetica", "normal"); doc.setFontSize(9); doc.setTextColor(INK[0], INK[1], INK[2]);
      const paras = [
        "This report was prepared by " + (sign.preparer || "Neill Data") + " (technician " + (ins.techName || "—") + ") on behalf of " + (c.name || "—") + ", REC " + (c.rec || "—") + ".",
        "The inspection was carried out under the supervision and authority of " + (c.electrician || ins.supName || "—") + ", licence " + (c.licence || ins.supLic || "—") + ", who is responsible for compliance of any electrical work.",
        "Neill Data compiles and formats the report and does not perform or certify electrical work. " + (sign.preparer || "Neill Data") + " provides inspection recording and reporting services only and does not hold an electrical contractor registration. Any repairs must be carried out by a licensed electrician employed by a Registered Electrical Contractor.",
        "The scope and limitations are as stated in this report. The report reflects conditions observed on the inspection date only."
      ];
      paras.forEach(function (p) {
        const ls = doc.splitTextToSize(p, CW);
        need(ls.length * 12 + 8);
        doc.text(ls, M, y + 10);
        y += ls.length * 12 + 6;
      });
      y += 10;
      const colW = CW / 3;
      const heads = ["PREPARED BY", "INSPECTED BY", "AUTHORISED (CONTRACTOR)"];
      const sigs = [null, sign.signature, sign.elecSignature];
      need(90);
      heads.forEach(function (h, i) {
        const x = M + i * colW;
        doc.setFont("helvetica", "bold"); doc.setFontSize(7.5); doc.setTextColor(MUTED[0], MUTED[1], MUTED[2]);
        doc.text(h, x, y);
        if (i === 0) {
          doc.setFont("helvetica", "bold"); doc.setFontSize(9); doc.setTextColor(NAVY[0], NAVY[1], NAVY[2]);
          doc.text("Neill Data, report preparation", x, y + 16);
        } else if (sigs[i]) fitImage(sigs[i], x, y + 8, 90, 26);
        doc.setDrawColor(51, 65, 85); doc.setLineWidth(0.7);
        doc.line(x, y + 36, x + colW - 16, y + 36);
        doc.setFont("helvetica", "bold"); doc.setFontSize(9); doc.setTextColor(INK[0], INK[1], INK[2]);
        if (i === 1) doc.text(sign.printedName || ins.techName || "—", x, y + 50);
        if (i === 2) doc.text(c.electrician || "—", x, y + 50);
        doc.setFont("helvetica", "normal"); doc.setFontSize(8); doc.setTextColor(MUTED[0], MUTED[1], MUTED[2]);
        if (i === 1) doc.text(ins.techPhone || "", x, y + 62);
        if (i === 2) doc.text("REC " + (c.rec || "—") + "  Lic " + (c.licence || "—"), x, y + 62);
        doc.text("Date: " + L().fmtDate(sign.date), x, y + (i === 0 ? 50 : 74));
      });
      y += 96;
      doc.setFontSize(8);
      const integ = "Report " + (state.reportNo || "") + "  ·  Each page carries the report number and page count.";
      need(16);
      doc.text(integ, M, y);
    }

    const pages = doc.getNumberOfPages();
    const onBehalf = !!(sign.onBehalf && (sign.contractor || {}).name);
    for (let i = 1; i <= pages; i++) {
      doc.setPage(i);
      doc.setDrawColor(RULE[0], RULE[1], RULE[2]);
      doc.setLineWidth(0.6);
      doc.line(M, H - 34, W - M, H - 34);
      doc.setFont("helvetica", "normal"); doc.setFontSize(7.5); doc.setTextColor(100, 116, 139);
      const left = onBehalf
        ? "Prepared by " + (sign.preparer || "Neill Data") + " on behalf of " + sign.contractor.name
        : "Neill Data · Neill Inspect";
      doc.text(left, M, H - 20);
      doc.text("Report " + (state.reportNo || ""), W / 2, H - 20, { align: "center" });
      doc.text("Page " + i + " of " + pages, W - M, H - 20, { align: "right" });
    }
    doc.setProperties({ title: L().TITLE, subject: state.reportNo || "", creator: "Neill Inspect" });
    return doc;
  }

  root.NIPdf = { build: build };
})(typeof window !== "undefined" ? window : globalThis);
