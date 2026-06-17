/* Node test harness for swb_engine.js  (ASCII-only for portability)
 * Feeds the engine the real AS/NZS 3008 reference data (the CSVs loaded into
 * ND_SWB_Reference) and checks engine output against the Standard's own worked
 * examples.  Run:  node swb_engine.test.js
 */
const fs = require("fs");
const path = require("path");
const E = require("./swb_engine.js");

function readCSV(file) {
  const lines = fs.readFileSync(path.join(__dirname, "reference_data", file), "utf8")
    .trim().split(/\r?\n/);
  const head = lines[0].split(",");
  return lines.slice(1).map(l => {
    const cells = l.split(",");
    const o = {};
    head.forEach((h, i) => o[h] = cells[i]);
    return o;
  });
}

const ref = {
  cableCCC:    readCSV("CableCCC_filled.csv"),
  voltageDrop: readCSV("VoltageDrop_filled.csv"),
  derating:    readCSV("Derating_filled.csv"),
};
const idx = E.buildRefIndex(ref);

let pass = 0, fail = 0;
function eq(label, got, want) {
  const ok = got === want;
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}  ->  ${got}${ok ? "" : `   (expected ${want})`}`);
  ok ? pass++ : fail++;
}
function near(label, got, want, tol = 0.01) {
  const ok = Math.abs(got - want) <= tol;
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}  ->  ${got}${ok ? "" : `   (expected ~${want})`}`);
  ok ? pass++ : fail++;
}

console.log("\n== CCC lookups (AS/NZS 3008 Tables 4/8/10/11) ==");
eq("sc_v75_cu clipped_touching 2.5mm2 = 23A (T4 col8)", idx.ccc["sc_v75_cu|clipped_touching|2.5"].ccc, 23);
eq("sc_x90_cu clipped_touching 25mm2 = 117A (T8 col8)", idx.ccc["sc_x90_cu|clipped_touching|25"].ccc, 117);
eq("tps_v90_2c clipped_touching 6mm2 = 44A (T10 col5)", idx.ccc["tps_v90_2c|clipped_touching|6"].ccc, 44);

console.log("\n== Derating products (Standard worked examples) ==");
const d1 = E.deratingProduct(idx, [
  { factorType: "grouping", key1: "Bunched on surface or enclosed", key2: 2 },
  { factorType: "ambient_air", key1: 75, key2: 50 },
]);
near("0.80 x 0.82 = 0.656 (Standard example)", d1.factor, 0.656);
const d2 = E.deratingProduct(idx, [{ factorType: "ambient_air", key1: 75, key2: 25 }]);
near("ambient_air 75C @25C = 1.21", d2.factor, 1.21);
const d3 = E.deratingProduct(idx, [{ factorType: "grouping", key1: "Single layer touching", key2: 3 }]);
near("grouping single-layer-touching 3 circuits = 0.79", d3.factor, 0.79);

console.log("\n== I_Z and coordination ==");
const seg = {
  cableTypeId: "sc_v75_cu", installMethodId: "clipped_touching", size: 2.5,
  factors: [
    { factorType: "grouping", key1: "Single layer touching", key2: 3 },
    { factorType: "ambient_air", key1: 75, key2: 40 },
  ],
};
near("I_Z = 23 x 0.79 x 1.00 = 18.17A", E.segmentIZ(idx, seg).iz, 18.17, 0.05);

console.log("\n== Full run assessment (governing worst-case) ==");
const run1 = E.assessRun(idx, { I_B: 16, I_n: 20, phase: "1ph", segments: [{ ...seg, lengthM: 15 }] });
eq("20A breaker on derated 2.5mm2 -> governing=coordination", run1.governing, "coordination");
eq("...status = fail", run1.status, "fail");
const run2 = E.assessRun(idx, { I_B: 14, I_n: 16, phase: "1ph", segments: [{ ...seg, lengthM: 12 }] });
eq("16A breaker, short run -> status ok", run2.status, "ok");

console.log("\n== Voltage drop ==");
const vd = E.voltageDrop(idx, "sc_v75_cu", 2.5, "1ph", 18, 30);
near("Vd = 18.02 x 18 x 30 / 1000 = 9.73V", vd.volts, 9.73, 0.02);
near("Vd pct = 9.73 / 230 = 4.23pct", vd.pct, 4.23, 0.05);
eq("...within 5pct limit", vd.ok, true);
eq("50m run breaches 5pct", E.voltageDrop(idx, "sc_v75_cu", 2.5, "1ph", 18, 50).ok, false);

console.log("\n== Multi-segment governing-min I_Z ==");
const multi = E.assessRun(idx, {
  I_B: 16, I_n: 16, phase: "1ph",
  segments: [
    { cableTypeId: "sc_v75_cu", installMethodId: "spaced_surface", size: 4, lengthM: 10,
      factors: [{ factorType: "ambient_air", key1: 75, key2: 40 }] },
    { cableTypeId: "sc_v75_cu", installMethodId: "clipped_touching", size: 4, lengthM: 5,
      factors: [{ factorType: "grouping", key1: "Bunched on surface or enclosed", key2: 4 },
                { factorType: "ambient_air", key1: 75, key2: 40 }] },
  ],
});
near("governing I_Z = min(40, 20.15) = 20.15A", multi.iz, 20.15, 0.1);

console.log("\n== Auto-fix: smallest compliant size ==");
const fix = E.smallestCompliantSize(idx, {
  I_B: 20, I_n: 25, phase: "1ph",
  segments: [{ cableTypeId: "sc_v75_cu", installMethodId: "clipped_touching", size: 2.5, lengthM: 10,
    factors: [{ factorType: "ambient_air", key1: 75, key2: 40 }] }],
});
eq("25A breaker -> smallest compliant clipped = 4mm2 (CCC 31 >= 25)", fix.size, 4);

console.log("\n== Max-demand engine (rule mechanics) ==");
near("cooking 50pct of 30A = 15A", E.assessGroup([{ amps: 30 }], { rule_type: "pct_connected", param1: 50 }).amps, 15);
near("motors 30 + 50pct(20+10) = 45A", E.assessGroup([{ amps: 30 }, { amps: 20 }, { amps: 10 }], { rule_type: "largest_plus_pct", param1: 50 }).amps, 45);
near("lighting 0.5A x 20pts = 10A", E.assessGroup([{ points: 20 }], { rule_type: "per_point", param1: 0.5 }).amps, 10);

console.log("\n== Consumer-mains recommendation ==");
const rec = E.recommendMain(idx, 58, {
  phase: "1ph",
  segments: [{ cableTypeId: "sc_x90_cu", installMethodId: "spaced_surface", size: 16, lengthM: 20,
    factors: [{ factorType: "ambient_air", key1: 90, key2: 40 }] }],
});
eq("58A assessed -> 63A main switch", rec.mainSwitchA, 63);

console.log(`\n-------- ${pass} passed, ${fail} failed --------\n`);
process.exit(fail ? 1 : 0);
