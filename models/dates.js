/* Melbourne calendar dates for presets (no UTC-midnight drift). */
(function (root, factory) {
  "use strict";
  const api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.NDModelsDates = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const TZ = "Australia/Melbourne";

  /** YYYY-MM-DD for an instant in Australia/Melbourne. */
  function melbourneDateIso(at) {
    const d = at instanceof Date ? at : new Date(at);
    return new Intl.DateTimeFormat("en-CA", {
      timeZone: TZ,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(d);
  }

  function todayMelbourneIso(at) {
    return melbourneDateIso(at == null ? new Date() : at);
  }

  /** Add calendar days to an ISO date string (timezone-neutral Y-M-D math). */
  function addCalendarDays(iso, delta) {
    const p = String(iso || "").split("-").map(Number);
    if (p.length < 3 || !p[0]) return iso;
    const t = Date.UTC(p[0], p[1] - 1, p[2] + delta);
    const d = new Date(t);
    return (
      d.getUTCFullYear() +
      "-" +
      String(d.getUTCMonth() + 1).padStart(2, "0") +
      "-" +
      String(d.getUTCDate()).padStart(2, "0")
    );
  }

  return { melbourneDateIso, todayMelbourneIso, addCalendarDays, TZ };
});