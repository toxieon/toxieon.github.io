"use strict";

const { HttpError } = require("./errors.cjs");

const SUPPORTED_HOSTS = new Set([
  "instagram.com",
  "www.instagram.com",
  "tiktok.com",
  "www.tiktok.com",
  "youtube.com",
  "www.youtube.com",
  "youtu.be"
]);

function normalizeSourceUrl(value) {
  if (typeof value !== "string") throw new HttpError(400, "invalid_request", "Request body must include a URL string.");
  const trimmed = value.trim();
  if (!trimmed) throw new HttpError(400, "invalid_request", "URL is required.");

  let parsed;
  try {
    parsed = new URL(trimmed);
  } catch (error) {
    throw new HttpError(400, "invalid_request", "URL is not valid.");
  }

  if (!["http:", "https:"].includes(parsed.protocol)) {
    throw new HttpError(400, "invalid_request", "URL must start with http:// or https://.");
  }
  if (parsed.username || parsed.password || parsed.port) {
    throw new HttpError(400, "invalid_request", "URL must not include credentials or a port.");
  }
  if (!SUPPORTED_HOSTS.has(parsed.hostname.toLowerCase())) {
    throw new HttpError(400, "unsupported_source", "Only Instagram, TikTok, and YouTube URLs are supported.");
  }
  return parsed.toString();
}

function validateBody(payload) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new HttpError(400, "invalid_request", "JSON body must be an object like {\"url\":\"...\"}.");
  }
  return { url: normalizeSourceUrl(payload.url) };
}

module.exports = { SUPPORTED_HOSTS, normalizeSourceUrl, validateBody };
