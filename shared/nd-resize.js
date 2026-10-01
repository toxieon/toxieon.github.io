/* =========================================================================
 *  nd-resize.js: high-quality photo downscale on vendored pica 10.0.3
 *  (MIT, shared/vendor/pica/). Replaces one-step canvas drawImage downscales,
 *  which alias badly at 4032x3024 -> 1280/2560.
 *
 *    NDResize.toCanvas(source, w, h) -> Promise<HTMLCanvasElement w x h>
 *        source: <img>, <video> (frame grabbed synchronously at call time),
 *        <canvas> or ImageBitmap. No upscaling via pica; on any pica failure
 *        (or pica not loaded) falls back to the old drawImage path.
 * ========================================================================= */
(function (root) {
  "use strict";
  var inst = null;
  function getPica() {
    if (!inst && typeof root.pica === "function") { try { inst = root.pica({ features: ["js", "wasm", "ww"] }); } catch (e) { inst = null; } }
    return inst;
  }
  function dims(s) { return { w: s.naturalWidth || s.videoWidth || s.width || 0, h: s.naturalHeight || s.videoHeight || s.height || 0 }; }
  function plain(source, w, h) {
    var c = document.createElement("canvas"); c.width = w; c.height = h;
    c.getContext("2d").drawImage(source, 0, 0, w, h);
    return c;
  }
  function toCanvas(source, w, h) {
    var d = dims(source), p = getPica();
    if (!p || !d.w || !d.h || (w >= d.w && h >= d.h)) return Promise.resolve(plain(source, w, h));
    var from = source;
    var isVideo = typeof HTMLVideoElement !== "undefined" && source instanceof HTMLVideoElement;
    if (isVideo) from = plain(source, d.w, d.h);   // freeze the frame now
    var to = document.createElement("canvas"); to.width = w; to.height = h;
    return p.resize(from, to, { filter: "mks2013" }).then(function (out) { return out || to; }, function (e) {
      if (root.console) console.warn("pica resize failed, using canvas fallback", e);
      return plain(from, w, h);
    }).then(function (c) { if (isVideo) { from.width = from.height = 0; } return c; });
  }
  root.NDResize = { toCanvas: toCanvas };
})(typeof window !== "undefined" ? window : globalThis);
