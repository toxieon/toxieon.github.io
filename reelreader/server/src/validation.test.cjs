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
