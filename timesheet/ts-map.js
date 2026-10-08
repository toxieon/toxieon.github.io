/* ts-map.js — Timesheet week-site map (0.4.1). Pure, no DOM; window.TsMap in
 * the app, CommonJS in tests (timesheet/ts-map.test.cjs).
 *
 *   weekSites / locateWeek   sites visited in a week, visit counts, skip / geocode
 *   createGeocoder           Nominatim, one request per second, cached
 *   planMap / drawMap        OSM tiles + red visit-count pins fitted to the pins
 *   clipboardSupport         text+png together, or image-only, or neither
 *
 * Leaflet (BSD-2-Clause, vendor/leaflet/) draws the on-screen map. The PNG is
 * drawn here onto a canvas from CORS-enabled OSM tiles. Text export is untouched.
 */
(function (root, factory) {
  var api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.TsMap = api;
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  var ATTRIBUTION = "© OpenStreetMap contributors";
  var TILE = 256;
  var MAP_W = 800;
  var MAP_H = 560;
  var PAD = 56;
  var MIN_ZOOM = 3;
  var MAX_ZOOM = 16;
  var NOMINATIM_INTERVAL_MS = 1000;
  var NOMINATIM = "https://nominatim.openstreetmap.org/search";

  function clean(s) {
    var t = String(s == null ? "" : s).replace(/\s+/g, " ").trim();
    return (!t || /^(undefined|null|nan)$/i.test(t)) ? "" : t;
  }
  function norm(s) { return clean(s).toLowerCase(); }
  function usableAddress(s) {
    var t = clean(s);
    if (!t || /^unknown( location)?$/i.test(t)) return "";
    return t;
  }
  function hasCoords(lat, lng) {
    if (typeof lat === "string" && lat.trim() === "") return false;
    if (typeof lng === "string" && lng.trim() === "") return false;
    if (lat == null || lng == null) return false;
    var a = Number(lat), b = Number(lng);
    return Number.isFinite(a) && Number.isFinite(b) && Math.abs(a) <= 90 && Math.abs(b) <= 180;
  }
  function cacheKey(address) { return norm(address); }

  function nominatimHeaders(version) {
    return {
      Accept: "application/json",
      "User-Agent": "NeillDataTimesheet/" + (version || "0.4.1") + " (https://www.neilldata.com/timesheet/)",
      Referer: "https://www.neilldata.com/timesheet/"
    };
  }
  function nominatimUrl(address) {
    return NOMINATIM + "?format=jsonv2&limit=1&countrycodes=au&q=" + encodeURIComponent(clean(address));
  }
  function parseNominatim(json) {
    var row = json && json[0];
    if (!row) return null;
    var lat = Number(row.lat), lng = Number(row.lon != null ? row.lon : row.lng);
    if (!hasCoords(lat, lng)) return null;
    return { lat: lat, lng: lng };
  }

  /* One Nominatim lookup at a time, at least minIntervalMs apart. Cache hits
   * (including a stored miss) do not hit the network. A failed request is not
   * cached, so the next attempt can try again. */
  function createGeocoder(opts) {
    opts = opts || {};
    var fetchFn = opts.fetch;
    var cache = opts.cache || {};
    var gap = opts.minIntervalMs != null ? opts.minIntervalMs : NOMINATIM_INTERVAL_MS;
    var now = opts.now || function () { return Date.now(); };
    var sleep = opts.sleep || function (ms) { return new Promise(function (r) { setTimeout(r, ms); }); };
    var headers = opts.headers || nominatimHeaders(opts.version);
    var lastAt = -gap;
    var chain = Promise.resolve();

    function remember(key, value) {
      cache[key] = value;
      if (typeof opts.onCache === "function") opts.onCache(cache);
      return value;
    }
    function lookup(address) {
      var key = cacheKey(address);
      if (!key) return Promise.resolve(null);
      if (Object.prototype.hasOwnProperty.call(cache, key)) return Promise.resolve(cache[key]);
      var task = chain.then(function () {
        if (Object.prototype.hasOwnProperty.call(cache, key)) return cache[key];
        var wait = lastAt + gap - now();
        return (wait > 0 ? sleep(wait) : Promise.resolve()).then(function () {
          lastAt = now();
          return fetchFn(nominatimUrl(address), { headers: headers }).then(function (res) {
            if (res && res.ok === false) throw new Error("nominatim");
            return res.json();
          }).then(function (json) {
            return remember(key, parseNominatim(json));
          });
        });
      });
      chain = task.then(function () { return null; }, function () { return null; });
      return task;
    }
    return { lookup: lookup, cache: cache };
  }

  function inRange(date, startIso, endIso) {
    return !startIso || !endIso || (date >= startIso && date < endIso);
  }

  /* Group the week's shifts (and static-day rows) into sites.
   * Visit count = how many times that site appears. Stored job coordinates
   * win over a shift's GPS fix. Address-only sites are pending; anything
   * with neither is skipped. Pass startIso/endIso (YYYY-MM-DD, end exclusive)
   * to ignore other weeks. currentSession counts when it falls in the week. */
  function weekSites(input) {
    input = input || {};
    var startIso = input.startIso || "";
    var endIso = input.endIso || "";
    var jobs = input.jobs || [];
    var byId = {};
    jobs.forEach(function (j) { if (j && j.job_id) byId[j.job_id] = j; });

    var sessions = (input.sessions || []).filter(function (s) { return s && inRange(s.date, startIso, endIso); });
    var cs = input.currentSession;
    if (cs && inRange(cs.date, startIso, endIso) && !sessions.some(function (s) { return s.session_id && s.session_id === cs.session_id; })) {
      sessions = sessions.concat([cs]);
    }
    var staticDays = (input.staticDays || []).filter(function (sd) { return sd && inRange(sd.date, startIso, endIso); });

    var groups = new Map();
    function touch(key, spec) {
      var g = groups.get(key);
      if (!g) {
        g = { key: key, name: "", address: "", visits: 0, lat: null, lng: null, source: "" };
        groups.set(key, g);
      }
      g.visits += 1;
      if (spec.name && !g.name) g.name = spec.name;
      if (spec.address && (spec.preferAddress || !g.address)) g.address = spec.address;
      if (spec.source === "job" && hasCoords(spec.lat, spec.lng)) {
        g.lat = Number(spec.lat); g.lng = Number(spec.lng); g.source = "job";
      } else if (spec.source === "gps" && g.source !== "job" && g.source !== "gps" && hasCoords(spec.lat, spec.lng)) {
        g.lat = Number(spec.lat); g.lng = Number(spec.lng); g.source = "gps";
      }
    }
    function jobByPlace(name, address) {
      var nn = norm(name), aa = norm(address);
      for (var i = 0; i < jobs.length; i++) {
        var j = jobs[i];
        if (aa && norm(j.address) === aa) return j;
        if (nn && norm(j.job_name) === nn) return j;
        if (aa && norm(j.job_name) === aa) return j;
      }
      return null;
    }

    sessions.forEach(function (s) {
      var job = s.job_id ? byId[s.job_id] : null;
      if (!job) job = jobByPlace(s.job_name, s.address_confirmed);
      var name = clean(s.job_name) || clean(job && job.job_name) || usableAddress(s.address_confirmed) || "Unnamed job";
      var address = usableAddress(job && job.address) || usableAddress(s.address_confirmed);
      var lat = null, lng = null, source = "";
      if (job && hasCoords(job.lat, job.lng)) { lat = job.lat; lng = job.lng; source = "job"; }
      else if (hasCoords(s.lat_on, s.lng_on)) { lat = s.lat_on; lng = s.lng_on; source = "gps"; }
      var key = (job && job.job_id) ? ("job:" + job.job_id) : ("name:" + norm(name));
      touch(key, { name: name, address: address, preferAddress: !!(job && usableAddress(job.address)), lat: lat, lng: lng, source: source });
    });

    staticDays.forEach(function (sd) {
      var tpl = sd.template || sd;
      var raw = clean(tpl.name) || "Static day";
      var display = raw + (clean(tpl.type) ? " (" + clean(tpl.type) + ")" : "");
      var address = usableAddress(tpl.location);
      var job = jobByPlace(raw, address);
      var lat = null, lng = null, source = "";
      if (job && hasCoords(job.lat, job.lng)) { lat = job.lat; lng = job.lng; source = "job"; }
      var key = (job && job.job_id) ? ("job:" + job.job_id) : ("name:" + norm(display));
      touch(key, {
        name: (job && clean(job.job_name)) || display,
        address: usableAddress(job && job.address) || address,
        preferAddress: !!(job && usableAddress(job.address)),
        lat: lat, lng: lng, source: source
      });
    });

    var pins = [], pending = [], skipped = [];
    groups.forEach(function (g) {
      var name = g.name || "Unnamed job";
      if (g.source === "job" || g.source === "gps") {
        pins.push({ name: name, address: g.address, lat: g.lat, lng: g.lng, visits: g.visits, source: g.source });
      } else if (g.address) {
        pending.push({ name: name, address: g.address, visits: g.visits, key: g.key });
      } else {
        skipped.push({ name: name, visits: g.visits, reason: "no location" });
      }
    });
    var byVisits = function (a, b) { return b.visits - a.visits || a.name.localeCompare(b.name); };
    var byName = function (a, b) { return a.name.localeCompare(b.name); };
    pins.sort(byVisits);
    pending.sort(byName);
    skipped.sort(byName);
    return { pins: pins, pending: pending, skipped: skipped };
  }

  function skippedNote(skipped) {
    var names = [];
    (skipped || []).forEach(function (s) {
      if (s && s.name && names.indexOf(s.name) === -1) names.push(s.name);
    });
    return names.length ? ("Skipped (no location): " + names.join(", ")) : "";
  }

  async function locateWeek(input, geocoder) {
    var found = weekSites(input);
    var pins = found.pins.slice();
    var skipped = found.skipped.slice();
    var lookup = geocoder && geocoder.lookup ? geocoder.lookup.bind(geocoder) : null;
    for (var i = 0; i < found.pending.length; i++) {
      var p = found.pending[i];
      var hit = null;
      if (lookup) {
        try { hit = await lookup(p.address); } catch (e) { hit = null; }
      }
      if (hit && hasCoords(hit.lat, hit.lng)) {
        pins.push({ name: p.name, address: p.address, lat: Number(hit.lat), lng: Number(hit.lng), visits: p.visits, source: "geocode" });
      } else {
        skipped.push({ name: p.name, visits: p.visits, reason: "no location" });
      }
    }
    pins.sort(function (a, b) { return b.visits - a.visits || a.name.localeCompare(b.name); });
    skipped.sort(function (a, b) { return a.name.localeCompare(b.name); });
    return { pins: pins, skipped: skipped };
  }

  function project(lat, lng, z) {
    var n = TILE * Math.pow(2, z);
    var x = (Number(lng) + 180) / 360 * n;
    var s = Math.sin(Number(lat) * Math.PI / 180);
    var y = (0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)) * n;
    return { x: x, y: y };
  }
  function clamp(n, a, b) { return Math.max(a, Math.min(b, n)); }

  /* Highest zoom at which every pin fits inside the canvas padding.
   * The returned pin x/y is the pin tip, in canvas pixels. */
  function planMap(pins, opts) {
    opts = opts || {};
    var w = opts.width || MAP_W;
    var h = opts.height || MAP_H;
    var pad = opts.pad != null ? opts.pad : PAD;
    var minZ = opts.minZoom != null ? opts.minZoom : MIN_ZOOM;
    var maxZ = opts.maxZoom != null ? opts.maxZoom : MAX_ZOOM;
    var list = (pins || []).filter(function (p) { return p && hasCoords(p.lat, p.lng); });
    if (!list.length) return null;

    var zoom = minZ;
    var pts = [];
    for (var z = maxZ; z >= minZ; z--) {
      var cur = list.map(function (p) { return project(p.lat, p.lng, z); });
      var minX = cur[0].x, maxX = cur[0].x, minY = cur[0].y, maxY = cur[0].y;
      for (var i = 1; i < cur.length; i++) {
        if (cur[i].x < minX) minX = cur[i].x;
        if (cur[i].x > maxX) maxX = cur[i].x;
        if (cur[i].y < minY) minY = cur[i].y;
        if (cur[i].y > maxY) maxY = cur[i].y;
      }
      zoom = z;
      pts = cur;
      if ((maxX - minX) <= (w - 2 * pad) && (maxY - minY) <= (h - 2 * pad)) break;
    }
    var minX2 = pts[0].x, maxX2 = pts[0].x, minY2 = pts[0].y, maxY2 = pts[0].y;
    for (var k = 1; k < pts.length; k++) {
      if (pts[k].x < minX2) minX2 = pts[k].x;
      if (pts[k].x > maxX2) maxX2 = pts[k].x;
      if (pts[k].y < minY2) minY2 = pts[k].y;
      if (pts[k].y > maxY2) maxY2 = pts[k].y;
    }
    var world = TILE * Math.pow(2, zoom);
    var originX = clamp((minX2 + maxX2) / 2 - w / 2, 0, Math.max(0, world - w));
    var originY = clamp((minY2 + maxY2) / 2 - h / 2, 0, Math.max(0, world - h));

    var placed = list.map(function (p, idx) {
      return {
        name: p.name, address: p.address || "", visits: p.visits, lat: Number(p.lat), lng: Number(p.lng),
        x: pts[idx].x - originX, y: pts[idx].y - originY
      };
    });
    var seen = {};
    placed.forEach(function (p) {
      var slot = Math.round(p.x) + "," + Math.round(p.y);
      var n = seen[slot] || 0;
      seen[slot] = n + 1;
      if (!n) return;
      var nx = p.x + n * 18, ny = p.y - n * 14;
      if (nx > 16 && nx < w - 16 && ny > 40 && ny < h - 16) { p.x = nx; p.y = ny; }
    });

    var x0 = Math.floor(originX / TILE);
    var y0 = Math.floor(originY / TILE);
    var x1 = Math.floor((originX + w - 1) / TILE);
    var y1 = Math.floor((originY + h - 1) / TILE);
    var maxTile = Math.pow(2, zoom) - 1;
    var tiles = [];
    for (var x = x0; x <= x1; x++) {
      for (var y = y0; y <= y1; y++) {
        if (x < 0 || y < 0 || x > maxTile || y > maxTile) continue;
        tiles.push({
          z: zoom, x: x, y: y,
          key: zoom + "/" + x + "/" + y,
          url: "https://tile.openstreetmap.org/" + zoom + "/" + x + "/" + y + ".png",
          left: x * TILE - originX,
          top: y * TILE - originY,
          size: TILE
        });
      }
    }
    return {
      width: w, height: h, zoom: zoom, originX: originX, originY: originY,
      attribution: ATTRIBUTION, tiles: tiles, pins: placed
    };
  }

  function drawPin(ctx, x, y, visits) {
    var label = String(visits);
    ctx.save();
    ctx.translate(x, y);
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.bezierCurveTo(-3, -10, -14, -16, -14, -28);
    ctx.arc(0, -28, 14, Math.PI, 0, false);
    ctx.bezierCurveTo(14, -16, 3, -10, 0, 0);
    ctx.closePath();
    ctx.fillStyle = "#d21f1f";
    ctx.shadowColor = "rgba(0,0,0,0.35)";
    ctx.shadowBlur = 3;
    ctx.shadowOffsetY = 1;
    ctx.fill();
    ctx.shadowColor = "transparent";
    ctx.shadowBlur = 0;
    ctx.lineWidth = 2;
    ctx.strokeStyle = "#ffffff";
    ctx.stroke();
    ctx.fillStyle = "#ffffff";
    ctx.font = "700 " + (label.length > 2 ? 10 : 13) + "px sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(label, 0, -28);
    ctx.restore();
  }

  function drawMap(ctx, plan, tiles) {
    if (!ctx || !plan) return;
    var w = plan.width, h = plan.height;
    ctx.fillStyle = "#dfe6ea";
    ctx.fillRect(0, 0, w, h);
    (plan.tiles || []).forEach(function (t) {
      var img = tiles && tiles[t.key];
      if (img) ctx.drawImage(img, t.left, t.top, t.size, t.size);
    });
    (plan.pins || []).forEach(function (p) { drawPin(ctx, p.x, p.y, p.visits); });
    var text = plan.attribution || ATTRIBUTION;
    ctx.save();
    ctx.font = "12px sans-serif";
    var tw = ctx.measureText(text).width;
    var bw = tw + 16, bh = 22;
    var x = w - bw - 6, y = h - bh - 6;
    ctx.shadowColor = "transparent";
    ctx.fillStyle = "rgba(255,255,255,0.9)";
    ctx.fillRect(x, y, bw, bh);
    ctx.fillStyle = "#222";
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    ctx.fillText(text, x + 8, y + bh / 2);
    ctx.restore();
  }

  /* image=true means the clipboard can take a PNG (alone, and together with text).
   * When ClipboardItem.supports is missing we still try; a false supports()
   * result means use the download fallback instead. */
  function clipboardSupport(env) {
    env = env || {};
    var Item = env.ClipboardItem;
    var write = !!(env.write && Item);
    var image = false;
    if (write) {
      image = typeof Item.supports !== "function" ? true : !!Item.supports("image/png");
    }
    return { write: write, image: image, both: image };
  }

  return {
    ATTRIBUTION: ATTRIBUTION,
    TILE_SIZE: TILE,
    MAP_WIDTH: MAP_W,
    MAP_HEIGHT: MAP_H,
    NOMINATIM_INTERVAL_MS: NOMINATIM_INTERVAL_MS,
    hasCoords: hasCoords,
    cacheKey: cacheKey,
    nominatimHeaders: nominatimHeaders,
    nominatimUrl: nominatimUrl,
    parseNominatim: parseNominatim,
    createGeocoder: createGeocoder,
    weekSites: weekSites,
    locateWeek: locateWeek,
    skippedNote: skippedNote,
    planMap: planMap,
    drawMap: drawMap,
    clipboardSupport: clipboardSupport
  };
});
