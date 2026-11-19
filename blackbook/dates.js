(function (root, factory) {
  "use strict";
  var api = factory(root);
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.BBDates = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function (root) {
  "use strict";
  var TZ = "Australia/Melbourne";
  var JUMP_SOON_MIN = 15;
  var RING_HOURS = 6;
  function toDate(iso) {
    if (!iso) return null;
    var d = new Date(iso);
    return isNaN(d.getTime()) ? null : d;
  }
  var fmtCache = {};
  function fmt(opts) {
    var key = JSON.stringify(opts);
    if (!fmtCache[key]) fmtCache[key] = new Intl.DateTimeFormat("en-AU", Object.assign({ timeZone: TZ }, opts));
    return fmtCache[key];
  }
  function parts(date, opts) {
    var out = {};
    fmt(opts).formatToParts(date).forEach(function (p) { out[p.type] = p.value; });
    return out;
  }
  function tzName(date) {
    return parts(date || new Date(), { timeZoneName: "short" }).timeZoneName || "AEDT";
  }
  function fmtTime(date) {
    var p = parts(date, { hour: "numeric", minute: "2-digit", hour12: true });
    return p.hour + ":" + p.minute + " " + String(p.dayPeriod || "").toLowerCase();
  }
  function fmtClock(date) {
    var p = parts(date, { hour: "numeric", minute: "2-digit", hour12: true });
    return { hm: p.hour + ":" + p.minute, ap: String(p.dayPeriod || "").toUpperCase() };
  }
  function dayKey(date) {
    var p = parts(date, { year: "numeric", month: "2-digit", day: "2-digit" });
    return p.year + "-" + p.month + "-" + p.day;
  }
  function fmtDay(date) {
    var p = parts(date, { weekday: "short", day: "numeric", month: "short" });
    return p.weekday + " " + p.day + " " + p.month;
  }
  function fmtIsoDay(day) {
    // A stored YYYY-MM-DD race date. Noon UTC keeps it on the same calendar day in Melbourne.
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(day || ""))) return String(day || "");
    return fmtDay(new Date(day + "T02:00:00Z"));
  }
  function pad2(n) { return (n < 10 ? "0" : "") + n; }
  function relIn(ms) {
    var m = Math.round(Math.abs(ms) / 60000);
    var txt = m < 60 ? m + "m" : m < 1440 ? Math.floor(m / 60) + "h " + pad2(m % 60) + "m" : Math.round(m / 1440) + "d";
    return ms >= 0 ? "in " + txt : txt + " ago";
  }
  /** Countdown for a jump time. kind: ring | date | jumped. */
  function countdown(jumpMs, nowMs) {
    var diff = jumpMs - nowMs;
    if (diff <= 0) return { kind: "jumped", text: "Awaiting result", soon: false, frac: 1 };
    var soon = diff <= JUMP_SOON_MIN * 60000;
    var frac = Math.max(0, Math.min(1, 1 - diff / (RING_HOURS * 3600000)));
    if (diff < 3600000) {
      var s = Math.floor(diff / 1000);
      return { kind: "ring", text: pad2(Math.floor(s / 60)) + ":" + pad2(s % 60), soon: soon, frac: frac };
    }
    if (diff < 86400000) {
      var mins = Math.floor(diff / 60000);
      return { kind: "ring", text: Math.floor(mins / 60) + "h " + pad2(mins % 60) + "m", soon: false, frac: frac };
    }
    return { kind: "date", text: "", soon: false, frac: 0 };
  }
  return { TZ: TZ, JUMP_SOON_MIN: JUMP_SOON_MIN, RING_HOURS: RING_HOURS, toDate: toDate, fmt: fmt, parts: parts, tzName: tzName, fmtTime: fmtTime, fmtClock: fmtClock, dayKey: dayKey, fmtDay: fmtDay, fmtIsoDay: fmtIsoDay, pad2: pad2, relIn: relIn, countdown: countdown };
});
