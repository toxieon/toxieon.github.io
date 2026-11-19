"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const Demo = require("./demo.js");

test("demo only on localhost with ?demo=1", () => {
  assert.equal(Demo.isDemoMode("localhost", "?demo=1"), true);
  assert.equal(Demo.isDemoMode("127.0.0.1", "?demo=1"), true);
  assert.equal(Demo.isDemoMode("localhost", ""), false);
  assert.equal(Demo.isDemoMode("localhost", "?demo=0"), false);
  assert.equal(Demo.isDemoMode("www.neilldata.com", "?demo=1"), false);
  assert.equal(Demo.isDemoMode("neilldata.com", "?demo=1"), false);
  assert.equal(Demo.isDemoMode("localhost.evil.example", "?demo=1"), false);
});

const T0 = Date.UTC(2026, 10, 19, 1, 0, 0);
const FAKE = /^(Demo|Fake|Sample|Test|Mock|Pretend|Placeholder|Stub)\b/;

test("every demo horse, meeting and trainer is obviously fake", () => {
  for (const n of Demo.CATALOG.concat(Demo.HORSES)) assert.match(n, FAKE, n);
  for (const m of Demo.MEETINGS) assert.match(m, /^(Demo|Sample|Fake)/, m);
  const b = Demo.createBackend(T0);
  const book = b.request("GET", "/api/owner/blackbook?sort=nextJump").data;
  for (const e of book.entries) {
    assert.match(e.horse_name, FAKE);
    assert.match(String(e.sire), /^Sample/);
    assert.match(String(e.next ? e.next.meeting : "Demo"), /^(Demo|Sample|Fake)/);
  }
  const card = b.request("GET", "/api/owner/blackbook/race-card?event_id=demo-race-1").data;
  for (const r of card.runners) { assert.match(r.horseName, FAKE); assert.match(r.trainerName, /^Fake/); }
});

test("the fake backend serves the list, filters, upcoming and archived", () => {
  const b = Demo.createBackend(T0);
  const all = b.request("GET", "/api/owner/blackbook?sort=nextJump").data;
  assert.equal(all.ok, true);
  assert.equal(all.counts.horses, 5);
  assert.equal(all.archived_count, 1);
  const high = b.request("GET", "/api/owner/blackbook?priority=high&sort=priority").data;
  assert.ok(high.entries.length > 0 && high.entries.every((e) => e.priority === "high"));
  assert.deepEqual(b.request("GET", "/api/owner/blackbook?filter=firming&sort=nextJump").data.entries, []);
  assert.equal(b.request("GET", "/api/owner/blackbook?filter=archived&sort=nextJump").data.entries.length, 1);
  const up = b.request("GET", "/api/owner/blackbook/upcoming").data;
  assert.ok(up.entries.length >= 3 && up.noUpcoming.length >= 1);
  assert.equal(b.request("GET", "/api/owner/blackbook/archived").data.entries.length, 1);
});

test("add, edit, restore and remove work on the in-memory copy only", () => {
  const b = Demo.createBackend(T0);
  const added = b.request("POST", "/api/owner/blackbook/entries", { priority: "high", query: "Stub Stallion", note: "n", betPrice: 5.5 }).data;
  assert.equal(added.entry.horse_name, "Stub Stallion");
  const id = added.entry.id;
  const patched = b.request("PATCH", "/api/owner/blackbook/entries/" + id, { priority: "low", note: "changed", betPrice: 6 }).data.entry;
  assert.deepEqual([patched.priority, patched.note, patched.bet_price], ["low", "changed", 6]);
  assert.equal(b.request("GET", "/api/owner/blackbook/entries/" + id).data.entry.note, "changed");
  assert.equal(b.request("DELETE", "/api/owner/blackbook/entries/" + id).status, 200);
  assert.equal(b.request("GET", "/api/owner/blackbook/entries/" + id).status, 404);
  assert.equal(b.request("POST", "/api/owner/blackbook/entries/5/restore", {}).data.entry.archived_at, null);
});

test("search needs 3 letters and marks horses already held", () => {
  const b = Demo.createBackend(T0);
  assert.equal(b.request("GET", "/api/owner/blackbook/search?q=ab").data.code, "short");
  const hits = b.request("GET", "/api/owner/blackbook/search?q=demo").data.hits;
  assert.ok(hits.length >= 1 && hits.some((h) => h.inBlackBook));
});

test("unknown routes look like the not-the-owner 404", () => {
  const r = Demo.createBackend(T0).request("GET", "/api/owner/other");
  assert.deepEqual([r.status, r.data.error, r.auth], [404, "not_found", "denied"]);
});
