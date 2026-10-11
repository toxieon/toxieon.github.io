"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { runReelReader } = require("./service.cjs");
const { HttpError } = require("./errors.cjs");

test("runReelReader calls downloader, analyzer and shapes response", async () => {
  const calls = [];
  const result = await runReelReader("https://www.youtube.com/watch?v=abc", {
    geminiApiKey: "x",
    deps: {
      inspectVideo: async () => { calls.push("inspect"); },
      downloadVideo: async () => {
        calls.push("download");
        return { tempDir: "/tmp/reel-reader-test", filePath: "/tmp/reel-reader-test/input.webm" };
      },
      ensureMp4: async (filePath) => {
        calls.push("transcode:" + filePath);
        return "/tmp/reel-reader-test/input.mp4";
      },
      analyzeVideoFile: async () => ({
        transcript: "hello world",
        caption: "cut onions",
        steps: ["open pan", "add onions"],
        recipe: { ingredients: [{ item: "onion", quantity: "1" }], method: ["slice", "cook"] }
      }),
      cleanupTemp: async (dir) => { calls.push("cleanup:" + dir); }
    }
  });

  assert.deepEqual(calls, ["inspect", "download", "transcode:/tmp/reel-reader-test/input.webm", "cleanup:/tmp/reel-reader-test"]);
  assert.equal(result.transcript, "hello world");
  assert.equal(result.caption, "cut onions");
  assert.deepEqual(result.steps, ["open pan", "add onions"]);
  assert.equal(result.recipe.ingredients[0].item, "onion");
  assert.match(result.prompt, /Speech transcript:/);
});

test("runReelReader maps unexpected errors to HttpError", async () => {
  await assert.rejects(
    runReelReader("https://www.instagram.com/reel/x", {
      geminiApiKey: "x",
      deps: {
        inspectVideo: async () => { throw new Error("yt-dlp failed"); },
        downloadVideo: async () => { throw new Error("unused"); },
        ensureMp4: async () => "unused",
        analyzeVideoFile: async () => ({}),
        cleanupTemp: async () => {}
      }
    }),
    (error) => error instanceof HttpError && error.code === "processing_failed"
  );
});
