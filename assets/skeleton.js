/* =========================================================================
 *  skeleton.js — shimmer placeholders  (reusable asset)
 *
 *  Animated placeholder blocks while data loads, so lists/grids fade in
 *  instead of popping from empty — planner project list, search photo grid,
 *  timesheet history. Returns HTML you drop into a container until the real
 *  content is ready.
 *
 *  No dependencies. Self-injects CSS. Global `NDSkeleton`:
 *    NDSkeleton.lines(n, { lastWidth })   -> HTML of n shimmer lines
 *    NDSkeleton.box(width, height, radius) -> one shimmer block
 *    NDSkeleton.grid(n, { cols, tile })    -> a shimmer tile grid
 *    NDSkeleton.into(el, html)             -> drop skeletons into an element
 * ========================================================================= */
(function (root) {
  "use strict";
  if (root.NDSkeleton) return;
  var doc = root.document;

  function css() {
    if (!doc || doc.getElementById("nd-sk-css")) return;
    var s = doc.createElement("style");
    s.id = "nd-sk-css";
    s.textContent =
      ".nd-sk{position:relative;overflow:hidden;background:rgba(255,255,255,0.06);border-radius:8px;}" +
      ".nd-sk::after{content:'';position:absolute;inset:0;transform:translateX(-100%);background:linear-gradient(90deg,transparent,rgba(255,255,255,0.09),transparent);animation:nd-sk 1.3s infinite;}" +
      ".nd-sk-line{height:12px;margin:9px 0;}" +
      ".nd-sk-grid{display:grid;gap:10px;}" +
      "@keyframes nd-sk{100%{transform:translateX(100%);}}" +
      "@media(prefers-reduced-motion:reduce){.nd-sk::after{animation:none;}}";
    (doc.head || doc.documentElement).appendChild(s);
  }

  function box(w, h, r) { css(); return '<div class="nd-sk" style="width:' + (w || "100%") + ";height:" + (h || "80px") + ";border-radius:" + (r || "8px") + '"></div>'; }
  function lines(n, opts) {
    css(); opts = opts || {}; n = n || 3;
    var out = "";
    for (var i = 0; i < n; i++) { var w = (i === n - 1) ? (opts.lastWidth || "60%") : "100%"; out += '<div class="nd-sk nd-sk-line" style="width:' + w + '"></div>'; }
    return out;
  }
  function grid(n, opts) {
    css(); opts = opts || {}; n = n || 6;
    var cols = opts.cols || 3, tileH = opts.tile || "96px";
    var cells = "";
    for (var i = 0; i < n; i++) cells += '<div class="nd-sk" style="height:' + tileH + '"></div>';
    return '<div class="nd-sk-grid" style="grid-template-columns:repeat(' + cols + ',1fr)">' + cells + "</div>";
  }
  function into(el, html) { if (!el) return; css(); el.innerHTML = html; }

  var API = { css: css, box: box, lines: lines, grid: grid, into: into };
  if (typeof module !== "undefined" && module.exports) module.exports = API;
  root.NDSkeleton = API;
})(typeof window !== "undefined" ? window : globalThis);
