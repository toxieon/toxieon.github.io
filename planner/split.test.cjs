// Planner split (0.21.3): app.js became classic scripts under js/, loaded in index.html order.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { execFileSync } = require("node:child_process");
const { plannerScripts, loadPlannerSource } = require("./test-utils.cjs");

const read = (f) => fs.readFileSync(path.join(__dirname, f), "utf8");
// Pre-split planner/app.js (git blob) the split was cut from. Used only by the review-time check below.
const PRE_SPLIT_APP_JS_BLOB = "82b2fcb4520ad55f4e55a7e91af1bb5317f3c49e";
const SPLIT_VERSION = "0.21.3";
// The one statement that moved: loadState() runs at load and calls nowStamp(), which lived in HELPERS.
const MOVED = 'function nowStamp() { return new Date().toISOString().slice(0, 16).replace("T", " "); }';

test("every Planner script in index.html is precached by sw.js, and app.js is gone", () => {
  const html = read("index.html"), sw = read("sw.js");
  const local = [...html.matchAll(/<script src="(?!\.\.\/|https?:)([^"]+)"/g)].map((m) => m[1]);
  assert.ok(local.length >= 15, "local scripts found");
  for (const src of local) assert.ok(sw.includes('"./' + src + '"'), "sw.js precaches ./" + src);
  assert.doesNotMatch(html + sw, /["/]app\.js/, "no app.js reference left");
  assert.equal(fs.existsSync(path.join(__dirname, "app.js")), false);
  const onDisk = fs.readdirSync(path.join(__dirname, "js")).filter((f) => f.endsWith(".js")).map((f) => "js/" + f).sort();
  assert.deepEqual([...plannerScripts()].sort(), onDisk, "every js/ file is loaded, and nothing else");
  assert.equal(plannerScripts()[plannerScripts().length - 1], "js/boot.js", "boot.js loads last");
  for (const f of plannerScripts()) assert.match(html, new RegExp(`<script src="${f}\\?v=[\\d.]+" defer></script>`), f + " is deferred");
});

test("no split file is over 1,200 lines", () => {
  for (const f of plannerScripts()) {
    const n = read(f).split("\n").length;
    assert.ok(n <= 1200, f + " has " + n + " lines");
  }
});

test("loading the files in order runs startup code cleanly and keeps legacy saved projects", () => {
  // A v3-era saved project (no floors, no createdAt) makes loadState() -> migrateState() call
  // nowStamp() while js/state.js loads. If nowStamp were in a later file, loadState's catch would
  // quietly fall back to a fresh state and the saved project would be dropped.
  const warnings = [];
  const store = { "neillplanner-state-v4": JSON.stringify({ projects: [{ id: "p1", name: "Legacy project" }], nodes: [{ id: "n1", projectId: "p1" }], floorPlans: {}, drive: {} }) };
  const noop = () => {};
  const el = () => ({ addEventListener: noop, setAttribute: noop, classList: { add: noop, remove: noop, toggle: noop }, style: {}, appendChild: noop });
  const ctx = {
    console: { log: noop, info: noop, warn: (...a) => warnings.push(a.map(String).join(" ")), error: (...a) => warnings.push(a.map(String).join(" ")) },
    localStorage: { getItem: (k) => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); }, removeItem: (k) => { delete store[k]; } },
    sessionStorage: { getItem: () => null, setItem: noop, removeItem: noop },
    document: { addEventListener: noop, querySelector: () => null, querySelectorAll: () => [], getElementById: () => null, createElement: el, body: el(), documentElement: el(), head: el() },
    location: { hash: "", search: "", href: "https://example.test/planner/", pathname: "/planner/" },
    history: { replaceState: noop, pushState: noop },
    navigator: { onLine: true, userAgent: "node" },
    setTimeout, clearTimeout, setInterval, clearInterval,
    addEventListener: noop, removeEventListener: noop, matchMedia: () => ({ matches: false, addEventListener: noop }),
  };
  ctx.window = ctx;
  vm.createContext(ctx);
  // boot.js renders and starts Google sign-in, which needs a real browser: everything before it must load.
  for (const f of plannerScripts().filter((x) => x !== "js/boot.js")) {
    assert.doesNotThrow(() => vm.runInContext(read(f), ctx, { filename: f }), f + " loads after the files before it");
  }
  const state = vm.runInContext("state", ctx);
  assert.deepEqual(warnings, [], "no load-time warnings (e.g. \"Saved state could not be loaded\")");
  assert.equal(state.projects.length, 1, "saved project kept");
  assert.equal(state.projects[0].name, "Legacy project");
  assert.match(state.projects[0].floors[0].createdAt, /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/, "migration stamped the floor with nowStamp()");
  assert.equal(state.nodes[0].floorId, state.projects[0].floors[0].id);
  assert.equal(vm.runInContext("typeof window.NDQueue.flush", ctx), "function", "NDQueue facade set up at load");
});

test("the Assets page can still read Planner's icons and palette from js/state.js", () => {
  const stateJs = read("js/state.js");
  for (const decl of ["const iconPaths = {", "const statusMeta = {", "const DEFAULT_CATEGORY_TABS = [", "const DEFAULT_FOLDER_COLORS = ["]) {
    assert.ok(stateJs.includes(decl), "js/state.js has " + decl);
  }
  const assets = fs.readFileSync(path.join(__dirname, "..", "1234567890", "index.html"), "utf8");
  assert.match(assets, /getText\("\.\.\/planner\/js\/state\.js"\)/);
  assert.doesNotMatch(assets, /getText\("\.\.\/planner\/app\.js"\)/);
});

test("DIAGNOSTIC (temporary) is isolated in js/diagnostic.js", () => {
  const diag = read("js/diagnostic.js");
  assert.match(diag, /^\/\* ==== DIAGNOSTIC \(temporary\)/);
  assert.deepEqual([...diag.matchAll(/^(?:async )?function (\w+)/gm)].map((m) => m[1]), ["diagInjectBucketNode"]);
});

test("review check: the joined files are the pre-split app.js, moved verbatim", (t) => {
  if (read("VERSION").trim() !== SPLIT_VERSION) return t.skip("planner moved past " + SPLIT_VERSION + "; this check was for reviewing the split");
  let original;
  try {
    original = execFileSync("git", ["cat-file", "-p", PRE_SPLIT_APP_JS_BLOB], { cwd: __dirname, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"], maxBuffer: 64 * 1024 * 1024 });
  } catch (e) {
    return t.skip("pre-split app.js blob " + PRE_SPLIT_APP_JS_BLOB.slice(0, 10) + " not in this checkout");
  }
  if (!/APP_VERSION = "0\.21\.3"/.test(loadPlannerSource())) return t.skip("APP_VERSION already bumped");
  // Take the one moved line out of both, then every file must be the next run of the original,
  // allowing only whitespace at the joins.
  assert.equal(original.split(MOVED).length, 2, "moved line is in the original once");
  const stateJs = read("js/state.js");
  assert.ok(stateJs.trimEnd().endsWith(MOVED), "nowStamp sits at the end of js/state.js");
  let rest = original.replace(MOVED + "\n", "");
  for (const f of plannerScripts()) {
    let body = read(f);
    if (f === "js/state.js") body = body.trimEnd().slice(0, -MOVED.length);
    body = body.trim();
    rest = rest.replace(/^\s+/, "");
    assert.ok(rest.startsWith(body), f + " is not a verbatim run of the original at this point");
    rest = rest.slice(body.length);
  }
  assert.equal(rest.trim(), "", "nothing of the original is missing");
});
