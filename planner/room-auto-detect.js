/* Original floor-plan room auto-detection for Neill Planner.
 * Plan coordinates are percentages (0–100), matching manual room draw.
 * Written from scratch for this app (Otsu threshold, wall mask, flood fill, RDP simplify); no third-party code. */
(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.NDPlannerRoomAuto = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const DEFAULTS = {
    maxDim: 720,
    wallDilate: 2,
    minAreaRatio: 0.0012,
    maxAreaRatio: 0.92,
    simplifyEpsilon: 1.4,
    maxRooms: 80,
    borderMargin: 2
  };

  function clamp(n, lo, hi) { return Math.max(lo, Math.min(hi, n)); }

  function toGray(rgba, w, h) {
    const g = new Float32Array(w * h);
    for (let i = 0, p = 0; i < rgba.length; i += 4, p++) {
      g[p] = rgba[i] * 0.299 + rgba[i + 1] * 0.587 + rgba[i + 2] * 0.114;
    }
    return g;
  }

  function otsuThreshold(gray) {
    const hist = new Uint32Array(256);
    for (let i = 0; i < gray.length; i++) hist[gray[i] | 0]++;
    const total = gray.length;
    let sum = 0;
    for (let i = 0; i < 256; i++) sum += i * hist[i];
    let sumB = 0, wB = 0, max = 0, threshold = 128;
    for (let t = 0; t < 256; t++) {
      wB += hist[t];
      if (!wB) continue;
      const wF = total - wB;
      if (!wF) break;
      sumB += t * hist[t];
      const mB = sumB / wB;
      const mF = (sum - sumB) / wF;
      const between = wB * wF * (mB - mF) * (mB - mF);
      if (between > max) { max = between; threshold = t; }
    }
    return threshold;
  }

  function resizeRgba(rgba, w, h, maxDim) {
    const scale = Math.min(1, maxDim / Math.max(w, h));
    if (scale >= 1) return { data: rgba, width: w, height: h, scale: 1 };
    const nw = Math.max(8, Math.round(w * scale));
    const nh = Math.max(8, Math.round(h * scale));
    const out = new Uint8ClampedArray(nw * nh * 4);
    for (let y = 0; y < nh; y++) {
      const sy = Math.min(h - 1, Math.floor(y / scale));
      for (let x = 0; x < nw; x++) {
        const sx = Math.min(w - 1, Math.floor(x / scale));
        const si = (sy * w + sx) * 4;
        const di = (y * nw + x) * 4;
        out[di] = rgba[si];
        out[di + 1] = rgba[si + 1];
        out[di + 2] = rgba[si + 2];
        out[di + 3] = rgba[si + 3];
      }
    }
    return { data: out, width: nw, height: nh, scale };
  }

  function dilateWall(mask, w, h, radius) {
    if (!radius) return mask;
    const out = new Uint8Array(mask.length);
    const r = radius | 0;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = y * w + x;
        if (!mask[i]) continue;
        for (let dy = -r; dy <= r; dy++) {
          for (let dx = -r; dx <= r; dx++) {
            const nx = x + dx, ny = y + dy;
            if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
            if (dx * dx + dy * dy <= r * r + r) out[ny * w + nx] = 1;
          }
        }
      }
    }
    return out;
  }

  function rasterizePolygons(polygons, w, h, mask) {
    (polygons || []).forEach((poly) => {
      if (!poly || poly.length < 3) return;
      const px = poly.map(([x, y]) => [x / 100 * (w - 1), y / 100 * (h - 1)]);
      for (let i = 0; i < px.length; i++) {
        const a = px[i], b = px[(i + 1) % px.length];
        drawLine(mask, w, h, a[0], a[1], b[0], b[1]);
      }
    });
  }

  function drawLine(mask, w, h, x0, y0, x1, y1) {
    let x = x0 | 0, y = y0 | 0;
    const dx = Math.abs(x1 - x0), dy = Math.abs(y1 - y0);
    const sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
    let err = dx - dy;
    const xT = x1 | 0, yT = y1 | 0;
    for (let steps = 0; steps < 20000; steps++) {
      if (x >= 0 && y >= 0 && x < w && y < h) mask[y * w + x] = 1;
      if (x === xT && y === yT) break;
      const e2 = 2 * err;
      if (e2 > -dy) { err -= dy; x += sx; }
      if (e2 < dx) { err += dx; y += sy; }
    }
  }

  function markExterior(free, w, h, margin) {
    const outside = new Uint8Array(free.length);
    const stack = new Int32Array(free.length);
    let top = 0;
    const push = (x, y) => {
      if (x < 0 || y < 0 || x >= w || y >= h) return;
      const i = y * w + x;
      if (outside[i] || !free[i]) return;
      outside[i] = 1;
      stack[top++] = i;
    };
    for (let x = 0; x < w; x++) {
      for (let m = 0; m <= margin; m++) { push(x, m); push(x, h - 1 - m); }
    }
    for (let y = 0; y < h; y++) {
      for (let m = 0; m <= margin; m++) { push(m, y); push(w - 1 - m, y); }
    }
    while (top) {
      const i = stack[--top];
      const x = i % w, y = (i / w) | 0;
      push(x + 1, y);
      push(x - 1, y);
      push(x, y + 1);
      push(x, y - 1);
    }
    return outside;
  }

  function labelInterior(free, outside, w, h) {
    const labels = new Int32Array(free.length);
    const stack = new Int32Array(free.length);
    const areas = [];
    let next = 1;
    for (let y = 0; y < h; y++) {
      const row = y * w;
      for (let x = 0; x < w; x++) {
        const start = row + x;
        if (!free[start] || outside[start] || labels[start]) continue;
        const id = next++;
        let area = 0, top = 0;
        labels[start] = id;
        stack[top++] = start;
        while (top) {
          const i = stack[--top];
          area++;
          const cx = i % w, cy = (i / w) | 0;
          if (cx > 0) {
            const ni = i - 1;
            if (free[ni] && !outside[ni] && !labels[ni]) { labels[ni] = id; stack[top++] = ni; }
          }
          if (cx + 1 < w) {
            const ni = i + 1;
            if (free[ni] && !outside[ni] && !labels[ni]) { labels[ni] = id; stack[top++] = ni; }
          }
          if (cy > 0) {
            const ni = i - w;
            if (free[ni] && !outside[ni] && !labels[ni]) { labels[ni] = id; stack[top++] = ni; }
          }
          if (cy + 1 < h) {
            const ni = i + w;
            if (free[ni] && !outside[ni] && !labels[ni]) { labels[ni] = id; stack[top++] = ni; }
          }
        }
        areas[id] = area;
      }
    }
    return { labels, areas, count: next };
  }

  function componentCentroid(labels, id, w, h) {
    let sx = 0, sy = 0, n = 0;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = y * w + x;
        if (labels[i] !== id) continue;
        sx += x; sy += y; n++;
      }
    }
    return n ? [sx / n, sy / n] : [w / 2, h / 2];
  }

  function traceBoundary(labels, id, w, h) {
    let startX = -1, startY = -1;
    for (let y = 0; y < h && startX < 0; y++) {
      for (let x = 0; x < w; x++) {
        if (labels[y * w + x] === id) { startX = x; startY = y; break; }
      }
    }
    if (startX < 0) return [];
    const dirs = [[1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1], [0, -1], [1, -1]];
    const isIn = (x, y) => x >= 0 && y >= 0 && x < w && y < h && labels[y * w + x] === id;
    const points = [];
    let x = startX, y = startY, dir = 0;
    for (let guard = 0; guard < w * h * 8; guard++) {
      points.push([x, y]);
      let found = false;
      for (let k = 0; k < 8; k++) {
        const nd = (dir + k) % 8;
        const nx = x + dirs[nd][0], ny = y + dirs[nd][1];
        if (isIn(nx, ny)) { x = nx; y = ny; dir = (nd + 6) % 8; found = true; break; }
      }
      if (!found) break;
      if (x === startX && y === startY && points.length > 8) break;
    }
    return points;
  }

  function perpendicularDistance(p, a, b) {
    const dx = b[0] - a[0], dy = b[1] - a[1];
    if (!dx && !dy) return Math.hypot(p[0] - a[0], p[1] - a[1]);
    const t = ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / (dx * dx + dy * dy);
    const qx = a[0] + t * dx, qy = a[1] + t * dy;
    return Math.hypot(p[0] - qx, p[1] - qy);
  }

  function simplifyRdp(points, eps) {
    if (points.length <= 3) return points.map((p) => p.slice());
    let dmax = 0, idx = 0;
    const end = points.length - 1;
    for (let i = 1; i < end; i++) {
      const d = perpendicularDistance(points[i], points[0], points[end]);
      if (d > dmax) { idx = i; dmax = d; }
    }
    if (dmax > eps) {
      const left = simplifyRdp(points.slice(0, idx + 1), eps);
      const right = simplifyRdp(points.slice(idx), eps);
      return left.slice(0, -1).concat(right);
    }
    return [points[0].slice(), points[end].slice()];
  }

  function toPlanPoints(pxPoints, w, h) {
    return pxPoints.map(([x, y]) => [
      clamp((x / (w - 1)) * 100, 0, 100),
      clamp((y / (h - 1)) * 100, 0, 100)
    ]);
  }

  function polygonAreaPlan(pts) {
    if (!pts || pts.length < 3) return 0;
    let a = 0;
    for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
      a += pts[j][0] * pts[i][1] - pts[i][0] * pts[j][1];
    }
    return Math.abs(a) / 2;
  }

  function buildWallMask(gray) {
    const thr = otsuThreshold(gray);
    let dark = 0, light = 0, darkSum = 0, lightSum = 0;
    for (let i = 0; i < gray.length; i++) {
      if (gray[i] <= thr) { dark++; darkSum += gray[i]; }
      else { light++; lightSum += gray[i]; }
    }
    const cutoff = ((dark ? darkSum / dark : 0) + (light ? lightSum / light : 255)) / 2;
    const wall = new Uint8Array(gray.length);
    for (let i = 0; i < gray.length; i++) wall[i] = gray[i] < cutoff ? 1 : 0;
    return { wall, cutoff, otsu: thr };
  }

  function detectRoomsFromRgba(rgba, width, height, options = {}) {
    const opts = { ...DEFAULTS, ...options };
    const scaled = resizeRgba(rgba, width, height, opts.maxDim);
    const w = scaled.width, h = scaled.height;
    const gray = toGray(scaled.data, w, h);
    const { wall, cutoff, otsu: thr } = buildWallMask(gray);
    rasterizePolygons(opts.existingPolygons, w, h, wall);
    const dilated = dilateWall(wall, w, h, opts.wallDilate);
    const free = new Uint8Array(w * h);
    for (let i = 0; i < free.length; i++) free[i] = dilated[i] ? 0 : 1;
    const outside = markExterior(free, w, h, opts.borderMargin);
    const { labels, areas, count } = labelInterior(free, outside, w, h);
    const minArea = w * h * opts.minAreaRatio;
    const maxArea = w * h * opts.maxAreaRatio;
    const rooms = [];
    for (let id = 1; id < count; id++) {
      const area = areas[id] || 0;
      if (area < minArea || area > maxArea) continue;
      const boundary = traceBoundary(labels, id, w, h);
      if (boundary.length < 4) continue;
      const simplified = simplifyRdp(boundary, opts.simplifyEpsilon);
      let pts = toPlanPoints(simplified, w, h);
      if (pts.length < 3) continue;
      if (pts.length > 24) {
        pts = simplifyRdp(pts, opts.simplifyEpsilon * 1.5);
      }
      const centroidPx = componentCentroid(labels, id, w, h);
      const centroid = toPlanPoints([centroidPx], w, h)[0];
      rooms.push({
        id: `auto-${id}`,
        points: pts,
        centroid,
        areaPlan: polygonAreaPlan(pts),
        pixelArea: area,
        selected: true,
        name: ""
      });
    }
    rooms.sort((a, b) => b.pixelArea - a.pixelArea);
    return {
      rooms: rooms.slice(0, opts.maxRooms),
      meta: { width: w, height: h, scale: scaled.scale, threshold: cutoff, otsu: thr, sourceWidth: width, sourceHeight: height }
    };
  }

  /** Match OCR word boxes (plan %) to detected room centroids. */
  function assignOcrLabels(rooms, words, options = {}) {
    const maxDist = options.maxDist ?? 8;
    const used = new Set();
    const out = rooms.map((r) => ({ ...r }));
    const candidates = (words || [])
      .map((w, idx) => ({
        idx,
        text: String(w.text || "").trim(),
        x: Number(w.x),
        y: Number(w.y),
        conf: Number(w.confidence ?? w.conf ?? 0)
      }))
      .filter((w) => w.text && Number.isFinite(w.x) && Number.isFinite(w.y));
    candidates.sort((a, b) => b.conf - a.conf);
    for (const room of out) {
      const [cx, cy] = room.centroid || [50, 50];
      let best = null, bestD = Infinity;
      for (const w of candidates) {
        if (used.has(w.idx)) continue;
        const d = Math.hypot(w.x - cx, w.y - cy);
        if (d < maxDist && d < bestD) { best = w; bestD = d; }
      }
      if (best) {
        room.name = sanitizeRoomLabel(best.text);
        used.add(best.idx);
      } else if (!room.name) {
        room.name = "";
      }
    }
    return out;
  }

  function sanitizeRoomLabel(text) {
    const t = String(text || "").replace(/\s+/g, " ").trim();
    if (!t || t.length > 48) return "";
    if (/^[^a-zA-Z0-9]+$/.test(t)) return "";
    return t;
  }

  function defaultRoomName(index) {
    return `Room ${index + 1}`;
  }

  /** Icon detection scaffold — not reliable enough to auto-place yet. */
  function detectPlanIcons(/* rgba, width, height, options */) {
    return {
      status: "todo",
      message: "Template matching for doors, windows, GPOs, lights, smoke and data symbols is not enabled yet. Use manual node placement.",
      icons: []
    };
  }

  const ICON_KINDS = ["door", "window", "power", "light", "smoke", "data"];

  return {
    DEFAULTS,
    detectRoomsFromRgba,
    assignOcrLabels,
    sanitizeRoomLabel,
    defaultRoomName,
    detectPlanIcons,
    ICON_KINDS,
    // test helpers
    _test: { otsuThreshold, buildWallMask, polygonAreaPlan, simplifyRdp, toPlanPoints }
  };
});
