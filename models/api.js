/* TipBot Models API client: model-stats URL builder plus the Discord sign-in pieces
 * (same contract as Black Book 0.2.1). Bearer token only, no cookies, credentials omitted.
 * The host is public config, not a secret. */
(function (root, factory) {
  "use strict";
  const api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.NDModelsApi = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const API_BASE = "https://afl-tipster-bot.onrender.com";
  const TOKEN_KEY = "nd_models_owner_token";
  /** Read-only fallback: the same TipBot session token saved by Black Book on this origin. Never written here. */
  const FALLBACK_TOKEN_KEYS = ["nd_owner_token"];
  const CANONICAL_RETURN = "https://www.neilldata.com/models/";
  const RETURN_ORIGINS = ["https://www.neilldata.com", "https://neilldata.com"];

  /** Post-login landing URL for TipBot's return_to. Same origin when already on www or apex neilldata.com. */
  function returnToUrl(origin) {
    const o = String(origin || "").replace(/\/$/, "");
    for (let i = 0; i < RETURN_ORIGINS.length; i++) {
      if (o === RETURN_ORIGINS[i]) return o + "/models/";
    }
    return CANONICAL_RETURN;
  }

  /** TipBot Discord OAuth start. Top-level navigation only: no XHR, no cookies. */
  function loginUrl(origin) {
    return API_BASE + "/auth/login?return_to=" + encodeURIComponent(returnToUrl(origin));
  }

  /** POST /api/auth/exchange once. The body is the one-time #code= value, not a session token.
   *  No Authorization header. 200 {token} returns that session token; anything else returns an empty token. */
  async function exchangeCode(code, opts) {
    const o = opts || {};
    const doFetch = o.fetch || (typeof fetch !== "undefined" ? fetch : null);
    if (!doFetch || typeof code !== "string" || !code) return { status: 0, token: "", data: {} };
    try {
      const r = await doFetch(API_BASE + "/api/auth/exchange", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        cache: "no-store",
        credentials: "omit",
        body: JSON.stringify({ code: code }),
      });
      let data = null;
      try { data = await r.json(); } catch (e) { data = null; }
      data = data || {};
      const token = r.status === 200 && typeof data.token === "string" ? data.token : "";
      return { status: r.status, token: token, data: data };
    } catch (err) {
      return { status: 0, token: "", data: {} };
    }
  }

  function isStoreableToken(token) {
    if (typeof token !== "string") return false;
    if (token.length < 16 || token.length > 4096) return false;
    return !/[\s\u0000-\u001f\u007f]/.test(token);
  }

  function readToken(storage) {
    try {
      const keys = [TOKEN_KEY].concat(FALLBACK_TOKEN_KEYS);
      for (let i = 0; i < keys.length; i++) {
        const v = storage.getItem(keys[i]);
        if (v) return v;
      }
    } catch (e) { /* ignore */ }
    return "";
  }
  function saveToken(storage, token) { try { storage.setItem(TOKEN_KEY, token); } catch (e) { /* ignore */ } }
  /** Sign out or 401: clear every key this page reads, so a dead token is never retried. */
  function clearToken(storage) {
    try { [TOKEN_KEY].concat(FALLBACK_TOKEN_KEYS).forEach((k) => storage.removeItem(k)); } catch (e) { /* ignore */ }
  }

  /** Exchange the one-time code and, on success, store the session token as nd_models_owner_token. */
  async function exchangeAndStore(code, storage, opts) {
    const res = await exchangeCode(code, opts);
    if (res.status === 200 && isStoreableToken(res.token)) {
      saveToken(storage, res.token);
      return { ok: true, status: 200 };
    }
    return { ok: false, status: res.status };
  }

  /** Text for a TipBot #error= code or a failed exchange. */
  function describeAuthError(code) {
    switch (String(code || "")) {
      case "not_authorised": return "That Discord account isn't allowed here. Model stats are for the owner only.";
      case "region_declined": return "Sign-in isn't available from your region.";
      case "rate_limited": return "Too many sign-in attempts. Wait a minute and try again.";
      case "": return "";
      default: return "Sign-in did not complete. Try again.";
    }
  }

  function buildModelStatsUrl(apiBase, from, to, options) {
    const base = String(apiBase || "").replace(/\/+$/, "");
    const params = new URLSearchParams();
    params.set("from", from);
    params.set("to", to);
    const opts = options && typeof options === "object" ? options : {};
    if (opts.stakedOnly) params.set("staked_only", "1");
    if (opts.includeReconstructed) params.set("include_reconstructed", "1");
    return base + "/api/owner/model-stats?" + params.toString();
  }

  /** Human message for a failed model-stats response. Body is {ok:false, error}. */
  function describeApiError(status, body) {
    const code = body && body.error != null ? String(body.error) : "";
    if (status === 400 && code === "bad_flag") {
      return "The stats API rejected a flag (bad_flag). This page only sends 1 for optional flags.";
    }
    if (status === 400) {
      return "The stats request was rejected" + (code ? " (" + code + ")." : ".");
    }
    if (status) return "Request failed (" + status + ").";
    return "Request failed.";
  }

  return {
    API_BASE, TOKEN_KEY, FALLBACK_TOKEN_KEYS, CANONICAL_RETURN, RETURN_ORIGINS,
    returnToUrl, loginUrl, exchangeCode, exchangeAndStore, describeAuthError,
    readToken, saveToken, clearToken, buildModelStatsUrl, describeApiError,
  };
});