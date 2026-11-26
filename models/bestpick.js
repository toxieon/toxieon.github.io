/* Best pick of the day: payload normalising and the ladder maths. Pure functions, no DOM, no storage. */
(function (root, factory) {
  "use strict";
  const api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.NDModelsBestPick = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const ISO = /^\d{4}-\d{2}-\d{2}$/;
  const RESULTS = {
    won: "won", win: "won", winner: "won", w: "won",
    lost: "lost", loss: "lost", lose: "lost", l: "lost", unplaced: "lost", placed: "lost",
    scratched: "scratched", scratch: "scratched",
    abandoned: "abandoned", void: "abandoned", "called off": "abandoned", "no race": "abandoned",
    pending: "pending", open: "pending",
  };
  const LOSS_RULES = ["reset", "stop"];

  function num(v) {
    if (v === null || v === undefined || v === "") return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }

  function round2(n) {
    return Math.round((n + Number.EPSILON) * 100) / 100;
  }

  /** 'won' | 'lost' | 'scratched' | 'abandoned' | 'pending'. A pick with no result yet is pending. */
  function resultCode(raw) {
    if (raw === null || raw === undefined || raw === "") return "pending";
    const key = String(raw).trim().toLowerCase();
    return RESULTS[key] || "pending";
  }

  /** The day array from {days}, {best_picks}, {data} or a bare array. */
  function dayList(payload) {
    if (Array.isArray(payload)) return payload;
    if (!payload || typeof payload !== "object") return [];
    for (const k of ["days", "best_picks", "data"]) if (Array.isArray(payload[k])) return payload[k];
    return [];
  }

  /** One day: {date, pick} where pick is null (no pick that day) or the normalised pick.
   *  Accepts the pick fields flat on the day or nested under day.pick. */
  function normaliseDay(raw) {
    if (!raw || typeof raw !== "object") return null;
    const date = String(raw.date || raw.day || "").slice(0, 10);
    if (!ISO.test(date)) return null;
    const src = raw.pick && typeof raw.pick === "object" ? Object.assign({}, raw, raw.pick) : raw;
    const horse = String(src.horse || src.runner_name || src.name || "").trim();
    if (raw.pick === null || !horse) return { date, pick: null };
    let pWin = num(src.p_win);
    if (pWin !== null && pWin > 1) pWin = pWin / 100;
    return {
      date,
      pick: {
        horse,
        track: String(src.track || "").trim(),
        race_no: num(src.race_no != null ? src.race_no : src.race_number),
        price: num(src.price != null ? src.price : src.odds),
        p_win: pWin,
        stake_units: num(src.stake_units),
        result: resultCode(src.result),
        pl_units: num(src.pl_units),
        model: src.model ? String(src.model) : "",
        stage: src.stage ? String(src.stage) : "",
      },
    };
  }

  /** Human label for TipBot's price stage: "t60" → "T-60", "07" → "7am", "09" → "9am"; anything else as sent. */
  function stageLabel(stage) {
    const raw = String(stage == null ? "" : stage).trim();
    if (!raw) return "";
    const t = /^t-?(\d+)$/i.exec(raw);
    if (t) return "T-" + Number(t[1]);
    const h = /^(\d{1,2})(?:am)?$/i.exec(raw);
    if (h && Number(h[1]) >= 1 && Number(h[1]) <= 12) return Number(h[1]) + "am";
    return raw;
  }

  /** Sorted, one entry per date (the last one wins if TipBot repeats a date). */
  function normaliseBestPicks(payload) {
    const byDate = new Map();
    for (const raw of dayList(payload)) {
      const d = normaliseDay(raw);
      if (d) byDate.set(d.date, d);
    }
    return [...byDate.values()].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  }

  function earliestPickDate(days) {
    const hit = (days || []).find((d) => d && d.pick);
    return hit ? hit.date : "";
  }

  /**
   * Ladder: the whole bank goes on each day's best pick from startDate on.
   *  won        bank = bank × price (a $20 bet at 1.5 returns $30)
   *  lost       bank = 0; "reset" starts a new ladder at the starting stake on the next pick,
   *             "stop" ends the ladder (busted) and later days are not bet
   *  scratched / abandoned / no pick   no bet, bank carries over
   *  pending    shown, not counted, bank unchanged
   * A won pick with no usable price (missing or ≤ 1) is treated as no bet.
   * Cash in = starting stake × ladders started (a ladder starts when its first bet is placed).
   */
  function computeLadder(days, opts) {
    const o = opts || {};
    const stake = round2(Math.max(0, num(o.stake) || 0));
    const onLoss = LOSS_RULES.includes(o.onLoss) ? o.onLoss : "reset";
    const start = ISO.test(String(o.startDate || "")) ? o.startDate : earliestPickDate(days);
    const rows = [];
    let bank = stake;
    let needNewLadder = true; // the first bet starts ladder 1
    let ladders = 0;
    let resets = 0;
    let busted = false;
    let streak = 0;
    let bestStreak = 0;
    let peak = 0;
    let wins = 0;
    let losses = 0;
    let pending = 0;
    for (const day of days || []) {
      if (!day || (start && day.date < start)) continue;
      const pick = day.pick;
      const row = { date: day.date, horse: pick ? pick.horse : "", price: pick ? pick.price : null,
        stake: null, result: pick ? pick.result : "none", bankAfter: null, note: "", ladder: ladders || 1 };
      if (busted) {
        row.note = "stopped";
        row.bankAfter = 0;
        rows.push(row);
        continue;
      }
      const waitingBank = needNewLadder ? stake : bank;
      if (!pick) {
        row.note = "no pick, bank carries";
      } else if (pick.result === "pending") {
        row.note = "pending, not counted";
        pending++;
      } else if (pick.result === "scratched" || pick.result === "abandoned") {
        row.note = pick.result + ", bank carries";
      } else if (pick.result === "won" && !(pick.price > 1)) {
        row.note = "no price, not bet";
      } else if (stake <= 0) {
        row.note = "no starting stake";
      } else {
        if (needNewLadder) {
          ladders++;
          if (ladders > 1) resets++;
          bank = stake;
          needNewLadder = false;
          if (stake > peak) peak = stake;
        }
        row.ladder = ladders;
        row.stake = bank;
        if (pick.result === "won") {
          bank = round2(bank * pick.price);
          wins++;
          streak++;
          if (streak > bestStreak) bestStreak = streak;
        } else {
          bank = 0;
          losses++;
          streak = 0;
          if (onLoss === "stop") {
            busted = true;
            row.note = "ladder busted";
          } else {
            needNewLadder = true;
            row.note = "reset to $" + stake.toFixed(2) + " next pick";
          }
        }
        if (bank > peak) peak = bank;
        row.bankAfter = bank;
        rows.push(row);
        continue;
      }
      row.bankAfter = needNewLadder && ladders > 0 ? 0 : waitingBank;
      rows.push(row);
    }
    const cashIn = round2(stake * ladders);
    const currentBank = ladders === 0 ? stake : bank;
    return {
      startDate: start,
      stake,
      onLoss,
      rows,
      currentBank: round2(currentBank),
      peakBank: round2(Math.max(peak, ladders ? 0 : stake)),
      longestWinStreak: bestStreak,
      resets,
      laddersStarted: ladders,
      cashIn,
      netProfit: round2((ladders === 0 ? 0 : bank) - cashIn),
      busted,
      awaitingNewLadder: onLoss === "reset" && needNewLadder && ladders > 0,
      wins,
      losses,
      pending,
    };
  }

  /** Synthetic days for localhost ?demo=1 only. Obviously fake names. */
  function demoBestPicks(from, to) {
    const horses = ["Demo Dasher", "Fake Flyer", "Sample Sprinter", "Test Trotter", "Mock Meteor"];
    const tracks = ["Demo Park", "Sample Oval", "Fake Track West"];
    const results = ["won", "won", "lost", "won", "scratched", "won", "lost", null];
    const days = [];
    let t = Date.UTC(+from.slice(0, 4), +from.slice(5, 7) - 1, +from.slice(8, 10));
    const end = Date.UTC(+to.slice(0, 4), +to.slice(5, 7) - 1, +to.slice(8, 10));
    for (let i = 0; t <= end && i < 400; i++, t += 86400000) {
      const date = new Date(t).toISOString().slice(0, 10);
      if (i % 9 === 4) { days.push({ date, horse: null }); continue; }
      const res = t === end ? "pending" : results[i % results.length];
      const price = [1.5, 2, 1.8, 2.4, 3.1, 1.65][i % 6];
      days.push({ date, horse: horses[i % horses.length], track: tracks[i % tracks.length], race_no: 1 + (i % 8),
        price, p_win: 0.3 + (i % 5) * 0.05, stake_units: 1, result: res === null ? "lost" : res,
        pl_units: res === "won" ? round2(price - 1) : res === "lost" || res === null ? -1 : 0, model: "with_price", stage: "7am" });
    }
    return { ok: true, days };
  }

  return { resultCode, stageLabel, normaliseDay, normaliseBestPicks, earliestPickDate, computeLadder, demoBestPicks, round2, LOSS_RULES };
});
