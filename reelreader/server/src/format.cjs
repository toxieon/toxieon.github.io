"use strict";

// Human-readable megabytes for user-facing size-limit messages.
// Shared by media-tools.cjs and multipart-upload.cjs.
function formatSize(bytes) {
  const mb = bytes / (1024 * 1024);
  return mb.toFixed(mb >= 10 ? 0 : 1) + " MB";
}

module.exports = { formatSize };
