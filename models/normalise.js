/* Normalise TipBot model-stats API payloads (GET /api/model-stats). No DOM. Used by app.js and normalise.test.cjs. */
(function (root, factory) {
  "use strict";
  const api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.NDModelsNormalise = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const MODEL_IDS = ["with_price", "without_price", "agree"];
  const PRICE_BAND_ORDER = ["$1-2", "$2-3", "$3-5", "$5-8", "$8-15", "$15+"];
  /* by_threshold: 9 fixed bands of the model's win chance frozen at 7am (not price, not stake). */
  const THRESHOLD_ORDER = ["<30%", "30-32%", "32-35%", "35-40%", "40-45%", "45-50%", "50-60%", "60-70%", "70%+"];
  /* by_min_threshold: cumulative "what if the cut were X%" rows. */
  const MIN_THRESHOLD_ORDER = [30, 32, 35, 40, 45, 50, 60, 70];
  const SCOPES = new Set(["server", "all"]);
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
      picks: num(x.picks),
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
    const out = {
      date: x.date != null ? String(x.date) : "",
      picks: num(x.picks),
      bets: num(x.bets),
      wins: num(x.wins),
      losses: num(x.losses),
      hyp_bets: num(x.hyp_bets),
      hyp_wins: num(x.hyp_wins),
      pl_units: num(x.pl_units),
      hyp_pl_units: num(x.hyp_pl_units),
      cum_units: pickField(x, "cum_units", "cum"),
      hyp_cum_units: pickField(x, "hyp_cum_units", "hyp_cum"),
    };
    out.reconstructed = !!x.reconstructed;
    return out;
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
    if (x.picks != null) out.picks = num(x.picks);
    if (x.staked_units != null) out.staked_units = num(x.staked_units);
    if (x.min_pct != null) out.min_pct = num(x.min_pct);
    const hyp = normHypBlock(x.hyp);
    if (hyp) out.hyp = hyp;
    return out;
  }

  function emptyBand(label) {
    return { label: label, picks: 0, bets: 0, wins: 0, strike_pct: 0, staked_units: 0, pl_units: 0, roi_pct: 0 };
  }

  /** by_threshold in the fixed contract order; a missing band shows as an empty row. Absent field → []. */
  function normThreshold(rows) {
    if (!Array.isArray(rows)) return [];
    const byLabel = new Map(rows.map(normBreakdownRow).map((r) => [r.label, r]));
    const out = THRESHOLD_ORDER.map((label) => byLabel.get(label) || emptyBand(label));
    for (const [label, r] of byLabel) if (!THRESHOLD_ORDER.includes(label)) out.push(r);
    return out;
  }

  /** by_min_threshold sorted by min_pct (30%+ … 70%+). Absent field → []. */
  function normMinThreshold(rows) {
    if (!Array.isArray(rows)) return [];
    return rows.map(normBreakdownRow).map((r) => {
      if (r.min_pct == null) {
        const m = /^(\d+)%\+$/.exec(r.label);
        if (m) r.min_pct = Number(m[1]);
      }
      return r;
    }).sort((a, b) => num(a.min_pct, 999) - num(b.min_pct, 999));
  }

  function normCalendarSlice(x) {
    if (!x || typeof x !== "object") return null;
    return {
      picks: num(x.picks),
      bets: num(x.bets),
      wins: num(x.wins),
      losses: num(x.losses),
      pl_units: num(x.pl_units),
      hyp_bets: num(x.hyp_bets),
      hyp_wins: num(x.hyp_wins),
      hyp_pl_units: num(x.hyp_pl_units),
    };
  }

  /** Top-level calendar[]: one row per day with all three models side by side. */
  function normCalendar(rows) {
    if (!Array.isArray(rows)) return [];
    return rows
      .filter((r) => r && typeof r === "object" && r.date)
      .map((r) => {
        const out = { date: String(r.date), weekday: r.weekday != null ? String(r.weekday) : "" };
        for (const id of MODEL_IDS) out[id] = normCalendarSlice(r[id]);
        if (r.reconstructed) out.reconstructed = true;
        return out;
      })
      .sort((a, b) => a.date.localeCompare(b.date));
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
    const out = {
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
    const hyp = normHypBlock(x.hyp);
    if (hyp) out.hyp = hyp;
    return out;
  }

  function normMeta(m) {
    if (!m || typeof m !== "object") return null;
    const dataSince = m.data_since != null ? String(m.data_since) : "";
    const picks = num(m.picks);
    const staked = num(m.staked_picks);
    const hasFlag = Object.prototype.hasOwnProperty.call(m, "reconstructed_available");
    const hasWindow = m.reconstructed && typeof m.reconstructed === "object";
    if (!dataSince && !picks && !staked && m.data_since == null && m.picks == null && m.staked_picks == null && !hasFlag && !hasWindow) {
      return null;
    }
    const out = {
      data_since: dataSince,
      picks,
      staked_picks: staked,
    };
    if (hasFlag) out.reconstructed_available = !!m.reconstructed_available;
    if (hasWindow) {
      out.reconstructed = {
        from: m.reconstructed.from != null ? String(m.reconstructed.from) : "",
        to: m.reconstructed.to != null ? String(m.reconstructed.to) : "",
        data_since: m.reconstructed.data_since != null ? String(m.reconstructed.data_since) : "",
        picks: num(m.reconstructed.picks),
      };
    }
    return out;
  }

  function normReconstructedBlock(block) {
    if (!block || typeof block !== "object") return null;
    const summary = normSummary(block.summary);
    const hyp = normHypBlock(block.hyp) || summary.hyp || null;
    if (hyp && !summary.hyp) summary.hyp = hyp;
    const out = {
      summary,
      by_weekday: Array.isArray(block.by_weekday) ? block.by_weekday.map(normWeekdayRow) : [],
    };
    if (hyp) out.hyp = hyp;
    return out;
  }

  function normRecent(r) {
    const x = r && typeof r === "object" ? r : {};
    const raw = x.result != null ? String(x.result).toLowerCase() : "";
    const result = VALID_RESULTS.has(raw) ? raw : "void";
    const out = {
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
    if (x.reconstructed) out.reconstructed = true;
    return out;
  }

  function normModelBlock(block) {
    const m = block && typeof block === "object" ? block : {};
    const weekday = Array.isArray(m.by_weekday) ? m.by_weekday.map(normWeekdayRow) : [];
    const summary = normSummary(m.summary);
    const hyp = normHypBlock(m.hyp) || summary.hyp || null;
    if (hyp && !summary.hyp) summary.hyp = hyp;
    const meta = normMeta(m.meta);
    const out = {
      summary,
      daily: Array.isArray(m.daily) ? m.daily.map(normDaily) : [],
      by_price_band: normBreakdown(m.by_price_band, "price_band"),
      by_track: normBreakdown(m.by_track, "track"),
      by_stake_bracket: normBreakdown(m.by_stake_bracket, "stake"),
      by_threshold: normThreshold(m.by_threshold),
      by_min_threshold: normMinThreshold(m.by_min_threshold),
      by_weekday: weekday,
      recent: Array.isArray(m.recent) ? m.recent.map(normRecent) : [],
    };
    if (hyp) out.hyp = hyp;
    if (meta) out.meta = meta;
    const recon = normReconstructedBlock(m.reconstructed);
    if (recon) out.reconstructed = recon;
    return out;
  }

  function normHeadToHead(h) {
    const x = h && typeof h === "object" ? h : {};
    const days = Array.isArray(x.days)
      ? x.days.map((d) => {
          const row = d && typeof d === "object" ? d : {};
          const out = {
            date: row.date != null ? String(row.date) : "",
            with_price: num(row.with_price),
            without_price: num(row.without_price),
            agree: num(row.agree),
          };
          if (row.reconstructed) out.reconstructed = true;
          return out;
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
    if (data.meta && typeof data.meta === "object") {
      for (const id of MODEL_IDS) {
        if (!models[id].meta) {
          const pack = normMeta(data.meta[id]);
          if (pack) models[id].meta = pack;
        }
      }
    }
    const out = {
      generated_at: data.generated_at != null ? String(data.generated_at) : "",
      range: {
        from: range.from != null ? String(range.from) : "",
        to: range.to != null ? String(range.to) : "",
      },
      models,
      calendar: normCalendar(data.calendar),
      head_to_head: normHeadToHead(data.head_to_head),
    };
    // scope is only "server" or "all"; the payload never carries server ids or names, and none are shown.
    if (SCOPES.has(data.scope)) out.scope = data.scope;
    if (topMeta) out.meta = topMeta;
    return out;
  }

  function notReconstructed(row) {
    return !(row && row.reconstructed);
  }

  /** Drop reconstructed rows when the toggle is off. Summaries are left as sent. */
  function filterReconstructed(payload, include) {
    if (!payload || typeof payload !== "object") return payload;
    if (include) return payload;
    const modelsIn = payload.models && typeof payload.models === "object" ? payload.models : {};
    const models = {};
    for (const id of MODEL_IDS) {
      const m = modelsIn[id] && typeof modelsIn[id] === "object" ? modelsIn[id] : {};
      const next = Object.assign({}, m, {
        daily: Array.isArray(m.daily) ? m.daily.filter(notReconstructed) : [],
        recent: Array.isArray(m.recent) ? m.recent.filter(notReconstructed) : [],
      });
      delete next.reconstructed;
      models[id] = next;
    }
    const h = payload.head_to_head && typeof payload.head_to_head === "object" ? payload.head_to_head : {};
    return Object.assign({}, payload, {
      models,
      calendar: Array.isArray(payload.calendar) ? payload.calendar.filter(notReconstructed) : [],
      head_to_head: Object.assign({}, h, {
        days: Array.isArray(h.days) ? h.days.filter(notReconstructed) : [],
      }),
    });
  }

  return {
    MODEL_IDS,
    PRICE_BAND_ORDER,
    THRESHOLD_ORDER,
    MIN_THRESHOLD_ORDER,
    normThreshold,
    normMinThreshold,
    normCalendar,
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
    filterReconstructed,
    normReconstructedBlock,
  };
});