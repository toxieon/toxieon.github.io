"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { mkdtempSync } = require("node:fs");
const os = require("node:os");
const { pipeline } = require("node:stream/promises");
const Busboy = require("busboy");
const { HttpError } = require("./errors.cjs");
const { assertAllowedVideoMime, extensionForMime } = require("./upload-validation.cjs");

/**
 * Streams multipart field "video" to a temp file. Does not buffer the whole body in memory.
 * @returns {Promise<{ tempDir: string, filePath: string, mimeType: string, size: number }>}
 */
function receiveVideoUpload(req, limits) {
  const maxBytes = limits.maxBytes;
  const contentType = String(req.headers["content-type"] || "");
  if (!contentType.toLowerCase().includes("multipart/form-data")) {
    return Promise.reject(new HttpError(400, "invalid_request", "Upload must use multipart/form-data with a video field."));
  }

  return new Promise((resolve, reject) => {
    let settled = false;
    async function fail(error) {
      if (settled) return;
      settled = true;
      // Stop writing to disk; drain (and discard) the rest of the request body.
      try { req.unpipe(bb); req.resume(); } catch (e) { /* ignore */ }
      if (tempDir) await fs.promises.rm(tempDir, { recursive: true, force: true }).catch(() => {});
      reject(error);
    }
    function done(result) {
      if (settled) return;
      settled = true;
      resolve(result);
    }

    const bb = Busboy({
      headers: req.headers,
      limits: { files: 1, fields: 4, fileSize: maxBytes }
    });

    let tempDir = "";
    let filePath = "";
    let mimeType = "";
    let sawVideo = false;
    let writePromise = null;

    bb.on("file", (fieldname, fileStream, info) => {
      if (fieldname !== "video") {
        fileStream.resume();
        return;
      }
      if (sawVideo) {
        fileStream.resume();
        fail(new HttpError(400, "invalid_request", "Send one video file in the video field."));
        return;
      }
      sawVideo = true;
      mimeType = info.mimeType || "";
      try {
        assertAllowedVideoMime(mimeType);
      } catch (error) {
        fileStream.resume();
        fail(error);
        return;
      }

      tempDir = mkdtempSync(path.join(os.tmpdir(), "reel-reader-upload-"));
      const ext = extensionForMime(mimeType);
      filePath = path.join(tempDir, "upload" + ext);
      const out = fs.createWriteStream(filePath);

      fileStream.on("limit", () => {
        fail(new HttpError(413, "file_too_large", "Video is too large. The upload limit is " + formatSize(maxBytes) + ". Trim it or pick a shorter clip."));
      });

      writePromise = pipeline(fileStream, out).catch((error) => {
        if (error && error.code === "LIMIT_FILE_SIZE") {
          fail(new HttpError(413, "file_too_large", "Video is too large. The upload limit is " + formatSize(maxBytes) + ". Trim it or pick a shorter clip."));
        } else {
          fail(error instanceof HttpError ? error : new HttpError(400, "invalid_request", "Upload was interrupted."));
        }
      });
    });

    bb.on("error", (error) => {
      fail(error instanceof HttpError ? error : new HttpError(400, "invalid_request", "Could not read upload."));
    });

    bb.on("finish", async () => {
      try {
        if (!sawVideo) {
          throw new HttpError(400, "invalid_request", "Missing video file. Use form field name video.");
        }
        if (writePromise) await writePromise;
        const stat = await fs.promises.stat(filePath).catch(() => null);
        if (!stat || !stat.size) {
          throw new HttpError(400, "invalid_request", "Uploaded video file is empty.");
        }
        if (stat.size > maxBytes) {
          throw new HttpError(413, "file_too_large", "Video is too large. The upload limit is " + formatSize(maxBytes) + ". Trim it or pick a shorter clip.");
        }
        done({ tempDir, filePath, mimeType, size: stat.size });
      } catch (error) {
        if (tempDir) await fs.promises.rm(tempDir, { recursive: true, force: true }).catch(() => {});
        fail(error instanceof HttpError ? error : new HttpError(400, "invalid_request", "Upload failed."));
      }
    });

    req.pipe(bb);
  });
}

function formatSize(bytes) {
  const mb = bytes / (1024 * 1024);
  return mb.toFixed(mb >= 10 ? 0 : 1) + " MB";
}

module.exports = { receiveVideoUpload };
