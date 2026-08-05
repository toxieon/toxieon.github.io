/* =========================================================================
 *  odometer.js — count-up numbers  (reusable asset)
 *
 *  Roll a number up (or down) to its new value instead of snapping — quote
 *  grand total, timesheet week hours, planner stats. Respects prefix/suffix
 *  and decimals, and reads the current value from the element if not given.
 *
 *  No dependencies. Global `NDOdometer`:
 *    NDOdometer.to(el, value, { from, duration, decimals, prefix, suffix, onDone })
 *    NDOdometer.count(el, from, to, opts)
 * ========================================================================= */
(function (root) {
  "use strict";
  if (root.NDOdometer) return;

  function ease(t) { return 1 - Math.pow(1 - t, 3); }        // easeOutCubic
  function fmt(v, opts) {
    var d = opts.decimals != null ? opts.decimals : 0;
    var n = Number(v).toLocaleString(undefined, { minimumFractionDigits: d, maximumFractionDigits: d });
    return (opts.prefix || "") + n + (opts.suffix || "");
  }
  var raf = root.requestAnimationFrame ? root.requestAnimationFrame.bind(root) : function (fn) { return setTimeout(function () { fn(Date.now()); }, 16); };
  var caf = root.cancelAnimationFrame ? root.cancelAnimationFrame.bind(root) : clearTimeout;

  function to(el, value, opts) {
    opts = opts || {};
    if (!el) return;
    var from = opts.from != null ? Number(opts.from) : (parseFloat(String(el.textContent).replace(/[^0-9.\-]/g, "")) || 0);
    var target = Number(value) || 0, dur = opts.duration != null ? opts.duration : 700, start = null;
    if (el._ndOdo) caf(el._ndOdo);
    if (dur <= 0) { el.textContent = fmt(target, opts); if (opts.onDone) opts.onDone(); return; }
    function step(ts) {
      if (start === null) start = ts;
      var p = Math.min(1, (ts - start) / dur);
      el.textContent = fmt(from + (target - from) * ease(p), opts);
      if (p < 1) { el._ndOdo = raf(step); }
      else { el.textContent = fmt(target, opts); el._ndOdo = null; if (opts.onDone) opts.onDone(); }
    }
    el._ndOdo = raf(step);
  }

  var API = { to: to, count: function (el, f, t, o) { o = o || {}; o.from = f; return to(el, t, o); } };
  if (typeof module !== "undefined" && module.exports) module.exports = API;
  root.NDOdometer = API;
})(typeof window !== "undefined" ? window : globalThis);
