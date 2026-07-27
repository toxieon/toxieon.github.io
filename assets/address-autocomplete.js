/* =========================================================================
 *  address-autocomplete.js — Google Places autocomplete on a field (asset)
 *
 *  Origin: extracted and generalised from Quote's and Uploader's inline
 *  google.maps.places.Autocomplete setup.
 *  Purpose: one call to attach address autocomplete to an <input>, with a
 *  country restriction, optional map-bounds bias, and a clean onSelect.
 *
 *  Dependency: the Maps JS API with the "places" library loaded by the host
 *  (…/maps/api/js?key=…&libraries=places). Pairs with here.js.
 *
 *  Global `NDAutocomplete`:
 *
 *    NDAutocomplete.attach(input, opts) -> autocomplete | null
 *        opts: country ("au"), types (["address"]), fields
 *              (["formatted_address","geometry"]), bounds, strictBounds,
 *              onSelect(place). Filling the field fires an 'input' event so
 *              app listeners pick up the value. No-ops (returns null) if
 *              Places isn't loaded or the input is already bound.
 *
 *    NDAutocomplete.attachAll(selector, opts)
 *        Attach to every matching input not yet bound. Returns the count.
 *
 *    NDAutocomplete.victoriaBounds()
 *        Convenience LatLngBounds around Victoria, AU (or null if no Maps).
 * ========================================================================= */
(function (root) {
  "use strict";

  function placesReady() {
    return !!(root.google && root.google.maps && root.google.maps.places && root.google.maps.places.Autocomplete);
  }

  function victoriaBounds() {
    if (!(root.google && root.google.maps && root.google.maps.LatLngBounds)) return null;
    return new root.google.maps.LatLngBounds(
      new root.google.maps.LatLng(-39.25, 140.85),
      new root.google.maps.LatLng(-33.85, 150.10)
    );
  }

  function attach(input, opts) {
    opts = opts || {};
    if (!input || input._ndAcBound || !placesReady()) return null;
    input._ndAcBound = true;
    var cfg = { fields: opts.fields || ["formatted_address", "geometry"] };
    if (opts.country) cfg.componentRestrictions = { country: opts.country };
    if (opts.types) cfg.types = opts.types;
    if (opts.bounds) cfg.bounds = opts.bounds;
    if (opts.strictBounds) cfg.strictBounds = true;
    var ac = new root.google.maps.places.Autocomplete(input, cfg);
    ac.addListener("place_changed", function () {
      var place = ac.getPlace();
      if (place && place.formatted_address) {
        input.value = place.formatted_address;
        input.dispatchEvent(new Event("input", { bubbles: true }));
        input.dispatchEvent(new Event("change", { bubbles: true }));
      }
      if (typeof opts.onSelect === "function") { try { opts.onSelect(place); } catch (e) {} }
    });
    return ac;
  }

  function attachAll(selector, opts) {
    var n = 0;
    Array.prototype.forEach.call(document.querySelectorAll(selector), function (el) {
      if (attach(el, opts)) n++;
    });
    return n;
  }

  var API = { attach: attach, attachAll: attachAll, victoriaBounds: victoriaBounds, placesReady: placesReady };
  if (typeof module !== "undefined" && module.exports) module.exports = API;
  root.NDAutocomplete = API;
})(typeof window !== "undefined" ? window : globalThis);
