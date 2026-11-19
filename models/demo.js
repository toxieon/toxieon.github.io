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
  const PRICE_BANDS = ["$1-2", "$2-3", "$3-5", "$5-8", "$8-15", "$15+"];
  const STAKE_BRACKETS = ["2u", "1u", "0.5u", "no bet"];
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

  function hypBlock(bets, wins, pl) {
    const hBets = bets;
    return {
      bets: hBets,
      wins: wins,
      strike_pct: hBets ? Math.round((wins / hBets) * 1000) / 10 : 0,
      pl_units: pl,
      roi_pct: hBets ? Math.round((pl / hBets) * 1000) / 10 : 0,
    };
  }

  function accumulate(modelId, dayList) {
    let cum = 0;
    let hypCum = 0;
    const daily = [];
    const recentPool = [];
    const wd = {};
    for (const label of WEEKDAYS) {
      wd[label] = {
        label: label, picks: 0, bets: 0, wins: 0, pl_units: 0,
        hyp_pl_units: 0, hyp_bets: 0, hyp_wins: 0,
      };
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
      let dayHypBets = 0;
      let dayHypWins = 0;
      for (let i = 0; i < plan.picks; i++) {
        const isStaked = i < plan.bets;
        const price = Math.round((1.8 + rand() * 12) * 10) / 10;
        const result = pick(rand, isStaked ? stakedResults : noBetResults);
        const stake = isStaked ? 1 : 0;
        const hypPl = flatHypPl(result, price);
        const hypCounts = result !== "void" && result !== "scratched";
        let pl = 0;
        if (isStaked) {
          if (result === "won") pl = round1(price - 1);
          else if (result === "lost") pl = -1;
          else pl = 0;
        }
        if (isStaked && result === "won") dayWins += 1;
        dayPl += pl;
        dayHypPl += hypPl;
        if (hypCounts) {
          dayHypBets += 1;
          if (result === "won") dayHypWins += 1;
        }
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
          reconstructed: reconstructed,
        };
        recentPool.push(row);
        const w = wd[weekdayLabel(date)];
        w.picks += 1;
        if (isStaked) {
          w.bets += 1;
          if (result === "won") w.wins += 1;
          w.pl_units += pl;
        }
        w.hyp_pl_units += hypPl;
        if (hypCounts) {
          w.hyp_bets += 1;
          if (result === "won") w.hyp_wins += 1;
        }
      }
      dayPl = round1(dayPl);
      dayHypPl = round1(dayHypPl);
      cum = round1(cum + dayPl);
      hypCum = round1(hypCum + dayHypPl);
      daily.push({
        date: date,
        reconstructed: reconstructed,
        picks: plan.picks,
        bets: plan.bets,
        wins: dayWins,
        pl_units: dayPl,
        hyp_pl_units: dayHypPl,
        cum_units: cum,
        hyp_cum_units: hypCum,
      });
    }

    const bets = daily.reduce((s, d) => s + d.bets, 0);
    const wins = daily.reduce((s, d) => s + d.wins, 0);
    const picks = daily.reduce((s, d) => s + d.picks, 0);
    const pl_units = round1(daily.reduce((s, d) => s + d.pl_units, 0));
    const staked_units = bets;
    const hypPl = round1(daily.reduce((s, d) => s + d.hyp_pl_units, 0));
    const hypBets = recentPool.filter((r) => r.result !== "void" && r.result !== "scratched").length;
    const hypWins = recentPool.filter((r) => r.result === "won").length;
    const summary = {
      picks: picks,
      bets: bets,
      wins: wins,
      strike_pct: bets ? Math.round((wins / bets) * 1000) / 10 : 0,
      staked_units: staked_units,
      pl_units: pl_units,
      roi_pct: staked_units ? Math.round((pl_units / staked_units) * 1000) / 10 : 0,
      hyp: hypBlock(hypBets, hypWins, hypPl),
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
          hyp: hypBlock(hb, w, hpl),
        };
      });
    };

    const by_weekday = WEEKDAYS.map((label) => {
      const w = wd[label];
      const pl = round1(w.pl_units);
      const hpl = round1(w.hyp_pl_units);
      const hyp = hypBlock(w.hyp_bets, w.hyp_wins, hpl);
      return {
        label: label,
        picks: w.picks,
        bets: w.bets,
        wins: w.wins,
        strike_pct: w.bets ? Math.round((w.wins / w.bets) * 1000) / 10 : 0,
        pl_units: pl,
        roi_pct: w.bets ? Math.round((pl / w.bets) * 1000) / 10 : 0,
        hyp_pl_units: hpl,
        hyp_roi_pct: hyp.roi_pct,
        hyp: hyp,
      };
    });

    const firstDate = dayList.length ? dayList[0].date : HEADLINE_SINCE;
    return {
      summary: summary,
      daily: daily,
      by_price_band: mkRows(PRICE_BANDS, 11),
      by_track: mkRows(TRACKS, 23),
      by_stake_bracket: mkRows(STAKE_BRACKETS, 37),
      by_weekday: by_weekday,
      recent: recentPool,
      meta: {
        data_since: firstDate,
        picks: picks,
        staked_picks: bets,
      },
    };
  }

  function emptyReconstructedBlock() {
    const zeroHyp = hypBlock(0, 0, 0);
    return {
      summary: {
        picks: 0, bets: 0, wins: 0, strike_pct: 0,
        staked_units: 0, pl_units: 0, roi_pct: 0, hyp: zeroHyp,
      },
      hyp: zeroHyp,
      by_weekday: WEEKDAYS.map((label) => ({
        label: label, picks: 0, bets: 0, wins: 0, strike_pct: 0,
        pl_units: 0, roi_pct: 0, hyp_pl_units: 0, hyp_roi_pct: 0, hyp: zeroHyp,
      })),
    };
  }

  function buildModel(modelId, dayList, includeReconstructed, reconAvailable) {
    const frozenDays = dayList.filter((d) => !d.reconstructed);
    const reconDays = includeReconstructed && reconAvailable ? dayList.filter((d) => d.reconstructed) : [];
    const frozen = accumulate(modelId, frozenDays);
    const recon = reconDays.length ? accumulate(modelId, reconDays) : null;
    const liveRecent = frozen.recent.filter((r) => !r.reconstructed);
    const recRecent = recon ? recon.recent : [];
    const recent = includeReconstructed && recon
      ? recRecent.slice(-8).concat(liveRecent.slice(-22))
      : liveRecent.slice(-30);
    const out = {
      summary: frozen.summary,
      hyp: frozen.summary.hyp,
      daily: (recon ? recon.daily : []).concat(frozen.daily),
      by_price_band: frozen.by_price_band,
      by_track: frozen.by_track,
      by_stake_bracket: frozen.by_stake_bracket,
      by_weekday: frozen.by_weekday,
      recent: recent,
    };
    if (includeReconstructed) {
      out.reconstructed = recon
        ? { summary: recon.summary, hyp: recon.summary.hyp, by_weekday: recon.by_weekday }
        : emptyReconstructedBlock();
    }
    return { block: out, frozenMeta: frozen.meta, reconMeta: recon ? recon.meta : null };
  }

  function resolveDayList(from, to, includeReconstructed, reconAvailable) {
    const end = to;
    const wantRecon = !!(includeReconstructed && reconAvailable);
    let start;
    if (from === "all") {
      start = wantRecon ? RECON_FROM : HEADLINE_SINCE;
    } else {
      const floor = wantRecon ? RECON_FROM : HEADLINE_SINCE;
      start = maxIso(from, floor);
    }
    if (start > end) return [];
    return eachDay(start, end).map((date) => ({
      date: date,
      reconstructed: date >= RECON_FROM && date <= RECON_TO,
    }));
  }

  function packMeta(dataSince, picks, staked) {
    return { data_since: dataSince, picks: picks, staked_picks: staked };
  }

  function generateDemoStats(from, to, options) {
    const opts = options && typeof options === "object" ? options : {};
    const includeReconstructed = !!opts.includeReconstructed;
    const reconAvailable = opts.reconstructedAvailable !== false;
    const dayList = resolveDayList(from, to, includeReconstructed, reconAvailable);
    const built = {};
    const models = {};
    for (const id of MODEL_IDS) {
      built[id] = buildModel(id, dayList, includeReconstructed, reconAvailable);
      models[id] = built[id].block;
    }
    const h2hDays = dayList
      .filter((item) => !item.reconstructed || (includeReconstructed && reconAvailable))
      .map((item) => {
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
    const frozenStart = HEADLINE_SINCE;
    const resolvedFrom = from === "all"
      ? (includeReconstructed && reconAvailable && dayList.some((d) => d.reconstructed) ? RECON_FROM : frozenStart)
      : (dayList.length ? dayList[0].date : from);
    const publishedPicks = built.with_price.frozenMeta.picks + built.without_price.frozenMeta.picks;
    const publishedStaked = built.with_price.frozenMeta.staked_picks + built.without_price.frozenMeta.staked_picks;
    const meta = {
      data_since: frozenStart,
      picks: publishedPicks,
      staked_picks: publishedStaked,
      with_price: packMeta(frozenStart, built.with_price.frozenMeta.picks, built.with_price.frozenMeta.staked_picks),
      without_price: packMeta(frozenStart, built.without_price.frozenMeta.picks, built.without_price.frozenMeta.staked_picks),
      agree: packMeta(frozenStart, built.agree.frozenMeta.picks, built.agree.frozenMeta.staked_picks),
    };
    if (includeReconstructed) {
      const reconPicks = reconAvailable
        ? (built.with_price.reconMeta ? built.with_price.reconMeta.picks : 0) +
          (built.without_price.reconMeta ? built.without_price.reconMeta.picks : 0)
        : 0;
      meta.reconstructed_available = !!(reconAvailable && reconPicks > 0);
      meta.reconstructed = {
        from: RECON_FROM,
        to: RECON_TO,
        data_since: reconAvailable && reconPicks ? RECON_FROM : "",
        picks: reconPicks,
      };
      if (meta.reconstructed_available) meta.data_since = RECON_FROM;
    }
    return {
      generated_at: new Date().toISOString(),
      range: { from: resolvedFrom, to: to },
      meta: meta,
      models: models,
      head_to_head: {
        days: h2hDays,
        disagree_races: { count: 11, with_wins: 5, without_wins: 4 },
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
        hyp: block.hyp,
        daily: block.daily,
        by_weekday: block.by_weekday,
        by_price_band: block.by_price_band,
        by_track: block.by_track,
        by_stake_bracket: block.by_stake_bracket,
        recent: block.recent,
      };
    }
    return {
      generated_at: full.generated_at,
      range: { from: STAKED_FROM, to: to },
      meta: full.meta,
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
