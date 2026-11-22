"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const H = require("./handoff.js");

const TOKEN = "a".repeat(32);

test("handoff stores under the Models key, not Black Book's", () => {
  assert.equal(H.TOKEN_KEY, "nd_models_owner_token");
});
function mock() {
  const storage = { data: {}, setItem(k, v) { this.data[k] = v; } };
  const hist = { calls: [], replaceState(_a, _b, url) { this.calls.push(url); } };
  return { storage, hist };
}

test("a valid #t= token is stored under nd_models_owner_token and the fragment is stripped", () => {
  const { storage, hist } = mock();
  const r = H.consumeTokenFragment({ hash: "#t=" + encodeURIComponent(TOKEN), pathname: "/models/", search: "?demo=1" }, storage, hist);
  assert.deepEqual(r, { stored: true, stripped: true });
  assert.equal(storage.data.nd_models_owner_token, TOKEN);
  assert.deepEqual(hist.calls, ["/models/?demo=1"]);
  assert.equal(H.getAuthError(), "");
});

test("a valid #token= fragment from TipBot OAuth is stored the same way", () => {
  const { storage, hist } = mock();
  const r = H.consumeTokenFragment({ hash: "#token=" + encodeURIComponent(TOKEN), pathname: "/models/", search: "" }, storage, hist);
  assert.deepEqual(r, { stored: true, stripped: true });
  assert.equal(storage.data.nd_models_owner_token, TOKEN);
  assert.deepEqual(hist.calls, ["/models/"]);
});

test("the token is decoded exactly once: + stays +, %2B becomes +, %25 becomes %", () => {
  assert.equal(H.readHashToken("#t=" + encodeURIComponent("ab+cd/ef=gh%ij" + "k".repeat(10))).token, "ab+cd/ef=gh%ij" + "k".repeat(10));
  assert.equal(H.readHashToken("#t=a+b").token, "a+b");
  assert.equal(H.readHashToken("#t=a%2Bb").token, "a+b");
  assert.equal(H.readHashToken("#token=" + encodeURIComponent("ab+cd/ef=gh%ij" + "k".repeat(10))).token, "ab+cd/ef=gh%ij" + "k".repeat(10));
  assert.equal(H.readHashToken("#token=a+b").token, "a+b");
});

test("a short or whitespace token is not stored but the fragment is still stripped", () => {
  for (const bad of ["short", "has space in it 1234567890", ""]) {
    const { storage, hist } = mock();
    const r = H.consumeTokenFragment({ hash: "#t=" + encodeURIComponent(bad), pathname: "/models/", search: "" }, storage, hist);
    assert.deepEqual(r, { stored: false, stripped: true });
    assert.deepEqual(storage.data, {});
    assert.deepEqual(hist.calls, ["/models/"]);
  }
  const { storage, hist } = mock();
  const r = H.consumeTokenFragment({ hash: "#token=short", pathname: "/models/", search: "" }, storage, hist);
  assert.deepEqual(r, { stored: false, stripped: true });
  assert.deepEqual(storage.data, {});
});

test("a bad percent escape stores nothing", () => {
  const { storage, hist } = mock();
  const r = H.consumeTokenFragment({ hash: "#t=%E0%A4%A", pathname: "/models/", search: "" }, storage, hist);
  assert.equal(r.stored, false);
  assert.equal(r.stripped, true);
});

test("other fragments (deep links) are left alone", () => {
  const { storage, hist } = mock();
  for (const hash of ["", "#/day/2026-11-12", "#/x", "#other=1"]) {
    assert.deepEqual(H.consumeTokenFragment({ hash, pathname: "/models/", search: "" }, storage, hist), { stored: false, stripped: false });
  }
  assert.deepEqual(hist.calls, []);
});

test("t= is found after another fragment parameter", () => {
  assert.equal(H.readHashToken("#x=1&t=" + TOKEN).token, TOKEN);
});

test("#token= is not misread as #t=, and #t= wins when both are present", () => {
  assert.equal(H.readHashToken("#token=" + TOKEN).token, TOKEN);
  assert.equal(H.readHashToken("#token=" + TOKEN).hadT, true);
  const tFirst = "b".repeat(32);
  assert.equal(H.readHashToken("#t=" + tFirst + "&token=" + TOKEN).token, tFirst);
  assert.equal(H.readHashToken("#token=" + TOKEN + "&t=" + tFirst).token, tFirst);
});

test("an OAuth #error= fragment is stripped, stores nothing, and is exposed as getAuthError", () => {
  const { storage, hist } = mock();
  const r = H.consumeTokenFragment({ hash: "#error=login_failed", pathname: "/models/", search: "" }, storage, hist);
  assert.deepEqual(r, { stored: false, stripped: true });
  assert.deepEqual(storage.data, {});
  assert.deepEqual(hist.calls, ["/models/"]);
  assert.equal(H.getAuthError(), "login_failed");
  // a later call with no auth hash clears it
  H.consumeTokenFragment({ hash: "", pathname: "/models/", search: "" }, storage, hist);
  assert.equal(H.getAuthError(), "");
});

const CODE = "c".repeat(24);

test("#code= is not a session token: it is taken once, the hash is stripped, nothing is stored", () => {
  const { storage, hist } = mock();
  const r = H.consumeTokenFragment({ hash: "#code=" + encodeURIComponent(CODE), pathname: "/models/", search: "" }, storage, hist);
  assert.deepEqual(r, { stored: false, stripped: true });
  assert.deepEqual(storage.data, {});
  assert.deepEqual(hist.calls, ["/models/"]);
  assert.equal(H.readHashToken("#code=" + CODE).hadT, false);
  assert.equal(H.takePendingCode(), CODE);
  assert.equal(H.takePendingCode(), "");
});

test("#code= is decoded exactly once, same as tokens", () => {
  const { storage, hist } = mock();
  H.consumeTokenFragment({ hash: "#code=" + encodeURIComponent("ab+cd/ef=gh%ij" + "k".repeat(10)), pathname: "/models/", search: "" }, storage, hist);
  assert.equal(H.takePendingCode(), "ab+cd/ef=gh%ij" + "k".repeat(10));
});

test("#t= and #token= are stored as session tokens and are not taken as an exchange code", () => {
  for (const hash of ["#t=" + encodeURIComponent(TOKEN), "#token=" + encodeURIComponent(TOKEN), "#t=" + encodeURIComponent(TOKEN) + "&code=" + CODE]) {
    const { storage, hist } = mock();
    const r = H.consumeTokenFragment({ hash, pathname: "/models/", search: "" }, storage, hist);
    assert.equal(r.stored, true);
    assert.equal(r.stripped, true);
    assert.equal(storage.data.nd_models_owner_token, TOKEN);
    assert.equal(H.takePendingCode(), "");
  }
});

test("#signup= is stripped, stores nothing, and is not treated as a token or exchange code", () => {
  const { storage, hist } = mock();
  const r = H.consumeTokenFragment({ hash: "#signup=" + "s".repeat(24), pathname: "/models/", search: "" }, storage, hist);
  assert.deepEqual(r, { stored: false, stripped: true });
  assert.deepEqual(storage.data, {});
  assert.deepEqual(hist.calls, ["/models/"]);
  assert.equal(H.takePendingCode(), "");
  assert.equal(H.getAuthError(), "");
  assert.equal(H.readHashToken("#signup=" + "s".repeat(24)).hadT, false);
});

test("a whitespace or empty #code= is stripped, stores nothing, and is reported as a failed sign-in", () => {
  for (const hash of ["#code=", "#code=bad code with spaces", "#code=%E0%A4%A"]) {
    const { storage, hist } = mock();
    const r = H.consumeTokenFragment({ hash, pathname: "/models/", search: "" }, storage, hist);
    assert.deepEqual(r, { stored: false, stripped: true });
    assert.deepEqual(storage.data, {});
    assert.equal(H.takePendingCode(), "");
    assert.equal(H.getAuthError(), "login_failed");
  }
});

test("a #t= handoff overwrites an older stored Models token", () => {
  const { storage, hist } = mock();
  storage.data.nd_models_owner_token = "old-token-old-token";
  H.consumeTokenFragment({ hash: "#t=" + "b".repeat(20), pathname: "/models/", search: "" }, storage, hist);
  assert.equal(storage.data.nd_models_owner_token, "b".repeat(20));
});

test("a short #t= keeps the existing stored token", () => {
  const { storage, hist } = mock();
  storage.data.nd_models_owner_token = "keep-me-keep-me-keep";
  H.consumeTokenFragment({ hash: "#t=short", pathname: "/models/", search: "" }, storage, hist);
  assert.equal(storage.data.nd_models_owner_token, "keep-me-keep-me-keep");
  assert.equal(hist.calls.length, 1);
});
