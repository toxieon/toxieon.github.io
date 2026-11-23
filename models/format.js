/* Display formatters for model stats (no DOM). */
(function (root, factory) {
  "use strict";
  const api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.NDModelsFormat = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const HEADLINE_SINCE = "2026-11-06";
  const RECONSTRUCTED_FROM = "2026-10-13";
  const RECONSTRUCTED_TO = "2026-11-05";
  const SMALL_SAMPLE_N = 30;

  function formatPct(pct, opts) {
    if (!Number.isFinite(pct)) return "—";
    const body = (Math.round(pct * 10) / 10).toFixed(1) + "%";
    if (opts && opts.signed && pct >= 0) return "+" + body;
    return body;
  }

  /** e.g. "+12.4% (n=26)" when signed, or "32.0% (n=26)". */
  function formatPctWithN(pct, n, opts) {
    const count = Number.isFinite(Number(n)) ? Math.trunc(Number(n)) : 0;
    return formatPct(pct, opts) + " (n=" + count + ")";
  }

  function isSmallSample(n) {
    const count = Number(n);
    return Number.isFinite(count) && count < SMALL_SAMPLE_N;
  }

  /** Sample size for a flat-1u figure: hyp.bets, else fallback. */
  function hypSampleN(hyp, fallback) {
    if (hyp && hyp.bets != null && hyp.bets !== "") {
      const n = Number(hyp.bets);
      return Number.isFinite(n) ? n : 0;
    }
    const fb = Number(fallback);
    return Number.isFinite(fb) ? fb : 0;
  }

  function formatIsoShort(iso) {
    try {
      const d = new Date(String(iso) + "T12:00:00Z");
      if (Number.isNaN(d.getTime())) return String(iso || "");
      return new Intl.DateTimeFormat("en-AU", {
        day: "numeric",
        month: "short",
        year: "numeric",
        timeZone: "UTC",
      }).format(d);
    } catch (e) {
      return String(iso || "");
    }
  }

  /**
   * Headline stays frozen at 6 Nov 2026. When reconstructed is on and
   * meta.data_since is earlier, append the incl. reconstructed note.
   */
  function formatDataSince(meta, options) {
    if (!meta) return "";
    const include = !!(options && options.includeReconstructed);
    const parts = ["Data since " + formatIsoShort(HEADLINE_SINCE)];
    if (meta.picks) {
      let mid = Number(meta.picks).toLocaleString("en-AU") + " picks";
      if (meta.staked_picks) {
        mid += " (" + Number(meta.staked_picks).toLocaleString("en-AU") + " staked)";
      }
      parts.push(mid);
    }
    let line = parts.join(" · ");
    const since = meta.data_since != null ? String(meta.data_since) : "";
    if (include && since && since < HEADLINE_SINCE) {
      line += " (incl. reconstructed from 13 Oct)";
    }
    return line;
  }

  function formatPicksStaked(picks, staked) {
    const p = Number.isFinite(Number(picks)) ? Number(picks) : 0;
    const s = Number.isFinite(Number(staked)) ? Number(staked) : 0;
    return p.toLocaleString("en-AU") + " picks · " + s.toLocaleString("en-AU") + " staked";
  }

  /**
   * Show the reconstructed toggle only when this payload says the estimate is
   * available and at least one model has a non-empty reconstructed block.
   * Absence of reconstructed_available (flag not requested) is not enough.
   */
  function reconstructedToggleVisible(meta, models) {
    if (!meta || meta.reconstructed_available !== true) return false;
    const src = models && typeof models === "object" ? models : {};
    const ids = ["with_price", "without_price", "agree"];
    return ids.some((id) => {
      const block = src[id] && src[id].reconstructed;
      if (!block || typeof block !== "object") return false;
      const picks = block.summary && Number(block.summary.picks);
      const daily = Array.isArray(block.daily) ? block.daily.length : 0;
      return (Number.isFinite(picks) && picks > 0) || daily > 0;
    });
  }

  const RECON_CHART_LABEL =
    "Reconstructed estimate (fair price 1/market_p), 13 Oct to 5 Nov, not live results";

  return {
    HEADLINE_SINCE,
    RECONSTRUCTED_FROM,
    RECONSTRUCTED_TO,
    SMALL_SAMPLE_N,
    RECON_CHART_LABEL,
    formatPct,
    formatPctWithN,
    isSmallSample,
    hypSampleN,
    formatIsoShort,
    formatDataSince,
    formatPicksStaked,
    reconstructedToggleVisible,
  };
});
