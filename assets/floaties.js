/* =========================================================================
 *  floaties.js — rising floating particles  (reusable asset)
 *
 *  Little emoji/characters that drift up and fade — a light celebratory touch
 *  (hearts, sparks, stars, thumbs-up). Spawns inside any container and cleans
 *  itself up.
 *
 *  No dependencies. Self-injects CSS. Global `NDFloaties`:
 *    NDFloaties.rise(container, { emoji, count, minSize, maxSize, duration })
 *      container defaults to document.body. Returns nothing; nodes auto-remove.
 * ========================================================================= */
(function (root) {
  "use strict";
  if (root.NDFloaties) return;
  var doc = root.document;

  function css() {
    if (!doc || doc.getElementById("nd-floaties-css")) return;
    var s = doc.createElement("style");
    s.id = "nd-floaties-css";
    s.textContent =
      ".nd-floaty{position:absolute;bottom:-24px;pointer-events:none;user-select:none;opacity:0;will-change:transform,opacity;animation:nd-floaty-rise linear forwards;}" +
      "@keyframes nd-floaty-rise{0%{transform:translateY(0) rotate(0);opacity:0;}12%{opacity:.95;}100%{transform:translateY(-90vh) rotate(360deg);opacity:0;}}" +
      "@media(prefers-reduced-motion:reduce){.nd-floaty{animation-duration:.1s !important;opacity:0 !important;}}";
    (doc.head || doc.documentElement).appendChild(s);
  }

  function rise(container, opts) {
    if (!doc) return;
    css();
    opts = opts || {};
    container = container || doc.body;
    if (getComputedStyle(container).position === "static") container.style.position = "relative";
    var emoji = opts.emoji || "❤";           // ❤ default
    var count = opts.count || 14;
    var minS = opts.minSize || 12, maxS = opts.maxSize || 28;
    var dur = opts.duration || 6;                 // seconds (base)
    for (var i = 0; i < count; i++) {
      (function () {
        var h = doc.createElement("div");
        h.className = "nd-floaty";
        h.textContent = emoji;
        h.style.left = (Math.random() * 100) + "%";
        h.style.fontSize = (minS + Math.random() * (maxS - minS)) + "px";
        var d = dur * (0.7 + Math.random() * 0.8);
        h.style.animationDuration = d + "s";
        h.style.animationDelay = (Math.random() * (opts.stagger != null ? opts.stagger : 4)) + "s";
        container.appendChild(h);
        h.addEventListener("animationend", function () { try { container.removeChild(h); } catch (e) {} });
      })();
    }
  }

  var API = { rise: rise, css: css };
  if (typeof module !== "undefined" && module.exports) module.exports = API;
  root.NDFloaties = API;
})(typeof window !== "undefined" ? window : globalThis);
