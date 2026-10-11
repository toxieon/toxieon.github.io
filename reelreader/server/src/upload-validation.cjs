"use strict";

const { HttpError } = require("./errors.cjs");

const ALLOWED_VIDEO_MIMES = new Set([
  "video/mp4",
  "video/quicktime",
  "video/webm",
  "video/x-matroska",
  "video/3gpp",
  "video/3gpp2",
  "video/mpeg",
  "video/x-msvideo",
  "video/ogg"
]);

function normalizeMime(value) {
  if (!value) return "";
  const base = String(value).split(";")[0].trim().toLowerCase();
  return base;
}

function isAllowedVideoMime(mimeType) {
  const mime = normalizeMime(mimeType);
  if (!mime) return false;
  if (ALLOWED_VIDEO_MIMES.has(mime)) return true;
  return mime.startsWith("video/");
}

function assertAllowedVideoMime(mimeType) {
  if (!isAllowedVideoMime(mimeType)) {
    throw new HttpError(415, "unsupported_type", "Only video files are supported. Choose a clip from Photos or Files.");
  }
}

function extensionForMime(mimeType) {
  const mime = normalizeMime(mimeType);
  const map = {
    "video/mp4": ".mp4",
    "video/quicktime": ".mov",
    "video/webm": ".webm",
    "video/x-matroska": ".mkv",
    "video/3gpp": ".3gp",
    "video/3gpp2": ".3g2",
    "video/mpeg": ".mpeg",
    "video/x-msvideo": ".avi",
    "video/ogg": ".ogv"
  };
  return map[mime] || ".bin";
}

module.exports = {
  ALLOWED_VIDEO_MIMES,
  normalizeMime,
  isAllowedVideoMime,
  assertAllowedVideoMime,
  extensionForMime
};
