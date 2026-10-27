#!/usr/bin/env node
/* Content-Security-Policy <meta> for every app page (GitHub Pages cannot send headers).
 *
 *   node scripts/csp.cjs           rewrite the meta tag in each app's index.html
 *   node scripts/csp.cjs --check   exit 1 if any page is stale (run by scripts/csp.test.cjs)
 *
 * Each policy is built from the origins the app's code really uses (see FEATURES) plus a
 * sha256 hash of every inline <script> in the page, so script-src needs no 'unsafe-inline'
 * (battleship is the one documented exception). Edit an inline script and the hash goes
 * stale: run this script again. frame-ancestors is ignored in a meta tag, so it is not set.
 * Never list a private (unlisted) app here: policies must not name hidden paths. */
"use strict";
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const ROOT = path.join(__dirname, "..");

/* Origin groups. Each key is a CSP directive name. */
const FEATURES = {
  // Google Identity Services (sign-in button, token client). Per Google's CSP guidance for GIS.
  gsi: {
    script: ["https://accounts.google.com/gsi/client"],
    frame: ["https://accounts.google.com/gsi/"],
    connect: ["https://accounts.google.com/gsi/"],
    style: ["https://accounts.google.com/gsi/style"],
  },
  // gapi (apis.google.com/js/api.js): loads more scripts from the same host and talks to the
  // content-<api>.googleapis.com proxy hosts through an iframe and XHR.
  gapi: {
    script: ["https://apis.google.com"],
    frame: ["https://content.googleapis.com", "https://content-sheets.googleapis.com", "https://content-drive.googleapis.com"],
    connect: ["https://apis.google.com", "https://content.googleapis.com", "https://content-sheets.googleapis.com", "https://content-drive.googleapis.com"],
  },
  // Direct REST calls from shared/nd-auth.js, nd-sheets.js, assets/drive-image.js, quote, fitoff.
  googleapis: {
    connect: ["https://www.googleapis.com", "https://sheets.googleapis.com", "https://openidconnect.googleapis.com"],
  },
  // Neill Data Backend (Apps Script /exec; it redirects to script.googleusercontent.com).
  backend: {
    connect: ["https://script.google.com/macros/s/", "https://script.googleusercontent.com/macros/"],
  },
  // Public sheet reads (quote gviz CSV).
  docs: { connect: ["https://docs.google.com"] },
  // Drive thumbnails, avatars and file-type icons.
  gimages: { img: ["https://*.googleusercontent.com", "https://drive.google.com"] },
  // Maps JavaScript API + Places + Geocoding (Google's allowlist-CSP recipe, narrowed).
  maps: {
    script: ["https://maps.googleapis.com", "https://maps.gstatic.com"],
    connect: ["https://maps.googleapis.com", "https://places.googleapis.com", "https://maps.gstatic.com"],
    img: ["https://maps.googleapis.com", "https://maps.gstatic.com", "https://*.google.com", "https://*.googleusercontent.com"],
    style: ["https://fonts.googleapis.com"],
    font: ["https://fonts.gstatic.com"],
    worker: ["blob:"],
  },
  // Google Fonts stylesheet.
  gfonts: { style: ["https://fonts.googleapis.com"], font: ["https://fonts.gstatic.com"] },
};

/* Per-app config: features plus extra sources per directive, and the reason for anything unusual. */
const APPS = {
  "hub":           { file: "hub/index.html",           features: ["gsi", "backend"] },
  "swb":           { file: "swb/index.html",           features: ["gsi", "gapi", "googleapis", "backend", "gimages"] },
  "planner": {
    file: "planner/index.html", features: ["gsi", "gapi", "googleapis", "backend", "gimages", "maps"],
    // Auto rooms OCR (Tesseract.js, SRI-pinned): script and WebAssembly core from jsDelivr, language data from projectnaptha, run in a blob worker.
    extra: {
      script: ["https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/", "https://cdn.jsdelivr.net/npm/tesseract.js-core@5.1.1/", "'wasm-unsafe-eval'"],
      connect: ["https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/", "https://cdn.jsdelivr.net/npm/tesseract.js-core@5.1.1/", "https://tessdata.projectnaptha.com/4.0.0/", "data:", "blob:"],
      worker: ["blob:"],
    },
  },
  "upload":        { file: "upload/index.html",        features: ["gsi", "gapi", "googleapis", "backend", "gimages", "maps"], extra: { connect: ["data:", "blob:"] } },
  "search":        { file: "search/index.html",        features: ["gsi", "gapi", "googleapis", "backend", "gimages"] },
  "quote": {
    file: "quote/index.html", features: ["gsi", "googleapis", "backend", "docs", "maps"],
    extra: { connect: ["https://api.open-meteo.com", "https://geocoding-api.open-meteo.com", "data:", "blob:"], media: ["blob:"] },
  },
  "timesheet": {
    file: "timesheet/index.html", features: ["gsi", "gapi", "googleapis", "backend", "docs", "maps", "gimages"],
    // Leaflet map: OpenStreetMap tiles and Nominatim geocoding.
    extra: { connect: ["https://nominatim.openstreetmap.org", "data:", "blob:"], img: ["https://tile.openstreetmap.org"] },
  },
  "timesheetlive": { file: "timesheetlive/index.html", features: ["backend"] },
  "fitoff":        { file: "fitoff/index.html",        features: ["gsi", "googleapis", "backend", "gimages", "maps"] },
  "company":       { file: "company/index.html",       features: ["gsi", "gapi", "googleapis", "backend", "gimages"] },
  "checklist":     { file: "checklist/index.html",     features: ["backend"] },
  "M2C":           { file: "M2C/index.html",           features: ["backend", "gfonts"] },
  "battleship": {
    file: "battleship/index.html", features: ["gfonts"],
    // 93 inline on*= handlers plus handlers built into innerHTML strings: script-src cannot drop 'unsafe-inline'
    // without rewriting the game. It has no sign-in or Drive access; connect-src limits it to its two Workers.
    unsafeInlineScript: true,
    extra: { connect: ["https://dead-reckoning-lb.toxieon.workers.dev", "wss://dead-reckoning-mp.toxieon.workers.dev"] },
  },
  "reelreader":    { file: "reelreader/index.html",    features: [], extra: { connect: ["https://reel-reader-e0aw.onrender.com"], media: ["blob:"] } },
  "ico":           { file: "ico/index.html",           features: [] },
  "assets/studio": { file: "assets/studio/index.html", features: [] },
};

/* Unlisted pages (a folder with .nd-private) pick a profile here with <meta name="csp-profile" content="NAME">, so this file
 * never names the folder. */
const PRIVATE_PROFILES = {
  // Local test page: own static files only; blob:/data: for GLB textures; wasm for the meshopt decoder. Nothing external.
  testassets: { features: [], extra: { script: ["'wasm-unsafe-eval'"], connect: ["blob:", "data:"] } },
};
function privateApps(root = ROOT) {
  const out = {};
  for (const ent of fs.readdirSync(root, { withFileTypes: true })) {
    if (!ent.isDirectory() || ent.name.startsWith(".") || ent.name === "node_modules") continue;
    const idx = path.join(root, ent.name, "index.html");
    if (!fs.existsSync(path.join(root, ent.name, ".nd-private")) || !fs.existsSync(idx)) continue;
    const m = fs.readFileSync(idx, "utf8").match(/<meta name="csp-profile" content="([\w-]+)"/);
    if (m && PRIVATE_PROFILES[m[1]]) out["private:" + m[1]] = Object.assign({ file: ent.name + "/index.html" }, PRIVATE_PROFILES[m[1]]);
  }
  return out;
}

const DIRECTIVE_OF = { script: "script-src", connect: "connect-src", img: "img-src", style: "style-src", font: "font-src", frame: "frame-src", worker: "worker-src", media: "media-src" };

function inlineScriptHashes(html) {
  const out = [];
  // Walk the page in order so a "<script>" inside an HTML comment or a <style> block is not mistaken for a script.
  const re = /<!--[\s\S]*?-->|<style\b[\s\S]*?<\/style>|<script\b([^>]*)>([\s\S]*?)<\/script>/gi;
  let m;
  while ((m = re.exec(html))) {
    if (m[1] === undefined) continue; // comment or style block
    if (/\bsrc\s*=/i.test(m[1])) continue;
    const type = (m[1].match(/\btype\s*=\s*["']?([^"'\s>]+)/i) || [])[1] || "";
    if (type && !/^(text|application)\/(javascript|ecmascript)$|^module$/i.test(type)) continue; // data blocks never run
    if (!m[2].trim()) continue;
    out.push("'sha256-" + crypto.createHash("sha256").update(m[2], "utf8").digest("base64") + "'");
  }
  return [...new Set(out)];
}

function build(app, html) {
  const cfg = app;
  const add = {};
  const push = (k, list) => { (add[k] = add[k] || []).push(...(list || [])); };
  for (const f of cfg.features) for (const [k, v] of Object.entries(FEATURES[f])) push(k, v);
  for (const [k, v] of Object.entries(cfg.extra || {})) push(k, v);
  const uniq = (a) => [...new Set(a)];
  const hashes = inlineScriptHashes(html);
  const d = {
    "default-src": ["'self'"],
    "script-src": uniq(["'self'", ...(cfg.unsafeInlineScript ? ["'unsafe-inline'"] : hashes), ...(add.script || [])]),
    "style-src": uniq(["'self'", "'unsafe-inline'", ...(add.style || [])]), // style="" attributes are used throughout
    "img-src": uniq(["'self'", "data:", "blob:", ...(add.img || [])]),
    "font-src": uniq(["'self'", "data:", ...(add.font || [])]),
    "connect-src": uniq(["'self'", ...(add.connect || [])]),
    "frame-src": add.frame ? uniq(add.frame) : ["'none'"],
    "media-src": uniq(["'self'", ...(add.media || [])]),
    "worker-src": uniq(["'self'", ...(add.worker || [])]),
    "object-src": ["'none'"],
    "base-uri": ["'self'"],
    "form-action": ["'self'"],
  };
  return Object.entries(d).map(([k, v]) => `${k} ${v.join(" ")}`).join("; ");
}

const META_RE = /^([ \t]*)<meta http-equiv="Content-Security-Policy" content="[^"]*"\s*\/?>[ \t]*\r?\n/m;
function apply(app, html) {
  const policy = build(app, html);
  const next = (indent) => `${indent}<meta http-equiv="Content-Security-Policy" content="${policy}" />\n`;
  if (META_RE.test(html)) return html.replace(META_RE, (_, ind) => next(ind));
  const m = html.match(/^([ \t]*)<meta charset=[^>]*>[ \t]*\r?\n/mi);
  if (!m) throw new Error(`${app.file}: no <meta charset> line to insert after`);
  return html.replace(m[0], m[0] + next(m[1]));
}

function run(check) {
  const stale = [];
  for (const [name, app] of Object.entries({ ...APPS, ...privateApps() })) {
    const file = path.join(ROOT, app.file);
    const html = fs.readFileSync(file, "utf8");
    const next = apply(app, html);
    if (next !== html) { stale.push(name); if (!check) fs.writeFileSync(file, next); }
  }
  return stale;
}

module.exports = { privateApps, PRIVATE_PROFILES, APPS, FEATURES, build, apply, inlineScriptHashes, DIRECTIVE_OF };

if (require.main === module) {
  const check = process.argv.includes("--check");
  const stale = run(check);
  if (check && stale.length) { console.error("csp: stale or missing policy in: " + stale.join(", ") + "\nrun: node scripts/csp.cjs"); process.exit(1); }
  console.log(check ? "csp OK" : `csp: updated ${stale.length} page(s)${stale.length ? ": " + stale.join(", ") : ""}`);
}
