"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const http = require("node:http");
const os = require("node:os");
const path = require("node:path");
// node --test runs test files in parallel, so give this file its own temp root: the leak checks
// below then only see temp dirs this file made. Set before media-tools is used (os.tmpdir() reads
// TMPDIR on every call).
const ISOLATED_TMP = fs.mkdtempSync(path.join(os.tmpdir(), "rr-linkfetch-test-"));
process.env.TMPDIR = ISOLATED_TMP;
process.on("exit", () => { try { fs.rmSync(ISOLATED_TMP, { recursive: true, force: true }); } catch (e) { /* ignore */ } });

const { createLinkFetcher, configFromEnv, describeConfig, serviceDeps, FetcherConfigError } = require("./link-fetch.cjs");
const { runReelReader } = require("./service.cjs");
const { inspectVideo, downloadVideo } = require("./media-tools.cjs");
const { HttpError } = require("./errors.cjs");

const LIMITS = { maxDurationSec: 300, maxBytes: 5 * 1024 * 1024, commandTimeoutMs: 5000 };
const PROXY = "http://reeluser:s3cretPa55@proxy.example.net:8080";
const IG = "https://www.instagram.com/reel/abc123/";
const YT = "https://www.youtube.com/shorts/xyz789";

function quietLog() {
  const lines = [];
  return { lines, warn: (m) => lines.push(String(m)), error: (m) => lines.push(String(m)), log: (m) => lines.push(String(m)) };
}

/** A runCommand stand-in for yt-dlp: records args, answers inspect with JSON and download with a real temp file. */
function fakeYtdlp(behaviour = {}) {
  const calls = [];
  async function runCommand(command, args) {
    calls.push({ command, args: args.slice() });
    const proxied = args.includes("--proxy");
    const fail = proxied ? behaviour.proxyError : behaviour.directError;
    if (fail) throw new Error(typeof fail === "function" ? fail(args) : fail);
    if (args.includes("--dump-single-json")) return { stdout: JSON.stringify({ duration: 20, filesize: 1000 }), stderr: "" };
    const tpl = args[args.indexOf("-o") + 1];
    const out = tpl.replace("%(ext)s", "mp4");
    fs.writeFileSync(out, Buffer.alloc(1000));
    return { stdout: out + "\n", stderr: "" };
  }
  return { calls, runCommand };
}

function tempDirsNow() {
  return new Set(fs.readdirSync(os.tmpdir()).filter((n) => n.startsWith("reel-reader-")));
}

// ── selection and env parsing ────────────────────────────────────────────────

test("default fetcher is ytdlp and env is parsed with safe defaults", () => {
  const cfg = configFromEnv({});
  assert.deepEqual(cfg.fetchers, ["ytdlp"]);
  assert.equal(cfg.apiKeyHeader, "x-api-key");
  assert.equal(cfg.apiMediaField, "url");
  assert.equal(createLinkFetcher(cfg).name, "ytdlp");

  const env = configFromEnv({
    REEL_READER_FETCHER: " YTDLP , ytdlp-proxy ",
    REEL_READER_PROXY_URL: PROXY,
    REEL_READER_PROXY_HOSTS: "instagram.com, TikTok.com",
    IG_COOKIES: "# Netscape",
  });
  assert.deepEqual(env.fetchers, ["ytdlp", "ytdlp-proxy"]);
  assert.deepEqual(env.proxyHosts, ["instagram.com", "tiktok.com"]);
  assert.equal(createLinkFetcher(env).name, "ytdlp,ytdlp-proxy");
  assert.equal(describeConfig(env), "fetcher=ytdlp,ytdlp-proxy proxy=set hosts=instagram.com,tiktok.com");
  assert.doesNotMatch(describeConfig(env), /s3cret|reeluser|proxy\.example/);
});

test("bad config fails at boot with a masked message", () => {
  assert.throws(() => createLinkFetcher({ fetchers: ["wget"] }), FetcherConfigError);
  assert.throws(() => createLinkFetcher({ fetchers: ["ytdlp-proxy"] }), /needs REEL_READER_PROXY_URL/);
  for (const bad of ["ftp://user:pw123@host:21", "socks4://user:pw123@host:1080", "not a url pw123"]) {
    let err;
    try { createLinkFetcher({ fetchers: ["ytdlp-proxy"], proxyUrl: bad }); } catch (e) { err = e; }
    assert.ok(err instanceof FetcherConfigError, bad);
    assert.doesNotMatch(err.message, /pw123/, "credentials never appear in config errors");
  }
  for (const ok of ["http://h:1", "https://u:p@h:443", "socks5://u:p@h:1080"]) {
    assert.doesNotThrow(() => createLinkFetcher({ fetchers: ["ytdlp-proxy"], proxyUrl: ok }), ok);
  }
  assert.throws(() => createLinkFetcher({ fetchers: ["http-api"], apiUrl: "https://api.example.com/get" }), /\{url\} placeholder/);
});

// ── proxy args, masking, host allowlist ──────────────────────────────────────

test("ytdlp passes no proxy; ytdlp-proxy adds --proxy before the -- URL separator", async () => {
  const direct = fakeYtdlp();
  await createLinkFetcher({ fetchers: ["ytdlp"] }, { runCommand: direct.runCommand }).inspect(YT, LIMITS, 1000);
  assert.ok(!direct.calls[0].args.includes("--proxy"));

  const prox = fakeYtdlp();
  const f = createLinkFetcher({ fetchers: ["ytdlp-proxy"], proxyUrl: PROXY }, { runCommand: prox.runCommand });
  await f.inspect(IG, LIMITS, 1000);
  const dl = await f.download(IG, LIMITS, 1000);
  for (const c of prox.calls) {
    const a = c.args;
    assert.equal(c.command, "yt-dlp");
    assert.equal(a[a.indexOf("--proxy") + 1], PROXY);
    assert.ok(a.indexOf("--proxy") < a.indexOf("--"), "proxy is an option, the URL stays after --");
    assert.equal(a[a.length - 1], IG);
  }
  assert.ok(fs.existsSync(dl.filePath));
  fs.rmSync(dl.tempDir, { recursive: true, force: true });
});

test("the proxy URL and its credentials never appear in errors or logs", async () => {
  const yt = fakeYtdlp({
    proxyError: (args) => "ERROR: Unable to connect to proxy " + args[args.indexOf("--proxy") + 1] + " (reeluser:s3cretPa55 rejected, host proxy.example.net:8080)",
    directError: "ERROR: [Instagram] abc123: HTTP Error 429: Too Many Requests",
  });
  const log = quietLog();
  const f = createLinkFetcher({ fetchers: ["ytdlp", "ytdlp-proxy"], proxyUrl: PROXY }, { runCommand: yt.runCommand, log });
  let err;
  try { await f.inspect(IG, LIMITS, 1000); } catch (e) { err = e; }
  assert.ok(err, "both fetchers failed");
  const seen = [err.message, String(err.stack || ""), ...log.lines].join("\n");
  for (const secret of [PROXY, "s3cretPa55", "reeluser", "proxy.example.net:8080"]) {
    assert.ok(!seen.includes(secret), "leaked " + secret + " in: " + seen);
  }
  assert.match(err.message, /\[hidden\]/);
  assert.equal(log.lines.length, 1, "the fallback is logged once");
  assert.match(log.lines[0], /ytdlp inspect was blocked or rate-limited; trying ytdlp-proxy/);
});

test("REEL_READER_PROXY_HOSTS: listed hosts use the proxy, others go direct", async () => {
  const yt = fakeYtdlp();
  const f = createLinkFetcher({ fetchers: ["ytdlp-proxy"], proxyUrl: PROXY, proxyHosts: ["instagram.com", "tiktok.com"] }, { runCommand: yt.runCommand });
  await f.inspect(IG, LIMITS, 1000);
  await f.inspect("https://vm.tiktok.com/ZM123/", LIMITS, 1000);
  await f.inspect(YT, LIMITS, 1000);
  await f.inspect("https://notinstagram.com/reel/1", LIMITS, 1000);
  assert.deepEqual(yt.calls.map((c) => c.args.includes("--proxy")), [true, true, false, false]);
});

// ── fallback chain ───────────────────────────────────────────────────────────

test("chain falls back on a block or rate limit, and download continues with the fetcher that worked", async () => {
  const yt = fakeYtdlp({ directError: "ERROR: [Instagram] abc: Sign in to confirm you're not a bot" });
  const f = createLinkFetcher({ fetchers: ["ytdlp", "ytdlp-proxy"], proxyUrl: PROXY }, { runCommand: yt.runCommand, log: quietLog() });
  await f.inspect(IG, LIMITS, 1000);
  const dl = await f.download(IG, LIMITS, 1000);
  const kinds = yt.calls.map((c) => (c.args.includes("--dump-single-json") ? "inspect" : "download") + (c.args.includes("--proxy") ? "+proxy" : ""));
  assert.deepEqual(kinds, ["inspect", "inspect+proxy", "download+proxy"]);
  fs.rmSync(dl.tempDir, { recursive: true, force: true });
});

test("chain does not fall back on validation errors or ordinary failures", async () => {
  // Too long: an HttpError from the limit check, never retried through the proxy.
  const long = fakeYtdlp();
  const longRun = async (cmd, args) => (args.includes("--dump-single-json") ? { stdout: JSON.stringify({ duration: 9999 }) } : long.runCommand(cmd, args));
  const f1 = createLinkFetcher({ fetchers: ["ytdlp", "ytdlp-proxy"], proxyUrl: PROXY }, { runCommand: async (c, a) => { long.calls.push({ args: a }); return longRun(c, a); }, log: quietLog() });
  await assert.rejects(f1.inspect(IG, LIMITS, 1000), (e) => e instanceof HttpError && e.code === "video_too_long");
  assert.equal(long.calls.filter((c) => c.args.includes("--proxy")).length, 0);

  // Private video and a removed video: not a block, so no second try.
  for (const msg of ["ERROR: This video is private", "ERROR: Video unavailable"]) {
    const yt = fakeYtdlp({ directError: msg });
    const f = createLinkFetcher({ fetchers: ["ytdlp", "ytdlp-proxy"], proxyUrl: PROXY }, { runCommand: yt.runCommand, log: quietLog() });
    await assert.rejects(f.inspect(IG, LIMITS, 1000));
    assert.equal(yt.calls.length, 1, msg);
  }
});

test("chain skips a proxy fetcher that would just go direct again for an unlisted host", async () => {
  const yt = fakeYtdlp({ directError: "HTTP Error 403: Forbidden" });
  const f = createLinkFetcher({ fetchers: ["ytdlp", "ytdlp-proxy"], proxyUrl: PROXY, proxyHosts: ["instagram.com"] }, { runCommand: yt.runCommand, log: quietLog() });
  await assert.rejects(f.inspect(YT, LIMITS, 1000), /403/);
  assert.equal(yt.calls.length, 1, "YouTube is not on the proxy list, so there is nothing new to try");
});

// ── http-api ─────────────────────────────────────────────────────────────────

function startApi(handler) {
  return new Promise((resolve) => {
    const server = http.createServer(handler);
    server.listen(0, "127.0.0.1", () => resolve({ server, base: "http://127.0.0.1:" + server.address().port }));
  });
}

test("http-api: resolves the media URL with the key header, streams it, probes duration", async () => {
  const seen = [];
  const media = Buffer.alloc(64 * 1024, 7);
  const { server, base } = await startApi((req, res) => {
    seen.push({ url: req.url, key: req.headers["x-test-key"] });
    if (req.url.startsWith("/resolve")) {
      res.writeHead(200, { "content-type": "application/json" });
      return res.end(JSON.stringify({ data: { items: [{ video: base + "/media/clip.mp4" }] } }));
    }
    res.writeHead(200, { "content-type": "video/mp4", "content-length": media.length });
    res.end(media);
  });
  try {
    const probed = [];
    const f = createLinkFetcher({ fetchers: ["http-api"], apiUrl: base + "/resolve?link={url}", apiKey: "api-key-123456", apiKeyHeader: "x-test-key", apiMediaField: "data.items.0.video" },
      { probe: async (p) => { probed.push(p); return { duration: 12 }; } });
    const info = await f.inspect(IG, LIMITS, 2000);
    assert.equal(info.mediaUrl, base + "/media/clip.mp4");
    const dl = await f.download(IG, LIMITS, 2000);
    assert.equal(fs.statSync(dl.filePath).size, media.length);
    assert.match(dl.filePath, /input\.mp4$/);
    assert.deepEqual(probed, [dl.filePath]);
    assert.equal(seen[0].url, "/resolve?link=" + encodeURIComponent(IG));
    assert.equal(seen[0].key, "api-key-123456");
    assert.equal(seen.length, 2, "inspect's resolved URL is reused by download");
    fs.rmSync(dl.tempDir, { recursive: true, force: true });
  } finally { server.close(); }
});

test("http-api: size limit is enforced while streaming (no content-length) and the temp dir is removed", async () => {
  const { server, base } = await startApi((req, res) => {
    if (req.url.startsWith("/resolve")) { res.writeHead(200, { "content-type": "application/json" }); return res.end(JSON.stringify({ url: base + "/big" })); }
    res.writeHead(200, { "content-type": "video/mp4" }); // chunked, no length up front
    let sent = 0;
    const chunk = Buffer.alloc(256 * 1024);
    (function pump() {
      while (sent < 4 * 1024 * 1024) { sent += chunk.length; if (!res.write(chunk)) return res.once("drain", pump); }
      res.end();
    })();
  });
  try {
    const before = tempDirsNow();
    const f = createLinkFetcher({ fetchers: ["http-api"], apiUrl: base + "/resolve?u={url}" }, { probe: async () => ({}) });
    await assert.rejects(f.download(IG, { ...LIMITS, maxBytes: 1024 * 1024 }, 5000), (e) => e instanceof HttpError && e.code === "video_too_large");
    const leaked = [...tempDirsNow()].filter((n) => !before.has(n));
    assert.deepEqual(leaked, []);
  } finally { server.close(); }
});

test("http-api: declared content-length over the limit fails before streaming", async () => {
  const { server, base } = await startApi((req, res) => {
    if (req.url.startsWith("/resolve")) { res.writeHead(200, { "content-type": "application/json" }); return res.end(JSON.stringify({ url: base + "/big" })); }
    res.writeHead(200, { "content-type": "video/mp4", "content-length": String(50 * 1024 * 1024) });
    res.end();
  });
  try {
    const f = createLinkFetcher({ fetchers: ["http-api"], apiUrl: base + "/resolve?u={url}" }, { probe: async () => ({}) });
    await assert.rejects(f.download(IG, LIMITS, 5000), (e) => e.code === "video_too_large");
  } finally { server.close(); }
});

test("http-api: rate limit and bad responses become short errors with no key in them", async () => {
  let mode = "429";
  const { server, base } = await startApi((req, res) => {
    if (mode === "429") { res.writeHead(429); return res.end("slow down"); }
    if (mode === "nofield") { res.writeHead(200, { "content-type": "application/json" }); return res.end(JSON.stringify({ other: 1 })); }
    res.writeHead(500); res.end();
  });
  try {
    const f = createLinkFetcher({ fetchers: ["http-api"], apiUrl: base + "/r?k=api-key-123456&u={url}", apiKey: "api-key-123456" }, { probe: async () => ({}) });
    await assert.rejects(f.inspect(IG, LIMITS, 2000), (e) => /429|rate limit/.test(e.message) && !e.message.includes("api-key-123456"));
    mode = "nofield";
    await assert.rejects(f.inspect(IG, LIMITS, 2000), /no media URL at url/);
    mode = "500";
    await assert.rejects(f.inspect(IG, LIMITS, 2000), /HTTP 500/);
  } finally { server.close(); }
});

test("temp dirs are cleaned up on every failure path", async () => {
  const before = tempDirsNow();
  // yt-dlp: inspect failure, download failure, download with a missing output file, download over the size limit.
  const fails = [
    fakeYtdlp({ directError: "ERROR: HTTP Error 429" }).runCommand,
    async (c, a) => (a.includes("--dump-single-json") ? { stdout: "{}" } : { stdout: "/nonexistent/file.mp4\n" }),
    async (c, a) => { if (a.includes("--dump-single-json")) return { stdout: "{}" }; const out = a[a.indexOf("-o") + 1].replace("%(ext)s", "mp4"); fs.writeFileSync(out, Buffer.alloc(2048)); return { stdout: out }; },
  ];
  for (const run of fails) {
    const f = createLinkFetcher({ fetchers: ["ytdlp"] }, { runCommand: run });
    await f.inspect(IG, LIMITS, 1000).catch(() => {});
    await f.download(IG, { ...LIMITS, maxBytes: 1024 }, 1000).catch(() => {});
  }
  // http-api: probe rejects (too long) after a good download.
  const { server, base } = await startApi((req, res) => {
    if (req.url.startsWith("/resolve")) { res.writeHead(200, { "content-type": "application/json" }); return res.end(JSON.stringify({ url: base + "/m" })); }
    res.writeHead(200, { "content-type": "video/mp4" }); res.end(Buffer.alloc(100));
  });
  try {
    const f = createLinkFetcher({ fetchers: ["http-api"], apiUrl: base + "/resolve?u={url}" },
      { probe: async () => { throw new HttpError(413, "video_too_long", "Video is too long."); } });
    await assert.rejects(f.download(IG, LIMITS, 2000), (e) => e.code === "video_too_long");
  } finally { server.close(); }
  const leaked = [...tempDirsNow()].filter((n) => !before.has(n));
  assert.deepEqual(leaked, [], "left behind: " + leaked.join(", "));
});

test("media-tools still exposes inspectVideo/downloadVideo with today's signature", () => {
  assert.equal(typeof inspectVideo, "function");
  assert.equal(typeof downloadVideo, "function");
  assert.ok(inspectVideo.length >= 4 && downloadVideo.length >= 4);
});

test("service wiring: runReelReader uses the fetcher chain and cleans up after itself", async () => {
  const yt = fakeYtdlp({ directError: "ERROR: [TikTok] 123: HTTP Error 403: Forbidden" });
  const f = createLinkFetcher({ fetchers: ["ytdlp", "ytdlp-proxy"], proxyUrl: PROXY, igCookies: "# Netscape HTTP Cookie File" }, { runCommand: yt.runCommand, log: quietLog() });
  const before = tempDirsNow();
  let analysed = "";
  const result = await runReelReader("https://www.tiktok.com/@a/video/1", {
    limits: LIMITS, igCookies: "ignored-by-the-fetcher",
    deps: Object.assign(serviceDeps(f), {
      ensureMp4: async (p) => p,
      analyzeVideoFile: async (p) => { analysed = p; return { transcript: "hello" }; },
    }),
    log: quietLog(),
  });
  assert.equal(result.transcript, "hello");
  assert.match(analysed, /input\.mp4$/);
  assert.deepEqual(yt.calls.map((c) => c.args.includes("--proxy")), [false, true, true]);
  const cookieArg = yt.calls[0].args[yt.calls[0].args.indexOf("--cookies") + 1];
  assert.ok(cookieArg && cookieArg.endsWith("cookies.txt"), "IG_COOKIES still reach yt-dlp via the fetcher");
  assert.deepEqual([...tempDirsNow()].filter((n) => !before.has(n)), [], "no temp dirs left behind");
});

test("service wiring: a blocked link through every fetcher still gives the short friendly error, masked", async () => {
  const yt = fakeYtdlp({ directError: "HTTP Error 429: Too Many Requests", proxyError: (a) => "Sign in to confirm you're not a bot (via " + a[a.indexOf("--proxy") + 1] + ")" });
  const f = createLinkFetcher({ fetchers: ["ytdlp", "ytdlp-proxy"], proxyUrl: PROXY }, { runCommand: yt.runCommand, log: quietLog() });
  const log = quietLog();
  await assert.rejects(
    runReelReader(IG, { limits: LIMITS, deps: Object.assign(serviceDeps(f), { analyzeVideoFile: async () => ({}) }), log }),
    (e) => e instanceof HttpError && e.code === "source_blocked" && e.message === "Instagram blocked the server. Try again later or use another link.");
  const all = log.lines.join("\n");
  assert.match(all, /\[hidden\]/);
  for (const secret of ["s3cretPa55", "reeluser", "proxy.example.net"]) assert.ok(!all.includes(secret), "server log leaked " + secret);
});

test("friendly-errors: only blocks and rate limits are retryable", () => {
  const { isRetryableFetchError } = require("./friendly-errors.cjs");
  for (const m of ["HTTP Error 429: Too Many Requests", "Sign in to confirm you're not a bot", "HTTP Error 403: Forbidden", "downloader API: 429 too many requests (rate limit)", "media host: HTTP 403 forbidden (blocked)"]) {
    assert.equal(isRetryableFetchError(new Error(m)), true, m);
  }
  for (const m of ["This video is private", "Video unavailable", "timed out", "Unable to connect to proxy"]) {
    assert.equal(isRetryableFetchError(new Error(m)), false, m);
  }
  assert.equal(isRetryableFetchError(new HttpError(413, "video_too_long", "429 seconds")), false, "validation errors never retry");
  assert.equal(isRetryableFetchError(null), false);
});
