"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { runReelReader, runReelReaderUpload } = require("./service.cjs");
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

test("runReelReaderUpload probes, transcodes, analyzes and cleans up", async () => {
  const calls = [];
  const result = await runReelReaderUpload({
    tempDir: "/tmp/reel-upload",
    filePath: "/tmp/reel-upload/clip.mov",
    mimeType: "video/quicktime",
    size: 1024
  }, {
    geminiApiKey: "x",
    deps: {
      probeUploadedVideo: async () => { calls.push("probe"); },
      ensureMp4: async (filePath) => {
        calls.push("transcode:" + filePath);
        return "/tmp/reel-upload/clip.mp4";
      },
      analyzeVideoFile: async (filePath) => {
        calls.push("analyze:" + filePath);
        return { transcript: "hi", caption: "text", steps: ["step"], recipe: null };
      },
      cleanupTemp: async (dir) => { calls.push("cleanup:" + dir); }
    }
  });

  assert.deepEqual(calls, [
    "probe",
    "transcode:/tmp/reel-upload/clip.mov",
    "analyze:/tmp/reel-upload/clip.mp4",
    "cleanup:/tmp/reel-upload"
  ]);
  assert.equal(result.transcript, "hi");
  assert.equal(result.recipe, null);
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
