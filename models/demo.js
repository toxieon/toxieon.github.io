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

  function eachDay(from, to) {
    const out = [];
    const start = new Date(from + "T12:00:00Z");
    const end = new Date(to + "T12:00:00Z");
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

  function buildModel(rand, days, bandLabels) {
    let cum = 0;
    let hypCum = 0;
    const daily = days.map((date) => {
      const picks = Math.floor(rand() * 5) + 1;
      const bets = Math.min(picks, Math.floor(rand() * 4));
      const wins = Math.min(bets, Math.floor(rand() * 2));
      const pl = Math.round((rand() - 0.48) * 8 * 10) / 10;
      cum = Math.round((cum + pl) * 10) / 10;
      const price = Math.round((1.8 + rand() * 12) * 10) / 10;
      const hypPl = flatHypPl(rand() > 0.55 ? "won" : "lost", price);
      hypCum = Math.round((hypCum + hypPl) * 10) / 10;
      return {
        date,
        picks,
        bets,
        wins,
        pl_units: pl,
        hyp_pl_units: hypPl,
        cum_units: cum,
        hyp_cum_units: hypCum,
      };
    });
    const bets = daily.reduce((s, d) => s + d.bets, 0);
    const wins = daily.reduce((s, d) => s + d.wins, 0);
    const pl_units = Math.round(daily.reduce((s, d) => s + d.pl_units, 0) * 10) / 10;
    const staked_units = Math.round(bets * (1.2 + rand()) * 10) / 10;
    const summary = {
      bets,
      wins,
      strike_pct: bets ? Math.round((wins / bets) * 1000) / 10 : 0,
      staked_units,
      pl_units,
      roi_pct: staked_units ? Math.round((pl_units / staked_units) * 1000) / 10 : 0,
    };
    const mkRows = (labels) =>
      labels.map((label) => {
        const b = Math.floor(rand() * 12) + 1;
        const w = Math.floor(rand() * b);
        const pl = Math.round((rand() - 0.45) * 20 * 10) / 10;
        const st = b * (1 + rand());
        return {
          label,
          bets: b,
          wins: w,
          strike_pct: Math.round((w / b) * 1000) / 10,
          pl_units: pl,
          roi_pct: Math.round((pl / st) * 1000) / 10,
        };
      });
    const results = ["won", "lost", "placed", "scratched", "void"];
    const recent = [];
    for (let i = 0; i < 30; i++) {
      const result = pick(rand, results);
      const price = Math.round((1.5 + rand() * 14) * 10) / 10;
      const stake = rand() > 0.25 ? Math.round((0.5 + rand() * 3) * 10) / 10 : 0;
      recent.push({
        date: pick(rand, days.slice(-14)),
        track: pick(rand, TRACKS),
        race_no: Math.floor(rand() * 9) + 1,
        horse: pick(rand, HORSES),
        price,
        stake_units: stake,
        result,
        pl_units: stake ? Math.round((rand() - 0.5) * 6 * 10) / 10 : 0,
        hyp_pl_units: flatHypPl(result, price),
      });
    }
    return {
      summary,
      daily,
      by_price_band: mkRows(bandLabels),
      by_track: mkRows(TRACKS),
      by_stake_bracket: mkRows(["0-1", "1-2", "2-5", "5+"]),
      recent,
    };
  }

  function generateDemoStats(from, to) {
    const seed = from.split("").reduce((s, c) => s + c.charCodeAt(0), 0) + to.length * 997;
    const rand = mulberry32(seed);
    const days = eachDay(from, to);
    const bands = ["$1-2", "2-3", "3-5", "5-8", "8-15", "15+"];
    const models = {
      with_price: buildModel(rand, days, bands),
      without_price: buildModel(rand, days, bands),
      agree: buildModel(rand, days, bands),
    };
    const h2hDays = days.map((date) => ({
      date,
      with_price: Math.round((rand() - 0.5) * 6 * 10) / 10,
      without_price: Math.round((rand() - 0.5) * 6 * 10) / 10,
      agree: Math.round((rand() - 0.5) * 4 * 10) / 10,
    }));
  const count = Math.floor(rand() * 40) + 5;
    return {
      generated_at: new Date().toISOString(),
      range: { from, to },
      models,
      head_to_head: {
        days: h2hDays,
        disagree_races: {
          count,
          with_wins: Math.floor(count * rand() * 0.6),
          without_wins: Math.floor(count * rand() * 0.5),
        },
      },
    };
  }

  function isDemoHost() {
    const h = typeof location !== "undefined" ? location.hostname : "";
    return h === "localhost" || h === "127.0.0.1";
  }

  const STAKED_FROM = "2026-11-12";

  function generateStakedDemoStats(to) {
    const full = generateDemoStats(STAKED_FROM, to);
    const models = {};
    for (const id of ["with_price", "without_price", "agree"]) {
      const block = full.models[id];
      models[id] = {
        summary: block.summary,
        daily: block.daily,
      };
    }
    return {
      generated_at: full.generated_at,
      range: { from: STAKED_FROM, to },
      models,
    };
  }

  return { generateDemoStats, generateStakedDemoStats, isDemoHost, STAKED_FROM };
});