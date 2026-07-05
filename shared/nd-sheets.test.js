/* Node test harness for nd-sheets.js — fake in-memory spreadsheet gateway.
 * Run:  node shared/nd-sheets.test.js
 */
const S = require("./nd-sheets.js");
const Qk = require("./nd-queue.js");
const Ck = require("./nd-cache.js");

let pass = 0, fail = 0;
function ok(cond, name) {
  if (cond) { pass++; console.log("  PASS  " + name); }
  else      { fail++; console.log("  FAIL  " + name); }
}
const tick = () => new Promise(r => setImmediate(r));

/* fake spreadsheet: {ssId: {tabName: values[][]}} */
function fakeGateway(book) {
  const calls = [];
  function tabOf(range) { const m = range.match(/^'([^']+)'/); return m ? m[1] : range; }
  return {
    calls,
    getValues: async (ss, range) => {
      calls.push(["get", ss, range]);
      const tab = book[ss][tabOf(range)];
      if (/!1:1$/.test(range)) return tab.slice(0, 1);
      return tab.map(r => r.slice());
    },
    updateValues: async (ss, range, values) => {
      calls.push(["update", ss, range, values]);
      const tab = book[ss][tabOf(range)];
      const m = range.match(/!A(\d+):/);
      tab[Number(m[1]) - 1] = values[0].slice();
    },
    appendValues: async (ss, range, values) => {
      calls.push(["append", ss, range, values]);
      const tab = book[ss][tabOf(range)];
      values.forEach(v => tab.push(v.slice()));
    },
    deleteRow: async (ss, tab, rowNumber) => {
      calls.push(["deleteRow", ss, tab, rowNumber]);
      book[ss][tab].splice(rowNumber - 1, 1);
    }
  };
}
function makeBook() {
  return {
    MASTER: {
      Inbox: [
        ["Photo ID", "Drive File ID", "Name", "Status"],
        ["p1", "d1", "a.jpg", "UNFILED"],
        ["p2", "d2", "b.jpg", "UNFILED"]
      ]
    }
  };
}

(async function () {

  console.log("helpers");
  ok(S.colLetter(0) === "A" && S.colLetter(25) === "Z" && S.colLetter(26) === "AA", "colLetter");
  {
    const o = S.valuesToObjects([["Id", "Name"], ["1", "x"]]);
    ok(o.header.length === 2 && o.rows[0].Id === "1" && o.rows[0]._rowNumber === 2, "valuesToObjects");
  }

  console.log("contract: no clear/rewrite helpers exist (§0.4)");
  {
    const sheets = S.create({ gateway: fakeGateway(makeBook()) });
    ok(sheets.clearTab === undefined && sheets.batchClear === undefined && sheets.rewriteTab === undefined,
       "no clearTab / batchClear / rewriteTab on the API");
  }

  console.log("readTab");
  {
    const sheets = S.create({ gateway: fakeGateway(makeBook()) });
    const t = await sheets.readTab("MASTER", "Inbox");
    ok(t.rows.length === 2 && t.rows[1]["Drive File ID"] === "d2", "reads rows as objects");
  }

  console.log("readTab through nd-cache (SWR)");
  {
    const book = makeBook();
    const gw = fakeGateway(book);
    const cache = Ck.createCache(Ck.memoryAdapter(), { now: () => 1 });
    const sheets = S.create({ gateway: gw, cache });
    const t1 = await sheets.readTab("MASTER", "Inbox");
    const getsAfterFirst = gw.calls.filter(c => c[0] === "get").length;
    const t2 = await sheets.readTab("MASTER", "Inbox");   // fresh -> cache hit
    ok(t1.rows.length === 2 && t2.rows.length === 2, "both reads resolve");
    ok(gw.calls.filter(c => c[0] === "get").length === getsAfterFirst, "second read served from cache");
  }

  console.log("upsertRowById: existing row updated in place");
  {
    const book = makeBook();
    const sheets = S.create({ gateway: fakeGateway(book) });
    await sheets.upsertRowById("MASTER", "Inbox", "Photo ID", { "Photo ID": "p2", "Drive File ID": "d2", "Name": "b.jpg", "Status": "FILED_TO_NODE" });
    ok(book.MASTER.Inbox.length === 3, "row count unchanged (no append)");
    ok(book.MASTER.Inbox[2][3] === "FILED_TO_NODE", "correct row updated");
    ok(book.MASTER.Inbox[1][3] === "UNFILED", "other rows untouched");
  }

  console.log("upsertRowById: new id appends");
  {
    const book = makeBook();
    const sheets = S.create({ gateway: fakeGateway(book) });
    await sheets.upsertRowById("MASTER", "Inbox", "Photo ID", { "Photo ID": "p9", "Name": "new.jpg", "Status": "UPLOADED" });
    ok(book.MASTER.Inbox.length === 4, "appended");
    ok(book.MASTER.Inbox[3][0] === "p9" && book.MASTER.Inbox[3][1] === "", "aligned to header, missing fields blank");
  }

  console.log("upsert without id rejects");
  {
    const sheets = S.create({ gateway: fakeGateway(makeBook()) });
    let rejected = false;
    await sheets.upsertRowById("MASTER", "Inbox", "Photo ID", { Name: "x" }).catch(() => { rejected = true; });
    ok(rejected, "missing id -> reject (no keyless writes)");
  }

  console.log("appendRows");
  {
    const book = makeBook();
    const sheets = S.create({ gateway: fakeGateway(book) });
    await sheets.appendRows("MASTER", "Inbox", [{ "Photo ID": "p3" }, { "Photo ID": "p4" }]);
    ok(book.MASTER.Inbox.length === 5, "two rows appended");
  }

  console.log("deleteRowById");
  {
    const book = makeBook();
    const sheets = S.create({ gateway: fakeGateway(book) });
    await sheets.deleteRowById("MASTER", "Inbox", "Photo ID", "p1");
    ok(book.MASTER.Inbox.length === 2 && book.MASTER.Inbox[1][0] === "p2", "right row removed");
    await sheets.deleteRowById("MASTER", "Inbox", "Photo ID", "pX");
    ok(book.MASTER.Inbox.length === 2, "deleting a missing id is a no-op (idempotent)");
  }

  console.log("writes route through nd-queue (offline-safe)");
  {
    const book = makeBook();
    const gw = fakeGateway(book);
    // fake queue env: offline first
    let online = false;
    let onlineCb = null;
    const store = {};
    const timers = [];
    const q = Qk.createQueue({ name: "sheets-test", deps: {
      storage: { get: k => store[k] || null, set: (k, v) => { store[k] = v; } },
      now: () => 1, setTimer: (fn) => { timers.push(fn); return timers.length - 1; }, clearTimer: () => {},
      setLoop: () => 0, isOnline: () => online, onOnline: cb => { onlineCb = cb; }, onOffline: () => {}
    } });
    const sheets = S.create({ gateway: gw, queue: q });
    await sheets.upsertRowById("MASTER", "Inbox", "Photo ID", { "Photo ID": "p2", "Status": "FILED_TO_PROJECT" });
    ok(q.size() === 1 && gw.calls.length === 0, "offline: write queued, API untouched");
    online = true; onlineCb();
    await tick(); await tick(); await tick(); await tick();
    ok(q.size() === 0, "queue drained when back online");
    ok(book.MASTER.Inbox[2][3] === "FILED_TO_PROJECT", "queued upsert landed");
  }

  console.log("queued delete supersedes queued upsert for same record");
  {
    const book = makeBook();
    const gw = fakeGateway(book);
    let online = false; let onlineCb = null;
    const store = {};
    const q = Qk.createQueue({ name: "sheets-test2", deps: {
      storage: { get: k => store[k] || null, set: (k, v) => { store[k] = v; } },
      now: () => 1, setTimer: fn => 0, clearTimer: () => {}, setLoop: () => 0,
      isOnline: () => online, onOnline: cb => { onlineCb = cb; }, onOffline: () => {}
    } });
    const sheets = S.create({ gateway: gw, queue: q });
    await sheets.upsertRowById("MASTER", "Inbox", "Photo ID", { "Photo ID": "p1", "Status": "FILED_TO_NODE" });
    await sheets.deleteRowById("MASTER", "Inbox", "Photo ID", "p1");
    ok(q.size() === 1 && q.pending()[0].payload.op === "delete", "upsert superseded by delete while offline");
    online = true; onlineCb();
    await tick(); await tick(); await tick(); await tick();
    ok(book.MASTER.Inbox.length === 2 && book.MASTER.Inbox.every(r => r[0] !== "p1"), "record deleted, never resurrected");
  }

  console.log("\n" + pass + " passed, " + fail + " failed");
  process.exit(fail ? 1 : 0);
})();
