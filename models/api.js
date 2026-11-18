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

  return { buildModelStatsUrl };
});