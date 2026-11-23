/* TipBot Models sign-in handoff (same contract as Black Book 0.2.1).
 * #t= or #token= is already a session token (tipdash handoff): store as nd_models_owner_token and strip.
 * Those values are never sent to /api/auth/exchange.
 * TipBot's Discord callback returns #code= (a one-time code, not a session token). The code is
 * taken once, the hash is stripped, and app.js POSTs it to /api/auth/exchange.
 * #error= is a failed login. #signup= is ignored (signup-pending stays on tipdash) and stripped.
 * Loaded first so secrets never linger in the URL or history. Fragments are decoded exactly once. */
(function (root, factory) {
  "use strict";
  var api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.NDModelsHandoff = api;
  if (typeof window !== "undefined" && window.location && window.localStorage && window.history) {
    api.consumeTokenFragment(window.location, window.localStorage, window.history);
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  var TOKEN_KEY = "nd_models_owner_token";
  var MIN_LEN = 16;
  var MAX_LEN = 4096;
  var authError = "";
  var pendingCode = "";

  function isPlausibleToken(token) {
    if (typeof token !== "string") return false;
    if (token.length < MIN_LEN || token.length > MAX_LEN) return false;
    return !/[\s\u0000-\u001f\u007f]/.test(token);
  }

  function isPlausibleCode(code) {
    if (typeof code !== "string") return false;
    if (!code.length || code.length > MAX_LEN) return false;
    return !/[\s\u0000-\u001f\u007f]/.test(code);
  }

  /** Parse #a=b&c=d. Path hashes (#/something) have no params. First value for a key wins. */
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
   *  #t= (tipdash) wins over #token= when both are present. #code= is not a session token. */
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
    pendingCode = "";
    var hash = loc.hash || "";
    var r = readHashToken(hash);
    var p = fragmentParams(hash);
    var hadError = Object.prototype.hasOwnProperty.call(p, "error");
    var hadSignup = Object.prototype.hasOwnProperty.call(p, "signup");
    var hadCode = Object.prototype.hasOwnProperty.call(p, "code");
    if (hadError) authError = decodeOnce(p.error);
    var stored = false;
    if (r.hadT && isPlausibleToken(r.token)) {
      try { storage.setItem(TOKEN_KEY, r.token); stored = true; } catch (e) {}
    } else if (!r.hadT && !hadError && hadCode) {
      var code = decodeOnce(p.code);
      if (isPlausibleCode(code)) pendingCode = code;
      else authError = "login_failed";
    }
    if (!r.hadT && !hadError && !hadSignup && !hadCode) return { stored: false, stripped: false };
    if (hist && typeof hist.replaceState === "function") hist.replaceState(null, "", loc.pathname + (loc.search || ""));
    return { stored: stored, stripped: true };
  }

  function getAuthError() { return authError; }

  /** One-time code from #code=, if any. Clears so it can be exchanged only once. */
  function takePendingCode() {
    var code = pendingCode;
    pendingCode = "";
    return code;
  }

  return {
    TOKEN_KEY: TOKEN_KEY,
    isPlausibleToken: isPlausibleToken,
    isPlausibleCode: isPlausibleCode,
    fragmentParams: fragmentParams,
    readHashToken: readHashToken,
    consumeTokenFragment: consumeTokenFragment,
    getAuthError: getAuthError,
    takePendingCode: takePendingCode
  };
});
