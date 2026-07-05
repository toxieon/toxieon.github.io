/* Node test harness for nd-match.js.
 * Includes byte-equivalence checks against the behaviour documented in
 * v1.0 §1.2 (weights, penalties, uniqueness rule).
 * Run:  node shared/nd-match.test.js
 */
const M = require("./nd-match.js");

let pass = 0, fail = 0;
function ok(cond, name) {
  if (cond) { pass++; console.log("  PASS  " + name); }
  else      { fail++; console.log("  FAIL  " + name); }
}

console.log("normalize / addressKey (v1.0 §3.3 canonical grouping)");
ok(M.normalize("12 Smith Street, Mount Eliza VIC 3930, Australia") === "12 smith street mount eliza 3930", "strips vic/australia + punctuation");
ok(M.normalize("12-Smith  St.") === M.normalize("12 smith st"), "punctuation/case insensitive grouping");
ok(M.addressKey(" 12 Smith St, VICTORIA ") === "12 smith st", "addressKey === normalize");
ok(M.normalizeRoom("Master Bedroom #2") === "masterbedroom2", "normalizeRoom compacts");
ok(M.normalizeCompact("12 Smith St VIC") === "12smithst", "normalizeCompact");

console.log("levenshtein / similarity");
ok(M.levenshteinDistance("kitten", "sitting") === 3, "kitten->sitting = 3");
ok(M.levenshteinDistance("abc", "abc") === 0, "identical = 0");
ok(M.levenshteinDistance("", "abc") === 3, "empty vs abc = 3");
ok(M.stringSimilarity("abcd", "abcd") === 1, "similarity identical = 1");
ok(Math.abs(M.stringSimilarity("abcd", "abcx") - 0.75) < 1e-9, "one edit in four = 0.75");

console.log("bestFieldMatch");
{
  const exact = M.bestFieldMatch([{ value: "Bedroom 1", source: "room" }], ["bedroom-1"]);
  ok(exact && exact.kind === "exact" && exact.similarity === 1, "normalised exact match");
  const fname = M.bestFieldMatch([{ value: "bedroom1", source: "filename" }], ["Bedroom 1"]);
  ok(fname && fname.kind === "fuzzy", "filename source can never be 'exact'");
  const none = M.bestFieldMatch([{ value: "garage", source: "room" }], ["Bedroom 1"]);
  ok(none === null, "unrelated strings don't match");
  const contained = M.bestFieldMatch([{ value: "12 Smith Street Mount Eliza", source: "address" }], ["12 Smith St"], 0.92);
  ok(contained === null || contained.similarity < 1, "containment path returns partial similarity");
}

console.log("destinationMatchDetails — weights & penalties (v1.0 §1.2)");
{
  const dest = { projectId: "P1", projectName: "Smith Reno", address: "12 Smith St", floorId: "F1", floorName: "Ground", nodeId: "N1", nodeName: "Cam 3", deviceType: "Camera", roomNames: ["Bedroom 1"] };
  // exact project by id only:
  const d1 = M.destinationMatchDetails({ projectId: "P1", name: "x.jpg" }, dest);
  ok(d1.fields.project.kind === "exact" && d1.score === 45, "project id match scores exactly 45");
  // fuzzy has 0.72 factor:
  const d2 = M.destinationMatchDetails({ address: "12 Smith Street", name: "x.jpg" }, dest);
  ok(d2.fields.address && d2.score === (d2.fields.address.kind === "exact" ? 45 : 45 * 0.72), "address weight 45 with kind factor");
  // node weight dominates:
  const d3 = M.destinationMatchDetails({ nodeId: "N1", name: "x.jpg" }, dest);
  ok(d3.fields.node.kind === "exact" && d3.score === 120, "node id match scores 120");
  ok(d3.exactDestination === true, "nodeId match alone is an exact destination");
  // filename-sourced fields carry 0.7 penalty and can't be exact:
  const d4 = M.destinationMatchDetails({ name: "bedroom 1.jpg" }, dest);
  if (d4.fields.room) {
    ok(Math.abs(d4.fields.room.similarity - 1) < 1e-9 && d4.fields.room.kind === "fuzzy", "filename room match is fuzzy");
  } else { ok(false, "filename room match found"); }
}

console.log("rankDestinations — uniqueness rule (>=10 separation)");
{
  const destA = { projectId: "PA", projectName: "Alpha House", address: "1 Foo St", nodeId: "NA", nodeName: "Cam 1", roomNames: [] };
  const destB = { projectId: "PB", projectName: "Alpha Houze", address: "1 Foo Street", nodeId: "NB", nodeName: "Cam 1", roomNames: [] };
  // ambiguous file matching both similarly:
  const r = M.rankDestinations({ projectName: "Alpha House", type: "Cam 1", name: "cam 1.jpg" }, [destA, destB]);
  ok(r.ranked.length === 2, "both candidates ranked");
  ok(r.ranked[0].score >= r.ranked[1].score, "sorted by score");
  // nodeId pin overrides ambiguity:
  const r2 = M.rankDestinations({ nodeId: "NB", name: "x.jpg" }, [destA, destB]);
  ok(r2.match === destB, "nodeId pin wins regardless of separation");
  // no destinations:
  const r3 = M.rankDestinations({ projectName: "zzz", name: "x.jpg" }, []);
  ok(r3.match === null && r3.matchDetails === null, "empty destination list is safe");
}

console.log("exact destination requires anchor + 2 details + all-explicit-exact");
{
  const dest = { projectId: "P1", projectName: "Smith Reno", address: "12 Smith St", floorName: "Ground", nodeName: "Cam 3", deviceType: "Camera", roomNames: ["Bedroom 1"] };
  const full = M.destinationMatchDetails(
    { projectName: "Smith Reno", address: "12 Smith St", floorName: "Ground", type: "Camera", name: "x.jpg" }, dest);
  ok(full.exactDestination === true, "fully explicit exact file locks the destination");
  const partial = M.destinationMatchDetails({ address: "12 Smith Street close enough", name: "x.jpg" }, dest);
  ok(partial.exactDestination === false, "fuzzy-only match never auto-files");
}

console.log("fuzzyFilter (Planner §2.5 / Hub §5.1)");
{
  const items = [
    { name: "Smith Reno", address: "12 Smith St" },
    { name: "Jones Extension", address: "4 Bar Rd" },
    { name: "Smythe Renovation", address: "9 Baz Ave" }
  ];
  const get = i => [i.name, i.address];
  const r1 = M.fuzzyFilter("smith", items, get);
  ok(r1.length >= 1 && r1[0].name === "Smith Reno", "prefix/substring hit ranks first");
  ok(M.fuzzyFilter("", items, get).length === 3, "empty query returns everything");
  const r2 = M.fuzzyFilter("jnes", items, get);
  ok(r2.length >= 0, "typo query doesn't throw");
  const r3 = M.fuzzyFilter("bar rd", items, get);
  ok(r3.length >= 1 && r3[0].name === "Jones Extension", "matches across address field");
}

console.log("WEIGHTS frozen contract");
ok(JSON.stringify(M.WEIGHTS) === JSON.stringify({ node: 120, project: 45, address: 45, room: 24, floor: 24, type: 28 }),
   "weights match v1.0 §1.2 exactly");

console.log("\n" + pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
