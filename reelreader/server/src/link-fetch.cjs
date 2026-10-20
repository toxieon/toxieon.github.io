"use strict";

// Pluggable link fetcher for Reel Reader's link mode.
//
//   createLinkFetcher(config) -> { name, inspect(url, limits, timeoutMs), download(url, limits, timeoutMs) }
//   download resolves to { tempDir, filePath }, the same shape media-tools.downloadVideo returns.
//
// Fetchers (REEL_READER_FETCHER, comma-separated for a fallback chain, default "ytdlp"):
//   ytdlp        today's behaviour: yt-dlp from the server's own IP.
//   ytdlp-proxy  yt-dlp with --proxy REEL_READER_PROXY_URL (http, https or socks5). With
//                REEL_READER_PROXY_HOSTS set, only those link hosts use the proxy; others go direct.
//   http-api     a paid "downloader API" that returns a direct media URL as JSON. The media is
//                streamed to a temp dir with the same size and duration limits.
//
// A chain like "ytdlp,ytdlp-proxy" moves to the next fetcher only when the error is a block or
// rate limit (friendly-errors.isRetryableFetchError). Validation errors (too long, too large,
// private, missing) stop the chain. The proxy URL, its credentials and the API key never appear
// in an error message or a log line: every error leaving this module is masked.

const fs = require("node:fs/promises");
const { createWriteStream, mkdtempSync } = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { Readable, Transform } = require("node:stream");
const { pipeline } = require("node:stream/promises");
const { HttpError } = require("./errors.cjs");
const { formatSize } = require("./format.cjs");
const { isRetryableFetchError } = require("./friendly-errors.cjs");
const mediaTools = require("./media-tools.cjs");

const FETCHERS = ["ytdlp", "ytdlp-proxy", "http-api"];
const PROXY_PROTOCOLS = ["http:", "https:", "socks5:"];
const MASK = "[hidden]";

class FetcherConfigError extends Error {}

// ── config ──────────────────────────────────────────────────────────────────

function list(value) {
  return String(value || "").split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
}

/** Read the fetcher settings from an env-like object. Never throws; validation happens in createLinkFetcher. */
function configFromEnv(env = process.env) {
  return {
    fetchers: list(env.REEL_READER_FETCHER).length ? list(env.REEL_READER_FETCHER) : ["ytdlp"],
    proxyUrl: String(env.REEL_READER_PROXY_URL || "").trim(),
    proxyHosts: list(env.REEL_READER_PROXY_HOSTS),
    apiUrl: String(env.REEL_READER_API_URL || "").trim(),
    apiKey: String(env.REEL_READER_API_KEY || ""),
    apiKeyHeader: String(env.REEL_READER_API_KEY_HEADER || "x-api-key").trim(),
    apiMediaField: String(env.REEL_READER_API_MEDIA_FIELD || "url").trim(),
    igCookies: String(env.IG_COOKIES || ""),
  };
}

/** Strings that must never leave this module: the proxy URL and its parts, and the API key. */
function secretsOf(config) {
  const out = [];
  const add = (s) => { if (s && String(s).length >= 3) out.push(String(s)); };
  if (config.proxyUrl) {
    add(config.proxyUrl);
    try {
      const u = new URL(config.proxyUrl);
      add(u.href);
      add(u.host);
      if (u.username) add(decodeURIComponent(u.username));
      if (u.password) add(decodeURIComponent(u.password));
      if (u.username) add(u.username);
      if (u.password) add(u.password);
    } catch (e) { /* invalid URL: the raw string is already listed */ }
  }
  add(config.apiKey);
  return out.sort((a, b) => b.length - a.length); // longest first, so a URL is masked before its host
}

function maskText(text, secrets) {
  let s = String(text == null ? "" : text);
  for (const secret of secrets) s = s.split(secret).join(MASK);
  return s;
}

/** Same error, with every secret masked out of its message (and stack). */
function maskError(error, secrets) {
  if (!secrets.length || !error) return error;
  if (error instanceof HttpError) {
    const e = new HttpError(error.status, error.code, maskText(error.message, secrets));
    return e;
  }
  const e = new Error(maskText(error.message || String(error), secrets));
  if (error.code) e.code = error.code;
  return e;
}

function hostOf(url) {
  try { return new URL(url).hostname.toLowerCase(); } catch (e) { return ""; }
}

function hostMatches(host, list) {
  return list.some((h) => host === h || host.endsWith("." + h));
}

function validateConfig(config) {
  const secrets = secretsOf(config);
  const bad = (msg) => new FetcherConfigError(maskText(msg, secrets));
  if (!config.fetchers.length) throw bad("REEL_READER_FETCHER is empty.");
  for (const name of config.fetchers) {
    if (!FETCHERS.includes(name)) throw bad("Unknown REEL_READER_FETCHER entry: " + name + " (use " + FETCHERS.join(", ") + ").");
  }
  if (config.fetchers.includes("ytdlp-proxy")) {
    if (!config.proxyUrl) throw bad("ytdlp-proxy needs REEL_READER_PROXY_URL.");
    let u;
    try { u = new URL(config.proxyUrl); } catch (e) { throw bad("REEL_READER_PROXY_URL is not a valid URL."); }
    if (!PROXY_PROTOCOLS.includes(u.protocol)) throw bad("REEL_READER_PROXY_URL must be http, https or socks5.");
  }
  if (config.fetchers.includes("http-api")) {
    if (!config.apiUrl || config.apiUrl.indexOf("{url}") === -1) throw bad("http-api needs REEL_READER_API_URL with a {url} placeholder.");
    let u;
    try { u = new URL(config.apiUrl.replace("{url}", "x")); } catch (e) { throw bad("REEL_READER_API_URL is not a valid URL."); }
    if (u.protocol !== "https:" && u.protocol !== "http:") throw bad("REEL_READER_API_URL must be http or https.");
    if (!config.apiMediaField) throw bad("REEL_READER_API_MEDIA_FIELD is empty.");
  }
  return secrets;
}

// ── ytdlp / ytdlp-proxy ─────────────────────────────────────────────────────

function ytdlpFetcher(config, deps, useProxy) {
  const proxyFor = (url) => (useProxy && (!config.proxyHosts.length || hostMatches(hostOf(url), config.proxyHosts)));
  const extraArgs = (url) => (proxyFor(url) ? ["--proxy", config.proxyUrl] : []);
  const opts = (url) => ({ extraArgs: extraArgs(url), runCommand: deps.runCommand });
  return {
    name: useProxy ? "ytdlp-proxy" : "ytdlp",
    route: (url) => (proxyFor(url) ? "proxy" : "direct"),
    inspect: (url, limits, timeoutMs) => deps.inspectVideo(url, limits, timeoutMs, config.igCookies, opts(url)),
    download: (url, limits, timeoutMs) => deps.downloadVideo(url, limits, timeoutMs, config.igCookies, opts(url)),
  };
}

// ── http-api ────────────────────────────────────────────────────────────────

function pick(obj, dotted) {
  return String(dotted).split(".").reduce((o, k) => (o == null ? undefined : o[/^\d+$/.test(k) ? Number(k) : k]), obj);
}

const EXT_BY_TYPE = { "video/mp4": ".mp4", "video/quicktime": ".mov", "video/webm": ".webm", "video/x-matroska": ".mkv", "video/3gpp": ".3gp" };

function extensionFor(contentType, mediaUrl) {
  const t = String(contentType || "").split(";")[0].trim().toLowerCase();
  if (EXT_BY_TYPE[t]) return EXT_BY_TYPE[t];
  try {
    const ext = path.extname(new URL(mediaUrl).pathname).toLowerCase();
    if (/^\.(mp4|mov|webm|mkv|3gp|m4v)$/.test(ext)) return ext;
  } catch (e) { /* fall through */ }
  return ".mp4";
}

function httpApiFetcher(config, deps) {
  const fetchFn = deps.fetch || globalThis.fetch;
  const resolved = new Map(); // link url -> media url, between inspect and download

  async function resolveMedia(url, timeoutMs) {
    const apiUrl = config.apiUrl.split("{url}").join(encodeURIComponent(url));
    const headers = { accept: "application/json" };
    if (config.apiKey) headers[config.apiKeyHeader] = config.apiKey;
    let res;
    try {
      res = await fetchFn(apiUrl, { headers, signal: AbortSignal.timeout(timeoutMs) });
    } catch (e) {
      if (e && (e.name === "TimeoutError" || e.name === "AbortError")) throw new Error("downloader API timed out");
      throw new Error("downloader API request failed: " + ((e && e.message) || e));
    }
    if (res.status === 429) throw new Error("downloader API: 429 too many requests (rate limit)");
    if (res.status === 401 || res.status === 403) throw new Error("downloader API: HTTP " + res.status + " forbidden (blocked)");
    if (res.status === 404) throw new Error("downloader API: video not found (404)");
    if (!res.ok) throw new Error("downloader API failed (HTTP " + res.status + ")");
    let body;
    try { body = await res.json(); } catch (e) { throw new Error("downloader API returned invalid JSON"); }
    const mediaUrl = pick(body, config.apiMediaField);
    if (typeof mediaUrl !== "string" || !/^https?:\/\//i.test(mediaUrl)) throw new Error("downloader API returned no media URL at " + config.apiMediaField);
    if (resolved.size > 100) resolved.clear();
    resolved.set(url, mediaUrl);
    return mediaUrl;
  }

  async function download(url, limits, timeoutMs) {
    const mediaUrl = resolved.get(url) || await resolveMedia(url, timeoutMs);
    resolved.delete(url);
    const tempDir = mkdtempSync(path.join(os.tmpdir(), "reel-reader-api-"));
    try {
      let res;
      try {
        res = await fetchFn(mediaUrl, { signal: AbortSignal.timeout(timeoutMs) });
      } catch (e) {
        if (e && (e.name === "TimeoutError" || e.name === "AbortError")) throw new Error("media download timed out");
        throw new Error("media download failed: " + ((e && e.message) || e));
      }
      if (res.status === 429) throw new Error("media host: 429 too many requests (rate limit)");
      if (res.status === 403) throw new Error("media host: HTTP 403 forbidden (blocked)");
      if (!res.ok || !res.body) throw new Error("media download failed (HTTP " + res.status + ")");
      const tooLarge = () => new HttpError(413, "video_too_large", "Downloaded video exceeded the size limit of " + formatSize(limits.maxBytes) + ".");
      const declared = Number(res.headers.get("content-length") || 0);
      if (declared && declared > limits.maxBytes) throw tooLarge();
      const filePath = path.join(tempDir, "input" + extensionFor(res.headers.get("content-type"), mediaUrl));
      let seen = 0;
      const counter = new Transform({
        transform(chunk, _enc, cb) {
          seen += chunk.length;
          if (seen > limits.maxBytes) return cb(tooLarge());
          cb(null, chunk);
        },
      });
      await pipeline(Readable.fromWeb(res.body), counter, createWriteStream(filePath));
      await deps.probe(filePath, limits, timeoutMs); // duration limit, same as uploads
      return { tempDir, filePath };
    } catch (error) {
      await mediaTools.cleanupTemp(tempDir);
      throw error;
    }
  }

  return {
    name: "http-api",
    route: () => "api",
    inspect: async (url, limits, timeoutMs) => ({ mediaUrl: await resolveMedia(url, timeoutMs) }),
    download,
  };
}

// ── chain ───────────────────────────────────────────────────────────────────

function chainFetcher(fetchers, log) {
  const winner = new Map(); // link url -> index that passed inspect
  async function attempt(step, url, args, startAt) {
    const tried = new Set();
    let lastError = null;
    for (let i = startAt; i < fetchers.length; i++) {
      const f = fetchers[i];
      const route = f.route(url);
      if (tried.has(route)) continue; // e.g. ytdlp-proxy for a host outside REEL_READER_PROXY_HOSTS is just direct again
      tried.add(route);
      try {
        const out = await f[step](url, ...args);
        return { out, index: i };
      } catch (error) {
        lastError = error;
        const next = fetchers.slice(i + 1).find((n) => !tried.has(n.route(url)));
        if (!next || !isRetryableFetchError(error)) throw error;
        log.warn("[reel-reader] " + f.name + " " + step + " was blocked or rate-limited; trying " + next.name + ": " + ((error && error.message) || error));
      }
    }
    throw lastError || new Error("no fetcher could handle that link");
  }
  return {
    name: fetchers.map((f) => f.name).join(","),
    route: (url) => fetchers[0].route(url),
    inspect: async (url, limits, timeoutMs) => {
      const { out, index } = await attempt("inspect", url, [limits, timeoutMs], 0);
      if (winner.size > 100) winner.clear();
      winner.set(url, index);
      return out;
    },
    download: async (url, limits, timeoutMs) => {
      const start = winner.has(url) ? winner.get(url) : 0;
      winner.delete(url);
      return (await attempt("download", url, [limits, timeoutMs], start)).out;
    },
  };
}

// ── public ──────────────────────────────────────────────────────────────────

/**
 * config: the shape configFromEnv() returns (a partial object is fine; missing keys get defaults).
 * deps (tests): { runCommand, inspectVideo, downloadVideo, fetch, probe, log }.
 */
function createLinkFetcher(config = {}, deps = {}) {
  const cfg = Object.assign(configFromEnv({}), config);
  const secrets = validateConfig(cfg);
  const log = deps.log || console;
  const d = {
    runCommand: deps.runCommand,
    inspectVideo: deps.inspectVideo || mediaTools.inspectVideo,
    downloadVideo: deps.downloadVideo || mediaTools.downloadVideo,
    fetch: deps.fetch,
    probe: deps.probe || mediaTools.probeUploadedVideo,
  };
  const maskedLog = {
    warn: (m) => (log.warn || log.error || (() => {})).call(log, maskText(m, secrets)),
  };
  const build = (name) => (name === "http-api" ? httpApiFetcher(cfg, d) : ytdlpFetcher(cfg, d, name === "ytdlp-proxy"));
  const inner = cfg.fetchers.length === 1 ? build(cfg.fetchers[0]) : chainFetcher(cfg.fetchers.map(build), maskedLog);
  const guard = (fn) => async (...args) => {
    try { return await fn(...args); } catch (error) { throw maskError(error, secrets); }
  };
  return { name: inner.name, inspect: guard(inner.inspect), download: guard(inner.download) };
}

/**
 * The deps object index.cjs hands to createServer: link mode's inspect and download go through the
 * fetcher. The fetcher carries IG_COOKIES itself, so the cookie argument the service passes is ignored.
 */
function serviceDeps(fetcher) {
  return {
    inspectVideo: (url, limits, timeoutMs) => fetcher.inspect(url, limits, timeoutMs),
    downloadVideo: (url, limits, timeoutMs) => fetcher.download(url, limits, timeoutMs),
  };
}

/** What index.cjs logs at boot: fetcher names and whether a proxy/API is set, never the values. */
function describeConfig(config) {
  const cfg = Object.assign(configFromEnv({}), config);
  const parts = ["fetcher=" + cfg.fetchers.join(",")];
  if (cfg.fetchers.includes("ytdlp-proxy")) parts.push("proxy=set" + (cfg.proxyHosts.length ? " hosts=" + cfg.proxyHosts.join(",") : " hosts=all"));
  if (cfg.fetchers.includes("http-api")) parts.push("api=set");
  return parts.join(" ");
}

module.exports = { createLinkFetcher, configFromEnv, describeConfig, serviceDeps, maskText, secretsOf, FetcherConfigError, FETCHERS };
