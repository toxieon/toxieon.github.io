/* =========================================================================
 *  here.js — "Here" one-tap geolocation → address  (reusable asset)
 *
 *  Origin: extracted and generalised from Quote's #use-location-btn handler.
 *  Purpose: get the device's current location and reverse-geocode it into a
 *  human address, then drop it into a field (or hand it back to you).
 *
 *  Dependencies (must be loaded by the host page):
 *    • navigator.geolocation                (all modern browsers)
 *    • google.maps.Geocoder                 (load Google Maps JS API)
 *
 *  Exposes a global `NDHere` with three entry points:
 *
 *    NDHere.locate(opts) -> Promise<{ address, lat, lng }>
 *        Low-level. Resolves with the address + coordinates, or rejects with
 *        an Error whose .code is one of: NO_GEO, NO_MAPS, POSITION, REQUEST_DENIED,
 *        OVER_QUERY_LIMIT, ZERO_RESULTS, GEOCODE_FAILED.
 *
 *    NDHere.fill(inputEl, opts) -> Promise<{ address, lat, lng }>
 *        Convenience. Runs locate() and writes the address into inputEl.value,
 *        firing an 'input' event so app listeners pick it up.
 *
 *    NDHere.attachButton(buttonEl, inputEl, opts)
 *        Wires a button so tapping it fills the input, showing a "Locating…"
 *        busy state on the button and re-enabling it afterwards.
 *
 *  Common opts:
 *    region        ISO-2 region bias for geocoding      (default "au")
 *    highAccuracy  GPS high accuracy                     (default true)
 *    timeout       geolocation timeout in ms             (default 10000)
 *    busyLabel     button text while locating            (default "Locating…")
 *    onResult(a,c) callback with address + {lat,lng}
 *    onError(err)  callback; if omitted a sensible alert() is shown
 *    notify(msg)   optional toast fn (e.g. NDUI.toast) used instead of alert()
 * ========================================================================= */
(function (root) {
  "use strict";

  var MESSAGES = {
    NO_GEO: "Geolocation isn't supported by this browser.",
    NO_MAPS: "Maps isn't loaded yet. Try again in a second.",
    POSITION: "Couldn't get your location. Make sure you allowed location access for this site.",
    REQUEST_DENIED:
      "Geocoding API isn't enabled on your Maps key.\n\nFix:\n" +
      "1. Google Cloud Console → APIs & Services → Library → search \"Geocoding API\" → Enable\n" +
      "2. Credentials → your Maps API Key → API restrictions → tick \"Geocoding API\" → Save\n\n" +
      "Give it ~1 minute to propagate, then try again.",
    OVER_QUERY_LIMIT: "Too many location lookups. Try again in a moment.",
    ZERO_RESULTS: "Couldn't find an address near your current location. Type it manually.",
    GEOCODE_FAILED: "Couldn't resolve an address from your location."
  };

  function makeError(code, extra) {
    var e = new Error((MESSAGES[code] || "Location error") + (extra ? " (" + extra + ")" : ""));
    e.code = code;
    return e;
  }

  // Reverse-geocode via the Maps JS API (preferred when the library is loaded).
  function reverseGeocodeJs(lat, lng, region) {
    return new Promise(function (resolve, reject) {
      var geocoder = new root.google.maps.Geocoder();
      geocoder.geocode({ location: { lat: lat, lng: lng }, region: region }, function (results, status) {
        if (status === "OK" && results && results[0]) resolve(results[0].formatted_address);
        else if (MESSAGES[status]) reject(makeError(status));
        else reject(makeError("GEOCODE_FAILED", status));
      });
    });
  }
  // Reverse-geocode over REST — for apps that hold a Maps key but don't load
  // the Maps JS library (e.g. Timesheet). Pass opts.mapsKey to use this path.
  function reverseGeocodeRest(lat, lng, region, key) {
    var url = "https://maps.googleapis.com/maps/api/geocode/json?latlng=" + lat + "," + lng +
      "&region=" + encodeURIComponent(region) + "&key=" + encodeURIComponent(key);
    return fetch(url).then(function (r) { return r.json(); }).then(function (data) {
      if (data.status === "OK" && data.results && data.results.length) return data.results[0].formatted_address;
      if (MESSAGES[data.status]) throw makeError(data.status);
      throw makeError("GEOCODE_FAILED", data.error_message || data.status);
    });
  }

  function locate(opts) {
    opts = opts || {};
    var region = opts.region || "au";
    return new Promise(function (resolve, reject) {
      if (!navigator.geolocation) return reject(makeError("NO_GEO"));
      var hasJs = !!(root.google && root.google.maps && root.google.maps.Geocoder);
      if (!hasJs && !opts.mapsKey) return reject(makeError("NO_MAPS"));
      navigator.geolocation.getCurrentPosition(
        function (pos) {
          var lat = pos.coords.latitude, lng = pos.coords.longitude;
          var p = hasJs ? reverseGeocodeJs(lat, lng, region) : reverseGeocodeRest(lat, lng, region, opts.mapsKey);
          p.then(function (address) { resolve({ address: address, lat: lat, lng: lng }); }).catch(reject);
        },
        function (err) { reject(makeError("POSITION", err && err.message)); },
        { enableHighAccuracy: opts.highAccuracy !== false, timeout: opts.timeout || 10000 }
      );
    });
  }

  function report(err, opts) {
    if (opts && typeof opts.onError === "function") { opts.onError(err); return; }
    if (opts && typeof opts.notify === "function") { opts.notify(err.message); return; }
    if (root.NDUI && typeof root.NDUI.toast === "function" && err.code !== "REQUEST_DENIED") {
      root.NDUI.toast(err.message);
    } else {
      alert(err.message);
    }
  }

  function fill(inputEl, opts) {
    opts = opts || {};
    return locate(opts).then(function (r) {
      if (inputEl) {
        inputEl.value = r.address;
        inputEl.dispatchEvent(new Event("input", { bubbles: true }));
        inputEl.dispatchEvent(new Event("change", { bubbles: true }));
      }
      if (typeof opts.onResult === "function") opts.onResult(r.address, { lat: r.lat, lng: r.lng });
      return r;
    }).catch(function (err) { report(err, opts); throw err; });
  }

  function attachButton(buttonEl, inputEl, opts) {
    opts = opts || {};
    if (!buttonEl || buttonEl._ndHereBound) return;
    buttonEl._ndHereBound = true;
    buttonEl.addEventListener("click", function () {
      var original = buttonEl.textContent;
      buttonEl.textContent = opts.busyLabel || "Locating…";
      buttonEl.disabled = true;
      fill(inputEl, opts)["finally"](function () {
        buttonEl.textContent = original;
        buttonEl.disabled = false;
      });
    });
  }

  var API = { locate: locate, fill: fill, attachButton: attachButton, MESSAGES: MESSAGES };

  if (typeof module !== "undefined" && module.exports) module.exports = API;
  root.NDHere = API;
})(typeof window !== "undefined" ? window : globalThis);
