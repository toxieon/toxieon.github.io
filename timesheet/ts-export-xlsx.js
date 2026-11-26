/* Timesheet Excel export (0.7.1).
 *
 * Column-definition arrays are the single place to remap headers or column
 * order (the accountant's exact layout can land later without rewriting
 * the row builders). Browser and Node both load this file.
 *
 * Sheets:
 *   1. Work trips — one row per leg for the cents-per-km method
 *      (Date, From, To, Purpose/Job, km, Running total). Private
 *      (per-day overridden) legs are listed with 0 work km and do not
 *      add to the running total. A grand-total row sits at the bottom.
 *   2. Weekly site summary — hours by site for each week in the range
 *      (the same weekly per-site summary the text export already uses).
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.TsXlsx = factory();
})(typeof window !== "undefined" ? window : typeof globalThis !== "undefined" ? globalThis : this, function () {
  const TRIP_COLUMNS = [
    { key: "date", header: "Date" },
    { key: "from", header: "From" },
    { key: "to", header: "To" },
    { key: "purpose", header: "Purpose/Job" },
    { key: "km", header: "km" },
    { key: "runningTotal", header: "Running total" }
  ];

  const SITE_COLUMNS = [
    { key: "weekStart", header: "Week starting" },
    { key: "weekEnd", header: "Week ending" },
    { key: "site", header: "Site" },
    { key: "hours", header: "Hours" },
    { key: "days", header: "Days" }
  ];

  function applyColumns(columns, records) {
    const header = (columns || []).map((c) => c.header);
    const body = (records || []).map((rec) => (columns || []).map((c) => {
      if (typeof c.get === "function") return c.get(rec);
      const v = rec[c.key];
      return v == null ? "" : v;
    }));
    return [header].concat(body);
  }

  function roundKm(n) {
    const x = Number(n);
    if (!Number.isFinite(x)) return 0;
    return Math.round(x * 10) / 10;
  }

  function purposeForLeg(leg) {
    if (!leg) return "";
    if (leg.purpose) return leg.purpose;
    const kind = leg.kind || "";
    const toName = (leg.to && leg.to.name) || "";
    if (kind === "home-depot") return "Travel to depot";
    if (kind === "depot-out") return toName || "Travel to job";
    if (kind === "depot-back") return "Return to depot";
    if (kind === "depot-home") return "Travel home";
    if (kind === "commute-out" || leg.commute === "out") return toName ? ("Travel to " + toName) : "Travel to job";
    if (kind === "commute-back" || leg.commute === "back") return "Travel home";
    return toName || ((leg.from && leg.from.name && toName) ? (leg.from.name + " → " + toName) : "Work travel");
  }

  function stopName(stop, fallback) {
    if (!stop) return fallback || "";
    return stop.name || fallback || "";
  }

  /**
   * Build trip rows from already-computed day travel results.
   * dayTravels: [{ iso, legs: [...] }, ...] in date order.
   * Private legs are kept with work km 0.
   * Skipped (no coords) legs are omitted.
   */
  function buildTripRecords(dayTravels) {
    const rows = [];
    let running = 0;
    (dayTravels || []).forEach((day) => {
      const iso = day && day.iso;
      (day && day.legs || []).forEach((leg) => {
        if (!leg || leg.skipped) return;
        if (leg.km == null || !Number.isFinite(Number(leg.km))) return;
        const workKm = leg.private ? 0 : roundKm(leg.km);
        running = Math.round((running + workKm) * 10) / 10;
        rows.push({
          date: iso || "",
          from: stopName(leg.from, ""),
          to: stopName(leg.to, ""),
          purpose: purposeForLeg(leg),
          km: workKm,
          runningTotal: running,
          private: !!leg.private,
          kind: leg.kind || (leg.commute ? "commute" : "job")
        });
      });
    });
    return { rows, totalWorkKm: running };
  }

  function tripSheetRows(tripRecords, totalWorkKm) {
    const data = applyColumns(TRIP_COLUMNS, tripRecords);
    const totalLabelRow = TRIP_COLUMNS.map((c) => {
      if (c.key === "purpose") return "Total work km";
      if (c.key === "km" || c.key === "runningTotal") return totalWorkKm;
      return "";
    });
    data.push(totalLabelRow);
    return data;
  }

  function siteSheetRows(siteRecords) {
    return applyColumns(SITE_COLUMNS, siteRecords);
  }

  /**
   * siteWeeks: [{ weekStart, weekEnd, sites: [{ name, hours, dayCount }] }]
   */
  function flattenSiteWeeks(siteWeeks) {
    const out = [];
    (siteWeeks || []).forEach((week) => {
      (week.sites || []).forEach((s) => {
        out.push({
          weekStart: week.weekStart,
          weekEnd: week.weekEnd,
          site: s.name,
          hours: s.hours,
          days: s.dayCount
        });
      });
    });
    return out;
  }

  function sheetsForExport(tripRecords, totalWorkKm, siteRecords) {
    return [
      { name: "Work trips", rows: tripSheetRows(tripRecords, totalWorkKm) },
      { name: "Weekly site summary", rows: siteSheetRows(siteRecords) }
    ];
  }

  function workbookArray(XLSX, sheets) {
    if (!XLSX || !XLSX.utils) throw new Error("xlsx lib missing");
    const wb = XLSX.utils.book_new();
    (sheets || []).forEach((sheet) => {
      const ws = XLSX.utils.aoa_to_sheet(sheet.rows || []);
      XLSX.utils.book_append_sheet(wb, ws, sheet.name);
    });
    return XLSX.write(wb, { bookType: "xlsx", type: "array" });
  }

  function filenameForRange(fromIso, toIso, allTime) {
    if (allTime) return "timesheet-all-time-" + (toIso || "export") + ".xlsx";
    return "timesheet-" + (fromIso || "from") + "-to-" + (toIso || "to") + ".xlsx";
  }

  return {
    TRIP_COLUMNS,
    SITE_COLUMNS,
    applyColumns,
    roundKm,
    purposeForLeg,
    buildTripRecords,
    tripSheetRows,
    siteSheetRows,
    flattenSiteWeeks,
    sheetsForExport,
    workbookArray,
    filenameForRange
  };
});
