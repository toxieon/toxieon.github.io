#!/usr/bin/env node
/* Hub auto-discovery: builds hub/apps.json from the site's top-level folders.
 *
 *   node hub/build-apps.cjs          write hub/apps.json
 *   node hub/build-apps.cjs --check  exit 1 if hub/apps.json is out of date (used by tests / CI)
 *
 * A top-level folder with an index.html becomes a tile unless it's in discover.json "exclude"
 * or marked hidden. Values, lowest to highest priority:
 *   1. defaults: <title> (minus "ND • " prefixes), the page's <link rel="icon">, folder/favicon.svg
 *      or the suite icon, the suite icon colour, folder name as id, version from folder/VERSION
 *   2. discover.json "overrides" (keeps the pre-discovery tiles identical)
 *   3. meta tags in folder/index.html: nd:app, nd:id, nd:icon, nd:color, nd:order, nd:hidden, nd:description
 *   4. folder/app.json  { "name", "id", "icon", "color", "order", "hidden", "description" }
 * No dependencies (Node built-ins only). Original Neill Data code.
 */
"use strict";
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.join(__dirname, "..");
const KEYS = ["id", "name", "path", "icon", "color", "order", "hidden", "version", "description"];
const META_FIELDS = { "nd:app": "name", "nd:id": "id", "nd:icon": "icon", "nd:color": "color",
  "nd:order": "order", "nd:hidden": "hidden", "nd:description": "description" };

const ENTITIES = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", "#39": "'", middot: "·", nbsp: " ", mdash: "—", ndash: "–", bull: "•" };
const decode = (s) => s.replace(/&(#x?[0-9a-f]+|\w+);/gi, (m, e) => {
  if (e[0] === "#") { const n = e[1].toLowerCase() === "x" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10); return Number.isFinite(n) ? String.fromCodePoint(n) : m; }
  return ENTITIES[e.toLowerCase()] ?? m;
});

function attrs(tag) {
  const out = {};
  for (const m of tag.matchAll(/([\w:-]+)\s*=\s*("([^"]*)"|'([^']*)'|([^\s"'>]+))/g)) out[m[1].toLowerCase()] = decode(m[3] ?? m[4] ?? m[5] ?? "");
  return out;
}

/** Reads <title>, <link rel="icon"> and nd:* meta tags from an HTML string. */
function parsePage(html) {
  const head = (html.split(/<\/head>/i)[0] || html).replace(/<!--[\s\S]*?-->/g, "");
  const meta = {};
  for (const m of head.matchAll(/<meta\b[^>]*>/gi)) {
    const a = attrs(m[0]);
    if (a.name && a.name.toLowerCase().startsWith("nd:") && a.content !== undefined) meta[a.name.toLowerCase()] = a.content.trim();
  }
  let favicon = null;
  for (const m of head.matchAll(/<link\b[^>]*>/gi)) {
    const a = attrs(m[0]);
    if (a.href && /(^|\s)icon(\s|$)/i.test(a.rel || "")) { favicon = a.href; break; }
  }
  const t = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(head);
  return { title: t ? decode(t[1]).replace(/\s+/g, " ").trim() : "", favicon, meta };
}

function cleanTitle(title) {
  return title
    .replace(/^ND\s*[•·|:\-–—]\s*/i, "")
    .replace(/\s*[·|—–-]\s*(Neill\s*Data.*|NeillPlanner|Neill\s*Data\s*Suite)$/i, "")
    .trim();
}

/** "favicon.svg" in folder "ico" -> "/ico/favicon.svg"; absolute and full URLs are kept. */
function resolveHref(href, folder) {
  if (/^[a-z]+:\/\//i.test(href) || href.startsWith("/")) return href;
  return new URL(href, "https://x/" + folder + "/").pathname + (href.includes("?") ? "?" + href.split("?")[1] : "");
}

function toBool(v) { return v === true || /^(1|true|yes)$/i.test(String(v)); }

function loadSuiteIcons(root) {
  try {
    const cat = JSON.parse(fs.readFileSync(path.join(root, "assets/suite-icons/catalog.json"), "utf8"));
    return Object.fromEntries(cat.icons.filter((i) => i.kind === "app").map((i) => [i.id.slice(4), i]));
  } catch (e) { return {}; }
}

function validate(app, where) {
  if (!/^[a-z0-9][a-z0-9-]*$/.test(app.id)) throw new Error(`${where}: id "${app.id}" must be lowercase letters, numbers and dashes`);
  if (!app.name) throw new Error(`${where}: no name (add <title> or <meta name="nd:app" content="...">)`);
  if (!/^#[0-9a-fA-F]{6}$/.test(app.color)) throw new Error(`${where}: color "${app.color}" must be #RRGGBB`);
  if (!Number.isFinite(app.order)) throw new Error(`${where}: order must be a number`);
}

function discoverFolder(root, folder, config, suite) {
  const dir = path.join(root, folder);
  const page = parsePage(fs.readFileSync(path.join(dir, "index.html"), "utf8"));
  const read = (f) => { try { return fs.readFileSync(path.join(dir, f), "utf8"); } catch (e) { return null; } };
  const app = { id: folder.toLowerCase(), name: cleanTitle(page.title) || folder, path: "/" + folder + "/" };
  const override = (config.overrides || {})[folder] || {};
  const fromMeta = {};
  for (const [k, field] of Object.entries(META_FIELDS)) if (page.meta[k] !== undefined && page.meta[k] !== "") fromMeta[field] = page.meta[k];
  let fromJson = {};
  const json = read("app.json");
  if (json) { try { fromJson = JSON.parse(json); } catch (e) { throw new Error(`${folder}/app.json: ${e.message}`); } }
  Object.assign(app, pick(override), pick(fromMeta), pick(fromJson));

  const s = suite[app.id];
  if (!app.icon) {
    if (page.favicon) app.icon = resolveHref(page.favicon, folder);
    else if (fs.existsSync(path.join(dir, "favicon.svg"))) app.icon = "/" + folder + "/favicon.svg";
    else if (s) app.icon = "/" + s.file;
    else app.icon = "";
  } else app.icon = resolveHref(app.icon, folder);
  app.color = app.color || (s && /^#[0-9a-f]{6}$/i.test(s.color) ? s.color : config.defaults.color);
  app.order = app.order === undefined ? config.defaults.order : Number(app.order);
  app.hidden = toBool(app.hidden ?? false);
  const version = (read("VERSION") || "").trim();
  if (version) app.version = version;
  validate(app, folder);
  return app;
}

function pick(o) {
  const out = {};
  for (const k of ["id", "name", "icon", "color", "order", "hidden", "description"]) if (o[k] !== undefined) out[k] = o[k];
  return out;
}

/** Returns the apps list (sorted) for a site root. */
function discover(root = ROOT, config = readConfig(root)) {
  const suite = loadSuiteIcons(root);
  const exclude = new Set(config.exclude || []);
  const apps = [];
  for (const ent of fs.readdirSync(root, { withFileTypes: true })) {
    if (!ent.isDirectory() || ent.name.startsWith(".") || ent.name.startsWith("_") || ent.name === "node_modules") continue;
    if (exclude.has(ent.name)) continue;
    if (!fs.existsSync(path.join(root, ent.name, "index.html"))) continue;
    apps.push(discoverFolder(root, ent.name, config, suite));
  }
  for (const extra of config.extra || []) apps.push({ ...extra });
  const ids = new Set();
  for (const a of apps) { if (ids.has(a.id)) throw new Error(`duplicate app id "${a.id}"`); ids.add(a.id); }
  return apps.sort((a, b) => a.order - b.order || a.name.localeCompare(b.name));
}

function readConfig(root) {
  const c = JSON.parse(fs.readFileSync(path.join(root, "hub/discover.json"), "utf8"));
  c.defaults = Object.assign({ color: "#94a3b8", order: 99 }, c.defaults || {});
  return c;
}

/** One app per line, stable key order (diff-friendly). */
function format(apps) {
  const line = (a) => "{ " + KEYS.filter((k) => a[k] !== undefined).map((k) => JSON.stringify(k) + ": " + JSON.stringify(a[k])).join(", ") + " }";
  return '{\n  "generated": "by hub/build-apps.cjs - edit nd:* meta tags or hub/discover.json, not this file",\n  "apps": [\n' +
    apps.map((a) => "    " + line(a)).join(",\n") + "\n  ]\n}\n";
}

function build(root = ROOT) { return format(discover(root)); }

if (require.main === module) {
  const out = path.join(ROOT, "hub/apps.json");
  const next = build();
  const current = fs.existsSync(out) ? fs.readFileSync(out, "utf8") : "";
  if (process.argv.includes("--check")) {
    if (current !== next) { console.error("hub/apps.json is out of date: run  node hub/build-apps.cjs"); process.exit(1); }
    console.log("hub/apps.json is up to date");
  } else if (current !== next) {
    fs.writeFileSync(out, next);
    console.log("hub/apps.json updated (" + JSON.parse(next).apps.length + " apps)");
  } else console.log("hub/apps.json unchanged");
}

module.exports = { parsePage, cleanTitle, resolveHref, discover, format, build, readConfig };
