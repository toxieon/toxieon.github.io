/* =========================================================================
 *  sync-fill.js — the "bubble fills up" sync indicator  (reusable asset)
 *
 *  Origin: extracted and generalised from Timesheet's settings danger-fill.
 *  Purpose: turn ANY element (a button, chip, panel, text bubble) into a
 *  sync indicator whose whole body fills with water — red at the base,
 *  green when fully synced — with a gently rotating wave crest. The sibling
 *  of the water TUBE (NDUI.syncTube); use this when you want the container
 *  itself to fill rather than a small separate gauge.
 *
 *  Self-contained: injects its own CSS. No dependencies.
 *
 *  Global `NDSyncFill`:
 *
 *    NDSyncFill.apply(el, status)
 *        Wrap el's content once, then set the fill for `status`
 *        (synced | pending | flushing/syncing | failed). Safe to call
 *        repeatedly (e.g. after each re-render) — it won't double-wrap.
 *
 *    NDSyncFill.bind(el, queue)
 *        Apply now from queue.status() and update on queue.onStatus().
 *        `queue` is any nd-queue-shaped object. Returns an unbind function.
 *
 *  States: synced → full green · pending → low · flushing/syncing → bobbing
 *          · failed → near-empty red.
 * ========================================================================= */
(function (root) {
  "use strict";
  if (typeof document === "undefined") { root.NDSyncFill = { apply: function () {}, bind: function () { return function () {}; } }; return; }

  var STATE = { synced: "synced", pending: "pending", flushing: "syncing", syncing: "syncing", failed: "failed" };

  function injectStyles() {
    if (document.getElementById("nd-sfill-styles")) return;
    var css =
      ".nd-sfill{position:relative;overflow:hidden;isolation:isolate;transition:box-shadow 900ms ease}" +
      ".nd-sfill-content{position:relative;z-index:1}" +
      ".nd-sfill-water{position:absolute;left:0;right:0;bottom:0;height:14%;z-index:0;pointer-events:none;opacity:0.55;" +
        "background:linear-gradient(to top,#e0473f 0%,#e07b2a 34%,#f5c542 64%,#3ab87a 100%);" +
        "transition:height 950ms cubic-bezier(0.4,0,0.2,1)}" +
      ".nd-sfill-crest{position:absolute;left:50%;bottom:100%;width:280%;padding-bottom:280%;margin-left:-140%;" +
        "border-radius:44% 46% 43% 47%;background:rgba(255,255,255,0.08);animation:nd-sfill-spin 10s linear infinite}" +
      "@keyframes nd-sfill-spin{to{transform:rotate(360deg)}}" +
      ".nd-sfill.sfill-synced  .nd-sfill-water{height:100%}" +
      ".nd-sfill.sfill-pending .nd-sfill-water{height:44%}" +
      ".nd-sfill.sfill-failed  .nd-sfill-water{height:14%}" +
      ".nd-sfill.sfill-syncing .nd-sfill-water{animation:nd-sfill-bob 1.6s ease-in-out infinite alternate}" +
      "@keyframes nd-sfill-bob{from{height:26%}to{height:100%}}" +
      ".nd-sfill.sfill-synced{box-shadow:0 0 18px rgba(58,184,122,0.28)}" +
      ".nd-sfill.sfill-pending{box-shadow:0 0 16px rgba(224,123,42,0.24)}" +
      ".nd-sfill.sfill-failed{box-shadow:0 0 18px rgba(224,71,63,0.26)}";
    var s = document.createElement("style");
    s.id = "nd-sfill-styles"; s.textContent = css;
    document.head.appendChild(s);
  }

  function ensureWrapped(el) {
    if (el._ndSfill) return;
    el._ndSfill = true;
    el.classList.add("nd-sfill");
    var content = document.createElement("span");
    content.className = "nd-sfill-content";
    while (el.firstChild) content.appendChild(el.firstChild);
    var water = document.createElement("span");
    water.className = "nd-sfill-water";
    water.innerHTML = '<span class="nd-sfill-crest"></span>';
    el.appendChild(water);
    el.appendChild(content);
  }

  function apply(el, status) {
    if (!el) return;
    injectStyles();
    ensureWrapped(el);
    var state = STATE[status] || "synced";
    el.classList.remove("sfill-synced", "sfill-pending", "sfill-syncing", "sfill-failed");
    el.classList.add("sfill-" + state);
  }

  function bind(el, queue) {
    if (!el || !queue) return function () {};
    apply(el, queue.status ? queue.status() : "synced");
    if (typeof queue.onStatus === "function") return queue.onStatus(function (s) { apply(el, s); });
    return function () {};
  }

  var API = { apply: apply, bind: bind, STATE: STATE };
  if (typeof module !== "undefined" && module.exports) module.exports = API;
  root.NDSyncFill = API;
})(typeof window !== "undefined" ? window : globalThis);
