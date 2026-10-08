// 0.4.1 — week site map: visit-count pins, Nominatim cache, bounds, clipboard.
process.env.TZ = "Australia/Sydney";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const M = require("./ts-map.js");

const WEEK = { startIso: "2026-10-05", endIso: "2026-10-12" };
const job = (id, name, extra) => Object.assign({ job_id: id, job_name: name, address: "", lat: null, lng: null }, extra || {});
const shift = (id, date, name, extra) => Object.assign({ session_id: id, date, job_id: "", job_name: name, address_confirmed: "", lat_on: null, lng_on: null }, extra || {});

test("stored site coordinates are used, and they beat the shift GPS fix", () => {
  const out = M.weekSites(Object.assign({
    jobs: [job("j1", "Frankston", { address: "1 Beach St, Frankston VIC", lat: -38.143, lng: 145.122 })],
    sessions: [
      shift("a", "2026-10-08", "Frankston", { job_id: "j1", lat_on: -37.0, lng_on: 144.0 }),
      shift("b", "2026-10-09", "Frankston", { job_id: "j1", lat_on: "", lng_on: "" })
    ]
  }, WEEK));
  assert.equal(out.pending.length, 0);
  assert.equal(out.skipped.length, 0);
  assert.equal(out.pins.length, 1);
  assert.equal(out.pins[0].visits, 2);
  assert.equal(out.pins[0].source, "job");
  assert.equal(out.pins[0].lat, -38.143);
  assert.equal(out.pins[0].lng, 145.122);
});

test("a shift GPS fix is used only when the site has no stored coordinates", () => {
  const out = M.weekSites(Object.assign({
    jobs: [job("j1", "Depot", { address: "10 Hill Rd", lat: "", lng: "" })],
    sessions: [shift("a", "2026-10-08", "Depot", { job_id: "j1", lat_on: -37.907, lng_on: 145.19 })]
  }, WEEK));
  assert.equal(out.pins.length, 1);
  assert.equal(out.pins[0].source, "gps");
  assert.equal(out.pins[0].lat, -37.907);
  assert.equal(out.pins[0].visits, 1);
  assert.equal(M.hasCoords("", ""), false);
  assert.equal(M.hasCoords(0, 0), true);
});

test("address-only sites are geocoded later; sites with no location are skipped", () => {
  const out = M.weekSites(Object.assign({
    jobs: [
      job("j1", "Wheelers Hill", { address: "200 Jells Rd, Wheelers Hill VIC" }),
      job("j2", "Mornington", { address: "" })
    ],
    sessions: [
      shift("a", "2026-10-08", "Wheelers Hill", { job_id: "j1" }),
      shift("b", "2026-10-08", "Mornington", { job_id: "j2" }),
      shift("c", "2026-10-08", "Unknown location", { address_confirmed: "Unknown location" })
    ],
    staticDays: [{ date: "2026-10-08", template: { id: "tpl1", name: "School pickup", type: "School Day", location: "" } }]
  }, WEEK));
  assert.deepEqual(out.pending.map((p) => p.name), ["Wheelers Hill"]);
  assert.equal(out.pending[0].address, "200 Jells Rd, Wheelers Hill VIC");
  assert.deepEqual(out.skipped.map((s) => s.name), ["Mornington", "School pickup (School Day)", "Unknown location"]);
  assert.equal(M.skippedNote(out.skipped), "Skipped (no location): Mornington, School pickup (School Day), Unknown location");
  assert.equal(M.skippedNote([]), "");
});

test("visit count is how many times the site appears; other weeks and other jobs stay out", () => {
  const out = M.weekSites(Object.assign({
    jobs: [
      job("j1", "Frankston", { lat: -38.14, lng: 145.12 }),
      job("j2", "Frankston", { lat: -38.2, lng: 145.2 })
    ],
    sessions: [
      shift("a", "2026-10-08", "Frankston", { job_id: "j1" }),
      shift("b", "2026-10-08", "Frankston", { job_id: "j1" }),
      shift("c", "2026-10-09", "Frankston", { job_id: "j1" }),
      shift("d", "2026-10-08", "Frankston", { job_id: "j2" }),
      shift("e", "2026-10-01", "Frankston", { job_id: "j1" })
    ],
    currentSession: shift("open", "2026-10-10", "Frankston", { job_id: "j1" })
  }, WEEK));
  const byId = Object.fromEntries(out.pins.map((p) => [p.lat, p.visits]));
  assert.equal(byId[-38.14], 4, "three shifts plus the open clock-on");
  assert.equal(byId[-38.2], 1, "same name, different job");
  assert.equal(out.pins.length, 2);
});

test("a static day with a saved address is pending, and one that matches a job shares its pin", () => {
  const out = M.weekSites(Object.assign({
    jobs: [job("j1", "Frankston", { address: "1 Beach St, Frankston VIC", lat: -38.14, lng: 145.12 })],
    sessions: [shift("a", "2026-10-08", "Frankston", { job_id: "j1" })],
    staticDays: [
      { date: "2026-10-08", template: { name: "Frankston", type: "", location: "1 Beach St, Frankston VIC" } },
      { date: "2026-10-08", template: { name: "Office", type: "Office Day", location: "9 Queen St, Melbourne VIC" } },
      { date: "2026-09-30", template: { name: "Old", location: "1 Old St" } }
    ]
  }, WEEK));
  assert.equal(out.pins[0].name, "Frankston");
  assert.equal(out.pins[0].visits, 2);
  assert.deepEqual(out.pending.map((p) => p.address), ["9 Queen St, Melbourne VIC"]);
  assert.equal(out.skipped.length, 0);
});

test("Nominatim: one request per second, User-Agent and Referer, cache the result", async () => {
  let t = 5000;
  const calls = [];
  const geo = M.createGeocoder({
    cache: {},
    version: "0.4.1",
    now: () => t,
    sleep: (ms) => { t += ms; return Promise.resolve(); },
    fetch: (url, opts) => {
      calls.push({ url, opts, t });
      const q = decodeURIComponent(url.split("q=")[1]);
      const hit = q.startsWith("1 Beach") ? [{ lat: "-38.1430", lon: "145.1220" }] : [];
      return Promise.resolve({ ok: true, json: async () => hit });
    }
  });
  const a = await geo.lookup("  1 Beach St, Frankston VIC ");
  const again = await geo.lookup("1 beach st, frankston vic");
  const miss = await geo.lookup("not a real place zz");
  const missAgain = await geo.lookup("not a real place zz");
  assert.deepEqual(a, { lat: -38.143, lng: 145.122 });
  assert.equal(again, a, "same address is not looked up twice");
  assert.equal(miss, null);
  assert.equal(missAgain, null);
  assert.equal(calls.length, 2);
  assert.ok(calls[1].t - calls[0].t >= M.NOMINATIM_INTERVAL_MS);
  assert.equal(calls[0].opts.headers["User-Agent"], "NeillDataTimesheet/0.4.1 (https://www.neilldata.com/timesheet/)");
  assert.equal(calls[0].opts.headers.Referer, "https://www.neilldata.com/timesheet/");
  assert.match(calls[0].url, /^https:\/\/nominatim\.openstreetmap\.org\/search\?/);
  assert.match(calls[0].url, /countrycodes=au/);
  assert.match(calls[0].url, /q=1%20Beach%20St%2C%20Frankston%20VIC/);
});

test("locateWeek geocodes address-only sites once and skips a miss", async () => {
  const fetched = [];
  const geo = M.createGeocoder({
    cache: { "200 jells rd, wheelers hill vic": { lat: -37.907, lng: 145.19 } },
    now: () => 0,
    sleep: () => Promise.resolve(),
    fetch: (url) => { fetched.push(url); return Promise.resolve({ ok: true, json: async () => [] }); }
  });
  const out = await M.locateWeek(Object.assign({
    jobs: [
      job("j1", "Frankston", { lat: -38.143, lng: 145.122 }),
      job("j2", "Wheelers Hill", { address: "200 Jells Rd, Wheelers Hill VIC" }),
      job("j3", "Nowhere", { address: "not a real place zz" })
    ],
    sessions: [
      shift("a", "2026-10-08", "Frankston", { job_id: "j1" }),
      shift("b", "2026-10-08", "Frankston", { job_id: "j1" }),
      shift("c", "2026-10-08", "Wheelers Hill", { job_id: "j2" }),
      shift("d", "2026-10-09", "Nowhere", { job_id: "j3" })
    ]
  }, WEEK), geo);
  assert.equal(fetched.length, 1, "cached address is not requested");
  assert.deepEqual(out.pins.map((p) => [p.name, p.visits, p.source]), [
    ["Frankston", 2, "job"],
    ["Wheelers Hill", 1, "geocode"]
  ]);
  assert.deepEqual(out.skipped.map((s) => s.name), ["Nowhere"]);
  assert.equal(out.pins[1].lat, -37.907);
});

test("the map bounds fit every pin, tiles are OSM, attribution is on the plan", () => {
  const pins = [
    { name: "Mornington", lat: -38.218, lng: 145.038, visits: 3 },
    { name: "Frankston", lat: -38.143, lng: 145.122, visits: 2 },
    { name: "Wheelers Hill", lat: -37.907, lng: 145.19, visits: 1 }
  ];
  const plan = M.planMap(pins);
  assert.equal(plan.attribution, "© OpenStreetMap contributors");
  assert.ok(plan.zoom >= 3 && plan.zoom <= 16);
  assert.equal(plan.pins.length, 3);
  plan.pins.forEach((p) => {
    assert.ok(p.x >= 56 && p.x <= plan.width - 56, p.name + " x " + p.x);
    assert.ok(p.y >= 56 && p.y <= plan.height - 56, p.name + " y " + p.y);
    assert.equal(p.visits, pins.find((s) => s.name === p.name).visits);
  });
  assert.ok(plan.tiles.length > 0);
  assert.ok(plan.tiles.every((t) => t.url === "https://tile.openstreetmap.org/" + t.z + "/" + t.x + "/" + t.y + ".png"));
  const covers = (x, y) => plan.tiles.some((t) => x >= t.left && x < t.left + t.size && y >= t.top && y < t.top + t.size);
  assert.ok(covers(0, 0));
  assert.ok(covers(plan.width - 1, plan.height - 1));
  const one = M.planMap([{ name: "Frankston", lat: -38.143, lng: 145.122, visits: 4 }]);
  assert.equal(one.zoom, 16, "a single pin stays close");
  assert.ok(Math.abs(one.pins[0].x - one.width / 2) < 1);
  assert.ok(Math.abs(one.pins[0].y - one.height / 2) < 1);
  assert.equal(M.planMap([]), null);
});

test("the canvas records a red pin number per site and the OSM attribution", () => {
  const plan = M.planMap([
    { name: "Frankston", lat: -38.143, lng: 145.122, visits: 2 },
    { name: "Mornington", lat: -38.218, lng: 145.038, visits: 3 }
  ]);
  const texts = [];
  const ctx = {
    fillStyle: "", font: "", textAlign: "", textBaseline: "", lineWidth: 1, strokeStyle: "",
    shadowColor: "", shadowBlur: 0, shadowOffsetY: 0,
    fillRect() {}, drawImage() {}, save() {}, restore() {}, translate() {}, beginPath() {},
    moveTo() {}, bezierCurveTo() {}, arc() {}, closePath() {}, fill() {}, stroke() {},
    fillText(t) { texts.push(String(t)); },
    measureText(t) { return { width: String(t).length * 7 }; }
  };
  const tile = { width: 1 };
  const tiles = {};
  plan.tiles.forEach((t) => { tiles[t.key] = tile; });
  M.drawMap(ctx, plan, tiles);
  assert.ok(texts.includes("2"));
  assert.ok(texts.includes("3"));
  assert.ok(texts.includes("© OpenStreetMap contributors"));
});

test("clipboard: both when image/png is supported, download path when it is not", () => {
  assert.deepEqual(M.clipboardSupport({}), { write: false, image: false, both: false });
  const yes = M.clipboardSupport({ write: true, ClipboardItem: function () {} });
  assert.equal(yes.both, true, "no supports() means try image and text together");
  const no = M.clipboardSupport({
    write: true,
    ClipboardItem: { supports: (type) => type === "image/png" ? false : true }
  });
  assert.equal(no.image, false);
  assert.equal(no.both, false);
  const png = M.clipboardSupport({
    write: true,
    ClipboardItem: { supports: (type) => type === "image/png" }
  });
  assert.equal(png.both, true);
});

test("Leaflet is the vendored BSD-2 build and the OSM notice is kept", () => {
  const lic = fs.readFileSync(path.join(__dirname, "vendor/leaflet/LICENSE"), "utf8");
  assert.match(lic, /BSD 2-Clause License/);
  assert.match(lic, /Volodymyr Agafonkin/);
  const js = fs.readFileSync(path.join(__dirname, "vendor/leaflet/leaflet.js"), "utf8");
  assert.match(js, /Leaflet 1\.9\.4/);
  assert.doesNotMatch(js, /GNU General Public License/);
  const notice = fs.readFileSync(path.join(__dirname, "vendor/OSM.txt"), "utf8");
  assert.match(notice, /© OpenStreetMap contributors/);
  assert.match(notice, /one request per second/);
});
