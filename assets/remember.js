/* =========================================================================
 *  remember.js — "remember me" / stay-signed-in store  (reusable asset)
 *
 *  Origin: Quote's persist-unlock-for-the-working-day pattern. Generalised so
 *  any app with a local gate (a passcode, a PIN, a chosen profile) can keep
 *  the user in for a set window instead of re-prompting every open.
 *
 *  NOTE: apps that sign in with Google already "remember" via shared/nd-auth.js
 *  (the OAuth token persists + silently refreshes). This asset is for the
 *  extra, app-level gates on top of that — e.g. Quote's passcode.
 *
 *  A record stores its own expiry, so load() needs no TTL argument:
 *      NDRemember.save(key, data, ttlHours)  — persist data for ttlHours
 *      NDRemember.load(key)      -> data | null   (null once expired/absent)
 *      NDRemember.isValid(key)   -> boolean
 *      NDRemember.clear(key)
 *      NDRemember.touch(key)     — reset the clock to now (keep-alive on activity)
 *
 *  Storage is localStorage under the exact key you pass. No dependencies.
 * ========================================================================= */
(function (root) {
  "use strict";
  if (root.NDRemember) return;

  var HOUR = 3600 * 1000;

  function store() {
    try { return root.localStorage; } catch (e) { return null; }
  }
  function read(key) {
    var s = store(); if (!s) return null;
    try {
      var rec = JSON.parse(s.getItem(key));
      if (!rec || typeof rec !== "object" || !("__ndr" in rec)) return null;   // only our records
      return rec;
    } catch (e) { return null; }
  }
  function expired(rec) {
    return !rec || !rec.at || !rec.ttl || (Date.now() - rec.at) >= rec.ttl;
  }

  function save(key, data, ttlHours) {
    var s = store(); if (!s) return false;
    var rec = { __ndr: 1, data: data, at: Date.now(), ttl: Math.max(0, Number(ttlHours) || 0) * HOUR };
    try { s.setItem(key, JSON.stringify(rec)); return true; } catch (e) { return false; }
  }
  function load(key) {
    var rec = read(key);
    if (!rec) return null;
    if (expired(rec)) { clear(key); return null; }
    return rec.data;
  }
  function isValid(key) { var rec = read(key); return !!rec && !expired(rec); }
  function touch(key) {
    var rec = read(key);
    if (!rec || expired(rec)) return false;
    rec.at = Date.now();
    var s = store(); if (!s) return false;
    try { s.setItem(key, JSON.stringify(rec)); return true; } catch (e) { return false; }
  }
  function clear(key) { var s = store(); if (s) { try { s.removeItem(key); } catch (e) {} } }

  var API = { save: save, load: load, isValid: isValid, touch: touch, clear: clear };
  if (typeof module !== "undefined" && module.exports) module.exports = API;
  root.NDRemember = API;
})(typeof window !== "undefined" ? window : globalThis);
