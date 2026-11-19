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

test("a valid #t= token is stored under nd_owner_token and the fragment is stripped", () => {
  const { storage, hist } = mock();
  const r = H.consumeTokenFragment({ hash: "#t=" + encodeURIComponent(TOKEN), pathname: "/blackbook/", search: "?demo=1" }, storage, hist);
  assert.deepEqual(r, { stored: true, stripped: true });
  assert.equal(storage.data.nd_owner_token, TOKEN);
  assert.deepEqual(hist.calls, ["/blackbook/?demo=1"]);
});

test("the token is decoded exactly once: + stays +, %2B becomes +, %25 becomes %", () => {
  assert.equal(H.readHashToken("#t=" + encodeURIComponent("ab+cd/ef=gh%ij" + "k".repeat(10))).token, "ab+cd/ef=gh%ij" + "k".repeat(10));
  assert.equal(H.readHashToken("#t=a+b").token, "a+b");
  assert.equal(H.readHashToken("#t=a%2Bb").token, "a+b");
});

test("a short or whitespace token is not stored but the fragment is still stripped", () => {
  for (const bad of ["short", "has space in it 1234567890", ""]) {
    const { storage, hist } = mock();
    const r = H.consumeTokenFragment({ hash: "#t=" + encodeURIComponent(bad), pathname: "/blackbook/", search: "" }, storage, hist);
    assert.deepEqual(r, { stored: false, stripped: true });
    assert.deepEqual(storage.data, {});
    assert.deepEqual(hist.calls, ["/blackbook/"]);
  }
});

test("a bad percent escape stores nothing", () => {
  const { storage, hist } = mock();
  const r = H.consumeTokenFragment({ hash: "#t=%E0%A4%A", pathname: "/blackbook/", search: "" }, storage, hist);
  assert.equal(r.stored, false);
  assert.equal(r.stripped, true);
});

test("other fragments (deep links) are left alone", () => {
  const { storage, hist } = mock();
  for (const hash of ["", "#/upcoming", "#/horse/12", "#/add/race", "#other=1"]) {
    assert.deepEqual(H.consumeTokenFragment({ hash, pathname: "/blackbook/", search: "" }, storage, hist), { stored: false, stripped: false });
  }
  assert.deepEqual(hist.calls, []);
});

test("t= is found after another fragment parameter", () => {
  assert.equal(H.readHashToken("#x=1&t=" + TOKEN).token, TOKEN);
});
