/* tipdash handoff: #t=<encodeURIComponent(token)> -> localStorage nd_owner_token, then strip the fragment.
 * Loaded first so the token never lingers in the URL or history. The fragment is decoded exactly once. */
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

  function isPlausibleToken(token) {
    if (typeof token !== "string") return false;
    if (token.length < MIN_LEN || token.length > MAX_LEN) return false;
    return !/[\s\u0000-\u001f\u007f]/.test(token);
  }

  /** {hadT, token}. Raw match, not URLSearchParams: a "+" in the token must stay a "+". */
  function readHashToken(hash) {
    var m = /^#(?:.*&)?t=([^&]*)/.exec(hash || "");
    if (!m) return { hadT: false, token: "" };
    var token = "";
    try { token = decodeURIComponent(m[1]); } catch (e) { token = ""; }
    return { hadT: true, token: token };
  }

  function consumeTokenFragment(loc, storage, hist) {
    var r = readHashToken(loc.hash || "");
    if (!r.hadT) return { stored: false, stripped: false };
    var stored = false;
    if (isPlausibleToken(r.token)) {
      try { storage.setItem(TOKEN_KEY, r.token); stored = true; } catch (e) {}
    }
    if (hist && typeof hist.replaceState === "function") hist.replaceState(null, "", loc.pathname + (loc.search || ""));
    return { stored: stored, stripped: true };
  }

  return { TOKEN_KEY: TOKEN_KEY, isPlausibleToken: isPlausibleToken, readHashToken: readHashToken, consumeTokenFragment: consumeTokenFragment };
});
