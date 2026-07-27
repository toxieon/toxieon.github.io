/* =========================================================================
 *  watermark.js — photo watermark strip  (reusable asset)
 *
 *  Origin: extracted and generalised from Quote's drawWatermark().
 *  Purpose: paint a translucent info strip along the bottom of a photo —
 *  business, address, room/apartment/location, date-time, uploader initials,
 *  optional GPS. Every field is individually toggleable.
 *
 *  No external dependencies. Canvas 2D only. GPS lookup (optional) uses
 *  navigator.geolocation and is kept separate so draw() stays synchronous
 *  and unit-testable.
 *
 *  Exposes a global `NDWatermark`:
 *
 *    NDWatermark.DEFAULT_TOGGLES
 *        The default field on/off map. Clone + override per app.
 *
 *    NDWatermark.buildLines(data, toggles) -> string[]        (pure)
 *        Turn a data object into the ordered text lines. Fields with no
 *        value are skipped even if toggled on. Room/apartment/location are
 *        merged into one compact line; date-time and initials share a line.
 *        data: { business, clientName, address, room, apartment, location,
 *                ref, initials, datetime (Date|true), gps (string) }
 *
 *    NDWatermark.draw(ctx, w, h, opts)                        (sync)
 *        Paint opts.lines (string[]) onto a canvas context sized w×h.
 *
 *    NDWatermark.stamp(source, opts) -> string (JPEG dataURL)
 *        Draw an image/canvas/video frame onto a fresh canvas (optionally
 *        downscaled to opts.maxDim), watermark it, and return a dataURL.
 *        opts: { lines, maxDim, jpegQ (0-1), width, height }
 *
 *    NDWatermark.getGps(opts) -> Promise<string|null>
 *        Convenience GPS string "lat, lng" (5 dp) for data.gps.
 * ========================================================================= */
(function (root) {
  "use strict";

  var DEFAULT_TOGGLES = {
    business: true, clientName: false, address: true, room: true,
    apartment: true, location: true, ref: false, datetime: true,
    initials: true, gps: false
  };

  function fmtDateTime(dt) {
    var now = dt instanceof Date ? dt : new Date();
    return now.toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" }) + " " +
           now.toLocaleTimeString("en-AU", { hour: "numeric", minute: "2-digit" });
  }

  function buildLines(data, toggles) {
    data = data || {};
    var t = toggles || DEFAULT_TOGGLES;
    var lines = [];
    if (t.business && data.business) lines.push(String(data.business));
    if (t.clientName && data.clientName) lines.push("Client: " + data.clientName);
    if (t.address && data.address) lines.push(String(data.address));

    var loc = [];
    if (t.room && data.room) loc.push(String(data.room));
    if (t.apartment && data.apartment) loc.push(String(data.apartment));
    if (t.location && data.location) loc.push(String(data.location));
    if (loc.length) lines.push(loc.join(" · "));

    if (t.ref && data.ref) lines.push("Ref: " + data.ref);

    var when = t.datetime ? fmtDateTime(data.datetime === true ? null : data.datetime) : "";
    var who = (t.initials && data.initials) ? String(data.initials) : "";
    if (when && who) lines.push(when + " · " + who);
    else if (when) lines.push(when);
    else if (who) lines.push("By " + who);

    if (t.gps && data.gps) lines.push("GPS " + data.gps);
    return lines;
  }

  function draw(ctx, w, h, opts) {
    opts = opts || {};
    var lines = opts.lines || [];
    if (!lines.length) return;
    var pad = Math.max(8, Math.round(h * 0.012));
    var fontSize = Math.max(14, Math.round(h * 0.025));
    var lineGap = Math.round(fontSize * 1.25);
    var stripH = lineGap * lines.length + pad * 2;
    ctx.save();
    var grad = ctx.createLinearGradient(0, h - stripH * 1.4, 0, h);
    grad.addColorStop(0, "rgba(0,0,0,0)");
    grad.addColorStop(1, "rgba(0,0,0,0.6)");
    ctx.fillStyle = grad;
    ctx.fillRect(0, h - stripH * 1.4, w, stripH * 1.4);
    ctx.font = "600 " + fontSize + "px -apple-system, system-ui, sans-serif";
    ctx.textBaseline = "top";
    ctx.fillStyle = "#fff";
    ctx.shadowColor = "rgba(0,0,0,0.85)";
    ctx.shadowBlur = 3; ctx.shadowOffsetX = 1; ctx.shadowOffsetY = 1;
    var y = h - stripH + pad;
    lines.forEach(function (line) { ctx.fillText(line, pad, y); y += lineGap; });
    ctx.restore();
  }

  function sourceDims(source) {
    return {
      w: source.videoWidth || source.naturalWidth || source.width,
      h: source.videoHeight || source.naturalHeight || source.height
    };
  }

  function stamp(source, opts) {
    opts = opts || {};
    var dim = sourceDims(source);
    var w = opts.width || dim.w, h = opts.height || dim.h;
    if (opts.maxDim) {
      var longest = Math.max(w, h);
      if (longest > opts.maxDim) { var s = opts.maxDim / longest; w = Math.round(w * s); h = Math.round(h * s); }
    }
    var canvas = document.createElement("canvas");
    canvas.width = w; canvas.height = h;
    var ctx = canvas.getContext("2d");
    ctx.drawImage(source, 0, 0, w, h);
    draw(ctx, w, h, { lines: opts.lines || [] });
    return canvas.toDataURL("image/jpeg", opts.jpegQ || 0.82);
  }

  function getGps(opts) {
    opts = opts || {};
    return new Promise(function (resolve) {
      if (!navigator.geolocation) return resolve(null);
      navigator.geolocation.getCurrentPosition(
        function (pos) { resolve(pos.coords.latitude.toFixed(5) + ", " + pos.coords.longitude.toFixed(5)); },
        function () { resolve(null); },
        { enableHighAccuracy: opts.highAccuracy !== false, timeout: opts.timeout || 4000 }
      );
    });
  }

  var API = { DEFAULT_TOGGLES: DEFAULT_TOGGLES, buildLines: buildLines, draw: draw, stamp: stamp, getGps: getGps };

  if (typeof module !== "undefined" && module.exports) module.exports = API;
  root.NDWatermark = API;
})(typeof window !== "undefined" ? window : globalThis);
