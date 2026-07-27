/* =========================================================================
 *  camera-capture.js — in-app camera modal  (reusable asset)
 *
 *  Origin: extracted and generalised from Quote's in-app camera.
 *  Purpose: a full-screen camera with live preview, flip front/back, a
 *  shutter that captures + downscales a frame, and (optionally) stamps it
 *  with the watermark asset — handing you back a JPEG data URL.
 *
 *  Self-contained: injects its own CSS + DOM. Optional dependency:
 *  assets/watermark.js (NDWatermark) if you pass watermarkLines.
 *
 *  Global `NDCamera`:
 *
 *    NDCamera.open(opts) -> { close }
 *      facingMode         "environment" (default) | "user"
 *      maxDim             downscale cap for the long edge (default 1600)
 *      jpegQ              0-1 (default 0.85)
 *      watermarkLines     string[]  OR  () => string[]   (needs NDWatermark)
 *      infoText           small caption under the preview (e.g. wm summary)
 *      closeAfterCapture  true to close after one shot (default false)
 *      onCapture(dataUrl, { w, h })   fired per shutter
 *      onClose()          fired when closed
 *      onError(message)   camera unavailable / blocked
 *
 *  NDCamera.isSupported() -> boolean
 * ========================================================================= */
(function (root) {
  "use strict";
  if (typeof document === "undefined") { root.NDCamera = { open: function () {}, isSupported: function () { return false; } }; return; }

  function isSupported() { return !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia); }

  function injectStyles() {
    if (document.getElementById("ndcam-styles")) return;
    var css =
      ".ndcam{position:fixed;inset:0;background:rgba(0,0,0,0.96);z-index:1200;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:16px;gap:12px}" +
      ".ndcam video{max-width:100%;max-height:calc(100vh - 200px);border-radius:12px;background:#000}" +
      ".ndcam canvas{display:none}" +
      ".ndcam-shutter{width:78px;height:78px;border-radius:50%;background:#fff;border:5px solid rgba(255,255,255,0.4);cursor:pointer;transition:0.1s;padding:0}" +
      ".ndcam-shutter:active{transform:scale(0.92)}" +
      ".ndcam-shutter:disabled{opacity:0.5;cursor:wait}" +
      ".ndcam-close{position:absolute;top:14px;right:16px;background:rgba(255,255,255,0.12);color:#fff;border:0;width:40px;height:40px;border-radius:50%;font-size:1.3rem;cursor:pointer;font-weight:900}" +
      ".ndcam-flip{position:absolute;top:14px;left:16px;background:rgba(255,255,255,0.12);color:#fff;border:0;width:40px;height:40px;border-radius:50%;font-size:1.1rem;cursor:pointer;font-weight:900}" +
      ".ndcam-status{color:#fff;font-size:0.85rem;opacity:0.85;min-height:1.2em;text-align:center;max-width:90vw}" +
      ".ndcam-info{color:rgba(255,255,255,0.7);font-size:0.78rem;max-width:92vw;text-align:center;padding:6px 10px;background:rgba(255,255,255,0.06);border-radius:8px}";
    var s = document.createElement("style");
    s.id = "ndcam-styles"; s.textContent = css;
    document.head.appendChild(s);
  }

  function open(opts) {
    opts = opts || {};
    if (!isSupported()) {
      var msg = "This browser doesn't support in-app camera capture.";
      if (typeof opts.onError === "function") opts.onError(msg); else alert(msg);
      return { close: function () {} };
    }
    injectStyles();
    var facing = opts.facingMode || "environment";
    var maxDim = opts.maxDim || 1600;
    var jpegQ = opts.jpegQ || 0.85;
    var stream = null;

    var modal = document.createElement("div");
    modal.className = "ndcam";
    modal.innerHTML =
      '<button type="button" class="ndcam-flip" aria-label="Flip camera">⟳</button>' +
      '<button type="button" class="ndcam-close" aria-label="Close">✕</button>' +
      "<video autoplay playsinline muted></video>" +
      "<canvas></canvas>" +
      (opts.infoText ? '<div class="ndcam-info"></div>' : "") +
      '<div class="ndcam-status">Starting camera…</div>' +
      '<button type="button" class="ndcam-shutter" aria-label="Capture"></button>';
    document.body.appendChild(modal);

    var video = modal.querySelector("video");
    var canvas = modal.querySelector("canvas");
    var status = modal.querySelector(".ndcam-status");
    var shutter = modal.querySelector(".ndcam-shutter");
    var info = modal.querySelector(".ndcam-info");
    if (info) info.textContent = opts.infoText;

    function stopStream() { if (stream) { stream.getTracks().forEach(function (t) { t.stop(); }); stream = null; } }
    async function start() {
      stopStream();
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: facing }, audio: false });
        video.srcObject = stream;
        status.textContent = "Tap the shutter to capture.";
      } catch (e) {
        status.textContent = "Camera blocked: " + (e.message || e.name) + ". Grant camera permission and retry.";
        if (typeof opts.onError === "function") opts.onError(status.textContent);
      }
    }
    function close() {
      stopStream();
      video.srcObject = null;
      modal.remove();
      if (typeof opts.onClose === "function") { try { opts.onClose(); } catch (e) {} }
    }
    async function flip() { facing = facing === "environment" ? "user" : "environment"; await start(); }
    async function snap() {
      if (!video.videoWidth) { status.textContent = "Camera not ready yet — wait a moment."; return; }
      shutter.disabled = true; status.textContent = "Captured. Processing…";
      var w = video.videoWidth, h = video.videoHeight;
      var longest = Math.max(w, h);
      if (longest > maxDim) { var s = maxDim / longest; w = Math.round(w * s); h = Math.round(h * s); }
      canvas.width = w; canvas.height = h;
      var ctx = canvas.getContext("2d");
      ctx.drawImage(video, 0, 0, w, h);
      var lines = typeof opts.watermarkLines === "function" ? opts.watermarkLines() : opts.watermarkLines;
      if (lines && lines.length && root.NDWatermark) { try { root.NDWatermark.draw(ctx, w, h, { lines: lines }); } catch (e) {} }
      var url = canvas.toDataURL("image/jpeg", jpegQ);
      if (typeof opts.onCapture === "function") { try { opts.onCapture(url, { w: w, h: h }); } catch (e) {} }
      status.textContent = "Saved. Tap the shutter for another, or ✕ to close.";
      shutter.disabled = false;
      if (opts.closeAfterCapture) close();
    }

    modal.querySelector(".ndcam-flip").addEventListener("click", flip);
    modal.querySelector(".ndcam-close").addEventListener("click", close);
    shutter.addEventListener("click", snap);
    start();
    return { close: close };
  }

  var API = { open: open, isSupported: isSupported };
  if (typeof module !== "undefined" && module.exports) module.exports = API;
  root.NDCamera = API;
})(typeof window !== "undefined" ? window : globalThis);
