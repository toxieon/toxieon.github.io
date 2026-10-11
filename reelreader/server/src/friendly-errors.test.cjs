"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { toFriendlyError } = require("./friendly-errors.cjs");
const { runReelReader } = require("./service.cjs");

const quiet = { error() {} };
const YT = "https://www.youtube.com/shorts/abc";

test("maps real yt-dlp failures to short messages without raw detail", () => {
  const cases = [
    [YT, "ERROR: [youtube] x: Sign in to confirm you’re not a bot. Use --cookies-from-browser", "source_blocked", "YouTube blocked the server. Try again later or use another link."],
    ["https://www.tiktok.com/@a/video/1", "ERROR: [TikTok] 1: Unexpected response from webpage request; please report this issue on https://github.com/yt-dlp", "source_blocked", "TikTok blocked the server. Try again later or use another link."],
    ["https://www.instagram.com/reel/x/", "ERROR: [Instagram] x: Instagram sent an empty media response. Check if this post is accessible", "source_blocked", "Instagram blocked the server. Try again later or use another link."],
    [YT, "ERROR: [youtube] x: Private video. Sign in if you've been granted access", "source_private", null],
    [YT, "ERROR: [youtube] x: Video unavailable", "source_unavailable", null],
    [YT, "something odd at /tmp/reel-reader-123/input.webm", "processing_failed", null],
  ];
  for (const [url, raw, code, msg] of cases) {
    const e = toFriendlyError(new Error(raw), url, quiet);
    assert.equal(e.code, code, raw);
    if (msg) assert.equal(e.message, msg);
    assert.ok(e.message.length < 120, e.message);
    assert.ok(!/ERROR|WARNING|yt-dlp|github|cookies|\/tmp\//i.test(e.message), e.message);
  }
});

test("raw detail goes to the server log only", async () => {
  const logged = [];
  const raw = "ERROR: [youtube] x: Sign in to confirm you’re not a bot";
  await assert.rejects(
    runReelReader(YT, {
      log: { error: (m) => logged.push(m) },
      deps: {
        inspectVideo: async () => { throw new Error(raw); },
        downloadVideo: async () => ({}), ensureMp4: async () => "", analyzeVideoFile: async () => ({}), cleanupTemp: async () => {},
      },
    }),
    (e) => e.code === "source_blocked" && !e.message.includes("Sign in")
  );
  assert.ok(logged.some((m) => m.includes(raw)));
});
