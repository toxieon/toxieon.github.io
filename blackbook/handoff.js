/* tipdash / TipBot handoff: #t=<encodeURIComponent(token)> or #token=<...>
 * -> localStorage nd_owner_token, then strip the fragment.
 * Loaded first so the token never lingers in the URL or history. The fragment is decoded exactly once.
 * tipdash links here with #t=. TipBot's OAuth callback uses #token=. */
(function (root, factory) {
  "use strict";
  var api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.BBHandoff = api;
  if (typeof window !== "undefined" && window.location && window.localStorage && window.history) {
    api.consumeTokenFragment(window.location, window.localStorage, window.history);
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  var TOKEN_KEY = "nd_owner_token";
  var MIN_LEN = 16;
  var MAX_LEN = 4096;
  var authError = "";

  function isPlausibleToken(token) {
    if (typeof token !== "string") return false;
    if (token.length < MIN_LEN || token.length > MAX_LEN) return false;
    return !/[\s\u0000-\u001f\u007f]/.test(token);
  }

  /** Parse #a=b&c=d. Path hashes (#/upcoming) have no params. First value for a key wins. */
  function fragmentParams(hash) {
    var raw = String(hash || "");
    if (raw.charAt(0) === "#") raw = raw.slice(1);
    var out = {};
    if (!raw || raw.charAt(0) === "/") return out;
    var parts = raw.split("&");
    for (var i = 0; i < parts.length; i++) {
      var p = parts[i];
      var eq = p.indexOf("=");
      if (eq <= 0) continue;
      var key = p.slice(0, eq);
      if (!Object.prototype.hasOwnProperty.call(out, key)) out[key] = p.slice(eq + 1);
    }
    return out;
  }

  function decodeOnce(value) {
    try { return decodeURIComponent(value); } catch (e) { return ""; }
  }

  /** {hadT, token}. Raw match, not URLSearchParams: a "+" in the token must stay a "+".
   *  #t= (tipdash) wins over #token= (TipBot OAuth) when both are present. */
  function readHashToken(hash) {
    var p = fragmentParams(hash);
    var encoded = null;
    if (Object.prototype.hasOwnProperty.call(p, "t")) encoded = p.t;
    else if (Object.prototype.hasOwnProperty.call(p, "token")) encoded = p.token;
    if (encoded === null) return { hadT: false, token: "" };
    return { hadT: true, token: decodeOnce(encoded) };
  }

  function consumeTokenFragment(loc, storage, hist) {
    authError = "";
    var r = readHashToken(loc.hash || "");
    var p = fragmentParams(loc.hash || "");
    var hadError = Object.prototype.hasOwnProperty.call(p, "error");
    if (hadError) authError = decodeOnce(p.error);
    if (!r.hadT && !hadError) return { stored: false, stripped: false };
    var stored = false;
    if (r.hadT && isPlausibleToken(r.token)) {
      try { storage.setItem(TOKEN_KEY, r.token); stored = true; } catch (e) {}
    }
    if (hist && typeof hist.replaceState === "function") hist.replaceState(null, "", loc.pathname + (loc.search || ""));
    return { stored: stored, stripped: true };
  }

  function getAuthError() { return authError; }

  return {
    TOKEN_KEY: TOKEN_KEY,
    isPlausibleToken: isPlausibleToken,
    fragmentParams: fragmentParams,
    readHashToken: readHashToken,
    consumeTokenFragment: consumeTokenFragment,
    getAuthError: getAuthError
  };
});
