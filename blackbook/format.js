(function (root, factory) {
  "use strict";
  var api = factory(root);
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.BBFormat = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function (root) {
  "use strict";
  var DISCLAIMER = "Model estimate. Not betting advice.";
  var HELPLINE = "Gambling help (AU): 1800 858 858";
  var PRIO = {
    low: { label: "Low", bars: 1, desc: "Results only. Scratchings and results, no pings." },
    med: { label: "Med", bars: 2, desc: "Key alerts in the app. Never posts in a channel." },
    high: { label: "High", bars: 3, desc: "Top of the book. Every alert, and a Discord DM." }
  };
  // Designed per-tier alert defaults (Ray, 18 Nov). Shown for reference; this page sends no alerts.
  var TIER_DEFAULTS = [
    ["Entered", "", "on", "on"],
    ["Price move", "", "±15%", "±10%"],
    ["Scratched", "on", "on", "on"],
    ["Jump soon", "", "", "15 min"],
    ["Result", "on", "on", "on"],
    ["Discord DM", "", "", "on"]
  ];

  function esc(value) {
    return String(value == null ? "" : value).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function fmtPrice(n) {
    var v = typeof n === "number" ? n : parseFloat(n);
    if (!isFinite(v) || v <= 0) return "";
    return "$" + v.toFixed(2);
  }
  function ordinal(n) {
    var v = n % 100;
    if (v >= 11 && v <= 13) return n + "th";
    return n + ({ 1: "st", 2: "nd", 3: "rd" }[n % 10] || "th");
  }
  function initials(name) {
    var parts = String(name || "").replace(/\([^)]*\)/g, " ").trim().split(/\s+/).filter(Boolean);
    if (!parts.length) return "?";
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase();
  }
  function resultText(run) {
    if (!run || !run.position) return "";
    return ordinal(run.position) + (run.field_size ? " of " + run.field_size : "");
  }
  function resultClass(run) {
    if (!run || !run.position) return "";
    return run.position === 1 ? "won" : run.position <= 3 ? "placed" : "";
  }
  function isComingSoon(obj) { return !obj || obj.status === "coming_soon"; }
  function prioOf(entry) { return PRIO[entry && entry.priority] ? entry.priority : "low"; }
  function priceInput(value) {
    var text = String(value == null ? "" : value).trim().replace(/^\$/, "");
    if (!text) return { ok: true, value: null };
    var n = parseFloat(text);
    if (!/^\d+(\.\d{1,2})?$/.test(text) || !isFinite(n) || n < 1.01 || n > 1001) return { ok: false, value: null };
    return { ok: true, value: Math.round(n * 100) / 100 };
  }
  function highlight(name, q) {
    var text = String(name || "");
    var needle = String(q || "").trim();
    if (!needle) return esc(text);
    var i = text.toLowerCase().indexOf(needle.toLowerCase());
    if (i < 0) return esc(text);
    return esc(text.slice(0, i)) + "<mark>" + esc(text.slice(i, i + needle.length)) + "</mark>" + esc(text.slice(i + needle.length));
  }

  return { esc: esc, fmtPrice: fmtPrice, ordinal: ordinal, initials: initials, resultText: resultText, resultClass: resultClass, isComingSoon: isComingSoon, prioOf: prioOf, priceInput: priceInput, highlight: highlight, PRIO: PRIO, TIER_DEFAULTS: TIER_DEFAULTS, DISCLAIMER: DISCLAIMER, HELPLINE: HELPLINE };
});
