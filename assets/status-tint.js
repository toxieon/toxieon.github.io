/* =========================================================================
 *  status-tint.js — tint a card by a value vs a target  (reusable asset)
 *
 *  The "how am I doing" colour: compare a number to a target and tint a whole
 *  container — red under, gold over, green bang on. Same idea as SWB's circuit
 *  overload card and the Timesheet interactive-times day cards.
 *
 *  No dependencies. Self-injects its CSS. Exposes a global `NDStatusTint`:
 *
 *    NDStatusTint.classify(value, target, opts) -> "under" | "exact" | "over"
 *        opts.epsilon (default 0.01) — how close counts as "exact".
 *
 *    NDStatusTint.classNames(value, target, opts) -> "nd-tint nd-over …"
 *        Ready-to-drop class string for template rendering.
 *        opts.lowVis -> also colours all text in the box to match.
 *
 *    NDStatusTint.apply(el, value, target, opts)
 *        Set the classes on a live element (clears any previous tint first).
 *
 *    NDStatusTint.clear(el)
 *
 *  Meaning is fixed (under=bad/red, over=good/gold, exact=green) because that's
 *  the shared language across the suite. Add class "nd-tint" + a status class
 *  to any element with a full border and it tints.
 * ========================================================================= */
(function (root) {
  "use strict";
  if (root.NDStatusTint) return;
  var doc = root.document;

  function ensureStyles() {
    if (!doc || doc.getElementById("nd-tint-css")) return;
    var s = doc.createElement("style");
    s.id = "nd-tint-css";
    s.textContent =
      ".nd-tint.nd-under{border-color:#e5484d !important;background:rgba(229,72,77,0.07);box-shadow:0 0 0 1px rgba(229,72,77,0.28),0 0 18px rgba(229,72,77,0.12);}" +
      ".nd-tint.nd-over{border-color:#e3b341 !important;background:rgba(227,179,65,0.07);box-shadow:0 0 0 1px rgba(227,179,65,0.30),0 0 18px rgba(227,179,65,0.14);}" +
      ".nd-tint.nd-exact{border-color:#3ab87a !important;background:rgba(58,184,122,0.06);box-shadow:0 0 0 1px rgba(58,184,122,0.22);}" +
      ".nd-tint.nd-lowvis.nd-under,.nd-tint.nd-lowvis.nd-under *{color:#e5484d !important;}" +
      ".nd-tint.nd-lowvis.nd-over,.nd-tint.nd-lowvis.nd-over *{color:#e3b341 !important;}" +
      ".nd-tint.nd-lowvis.nd-exact,.nd-tint.nd-lowvis.nd-exact *{color:#3ab87a !important;}";
    (doc.head || doc.documentElement).appendChild(s);
  }
  if (doc) ensureStyles();

  function classify(value, target, opts) {
    opts = opts || {};
    var eps = opts.epsilon == null ? 0.01 : opts.epsilon;
    var v = Number(value), t = Number(target);
    if (v > t + eps) return "over";
    if (v < t - eps) return "under";
    return "exact";
  }
  function classNames(value, target, opts) {
    opts = opts || {};
    ensureStyles();
    return "nd-tint nd-" + classify(value, target, opts) + (opts.lowVis ? " nd-lowvis" : "");
  }
  function clear(el) {
    if (!el) return;
    el.classList.remove("nd-tint", "nd-under", "nd-over", "nd-exact", "nd-lowvis");
  }
  function apply(el, value, target, opts) {
    if (!el) return;
    ensureStyles();
    clear(el);
    el.classList.add("nd-tint", "nd-" + classify(value, target, opts));
    if (opts && opts.lowVis) el.classList.add("nd-lowvis");
  }

  var API = { classify: classify, classNames: classNames, apply: apply, clear: clear };
  if (typeof module !== "undefined" && module.exports) module.exports = API;
  root.NDStatusTint = API;
})(typeof window !== "undefined" ? window : globalThis);
