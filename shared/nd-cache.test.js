/* Node test harness for nd-cache.js (zero deps).
 * Run:  node shared/nd-cache.test.js
 */
const C = require("./nd-cache.js");

let pass = 0, fail = 0;
function ok(cond, name) {
  if (cond) { pass++; console.log("  PASS  " + name); }
  else      { fail++; console.log("  FAIL  " + name); }
}
const tick = () => new Promise(r => setImmediate(r));

(async function () {
  let nowMs = 1000000;
  const mk = () => C.createCache(C.memoryAdapter(), { now: () => nowMs });

  console.log("put / get");
  {
    const c = mk();
    await c.put("k", { a: 1 }, { source: "test" });
    ok((await c.get("k")).a === 1, "roundtrip");
    const e = await c.getEntry("k");
    ok(e.meta.source === "test" && e.storedAt === nowMs, "entry meta + storedAt");
    ok((await c.get("missing")) === undefined, "miss returns undefined");
    await c.remove("k");
    ok((await c.get("k")) === undefined, "remove works");
  }

  console.log("swr cold cache");
  {
    const c = mk();
    let calls = 0;
    const v = await c.swr("k", () => { calls++; return Promise.resolve("fresh"); });
    ok(v === "fresh" && calls === 1, "cold: awaits fetcher");
    ok((await c.get("k")) === "fresh", "cold: stores result");
  }

  console.log("swr warm + fresh (no refetch)");
  {
    const c = mk();
    await c.put("k", "cached");
    let calls = 0;
    nowMs += 1000; // 1s old, maxAge default 5min
    const v = await c.swr("k", () => { calls++; return Promise.resolve("fresh"); });
    ok(v === "cached", "returns cached instantly");
    await tick();
    ok(calls === 0, "no background fetch while fresh");
  }

  console.log("swr warm + stale (background refresh + update event)");
  {
    const c = mk();
    const events = [];
    c.onUpdate(e => events.push(e));
    await c.put("k", "old");
    nowMs += 10 * 60 * 1000;   // 10 min later
    let calls = 0;
    const v = await c.swr("k", () => { calls++; return Promise.resolve("new"); });
    ok(v === "old", "stale hit still resolves cached value immediately");
    await tick(); await tick();
    ok(calls === 1, "background refresh ran");
    ok((await c.get("k")) === "new", "cache rotated");
    ok(events.length === 1 && events[0].type === "update" && events[0].value === "new", "update event emitted");
  }

  console.log("swr stale + failing fetcher (cache kept, error event)");
  {
    const c = mk();
    const events = [];
    c.onUpdate(e => events.push(e));
    await c.put("k", "precious");
    nowMs += 10 * 60 * 1000;
    const v = await c.swr("k", () => Promise.reject(new Error("network down")));
    ok(v === "precious", "cached value survives fetch failure");
    await tick(); await tick();
    ok((await c.get("k")) === "precious", "cache NOT clobbered by failure");
    ok(events.some(e => e.type === "error"), "error event emitted");
  }

  console.log("swr cold + failing fetcher rejects");
  {
    const c = mk();
    let rejected = false;
    await c.swr("k", () => Promise.reject(new Error("no"))).catch(() => { rejected = true; });
    ok(rejected, "cold failure rejects to caller");
  }

  console.log("concurrent refresh dedupe");
  {
    const c = mk();
    await c.put("k", "old");
    nowMs += 10 * 60 * 1000;
    let calls = 0;
    const slow = () => { calls++; return new Promise(r => setImmediate(() => r("new"))); };
    await Promise.all([c.swr("k", slow), c.swr("k", slow), c.swr("k", slow)]);
    await tick(); await tick();
    ok(calls === 1, "three stale hits -> one fetch");
  }

  console.log("custom maxAge + keys/clear");
  {
    const c = mk();
    await c.put("k", "v");
    nowMs += 2000;
    let calls = 0;
    await c.swr("k", () => { calls++; return Promise.resolve("v2"); }, { maxAge: 1000 });
    await tick(); await tick();
    ok(calls === 1, "maxAge 1s honoured (2s-old entry refreshes)");
    await c.put("k2", "v");
    ok((await c.keys()).length === 2, "keys()");
    await c.clear();
    ok((await c.keys()).length === 0, "clear()");
  }

  console.log("forced refresh()");
  {
    const c = mk();
    await c.put("k", "old");
    const v = await c.refresh("k", () => Promise.resolve("forced"));
    ok(v === "forced" && (await c.get("k")) === "forced", "refresh() bypasses staleness check");
  }

  console.log("\n" + pass + " passed, " + fail + " failed");
  process.exit(fail ? 1 : 0);
})();
