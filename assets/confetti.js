/* =========================================================================
 *  confetti.js — celebration confetti burst  (reusable asset)
 *
 *  A full-screen confetti rain for wins — quote accepted, milestone hit, a
 *  fun "yes". Creates its own canvas, runs for a set duration, cleans up.
 *
 *  No dependencies. Global `NDConfetti`:
 *    NDConfetti.burst({ duration, count, colors }) -> stop()
 *    NDConfetti.start(opts) / NDConfetti.stop()
 * ========================================================================= */
(function (root) {
  "use strict";
  if (root.NDConfetti) return;
  var doc = root.document;
  var DEFAULT_COLORS = ["#e07b2a", "#f5a05a", "#3ab87a", "#ffffff", "#e3b341", "#5b9ce6"];

  var canvas = null, ctx = null, parts = [], raf = null;

  function ensureCanvas() {
    if (canvas) return canvas;
    canvas = doc.createElement("canvas");
    canvas.style.cssText = "position:fixed;inset:0;z-index:2147482400;pointer-events:none;";
    (doc.body || doc.documentElement).appendChild(canvas);
    ctx = canvas.getContext("2d");
    return canvas;
  }
  function size() { canvas.width = root.innerWidth; canvas.height = root.innerHeight; }

  function start(opts) {
    opts = opts || {};
    if (!doc) return function () {};
    ensureCanvas(); size();
    var colors = opts.colors || DEFAULT_COLORS, n = opts.count || 180;
    parts = [];
    for (var i = 0; i < n; i++) parts.push({
      x: Math.random() * canvas.width, y: Math.random() * -canvas.height,
      s: 6 + Math.random() * 8, vy: 2 + Math.random() * 4, vx: -2 + Math.random() * 4,
      c: colors[Math.floor(Math.random() * colors.length)], rot: Math.random() * Math.PI, vr: -0.2 + Math.random() * 0.4
    });
    if (!raf) loop();
    return stop;
  }
  function loop() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    for (var i = 0; i < parts.length; i++) {
      var p = parts[i];
      p.x += p.vx; p.y += p.vy; p.rot += p.vr;
      if (p.y > canvas.height + 20) { p.y = -20; p.x = Math.random() * canvas.width; }
      ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot); ctx.fillStyle = p.c; ctx.fillRect(-p.s / 2, -p.s / 2, p.s, p.s); ctx.restore();
    }
    raf = root.requestAnimationFrame(loop);
  }
  function stop() {
    if (raf) { root.cancelAnimationFrame(raf); raf = null; }
    if (canvas) { try { canvas.parentNode.removeChild(canvas); } catch (e) {} canvas = null; ctx = null; }
    parts = [];
  }
  function burst(opts) {
    opts = opts || {};
    start(opts);
    setTimeout(stop, opts.duration || 3200);
    return stop;
  }

  var API = { start: start, stop: stop, burst: burst };
  if (typeof module !== "undefined" && module.exports) module.exports = API;
  root.NDConfetti = API;
})(typeof window !== "undefined" ? window : globalThis);
