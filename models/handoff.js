/* Consume ?tipdash handoff: #t=<token> → nd_models_owner_token (strip hash immediately). */
(function (root, factory) {
  "use strict";
  const api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.NDModelsHandoff = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const TOKEN_KEY = "nd_models_owner_token";
  const MIN_LEN = 16;
  const MAX_LEN = 4096;

  function isPlausibleToken(token) {
    if (typeof token !== "string") return false;
    if (token.length < MIN_LEN || token.length > MAX_LEN) return false;
    return !/[\s\u0000-\u001f\u007f]/.test(token);
  }

  function hashHasTParam(hash) {
    if (!hash || hash.charAt(0) !== "#") return false;
    const raw = hash.slice(1);
    if (!raw) return false;
    try {
      return new URLSearchParams(raw).has("t");
    } catch (e) {
      return /(^|&)t=/.test(raw) || raw.indexOf("t=") === 0;
    }
  }

  function decodeTokenParam(encoded) {
    if (encoded == null || encoded === "") return "";
    try {
      return decodeURIComponent(encoded);
    } catch (e) {
      return "";
    }
  }

  function readHashToken(hash) {
    if (!hashHasTParam(hash)) return { hadT: false, token: "" };
    const raw = hash.slice(1);
    let encoded = "";
    try {
      encoded = new URLSearchParams(raw).get("t");
    } catch (e) {
      const m = raw.match(/(?:^|&)t=([^&]*)/);
      encoded = m ? m[1] : "";
    }
    return { hadT: true, token: decodeTokenParam(encoded) };
  }

  /**
   * @param {Pick<Location,'hash'|'pathname'|'search'>} loc
   * @param {{ setItem: Function }} storage
   * @param {{ replaceState: Function }} hist
   * @returns {{ stored: boolean, stripped: boolean }}
   */
  function consumeTokenFragment(loc, storage, hist) {
    const hash = loc.hash || "";
    const { hadT, token } = readHashToken(hash);
    if (!hadT) return { stored: false, stripped: false };
    let stored = false;
    if (isPlausibleToken(token)) {
      storage.setItem(TOKEN_KEY, token);
      stored = true;
    }
    if (hist && typeof hist.replaceState === "function") {
      const url = loc.pathname + (loc.search || "");
      hist.replaceState(null, "", url);
    }
    return { stored, stripped: true };
  }

  if (typeof window !== "undefined" && window.location && window.localStorage && window.history) {
    consumeTokenFragment(window.location, window.localStorage, window.history);
  }

  return {
    TOKEN_KEY,
    isPlausibleToken,
    consumeTokenFragment,
    readHashToken,
    hashHasTParam,
  };
});