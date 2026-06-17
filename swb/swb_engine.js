/* =========================================================================
 *  SWB Engine v2.0 — AS/NZS 3008 cable engine + AS/NZS 3000 App.C max demand
 *  Neill Data & Security
 *
 *  Pure, dependency-free, data-driven. Works in the browser (window.SWBEngine)
 *  and in Node (module.exports) so the same logic powers the app AND the tests.
 *
 *  ⚠ Design-aid only. All outputs are advisory and must be verified and
 *  certified by a licensed electrician against AS/NZS 3000. The engine never
 *  hard-codes Standard figures — it reads them from the ND_SWB_Reference rows
 *  (CableCCC / VoltageDrop / Derating / LoadGroups) and flags any row whose
 *  `verified` flag is not TRUE.
 * ========================================================================= */
(function (root) {
  "use strict";

  /* ── Standard ladders (physical product sizes, not Standard figures) ────── */
  const CABLE_SIZES   = [1, 1.5, 2.5, 4, 6, 10, 16, 25, 35, 50, 70, 95, 120, 150, 185, 240, 300];
  const BREAKER_SIZES = [6, 10, 16, 20, 25, 32, 40, 50, 63, 80, 100, 125, 160, 200, 250];
  const VD_LIMIT_PCT  = 5;          // AS/NZS 3000 Cl. 3.6.2 — 5 % of nominal
  const V_1PH         = 230;
  const V_3PH         = 400;

  const round = (n, d = 2) => { const f = 10 ** d; return Math.round((n + Number.EPSILON) * f) / f; };
  const truthy = v => v === true || v === "TRUE" || v === "true" || v === 1 || v === "1";

  /* ── Reference-data indexer ──────────────────────────────────────────────
   * Takes the long-format rows from the three reference tabs and builds fast
   * lookups. Each row keeps its `verified` flag so the engine can warn when a
   * result depends on an unverified figure.
   * ----------------------------------------------------------------------- */
  function buildRefIndex(ref) {
    const ccc = {};       // cableTypeId|installMethodId|size -> {ccc, ref, verified}
    (ref.cableCCC || []).forEach(r => {
      ccc[`${r.cableTypeId}|${r.installMethodId}|${+r.size_mm2}`] =
        { ccc: +r.baseCCC_A, ref: r.sourceTableRef, verified: truthy(r.verified) };
    });

    const vd = {};        // cableTypeId|size|phase -> {mv, condTemp, ref, verified}
    (ref.voltageDrop || []).forEach(r => {
      vd[`${r.cableTypeId}|${+r.size_mm2}|${r.phase}`] =
        { mv: +r.mV_per_A_m, condTemp: +r.condTemp_C, ref: r.sourceTableRef, verified: truthy(r.verified) };
    });

    const der = {};       // factorType|key1|key2 -> {factor, ref, verified}
    (ref.derating || []).forEach(r => {
      der[`${r.factorType}|${r.key1}|${r.key2 == null ? "" : r.key2}`] =
        { factor: +r.factor, ref: r.sourceTableRef, verified: truthy(r.verified) };
    });

    return { ccc, vd, der, sizesFor };

    // Cable sizes that exist for a given type+method, ascending.
    function sizesFor(cableTypeId, installMethodId) {
      return CABLE_SIZES.filter(s => ccc[`${cableTypeId}|${installMethodId}|${s}`] != null);
    }
  }

  /* ── Derating ────────────────────────────────────────────────────────────
   * Multiply the applicable factors. Each factor is looked up by its keys.
   * Any missing/unverified factor is surfaced so the caller can warn.
   * factorSpecs: [{factorType, key1, key2}] e.g.
   *   {factorType:"grouping", key1:"Single layer touching", key2:3}
   *   {factorType:"ambient_air", key1:75, key2:40}
   * ----------------------------------------------------------------------- */
  function deratingProduct(idx, factorSpecs) {
    let product = 1;
    const used = [];
    let unverified = false, missing = false;
    (factorSpecs || []).forEach(spec => {
      const key = `${spec.factorType}|${spec.key1}|${spec.key2 == null ? "" : spec.key2}`;
      const row = idx.der[key];
      if (!row) { missing = true; used.push({ ...spec, factor: null, missing: true }); return; }
      product *= row.factor;
      if (!row.verified) unverified = true;
      used.push({ ...spec, factor: row.factor, ref: row.ref, verified: row.verified });
    });
    return { factor: round(product, 4), used, unverified, missing };
  }

  /* ── Voltage drop ────────────────────────────────────────────────────────
   * Vd (volts) = mV/A·m × I_B × L / 1000.  % = Vd / Vnom × 100.
   * Cumulative upstream drop (volts) accrues so a long submain doesn't starve
   * its sub-board's circuits.
   * ----------------------------------------------------------------------- */
  function voltageDrop(idx, cableTypeId, size, phase, current, lengthM, upstreamVolts = 0) {
    const ph = phase === "3ph" || phase === "three" || phase === 3 ? "3ph" : "1ph";
    const row = idx.vd[`${cableTypeId}|${+size}|${ph}`];
    if (!row) return { ok: null, missing: true };
    const vnom = ph === "3ph" ? V_3PH : V_1PH;
    const volts = row.mv * current * lengthM / 1000;
    const totalVolts = volts + upstreamVolts;
    const pct = totalVolts / vnom * 100;
    return {
      volts: round(volts, 3), totalVolts: round(totalVolts, 3),
      pct: round(pct, 2), limitPct: VD_LIMIT_PCT, ok: pct <= VD_LIMIT_PCT,
      ref: row.ref, verified: row.verified, vnom
    };
  }

  /* ── Single-segment cable assessment ─────────────────────────────────────
   * Returns I_Z, coordination, and the governing constraint for ONE segment.
   * ----------------------------------------------------------------------- */
  function segmentIZ(idx, seg) {
    const base = idx.ccc[`${seg.cableTypeId}|${seg.installMethodId}|${+seg.size}`];
    if (!base) return { iz: null, missing: true };
    const der = deratingProduct(idx, seg.factors);
    return {
      baseCCC: base.ccc, ref: base.ref, verified: base.verified,
      derating: der.factor, deratingUsed: der.used,
      iz: round(base.ccc * der.factor, 2),
      unverified: !base.verified || der.unverified, missing: der.missing
    };
  }

  /* ── Full circuit/run cable assessment ───────────────────────────────────
   * run = {
   *   I_B, I_n, phase, segments:[{cableTypeId, installMethodId, size, lengthM, factors}],
   *   upstreamVolts
   * }
   * A run is ONE continuous cable. CCC is a temperature limit, not an average:
   * governing I_Z = the MINIMUM derated I_Z across segments (AS/NZS 3008 §3.4).
   * Voltage drop accrues along all segments + any upstream drop.
   * ----------------------------------------------------------------------- */
  function assessRun(idx, run) {
    const segs = run.segments || [];
    const warnings = [];
    let governingIZ = Infinity, governingRef = null, anyUnverified = false, anyMissing = false;

    const segResults = segs.map(seg => {
      const r = segmentIZ(idx, seg);
      if (r.missing || r.iz == null) { anyMissing = true; return r; }
      if (r.unverified) anyUnverified = true;
      if (r.iz < governingIZ) { governingIZ = r.iz; governingRef = r.ref; }
      return r;
    });
    if (!isFinite(governingIZ)) governingIZ = null;

    // Voltage drop accrues down the run, then onto any upstream drop.
    let vdVolts = run.upstreamVolts || 0, vdMissing = false, vdVerifiedAll = true;
    const size0 = segs[0]?.size;
    segs.forEach(seg => {
      const vd = voltageDrop(idx, seg.cableTypeId, seg.size, run.phase, run.I_B, seg.lengthM || 0, 0);
      if (vd.missing) { vdMissing = true; return; }
      if (!vd.verified) vdVerifiedAll = false;
      vdVolts += vd.volts;
    });
    const vnom = (run.phase === "3ph" || run.phase === "three") ? V_3PH : V_1PH;
    const vdPct = vdMissing ? null : round(vdVolts / vnom * 100, 2);

    // Constraint checks → governing worst case
    const checks = [];
    // (1) load vs breaker
    checks.push({ name: "breaker", ok: run.I_B <= run.I_n, detail: `I_B ${run.I_B} A vs I_n ${run.I_n} A` });
    // (2) cable overload  I_B ≤ I_Z
    if (governingIZ != null) checks.push({ name: "ccc", ok: run.I_B <= governingIZ, detail: `I_B ${run.I_B} A vs I_Z ${governingIZ} A` });
    // (3) coordination  I_n ≤ I_Z  (AS/NZS 3000 Cl 2.5.3.1)
    if (governingIZ != null) checks.push({ name: "coordination", ok: run.I_n <= governingIZ, detail: `I_n ${run.I_n} A vs I_Z ${governingIZ} A` });
    // (4) voltage drop
    if (vdPct != null) checks.push({ name: "voltdrop", ok: vdPct <= VD_LIMIT_PCT, detail: `${vdPct}% vs ${VD_LIMIT_PCT}% limit` });

    if (anyMissing || vdMissing) warnings.push("Missing reference data for one or more segments/sizes.");
    if (anyUnverified || !vdVerifiedAll) warnings.push("Result relies on a reference row not marked verified=TRUE.");

    const failed = checks.filter(c => c.ok === false);
    const governing = failed[0]?.name || "ok";
    const status = failed.length ? "fail" : (anyMissing || vdMissing ? "incomplete" : "ok");

    return {
      iz: governingIZ, governingIZRef: governingRef,
      vdVolts: round(vdVolts, 3), vdPct,
      checks, governing, status, warnings,
      segResults
    };
  }

  /* ── Auto-fix: smallest compliant cable size ─────────────────────────────
   * Keeps install method/factors, walks the size ladder for this cable type,
   * returns the smallest size that satisfies coordination + voltage drop.
   * Advisory only — caller confirms before committing.
   * ----------------------------------------------------------------------- */
  function smallestCompliantSize(idx, run) {
    const seg0 = run.segments[0];
    const sizes = idx.sizesFor(seg0.cableTypeId, seg0.installMethodId);
    for (const size of sizes) {
      const trial = {
        ...run,
        segments: run.segments.map(s => ({ ...s, size }))
      };
      const res = assessRun(idx, trial);
      if (res.status === "ok") return { size, result: res };
    }
    return { size: null, result: null };
  }

  /* ── Max-demand engine (AS/NZS 3000 Appendix C, Tables C1/C2) ─────────────
   * Fully data-driven. A LoadGroups rule row drives each group:
   *   rule_type: per_point | per_circuit | pct_connected | largest_plus_pct | wpl_threshold
   *   param1, param2 supply the numbers (held in the sheet, verified vs C1/C2).
   *
   * loadsByGroup: { A:[{amps, points, circuits, watts, litres, elementW}], ... }
   * rules:        { A:{rule_type, param1, param2, ...}, ... }
   * Returns assessed demand (A) for each group + total.
   * ----------------------------------------------------------------------- */
  function assessGroup(loads, rule) {
    if (!rule) return { amps: sum(loads.map(l => l.amps || 0)), note: "no rule — connected load used" };
    const items = loads || [];
    const p1 = +rule.param1, p2 = +rule.param2;
    switch (rule.rule_type) {
      case "per_point": {
        const points = sum(items.map(l => l.points || 1));
        return { amps: round(p1 * points), note: `${p1} A × ${points} pts` };
      }
      case "per_circuit": {
        const circuits = sum(items.map(l => l.circuits || 1));
        return { amps: round(p1 * circuits), note: `${p1} A × ${circuits} circuits` };
      }
      case "pct_connected": {
        const connected = sum(items.map(l => l.amps || 0));
        return { amps: round(connected * p1 / 100), note: `${p1}% of ${round(connected)} A connected` };
      }
      case "largest_plus_pct": {
        // largest load at full + param1% of the sum of the remainder
        const a = items.map(l => l.amps || 0).sort((x, y) => y - x);
        const largest = a[0] || 0;
        const rest = sum(a.slice(1));
        return { amps: round(largest + rest * p1 / 100), note: `largest ${round(largest)} A + ${p1}% of ${round(rest)} A` };
      }
      case "wpl_threshold": {
        // water heaters: W/L decides the demand factor (param1 ≥threshold %, param2 <threshold %)
        const connected = sum(items.map(l => l.amps || 0));
        const wpl = items.map(l => (l.elementW && l.litres) ? l.elementW / l.litres : 0);
        const allHigh = wpl.length && wpl.every(w => w >= (rule.threshold || 100));
        const factor = allHigh ? p1 : p2;
        return { amps: round(connected * factor / 100), note: `${factor}% (W/L ${allHigh ? "≥" : "<"} ${rule.threshold || 100})` };
      }
      default:
        return { amps: sum(items.map(l => l.amps || 0)), note: "unknown rule — connected load used" };
    }
  }

  function assessInstallation(loadsByGroup, rules) {
    const groups = {};
    let total = 0;
    Object.keys(loadsByGroup || {}).forEach(g => {
      const r = assessGroup(loadsByGroup[g], rules ? rules[g] : null);
      groups[g] = r;
      total += r.amps;
    });
    return { groups, totalA: round(total) };
  }

  /* ── Consumer-mains recommendation ───────────────────────────────────────
   * Given assessed max demand (A), pick the smallest main-switch rating that
   * covers it and the smallest mains cable whose derated I_Z and voltage drop
   * pass for the supplied run. Advisory.
   * ----------------------------------------------------------------------- */
  function recommendMain(idx, assessedA, mainsRun) {
    const mainSwitchA = BREAKER_SIZES.find(b => b >= assessedA) || BREAKER_SIZES[BREAKER_SIZES.length - 1];
    let cable = null;
    if (mainsRun) {
      const run = { ...mainsRun, I_B: assessedA, I_n: mainSwitchA };
      cable = smallestCompliantSize(idx, run);
    }
    return { assessedA: round(assessedA), mainSwitchA, mainsCable: cable };
  }

  /* per-phase split for 3Ø: assess each phase's connected loads then take total */
  function assessPerPhase(loadsByGroupByPhase, rules) {
    const out = {};
    let totalA = 0;
    ["L1", "L2", "L3"].forEach(ph => {
      if (!loadsByGroupByPhase[ph]) return;
      const r = assessInstallation(loadsByGroupByPhase[ph], rules);
      out[ph] = r;
      totalA = Math.max(totalA, r.totalA); // mains sized on the worst-loaded phase
    });
    return { perPhase: out, designPhaseA: round(totalA) };
  }

  function sum(a) { return (a || []).reduce((s, x) => s + (+x || 0), 0); }

  const API = {
    CABLE_SIZES, BREAKER_SIZES, VD_LIMIT_PCT, V_1PH, V_3PH,
    buildRefIndex, deratingProduct, voltageDrop, segmentIZ, assessRun,
    smallestCompliantSize, assessGroup, assessInstallation, assessPerPhase,
    recommendMain, round, truthy
  };

  if (typeof module !== "undefined" && module.exports) module.exports = API;
  else root.SWBEngine = API;
})(typeof window !== "undefined" ? window : globalThis);
