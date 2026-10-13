#!/usr/bin/env node
/* Pre-merge release lint (CI). For every top-level app with a sw.js:
 *  1. Versions agree: VERSION == APP_VERSION (if present) == SW cache "<prefix>-<VERSION>" ==
 *     every local ?v=X.Y.Z in index.html and sw.js. Apps listed in VN_APPS use "<prefix>-vN" caches
 *     with cache-only bumps and are only checked for that format.
 *  2. SW activate cleanup filters to its own prefix (k.startsWith('<prefix>-')).
 *  3. No icon PNG changed vs the base branch unless a commit in the range has the trailer
 *     "Icons-Changed: yes" or ICONS_CHANGED_OK=1 (set by CI from a PR label).
 * Usage: node scripts/lint-release.cjs [--base origin/main] */
const fs = require("node:fs");
const path = require("node:path");
const { execSync } = require("node:child_process");
const ROOT = path.join(__dirname, "..");
const VN_APPS = new Set(["hub", "swb", "upload", "search"]);
const errors = [];
const err = (m) => errors.push(m);
const read = (p) => (fs.existsSync(p) ? fs.readFileSync(p, "utf8") : null);

for (const ent of fs.readdirSync(ROOT, { withFileTypes: true })) {
  if (!ent.isDirectory() || ent.name.startsWith(".") || ent.name === "node_modules") continue;
  const dir = path.join(ROOT, ent.name);
  const sw = read(path.join(dir, "sw.js"));
  if (!sw) continue;
  const app = ent.name;
  const m = sw.match(/CACHE_VERSION\s*=\s*['"]([a-z0-9]+)-(v\d+|\d+\.\d+\.\d+)['"]/i);
  if (!m) { err(`${app}: sw.js has no CACHE_VERSION "<prefix>-<version>"`); continue; }
  const [, prefix, cver] = m;
  const del = sw.match(/caches\.delete/);
  const ownPrefix = new RegExp(`startsWith\\(\\s*['"]${prefix}-['"]\\s*\\)`).test(sw)
    || (new RegExp(`CACHE_PREFIX\\s*=\\s*['"]${prefix}-['"]`).test(sw) && /startsWith\(\s*CACHE_PREFIX\s*\)/.test(sw));
  if (del && !ownPrefix) err(`${app}: SW cache cleanup is not filtered to '${prefix}-'`);
  if (VN_APPS.has(app)) { if (!/^v\d+$/.test(cver)) err(`${app}: expected ${prefix}-vN cache name`); continue; }
  const version = (read(path.join(dir, "VERSION")) || "").trim();
  if (!version) { err(`${app}: VERSION file missing (or add it to VN_APPS)`); continue; }
  if (cver !== version) err(`${app}: SW cache ${prefix}-${cver} != VERSION ${version}`);
  const html = read(path.join(dir, "index.html")) || "";
  for (const f of [path.join(dir, "index.html"), path.join(dir, "app.js")]) {
    const s = read(f); if (!s) continue;
    const av = s.match(/APP_VERSION\s*=\s*['"]([^'"]+)['"]/);
    if (av && av[1] !== version) err(`${app}: APP_VERSION ${av[1]} in ${path.basename(f)} != VERSION ${version}`);
  }
  for (const [name, s] of [["index.html", html], ["sw.js", sw]]) {
    const re = /["'(](?!\.\.\/)(?!https?:)\.?\/?(\w[\w./-]*)\?v=(\d+\.\d+\.\d+)/g; let r;
    while ((r = re.exec(s))) if (r[2] !== version) err(`${app}: ${name} ${r[1]}?v=${r[2]} != VERSION ${version}`);
  }
}

const baseArg = process.argv.indexOf("--base");
const base = baseArg > 0 ? process.argv[baseArg + 1] : process.env.LINT_BASE || "origin/main";
try {
  const sh = (c) => execSync(c, { cwd: ROOT, stdio: ["ignore", "pipe", "ignore"] }).toString();
  const mb = sh(`git merge-base ${base} HEAD`).trim();
  const changed = sh(`git diff --name-only ${mb} HEAD`).split("\n").filter((f) => /\.png$/i.test(f) && /(^|\/)(icons?\/|icon-|apple-touch|maskable)/i.test(f));
  const trailer = /^Icons-Changed:\s*yes\s*$/im.test(sh(`git log --format=%B ${mb}..HEAD`));
  if (changed.length && !trailer && process.env.ICONS_CHANGED_OK !== "1") err(`icon PNGs changed vs ${base} (add trailer "Icons-Changed: yes" or the icons-changed PR label): ${changed.join(", ")}`);
} catch (e) {
  console.warn(`lint-release: icon check skipped (no ${base} to diff against)`);
}

if (errors.length) { console.error("lint-release FAILED\n - " + errors.join("\n - ")); process.exit(1); }
console.log("lint-release OK");
