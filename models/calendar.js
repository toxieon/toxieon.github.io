/* Join model daily rows by date; month grid helpers. No DOM. */
(function (root, factory) {
  "use strict";
  const api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.NDModelsCalendar = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const MODEL_IDS = ["with_price", "without_price", "agree"];

  function emptyDay(date) {
    return { date, with_price: null, without_price: null, agree: null };
  }

  function pickField(row, primary, fallback) {
    if (row[primary] != null && row[primary] !== "") {
      const n = Number(row[primary]);
      return Number.isFinite(n) ? n : 0;
    }
    if (fallback && row[fallback] != null && row[fallback] !== "") {
      const n = Number(row[fallback]);
      return Number.isFinite(n) ? n : 0;
    }
    return 0;
  }

  function normDailySlice(row) {
    if (!row) return null;
    const out = {
      picks: Number(row.picks) || 0,
      bets: Number(row.bets) || 0,
      wins: Number(row.wins) || 0,
      losses: Number(row.losses) || 0,
      hyp_bets: Number(row.hyp_bets) || 0,
      hyp_wins: Number(row.hyp_wins) || 0,
      pl_units: Number(row.pl_units) || 0,
      hyp_pl_units: Number(row.hyp_pl_units) || 0,
      cum_units: pickField(row, "cum_units", "cum"),
      hyp_cum_units: pickField(row, "hyp_cum_units", "hyp_cum"),
    };
    if (row.reconstructed) out.reconstructed = true;
    return out;
  }

  /** Join models.*.daily by ISO date (YYYY-MM-DD). */
  function joinDailyByDate(models) {
    const map = new Map();
    const src = models && typeof models === "object" ? models : {};
    for (const id of MODEL_IDS) {
      const daily = Array.isArray(src[id] && src[id].daily) ? src[id].daily : [];
      for (const row of daily) {
        const date = row && row.date != null ? String(row.date) : "";
        if (!date) continue;
        if (!map.has(date)) map.set(date, emptyDay(date));
        const slice = normDailySlice(row);
        map.get(date)[id] = slice;
        if (slice && slice.reconstructed) map.get(date).reconstructed = true;
      }
    }
    return [...map.values()].sort((a, b) => a.date.localeCompare(b.date));
  }

  /** Days for the calendar: the top-level calendar[] when sent, else models.*.daily joined by date. */
  function calendarDays(payload) {
    const p = payload && typeof payload === "object" ? payload : {};
    if (Array.isArray(p.calendar) && p.calendar.length) {
      return p.calendar
        .filter((r) => r && r.date)
        .map((r) => {
          const out = emptyDay(String(r.date));
          for (const id of MODEL_IDS) out[id] = r[id] ? normDailySlice(r[id]) : null;
          if (r.reconstructed) out.reconstructed = true;
          return out;
        })
        .sort((a, b) => a.date.localeCompare(b.date));
    }
    return joinDailyByDate(p.models);
  }

  function parseYm(ym) {
    const p = String(ym || "").split("-");
    return { y: Number(p[0]) || 0, m: Number(p[1]) || 1 };
  }

  function ymKey(y, m) {
    return y + "-" + String(m).padStart(2, "0");
  }

  function ymAdd(ym, deltaMonths) {
    const { y, m } = parseYm(ym);
    const d = new Date(Date.UTC(y, m - 1 + deltaMonths, 1));
    return ymKey(d.getUTCFullYear(), d.getUTCMonth() + 1);
  }

  function daysInMonth(ym) {
    const { y, m } = parseYm(ym);
    return new Date(Date.UTC(y, m, 0)).getUTCDate();
  }

  function monthEndIso(ym) {
    const { y, m } = parseYm(ym);
    const last = daysInMonth(ym);
    return ymKey(y, m) + "-" + String(last).padStart(2, "0");
  }

  function effectiveRangeFrom(rangeFrom) {
    return rangeFrom === "all" ? "1970-01-01" : String(rangeFrom || "1970-01-01");
  }

  function monthOverlapsRange(ym, rangeFrom, rangeTo) {
    const start = ym + "-01";
    const end = monthEndIso(ym);
    const effFrom = effectiveRangeFrom(rangeFrom);
    return end >= effFrom && start <= rangeTo;
  }

  const WEEKDAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

  /** Wed/Sat racing meet highlight for by_weekday tables. */
  function isRacingWeekdayHighlight(label) {
    const s = String(label || "").trim();
    const short = s.length <= 3 ? s : s.slice(0, 3);
    return short === "Wed" || short === "Sat";
  }

  /** Mon-first month grid; null pads leading blanks; trailing nulls omitted. */
  function buildMonthGrid(ym) {
    const { y, m } = parseYm(ym);
    const first = new Date(Date.UTC(y, m - 1, 1));
    const lead = (first.getUTCDay() + 6) % 7;
    const last = daysInMonth(ym);
    const cells = [];
    for (let i = 0; i < lead; i++) cells.push(null);
    for (let d = 1; d <= last; d++) {
      cells.push(ymKey(y, m) + "-" + String(d).padStart(2, "0"));
    }
    return cells;
  }

  function dateInRange(iso, from, to) {
    const effFrom = effectiveRangeFrom(from);
    return iso >= effFrom && iso <= to;
  }

  function plTone(pl, bets) {
    if (!bets) return "neutral";
    if (pl > 0) return "pos";
    if (pl < 0) return "neg";
    return "neutral";
  }

  function dailyStrikePct(bets, wins) {
    if (!bets) return 0;
    return Math.round((wins / bets) * 1000) / 10;
  }

  /** Frozen and reconstructed days keep separate running lines. */
  function partitionDailyByReconstructed(daily) {
    const frozen = [];
    const reconstructed = [];
    for (const row of Array.isArray(daily) ? daily : []) {
      if (row && row.reconstructed) reconstructed.push(row);
      else frozen.push(row);
    }
    return { frozen, reconstructed };
  }

  return {
    MODEL_IDS,
    joinDailyByDate,
    calendarDays,
    parseYm,
    ymAdd,
    buildMonthGrid,
    monthOverlapsRange,
    monthEndIso,
    dateInRange,
    plTone,
    dailyStrikePct,
    normDailySlice,
    effectiveRangeFrom,
    isRacingWeekdayHighlight,
    WEEKDAY_LABELS,
    partitionDailyByReconstructed,
  };
});