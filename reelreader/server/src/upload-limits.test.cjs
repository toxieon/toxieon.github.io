"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { PassThrough } = require("node:stream");
const { receiveVideoUpload } = require("./multipart-upload.cjs");
const { waitForActive } = require("./gemini-client.cjs");
const { UPLOAD_MAX_BYTES } = require("./server.cjs");

function fakeReq(parts, boundary = "XBOUNDARY") {
  const req = new PassThrough();
  req.headers = { "content-type": "multipart/form-data; boundary=" + boundary };
  (async () => {
    for (const p of parts) { if (!req.write(p)) await new Promise((r) => req.once("drain", r)); }
    req.end();
  })();
  return req;
}
const head = (name, filename, type) =>
  "--XBOUNDARY\r\nContent-Disposition: form-data; name=\"" + name + "\"; filename=\"" + filename + "\"\r\nContent-Type: " + type + "\r\n\r\n";
const tail = "\r\n--XBOUNDARY--\r\n";
const tmpDirs = () => fs.readdirSync(os.tmpdir()).filter((d) => d.startsWith("reel-reader-upload-"));

test("upload cap is 100 MB", () => assert.equal(UPLOAD_MAX_BYTES, 100 * 1024 * 1024));

test("size limit is enforced while streaming, and the temp dir is removed", async () => {
  const before = tmpDirs().length;
  const chunk = Buffer.alloc(64 * 1024, 1);
  const parts = [head("video", "a.mp4", "video/mp4")];
  for (let i = 0; i < 64; i++) parts.push(chunk); // 4 MB sent against a 1 MB cap
  parts.push(tail);
  await assert.rejects(receiveVideoUpload(fakeReq(parts), { maxBytes: 1024 * 1024 }),
    (e) => e.status === 413 && /upload limit is 1\.0 MB/.test(e.message));
  await new Promise((r) => setTimeout(r, 50));
  assert.equal(tmpDirs().length, before);
});

test("filename cannot choose the path; non-video is refused", async () => {
  const ok = await receiveVideoUpload(fakeReq([head("video", "../../etc/passwd", "video/mp4"), "abc", tail]), { maxBytes: 1024 });
  assert.equal(path.basename(ok.filePath), "upload.mp4");
  assert.ok(ok.filePath.startsWith(os.tmpdir()));
  fs.rmSync(ok.tempDir, { recursive: true, force: true });
  await assert.rejects(receiveVideoUpload(fakeReq([head("video", "x.sh", "text/plain"), "abc", tail]), { maxBytes: 1024 }), (e) => e.status === 415);
});

test("waits for the Gemini file to become ACTIVE; FAILED is an error", async () => {
  const states = ["PROCESSING", "PROCESSING", "ACTIVE"];
  const ai = { files: { get: async ({ name }) => ({ name, state: states.shift() }) } };
  const f = await waitForActive(ai, { name: "files/1", state: "PROCESSING" }, 5000, 1);
  assert.equal(f.state, "ACTIVE");
  const bad = { files: { get: async ({ name }) => ({ name, state: "FAILED" }) } };
  await assert.rejects(waitForActive(bad, { name: "files/2", state: "PROCESSING" }, 5000, 1), (e) => e.code === "model_failed");
});
