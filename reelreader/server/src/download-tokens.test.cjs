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

test("TTL sweep removes undownloaded files without any further requests", async () => {
  const fs = require("node:fs");
  const os = require("node:os");
  const path = require("node:path");
  const { createDownloadTokenStore } = require("./download-tokens.cjs");
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "reel-reader-sweep-"));
  const file = path.join(dir, "v.mp4");
  fs.writeFileSync(file, "x");
  const store = createDownloadTokenStore({ ttlMs: 20, sweepMs: 10 });
  const token = store.issue(file, dir);
  assert.ok(Buffer.from(token, "base64url").length >= 16, "at least 128 bits");
  await new Promise((r) => setTimeout(r, 120));
  assert.equal(fs.existsSync(dir), false);
  assert.equal(store._entries.size, 0);
  store.close();
});
