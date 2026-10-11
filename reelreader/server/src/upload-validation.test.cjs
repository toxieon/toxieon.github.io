"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { isAllowedVideoMime, assertAllowedVideoMime, extensionForMime } = require("./upload-validation.cjs");
const { HttpError } = require("./errors.cjs");

test("isAllowedVideoMime accepts common mobile video types", () => {
  assert.equal(isAllowedVideoMime("video/mp4"), true);
  assert.equal(isAllowedVideoMime("video/quicktime"), true);
  assert.equal(isAllowedVideoMime("video/webm; codecs=vp9"), true);
});

test("assertAllowedVideoMime rejects non-video types", () => {
  assert.throws(() => assertAllowedVideoMime("image/jpeg"), (error) => error instanceof HttpError && error.code === "unsupported_type");
  assert.throws(() => assertAllowedVideoMime("application/pdf"), (error) => error.code === "unsupported_type");
});

test("extensionForMime maps quicktime to .mov", () => {
  assert.equal(extensionForMime("video/quicktime"), ".mov");
});
