/* =========================================================================
 *  confirm-pop.js — animated success tick  (reusable asset)
 *
 *  A self-drawing checkmark with a ring + halo pop, for "done!" moments —
 *  photo uploaded, clocked on, quote saved, node placed. Auto-dismisses.
 *
 *  No dependencies. Self-injects CSS. Global `NDConfirmPop`:
 *    NDConfirmPop.show({ label, color, size, duration, onDone }) -> Promise
 *    NDConfirmPop.tick(...)  (alias)
 * ========================================================================= */
(function (root) {
  "use strict";
  if (root.NDConfirmPop) return;
  var doc = root.document;

  function css() {
    if (!doc || doc.getElementById("nd-pop-css")) return;
    var s = doc.createElement("style");
    s.id = "nd-pop-css";
    s.textContent =
      ".nd-pop-back{position:fixed;inset:0;z-index:2147482600;display:flex;align-items:center;justify-content:center;pointer-events:none;}" +
      ".nd-pop{display:flex;flex-direction:column;align-items:center;gap:12px;animation:nd-pop-in .28s cubic-bezier(.2,.8,.2,1);}" +
      ".nd-pop-ring{stroke-dasharray:157;stroke-dashoffset:157;animation:nd-pop-ring .5s ease-out forwards;}" +
      ".nd-pop-check{stroke-dasharray:48;stroke-dashoffset:48;animation:nd-pop-check .35s .34s ease-out forwards;}" +
      ".nd-pop-halo{transform-origin:center;animation:nd-pop-halo .6s ease-out forwards;}" +
      ".nd-pop-label{color:var(--nd-text,#f0f0f0);font-family:var(--nd-sans,system-ui,sans-serif);font-weight:700;font-size:15px;}" +
      "@keyframes nd-pop-in{from{transform:scale(.7);opacity:0;}}" +
      "@keyframes nd-pop-ring{to{stroke-dashoffset:0;}}" +
      "@keyframes nd-pop-check{to{stroke-dashoffset:0;}}" +
      "@keyframes nd-pop-halo{0%{opacity:.5;transform:scale(.6);}100%{opacity:0;transform:scale(1.5);}}" +
      "@keyframes nd-pop-out{to{opacity:0;transform:scale(.92);}}";
    (doc.head || doc.documentElement).appendChild(s);
  }
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]; }); }

  function show(opts) {
    opts = opts || {};
    if (!doc) return Promise.resolve();
    css();
    var color = (opts.color || "").trim() || "#3ab87a";
    var size = opts.size || 96, dur = opts.duration || 1100;
    var back = doc.createElement("div");
    back.className = "nd-pop-back";
    back.innerHTML = '<div class="nd-pop"><svg width="' + size + '" height="' + size + '" viewBox="0 0 60 60" aria-hidden="true">' +
      '<circle class="nd-pop-halo" cx="30" cy="30" r="26" fill="' + color + '" opacity=".5"/>' +
      '<circle class="nd-pop-ring" cx="30" cy="30" r="25" fill="none" stroke="' + color + '" stroke-width="4"/>' +
      '<path class="nd-pop-check" d="M18 31l8 8 16-18" fill="none" stroke="' + color + '" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/>' +
      "</svg>" + (opts.label ? '<div class="nd-pop-label">' + esc(opts.label) + "</div>" : "") + "</div>";
    (doc.body || doc.documentElement).appendChild(back);
    return new Promise(function (res) {
      setTimeout(function () {
        var p = back.firstChild; if (p) p.style.animation = "nd-pop-out .3s ease forwards";
        setTimeout(function () { try { doc.body.removeChild(back); } catch (e) {} if (opts.onDone) opts.onDone(); res(); }, 300);
      }, dur);
    });
  }

  var API = { show: show, tick: show };
  if (typeof module !== "undefined" && module.exports) module.exports = API;
  root.NDConfirmPop = API;
})(typeof window !== "undefined" ? window : globalThis);
