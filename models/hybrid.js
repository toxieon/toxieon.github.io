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

  function normalisePick(raw) {
    if (!raw || typeof raw !== "object") return null;
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

  function normaliseDay(raw) {
    if (!raw || typeof raw !== "object") return null;
    const date = String(raw.date || raw.day || "").slice(0, 10);
    if (!ISO.test(date)) return null;
    const list = Array.isArray(raw.picks) ? raw.picks : [];
    const picks = [];
    for (const p of list) {
      const n = normalisePick(p);
      if (n) picks.push(n);
    }
    return enrichDay({ date, picks });
  }

  /**
   * Adapter for GET /api/model-stats/hybrid-picks.
   * Proposed shape: {ok, range:{from,to}, days:[{date, picks:[{horse, track, race_no, price, price_stage, p_win, stake_units, result, pl_units}]}]}
   * This is the function to change if Husker's live shape differs.
   */
  function adaptHybridPayload(payload) {
    const byDate = new Map();
    for (const raw of dayList(payload)) {
      const d = normaliseDay(raw);
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
  function demoHybridPicks(from, to) {
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
          price_stage: "t60",
          p_win: 0.28 + ((i + j) % 5) * 0.04,
          stake_units: 1,
          result: res,
          pl_units: res === "won" ? round2(price - 1) : res === "lost" ? -1 : 0,
        });
        if (!settled && res === "pending") picks[picks.length - 1].pl_units = null;
      }
      days.push({ date, picks });
    }
    return { ok: true, range: { from, to }, days };
  }

  return {
    resultCode,
    adaptHybridPayload,
    computeHybridTotals,
    dayTone,
    dataRange,
    demoHybridPicks,
    enrichDay,
    isSettled,
    round2,
  };
});
