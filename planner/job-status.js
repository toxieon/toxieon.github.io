/* Per-job status for Neill Planner.
 * Pure helpers (no Drive calls, no DOM): read the "Plans status" sheet, fall back to the Floor Plans
 * folder, read a thermostat tracker, and fold those with the photo tree into per-level, per-apartment rows.
 * Works in the page (window.NDJobStatus, needs NDPhotoFolders loaded first) and in Node tests. */
(function (root) {
  "use strict";

  const PF = (typeof module !== "undefined" && module.exports) ? require("./photo-folders.js") : root.NDPhotoFolders;

  function text(value) { return String(value == null ? "" : value).trim(); }
  function low(value) { return text(value).toLowerCase().replace(/[_-]+/g, " ").replace(/\s+/g, " "); }

  /* Level and apartment from a code or name; a bare code such as "1.01" carries its level. */
  function identify(levelCell, aptCell) {
    const apt = PF.apartmentFromName(aptCell);
    let level = levelCell ? PF.levelFromName(levelCell) : null;
    if (!level && apt && apt.levelKey != null) level = PF.levelByKey(apt.levelKey);
    return { apt: apt, level: level };
  }

  function findColumn(header, patterns) {
    for (let p = 0; p < patterns.length; p++) {
      const i = header.findIndex((cell) => patterns[p].test(low(cell)));
      if (i >= 0) return i;
    }
    return -1;
  }

  function headerRowIndex(rows, needles) {
    for (let i = 0; i < Math.min((rows || []).length, 8); i++) {
      const row = (rows[i] || []).map(low);
      if (row.some((cell) => needles.some((re) => re.test(cell)))) return i;
    }
    return -1;
  }

  /* "Plans status" sheet rows: a level and/or apartment column, a plan column, optional link and stage.
   * A plan cell that says missing (or is empty with the column present) is MISSING, anything else is present. */
  function parsePlansStatus(rows) {
    const h = headerRowIndex(rows, [/^(level|floor|apt|apartment|unit)\b/]);
    if (h < 0) return [];
    const header = rows[h].map(low);
    const cLevel = findColumn(header, [/^level$/, /^floor$/, /^level\b/, /^floor\b/]);
    const cApt = findColumn(header, [/^(apt|apartment|unit)$/, /^(apt|apartment|unit)\b/]);
    const cPlan = findColumn(header, [/^plan( status)?$/, /^plan\b/, /\bplan\b/, /^status$/]);
    const cLink = findColumn(header, [/link|url/]);
    const cStage = findColumn(header, [/^stage$/, /stage/]);
    if (cApt < 0 && cLevel < 0) return [];
    const out = [];
    const seen = new Set();
    let lastLevel = "";
    rows.slice(h + 1).forEach((row) => {
      const levelCell = cLevel >= 0 ? text(row[cLevel]) : "";
      if (levelCell) lastLevel = levelCell;
      const aptCell = cApt >= 0 ? text(row[cApt]) : "";
      const planCell = cPlan >= 0 ? text(row[cPlan]) : "";
      const link = cLink >= 0 ? text(row[cLink]) : (/^https?:\/\//i.test(planCell) ? planCell : "");
      const stage = cStage >= 0 ? PF.normalizeStage(row[cStage]) : "";
      if (!aptCell && !levelCell) return;
      const ids = identify(aptCell ? (levelCell || lastLevel) : levelCell, aptCell);
      if (!ids.level) return;
      const present = planCell ? !/(missing|none|no plan|^no$|^n$|^x$|\bnot\b)/i.test(planCell) : !!link;
      const key = ids.level.key + "|" + (ids.apt ? ids.apt.key : "");
      if (seen.has(key)) return;
      seen.add(key);
      out.push({ levelKey: ids.level.key, aptKey: ids.apt ? ids.apt.key : "", label: ids.apt ? ids.apt.label : ids.level.driveName, plan: present ? "present" : "missing", link: link, stage: stage });
    });
    return out;
  }

  /* Floor Plans folder fallback. A file or subfolder named after an apartment code covers that apartment;
   * one named after a level ("Level 2") covers every apartment on that level. */
  function plansFromFiles(files, apartments) {
    const names = (files || []).filter((f) => f && f.name).map((f) => ({ stem: text(f.name).replace(/\.[A-Za-z0-9]{2,5}$/, ""), link: f.webViewLink || "" }));
    const levelCovered = new Map();
    const aptCovered = new Map();
    names.forEach((item) => {
      const lvl = PF.levelFromName(item.stem);
      if (lvl && !levelCovered.has(lvl.key)) levelCovered.set(lvl.key, item.link);
      (apartments || []).forEach((apt) => {
        const re = new RegExp("(^|[^a-z0-9])" + apt.label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "([^a-z0-9]|$)", "i");
        if (re.test(item.stem) && !aptCovered.has(apt.levelKey + "|" + apt.key)) aptCovered.set(apt.levelKey + "|" + apt.key, item.link);
      });
    });
    return (apartments || []).map((apt) => {
      const k = apt.levelKey + "|" + apt.key;
      const link = aptCovered.has(k) ? aptCovered.get(k) : levelCovered.get(apt.levelKey);
      const present = aptCovered.has(k) || levelCovered.has(apt.levelKey);
      return { levelKey: apt.levelKey, aptKey: apt.key, label: apt.label, plan: present ? "present" : "missing", link: present ? (link || "") : "", stage: "" };
    });
  }

  /* Tracker discovery inside Excel Files: name contains thermostat (or t-stat / stat tracker). Sheets first. */
  function findThermostatTracker(files) {
    const hit = (f) => f && !PF.isFolder(f) && /thermostat|t[\s_-]?stat\b|stat(s)?[\s_-]*tracker/i.test(f.name || "");
    const list = (files || []).filter(hit);
    const rank = (f) => (/google-apps\.spreadsheet/.test(f.mimeType || "") ? 0 : /spreadsheetml|ms-excel|\.xlsx?$/i.test((f.mimeType || "") + (f.name || "")) ? 1 : 2);
    list.sort((a, b) => rank(a) - rank(b));
    const best = list[0];
    return best && rank(best) < 2 ? best : null;
  }

  const DONE = /^(done|complete|completed|installed|yes|y|true|ok|tick|x|✓|✔|1|finished|fitted|commissioned)$/i;

  /* Tracker rows -> per apartment { done, total }. Columns headed "thermostat" are the items (one per
   * thermostat); without any, columns headed status/done/installed/complete are used.
   * An apartment with no recognised level in its code is matched by code alone. */
  function parseThermostatTracker(rows) {
    const h = headerRowIndex(rows, [/^(apt|apartment|unit|lot)\b/, /^(apt|apartment|unit|lot)$/]);
    if (h < 0) return { apartments: [], found: false };
    const header = rows[h].map(low);
    const cApt = findColumn(header, [/^(apt|apartment|unit|lot)$/, /^(apt|apartment|unit|lot)\b/]);
    const cLevel = findColumn(header, [/^level$/, /^floor$/]);
    let items = header.map((cell, i) => (/thermostat|t stat|tstat/.test(cell) ? i : -1)).filter((i) => i >= 0 && i !== cApt);
    if (!items.length) items = header.map((cell, i) => (/^(status|done|installed|complete|completed|progress)$/.test(cell) ? i : -1)).filter((i) => i >= 0);
    if (!items.length) return { apartments: [], found: false };
    const out = [];
    const seen = new Set();
    rows.slice(h + 1).forEach((row) => {
      const apt = PF.apartmentFromName(row[cApt]);
      if (!apt) return;
      const lvl = identify(cLevel >= 0 ? row[cLevel] : "", row[cApt]).level;
      const levelKey = lvl ? lvl.key : "";
      const k = levelKey + "|" + apt.key;
      if (seen.has(k)) return;
      seen.add(k);
      const done = items.filter((i) => DONE.test(text(row[i]))).length;
      out.push({ levelKey: levelKey, aptKey: apt.key, label: apt.label, done: done, total: items.length });
    });
    return { apartments: out, found: true };
  }

  /* Apartment-level counts by stage from a photo tree (levels[].apartments[].photos[].stage).
   * overrides maps a Drive file id to a manual stage, as for the tray progress line. */
  function photoCounts(tree, overrides) {
    const out = [];
    ((tree && tree.levels) || []).forEach((level) => {
      const lvl = level.levelKey != null && level.levelKey !== "" ? PF.levelByKey(level.levelKey) : PF.levelFromName(level.name);
      (level.apartments || []).forEach((apt) => {
        const parsed = PF.apartmentFromName(apt.name || "");
        if (!parsed || !lvl) return;
        const counts = { "rough-in": 0, "fit-off": 0, unsorted: 0 };
        (apt.photos || []).forEach((photo) => {
          const manual = (overrides && (overrides[photo.id] || overrides[photo.driveFileId])) || "";
          counts[PF.effectiveStage({ nodeStage: manual, folderStage: photo.stage || "" })]++;
        });
        out.push({ levelKey: lvl.key, levelName: lvl.driveName, order: lvl.order, aptKey: parsed.key, label: parsed.label, counts: counts, folderId: apt.folderId || "" });
      });
    });
    return out;
  }

  function stageOf(counts) {
    if (counts["fit-off"] > 0) return "fit-off";
    if (counts["rough-in"] > 0) return "rough-in";
    return counts.unsorted > 0 ? "unsorted" : "";
  }

  /* One row per apartment seen anywhere (photo folders, Plans status, tracker, Floor Plans), grouped by level.
   * plans: [{levelKey, aptKey, plan, link, stage}] ; thermostat: {apartments:[...], found} or null. */
  function buildJobStatus(input) {
    const src = input || {};
    const rows = new Map();
    const ensure = (levelKey, aptKey, label, order, levelName) => {
      const k = levelKey + "|" + aptKey;
      if (!rows.has(k)) {
        const lvl = PF.levelByKey(levelKey);
        rows.set(k, { levelKey: levelKey, levelName: levelName || (lvl ? lvl.driveName : "Level " + levelKey), order: order != null ? order : (lvl ? lvl.order : 999), aptKey: aptKey, label: label, plan: "unknown", planLink: "", counts: { "rough-in": 0, "fit-off": 0, unsorted: 0 }, stage: "", thermostat: null });
      }
      return rows.get(k);
    };
    photoCounts(src.tree, src.overrides).forEach((p) => {
      const r = ensure(p.levelKey, p.aptKey, p.label, p.order, p.levelName);
      r.counts = p.counts;
    });
    const hasPlanData = !!(src.plans && src.plans.length);
    (src.plans || []).forEach((p) => {
      if (!p.aptKey) return;
      const lvl = PF.levelByKey(p.levelKey);
      const r = ensure(p.levelKey, p.aptKey, p.label, lvl ? lvl.order : 999, lvl ? lvl.driveName : "");
      r.plan = p.plan;
      r.planLink = p.link || "";
      r.sheetStage = p.stage || "";
    });
    const tracker = src.thermostat && src.thermostat.found ? src.thermostat : null;
    if (tracker) {
      tracker.apartments.forEach((t) => {
        let r = t.levelKey ? rows.get(t.levelKey + "|" + t.aptKey) : null;
        if (!r) r = [...rows.values()].find((x) => x.aptKey === t.aptKey);
        if (!r && t.levelKey) r = ensure(t.levelKey, t.aptKey, t.label, null, "");
        if (r) r.thermostat = { done: t.done, total: t.total };
      });
    }
    const list = [...rows.values()];
    list.forEach((r) => { r.stage = stageOf(r.counts) || r.sheetStage || ""; });
    const levels = [];
    const byLevel = new Map();
    list.sort((a, b) => a.order - b.order || String(a.label).localeCompare(String(b.label), undefined, { numeric: true }));
    list.forEach((r) => {
      if (!byLevel.has(r.levelKey)) {
        const lvl = { levelKey: r.levelKey, name: r.levelName, order: r.order, apartments: [], plansPresent: 0, plansMissing: 0, counts: { "rough-in": 0, "fit-off": 0, unsorted: 0 }, thermoDone: 0, thermoTotal: 0 };
        byLevel.set(r.levelKey, lvl);
        levels.push(lvl);
      }
      const lvl = byLevel.get(r.levelKey);
      lvl.apartments.push(r);
      if (r.plan === "present") lvl.plansPresent++;
      if (r.plan === "missing") lvl.plansMissing++;
      Object.keys(r.counts).forEach((k) => { lvl.counts[k] += r.counts[k]; });
      if (r.thermostat) { lvl.thermoDone += r.thermostat.done; lvl.thermoTotal += r.thermostat.total; }
    });
    const totals = { apartments: list.length, plansPresent: 0, plansMissing: 0, counts: { "rough-in": 0, "fit-off": 0, unsorted: 0 }, aptsRough: 0, aptsFit: 0, thermoDone: 0, thermoTotal: 0, thermoApts: 0 };
    levels.forEach((l) => {
      totals.plansPresent += l.plansPresent;
      totals.plansMissing += l.plansMissing;
      totals.thermoDone += l.thermoDone;
      totals.thermoTotal += l.thermoTotal;
      Object.keys(l.counts).forEach((k) => { totals.counts[k] += l.counts[k]; });
    });
    list.forEach((r) => {
      if (r.counts["rough-in"] > 0) totals.aptsRough++;
      if (r.counts["fit-off"] > 0) totals.aptsFit++;
      if (r.thermostat) totals.thermoApts++;
    });
    return { levels: levels, totals: totals, hasPlanData: hasPlanData, hasThermostat: !!tracker };
  }

  const API = {
    parsePlansStatus: parsePlansStatus,
    plansFromFiles: plansFromFiles,
    findThermostatTracker: findThermostatTracker,
    parseThermostatTracker: parseThermostatTracker,
    photoCounts: photoCounts,
    buildJobStatus: buildJobStatus
  };

  if (typeof module !== "undefined" && module.exports) module.exports = API;
  root.NDJobStatus = API;
})(typeof window !== "undefined" ? window : globalThis);
