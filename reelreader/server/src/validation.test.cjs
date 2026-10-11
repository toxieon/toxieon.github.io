"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { validateBody, normalizeSourceUrl } = require("./validation.cjs");
const { HttpError } = require("./errors.cjs");

test("normalizeSourceUrl accepts Instagram/TikTok/YouTube URLs", () => {
  assert.ok(normalizeSourceUrl("https://www.instagram.com/reel/abc/").startsWith("https://www.instagram.com/reel/abc/"));
  assert.ok(normalizeSourceUrl("https://tiktok.com/@acct/video/123").startsWith("https://tiktok.com/@acct/video/123"));
  assert.ok(normalizeSourceUrl("https://youtu.be/abcd1234").startsWith("https://youtu.be/abcd1234"));
});

test("validateBody rejects missing payload and wrong hosts", () => {
  assert.throws(() => validateBody(null), HttpError);
  assert.throws(() => validateBody({ url: "notaurl" }), HttpError);
  assert.throws(() => validateBody({ url: "https://vimeo.com/22" }), HttpError);
});

test("validateBody returns normalized URL", () => {
  const out = validateBody({ url: " https://www.youtube.com/watch?v=abc " });
  assert.equal(out.url, "https://www.youtube.com/watch?v=abc");
});

test("rejects look-alike hosts, credentials, ports and non-http schemes", () => {
  for (const bad of [
    "https://youtube.com.evil.example/watch?v=x",
    "https://evil.example/?u=https://www.youtube.com/",
    "https://user:pw@www.youtube.com/watch?v=x",
    "https://www.youtube.com:8443/watch?v=x",
    "file:///etc/passwd",
    "--exec=id",
  ]) assert.throws(() => normalizeSourceUrl(bad), bad);
  assert.ok(normalizeSourceUrl("https://www.youtube.com/watch?v=x;id").startsWith("https://www.youtube.com/"));
});

test("API key compare is constant-time and exact", () => {
  const { keysMatch, ALLOWED_ORIGIN } = require("./server.cjs");
  assert.equal(keysMatch("abc", "abc"), true);
  assert.equal(keysMatch("abd", "abc"), false);
  assert.equal(keysMatch("abc", "abcd"), false);
  assert.equal(keysMatch("", "abc"), false);
  assert.equal(keysMatch("abc", ""), false);
  assert.equal(ALLOWED_ORIGIN, "https://www.neilldata.com");
});
