/* Fake stats for localhost ?demo=1 only — obviously synthetic names/numbers. */
(function (root, factory) {
  "use strict";
  const api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.NDModelsDemo = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const TRACKS = ["Demo Park", "Sample Oval", "Fake Track West"];
  const HORSES = ["Demo Runner One", "Fake Horse Alpha", "Sample Steed", "Test Nag Four"];
  const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  const HEADLINE_SINCE = "2026-11-06";
  const STAKED_FROM = "2026-11-12";
  const RECON_FROM = "2026-10-13";
  const RECON_TO = "2026-11-05";
  const MODEL_IDS = ["with_price", "without_price", "agree"];

  /* Locked so Without has 25 staked picks from 12 Nov through 18 Nov. */
  const WITHOUT_STAKED = {
    "2026-11-12": 4,
    "2026-11-13": 3,
    "2026-11-14": 4,
    "2026-11-15": 3,
    "2026-11-16": 4,
    "2026-11-17": 4,
    "2026-11-18": 3,
  };

  function mulberry32(seed) {
    let a = seed >>> 0;
    return function () {
      a |= 0;
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function isoDate(d) {
    return d.toISOString().slice(0, 10);
  }

  function maxIso(a, b) {
    return a > b ? a : b;
  }

  function eachDay(from, to) {
    const out = [];
    const start = new Date(from + "T12:00:00Z");
    const end = new Date(to + "T12:00:00Z");
    if (!(start <= end)) return out;
    for (let d = new Date(start); d <= end; d.setUTCDate(d.getUTCDate() + 1)) {
      out.push(isoDate(d));
    }
    return out;
  }

  function pick(rand, arr) {
    return arr[Math.floor(rand() * arr.length)];
  }

  function flatHypPl(result, price) {
    if (result === "scratched" || result === "void") return 0;
    if (result === "won") return Math.round((Number(price) - 1) * 10) / 10;
    if (result === "lost") return -1;
    if (result === "placed") return Math.round((Number(price) * 0.25 - 1) * 10) / 10;
    return 0;
  }

  function dayRand(modelId, date) {
    let seed = 20261106;
    const s = String(modelId) + ":" + String(date);
    for (let i = 0; i < s.length; i++) seed = (seed + s.charCodeAt(i) * 997) >>> 0;
    return mulberry32(seed);
  }

  function weekdayLabel(iso) {
    const d = new Date(iso + "T12:00:00Z");
    return WEEKDAYS[(d.getUTCDay() + 6) % 7];
  }

  function stakedForDay(modelId, date, rand) {
    if (date < STAKED_FROM) {
      const picks = 2 + Math.floor(rand() * 3);
      return { picks: picks, bets: picks };
    }
    let bets;
    if (modelId === "without_price" && WITHOUT_STAKED[date] != null) {
      bets = WITHOUT_STAKED[date];
    } else if (modelId === "without_price") {
      bets = 3;
    } else {
      bets = 2 + Math.floor(rand() * 3);
    }
    const noBets = 1 + Math.floor(rand() * 2);
    return { picks: bets + noBets, bets: bets };
  }

  function round1(n) {
    return Math.round(n * 10) / 10;
  }

  function buildModel(modelId, dayList) {
    let cum = 0;
    let hypCum = 0;
    const daily = [];
    const recentPool = [];
    const wd = {};
    for (const label of WEEKDAYS) {
      wd[label] = { label: label, picks: 0, bets: 0, wins: 0, pl_units: 0, hyp_pl_units: 0 };
    }
    const stakedResults = ["won", "lost", "lost", "placed", "scratched"];
    const noBetResults = ["won", "lost", "lost", "void"];

    for (const item of dayList) {
      const date = item.date;
      const reconstructed = !!item.reconstructed;
      const rand = dayRand(modelId, date);
      const plan = stakedForDay(modelId, date, rand);
      let dayWins = 0;
      let dayPl = 0;
      let dayHypPl = 0;
      for (let i = 0; i < plan.picks; i++) {
        const isStaked = i < plan.bets;
        const price = Math.round((1.8 + rand() * 12) * 10) / 10;
        const result = pick(rand, isStaked ? stakedResults : noBetResults);
        const stake = isStaked ? 1 : 0;
        const hypPl = flatHypPl(result, price);
        let pl = 0;
        if (isStaked) {
          if (result === "won") pl = round1(price - 1);
          else if (result === "lost") pl = -1;
          else pl = 0;
        }
        if (isStaked && result === "won") dayWins += 1;
        dayPl += pl;
        dayHypPl += hypPl;
        const row = {
          date: date,
          track: pick(rand, TRACKS),
          race_no: i + 1,
          horse: pick(rand, HORSES),
          price: price,
          stake_units: stake,
          result: result,
          pl_units: round1(pl),
          hyp_pl_units: hypPl,
        };
        if (reconstructed) row.reconstructed = true;
        recentPool.push(row);
        const w = wd[weekdayLabel(date)];
        w.picks += 1;
        if (isStaked) {
          w.bets += 1;
          if (result === "won") w.wins += 1;
          w.pl_units += pl;
        }
        w.hyp_pl_units += hypPl;
      }
      dayPl = round1(dayPl);
      dayHypPl = round1(dayHypPl);
      cum = round1(cum + dayPl);
      hypCum = round1(hypCum + dayHypPl);
      const dailyRow = {
        date: date,
        picks: plan.picks,
        bets: plan.bets,
        wins: dayWins,
        pl_units: dayPl,
        hyp_pl_units: dayHypPl,
        cum_units: cum,
        hyp_cum_units: hypCum,
      };
      if (reconstructed) dailyRow.reconstructed = true;
      daily.push(dailyRow);
    }

    const bets = daily.reduce((s, d) => s + d.bets, 0);
    const wins = daily.reduce((s, d) => s + d.wins, 0);
    const picks = daily.reduce((s, d) => s + d.picks, 0);
    const pl_units = round1(daily.reduce((s, d) => s + d.pl_units, 0));
    const staked_units = bets;
    const hypPl = round1(daily.reduce((s, d) => s + d.hyp_pl_units, 0));
    const hypBets = picks;
    const summary = {
      bets: bets,
      wins: wins,
      strike_pct: bets ? Math.round((wins / bets) * 1000) / 10 : 0,
      staked_units: staked_units,
      pl_units: pl_units,
      roi_pct: staked_units ? Math.round((pl_units / staked_units) * 1000) / 10 : 0,
      hyp: {
        bets: hypBets,
        wins: recentPool.filter((r) => r.result === "won").length,
        strike_pct: hypBets ? Math.round((recentPool.filter((r) => r.result === "won").length / hypBets) * 1000) / 10 : 0,
        pl_units: hypPl,
        roi_pct: hypBets ? Math.round((hypPl / hypBets) * 1000) / 10 : 0,
      },
    };

    const mkRows = (labels, seedExtra) => {
      const rand = mulberry32(20261106 + seedExtra + modelId.length * 13);
      return labels.map((label) => {
        const b = Math.floor(rand() * 12) + 1;
        const w = Math.floor(rand() * b);
        const pl = round1((rand() - 0.45) * 20);
        const st = b * (1 + rand());
        const hpl = round1((rand() - 0.45) * 14);
        const hb = b + Math.floor(rand() * 4);
        return {
          label: label,
          bets: b,
          wins: w,
          strike_pct: Math.round((w / b) * 1000) / 10,
          pl_units: pl,
          roi_pct: Math.round((pl / st) * 1000) / 10,
          hyp: {
            bets: hb,
            wins: w,
            strike_pct: hb ? Math.round((w / hb) * 1000) / 10 : 0,
            pl_units: hpl,
            roi_pct: Math.round((hpl / hb) * 1000) / 10,
          },
        };
      });
    };

    const by_weekday = WEEKDAYS.map((label) => {
      const w = wd[label];
      const pl = round1(w.pl_units);
      const hpl = round1(w.hyp_pl_units);
      return {
        label: label,
        picks: w.picks,
        bets: w.bets,
        wins: w.wins,
        strike_pct: w.bets ? Math.round((w.wins / w.bets) * 1000) / 10 : 0,
        pl_units: pl,
        roi_pct: w.bets ? Math.round((pl / w.bets) * 1000) / 10 : 0,
        hyp_pl_units: hpl,
        hyp_roi_pct: w.picks ? Math.round((hpl / w.picks) * 1000) / 10 : 0,
      };
    });

    const liveRecent = recentPool.filter((r) => !r.reconstructed);
    const recRecent = recentPool.filter((r) => r.reconstructed);
    const recent = recRecent.slice(-8).concat(liveRecent.slice(-22));

    const firstDate = dayList.length ? dayList[0].date : HEADLINE_SINCE;
    return {
      summary: summary,
      daily: daily,
      by_price_band: mkRows(["$1-2", "2-3", "3-5", "5-8", "8-15", "15+"], 11),
      by_track: mkRows(TRACKS, 23),
      by_stake_bracket: mkRows(["0-1", "1-2", "2-5", "5+"], 37),
      by_weekday: by_weekday,
      recent: recent,
      meta: {
        data_since: firstDate,
        picks: picks,
        staked_picks: bets,
      },
    };
  }

  function resolveDayList(from, to, includeReconstructed) {
    const end = to;
    let start;
    if (from === "all") {
      start = includeReconstructed ? RECON_FROM : HEADLINE_SINCE;
    } else {
      const floor = includeReconstructed ? RECON_FROM : HEADLINE_SINCE;
      start = maxIso(from, floor);
    }
    if (start > end) return [];
    return eachDay(start, end).map((date) => ({
      date: date,
      reconstructed: date >= RECON_FROM && date <= RECON_TO,
    }));
  }

  function generateDemoStats(from, to, options) {
    const opts = options && typeof options === "object" ? options : {};
    const includeReconstructed = !!opts.includeReconstructed;
    const dayList = resolveDayList(from, to, includeReconstructed);
    const models = {
      with_price: buildModel("with_price", dayList),
      without_price: buildModel("without_price", dayList),
      agree: buildModel("agree", dayList),
    };
    const h2hDays = dayList.map((item) => {
      const rand = dayRand("h2h", item.date);
      const row = {
        date: item.date,
        with_price: round1((rand() - 0.5) * 6),
        without_price: round1((rand() - 0.5) * 6),
        agree: round1((rand() - 0.5) * 4),
      };
      if (item.reconstructed) row.reconstructed = true;
      return row;
    });
    const count = 11;
    const rangeFrom = from === "all" ? "all" : from;
    const dataSince = includeReconstructed && dayList.some((d) => d.reconstructed) ? RECON_FROM : HEADLINE_SINCE;
    return {
      generated_at: new Date().toISOString(),
      range: { from: rangeFrom, to: to },
      meta: {
        data_since: dataSince,
        picks: models.with_price.meta.picks + models.without_price.meta.picks + models.agree.meta.picks,
        staked_picks:
          models.with_price.meta.staked_picks +
          models.without_price.meta.staked_picks +
          models.agree.meta.staked_picks,
      },
      models: models,
      head_to_head: {
        days: h2hDays,
        disagree_races: {
          count: count,
          with_wins: 5,
          without_wins: 4,
        },
      },
    };
  }

  function isDemoHost() {
    const h = typeof location !== "undefined" ? location.hostname : "";
    return h === "localhost" || h === "127.0.0.1";
  }

  function generateStakedDemoStats(to) {
    const full = generateDemoStats(STAKED_FROM, to);
    const models = {};
    for (const id of MODEL_IDS) {
      const block = full.models[id];
      models[id] = {
        summary: block.summary,
        daily: block.daily,
      };
    }
    return {
      generated_at: full.generated_at,
      range: { from: STAKED_FROM, to: to },
      models: models,
    };
  }

  return {
    generateDemoStats: generateDemoStats,
    generateStakedDemoStats: generateStakedDemoStats,
    isDemoHost: isDemoHost,
    STAKED_FROM: STAKED_FROM,
    HEADLINE_SINCE: HEADLINE_SINCE,
    RECON_FROM: RECON_FROM,
    RECON_TO: RECON_TO,
  };
});
