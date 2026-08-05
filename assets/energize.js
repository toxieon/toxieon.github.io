/* =========================================================================
 *  energize.js — "powering up" pulse  (reusable asset)
 *
 *  An on-brand electrical pulse: a glow ring bursts out of an element when a
 *  device/node goes live — planner node status, fit-off markers, a connection
 *  going online. On-brand for security/electrical work.
 *
 *  No dependencies. Self-injects CSS. Global `NDEnergize`:
 *    NDEnergize.pulse(el, { color, persist })   -> one-shot burst
 *    (persist keeps a steady glow on the element afterwards)
 * ========================================================================= */
(function (root) {
  "use strict";
  if (root.NDEnergize) return;
  var doc = root.document;

  function css() {
    if (!doc || doc.getElementById("nd-energize-css")) return;
    var s = doc.createElement("style");
    s.id = "nd-energize-css";
    s.textContent =
      ".nd-energize{position:relative;}" +
      ".nd-energize::after{content:'';position:absolute;left:50%;top:50%;width:100%;height:100%;border-radius:50%;border:2px solid var(--nd-energize-c,var(--nd-amber,#e07b2a));transform:translate(-50%,-50%) scale(.5);opacity:.85;pointer-events:none;animation:nd-energize-ring .72s ease-out;}" +
      ".nd-energize-on{box-shadow:0 0 12px 2px var(--nd-energize-c,var(--nd-amber,#e07b2a));}" +
      "@keyframes nd-energize-ring{0%{transform:translate(-50%,-50%) scale(.5);opacity:.85;}100%{transform:translate(-50%,-50%) scale(2.7);opacity:0;}}" +
      "@media(prefers-reduced-motion:reduce){.nd-energize::after{animation:none;opacity:0;}}";
    (doc.head || doc.documentElement).appendChild(s);
  }

  function pulse(el, opts) {
    if (!el) return;
    css(); opts = opts || {};
    if (opts.color) el.style.setProperty("--nd-energize-c", opts.color);
    el.classList.remove("nd-energize");
    void el.offsetWidth;                       // restart the animation
    el.classList.add("nd-energize");
    if (opts.persist) el.classList.add("nd-energize-on");
    setTimeout(function () { el.classList.remove("nd-energize"); }, 760);
  }

  var API = { css: css, pulse: pulse };
  if (typeof module !== "undefined" && module.exports) module.exports = API;
  root.NDEnergize = API;
})(typeof window !== "undefined" ? window : globalThis);
