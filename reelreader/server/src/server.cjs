"use strict";

const http = require("node:http");
const crypto = require("node:crypto");
const { createDownloadTokenStore, streamDownloadFile, TOKEN_PATTERN } = require("./download-tokens.cjs");

// CORS is locked to the production site; not configurable.
const ALLOWED_ORIGIN = "https://www.neilldata.com";
const { HttpError } = require("./errors.cjs");
const { validateBody } = require("./validation.cjs");
const { runReelReader, runReelReaderUpload, DEFAULT_LIMITS } = require("./service.cjs");
const { receiveVideoUpload } = require("./multipart-upload.cjs");
const { DEFAULT_GEMINI_MODEL } = require("./gemini-config.cjs");

const DOWNLOAD_PREFIX = "/api/reel-reader/download/";
const UPLOAD_MAX_BYTES = 100 * 1024 * 1024;

function createServer(config = {}) {
  const allowedOrigin = ALLOWED_ORIGIN;
  const apiKey = config.reelReaderKey || "";
  const geminiApiKey = config.geminiApiKey || "";
  const model = config.geminiModel || DEFAULT_GEMINI_MODEL;
  const endpointTimeoutMs = Number(config.endpointTimeoutMs || 180000);
  const limits = Object.assign({}, DEFAULT_LIMITS, config.limits || {});
  const downloadTokens = config.downloadTokens || createDownloadTokenStore();

  return http.createServer(async (req, res) => {
    try {
      setCors(req, res, allowedOrigin);
      if (req.method === "OPTIONS") {
        res.writeHead(204);
        res.end();
        return;
      }

      const pathOnly = String(req.url || "").split("?")[0];

      if (req.method === "GET" && pathOnly.startsWith(DOWNLOAD_PREFIX)) {
        assertApiKey(req, apiKey);
        const token = decodeURIComponent(pathOnly.slice(DOWNLOAD_PREFIX.length));
        if (!TOKEN_PATTERN.test(token)) {
          throw new HttpError(404, "download_not_found", "Download link is invalid or expired.");
        }
        const entry = downloadTokens.redeem(token);
        streamDownloadFile(entry, res);
        return;
      }

      if (req.method !== "POST") {
        sendJson(res, 404, { error: { code: "not_found", message: "Endpoint not found." } });
        return;
      }

      assertApiKey(req, apiKey);
      const geminiDeadlineMs = Date.now() + endpointTimeoutMs;

      if (pathOnly === "/api/reel-reader/upload") {
        const uploaded = await receiveVideoUpload(req, limits);
        const result = await withTimeout(
          runReelReaderUpload(uploaded, {
            geminiApiKey,
            model,
            limits,
            geminiDeadlineMs,
            deps: config.deps
          }),
          endpointTimeoutMs
        );
        sendJson(res, 200, result);
        return;
      }

      if (pathOnly === "/api/reel-reader") {
        const body = await readJsonBody(req, 32 * 1024);
        const request = validateBody(body);
        const result = await withTimeout(
          runReelReader(request.url, {
            geminiApiKey,
            model,
            igCookies: config.igCookies || "",
            limits,
            geminiDeadlineMs,
            downloadTokens,
            deps: config.deps
          }),
          endpointTimeoutMs
        );
        sendJson(res, 200, result);
        return;
      }

      sendJson(res, 404, { error: { code: "not_found", message: "Endpoint not found." } });
    } catch (error) {
      if (!(error instanceof HttpError)) console.error("[reel-reader] unexpected error: " + ((error && error.stack) || error));
      const status = error instanceof HttpError ? error.status : 500;
      const code = error instanceof HttpError ? error.code : "internal_error";
      const message = error instanceof HttpError ? error.message : "Unexpected server error.";
      if (!res.headersSent) sendJson(res, status, { error: { code, message } });
      else res.end();
    }
  });
}

function assertApiKey(req, apiKey) {
  const incomingKey = String(req.headers["x-reel-reader-key"] || "").trim();
  if (!apiKey) throw new HttpError(500, "missing_config", "REEL_READER_KEY is not configured.");
  if (!keysMatch(incomingKey, apiKey)) throw new HttpError(401, "unauthorized", "Invalid API key.");
}

// Constant-time compare: hash both sides to equal-length digests first.
function keysMatch(given, expected) {
  if (!given || !expected) return false;
  const a = crypto.createHash("sha256").update(given, "utf8").digest();
  const b = crypto.createHash("sha256").update(expected, "utf8").digest();
  return crypto.timingSafeEqual(a, b);
}

function setCors(req, res, allowedOrigin) {
  const origin = String(req.headers.origin || "");
  if (origin && origin === allowedOrigin) {
    res.setHeader("Access-Control-Allow-Origin", allowedOrigin);
    res.setHeader("Vary", "Origin");
  }
  res.setHeader("Access-Control-Allow-Headers", "content-type,x-reel-reader-key");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
}

function readJsonBody(req, maxBytes) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk.toString("utf8");
      if (Buffer.byteLength(body, "utf8") > maxBytes) {
        reject(new HttpError(413, "request_too_large", "Request body is too large."));
        req.destroy();
      }
    });
    req.on("error", reject);
    req.on("end", () => {
      if (!body.trim()) return reject(new HttpError(400, "invalid_request", "Request body is required."));
      try {
        resolve(JSON.parse(body));
      } catch (error) {
        reject(new HttpError(400, "invalid_json", "Request body must be valid JSON."));
      }
    });
  });
}

function sendJson(res, status, payload) {
  res.writeHead(status, { "content-type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(payload));
}

function withTimeout(promise, timeoutMs) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new HttpError(504, "timeout", "Request timed out while processing video.")), timeoutMs);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

module.exports = {
  createServer,
  keysMatch,
  ALLOWED_ORIGIN,
  readJsonBody,
  withTimeout,
  DOWNLOAD_PREFIX,
  UPLOAD_MAX_BYTES
};
