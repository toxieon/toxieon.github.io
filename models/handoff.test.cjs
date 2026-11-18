"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const H = require("./handoff.js");

const TOKEN = "a".repeat(32);

function mock() {
  const storage = { data: {}, setItem(k, v) { this.data[k] = v; } };
  const hist = { calls: [], replaceState(_a, _b, url) { this.calls.push(url); } };
  return { storage, hist };
}

test("valid token in fragment is stored and fragment stripped", () => {
  const { storage, hist } = mock();
  const enc = encodeURIComponent(TOKEN);
  const loc = { hash: "#t=" + enc, pathname: "/models/", search: "?demo=1" };
  const r = H.consumeTokenFragment(loc, storage, hist);
  assert.equal(r.stored, true);
  assert.equal(r.stripped, true);
  assert.equal(storage.data[H.TOKEN_KEY], TOKEN);
  assert.deepEqual(hist.calls, ["/models/?demo=1"]);
});

test("fragment token overwrites existing stored token", () => {
  const { storage, hist } = mock();
  storage.data[H.TOKEN_KEY] = "old-token-old-token";
  const next = "b".repeat(20);
  const loc = { hash: "#t=" + encodeURIComponent(next), pathname: "/models/", search: "" };
  H.consumeTokenFragment(loc, storage, hist);
  assert.equal(storage.data[H.TOKEN_KEY], next);
});

test("empty or garbage token is ignored but fragment still stripped", () => {
  const { storage, hist } = mock();
  storage.data[H.TOKEN_KEY] = "keep-me-keep-me-keep";
  const loc = { hash: "#t=short", pathname: "/models/", search: "" };
  const r = H.consumeTokenFragment(loc, storage, hist);
  assert.equal(r.stored, false);
  assert.equal(r.stripped, true);
  assert.equal(storage.data[H.TOKEN_KEY], "keep-me-keep-me-keep");
  assert.equal(hist.calls.length, 1);
});

test("no hash is a no-op", () => {
  const { storage, hist } = mock();
  const r = H.consumeTokenFragment({ hash: "", pathname: "/models/", search: "" }, storage, hist);
  assert.deepEqual(r, { stored: false, stripped: false });
  assert.equal(hist.calls.length, 0);
});