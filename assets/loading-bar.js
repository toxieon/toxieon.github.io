/* =========================================================================
 *  loading-bar.js — top-of-page loading indicator  (reusable asset)
 *
 *  A slim amber progress bar that rides the top edge of the screen while the
 *  app is loading or talking to Google. Distinct from Quote's full-app
 *  shimmer — this is a lightweight indeterminate sweep any app gets for free.
 *
 *  ZERO wiring: just add the <script> before your app code and it auto-shows
 *  whenever a fetch() or XMLHttpRequest is in flight (covers gapi, Drive,
 *  Sheets, apps.json, everything), then hides when the last one settles.
 *
 *  Manual control is also exposed for non-network waits (rasterising a PDF,
 *  heavy render, etc.):
 *      NDLoading.show()            — reference-counted; call hide() to match
 *      NDLoading.hide()
 *      NDLoading.during(promise)   — show while a promise runs, hide on settle
 *
 *  Self-contained: injects its own CSS + DOM. No dependencies.
 * ========================================================================= */
(function (root) {
  "use strict";
  if (root.NDLoading) return;                 // idempotent

  var count = 0;                              // in-flight operations
  var bar = null, fill = null, hideTimer = null, watchdog = null;
  var doc = root.document;

  function injectCss() {
    if (!doc || doc.getElementById("nd-loading-css")) return;
    var s = doc.createElement("style");
    s.id = "nd-loading-css";
    s.textContent =
      "#nd-loading-bar{position:fixed;top:0;left:0;right:0;height:3px;z-index:2147483000;" +
      "pointer-events:none;opacity:0;transition:opacity .25s ease;}" +
      "#nd-loading-bar.on{opacity:1;}" +
      "#nd-loading-bar .ndl-track{position:absolute;inset:0;overflow:hidden;background:rgba(224,123,42,0.14);}" +
      "#nd-loading-bar .ndl-fill{position:absolute;top:0;bottom:0;width:40%;border-radius:3px;" +
      "background:linear-gradient(90deg,transparent,var(--nd-amber,#e07b2a),var(--nd-amber-soft,#f5a05a),transparent);" +
      "box-shadow:0 0 10px rgba(224,123,42,0.6);animation:ndl-slide 1.15s cubic-bezier(.4,0,.2,1) infinite;}" +
      "@keyframes ndl-slide{0%{left:-45%;}100%{left:100%;}}" +
      "@media (prefers-reduced-motion:reduce){#nd-loading-bar .ndl-fill{animation-duration:2.2s;}}";
    (doc.head || doc.documentElement).appendChild(s);
  }

  function ensureBar() {
    if (bar || !doc) return bar;
    injectCss();
    bar = doc.createElement("div");
    bar.id = "nd-loading-bar";
    bar.setAttribute("role", "progressbar");
    bar.setAttribute("aria-hidden", "true");
    bar.innerHTML = '<div class="ndl-track"><div class="ndl-fill"></div></div>';
    fill = bar.firstChild.firstChild;
    (doc.body || doc.documentElement).appendChild(bar);
    return bar;
  }

  function render() {
    if (!ensureBar()) return;
    if (hideTimer) { clearTimeout(hideTimer); hideTimer = null; }
    if (count > 0) {
      bar.classList.add("on");
      // Safety: never let the bar stick forever if a request hangs.
      if (watchdog) clearTimeout(watchdog);
      watchdog = setTimeout(function () { count = 0; render(); }, 30000);
    } else {
      if (watchdog) { clearTimeout(watchdog); watchdog = null; }
      hideTimer = setTimeout(function () { if (bar) bar.classList.remove("on"); }, 220);
    }
  }

  function show() { count++; try { render(); } catch (e) {} }
  function hide() { count = Math.max(0, count - 1); try { render(); } catch (e) {} }
  function during(p) {
    show();
    var done = function () { hide(); };
    if (p && typeof p.then === "function") p.then(done, done); else done();
    return p;
  }

  /* ── auto-instrument fetch ─────────────────────────────────────────── */
  if (typeof root.fetch === "function") {
    var _fetch = root.fetch;
    root.fetch = function () {
      var settled = false, off = function () { if (!settled) { settled = true; hide(); } };
      show();
      var r;
      try { r = _fetch.apply(this, arguments); }
      catch (e) { off(); throw e; }
      if (r && typeof r.then === "function") return r.then(function (x) { off(); return x; }, function (e) { off(); throw e; });
      off();
      return r;
    };
  }

  /* ── auto-instrument XMLHttpRequest (covers gapi) ──────────────────── */
  if (typeof root.XMLHttpRequest === "function") {
    var send = root.XMLHttpRequest.prototype.send;
    root.XMLHttpRequest.prototype.send = function () {
      var self = this, settled = false, off = function () { if (!settled) { settled = true; hide(); } };
      try { show(); self.addEventListener("loadend", off); } catch (e) {}
      try { return send.apply(this, arguments); }
      catch (e) { off(); throw e; }
    };
  }

  var API = { show: show, hide: hide, during: during };
  if (typeof module !== "undefined" && module.exports) module.exports = API;
  root.NDLoading = API;
})(typeof window !== "undefined" ? window : globalThis);
