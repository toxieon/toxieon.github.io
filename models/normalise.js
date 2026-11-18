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

  function normHypBlock(h) {
    if (!h || typeof h !== "object") return null;
    const o = {
      bets: num(h.bets),
      wins: num(h.wins),
      strike_pct: num(h.strike_pct),
      pl_units: num(h.pl_units),
      roi_pct: num(h.roi_pct),
    };
    if (!o.bets && !o.wins && !o.pl_units && !o.roi_pct && !h.bets && !h.wins && !h.pl_units && !h.roi_pct) {
      return null;
    }
    return o;
  }

  function normSummary(s) {
    const x = s && typeof s === "object" ? s : {};
    const summary = {
      bets: num(x.bets),
      wins: num(x.wins),
      strike_pct: num(x.strike_pct),
      staked_units: num(x.staked_units),
      pl_units: num(x.pl_units),
      roi_pct: num(x.roi_pct),
    };
    const hyp = normHypBlock(x.hyp);
    if (hyp) summary.hyp = hyp;
    return summary;
  }

  function pickField(x, primary, fallback) {
    if (x[primary] != null && x[primary] !== "") return num(x[primary]);
    if (fallback && x[fallback] != null && x[fallback] !== "") return num(x[fallback]);
    return 0;
  }

  function normDaily(d) {
    const x = d && typeof d === "object" ? d : {};
    return {
      date: x.date != null ? String(x.date) : "",
      picks: num(x.picks),
      bets: num(x.bets),
      wins: num(x.wins),
      pl_units: num(x.pl_units),
      hyp_pl_units: num(x.hyp_pl_units),
      cum_units: pickField(x, "cum_units", "cum"),
      hyp_cum_units: pickField(x, "hyp_cum_units", "hyp_cum"),
    };
  }

  function normBreakdownRow(row) {
    const x = row && typeof row === "object" ? row : {};
    const out = {
      label: x.label != null ? String(x.label) : "—",
      bets: num(x.bets),
      wins: num(x.wins),
      strike_pct: num(x.strike_pct),
      pl_units: num(x.pl_units),
      roi_pct: num(x.roi_pct),
    };
    const hyp = normHypBlock(x.hyp);
    if (hyp) out.hyp = hyp;
    return out;
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

  function normWeekdayRow(row) {
    const x = row && typeof row === "object" ? row : {};
    return {
      label: x.label != null ? String(x.label) : "",
      picks: num(x.picks),
      bets: num(x.bets),
      wins: num(x.wins),
      strike_pct: num(x.strike_pct),
      pl_units: num(x.pl_units),
      roi_pct: num(x.roi_pct),
      hyp_pl_units: num(x.hyp_pl_units),
      hyp_roi_pct: num(x.hyp_roi_pct),
    };
  }

  function normMeta(m) {
    if (!m || typeof m !== "object") return null;
    const dataSince = m.data_since != null ? String(m.data_since) : "";
    const picks = num(m.picks);
    const staked = num(m.staked_picks);
    if (!dataSince && !picks && !staked && m.data_since == null && m.picks == null && m.staked_picks == null) {
      return null;
    }
    return {
      data_since: dataSince,
      picks,
      staked_picks: staked,
    };
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
      hyp_pl_units: num(x.hyp_pl_units),
    };
  }

  function normModelBlock(block) {
    const m = block && typeof block === "object" ? block : {};
    const weekday = Array.isArray(m.by_weekday) ? m.by_weekday.map(normWeekdayRow) : [];
    const meta = normMeta(m.meta);
    const out = {
      summary: normSummary(m.summary),
      daily: Array.isArray(m.daily) ? m.daily.map(normDaily) : [],
      by_price_band: normBreakdown(m.by_price_band, "price_band"),
      by_track: normBreakdown(m.by_track, "track"),
      by_stake_bracket: normBreakdown(m.by_stake_bracket, "stake"),
      by_weekday: weekday,
      recent: Array.isArray(m.recent) ? m.recent.map(normRecent) : [],
    };
    if (meta) out.meta = meta;
    return out;
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
    const topMeta = normMeta(data.meta);
    const out = {
      generated_at: data.generated_at != null ? String(data.generated_at) : "",
      range: {
        from: range.from != null ? String(range.from) : "",
        to: range.to != null ? String(range.to) : "",
      },
      models,
      head_to_head: normHeadToHead(data.head_to_head),
    };
    if (topMeta) out.meta = topMeta;
    return out;
  }

  return {
    MODEL_IDS,
    PRICE_BAND_ORDER,
    VALID_RESULTS,
    normalizeStatsPayload,
    normSummary,
    normDaily,
    pickField,
    normBreakdownRow,
    sortPriceBands,
    normRecent,
    normWeekdayRow,
    normMeta,
    normHypBlock,
    normHeadToHead,
  };
});