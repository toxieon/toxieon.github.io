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
  /** Horse-server route: open to members of the horse server (and the owner). Not /api/owner/model-stats. */
  const STATS_PATH = "/api/model-stats";
  /** TipBot's single daily best pick per day (highest 7am win chance). Same auth and errors as STATS_PATH. */
  const BEST_PICKS_PATH = "/api/model-stats/best-picks";
  /** HorsePicks tips that matched the With model's top pick that race. Same auth and errors as STATS_PATH. */
  const HYBRID_PICKS_PATH = "/api/model-stats/hybrid-picks";
  /** Longest wait honoured from a 503 {error:"db_busy", retry_after} before the one retry. */
  const RETRY_AFTER_CAP_S = 15;
  const DEFAULT_RETRY_MS = 1500;
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

  /** Drop only this page's key (used for a fresh "sign in again" after 403, so a shared Black Book token survives). */
  function clearPrimaryToken(storage) {
    try { storage.removeItem(TOKEN_KEY); } catch (e) { /* ignore */ }
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
      case "not_authorised": return "That Discord account isn't allowed to sign in here.";
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
    return base + STATS_PATH + "?" + params.toString();
  }

  function buildBestPicksUrl(apiBase, from, to) {
    const base = String(apiBase || "").replace(/\/+$/, "");
    const params = new URLSearchParams();
    params.set("from", from);
    params.set("to", to);
    return base + BEST_PICKS_PATH + "?" + params.toString();
  }

  function buildHybridPicksUrl(apiBase, from, to) {
    const base = String(apiBase || "").replace(/\/+$/, "");
    const params = new URLSearchParams();
    params.set("from", from);
    params.set("to", to);
    return base + HYBRID_PICKS_PATH + "?" + params.toString();
  }

  /** Milliseconds to wait before retrying an unavailable response. 503 {error:"db_busy", retry_after:N}
   *  waits N seconds (capped at 15); anything else keeps the short 1.5 s wait. */
  function retryDelayMs(status, body) {
    const code = body && body.error != null ? String(body.error) : "";
    const n = body ? Number(body.retry_after) : NaN;
    if (status === 503 && code === "db_busy" && Number.isFinite(n) && n > 0) {
      return Math.round(Math.min(n, RETRY_AFTER_CAP_S) * 1000);
    }
    return DEFAULT_RETRY_MS;
  }

  /** Classify a stats response. kind drives the UI:
   *  ok · signin (401, sign in again) · forbidden (403, signed in but not in the horse server; keep the token) ·
   *  not_configured (503, TipBot not set up yet; keep the token) · unavailable (503/502, retry later) ·
   *  not_live (404, route not deployed yet) · rate_limited (429) · bad_request (400) · error. */
  function classifyStats(status, body) {
    const code = body && body.error != null ? String(body.error) : "";
    if (status === 200) return "ok";
    if (status === 401) return "signin";
    if (status === 403) return "forbidden";
    if (status === 503 && code === "not_configured") return "not_configured";
    if (status === 503 || status === 502) return "unavailable";
    if (status === 404) return "not_live";
    if (status === 429) return "rate_limited";
    if (status === 400) return "bad_request";
    return "error";
  }

  /* In-memory only (never localStorage or the SW cache): TipBot caches each query for 2 minutes,
   * so asking again sooner is wasted. Keyed by URL + token so a new sign-in refetches. */
  const CACHE_TTL_MS = 120000;
  const memo = new Map();

  function clearStatsCache() { memo.clear(); }

  /**
   * GET one model-stats URL with a Bearer token, credentials omitted. Returns {status, data, kind, cached}.
   * status 0 = network failure. One retry on 502 or 503 unavailable: after 1.5 s (Render cold start), or after
   * retry_after seconds (max 15) when TipBot says 503 {error:"db_busy", retry_after}. Used for best picks too.
   * opts: {fetch, sleep, now}.
   */
  async function requestModelStats(url, token, opts) {
    const o = opts || {};
    const doFetch = o.fetch || (typeof fetch !== "undefined" ? fetch : null);
    const sleep = o.sleep || ((ms) => new Promise((ok) => setTimeout(ok, ms)));
    const now = o.now || Date.now;
    const key = url + "\n" + (token || "");
    const hit = memo.get(key);
    if (hit && now() - hit.at < CACHE_TTL_MS) return Object.assign({}, hit.res, { cached: true });
    for (let i = 1; i <= 2; i++) {
      let r;
      try {
        r = await doFetch(url, {
          method: "GET",
          headers: token ? { Authorization: "Bearer " + token } : {},
          credentials: "omit",
          cache: "no-store",
        });
      } catch (e) {
        if (i < 2) { await sleep(1500); continue; }
        return { status: 0, data: {}, kind: "error", cached: false };
      }
      let data = null;
      try { data = await r.json(); } catch (e) { data = null; }
      data = data || {};
      const kind = classifyStats(r.status, data);
      if (kind === "unavailable" && i < 2) { await sleep(retryDelayMs(r.status, data)); continue; }
      const res = { status: r.status, data: data, kind: kind, cached: false };
      if (kind === "ok") memo.set(key, { at: now(), res: res });
      return res;
    }
    return { status: 0, data: {}, kind: "error", cached: false };
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
    readToken, saveToken, clearToken, clearPrimaryToken, buildModelStatsUrl, describeApiError,
    STATS_PATH, CACHE_TTL_MS, classifyStats, requestModelStats, clearStatsCache,
    BEST_PICKS_PATH, buildBestPicksUrl, HYBRID_PICKS_PATH, buildHybridPicksUrl, retryDelayMs, RETRY_AFTER_CAP_S,
  };
});