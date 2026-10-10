#!/usr/bin/env node
/* Inventory visual assets across the Neill Data suite + vendored TipDash files.
 *
 *   node scripts/build-visual-catalog.cjs          write 1234567890/visual-catalog.json
 *   node scripts/build-visual-catalog.cjs --check  exit 1 if catalog is stale
 *
 * TipDash static files live under assets/tipdash/ (copied from tipbot-dashboard/assets/).
 * AFL guernsey previews are materialised as SVG from assets/tipdash/source/afl-guernseys.js.
 */
"use strict";

const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const ROOT = path.join(__dirname, "..");
const CATALOG_PATH = path.join(ROOT, "1234567890", "visual-catalog.json");
const TIPDASH_ROOT = path.join(ROOT, "assets", "tipdash");
const GUERNSEY_DIR = path.join(TIPDASH_ROOT, "guernseys");
const GUERNSEY_SRC = path.join(TIPDASH_ROOT, "source", "afl-guernseys.js");

const EXT = new Set([".svg", ".png", ".ico", ".jpg", ".jpeg", ".webp", ".gif", ".woff2"]);
const EXCLUDE_RE = /(?:^|\/)(?:labs|demos?)(?:\/|$)|master|mirror|forward|consensus|ops|owner/i;

const APP_NAMES = {
  hub: "Hub",
  planner: "Planner",
  upload: "Upload",
  search: "Search",
  quote: "Quote",
  timesheet: "Timesheet",
  swb: "SWB",
  fitoff: "Fit-off",
  company: "Company",
  ico: "ICO",
  checklist: "Checklist",
  "1234567890": "Assets",
  battleship: "Battleship",
  m2c: "M2C",
  timesheetlive: "Timesheet Live",
};

const SKIP_DIRS = new Set([
  ".git",
  "node_modules",
  "apps-script",
  "areas",
  ".github",
  "reference_data",
]);

function shouldSkip(rel) {
  const norm = rel.split(path.sep).join("/");
  if (EXCLUDE_RE.test(norm)) return true;
  const parts = norm.split("/");
  for (const p of parts) {
    if (SKIP_DIRS.has(p)) return true;
  }
  if (norm.startsWith("assets/tipdash/source/")) return true;
  return false;
}

function niceName(filePath) {
  const base = path.basename(filePath, path.extname(filePath));
  return base.replace(/[-_]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function suiteCategory(rel) {
  const norm = rel.split(path.sep).join("/");
  const parts = norm.split("/");
  const top = parts[0];

  if (top === "assets") {
    if (parts[1] === "tipdash") return tipdashCategory(parts.slice(2));
    if (parts[1] === "suite-icons") {
      if (parts[2] === "apps") return { category: "Suite library", sub: "App icons" };
      if (parts[2] === "ui") return { category: "Suite library", sub: "UI icons" };
      return { category: "Suite library", sub: "Suite icons" };
    }
    if (parts[1] === "trade-symbols") return { category: "Suite library", sub: "Trade symbols" };
    if (parts[1] === "brand") return { category: "Suite library", sub: "Brand" };
    if (parts[1] === "studio") return { category: "Suite library", sub: "Studio" };
    return { category: "Suite library", sub: parts[1] || "Shared" };
  }

  if (parts.length === 1 || !parts[1]) return { category: "Site", sub: "Root" };

  const appKey = top.toLowerCase();
  const app = APP_NAMES[appKey] || top;
  let sub = "Icons";
  if (parts.includes("icons")) sub = "PWA / home-screen icons";
  else if (parts.includes("assets")) sub = "In-app art";
  else if (parts.includes("vendor")) sub = "Vendor";
  else if (path.basename(rel) === "favicon.svg") sub = "Favicon";
  return { category: app, sub };
}

function tipdashCategory(parts) {
  if (!parts.length || parts[0] === "") return { category: "TipDash", sub: "Logos" };
  const head = parts[0];
  const map = {
    bookies: "Bookmaker logos",
    fx: "Match FX",
    fonts: "Fonts",
    guernseys: "AFL guernseys",
    "club-intros": "Club intros",
  };
  if (head === "logo.svg" || head === "favicon.svg" || head === "favicon.ico") {
    return { category: "TipDash", sub: "Logos" };
  }
  if (/^icon-/.test(head) || head === "apple-touch-icon.png") {
    return { category: "TipDash", sub: "App icons" };
  }
  return { category: "TipDash", sub: map[head] || head };
}

function sourceApp(rel, cat) {
  const norm = rel.split(path.sep).join("/");
  if (norm.startsWith("assets/tipdash/")) return "TipDash (tipbot-dashboard)";
  if (cat.category === "Site") return "Website";
  if (cat.category === "Suite library") return "Suite shared /assets";
  return cat.category;
}

function walk(dir, out) {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const abs = path.join(dir, ent.name);
    const rel = path.relative(ROOT, abs);
    if (shouldSkip(rel)) continue;
    if (ent.isDirectory()) {
      walk(abs, out);
      continue;
    }
    const ext = path.extname(ent.name).toLowerCase();
    if (!EXT.has(ext)) continue;
    out.push(rel.split(path.sep).join("/"));
  }
}

function materialiseGuernseys() {
  if (!fs.existsSync(GUERNSEY_SRC)) return;
  const code = fs.readFileSync(GUERNSEY_SRC, "utf8");
  const sandbox = { module: { exports: {} }, exports: {} };
  vm.runInNewContext(code, sandbox, { filename: "afl-guernseys.js" });
  const api = sandbox.module.exports;
  if (!api || !api.CLUBS || !api.guernseySvg) {
    throw new Error("afl-guernseys.js did not export CLUBS/guernseySvg");
  }
  fs.mkdirSync(GUERNSEY_DIR, { recursive: true });
  for (const club of api.CLUBS) {
    const inner = api.guernseySvg(club.aliases[0], 1, 40);
    const svg =
      '<?xml version="1.0" encoding="UTF-8"?>\n' +
      inner.replace(/^<svg /, '<svg xmlns="http://www.w3.org/2000/svg" ');
    const rel = `assets/tipdash/guernseys/${club.id}.svg`;
    const abs = path.join(ROOT, rel);
    fs.writeFileSync(abs, svg.endsWith("\n") ? svg : svg + "\n");
  }
}

function buildCatalog() {
  materialiseGuernseys();
  const files = [];
  walk(ROOT, files);
  files.sort();

  const items = files.map((rel) => {
    const cat = rel.startsWith("assets/tipdash/") ? tipdashCategory(rel.split("/").slice(2)) : suiteCategory(rel);
    return {
      id: rel,
      name: niceName(rel),
      href: "/" + rel.split("/").map(encodeURIComponent).join("/"),
      preview: "/" + rel.split("/").map(encodeURIComponent).join("/"),
      source: sourceApp(rel, cat),
      category: cat.category,
      subcategory: cat.sub,
    };
  });

  const catalog = {
    generatedAt: new Date().toISOString().slice(0, 10),
    count: items.length,
    categories: items,
  };
  return catalog;
}

function main() {
  const check = process.argv.includes("--check");
  const catalog = buildCatalog();
  const json = JSON.stringify(catalog, null, 2) + "\n";
  if (check) {
    if (!fs.existsSync(CATALOG_PATH)) {
      console.error("Missing", CATALOG_PATH);
      process.exit(1);
    }
    const onDisk = fs.readFileSync(CATALOG_PATH, "utf8");
    if (onDisk !== json) {
      console.error("visual-catalog.json is out of date — run: node scripts/build-visual-catalog.cjs");
      process.exit(1);
    }
    return;
  }
  fs.writeFileSync(CATALOG_PATH, json);
  console.log("Wrote", CATALOG_PATH, "(" + catalog.count + " items)");
}

main();
