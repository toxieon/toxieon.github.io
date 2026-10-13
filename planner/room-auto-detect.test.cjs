const test = require("node:test");
const assert = require("node:assert/strict");
const A = require("./room-auto-detect.js");

function blank(w, h, fill = 255) {
  const data = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < data.length; i += 4) {
    data[i] = data[i + 1] = data[i + 2] = fill;
    data[i + 3] = 255;
  }
  return data;
}

function rectWall(data, w, x0, y0, x1, y1, thickness = 2) {
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const onEdge = x <= x0 + thickness - 1 || x >= x1 - thickness + 1 || y <= y0 + thickness - 1 || y >= y1 - thickness + 1;
      if (!onEdge) continue;
      const i = (y * w + x) * 4;
      data[i] = data[i + 1] = data[i + 2] = 0;
    }
  }
}

test("detects two enclosed rooms separated by a wall", () => {
  const w = 120, h = 80;
  const data = blank(w, h);
  rectWall(data, w, 10, 10, 109, 69, 2);
  for (let y = 12; y <= 67; y++) {
    for (let x = 58; x <= 61; x++) {
      const i = (y * w + x) * 4;
      data[i] = data[i + 1] = data[i + 2] = 0;
    }
  }
  const { rooms } = A.detectRoomsFromRgba(data, w, h, { minAreaRatio: 0.01 });
  assert.ok(rooms.length >= 2, `expected >=2 rooms, got ${rooms.length}`);
  rooms.forEach((r) => {
    assert.ok(r.points.length >= 3);
    assert.ok(r.areaPlan > 1);
  });
});

test("assignOcrLabels maps nearby text to room centroids", () => {
  const rooms = [
    { id: "a", centroid: [25, 50], name: "" },
    { id: "b", centroid: [75, 50], name: "" }
  ];
  const words = [
    { text: "101", x: 24, y: 48, confidence: 90 },
    { text: "102", x: 76, y: 52, confidence: 88 }
  ];
  const out = A.assignOcrLabels(rooms, words);
  assert.equal(out[0].name, "101");
  assert.equal(out[1].name, "102");
});

test("sanitizeRoomLabel rejects punctuation-only labels", () => {
  assert.equal(A.sanitizeRoomLabel("---"), "");
  assert.equal(A.sanitizeRoomLabel("Store"), "Store");
});

test("existing polygon edges contribute to the wall mask", () => {
  const w = 100, h = 100;
  const data = blank(w, h);
  rectWall(data, w, 5, 5, 94, 94, 2);
  const poly = [[50, 5], [50, 95]];
  const alone = A.detectRoomsFromRgba(data, w, h, { minAreaRatio: 0.02 }).rooms.length;
  const merged = A.detectRoomsFromRgba(data, w, h, { minAreaRatio: 0.02, existingPolygons: [poly] }).rooms.length;
  assert.ok(merged >= alone);
});

function functionBody(src, signature) {
  const start = src.indexOf(signature);
  assert.ok(start >= 0, "missing " + signature);
  const brace = src.indexOf("{", start);
  let depth = 0;
  for (let i = brace; i < src.length; i++) {
    if (src[i] === "{") depth++;
    else if (src[i] === "}") {
      depth--;
      if (depth === 0) return src.slice(brace, i + 1);
    }
  }
  throw new Error("unbalanced " + signature);
}

test("0.21.3: detection uses a 720px canvas and releases it; auto rooms is button-only", () => {
  const fs = require("node:fs"); const path = require("node:path");
  const read = (f) => fs.readFileSync(path.join(__dirname, f), "utf8");
  const version = read("VERSION").trim();
  const app = read("app.js"), html = read("index.html"), sw = read("sw.js");
  assert.equal(version, "0.21.3");
  assert.match(app, new RegExp(`APP_VERSION = "${version}"`));
  assert.match(sw, new RegExp(`CACHE_VERSION = 'planner-${version}'`));
  for (const file of [html, sw]) {
    assert.match(file, new RegExp(`styles\\.css\\?v=${version}`));
    assert.match(file, new RegExp(`room-auto-detect\\.js\\?v=${version}`));
    assert.match(file, new RegExp(`app\\.js\\?v=${version}`));
  }
  const detect = functionBody(app, "function pixelsForDetection");
  assert.match(detect, /maxDim/);
  assert.match(detect, /imageSmoothingEnabled = false/);
  assert.match(detect, /getImageData\(0, 0, width, height\)/);
  assert.match(detect, /releaseCanvas\(canvas\)/);
  assert.doesNotMatch(detect, /naturalWidth \* naturalHeight|canvas\.width = sw/);
  assert.match(app, /PLAN_ANALYSIS_MAX = 2000/);
  assert.match(app, /releasePlanBitmap\(bitmap\)/);
  assert.match(app, /isConnected/);
  const ocr = functionBody(app, "async function runPlanOcr");
  assert.equal(ocr.match(/createWorker\s*\(/g).length, 1);
  assert.match(ocr, /terminate\(\)/);
  assert.match(ocr, /releaseCanvas\(canvas\)/);
  assert.doesNotMatch(ocr, /createElement\("canvas"\)[\s\S]*createElement\("canvas"\)/);
  assert.match(functionBody(app, "async function startAutoRooms"), /_pausePlanViewer = true/);
  assert.match(functionBody(app, "function osdFloorReady"), /_pausePlanViewer/);
  const detectJs = read("room-auto-detect.js");
  for (const name of ["function markExterior", "function labelInterior"]) {
    const body = functionBody(detectJs, name);
    assert.match(body, /new Int32Array\(free\.length\)/);
    assert.doesNotMatch(body, /\[\[/);
  }
  assert.equal(app.match(/startAutoRooms\s*\(/g).length, 2);
  assert.match(app, /case "auto-rooms": return startAutoRooms\(\)/);
  const banned = /startAutoRooms|runPlanOcr|loadPlanImageData|detectRoomsFromRgba|Tesseract|getImageData/;
  for (const signature of [
    "function uploadFloorPlan()",
    "async function replaceFloorPlanCache(",
    "async function cacheFloorPlan(",
    "function maybeFetchPlanForCurrentFloor()",
    "async function hydrateFloorPlansFromCache()"
  ]) assert.doesNotMatch(functionBody(app, signature), banned);
});

test("0.21.1: OCR is lazy (not in index.html or SW), pinned with SRI, and the icon stub has no UI", () => {
  const fs = require("node:fs"); const path = require("node:path");
  const read = (f) => fs.readFileSync(path.join(__dirname, f), "utf8");
  const html = read("index.html"), sw = read("sw.js"), app = read("app.js");
  assert.doesNotMatch(html, /tesseract/i);
  assert.doesNotMatch(sw, /tesseract|jsdelivr/i);
  assert.match(app, /PLANNER_TESSERACT_SRI = "sha384-/);
  assert.match(app, /tesseract\.js-core@5\.1\.1/);
  assert.doesNotMatch(app, /detectPlanIcons/);
  assert.match(sw, /k\.startsWith\('planner-'\)/);
});
