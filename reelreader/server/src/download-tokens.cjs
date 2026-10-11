"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { HttpError } = require("./errors.cjs");
const { cleanupTemp } = require("./media-tools.cjs");

const TOKEN_TTL_MS = 10 * 60 * 1000;
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{32,128}$/;

function createDownloadTokenStore(opts = {}) {
  const ttlMs = opts.ttlMs || TOKEN_TTL_MS;
  const entries = new Map();

  function purgeExpired() {
    const now = Date.now();
    for (const [key, entry] of entries) {
      if (entry.expiresAt <= now) revokeEntry(key, entry);
    }
  }

  function revokeEntry(key, entry) {
    entries.delete(key);
    if (entry && entry.tempDir) cleanupTemp(entry.tempDir).catch(() => {});
  }

  function issue(filePath, tempDir) {
    purgeExpired();
    const token = crypto.randomBytes(32).toString("base64url");
    if (!TOKEN_PATTERN.test(token)) {
      throw new HttpError(500, "internal_error", "Could not create download token.");
    }
    const resolved = path.resolve(filePath);
    entries.set(token, {
      filePath: resolved,
      tempDir,
      expiresAt: Date.now() + ttlMs
    });
    return token;
  }

  function redeem(token) {
    if (!token || !TOKEN_PATTERN.test(token)) {
      throw new HttpError(404, "download_not_found", "Download link is invalid or expired.");
    }
    purgeExpired();
    const entry = entries.get(token);
    if (!entry) {
      throw new HttpError(404, "download_not_found", "Download link is invalid or expired.");
    }
    if (entry.expiresAt <= Date.now()) {
      revokeEntry(token, entry);
      throw new HttpError(404, "download_expired", "Download link expired. Run the link again to fetch a new copy.");
    }
    entries.delete(token);
    return entry;
  }

  // TTL sweep: files from link mode that are never downloaded are removed
  // within a minute of their token expiring, even with no further requests.
  const sweepMs = opts.sweepMs || 60 * 1000;
  const timer = setInterval(purgeExpired, sweepMs);
  if (timer.unref) timer.unref();

  function close() {
    clearInterval(timer);
    for (const [key, entry] of entries) revokeEntry(key, entry);
  }

  return { issue, redeem, purgeExpired, close, _entries: entries };
}

function streamDownloadFile(entry, res) {
  const filePath = entry.filePath;
  if (!filePath || !path.isAbsolute(filePath)) {
    throw new HttpError(500, "internal_error", "Download is not available.");
  }
  const base = path.resolve(entry.tempDir || path.dirname(filePath));
  const resolved = path.resolve(filePath);
  const relative = path.relative(base, resolved);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new HttpError(500, "internal_error", "Download is not available.");
  }
  if (!fs.existsSync(resolved)) {
    throw new HttpError(404, "download_not_found", "Download file is no longer available.");
  }

  res.writeHead(200, {
    "content-type": "video/mp4",
    "content-disposition": 'attachment; filename="reel-reader-video.mp4"'
  });
  const stream = fs.createReadStream(resolved);
  // Single use: the token is already gone, so always remove the file when the
  // response finishes or the client disconnects part-way.
  res.on("close", () => {
    stream.destroy();
    cleanupTemp(entry.tempDir).catch(() => {});
  });
  stream.on("error", () => {
    if (!res.headersSent) res.writeHead(500);
    res.end();
    cleanupTemp(entry.tempDir).catch(() => {});
  });
  stream.on("end", () => {
    cleanupTemp(entry.tempDir).catch(() => {});
  });
  stream.pipe(res);
}

module.exports = {
  TOKEN_TTL_MS,
  TOKEN_PATTERN,
  createDownloadTokenStore,
  streamDownloadFile
};
