#!/usr/bin/env node
/* One-shot ingest: neutral 3D venue assets under 1234567890/visual/3d-venues/ */
"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { execSync } = require("node:child_process");
const sharp = require("sharp");
const { NodeIO } = require("@gltf-transform/core");
const { KHRMeshQuantization, EXTMeshoptCompression } = require("@gltf-transform/extensions");
const { meshopt } = require("@gltf-transform/functions");
const { MeshoptDecoder, MeshoptEncoder } = require("meshoptimizer");

const ROOT = path.join(__dirname, "..");
const SRC = process.env.SRC_3D || "/tmp/3d-src";
const OUT = path.join(ROOT, "1234567890", "visual", "3d-venues");
const THREE_CDN = "https://cdn.jsdelivr.net/npm/three@0.170.0";

const RENAME_NODES = {
  AFLPlayer_base: "player_root",
  MCG: "stadium_oval",
};

function mkdirp(p) {
  fs.mkdirSync(p, { recursive: true });
}

async function ioMeshopt() {
  await MeshoptDecoder.ready;
  await MeshoptEncoder.ready;
  return new NodeIO()
    .registerExtensions([KHRMeshQuantization, EXTMeshoptCompression])
    .registerDependencies({
      "meshopt.decoder": MeshoptDecoder,
      "meshopt.encoder": MeshoptEncoder,
    });
}

async function neutralizeGlb(srcPath, destPath, { compress } = {}) {
  const io = await ioMeshopt();
  const doc = await io.read(srcPath);
  const root = doc.getRoot();
  for (const n of root.listNodes()) {
    const nm = n.getName();
    if (RENAME_NODES[nm]) n.setName(RENAME_NODES[nm]);
  }
  for (const m of root.listMeshes()) {
    const nm = m.getName();
    if (RENAME_NODES[nm]) m.setName(RENAME_NODES[nm]);
  }
  for (const mat of root.listMaterials()) {
    const nm = mat.getName();
    if (/afl|mcg/i.test(nm)) mat.setName("surface");
  }
  if (compress) await doc.transform(meshopt({ encoder: MeshoptEncoder }));
  mkdirp(path.dirname(destPath));
  await io.write(destPath, doc);
}

async function processGlbs() {
  const glbOut = path.join(OUT, "glb");
  mkdirp(path.join(glbOut, "web"));
  await neutralizeGlb(
    path.join(SRC, "glb", "mcg.glb"),
    path.join(glbOut, "stadium-oval.glb"),
    { compress: false }
  );
  await neutralizeGlb(
    path.join(SRC, "glb", "player-base.glb"),
    path.join(glbOut, "player-figure.glb"),
    { compress: false }
  );
  await neutralizeGlb(
    path.join(SRC, "glb", "web", "mcg.glb"),
    path.join(glbOut, "web", "stadium-oval.glb"),
    { compress: false }
  );
  await neutralizeGlb(
    path.join(SRC, "glb", "web", "player-base.glb"),
    path.join(glbOut, "web", "player-figure.glb"),
    { compress: false }
  );
}

function writeNeutralKits() {
  const kits = {
    red: {
      name: "Kit red",
      jumper: { pattern: "plain", colors: ["#c8202f", "#ffffff"] },
      shorts: "#ffffff",
      socks: { base: "#c8202f", top: "#ffffff" },
    },
    blue: {
      name: "Kit blue",
      jumper: { pattern: "plain", colors: ["#1f4fbf", "#ffffff"] },
      shorts: "#1f4fbf",
      socks: { base: "#ffffff", top: "#1f4fbf" },
    },
    green: {
      name: "Kit green",
      jumper: { pattern: "hoops", colors: ["#13804a", "#f2c230"], bands: 6 },
      shorts: "#ffffff",
      socks: { base: "#13804a", top: "#f2c230" },
    },
    orange: {
      name: "Kit orange",
      jumper: { pattern: "plain", colors: ["#f07a1a", "#111111"] },
      shorts: "#111111",
      socks: { base: "#111111", top: "#f07a1a" },
    },
    whites: {
      name: "Kit light",
      jumper: { pattern: "plain", colors: ["#f3f1ea", "#f3f1ea"] },
      shorts: "#f3f1ea",
      socks: { base: "#f3f1ea", top: "#f3f1ea" },
      boots: "#f3f1ea",
    },
    umpire: {
      name: "Kit official",
      jumper: { pattern: "plain", colors: ["#e9e2c8", "#e9e2c8"] },
      shorts: "#1c1f24",
      socks: { base: "#1c1f24", top: "#1c1f24" },
    },
  };
  mkdirp(path.join(OUT, "players"));
  fs.writeFileSync(path.join(OUT, "players", "kits.json"), JSON.stringify(kits, null, 2) + "\n");
}

function writeBoards() {
  const boardsDir = path.join(OUT, "boards");
  const slidesDir = path.join(boardsDir, "slides");
  mkdirp(slidesDir);
  const slides = [
    { file: "slide-1.webp", bg: "#0d2840" },
    { file: "slide-2.webp", bg: "#1a3d2e" },
    { file: "slide-3.webp", bg: "#3a2a10" },
  ];
  const cfg = {
    tileMeters: 8,
    height: 1.4,
    slides: slides.map((s, i) => ({
      image: "boards/slides/" + s.file,
      duration: 3.5 + i * 0.5,
      scroll: 0.015,
      bg: s.bg,
    })),
  };
  fs.writeFileSync(path.join(boardsDir, "boards.json"), JSON.stringify(cfg, null, 2) + "\n");
  fs.writeFileSync(
    path.join(boardsDir, "boards.js"),
    `export function ledTwoSided(m) {
  m.depthWrite = false;
  m.polygonOffset = true;
  m.polygonOffsetFactor = -1;
  m.polygonOffsetUnits = -1;
}
`
  );
  return Promise.all(
    slides.map((s, i) =>
      sharp({
        create: { width: 512, height: 96, channels: 3, background: s.bg },
      })
        .composite([
          {
            input: Buffer.from(
              `<svg width="512" height="96"><text x="256" y="58" text-anchor="middle" font-family="sans-serif" font-size="28" fill="#e8eef5">DISPLAY ${i + 1}</text></svg>`
            ),
            top: 0,
            left: 0,
          },
        ])
        .webp({ quality: 82 })
        .toFile(path.join(slidesDir, s.file))
    )
  );
}

function neutralizeDemoHtml(html, folder) {
  let s = html;
  s = s.replace(
    /<script type="importmap">[^<]+<\/script>/,
    `<script type="importmap">{"imports":{"three":"${THREE_CDN}/build/three.module.js","three/addons/":"${THREE_CDN}/examples/jsm/"}}</script>`
  );
  const titles = {
    arena: "Indoor arena",
    soccer: "Soccer pitch",
    baseball: "Baseball park",
    cricket: "Cricket oval",
    gridiron: "Gridiron field",
    "rugby-league": "Rugby league pitch",
    racecourse: "Racecourse",
    tennis: "Tennis court",
  };
  s = s.replace(/<title>[^<]+<\/title>/, `<title>${titles[folder] || folder}</title>`);
  s = s.replace(/\/\/[^\n]*/g, (line) => {
    if (!line.trim().startsWith("//")) return line;
    const banned = /tipdash|tipbot|afl|sponsor|mcg|footy|collingwood|geelong|nrl|nfl|nba/i;
    if (banned.test(line)) return "// Venue scene.";
    return line;
  });
  s = s.replace(/\.\.\/\.\.\/mcg\.glb/g, "../glb/web/stadium-oval.glb");
  return s;
}

function neutralizeCommonJs() {
  let s = fs.readFileSync(path.join(SRC, "procedural-venues", "common.js"), "utf8");
  s = s.replace(
    "const L=new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);export const load=u=>L.loadAsync((q.has('web')?u.replace('../../','../../web/'):u)+'?'+Date.now());",
    "const GLB_WEB=new URL('../glb/web/',import.meta.url);const L=new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);export const load=(file)=>L.loadAsync(new URL(file,GLB_WEB).href+'?'+Date.now());"
  );
  s = s.replace(
    /export async function ledRibbons\(S,paths,night,cfgUrl='[^']*'\)\{\s*\n const cfg=await \(await fetch\(cfgUrl\+'\?'\+\+Date\.now\(\)\)\)\.json\(\);/,
    "export async function ledRibbons(S,paths,night,cfgUrl){\n const boardsJson=cfgUrl||new URL('../boards/boards.json',import.meta.url).href;\n const cfg=await (await fetch(boardsJson+'?'+Date.now())).json();"
  );
  s = s.replace("i.src='../../'+s.image", "i.src=new URL('../'+s.image,import.meta.url).href");
  s = s.replace(
    "const base=await load('../../players/player-base.glb'),kits=await loadKits('../../players/kits.json');",
    "const base=await load('player-figure.glb'),kits=await loadKits(new URL('../players/kits.json',import.meta.url).href);"
  );
  s = s.replace(/\/\/[^\n]*/g, (line) => {
    if (!line.trim().startsWith("//")) return line;
    if (/tipdash|tipbot|afl|sponsor|mcg|footy|collingwood|geelong|nrl|nfl|nba/i.test(line)) return "// Shared helpers.";
    return line;
  });
  return s;
}

async function compressPreview(srcPng, destWebp) {
  await sharp(srcPng)
    .resize({ width: 640, withoutEnlargement: true })
    .webp({ quality: 80 })
    .toFile(destWebp);
}

async function copyVenues() {
  const folderMap = { nfl: "gridiron", nrl: "rugby-league" };
  const pvOut = path.join(OUT, "procedural-venues");
  mkdirp(pvOut);
  fs.writeFileSync(path.join(pvOut, "common.js"), neutralizeCommonJs());
  fs.writeFileSync(
    path.join(OUT, "players", "kits.js"),
    `import * as T from 'three';

export async function loadKits(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error('kits');
  return r.json();
}

function jumperTexture(kit) {
  const j = kit.jumper || { pattern: 'plain', colors: ['#888'] };
  const colors = j.colors || ['#888'];
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const x = c.getContext('2d');
  const bands = j.bands || 6;
  if (j.pattern === 'stripes') {
    const w = c.width / (bands * 2);
    for (let i = 0; i < bands * 2; i++) {
      x.fillStyle = colors[i % colors.length];
      x.fillRect(i * w, 0, w, c.height);
    }
  } else if (j.pattern === 'hoops') {
    const h = c.height / bands;
    for (let i = 0; i < bands; i++) {
      x.fillStyle = colors[i % colors.length];
      x.fillRect(0, i * h, c.width, h);
    }
  } else {
    x.fillStyle = colors[0];
    x.fillRect(0, 0, c.width, c.height);
  }
  const t = new T.CanvasTexture(c);
  t.colorSpace = T.SRGBColorSpace;
  return t;
}

export function kitMaterials(scene, kit) {
  const ref = {};
  scene.traverse((o) => {
    if (o.isMesh && o.material && o.material.name) ref[o.material.name] = o.material;
  });
  const std = (color) => new T.MeshStandardMaterial({ color, roughness: 0.78 });
  const mats = {};
  mats.jumper = new T.MeshStandardMaterial({ map: jumperTexture(kit), roughness: 0.82 });
  mats.shorts = std(kit.shorts);
  mats.skin = ref.skin ? ref.skin.clone() : std(0xe8b598);
  mats.hair = ref.hair ? ref.hair.clone() : std(0x2a2018);
  mats.socks = std(kit.socks?.base || kit.shorts);
  mats.sockTop = std(kit.socks?.top || kit.socks?.base || '#ffffff');
  mats.boots = std(kit.boots || '#222222');
  return mats;
}
`
  );

  const venues = [];
  const srcPv = path.join(SRC, "procedural-venues");
  for (const ent of fs.readdirSync(srcPv, { withFileTypes: true })) {
    if (!ent.isDirectory()) continue;
    const srcFolder = ent.name;
    const folder = folderMap[srcFolder] || srcFolder;
    const outDir = path.join(pvOut, folder);
    mkdirp(outDir);
    const demoSrc = path.join(srcPv, srcFolder, "demo.html");
    fs.writeFileSync(path.join(outDir, "demo.html"), neutralizeDemoHtml(fs.readFileSync(demoSrc, "utf8"), folder));
    const previews = fs.readdirSync(path.join(srcPv, srcFolder)).filter((f) => /^PREVIEW/i.test(f) && f.endsWith(".png"));
    let mainPreview = previews.find((f) => f === "PREVIEW.png") || previews[0];
    if (mainPreview) {
      await compressPreview(path.join(srcPv, srcFolder, mainPreview), path.join(outDir, "preview-web.webp"));
    }
    const labels = {
      arena: "Indoor arena",
      soccer: "Soccer stadium",
      baseball: "Baseball park",
      cricket: "Cricket ground",
      gridiron: "Gridiron stadium",
      "rugby-league": "Rugby league stadium",
      racecourse: "Racecourse",
      tennis: "Tennis centre",
    };
    venues.push({
      id: folder,
      name: labels[folder] || folder,
      demo: `3d-venues/procedural-venues/${folder}/demo.html`,
      preview: `3d-venues/procedural-venues/${folder}/preview-web.webp`,
    });
  }
  venues.sort((a, b) => a.name.localeCompare(b.name));
  return venues;
}

async function writeManifest(venues) {
  const models = [
    {
      id: "stadium-oval",
      name: "Oval stadium (GLB)",
      preview: "3d-venues/glb/preview-stadium.webp",
      glb: "3d-venues/glb/web/stadium-oval.glb",
      glbFull: "3d-venues/glb/stadium-oval.glb",
    },
    {
      id: "player-figure",
      name: "Athlete figure (GLB)",
      preview: "3d-venues/glb/preview-player.webp",
      glb: "3d-venues/glb/web/player-figure.glb",
      glbFull: "3d-venues/glb/player-figure.glb",
    },
  ];
  await sharp(path.join(SRC, "procedural-venues", "cricket", "PREVIEW.png"))
    .resize({ width: 640, withoutEnlargement: true })
    .webp({ quality: 80 })
    .toFile(path.join(OUT, "glb", "preview-stadium.webp"));
  await sharp({
    create: { width: 480, height: 320, channels: 3, background: "#1a2430" },
  })
    .webp({ quality: 80 })
    .toFile(path.join(OUT, "glb", "preview-player.webp"));

  fs.writeFileSync(
    path.join(OUT, "manifest.json"),
    JSON.stringify({ venues, models }, null, 2) + "\n"
  );
}

async function main() {
  if (!fs.existsSync(SRC)) throw new Error("SRC missing: " + SRC);
  mkdirp(OUT);
  await processGlbs();
  writeNeutralKits();
  await writeBoards();
  const venues = await copyVenues();
  await writeManifest(venues);
  console.log("3d-venues written to", OUT);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
