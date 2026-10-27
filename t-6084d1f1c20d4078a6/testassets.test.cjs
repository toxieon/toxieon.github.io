"use strict";
/* Checks for the unlisted test assets page: state tables match the shipped assets, the CSP is current and closed, nothing can reach the network. */
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const S = require("./states.js");
const { apply, privateApps } = require("../scripts/csp.cjs");
const DIR = __dirname, ROOT = path.join(DIR, "..");
const read = (f) => fs.readFileSync(path.join(DIR, f), "utf8");
const ownFiles = ["index.html", "app.js", "states.js", "style.css"];

test("state tables have the planned counts", () => {
  const n = { CAMERAS: 5, TIMES: 2, VIEWS: 3, BALLS: 17, CLIPS: 23, GAME_STATES: 3, LEG_STATES: 7, GUERNSEYS: 19, BOOKIES: 14, COURSES: 7, EFFECTS: 4, WIN_STYLES: 2 };
  for (const [k, v] of Object.entries(n)) assert.equal(S[k].length, v, k);
  assert.deepEqual(S.LEG_STATES.map((l) => l.id), ["on-track", "at-risk", "near-miss", "hit", "miss", "push", "void"]);
  assert.deepEqual(S.GAME_STATES.map((l) => l.id), ["upcoming", "live", "final"]);
  assert.deepEqual(S.VIEWS.map((l) => l.id).sort(), ["follower", "owner", "public"]);
  for (const t of [S.CAMERAS, S.VIEWS, S.LEG_STATES, S.GAME_STATES, S.COURSES]) assert.equal(new Set(t.map((x) => x.id)).size, t.length);
});

test("every table entry has its asset file", () => {
  for (const b of S.BALLS) assert.ok(fs.existsSync(path.join(DIR, "models/balls/glb", `ball-${b}.glb`)), b);
  const manifest = JSON.parse(read("models/balls/manifest.json"));
  assert.deepEqual(manifest.map((m) => m.id).sort(), [...S.BALLS].sort());
  for (const c of S.COURSES) assert.ok(fs.existsSync(path.join(DIR, "models/racecourses", c.id + ".glb")), c.id);
  for (const g of S.GUERNSEYS) assert.ok(fs.existsSync(path.join(ROOT, "assets/tipdash/guernseys", g + ".svg")), g);
  for (const b of S.BOOKIES) assert.ok(fs.existsSync(path.join(ROOT, "assets/tipdash/bookies", b + ".svg")), b);
});

test("player clip table equals the clips inside the player GLB", () => {
  const d = fs.readFileSync(path.join(DIR, "models/player-v2.1.glb"));
  const json = JSON.parse(d.subarray(20, 20 + d.readUInt32LE(12)).toString("utf8"));
  assert.deepEqual(json.animations.map((a) => a.name), S.CLIPS);
  assert.ok(S.LOOP_CLIPS.every((c) => S.CLIPS.includes(c)));
});

test("score, progress, multi summary and goal end helpers", () => {
  assert.equal(S.scoreTotal(8, 5), 53);
  assert.equal(S.clockText(2, 754), "Q2 12:34");
  assert.equal(S.legProgress(25, 50), 1);
  assert.equal(S.legProgress(25, null), 0);
  assert.deepEqual(S.summarizeMulti([{ state: "hit", odds: 2 }, { state: "hit", odds: 1.5 }], 10), { hit: 2, total: 2, status: "won", payout: 30, miss: 0, dropped: 0 });
  assert.equal(S.summarizeMulti([{ state: "hit", odds: 2 }, { state: "miss", odds: 2 }], 10).status, "lost");
  assert.equal(S.summarizeMulti([{ state: "hit", odds: 2 }, { state: "void", odds: 9 }], 10).payout, 20);
  assert.equal(S.summarizeMulti([{ state: "void", odds: 2 }], 10).status, "void");
  assert.equal(S.goalEnd([0, 4, -44]), 1);
  assert.equal(S.goalEnd([0, 4, 44]), -1);
  assert.equal(S.goalEnd([-36, 11, 6]), -1);
});

test("CSP meta is current, closed to the network, and only this page allows blob:/data: connect", () => {
  const apps = privateApps(ROOT), me = apps["private:testassets"];
  assert.ok(me && me.file === path.basename(DIR) + "/index.html", "page is picked up by the CSP tooling");
  const html = read("index.html");
  assert.equal(apply(me, html), html, "run: node scripts/csp.cjs");
  const p = html.match(/http-equiv="Content-Security-Policy" content="([^"]*)"/)[1];
  const dir = (n) => (p.split(/;\s*/).find((d) => d.startsWith(n + " ")) || "").split(/\s+/).slice(1);
  assert.ok(!/https?:|wss?:|\*/.test(p), "no external origin or wildcard");
  assert.ok(!dir("script-src").some((s) => /^'unsafe-(inline|eval)'$/.test(s)));
  assert.deepEqual(dir("script-src"), ["'self'", "'wasm-unsafe-eval'"]);
  assert.deepEqual(dir("connect-src"), ["'self'", "blob:", "data:"]);
  assert.deepEqual(dir("object-src"), ["'none'"]);
  assert.deepEqual(dir("frame-src"), ["'none'"]);
  assert.ok(html.indexOf("Content-Security-Policy") < html.indexOf("<script") && html.indexOf("Content-Security-Policy") < html.indexOf("stylesheet"));
  assert.ok(!/<script(?![^>]*\bsrc=)[^>]*>\s*\S/i.test(html), "no inline script");
});

test("page is marked private, noindex, TEST-bannered and has no network or private-asset code", () => {
  assert.ok(fs.existsSync(path.join(DIR, ".nd-private")));
  const html = read("index.html");
  assert.match(html, /<meta name="robots" content="noindex/);
  assert.ok(html.includes(S.TEST_BANNER) && S.TEST_BANNER === "TEST PAGE - fake data, nothing is sent anywhere");
  assert.ok(html.includes("btn-goal") && html.includes("Trigger goal") && html.includes("Trigger sponsor win (+2.5U)"));
  for (const f of ownFiles) {
    const s = read(f);
    assert.ok(!/https?:\/\/|wss?:\/\//i.test(s), f + ": external URL");
    assert.ok(!/\b(fetch|XMLHttpRequest|WebSocket|EventSource|sendBeacon|importScripts)\b/.test(s), f + ": network API");
    assert.ok(!/tipbot|models\/private|stadium\.js|TBMatchFx/i.test(s), f + ": private reference");
  }
  assert.ok(!fs.existsSync(path.join(DIR, "models/private")));
  assert.ok(!fs.existsSync(path.join(DIR, "sw.js")), "no service worker");
});

test("three.js is shipped locally with its MIT licence; the slug is not in any public list", () => {
  assert.match(read("vendor/LICENSE-three.txt"), /MIT License/);
  assert.match(read("vendor/libs/meshopt_decoder.module.js"), /MIT License/);
  const slug = path.basename(DIR);
  for (const f of ["hub/apps.json", "sitemap.xml", "robots.txt", "README.md", "404.html", "index.html", "hub/index.html"]) {
    const p = path.join(ROOT, f);
    if (fs.existsSync(p)) assert.ok(!fs.readFileSync(p, "utf8").includes(slug), f + " must not name the hidden folder");
  }
});
