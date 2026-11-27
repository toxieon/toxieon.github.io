/* HorsePicks AI Hybrid: payload adapter and totals. Pure functions, no DOM, no storage.
 * Change adaptHybridPayload if Husker's /api/model-stats/hybrid-picks shape differs. */
(function (root, factory) {
  "use strict";
  const api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.NDModelsHybrid = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const ISO = /^\d{4}-\d{2}-\d{2}$/;
  const RESULTS = {
    won: "won", win: "won", winner: "won", w: "won",
    lost: "lost", loss: "lost", lose: "lost", l: "lost", unplaced: "lost", placed: "lost",
    scratched: "scratched", scratch: "scratched",
    abandoned: "scratched", void: "scratched", "called off": "scratched", "no race": "scratched",
    pending: "pending", open: "pending",
  };

  function num(v) {
    if (v === null || v === undefined || v === "") return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }

  function round2(n) {
    return Math.round((n + Number.EPSILON) * 100) / 100;
  }

  /** 'won' | 'lost' | 'scratched' | 'pending'. A pick with no result yet is pending. */
  function resultCode(raw) {
    if (raw === null || raw === undefined || raw === "") return "pending";
    const key = String(raw).trim().toLowerCase();
    return RESULTS[key] || "pending";
  }

  /** The day array from the proposed {days} shape, or {hybrid_picks}, {data}, or a bare array. */
  function dayList(payload) {
    if (Array.isArray(payload)) return payload;
    if (!payload || typeof payload !== "object") return [];
    for (const k of ["days", "hybrid_picks", "data"]) if (Array.isArray(payload[k])) return payload[k];
    return [];
  }

  function isOmitted(row) {
    return !!(row && row.omitted === true);
  }

  function normalisePick(raw, opts) {
    const keepOmitted = !!(opts && opts.includeOmitted);
    if (!raw || typeof raw !== "object") return null;
    if (!keepOmitted && isOmitted(raw)) return null;
    const horse = String(raw.horse || raw.runner_name || raw.name || "").trim();
    if (!horse) return null;
    let pWin = num(raw.p_win);
    if (pWin !== null && pWin > 1) pWin = pWin / 100;
    const stage = raw.price_stage != null ? raw.price_stage : raw.stage;
    return {
      horse,
      track: String(raw.track || "").trim(),
      race_no: num(raw.race_no != null ? raw.race_no : raw.race_number),
      price: num(raw.price != null ? raw.price : raw.odds),
      price_stage: stage ? String(stage) : "",
      p_win: pWin,
      stake_units: num(raw.stake_units),
      result: resultCode(raw.result),
      pl_units: num(raw.pl_units != null ? raw.pl_units : raw.pl),
    };
  }

  function isSettled(pick) {
    return pick && (pick.result === "won" || pick.result === "lost");
  }

  /** Day-level W-L, net units and units staked. Pending and scratched are counted but not included in W-L or stake. */
  function enrichDay(day) {
    let wins = 0, losses = 0, pending = 0, scratched = 0, pl = 0, staked = 0;
    const picks = Array.isArray(day && day.picks) ? day.picks : [];
    for (const p of picks) {
      if (p.result === "pending") pending++;
      else if (p.result === "scratched") scratched++;
      else if (p.result === "won" || p.result === "lost") {
        if (p.result === "won") wins++;
        else losses++;
        if (Number.isFinite(p.pl_units)) pl += p.pl_units;
        staked += Number.isFinite(p.stake_units) && p.stake_units > 0 ? p.stake_units : 1;
      }
    }
    return {
      date: day.date,
      picks,
      wins,
      losses,
      pending,
      scratched,
      pl_units: round2(pl),
      staked_units: round2(staked),
    };
  }

  function normaliseDay(raw, opts) {
    if (!raw || typeof raw !== "object") return null;
    if (!(opts && opts.includeOmitted) && isOmitted(raw)) return null;
    const date = String(raw.date || raw.day || "").slice(0, 10);
    if (!ISO.test(date)) return null;
    const list = Array.isArray(raw.picks) ? raw.picks : [];
    const picks = [];
    for (const p of list) {
      const n = normalisePick(p, opts);
      if (n) picks.push(n);
    }
    if (!picks.length) return null;
    return enrichDay({ date, picks });
  }

  /**
   * Adapter for GET /api/model-stats/hybrid-picks.
   * Live shape (TipBot 0.106.5): {ok, range:{from,to}, days:[{date, picks:[{horse, track, race_no, price, price_stage, p_win, stake_units, result, pl_units}]}]}
   * price_stage is "tip". Rows with omitted:true (include=all non-matches) are dropped
   * unless opts.includeOmitted is set (HorsePicks AI comparison series).
   * This is the function to change if Husker's live shape differs.
   */
  function adaptHybridPayload(payload, opts) {
    const byDate = new Map();
    for (const raw of dayList(payload)) {
      const d = normaliseDay(raw, opts);
      if (d) byDate.set(d.date, d);
    }
    const days = [...byDate.values()].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
    let range = null;
    if (payload && typeof payload === "object" && payload.range && typeof payload.range === "object") {
      const from = String(payload.range.from || "").slice(0, 10);
      const to = String(payload.range.to || "").slice(0, 10);
      range = {
        from: ISO.test(from) ? from : "",
        to: ISO.test(to) ? to : "",
      };
    }
    return {
      ok: !payload || typeof payload !== "object" || payload.ok === undefined ? true : !!payload.ok,
      range,
      days,
    };
  }

  /**
   * Overall totals and the best / worst day (by that day's net units).
   * Pending and scratched picks are excluded from W-L, n, units staked and ROI.
   * ROI % = net units / units staked × 100. n is the number of settled picks (won + lost).
   * On a tie, the earlier date wins. Days with no settled picks are ignored for best/worst.
   */
  function computeHybridTotals(days) {
    let wins = 0, losses = 0, net = 0, staked = 0, pending = 0, scratched = 0;
    let bestDay = null, worstDay = null;
    for (const day of days || []) {
      if (!day) continue;
      wins += day.wins || 0;
      losses += day.losses || 0;
      pending += day.pending || 0;
      scratched += day.scratched || 0;
      if (Number.isFinite(day.pl_units)) net += day.pl_units;
      if (Number.isFinite(day.staked_units)) staked += day.staked_units;
      if ((day.wins || 0) + (day.losses || 0) > 0) {
        const entry = { date: day.date, pl_units: day.pl_units };
        if (!bestDay || entry.pl_units > bestDay.pl_units || (entry.pl_units === bestDay.pl_units && entry.date < bestDay.date)) {
          bestDay = entry;
        }
        if (!worstDay || entry.pl_units < worstDay.pl_units || (entry.pl_units === worstDay.pl_units && entry.date < worstDay.date)) {
          worstDay = entry;
        }
      }
    }
    const n = wins + losses;
    return {
      wins,
      losses,
      n,
      net_units: round2(net),
      staked_units: round2(staked),
      roi_pct: staked > 0 ? round2((net / staked) * 100) : null,
      pending,
      scratched,
      bestDay,
      worstDay,
    };
  }

  /** Reuses the best-pick calendar tone classes: bp-won, bp-lost, bp-pending, bp-void, bp-none. */
  function dayTone(day) {
    if (!day || !(day.picks && day.picks.length)) return "bp-none";
    if ((day.wins || 0) + (day.losses || 0) > 0) {
      if (day.pl_units > 0) return "bp-won";
      if (day.pl_units < 0) return "bp-lost";
      return "bp-void";
    }
    if (day.pending > 0) return "bp-pending";
    return "bp-void";
  }

  /** First and last dates that have at least one pick, for month navigation. */
  function dataRange(days, fallbackTo) {
    const withPicks = (days || []).filter((d) => d && d.picks && d.picks.length);
    if (!withPicks.length) {
      const to = ISO.test(String(fallbackTo || "")) ? fallbackTo : "";
      return { from: to, to: to };
    }
    return { from: withPicks[0].date, to: withPicks[withPicks.length - 1].date };
  }

  /** Synthetic days for localhost ?demo=1 only. Obviously fake names. */
  function demoHybridPicks(from, to, opts) {
    const horses = ["Demo Dasher", "Fake Flyer", "Sample Sprinter", "Test Trotter", "Mock Meteor"];
    const tracks = ["Demo Park", "Sample Oval", "Fake Track West"];
    const results = ["won", "won", "lost", "won", "scratched", "lost", "won", "pending"];
    const days = [];
    let t = Date.UTC(+from.slice(0, 4), +from.slice(5, 7) - 1, +from.slice(8, 10));
    const end = Date.UTC(+to.slice(0, 4), +to.slice(5, 7) - 1, +to.slice(8, 10));
    for (let i = 0; t <= end && i < 400; i++, t += 86400000) {
      if (i % 5 === 3) continue;
      const date = new Date(t).toISOString().slice(0, 10);
      const count = 1 + (i % 3);
      const picks = [];
      for (let j = 0; j < count; j++) {
        const res = t === end && j === 0 ? "pending" : results[(i + j) % results.length];
        const price = [1.8, 2.2, 3.1, 1.65, 2.5][(i + j) % 5];
        const settled = res === "won" || res === "lost";
        picks.push({
          horse: horses[(i + j) % horses.length],
          track: tracks[(i + j) % tracks.length],
          race_no: 1 + ((i + j) % 8),
          price,
          price_stage: "tip",
          p_win: 0.28 + ((i + j) % 5) * 0.04,
          stake_units: 1,
          result: res,
          pl_units: res === "won" ? round2(price - 1) : res === "lost" ? -1 : 0,
        });
        if (!settled && res === "pending") picks[picks.length - 1].pl_units = null;
      }
      if (opts && opts.includeOmitted && i % 4 === 0) {
        picks.push({
          horse: "Omitted Demo",
          track: tracks[i % tracks.length],
          race_no: 9,
          price: 2,
          price_stage: "tip",
          p_win: 0.2,
          stake_units: 1,
          result: "lost",
          pl_units: -1,
          omitted: true,
        });
      }
      days.push({ date, picks });
    }
    return { ok: true, range: { from, to }, days };
  }


  const COMPARE_STORAGE_KEY = "nd_models_hybrid_compare";
  const COMPARE_MODELS = Object.freeze({
    none: { id: "none", label: "None", short: "", source: null },
    with_price: { id: "with_price", label: "With", short: "With", source: "model-stats" },
    without_price: { id: "without_price", label: "Without", short: "W/o", source: "model-stats" },
    agree: { id: "agree", label: "Agree", short: "Agree", source: "model-stats" },
    horsepicks: { id: "horsepicks", label: "HorsePicks AI", short: "HP", source: "hybrid-all" },
  });
  const COMPARE_IDS = Object.freeze(Object.keys(COMPARE_MODELS));

  function compareModel(id) {
    return COMPARE_MODELS[id] || COMPARE_MODELS.none;
  }

  function isCompareId(id) {
    return Object.prototype.hasOwnProperty.call(COMPARE_MODELS, id);
  }

  /** Default is None when the key is missing or the value is unknown. */
  function readCompareChoice(storage) {
    try {
      const v = storage && storage.getItem(COMPARE_STORAGE_KEY);
      return isCompareId(v) ? v : "none";
    } catch (e) {
      return "none";
    }
  }

  function writeCompareChoice(storage, id) {
    const v = isCompareId(id) ? id : "none";
    try {
      if (storage) storage.setItem(COMPARE_STORAGE_KEY, v);
    } catch (e) { /* ignore */ }
    return v;
  }

  function emptyTotals() {
    return {
      wins: 0, losses: 0, n: 0, net_units: 0, staked_units: 0,
      roi_pct: null, pending: 0, scratched: 0, bestDay: null, worstDay: null,
    };
  }

  /** Tone for a compare day that may have no picks array (model-stats calendar slice). */
  function compareDayTone(day) {
    if (!day) return "bp-none";
    if ((day.wins || 0) + (day.losses || 0) > 0 || (day.bets || 0) > 0) {
      if (day.pl_units > 0) return "bp-won";
      if (day.pl_units < 0) return "bp-lost";
      return "bp-void";
    }
    if ((day.pending || 0) > 0) return "bp-pending";
    if (day.picks && day.picks.length) return dayTone(day);
    return "bp-none";
  }

  function sliceFromModelDay(row, modelId) {
    if (!row || typeof row !== "object") return null;
    const date = String(row.date || row.day || "").slice(0, 10);
    if (!ISO.test(date)) return null;
    const slice = row[modelId];
    if (!slice || typeof slice !== "object") return null;
    const wins = Number(slice.wins) || 0;
    const bets = Number(slice.bets) || 0;
    let losses = Number(slice.losses);
    if (!Number.isFinite(losses)) losses = Math.max(0, bets - wins);
    const pl = num(slice.pl_units);
    const staked = num(slice.staked_units);
    if (wins + losses <= 0 && bets <= 0 && pl == null) return null;
    return {
      date,
      wins,
      losses,
      bets,
      pending: 0,
      scratched: 0,
      pl_units: pl != null ? round2(pl) : 0,
      staked_units: staked != null ? round2(staked) : 0,
      picks: [],
    };
  }

  /**
   * Daily units and totals for With / Without / Agree from GET /api/model-stats.
   * Days come from calendar[] (or models[id].daily). Totals prefer models[id].summary
   * (wins, bets, pl_units, staked_units, roi_pct) so ROI is never invented.
   */
  function adaptModelStatsCompare(payload, modelId) {
    const meta = compareModel(modelId);
    if (meta.source !== "model-stats") return { days: [], totals: emptyTotals() };
    const p = payload && typeof payload === "object" ? payload : {};
    const days = [];
    const seen = new Set();
    const push = (row) => {
      const d = sliceFromModelDay(row, modelId);
      if (!d || seen.has(d.date)) return;
      seen.add(d.date);
      days.push(d);
    };
    if (Array.isArray(p.calendar)) p.calendar.forEach(push);
    const block = p.models && p.models[modelId];
    if (!days.length && block && Array.isArray(block.daily)) block.daily.forEach(push);
    days.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
    const fromDays = computeHybridTotals(days);
    const summary = block && block.summary && typeof block.summary === "object" ? block.summary : null;
    if (!summary) {
      if (!days.some((d) => d.staked_units > 0)) fromDays.roi_pct = null;
      return { days, totals: fromDays };
    }
    const wins = Number(summary.wins) || 0;
    const bets = Number(summary.bets) || 0;
    const losses = bets >= wins ? bets - wins : 0;
    const net = num(summary.pl_units) || 0;
    const staked = num(summary.staked_units);
    const roi = num(summary.roi_pct);
    return {
      days,
      totals: {
        wins,
        losses,
        n: bets,
        net_units: round2(net),
        staked_units: staked != null ? round2(staked) : 0,
        roi_pct: roi,
        pending: 0,
        scratched: 0,
        bestDay: fromDays.bestDay,
        worstDay: fromDays.worstDay,
      },
    };
  }

  /** Fake model-stats calendar + summary for localhost ?demo=1. Obviously fake figures. */
  function demoModelStatsCompare(from, to) {
    const models = ["with_price", "without_price", "agree"];
    const calendar = [];
    const buckets = {
      with_price: { wins: 0, bets: 0, pl: 0, staked: 0 },
      without_price: { wins: 0, bets: 0, pl: 0, staked: 0 },
      agree: { wins: 0, bets: 0, pl: 0, staked: 0 },
    };
    let t = Date.UTC(+from.slice(0, 4), +from.slice(5, 7) - 1, +from.slice(8, 10));
    const end = Date.UTC(+to.slice(0, 4), +to.slice(5, 7) - 1, +to.slice(8, 10));
    for (let i = 0; t <= end && i < 400; i++, t += 86400000) {
      if (i % 5 === 3) continue;
      const date = new Date(t).toISOString().slice(0, 10);
      const row = { date };
      models.forEach((id, mi) => {
        const win = (i + mi) % 3 !== 1;
        const pl = win ? round2(0.8 + ((i + mi) % 4) * 0.4) : -1;
        const wins = win ? 1 + ((i + mi) % 2) : 0;
        const losses = win ? (i + mi) % 2 : 1 + ((i + mi) % 2);
        const bets = wins + losses;
        row[id] = { picks: bets, bets, wins, losses, pl_units: round2(pl * (wins || 1)), hyp_bets: 0, hyp_wins: 0, hyp_pl_units: 0 };
        const b = buckets[id];
        b.wins += wins;
        b.bets += bets;
        b.pl += row[id].pl_units;
        b.staked += bets;
      });
      calendar.push(row);
    }
    const outModels = {};
    models.forEach((id) => {
      const b = buckets[id];
      outModels[id] = {
        summary: {
          picks: b.bets,
          bets: b.bets,
          wins: b.wins,
          staked_units: round2(b.staked),
          pl_units: round2(b.pl),
          roi_pct: b.staked > 0 ? round2((b.pl / b.staked) * 100) : null,
        },
      };
    });
    return { ok: true, range: { from, to }, calendar, models: outModels };
  }

  return {
    resultCode,
    adaptHybridPayload,
    computeHybridTotals,
    dayTone,
    compareDayTone,
    dataRange,
    demoHybridPicks,
    demoModelStatsCompare,
    enrichDay,
    isSettled,
    round2,
    COMPARE_STORAGE_KEY,
    COMPARE_MODELS,
    COMPARE_IDS,
    compareModel,
    isCompareId,
    readCompareChoice,
    writeCompareChoice,
    adaptModelStatsCompare,
    emptyTotals,
  };
});
