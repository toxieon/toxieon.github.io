/* Normalise owner model-stats API payloads. No DOM. Used by app.js and normalise.test.cjs. */
(function (root, factory) {
  "use strict";
  const api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.NDModelsNormalise = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const MODEL_IDS = ["with_price", "without_price", "agree"];
  const PRICE_BAND_ORDER = ["$1-2", "2-3", "3-5", "5-8", "8-15", "15+"];
  const VALID_RESULTS = new Set(["won", "lost", "placed", "scratched", "void"]);

  function num(v, fallback) {
    if (fallback === undefined) fallback = 0;
    const n = Number(v);
    return Number.isFinite(n) ? n : fallback;
  }

  function normSummary(s) {
    const x = s && typeof s === "object" ? s : {};
    return {
      bets: num(x.bets),
      wins: num(x.wins),
      strike_pct: num(x.strike_pct),
      staked_units: num(x.staked_units),
      pl_units: num(x.pl_units),
      roi_pct: num(x.roi_pct),
    };
  }

  function normDaily(d) {
    const x = d && typeof d === "object" ? d : {};
    return {
      date: x.date != null ? String(x.date) : "",
      bets: num(x.bets),
      wins: num(x.wins),
      pl_units: num(x.pl_units),
      cum_units: num(x.cum_units),
    };
  }

  function normBreakdownRow(row) {
    const x = row && typeof row === "object" ? row : {};
    return {
      label: x.label != null ? String(x.label) : "—",
      bets: num(x.bets),
      wins: num(x.wins),
      strike_pct: num(x.strike_pct),
      pl_units: num(x.pl_units),
      roi_pct: num(x.roi_pct),
    };
  }

  function sortPriceBands(rows) {
    const rank = new Map(PRICE_BAND_ORDER.map((l, i) => [l, i]));
    return rows.slice().sort((a, b) => {
      const ai = rank.has(a.label) ? rank.get(a.label) : 999;
      const bi = rank.has(b.label) ? rank.get(b.label) : 999;
      if (ai !== bi) return ai - bi;
      return String(a.label).localeCompare(String(b.label));
    });
  }

  function normBreakdown(rows, kind) {
    const list = Array.isArray(rows) ? rows.map(normBreakdownRow) : [];
    if (kind === "price_band") return sortPriceBands(list);
    return list;
  }

  function normRecent(r) {
    const x = r && typeof r === "object" ? r : {};
    const raw = x.result != null ? String(x.result).toLowerCase() : "";
    const result = VALID_RESULTS.has(raw) ? raw : "void";
    return {
      date: x.date != null ? String(x.date) : "",
      track: x.track != null ? String(x.track) : "",
      race_no: num(x.race_no),
      horse: x.horse != null ? String(x.horse) : "",
      price: num(x.price),
      stake_units: num(x.stake_units),
      result,
      pl_units: num(x.pl_units),
    };
  }

  function normModelBlock(block) {
    const m = block && typeof block === "object" ? block : {};
    return {
      summary: normSummary(m.summary),
      daily: Array.isArray(m.daily) ? m.daily.map(normDaily) : [],
      by_price_band: normBreakdown(m.by_price_band, "price_band"),
      by_track: normBreakdown(m.by_track, "track"),
      by_stake_bracket: normBreakdown(m.by_stake_bracket, "stake"),
      recent: Array.isArray(m.recent) ? m.recent.map(normRecent) : [],
    };
  }

  function normHeadToHead(h) {
    const x = h && typeof h === "object" ? h : {};
    const days = Array.isArray(x.days)
      ? x.days.map((d) => {
          const row = d && typeof d === "object" ? d : {};
          return {
            date: row.date != null ? String(row.date) : "",
            with_price: num(row.with_price),
            without_price: num(row.without_price),
            agree: num(row.agree),
          };
        })
      : [];
    const dr = x.disagree_races && typeof x.disagree_races === "object" ? x.disagree_races : {};
    return {
      days,
      disagree_races: {
        count: num(dr.count),
        with_wins: num(dr.with_wins),
        without_wins: num(dr.without_wins),
      },
    };
  }

  function normalizeStatsPayload(raw) {
    const data = raw && typeof raw === "object" ? raw : {};
    const range = data.range && typeof data.range === "object" ? data.range : {};
    const modelsIn = data.models && typeof data.models === "object" ? data.models : {};
    const models = {};
    for (const id of MODEL_IDS) {
      models[id] = normModelBlock(modelsIn[id]);
    }
    return {
      generated_at: data.generated_at != null ? String(data.generated_at) : "",
      range: {
        from: range.from != null ? String(range.from) : "",
        to: range.to != null ? String(range.to) : "",
      },
      models,
      head_to_head: normHeadToHead(data.head_to_head),
    };
  }

  return {
    MODEL_IDS,
    PRICE_BAND_ORDER,
    VALID_RESULTS,
    normalizeStatsPayload,
    normSummary,
    normDaily,
    normBreakdownRow,
    sortPriceBands,
    normRecent,
    normHeadToHead,
  };
});