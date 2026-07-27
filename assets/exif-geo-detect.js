/* =========================================================================
 *  exif-geo-detect.js — read a photo's GPS + capture time, resolve address
 *
 *  Origin: extracted and generalised from Uploader's EXIF auto-location.
 *  Purpose: pull embedded coordinates (and DateTimeOriginal) out of photos,
 *  then reverse-geocode — clustering by coordinate so a 40-photo site costs
 *  ONE geocode call, not 40.
 *
 *  Dependencies (host loads):
 *    • exifr  (window.exifr — shared/vendor/exifr.umd.js)
 *    • google.maps.Geocoder  OR  a Maps key (opts.mapsKey) for REST geocoding
 *
 *  Global `NDExifGeo`:
 *
 *    NDExifGeo.round5(n)                    -> number rounded to 5 dp
 *    NDExifGeo.coordKey(lat, lng)           -> "lat,lng" (5dp) cluster key   (pure)
 *
 *    NDExifGeo.readExif(file) -> Promise<{ lat, lng, capturedAt }>
 *        Best-effort; missing tags come back null. Never throws.
 *
 *    NDExifGeo.reverseGeocode(lat, lng, opts) -> Promise<string>
 *        opts.region ("au"), opts.mapsKey (REST fallback). "" if not found.
 *
 *    NDExifGeo.geocodeClusters(points, opts) -> Promise<{ [coordKey]: address }>
 *        points: [{ lat, lng }]. One call per unique coordKey. Results are
 *        memoised in opts.cache (pass the same object across batches to reuse).
 * ========================================================================= */
(function (root) {
  "use strict";

  function round5(n) { return Math.round(n * 1e5) / 1e5; }
  function coordKey(lat, lng) { return round5(lat) + "," + round5(lng); }

  function readExif(file) {
    var out = { lat: null, lng: null, capturedAt: null };
    if (!root.exifr || !file) return Promise.resolve(out);
    var jobs = [];
    jobs.push(root.exifr.gps(file).then(function (g) {
      if (g && isFinite(g.latitude) && isFinite(g.longitude)) { out.lat = round5(g.latitude); out.lng = round5(g.longitude); }
    }).catch(function () {}));
    jobs.push(root.exifr.parse(file, { pick: ["DateTimeOriginal"] }).then(function (t) {
      if (t && t.DateTimeOriginal) out.capturedAt = new Date(t.DateTimeOriginal).toISOString();
    }).catch(function () {}));
    return Promise.all(jobs).then(function () { return out; });
  }

  function reverseGeocode(lat, lng, opts) {
    opts = opts || {};
    var region = opts.region || "au";
    var hasJs = !!(root.google && root.google.maps && root.google.maps.Geocoder);
    if (hasJs) {
      return new root.google.maps.Geocoder().geocode({ location: { lat: lat, lng: lng }, region: region })
        .then(function (res) { return (res && res.results && res.results[0] && res.results[0].formatted_address) || ""; })
        .catch(function () { return ""; });
    }
    if (opts.mapsKey) {
      var url = "https://maps.googleapis.com/maps/api/geocode/json?latlng=" + lat + "," + lng +
        "&region=" + encodeURIComponent(region) + "&key=" + encodeURIComponent(opts.mapsKey);
      return fetch(url).then(function (r) { return r.json(); })
        .then(function (d) { return (d.status === "OK" && d.results && d.results[0] && d.results[0].formatted_address) || ""; })
        .catch(function () { return ""; });
    }
    return Promise.resolve("");
  }

  function geocodeClusters(points, opts) {
    opts = opts || {};
    var cache = opts.cache || {};
    var seen = {};
    (points || []).forEach(function (p) {
      if (p && isFinite(p.lat) && isFinite(p.lng)) seen[coordKey(p.lat, p.lng)] = [p.lat, p.lng];
    });
    var keys = Object.keys(seen);
    return keys.reduce(function (chain, key) {
      return chain.then(function () {
        if (key in cache) return;
        var ll = seen[key];
        return reverseGeocode(ll[0], ll[1], opts).then(function (addr) { cache[key] = addr; });
      });
    }, Promise.resolve()).then(function () {
      var result = {};
      keys.forEach(function (k) { result[k] = cache[k] || ""; });
      return result;
    });
  }

  var API = { round5: round5, coordKey: coordKey, readExif: readExif, reverseGeocode: reverseGeocode, geocodeClusters: geocodeClusters };
  if (typeof module !== "undefined" && module.exports) module.exports = API;
  root.NDExifGeo = API;
})(typeof window !== "undefined" ? window : globalThis);
