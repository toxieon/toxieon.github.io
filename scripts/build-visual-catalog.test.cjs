"use strict";

const { execSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");
const assert = require("node:assert/strict");

const ROOT = path.join(__dirname, "..");
const catalogPath = path.join(ROOT, "1234567890", "visual-catalog.json");

execSync("node scripts/build-visual-catalog.cjs", { cwd: ROOT, stdio: "pipe" });
execSync("node scripts/build-visual-catalog.cjs --check", { cwd: ROOT, stdio: "pipe" });

const catalog = JSON.parse(fs.readFileSync(catalogPath, "utf8"));
assert.ok(catalog.count >= 200, "expected a large inventory");
assert.equal(catalog.count, catalog.categories.length);

const tipdash = catalog.categories.filter((i) => i.category === "TipDash");
assert.ok(tipdash.length >= 30, "TipDash vendored assets present");

const guernseys = tipdash.filter((i) => i.subcategory === "AFL guernseys");
assert.ok(guernseys.length >= 18, "guernsey SVGs materialised");

for (const item of catalog.categories) {
  assert.match(item.id, /^[a-z0-9_./-]+$/i);
  assert.ok(item.href.startsWith("/"));
  assert.ok(item.name);
  assert.ok(item.source);
  if (item.id.startsWith("assets/tipdash/")) {
    const rest = item.id.slice("assets/tipdash/".length);
    assert.ok(/^(?:bookies|fx|guernseys)\/[^/]+\.svg$|^(?:logo\.svg|favicon\.svg|favicon\.ico|icon-192\.png|icon-512\.png|apple-touch-icon\.png)$/.test(rest), "TipDash item outside the allow-list: " + item.id);
  }
  assert.ok(!/\.(woff2?|ttf|otf)$/i.test(item.id) || item.id.includes("KaTeX"), "font outside the permissive set: " + item.id);
  assert.ok(!item.id.startsWith("mathbuilder/"), item.id);
}

const richmond = guernseys.find((g) => g.id.includes("richmond.svg"));
assert.ok(richmond, "richmond guernsey");
assert.ok(fs.existsSync(path.join(ROOT, richmond.id)));

console.log("build-visual-catalog tests passed:", catalog.count, "items");
