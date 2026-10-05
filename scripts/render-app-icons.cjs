#!/usr/bin/env node
/* iOS / PWA home-screen icons for each app, from the suite icon art.
 *
 *   node scripts/render-app-icons.cjs          write <app>/icons/icon-180.png, -192.png, -512.png
 *   node scripts/render-app-icons.cjs --check  exit 1 if any output is missing, has alpha, or is stale
 *
 * Source: assets/suite-icons/apps/<icon>-{180,192,512}.png, rendered from
 * assets/suite-icons/apps/<icon>.svg by assets/suite-icons/build-assets.cjs (run that first
 * when the SVG art changes). Those PNGs have transparent rounded corners; iOS paints
 * transparency black, so this flattens them onto a SOLID square of the icon's own
 * background colour (the full-size <rect fill> in the SVG, else the suite tile colour)
 * and writes 8-bit RGB PNGs with no alpha channel. Node built-ins only (zlib).
 * Timesheet is not listed: it keeps its own orange clock icons.
 */
"use strict";
const fs = require("node:fs");
const path = require("node:path");
const zlib = require("node:zlib");

const ROOT = path.join(__dirname, "..");
const SIZES = [180, 192, 512];
// folder -> suite icon name + home-screen title (apple-mobile-web-app-title / manifest short_name)
const APPS = [
  { folder: "planner", icon: "planner", title: "Planner" },
  { folder: "upload", icon: "upload", title: "Upload" },
  { folder: "search", icon: "search", title: "Search" },
  { folder: "quote", icon: "quote", title: "Quote" },
  { folder: "swb", icon: "swb", title: "SWB" },
  { folder: "fitoff", icon: "fitoff", title: "Fit-off" },
  { folder: "1234567890", icon: "assets", title: "Assets" },
  { folder: "company", icon: "company", title: "Company" },
  { folder: "ico", icon: "ico", title: "ICO" },
  { folder: "hub", icon: "hub", title: "Hub" }
];

/* ── PNG decode (8-bit RGB/RGBA, non-interlaced: what sharp writes) ── */
const SIG = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
function chunks(buf) {
  if (!buf.subarray(0, 8).equals(SIG)) throw new Error("not a PNG");
  const out = [];
  for (let o = 8; o < buf.length;) {
    const len = buf.readUInt32BE(o), type = buf.toString("latin1", o + 4, o + 8);
    out.push({ type, data: buf.subarray(o + 8, o + 8 + len) });
    o += 12 + len;
  }
  return out;
}
function decode(buf) {
  const cs = chunks(buf), ih = cs.find((c) => c.type === "IHDR").data;
  const w = ih.readUInt32BE(0), h = ih.readUInt32BE(4), depth = ih[8], ctype = ih[9], interlace = ih[12];
  if (depth !== 8 || (ctype !== 6 && ctype !== 2) || interlace) throw new Error(`unsupported PNG (depth ${depth}, colour type ${ctype}, interlace ${interlace})`);
  const bpp = ctype === 6 ? 4 : 3, stride = w * bpp;
  const raw = zlib.inflateSync(Buffer.concat(cs.filter((c) => c.type === "IDAT").map((c) => c.data)));
  const px = Buffer.alloc(h * stride);
  for (let y = 0; y < h; y++) {
    const f = raw[y * (stride + 1)], src = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    for (let x = 0; x < stride; x++) {
      const a = x >= bpp ? px[y * stride + x - bpp] : 0, b = y ? px[(y - 1) * stride + x] : 0;
      const c = x >= bpp && y ? px[(y - 1) * stride + x - bpp] : 0;
      let v = src[x];
      if (f === 1) v += a; else if (f === 2) v += b; else if (f === 3) v += (a + b) >> 1;
      else if (f === 4) { const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c); v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c; }
      else if (f !== 0) throw new Error("bad PNG filter " + f);
      px[y * stride + x] = v & 255;
    }
  }
  return { w, h, bpp, px, ctype, hasTrns: cs.some((c) => c.type === "tRNS") };
}

/* ── PNG encode: 8-bit RGB (colour type 2), no alpha, deterministic ── */
const CRC = new Int32Array(256).map((_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c; });
function crc32(b) { let c = -1; for (const x of b) c = CRC[(c ^ x) & 255] ^ (c >>> 8); return (c ^ -1) >>> 0; }
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, "latin1"), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
function encodeRGB(w, h, rgb) {
  const stride = w * 3, raw = Buffer.alloc(h * (stride + 1));
  for (let y = 0; y < h; y++) {   // filter 2 (Up) everywhere except row 0: small and deterministic
    const f = y ? 2 : 0; raw[y * (stride + 1)] = f;
    for (let x = 0; x < stride; x++) raw[y * (stride + 1) + 1 + x] = (rgb[y * stride + x] - (f ? rgb[(y - 1) * stride + x] : 0)) & 255;
  }
  const ih = Buffer.alloc(13); ih.writeUInt32BE(w, 0); ih.writeUInt32BE(h, 4); ih[8] = 8; ih[9] = 2;
  return Buffer.concat([SIG, chunk("IHDR", ih), chunk("IDAT", zlib.deflateSync(raw, { level: 9 })), chunk("IEND", Buffer.alloc(0))]);
}

function hex(c) { const m = /^#([0-9a-f]{6})$/i.exec(c || ""); if (!m) throw new Error("bad colour " + c); return [0, 2, 4].map((i) => parseInt(m[1].slice(i, i + 2), 16)); }
/** The icon's own background: a full-size <rect> fill in the SVG, else the suite tile colour. */
function background(iconName) {
  const svg = fs.readFileSync(path.join(ROOT, "assets/suite-icons/apps", iconName + ".svg"), "utf8");
  const vb = /viewBox="0 0 ([\d.]+) ([\d.]+)"/.exec(svg);
  for (const m of svg.matchAll(/<rect\b([^>]*)>/g)) {
    const a = m[1], w = /\bwidth="([\d.]+)"/.exec(a), h = /\bheight="([\d.]+)"/.exec(a), f = /\bfill="(#[0-9a-fA-F]{6})"/.exec(a);
    if (vb && w && h && f && w[1] === vb[1] && h[1] === vb[2] && !/\bx="[^0"]/.test(a)) return f[1].toLowerCase();
  }
  const cat = JSON.parse(fs.readFileSync(path.join(ROOT, "assets/suite-icons/catalog.json"), "utf8"));
  const icon = cat.icons.find((i) => i.id === "app-" + iconName);
  if (!icon) throw new Error("no suite icon app-" + iconName);
  return icon.color.toLowerCase();
}
function flatten(src, bg) {
  const { w, h, bpp, px } = decode(src), [br, bgc, bb] = hex(bg), rgb = Buffer.alloc(w * h * 3);
  for (let i = 0, j = 0; i < px.length; i += bpp, j += 3) {
    const a = bpp === 4 ? px[i + 3] : 255;
    rgb[j] = Math.round((px[i] * a + br * (255 - a)) / 255);
    rgb[j + 1] = Math.round((px[i + 1] * a + bgc * (255 - a)) / 255);
    rgb[j + 2] = Math.round((px[i + 2] * a + bb * (255 - a)) / 255);
  }
  return { w, h, png: encodeRGB(w, h, rgb) };
}

/** Expected outputs: [{file, png, size, app}] */
function build(root = ROOT) {
  const out = [];
  for (const app of APPS) {
    const bg = background(app.icon);
    for (const size of SIZES) {
      const src = fs.readFileSync(path.join(root, "assets/suite-icons/apps", `${app.icon}-${size}.png`));
      const r = flatten(src, bg);
      if (r.w !== size || r.h !== size) throw new Error(`${app.icon}-${size}.png is ${r.w}x${r.h}`);
      out.push({ app, size, bg, file: path.join(app.folder, "icons", `icon-${size}.png`), png: r.png });
    }
  }
  return out;
}
/** Problems with a written icon (empty array = fine). */
function inspect(buf, size) {
  const d = decode(buf), problems = [];
  if (d.w !== size || d.h !== size) problems.push(`${d.w}x${d.h}, want ${size}x${size}`);
  if (d.ctype !== 2) problems.push("has an alpha channel (colour type " + d.ctype + ")");
  if (d.hasTrns) problems.push("has a tRNS transparency chunk");
  return problems;
}

if (require.main === module) {
  const check = process.argv.includes("--check");
  let bad = 0;
  for (const o of build()) {
    const dest = path.join(ROOT, o.file);
    if (check) {
      const cur = fs.existsSync(dest) ? fs.readFileSync(dest) : null;
      const problems = cur ? inspect(cur, o.size) : ["missing"];
      if (cur && !cur.equals(o.png)) problems.push("stale: run node scripts/render-app-icons.cjs");
      if (problems.length) { bad++; console.error(o.file + ": " + problems.join("; ")); }
    } else {
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      fs.writeFileSync(dest, o.png);
      console.log(`${o.file}  ${o.size}px  bg ${o.bg}  ${o.png.length} bytes`);
    }
  }
  if (check) { if (bad) process.exit(1); console.log("app icons: all present, opaque and up to date"); }
}

module.exports = { APPS, SIZES, build, inspect, decode, background };
