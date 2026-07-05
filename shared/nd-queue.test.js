/* Node test harness for nd-queue.js (zero deps, fake timers/network/storage).
 * Run:  node shared/nd-queue.test.js
 */
const Q = require("./nd-queue.js");

let pass = 0, fail = 0;
function ok(cond, name) {
  if (cond) { pass++; console.log("  PASS  " + name); }
  else      { fail++; console.log("  FAIL  " + name); }
}
const tick = () => new Promise(r => setImmediate(r));

function makeEnv() {
  let nowMs = 5000000;
  const store = {};
  const timers = [];   // one-shots
  const loops = [];    // intervals (fired manually)
  let online = true;
  let onlineCb = null, offlineCb = null;
  const env = {
    deps: {
      storage: { get: k => (k in store ? store[k] : null), set: (k, v) => { store[k] = v; } },
      now: () => nowMs,
      setTimer: (fn, ms) => { const id = timers.length; timers.push({ fn, at: nowMs + ms, fired: false }); return id; },
      clearTimer: id => { if (timers[id]) timers[id].fired = true; },
      setLoop: (fn, ms) => { loops.push(fn); return loops.length - 1; },
      isOnline: () => online,
      onOnline: cb => { onlineCb = cb; },
      onOffline: cb => { offlineCb = cb; }
    },
    store,
    advance: async ms => { nowMs += ms; for (const t of timers) if (!t.fired && t.at <= nowMs) { t.fired = true; t.fn(); } await tick(); await tick(); await tick(); },
    fireLoop: async () => { for (const fn of loops) fn(); await tick(); await tick(); await tick(); },
    setOnline: async v => { online = v; if (v && onlineCb) onlineCb(); if (!v && offlineCb) offlineCb(); await tick(); await tick(); await tick(); }
  };
  return env;
}

(async function () {

  console.log("basics");
  {
    let threw = false;
    try { Q.createQueue({}); } catch (e) { threw = true; }
    ok(threw, "createQueue requires a name");
  }

  console.log("enqueue -> debounced flush -> handler runs");
  {
    const env = makeEnv();
    const q = Q.createQueue({ name: "t", deps: env.deps });
    const writes = [];
    q.handler("write", async p => { writes.push(p); });
    const statuses = [];
    q.onStatus(s => statuses.push(s));
    q.enqueue("write", { row: 1 });
    ok(q.size() === 1 && q.status() === "pending", "queued + pending before debounce");
    await env.advance(1000);
    ok(writes.length === 1 && writes[0].row === 1, "handler ran after 1s debounce");
    ok(q.size() === 0 && q.status() === "synced", "drained -> synced");
    ok(statuses.join(",").indexOf("pending") !== -1 && statuses[statuses.length - 1] === "synced", "status walked pending->...->synced");
  }

  console.log("offline: nothing flushes, flushes on 'online'");
  {
    const env = makeEnv();
    const q = Q.createQueue({ name: "t", deps: env.deps });
    const writes = [];
    q.handler("write", async p => { writes.push(p); });
    await env.setOnline(false);
    q.enqueue("write", { row: 1 });
    await env.advance(1000);
    ok(writes.length === 0 && q.size() === 1, "offline: held in queue");
    ok(q.status() === "pending", "offline status pending");
    await env.setOnline(true);
    ok(writes.length === 1 && q.size() === 0 && q.status() === "synced", "online event flushed the queue");
  }

  console.log("handler failure: retained, attempts++, failed status, 30s retry");
  {
    const env = makeEnv();
    const q = Q.createQueue({ name: "t", deps: env.deps });
    let failTimes = 2, attemptsSeen = [];
    q.handler("write", async p => { if (failTimes-- > 0) throw new Error("boom"); });
    q.enqueue("write", { row: 1 });
    await env.advance(1000);
    ok(q.size() === 1 && q.status() === "failed", "failure keeps item, status failed");
    ok(q.pending()[0].attempts === 1 && q.pending()[0].lastError === "boom", "attempts + lastError recorded");
    await env.fireLoop();   // retry #1 — still fails
    ok(q.pending()[0].attempts === 2, "retry loop increments attempts");
    await env.fireLoop();   // retry #2 — succeeds
    ok(q.size() === 0 && q.status() === "synced", "eventually drains and heals to synced");
  }

  console.log("supersede: delete drops pending writes for same key");
  {
    const env = makeEnv();
    const q = Q.createQueue({ name: "t", deps: env.deps });
    const ops = [];
    q.handler("write", async p => ops.push("w:" + p.id));
    q.handler("delete", async p => ops.push("d:" + p.id));
    q.enqueue("write", { id: "A" }, { key: "A" });
    q.enqueue("write", { id: "B" }, { key: "B" });
    q.enqueue("delete", { id: "A" }, { key: "A", supersede: true });
    ok(q.size() === 2, "queued write for A dropped by superseding delete");
    await env.advance(1000);
    ok(ops.join(",") === "w:B,d:A", "B written, A deleted, A's stale write never sent");
  }

  console.log("unknown kind waits for its handler");
  {
    const env = makeEnv();
    const q = Q.createQueue({ name: "t", deps: env.deps });
    q.enqueue("mystery", { x: 1 });
    await env.advance(1000);
    ok(q.size() === 1, "item without handler is kept, not lost");
    const got = [];
    q.handler("mystery", async p => got.push(p));
    await q.flush();
    ok(got.length === 1 && q.size() === 0, "flushes once handler registered");
  }

  console.log("ready() gate (e.g. gapi not initialised yet)");
  {
    const env = makeEnv();
    let ready = false;
    const q = Q.createQueue({ name: "t", deps: env.deps, ready: () => ready });
    const writes = [];
    q.handler("write", async p => writes.push(p));
    q.enqueue("write", { row: 1 });
    await env.advance(1000);
    ok(writes.length === 0 && q.status() === "pending", "not ready: held");
    ready = true;
    await env.fireLoop();
    ok(writes.length === 1 && q.status() === "synced", "retry loop flushes once ready");
  }

  console.log("persistence across 'reboots' (same storage)");
  {
    const env = makeEnv();
    const q1 = Q.createQueue({ name: "t", deps: env.deps });
    q1.enqueue("write", { row: 1 });
    // app dies before flush; new instance over same storage:
    const q2 = Q.createQueue({ name: "t", deps: env.deps });
    ok(q2.size() === 1, "queue survives reboot");
    const writes = [];
    q2.handler("write", async p => writes.push(p));
    await q2.flush();
    ok(writes.length === 1 && q2.size() === 0, "flushes after reboot");
  }

  console.log("namespace isolation");
  {
    const env = makeEnv();
    const qa = Q.createQueue({ name: "planner", deps: env.deps });
    const qb = Q.createQueue({ name: "upload", deps: env.deps });
    qa.enqueue("write", { row: 1 });
    ok(qb.size() === 0, "queues don't leak across app namespaces");
    ok(qa._key !== qb._key, "distinct storage keys");
  }

  console.log("items enqueued mid-flush aren't lost");
  {
    const env = makeEnv();
    const q = Q.createQueue({ name: "t", deps: env.deps });
    const writes = [];
    let enqueuedDuring = false;
    q.handler("write", async p => {
      writes.push(p.row);
      if (!enqueuedDuring) { enqueuedDuring = true; q.enqueue("write", { row: 2 }); }
    });
    q.enqueue("write", { row: 1 });
    await env.advance(1000);
    ok(writes.indexOf(1) !== -1, "first item flushed");
    ok(q.size() === 1, "mid-flush enqueue preserved");
    await env.advance(1000);
    ok(writes.indexOf(2) !== -1 && q.size() === 0, "second flush drains it");
  }

  console.log("\n" + pass + " passed, " + fail + " failed");
  process.exit(fail ? 1 : 0);
})();
