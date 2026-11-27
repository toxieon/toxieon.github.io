"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const H = require("./hybrid.js");

const pick = (over) => Object.assign({
  horse: "Demo Dasher",
  track: "Demo Park",
  race_no: 1,
  price: 2,
  price_stage: "t60",
  p_win: 0.4,
  stake_units: 1,
  result: "won",
  pl_units: 1,
}, over);

test("adaptHybridPayload reads the proposed {ok, range, days:[{date, picks}]} shape", () => {
  const raw = {
    ok: true,
    range: { from: "2026-06-01", to: "2026-11-26" },
    days: [{
      date: "2026-11-14",
      picks: [{
        horse: "Fake Flyer",
        track: "Sample Oval",
        race_no: 4,
        price: 3.1,
        price_stage: "t60",
        p_win: 0.33,
        stake_units: 1,
        result: "won",
        pl_units: 2.1,
      }],
    }],
  };
  const out = H.adaptHybridPayload(raw);
  assert.equal(out.ok, true);
  assert.deepEqual(out.range, { from: "2026-06-01", to: "2026-11-26" });
  assert.equal(out.days.length, 1);
  assert.equal(out.days[0].date, "2026-11-14");
  assert.equal(out.days[0].picks[0].horse, "Fake Flyer");
  assert.equal(out.days[0].picks[0].track, "Sample Oval");
  assert.equal(out.days[0].picks[0].race_no, 4);
  assert.equal(out.days[0].picks[0].price, 3.1);
  assert.equal(out.days[0].picks[0].price_stage, "t60");
  assert.equal(out.days[0].picks[0].p_win, 0.33);
  assert.equal(out.days[0].picks[0].stake_units, 1);
  assert.equal(out.days[0].picks[0].result, "won");
  assert.equal(out.days[0].picks[0].pl_units, 2.1);
  assert.equal(out.days[0].wins, 1);
  assert.equal(out.days[0].pl_units, 2.1);
});

test("adaptHybridPayload accepts aliases (hybrid_picks, runner_name, race_number, odds, stage, pl) and skips empty horses", () => {
  const out = H.adaptHybridPayload({
    hybrid_picks: [{
      day: "2026-11-01",
      picks: [
        { runner_name: "Test Trotter", race_number: 2, odds: 1.8, stage: "07", result: "W", pl: 0.8 },
        { horse: "  ", result: "won", pl_units: 9 },
      ],
    }],
  });
  assert.equal(out.days.length, 1);
  const p = out.days[0].picks[0];
  assert.equal(p.horse, "Test Trotter");
  assert.equal(p.race_no, 2);
  assert.equal(p.price, 1.8);
  assert.equal(p.price_stage, "07");
  assert.equal(p.result, "won");
  assert.equal(p.pl_units, 0.8);
  assert.equal(out.days[0].picks.length, 1);
});

test("adaptHybridPayload sorts uniquely by date and treats a bare array as days", () => {
  const out = H.adaptHybridPayload([
    { date: "2026-11-03", picks: [pick({ horse: "B", result: "lost", pl_units: -1 })] },
    { date: "2026-11-01", picks: [pick({ horse: "A" })] },
    { date: "2026-11-03", picks: [pick({ horse: "C", result: "won", pl_units: 2 })] },
  ]);
  assert.deepEqual(out.days.map((d) => d.date), ["2026-11-01", "2026-11-03"]);
  assert.equal(out.days[1].picks[0].horse, "C");
});

test("pending and scratched picks are excluded from W-L, n, units staked and ROI", () => {
  const days = H.adaptHybridPayload({ days: [{
    date: "2026-11-10",
    picks: [
      pick({ horse: "Win One", result: "won", pl_units: 1.5, stake_units: 1 }),
      pick({ horse: "Loss One", result: "lost", pl_units: -1, stake_units: 1 }),
      pick({ horse: "Pending One", result: "pending", pl_units: null, stake_units: 1 }),
      pick({ horse: "Scratch One", result: "scratched", pl_units: 0, stake_units: 1 }),
    ],
  }] }).days;
  const t = H.computeHybridTotals(days);
  assert.equal(t.wins, 1);
  assert.equal(t.losses, 1);
  assert.equal(t.n, 2);
  assert.equal(t.pending, 1);
  assert.equal(t.scratched, 1);
  assert.equal(t.net_units, 0.5);
  assert.equal(t.staked_units, 2);
  assert.equal(t.roi_pct, 25);
});

test("ROI is net units / units staked; missing stake on a settled pick counts as 1u", () => {
  const days = H.adaptHybridPayload({ days: [{
    date: "2026-11-11",
    picks: [
      pick({ result: "won", pl_units: 2, stake_units: 2 }),
      pick({ result: "lost", pl_units: -1, stake_units: null }),
    ],
  }] }).days;
  const t = H.computeHybridTotals(days);
  assert.equal(t.net_units, 1);
  assert.equal(t.staked_units, 3);
  assert.equal(t.roi_pct, H.round2((1 / 3) * 100));
});

test("totals land near Husker's 47-63, +35.2u, 32% ROI, n=110 (fake names only)", () => {
  /* 47 wins totalling +98.2u and 63 losses at -1u = +35.2u on 110u staked → 32% ROI.
   * Unique dates so adaptHybridPayload does not collapse rows. */
  const bestDate = "2026-08-02";
  const worstDate = "2026-09-14";
  const byDate = new Map();
  const add = (date, p) => {
    if (!byDate.has(date)) byDate.set(date, []);
    byDate.get(date).push(p);
  };
  add(bestDate, pick({ horse: "Best Day One", result: "won", pl_units: 4.4 }));
  add(bestDate, pick({ horse: "Best Day Two", result: "won", pl_units: 4 }));
  add(bestDate, pick({ horse: "Best Day Three", result: "won", pl_units: 4 }));
  add(worstDate, pick({ horse: "Worst Day One", result: "lost", pl_units: -1 }));
  add(worstDate, pick({ horse: "Worst Day Two", result: "lost", pl_units: -1 }));
  add(worstDate, pick({ horse: "Worst Day Three", result: "lost", pl_units: -1 }));
  add(worstDate, pick({ horse: "Worst Day Four", result: "lost", pl_units: -1 }));
  add(worstDate, pick({ horse: "Worst Day Five", result: "lost", pl_units: -1 }));
  let remain = H.round2(98.2 - 12.4);
  for (let i = 0; i < 44; i++) {
    const last = i === 43;
    const pl = last ? remain : 2;
    if (!last) remain = H.round2(remain - 2);
    add("2026-05-" + String(i + 1).padStart(2, "0"), pick({ horse: "Win Horse " + i, result: "won", pl_units: pl }));
  }
  for (let i = 0; i < 58; i++) {
    const month = i < 30 ? "06" : "07";
    const day = i < 30 ? i + 1 : i - 29;
    add("2026-" + month + "-" + String(day).padStart(2, "0"), pick({ horse: "Loss Horse " + i, result: "lost", pl_units: -1 }));
  }
  add("2026-11-26", pick({ horse: "Still Running", result: "pending", pl_units: null }));
  add("2026-11-26", pick({ horse: "Out Of Gate", result: "scratched", pl_units: 0 }));
  const days = [...byDate.entries()].map(([date, picks]) => ({ date, picks }));
  const adapted = H.adaptHybridPayload({ ok: true, days }).days;
  const t = H.computeHybridTotals(adapted);
  assert.equal(t.wins, 47);
  assert.equal(t.losses, 63);
  assert.equal(t.n, 110);
  assert.equal(t.net_units, 35.2);
  assert.equal(t.roi_pct, 32);
  assert.equal(t.pending, 1);
  assert.equal(t.scratched, 1);
  assert.equal(t.bestDay.date, bestDate);
  assert.equal(t.bestDay.pl_units, 12.4);
  assert.equal(t.worstDay.date, worstDate);
  assert.equal(t.worstDay.pl_units, -5);
});

test("best and worst day ties go to the earlier date; days with no settled picks are ignored", () => {
  const days = H.adaptHybridPayload({ days: [
    { date: "2026-11-02", picks: [pick({ result: "won", pl_units: 2 })] },
    { date: "2026-11-03", picks: [pick({ result: "pending", pl_units: null })] },
    { date: "2026-11-04", picks: [pick({ result: "won", pl_units: 2 })] },
    { date: "2026-11-01", picks: [pick({ result: "lost", pl_units: -1 })] },
    { date: "2026-11-05", picks: [pick({ result: "lost", pl_units: -1 })] },
  ] }).days;
  const t = H.computeHybridTotals(days);
  assert.equal(t.bestDay.date, "2026-11-02");
  assert.equal(t.worstDay.date, "2026-11-01");
});

test("empty or malformed payloads yield empty days and empty totals", () => {
  for (const raw of [null, undefined, {}, { ok: false }, { days: "nope" }, { days: [{ date: "bad", picks: [pick()] }] }]) {
    const out = H.adaptHybridPayload(raw);
    assert.deepEqual(out.days, []);
    const t = H.computeHybridTotals(out.days);
    assert.equal(t.n, 0);
    assert.equal(t.bestDay, null);
    assert.equal(t.worstDay, null);
    assert.equal(t.roi_pct, null);
  }
});

test("dayTone reuses the best-pick calendar classes", () => {
  const day = (picks) => H.adaptHybridPayload({ days: [{ date: "2026-11-01", picks }] }).days[0];
  assert.equal(H.dayTone(day([pick({ result: "won", pl_units: 1 })])), "bp-won");
  assert.equal(H.dayTone(day([pick({ result: "lost", pl_units: -1 })])), "bp-lost");
  assert.equal(H.dayTone(day([pick({ result: "pending" })])), "bp-pending");
  assert.equal(H.dayTone(day([pick({ result: "scratched", pl_units: 0 })])), "bp-void");
  assert.equal(H.dayTone(day([
    pick({ result: "won", pl_units: 1 }),
    pick({ result: "lost", pl_units: -1 }),
  ])), "bp-void");
  assert.equal(H.dayTone({ date: "2026-11-01", picks: [] }), "bp-none");
});

test("dataRange spans the first and last day that has picks", () => {
  const days = H.adaptHybridPayload({ days: [
    { date: "2026-07-04", picks: [pick()] },
    { date: "2026-11-20", picks: [pick()] },
  ] }).days;
  assert.deepEqual(H.dataRange(days, "2026-11-27"), { from: "2026-07-04", to: "2026-11-20" });
  assert.deepEqual(H.dataRange([], "2026-11-27"), { from: "2026-11-27", to: "2026-11-27" });
});

test("demoHybridPicks is localhost fixture data with obviously fake names only", () => {
  const raw = H.demoHybridPicks("2026-11-01", "2026-11-15");
  assert.equal(raw.ok, true);
  assert.ok(raw.days.length > 0);
  const names = raw.days.flatMap((d) => d.picks.map((p) => p.horse + " " + p.track)).join(" ");
  assert.match(names, /Demo|Fake|Sample|Test|Mock/);
  assert.doesNotMatch(names, /Winx|Nature Strip|Pride Of Jenni/i);
  const adapted = H.adaptHybridPayload(raw);
  const t = H.computeHybridTotals(adapted.days);
  assert.ok(t.n >= 0);
});

test("adaptHybridPayload drops picks and days with omitted:true (include=all non-matches)", () => {
  const out = H.adaptHybridPayload({
    ok: true,
    days: [
      { date: "2026-11-03", omitted: true, picks: [pick({ horse: "Should Drop Day", result: "won", pl_units: 9 })] },
      { date: "2026-11-04", picks: [
        pick({ horse: "Keep Me", result: "won", pl_units: 1.2, stake_units: 1, price_stage: "tip" }),
        pick({ horse: "Non Match", result: "won", pl_units: 8, omitted: true }),
      ] },
      { date: "2026-11-05", picks: [pick({ horse: "Only Omitted", omitted: true, result: "lost", pl_units: -1 })] },
    ],
  });
  assert.deepEqual(out.days.map((d) => d.date), ["2026-11-04"]);
  assert.equal(out.days[0].picks.length, 1);
  assert.equal(out.days[0].picks[0].horse, "Keep Me");
  assert.equal(out.days[0].picks[0].price_stage, "tip");
  assert.equal(out.days[0].wins, 1);
  assert.equal(out.days[0].pl_units, 1.2);
  const tot = H.computeHybridTotals(out.days);
  assert.equal(tot.n, 1);
  assert.equal(tot.net_units, 1.2);
});

test("a live-shaped pending pick with pl_units null (including today's date) does not throw and is excluded from totals", () => {
  const today = "2026-11-27";
  const raw = {
    ok: true,
    range: { from: "2026-11-03", to: today },
    days: [
      { date: "2026-11-03", picks: [{ horse: "Fake Flyer", track: "Demo Park", race_no: 1, price: 2.2, price_stage: "tip", stake_units: 1, result: "won", pl_units: 1.2 }] },
      { date: today, picks: [{ horse: "Still Running", track: "Sample Oval", race_no: 4, price: 2.6, price_stage: "tip", p_win: 0.31, stake_units: 1, result: "pending", pl_units: null }] },
    ],
  };
  const adapted = H.adaptHybridPayload(raw);
  assert.equal(adapted.days.length, 2);
  assert.equal(adapted.days[1].picks[0].result, "pending");
  assert.equal(adapted.days[1].picks[0].pl_units, null);
  assert.equal(adapted.days[1].pending, 1);
  assert.equal(adapted.days[1].pl_units, 0);
  const totals = H.computeHybridTotals(adapted.days);
  assert.equal(totals.n, 1);
  assert.equal(totals.pending, 1);
  assert.equal(totals.net_units, 1.2);
  assert.equal(H.dayTone(adapted.days[1]), "bp-pending");
});

test("readCompareChoice defaults to none and writeCompareChoice persists a known model", () => {
  const mem = {};
  const storage = {
    getItem: (k) => (Object.prototype.hasOwnProperty.call(mem, k) ? mem[k] : null),
    setItem: (k, v) => { mem[k] = String(v); },
    removeItem: (k) => { delete mem[k]; },
  };
  assert.equal(H.COMPARE_STORAGE_KEY, "nd_models_hybrid_compare");
  assert.equal(H.readCompareChoice(storage), "none");
  assert.equal(H.writeCompareChoice(storage, "with_price"), "with_price");
  assert.equal(mem[H.COMPARE_STORAGE_KEY], "with_price");
  assert.equal(H.readCompareChoice(storage), "with_price");
  assert.equal(H.writeCompareChoice(storage, "horsepicks"), "horsepicks");
  assert.equal(H.readCompareChoice(storage), "horsepicks");
  assert.equal(H.writeCompareChoice(storage, "nope"), "none");
  assert.equal(H.readCompareChoice(storage), "none");
  mem[H.COMPARE_STORAGE_KEY] = "garbage";
  assert.equal(H.readCompareChoice(storage), "none");
  assert.equal(H.readCompareChoice(null), "none");
});

test("includeOmitted keeps omitted HorsePicks tips for comparison totals; Hybrid still drops them", () => {
  const raw = {
    ok: true,
    days: [{
      date: "2026-11-04",
      picks: [
        pick({ horse: "Keep Me", result: "won", pl_units: 1.2, stake_units: 1 }),
        pick({ horse: "Non Match", result: "lost", pl_units: -1, stake_units: 1, omitted: true }),
      ],
    }],
  };
  const hybrid = H.adaptHybridPayload(raw).days;
  assert.equal(hybrid[0].picks.length, 1);
  const hyTot = H.computeHybridTotals(hybrid);
  assert.equal(hyTot.wins, 1);
  assert.equal(hyTot.losses, 0);
  assert.equal(hyTot.n, 1);
  assert.equal(hyTot.net_units, 1.2);
  assert.equal(hyTot.roi_pct, 120);

  const all = H.adaptHybridPayload(raw, { includeOmitted: true }).days;
  assert.equal(all[0].picks.length, 2);
  const hpTot = H.computeHybridTotals(all);
  assert.equal(hpTot.wins, 1);
  assert.equal(hpTot.losses, 1);
  assert.equal(hpTot.n, 2);
  assert.equal(hpTot.net_units, 0.2);
  assert.equal(hpTot.staked_units, 2);
  assert.equal(hpTot.roi_pct, 10);
});

test("adaptModelStatsCompare reads calendar daily units and official summary totals", () => {
  const raw = {
    ok: true,
    calendar: [
      { date: "2026-11-03", with_price: { picks: 3, bets: 3, wins: 2, losses: 1, pl_units: 1.4 }, without_price: { picks: 3, bets: 3, wins: 1, losses: 2, pl_units: -0.6 }, agree: { picks: 2, bets: 2, wins: 1, losses: 1, pl_units: 0.5 } },
      { date: "2026-11-04", with_price: { picks: 2, bets: 2, wins: 0, losses: 2, pl_units: -2 }, without_price: { picks: 2, bets: 2, wins: 2, losses: 0, pl_units: 2.2 }, agree: { picks: 1, bets: 1, wins: 0, losses: 1, pl_units: -1 } },
    ],
    models: {
      with_price: { summary: { picks: 5, bets: 5, wins: 2, staked_units: 5, pl_units: -0.6, roi_pct: -12 } },
      without_price: { summary: { picks: 5, bets: 5, wins: 3, staked_units: 5, pl_units: 1.6, roi_pct: 32 } },
      agree: { summary: { picks: 3, bets: 3, wins: 1, staked_units: 3, pl_units: -0.5, roi_pct: H.round2((-0.5 / 3) * 100) } },
    },
  };
  const withCmp = H.adaptModelStatsCompare(raw, "with_price");
  assert.equal(withCmp.days.length, 2);
  assert.equal(withCmp.days[0].date, "2026-11-03");
  assert.equal(withCmp.days[0].pl_units, 1.4);
  assert.equal(withCmp.days[0].wins, 2);
  assert.equal(withCmp.days[0].losses, 1);
  assert.equal(withCmp.days[1].pl_units, -2);
  assert.equal(withCmp.totals.wins, 2);
  assert.equal(withCmp.totals.losses, 3);
  assert.equal(withCmp.totals.n, 5);
  assert.equal(withCmp.totals.net_units, -0.6);
  assert.equal(withCmp.totals.staked_units, 5);
  assert.equal(withCmp.totals.roi_pct, -12);
  assert.equal(withCmp.totals.bestDay.date, "2026-11-03");
  assert.equal(withCmp.totals.worstDay.date, "2026-11-04");

  const wo = H.adaptModelStatsCompare(raw, "without_price");
  assert.equal(wo.totals.wins, 3);
  assert.equal(wo.totals.net_units, 1.6);
  assert.equal(wo.days[1].pl_units, 2.2);

  const none = H.adaptModelStatsCompare(raw, "none");
  assert.deepEqual(none.days, []);
  assert.equal(none.totals.n, 0);

  assert.equal(H.compareDayTone(withCmp.days[0]), "bp-won");
  assert.equal(H.compareDayTone(withCmp.days[1]), "bp-lost");
});
