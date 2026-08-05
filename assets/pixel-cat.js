/* =========================================================================
 *  pixel-cat.js — pixel cat whose eyes follow the cursor  (reusable asset)
 *
 *  A charming little mascot: a crisp pixel cat SVG whose pupils track the
 *  pointer (and touch). Nice for empty states, loading companions, or a bit
 *  of personality on a splash/error screen.
 *
 *  No dependencies. Global `NDCat`:
 *    NDCat.mount(el, { size }) -> { destroy }
 *    NDCat.svg() -> the SVG markup string
 * ========================================================================= */
(function (root) {
  "use strict";
  if (root.NDCat) return;
  var doc = root.document;

  function svg() {
    return '<svg viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg" style="width:100%;height:100%;shape-rendering:crispEdges;">' +
      '<rect x="5" y="4" width="4" height="4" fill="#3a2233"/><rect x="4" y="5" width="6" height="4" fill="#5a3a52"/>' +
      '<rect x="23" y="4" width="4" height="4" fill="#3a2233"/><rect x="22" y="5" width="6" height="4" fill="#5a3a52"/>' +
      '<rect x="6" y="6" width="2" height="2" fill="#ff9ecb"/><rect x="24" y="6" width="2" height="2" fill="#ff9ecb"/>' +
      '<rect x="6" y="8" width="20" height="16" fill="#6b4560"/><rect x="5" y="10" width="22" height="12" fill="#6b4560"/><rect x="7" y="9" width="18" height="14" fill="#7d5171"/>' +
      '<rect x="7" y="17" width="3" height="2" fill="#ff9ecb"/><rect x="22" y="17" width="3" height="2" fill="#ff9ecb"/>' +
      '<rect x="9" y="12" width="6" height="6" fill="#fff6fb"/><rect x="17" y="12" width="6" height="6" fill="#fff6fb"/>' +
      '<rect class="nd-cat-pl" x="11" y="14" width="3" height="3" fill="#2b0d1e"/><rect class="nd-cat-pr" x="19" y="14" width="3" height="3" fill="#2b0d1e"/>' +
      '<rect x="15" y="18" width="2" height="2" fill="#ff5fa2"/>' +
      '<rect x="13" y="20" width="2" height="1" fill="#3a2233"/><rect x="17" y="20" width="2" height="1" fill="#3a2233"/>' +
      '<rect x="2" y="15" width="4" height="1" fill="#3a2233"/><rect x="2" y="18" width="4" height="1" fill="#3a2233"/><rect x="26" y="15" width="4" height="1" fill="#3a2233"/><rect x="26" y="18" width="4" height="1" fill="#3a2233"/>' +
      '<rect x="9" y="24" width="14" height="5" fill="#6b4560"/><rect x="10" y="25" width="12" height="4" fill="#7d5171"/><rect x="11" y="28" width="3" height="2" fill="#fff6fb"/><rect x="18" y="28" width="3" height="2" fill="#fff6fb"/>' +
      "</svg>";
  }

  function mount(el, opts) {
    if (!el || !doc) return { destroy: function () {} };
    opts = opts || {};
    if (opts.size) { el.style.width = opts.size + "px"; el.style.height = opts.size + "px"; }
    el.innerHTML = svg();
    var svgEl = el.querySelector("svg");
    var eyes = [
      { el: el.querySelector(".nd-cat-pl"), cx: 12, cy: 15, w: 3 },
      { el: el.querySelector(".nd-cat-pr"), cx: 20, cy: 15, w: 3 }
    ];
    function move(cx, cy) {
      var rect = svgEl.getBoundingClientRect();
      var sx = ((cx - rect.left) / rect.width) * 32, sy = ((cy - rect.top) / rect.height) * 32;
      eyes.forEach(function (e) {
        var ang = Math.atan2(sy - e.cy, sx - e.cx), r = 1.6;
        e.el.setAttribute("x", (e.cx + Math.cos(ang) * r - e.w / 2).toFixed(2));
        e.el.setAttribute("y", (e.cy + Math.sin(ang) * r - e.w / 2).toFixed(2));
      });
    }
    function onMouse(ev) { move(ev.clientX, ev.clientY); }
    function onTouch(ev) { if (ev.touches[0]) move(ev.touches[0].clientX, ev.touches[0].clientY); }
    root.addEventListener("mousemove", onMouse);
    root.addEventListener("touchmove", onTouch, { passive: true });
    return { destroy: function () { root.removeEventListener("mousemove", onMouse); root.removeEventListener("touchmove", onTouch); el.innerHTML = ""; } };
  }

  var API = { mount: mount, svg: svg };
  if (typeof module !== "undefined" && module.exports) module.exports = API;
  root.NDCat = API;
})(typeof window !== "undefined" ? window : globalThis);
