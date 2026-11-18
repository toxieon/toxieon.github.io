/* Model stats API URL builder (no fetch). */
(function (root, factory) {
  "use strict";
  const api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.NDModelsApi = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

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

  return { buildModelStatsUrl, describeApiError };
});