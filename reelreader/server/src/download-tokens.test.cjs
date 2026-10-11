"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { createDownloadTokenStore, TOKEN_PATTERN } = require("./download-tokens.cjs");
const { HttpError } = require("./errors.cjs");

test("download token can be redeemed once then expires from store", async () => {
  const store = createDownloadTokenStore({ ttlMs: 60000 });
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "reel-dl-"));
  const filePath = path.join(tempDir, "clip.mp4");
  fs.writeFileSync(filePath, "fake-video");

  const token = store.issue(filePath, tempDir);
  assert.match(token, TOKEN_PATTERN);

  const entry = store.redeem(token);
  assert.equal(entry.filePath, path.resolve(filePath));

  assert.throws(
    () => store.redeem(token),
    (error) => error instanceof HttpError && error.code === "download_not_found"
  );

  await fs.promises.rm(tempDir, { recursive: true, force: true });
});

test("download token rejects path traversal tokens", () => {
  const store = createDownloadTokenStore();
  assert.throws(
    () => store.redeem("../etc/passwd"),
    (error) => error instanceof HttpError && error.code === "download_not_found"
  );
});
